"""Chauffage: weekly heating schedules for Home Assistant thermostats.

The config entry owns the stored data (.storage/chauffage) and the scheduler (runtime.py);
the select entity changes the active mode, sensors show each thermostat's schedule and
override; the card talks to the integration through the websocket API (websocket.py) and is
served by the integration (frontend.py).
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.helpers.typing import ConfigType

from . import frontend, importer, model, services, websocket
from .const import DEFAULT_MODES, DOMAIN
from .runtime import ChauffageRuntime
from .store import ChauffageStore

PLATFORMS = [Platform.SELECT, Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type ChauffageConfigEntry = ConfigEntry[ChauffageRuntime]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    services.async_register(hass)
    websocket.async_register(hass)
    await frontend.async_register(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ChauffageConfigEntry) -> bool:
    store = ChauffageStore(hass)
    data = await store.async_load()
    first_setup = data is None
    if first_setup:
        if importer.package_installed(hass):
            data = importer.from_package(hass)
        else:
            language = (hass.config.language or "en").split("-")[0]
            data = model.default_data(DEFAULT_MODES.get(language, DEFAULT_MODES["en"]))
        await store.async_save(data)
        if importer.package_installed(hass):
            # Two schedulers must never drive the valves: the package's automations stop here
            await importer.async_turn_off_package(hass)

    runtime = ChauffageRuntime(hass, entry, store, data)
    entry.runtime_data = runtime
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await runtime.async_start()

    mode_entity = er.async_get(hass).async_get_entity_id("select", DOMAIN, f"{entry.entry_id}_mode")
    importer.async_update_package_issue(hass, mode_entity)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ChauffageConfigEntry) -> bool:
    runtime = entry.runtime_data
    runtime.async_stop()
    await runtime.store.async_save(runtime.data)  # pending delayed save
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Deleting the integration deletes its data."""
    await ChauffageStore(hass).async_remove()
