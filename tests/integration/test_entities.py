"""Entities: active-schedule select, per-thermostat sensors and Scheduling switch."""

import pytest
from homeassistant.const import EntityCategory
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import WEEKDAY, Bench, every_day

WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": every_day(("00:00", "frost"))}}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.setup()
    await bench.save_weeks(WEEKS)


async def test_the_active_schedule_select_lists_the_schedules_and_shows_the_active_one(bench: Bench):
    await start(bench)
    state = bench.hass.states.get("select.chauffage_schedule")
    assert state.attributes["options"] == ["Normal", "Away", "Holiday"]
    assert state.state == "Normal"
    await bench.activate_schedule("Away")
    assert bench.hass.states.get("select.chauffage_schedule").state == "Away"
    assert bench.runtime.data["active_schedule"] == "away"


async def test_the_select_of_an_older_version_becomes_select_chauffage_schedule(bench: Bench):
    """Before v0.4 it was select.chauffage_mode: automations must use the new id."""
    entry = MockConfigEntry(domain="chauffage", title="Chauffage")
    entry.add_to_hass(bench.hass)
    registry = er.async_get(bench.hass)
    registry.async_get_or_create("select", "chauffage", f"{entry.entry_id}_mode",
                                 suggested_object_id="chauffage_mode", config_entry=entry)
    await bench.setup(entry=entry)
    assert registry.async_get("select.chauffage_mode") is None
    renamed = registry.async_get("select.chauffage_schedule")
    assert renamed.unique_id == f"{entry.entry_id}_schedule"
    assert bench.hass.states.get("select.chauffage_schedule").state == "Normal"


async def test_an_entity_id_chosen_by_the_user_is_kept(bench: Bench):
    entry = MockConfigEntry(domain="chauffage", title="Chauffage")
    entry.add_to_hass(bench.hass)
    registry = er.async_get(bench.hass)
    registry.async_get_or_create("select", "chauffage", f"{entry.entry_id}_mode",
                                 suggested_object_id="heating", config_entry=entry)
    await bench.setup(entry=entry)
    assert bench.hass.states.get("select.heating").state == "Normal"
    assert bench.hass.states.get("select.chauffage_schedule") is None


async def test_thermostat_sensors_are_disabled_by_default(bench: Bench):
    await start(bench)
    registry = er.async_get(bench.hass)
    entry = registry.async_get("sensor.salon_schedule")
    assert entry is not None and entry.disabled_by is er.RegistryEntryDisabler.INTEGRATION
    assert bench.hass.states.get("sensor.salon_schedule") is None


@pytest.mark.usefixtures("entity_registry_enabled_by_default")
async def test_the_schedule_sensor_shows_the_planned_preset_and_the_next_slot(bench: Bench):
    await start(bench)
    state = bench.hass.states.get("sensor.salon_schedule")
    assert state.state == "eco"
    assert state.attributes["next_preset"] == "comfort"
    assert state.attributes["next_start"].startswith("2026-10-12T17:30")
    await bench.go_to("17:30")
    assert bench.hass.states.get("sensor.salon_schedule").state == "comfort"
    await bench.activate_schedule("Away")
    assert bench.hass.states.get("sensor.salon_schedule").state == "frost"


@pytest.mark.usefixtures("entity_registry_enabled_by_default")
async def test_the_override_end_sensor(bench: Bench):
    await start(bench)
    assert bench.hass.states.get("sensor.salon_override_end").state == "unknown"
    await bench.manual_setpoint("climate.salon", 21.5)
    state = bench.hass.states.get("sensor.salon_override_end")
    assert state.state == "2026-10-12T10:00:00+00:00"  # 12:00 in Paris
    assert (state.attributes["kind"], state.attributes["value"]) == ("temperature", 21.5)


