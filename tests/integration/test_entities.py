"""Entities: heating mode select, per-thermostat sensors."""

import pytest
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import WEEKDAY, Bench, every_day

SCHEDULES = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": every_day(("00:00", "frost"))}}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.setup()
    await bench.save_schedules(SCHEDULES)


async def test_the_mode_select_lists_the_modes_and_shows_the_active_one(bench: Bench):
    await start(bench)
    state = bench.hass.states.get("select.chauffage_mode")
    assert state.attributes["options"] == ["Normal", "Away", "Holiday"]
    assert state.state == "Normal"
    await bench.set_mode("Away")
    assert bench.hass.states.get("select.chauffage_mode").state == "Away"
    assert bench.runtime.data["active_mode"] == "away"


async def test_default_mode_names_follow_the_language(bench: Bench):
    await bench.hass.config.async_update(language="fr")
    await bench.setup()
    assert [m["name"] for m in bench.runtime.data["modes"]] == ["Normal", "Absent", "Vacances"]
    # The mode entity keeps a language-neutral id
    assert bench.hass.states.get("select.chauffage_mode").attributes["options"][1] == "Absent"


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
    await bench.set_mode("Away")
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
async def test_sensors_follow_the_thermostats_in_the_schedules(bench: Bench):
    await start(bench)
    bench.thermostat("climate.bureau", "eco", friendly_name="Bureau")
    await bench.save_schedules({**SCHEDULES, "climate.bureau": {"normal": every_day(("00:00", "eco"))}})
    assert bench.hass.states.get("sensor.bureau_schedule").state == "eco"
    await bench.save_schedules({"climate.bureau": {"normal": every_day(("00:00", "eco"))}})
    assert er.async_get(bench.hass).async_get("sensor.salon_schedule") is None


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
