"""The HVAC mode first, then the presets (#91).

A slot says what the device does: off, heat, cool, heat/cool, dry, auto or fan only. A preset
says how warm, when heating and when cooling: either temperature can be empty, and a preset is
only offered in the HVAC modes it has a value for."""

import pytest
import voluptuous as vol
from homeassistant.exceptions import ServiceValidationError

from conftest import CTX_AUTOMATION, CTX_USER, KINDS, PRESETS_OF, Bench

from homeassistant.core import Event, callback

from custom_components.chauffage import engine, logbook, model
from custom_components.chauffage.store import migrate
from test_store import fixture

SALON, BUREAU = "climate.salon", "climate.bureau"
REVERSIBLE = ["off", "heat", "cool", "heat_cool", "dry", "auto", "fan_only"]
RANGE = 1 | 2  # ClimateEntityFeature.TARGET_TEMPERATURE | TARGET_TEMPERATURE_RANGE
PRESETS = {p["id"]: p for p in model.default_presets("en")}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


def unit(state: str = "heat", modes: list[str] | None = None, presets: tuple[str, ...] = (), **more) -> engine.Thermostat:
    return engine.Thermostat(state, None, 20.0, presets=presets, hvac_modes=tuple(modes or REVERSIBLE),
                             supports_range=True, **more)


