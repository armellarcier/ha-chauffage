"""Base entity: follows the runtime's changes."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DOMAIN, TITLE
from .runtime import DATA, ChauffageRuntime


def service_device(runtime: ChauffageRuntime) -> DeviceInfo:
    """The "Chauffage" service device holding the integration's global entities."""
    return DeviceInfo(
        identifiers={(DOMAIN, runtime.entry.entry_id)},
        name=TITLE,
        entry_type=DeviceEntryType.SERVICE,
        manufacturer="ha-chauffage",
    )


class ChauffageEntity(Entity):
    _attr_has_entity_name = True
    _attr_should_poll = False
    update_on_tick = False  # also refreshed every minute

    def __init__(self, runtime: ChauffageRuntime) -> None:
        self.runtime = runtime

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.runtime.async_add_listener(self._runtime_changed))

    def _runtime_changed(self, reason: str) -> None:
        if reason == DATA or self.update_on_tick:
            self.async_write_ha_state()
