"""Edge cases and error paths (found by the coverage report): startup, removal, unreachable
thermostats, invalid requests, partial package data."""

import json
from datetime import datetime
from pathlib import Path

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState
from homeassistant.exceptions import ServiceValidationError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import WEEKDAY, Bench, every_day
from custom_components.chauffage import model

FIXTURES = Path(__file__).parents[1] / "fixtures"
SCHEDULES = {"climate.salon": {"normal": [WEEKDAY] * 7}, "climate.bureau": {"normal": every_day(("00:00", "comfort"))}}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "comfort")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    bench.applied()


# ----- startup and removal -----

async def test_thermostats_are_realigned_once_home_assistant_has_started(bench: Bench, hass_storage):
    """HA restart: the entry is set up during startup (stored data exists); the realignment waits
    for the end of the startup, when the thermostats are there."""
    stored = json.loads((FIXTURES / "store-v2.json").read_text(encoding="utf-8"))
    stored["data"]["overrides"] = {}  # the fixture's override would (rightly) keep the thermostat as is
    hass_storage["chauffage"] = stored
    await bench.go_to("10:00")
    bench.hass.set_state(CoreState.starting)
    bench.entry = MockConfigEntry(domain="chauffage")
    bench.entry.add_to_hass(bench.hass)
    assert await bench.hass.config_entries.async_setup(bench.entry.entry_id)
    bench.runtime.pause = 0
    bench.thermostat("climate.salon", "comfort")  # off schedule (Monday 10:00: eco)
    await bench.hass.async_block_till_done()
    assert bench.applied() == {}
    bench.hass.set_state(CoreState.running)
    bench.hass.bus.async_fire(EVENT_HOMEASSISTANT_STARTED)
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "eco"}


async def test_deleting_the_integration_deletes_its_data(bench: Bench, hass_storage):
    await start(bench)
    await bench.advance(1)  # delayed save
    assert "chauffage" in hass_storage
    assert await bench.hass.config_entries.async_remove(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert "chauffage" not in hass_storage


async def test_thermostats_are_sent_one_after_the_other(bench: Bench, monkeypatch):
    """A short pause between two thermostats, not to flood the Zigbee network (the frozen
    test clock would never end a real pause: it is recorded instead)."""
    pauses = []

    async def sleep(seconds):
        pauses.append(seconds)  # asyncio.sleep is replaced for the whole test

    monkeypatch.setattr("custom_components.chauffage.runtime.asyncio.sleep", sleep)
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "comfort")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup()
    bench.runtime.pause = 0.3
    await bench.save_weeks(SCHEDULES)
    assert bench.calls == [("climate.salon", "eco"), ("climate.bureau", "comfort")]
    assert [p for p in pauses if p] == [0.3]  # between the two (HA itself also calls sleep(0))


# ----- runtime rules -----

async def test_activating_the_active_schedule_again_changes_nothing(bench: Bench):
    await start(bench)
    bench.thermostat("climate.salon", "boost")  # off schedule, by the thermostat itself
    await bench.hass.async_block_till_done()
    await bench.activate_schedule("Normal")
    assert bench.applied() == {}


async def test_unknown_schedules_duplicate_or_no_presets_are_refused(bench: Bench):
    await start(bench)
    with pytest.raises(model.InvalidData):
        await bench.runtime.activate_schedule("unknown")
    presets = [dict(p) for p in bench.runtime.data["presets"]]
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_presets(presets + [presets[0]])
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_presets([])


async def test_removing_an_override_that_does_not_exist_changes_nothing(bench: Bench):
    await start(bench)
    revision = bench.runtime.data["revision"]
    await bench.set_override("climate.salon", None)
    assert bench.applied() == {}
    assert bench.runtime.data["revision"] == revision


async def test_a_thermostat_without_a_week_in_the_active_schedule_has_no_planned_preset(bench: Bench):
    await start(bench)
    await bench.activate_schedule("Away")  # no "away" schedule
    assert bench.runtime.planned("climate.salon") == (None, None, None)


# ----- services: errors -----

async def test_services_without_the_integration(bench: Bench):
    await start(bench)
    await bench.hass.config_entries.async_unload(bench.entry.entry_id)
    with pytest.raises(ServiceValidationError):
        await bench.hass.services.async_call("chauffage", "clear_override", {"entity_id": "climate.salon"}, blocking=True)


