"""The scheduler: replaces the package's two automations.

- every minute: slots starting now, overrides ending now;
- full realignment when HA starts, a schedule is activated or the weeks are saved;
- a manual change on a scheduled thermostat becomes a temporary override; a command the
  thermostat applies late (battery valve) does not;
- activation rules: their templates are tracked, and a change of their outcome activates a
  schedule (a schedule chosen by hand stays until then);
- scheduled thermostats: kept whatever the cards show, paused or forgotten on purpose; a repair
  proposes to forget one whose entity is gone (repairs.py), a renamed one is followed.

The integration calls services with its own contexts: state changes carrying one of them are
its own (not manual changes).
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, Context, Event, HomeAssistant, State, callback
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_change,
)
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util

from . import engine, model, repairs
from .storage import schema
from .history import TemperatureHistory
from .const import (
    DATA,
    ENTITIES,
    TICK,
    ACCESS_LEVELS,
    CONF_ACCESS_LEVEL,
    CONF_MANUAL_OVERRIDE_END,
    CONF_OFF_OVERRIDE_END,
    CONF_OVERRIDE_DURATION,
    CONF_USE_PRESETS,
    CONTROL_KEY,
    DEFAULT_ACCESS_LEVEL,
    DEFAULT_MANUAL_OVERRIDE_END,
    DEFAULT_OFF_OVERRIDE_END,
    DEFAULT_OVERRIDE_DURATION,
    DEFAULT_USE_PRESETS,
    DOMAIN,
    EVENT_SCHEDULE_ACTIVATED,
    MANUAL_OVERRIDE_ENDS,
    NEXT_CHANGE_KEY,
    OVERRIDE_DURATION_MAX,
    OVERRIDE_DURATION_MIN,
    OVERRIDE_DURATION_STEP,
    OVERRIDE_END_KEY,
    OVERRIDE_KEY,
    PLANNED_PRESET_KEY,
    THERMOSTAT_ENTITIES,
    schedule_unique_id,
    thermostat_unique_id,
)
from .store import ChauffageStore
from .storage.installation import Installation
from .app.learner import Learner
from .app.manual_changes import ManualChanges
from .app.overrides import OverrideService, ThermostatFailed, ThermostatPaused
from .app.rule_engine import RuleEngine
from .app.scheduler import Scheduler
from .app.thermostat_registry import ThermostatRegistry
from .domain.plan import Forced
from .thermostats.gateway import ThermostatGateway
from .thermostats.reader import ThermostatReader, reader_for

_LOGGER = logging.getLogger(__name__)


class StaleRevision(Exception):
    """Weeks or schedules saved from an outdated copy (edited elsewhere in the meantime)."""


def device_by_identifier(hass: HomeAssistant, entry: ConfigEntry, identifier: tuple[str, str]) -> dr.DeviceEntry | None:
    """One of the integration's devices, by its identifier."""
    registry = dr.async_get(hass)
    # From Home Assistant 2026.10, identifiers are only unique within a config entry: the
    # lookup by identifiers alone is deprecated (it stops working in 2027.8)
    if hasattr(registry, "async_get_device_by_identifier"):
        return registry.async_get_device_by_identifier(identifier, entry.entry_id)
    return registry.async_get_device(identifiers={identifier})