async def start(bench: Bench, day: list, hhmm: str = "10:00", state: str = "heat", modes: list[str] | None = None,
                **attributes) -> None:
    """The salon is an air conditioner that lists every HVAC mode, the bureau a heater."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, "eco", state=state, hvac_modes=modes or REVERSIBLE, supported_features=RANGE, **attributes)
    bench.thermostat(BUREAU, "eco")
    await bench.setup()
    await bench.save_weeks({entity: {"normal": [day] * 7} for entity in (SALON, BUREAU)})
    clear(bench)


def clear(bench: Bench) -> None:
    bench.applied()
    bench.powered()
    bench.temperature_calls.clear()
    bench.range_calls.clear()



def sent_to(bench: Bench, entity_id: str = SALON) -> list[float]:
    return [temperature for entity, temperature in bench.temperature_calls if entity == entity_id]


def by_hand(bench: Bench, state: str, preset: str = "eco", **attributes) -> None:
    bench.thermostat(SALON, preset, state=state, hvac_modes=REVERSIBLE, supported_features=RANGE, context=CTX_USER,
                     **attributes)


async def override(bench: Bench, **data) -> None:
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": SALON, **data}, blocking=True)
    await bench.hass.async_block_till_done()


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


# ----- which presets a thermostat can use in an HVAC mode -----

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


def test_heat_cool_needs_both_temperatures_and_a_thermostat_that_takes_a_range():
    single = engine.Thermostat("heat", None, 20.0, hvac_modes=tuple(REVERSIBLE))
    assert engine.offered_modes(engine.value_on(PRESETS["comfort"], None, single)) == ["heat", "cool"]
    assert "heat_cool" not in engine.setpoint_modes(single)
    assert engine.setpoint_modes(unit()) == ["heat", "cool", "heat_cool"]


def test_a_thermostat_s_own_preset_is_its_value_in_the_hvac_modes_the_preset_has():
    own = unit(presets=("frost", "eco", "comfort"))
    assert engine.value_on(PRESETS["frost"], None, own) == {"preset_mode": "frost"}
    comfort = engine.value_on(PRESETS["comfort"], None, own)
    assert (comfort["preset_mode"], comfort["cool_preset_mode"]) == ("comfort", "comfort")
    # The value set by hand wins, each HVAC mode apart
    cell = engine.value_on(PRESETS["comfort"], {"temperature": 21.0}, own)
    assert (cell["temperature"], cell["cool_preset_mode"]) == (21.0, "comfort") and "preset_mode" not in cell


# ----- the slot's HVAC mode -----

@pytest.mark.parametrize(("stored", "modes", "read"), [
    (None, ["off", "heat"], None),  # a heater
    ("heat", ["off", "heat"], None),
    (None, ["off", "heat", "auto"], None),  # a valve with auto: a week stored before #91 leaves it alone
    ("heat", ["off", "heat", "auto"], "heat"),  # the slot says heat: the valve leaves auto
    (None, ["off", "heat", "cool"], "heat"),
    ("heat_cool", REVERSIBLE, "heat_cool"),
    ("heat_cool", ["off", "heat", "cool"], "heat"),  # the thermostat does not list it
    (None, ["off", "cool", "dry"], "cool"),
    ("heat", ["off", "cool", "dry"], "cool"),
    ("dry", ["off", "heat"], "dry"),  # dry, auto, fan only and off are the slot's own
    ("auto", REVERSIBLE, "auto"),
])
def test_the_hvac_mode_of_a_slot_on_a_thermostat(stored, modes, read):
    settings = {"hvac_mode": stored} if stored else {}
    assert engine.slot_hvac_mode(settings, unit(modes=modes)) == read


def test_heat_cool_is_read_as_heat_on_a_thermostat_that_takes_no_range():
    single = engine.Thermostat("heat", None, 20.0, hvac_modes=tuple(REVERSIBLE))
    assert engine.slot_hvac_mode({"hvac_mode": "heat_cool"}, single) == "heat"


def test_a_dry_slot_and_an_auto_slot_have_no_preset():
    day = model.normalize_day([["00:00", "eco", {"hvac_mode": "dry"}], ["08:00", "comfort", {"hvac_mode": "dry"}],
                               ["12:00", None, {"hvac_mode": "auto", "fan_mode": "low"}],
                               ["14:00", None, {"hvac_mode": "auto", "fan_mode": "high"}],
                               ["18:00", "comfort", {"hvac_mode": "heat_cool"}]])
    assert day == [["00:00", None, {"hvac_mode": "dry"}], ["08:00", None, {"hvac_mode": "dry"}],
                   ["12:00", None, {"hvac_mode": "auto", "fan_mode": "low"}],
                   ["14:00", None, {"hvac_mode": "auto", "fan_mode": "high"}],
                   ["18:00", "comfort", {"hvac_mode": "heat_cool"}]]
    with pytest.raises(model.InvalidData):
        model.normalize_day([["00:00", "eco", {"hvac_mode": "defrost"}]])


# ----- what a slot sends -----

async def test_a_cooling_slot_sends_the_preset_s_cooling_temperature(bench: Bench):
    """Comfort is 25 °C when cooling, by default. A thermostat with a comfort preset of its own
    gets that preset."""
    await start(bench, [["00:00", "eco"], ["14:00", "comfort", {"hvac_mode": "cool"}]], "13:00")
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "cool"}
    if "comfort" in PRESETS_OF[bench.kind]:
        assert bench.applied()[SALON] == "comfort" and sent_to(bench) == []
    else:
        assert sent_to(bench) == [25.0]


async def test_a_heat_cool_slot_sends_the_heating_and_the_cooling_temperature(bench: Bench):
    await start(bench, [["00:00", "eco"], ["14:00", "comfort", {"hvac_mode": "heat_cool"}]], "13:00")
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "heat_cool"}
    assert bench.range_calls == [(SALON, 20.0, 25.0)] and sent_to(bench) == []
    planned = bench.runtime.planned_targets(SALON)
    assert planned["hvac_mode"] == "heat_cool"
    # The thermostat shows it: nothing more is sent at the next minute
    clear(bench)
    await bench.go_to("14:01")
    assert bench.range_calls == [] and bench.powered() == {}


async def test_a_heat_cool_slot_heats_on_a_thermostat_that_takes_no_range(bench: Bench):
    await bench.go_to("13:00")
    bench.thermostat(SALON, "eco", hvac_modes=REVERSIBLE)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"], ["14:00", "comfort", {"hvac_mode": "heat_cool"}]]] * 7}})
    assert bench.runtime.planned_targets(SALON)["next_hvac_mode"] == "heat"


@pytest.mark.parametrize("mode", ["dry", "auto"])
async def test_a_dry_or_an_auto_slot_sends_the_hvac_mode_and_no_setpoint(bench: Bench, mode: str):
    await start(bench, [["00:00", "eco"], ["14:00", None, {"hvac_mode": mode, "fan_mode": "low"}],
                        ["16:00", "comfort", {"hvac_mode": "cool"}]], "13:00", fan_modes=["low", "high"], fan_mode="high")
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: mode}
    assert SALON not in bench.applied() and sent_to(bench) == []
    assert bench.settings() == {(SALON, "fan_mode"): "low"}
    planned = bench.runtime.planned_targets(SALON)
    assert (planned["preset"], planned["hvac_mode"], planned["next_preset"]) == (None, mode, "comfort")
    await bench.go_to("16:00")
    assert bench.powered() == {SALON: "cool"}


async def test_a_dry_slot_leaves_a_heater_alone(bench: Bench):
    """The bureau lists no dry: a day pasted from an air conditioner changes nothing on it."""
    await start(bench, [["00:00", "eco"], ["14:00", None, {"hvac_mode": "dry"}]], "13:00")
    await bench.go_to("14:00")
    assert BUREAU not in bench.powered() and BUREAU not in bench.applied()


async def test_a_preset_override_turns_on_an_air_conditioner_left_in_dry(bench: Bench):
    """Dry takes no setpoint: an override to a preset that says no HVAC mode leaves dry."""
    await start(bench, [["00:00", None, {"hvac_mode": "dry"}]], state="dry")
    await override(bench, preset="comfort")
    assert bench.powered() == {SALON: "heat"}


# ----- overrides -----

@pytest.mark.parametrize("data", [
    {"hvac_mode": "dry", "preset": "comfort"}, {"hvac_mode": "auto", "temperature": 21},
    {"hvac_mode": "heat_cool", "temperature": 21},  # heat/cool takes a preset or a pair
    {"hvac_mode": "heat_cool", "target_temp_low": 19},  # half a pair
    {"hvac_mode": "heat", "target_temp_low": 19, "target_temp_high": 24},  # a pair is for heat/cool
    {"hvac_mode": "heat_cool", "preset": "frost"},  # frost protection has no cooling temperature
    {"hvac_mode": "cool", "preset": "frost"},
    {"hvac_mode": "heat_cool", "target_temp_low": 25, "target_temp_high": 20},
])
async def test_set_override_refuses_what_contradicts_the_hvac_mode(bench: Bench, data: dict):
    await start(bench, [["00:00", "eco"]])
    with pytest.raises((ServiceValidationError, vol.Invalid)):
        await override(bench, **data)
    assert bench.overrides() == {} and bench.powered() == {}


@pytest.mark.parametrize("mode", ["dry", "auto"])
async def test_set_override_takes_dry_and_auto_alone(bench: Bench, mode: str):
    await start(bench, [["00:00", "eco"]])
    await override(bench, hvac_mode=mode)
    assert bench.powered() == {SALON: mode} and bench.applied() == {}
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": mode}


async def test_set_override_takes_heat_cool_with_a_pair_of_temperatures(bench: Bench):
    await start(bench, [["00:00", "eco"]])
    await override(bench, hvac_mode="heat_cool", target_temp_low=19, target_temp_high=24.5)
    assert bench.powered() == {SALON: "heat_cool"} and bench.range_calls == [(SALON, 19.0, 24.5)]
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": "heat_cool", "target_temp_low": 19.0, "target_temp_high": 24.5}


async def test_the_logbook_says_the_range_of_a_heat_cool_override(bench: Bench):
    await start(bench, [["00:00", "eco"]])
    events: list[Event] = []
    bench.hass.bus.async_listen("chauffage_override_started", callback(lambda event: events.append(event)))
    await override(bench, hvac_mode="heat_cool", target_temp_low=19, target_temp_high=24.5, duration=60)
    described = {}
    logbook.async_describe_events(bench.hass, lambda domain, name, describe: described.update({name: describe}))
    assert "heat/cool, 19–24.5 °C" in described["chauffage_override_started"](events[0])["message"]
    bench.hass.config.language = "fr"
    assert "19–24,5 °C" in described["chauffage_override_started"](events[0])["message"]


async def test_set_override_takes_heat_cool_with_a_preset(bench: Bench):
    await start(bench, [["00:00", "eco"]])
    await override(bench, hvac_mode="heat_cool", preset="eco")
    assert bench.range_calls == [(SALON, 17.0, 27.0)]
    assert bench.overrides()[SALON]["preset"] == "eco"


async def test_set_override_refuses_heat_cool_on_a_thermostat_that_takes_no_range(bench: Bench):
    await bench.go_to("10:00")
    bench.thermostat(SALON, "eco", hvac_modes=REVERSIBLE)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"]]] * 7}})
    with pytest.raises(ServiceValidationError):
        await override(bench, hvac_mode="heat_cool", preset="eco")


# ----- changes by hand -----

async def test_switching_to_heat_cool_by_hand_keeps_the_preset_in_force(bench: Bench):
    """The person chose an HVAC mode, not a setpoint: the slot's preset goes on, with its two
    temperatures."""
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat"}]])
    by_hand(bench, "heat_cool")
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    kept = bench.overrides()[SALON]
    assert kept["preset"] == "eco" and kept["target"]["hvac_mode"] == "heat_cool"
    assert bench.range_calls == [(SALON, 17.0, 27.0)]


@pytest.mark.parametrize("mode", ["dry", "auto"])
async def test_switching_to_dry_or_auto_by_hand_is_recorded_alone(bench: Bench, mode: str):
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat"}]])
    by_hand(bench, mode)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": mode}
    assert bench.powered() == {} and bench.applied() == {} and bench.range_calls == []


async def test_a_range_changed_by_hand_in_heat_cool_is_an_override(bench: Bench):
    await start(bench, [["00:00", "comfort", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=20.0, target_temp_high=25.0)
    await bench.go_to("10:01")
    clear(bench)
    bench.thermostat(SALON, None, None, state="heat_cool", hvac_modes=REVERSIBLE, supported_features=RANGE,
                     target_temp_low=19.0, target_temp_high=24.0, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides()[SALON]["target"] == {"target_temp_low": 19.0, "target_temp_high": 24.0}
    assert bench.range_calls == []
    # Back to the slot's range: the override ends
    bench.thermostat(SALON, None, None, state="heat_cool", hvac_modes=REVERSIBLE, supported_features=RANGE,
                     target_temp_low=20.0, target_temp_high=25.0, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides() == {}


async def test_heat_cool_is_never_the_hvac_mode_to_turn_on_in(bench: Bench):
    await start(bench, [["00:00", "comfort", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=20.0, target_temp_high=25.0)
    assert bench.runtime.thermostats[SALON]["hvac_mode"] is None
    assert bench.runtime.thermostats[SALON]["preset_temperatures"] == {}


# ----- what the card gets -----

async def test_the_card_gets_what_each_preset_means_in_each_hvac_mode(bench: Bench):
    await start(bench, [["00:00", "eco"]])
    await bench.runtime.set_mapping(SALON, {"frost": {"temperature": 8.0}})
    snapshot = bench.runtime.snapshot()
    frost, comfort = (snapshot["targets"][SALON][p] for p in ("frost", "comfort"))
    assert frost == {"temperature": 8.0}
    assert engine.offered_modes(comfort) == ["heat", "cool", "heat_cool"]
    assert (comfort["target_temp_low"], comfort["target_temp_high"]) == (20.0, 25.0)
    assert snapshot["targets"][BUREAU]["comfort"].get("target_temp_low") is None  # a heater takes no range
    assert {p["id"]: p.get("cool_temperature") for p in snapshot["presets"]}["comfort"] == 25.0


async def test_a_preset_s_cooling_temperature_is_set_and_cleared(bench: Bench):
    await start(bench, [["00:00", "eco"]])
    presets = [{**p, "cool_temperature": 26.5} if p["id"] == "comfort" else
               {**p, "cool_temperature": None} if p["id"] == "eco" else p for p in bench.runtime.data["presets"]]
    await bench.runtime.set_presets(presets)
    stored = {p["id"]: p for p in bench.runtime.data["presets"]}
    assert stored["comfort"]["cool_temperature"] == 26.5 and "cool_temperature" not in stored["eco"]
    assert engine.offered_modes(bench.runtime.targets_of(SALON)["eco"]) == ["heat"]
