"""Upgrading from 0.7 to 0.8 (#57): no stored data changes; the entities of a scheduled thermostat
move from the thermostat's device to a device of Chauffage, with the ids, names and settings the
user gave them. The registries of a 0.7 installation are rebuilt as 0.7 left them, then the
integration is reloaded with the code of 0.8."""

import copy

from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import WEEKDAY, Bench, every_day

DOMAIN = "chauffage"
WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7}, "climate.cuisine": {"normal": every_day(("00:00", "eco"))}}
# The ids 0.7 gave: the salon's entities named after its device (a valve), the cuisine's after it
SALON = ("switch.vanne_salon_control", "binary_sensor.vanne_salon_override", "sensor.vanne_salon_planned_preset")
CUISINE = ("switch.cuisine_control", "binary_sensor.cuisine_override", "sensor.cuisine_planned_preset")


def valve(bench: Bench) -> dr.DeviceEntry:
    """climate.salon on the device of its valve, from another integration."""
    other = MockConfigEntry(domain="test")
    other.add_to_hass(bench.hass)
    device = dr.async_get(bench.hass).async_get_or_create(
        config_entry_id=other.entry_id, identifiers={("test", "valve")}, name="Vanne salon")
    er.async_get(bench.hass).async_get_or_create("climate", "test", "valve", suggested_object_id="salon",
                                                 device_id=device.id)
    return device


async def as_0_7_left_it(bench: Bench, own: dr.DeviceEntry, on_device_info: bool) -> dict:
    """The registries of a 0.7 installation: the salon's entities on its valve, with 0.7's ids,
    no device of Chauffage per thermostat. Before HA 2025.8, 0.7 attached them through the valve's
    identifiers (`on_device_info`), so HA added Chauffage to the valve's integrations. Returns the
    stored data, as it was."""
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    bench.thermostat("climate.cuisine", "eco", friendly_name="Cuisine")
    await bench.setup()
    await bench.save_weeks(WEEKS)
    # Home Assistant stopped: the registries are what 0.7 left, then 0.8 starts
    assert await bench.hass.config_entries.async_unload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    entities, devices = er.async_get(bench.hass), dr.async_get(bench.hass)
    entry_id = bench.entry.entry_id
    for climate, ids in (("climate.salon", SALON), ("climate.cuisine", CUISINE)):
        for entity_id, key in zip(ids, ("control", "override", "schedule")):
            current = entities.async_get_entity_id(entity_id.split(".")[0], DOMAIN, f"{entry_id}_{climate}_{key}")
            entities.async_update_entity(current, new_entity_id=entity_id,
                                         device_id=own.id if climate == "climate.salon" else None)
    for device in dr.async_entries_for_config_entry(devices, entry_id):
        if any(i[1].startswith(f"{entry_id}_climate.") for i in device.identifiers):
            devices.async_remove_device(device.id)
    if on_device_info:
        try:
            # Before HA 2026.8: Chauffage among the integrations of the valve's device
            devices.async_update_device(own.id, add_config_entry_id=entry_id)
        except RuntimeError:
            # From HA 2026.8 a device has one integration: HA split that one, leaving a device of
            # Chauffage with the valve's identifiers
            devices.async_get_or_create(config_entry_id=entry_id, identifiers={("test", "valve")}, name="Vanne salon")
    # What the user set in 0.7: a name, a disabled entity
    entities.async_update_entity("switch.vanne_salon_control", name="Chauffage du salon")
    entities.async_update_entity("binary_sensor.cuisine_override", disabled_by=er.RegistryEntryDisabler.USER)
    await bench.hass.async_block_till_done()
    return copy.deepcopy(bench.storage[DOMAIN]["data"])


async def upgrade(bench: Bench) -> None:
    """Started with 0.8."""
    assert await bench.hass.config_entries.async_setup(bench.entry.entry_id)
    await bench.hass.async_block_till_done()


async def test_the_stored_data_does_not_change(bench: Bench):
    stored = await as_0_7_left_it(bench, valve(bench), on_device_info=False)
    await upgrade(bench)
    assert bench.storage[DOMAIN]["data"] == stored
    assert bench.runtime.thermostats.keys() == {"climate.salon", "climate.cuisine"}


async def test_the_entities_keep_their_ids_names_and_settings_on_the_new_device(bench: Bench):
    own = valve(bench)
    await as_0_7_left_it(bench, own, on_device_info=False)
    await upgrade(bench)
    entities, devices = er.async_get(bench.hass), dr.async_get(bench.hass)
    for entity_id in SALON + CUISINE:
        assert entities.async_get(entity_id) is not None, entity_id
    salon = devices.async_get(entities.async_get("switch.vanne_salon_control").device_id)
    assert salon.model == "Scheduled thermostat" and salon.via_device_id == own.id
    for entity_id in SALON:
        assert entities.async_get(entity_id).device_id == salon.id
    cuisine = devices.async_get(entities.async_get("switch.cuisine_control").device_id)
    assert cuisine.name == "Cuisine"
    assert entities.async_get("switch.vanne_salon_control").name == "Chauffage du salon"
    assert entities.async_get("binary_sensor.cuisine_override").disabled_by is er.RegistryEntryDisabler.USER
    assert bench.hass.states.get("switch.vanne_salon_control").state == "on"


async def test_chauffage_leaves_the_integrations_of_the_thermostat_s_device(bench: Bench):
    """Before HA 2025.8, 0.7 attached its entities through the thermostat's device: HA listed
    Chauffage among the device's integrations. 0.8 no longer puts anything on it."""
    own = valve(bench)
    await as_0_7_left_it(bench, own, on_device_info=True)
    await upgrade(bench)
    devices = dr.async_get(bench.hass)
    device = devices.async_get(own.id)
    assert device is not None, "the thermostat's own device stays"
    try:
        owners = {device.config_entry_id}  # from HA 2026.8, a device has one integration
    except AttributeError:
        owners = device.config_entries
    assert bench.entry.entry_id not in owners
    # No device of Chauffage carries the valve's identifiers any more (HA 2026.8's split)
    assert [d.name for d in dr.async_entries_for_config_entry(devices, bench.entry.entry_id)
            if ("test", "valve") in d.identifiers] == []
    assert [e.entity_id for e in er.async_entries_for_device(er.async_get(bench.hass), own.id)] == ["climate.salon"]
