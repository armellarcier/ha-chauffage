"""The slot chooses the HVAC mode (#91). The preset says how warm, for that HVAC mode.

A slot on a preset says heat or cool on an air conditioner. A slot without a preset is off, or
fan only. A schedule has no HVAC mode. What a slot that says none means on each kind of
thermostat: test_air_conditioner_slots.py."""

import pytest
from homeassistant.core import Context, Event, callback

from conftest import CTX_USER, KINDS, WEEKDAY, Bench, every_day

from custom_components.chauffage import engine, model

OFF = {"hvac_mode": "off"}
COOL = {"hvac_mode": "cool"}
HEAT = {"hvac_mode": "heat"}
FAN = {"hvac_mode": "fan_only"}
AC_MODES = ["off", "heat", "cool", "fan_only"]
SALON, BUREAU = "climate.salon", "climate.bureau"
# Off from 22:30 to the morning
NIGHT_OFF = [["00:00", None, OFF], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"], ["22:30", None, OFF]]


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def start(bench: Bench, hhmm: str = "10:00", day: list | None = None, state: str = "heat", preset: str = "eco",
                options: dict | None = None, **attributes) -> None:
    """The salon is a reversible air conditioner, the bureau a heater; both follow `day`."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, preset, state=state, **({"hvac_modes": AC_MODES} | attributes))
    bench.thermostat(BUREAU, preset)
    await bench.setup(options)
    await bench.save_weeks({entity: {"normal": [day or WEEKDAY] * 7} for entity in (SALON, BUREAU)})
    clear(bench)


def clear(bench: Bench) -> None:
    bench.applied()
    bench.powered()
    bench.settings()
    bench.temperature_calls.clear()


def state(bench: Bench, entity_id: str = SALON) -> str:
    return bench.hass.states.get(entity_id).state


def sent_to(bench: Bench, entity_id: str = SALON) -> list[float]:
    return [temperature for entity, temperature in bench.temperature_calls if entity == entity_id]


# ----- the slot chooses the HVAC mode -----

async def test_a_cooling_slot_switches_the_air_conditioner_to_cool(bench: Bench):
    """A heater does not list cool: it ignores the slot's HVAC mode, and gets its preset."""
    await start(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort", COOL]])
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "cool"}
    assert (state(bench), state(bench, BUREAU)) == ("cool", "heat")
    assert bench.applied()[BUREAU] == "comfort"


async def test_a_heating_slot_switches_a_cooling_air_conditioner_to_heat(bench: Bench):
    await start(bench, "13:00", [["00:00", "eco", COOL], ["14:00", "comfort", HEAT]], state="cool")
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "heat"}
    assert bench.applied()[SALON] == "comfort"


async def test_each_slot_is_independent(bench: Bench):
    """Cool in the afternoon, then heat in the evening: a slot does not inherit the HVAC mode of
    the slot before it."""
    await start(bench, "13:00", [["00:00", "eco", HEAT], ["14:00", "comfort", COOL], ["18:00", "eco", HEAT]])
    await bench.go_to("14:00")
    clear(bench)
    await bench.go_to("18:00")
    assert bench.powered() == {SALON: "heat"} and state(bench) == "heat"


