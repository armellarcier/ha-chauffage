"""What the card and the entities read: the message of chauffage/subscribe (SnapshotBuilder), what
each thermostat follows now and next, and the entities the cards open."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util

from ..domain.plan import Plan
from ..domain.slot import Slot, Week, target_of
from ..domain.target import RANGE_KEYS
from ..domain.thermostat import Thermostat
from ..domain.timeline import current_and_next, parse_datetime
from ..const import (
    CONTROL_KEY,
    DOMAIN,
    NEXT_CHANGE_KEY,
    OVERRIDE_END_KEY,
    OVERRIDE_KEY,
    PLANNED_PRESET_KEY,
    THERMOSTAT_ENTITIES,
    schedule_unique_id,
    thermostat_unique_id,
)
from ..storage import schema
from ..thermostats.reader import cause

if TYPE_CHECKING:
    from .runtime import ChauffageRuntime


def device_by_identifier(hass: HomeAssistant, entry: ConfigEntry, identifier: tuple[str, str]) -> dr.DeviceEntry | None:
    """One of the integration's devices, by its identifier."""
    registry = dr.async_get(hass)
    # From Home Assistant 2026.10, identifiers are only unique within a config entry: the
    # lookup by identifiers alone is deprecated (it stops working in 2027.8)
    if hasattr(registry, "async_get_device_by_identifier"):
        return registry.async_get_device_by_identifier(identifier, entry.entry_id)
    return registry.async_get_device(identifiers={identifier})


