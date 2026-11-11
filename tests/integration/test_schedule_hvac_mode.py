"""The schedule says whether the air conditioners heat or cool (#91). A slot says when the room
is off, or which preset it gets. The preset says how warm, for each thermostat.

A schedule has an optional HVAC mode, heat or cool, for the thermostats that list it; without
one it does not change the HVAC mode. A slot only sets the HVAC mode off."""

import pytest
from homeassistant.core import Event, callback

from conftest import CTX_USER, KINDS, WEEKDAY, Bench, every_day

from custom_components.chauffage import engine, model

OFF = {"hvac_mode": "off"}
AC_MODES = ["off", "heat", "cool", "fan_only"]
SALON, BUREAU = "climate.salon", "climate.bureau"
# Off from 22:30 to the morning: the evening's off slot, and the next day's first slot
NIGHT_OFF = [["00:00", "frost", OFF], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"], ["22:30", "frost", OFF]]


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def start(bench: Bench, hhmm: str = "10:00", day: list | None = None, state: str = "heat", preset: str = "eco") -> None:
    """The salon is a reversible air conditioner, the bureau a heater; both follow `day`."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, preset, state=state, hvac_modes=AC_MODES)
    bench.thermostat(BUREAU, preset)
    await bench.setup()
    await bench.save_weeks({entity: {"normal": [day or WEEKDAY] * 7} for entity in (SALON, BUREAU)})
    clear(bench)


def clear(bench: Bench) -> None:
    bench.applied()
    bench.powered()
    bench.temperature_calls.clear()


async def schedule_says(bench: Bench, schedule: str, hvac_mode: str | None) -> None:
    await bench.schedule_says(schedule, hvac_mode)


def state(bench: Bench, entity_id: str = SALON) -> str:
    return bench.hass.states.get(entity_id).state


# ----- the schedule says heat or cool -----

async def test_a_cooling_schedule_switches_the_air_conditioners_to_cool(bench: Bench):
    """Summer: activating the schedule that says cool switches the air conditioner to cool. A
    heater does not list cool: it ignores the schedule's HVAC mode."""
    await start(bench)
    await schedule_says(bench, "holiday", "cool")
    assert bench.powered() == {}  # not the active schedule: nothing changes
    await bench.activate_schedule("Holiday")
    assert bench.powered() == {SALON: "cool"}
    assert (state(bench), state(bench, BUREAU)) == ("cool", "heat")


async def test_a_heating_schedule_switches_a_cooling_air_conditioner_to_heat(bench: Bench):
    """Winter: the schedule that says heat takes a cooling air conditioner back to heat."""
    await start(bench, state="cool")
    await schedule_says(bench, "away", "heat")
    await bench.activate_schedule("Away")
    assert bench.powered() == {SALON: "heat"}


async def test_a_schedule_without_an_hvac_mode_keeps_a_cooling_air_conditioner_cooling(bench: Bench):
    """*Don't change*, the default: existing schedules behave as before."""
    await start(bench, state="cool")
    await bench.activate_schedule("Away")
    await bench.go_to("17:30")
    assert bench.powered() == {}
    assert state(bench) == "cool"


async def test_choosing_the_active_schedule_s_hvac_mode_applies_it_at_once(bench: Bench):
    await start(bench)
    await schedule_says(bench, "normal", "cool")
    assert bench.powered() == {SALON: "cool"}
    await schedule_says(bench, "normal", None)
    assert bench.powered() == {}  # don't change: the air conditioner keeps cooling
    assert bench.runtime.data["schedules"][0] == {"id": "normal", "name": "Normal"}


async def test_a_cooling_schedule_gives_a_preset_its_cooling_setpoint(bench: Bench):
    """Comfort on the air conditioner: 20 °C when heating, 25 °C when cooling."""
    await start(bench, "17:00")
    await bench.runtime.set_mapping(SALON, {"comfort": {"temperature": 20, "cool_temperature": 25}})
    await schedule_says(bench, "normal", "cool")
    clear(bench)
    await bench.go_to("17:30")
    assert [call for call in bench.temperature_calls if call[0] == SALON] == [(SALON, 25.0)]


async def test_a_cooling_schedule_leaves_the_setpoint_of_a_preset_without_a_cooling_setpoint(bench: Bench):
    """A preset's temperature is a heating value: never 20 °C sent to an air conditioner that cools."""
    await start(bench, "17:00")
    await schedule_says(bench, "normal", "cool")
    clear(bench)
    await bench.go_to("17:30")
    assert [call for call in bench.temperature_calls if call[0] == SALON] == []
    assert SALON not in bench.applied()


async def test_an_off_slot_turns_a_cooling_air_conditioner_off_then_the_next_slot_cools_again(bench: Bench):
    """An off slot in a cooling schedule sends no heating setpoint; the next slot turns the air
    conditioner back on in cool."""
    day = [["00:00", "eco"], ["14:00", "eco", OFF], ["16:00", "comfort"]]
    await start(bench, "13:00", day)
    await schedule_says(bench, "normal", "cool")
    clear(bench)
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "off", BUREAU: "off"}
    assert [call for call in bench.temperature_calls if call[0] == SALON] == []
    assert SALON not in bench.applied()
    await bench.go_to("16:00")
    assert bench.powered() == {SALON: "cool", BUREAU: "heat"}


