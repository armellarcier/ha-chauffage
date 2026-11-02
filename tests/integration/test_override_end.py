"""The end of a change by hand (issue #83): at the next slot that changes the thermostat's
target, at the latest after the override duration."""

from datetime import datetime, timedelta

import pytest

from conftest import CTX_USER, KINDS, PARIS, Bench, every_day
from homeassistant.util import dt as dt_util


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


# The living room: comfort in the evening. The office: eco all week.
EVENING = every_day(("00:00", "eco"), ("20:00", "comfort"), ("22:30", "eco"))
SCHEDULES = {
    "climate.salon": {"normal": EVENING},
    "climate.bureau": {"normal": every_day(("00:00", "eco"), ("06:00", "comfort"), ("08:00", "eco"))},
}


async def start(bench: Bench, options: dict | None = None, schedules: dict | None = None,
                hhmm: str = "10:00", day: int = 0) -> None:
    await bench.go_to(hhmm, day)
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup(options)
    await bench.save_weeks(schedules or SCHEDULES)
    bench.applied()


def end_of(override: dict) -> datetime:
    return dt_util.parse_datetime(override["end"])


def at(hhmm: str, day: int = 0) -> datetime:
    """HH:MM on day `day` (0 = Monday 2026-10-12), Paris time."""
    h, m = (int(x) for x in hhmm.split(":"))
    return datetime(2026, 10, 12 + day, h, m, tzinfo=PARIS)


# ----- the rule -----

async def test_a_change_by_hand_ends_at_the_next_slot(bench: Bench):
    """The living room raised at 21:30, eco at 22:30: back to eco at 22:30, not at 23:30."""
    await start(bench, hhmm="21:00")  # comfort slot
    await bench.go_to("21:30")
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("22:30")
    assert o["ends_at"] == "next_slot"
    await bench.go_to("22:29")
    assert bench.applied() == {}
    await bench.go_to("22:30")
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_a_change_by_hand_far_from_the_next_slot_ends_after_the_duration(bench: Bench):
    """The office turned up at 18:30, next slot at 6:00: back to eco at 20:30."""
    await start(bench, hhmm="18:30")
    await bench.manual_setpoint("climate.bureau", 21)

    o = bench.overrides()["climate.bureau"]
    assert end_of(o) == at("20:30")
    assert o["ends_at"] == "duration"


async def test_a_change_on_the_device_ends_at_the_next_slot(bench: Bench):
    """The knob, with no user in Home Assistant: the same rule."""
    await start(bench, hhmm="21:30")
    await bench.change_on_device("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


async def test_a_preset_picked_on_the_thermostat_ends_at_the_next_slot(bench: Bench):
    bench.needs("vtherm", "standard")
    await start(bench, hhmm="19:00")  # eco, comfort at 20:00
    bench.thermostat("climate.salon", "boost", context=CTX_USER)
    await bench.hass.async_block_till_done()
    o = bench.overrides()["climate.salon"]
    assert (o["kind"], o["value"]) == ("preset", "boost")
    assert end_of(o) == at("20:00")


async def test_a_slot_starting_less_than_30_minutes_after_the_change_does_not_end_it(bench: Bench):
    """Raised at 17:28, comfort at 17:30: the override would last 2 minutes. The next slot that
    changes the target counts: eco at 18:30."""
    schedules = {"climate.salon": {"normal": every_day(("00:00", "eco"), ("17:30", "comfort"), ("18:30", "eco"))}}
    await start(bench, schedules=schedules, hhmm="17:28")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("18:30")


async def test_a_slot_starting_30_minutes_after_the_change_ends_it(bench: Bench):
    await start(bench, hhmm="22:00")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


async def test_a_slot_giving_the_same_target_does_not_end_it(bench: Bench):
    """Comfort, then comfort again at 21:00: nothing changes on the thermostat at 21:00."""
    schedules = {"climate.salon": {"normal": every_day(
        ("00:00", "eco"), ("20:00", "comfort"), ("21:00", "comfort"), ("21:45", "eco"))}}
    await start(bench, schedules=schedules, hhmm="20:15")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("21:45")


async def test_two_presets_giving_the_same_temperature_do_not_end_it(bench: Bench):
    """Comfort, then boost mapped to the same temperature on this thermostat."""
    schedules = {"climate.salon": {"normal": every_day(
        ("00:00", "eco"), ("20:00", "comfort"), ("21:00", "boost"), ("21:45", "eco"))}}
    await start(bench, schedules=schedules, hhmm="20:15")
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"temperature": 20}, "boost": {"temperature": 20}})
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("21:45")


