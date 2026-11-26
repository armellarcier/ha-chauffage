"""Air conditioners (#91): a slot heats or cools, a thermostat is turned on in the HVAC mode it
last heated or cooled in, a switch of HVAC mode by hand is an override, and fan only, dry and
auto send no setpoint."""

import pytest
from homeassistant.core import Context

from conftest import CTX_AUTOMATION, CTX_USER, KINDS, MANUAL_PRESET, WEEKDAY, Bench
from hvac_helpers import (
    AC_MODES, BUREAU, COOL, COOLING_ONLY, COOL_WEEKDAY, FAN, HEAT, PRESETS, SALON, SINGLE, ac, by_hand, clear,
    override, presets_without, salon, sent_to, start_ac, start_ac_with_range, start_salon, state,
)

from custom_components.chauffage.domain.slot import target_of
from custom_components.chauffage.domain.target import Target
from custom_components.chauffage.domain.thermostat import Thermostat, on_mode
from custom_components.chauffage.storage import schema
from custom_components.chauffage.storage.schema import InvalidData


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


FAN_ATTRS = {"fan_modes": ["auto", "1", "2", "3"], "swing_modes": ["auto", "swing"], "fan_mode": "auto", "swing_mode": "auto"}


# ----- a slot heats or cools -----

async def test_a_cooling_slot_switches_the_air_conditioner_to_cool(bench: Bench):
    """A heater does not list cool: it ignores the slot's HVAC mode, and gets its preset."""
    await start_ac(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort", COOL]])
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "cool"}
    assert (state(bench), state(bench, BUREAU)) == ("cool", "heat")
    assert bench.applied()[BUREAU] == "comfort"


async def test_a_heating_slot_switches_a_cooling_air_conditioner_to_heat(bench: Bench):
    await start_ac(bench, "13:00", [["00:00", "eco", COOL], ["14:00", "comfort", HEAT]], state="cool")
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "heat"}
    assert bench.applied()[SALON] == "comfort"


async def test_each_slot_is_independent(bench: Bench):
    """Cool in the afternoon, then heat in the evening: a slot does not inherit the HVAC mode of
    the slot before it."""
    await start_ac(bench, "13:00", [["00:00", "eco", HEAT], ["14:00", "comfort", COOL], ["18:00", "eco", HEAT]])
    await bench.go_to("14:00")
    clear(bench)
    await bench.go_to("18:00")
    assert bench.powered() == {SALON: "heat"} and state(bench) == "heat"


async def test_a_cooling_air_conditioner_keeps_cooling(bench: Bench):
    """From a cooling slot to the next one: the HVAC mode is not sent again."""
    await start_salon(bench, "17:00", COOL_WEEKDAY, state="cool", hvac_modes=AC_MODES)
    bench.temperature_calls.clear()
    await bench.go_to("17:30")
    assert bench.powered() == {}
    # Its device preset, which the device reads in cool, else the preset's temperature when
    # cooling; never Chauffage's heating temperature
    assert bench.applied() == {"climate.salon": "25.0" if bench.kind == "plain" else "comfort"}
    assert bench.temperature_calls == ([("climate.salon", 25.0)] if bench.kind == "plain" else [])
    assert salon(bench) == "cool"


def test_the_slot_s_hvac_mode_is_the_target_s_when_the_thermostat_lists_it():
    assert target_of("comfort", PRESETS, {}, ac("heat"), settings=COOL) == {
        "preset_mode": "comfort", "cool_preset_mode": "comfort", "hvac_mode": "cool"}
    heater = Thermostat("heat", "eco", 17.0, ("eco", "comfort"), hvac_modes=("off", "heat"))
    assert target_of("comfort", PRESETS, {}, heater, settings=COOL) == {"preset_mode": "comfort"}
    assert target_of("comfort", PRESETS, {}, None, settings=COOL) == {"temperature": 20.0}  # a thermostat not seen yet


# ----- a stored slot without an HVAC mode -----

