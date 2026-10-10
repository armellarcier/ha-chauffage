"""Select entity: the active heating mode (replaces the package's input_select.mode_chauffage)."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import ChauffageConfigEntry
from .entity import ChauffageEntity, service_device


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([ModeSelect(entry.runtime_data)])


class ModeSelect(ChauffageEntity, SelectEntity):
    _attr_translation_key = "mode"

    def __init__(self, runtime) -> None:
        super().__init__(runtime)
        self._attr_unique_id = f"{runtime.entry.entry_id}_mode"
        self._attr_device_info = service_device(runtime)

    @property
    def options(self) -> list[str]:
        return [m["name"] for m in self.runtime.data["modes"]]

    @property
    def current_option(self) -> str | None:
        return self.runtime.mode_name(self.runtime.data["active_mode"])

    async def async_select_option(self, option: str) -> None:
        mode_id = next(m["id"] for m in self.runtime.data["modes"] if m["name"] == option)
        await self.runtime.set_mode(mode_id)
