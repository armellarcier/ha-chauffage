"""A device per scheduled thermostat (#57, docs/decisions.md "Chauffage panel and devices"): its
page lists its Chauffage entities and opens its weeks in the Chauffage panel ("Visit")."""

from unittest.mock import patch

from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.chauffage.const import CONTROL_KEY, OVERRIDE_KEY, PLANNED_PRESET_KEY, thermostat_unique_id
from conftest import WEEKDAY, Bench, every_day

WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": every_day(("00:00", "frost"))}}
ENTITIES = ("sensor.salon_planned_preset", "binary_sensor.salon_override", "switch.salon_control")


async def start(bench: Bench, weeks: dict = WEEKS) -> None:
    await bench.go_to("10:00")
    await bench.setup()
    await bench.save_weeks(weeks)


def entity_ids(bench: Bench, climate: str = "climate.salon") -> list[str]:
    """The ids of a thermostat's entities, found by their unique ids (an id depends on the language)."""
    registry = er.async_get(bench.hass)
    entry_id = bench.runtime.entry.entry_id
    return [registry.async_get_entity_id(platform, "chauffage", thermostat_unique_id(entry_id, climate, key))
            for key, platform in ((CONTROL_KEY, "switch"), (OVERRIDE_KEY, "binary_sensor"), (PLANNED_PRESET_KEY, "sensor"))]


def device_of(bench: Bench, entity_id: str | None = None) -> dr.DeviceEntry:
    """The device of an entity, by default of the salon's Control switch."""
    entity_id = entity_id or entity_ids(bench)[0]
    entry = er.async_get(bench.hass).async_get(entity_id) if entity_id else None
    assert entry is not None and entry.device_id is not None, (entity_id, entity_ids(bench))
    return dr.async_get(bench.hass).async_get(entry.device_id)


def the_thermostat_s_own_device(bench: Bench, area: str | None = None) -> dr.DeviceEntry:
    """climate.salon on a device of another integration (a valve), in an area if given."""
    other = MockConfigEntry(domain="test")
    other.add_to_hass(bench.hass)
    area_id = ar.async_get(bench.hass).async_create(area).id if area else None
    device = dr.async_get(bench.hass).async_get_or_create(
        config_entry_id=other.entry_id, identifiers={("test", "valve")}, name="Vanne salon")
    if area_id:
        device = dr.async_get(bench.hass).async_update_device(device.id, area_id=area_id)
    er.async_get(bench.hass).async_get_or_create("climate", "test", "valve", suggested_object_id="salon",
                                                 device_id=device.id)
    return device


async def test_each_scheduled_thermostat_has_a_device_holding_its_entities(bench: Bench):
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await start(bench)
    device = device_of(bench)
    assert device.name == "Salon"
    assert device.manufacturer == "ha-chauffage"
    assert device.model == "Scheduled thermostat"
    for entity_id in entity_ids(bench):
        assert device_of(bench, entity_id).id == device.id


async def test_the_device_s_visit_link_opens_the_thermostat_s_weeks_in_the_panel(bench: Bench):
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await start(bench)
    assert device_of(bench).configuration_url == "homeassistant://chauffage/thermostats/climate.salon"


async def test_the_device_s_model_follows_home_assistant_s_language(bench: Bench):
    bench.hass.config.language = "fr"
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await start(bench)
    assert device_of(bench).model == "Thermostat programmé"


async def test_a_thermostat_with_a_device_of_its_own_gets_a_device_connected_via_it(bench: Bench):
    """The thermostat's device page lists ours under "Connected devices"; ours says "Connected via"
    the thermostat. Our entities move to our device; their ids do not change."""
    own = the_thermostat_s_own_device(bench, area="Séjour")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await start(bench)
    device = device_of(bench)
    assert device.id != own.id
    assert device.via_device_id == own.id
    assert device.area_id == own.area_id  # the thermostat's area
    for entity_id in entity_ids(bench):
        assert device_of(bench, entity_id).id == device.id


async def test_before_home_assistant_2026_10_the_device_is_connected_by_the_thermostat_s_identifiers(bench: Bench):
    """`via_device_id` came with HA 2026.10; before it, `via_device` names the parent by an
    identifier (deprecated from 2026.10, it stops working in 2027.8)."""
    own = the_thermostat_s_own_device(bench)
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    with patch("custom_components.chauffage.entity.VIA_DEVICE_ID", False):
        await start(bench)
    assert device_of(bench).via_device_id == own.id


async def test_the_device_takes_the_thermostat_s_name_even_before_its_state_exists(bench: Bench):
    """At startup the thermostat's integration may not have set its state yet: the name comes
    from its registry entry, else from its device."""
    the_thermostat_s_own_device(bench)
    await start(bench)  # no state for climate.salon
    assert device_of(bench).name == "Vanne salon"


async def test_entities_keep_their_ids_on_the_scheduled_thermostat_s_device(bench: Bench):
    """A thermostat without a device of its own (a generic_thermostat in YAML) also gets one; its
    entities are named after the device, with the ids they always had."""
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await start(bench)
    for entity_id in ENTITIES:
        assert er.async_get(bench.hass).async_get(entity_id) is not None, entity_id
    assert bench.hass.states.get("switch.salon_control").name == "Salon Control"


async def test_a_renamed_thermostat_s_device_follows_it(bench: Bench):
    """The device's identifier holds the climate's id: renamed, the thermostat gets the device of
    its new id, and the device of its former id goes (no device left behind)."""
    er.async_get(bench.hass).async_get_or_create("climate", "test", "salon", suggested_object_id="salon")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await start(bench)
    former = device_of(bench)
    er.async_get(bench.hass).async_update_entity("climate.salon", new_entity_id="climate.sejour")
    bench.hass.states.async_remove("climate.salon")
    bench.thermostat("climate.sejour", "eco", friendly_name="Séjour")
    await bench.hass.async_block_till_done()
    devices = dr.async_get(bench.hass)
    assert devices.async_get(former.id) is None
    ours = [d for d in dr.async_entries_for_config_entry(devices, bench.entry.entry_id) if d.model == "Scheduled thermostat"]
    assert [d.configuration_url for d in ours] == ["homeassistant://chauffage/thermostats/climate.sejour"]


async def test_a_forgotten_thermostat_s_device_goes_with_its_entities(bench: Bench):
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await start(bench)
    device = device_of(bench)
    await bench.runtime.forget("climate.salon")
    await bench.hass.async_block_till_done()
    assert dr.async_get(bench.hass).async_get(device.id) is None
    assert er.async_get(bench.hass).async_get("switch.salon_control") is None
