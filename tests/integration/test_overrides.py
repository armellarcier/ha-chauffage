"""Overrides: temporary manual setpoints."""

from datetime import timedelta
from enum import Enum

import pytest

from conftest import CTX_AUTOMATION, CTX_USER, MANUAL_PRESET, Bench, every_day, KINDS
from homeassistant.util import dt as dt_util


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


SCHEDULES = {
    "climate.salon": {"normal": every_day(("00:00", "eco"), ("06:30", "comfort"), ("08:30", "eco"), ("17:30", "comfort"))},
    "climate.bureau": {"normal": every_day(("00:00", "eco"))},
}


async def start(bench: Bench, options: dict | None = None) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup(options)
    await bench.save_weeks(SCHEDULES)
    bench.applied()


def end_of(override: dict):
    return dt_util.parse_datetime(override["end"])


def card_choice(bench: Bench, entity_id: str, preset: str) -> dict:
    """What the card sends for a preset picked in the override popover: what that preset means
    on this thermostat (its climate preset, or a temperature), as the integration tells the card."""
    ((kind, value),) = bench.runtime.targets_of(entity_id)[preset].items()
    return {"kind": kind, "value": value}


# ----- detection -----

async def test_a_setpoint_changed_by_hand_creates_a_2_hour_override(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)

    o = bench.overrides()["climate.salon"]
    assert (o["kind"], o["value"]) == ("temperature", 21.5)
    assert end_of(o) - dt_util.parse_datetime(o["start"]) == timedelta(hours=2)


async def test_the_override_duration_is_an_option(bench: Bench):
    await start(bench, {"override_duration": 45})
    await bench.manual_setpoint("climate.salon", 21.5)
    o = bench.overrides()["climate.salon"]
    assert end_of(o) - dt_util.parse_datetime(o["start"]) == timedelta(minutes=45)


async def test_a_change_made_by_an_automation_is_not_an_override(bench: Bench):
    await start(bench)
    bench.thermostat("climate.salon", "none", 21.5, context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}


async def test_a_preset_picked_by_a_user_creates_an_override(bench: Bench):
    bench.needs("vtherm", "standard")
    await start(bench)
    bench.thermostat("climate.salon", "boost", context=CTX_USER)
    await bench.hass.async_block_till_done()
    o = bench.overrides()["climate.salon"]
    assert (o["kind"], o["value"]) == ("preset", "boost")


async def test_a_thermostat_without_a_schedule_is_not_watched(bench: Bench):
    await start(bench)
    bench.thermostat("climate.cuisine", "eco")
    await bench.hass.async_block_till_done()
    await bench.manual_setpoint("climate.cuisine", 22)
    assert "climate.cuisine" not in bench.overrides()


async def test_a_thermostat_added_to_the_schedules_is_watched_without_configuration(bench: Bench):
    await start(bench)
    bench.thermostat("climate.cuisine", "eco")
    await bench.save_weeks({**SCHEDULES, "climate.cuisine": {"normal": every_day(("00:00", "eco"))}})
    await bench.manual_setpoint("climate.cuisine", 22)
    assert "climate.cuisine" in bench.overrides()


# ----- during an override -----

async def test_a_slot_change_does_not_overwrite_an_override(bench: Bench):
    await start(bench)
    await bench.go_to("17:00")
    await bench.manual_setpoint("climate.salon", 21.5)  # override until 19:00
    await bench.go_to("17:30")  # start of the comfort slot
    assert bench.applied() == {}


