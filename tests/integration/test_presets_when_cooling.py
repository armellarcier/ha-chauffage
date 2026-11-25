"""A preset when heating and when cooling (#91): a preset has a temperature for each, either can
be empty, and a preset is only offered in the HVAC modes it has a value for. A thermostat in
cool never gets a heating temperature."""

import pytest
from homeassistant.core import Context

from conftest import KINDS, PRESETS_OF, Bench
from hvac_helpers import (
    AC_MODES, BUREAU, COOL, COOLING, COOLING_ONLY, COOL_WEEKDAY, ECO_IN_COOL, HEAT, PRESETS, SALON, clear, override,
    presets_without, sent_to, start_ac, start_ac_with_range, start_salon, unit,
)
from test_store import fixture

from custom_components.chauffage import engine, model
from custom_components.chauffage.store import migrate


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


COOL_ATTRS = {"hvac_modes": AC_MODES}


async def without_cooling(bench: Bench, preset_id: str) -> None:
    """The preset has no temperature when cooling: a preset the user created before #91, whose
    weeks cool. Chauffage now refuses to clear a temperature that the weeks use."""
    without = [{k: v for k, v in p.items() if k != "cool_temperature"} if p["id"] == preset_id else p
               for p in bench.presets()]
    await bench.edit_stored_data(lambda data: data.update(presets=without))
    await bench.runtime.apply(force=True)
    await bench.hass.async_block_till_done()
    bench.applied()
    bench.temperature_calls.clear()


# ----- a preset has a temperature when heating and one when cooling -----

def test_a_new_installation_has_a_cooling_temperature_for_eco_comfort_and_boost():
    values = {p["id"]: (p["temperature"], p.get("cool_temperature")) for p in model.default_presets("fr")}
    assert values == {"frost": (7.0, None), "eco": (17.0, 27.0), "comfort": (20.0, 25.0), "boost": (22.0, 23.0)}


def test_an_upgrade_keeps_the_heating_temperatures_and_adds_the_cooling_ones():
    """Version 6 has no cooling temperature. The default presets get one, by their id. A preset
    the user created gets none, and the heating temperatures the user set do not change."""
    v6 = fixture(6)["data"]
    v6 = {**v6, "presets": [{**p, "temperature": 19.5} if p["id"] == "comfort" else p for p in v6["presets"]]
          + [{"id": "nuit", "name": "Nuit", "color": "#123456", "temperature": 16.0}]}
    presets = {p["id"]: p for p in migrate(v6, 6)["presets"]}
    assert presets["comfort"]["temperature"] == 19.5 and presets["boost"]["temperature"] == 21
    assert {i: p.get("cool_temperature") for i, p in presets.items()} == {
        "comfort": 25.0, "eco": 27.0, "boost": 23.0, "frost": None, "nuit": None}


def test_either_temperature_of_a_preset_can_be_empty_not_both():
    cool_only = model.normalize_preset({"name": "Été", "temperature": None, "cool_temperature": 26}, set())
    assert (cool_only["temperature"], cool_only["cool_temperature"]) == (None, 26.0)
    heat_only = model.normalize_preset({"name": "Hiver", "temperature": 19, "cool_temperature": None}, set())
    assert heat_only["temperature"] == 19.0 and "cool_temperature" not in heat_only
    with pytest.raises(model.InvalidData):
        model.normalize_preset({"name": "Rien", "temperature": None}, set())


