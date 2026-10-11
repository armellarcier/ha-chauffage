"""Applying the weekly schedules."""

from enum import Enum

import pytest

from conftest import WEEKDAY, WEEKEND, Bench, every_day, KINDS


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


SCHEDULES = {
    "climate.salon": {
        "normal": [WEEKDAY] * 5 + [WEEKEND] * 2,
        "away": every_day(("00:00", "eco")),
        "holiday": every_day(("00:00", "frost")),
    },
    "climate.bureau": {
        "normal": every_day(("00:00", "eco"), ("09:00", "comfort"), ("18:00", "eco")),
        "away": every_day(("00:00", "frost")),
    },
}


async def start(bench: Bench, hhmm: str = "10:00", day: int = 0) -> None:
    """Thermostats in eco, clock set, schedules saved (forces a realignment)."""
    await bench.go_to(hhmm, day)
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)


async def test_saving_the_weeks_realigns_every_thermostat(bench: Bench):
    await start(bench, "10:00")  # Monday 10:00: living room in eco (08:30), office in comfort (09:00)
    assert bench.applied() == {"climate.bureau": "comfort"}


async def test_a_preset_already_active_is_not_sent_again(bench: Bench):
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "comfort")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    assert bench.applied() == {}


async def test_the_preset_changes_exactly_at_the_slot_start(bench: Bench):
    await start(bench, "06:00")
    bench.applied()
    await bench.go_to("06:29")
    assert bench.applied() == {}
    await bench.go_to("06:30")
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_between_two_slots_nothing_is_sent(bench: Bench):
    await start(bench, "10:00")
    bench.applied()
    bench.thermostat("climate.salon", "boost", context=None)
    await bench.go_to("10:01")
    await bench.go_to("10:02")
    assert bench.applied() == {}


async def test_the_day_of_the_week_is_respected(bench: Bench):
    await start(bench, "07:00", day=5)  # Saturday 07:00: weekend schedule → still eco
    bench.applied()
    await bench.go_to("08:00", day=5)
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_activating_a_schedule_applies_its_weeks(bench: Bench):
    await start(bench, "10:00")
    bench.applied()
    await bench.activate_schedule("Away")
    assert bench.applied() == {"climate.bureau": "frost"}  # living room already in eco


async def test_a_thermostat_without_a_week_in_the_schedule_is_left_alone(bench: Bench):
    await start(bench, "10:00")
    bench.applied()
    await bench.activate_schedule("Holiday")  # the office has no holiday schedule
    assert bench.applied() == {"climate.salon": "frost"}


async def test_a_thermostat_turned_off_is_ignored(bench: Bench):
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco", state="off")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    assert bench.applied() == {}


async def test_an_unreachable_thermostat_does_not_block_the_others(bench: Bench):
    """Zigbee error (NWK_NO_ROUTE) on one valve: the next ones are still driven."""
    bench.unreachable.add("climate.salon")
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "comfort")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    assert bench.calls == [("climate.salon", "eco"), ("climate.bureau", "comfort")]


async def test_an_enum_preset_is_compared_correctly(bench: Bench):
    """ZHA exposes preset_mode as an Enum: "Preset.ECO" must be recognized as "eco"."""
    bench.needs("vtherm", "standard")

    class Preset(Enum):
        ECO = "eco"

    await bench.go_to("10:00")
    bench.thermostat("climate.salon", Preset.ECO)
    bench.thermostat("climate.bureau", "comfort")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    assert bench.applied() == {}


async def test_thermostats_are_realigned_when_the_integration_starts(bench: Bench):
    await start(bench, "10:00")
    await bench.hass.config_entries.async_unload(bench.entry.entry_id)
    bench.thermostat("climate.bureau", "eco")
    bench.applied()
    assert await bench.hass.config_entries.async_setup(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.bureau": "comfort"}


async def test_the_weeks_survive_a_restart(bench: Bench, hass_storage):
    await start(bench, "10:00")
    await bench.advance(1)  # delayed save
    stored = hass_storage["chauffage"]["data"]
    assert stored["weeks"]["climate.salon"]["normal"][0] == WEEKDAY
    assert stored["revision"] == 1