async def test_a_slot_without_an_hvac_mode_heats_on_an_air_conditioner_that_heats_and_cools(bench: Bench):
    """A week stored before #91: its slots say no HVAC mode. They are read as heat."""
    await start_ac(bench, "17:00", state="cool")
    assert bench.runtime.read_model.planned_targets(SALON)["hvac_mode"] == "heat"
    assert state(bench) == "heat"  # saving the weeks applied the slot
    bench.thermostat(SALON, "eco", state="cool", hvac_modes=AC_MODES, context=CTX_AUTOMATION)
    await bench.go_to("17:30")
    assert bench.powered() == {SALON: "heat"}
    assert bench.applied()[SALON] == "comfort"


async def test_a_slot_without_an_hvac_mode_cools_on_an_air_conditioner_that_only_cools(bench: Bench):
    await start_ac(bench, "17:00", state="cool", modes=COOLING_ONLY)
    planned = bench.runtime.read_model.planned_targets(SALON)
    assert (planned["hvac_mode"], planned["next_hvac_mode"]) == ("cool", "cool")
    await bench.go_to("17:30")
    assert bench.powered() == {} and state(bench) == "cool"


async def test_a_heating_slot_cools_on_an_air_conditioner_that_only_cools(bench: Bench):
    """A day pasted from a reversible unit: the slot says heat, the thermostat cannot."""
    await start_ac(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort", HEAT]], state="cool", modes=COOLING_ONLY)
    bench.thermostat(SALON, "eco", state="off", hvac_modes=COOLING_ONLY, context=CTX_AUTOMATION)
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "cool"}
    assert bench.runtime.read_model.planned_targets(SALON)["hvac_mode"] == "cool"


async def test_a_heater_never_carries_an_hvac_mode(bench: Bench):
    """The bureau only heats: a slot that says heat or cool says nothing to it."""
    await start_ac(bench, "13:00", [["00:00", "eco", HEAT], ["14:00", "comfort", COOL]])
    planned = bench.runtime.read_model.planned_targets(BUREAU)
    assert (planned["hvac_mode"], planned["next_hvac_mode"]) == (None, None)
    assert "hvac_mode" not in planned["target"]
    await bench.go_to("14:00")
    assert BUREAU not in bench.powered()
    assert bench.applied()[BUREAU] == "comfort"


async def test_a_slot_that_says_heat_aloud_is_not_a_new_slot_after_one_that_says_nothing(bench: Bench):
    """A day the card saved says heat on every slot; the next day, not edited, says nothing.
    Both heat: the planned-preset sensor sees one slot across midnight, not "eco, then eco"."""
    edited = [["00:00", "eco", HEAT], ["06:30", "comfort", HEAT], ["22:30", "eco", HEAT]]
    stored = [["00:00", "eco"], ["06:30", "comfort"], ["22:30", "eco"]]
    await bench.go_to("23:00")
    bench.thermostat(SALON, "eco", hvac_modes=AC_MODES)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [edited, *[stored] * 6]}})
    planned = bench.runtime.read_model.planned_targets(SALON)
    assert (planned["preset"], planned["next_preset"]) == ("eco", "comfort")
    assert planned["next_start"] == "2026-10-13T06:30:00+02:00"


# ----- turned on in the HVAC mode it last heated or cooled in -----

async def test_an_off_air_conditioner_without_heat_is_turned_on_in_the_mode_it_last_cooled_in(bench: Bench):
    modes = ["off", "dry", "cool", "fan_only"]
    await start_salon(bench, "17:00", state="cool", hvac_modes=modes)
    bench.thermostat("climate.salon", "eco", state="off", hvac_modes=modes, context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    await bench.go_to("17:30")
    assert bench.powered() == {"climate.salon": "cool"}


async def test_an_off_air_conditioner_never_seen_on_is_turned_on_in_its_first_mode(bench: Bench):
    await bench.go_to("17:00")
    bench.thermostat("climate.salon", "eco", state="off", hvac_modes=["off", "cool", "fan_only"])
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 7}})
    assert bench.powered() == {"climate.salon": "cool"}


