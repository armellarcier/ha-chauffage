"""Overrides: temporary manual setpoints ("dérogation manuelle" automation,
sensor.derogations_chauffage, schedule resumed when the override ends)."""

from datetime import timedelta
from enum import Enum

from conftest import CTX_AUTOMATION, CTX_USER, Bench
from homeassistant.util import dt as dt_util

SCHEDULES = {
    "climate.salon": {"Normal": [["00:00 eco", "06:30 comfort", "08:30 eco", "17:30 comfort"]] * 7},
    "climate.bureau": {"Normal": [["00:00 eco"]] * 7},
}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.save_schedules(SCHEDULES)
    bench.applied_presets()


def end_of(override: dict):
    return dt_util.parse_datetime(override["fin"])


# ----- detection -----

async def test_a_setpoint_changed_by_hand_creates_a_2_hour_override(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)

    o = bench.overrides()["climate.salon"]
    assert o["type"] == "temp"
    assert float(o["valeur"]) == 21.5
    assert end_of(o) - dt_util.parse_datetime(o["debut"]) == timedelta(hours=2)


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
    assert (o["type"], o["valeur"]) == ("preset", "boost")


async def test_a_thermostat_without_a_schedule_is_not_watched(bench: Bench):
    await start(bench)
    bench.thermostat("climate.cuisine", "eco")
    await bench.hass.async_block_till_done()
    await bench.manual_setpoint("climate.cuisine", 22)
    assert "climate.cuisine" not in bench.overrides()


async def test_a_thermostat_added_to_the_schedules_is_watched_without_configuration(bench: Bench):
    await start(bench)
    bench.thermostat("climate.cuisine", "eco")
    await bench.save_schedules({**SCHEDULES, "climate.cuisine": {"Normal": [["00:00 eco"]] * 7}})
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
    await bench.advance(1)  # frozen clock: otherwise the sensor would keep the same timestamp
    await bench.save_schedules(SCHEDULES)  # saved from the card → realignment
    assert bench.applied_presets() == {"climate.bureau": "eco"}


async def test_a_new_manual_change_restarts_the_2_hours(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    await bench.advance(30)
    await bench.manual_setpoint("climate.salon", 22)
    o = bench.overrides()["climate.salon"]
    assert float(o["valeur"]) == 22
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


async def test_removing_the_override_resumes_the_schedule_immediately(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    await bench.set_override("climate.salon", None)  # "Reprendre le programme" button
    assert bench.applied_presets() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_extending_the_override_delays_the_resume(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    o = bench.overrides()["climate.salon"]
    new_end = end_of(o) + timedelta(hours=1)  # card's "+1 h" button
    await bench.set_override("climate.salon", {**o, "fin": new_end.isoformat()})

    await bench.go_to("12:00")
    assert bench.applied_presets() == {}
    await bench.go_to("13:00")
    assert bench.applied_presets() == {"climate.salon": "eco"}


# ----- override sensor -----

async def test_the_sensor_keeps_the_other_thermostats(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    await bench.manual_setpoint("climate.bureau", 19)
    assert set(bench.overrides()) == {"climate.salon", "climate.bureau"}

    await bench.set_override("climate.salon", None)
    assert set(bench.overrides()) == {"climate.bureau"}


async def test_the_sensors_store_real_dictionaries(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    assert isinstance(bench.hass.states.get("sensor.derogations_chauffage").attributes["derogations"], dict)
    assert isinstance(bench.hass.states.get("sensor.suivi_vannes_chauffage").attributes["vannes"], dict)


async def test_an_enum_preset_does_not_break_detection(bench: Bench):
    """Regression (production): a ZHA valve exposes preset_mode as an Enum
    (<Preset.NONE: 'none'>). Without conversion the tracking sensor became unreadable
    text and no override was detected anymore, for any thermostat."""

    class Preset(Enum):
        NONE = "none"
        ECO = "eco"

    await start(bench)
    bench.thermostat("climate.bureau", Preset.ECO)
    await bench.hass.async_block_till_done()
    await bench.manual_setpoint("climate.salon", 21)

    tracked = bench.hass.states.get("sensor.suivi_vannes_chauffage").attributes["vannes"]
    assert isinstance(tracked, dict)
    assert tracked["climate.bureau"]["p"] == "eco"
    assert "climate.salon" in bench.overrides()


async def test_leaving_safety_mode_is_not_an_override(bench: Bench):
    """Versatile Thermostat enters safety mode (no temperature received), then leaves it to
    preset "none" with a setpoint: not a manual change."""
    await start(bench)
    bench.thermostat("climate.salon", "safety", 7)
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "none", 18)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
