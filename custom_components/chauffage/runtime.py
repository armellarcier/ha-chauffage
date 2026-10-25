"""The scheduler: replaces the package's two automations.

- every minute: slots starting now, overrides ending now;
- full realignment when HA starts, a schedule is activated or the weeks are saved;
- a manual change on a scheduled thermostat becomes a temporary override;
- activation rules: their templates are tracked, and a change of their outcome activates a
  schedule (a schedule chosen by hand stays until then);
- scheduled thermostats: kept whatever the cards show, paused or forgotten on purpose; a repair
  proposes to forget one whose entity is gone (repairs.py), a renamed one is followed.

The integration calls services with its own contexts: state changes carrying one of them are
its own (not manual changes).
"""

from __future__ import annotations

import asyncio
import copy
from collections import deque
from collections.abc import Callable
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, Context, Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.exceptions import TemplateError
from homeassistant.helpers.event import (
    TrackTemplate,
    async_track_state_change_event,
    async_track_template_result,
    async_track_time_change,
)
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.template import Template, result_as_boolean
from homeassistant.util import dt as dt_util

from . import engine, model, repairs
from .history import TemperatureHistory
from .const import (
    CONF_OVERRIDE_DURATION,
    CONF_USE_PRESETS,
    CONTROL_KEY,
    DEFAULT_OVERRIDE_DURATION,
    DEFAULT_USE_PRESETS,
    DOMAIN,
    EVENT_OVERRIDE_ENDED,
    EVENT_OVERRIDE_STARTED,
    EVENT_SCHEDULE_ACTIVATED,
    OVERRIDE_END_KEY,
    OVERRIDE_KEY,
    PLANNED_PRESET_KEY,
    THERMOSTAT_ENTITIES,
    schedule_unique_id,
    thermostat_unique_id,
)
from .store import SAVE_DELAY, ChauffageStore

_LOGGER = logging.getLogger(__name__)

# Listener reasons: "data" (schedules, weeks, presets, overrides changed) or "tick" (every minute)
DATA, TICK = "data", "tick"
# The ids of the entities the cards open changed: the cards are told, nothing else is redone (the
# entities must not be added or removed during a thermostat's rename, which moves them)
ENTITIES = "entities"


class StaleRevision(Exception):
    """Weeks or schedules saved from an outdated copy (edited elsewhere in the meantime)."""


class ThermostatFailed(Exception):
    """The thermostat could not be set to an override's value."""


class ThermostatPaused(model.InvalidData):
    """An override asked for a paused thermostat."""


def thermostat(state: State | None) -> engine.Thermostat | None:
    if state is None:
        return None
    attributes = state.attributes
    presets = attributes.get("preset_modes") or ()
    return engine.Thermostat(
        state.state,
        engine.preset_value(attributes.get("preset_mode")),
        engine.temperature_value(attributes.get("temperature")),
        tuple(p for p in (engine.preset_value(p) for p in presets) if p),
        engine.temperature_value(attributes.get("min_temp")),
        engine.temperature_value(attributes.get("max_temp")),
        engine.temperature_value(attributes.get("target_temp_step")),
    )


