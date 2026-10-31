"""Applying the weekly schedules."""

from enum import Enum

import pytest
from homeassistant.core import Context

from custom_components.chauffage.engine import Target
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


async def test_a_schedule_the_card_sent_no_week_in_is_eco_all_week(bench: Bench):
    """A scheduled thermostat has a week in every schedule (docs/decisions.md, "Scheduled
    thermostats"): the one of a new schedule."""
    await start(bench, "10:00")
    bench.applied()
    await bench.activate_schedule("Holiday")  # no holiday week sent for the office
    assert bench.runtime.planned("climate.bureau")[0] == "eco"
    assert bench.applied()["climate.salon"] == "frost"


async def test_a_thermostat_turned_off_is_ignored(bench: Bench):
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco", state="off")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    assert bench.applied() == {}


async def test_an_auto_stopped_thermostat_gets_its_slot_when_the_option_is_enabled(bench: Bench):
    bench.needs("vtherm")
    await bench.go_to("10:00")
    bench.thermostat(
        "climate.bureau", "eco", state="off",
        specific_states={"hvac_off_reason": "hvac_off_auto_start_stop"},
    )
    await bench.setup(options={"allow_auto_start_stop_off": True})
    await bench.save_weeks(SCHEDULES)

    assert bench.applied() == {"climate.bureau": "comfort"}
    assert bench.runtime.pending("climate.bureau") == [
        Target("preset", "comfort")
    ]

    bench.thermostat(
        "climate.bureau", "comfort", state="off",
        specific_states={"hvac_off_reason": "hvac_off_auto_start_stop"},
        context=Context(),
    )
    await bench.hass.async_block_till_done()
    assert bench.runtime.pending("climate.bureau") == []


async def test_an_auto_stopped_thermostat_is_ignored_when_the_option_is_disabled(bench: Bench):
    bench.needs("vtherm")
    await bench.go_to("10:00")
    bench.thermostat(
        "climate.bureau", "eco", state="off",
        specific_states={"hvac_off_reason": "hvac_off_auto_start_stop"},
    )
    await bench.setup(options={"allow_auto_start_stop_off": False})
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
    assert stored["thermostats"]["climate.salon"]["weeks"]["normal"][0] == WEEKDAY
    assert stored["revision"] == 1
