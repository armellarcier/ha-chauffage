"""Base entities: follow the runtime's changes; per-thermostat ones are attached to the
thermostat's device and created and removed with the scheduled thermostats."""

from __future__ import annotations

from collections.abc import Callable

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import MAJOR_VERSION, MINOR_VERSION
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, TITLE
from .runtime import DATA, ChauffageRuntime

# From Home Assistant 2025.8, an entity is attached to the device given in its device_entry
DEVICE_ENTRY_ATTACHES = (MAJOR_VERSION, MINOR_VERSION) >= (2025, 8)


def service_device(runtime: ChauffageRuntime) -> DeviceInfo:
    """The "Chauffage" service device holding the integration's global entities."""
    return DeviceInfo(
        identifiers={(DOMAIN, runtime.entry.entry_id)},
        name=TITLE,
        entry_type=DeviceEntryType.SERVICE,
        manufacturer="ha-chauffage",
    )


def thermostat_device(hass: HomeAssistant, entity_id: str) -> dr.DeviceEntry | None:
    """The thermostat's device, if any (as HA's async_entity_id_to_device, which older Home
    Assistant versions do not have)."""
    entry = er.async_get(hass).async_get(entity_id)
    if entry is None or entry.device_id is None:
        return None
    return dr.async_get(hass).async_get(entry.device_id)


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


class ThermostatEntity(ChauffageEntity):
    """An entity of one scheduled thermostat, on its device (else named after it)."""

    key: str

    def __init__(self, runtime: ChauffageRuntime, climate: str) -> None:
        super().__init__(runtime)
        self.climate = climate
        self._attr_unique_id = f"{runtime.entry.entry_id}_{climate}_{self.key}"
        self.device_entry = thermostat_device(runtime.hass, climate)
        if self.device_entry is None:
            # No device to attach to: the thermostat's name goes in the entity name
            state = runtime.hass.states.get(climate)
            name = state.name if state else climate
            self._attr_translation_key = f"{self.key}_of"
            self._attr_translation_placeholders = {"thermostat": name}
        else:
            self._attr_translation_key = self.key
            if not DEVICE_ENTRY_ATTACHES:
                # Older Home Assistant: attached through the device's identifiers
                self._attr_device_info = DeviceInfo(
                    identifiers=self.device_entry.identifiers, connections=self.device_entry.connections
                )


@callback
def async_follow_thermostats(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback,
    make: Callable[[ChauffageRuntime, str], list[ThermostatEntity]],
) -> None:
    """Entities made by `make` for each scheduled thermostat, removed when it is forgotten: no
    list of thermostats to maintain."""
    runtime: ChauffageRuntime = entry.runtime_data
    known: dict[str, list[ThermostatEntity]] = {}

    @callback
    def sync(reason: str = DATA) -> None:
        if reason != DATA:
            return
        scheduled = set(runtime.scheduled)
        new = []
        for climate in sorted(scheduled - set(known)):
            known[climate] = make(runtime, climate)
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