class ChauffageRuntime:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, store: ChauffageStore, data: dict[str, Any],
                 version: str) -> None:
        self.hass = hass
        self.entry = entry
        self.store = store
        self.data = data
        self.version = version  # of the integration: a card older than it asks to reload the page
        self.pause = 0.3  # seconds between two thermostats (Zigbee network)
        self._own_contexts: deque[str] = deque(maxlen=500)
        self._lock = asyncio.Lock()
        self._listeners: set[Callable[[str], None]] = set()
        self._unsubs: list[Callable[[], None]] = []
        self._unsub_states: Callable[[], None] | None = None
        self._last_tick: datetime | None = None
        self._retry: set[str] = set()  # thermostats whose last command failed
        self.history = TemperatureHistory(hass)  # measured temperature, for the card
        self._unsub_rules: Callable[[], None] | None = None
        self.rule_results: list[Any] = []  # each rule now (see render_rule)
        # A thermostat renamed: the entry reloads to attach its entities to the new id, which
        # follow it meanwhile (their unique ids moved); nothing to add or remove until then
        self.reloading = False

    # ----- life cycle -----

    async def async_start(self) -> None:
        self._last_tick = dt_util.now()  # the realignment below covers the time before
        self._unsubs.append(async_track_time_change(self.hass, self._tick, second=0))
        self._unsubs.append(self.hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, self._registry_updated))
        self._track_thermostats()
        for entity_id in self.active:
            self._learn(self.hass.states.get(entity_id))
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
        self._track_rules()
        await self.follow_rules()
        await self.apply(force=True)

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        if self._unsub_rules:
            self._unsub_rules()
            self._unsub_rules = None

    # ----- listeners (entities, websocket) -----

    @callback
    def async_add_listener(self, listener: Callable[[str], None]) -> Callable[[], None]:
        self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)

    @callback
    def _notify(self, reason: str = DATA) -> None:
        for listener in list(self._listeners):
            listener(reason)

    @callback
    def _changed(self) -> None:
        self.store.async_delay_save(lambda: self.data, SAVE_DELAY)
        self._notify(DATA)

    # ----- reading -----

    @property
    def override_duration(self) -> int:
        return int(self.entry.options.get(CONF_OVERRIDE_DURATION, DEFAULT_OVERRIDE_DURATION))

    @property
    def schedule_ids(self) -> set[str]:
        return {m["id"] for m in self.data["schedules"]}

    def schedule_name(self, schedule_id: str) -> str | None:
        return next((m["name"] for m in self.data["schedules"] if m["id"] == schedule_id), None)

    @property
    def preset_ids(self) -> set[str]:
        return {preset["id"] for preset in self.data["presets"]}

    @property
    def presets_by_id(self) -> dict[str, dict[str, Any]]:
        """The presets by id, in their order."""
        return {preset["id"]: preset for preset in self.data["presets"]}

    @property
    def thermostats(self) -> dict[str, dict[str, Any]]:
        """The thermostats Chauffage knows (model.py): the scheduled ones, and those with only
        values of the presets, set before their weeks."""
        return self.data["thermostats"]

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

    def preset_temperature(self, state: State, preset: str) -> float | None:
        """Temperature a thermostat's own preset gives (published, else learned): the one the
        card shows, and the one a manual setpoint is compared with."""
        learned = self.thermostats.get(state.entity_id, {}).get("preset_temperatures", {})
        return engine.preset_temperature(dict(state.attributes), preset, learned)

    def temperatures_of(self, state: State | None) -> dict[str, float]:
        """{own preset: temperature} of a thermostat, for its presets and the learned ones."""
        if state is None:
            return {}
        learned = self.thermostats.get(state.entity_id, {}).get("preset_temperatures", {})
        temperatures = {p: self.preset_temperature(state, p) for p in {*thermostat(state).presets, *learned}}
        return {p: t for p, t in temperatures.items() if t is not None}

    def plan(self) -> engine.Plan:
        """What the active thermostats follow: paused ones are left out."""
        return engine.Plan(
            {entity_id: self.thermostats[entity_id]["weeks"] for entity_id in self.active},
            self.data["active_schedule"],
            self.presets_by_id,
            self.mappings,
            self.data["overrides"],
            self.use_presets,
        )

    @property
    def use_presets(self) -> bool:
        return bool(self.entry.options.get(CONF_USE_PRESETS, DEFAULT_USE_PRESETS))

    def targets_of(self, entity_id: str) -> dict[str, dict[str, Any]]:
        """What each preset means for a thermostat (mapping set by hand, else the default)."""
        presets = self.presets_by_id
        mapping = self.thermostats.get(entity_id, {}).get("mapping") or None
        current = thermostat(self.hass.states.get(entity_id))
        out = {}
        for preset_id in presets:
            target = engine.resolve(preset_id, presets, mapping, current, self.use_presets)
            if target:
                out[preset_id] = target.as_dict()
        return out

    def preset_temperatures_of(self, entity_id: str) -> dict[str, float]:
        """{preset id: temperature} on a thermostat: its own for a temperature, the one its own
        preset gives (published, else learned) for a climate preset; unknown ones left out."""
        own = self.temperatures_of(self.hass.states.get(entity_id))
        temperatures = {p: t.get("temperature", own.get(t.get("preset"))) for p, t in self.targets_of(entity_id).items()}
        return {p: t for p, t in temperatures.items() if t is not None}

    def snapshot(self) -> dict[str, Any]:
        """Everything the card needs."""
        return {
            "schedules": self.data["schedules"],
            "active_schedule": self.data["active_schedule"],
            "presets": self.data["presets"],
            "thermostats": {e: {"paused": t["paused"], "revision": t["revision"]} for e, t in self.scheduled.items()},
            "mappings": self.mappings,
            "targets": {e: self.targets_of(e) for e in self.scheduled},
            "weeks": self.weeks,
            "overrides": self.data["overrides"],
            # Every thermostat, those the card shows before they are scheduled too
            "preset_temperatures": {
                state.entity_id: temperatures for state in self.hass.states.async_all("climate")
                if (temperatures := self.temperatures_of(state))
            },
            "use_presets": self.use_presets,
            "revision": self.data["revision"],
            "override_duration": self.override_duration,
            "rules": self.data["rules"],
            "default_schedule": self.data["default_schedule"],
            "rule_results": self.rule_results,
            "renamed": self.data["renamed"],
            "planned": self.planned_presets(),
            "version": self.version,
            "schedule_entities": self.schedule_entities(),
            # The cards open the entities and the device they mention (#39)
            "thermostat_entities": self.thermostat_entities(),
            "schedule_select": er.async_get(self.hass).async_get_entity_id(
                "select", DOMAIN, f"{self.entry.entry_id}_schedule"),
            "device_id": self.device_id(),
        }

    def schedule_entities(self) -> dict[str, str]:
        """{schedule id: entity id of its switch}: the card shows the icon chosen for it in HA."""
        registry = er.async_get(self.hass)
        entities = {s: registry.async_get_entity_id("switch", DOMAIN, schedule_unique_id(self.entry.entry_id, s))
                    for s in self.schedule_ids}
        return {s: entity_id for s, entity_id in entities.items() if entity_id}

    def thermostat_entities(self) -> dict[str, dict[str, str]]:
        """{thermostat: {control, override, planned_preset, override_end: entity id}}: a thermostat
        without a device has no other way to find its entities (named after it, not attached)."""
        registry = er.async_get(self.hass)
        names = {CONTROL_KEY: "control", OVERRIDE_KEY: "override", PLANNED_PRESET_KEY: "planned_preset",
                 OVERRIDE_END_KEY: "override_end"}
        out = {}
        for climate in self.scheduled:
            ids = {names[key]: registry.async_get_entity_id(platform, DOMAIN, thermostat_unique_id(
                self.entry.entry_id, climate, key)) for key, platform in THERMOSTAT_ENTITIES.items()}
            out[climate] = {name: entity_id for name, entity_id in ids.items() if entity_id}
        return out

    def device_id(self) -> str | None:
        """The "Chauffage" device holding the global entities."""
        device = dr.async_get(self.hass).async_get_device(identifiers={(DOMAIN, self.entry.entry_id)})
        return device.id if device else None

    def _card_entities(self) -> set[str]:
        ids = set(self.schedule_entities().values())
        for entities in self.thermostat_entities().values():
            ids.update(entities.values())
        return ids

    def planned(self, entity_id: str, now: datetime | None = None) -> tuple[str | None, str | None, datetime | None]:
        """(preset now, next preset, its start) for a thermostat in the active schedule."""
        week = self.thermostats.get(entity_id, {}).get("weeks", {}).get(self.data["active_schedule"])
        if not week:
            return None, None, None
        return engine.current_and_next(week, now or dt_util.now())

    def planned_presets(self) -> dict[str, dict[str, Any]]:
        """What each scheduled thermostat follows now, and the next different preset."""
        out = {}
        for entity_id in self.scheduled:
            current, next_preset, next_start = self.planned(entity_id)
            out[entity_id] = {"preset": current, "next_preset": next_preset,
                              "next_start": next_start.isoformat() if next_start else None}
        return out

    # ----- writing -----

    def _weeks_changed(self, entity_ids: Any) -> None:
        """New revisions for these thermostats: a copy of their weeks made before is outdated."""
        for entity_id in entity_ids:
            self.thermostats[entity_id]["revision"] += 1

    def _thermostat(self, entity_id: str) -> dict[str, Any]:
        """The thermostat's data, made for a thermostat the card brings: scheduled, active, once
        it has weeks."""
        return self.thermostats.setdefault(entity_id, model.new_thermostat())

    async def save_weeks(self, weeks: Any, revision: int | None = None,
                         revisions: dict[str, int | None] | None = None) -> None:
        """The weeks of the thermostats sent; the others keep theirs: a thermostat a card does
        not show stays scheduled (#27), only forget() drops it. A thermostat keeps its weeks in
        the schedules not sent, and gets the week of a new schedule in those it had none in: a
        scheduled thermostat has a week in every schedule. Saved against the revision of each
        thermostat sent (`revisions`; None: not scheduled when the copy was made), or the global
        one (`revision`, older cards). StaleRevision if one of them changed."""
        if revision is not None and revision != self.data["revision"]:
            raise StaleRevision
        normalized = model.normalize_weeks(weeks, self.schedule_ids, self.preset_ids)
        if any(self._renamed_to(entity_id) for entity_id in normalized):
            raise StaleRevision  # a copy holding a former id: reloaded, the card sets it aside
        if revisions is not None:
            scheduled = self.scheduled
            for entity_id in normalized:
                current = scheduled.get(entity_id, {}).get("revision")
                if revisions.get(entity_id) != current:
                    raise StaleRevision
        schedule_ids = [schedule["id"] for schedule in self.data["schedules"]]
        preset_ids = list(self.presets_by_id)
        for entity_id, by_schedule in normalized.items():
            t = self._thermostat(entity_id)
            t["weeks"] = model.complete_weeks({**t["weeks"], **by_schedule}, schedule_ids, preset_ids)
        self._weeks_changed(normalized)
        self.data["revision"] += 1
        self._track_thermostats()
        for entity_id in self.active:
            self._learn(self.hass.states.get(entity_id))
        self._changed()
        await self.apply(force=True)

    async def set_paused(self, entity_id: str, paused: bool) -> None:
        """Pause (kept, not controlled, its override dropped and the thermostat left as it is) or
        resume (realigned at once)."""
        if entity_id not in self.scheduled:
            raise model.InvalidData(f"not scheduled: {entity_id}")
        if self.is_paused(entity_id) == paused:
            return
        self.thermostats[entity_id]["paused"] = paused
        if paused:
            self._drop_override(entity_id, "paused")
            self._retry.discard(entity_id)
        self._track_thermostats()
        self._changed()
        if not paused:
            self._learn(self.hass.states.get(entity_id))
            await self.apply(include={entity_id})

    async def forget(self, entity_id: str) -> None:
        """No longer scheduled: its data, override and entities are dropped, the thermostat left
        as it is. A new revision: a card's copy that still holds it must reload before saving."""
        if self.thermostats.pop(entity_id, None) is None:
            raise model.InvalidData(f"not scheduled: {entity_id}")
        self._drop_override(entity_id, "forgotten")
        self._retry.discard(entity_id)
        self.data["renamed"] = {former: e for former, e in self.data["renamed"].items() if e != entity_id}
        repairs.close_missing(self.hass, entity_id)
        self.data["revision"] += 1
        self._track_thermostats()
        self._changed()

    def _renamed_to(self, entity_id: str) -> str | None:
        """The new id of a thermostat renamed from this one, unless the id is taken again."""
        current = self.data["renamed"].get(entity_id)
        if current is None or entity_id in self.thermostats or self.hass.states.get(entity_id) is not None:
            return None
        return current

    @callback
    def _registry_updated(self, event: Event) -> None:
        action, entity_id = event.data.get("action"), event.data.get("entity_id")
        if action == "remove" and entity_id in self.scheduled:
            repairs.raise_missing(self.hass, entity_id)
        elif action == "create" and entity_id in self.scheduled:
            repairs.close_missing(self.hass, entity_id)  # made again with the same id
        elif action == "update" and event.data.get("old_entity_id") in self.thermostats:
            self._renamed(event.data["old_entity_id"], entity_id)
        if action != "remove" and entity_id in self._card_entities():
            self._notify(ENTITIES)  # an entity registered or renamed: the cards show its icon and open it

    @callback
    def _renamed(self, old: str, new: str) -> None:
        """A thermostat renamed in Home Assistant: its data and override move to the new id
        (`renamed` tells the cards still holding the former one), its entities keep their ids and
        settings (their unique ids follow), and the entry is reloaded to attach them to the new
        id. A new revision: a card's copy of the weeks holds
        the former id. Data still held under the new id (an entity gone, kept in its repair) is
        dropped with its entities: the renamed thermostat is the one that exists."""
        registry = er.async_get(self.hass)
        # Exact unique ids: climate.salon_bas's also start with "<entry>_climate.salon_"
        def unique_id(climate: str, key: str) -> str:
            return thermostat_unique_id(self.entry.entry_id, climate, key)

        if self.thermostats.pop(new, None) is not None:
            for key, platform in THERMOSTAT_ENTITIES.items():
                if entity_id := registry.async_get_entity_id(platform, DOMAIN, unique_id(new, key)):
                    registry.async_remove(entity_id)
            repairs.close_missing(self.hass, new)
        self._drop_override(new, "forgotten")
        self.thermostats[new] = self.thermostats.pop(old)
        self._weeks_changed([new])
        if old in self.data["overrides"]:
            self.data["overrides"][new] = self.data["overrides"].pop(old)
        renamed = self.data["renamed"]
        for former, current in list(renamed.items()):
            if current == old:
                renamed[former] = new
        renamed[old] = new
        renamed.pop(new, None)  # renamed back
        repairs.close_missing(self.hass, old)
        for key, platform in THERMOSTAT_ENTITIES.items():
            entity_id = registry.async_get_entity_id(platform, DOMAIN, unique_id(old, key))
            if entity_id:
                registry.async_update_entity(entity_id, new_unique_id=unique_id(new, key))
        self.data["revision"] += 1
        # Not notified: the entities wait for the reload (see reloading), which saves the data
        self.reloading = True
        self.hass.config_entries.async_schedule_reload(self.entry.entry_id)

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
                        [[[start, replacements.get(preset, preset)] for start, preset in day] for day in week]
                    )
            self._weeks_changed(affected)
            self.data["revision"] += 1
        for t in self.thermostats.values():
            for preset_id in removed:
                t["mapping"].pop(preset_id, None)
        self.data["presets"] = new_presets
        self._changed()
        await self.apply(force=True)

    async def set_mapping(self, entity_id: str, mapping: Any) -> None:
        """Mapping set by hand for one thermostat ({} = defaults only)."""
        normalized = model.normalize_mapping(mapping, self.preset_ids)
        if normalized or entity_id in self.scheduled:
            self._thermostat(entity_id)["mapping"] = normalized
        else:
            self.thermostats.pop(entity_id, None)  # not scheduled: nothing left to keep
        self._changed()
        await self.apply(force=True)

    async def set_schedules(self, items: Any, revision: int | None = None) -> list[dict[str, str]]:
        """Create (empty or a copy), rename, move and delete schedules (see model.plan_schedules).
        An empty schedule puts every scheduled thermostat in eco (or the first preset) all week:
        each keeps a week in every schedule. The active schedule and its weeks do not change: the
        thermostats are not touched."""
        if revision is not None and revision != self.data["revision"]:
            raise StaleRevision
        schedules, created = model.plan_schedules(items, self.data["schedules"], self.data["active_schedule"])
        kept = {s["id"] for s in schedules}
        in_rules = ({rule["schedule"] for rule in self.data["rules"]} | {self.data["default_schedule"]}) - {None}
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
        self.data["schedules"] = schedules
        self.data["revision"] += 1
        self._changed()
        return copy.deepcopy(schedules)

    async def activate_schedule(self, schedule_id: str, *, source: str) -> None:
        """`source` (card, entity, service, rules) is told in the chauffage_schedule_activated event."""
        if schedule_id not in self.schedule_ids:
            raise model.InvalidData(f"unknown schedule: {schedule_id}")
        if schedule_id == self.data["active_schedule"]:
            return
        previous, self.data["active_schedule"] = self.data["active_schedule"], schedule_id
        self._changed()
        self.hass.bus.async_fire(EVENT_SCHEDULE_ACTIVATED, {
            "schedule": schedule_id, "schedule_name": self.schedule_name(schedule_id),
            "previous_schedule": previous, "source": source,
        })
        await self.apply(force=True)

    # ----- activation rules -----

    async def set_rules(self, rules: Any, default_schedule: Any) -> None:
        """New activation rules, applied at once (even over a schedule chosen by hand)."""
        normalized = model.normalize_rules(rules, default_schedule, self.schedule_ids)
        for rule in normalized:
            try:
                Template(rule["template"], self.hass).ensure_valid()
            except TemplateError as err:
                raise model.InvalidData(f"invalid template: {err}") from err
        self.data["rules"], self.data["default_schedule"] = normalized, default_schedule
        self._changed()
        self._track_rules()
        await self.follow_rules(force=True)

    @callback
    def _track_rules(self) -> None:
        """Watches the entities (and the time) the templates of the rules depend on."""
        if self._unsub_rules:
            self._unsub_rules()
        self.rule_results = []

        @callback
        def changed() -> None:
            self.entry.async_create_task(self.hass, self.follow_rules(), "chauffage rules")

        self._unsub_rules = self.track_templates([rule["template"] for rule in self.data["rules"]], changed)

    @callback
    def track_templates(self, templates: list[str], action: Callable[[], None]) -> Callable[[], None] | None:
        """Calls `action` (a callback) when the result of one of these templates may have changed:
        HA's template tracking (the entities they read, the time when they use now()). Empty and
        invalid templates are left out; None when nothing is tracked."""
        tracked = []
        for text in templates:
            template = Template(text, self.hass)
            try:
                template.ensure_valid()
            except TemplateError:
                continue
            if text.strip():
                tracked.append(TrackTemplate(template, None))
        if not tracked:
            return None

        @callback
        def changed(_event: Event | None, _updates: list) -> None:
            action()

        return async_track_template_result(self.hass, tracked, changed).async_remove

    def render_rule(self, rule: dict[str, Any]) -> tuple[Any, str | None, str | None]:
        """(result, text, error) of a rule now. The result: True / False for a rule with a schedule,
        the schedule its template gives (False: none) for a rule without; None when its template is
        empty or fails (the rule does not apply)."""
        if not rule["template"].strip():
            return None, None, None
        try:
            text = Template(rule["template"], self.hass).async_render(parse_result=False)
        except TemplateError as err:
            return None, None, str(err)
        if rule["schedule"]:
            return result_as_boolean(text), text, None
        return model.schedule_named(text, self.data["schedules"]) or False, text, None

    def _evaluate_rules(self) -> list[Any]:
        results = []
        for rule in self.data["rules"]:
            result, _, error = self.render_rule(rule)
            if error:
                _LOGGER.warning("Activation rule %s: %s", rule["template"], error)
            results.append(result)
        return results

    async def follow_rules(self, force: bool = False) -> None:
        """Activates the schedule the rules give when their outcome changed (or `force`)."""
        results = self._evaluate_rules()
        notify = results != self.rule_results
        self.rule_results = results
        outcome = model.rules_outcome(self.data["rules"], results, self.data["default_schedule"])
        changed = outcome != self.data["rules_choice"]
        if changed:
            self.data["rules_choice"] = outcome
            self._changed()
        elif notify:
            self._notify(DATA)
        if outcome is not None and (changed or force):
            await self.activate_schedule(outcome, source="rules")

    async def set_override(self, entity_id: str, override: dict[str, Any] | None, *, source: str,
                           resend: bool = False) -> None:
        """Create / change / extend (override) or remove (None) a thermostat's override, from the
        card or the service (`source`, told in the events; "thermostat" for a change on it back to
        the schedule).

        A temperature is fitted to the thermostat (limits, step). A new override or a new value
        is sent to the thermostat unless it already has it; a new end alone is not, unless
        `resend` (the service: an automation setting it again puts back a thermostat that lost
        it). ThermostatFailed, and nothing recorded, if the thermostat could not be reached; none
        on a paused thermostat."""
        if override is not None and self.is_paused(entity_id):
            raise ThermostatPaused(f"paused: {entity_id}")
        if override is None:
            if not self._drop_override(entity_id, source):
                return
            self._changed()
            await self.apply(resumed=entity_id)
            return
        override = model.normalize_override(override)
        current = thermostat(self.hass.states.get(entity_id))
        if override["kind"] == "temperature" and current is not None:
            override["value"] = engine.fit_temperature(override["value"], current)
        target = engine.Target(override["kind"], override["value"])
        before = self.data["overrides"].get(entity_id)
        new_value = before is None or (before["kind"], before["value"]) != (target.kind, target.value)
        if (new_value or resend) and (current is None or not engine.satisfied(target, current)):
            service, data = (
                ("set_temperature", {"temperature": target.value}) if target.kind == "temperature"
                else ("set_preset_mode", {"preset_mode": target.value})
            )
            if not await self.call_climate(service, entity_id, data):
                raise ThermostatFailed(entity_id)
        self._keep_override(entity_id, override, source)
        self._changed()

    @callback
    def record_override(self, entity_id: str, override: dict[str, Any]) -> None:
        """The override of a change by hand, only recorded: the thermostat set it itself, and
        sending it back could undo a second change made meanwhile."""
        self._keep_override(entity_id, model.normalize_override(override), "thermostat")
        self._changed()

    def override_info(self, entity_id: str) -> dict[str, Any]:
        """A thermostat's override as automations see it (sensor, event): kind, value, the preset
        it was set to, its end in local time (None without override)."""
        override = self.data["overrides"].get(entity_id) or {}
        end = engine.parse_datetime(override.get("end"))
        return {key: override.get(key) for key in ("kind", "value", "preset")} | {
            "end": dt_util.as_local(end).isoformat() if end else None,
        }

    @callback
    def _keep_override(self, entity_id: str, override: dict[str, Any], source: str) -> None:
        """Records an override; a new one, or a new value, is told (an end alone is not)."""
        before = self.data["overrides"].get(entity_id)
        self.data["overrides"][entity_id] = override
        if before is None or any(before.get(key) != override.get(key) for key in ("kind", "value", "preset")):
            self.hass.bus.async_fire(EVENT_OVERRIDE_STARTED,
                                     {"entity_id": entity_id, **self.override_info(entity_id), "source": source})

    @callback
    def _drop_override(self, entity_id: str, reason: str) -> bool:
        """Removes a thermostat's override, and tells why; False if it had none."""
        if self.data["overrides"].pop(entity_id, None) is None:
            return False
        self.hass.bus.async_fire(EVENT_OVERRIDE_ENDED, {"entity_id": entity_id, "reason": reason})
        return True

    def new_override(self, kind: str, value: Any, minutes: int | None = None, end: datetime | None = None) -> dict[str, Any]:
        start = dt_util.now().replace(microsecond=0)
        end = end or start + timedelta(minutes=minutes or self.override_duration)
        return {"kind": kind, "value": value, "start": start.isoformat(), "end": end.replace(microsecond=0).isoformat()}

    def preset_override(self, entity_id: str, preset_id: str, minutes: int | None = None,
                        end: datetime | None = None) -> dict[str, Any] | None:
        """A new override to a Chauffage preset: what it means on this thermostat, and which
        preset it is (None: not one of the Chauffage presets)."""
        target = self.targets_of(entity_id).get(preset_id)
        if target is None:
            return None
        ((kind, value),) = target.items()
        return self.new_override(kind, value, minutes, end) | {"preset": preset_id}

    async def call_climate(self, service: str, entity_id: str, data: dict[str, Any]) -> bool:
        """Calls a climate service with the integration's own context; False if it failed."""
        context = Context()
        self._own_contexts.append(context.id)
        try:
            await self.hass.services.async_call(
                "climate", service, {"entity_id": entity_id, **data}, blocking=True, context=context
            )
        except Exception as err:  # noqa: BLE001 — one unreachable valve must not stop the others
            _LOGGER.warning("%s: climate.%s failed: %s", entity_id, service, err)
            return False
        return True

    # ----- scheduling -----

    async def apply(self, *, force: bool = False, resumed: str | None = None, ended: list[str] | None = None,
                    since: datetime | None = None, include: set[str] | None = None) -> None:
        async with self._lock:
            todo = engine.targets(
                self.plan(),
                dt_util.now(),
                {e: t for e in self.active if (t := thermostat(self.hass.states.get(e)))},
                force=force,
                resumed=resumed,
                ended=ended or (),
                since=since,
                include=frozenset(include or ()) | frozenset(self._retry),
            )
            # A thermostat to retry that needs nothing anymore (already right, override, off…)
            self._retry &= {entity_id for entity_id, _ in todo}
            for i, (entity_id, target) in enumerate(todo):
                if i and self.pause:
                    await asyncio.sleep(self.pause)
                if entity_id not in self.thermostats or self.is_paused(entity_id):
                    continue  # paused or forgotten meanwhile
                if target.kind == "preset":
                    done = await self.call_climate("set_preset_mode", entity_id, {"preset_mode": target.value})
                else:
                    done = await self.call_climate("set_temperature", entity_id, {"temperature": target.value})
                # Not delivered (unreachable valve…): sent again at the next minutes
                if done:
                    self._retry.discard(entity_id)
                else:
                    self._retry.add(entity_id)

    async def _tick(self, now: datetime) -> None:
        ended = engine.ended_overrides(self.data["overrides"], dt_util.now())
        since, self._last_tick = self._last_tick, dt_util.now()
        # Dropped before the slots are applied (which takes a while): one set again meanwhile is a
        # new override, sent to the thermostat
        for entity_id in ended:
            self._drop_override(entity_id, "expired")
        if ended:
            self._changed()
        await self.apply(ended=ended, since=since)
        self._notify(TICK)

    # ----- manual changes -----

    @callback
    def _track_thermostats(self) -> None:
        if self._unsub_states:
            self._unsub_states()
        entities = list(self.scheduled)
        self._unsub_states = (
            async_track_state_change_event(self.hass, entities, self._state_changed) if entities else None
        )

    @callback
    def _learn(self, state: State | None) -> bool:
        """While a thermostat is on a preset, its setpoint is that preset's temperature."""
        current = thermostat(state)
        if current is None or current.state in engine.IGNORED_STATES or current.temperature is None:
            return False
        if engine.is_manual_preset(current.preset) or state.entity_id not in self.thermostats:
            return False
        known = self.thermostats[state.entity_id]["preset_temperatures"]
        if known.get(current.preset) == current.temperature:
            return False
        known[current.preset] = current.temperature
        self._changed()
        return True

    @callback
    def _state_changed(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        before = self.temperatures_of(old)
        if not self._learn(new) and before != self.temperatures_of(new):
            self._notify()  # published by the thermostat: the card shows them
        # Paused thermostats are followed for their preset temperatures only
        if old is None or new is None or self.is_paused(new.entity_id):
            return
        if old.state in engine.IGNORED_STATES and new.state not in engine.IGNORED_STATES:
            # Turned back on, or back online: the thermostat may have missed slot changes
            self.entry.async_create_task(self.hass, self.apply(include={new.entity_id}), "chauffage catch up")
            return
        context = new.context
        # Changes made by the schedule, or by any automation / script, are not overrides
        if context.id in self._own_contexts or context.parent_id is not None:
            return
        after = thermostat(new)
        expected = self.plan().expected(new.entity_id, dt_util.now(), after)
        preset_temperature = self.preset_temperature(new, expected.value) \
            if expected is not None and expected.kind == "preset" else None
        current = self.data["overrides"].get(new.entity_id)
        change = engine.manual_change(
            thermostat(old), after, by_user=context.user_id is not None, expected=expected,
            preset_temperature=preset_temperature,
            override=engine.Target(current["kind"], current["value"]) if current else None,
        )
        if change is None:
            return
        if change == engine.RESUME:
            if new.entity_id in self.data["overrides"]:
                resume = self.set_override(new.entity_id, None, source="thermostat")
                self.entry.async_create_task(self.hass, resume, "chauffage resume")
            return
        self.record_override(new.entity_id, self.new_override(*change))
