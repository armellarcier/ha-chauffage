"""Select entity: the active schedule. Its options are the schedules' names; the `schedule_id`
attribute gives the active schedule's stable id, for automations (with the
chauffage.activate_schedule service)."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import ChauffageConfigEntry
from .const import SCHEDULE_ENTITY
from .entity import ChauffageEntity, service_device


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([ActiveScheduleSelect(entry.runtime_data)])


class ActiveScheduleSelect(ChauffageEntity, SelectEntity):
    _attr_translation_key = "active_schedule"

    def __init__(self, runtime) -> None:
        super().__init__(runtime)
        self._attr_unique_id = f"{runtime.entry.entry_id}_schedule"
        # Same id whatever the system language (automations and docs refer to it)
        self.entity_id = SCHEDULE_ENTITY
        self._attr_device_info = service_device(runtime)

    @property
    def options(self) -> list[str]:
        return [s["name"] for s in self.runtime.data["schedules"]]

    @property
    def current_option(self) -> str | None:
        return self.runtime.schedule_name(self.runtime.data["active_schedule"])

    @property
    def extra_state_attributes(self) -> dict[str, str]:
        return {"schedule_id": self.runtime.data["active_schedule"]}

    async def async_select_option(self, option: str) -> None:
        schedule_id = next(s["id"] for s in self.runtime.data["schedules"] if s["name"] == option)
        await self.runtime.activate_schedule(schedule_id)
