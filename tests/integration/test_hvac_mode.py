"""The slot chooses the HVAC mode (#91): it is one of Home Assistant's, a schedule has none,
the card and scripts read it, and set_override checks it."""

import pytest
import voluptuous as vol
from homeassistant.core import Event, callback
from homeassistant.exceptions import ServiceValidationError

from conftest import KINDS, WEEKDAY, Bench, every_day
from hvac_helpers import (
    BUREAU, COOL, FAN, NIGHT_OFF, OFF, REVERSIBLE, SALON, override, start_ac, start_ac_alone, start_ac_with_range,
    start_salon, unit,
)

from custom_components.chauffage import logbook, model
from custom_components.chauffage.domain.slot import slot_hvac_mode
from custom_components.chauffage.storage.schema import InvalidData


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


# ----- the HVAC mode of a slot -----

async def test_a_slot_s_hvac_mode_is_one_of_home_assistant_s(bench: Bench):
    await start_ac(bench)
    for bad in ({"hvac_mode": "defrost"}, {"hvac_mode": ""}, {"temperature": 19}):
        with pytest.raises(InvalidData):
            await bench.save_weeks({SALON: {"normal": every_day(("00:00", "eco", bad))}})
    assert bench.runtime.weeks[SALON]["normal"][0] == WEEKDAY


async def test_a_schedule_has_no_hvac_mode(bench: Bench):
    """The slot chooses it: what a card of a development version sends is not kept."""
    await start_ac(bench)
    await bench.set_schedules([{"id": "normal", "hvac_mode": "cool"}, {"id": "away"}, {"id": "holiday"}])
    assert bench.snapshot()["schedules"][0] == {"id": "normal", "name": "Normal"}
    response = await bench.hass.services.async_call("chauffage", "get_schedules", {}, blocking=True, return_response=True)
    assert "hvac_mode" not in response["schedules"][0]
    assert bench.powered() == {}


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
    assert slot_hvac_mode(settings, unit(modes=modes)) == read


async def test_two_slots_alike_are_stored_as_two_and_the_second_one_sends_nothing(bench: Bench):
    """The user set a slot to the preset of the slot before it, and kept the cut. The week is
    stored as it was sent. The second slot changes nothing on the thermostat."""
    day = [["00:00", "eco"], ["14:00", "eco"], ["20:00", "comfort"]]
    await start_ac_alone(bench, day, "13:00")
    assert bench.runtime.weeks[SALON]["normal"][0] == day
    await bench.go_to("14:00")
    assert bench.applied() == {} and bench.powered() == {}
    # The next slot of the planned preset is the next different one
    assert bench.runtime.read_model.planned_info(SALON)["next_start"] == "2026-10-12T20:00:00+02:00"


# ----- what the card, the sensor and scripts see -----

async def test_the_card_sees_the_hvac_mode_of_the_current_and_next_slot(bench: Bench):
    await start_salon(bench, "23:00", NIGHT_OFF, state="off")
    planned = bench.runtime.read_model.snapshot()["planned"]["climate.salon"]
    assert (planned["preset"], planned["hvac_mode"]) == (None, "off")
    assert (planned["next_preset"], planned["next_hvac_mode"], planned["next_start"]) == (
        "comfort", None, "2026-10-13T06:30:00+02:00")
    sensor = bench.hass.states.get("sensor.salon_planned_preset")
    assert sensor.state == "unknown"  # an off slot has no preset
    assert (sensor.attributes["hvac_mode"], sensor.attributes["next_hvac_mode"]) == ("off", None)
    assert sensor.attributes["target"] == OFF


async def test_the_planned_preset_sensor_says_the_slot_s_hvac_mode(bench: Bench):
    day = [["00:00", "eco"], ["14:00", "comfort", COOL], ["18:00", None, FAN], ["22:00", None, OFF]]
    await start_ac(bench, "13:00", day)
    names = ("salon", "bureau")
    salon, bureau = (bench.hass.states.get(f"sensor.{name}_planned_preset").attributes for name in names)
    # A slot that says none heats, on an air conditioner that heats and cools
    assert (salon["hvac_mode"], salon["next_hvac_mode"], salon["next_preset"]) == ("heat", "cool", "comfort")
    assert (bureau["hvac_mode"], bureau["next_hvac_mode"]) == (None, None)  # a heater does not cool
    await bench.go_to("18:00")
    sensor = bench.hass.states.get("sensor.salon_planned_preset")
    assert sensor.state == "unknown"  # a fan-only slot has no preset
    assert (sensor.attributes["hvac_mode"], sensor.attributes["next_hvac_mode"], sensor.attributes["next_preset"]) == ("fan_only", "off", None)
    assert sensor.attributes["target"] == FAN


async def test_a_script_reads_the_hvac_mode_of_the_slots(bench: Bench):
    await start_ac(bench, "10:00", [["00:00", None, OFF], ["06:30", "comfort", COOL], ["22:30", None, OFF]])
    week = await bench.hass.services.async_call("chauffage", "get_week", {"entity_id": SALON}, blocking=True, return_response=True)
    monday = week[SALON]["monday"]
    assert monday[0] == {"start": "00:00", "end": "06:30", "preset": None, "hvac_mode": "off"}
    assert monday[1] == {"start": "06:30", "end": "22:30", "preset": "comfort", "hvac_mode": "cool"}


