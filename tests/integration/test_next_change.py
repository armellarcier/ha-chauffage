"""The *Next change* sensor, for preheating tools (#82): when Chauffage next changes a thermostat,
and to what."""

import pytest
from homeassistant.helpers import entity_registry as er

from conftest import CTX_AUTOMATION, KINDS, WEEKDAY, Bench, every_day
from hvac_helpers import COOL_WEEKDAY, OFF, PRESETS, start_ac

from custom_components.chauffage.const import DOMAIN

SENSOR = "sensor.salon_next_change"
WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": every_day(("00:00", "frost"))}}
# What the comfort preset sends to each kind of thermostat
COMFORT = {"vtherm": {"preset_mode": "comfort"}, "standard": {"preset_mode": "comfort"},
           "plain": {"temperature": 20.0}}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def start(bench: Bench, weeks: dict = WEEKS, **attributes) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon", **attributes)
    await bench.setup()
    await bench.save_weeks(weeks)


async def test_the_next_change_sensor_is_a_timestamp_enabled_on_the_thermostat_s_device(bench: Bench):
    await start(bench)
    registry = er.async_get(bench.hass)
    entry = registry.async_get(SENSOR)
    assert entry.disabled_by is None
    assert entry.platform == DOMAIN and entry.unique_id.endswith("_climate.salon_next_change")
    planned = registry.async_get("sensor.salon_planned_preset")
    assert entry.device_id == planned.device_id
    assert bench.hass.states.get(SENSOR).attributes["device_class"] == "timestamp"


async def test_the_next_change_is_the_next_slot_that_sends_something_different(bench: Bench):
    await start(bench)
    state = bench.hass.states.get(SENSOR)
    assert state.state == "2026-10-12T15:30:00+00:00"  # 17:30 in Paris
    assert state.attributes["preset"] == "comfort"
    assert state.attributes["preset_name"] == "Comfort"
    assert state.attributes["target"] == COMFORT[bench.kind]
    await bench.go_to("17:30")
    assert bench.hass.states.get(SENSOR).state == "2026-10-12T20:30:00+00:00"  # eco at 22:30


async def test_the_next_change_gives_the_temperature_of_the_slot_on_the_thermostat(bench: Bench):
    """The temperature the thermostat will have: the slot's temperature, or what its own preset
    gives, published or learned. None while Chauffage doesn't know it."""
    await start(bench)
    expected = {"vtherm": None, "standard": None, "plain": 20.0}
    assert bench.hass.states.get(SENSOR).attributes["temperature"] == expected[bench.kind]


async def test_the_next_change_reads_the_temperatures_versatile_thermostat_publishes(bench: Bench):
    bench.needs("vtherm")
    bench.versatile_thermostat("climate.salon")
    await start(bench, preset_temperatures={"comfort_temp": 19.5, "eco_temp": 16.5, "boost_temp": 22, "frost_temp": 8})
    await bench.advance(1)
    assert bench.hass.states.get(SENSOR).attributes["temperature"] == 19.5


async def test_with_an_override_the_next_change_is_its_end_with_the_slot_that_runs_then(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)  # an override until 12:00
    state = bench.hass.states.get(SENSOR)
    assert state.state == "2026-10-12T10:00:00+00:00"  # 12:00 in Paris
    assert state.attributes["preset"] == "eco"


async def test_a_slot_that_sends_the_same_thing_is_not_a_change(bench: Bench):
    """Comfort at 17:30, then boost at 20:00 with the temperature of comfort. Without presets,
    Chauffage sends 20 °C twice: boost is no change. With presets, it sends boost."""
    await start(bench, {"climate.salon": {"normal": every_day(
        ("00:00", "eco"), ("17:30", "comfort"), ("20:00", "boost"), ("22:30", "eco"))}})
    presets = [dict(p) for p in bench.runtime.data["presets"]]
    next(p for p in presets if p["id"] == "boost")["temperature"] = 20.0
    await bench.runtime.set_presets(presets)
    await bench.go_to("18:00")
    state = bench.hass.states.get(SENSOR)
    if bench.kind == "plain":
        assert state.state == "2026-10-12T20:30:00+00:00"  # eco at 22:30
        assert state.attributes["preset"] == "eco"
    else:
        assert state.state == "2026-10-12T18:00:00+00:00"  # boost at 20:00
        assert state.attributes["preset"] == "boost"


async def test_a_week_that_never_changes_the_thermostat_has_no_next_change(bench: Bench):
    await start(bench)
    await bench.activate_schedule("Away")
    assert bench.hass.states.get(SENSOR).state == "unknown"


async def test_the_next_change_follows_the_schedule_a_rule_or_the_user_activates(bench: Bench):
    await start(bench)
    await bench.activate_schedule("Away")
    await bench.activate_schedule("Normal")
    assert bench.hass.states.get(SENSOR).state == "2026-10-12T15:30:00+00:00"


async def test_an_off_slot_is_a_change_without_a_temperature(bench: Bench):
    await start(bench, {"climate.salon": {"normal": every_day(("00:00", "eco"), ("22:30", None, OFF))}})
    state = bench.hass.states.get(SENSOR)
    assert state.state == "2026-10-12T20:30:00+00:00"
    assert state.attributes["preset"] is None
    assert state.attributes["hvac_mode"] == "off"
    assert state.attributes["temperature"] is None


async def test_the_next_change_of_an_air_conditioner_gives_what_it_will_cool_at(bench: Bench):
    """The target is what Chauffage sends in the slot's HVAC mode: the cooling value of the
    preset, never the value of another HVAC mode."""
    await start_ac(bench, day=COOL_WEEKDAY, state="cool")
    state = bench.hass.states.get(SENSOR)
    assert state.state == "2026-10-12T15:30:00+00:00"
    target = state.attributes["target"]
    assert target["hvac_mode"] == "cool"
    assert not set(target) & {"cool_preset_mode", "cool_temperature", "target_temp_low", "target_temp_high"}
    if bench.kind == "plain":
        assert target["temperature"] == state.attributes["temperature"] == PRESETS["comfort"]["cool_temperature"]


async def test_the_next_change_of_a_paused_thermostat_is_unavailable(bench: Bench):
    await start(bench)
    await bench.runtime.set_paused("climate.salon", True)
    await bench.hass.async_block_till_done()
    assert bench.hass.states.get(SENSOR).state == "unavailable"


async def test_a_preheating_tool_that_applies_the_next_slot_early_creates_no_override(bench: Bench):
    """A preheating tool applies comfort at 16:45, with a parent context: no override. At 17:30,
    the thermostat already has comfort, so nothing changes."""
    await start(bench)
    await bench.go_to("16:45")
    bench.applied()
    await bench.thermostat_applies("climate.salon", "comfort")
    assert bench.overrides() == {}
    await bench.go_to("17:30")
    assert bench.overrides() == {}
    assert bench.applied() == {}
    assert bench.hass.states.get("climate.salon").attributes["temperature"] == 20.0
