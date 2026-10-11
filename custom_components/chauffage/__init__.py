"""Chauffage: weekly heating schedules for Home Assistant thermostats.

The config entry owns the stored data (.storage/chauffage) and the scheduler (runtime.py);
the select entity changes the active schedule, sensors show each thermostat's schedule and
override; the card talks to the integration through the websocket API (websocket.py) and is
served by the integration (frontend.py).
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import CoreState, HomeAssistant
from homeassistant.exceptions import ConfigEntryError, ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.helpers.typing import ConfigType

from . import frontend, importer, model, services, websocket
from .const import DEFAULT_SCHEDULES, DOMAIN, SCHEDULE_ENTITY
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
    if data is None:
        if hass.state is not CoreState.running:
            # First setup during startup: the package's restored states and its automations
            # may not be there yet, so the import decision waits (retried automatically)
            raise ConfigEntryNotReady("waiting for Home Assistant to finish starting")
        if importer.package_installed(hass):
            try:
                data = importer.from_package(hass)
            except importer.PackageTooNew as err:
                raise ConfigEntryError("the package data is newer than this integration") from err
        else:
            language = (hass.config.language or "en").split("-")[0]
            data = model.default_data(DEFAULT_SCHEDULES.get(language, DEFAULT_SCHEDULES["en"]), language)
        await store.async_save(data)
        if importer.package_installed(hass):
            # Two schedulers must never drive the valves: the package's automations stop here
            await importer.async_turn_off_package(hass)

    _rename_schedule_entity(hass, entry)
    runtime = ChauffageRuntime(hass, entry, store, data)
    entry.runtime_data = runtime
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await runtime.async_start()

    schedule_entity = er.async_get(hass).async_get_entity_id("select", DOMAIN, f"{entry.entry_id}_schedule")
    importer.async_update_package_issue(hass, schedule_entity)
    return True


def _rename_schedule_entity(hass: HomeAssistant, entry: ChauffageConfigEntry) -> None:
    """Before v0.4, the active-schedule select was select.chauffage_mode ("modes"): it becomes
    select.chauffage_schedule (an entity id chosen by the user is kept)."""
    registry = er.async_get(hass)
    old = registry.async_get_entity_id("select", DOMAIN, f"{entry.entry_id}_mode")
    if old is None:
        return
    changes: dict = {"new_unique_id": f"{entry.entry_id}_schedule"}
    if old == "select.chauffage_mode" and registry.async_get(SCHEDULE_ENTITY) is None:
        changes["new_entity_id"] = SCHEDULE_ENTITY
    registry.async_update_entity(old, **changes)


async def async_unload_entry(hass: HomeAssistant, entry: ChauffageConfigEntry) -> bool:
    runtime = entry.runtime_data
    runtime.async_stop()
    await runtime.store.async_save(runtime.data)  # pending delayed save
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Deleting the integration deletes its data."""
    await ChauffageStore(hass).async_remove()