async def test_a_preset_picked_on_an_off_air_conditioner_turns_it_on_in_the_schedule_s_hvac_mode(bench: Bench):
    """An override set to a preset from the card, during an off slot of a cooling schedule."""
    await start(bench, "10:00", [["00:00", "eco", OFF]], state="off")
    await schedule_says(bench, "normal", "cool")
    clear(bench)
    override = bench.runtime.new_override(bench.runtime.targets_of(SALON)["comfort"]) | {"preset": "comfort"}
    await bench.set_override(SALON, override)
    assert bench.powered() == {SALON: "cool"}
    assert "hvac_mode" not in bench.overrides()[SALON]["target"]


async def test_switching_the_air_conditioner_to_heat_by_hand_in_a_cooling_schedule_is_an_override(bench: Bench):
    await start(bench)
    await schedule_says(bench, "normal", "cool")
    bench.thermostat(SALON, "eco", state="heat", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": "heat"}


async def test_a_copy_of_a_schedule_keeps_its_hvac_mode_and_a_rename_too(bench: Bench):
    await start(bench)
    await schedule_says(bench, "holiday", "cool")
    await bench.set_schedules([{"id": "normal"}, {"id": "away"}, {"id": "holiday", "name": "Summer"},
                               {"name": "August", "copy_of": "holiday"}, {"name": "Winter", "copy_of": "holiday", "hvac_mode": "heat"}])
    assert bench.runtime.data["schedules"][2:] == [
        {"id": "holiday", "name": "Summer", "hvac_mode": "cool"}, {"id": "august", "name": "August", "hvac_mode": "cool"},
        {"id": "winter", "name": "Winter", "hvac_mode": "heat"}]


async def test_a_schedule_s_hvac_mode_is_heat_or_cool(bench: Bench):
    await start(bench)
    for bad in ("off", "auto", "", 3):
        with pytest.raises(model.InvalidData):
            await schedule_says(bench, "normal", bad)


async def test_a_script_reads_the_hvac_mode_of_the_schedules(bench: Bench):
    await start(bench)
    await schedule_says(bench, "holiday", "cool")
    response = await bench.hass.services.async_call("chauffage", "get_schedules", {}, blocking=True, return_response=True)
    assert [(s["id"], s["hvac_mode"]) for s in response["schedules"]] == [("normal", None), ("away", None), ("holiday", "cool")]


async def test_the_planned_preset_sensor_says_the_schedule_s_hvac_mode(bench: Bench):
    """`hvac_mode`: off for an off slot, else the schedule's when the thermostat lists it."""
    await start(bench, "22:00", NIGHT_OFF)
    await schedule_says(bench, "normal", "cool")
    salon, bureau = (bench.hass.states.get(f"sensor.{name}_planned_preset").attributes for name in ("salon", "bureau"))
    assert (salon["hvac_mode"], salon["next_hvac_mode"]) == ("cool", "off")
    assert (bureau["hvac_mode"], bureau["next_hvac_mode"]) == (None, "off")


# ----- a slot is a preset, or off -----

async def test_a_slot_only_sets_the_hvac_mode_off(bench: Bench):
    """Heat or cool is the schedule's: a slot that says cool is refused."""
    await start(bench)
    with pytest.raises(model.InvalidData):
        await bench.save_weeks({SALON: {"normal": every_day(("00:00", "eco", {"hvac_mode": "cool"}))}})
    assert bench.runtime.weeks[SALON]["normal"][0] == WEEKDAY


async def test_an_off_slot_holds_the_coldest_preset(bench: Bench):
    """The user does not choose the preset of an off slot: the coldest one, so two off slots in
    a row are one slot, and an off slot sets neither the fan nor the vanes."""
    await start(bench)
    day = [["00:00", "eco"], ["12:00", "comfort", OFF], ["13:00", "boost", {"hvac_mode": "off", "fan_mode": "3"}], ["14:00", "eco"]]
    await bench.save_weeks({SALON: {"normal": [day] * 7}})
    assert bench.runtime.weeks[SALON]["normal"][0] == [["00:00", "eco"], ["12:00", "frost", OFF], ["14:00", "eco"]]
    clear(bench)
    await bench.go_to("12:00")
    assert bench.powered() == {SALON: "off"}
    assert bench.applied() == {SALON: "frost"}


async def test_a_preset_does_not_set_an_hvac_mode(bench: Bench):
    """A home turned off is a schedule with off slots, not a preset."""
    await start(bench)
    await bench.runtime.set_presets([*bench.runtime.data["presets"], {"name": "Away", "temperature": 7, "hvac_mode": "off"}])
    assert bench.runtime.data["presets"][-1] == {"id": "away", "name": "Away", "color": "#9e9e9e", "temperature": 7.0}


@pytest.mark.parametrize("value", [{"temperature": 20, "hvac_mode": "cool"}, {"hvac_mode": "off"},
                                   {"preset_mode": "eco", "temperature": 20}, {}])
async def test_a_preset_s_value_is_a_climate_preset_or_a_temperature(bench: Bench, value: dict):
    """Not both, and never an HVAC mode. Alone, a cooling setpoint or a fan adds to the default."""
    await start(bench)
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_mapping(SALON, {"comfort": value})


# ----- the night -----

@pytest.mark.parametrize("day", [0, 6])
async def test_an_evening_off_slot_keeps_the_air_conditioner_off_until_the_morning(bench: Bench, day: int):
    """Off from 22:30 and through the next day's first slot: nothing is sent at midnight, also
    from Sunday to Monday, and the first slot of the morning turns the air conditioner on."""
    await start(bench, "22:00", NIGHT_OFF)
    await bench.go_to("22:30", day)
    assert state(bench) == "off"
    clear(bench)
    await bench.go_to("00:00", day + 1)
    await bench.go_to("06:29", day + 1)
    assert bench.powered() == {} and bench.applied() == {}
    assert state(bench) == "off"
    await bench.go_to("06:30", day + 1)
    assert bench.powered() == {SALON: "heat", BUREAU: "heat"}


async def test_until_tomorrow_names_the_morning_s_slot_after_an_off_night(bench: Bench):
    """The end "until tomorrow" of an off override: 06:30, not the 00:00 slot that is off too."""
    await start(bench, "21:00", NIGHT_OFF, preset="comfort")
    assert bench.runtime.planned_info(SALON)["next_day_slot_end"] == "2026-10-13T06:30:00+02:00"
    await bench.go_to("21:00", day=6)
    assert bench.runtime.planned_info(SALON)["next_day_slot_end"] == "2026-10-19T06:30:00+02:00"


# ----- an off override meets an off slot -----

async def test_an_off_override_ends_when_an_off_slot_starts(bench: Bench):
    """Turned off by hand at 22:00 for 2 hours, with an off slot at 22:30: the schedule then says
    off itself, so the override ends there, and the thermostat stays off."""
    ended: list[dict] = []

    @callback
    def listen(event: Event) -> None:
        ended.append(dict(event.data))

    bench.hass.bus.async_listen("chauffage_override_ended", listen)
    await start(bench, "22:00", NIGHT_OFF, preset="comfort")
    bench.thermostat(SALON, "comfort", state="off", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"] == OFF
    await bench.go_to("22:29")
    assert SALON in bench.overrides()
    clear(bench)
    await bench.go_to("22:30")
    assert SALON not in bench.overrides()
    assert [(event["entity_id"], event["reason"]) for event in ended] == [(SALON, "off_slot")]
    assert state(bench) == "off" and SALON not in bench.powered()


async def test_an_on_override_holds_through_an_off_slot(bench: Bench):
    """Only an off override ends at an off slot: a setpoint changed by hand holds to its end."""
    await start(bench, "22:00", NIGHT_OFF, preset="comfort")
    await bench.manual_setpoint(SALON, 22.5)
    await bench.go_to("22:30")
    assert bench.overrides()[SALON]["target"] == {"temperature": 22.5}
    assert state(bench) == "heat"


# ----- the pure logic -----

def ac(state: str = "cool", last: str | None = None) -> engine.Thermostat:
    return engine.Thermostat(state, "comfort", 20.0, ("eco", "comfort"), 16.0, 30.0, 0.5, hvac_modes=tuple(AC_MODES), last_hvac_mode=last)


PRESETS = {p["id"]: p for p in model.default_presets("en")}


def test_the_schedule_s_hvac_mode_is_the_slot_s_unless_the_slot_says_off_or_the_thermostat_lacks_it():
    assert engine.resolve("comfort", PRESETS, {}, ac("heat"), hvac_mode="cool") == {"preset_mode": "comfort", "hvac_mode": "cool"}
    assert engine.resolve("comfort", PRESETS, {}, ac("heat"), settings=OFF, hvac_mode="cool") == {"preset_mode": "comfort", "hvac_mode": "off"}
    heater = engine.Thermostat("heat", "eco", 17.0, ("eco", "comfort"), hvac_modes=("off", "heat"))
    assert engine.resolve("comfort", PRESETS, {}, heater, hvac_mode="cool") == {"preset_mode": "comfort"}
    assert engine.resolve("comfort", PRESETS, {}, None, hvac_mode="cool") == {"temperature": 20.0}  # a thermostat not seen yet


def test_an_off_thermostat_is_turned_on_in_the_schedule_s_hvac_mode():
    assert engine.complete({"preset_mode": "comfort"}, ac("off"), schedule="cool") == {"preset_mode": "comfort", "hvac_mode": "cool"}
    assert engine.complete({"preset_mode": "comfort"}, ac("off")) == {"preset_mode": "comfort", "hvac_mode": "heat"}
    assert engine.complete({"preset_mode": "comfort"}, ac("heat"), schedule="cool") == {"preset_mode": "comfort"}  # on: kept


def test_an_off_target_takes_the_setpoint_of_the_hvac_mode_the_thermostat_restarts_in():
    """Off in a cooling schedule: no heating setpoint is left on the air conditioner."""
    off = {"temperature": 16.0, "hvac_mode": "off"}
    assert engine.complete(off, ac("cool"), engine.BY_NAME, "cool") == {"hvac_mode": "off"}
    assert engine.complete({**off, "cool_temperature": 28.0}, ac("cool"), engine.BY_PRESET, "cool") == {"temperature": 28.0, "hvac_mode": "off"}
    assert engine.complete(off, ac("heat"), engine.BY_NAME, "heat") == off
    assert engine.complete(off, ac("heat"), engine.BY_NAME) == off


def test_the_coldest_preset_is_the_first_of_the_lowest_temperature():
    assert model.coldest_preset(list(PRESETS.values())) == "frost"
    assert model.coldest_preset([{"id": "a", "temperature": 12.0}, {"id": "b", "temperature": 12.0}, {"id": "c", "temperature": 19.0}]) == "a"