async def test_a_preset_s_cooling_temperature_is_set_and_cleared(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco"]])
    presets = [{**p, "cool_temperature": 26.5} if p["id"] == "comfort" else
               {**p, "cool_temperature": None} if p["id"] == "eco" else p for p in bench.presets()]
    await bench.runtime.set_presets(presets)
    stored = {p["id"]: p for p in bench.presets()}
    assert stored["comfort"]["cool_temperature"] == 26.5 and "cool_temperature" not in stored["eco"]
    assert engine.offered_modes(bench.runtime.targets_of(SALON)["eco"]) == ["heat"]


async def test_a_heating_temperature_used_in_the_weeks_cannot_be_cleared(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco"], ["12:00", "comfort"]])
    with pytest.raises(model.InvalidData, match="eco"):
        await bench.runtime.set_presets(presets_without("eco", "temperature"))
    assert bench.runtime.presets_by_id["eco"]["temperature"] == 17.0
    # Boost is in no week: its temperature when heating can be cleared
    await bench.runtime.set_presets(presets_without("boost", "temperature"))
    assert bench.runtime.presets_by_id["boost"]["temperature"] is None


async def test_a_cooling_temperature_used_in_the_weeks_cannot_be_cleared(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco"], ["12:00", "comfort", {"hvac_mode": "cool"}]])
    with pytest.raises(model.InvalidData, match="comfort"):
        await bench.runtime.set_presets(presets_without("comfort", "cool_temperature"))
    # Eco only heats in the weeks: its temperature when cooling can be cleared
    await bench.runtime.set_presets(presets_without("eco", "cool_temperature"))
    assert "cool_temperature" not in bench.runtime.presets_by_id["eco"]


async def test_a_temperature_set_on_the_thermostat_lets_the_preset_lose_its_own(bench: Bench):
    """The salon cools on Comfort at its own 24 °C: Comfort's default when cooling is not used."""
    await start_ac_with_range(bench, [["00:00", "comfort", {"hvac_mode": "cool"}]])
    await bench.runtime.set_mapping(SALON, {"comfort": {"cool_temperature": 24}})
    await bench.runtime.set_presets(presets_without("comfort", "cool_temperature"))
    assert "cool_temperature" not in bench.runtime.presets_by_id["comfort"]


async def test_a_preset_does_not_set_an_hvac_mode(bench: Bench):
    await start_ac(bench)
    await bench.runtime.set_presets([*bench.presets(), {"name": "Away", "temperature": 7, "hvac_mode": "off"}])
    assert bench.presets()[-1] == {"id": "away", "name": "Away", "color": "#9e9e9e", "temperature": 7.0}


@pytest.mark.parametrize("value", [{"temperature": 20, "hvac_mode": "cool"}, {"hvac_mode": "off"},
                                   {"preset_mode": "eco", "temperature": 20}, {}])
async def test_a_preset_s_value_is_a_climate_preset_or_a_temperature(bench: Bench, value: dict):
    """Not both, and never an HVAC mode. Alone, a cooling temperature or a fan adds to the default."""
    await start_ac(bench)
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_mapping(SALON, {"comfort": value})


async def test_a_window_that_sets_the_frost_setpoint_teaches_no_preset_temperature(bench: Bench):
    """The window action "frost" keeps the VTherm on its preset and sets 7 °C: 7 °C is not the
    temperature of that preset."""
    bench.needs("vtherm")
    bench.versatile_thermostat(SALON)
    await bench.go_to("10:00")
    bench.thermostat(SALON, "eco")
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"]]] * 7}})
    before = dict(bench.runtime.thermostats[SALON]["preset_temperatures"])
    bench.thermostat(SALON, "eco", 7.0, context=Context(),
                     requested_state={"hvac_mode": "heat", "target_temperature": 17.0, "preset": "eco"},
                     specific_states={"window_manager": {"window_state": "on"}})
    await bench.hass.async_block_till_done()
    assert bench.runtime.thermostats[SALON]["preset_temperatures"] == before


# ----- the presets offered in each HVAC mode -----

def test_a_preset_without_a_cooling_temperature_is_not_offered_in_cool():
    """Frost protection never cools, even on a thermostat that has a frost preset of its own."""
    own = unit(presets=("frost", "eco", "comfort"))
    for thermostat in (unit(), own):
        offered = {preset_id: engine.offered_modes(engine.value_on(preset, None, thermostat))
                   for preset_id, preset in PRESETS.items()}
        assert offered["frost"] == ["heat"]
        assert offered["comfort"] == ["heat", "cool", "heat_cool"]


def test_a_preset_without_a_heating_temperature_is_not_offered_in_heat():
    summer = {"id": "summer", "temperature": None, "cool_temperature": 26.0}
    assert engine.offered_modes(engine.value_on(summer, None, unit())) == ["cool"]


def test_the_value_on_a_thermostat_makes_a_preset_usable_in_an_hvac_mode():
    """The cell of a thermostat can set each temperature: frost protection at 28 °C when
    cooling is offered in cool on that thermostat."""
    value = engine.value_on(PRESETS["frost"], {"cool_temperature": 28.0}, unit())
    assert engine.offered_modes(value) == ["heat", "cool", "heat_cool"]
    assert value == {"temperature": 7.0, "cool_temperature": 28.0, "target_temp_low": 7.0, "target_temp_high": 28.0}


def test_a_thermostat_s_own_preset_is_its_value_in_the_hvac_modes_the_preset_has():
    own = unit(presets=("frost", "eco", "comfort"))
    assert engine.value_on(PRESETS["frost"], None, own) == {"preset_mode": "frost"}
    comfort = engine.value_on(PRESETS["comfort"], None, own)
    assert (comfort["preset_mode"], comfort["cool_preset_mode"]) == ("comfort", "comfort")
    # The value set by hand wins, each HVAC mode apart
    cell = engine.value_on(PRESETS["comfort"], {"temperature": 21.0}, own)
    assert (cell["temperature"], cell["cool_preset_mode"]) == (21.0, "comfort") and "preset_mode" not in cell


async def test_the_card_gets_what_each_preset_means_in_each_hvac_mode(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco"]])
    await bench.runtime.set_mapping(SALON, {"frost": {"temperature": 8.0}})
    snapshot = bench.runtime.snapshot()
    frost, comfort = (snapshot["targets"][SALON][p] for p in ("frost", "comfort"))
    assert frost == {"temperature": 8.0}
    assert engine.offered_modes(comfort) == ["heat", "cool", "heat_cool"]
    assert (comfort["target_temp_low"], comfort["target_temp_high"]) == (20.0, 25.0)
    assert snapshot["targets"][BUREAU]["comfort"].get("target_temp_low") is None  # a heater takes no range
    assert {p["id"]: p.get("cool_temperature") for p in snapshot["presets"]}["comfort"] == 25.0


# ----- a cooling slot sends the cooling temperature -----

async def test_a_cooling_slot_gives_a_preset_its_cooling_temperature(bench: Bench):
    """Comfort on the air conditioner: 20 °C when heating, 25 °C when cooling."""
    await start_ac(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort", COOL], ["16:00", "comfort", HEAT]])
    await bench.runtime.set_mapping(SALON, {"comfort": {"temperature": 20, "cool_temperature": 25}})
    clear(bench)
    await bench.go_to("14:00")
    assert sent_to(bench) == [25.0]
    clear(bench)
    await bench.go_to("16:00")
    assert bench.powered()[SALON] == "heat"
    assert sent_to(bench) == [20.0]


async def test_a_cooling_slot_on_a_preset_without_a_cooling_temperature_sends_no_setpoint(bench: Bench):
    """Frost protection has no temperature when cooling. The slot switches the air conditioner
    to cool, and sends neither Chauffage's heating temperature (7 °C) nor the thermostat's own
    frost preset."""
    await start_ac(bench, "13:00", [["00:00", "eco"], ["14:00", "frost", COOL]])
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "cool"}
    assert sent_to(bench) == [] and SALON not in bench.applied()


async def test_a_cooling_slot_sends_the_preset_s_cooling_temperature(bench: Bench):
    """Comfort is 25 °C when cooling, by default. A thermostat with a comfort preset of its own
    gets that preset."""
    await start_ac_with_range(bench, [["00:00", "eco"], ["14:00", "comfort", {"hvac_mode": "cool"}]], "13:00")
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "cool"}
    if "comfort" in PRESETS_OF[bench.kind]:
        assert bench.applied()[SALON] == "comfort" and sent_to(bench) == []
    else:
        assert sent_to(bench) == [25.0]


async def test_in_cool_a_preset_without_a_cooling_value_sends_no_setpoint(bench: Bench):
    """Eco on a reversible AC that cools, and eco has no temperature when cooling. Chauffage's
    heating temperature (17 °C) is never sent in cool, and the thermostat's own eco preset is
    not either: the thermostat keeps its setpoint."""
    await start_salon(bench, "13:00", ECO_IN_COOL, **COOLING)
    await without_cooling(bench, "eco")
    await bench.go_to("14:00")
    assert bench.applied() == {}
    assert bench.temperature_calls == []
    assert bench.powered() == {}  # already cool


async def test_in_cool_a_cooling_value_is_sent(bench: Bench):
    await start_salon(bench, "13:00", ECO_IN_COOL, **COOLING)
    await bench.runtime.set_mapping("climate.salon", {"eco": {"preset_mode": "eco", "cool_temperature": 26}})
    await bench.hass.async_block_till_done()
    bench.temperature_calls.clear()
    await bench.go_to("14:00")
    assert bench.temperature_calls == [("climate.salon", 26.0)]


async def test_an_override_to_a_preset_without_a_cooling_value_sends_no_temperature_in_cool(bench: Bench):
    """The same rule for an override set to a preset: never a heating temperature."""
    await start_salon(bench, "10:00", ECO_IN_COOL, **COOLING)
    await without_cooling(bench, "boost")
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True)
    assert bench.applied() == {}
    assert bench.temperature_calls == []
    assert "climate.salon" in bench.overrides()


async def test_a_heating_slot_ignores_the_cooling_setpoint(bench: Bench):
    bench.needs("plain")
    await start_salon(bench, "17:00", **COOL_ATTRS)
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"temperature": 20, "cool_temperature": 25}})
    await bench.hass.async_block_till_done()
    bench.temperature_calls.clear()
    await bench.go_to("17:30")
    assert bench.temperature_calls == [("climate.salon", 20.0)]
    assert bench.runtime.targets_of("climate.salon")["comfort"] == {"temperature": 20.0, "cool_temperature": 25.0}


