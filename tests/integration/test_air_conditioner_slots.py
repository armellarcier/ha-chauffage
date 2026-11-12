"""On an air conditioner, every slot has an HVAC mode (#91).

A slot on a preset says heat or cool on a thermostat that lists both. A stored slot that says
none is read as heat there, and as cool on a thermostat that only cools. A heater never carries
an HVAC mode. A thermostat in cool never gets a heating temperature."""

import pytest
from homeassistant.exceptions import ServiceValidationError
from homeassistant.core import Event, callback

from conftest import CTX_AUTOMATION, CTX_USER, KINDS, WEEKDAY, Bench

from custom_components.chauffage import engine, logbook

COOL = {"hvac_mode": "cool"}
HEAT = {"hvac_mode": "heat"}
REVERSIBLE = ["off", "heat", "cool", "fan_only"]
COOLING_ONLY = ["off", "cool", "fan_only"]
SALON, BUREAU = "climate.salon", "climate.bureau"


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def start(bench: Bench, hhmm: str = "10:00", day: list | None = None, state: str = "heat", preset: str = "eco",
                modes: list[str] | None = None) -> None:
    """The salon is an air conditioner (reversible by default), the bureau a heater."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, preset, state=state, hvac_modes=modes or REVERSIBLE)
    bench.thermostat(BUREAU, preset)
    await bench.setup()
    await bench.save_weeks({entity: {"normal": [day or WEEKDAY] * 7} for entity in (SALON, BUREAU)})
    clear(bench)


def clear(bench: Bench) -> None:
    bench.applied()
    bench.powered()
    bench.temperature_calls.clear()


def state(bench: Bench, entity_id: str = SALON) -> str:
    return bench.hass.states.get(entity_id).state


def sent_to(bench: Bench, entity_id: str = SALON) -> list[float]:
    return [temperature for entity, temperature in bench.temperature_calls if entity == entity_id]


async def override(bench: Bench, **data) -> None:
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": SALON, **data}, blocking=True)
    await bench.hass.async_block_till_done()


# ----- a stored slot without an HVAC mode -----

async def test_a_slot_without_an_hvac_mode_heats_on_an_air_conditioner_that_heats_and_cools(bench: Bench):
    """A week stored before #91: its slots say no HVAC mode. They are read as heat."""
    await start(bench, "17:00", state="cool")
    assert bench.runtime.planned_targets(SALON)["hvac_mode"] == "heat"
    assert state(bench) == "heat"  # saving the weeks applied the slot
    bench.thermostat(SALON, "eco", state="cool", hvac_modes=REVERSIBLE, context=CTX_AUTOMATION)
    await bench.go_to("17:30")
    assert bench.powered() == {SALON: "heat"}
    assert bench.applied()[SALON] == "comfort"


async def test_a_slot_without_an_hvac_mode_cools_on_an_air_conditioner_that_only_cools(bench: Bench):
    await start(bench, "17:00", state="cool", modes=COOLING_ONLY)
    planned = bench.runtime.planned_targets(SALON)
    assert (planned["hvac_mode"], planned["next_hvac_mode"]) == ("cool", "cool")
    await bench.go_to("17:30")
    assert bench.powered() == {} and state(bench) == "cool"


async def test_a_heating_slot_cools_on_an_air_conditioner_that_only_cools(bench: Bench):
    """A day pasted from a reversible unit: the slot says heat, the thermostat cannot."""
    await start(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort", HEAT]], state="cool", modes=COOLING_ONLY)
    bench.thermostat(SALON, "eco", state="off", hvac_modes=COOLING_ONLY, context=CTX_AUTOMATION)
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "cool"}
    assert bench.runtime.planned_targets(SALON)["hvac_mode"] == "cool"