async def test_a_forced_realignment_spares_overridden_thermostats(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    bench.thermostat("climate.bureau", "boost", context=CTX_AUTOMATION)  # off schedule
    await bench.save_weeks(SCHEDULES)  # saved from the card → realignment
    assert bench.applied() == {"climate.bureau": "eco"}


async def test_a_new_manual_change_restarts_the_2_hours(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    await bench.advance(30)
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    assert o["value"] == 22
    assert end_of(o) == dt_util.utcnow().replace(microsecond=0) + timedelta(hours=2)


async def test_going_back_to_the_scheduled_preset_by_hand_ends_the_override(bench: Bench):
    """Regression (issue #19): picking the slot's preset again created a "Comfort in Comfort"
    override instead of resuming the schedule."""
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    await bench.manual_setpoint("climate.bureau", 19)
    bench.thermostat("climate.salon", "eco", context=CTX_USER)  # the slot's preset, picked by hand
    await bench.hass.async_block_till_done()
    assert set(bench.overrides()) == {"climate.bureau"}
    assert bench.applied() == {}  # already as the schedule wants it


async def test_the_thermostat_switching_back_to_the_slot_s_preset_by_itself_keeps_the_override(bench: Bench):
    """A preset picked by the thermostat itself is not a user's choice (VTherm leaving its safety
    mode, for example), as for preset overrides."""
    bench.needs("vtherm", "standard")
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    bench.thermostat("climate.salon", "eco")  # no user: the thermostat itself
    await bench.hass.async_block_till_done()
    assert "climate.salon" in bench.overrides()


async def test_the_knob_turned_back_to_what_the_slot_gives_ends_the_override(bench: Bench):
    """Review of #21: a setpoint changed on the thermostat itself (its knob, no user in Home
    Assistant) is an override, so going back to what the slot gives ends it, as from Home
    Assistant. With presets, that is the temperature of the slot's preset on this thermostat,
    and the thermostat gets its preset back."""
    await start(bench)  # eco slot: 17 °C
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 21.5)  # the knob
    await bench.hass.async_block_till_done()
    assert "climate.salon" in bench.overrides()
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 17)  # the knob, back
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.applied() == ({} if bench.kind == "plain" else {"climate.salon": "eco"})


async def test_a_thermostat_coming_back_by_itself_to_a_held_slot_value_keeps_the_override(bench: Bench):
    """The slot's value held from the card past the next slots, on a VTherm mapped to
    temperatures: leaving its safety mode, it comes back to that value, which ends nothing."""
    bench.needs("vtherm")
    await start(bench)
    await bench.runtime.set_mapping("climate.salon", {"eco": {"temperature": 17}})
    bench.thermostat("climate.salon", "none", 17)  # as the schedule set it
    await bench.hass.async_block_till_done()
    hold = bench.runtime.new_override("temperature", 17, minutes=24 * 60)
    await bench.set_override("climate.salon", hold)
    bench.thermostat("climate.salon", "safety", 7)  # no temperature received
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "none", 17)  # back
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"] == hold


async def test_a_slot_with_the_override_s_preset_does_not_end_it(bench: Bench):
    """Comfort, eco, comfort, eco: an override to comfort set for the whole day during the first
    comfort slot still holds when the second eco slot starts, and when the thermostat reports
    again."""
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "comfort")
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": every_day(
        ("00:00", "comfort"), ("11:00", "eco"), ("12:00", "comfort"), ("13:00", "eco"))}})
    bench.applied()
    comfort = card_choice(bench, "climate.salon", "comfort")
    override = bench.runtime.new_override(comfort["kind"], comfort["value"], minutes=24 * 60)
    await bench.set_override("climate.salon", override)
    bench.thermostat("climate.salon", "comfort", context=CTX_USER, current_temperature=19.5)  # reports again
    await bench.hass.async_block_till_done()

    for slot in ("11:00", "12:00", "13:00"):
        await bench.go_to(slot)
        assert bench.applied() == {}, slot
        assert bench.overrides()["climate.salon"] == override, slot


async def test_the_override_of_a_change_by_hand_is_only_recorded(bench: Bench):
    """Review of #21: the thermostat set it itself. Even if it changed again before the
    override is recorded (two quick changes), nothing is sent back: that would undo the second
    change."""
    await start(bench)
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 21.5)  # already the second change
    bench.runtime.record_override("climate.salon", bench.runtime.new_override("temperature", 21))
    assert bench.temperature_calls == []
    assert bench.overrides()["climate.salon"]["value"] == 21


# ----- changing an override's value from the card -----

async def test_an_override_s_temperature_is_fitted_to_the_thermostat(bench: Bench):
    """Its limits (5 – 30 °C) and its step (0.5 °C), as for the slots."""
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "value": 35})
    assert bench.temperature_calls[-1] == ("climate.salon", 30)
    assert bench.overrides()["climate.salon"]["value"] == 30
    await bench.set_override("climate.salon", {**o, "value": 21.3})
    assert bench.temperature_calls[-1] == ("climate.salon", 21.5)
    assert bench.overrides()["climate.salon"]["value"] == 21.5

