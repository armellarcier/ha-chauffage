"""Overrides: temporary manual setpoints (ported from tests/ha/test_overrides.py)."""

from datetime import timedelta
from enum import Enum

from conftest import CTX_AUTOMATION, CTX_USER, Bench, every_day
from homeassistant.util import dt as dt_util

SCHEDULES = {
    "climate.salon": {"normal": every_day(("00:00", "eco"), ("06:30", "comfort"), ("08:30", "eco"), ("17:30", "comfort"))},
    "climate.bureau": {"normal": every_day(("00:00", "eco"))},
}


async def start(bench: Bench, options: dict | None = None) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup(options)
    await bench.save_schedules(SCHEDULES)
    bench.applied_presets()


def end_of(override: dict):
    return dt_util.parse_datetime(override["end"])


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
    await bench.save_schedules({**SCHEDULES, "climate.cuisine": {"normal": every_day(("00:00", "eco"))}})
    await bench.manual_setpoint("climate.cuisine", 22)
    assert "climate.cuisine" in bench.overrides()


# ----- during an override -----

async def test_a_slot_change_does_not_overwrite_an_override(bench: Bench):
    await start(bench)
    await bench.go_to("17:00")
    await bench.manual_setpoint("climate.salon", 21.5)  # override until 19:00
    await bench.go_to("17:30")  # start of the comfort slot
    assert bench.applied_presets() == {}


async def test_a_forced_realignment_spares_overridden_thermostats(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    bench.thermostat("climate.bureau", "boost", context=CTX_AUTOMATION)  # off schedule
    await bench.save_schedules(SCHEDULES)  # saved from the card → realignment
    assert bench.applied_presets() == {"climate.bureau": "eco"}


async def test_a_new_manual_change_restarts_the_2_hours(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    await bench.advance(30)
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    assert o["value"] == 22
    assert end_of(o) == dt_util.utcnow().replace(microsecond=0) + timedelta(hours=2)


# ----- end of an override -----

async def test_when_the_override_ends_the_thermostat_resumes_its_schedule(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)  # 10:00 → 12:00

    await bench.go_to("11:59")
    assert bench.applied_presets() == {}
    await bench.go_to("12:00")
    assert bench.applied_presets() == {"climate.salon": "eco"}
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
    assert bench.applied_presets() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_removing_the_override_resumes_the_schedule_immediately(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    await bench.set_override("climate.salon", None)  # "Resume the schedule" button
    assert bench.applied_presets() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_extending_the_override_delays_the_resume(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    o = bench.overrides()["climate.salon"]
    new_end = end_of(o) + timedelta(hours=1)  # card's "+1 h" button
    await bench.set_override("climate.salon", {**o, "end": new_end.isoformat()})

    await bench.go_to("12:00")
    assert bench.applied_presets() == {}
    await bench.go_to("13:00")
    assert bench.applied_presets() == {"climate.salon": "eco"}


async def test_overrides_of_other_thermostats_are_kept(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    await bench.manual_setpoint("climate.bureau", 19)
    assert set(bench.overrides()) == {"climate.salon", "climate.bureau"}
    await bench.set_override("climate.salon", None)
    assert set(bench.overrides()) == {"climate.bureau"}


async def test_an_enum_preset_does_not_break_detection(bench: Bench):
    """Regression (production): a ZHA valve exposes preset_mode as an Enum."""

    class Preset(Enum):
        NONE = "none"
        ECO = "eco"

    await start(bench)
    bench.thermostat("climate.bureau", Preset.ECO)
    await bench.hass.async_block_till_done()
    await bench.manual_setpoint("climate.salon", 21)
    assert "climate.salon" in bench.overrides()
    assert "climate.bureau" not in bench.overrides()
    await bench.save_schedules(SCHEDULES)
    assert bench.applied_presets() == {}


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
    await start(bench)
    bench.thermostat("climate.salon", "safety", 7)  # no context: the thermostat itself
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "eco", 17)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}


async def test_slot_changes_are_still_sent_during_safety_mode(bench: Bench):
    """VTherm records the requested preset and applies it when safety mode ends."""
    await start(bench)
    await bench.go_to("17:00")
    bench.thermostat("climate.salon", "safety", 7)
    await bench.go_to("17:30")
    assert bench.applied_presets() == {"climate.salon": "comfort"}


async def test_a_preset_picked_by_a_user_during_safety_mode_is_an_override(bench: Bench):
    await start(bench)
    bench.thermostat("climate.salon", "safety", 7)
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "comfort", 20, context=CTX_USER)
    await bench.hass.async_block_till_done()
    o = bench.overrides()["climate.salon"]
    assert (o["kind"], o["value"]) == ("preset", "comfort")