async def test_a_script_reads_the_slots_as_they_run(bench: Bench):
    """chauffage.get_week: a slot stored without an HVAC mode reads heat on an air conditioner
    that heats and cools, and carries none on a heater."""
    await start_ac(bench, "10:00", [["00:00", "eco"], ["14:00", "comfort", COOL]])
    week = await bench.hass.services.async_call(
        "chauffage", "get_week", {"entity_id": [SALON, BUREAU]}, blocking=True, return_response=True)
    assert week[SALON]["monday"] == [
        {"start": "00:00", "end": "14:00", "preset": "eco", "hvac_mode": "heat"},
        {"start": "14:00", "end": "24:00", "preset": "comfort", "hvac_mode": "cool"}]
    assert week[BUREAU]["monday"] == [
        {"start": "00:00", "end": "14:00", "preset": "eco"}, {"start": "14:00", "end": "24:00", "preset": "comfort"}]


# ----- set_override checks the HVAC mode -----

async def test_set_override_refuses_an_hvac_mode_home_assistant_does_not_know(bench: Bench):
    """"Off" or "heating": reproduce_state would ignore it silently, and the override would be
    recorded with nothing sent."""
    await start_salon(bench, "23:00")
    for bad in ("Off", "heating"):
        with pytest.raises(vol.Invalid):
            await bench.hass.services.async_call(
                "chauffage", "set_override", {"entity_id": "climate.salon", "hvac_mode": bad}, blocking=True)
    assert bench.overrides() == {} and bench.powered() == {}


@pytest.mark.parametrize("data", [
    {"hvac_mode": "off", "temperature": 21}, {"hvac_mode": "off", "preset": "comfort"},
    {"hvac_mode": "fan_only", "temperature": 21}, {"hvac_mode": "fan_only", "preset": "comfort"},
])
async def test_set_override_refuses_off_or_fan_only_with_a_setpoint(bench: Bench, data: dict):
    await start_ac(bench)
    with pytest.raises(ServiceValidationError) as error:
        await override(bench, **data)
    assert error.value.translation_key == "no_setpoint_in_hvac_mode"
    assert bench.overrides() == {} and bench.powered() == {}


async def test_set_override_refuses_an_hvac_mode_the_thermostat_does_not_list(bench: Bench):
    await start_ac(bench)
    with pytest.raises(ServiceValidationError) as error:
        await bench.hass.services.async_call(
            "chauffage", "set_override", {"entity_id": BUREAU, "hvac_mode": "cool", "temperature": 24}, blocking=True)
    assert error.value.translation_key == "hvac_mode_not_listed"
    assert error.value.translation_placeholders == {"entity_id": BUREAU, "hvac_mode": "cool", "hvac_modes": "off, heat"}
    assert bench.overrides() == {}


async def test_set_override_refuses_a_duration_and_an_end_together(bench: Bench):
    await start_ac(bench)
    with pytest.raises(ServiceValidationError) as error:
        await override(bench, temperature=21, duration=60, end="2026-10-12 12:00:00")
    assert error.value.translation_key == "duration_and_end"
    assert bench.overrides() == {}


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
    await start_ac_with_range(bench, [["00:00", "eco"]])
    with pytest.raises((ServiceValidationError, vol.Invalid)):
        await override(bench, **data)
    assert bench.overrides() == {} and bench.powered() == {}


async def test_the_refusals_of_set_override_are_translated(bench: Bench):
    import json
    from pathlib import Path
    component = Path(model.__file__).parent
    for file in ("strings.json", "translations/en.json", "translations/fr.json"):
        exceptions = json.loads((component / file).read_text(encoding="utf-8"))["exceptions"]
        assert {"no_setpoint_in_hvac_mode", "hvac_mode_not_listed", "duration_and_end"} <= set(exceptions)
        assert "{hvac_mode}" in exceptions["hvac_mode_not_listed"]["message"]


async def test_the_logbook_tells_an_override_whose_end_changed(bench: Bench):
    await start_ac(bench)
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


@pytest.mark.parametrize(("data", "key"), [
    ({"hvac_mode": "heat_cool", "target_temp_low": 19}, "range_incomplete"),
    ({"hvac_mode": "heat_cool", "target_temp_high": 24}, "range_incomplete"),
    ({"hvac_mode": "heat_cool", "target_temp_low": 25, "target_temp_high": 20}, "range_inverted"),
    ({"hvac_mode": "heat_cool", "temperature": 21}, "heat_cool_takes_a_range"),
    ({"hvac_mode": "heat", "target_temp_low": 19, "target_temp_high": 24}, "range_in_heat_cool"),
    ({"temperature": 21, "end": "2026-10-12 09:00:00"}, "end_in_the_past"),
])
async def test_set_override_says_what_is_wrong_with_a_range_or_an_end(bench: Bench, data: dict, key: str):
    """Each refusal names its own reason, in the user's language: not a raw message of the
    schema, and not one message for several mistakes."""
    await start_ac_with_range(bench, [["00:00", "eco"]])
    with pytest.raises(ServiceValidationError) as error:
        await override(bench, **data)
    assert error.value.translation_key == key
    assert bench.overrides() == {} and bench.powered() == {}


def test_every_refusal_of_set_override_has_a_text_in_every_language():
    import json
    from pathlib import Path
    component = Path(model.__file__).parent
    keys = {"range_incomplete", "range_inverted", "heat_cool_takes_a_range", "range_in_heat_cool", "end_in_the_past"}
    for file in ("strings.json", "translations/en.json", "translations/fr.json"):
        assert keys <= set(json.loads((component / file).read_text(encoding="utf-8"))["exceptions"])
