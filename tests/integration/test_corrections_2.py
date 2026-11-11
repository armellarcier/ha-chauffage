"""Corrections after the second user panel (#91, corrections-2): a cooling air conditioner on a
preset without a cooling value (D1), the end "until tomorrow" (D2), Chauffage's lines in the
thermostat's logbook (D3)."""

import pytest
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done

from conftest import KINDS, WEEKDAY, WEEKEND, Bench

AC_MODES = ["off", "heat", "cool", "fan_only"]


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


@pytest.fixture
def mock_recorder_before_hass(async_test_recorder) -> None:
    """The recorder's database is prepared before Home Assistant starts (`recorder_mock`)."""


async def start(bench: Bench, hhmm: str = "10:00", day: list | None = None, preset: str = "eco", **attributes) -> None:
    await bench.go_to(hhmm)
    bench.thermostat("climate.salon", preset, **attributes)
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": [day or WEEKDAY] * 7}})
    bench.applied()
    bench.powered()
    bench.temperature_calls.clear()


# ----- D1: a cooling AC on a preset without a cooling value -----

# Comfort, then eco at 14:00, on a reversible AC that cools on its own comfort preset
ECO_IN_COOL = [["00:00", "comfort"], ["14:00", "eco"]]
COOLING = {"preset": "comfort", "state": "cool", "hvac_modes": AC_MODES}


async def test_in_cool_a_preset_without_a_cooling_value_sends_the_device_preset_and_no_temperature(bench: Bench):
    """Eco on a reversible AC that cools, with no value of its own. The device knows what its
    own eco means in cool: its climate preset is sent. Chauffage's heating temperature (17 °C)
    is never sent in cool: a thermostat without presets keeps its setpoint."""
    await start(bench, "13:00", ECO_IN_COOL, **COOLING)
    await bench.go_to("14:00")
    assert bench.applied() == ({} if bench.kind == "plain" else {"climate.salon": "eco"})
    assert bench.temperature_calls == []
    assert bench.powered() == {}  # already cool


async def test_in_cool_a_device_preset_stored_by_the_user_is_still_sent(bench: Bench):
    bench.needs("vtherm", "standard")
    await start(bench, "13:00", ECO_IN_COOL, **COOLING)
    await bench.runtime.set_mapping("climate.salon", {"eco": {"preset_mode": "eco"}})
    await bench.hass.async_block_till_done()
    bench.applied()
    await bench.go_to("14:00")
    assert bench.applied() == {"climate.salon": "eco"}


async def test_in_cool_a_cooling_value_is_sent(bench: Bench):
    await start(bench, "13:00", ECO_IN_COOL, **COOLING)
    await bench.runtime.set_mapping("climate.salon", {"eco": {"preset_mode": "eco", "cool_temperature": 26}})
    await bench.hass.async_block_till_done()
    bench.temperature_calls.clear()
    await bench.go_to("14:00")
    assert bench.temperature_calls == [("climate.salon", 26.0)]


async def test_an_override_to_a_preset_without_a_cooling_value_sends_no_temperature_in_cool(bench: Bench):
    """The same rule for an override set to a preset: its device preset, never a heating temperature."""
    await start(bench, "10:00", **COOLING)
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True)
    assert bench.applied() == ({} if bench.kind == "plain" else {"climate.salon": "boost"})
    assert bench.temperature_calls == []
    assert "climate.salon" in bench.overrides()


# ----- D2: "until tomorrow" is the next morning -----

async def test_until_tomorrow_is_the_first_change_of_today_when_it_is_still_to_come(bench: Bench):
    """At 01:30 on Sunday, the morning is today's first change (08:00), the same instant as the
    next slot: the card then shows one button."""
    await start(bench, "10:00", day=None)
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 5 + [WEEKEND] * 2}})
    await bench.go_to("01:30", day=6)
    info = bench.runtime.planned_info("climate.salon")
    assert info["next_day_slot_end"] == "2026-10-18T08:00:00+02:00"
    assert info["next_day_slot_end"] == info["next_slot_end"]


async def test_until_tomorrow_on_a_weekday_evening_is_tomorrow_s_first_change(bench: Bench):
    await start(bench, "22:00")
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] == "2026-10-13T06:30:00+02:00"


async def test_until_tomorrow_on_sunday_evening_is_monday_s_first_change(bench: Bench):
    await start(bench, "10:00")
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 5 + [WEEKEND] * 2}})
    await bench.go_to("22:00", day=6)
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] == "2026-10-19T06:30:00+02:00"


async def test_until_tomorrow_skips_a_flat_day(bench: Bench):
    """Sunday on one preset all day: the morning is Monday's."""
    await start(bench, "10:00")
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 6 + [[["00:00", "eco"]]]}})
    await bench.go_to("22:00", day=5)  # Saturday evening
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] == "2026-10-19T06:30:00+02:00"


# ----- D3: Chauffage's lines in the thermostat's logbook -----

async def test_the_thermostat_s_logbook_with_its_override_sensor_shows_chauffage_s_lines(recorder_mock, bench: Bench, ws_client):
    """Home Assistant only queries the events of the integrations of the entities filtered on:
    filtered on the thermostat alone, it never asks for Chauffage's events; with the
    thermostat's Override sensor added, it does, and the lines carry the thermostat."""
    await start(bench, "10:00")
    bench.hass.config.components.add("frontend")  # the logbook needs it; the tests have none
    assert await async_setup_component(bench.hass, "logbook", {})
    await bench.manual_setpoint("climate.salon", 21.5)
    await async_wait_recording_done(bench.hass)
    client = await ws_client(bench.hass)

    async def lines(entity_ids: list[str] | None) -> list[str]:
        # An end after the change: the logbook stops strictly before its end
        await client.send_json_auto_id({"type": "logbook/get_events", "start_time": "2026-10-12T00:00:00+02:00",
                                        "end_time": "2026-10-12T23:00:00+02:00", **({"entity_ids": entity_ids} if entity_ids else {})})
        reply = await client.receive_json()
        assert reply["success"], reply
        return [e["message"] for e in reply["result"] if e.get("domain") == "chauffage"]

    assert await lines(None), "the line, unfiltered"
    both = await lines(["climate.salon", "binary_sensor.salon_override"])
    assert both and "21.5" in both[0]
    assert await lines(["climate.salon"]) == []  # Home Assistant's own gate, see the README