async def test_set_override_until_a_time_without_time_zone(bench: Bench):
    """An automation giving "until 18:00" (no time zone): local time."""
    await start(bench)
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 21, "end": datetime(2026, 10, 12, 18, 0)},
        blocking=True,
    )
    assert bench.overrides()["climate.salon"]["end"] == "2026-10-12T18:00:00+02:00"


async def test_set_override_on_a_thermostat_that_does_not_answer(bench: Bench):
    await start(bench)
    bench.unreachable.add("climate.salon")
    with pytest.raises(ServiceValidationError):
        await bench.hass.services.async_call(
            "chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True
        )
    assert bench.overrides() == {}


# ----- websocket: errors -----

@pytest.mark.parametrize("command", [
    {"type": "chauffage/subscribe"},
    {"type": "chauffage/weeks/save", "weeks": {}},
    {"type": "chauffage/override/set", "entity_id": "climate.salon", "override": None},
    {"type": "chauffage/schedule/activate", "schedule": "normal"},
    {"type": "chauffage/presets/set", "presets": []},
    {"type": "chauffage/mapping/set", "entity_id": "climate.salon", "mapping": {}},
])
async def test_the_api_without_the_integration(bench: Bench, ws_client, command):
    await start(bench)
    await bench.hass.config_entries.async_unload(bench.entry.entry_id)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id(command)
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "not_loaded"


@pytest.mark.parametrize("command", [
    {"type": "chauffage/override/set", "entity_id": "climate.salon", "override": {"kind": "warm"}},
    {"type": "chauffage/schedule/activate", "schedule": "unknown"},
    {"type": "chauffage/presets/set", "presets": [{"name": ""}]},
])
async def test_invalid_requests_are_refused(bench: Bench, ws_client, command):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id(command)
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "invalid_format"


# ----- package import: partial or newer data -----

async def test_a_package_too_new_found_at_setup_is_an_error(bench: Bench):
    bench.hass.states.async_set("sensor.programmes_chauffage", "x", {"programmes": {}, "version": 9})
    entry = MockConfigEntry(domain="chauffage")
    entry.add_to_hass(bench.hass)
    await bench.hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_ERROR


async def test_unreadable_package_parts_are_skipped(bench: Bench):
    """Not a climate, a malformed override: the rest is imported."""
    hass = bench.hass
    week = [["00:00 eco"]] * 7
    hass.states.async_set("sensor.programmes_chauffage", "x",
                          {"programmes": {"climate.salon": {"Normal": week}, "light.kitchen": {"Normal": week}}})
    hass.states.async_set("sensor.derogations_chauffage", "x",
                          {"derogations": {"climate.salon": {"type": "temp", "valeur": "hot", "debut": "a", "fin": "b"},
                                           "climate.bureau": "nonsense"}})
    hass.states.async_set("input_select.mode_chauffage", "Normal", {"options": ["Normal"]})
    await bench.setup(schedules=None)  # no automation service: the package automations cannot be turned off (logged)
    assert list(bench.runtime.weeks) == ["climate.salon"]
    assert bench.runtime.data["overrides"] == {}


# ----- data validation -----

@pytest.mark.parametrize(("function", "value"), [
    (lambda v: model.normalize_preset(v, set()), "not a dict"),
    (lambda v: model.normalize_mapping(v, {"eco"}), ["not", "a", "dict"]),
    (lambda v: model.normalize_mapping(v, {"eco"}), {"eco": {"temperature": "warm"}}),
    (lambda v: model.normalize_mapping(v, {"eco"}), {"eco": {}}),
    (lambda v: model.normalize_weeks(v, {"normal"}), ["not a dict"]),
    (lambda v: model.normalize_weeks(v, {"normal"}), {"climate.salon": "not a dict"}),
    (model.normalize_override, "not a dict"),
    (model.normalize_override, {"kind": "temperature", "value": "warm", "start": "a", "end": "b"}),
    (model.normalize_override, {"kind": "preset", "value": "boost", "start": 1, "end": None}),
])
def test_invalid_data_is_refused(function, value):
    with pytest.raises(model.InvalidData):
        function(value)


def test_a_preset_named_like_an_existing_one_gets_another_id():
    assert model.normalize_preset({"name": "Eco"}, {"eco"})["id"] == "eco_2"
