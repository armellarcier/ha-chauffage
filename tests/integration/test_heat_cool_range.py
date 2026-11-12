"""Heat/cool on a thermostat that takes a range of temperatures, and on one that takes a single
setpoint there; a preset that loses a temperature the weeks use (#91, the code review)."""

import pytest
from homeassistant.exceptions import ServiceValidationError

from conftest import CTX_USER, KINDS, MANUAL_PRESET, Bench

from custom_components.chauffage import engine, model

SALON, BUREAU = "climate.salon", "climate.bureau"
REVERSIBLE = ["off", "heat", "cool", "heat_cool", "dry", "auto", "fan_only"]
SINGLE, RANGE = 1, 1 | 2  # ClimateEntityFeature.TARGET_TEMPERATURE, and with TARGET_TEMPERATURE_RANGE
PRESETS = {p["id"]: p for p in model.default_presets("en")}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def start(bench: Bench, day: list, state: str = "heat", features: int = RANGE, modes: list[str] | None = None,
                **attributes) -> None:
    """The salon is an air conditioner, the bureau a heater."""
    await bench.go_to("10:00")
    bench.thermostat(SALON, "eco", state=state, hvac_modes=modes or REVERSIBLE, supported_features=features, **attributes)
    bench.thermostat(BUREAU, "eco")
    await bench.setup()
    await bench.save_weeks({entity: {"normal": [day] * 7} for entity in (SALON, BUREAU)})
    clear(bench)


def clear(bench: Bench) -> None:
    bench.applied()
    bench.powered()
    bench.temperature_calls.clear()
    bench.range_calls.clear()


async def override(bench: Bench, entity_id: str = SALON, **data) -> None:
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": entity_id, **data}, blocking=True)
    await bench.hass.async_block_till_done()


def by_hand(bench: Bench, state: str, temperature: float | None = None, features: int = RANGE, **attributes) -> None:
    preset = "eco" if temperature is None else MANUAL_PRESET[bench.kind]
    bench.thermostat(SALON, preset, temperature, state=state, hvac_modes=REVERSIBLE, supported_features=features,
                     context=CTX_USER, **attributes)


# ----- a range is sent whole -----

async def test_a_range_whose_low_is_already_shown_is_sent_whole(bench: Bench):
    """climate.set_temperature takes target_temp_low and target_temp_high together. A range
    whose low the thermostat already shows was sent as its high alone: Home Assistant refused
    it, and Chauffage sent it again every minute."""
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    await override(bench, hvac_mode="heat_cool", target_temp_low=17, target_temp_high=24)
    assert bench.range_calls == [(SALON, 17.0, 24.0)]
    await bench.advance(3)
    assert bench.range_calls == [(SALON, 17.0, 24.0)] and bench.runtime.pending(SALON) == []


# ----- heat/cool with a single setpoint -----

async def test_a_setpoint_changed_by_hand_in_heat_cool_is_an_override_without_a_range(bench: Bench):
    """A thermostat that takes one setpoint in heat/cool, as a Daikin: its setpoint changed by
    hand is an override, as in heat."""
    await start(bench, [["00:00", "eco"]], features=SINGLE)
    by_hand(bench, "heat_cool", features=SINGLE)
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": "heat_cool"}
    by_hand(bench, "heat_cool", 23.0, features=SINGLE)
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"]["temperature"] == 23.0
    assert bench.temperature_calls == [] and bench.range_calls == []


def test_a_single_setpoint_in_heat_cool_is_read_only_without_a_range():
    before = engine.Thermostat("heat_cool", None, 21.0, hvac_modes=tuple(REVERSIBLE))
    after = engine.Thermostat("heat_cool", None, 23.0, hvac_modes=tuple(REVERSIBLE))
    assert engine.manual_change(before, after, by_user=True) == {"temperature": 23.0}
    ranged = {"supports_range": True, "target_temp_low": 18.0, "target_temp_high": 25.0}
    before, after = (engine.Thermostat("heat_cool", None, t, hvac_modes=tuple(REVERSIBLE), **ranged) for t in (21.0, 23.0))
    assert engine.manual_change(before, after, by_user=True) is None


# ----- a temperature in heat/cool on a thermostat that takes a range -----

def test_a_temperature_is_never_sent_in_heat_cool_to_a_thermostat_that_takes_a_range():
    ranged = engine.Thermostat("heat_cool", None, None, hvac_modes=tuple(REVERSIBLE), supports_range=True)
    assert engine.complete({"temperature": 22.0}, ranged, by_user=True) == {}
    single = engine.Thermostat("heat_cool", None, 21.0, hvac_modes=tuple(REVERSIBLE))
    assert engine.complete({"temperature": 22.0}, single, by_user=True) == {"temperature": 22.0}