async def test_a_preset_override_turns_on_an_air_conditioner_in_the_hvac_mode_of_its_slot(bench: Bench):
    """In summer, a script turned the unit off during a cooling slot. An override to a preset
    says no HVAC mode: the unit restarts in cool, the HVAC mode of its slot, as the card does."""
    await start_ac(bench, "10:00", [["00:00", "eco", COOL]], state="cool")
    bench.thermostat(SALON, "eco", state="off", hvac_modes=AC_MODES, context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    clear(bench)
    await override(bench, preset="comfort")
    assert bench.powered() == {SALON: "cool"}


def test_a_thermostat_is_turned_on_in_the_hvac_mode_of_its_slot_else_heat():
    """As the card chooses the HVAC mode of an override: the one of the slot planned now, among
    those that take a setpoint, else heat. Chauffage learns no HVAC mode."""
    unit = Thermostat("off", None, 20.0, hvac_modes=tuple(AC_MODES))
    assert on_mode(unit, "cool") == "cool"
    assert on_mode(unit) == "heat"
    assert on_mode(unit, "fan_only") == "heat"  # fan only takes no setpoint
    heater = Thermostat("off", None, 20.0, hvac_modes=("off", "heat"))
    assert on_mode(heater, "cool") == "heat"


async def test_a_valve_that_ran_in_auto_is_turned_on_in_heat(bench: Bench):
    """A valve that lists auto ran in auto: turned off, it restarts in heat, as before."""
    modes = ["off", "heat", "auto"]
    await start_ac(bench, "10:00", state="auto", modes=modes)
    bench.thermostat(SALON, "eco", state="off", hvac_modes=modes, context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    clear(bench)
    await override(bench, preset="comfort")
    assert bench.powered() == {SALON: "heat"}


async def test_an_air_conditioner_seen_in_dry_is_not_turned_on_in_dry(bench: Bench):
    modes = ["off", "heat", "cool", "dry", "fan_only"]
    await start_ac(bench, "10:00", [["00:00", "eco", COOL]], state="cool", modes=modes)
    bench.thermostat(SALON, "eco", state="dry", hvac_modes=modes, context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    bench.thermostat(SALON, "eco", state="off", hvac_modes=modes, context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    clear(bench)
    await override(bench, preset="comfort")
    assert bench.powered() == {SALON: "cool"}


def test_dry_and_auto_are_not_hvac_modes_to_turn_on_in_before_heat():
    modes = ("off", "heat", "cool", "dry", "auto")
    for planned in ("dry", "auto", None):
        assert on_mode(Thermostat("off", None, 20.0, hvac_modes=modes), planned) == "heat"
    assert on_mode(Thermostat("off", None, 20.0, hvac_modes=("off", "dry", "auto"))) == "auto"


def test_a_thermostat_off_or_in_fan_only_is_turned_on_for_a_preset():
    target = {"preset_mode": "comfort", "cool_preset_mode": "comfort"}
    assert Target(target).completed_for(ac("fan_only")) == {"preset_mode": "comfort", "hvac_mode": "heat"}
    cooler = ("off", "fan_only", "cool")
    assert Target(target).completed_for(ac("fan_only", modes=cooler)) == {"preset_mode": "comfort", "hvac_mode": "cool"}
    # Off and fan only alone: fan only takes no setpoint, so nothing turns it on
    assert Target(target).completed_for(ac("off", modes=("off", "fan_only"))) == {"preset_mode": "comfort"}
    assert not Target(target).satisfied_by(ac("fan_only"))
    assert Target(FAN).satisfied_by(ac("fan_only"))


async def test_a_preset_override_turns_on_an_air_conditioner_left_in_dry(bench: Bench):
    """Dry takes no setpoint: an override to a preset that says no HVAC mode leaves dry."""
    await start_ac_with_range(bench, [["00:00", None, {"hvac_mode": "dry"}]], state="dry")
    await override(bench, preset="comfort")
    assert bench.powered() == {SALON: "heat"}


async def test_a_heater_that_is_off_is_not_turned_on_by_a_slot_without_a_value(bench: Bench):
    """Data stored before the refusal: a heater's slot on a preset without a temperature when
    heating. The slot has nothing to send, so it turns nothing on."""
    await start_ac_with_range(bench, [["00:00", "eco"], ["12:00", "comfort"]])
    without = presets_without("comfort", "temperature")
    await bench.edit_stored_data(lambda data: data.update(presets=without))
    bench.thermostat(BUREAU, "eco", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    await bench.edit_stored_data(lambda data: data["overrides"].clear())
    clear(bench)
    await bench.go_to("12:00")
    assert BUREAU not in bench.powered() and BUREAU not in bench.applied()


def test_an_empty_target_turns_nothing_on():
    off = Thermostat("off", None, 20.0, hvac_modes=("off", "heat"))
    assert Target({}).completed_for(off) == {}
    assert Target({"temperature": 19.0}).completed_for(off) == {"temperature": 19.0, "hvac_mode": "heat"}


# ----- the HVAC mode switched by hand -----

async def test_a_setpoint_changed_with_the_hvac_mode_by_hand_is_in_the_override(bench: Bench):
    """climate.set_temperature with hvac_mode cool and 24 °C writes one state: the override
    holds both, not the HVAC mode alone."""
    await start_salon(bench, "10:00", [["00:00", "eco", {"hvac_mode": "heat"}]], hvac_modes=AC_MODES)
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 24.0, state="cool", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == {"hvac_mode": "cool", "temperature": 24.0}


async def test_switching_the_air_conditioner_to_heat_by_hand_in_a_cooling_slot_is_an_override(bench: Bench):
    """Only the HVAC mode changed: the override holds the HVAC mode, and Chauffage sends nothing."""
    await start_ac(bench, "10:00", [["00:00", "eco", COOL]], state="cool")
    setpoint = bench.hass.states.get(SALON).attributes["temperature"]  # only the HVAC mode changes
    clear(bench)
    bench.thermostat(SALON, "eco", setpoint, state="heat", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": "heat"}
    assert sent_to(bench) == [] and bench.applied() == {}


async def test_switching_to_fan_only_by_hand_is_an_override(bench: Bench):
    await start_ac(bench)
    bench.thermostat(SALON, "eco", state="fan_only", hvac_modes=AC_MODES, context=Context())
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"] == FAN


async def test_switching_to_cool_by_hand_sends_nothing(bench: Bench):
    """The slot heats on comfort. Switched to cool in Home Assistant's dialog, the unit keeps
    what it shows: Chauffage sends nothing, not even comfort's cooling value."""
    await start_ac(bench, "10:00", [["00:00", "comfort", HEAT]], preset="comfort")
    await bench.runtime.schedules.set_mapping(SALON, {"comfort": {"cool_temperature": 24}})
    clear(bench)
    bench.thermostat(SALON, "comfort", state="cool", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    override_ = bench.overrides()[SALON]
    assert override_["target"] == {"hvac_mode": "cool"}
    assert override_["ends_at"] == "duration"
    assert sent_to(bench) == [] and bench.applied() == {}


async def test_an_override_to_a_preset_keeps_its_preset_when_the_hvac_mode_is_switched_by_hand(bench: Bench):
    """An override to boost, then cool chosen in Home Assistant's dialog: the override adds the
    HVAC mode to boost, and its end is computed again. Chauffage sends nothing: a Versatile
    Thermostat goes to its own boost in cool (25 °C), the others keep their setpoint."""
    await start_ac(bench, "10:00", [["00:00", "eco", HEAT]])
    await bench.runtime.schedules.set_mapping(SALON, {"boost": {"cool_temperature": 24}})
    await override(bench, preset="boost", duration=180)
    bench.thermostat(SALON, "boost", hvac_modes=AC_MODES, context=CTX_AUTOMATION)  # it applies the override
    await bench.hass.async_block_till_done()
    clear(bench)
    # In cool, a Versatile Thermostat goes to its own boost for cooling; the others keep their setpoint
    own = 25.0 if bench.kind == "vtherm" else None
    bench.thermostat(SALON, "boost", own, state="cool", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    override_ = bench.overrides()[SALON]
    assert override_["preset"] == "boost" and override_["target"]["hvac_mode"] == "cool"
    assert override_["end"] == "2026-10-12T12:00:00+02:00"  # computed again from the change
    assert sent_to(bench) == []


async def test_switching_the_hvac_mode_by_hand_in_an_off_slot_keeps_the_thermostat_s_own_setpoint(bench: Bench):
    await start_ac(bench, "10:00", [["00:00", None, {"hvac_mode": "off"}]], state="off")
    bench.thermostat(SALON, "eco", state="cool", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides()[SALON]["target"] == COOL
    assert sent_to(bench) == [] and bench.applied() == {}


async def test_switching_to_dry_by_hand_is_recorded_and_sends_nothing(bench: Bench):
    """Regression: dry, auto or heat/cool chosen by hand made Chauffage send the slot's heating
    value. The override takes what the thermostat shows, and Chauffage sends nothing."""
    modes = ["off", "heat", "cool", "dry", "heat_cool"]
    await start_ac(bench, "10:00", [["00:00", "comfort", HEAT]], preset="comfort", modes=modes)
    for mode in ("dry", "heat_cool"):
        clear(bench)
        bench.thermostat(SALON, "comfort", state=mode, hvac_modes=modes, context=CTX_USER)
        await bench.hass.async_block_till_done(wait_background_tasks=True)
        assert bench.overrides()[SALON]["target"]["hvac_mode"] == mode
        assert "preset" not in bench.overrides()[SALON]
        assert sent_to(bench) == [] and bench.applied() == {} and bench.powered() == {}
    # From dry, which takes no setpoint, heat/cool shows one: the override takes it
    assert len(bench.overrides()[SALON]["target"]) == 2


async def test_a_temperature_kept_by_the_unit_in_cool_stays_in_the_override(bench: Bench):
    """An override to 22 °C while heating, then cool chosen by hand: the unit cools to 22 °C, so
    the override says so. Chauffage sends nothing, and the end is computed again."""
    await start_ac(bench, "10:00", [["00:00", "eco", HEAT]])
    await override(bench, temperature=22, duration=180)
    clear(bench)
    bench.thermostat(SALON, None if bench.kind != "vtherm" else "none", 22.0, state="cool", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    override_ = bench.overrides()[SALON]
    assert override_["target"] == {"hvac_mode": "cool", "temperature": 22.0}
    assert override_["end"] == "2026-10-12T12:00:00+02:00"
    assert sent_to(bench) == []


@pytest.mark.parametrize("mode", ["dry", "auto"])
async def test_switching_to_dry_or_auto_by_hand_is_recorded_alone(bench: Bench, mode: str):
    await start_ac_with_range(bench, [["00:00", "eco", {"hvac_mode": "heat"}]])
    by_hand(bench, mode)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": mode}
    assert bench.powered() == {} and bench.applied() == {} and bench.range_calls == []


# ----- fan only -----

async def test_a_fan_only_slot_ventilates_without_a_preset_or_a_setpoint(bench: Bench):
    day = [["00:00", "eco"], ["14:00", None, {"hvac_mode": "fan_only", "fan_mode": "3", "swing_mode": "swing"}], ["16:00", "comfort"]]
    await start_ac(bench, "13:00", day, **FAN_ATTRS)
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "fan_only"}
    assert bench.settings() == {(SALON, "fan_mode"): "3", (SALON, "swing_mode"): "swing"}
    assert SALON not in bench.applied() and sent_to(bench) == []
    assert BUREAU not in bench.powered()  # a heater has no fan: left as it is


async def test_a_preset_slot_after_a_fan_only_slot_heats_or_cools_again(bench: Bench):
    """Fan only takes no setpoint: the next slot on a preset turns the air conditioner on as it
    turns on one that is off, in heat when it lists it."""
    day = [["00:00", "eco"], ["14:00", None, FAN], ["16:00", "comfort"]]
    await start_ac(bench, "13:00", day)
    await bench.go_to("14:00")
    clear(bench)
    await bench.go_to("16:00")
    assert bench.powered() == {SALON: "heat"}


async def test_a_fan_only_slot_holds_no_preset_and_keeps_its_fan(bench: Bench):
    await start_ac(bench)
    quiet = {"hvac_mode": "fan_only", "fan_mode": "1"}
    day = [["00:00", "eco", FAN], ["08:00", None, FAN], ["12:00", None, quiet], ["13:00", "comfort", quiet], ["14:00", None, FAN]]
    await bench.save_weeks({SALON: {"normal": [day] * 7}})
    assert bench.weeks()[SALON]["normal"][0] == [
        ["00:00", None, FAN], ["08:00", None, FAN], ["12:00", None, quiet], ["13:00", None, quiet], ["14:00", None, FAN]]


async def test_a_cooling_only_air_conditioner_in_fan_only_is_turned_on_in_cool(bench: Bench):
    """A slot on a preset after a fan-only slot: fan only takes no setpoint, and the unit only
    cools."""
    cooler = ["off", "cool", "fan_only"]
    await start_ac(bench, "13:00", [["00:00", "eco"], ["14:00", None, FAN], ["16:00", "comfort"]], state="cool", hvac_modes=cooler)
    await bench.go_to("14:00")
    clear(bench)
    await bench.go_to("16:00")
    assert bench.powered() == {SALON: "cool"}


async def test_a_new_hvac_mode_gets_its_setpoint_even_when_the_thermostat_already_shows_it(bench: Bench):
    """Chauffage sends the whole target, as a scene does: a setpoint read in fan only says
    nothing of the setpoint in cool, which some units keep per HVAC mode (#112)."""
    await start_ac(bench, "10:00", [["00:00", None, FAN]], state="fan_only", preset="comfort")
    shown = bench.hass.states.get(SALON).attributes["temperature"]
    await override(bench, hvac_mode="cool", temperature=shown)
    assert bench.powered() == {SALON: "cool"}
    assert sent_to(bench) == [shown]


# ----- dry and auto -----

def test_a_dry_slot_and_an_auto_slot_have_no_preset():
    day = schema.day([["00:00", "eco", {"hvac_mode": "dry"}], ["08:00", "comfort", {"hvac_mode": "dry"}],
                               ["12:00", None, {"hvac_mode": "auto", "fan_mode": "low"}],
                               ["14:00", None, {"hvac_mode": "auto", "fan_mode": "high"}],
                               ["18:00", "comfort", {"hvac_mode": "heat_cool"}]]).to_stored()
    assert day == [["00:00", None, {"hvac_mode": "dry"}], ["08:00", None, {"hvac_mode": "dry"}],
                   ["12:00", None, {"hvac_mode": "auto", "fan_mode": "low"}],
                   ["14:00", None, {"hvac_mode": "auto", "fan_mode": "high"}],
                   ["18:00", "comfort", {"hvac_mode": "heat_cool"}]]
    with pytest.raises(InvalidData):
        schema.day([["00:00", "eco", {"hvac_mode": "defrost"}]]).to_stored()


@pytest.mark.parametrize("mode", ["dry", "auto"])
async def test_a_dry_or_an_auto_slot_sends_the_hvac_mode_and_no_setpoint(bench: Bench, mode: str):
    await start_ac_with_range(bench, [["00:00", "eco"], ["14:00", None, {"hvac_mode": mode, "fan_mode": "low"}],
                        ["16:00", "comfort", {"hvac_mode": "cool"}]], "13:00", fan_modes=["low", "high"], fan_mode="high")
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: mode}
    assert SALON not in bench.applied() and sent_to(bench) == []
    assert bench.settings() == {(SALON, "fan_mode"): "low"}
    planned = bench.runtime.read_model.planned_targets(SALON)
    assert (planned["preset"], planned["hvac_mode"], planned["next_preset"]) == (None, mode, "comfort")
    await bench.go_to("16:00")
    assert bench.powered() == {SALON: "cool"}


async def test_a_dry_slot_leaves_a_heater_alone(bench: Bench):
    """The bureau lists no dry: a day pasted from an air conditioner changes nothing on it."""
    await start_ac_with_range(bench, [["00:00", "eco"], ["14:00", None, {"hvac_mode": "dry"}]], "13:00")
    await bench.go_to("14:00")
    assert BUREAU not in bench.powered() and BUREAU not in bench.applied()


@pytest.mark.parametrize("mode", ["dry", "auto"])
async def test_set_override_takes_dry_and_auto_alone(bench: Bench, mode: str):
    await start_ac_with_range(bench, [["00:00", "eco"]])
    await override(bench, hvac_mode=mode)
    assert bench.powered() == {SALON: mode} and bench.applied() == {}
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": mode}


async def test_an_override_without_an_hvac_mode_keeps_a_valve_in_auto(bench: Bench):
    """What the card sends for a preset tapped on a valve that lists heat and auto: no HVAC
    mode. The valve keeps auto, during the override and after it."""
    await start_ac_with_range(bench, [["00:00", "eco"]], state="auto", features=SINGLE, modes=["off", "heat", "auto"])
    await override(bench, preset="comfort", duration=30)
    assert bench.powered() == {} and "hvac_mode" not in bench.overrides()[SALON]["target"]
    await bench.advance(31)
    assert bench.overrides() == {} and bench.powered() == {}
    assert bench.hass.states.get(SALON).state == "auto"
