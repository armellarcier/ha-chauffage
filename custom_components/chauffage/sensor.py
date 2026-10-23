"""Per-thermostat sensors (disabled by default, unavailable while it is paused), attached to the
thermostat's device.

- schedule: preset planned now; attributes: next preset and its start time;
- override end: when the current override ends (empty without override).

Created and removed with the scheduled thermostats (entity.async_follow_thermostats).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import ChauffageConfigEntry, engine
from .const import OVERRIDE_END_KEY, SCHEDULE_KEY
from .entity import ThermostatEntity, async_follow_thermostats


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_follow_thermostats(
        hass, entry, async_add_entities,
        lambda runtime, climate: [ScheduleSensor(runtime, climate), OverrideEndSensor(runtime, climate)],
    )


class ThermostatSensor(ThermostatEntity, SensorEntity):
    _attr_entity_registry_enabled_default = False

    @property
    def available(self) -> bool:
        """Nothing is planned for a paused thermostat."""
        return not self.runtime.is_paused(self.climate)


class ScheduleSensor(ThermostatSensor):
    key = SCHEDULE_KEY
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
        }


class OverrideEndSensor(ThermostatSensor):
    key = OVERRIDE_END_KEY
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