async def test_an_override_to_a_preset_in_cool_uses_the_cooling_setpoint(bench: Bench):
    await start_salon(bench, "10:00", COOL_WEEKDAY, state="cool", **COOL_ATTRS)
    await bench.runtime.set_mapping("climate.salon", {"boost": {"temperature": 21, "cool_temperature": 23}})
    await bench.hass.async_block_till_done()
    bench.temperature_calls.clear()
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True)
    assert bench.temperature_calls == [("climate.salon", 23.0)]
    assert bench.overrides()["climate.salon"]["target"] == {"temperature": 21.0, "cool_temperature": 23.0}


async def test_an_override_temperature_typed_by_the_user_is_sent_in_cool(bench: Bench):
    """A temperature the user typed (no Chauffage preset) is their cooling target: sent in cool,
    unlike a preset's heating temperature (docs/decisions.md, "Presets")."""
    await start_salon(bench, "10:00", COOL_WEEKDAY, state="cool", **COOL_ATTRS)
    bench.temperature_calls.clear()
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 24}, blocking=True)
    assert bench.temperature_calls == [("climate.salon", 24.0)]
    assert bench.overrides()["climate.salon"]["target"] == {"temperature": 24.0}


async def test_an_override_that_switches_to_cool_with_a_temperature_sends_it(bench: Bench):
    await start_salon(bench, "10:00", **COOL_ATTRS)
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 24, "hvac_mode": "cool"}, blocking=True)
    assert bench.powered() == {"climate.salon": "cool"}
    assert bench.temperature_calls == [("climate.salon", 24.0)]


