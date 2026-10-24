"""Per-thermostat switch, *Control*: on, Chauffage controls the thermostat; off, it is paused
(kept, not controlled). A plain entity on the thermostat's device, not a setting: pausing is an
everyday action (docs/decisions.md, "Entities"); pausing from the card is the same thing."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import ChauffageConfigEntry
from .const import CONTROL_KEY
from .entity import ThermostatEntity, async_follow_thermostats


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_follow_thermostats(hass, entry, async_add_entities,
                             lambda runtime, climate: [ControlSwitch(runtime, climate)])


class ControlSwitch(ThermostatEntity, SwitchEntity):
    key = CONTROL_KEY

    @property
    def is_on(self) -> bool:
        return not self.runtime.is_paused(self.climate)

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.runtime.set_paused(self.climate, False)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.runtime.set_paused(self.climate, True)
