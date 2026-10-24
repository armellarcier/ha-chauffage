"""Per-thermostat sensors (unavailable while it is paused), attached to the thermostat's device.

- planned preset (enabled by default): the preset planned now; attributes: the next preset and
  its start time, the temperature of each preset on this thermostat;
- override end (disabled by default: the override binary sensor carries the end): when the
  current override ends (unknown without override).

Created and removed with the scheduled thermostats (entity.async_follow_thermostats).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import ChauffageConfigEntry, engine
from .const import OVERRIDE_END_KEY, PLANNED_PRESET_KEY
from .entity import ThermostatSensorEntity, async_follow_thermostats


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_follow_thermostats(
        hass, entry, async_add_entities,
        lambda runtime, climate: [PlannedPresetSensor(runtime, climate), OverrideEndSensor(runtime, climate)],
    )


class PlannedPresetSensor(ThermostatSensorEntity, SensorEntity):
    key = PLANNED_PRESET_KEY
    name_key = "planned_preset"
    update_on_tick = True
    _attr_device_class = SensorDeviceClass.ENUM

    @property
    def options(self) -> list[str]:
        return [preset["id"] for preset in self.runtime.data["presets"]]

    def _name(self, preset_id: str | None) -> str | None:
        return next((p["name"] for p in self.runtime.data["presets"] if p["id"] == preset_id), None)

    @property
    def native_value(self) -> str | None:
        current, _, _ = self.runtime.planned(self.climate)
        return current if current in self.options else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        current, next_preset, next_start = self.runtime.planned(self.climate)
        return {
            "preset_name": self._name(current),
            "target": self.runtime.targets_of(self.climate).get(current) if current else None,
            "next_preset": next_preset,
            "next_preset_name": self._name(next_preset),
            "next_start": next_start.isoformat() if next_start else None,
            "temperatures": self.runtime.preset_temperatures_of(self.climate),
        }


class OverrideEndSensor(ThermostatSensorEntity, SensorEntity):
    key = OVERRIDE_END_KEY
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_entity_registry_enabled_default = False

    @property
    def native_value(self) -> datetime | None:
        end = self.runtime.override_info(self.climate)["end"]
        return engine.parse_datetime(end) if end else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        info = self.runtime.override_info(self.climate)
        return {key: info[key] for key in ("kind", "value", "preset")}
