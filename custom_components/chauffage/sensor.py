"""Per-thermostat sensors (disabled by default), attached to the thermostat's device.

- schedule: preset planned now; attributes: next preset and its start time;
- override end: when the current override ends (empty without override).

Created and removed with the schedules: no list of thermostats to maintain.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device import async_entity_id_to_device
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import ChauffageConfigEntry, engine
from .entity import ChauffageEntity
from .runtime import DATA, ChauffageRuntime


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    known: dict[str, list[ThermostatSensor]] = {}

    @callback
    def sync(reason: str = DATA) -> None:
        if reason != DATA:
            return
        scheduled = set(runtime.data["schedules"])
        new = []
        for climate in sorted(scheduled - set(known)):
            known[climate] = [ScheduleSensor(runtime, climate), OverrideEndSensor(runtime, climate)]
            new += known[climate]
        if new:
            async_add_entities(new)
        registry = er.async_get(hass)
        for climate in set(known) - scheduled:
            for entity in known.pop(climate):
                if entity.entity_id and registry.async_get(entity.entity_id):
                    registry.async_remove(entity.entity_id)

    sync()
    entry.async_on_unload(runtime.async_add_listener(sync))


class ThermostatSensor(ChauffageEntity, SensorEntity):
    _attr_entity_registry_enabled_default = False
    key: str

    def __init__(self, runtime: ChauffageRuntime, climate: str) -> None:
        super().__init__(runtime)
        self.climate = climate
        self._attr_unique_id = f"{runtime.entry.entry_id}_{climate}_{self.key}"
        self.device_entry = async_entity_id_to_device(runtime.hass, climate)
        if self.device_entry is None:
            # No device to attach to: the thermostat's name goes in the entity name
            state = runtime.hass.states.get(climate)
            name = state.name if state else climate
            self._attr_translation_key = f"{self.key}_of"
            self._attr_translation_placeholders = {"thermostat": name}
        else:
            self._attr_translation_key = self.key


class ScheduleSensor(ThermostatSensor):
    key = "schedule"
    update_on_tick = True
    _attr_device_class = SensorDeviceClass.ENUM

    @property
    def options(self) -> list[str]:
        return [level["id"] for level in self.runtime.data["levels"]]

    def _name(self, level_id: str | None) -> str | None:
        return next((lv["name"] for lv in self.runtime.data["levels"] if lv["id"] == level_id), None)

    @property
    def native_value(self) -> str | None:
        current, _, _ = self.runtime.planned(self.climate)
        return current if current in self.options else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        current, next_level, next_start = self.runtime.planned(self.climate)
        return {
            "level_name": self._name(current),
            "target": self.runtime.targets_of(self.climate).get(current) if current else None,
            "next_level": next_level,
            "next_level_name": self._name(next_level),
            "next_start": next_start.isoformat() if next_start else None,
        }


class OverrideEndSensor(ThermostatSensor):
    key = "override_end"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    @property
    def _override(self) -> dict[str, Any] | None:
        return self.runtime.data["overrides"].get(self.climate)

    @property
    def native_value(self) -> datetime | None:
        override = self._override
        return engine.parse_datetime(override["end"]) if override else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        override = self._override or {}
        return {"kind": override.get("kind"), "value": override.get("value")}
