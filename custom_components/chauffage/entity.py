"""Base entities: follow the runtime's changes; per-thermostat ones are on the scheduled
thermostat's device, created and removed with the scheduled thermostats."""

from __future__ import annotations

from collections.abc import Callable, Iterable

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SCHEDULED_THERMOSTAT_MODEL, TITLE, thermostat_unique_id
from .runtime import DATA, ChauffageRuntime, device_by_identifier

# From Home Assistant 2026.10, a device names its parent by the parent's id (`via_device` by
# identifiers is deprecated, it stops working in 2027.8)
VIA_DEVICE_ID = "via_device_id" in DeviceInfo.__annotations__


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


def scheduled_thermostat_identifier(runtime: ChauffageRuntime, climate: str) -> tuple[str, str]:
    return DOMAIN, f"{runtime.entry.entry_id}_{climate}"


def scheduled_thermostat_device(runtime: ChauffageRuntime, climate: str) -> DeviceInfo:
    """The device of a scheduled thermostat: its page lists its Chauffage entities and opens its
    weeks (the panel's route), in the thermostat's area, linked to the thermostat's own device."""
    hass = runtime.hass
    state = hass.states.get(climate)
    thermostat = thermostat_device(hass, climate)
    entity = er.async_get(hass).async_get(climate)
    area_id = (entity and entity.area_id) or (thermostat and thermostat.area_id)
    area = ar.async_get(hass).async_get_area(area_id) if area_id else None
    # The thermostat's state may not be there yet at startup: its registry entry, or its device
    name = (state and state.name) or (entity and (entity.name or entity.original_name)) \
        or (thermostat and (thermostat.name_by_user or thermostat.name)) or climate
    language = (hass.config.language or "en").split("-")[0]
    info = DeviceInfo(
        identifiers={scheduled_thermostat_identifier(runtime, climate)},
        name=name,
        manufacturer="ha-chauffage",
        model=SCHEDULED_THERMOSTAT_MODEL.get(language, SCHEDULED_THERMOSTAT_MODEL["en"]),
        # The Chauffage panel's address of the thermostat (frontend.py)
        configuration_url=f"homeassistant://{DOMAIN}/thermostats/{climate}",
    )
    if area:
        info["suggested_area"] = area.name
    if thermostat and VIA_DEVICE_ID:
        info["via_device_id"] = thermostat.id
    elif thermostat and thermostat.identifiers:
        # Older Home Assistant: the parent device by one of its identifiers
        info["via_device"] = sorted(thermostat.identifiers)[0]
    return info


class ThermostatEntity(ChauffageEntity):
    """An entity of one scheduled thermostat, on the scheduled thermostat's device."""

    key: str  # in its unique id
    name_key: str | None = None  # its translation key, when not the key

    def __init__(self, runtime: ChauffageRuntime, climate: str) -> None:
        super().__init__(runtime)
        self.climate = climate
        self._attr_unique_id = thermostat_unique_id(runtime.entry.entry_id, climate, self.key)
        self._attr_translation_key = self.name_key or self.key
        self._attr_device_info = scheduled_thermostat_device(runtime, climate)


class ThermostatSensorEntity(ThermostatEntity):
    """What Chauffage plans or holds for a thermostat: meaningless, so unavailable, while it is
    paused (Home Assistant's convention)."""

    @property
    def available(self) -> bool:
        return not self.runtime.is_paused(self.climate)


@callback
def async_follow(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback,
    ids: Callable[[ChauffageRuntime], Iterable[str]], make: Callable[[ChauffageRuntime, str], list[Entity]],
    gone: Callable[[ChauffageRuntime, str], None] | None = None,
) -> None:
    """Entities made by `make` for each id `ids` gives (scheduled thermostats, schedules), removed
    when it goes: no list to maintain."""
    runtime: ChauffageRuntime = entry.runtime_data
    known: dict[str, list[Entity]] = {}

    @callback
    def sync(reason: str = DATA) -> None:
        if reason != DATA or runtime.reloading:
            return
        current = set(ids(runtime))
        new = []
        for key in sorted(current - set(known)):
            known[key] = make(runtime, key)
            new += known[key]
        if new:
            async_add_entities(new)
        registry = er.async_get(hass)
        for key in set(known) - current:
            for entity in known.pop(key):
                if entity.entity_id and registry.async_get(entity.entity_id):
                    registry.async_remove(entity.entity_id)
            if gone:
                gone(runtime, key)

    sync()
    entry.async_on_unload(runtime.async_add_listener(sync))


@callback
def async_follow_thermostats(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback,
    make: Callable[[ChauffageRuntime, str], list[ThermostatEntity]],
) -> None:
    """Entities made by `make` for each scheduled thermostat, removed when it is forgotten."""
    async_follow(hass, entry, async_add_entities, lambda runtime: runtime.scheduled, make, _remove_device)


@callback
def _remove_device(runtime: ChauffageRuntime, climate: str) -> None:
    """A forgotten thermostat: its device goes with its entities."""
    device = device_by_identifier(runtime.hass, runtime.entry, scheduled_thermostat_identifier(runtime, climate))
    if device:
        dr.async_get(runtime.hass).async_remove_device(device.id)