async def test_the_planned_preset_sensor_gives_the_cooling_temperatures_while_the_slot_cools(bench: Bench):
    await start_ac(bench, "10:00", [["00:00", "eco", HEAT], ["14:00", "comfort", COOL]])
    await bench.runtime.set_mapping(SALON, {"comfort": {"temperature": 20, "cool_temperature": 24}, "frost": {"temperature": 8}})
    await bench.hass.async_block_till_done()
    temperatures = lambda: bench.hass.states.get("sensor.salon_planned_preset").attributes["temperatures"]
    assert temperatures()["comfort"] == 20.0 and temperatures()["frost"] == 8.0
    await bench.go_to("14:00")
    assert temperatures()["comfort"] == 24.0
    assert "frost" not in temperatures()  # no cooling value: nothing is sent, nothing is shown


# ----- a thermostat in cool never gets a heating temperature -----

async def test_a_cooling_only_ac_never_gets_a_preset_s_heating_temperature(bench: Bench):
    """It got the base setpoint before: frost protection cooled a room to 7 °C."""
    bench.needs("plain")
    await start_salon(bench, "13:00", [["00:00", "eco"], ["14:00", "frost"]], state="cool", hvac_modes=["off", "cool", "fan_only"])
    bench.temperature_calls.clear()
    await bench.go_to("14:00")
    assert bench.temperature_calls == []