class ChauffageRuntime:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, store: ChauffageStore, data: dict[str, Any],
                 version: str) -> None:
        self.hass = hass
        self.entry = entry

        self.installation = Installation(store, data)
        self.version = version  # of the integration: a card older than it asks to reload the page
        self.pause = 0.3  # seconds between two thermostats (Zigbee network)
        self.gateway = ThermostatGateway(hass, self.installation, self.current, self._save)
        self.overrides = OverrideService(self)
        self.manual_changes = ManualChanges(self)
        self.scheduler = Scheduler(self)
        self.rules = RuleEngine(self)
        self.learner = Learner(self)
        self.registry = ThermostatRegistry(self)
        self._unsubs: list[Callable[[], None]] = []
        self._unsub_states: Callable[[], None] | None = None
        self._planned_presets: set[str] = set()  # the deprecated sensors, seen at the last check
        self.history = TemperatureHistory(hass)  # measured temperature, for the card
        # A thermostat renamed: the entry reloads to attach its entities to the new id, which
        # follow it meanwhile (their unique ids moved); nothing to add or remove until then
        self.reloading = False

    # ----- life cycle -----

    async def async_start(self) -> None:
        self.scheduler.start()
        self._unsubs.append(async_track_time_change(self.hass, self._tick, second=0))
        self._unsubs.append(self.hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, self.registry.registry_updated))
        for reloaded in ("automation_reloaded", "script_reloaded"):
            self._unsubs.append(self.hass.bus.async_listen(reloaded, self._check_planned_preset))
        self._track_thermostats()
        for entity_id in self.active:
            self.learner.learn(self.hass.states.get(entity_id))
        if self.hass.state is CoreState.running:
            self.entry.async_create_task(self.hass, self._started(), "chauffage realign")
        else:
            @callback
            def started(_event: Event) -> None:
                self._unsubs.remove(unsub)  # a one-time listener is gone once called
                self.entry.async_create_task(self.hass, self._started(), "chauffage realign")

            unsub = self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started)
            self._unsubs.append(unsub)

    async def _started(self) -> None:
        # Thermostats whose entity is gone; the rules: their entities are not all there before
        for entity_id in self.scheduled:
            if self.hass.states.get(entity_id) is None and er.async_get(self.hass).async_get(entity_id) is None:
                repairs.raise_missing(self.hass, entity_id)
        self._check_planned_preset()  # once the automations and scripts are loaded
        self.rules.track()
        await self.follow_rules()
        await self.scheduler.apply(Forced("Home Assistant started"))

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        self.rules.stop()

    # ----- listeners (entities, websocket) -----

    @callback
    def async_add_listener(self, listener: Callable[[str], None]) -> Callable[[], None]:
        return self.installation.add_listener(listener)

    @callback
    def _notify(self, reason: str = DATA) -> None:
        self.installation.notify(reason)

    @callback
    def _changed(self) -> None:
        self.installation.changed()

    @callback
    def _save(self) -> None:
        self.installation.save()

    # ----- reading -----

    @property
    def override_duration(self) -> int:
        return int(self.entry.options.get(CONF_OVERRIDE_DURATION, DEFAULT_OVERRIDE_DURATION))

    @property
    def manual_override_end(self) -> str:
        """The setting *End of a change by hand*, for every thermostat: DURATION (the default),
        NEXT_SLOT_WITHIN_DURATION or NEXT_SLOT (an unknown value: the default)."""
        end = self.entry.options.get(CONF_MANUAL_OVERRIDE_END)
        return end if end in MANUAL_OVERRIDE_ENDS else DEFAULT_MANUAL_OVERRIDE_END

    @property
    def off_override_end(self) -> str:
        """The setting *Turned off* (#91), for a thermostat turned off by hand: the
        same choices, NEXT_SLOT by default (an unknown value: the default)."""
        end = self.entry.options.get(CONF_OFF_OVERRIDE_END)
        return end if end in MANUAL_OVERRIDE_ENDS else DEFAULT_OFF_OVERRIDE_END

    @callback
    def set_override_settings(self, manual_override_end: str | None = None,
                              override_duration: int | None = None, off_override_end: str | None = None) -> None:
        """Changes the settings of overrides in the integration's options, as the options flow
        does: from the configuration entities and the panel. InvalidData for an unknown end or
        a duration out of range or not in whole minutes."""
        options: dict[str, Any] = {}
        for key, end in ((CONF_MANUAL_OVERRIDE_END, manual_override_end), (CONF_OFF_OVERRIDE_END, off_override_end)):
            if end is None:
                continue
            if end not in MANUAL_OVERRIDE_ENDS:
                raise model.InvalidData(f"unknown end of an override: {end}")
            options[key] = end
        if override_duration is not None:
            if (not OVERRIDE_DURATION_MIN <= override_duration <= OVERRIDE_DURATION_MAX
                    or override_duration % OVERRIDE_DURATION_STEP):
                raise model.InvalidData(f"override duration out of range or not in whole minutes: {override_duration}")
            options[CONF_OVERRIDE_DURATION] = int(override_duration)
        if options:
            self.hass.config_entries.async_update_entry(self.entry, options={**self.entry.options, **options})

    @property
    def access_level(self) -> str:
        """What users who are not admins may change (#99): USE (the default), PLAN or SET_UP (an
        unknown value: the default)."""
        level = self.entry.options.get(CONF_ACCESS_LEVEL)
        return level if level in ACCESS_LEVELS else DEFAULT_ACCESS_LEVEL

    @callback
    def set_access_level(self, access_level: str) -> None:
        """From the panel, as the options flow does. InvalidData for an unknown access level."""
        if access_level not in ACCESS_LEVELS:
            raise model.InvalidData(f"unknown access level: {access_level}")
        self.hass.config_entries.async_update_entry(self.entry, options={**self.entry.options, CONF_ACCESS_LEVEL: access_level})

    @callback
    def options_changed(self) -> None:
        """The options changed: the entities and the cards show them again."""
        self._notify(DATA)

    @property
    def retrying(self) -> set[str]:
        """The thermostats whose last command failed, sent again at the next minutes."""
        return set(self.scheduler.retry)

    @property
    def schedule_ids(self) -> set[str]:
        return {m["id"] for m in self.installation.schedules}

    def schedule_name(self, schedule_id: str) -> str | None:
        return next((m["name"] for m in self.installation.schedules if m["id"] == schedule_id), None)

    @property
    def preset_ids(self) -> set[str]:
        return {preset["id"] for preset in self.installation.presets}

    @property
    def presets_by_id(self) -> dict[str, dict[str, Any]]:
        """The presets by id, in their order."""
        return {preset["id"]: preset for preset in self.installation.presets}

    @property
    def thermostats(self) -> dict[str, dict[str, Any]]:
        """The thermostats Chauffage knows (model.py): the scheduled ones, and those with only
        values of the presets, set before their weeks."""
        return self.installation.thermostats

    @property
    def scheduled(self) -> dict[str, dict[str, Any]]:
        """The scheduled thermostats, those with weeks, paused ones included."""
        return {entity_id: t for entity_id, t in self.thermostats.items() if t["weeks"]}

    @property
    def active(self) -> list[str]:
        """The scheduled thermostats Chauffage controls (not paused)."""
        return [entity_id for entity_id, t in self.scheduled.items() if not t["paused"]]

    def is_paused(self, entity_id: str) -> bool:
        return self.thermostats.get(entity_id, {}).get("paused", False)

    @property
    def weeks(self) -> dict[str, dict[str, Any]]:
        """{thermostat: {schedule id: week}}, the thermostats' own dictionaries."""
        return {entity_id: t["weeks"] for entity_id, t in self.scheduled.items()}

    @property
    def mappings(self) -> dict[str, dict[str, Any]]:
        return {entity_id: t["mapping"] for entity_id, t in self.thermostats.items() if t["mapping"]}

    @property
    def learned_temperatures(self) -> dict[str, dict[str, float]]:
        return {entity_id: t["preset_temperatures"] for entity_id, t in self.thermostats.items() if t["preset_temperatures"]}

    def reader(self, entity_id: str) -> ThermostatReader:
        """How to read a thermostat, from the integration that provides it (thermostats/)."""
        entry = er.async_get(self.hass).async_get(entity_id)
        return reader_for(entry.platform if entry is not None else None)

    def current(self, state: State | None) -> engine.Thermostat | None:
        """What the scheduler needs to know about a thermostat."""
        return self.reader(state.entity_id).read(state) if state is not None else None

    def _cause_of(self, state: State | None) -> str | None:
        """Why a thermostat protects itself: "window", "auto_start_stop", or None."""
        return self.reader(state.entity_id).cause(state) if state is not None else None

    def preset_temperature(self, state: State, preset: str, cool: bool = False) -> float | None:
        return self.learner.preset_temperature(state, preset, cool)

    def temperatures_of(self, state: State | None, cool: bool = False) -> dict[str, float]:
        return self.learner.temperatures_of(state, cool)

    def plan(self) -> engine.Plan:
        """What the active thermostats follow: paused ones are left out."""
        return engine.Plan(
            {entity_id: self.thermostats[entity_id]["weeks"] for entity_id in self.active},
            self.installation.active_schedule,
            self.presets_by_id,
            self.mappings,
            self.installation.overrides,
            self.use_presets,
            {entity_id: own for entity_id in self.active if (own := self.own_settings(entity_id))},
        )

    def own_settings(self, entity_id: str) -> dict[str, str]:
        return self.gateway.own_settings(entity_id)

    def _to_send(self, entity_id: str, target: engine.Target, current: engine.Thermostat, by_user: bool = False) -> engine.Target:
        """An override's target as it is sent (engine.complete). Without an HVAC mode, a thermostat
        that is off is turned on in the HVAC mode of the slot planned now, as the card does."""
        plan = self.plan()
        slot, _ = plan.slot_at(entity_id, dt_util.now())
        planned = plan.target_of(entity_id, slot, current) or {}
        return engine.complete(target, current, by_user, planned.get("hvac_mode"))

    @property
    def use_presets(self) -> bool:
        return bool(self.entry.options.get(CONF_USE_PRESETS, DEFAULT_USE_PRESETS))

    def targets_of(self, entity_id: str) -> dict[str, dict[str, Any]]:
        """What each preset means for a thermostat, in each HVAC mode (engine.value_on: the
        mapping set by hand, else the default). Without an HVAC mode: an override set to a
        preset keeps the thermostat's own."""
        presets = self.presets_by_id
        mapping = self.thermostats.get(entity_id, {}).get("mapping") or None
        current = self.current(self.hass.states.get(entity_id))
        out = {}
        for preset_id in presets:
            target = engine.resolve(preset_id, presets, mapping, current, self.use_presets)
            if target:
                out[preset_id] = target
        return out

    def preview_preset(self, entity_id: str, preset: Any, value: Any = None) -> dict[str, Any]:
        """What a preset is worth on a thermostat, for each HVAC mode, and the HVAC modes it can
        be used in: a preset and a value set by hand that the card holds, saved or not
        (chauffage/preset/preview). The card asks rather than computing it (#132)."""
        worth = schema.preset(preset, set()).value_on(
            None if value is None else schema.value(value), self.current(self.hass.states.get(entity_id)),
            self.use_presets)
        return {"value": worth.attributes(), "modes": worth.offered_modes()}

    def preset_temperatures_of(self, entity_id: str, cool: bool = False) -> dict[str, float]:
        """{preset id: temperature} on a thermostat: its own for a temperature, the one its own
        preset gives (published, else learned) for a climate preset; unknown ones left out.
        `cool`: what each preset gives when the thermostat cools: its cooling temperature, else
        what its own preset gives when cooling. A heating temperature is not one."""
        own = self.temperatures_of(self.hass.states.get(entity_id), cool)
        key, own_key = ("cool_temperature", "cool_preset_mode") if cool else ("temperature", "preset_mode")
        temperatures = {p: t.get(key, own.get(t.get(own_key))) for p, t in self.targets_of(entity_id).items()}
        return {p: t for p, t in temperatures.items() if t is not None}

    def snapshot(self) -> dict[str, Any]:
        """Everything the card needs."""
        return {
            "schedules": self.installation.schedules,
            "active_schedule": self.installation.active_schedule,
            "presets": self.installation.presets,
            # cause: why a VTherm protects itself ("window", "auto_start_stop"), None otherwise
            # own_settings: the fan and the vanes it gets back from a slot that sets none
            "thermostats": {e: {"paused": t["paused"], "revision": t["revision"], "cause": self.cause(e),
                                "own_settings": self.own_settings(e)}
                            for e, t in self.scheduled.items()},
            "mappings": self.mappings,
            "targets": {e: self.targets_of(e) for e in self.scheduled},
            "weeks": self.weeks,
            "overrides": self.installation.overrides,
            # Every thermostat, those the card shows before they are scheduled too
            "preset_temperatures": {
                state.entity_id: temperatures for state in self.hass.states.async_all("climate")
                if (temperatures := self.temperatures_of(state))
            },
            # What its own presets give when it cools (an air conditioner)
            "cool_preset_temperatures": {
                state.entity_id: temperatures for state in self.hass.states.async_all("climate")
                if (temperatures := self.temperatures_of(state, cool=True))
            },
            "use_presets": self.use_presets,
            "revision": self.installation.revision,
            "override_duration": self.override_duration,
            "manual_override_end": self.manual_override_end,
            "off_override_end": self.off_override_end,
            "access_level": self.access_level,
            "rules": self.installation.rules,
            "default_schedule": self.installation.default_schedule,
            "rule_results": self.rule_results,
            "renamed": self.installation.renamed,
            "planned": self.planned_presets(),
            "version": self.version,
            "schedule_entities": self.schedule_entities(),
            # The cards open the entities and the device they mention (#39)
            "thermostat_entities": self.thermostat_entities(),
            "schedule_select": self.schedule_select(),
            "device_id": self.device_id(),
        }

    def schedule_entities(self) -> dict[str, str]:
        """{schedule id: entity id of its switch}: the card shows the icon chosen for it in HA."""
        registry = er.async_get(self.hass)
        entities = {s: registry.async_get_entity_id("switch", DOMAIN, schedule_unique_id(self.entry.entry_id, s))
                    for s in self.schedule_ids}
        return {s: entity_id for s, entity_id in entities.items() if entity_id}

    def thermostat_entities(self) -> dict[str, dict[str, str]]:
        """{thermostat: {control, override, planned_preset, override_end, next_change: entity id}}: a thermostat
        without a device has no other way to find its entities (named after it, not attached)."""
        registry = er.async_get(self.hass)
        names = {CONTROL_KEY: "control", OVERRIDE_KEY: "override", PLANNED_PRESET_KEY: "planned_preset",
                 OVERRIDE_END_KEY: "override_end", NEXT_CHANGE_KEY: "next_change"}
        out = {}
        for climate in self.scheduled:
            ids = {names[key]: registry.async_get_entity_id(platform, DOMAIN, thermostat_unique_id(
                self.entry.entry_id, climate, key)) for key, platform in THERMOSTAT_ENTITIES.items()}
            out[climate] = {name: entity_id for name, entity_id in ids.items() if entity_id}
        return out

    def device_id(self) -> str | None:
        """The "Chauffage" device holding the global entities."""
        device = device_by_identifier(self.hass, self.entry, (DOMAIN, self.entry.entry_id))
        return device.id if device else None

    def schedule_select(self) -> str | None:
        """The active-schedule select's entity id."""
        return er.async_get(self.hass).async_get_entity_id("select", DOMAIN, f"{self.entry.entry_id}_schedule")

    def _card_entities(self) -> set[str]:
        ids = {*self.schedule_entities().values(), self.schedule_select()}
        for entities in self.thermostat_entities().values():
            ids.update(entities.values())
        return ids

    def cause(self, entity_id: str) -> str | None:
        """Why a thermostat protects itself, when it says it (a VTherm's window, open while it is
        off or heats at the frost setpoint, or its auto start/stop): for the card, which then
        does not read VTherm's attributes."""
        return self._cause_of(self.hass.states.get(entity_id))

    def planned(self, entity_id: str, now: datetime | None = None, thermostat: engine.Thermostat | None = None
                ) -> tuple[engine.Slot | None, engine.Slot | None, datetime | None]:
        """(slot now, next different slot, its start) for a thermostat in the active schedule.
        The slots as they run on it: on an air conditioner, a slot that says heat does not
        differ from one that says nothing. `thermostat`: the thermostat as read by the caller,
        else read here."""
        week = self.thermostats.get(entity_id, {}).get("weeks", {}).get(self.installation.active_schedule)
        if not week:
            return None, None, None
        thermostat = thermostat or self.current(self.hass.states.get(entity_id))
        return engine.current_and_next(engine.week_on(week, thermostat), now or dt_util.now())

    def planned_targets(self, entity_id: str, plan: engine.Plan | None = None, now: datetime | None = None,
                        thermostat: engine.Thermostat | None = None) -> dict[str, Any]:
        """What a scheduled thermostat follows now (its preset, its HVAC mode, its target on this
        thermostat), and the next different slot (its preset, its HVAC mode, its start): the
        planned-preset sensor's attributes. The HVAC mode is the slot's: off, fan_only, or heat
        or cool when the thermostat lists it, else None. An off slot and a fan-only slot have no
        preset. `plan`: the one built for a snapshot, else built here. `thermostat`: the thermostat
        as read by the caller, else read here."""
        plan = plan or self.plan()
        thermostat = thermostat or self.current(self.hass.states.get(entity_id))
        current, following, next_start = self.planned(entity_id, now, thermostat)
        target = plan.target_of(entity_id, current, thermostat)
        next_target = plan.target_of(entity_id, following, thermostat)
        return {
            "preset": current.preset if current else None,
            "hvac_mode": target.get("hvac_mode") if target else None,
            "target": dict(target) if target is not None else None,
            "next_preset": following.preset if following else None,
            "next_hvac_mode": next_target.get("hvac_mode") if next_target else None,
            "next_start": next_start.isoformat() if next_start else None,
        }

    def planned_info(self, entity_id: str, plan: engine.Plan | None = None, now: datetime | None = None) -> dict[str, Any]:
        """planned_targets, and the ends the card's buttons offer (#83, D2): the next slot a
        change made now would end at (*Until the next slot*) and the next morning (*Until
        tomorrow*), computed here, in Home Assistant's time zone, not in the browser's."""
        plan, now = plan or self.plan(), now or dt_util.now()
        thermostat = self.current(self.hass.states.get(entity_id))
        slot = self.next_slot_end(entity_id, thermostat, plan, now)
        tomorrow = self.next_day_slot_end(entity_id, thermostat, plan, now)
        return {
            **self.planned_targets(entity_id, plan, now, thermostat),
            "next_slot_end": slot.isoformat() if slot else None,
            "next_day_slot_end": tomorrow.isoformat() if tomorrow else None,
        }

    def next_change_info(self, entity_id: str, now: datetime | None = None) -> dict[str, Any]:
        """When Chauffage next changes a thermostat, and to what (#82): the end of its override,
        else the next slot that sends something different, within a week. Its Chauffage preset,
        then what the thermostat will have, named like a climate's attributes: its HVAC mode, its
        own preset, its temperature (None when unknown), its range in heat/cool. `start` is None
        when no slot ever changes the thermostat."""
        plan, now = self.plan(), now or dt_util.now()
        thermostat = self.current(self.hass.states.get(entity_id))
        override = self.installation.overrides.get(entity_id)
        if override:
            start = engine.parse_datetime(override.get("end"))
            start = dt_util.as_local(start) if start else None
        else:
            start = plan.next_change(entity_id, now, thermostat, not_before=now, until=now + timedelta(days=8))
        slot = plan.slot_at(entity_id, start)[0] if start else None
        target = plan.target_of(entity_id, slot, thermostat) or {}
        # What it sends, in the slot's HVAC mode: a preset's cooling value in cool, not its heating one
        sent = engine.complete(target, thermostat, planned=target.get("hvac_mode")) if target else {}
        # The HVAC mode sent, or the one the thermostat keeps
        hvac_mode = sent.get("hvac_mode") or (thermostat.state if thermostat is not None and target else None)
        info = {"start": start, "preset": slot.preset if slot else None, "hvac_mode": hvac_mode,
                "preset_mode": sent.get("preset_mode"), "temperature": sent.get("temperature")}
        if all(key in sent for key in engine.RANGE_KEYS):
            info.update({key: sent[key] for key in engine.RANGE_KEYS})
        elif info["temperature"] is None and slot is not None and slot.preset and hvac_mode != "off":
            info["temperature"] = self.preset_temperatures_of(entity_id, hvac_mode == "cool").get(slot.preset)
        return info

    def next_day_slot_end(self, entity_id: str, current: engine.Thermostat | None, plan: engine.Plan | None = None,
                          now: datetime | None = None) -> datetime | None:
        """The next morning, for the end "until tomorrow" of an off override (C4, D2): the first
        slot of today that changes the thermostat's state, if it is still to come, else the first
        one of tomorrow, or of the next day that has one, within a week. A 00:00 slot that
        repeats the evening's does not count. None without one."""
        now, plan = now or dt_util.now(), plan or self.plan()
        for days in range(7):
            start = (now + timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
            start = dt_util.as_local(dt_util.as_utc(start))
            when = plan.next_change(entity_id, start - timedelta(minutes=1), current,
                                    not_before=start, until=start + timedelta(days=1))
            if when is not None and dt_util.as_utc(when) > dt_util.as_utc(now):
                return when
        return None

    def planned_presets(self) -> dict[str, dict[str, Any]]:
        """planned_info of every scheduled thermostat, from one plan."""
        plan, now = self.plan(), dt_util.now()
        return {entity_id: self.planned_info(entity_id, plan, now) for entity_id in self.scheduled}

    # ----- writing -----

    def _weeks_changed(self, entity_ids: Any) -> None:
        """New revisions for these thermostats: a copy of their weeks made before is outdated."""
        for entity_id in entity_ids:
            self.thermostats[entity_id]["revision"] += 1

    def _thermostat(self, entity_id: str) -> dict[str, Any]:
        """The thermostat's data, made for a thermostat the card brings: scheduled, active, once
        it has weeks."""
        return self.thermostats.setdefault(entity_id, model.new_thermostat())

    async def save_weeks(self, weeks: Any, revisions: dict[str, int | None] | None = None) -> None:
        """The weeks of the thermostats sent; the others keep theirs: a thermostat a card does
        not show stays scheduled (#27), only forget() drops it. A thermostat keeps its weeks in
        the schedules not sent, and gets the week of a new schedule in those it had none in: a
        scheduled thermostat has a week in every schedule. Saved against the revision of each
        thermostat sent (`revisions`; None: not scheduled when the copy was made). StaleRevision
        if one of them changed."""
        normalized = model.normalize_weeks(weeks, self.schedule_ids, self.preset_ids)
        if any(self.registry.renamed_to(entity_id) for entity_id in normalized):
            raise StaleRevision  # a copy holding a former id: reloaded, the card sets it aside
        # A card may list a climate removed from Home Assistant: never schedule a ghost
        registry = er.async_get(self.hass)
        for entity_id in normalized:
            if (entity_id not in self.scheduled and self.hass.states.get(entity_id) is None
                    and registry.async_get(entity_id) is None):
                raise model.InvalidData(f"{entity_id} does not exist")
        if revisions is not None:
            scheduled = self.scheduled
            for entity_id in normalized:
                current = scheduled.get(entity_id, {}).get("revision")
                if revisions.get(entity_id) != current:
                    raise StaleRevision
        schedule_ids = [schedule["id"] for schedule in self.installation.schedules]
        preset_ids = list(self.presets_by_id)
        for entity_id, by_schedule in normalized.items():
            t = self._thermostat(entity_id)
            t["weeks"] = model.complete_weeks({**t["weeks"], **by_schedule}, schedule_ids, preset_ids)
        self._weeks_changed(normalized)
        self.installation.revision += 1
        self._track_thermostats()
        for entity_id in self.active:
            self.learner.learn(self.hass.states.get(entity_id))
        self._changed()
        await self.scheduler.apply(Forced("weeks saved"))

    # ----- scheduled thermostats (app/thermostat_registry.py) -----

    async def set_paused(self, entity_id: str, paused: bool) -> None:
        await self.registry.set_paused(entity_id, paused)

    async def forget(self, entity_id: str) -> None:
        await self.registry.forget(entity_id)

    @callback
    def _check_planned_preset(self, _event: Event | None = None) -> None:
        """The deprecated *Planned preset* sensors enabled: a repair warns about them. Also when
        the automations or the scripts are reloaded: the repair lists those that use them."""
        registry = er.async_get(self.hass)
        self._planned_presets = {entity_id for entities in self.thermostat_entities().values()
                                 if (entity_id := entities.get("planned_preset"))}
        sensors = [entity_id for entity_id in self._planned_presets
                   if (entry := registry.async_get(entity_id)) is not None and entry.disabled_by is None]
        repairs.check_planned_preset(self.hass, sensors)

    async def set_presets(self, presets: list[Any], replacements: dict[str, str] | None = None) -> None:
        """New list of presets; a removed preset is replaced in the weeks by the preset given
        in `replacements` (it must exist), and its mappings are dropped."""
        taken: set[str] = set()
        new_presets = []
        for preset in presets:
            normalized = model.normalize_preset(preset, taken | self.preset_ids)
            if normalized["id"] in taken:
                raise model.InvalidData(f"duplicate preset: {normalized['id']}")
            taken.add(normalized["id"])
            new_presets.append(normalized)
        if not new_presets:
            raise model.InvalidData("at least one preset is needed")
        for preset in new_presets:
            self._refuse_lost_temperature(preset)
        removed = self.preset_ids - taken
        replacements = replacements or {}
        used = set(model.used_presets(self.weeks))
        for preset_id in removed & used:
            if replacements.get(preset_id) not in taken:
                raise model.InvalidData(f"{preset_id} is used in the weeks: choose a replacement")
        if removed & used:
            # Only the thermostats that used a removed preset: the others' weeks do not change
            affected = {e: w for e, w in self.weeks.items() if removed & set(model.used_presets({e: w}))}
            for by_schedule in affected.values():
                for schedule_id, week in by_schedule.items():
                    by_schedule[schedule_id] = model.normalize_week(
                        [[[slot[0], replacements.get(slot[1], slot[1]), *slot[2:]] for slot in day] for day in week]
                    )
            self._weeks_changed(affected)
            self.installation.revision += 1
        for t in self.thermostats.values():
            for preset_id in removed:
                t["mapping"].pop(preset_id, None)
        self.installation.presets = new_presets
        self._changed()
        await self.scheduler.apply(Forced("presets changed"))

    def _refuse_lost_temperature(self, preset: dict[str, Any]) -> None:
        """Refuses a preset that loses its temperature when heating or when cooling while a
        week uses the preset in that HVAC mode: the slot would have nothing to send. As for a
        preset removed while the weeks use it. A thermostat with a value of its own for the
        preset, in that HVAC mode, does not need the preset's temperature. A heat/cool slot
        uses both temperatures: there, only a temperature of its own replaces the preset's."""
        old = self.presets_by_id.get(preset["id"])
        if old is None:
            return
        own = {"heat": engine.SETPOINT_KEYS, "cool": ("preset_mode", "cool_temperature")}
        for mode, key in (("heat", "temperature"), ("cool", "cool_temperature")):
            if old.get(key) is None or preset.get(key) is not None:
                continue
            for entity_id, by_schedule in self.weeks.items():
                cell = self.mappings.get(entity_id, {}).get(preset["id"]) or {}
                current = self.current(self.hass.states.get(entity_id))
                modes = {engine.slot_hvac_mode(engine.slot_of(slot).settings, current) or "heat"
                         for week in by_schedule.values() for day in week for slot in day if slot[1] == preset["id"]}
                # A heat/cool slot sends two numbers: a device preset set by hand gives none
                if (mode in modes and not any(k in cell for k in own[mode])) or (engine.HEAT_COOL in modes and key not in cell):
                    raise model.InvalidData(
                        f"{preset['id']} is used in the weeks when {'heating' if mode == 'heat' else 'cooling'}: "
                        "it needs a temperature there")

    async def set_mapping(self, entity_id: str, mapping: Any) -> None:
        """Mapping set by hand for one thermostat ({} = defaults only)."""
        normalized = model.normalize_mapping(mapping, self.preset_ids)
        if normalized or entity_id in self.scheduled:
            self._thermostat(entity_id)["mapping"] = normalized
        else:
            self.thermostats.pop(entity_id, None)  # not scheduled: nothing left to keep
        self._changed()
        await self.scheduler.apply(Forced(f"mapping of {entity_id} changed"))

    async def set_schedules(self, items: Any, revision: int | None = None) -> list[dict[str, str]]:
        """Create (empty or a copy), rename, move and delete schedules (see model.plan_schedules).
        An empty schedule puts every scheduled thermostat in eco (or the first preset) all week:
        each keeps a week in every schedule. The active schedule and its weeks do not change: the
        thermostats are not touched."""
        if revision is not None and revision != self.installation.revision:
            raise StaleRevision
        schedules, created = model.plan_schedules(items, self.installation.schedules, self.installation.active_schedule)
        kept = {s["id"] for s in schedules}
        in_rules = ({rule["schedule"] for rule in self.installation.rules} | {self.installation.default_schedule}) - {None}
        if in_rules - kept:
            raise model.InvalidData(f"used by the activation rules: {sorted(in_rules - kept)}")
        preset_ids = list(self.presets_by_id)
        for weeks in self.weeks.values():
            for schedule_id in set(weeks) - kept:
                del weeks[schedule_id]
            for schedule_id, source in created.items():
                weeks[schedule_id] = copy.deepcopy(weeks[source]) if source in weeks else model.empty_week(preset_ids)
        # Renamed or moved: no week changes. Created or deleted: every thermostat's weeks do (a
        # schedule deleted then created again may take the same id)
        if created or self.schedule_ids - kept:
            self._weeks_changed(self.scheduled)
        self.installation.schedules = schedules
        self.installation.revision += 1
        self._changed()
        return copy.deepcopy(schedules)

    async def activate_schedule(self, schedule_id: str, *, source: str, context: Context | None = None) -> None:
        """`source` (card, entity, service, rules) is told in the chauffage_schedule_activated event,
        fired on the select with the `context` of what activated it (the logbook says who)."""
        if schedule_id not in self.schedule_ids:
            raise model.InvalidData(f"unknown schedule: {schedule_id}")
        if schedule_id == self.installation.active_schedule:
            return
        previous, self.installation.active_schedule = self.installation.active_schedule, schedule_id
        self._changed()
        self.hass.bus.async_fire(EVENT_SCHEDULE_ACTIVATED, {
            "schedule": schedule_id, "schedule_name": self.schedule_name(schedule_id),
            "previous_schedule": previous, "source": source, "entity_id": self.schedule_select(),
        }, context=context)
        _LOGGER.info("Schedule %s activated (%s), was %s", schedule_id, source, previous)
        await self.scheduler.apply(Forced(f"schedule {schedule_id} activated ({source})"))

    # ----- activation rules (app/rule_engine.py) -----

    @property
    def rule_results(self) -> list[Any]:
        return self.rules.results

    async def set_rules(self, rules: Any, default_schedule: Any) -> None:
        await self.rules.set(rules, default_schedule)

    def track_templates(self, templates: list[str], action: Callable[[], None]) -> Callable[[], None] | None:
        return self.rules.track_templates(templates, action)

    def render_rule(self, rule: dict[str, Any]) -> tuple[Any, str | None, str | None]:
        return self.rules.render(rule)

    async def follow_rules(self, force: bool = False) -> None:
        await self.rules.follow(force)

    # ----- overrides (app/overrides.py) -----

    async def set_override(self, entity_id: str, override: dict[str, Any] | None, *, source: str,
                           resend: bool = False, context: Context | None = None) -> None:
        await self.overrides.set(entity_id, override, source=source, resend=resend, context=context)

    def refuse_lone_temperature(self, entity_id: str, override: Any) -> None:
        self.overrides.refuse_lone_temperature(entity_id, override)

    def next_slot_end(self, entity_id: str, current: engine.Thermostat | None, plan: engine.Plan | None = None,
                      now: datetime | None = None) -> datetime | None:
        return self.overrides.next_slot_end(entity_id, current, plan, now)

    def record_override(self, entity_id: str, override: dict[str, Any], context: Context | None = None) -> None:
        self.overrides.record(entity_id, override, context)

    def override_info(self, entity_id: str) -> dict[str, Any]:
        return self.overrides.info(entity_id)

    def new_override(self, target: engine.Target, minutes: int | None = None, end: datetime | None = None) -> dict[str, Any]:
        return self.overrides.new(target, minutes, end)

    def manual_override(self, entity_id: str, target: engine.Target, current: engine.Thermostat | None) -> dict[str, Any]:
        return self.overrides.manual(entity_id, target, current)

    # ----- commands (thermostats/gateway.py) -----

    async def send(self, entity_id: str, target: engine.Target, why: str) -> bool:
        return await self.gateway.send(entity_id, target, why)

    async def reproduce(self, entity_id: str, hvac_mode: str | None, attributes: dict[str, Any]) -> bool:
        return await self.gateway.reproduce(entity_id, hvac_mode, attributes)

    def pending(self, entity_id: str) -> list[engine.Target]:
        return self.gateway.pending(entity_id)

    def needs(self, entity_id: str, target: engine.Target, current: engine.Thermostat | None,
              by_user: bool = False) -> engine.Target | None:
        """The target to send (_to_send) when the thermostat needs it (ThermostatGateway.needs).
        `by_user`: an override without a Chauffage preset (in cool, a temperature the user typed
        is sent, a preset's heating temperature is not)."""
        return self.gateway.needs(entity_id, self._to_send(entity_id, target, current, by_user), current)

    # ----- scheduling (app/scheduler.py) -----

    async def _tick(self, now: datetime) -> None:
        await self.scheduler.tick(now)
        self._notify(TICK)

    # ----- manual changes -----

    @callback
    def _track_thermostats(self) -> None:
        if self._unsub_states:
            self._unsub_states()
        entities = list(self.scheduled)
        self._unsub_states = (
            async_track_state_change_event(self.hass, entities, self.manual_changes.state_changed) if entities else None
        )