async def test_a_heater_never_carries_an_hvac_mode(bench: Bench):
    """The bureau only heats: a slot that says heat or cool says nothing to it."""
    await start(bench, "13:00", [["00:00", "eco", HEAT], ["14:00", "comfort", COOL]])
    planned = bench.runtime.planned_targets(BUREAU)
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
    bench.thermostat(SALON, "eco", hvac_modes=REVERSIBLE)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [edited, *[stored] * 6]}})
    planned = bench.runtime.planned_targets(SALON)
    assert (planned["preset"], planned["next_preset"]) == ("eco", "comfort")
    assert planned["next_start"] == "2026-10-13T06:30:00+02:00"


# ----- turning on -----

async def test_a_preset_override_turns_on_an_air_conditioner_in_the_hvac_mode_it_last_ran_in(bench: Bench):
    """In July the unit cooled, then a script turned it off. An override to a preset says no
    HVAC mode: the unit restarts in cool, not in heat."""
    await start(bench, "10:00", [["00:00", "eco", COOL]], state="cool")
    bench.thermostat(SALON, "eco", state="off", hvac_modes=REVERSIBLE, context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    clear(bench)
    await override(bench, preset="comfort")
    assert bench.powered() == {SALON: "cool"}


def test_a_thermostat_is_turned_on_in_its_last_hvac_mode_before_heat():
    unit = engine.Thermostat("off", None, 20.0, hvac_modes=tuple(REVERSIBLE), last_hvac_mode="cool")
    assert engine.on_mode(unit) == "cool"
    assert engine.on_mode(engine.Thermostat("off", None, 20.0, hvac_modes=tuple(REVERSIBLE))) == "heat"
    gone = engine.Thermostat("off", None, 20.0, hvac_modes=("off", "heat"), last_hvac_mode="cool")
    assert engine.on_mode(gone) == "heat"


# ----- never a heating temperature in cool -----

async def test_frost_protection_never_cools_an_air_conditioner_to_7_degrees(bench: Bench):
    """Regression: a cooling-only unit got cool at 7 °C from an override to frost protection."""
    await start(bench, "10:00", state="cool", modes=COOLING_ONLY)
    await override(bench, preset="frost")
    assert sent_to(bench) == []
    assert bench.hass.states.get(SALON).attributes["temperature"] != 7.0
    # Its own frost preset, when it has one: the device knows what it means in cool
    assert bench.applied().get(SALON) == ("frost" if bench.kind == "vtherm" else None)


async def test_a_slot_never_sends_a_heating_temperature_to_an_air_conditioner_that_only_cools(bench: Bench):
    await start(bench, "13:00", [["00:00", "eco"], ["14:00", "frost"]], state="cool", modes=COOLING_ONLY)
    await bench.go_to("14:00")
    assert sent_to(bench) == []


async def test_a_cooling_temperature_is_sent_to_an_air_conditioner_that_only_cools(bench: Bench):
    await start(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort"]], state="cool", modes=COOLING_ONLY)
    await bench.runtime.set_mapping(SALON, {"comfort": {"cool_temperature": 24}})
    clear(bench)
    await bench.go_to("14:00")
    assert sent_to(bench) == [24.0]


def test_in_cool_a_preset_s_temperature_is_never_sent():
    unit = engine.Thermostat("cool", None, 26.0, hvac_modes=tuple(COOLING_ONLY))
    assert engine.complete({"temperature": 7.0}, unit) == {}
    assert engine.complete({"temperature": 7.0, "cool_temperature": 24.0}, unit) == {"temperature": 24.0}
    assert engine.complete({"temperature": 22.0}, unit, by_user=True) == {"temperature": 22.0}


# ----- chauffage.set_override refuses what contradicts itself -----

@pytest.mark.parametrize("data", [
    {"hvac_mode": "off", "temperature": 21}, {"hvac_mode": "off", "preset": "comfort"},
    {"hvac_mode": "fan_only", "temperature": 21}, {"hvac_mode": "fan_only", "preset": "comfort"},
])
async def test_set_override_refuses_off_or_fan_only_with_a_setpoint(bench: Bench, data: dict):
    await start(bench)
    with pytest.raises(ServiceValidationError) as error:
        await override(bench, **data)
    assert error.value.translation_key == "no_setpoint_in_hvac_mode"
    assert bench.overrides() == {} and bench.powered() == {}


async def test_set_override_refuses_an_hvac_mode_the_thermostat_does_not_list(bench: Bench):
    await start(bench)
    with pytest.raises(ServiceValidationError) as error:
        await bench.hass.services.async_call(
            "chauffage", "set_override", {"entity_id": BUREAU, "hvac_mode": "cool", "temperature": 24}, blocking=True)
    assert error.value.translation_key == "hvac_mode_not_listed"
    assert error.value.translation_placeholders == {"entity_id": BUREAU, "hvac_mode": "cool", "hvac_modes": "off, heat"}
    assert bench.overrides() == {}


async def test_set_override_refuses_a_duration_and_an_end_together(bench: Bench):
    await start(bench)
    with pytest.raises(ServiceValidationError) as error:
        await override(bench, temperature=21, duration=60, end="2026-10-12 12:00:00")
    assert error.value.translation_key == "duration_and_end"
    assert bench.overrides() == {}


async def test_the_refusals_of_set_override_are_translated(bench: Bench):
    import json
    from pathlib import Path
    component = Path(engine.__file__).parent
    for file in ("strings.json", "translations/en.json", "translations/fr.json"):
        exceptions = json.loads((component / file).read_text(encoding="utf-8"))["exceptions"]
        assert {"no_setpoint_in_hvac_mode", "hvac_mode_not_listed", "duration_and_end"} <= set(exceptions)
        assert "{hvac_mode}" in exceptions["hvac_mode_not_listed"]["message"]


# ----- the logbook tells a changed end -----

async def test_the_logbook_tells_an_override_whose_end_changed(bench: Bench):
    await start(bench)
    events: list[Event] = []
    bench.hass.bus.async_listen("chauffage_override_end_changed", callback(lambda event: events.append(event)))
    await override(bench, temperature=21, duration=60)
    assert events == []
    await bench.set_override(SALON, bench.overrides()[SALON] | {"end": "2026-10-12T12:30:00+02:00"})
    (event,) = events
    assert event.data["entity_id"] == SALON and event.data["source"] == "card"
    assert event.data["end"] == "2026-10-12T12:30:00+02:00"
    described = {}
    logbook.async_describe_events(bench.hass, lambda domain, name, describe: described.update({name: describe}))
    assert described["chauffage_override_end_changed"](event)["message"] == "override until Monday 12:30 (from the card)"
    await bench.hass.config.async_set_time_zone("Europe/Paris")
    bench.hass.config.language = "fr"
    assert described["chauffage_override_end_changed"](event)["message"] == "dérogation jusqu'à lundi 12:30 (depuis la carte)"


# ----- the HVAC mode switched by hand: the cooling value of the preset wins -----

async def test_switching_to_cool_by_hand_applies_the_slot_s_preset_in_cool(bench: Bench):
    """The slot heats on comfort. Switched to cool in Home Assistant's dialog, the unit gets
    the cooling value of comfort, and the override says comfort, in cool."""
    await start(bench, "10:00", [["00:00", "comfort", HEAT]], preset="comfort")
    await bench.runtime.set_mapping(SALON, {"comfort": {"cool_temperature": 24}})
    clear(bench)
    bench.thermostat(SALON, "comfort", state="cool", hvac_modes=REVERSIBLE, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    override_ = bench.overrides()[SALON]
    assert override_["preset"] == "comfort"
    assert override_["target"]["hvac_mode"] == "cool" and override_["target"]["cool_temperature"] == 24.0
    assert override_["ends_at"] == "duration"
    assert sent_to(bench) == [24.0]


async def test_an_override_to_a_preset_keeps_its_value_when_the_hvac_mode_is_switched_by_hand(bench: Bench):
    """Regression: an override to comfort, then cool chosen in Home Assistant's dialog. A
    Versatile Thermostat went to its own comfort in cool (25 °C), not to the 24 °C set in
    Chauffage."""
    await start(bench, "10:00", [["00:00", "eco", HEAT]])
    await bench.runtime.set_mapping(SALON, {"boost": {"cool_temperature": 24}})
    await override(bench, preset="boost", duration=180)
    bench.thermostat(SALON, "boost", hvac_modes=REVERSIBLE, context=CTX_AUTOMATION)  # it applies the override
    await bench.hass.async_block_till_done()
    clear(bench)
    # In cool, a Versatile Thermostat goes to its own boost for cooling; the others keep their setpoint
    own = 25.0 if bench.kind == "vtherm" else None
    bench.thermostat(SALON, "boost", own, state="cool", hvac_modes=REVERSIBLE, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    override_ = bench.overrides()[SALON]
    assert override_["preset"] == "boost" and override_["target"]["hvac_mode"] == "cool"
    assert override_["end"] == "2026-10-12T13:00:00+02:00"  # its end does not move
    assert sent_to(bench) == [24.0]


async def test_switching_the_hvac_mode_by_hand_in_an_off_slot_keeps_the_thermostat_s_own_setpoint(bench: Bench):
    await start(bench, "10:00", [["00:00", None, {"hvac_mode": "off"}]], state="off")
    bench.thermostat(SALON, "eco", state="cool", hvac_modes=REVERSIBLE, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides()[SALON]["target"] == COOL
    assert sent_to(bench) == [] and bench.applied() == {}


# ----- what a thermostat's own preset gives when cooling -----

async def test_the_card_sees_what_a_thermostat_s_own_preset_gives_when_cooling(bench: Bench):
    """A Versatile Thermostat publishes its cooling preset temperatures. Another thermostat
    shows it while it cools on the preset: learned apart from its heating temperature."""
    bench.needs("vtherm", "standard")
    if bench.kind == "vtherm":
        bench.versatile_thermostat(SALON)
    await start(bench, "10:00", [["00:00", "comfort", COOL]], preset="comfort")
    published = {"preset_temperatures": {"comfort_temp": 20.0, "comfort_cool_temp": 25.0}} if bench.kind == "vtherm" else {}
    bench.thermostat(SALON, "comfort", 25.0, state="cool", hvac_modes=REVERSIBLE, context=CTX_AUTOMATION, **published)
    await bench.hass.async_block_till_done()
    snapshot = bench.runtime.snapshot()
    assert snapshot["cool_preset_temperatures"][SALON]["comfort"] == 25.0
    assert snapshot["preset_temperatures"][SALON]["comfort"] == 20.0
    assert SALON not in snapshot["cool_preset_temperatures"].get(BUREAU, {})


# ----- one name for the setting of a thermostat turned off -----

def test_the_setting_for_a_thermostat_turned_off_has_one_name_everywhere():
    """In the options, on its entity and in the service: "Turned off", as on the card. Its
    description says it also applies to automations."""
    import json
    from pathlib import Path
    component = Path(engine.__file__).parent
    for file, name in (("strings.json", "Turned off"), ("translations/en.json", "Turned off"),
                       ("translations/fr.json", "Thermostat éteint")):
        texts = json.loads((component / file).read_text(encoding="utf-8"))
        options = texts["options"]["step"]["init"]
        assert options["data"]["off_override_end"] == name
        assert texts["entity"]["select"]["off_override_end"]["name"] == name
        assert name in texts["services"]["set_override"]["fields"]["hvac_mode"]["description"]
        assert "automati" in options["data_description"]["off_override_end"]


def test_frost_protection_of_a_new_installation_does_not_look_like_fan_only():
    """Its light blue looked like Home Assistant's cyan of fan only. Stored presets keep theirs."""
    from custom_components.chauffage import model
    colors = {preset["id"]: preset["color"] for preset in model.default_presets("fr")}
    assert colors["frost"] == "#78909c"
    assert len(set(colors.values())) == 4