class SnapshotBuilder:
    def __init__(self, runtime: ChauffageRuntime) -> None:
        self._runtime = runtime

    def targets_of(self, entity_id: str) -> dict[str, dict[str, Any]]:
        """What each preset means for a thermostat, in each HVAC mode (Preset.value_on: the
        mapping set by hand, else the default). Without an HVAC mode: an override set to a
        preset keeps the thermostat's own."""
        presets = self._runtime.installation.presets_by_id
        mapping = self._runtime.installation.thermostats.get(entity_id, {}).get("mapping") or None
        current = self._runtime.gateway.read(self._runtime.hass.states.get(entity_id))
        out = {}
        for preset_id in presets:
            target = target_of(preset_id, presets, mapping, current, self._runtime.settings.use_presets)
            if target:
                out[preset_id] = dict(target)
        return out

    def preview_preset(self, entity_id: str, preset: Any, value: Any = None) -> dict[str, Any]:
        """What a preset is worth on a thermostat, for each HVAC mode: a preset and a value set by
        hand that the card holds, saved or not (chauffage/preset/preview). The card asks rather than computing it (#132)."""
        worth = schema.preset(preset, set()).value_on(
            None if value is None else schema.value(value), self._runtime.gateway.read(self._runtime.hass.states.get(entity_id)),
            self._runtime.settings.use_presets)
        return {"value": worth.attributes()}

    def preset_temperatures_of(self, entity_id: str, cool: bool = False) -> dict[str, float]:
        """{preset id: temperature} on a thermostat: its own for a temperature, the one its own
        preset gives (published, else learned) for a climate preset; unknown ones left out.
        `cool`: what each preset gives when the thermostat cools: its cooling temperature, else
        what its own preset gives when cooling. A heating temperature is not one."""
        own = self._runtime.learner.temperatures_of(self._runtime.hass.states.get(entity_id), cool)
        key, own_key = ("cool_temperature", "cool_preset_mode") if cool else ("temperature", "preset_mode")
        temperatures = {p: t.get(key, own.get(t.get(own_key))) for p, t in self.targets_of(entity_id).items()}
        return {p: t for p, t in temperatures.items() if t is not None}

    def snapshot(self) -> dict[str, Any]:
        """Everything the card needs."""
        hass = self._runtime.hass
        return {
            "schedules": self._runtime.installation.schedules,
            "active_schedule": self._runtime.installation.active_schedule,
            "presets": self._runtime.installation.presets,
            # cause: why a VTherm protects itself ("window", "auto_start_stop"), None otherwise: the
            # card then does not read VTherm's attributes
            # own_settings: the fan and the vanes it gets back from a slot that sets none
            # hvac_mode_control: its own setting (None: it follows the house, #159)
            "thermostats": {e: {"paused": t["paused"], "revision": t["revision"], "cause": cause(hass, hass.states.get(e)),
                                "own_settings": self._runtime.gateway.own_settings(e),
                                "hvac_mode_control": self._runtime.settings.own_hvac_mode_control(e)}
                            for e, t in self._runtime.installation.scheduled.items()},
            "hvac_mode_control": self._runtime.settings.hvac_mode_control,
            "mappings": self._runtime.installation.mappings,
            "targets": {e: self.targets_of(e) for e in self._runtime.installation.scheduled},
            "weeks": self._runtime.installation.weeks,
            "overrides": self._runtime.installation.overrides,
            # Every thermostat, those the card shows before they are scheduled too
            "preset_temperatures": {
                state.entity_id: temperatures for state in self._runtime.hass.states.async_all("climate")
                if (temperatures := self._runtime.learner.temperatures_of(state))
            },
            # What its own presets give when it cools (an air conditioner)
            "cool_preset_temperatures": {
                state.entity_id: temperatures for state in self._runtime.hass.states.async_all("climate")
                if (temperatures := self._runtime.learner.temperatures_of(state, cool=True))
            },
            "use_presets": self._runtime.settings.use_presets,
            "revision": self._runtime.installation.revision,
            "override_duration": self._runtime.settings.override_duration,
            "manual_override_end": self._runtime.settings.manual_override_end,
            "off_override_end": self._runtime.settings.off_override_end,
            "access_level": self._runtime.settings.access_level,
            "rules": self._runtime.installation.rules,
            "default_schedule": self._runtime.installation.default_schedule,
            "rule_results": self._runtime.rules.results,
            "renamed": self._runtime.installation.renamed,
            "planned": self.planned_presets(),
            "version": self._runtime.version,
            "schedule_entities": self.schedule_entities(),
            # The cards open the entities and the device they mention (#39)
            "thermostat_entities": self.thermostat_entities(),
            "schedule_select": self.schedule_select(),
            "device_id": self.device_id(),
        }

    def schedule_entities(self) -> dict[str, str]:
        """{schedule id: entity id of its switch}: the card shows the icon chosen for it in HA."""
        registry = er.async_get(self._runtime.hass)
        entities = {s: registry.async_get_entity_id("switch", DOMAIN, schedule_unique_id(self._runtime.entry.entry_id, s))
                    for s in self._runtime.installation.schedule_ids}
        return {s: entity_id for s, entity_id in entities.items() if entity_id}

    def thermostat_entities(self) -> dict[str, dict[str, str]]:
        """{thermostat: {control, override, planned_preset, override_end, next_change: entity id}}: a thermostat
        without a device has no other way to find its entities (named after it, not attached)."""
        registry = er.async_get(self._runtime.hass)
        names = {CONTROL_KEY: "control", OVERRIDE_KEY: "override", PLANNED_PRESET_KEY: "planned_preset",
                 OVERRIDE_END_KEY: "override_end", NEXT_CHANGE_KEY: "next_change"}
        out = {}
        for climate in self._runtime.installation.scheduled:
            ids = {names[key]: registry.async_get_entity_id(platform, DOMAIN, thermostat_unique_id(
                self._runtime.entry.entry_id, climate, key)) for key, platform in THERMOSTAT_ENTITIES.items()}
            out[climate] = {name: entity_id for name, entity_id in ids.items() if entity_id}
        return out

    def device_id(self) -> str | None:
        """The "Chauffage" device holding the global entities."""
        device = device_by_identifier(self._runtime.hass, self._runtime.entry, (DOMAIN, self._runtime.entry.entry_id))
        return device.id if device else None

    def schedule_select(self) -> str | None:
        """The active-schedule select's entity id."""
        return er.async_get(self._runtime.hass).async_get_entity_id("select", DOMAIN, f"{self._runtime.entry.entry_id}_schedule")

    def card_entities(self) -> set[str]:
        ids = {*self.schedule_entities().values(), self.schedule_select()}
        for entities in self.thermostat_entities().values():
            ids.update(entities.values())
        return ids

    def planned(self, entity_id: str, now: datetime | None = None, thermostat: Thermostat | None = None
                ) -> tuple[Slot | None, Slot | None, datetime | None]:
        """(slot now, next different slot, its start) for a thermostat in the active schedule.
        The slots as they run on it: on an air conditioner, a slot that says heat does not
        differ from one that says nothing. `thermostat`: the thermostat as read by the caller,
        else read here."""
        week = self._runtime.installation.thermostats.get(entity_id, {}).get("weeks", {}).get(self._runtime.installation.active_schedule)
        if not week:
            return None, None, None
        thermostat = thermostat or self._runtime.gateway.read(self._runtime.hass.states.get(entity_id))
        return current_and_next(Week.from_stored(week).on(thermostat).to_stored(), now or dt_util.now())

    def planned_targets(self, entity_id: str, plan: Plan | None = None, now: datetime | None = None,
                        thermostat: Thermostat | None = None) -> dict[str, Any]:
        """What a scheduled thermostat follows now (its preset, its HVAC mode, its target on this
        thermostat), and the next different slot (its preset, its HVAC mode, its start): the
        planned-preset sensor's attributes. The HVAC mode is the slot's: off, fan_only, or heat
        or cool when the thermostat lists it, else None. An off slot and a fan-only slot have no
        preset. `plan`: the one built for a snapshot, else built here. `thermostat`: the thermostat
        as read by the caller, else read here."""
        plan = plan or self._runtime.scheduler.plan()
        thermostat = thermostat or self._runtime.gateway.read(self._runtime.hass.states.get(entity_id))
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

    def planned_info(self, entity_id: str, plan: Plan | None = None, now: datetime | None = None) -> dict[str, Any]:
        """planned_targets, and the ends the card's buttons offer (#83, D2): the next slot a
        change made now would end at (*Until the next slot*) and the next morning (*Until
        tomorrow*), computed here, in Home Assistant's time zone, not in the browser's."""
        plan, now = plan or self._runtime.scheduler.plan(), now or dt_util.now()
        thermostat = self._runtime.gateway.read(self._runtime.hass.states.get(entity_id))
        slot = self._runtime.overrides.next_slot_end(entity_id, thermostat, plan, now)
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
        plan, now = self._runtime.scheduler.plan(), now or dt_util.now()
        thermostat = self._runtime.gateway.read(self._runtime.hass.states.get(entity_id))
        override = self._runtime.installation.overrides.get(entity_id)
        if override:
            start = parse_datetime(override.get("end"))
            start = dt_util.as_local(start) if start else None
        else:
            start = plan.next_change(entity_id, now, thermostat, not_before=now, until=now + timedelta(days=8))
        slot = plan.slot_at(entity_id, start)[0] if start else None
        target = plan.target_of(entity_id, slot, thermostat) or {}
        # What it sends, in the slot's HVAC mode: a preset's cooling value in cool, not its heating one
        sent = target.completed_for(thermostat, planned=target.get("hvac_mode")) if target else {}
        # The HVAC mode sent, or the one the thermostat keeps
        hvac_mode = sent.get("hvac_mode") or (thermostat.state if thermostat is not None and target else None)
        info = {"start": start, "preset": slot.preset if slot else None, "hvac_mode": hvac_mode,
                "preset_mode": sent.get("preset_mode"), "temperature": sent.get("temperature")}
        if all(key in sent for key in RANGE_KEYS):
            info.update({key: sent[key] for key in RANGE_KEYS})
        elif info["temperature"] is None and slot is not None and slot.preset and hvac_mode != "off":
            info["temperature"] = self.preset_temperatures_of(entity_id, hvac_mode == "cool").get(slot.preset)
        return info

    def next_day_slot_end(self, entity_id: str, current: Thermostat | None, plan: Plan | None = None,
                          now: datetime | None = None) -> datetime | None:
        """The next morning, for the end "until tomorrow" of an off override (C4, D2): the first
        slot of today that changes the thermostat's state, if it is still to come, else the first
        one of tomorrow, or of the next day that has one, within a week. A 00:00 slot that
        repeats the evening's does not count. None without one."""
        now, plan = now or dt_util.now(), plan or self._runtime.scheduler.plan()
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
        plan, now = self._runtime.scheduler.plan(), dt_util.now()
        return {entity_id: self.planned_info(entity_id, plan, now) for entity_id in self._runtime.installation.scheduled}

