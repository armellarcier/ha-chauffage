"""The end of a change by hand (issue #83), by the setting *End of a change by hand*:

- `duration` (the default): after the override duration;
- `next_slot_within_duration`: at the next slot that changes the thermostat's target, at the
  latest after the override duration;
- `next_slot`: at the next slot that changes the thermostat's target, however far.
"""

from datetime import datetime, timedelta, timezone

import pytest

from conftest import CTX_USER, KINDS, MANUAL_PRESET, MONDAY, PARIS, Bench, every_day
from homeassistant.util import dt as dt_util


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


WITHIN = {"manual_override_end": "next_slot_within_duration"}
NEXT_SLOT = {"manual_override_end": "next_slot"}

# The living room: comfort in the evening. The office: comfort in the morning only.
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
    h, m = (int(x) for x in hhmm.split(":"))
    return MONDAY + timedelta(days=day, hours=h, minutes=m)


# ----- the default: the override duration -----

async def test_by_default_a_change_by_hand_lasts_the_override_duration(bench: Bench):
    """The living room raised at 21:30, eco at 22:30: the change lasts until 23:30, as before #83."""
    await start(bench, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("23:30")
    assert o["ends_at"] == "duration"
    await bench.go_to("22:30")
    assert bench.applied() == {}
    await bench.go_to("23:30")
    assert bench.applied() == {"climate.salon": "eco"}


async def test_by_default_a_change_far_from_the_next_slot_lasts_the_override_duration(bench: Bench):
    await start(bench, hhmm="18:30")
    await bench.manual_setpoint("climate.bureau", 21)
    assert end_of(bench.overrides()["climate.bureau"]) == at("20:30")


# ----- until the next slot, at most the override duration -----

async def test_a_change_by_hand_ends_at_the_next_slot(bench: Bench):
    """The living room raised at 21:30, eco at 22:30: back to eco at 22:30, not at 23:30."""
    await start(bench, WITHIN, hhmm="21:00")  # comfort slot
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
    await start(bench, WITHIN, hhmm="18:30")
    await bench.manual_setpoint("climate.bureau", 21)

    o = bench.overrides()["climate.bureau"]
    assert end_of(o) == at("20:30")
    assert o["ends_at"] == "duration"


async def test_a_change_on_the_device_ends_at_the_next_slot(bench: Bench):
    """The knob, with no user in Home Assistant: the same rule."""
    await start(bench, WITHIN, hhmm="21:30")
    await bench.change_on_device("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


async def test_a_preset_picked_on_the_thermostat_ends_at_the_next_slot(bench: Bench):
    bench.needs("vtherm", "standard")
    await start(bench, WITHIN, hhmm="19:00")  # eco, comfort at 20:00
    bench.thermostat("climate.salon", "boost", context=CTX_USER)
    await bench.hass.async_block_till_done()
    o = bench.overrides()["climate.salon"]
    assert o["target"] == {"preset_mode": "boost"}
    assert end_of(o) == at("20:00")


async def test_a_slot_starting_less_than_15_minutes_after_the_change_does_not_end_it(bench: Bench):
    """Raised at 17:50, comfort at 18:00: the override would last 10 minutes. The next slot that
    changes the target counts: eco at 19:00."""
    schedules = {"climate.salon": {"normal": every_day(("00:00", "eco"), ("18:00", "comfort"), ("19:00", "eco"))}}
    await start(bench, WITHIN, schedules=schedules, hhmm="17:50")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("19:00")


async def test_a_slot_starting_15_minutes_after_the_change_ends_it(bench: Bench):
    await start(bench, WITHIN, hhmm="22:15")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


async def test_a_slot_giving_the_same_target_does_not_end_it(bench: Bench):
    """Comfort, then comfort again at 21:00: nothing changes on the thermostat at 21:00."""
    schedules = {"climate.salon": {"normal": every_day(
        ("00:00", "eco"), ("20:00", "comfort"), ("21:00", "comfort"), ("21:45", "eco"))}}
    await start(bench, WITHIN, schedules=schedules, hhmm="20:15")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("21:45")


async def test_two_presets_giving_the_same_temperature_do_not_end_it(bench: Bench):
    """Comfort, then boost mapped to the same temperature on this thermostat."""
    schedules = {"climate.salon": {"normal": every_day(
        ("00:00", "eco"), ("20:00", "comfort"), ("21:00", "boost"), ("21:45", "eco"))}}
    await start(bench, WITHIN, schedules=schedules, hhmm="20:15")
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"temperature": 20}, "boost": {"temperature": 20}})
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("21:45")


