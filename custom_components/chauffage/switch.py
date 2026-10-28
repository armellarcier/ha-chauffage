"""Switches: *Control* per scheduled thermostat (off: paused), and one per schedule, on for the
active one (docs/decisions.md, "Entities"). Both follow what they show (created and removed with
it) and change it as the card does."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import slugify

from . import ChauffageConfigEntry
from .const import CONTROL_KEY, DOMAIN, schedule_unique_id
from .entity import ChauffageEntity, ThermostatEntity, async_follow, async_follow_thermostats, service_device
from .runtime import ChauffageRuntime


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_follow_thermostats(hass, entry, async_add_entities,
                             lambda runtime, climate: [ControlSwitch(runtime, climate)])
    async_follow(hass, entry, async_add_entities, lambda runtime: runtime.schedule_ids,
                 lambda runtime, schedule_id: [ScheduleSwitch(runtime, schedule_id)])


class ControlSwitch(ThermostatEntity, SwitchEntity):
    key = CONTROL_KEY

    @property
    def is_on(self) -> bool:
        return not self.runtime.is_paused(self.climate)

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.runtime.set_paused(self.climate, False)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.runtime.set_paused(self.climate, True)


class ScheduleSwitch(ChauffageEntity, SwitchEntity):
    _attr_translation_key = "schedule"

    def __init__(self, runtime: ChauffageRuntime, schedule_id: str) -> None:
        super().__init__(runtime)
        self.schedule_id = schedule_id
        self._attr_unique_id = schedule_unique_id(runtime.entry.entry_id, schedule_id)
        # Same id whatever the language and the schedule's name (automations refer to it)
        self.entity_id = f"switch.{DOMAIN}_schedule_{slugify(schedule_id)}"
        self._attr_device_info = service_device(runtime)

    @property
    def translation_placeholders(self) -> dict[str, str]:
        """The schedule's name in Chauffage (a name given in Home Assistant wins)."""
        return {"schedule": self.runtime.schedule_name(self.schedule_id) or self.schedule_id}

    def _runtime_changed(self, reason: str) -> None:
        # The schedule may have been renamed: HA caches the name, cleared as its own setters do
        self.__dict__.pop("name", None)
        super()._runtime_changed(reason)

    @property
    def is_on(self) -> bool:
        return self.runtime.data["active_schedule"] == self.schedule_id

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.runtime.activate_schedule(self.schedule_id, source="entity", context=self._context)

    async def async_turn_off(self, **kwargs: Any) -> None:
        if self.is_on:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="active_schedule_off",
                translation_placeholders=self.translation_placeholders,
            )
