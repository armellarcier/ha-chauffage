"""Applying the weekly schedules ("programmes hebdomadaires" automation)."""

from enum import Enum

from conftest import Bench

WEEKDAY = ["00:00 eco", "06:30 comfort", "08:30 eco", "17:30 comfort", "22:30 eco"]
WEEKEND = ["00:00 eco", "08:00 comfort", "23:00 eco"]

SCHEDULES = {
    "climate.salon": {
        "Normal": [WEEKDAY] * 5 + [WEEKEND] * 2,
        "Absent": [["00:00 eco"]] * 7,
        "Vacances": [["00:00 frost"]] * 7,
    },
    "climate.bureau": {
        "Normal": [["00:00 eco", "09:00 comfort", "18:00 eco"]] * 7,
        "Absent": [["00:00 frost"]] * 7,
    },
}


async def start(bench: Bench, hhmm: str = "10:00", day: int = 0) -> None:
    """Thermostats in eco, clock set, schedules saved (forces a realignment)."""
    await bench.go_to(hhmm, day)
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.save_schedules(SCHEDULES)


async def test_saving_schedules_realigns_every_thermostat(bench: Bench):
    await start(bench, "10:00")  # Monday 10:00: living room in eco (08:30), office in comfort (09:00)
    assert bench.applied_presets() == {"climate.bureau": "comfort"}


async def test_a_preset_already_active_is_not_sent_again(bench: Bench):
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "comfort")
    await bench.save_schedules(SCHEDULES)
    assert bench.applied_presets() == {}


async def test_the_preset_changes_exactly_at_the_slot_start(bench: Bench):
    await start(bench, "06:00")
    bench.applied_presets()
    await bench.go_to("06:29")
    assert bench.applied_presets() == {}
    await bench.go_to("06:30")
    assert bench.applied_presets() == {"climate.salon": "comfort"}


async def test_between_two_slots_nothing_is_sent(bench: Bench):
    """Outside slot changes, the schedule leaves thermostats alone (checked every minute)."""
    await start(bench, "10:00")
    bench.applied_presets()
    bench.thermostat("climate.salon", "boost", context=None)
    await bench.go_to("10:01")
    await bench.go_to("10:02")
    assert bench.applied_presets() == {}


async def test_the_day_of_the_week_is_respected(bench: Bench):
    await start(bench, "07:00", day=5)  # Saturday 07:00: weekend schedule → still eco
    bench.applied_presets()
    await bench.go_to("08:00", day=5)
    assert bench.applied_presets() == {"climate.salon": "comfort"}


async def test_changing_mode_applies_that_mode_s_schedule(bench: Bench):
    await start(bench, "10:00")
    bench.applied_presets()
    await bench.set_mode("Absent")
    assert bench.applied_presets() == {"climate.bureau": "frost"}  # living room already in eco


async def test_a_thermostat_without_a_schedule_for_the_mode_is_left_alone(bench: Bench):
    await start(bench, "10:00")
    bench.applied_presets()
    await bench.set_mode("Vacances")  # the office has no "Vacances" schedule
    assert bench.applied_presets() == {"climate.salon": "frost"}


async def test_a_thermostat_turned_off_is_ignored(bench: Bench):
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco", state="off")
    await bench.save_schedules(SCHEDULES)
    assert bench.applied_presets() == {}


async def test_an_unreachable_thermostat_does_not_block_the_others(bench: Bench):
    """Zigbee error (NWK_NO_ROUTE) on one valve: the next ones are still driven."""
    bench.unreachable.add("climate.salon")  # first thermostat driven (schedule order)
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "comfort")
    bench.thermostat("climate.bureau", "eco")
    await bench.save_schedules(SCHEDULES)
    assert bench.calls == [("climate.salon", "eco"), ("climate.bureau", "comfort")]


async def test_an_enum_preset_is_compared_correctly(bench: Bench):
    """ZHA exposes preset_mode as an Enum: "Preset.ECO" must be recognized as "eco"."""

    class Preset(Enum):
        ECO = "eco"

    await bench.go_to("10:00")
    bench.thermostat("climate.salon", Preset.ECO)
    bench.thermostat("climate.bureau", "comfort")
    await bench.save_schedules(SCHEDULES)
    assert bench.applied_presets() == {}


# ----- stored data version (see CONTRIBUTING.md, "Data versions and migrations") -----

def schedules_sensor(bench: Bench):
    return bench.hass.states.get("sensor.programmes_chauffage")


async def test_the_schema_version_sent_by_the_card_is_stored(bench: Bench):
    bench.hass.bus.async_fire("chauffage_programmes_set", {"programmes": SCHEDULES, "version": 1})
    await bench.hass.async_block_till_done()
    assert schedules_sensor(bench).attributes["version"] == 1


async def test_data_saved_without_a_version_is_version_1(bench: Bench):
    await bench.save_schedules(SCHEDULES)  # card older than v0.1.0
    assert schedules_sensor(bench).attributes["version"] == 1
    assert schedules_sensor(bench).attributes["programmes"] == SCHEDULES


async def test_the_data_before_a_migration_is_kept_until_the_next_one(bench: Bench):
    previous = {"version": 1, "programmes": SCHEDULES}
    bench.hass.bus.async_fire("chauffage_programmes_set",
                              {"programmes": SCHEDULES, "version": 2, "previous": previous})
    await bench.hass.async_block_till_done()
    assert schedules_sensor(bench).attributes["previous"] == previous
    # A later save from the card keeps the backup
    bench.hass.bus.async_fire("chauffage_programmes_set", {"programmes": {}, "version": 2})
    await bench.hass.async_block_till_done()
    assert schedules_sensor(bench).attributes["previous"] == previous
    assert schedules_sensor(bench).attributes["programmes"] == {}