async def test_a_cooling_slot_gives_a_preset_its_cooling_temperature(bench: Bench):
    """Comfort on the air conditioner: 20 °C when heating, 25 °C when cooling."""
    await start(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort", COOL], ["16:00", "comfort", HEAT]])
    await bench.runtime.set_mapping(SALON, {"comfort": {"temperature": 20, "cool_temperature": 25}})
    clear(bench)
    await bench.go_to("14:00")
    assert sent_to(bench) == [25.0]
    clear(bench)
    await bench.go_to("16:00")
    assert bench.powered()[SALON] == "heat"
    assert sent_to(bench) == [20.0]


async def test_a_cooling_slot_sends_the_device_preset_and_never_a_heating_temperature(bench: Bench):
    """A preset without a cooling temperature: the device knows what its own comfort means in
    cool, so its climate preset is sent. Chauffage's heating temperature (20 °C) is not."""
    await start(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort", COOL]])
    await bench.go_to("14:00")
    assert sent_to(bench) == []
    assert bench.applied().get(SALON) == ("comfort" if bench.kind != "plain" else None)


async def test_a_slot_s_hvac_mode_is_heat_cool_off_or_fan_only(bench: Bench):
    await start(bench)
    for bad in ({"hvac_mode": "auto"}, {"hvac_mode": "dry"}, {"hvac_mode": ""}, {"temperature": 19}):
        with pytest.raises(model.InvalidData):
            await bench.save_weeks({SALON: {"normal": every_day(("00:00", "eco", bad))}})
    assert bench.runtime.weeks[SALON]["normal"][0] == WEEKDAY


async def test_a_schedule_has_no_hvac_mode(bench: Bench):
    """The slot chooses it: what a card of a development version sends is not kept."""
    await start(bench)
    await bench.set_schedules([{"id": "normal", "hvac_mode": "cool"}, {"id": "away"}, {"id": "holiday"}])
    assert bench.runtime.data["schedules"][0] == {"id": "normal", "name": "Normal"}
    response = await bench.hass.services.async_call("chauffage", "get_schedules", {}, blocking=True, return_response=True)
    assert "hvac_mode" not in response["schedules"][0]
    assert bench.powered() == {}


# ----- an off slot has no preset -----

async def test_an_off_slot_only_turns_the_thermostat_off(bench: Bench):
    """Off, and nothing else: no preset, no setpoint. The next slot turns the thermostat on."""
    await start(bench, "22:00", NIGHT_OFF, preset="comfort")
    await bench.go_to("22:30")
    assert bench.powered() == {SALON: "off", BUREAU: "off"}
    assert bench.applied() == {} and bench.temperature_calls == []
    await bench.go_to("06:30", day=1)
    assert bench.powered() == {SALON: "heat", BUREAU: "heat"}


async def test_an_off_slot_holds_no_preset_and_two_in_a_row_are_one(bench: Bench):
    await start(bench)
    day = [["00:00", "eco"], ["12:00", "comfort", OFF], ["13:00", None, {"hvac_mode": "off", "fan_mode": "3"}], ["14:00", "eco"]]
    await bench.save_weeks({SALON: {"normal": [day] * 7}})
    assert bench.runtime.weeks[SALON]["normal"][0] == [["00:00", "eco"], ["12:00", None, OFF], ["14:00", "eco"]]


async def test_an_off_night_needs_no_rule(bench: Bench):
    """Off in the evening and off in the first slot of the next day: nothing is sent at midnight."""
    await start(bench, "22:00", NIGHT_OFF)
    await bench.go_to("22:30")
    clear(bench)
    await bench.go_to("00:00", day=1)
    await bench.go_to("06:29", day=1)
    assert bench.powered() == {} and bench.applied() == {}


async def test_a_thermostat_turned_on_by_hand_during_an_off_slot_keeps_its_own_setpoint(bench: Bench):
    await start(bench, "23:00", NIGHT_OFF, state="off")
    bench.thermostat(SALON, "eco", state="heat", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"] == HEAT
    assert bench.applied() == {} and bench.temperature_calls == []


async def test_a_preset_removed_leaves_the_off_slots_alone(bench: Bench):
    await start(bench, "10:00", [["00:00", "boost"], ["22:00", None, OFF]])
    presets = [p for p in bench.runtime.data["presets"] if p["id"] != "boost"]
    await bench.runtime.set_presets(presets, {"boost": "comfort"})
    assert bench.runtime.weeks[SALON]["normal"][0] == [["00:00", "comfort"], ["22:00", None, OFF]]


# ----- a fan-only slot -----

FAN_ATTRS = {"fan_modes": ["auto", "1", "2", "3"], "swing_modes": ["auto", "swing"], "fan_mode": "auto", "swing_mode": "auto"}


async def test_a_fan_only_slot_ventilates_without_a_preset_or_a_setpoint(bench: Bench):
    day = [["00:00", "eco"], ["14:00", None, {"hvac_mode": "fan_only", "fan_mode": "3", "swing_mode": "swing"}], ["16:00", "comfort"]]
    await start(bench, "13:00", day, **FAN_ATTRS)
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "fan_only"}
    assert bench.settings() == {(SALON, "fan_mode"): "3", (SALON, "swing_mode"): "swing"}
    assert SALON not in bench.applied() and sent_to(bench) == []
    assert BUREAU not in bench.powered()  # a heater has no fan: left as it is


async def test_a_preset_slot_after_a_fan_only_slot_heats_or_cools_again(bench: Bench):
    """Fan only takes no setpoint: the next slot on a preset turns the air conditioner on as it
    turns on one that is off, in heat when it lists it."""
    day = [["00:00", "eco"], ["14:00", None, FAN], ["16:00", "comfort"]]
    await start(bench, "13:00", day)
    await bench.go_to("14:00")
    clear(bench)
    await bench.go_to("16:00")
    assert bench.powered() == {SALON: "heat"}


async def test_two_fan_only_slots_merge_when_their_settings_are_equal(bench: Bench):
    await start(bench)
    quiet = {"hvac_mode": "fan_only", "fan_mode": "1"}
    day = [["00:00", "eco", FAN], ["08:00", None, FAN], ["12:00", None, quiet], ["13:00", "comfort", quiet], ["14:00", None, FAN]]
    await bench.save_weeks({SALON: {"normal": [day] * 7}})
    assert bench.runtime.weeks[SALON]["normal"][0] == [["00:00", None, FAN], ["12:00", None, quiet], ["14:00", None, FAN]]


async def test_a_thermostat_in_fan_only_is_turned_on_in_the_mode_it_last_heated_or_cooled_in(bench: Bench):
    """A cooling-only air conditioner: fan only is not a mode to come back to."""
    cooler = ["off", "cool", "fan_only"]
    await start(bench, "13:00", [["00:00", "eco"], ["14:00", None, FAN], ["16:00", "comfort"]], state="cool", hvac_modes=cooler)
    await bench.go_to("14:00")
    assert bench.runtime.thermostats[SALON]["hvac_mode"] == "cool"
    clear(bench)
    await bench.go_to("16:00")
    assert bench.powered() == {SALON: "cool"}


# ----- overrides -----

async def test_an_off_override_only_turns_the_thermostat_off(bench: Bench):
    await start(bench, "21:00", preset="comfort")
    await bench.set_override(SALON, bench.runtime.new_override({"hvac_mode": "off", "preset_mode": "frost"}, minutes=90))
    assert bench.overrides()[SALON]["target"] == OFF
    assert bench.powered() == {SALON: "off"}
    assert bench.applied() == {} and bench.temperature_calls == []


async def test_a_preset_or_a_setpoint_changed_while_the_thermostat_is_off_is_not_an_override(bench: Bench):
    """The thermostat stays off, and keeps what the user set for when it is turned on."""
    await start(bench, "23:00", NIGHT_OFF, state="off")
    bench.thermostat(SALON, "boost", 23.0, state="off", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.powered() == {} and bench.applied() == {}


async def test_an_override_never_ends_because_a_slot_meets_it(bench: Bench):
    """Turned off from the card at 22:00 until 23:30, with an off slot at 22:30: the override
    holds to its end, and ends as expired."""
    ended: list[dict] = []

    @callback
    def listen(event: Event) -> None:
        ended.append(dict(event.data))

    bench.hass.bus.async_listen("chauffage_override_ended", listen)
    await start(bench, "22:00", NIGHT_OFF, preset="comfort")
    await bench.set_override(SALON, bench.runtime.new_override(OFF, minutes=90))
    await bench.go_to("22:30")
    assert SALON in bench.overrides() and ended == []
    await bench.go_to("23:30")
    assert [(event["entity_id"], event["reason"]) for event in ended] == [(SALON, "expired")]
    assert state(bench) == "off"


async def test_a_preset_picked_on_an_off_air_conditioner_turns_it_on(bench: Bench):
    await start(bench, "10:00", [["00:00", None, OFF]], state="off")
    override = bench.runtime.new_override(bench.runtime.targets_of(SALON)["comfort"]) | {"preset": "comfort"}
    await bench.set_override(SALON, override)
    assert bench.powered() == {SALON: "heat"}
    assert "hvac_mode" not in bench.overrides()[SALON]["target"]


async def test_switching_the_air_conditioner_to_heat_by_hand_in_a_cooling_slot_is_an_override(bench: Bench):
    """The override keeps the slot's preset, in the HVAC mode chosen by hand."""
    await start(bench, "10:00", [["00:00", "eco", COOL]], state="cool")
    bench.thermostat(SALON, "eco", state="heat", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    override = bench.overrides()[SALON]
    assert override["target"]["hvac_mode"] == "heat" and override["preset"] == "eco"


async def test_switching_to_fan_only_by_hand_is_an_override(bench: Bench):
    await start(bench)
    bench.thermostat(SALON, "eco", state="fan_only", hvac_modes=AC_MODES, context=Context())
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"] == FAN


# ----- how long an off override lasts -----

async def turn_off(bench: Bench) -> dict:
    bench.thermostat(SALON, "eco", state="off", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    return bench.overrides()[SALON]


async def test_a_thermostat_turned_off_by_hand_stays_off_until_the_next_slot_by_default(bench: Bench):
    """Off at 10:00, the next slot that changes the thermostat is at 17:30: far beyond the 2 hours
    of the override duration, which is for setpoints."""
    await start(bench)
    override = await turn_off(bench)
    assert (override["target"], override["end"], override["ends_at"]) == (OFF, "2026-10-12T17:30:00+02:00", "next_slot")
    await bench.go_to("17:29")
    assert bench.powered() == {}
    await bench.go_to("17:30")
    assert bench.overrides() == {} and bench.powered() == {SALON: "heat"}


async def test_an_off_override_can_last_the_override_duration(bench: Bench):
    await start(bench, options={"off_override_end": "duration"})
    override = await turn_off(bench)
    assert (override["end"], override["ends_at"]) == ("2026-10-12T12:00:00+02:00", "duration")


async def test_an_off_override_can_last_the_override_duration_or_less(bench: Bench):
    await start(bench, "16:00", options={"off_override_end": "next_slot_within_duration"})
    override = await turn_off(bench)
    assert (override["end"], override["ends_at"]) == ("2026-10-12T17:30:00+02:00", "next_slot")


async def test_an_off_override_without_a_next_slot_lasts_a_week(bench: Bench):
    await start(bench, "10:00", [["00:00", "eco"]])
    override = await turn_off(bench)
    assert (override["end"], override["ends_at"]) == ("2026-10-19T10:00:00+02:00", "no_next_slot")


async def test_a_script_that_turns_a_thermostat_off_without_an_end_follows_the_setting(bench: Bench):
    await start(bench)
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": SALON, "hvac_mode": "off"}, blocking=True)
    override = bench.overrides()[SALON]
    assert (override["end"], override["ends_at"]) == ("2026-10-12T17:30:00+02:00", "next_slot")
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": SALON, "hvac_mode": "off", "duration": 60}, blocking=True)
    assert bench.overrides()[SALON]["end"] == "2026-10-12T11:00:00+02:00"


async def test_the_end_of_off_overrides_does_not_change_the_end_of_the_others(bench: Bench):
    await start(bench)
    await bench.manual_setpoint(SALON, 22.5)
    override = bench.overrides()[SALON]
    assert (override["end"], override["ends_at"]) == ("2026-10-12T12:00:00+02:00", "duration")


async def test_the_end_of_off_overrides_is_a_setting(bench: Bench, ws_client):
    """In the options, on a select entity and from the panel, next to *End of overrides*."""
    await start(bench)
    assert bench.runtime.snapshot()["off_override_end"] == "next_slot"
    select = "select.chauffage_off_override_end"
    assert bench.hass.states.get(select).state == "next_slot"
    await bench.hass.services.async_call("select", "select_option", {"entity_id": select, "option": "duration"}, blocking=True)
    await bench.hass.async_block_till_done()
    assert bench.entry.options["off_override_end"] == "duration"
    client = await ws_client(bench.hass)
    await client.send_json({"id": 1, "type": "chauffage/settings/set", "off_override_end": "next_slot_within_duration"})
    assert (await client.receive_json())["success"]
    await bench.hass.async_block_till_done()
    assert bench.runtime.off_override_end == "next_slot_within_duration"
    await client.send_json({"id": 2, "type": "chauffage/settings/set", "off_override_end": "whenever"})
    assert not (await client.receive_json())["success"]


async def test_an_unknown_end_of_off_overrides_is_the_default(bench: Bench):
    await start(bench, options={"off_override_end": "whenever"})
    assert bench.runtime.off_override_end == "next_slot"


# ----- colors -----

async def test_a_preset_may_have_a_color_for_its_cooling_slots(bench: Bench):
    """Without one, the card derives a cool shade from the preset's color: nothing is stored."""
    await start(bench)
    presets = bench.runtime.data["presets"]
    assert all("cool_color" not in preset for preset in presets)
    await bench.runtime.set_presets([{**presets[0], "cool_color": "#0288D1"}, *presets[1:]])
    assert bench.runtime.data["presets"][0]["cool_color"] == "#0288d1"
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_presets([{**presets[0], "cool_color": "blue"}, *presets[1:]])


async def test_a_preset_does_not_set_an_hvac_mode(bench: Bench):
    await start(bench)
    await bench.runtime.set_presets([*bench.runtime.data["presets"], {"name": "Away", "temperature": 7, "hvac_mode": "off"}])
    assert bench.runtime.data["presets"][-1] == {"id": "away", "name": "Away", "color": "#9e9e9e", "temperature": 7.0}


@pytest.mark.parametrize("value", [{"temperature": 20, "hvac_mode": "cool"}, {"hvac_mode": "off"},
                                   {"preset_mode": "eco", "temperature": 20}, {}])
async def test_a_preset_s_value_is_a_climate_preset_or_a_temperature(bench: Bench, value: dict):
    """Not both, and never an HVAC mode. Alone, a cooling temperature or a fan adds to the default."""
    await start(bench)
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_mapping(SALON, {"comfort": value})


# ----- what the entities and the scripts see -----

async def test_the_planned_preset_sensor_says_the_slot_s_hvac_mode(bench: Bench):
    day = [["00:00", "eco"], ["14:00", "comfort", COOL], ["18:00", None, FAN], ["22:00", None, OFF]]
    await start(bench, "13:00", day)
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
    await start(bench, "10:00", [["00:00", None, OFF], ["06:30", "comfort", COOL], ["22:30", None, OFF]])
    week = await bench.hass.services.async_call("chauffage", "get_week", {"entity_id": SALON}, blocking=True, return_response=True)
    monday = week[SALON]["monday"]
    assert monday[0] == {"start": "00:00", "end": "06:30", "preset": None, "hvac_mode": "off"}
    assert monday[1] == {"start": "06:30", "end": "22:30", "preset": "comfort", "hvac_mode": "cool"}


# ----- the pure logic -----

def ac(state: str = "cool", last: str | None = None, modes: tuple = tuple(AC_MODES)) -> engine.Thermostat:
    return engine.Thermostat(state, "comfort", 20.0, ("eco", "comfort"), 16.0, 30.0, 0.5, hvac_modes=modes, last_hvac_mode=last)


PRESETS = {p["id"]: p for p in model.default_presets("en")}


def test_the_slot_s_hvac_mode_is_the_target_s_when_the_thermostat_lists_it():
    assert engine.resolve("comfort", PRESETS, {}, ac("heat"), settings=COOL) == {"preset_mode": "comfort", "hvac_mode": "cool"}
    heater = engine.Thermostat("heat", "eco", 17.0, ("eco", "comfort"), hvac_modes=("off", "heat"))
    assert engine.resolve("comfort", PRESETS, {}, heater, settings=COOL) == {"preset_mode": "comfort"}
    assert engine.resolve("comfort", PRESETS, {}, None, settings=COOL) == {"temperature": 20.0}  # a thermostat not seen yet


def test_an_off_slot_and_a_fan_only_slot_have_no_setpoint():
    assert engine.resolve(None, PRESETS, {"comfort": {"temperature": 21.0}}, ac("heat"), settings=OFF) == OFF
    assert engine.resolve("comfort", PRESETS, {}, ac("heat"), settings=OFF) == OFF  # a preset left on it is ignored
    breeze = {"hvac_mode": "fan_only", "fan_mode": "2"}
    assert engine.resolve(None, PRESETS, {}, ac("heat"), settings=breeze) == breeze
    heater = engine.Thermostat("heat", "eco", 17.0, ("eco", "comfort"), hvac_modes=("off", "heat"))
    assert engine.resolve(None, PRESETS, {}, heater, settings=breeze) is None  # no fan: left as it is
    assert engine.resolve(None, PRESETS, {}, ac("heat")) is None  # no preset, no HVAC mode: nothing


def test_an_off_target_is_sent_alone():
    assert engine.complete({"hvac_mode": "off", "temperature": 16.0, "cool_temperature": 28.0, "fan_mode": "1"}, ac("cool")) == OFF


def test_in_cool_the_device_preset_is_sent_and_the_heating_temperature_is_not():
    assert engine.complete({"preset_mode": "eco"}, ac("cool")) == {"preset_mode": "eco"}
    assert engine.complete({"preset_mode": "eco", "hvac_mode": "cool"}, ac("heat")) == {"preset_mode": "eco", "hvac_mode": "cool"}
    assert engine.complete({"temperature": 21.0}, ac("cool")) == {}
    assert engine.complete({"temperature": 21.0, "cool_temperature": 26.0}, ac("cool")) == {"temperature": 26.0}
    assert engine.complete({"temperature": 24.0}, ac("cool"), by_user=True) == {"temperature": 24.0}


def test_a_thermostat_off_or_in_fan_only_is_turned_on_for_a_preset():
    target = {"preset_mode": "comfort"}
    assert engine.complete(target, ac("fan_only")) == {"preset_mode": "comfort", "hvac_mode": "heat"}
    cooler = ("off", "fan_only", "cool")
    assert engine.complete(target, ac("fan_only", modes=cooler)) == {"preset_mode": "comfort", "hvac_mode": "cool"}
    assert engine.complete(target, ac("off", modes=("off", "fan_only"))) == {"preset_mode": "comfort", "hvac_mode": "fan_only"}
    assert not engine.satisfied(target, ac("fan_only"))
    assert engine.satisfied(FAN, ac("fan_only"))


def test_a_change_made_while_off_is_not_an_override():
    expected = {"preset_mode": "comfort"}
    assert engine.manual_change(ac("off"), ac("off"), by_user=True, expected=OFF) is None
    off, boosted = ac("off"), engine.Thermostat("off", "boost", 23.0, ("eco", "comfort", "boost"), hvac_modes=tuple(AC_MODES))
    assert engine.manual_change(off, boosted, by_user=True, expected=OFF) is None
    assert engine.manual_change(off, boosted, by_user=True, expected=expected, override=OFF) is None
    # Turned off with a preset picked in the same state: off, alone
    assert engine.manual_change(ac("heat"), boosted, by_user=True, expected=expected) == OFF