async def test_changing_the_override_s_value_from_the_card_drives_the_thermostat(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    o = bench.overrides()["climate.salon"]
    comfort = card_choice(bench, "climate.salon", "comfort")
    await bench.set_override("climate.salon", {**o, **comfort})
    assert bench.applied() == {"climate.salon": "comfort"}
    assert bench.overrides()["climate.salon"] == {**o, **comfort}  # same end


async def test_changing_only_the_end_of_an_override_does_not_drive_the_thermostat(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    o = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**o, "end": (end_of(o) + timedelta(hours=1)).isoformat()})
    assert bench.applied() == {}


async def test_an_override_changed_to_the_slot_s_preset_from_the_card_holds_through_the_next_slots(bench: Bench):
    """The way to keep comfort for the day during a comfort slot (issue #19): a manual change
    back to the slot's preset resumes the schedule, the card's choice does not."""
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "comfort")
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": every_day(
        ("00:00", "comfort"), ("11:00", "eco"), ("12:00", "comfort"), ("13:00", "eco"))}})
    await bench.manual_setpoint("climate.salon", 21.5)

    async def answering(call):  # the thermostat writes its new preset with the call's context
        bench.calls.append((call.data["entity_id"], call.data["preset_mode"]))
        bench.thermostat("climate.salon", call.data["preset_mode"], context=call.context)

    bench.hass.services.async_register("climate", "set_preset_mode", answering)
    o = bench.overrides()["climate.salon"]
    comfort = card_choice(bench, "climate.salon", "comfort")
    await bench.set_override("climate.salon", {**o, **comfort, "end": (end_of(o) + timedelta(hours=22)).isoformat()})
    assert bench.applied() == {"climate.salon": "comfort"}

    for slot in ("11:00", "12:00", "13:00"):
        await bench.go_to(slot)
        assert bench.applied() == {}, slot
        assert bench.overrides()["climate.salon"]["value"] == comfort["value"], slot


async def test_picking_the_scheduled_preset_by_hand_is_not_an_override(bench: Bench):
    await start(bench)
    bench.thermostat("climate.salon", "boost", context=CTX_AUTOMATION)  # off schedule, not an override
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "eco", context=CTX_USER)  # back to the slot's preset
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}


# ----- end of an override -----

