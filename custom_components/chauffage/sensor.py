"""Per-thermostat sensors (unavailable while it is paused), attached to the thermostat's device.

- planned preset (enabled by default): the preset planned now; attributes: the next preset and
  its start time, the temperature of each preset on this thermostat;
- override end (disabled by default: the override binary sensor carries the end): when the
  current override ends (unknown without override);
- next change (enabled by default, for preheating tools, #82): when Chauffage next changes the
  thermostat, and to what (unknown when no slot changes it).

Created and removed with the scheduled thermostats (entity.async_follow_thermostats).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import ChauffageConfigEntry, engine
from .const import NEXT_CHANGE_KEY, OVERRIDE_END_KEY, PLANNED_PRESET_KEY
from .entity import ThermostatSensorEntity, async_follow_thermostats


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_follow_thermostats(
        hass, entry, async_add_entities,
        lambda runtime, climate: [PlannedPresetSensor(runtime, climate), OverrideEndSensor(runtime, climate),
                                  NextChangeSensor(runtime, climate)],
    )


class PlannedPresetSensor(ThermostatSensorEntity, SensorEntity):
    """Deprecated for *Next change* (#125, docs/decisions.md, "Entities"). Still enabled by
    default, as Hestia Confort reads it: a repair warns while one is enabled."""
    key = PLANNED_PRESET_KEY
    name_key = "planned_preset"
    update_on_tick = True
    _attr_device_class = SensorDeviceClass.ENUM

    @property
    def options(self) -> list[str]:
        return [preset["id"] for preset in self.runtime.installation.presets]

    def _name(self, preset_id: str | None) -> str | None:
        return next((p["name"] for p in self.runtime.installation.presets if p["id"] == preset_id), None)

    @property
    def native_value(self) -> str | None:
        current, _, _ = self.runtime.planned(self.climate)
        return current.preset if current and current.preset in self.options else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        planned = self.runtime.planned_targets(self.climate)
        return {
            "preset_name": self._name(planned["preset"]),
            # The HVAC mode the slot chooses, as it runs on the thermostat (#91): none on a heater
            "hvac_mode": planned["hvac_mode"],
            "target": planned["target"],
            "next_preset": planned["next_preset"],
            "next_preset_name": self._name(planned["next_preset"]),
            "next_hvac_mode": planned["next_hvac_mode"],
            "next_start": planned["next_start"],
            # What each preset gives in the slot's HVAC mode: the cooling values while it cools
            "temperatures": self.runtime.preset_temperatures_of(self.climate, planned["hvac_mode"] == "cool"),
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
        return {key: info[key] for key in ("target", "preset")}


class NextChangeSensor(ThermostatSensorEntity, SensorEntity):
    """For preheating tools (#82, docs/preheating.md): its format is stable. Its attributes are
    named like a climate entity's."""

    key = NEXT_CHANGE_KEY
    update_on_tick = True
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    @property
    def native_value(self) -> datetime | None:
        return self.runtime.next_change_info(self.climate)["start"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        info = self.runtime.next_change_info(self.climate)
        name = next((p["name"] for p in self.runtime.installation.presets if p["id"] == info["preset"]), None)
        # Named like a climate entity's attributes, to apply with the climate services as they are
        return {"preset": info["preset"], "preset_name": name,
                **{key: value for key, value in info.items() if key not in ("start", "preset")}}