@pytest.mark.usefixtures("entity_registry_enabled_by_default")
async def test_entities_follow_the_scheduled_thermostats(bench: Bench):
    await start(bench)
    bench.thermostat("climate.bureau", "eco", friendly_name="Bureau")
    await bench.save_weeks({**WEEKS, "climate.bureau": {"normal": every_day(("00:00", "eco"))}})
    assert bench.hass.states.get("sensor.bureau_schedule").state == "eco"
    await bench.runtime.forget("climate.salon")
    await bench.hass.async_block_till_done()
    registry = er.async_get(bench.hass)
    assert registry.async_get("sensor.salon_schedule") is None
    assert registry.async_get("switch.salon_scheduling") is None
    assert registry.async_get("switch.bureau_scheduling") is not None


async def test_sensors_are_attached_to_the_thermostat_s_device(bench: Bench):
    other = MockConfigEntry(domain="test")
    other.add_to_hass(bench.hass)
    device = dr.async_get(bench.hass).async_get_or_create(
        config_entry_id=other.entry_id, identifiers={("test", "valve")}, name="Vanne salon"
    )
    er.async_get(bench.hass).async_get_or_create("climate", "test", "valve", suggested_object_id="salon",
                                                 device_id=device.id)
    await start(bench)
    entry = er.async_get(bench.hass).async_get("sensor.vanne_salon_schedule")
    assert entry is not None and entry.device_id == device.id


# ----- Scheduling switch (docs/decisions.md, "Scheduled thermostats") -----

async def test_each_scheduled_thermostat_has_a_scheduling_switch_on_its_settings(bench: Bench):
    await start(bench)
    entry = er.async_get(bench.hass).async_get("switch.salon_scheduling")
    assert entry is not None and entry.disabled_by is None
    assert entry.entity_category is EntityCategory.CONFIG
    assert bench.hass.states.get("switch.salon_scheduling").state == "on"


async def test_turning_the_scheduling_switch_off_pauses_the_thermostat(bench: Bench):
    await start(bench)
    await bench.hass.services.async_call("switch", "turn_off", {"entity_id": "switch.salon_scheduling"}, blocking=True)
    await bench.hass.async_block_till_done()
    assert bench.runtime.is_paused("climate.salon")
    assert bench.hass.states.get("switch.salon_scheduling").state == "off"
    await bench.hass.services.async_call("switch", "turn_on", {"entity_id": "switch.salon_scheduling"}, blocking=True)
    await bench.hass.async_block_till_done()
    assert not bench.runtime.is_paused("climate.salon")


async def test_the_scheduling_switch_shows_a_pause_made_from_the_card(bench: Bench):
    await start(bench)
    await bench.runtime.set_paused("climate.salon", True)
    await bench.hass.async_block_till_done()
    assert bench.hass.states.get("switch.salon_scheduling").state == "off"


@pytest.mark.usefixtures("entity_registry_enabled_by_default")
async def test_the_sensors_of_a_paused_thermostat_are_unavailable(bench: Bench):
    await start(bench)
    await bench.runtime.set_paused("climate.salon", True)
    await bench.hass.async_block_till_done()
    assert bench.hass.states.get("sensor.salon_schedule").state == "unavailable"
    assert bench.hass.states.get("sensor.salon_override_end").state == "unavailable"
    assert bench.hass.states.get("switch.salon_scheduling").state == "off"  # the switch stays usable
    await bench.runtime.set_paused("climate.salon", False)
    await bench.hass.async_block_till_done()
    assert bench.hass.states.get("sensor.salon_schedule").state == "eco"


async def test_the_scheduling_switch_is_attached_to_the_thermostat_s_device(bench: Bench):
    other = MockConfigEntry(domain="test")
    other.add_to_hass(bench.hass)
    device = dr.async_get(bench.hass).async_get_or_create(
        config_entry_id=other.entry_id, identifiers={("test", "valve")}, name="Vanne salon"
    )
    er.async_get(bench.hass).async_get_or_create("climate", "test", "valve", suggested_object_id="salon",
                                                 device_id=device.id)
    await start(bench)
    entry = er.async_get(bench.hass).async_get("switch.vanne_salon_scheduling")
    assert entry is not None and entry.device_id == device.id