async def test_when_the_override_ends_the_thermostat_resumes_its_schedule(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)  # 10:00 → 12:00

    await bench.go_to("11:59")
    assert bench.applied() == {}
    await bench.go_to("12:00")
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_resuming_the_schedule_does_not_create_a_new_override(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    await bench.go_to("12:00")
    await bench.thermostat_applies("climate.salon", "eco")
    assert bench.overrides() == {}


async def test_the_thermostat_answering_the_schedule_is_not_a_manual_change(bench: Bench):
    """The thermostat writes its new state with the integration's own context."""
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    runtime = bench.runtime

    async def apply_with_answer(call):
        bench.calls.append((call.data["entity_id"], call.data["preset_mode"]))
        bench.hass.states.async_set("climate.salon", "heat",
                                    {"preset_mode": call.data["preset_mode"], "temperature": 17}, context=call.context)

    bench.hass.services.async_register("climate", "set_preset_mode", apply_with_answer)
    await runtime.set_override("climate.salon", None)
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_removing_the_override_resumes_the_schedule_immediately(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    await bench.set_override("climate.salon", None)  # "Resume the schedule" button
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_extending_the_override_delays_the_resume(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    o = bench.overrides()["climate.salon"]
    new_end = end_of(o) + timedelta(hours=1)  # card's "+1 h" button
    await bench.set_override("climate.salon", {**o, "end": new_end.isoformat()})

    await bench.go_to("12:00")
    assert bench.applied() == {}
    await bench.go_to("13:00")
    assert bench.applied() == {"climate.salon": "eco"}


async def test_overrides_of_other_thermostats_are_kept(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    await bench.manual_setpoint("climate.bureau", 19)
    assert set(bench.overrides()) == {"climate.salon", "climate.bureau"}
    await bench.set_override("climate.salon", None)
    assert set(bench.overrides()) == {"climate.bureau"}


async def test_an_enum_preset_does_not_break_detection(bench: Bench):
    """Regression (production): a ZHA valve exposes preset_mode as an Enum."""
    bench.needs("vtherm", "standard")

    class Preset(Enum):
        NONE = "none"
        ECO = "eco"

    await start(bench)
    bench.thermostat("climate.bureau", Preset.ECO)
    await bench.hass.async_block_till_done()
    await bench.manual_setpoint("climate.salon", 21)
    assert "climate.salon" in bench.overrides()
    assert "climate.bureau" not in bench.overrides()
    await bench.save_weeks(SCHEDULES)
    assert bench.applied() == {}


async def test_a_change_made_by_the_integration_itself_is_not_an_override(bench: Bench):
    """The thermostat writes its new state with the context of the integration's call."""
    await start(bench)
    await bench.runtime.call_climate("set_temperature", "climate.salon", {"temperature": 23})
    await bench.hass.async_block_till_done()
    assert bench.hass.states.get("climate.salon").attributes["temperature"] == 23
    assert bench.overrides() == {}


# ----- Versatile Thermostat's safety mode (no temperature received) -----
# VTherm keeps the requested preset aside while in safety mode and returns to it afterwards:
# nothing special to handle, as long as the usual rules give the right result.

async def test_safety_mode_and_back_to_the_scheduled_preset_is_not_an_override(bench: Bench):
    bench.needs("vtherm")
    await start(bench)
    bench.thermostat("climate.salon", "safety", 7)  # no context: the thermostat itself
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "eco", 17)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}


async def test_slot_changes_are_still_sent_during_safety_mode(bench: Bench):
    """VTherm records the requested preset and applies it when safety mode ends."""
    bench.needs("vtherm")
    await start(bench)
    await bench.go_to("17:00")
    bench.thermostat("climate.salon", "safety", 7)
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_a_preset_picked_by_a_user_during_safety_mode_is_an_override(bench: Bench):
    bench.needs("vtherm")
    await start(bench)
    bench.thermostat("climate.salon", "safety", 7)
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "comfort", 20, context=CTX_USER)
    await bench.hass.async_block_till_done()
    o = bench.overrides()["climate.salon"]
    assert (o["kind"], o["value"]) == ("preset", "comfort")


# ----- which preset (issue #23) -----

async def test_an_override_set_to_a_preset_from_the_card_keeps_which_preset_it_is(bench: Bench):
    """On a thermostat without presets, Comfort is 20 °C: the override still says Comfort."""
    await start(bench)
    o = bench.runtime.new_override("temperature", 21.5)
    await bench.set_override("climate.salon", {**o, **card_choice(bench, "climate.salon", "comfort"), "preset": "comfort"})
    assert bench.applied() == {"climate.salon": "comfort"}
    assert bench.overrides()["climate.salon"]["preset"] == "comfort"


async def test_an_override_set_to_a_temperature_has_no_preset(bench: Bench):
    await start(bench)
    o = bench.runtime.new_override("temperature", 21.5)
    await bench.set_override("climate.salon", {**o, **card_choice(bench, "climate.salon", "comfort"), "preset": "comfort"})
    await bench.set_override("climate.salon", {**o, "kind": "temperature", "value": 20.0})
    assert "preset" not in bench.overrides()["climate.salon"]


async def test_a_change_by_hand_during_an_override_set_to_a_preset_is_a_temperature(bench: Bench):
    await start(bench)
    o = bench.runtime.new_override("temperature", 21.5)
    await bench.set_override("climate.salon", {**o, **card_choice(bench, "climate.salon", "comfort"), "preset": "comfort"})
    await bench.manual_setpoint("climate.salon", 21.5)
    o = bench.overrides()["climate.salon"]
    assert (o["kind"], o["value"]) == ("temperature", 21.5)
    assert "preset" not in o


async def test_set_override_with_a_preset_sets_what_that_preset_means_on_the_thermostat(bench: Bench):
    """The service's preset is a Chauffage preset: Comfort on a thermostat without presets is its
    temperature, and the override says Comfort."""
    await start(bench)
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "preset": "comfort"}, blocking=True
    )
    assert bench.applied() == {"climate.salon": "comfort"}
    o = bench.overrides()["climate.salon"]
    assert {"kind": o["kind"], "value": o["value"]} == card_choice(bench, "climate.salon", "comfort")
    assert o["preset"] == "comfort"


async def test_an_override_set_to_a_preset_ends_and_resumes_the_schedule(bench: Bench):
    await start(bench)
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "preset": "comfort", "duration": 30}, blocking=True
    )
    await bench.thermostat_applies("climate.salon", "comfort")
    bench.applied()
    await bench.go_to("10:30")
    assert bench.overrides() == {}
    assert bench.applied() == {"climate.salon": "eco"}
