"""Per-thermostat binary sensor, *Override*: on while the thermostat has an override; its
attributes say what (kind, value, the preset it was set to) and until when. Unavailable while
the thermostat is paused. Created and removed with the scheduled thermostats."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import ChauffageConfigEntry
from .const import OVERRIDE_KEY
from .entity import ThermostatSensorEntity, async_follow_thermostats


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_follow_thermostats(hass, entry, async_add_entities,
                             lambda runtime, climate: [OverrideSensor(runtime, climate)])


class OverrideSensor(ThermostatSensorEntity, BinarySensorEntity):
    key = OVERRIDE_KEY

    @property
    def is_on(self) -> bool:
        return self.climate in self.runtime.data["overrides"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self.runtime.override_info(self.climate)