async def test_a_week_with_a_single_preset_ends_after_the_duration(bench: Bench):
    await start(bench, schedules={"climate.salon": {"normal": every_day(("00:00", "eco"))}})
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("12:00")
    assert o["ends_at"] == "duration"


async def test_a_new_change_by_hand_computes_the_end_again(bench: Bench):
    await start(bench, hhmm="19:00")
    await bench.manual_setpoint("climate.salon", 21)  # ends at 20:00
    await bench.go_to("20:45")  # comfort since 20:00, when the override ended
    await bench.manual_setpoint("climate.salon", 23)
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


# ----- limits: midnight, Sunday to Monday, summer time -----

async def test_a_midnight_slot_with_the_same_preset_does_not_end_it(bench: Bench):
    """Eco until midnight, eco again from midnight: the duration applies."""
    await start(bench, hhmm="23:30")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("01:30", day=1)


async def test_a_change_on_sunday_evening_ends_at_monday_s_first_slot(bench: Bench):
    weekday = [["00:00", "eco"], ["08:00", "comfort"], ["22:00", "eco"]]
    sunday = [["00:00", "eco"], ["08:00", "comfort"]]  # comfort until midnight
    schedules = {"climate.salon": {"normal": [weekday] * 6 + [sunday]}}
    await start(bench, schedules=schedules, hhmm="22:45", day=6)
    await bench.manual_setpoint("climate.salon", 22)

    assert end_of(bench.overrides()["climate.salon"]) == at("00:00", day=7)
    await bench.go_to("00:00", day=7)
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_the_next_slot_keeps_its_time_when_summer_time_ends(bench: Bench):
    """Sunday 25 October 2026, 3:00 → 2:00. Raised at 1:30, comfort at 3:00 (winter time)."""
    schedules = {"climate.salon": {"normal": every_day(("00:00", "eco"), ("03:00", "comfort"), ("12:00", "eco"))}}
    await start(bench, {"override_duration": 240}, schedules=schedules, hhmm="01:30", day=13)
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == datetime(2026, 10, 25, 3, 0, tzinfo=PARIS)
    assert end_of(o).utcoffset() == timedelta(hours=1)
    await bench.go_to("03:00", day=13)
    assert bench.overrides() == {}


# ----- what keeps its end -----

async def test_a_schedule_switched_during_the_override_does_not_move_its_end(bench: Bench):
    away = every_day(("00:00", "eco"), ("21:45", "comfort"))
    schedules = {"climate.salon": {"normal": EVENING, "away": away}}
    await start(bench, schedules=schedules, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    await bench.activate_schedule("Away")
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


async def test_an_override_set_from_the_card_keeps_its_end(bench: Bench):
    await start(bench, hhmm="21:30")
    override = bench.runtime.new_override("temperature", 22, minutes=24 * 60)
    await bench.set_override("climate.salon", override)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("21:30", day=1)
    assert "ends_at" not in o
    await bench.go_to("22:30")
    assert "climate.salon" in bench.overrides()


async def test_an_end_changed_from_the_card_no_longer_says_why(bench: Bench):
    """+30 min on the card: the end is the user's choice, neither the slot nor the duration."""
    await start(bench, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "end": (end_of(o) + timedelta(minutes=30)).isoformat()})
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("23:00")
    assert "ends_at" not in o


async def test_a_value_changed_from_the_card_keeps_why_the_override_ends(bench: Bench):
    await start(bench, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "value": 23})
    assert bench.overrides()["climate.salon"]["ends_at"] == "next_slot"


async def test_the_set_override_service_keeps_its_end(bench: Bench):
    await start(bench, hhmm="21:30")
    await bench.hass.services.async_call("chauffage", "set_override", {
        "entity_id": "climate.salon", "temperature": 22, "duration": 180}, blocking=True)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("00:30", day=1)
    assert "ends_at" not in o


# ----- the option -----

async def test_the_option_after_the_duration_brings_back_the_fixed_duration(bench: Bench):
    await start(bench, {"manual_override_end": "duration"}, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("23:30")
    assert o["ends_at"] == "duration"
    await bench.go_to("22:30")
    assert bench.applied() == {}


async def test_the_card_knows_how_a_change_by_hand_ends(bench: Bench):
    await start(bench)
    assert bench.runtime.snapshot()["manual_override_end"] == "next_slot"