async def test_a_week_with_a_single_preset_ends_after_the_duration(bench: Bench):
    await start(bench, WITHIN, schedules={"climate.salon": {"normal": every_day(("00:00", "eco"))}})
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("12:00")
    assert o["ends_at"] == "duration"


async def test_a_new_change_by_hand_computes_the_end_again(bench: Bench):
    await start(bench, WITHIN, hhmm="19:00")
    await bench.manual_setpoint("climate.salon", 21)  # ends at 20:00
    await bench.go_to("20:45")  # comfort since 20:00, when the override ended
    await bench.manual_setpoint("climate.salon", 23)
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


async def test_a_midnight_slot_with_the_same_preset_does_not_end_it(bench: Bench):
    """Eco until midnight, eco again from midnight: the duration applies."""
    await start(bench, WITHIN, hhmm="23:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("01:30", day=1)
    assert o["ends_at"] == "duration"


async def test_a_change_on_sunday_evening_ends_at_monday_s_first_slot(bench: Bench):
    weekday = [["00:00", "eco"], ["08:00", "comfort"], ["22:00", "eco"]]
    sunday = [["00:00", "eco"], ["08:00", "comfort"]]  # comfort until midnight
    schedules = {"climate.salon": {"normal": [weekday] * 6 + [sunday]}}
    await start(bench, WITHIN, schedules=schedules, hhmm="22:45", day=6)
    await bench.manual_setpoint("climate.salon", 22)

    assert end_of(bench.overrides()["climate.salon"]) == at("00:00", day=7)
    await bench.go_to("00:00", day=7)
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


SPRING_FORWARD = (datetime(2027, 3, 28) - datetime(2026, 10, 12)).days  # Sunday, 2:00 → 3:00


async def test_a_slot_in_the_hour_skipped_by_summer_time_ends_the_change_when_the_clocks_go_forward(bench: Bench):
    """Regression: Sunday 28 March 2027, 2:00 → 3:00. Raised at 1:40, comfort at 2:30, a time
    that doesn't exist that day: the slot starts at 3:00 summer time, and ends the change then,
    not at 3:30."""
    schedules = {"climate.salon": {"normal": every_day(("00:00", "eco"), ("02:30", "comfort"), ("12:00", "eco"))}}
    await start(bench, WITHIN | {"override_duration": 240}, schedules=schedules, hhmm="01:40", day=SPRING_FORWARD)
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == datetime(2027, 3, 28, 3, 0, tzinfo=PARIS)
    assert end_of(o).utcoffset() == timedelta(hours=2)
    assert o["ends_at"] == "next_slot"
    await bench.go_to("03:00", day=SPRING_FORWARD)
    assert bench.overrides() == {}
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_the_next_slot_keeps_its_time_when_summer_time_ends(bench: Bench):
    """Sunday 25 October 2026, 3:00 → 2:00. Raised at 1:30, comfort at 3:00 (winter time)."""
    schedules = {"climate.salon": {"normal": every_day(("00:00", "eco"), ("03:00", "comfort"), ("12:00", "eco"))}}
    await start(bench, WITHIN | {"override_duration": 240}, schedules=schedules, hhmm="01:30", day=13)
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == datetime(2026, 10, 25, 3, 0, tzinfo=PARIS)
    assert end_of(o).utcoffset() == timedelta(hours=1)
    await bench.go_to("03:00", day=13)
    assert bench.overrides() == {}


async def test_a_change_in_the_repeated_hour_ends_at_the_next_slot_after_it(bench: Bench):
    """Regression: Sunday 25 October 2026, 3:00 → 2:00. Raised at 2:10 winter time (the second
    2:10), comfort at 2:45: the end is 2:45 winter time, never before the change."""
    schedules = {"climate.salon": {"normal": every_day(("00:00", "eco"), ("02:45", "comfort"), ("12:00", "eco"))}}
    await start(bench, WITHIN, schedules=schedules, hhmm="00:30", day=13)
    await bench.advance(160)  # 2:10 winter time, 01:10 UTC
    bench.applied()
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == datetime(2026, 10, 25, 1, 45, tzinfo=timezone.utc)  # 2:45 winter time
    assert end_of(o).utcoffset() == timedelta(hours=1)
    assert o["ends_at"] == "next_slot"
    await bench.advance(1)
    assert "climate.salon" in bench.overrides()
    assert bench.applied() == {}


async def test_a_change_in_the_repeated_hour_ends_after_the_duration_in_real_time(bench: Bench):
    """Regression: raised at 2:10 winter time with a 30-minute duration, no slot before: the end
    is 2:40 winter time, not 2:40 summer time (before the change)."""
    await start(bench, {"override_duration": 30}, hhmm="00:30", day=13)
    await bench.advance(160)  # 2:10 winter time, 01:10 UTC
    bench.applied()
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == datetime(2026, 10, 25, 1, 40, tzinfo=timezone.utc)  # 2:40 winter time
    assert o["ends_at"] == "duration"
    await bench.advance(1)
    assert "climate.salon" in bench.overrides()


# ----- until the next slot, however far -----

async def test_a_change_by_hand_lasts_until_the_next_slot_however_far(bench: Bench):
    """The office turned up at 18:30, next slot at 6:00: the office heats until 6:00, as on a
    classic thermostat."""
    await start(bench, NEXT_SLOT, hhmm="18:30")
    await bench.manual_setpoint("climate.bureau", 21)

    o = bench.overrides()["climate.bureau"]
    assert end_of(o) == at("06:00", day=1)
    assert o["ends_at"] == "next_slot"
    await bench.go_to("05:59", day=1)
    assert bench.applied() == {}
    await bench.go_to("06:00", day=1)
    assert bench.applied() == {"climate.bureau": "comfort"}
    assert bench.overrides() == {}


async def test_until_the_next_slot_a_close_slot_ends_the_change_too(bench: Bench):
    await start(bench, NEXT_SLOT, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


async def test_until_the_next_slot_a_slot_less_than_15_minutes_away_does_not_count(bench: Bench):
    """Raised at 17:50, comfort at 18:00, eco at 19:00: the change lasts until 19:00."""
    schedules = {"climate.salon": {"normal": every_day(("00:00", "eco"), ("18:00", "comfort"), ("19:00", "eco"))}}
    await start(bench, NEXT_SLOT, schedules=schedules, hhmm="17:50")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("19:00")


async def test_until_the_next_slot_the_same_preset_after_midnight_does_not_count(bench: Bench):
    """The living room raised at 23:30: eco again at midnight changes nothing, comfort at 20:00
    the next day does."""
    await start(bench, NEXT_SLOT, hhmm="23:30")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("20:00", day=1)


async def test_until_the_next_slot_a_change_on_saturday_ends_on_monday(bench: Bench):
    weekday = [["00:00", "eco"], ["06:00", "comfort"], ["08:00", "eco"]]
    weekend = [["00:00", "eco"]]
    schedules = {"climate.salon": {"normal": [weekday] * 5 + [weekend] * 2}}
    await start(bench, NEXT_SLOT, schedules=schedules, hhmm="10:00", day=5)
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("06:00", day=7)


async def test_until_the_next_slot_the_slot_keeps_its_time_across_the_end_of_summer_time(bench: Bench):
    """Raised on Saturday 24 October 2026 at 22:00, comfort on Sunday at 8:00, winter time."""
    schedules = {"climate.salon": {"normal": every_day(("00:00", "eco"), ("08:00", "comfort"), ("09:00", "eco"))}}
    await start(bench, NEXT_SLOT, schedules=schedules, hhmm="22:00", day=12)
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == datetime(2026, 10, 25, 8, 0, tzinfo=PARIS)
    assert end_of(o).utcoffset() == timedelta(hours=1)


async def test_until_the_next_slot_a_week_on_a_single_preset_keeps_the_change_for_a_week(bench: Bench):
    """No slot ever changes the target: the change lasts until the user ends it, or until the
    thermostat goes back to its slot. Its end is a week later, so that every override has one."""
    await start(bench, NEXT_SLOT, schedules={"climate.salon": {"normal": every_day(("00:00", "eco"))}})
    await bench.manual_setpoint("climate.salon", 22)

    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("10:00", day=7)
    assert o["ends_at"] == "no_next_slot"
    await bench.go_to("10:00", day=3)
    assert "climate.salon" in bench.overrides()


async def test_until_the_next_slot_going_back_to_the_slot_ends_the_change(bench: Bench):
    await start(bench, NEXT_SLOT, schedules={"climate.salon": {"normal": every_day(("00:00", "eco"))}})
    await bench.manual_setpoint("climate.salon", 22)
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 17, context=CTX_USER)  # eco's value
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}