async def test_set_override_refuses_a_temperature_while_the_thermostat_runs_heat_cool_on_a_range(bench: Bench):
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    with pytest.raises(ServiceValidationError):
        await override(bench, temperature=22)
    assert bench.overrides() == {} and bench.temperature_calls == []
    # With an HVAC mode that takes one setpoint, the temperature is sent
    await override(bench, temperature=22, hvac_mode="heat")
    assert bench.powered() == {SALON: "heat"} and bench.temperature_calls == [(SALON, 22.0)]


async def test_a_temperature_set_from_the_card_in_heat_cool_is_not_sent_again_every_minute(bench: Bench):
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    await bench.set_override(SALON, bench.runtime.new_override({"temperature": 22.0}))
    await bench.advance(3)
    assert bench.temperature_calls == [] and bench.runtime.pending(SALON) == []


# ----- a valve that lists heat and auto -----

async def test_an_override_without_an_hvac_mode_keeps_a_valve_in_auto(bench: Bench):
    """What the card sends for a preset tapped on a valve that lists heat and auto: no HVAC
    mode. The valve keeps auto, during the override and after it."""
    await start(bench, [["00:00", "eco"]], state="auto", features=SINGLE, modes=["off", "heat", "auto"])
    await override(bench, preset="comfort", duration=30)
    assert bench.powered() == {} and "hvac_mode" not in bench.overrides()[SALON]["target"]
    await bench.advance(31)
    assert bench.overrides() == {} and bench.powered() == {}
    assert bench.hass.states.get(SALON).state == "auto"


# ----- the range is checked once fitted to the thermostat -----

def test_a_range_is_checked_once_fitted_to_the_thermostat():
    """27 °C and 29 °C on a thermostat that goes up to 26 °C: both become 26 °C, not a range."""
    unit = engine.Thermostat("heat", None, 20.0, hvac_modes=tuple(REVERSIBLE), supports_range=True, max_temp=26.0)
    value = engine.value_on({**PRESETS["comfort"], "temperature": 27.0, "cool_temperature": 29.0}, None, unit, False)
    assert "target_temp_low" not in value and "heat_cool" not in engine.offered_modes(value)
    value = engine.value_on(PRESETS["comfort"], None, unit, False)
    assert (value["target_temp_low"], value["target_temp_high"]) == (20.0, 25.0)


# ----- a preset that loses a temperature the weeks use -----

def presets_without(preset_id: str, key: str) -> list[dict]:
    return [{**p, key: None} if p["id"] == preset_id else dict(p) for p in PRESETS.values()]


async def test_a_heating_temperature_used_in_the_weeks_cannot_be_cleared(bench: Bench):
    await start(bench, [["00:00", "eco"], ["12:00", "comfort"]])
    with pytest.raises(model.InvalidData, match="eco"):
        await bench.runtime.set_presets(presets_without("eco", "temperature"))
    assert bench.runtime.presets_by_id["eco"]["temperature"] == 17.0
    # Boost is in no week: its temperature when heating can be cleared
    await bench.runtime.set_presets(presets_without("boost", "temperature"))
    assert bench.runtime.presets_by_id["boost"]["temperature"] is None


async def test_a_cooling_temperature_used_in_the_weeks_cannot_be_cleared(bench: Bench):
    await start(bench, [["00:00", "eco"], ["12:00", "comfort", {"hvac_mode": "cool"}]])
    with pytest.raises(model.InvalidData, match="comfort"):
        await bench.runtime.set_presets(presets_without("comfort", "cool_temperature"))
    # Eco only heats in the weeks: its temperature when cooling can be cleared
    await bench.runtime.set_presets(presets_without("eco", "cool_temperature"))
    assert "cool_temperature" not in bench.runtime.presets_by_id["eco"]


async def test_a_temperature_set_on_the_thermostat_lets_the_preset_lose_its_own(bench: Bench):
    """The salon cools on Comfort at its own 24 °C: Comfort's default when cooling is not used."""
    await start(bench, [["00:00", "comfort", {"hvac_mode": "cool"}]])
    await bench.runtime.set_mapping(SALON, {"comfort": {"cool_temperature": 24}})
    await bench.runtime.set_presets(presets_without("comfort", "cool_temperature"))
    assert "cool_temperature" not in bench.runtime.presets_by_id["comfort"]


async def test_a_heater_that_is_off_is_not_turned_on_by_a_slot_without_a_value(bench: Bench):
    """Data stored before the refusal: a heater's slot on a preset without a temperature when
    heating. The slot has nothing to send, so it turns nothing on."""
    await start(bench, [["00:00", "eco"], ["12:00", "comfort"]])
    bench.runtime.data["presets"] = presets_without("comfort", "temperature")
    bench.thermostat(BUREAU, "eco", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    bench.runtime.data["overrides"].clear()
    clear(bench)
    await bench.go_to("12:00")
    assert BUREAU not in bench.powered() and BUREAU not in bench.applied()


def test_an_empty_target_turns_nothing_on():
    off = engine.Thermostat("off", None, 20.0, hvac_modes=("off", "heat"))
    assert engine.complete({}, off) == {}
    assert engine.complete({"temperature": 19.0}, off) == {"temperature": 19.0, "hvac_mode": "heat"}