async def test_a_preset_s_heating_temperature_is_still_not_sent_in_cool(bench: Bench):
    """The preset's value set by hand without a cooling setpoint: a heating value (D1). When
    cooling, the preset's default goes on."""
    await start_salon(bench, "10:00", COOL_WEEKDAY, state="cool", **COOL_ATTRS)
    await bench.runtime.set_mapping("climate.salon", {"boost": {"temperature": 21}})
    await bench.hass.async_block_till_done()
    bench.temperature_calls.clear()
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True)
    assert 21.0 not in [temperature for _, temperature in bench.temperature_calls]
    assert bench.overrides()["climate.salon"]["preset"] == "boost"


async def test_frost_protection_never_cools_an_air_conditioner_to_7_degrees(bench: Bench):
    """Regression: a cooling-only unit got cool at 7 °C from an override to frost protection."""
    await start_ac(bench, "10:00", state="cool", modes=COOLING_ONLY)
    await override(bench, preset="frost")
    assert sent_to(bench) == []
    assert bench.hass.states.get(SALON).attributes["temperature"] != 7.0
    # Frost protection has no value when cooling: its own frost preset is not sent either
    assert SALON not in bench.applied()


async def test_a_slot_never_sends_a_heating_temperature_to_an_air_conditioner_that_only_cools(bench: Bench):
    await start_ac(bench, "13:00", [["00:00", "eco"], ["14:00", "frost"]], state="cool", modes=COOLING_ONLY)
    await bench.go_to("14:00")
    assert sent_to(bench) == []


async def test_a_cooling_temperature_is_sent_to_an_air_conditioner_that_only_cools(bench: Bench):
    await start_ac(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort"]], state="cool", modes=COOLING_ONLY)
    await bench.runtime.set_mapping(SALON, {"comfort": {"cool_temperature": 24}})
    clear(bench)
    await bench.go_to("14:00")
    assert sent_to(bench) == [24.0]


def test_in_cool_a_preset_s_temperature_is_never_sent():
    unit = engine.Thermostat("cool", None, 26.0, hvac_modes=tuple(COOLING_ONLY))
    assert engine.complete({"temperature": 7.0}, unit) == {}
    assert engine.complete({"temperature": 7.0, "cool_temperature": 24.0}, unit) == {"temperature": 24.0}
    assert engine.complete({"temperature": 22.0}, unit, by_user=True) == {"temperature": 22.0}


# ----- the colors of the presets -----

async def test_a_preset_may_have_a_color_for_its_cooling_slots(bench: Bench):
    """Without one, the card derives a cool shade from the preset's color: nothing is stored."""
    await start_ac(bench)
    presets = bench.presets()
    assert all("cool_color" not in preset for preset in presets)
    await bench.runtime.set_presets([{**presets[0], "cool_color": "#0288D1"}, *presets[1:]])
    assert bench.presets()[0]["cool_color"] == "#0288d1"
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_presets([{**presets[0], "cool_color": "blue"}, *presets[1:]])


def test_frost_protection_of_a_new_installation_does_not_look_like_fan_only():
    """Its light blue looked like Home Assistant's cyan of fan only. Stored presets keep theirs."""
    from custom_components.chauffage import model
    colors = {preset["id"]: preset["color"] for preset in model.default_presets("fr")}
    assert colors["frost"] == "#78909c"
    assert len(set(colors.values())) == 4


def test_a_new_installation_gets_a_boost_red_that_white_text_reads_on():
    """White on the former #e53935 is at 4.2:1, under the 4.5:1 of WCAG AA. Existing
    installations keep their colors: the stored presets are not touched (test_store.py)."""
    colors = {p["id"]: p["color"] for p in model.default_presets("en")}
    assert colors["boost"] == "#d32f2f"