# ----- what keeps its end -----

async def test_a_schedule_switched_during_the_override_does_not_move_its_end(bench: Bench):
    away = every_day(("00:00", "eco"), ("21:45", "comfort"))
    schedules = {"climate.salon": {"normal": EVENING, "away": away}}
    await start(bench, NEXT_SLOT, schedules=schedules, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    await bench.activate_schedule("Away")
    assert end_of(bench.overrides()["climate.salon"]) == at("22:30")


async def test_a_setting_changed_during_the_override_does_not_move_its_end(bench: Bench):
    await start(bench, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    bench.hass.config_entries.async_update_entry(bench.entry, options=NEXT_SLOT)
    await bench.hass.async_block_till_done()
    assert end_of(bench.overrides()["climate.salon"]) == at("23:30")


async def test_an_override_set_from_the_card_keeps_its_end(bench: Bench):
    await start(bench, NEXT_SLOT, hhmm="21:30")
    override = bench.runtime.new_override({"temperature": 22}, minutes=24 * 60)
    await bench.set_override("climate.salon", override)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("21:30", day=1)
    assert "ends_at" not in o
    await bench.go_to("22:30")
    assert "climate.salon" in bench.overrides()


async def test_an_end_changed_from_the_card_no_longer_says_why(bench: Bench):
    """+30 min on the card: the end is the user's choice, neither the slot nor the duration."""
    await start(bench, WITHIN, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "end": (end_of(o) + timedelta(minutes=30)).isoformat()})
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("23:00")
    assert "ends_at" not in o


async def test_the_same_end_sent_again_from_the_card_keeps_why_the_override_ends(bench: Bench):
    """The card sends the end in UTC: the same instant, written another way."""
    await start(bench, WITHIN, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    utc_end = dt_util.as_utc(end_of(o)).isoformat().replace("+00:00", "Z")
    await bench.set_override("climate.salon", {**o, "end": utc_end})
    assert bench.overrides()["climate.salon"]["ends_at"] == "next_slot"


async def test_a_value_changed_from_the_card_keeps_why_the_override_ends(bench: Bench):
    await start(bench, WITHIN, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "target": {"temperature": 23}})
    assert bench.overrides()["climate.salon"]["ends_at"] == "next_slot"


async def test_the_set_override_service_keeps_its_end(bench: Bench):
    await start(bench, NEXT_SLOT, hhmm="21:30")
    await bench.hass.services.async_call("chauffage", "set_override", {
        "entity_id": "climate.salon", "temperature": 22, "duration": 180}, blocking=True)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("00:30", day=1)
    assert "ends_at" not in o


async def test_a_new_override_with_the_same_end_no_longer_says_why(bench: Bench):
    """A change by hand at 21:30 lasts until 23:30. At 22:00, an automation sets a new override
    until 23:30: the same end, but a new start, so the reason of the change by hand is gone."""
    await start(bench, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    assert bench.overrides()["climate.salon"]["ends_at"] == "duration"
    await bench.go_to("22:00")
    await bench.hass.services.async_call("chauffage", "set_override", {
        "entity_id": "climate.salon", "temperature": 22, "duration": 90}, blocking=True)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("23:30")
    assert "ends_at" not in o


# ----- the setting -----

async def test_the_setting_is_read_for_each_thermostat(bench: Bench):
    """One setting for every thermostat today, read through one function that takes the
    thermostat, so that a setting per thermostat can come later."""
    await start(bench, NEXT_SLOT)
    assert bench.runtime.manual_override_end_of("climate.salon") == "next_slot"
    assert bench.runtime.manual_override_end_of("climate.bureau") == "next_slot"


async def test_an_unknown_setting_lasts_the_override_duration(bench: Bench):
    await start(bench, {"manual_override_end": "whenever"}, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    assert end_of(bench.overrides()["climate.salon"]) == at("23:30")


async def test_the_card_knows_how_a_change_by_hand_ends(bench: Bench):
    await start(bench)
    assert bench.runtime.snapshot()["manual_override_end"] == "duration"


async def test_the_card_knows_the_setting_chosen(bench: Bench):
    await start(bench, NEXT_SLOT)
    assert bench.runtime.snapshot()["manual_override_end"] == "next_slot"


# ----- the next slot published for the card's button (#83) -----

async def test_the_card_is_told_the_next_slot_a_change_made_now_would_end_at(bench: Bench):
    """The integration computes it in Home Assistant's time zone: a phone in another time zone
    shows and sends the same instant."""
    await start(bench, hhmm="21:30")
    planned = bench.runtime.snapshot()["planned"]
    assert dt_util.parse_datetime(planned["climate.salon"]["next_slot_end"]) == at("22:30")
    assert dt_util.parse_datetime(planned["climate.bureau"]["next_slot_end"]) == at("06:00", day=1)


async def test_the_next_slot_published_skips_a_slot_less_than_15_minutes_away(bench: Bench):
    await start(bench, hhmm="22:20")
    planned = bench.runtime.snapshot()["planned"]["climate.salon"]
    assert dt_util.parse_datetime(planned["next_slot_end"]) == at("20:00", day=1)


async def test_no_next_slot_is_published_for_a_week_on_a_single_preset(bench: Bench):
    await start(bench, schedules={"climate.salon": {"normal": every_day(("00:00", "eco"))}})
    assert bench.runtime.snapshot()["planned"]["climate.salon"]["next_slot_end"] is None


async def test_the_card_is_told_when_the_next_slot_moves_on(bench: Bench):
    """At 22:16 the slot of 22:30 is less than 15 minutes away: the button shows the next one."""
    from custom_components.chauffage.websocket import _Subscriber

    class Connection:  # the card's websocket
        def __init__(self) -> None:
            self.sent: list[str | None] = []

        def send_message(self, message: dict) -> None:
            self.sent.append(message["event"]["planned"]["climate.salon"]["next_slot_end"])

    await start(bench, hhmm="22:10")
    card = Connection()
    _Subscriber(card, 1).attach(bench.runtime)
    await bench.go_to("22:16")
    assert [dt_util.parse_datetime(end) for end in card.sent] == [at("22:30"), at("20:00", day=1)]


async def test_the_next_slot_published_is_accepted_as_the_next_slot(bench: Bench):
    await start(bench, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    end = bench.runtime.snapshot()["planned"]["climate.salon"]["next_slot_end"]
    await bench.set_override("climate.salon", {**o, "end": end, "ends_at": "next_slot"})
    assert bench.overrides()["climate.salon"]["ends_at"] == "next_slot"


# ----- the end set to the next slot from the card (#83, iteration 1) -----

async def test_an_end_set_to_the_next_slot_on_the_card_says_next_slot(bench: Bench):
    """By default the change lasts until 23:30; "Until the next slot" on the card sets 22:30."""
    await start(bench, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "end": at("22:30").isoformat(), "ends_at": "next_slot"})
    o = bench.overrides()["climate.salon"]
    assert end_of(o) == at("22:30")
    assert o["ends_at"] == "next_slot"


async def test_a_new_override_from_the_card_until_the_next_slot_says_next_slot(bench: Bench):
    await start(bench, hhmm="21:30")
    override = bench.runtime.new_override({"temperature": 22}, end=at("22:30"))
    await bench.set_override("climate.salon", override | {"ends_at": "next_slot"})
    assert bench.overrides()["climate.salon"]["ends_at"] == "next_slot"


async def test_an_end_said_to_be_the_next_slot_that_is_not_says_nothing(bench: Bench):
    """The integration checks the next slot itself: 23:00 is no slot."""
    await start(bench, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "end": at("23:00").isoformat(), "ends_at": "next_slot"})
    assert "ends_at" not in bench.overrides()["climate.salon"]


async def test_an_end_moved_from_the_next_slot_no_longer_says_next_slot(bench: Bench):
    """+30 min on an override ending at the next slot: the card sends the former reason along."""
    await start(bench, WITHIN, hhmm="21:30")
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "end": (end_of(o) + timedelta(minutes=30)).isoformat()})
    assert "ends_at" not in bench.overrides()["climate.salon"]
