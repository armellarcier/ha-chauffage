"""A slot is a preset, or off (#91). The schedule decides whether a thermostat is off; turning
it off or on by hand is an override; a reversible air conditioner keeps cooling unless the
schedule says heat or cool (test_schedule_hvac_mode.py)."""

import pytest
import voluptuous as vol
from homeassistant.core import Context

from conftest import CTX_AUTOMATION, CTX_USER, KINDS, MANUAL_PRESET, WEEKDAY, Bench, every_day

OFF = {"hvac_mode": "off"}
# Comfort from 06:30, eco from 08:30, comfort from 17:30, off from 22:30 (an off slot holds the
# coldest preset, frost)
NIGHT_OFF = [["00:00", "frost", OFF], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"], ["22:30", "frost", OFF]]
AC_MODES = ["off", "heat", "cool", "fan_only"]


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def start(bench: Bench, hhmm: str = "10:00", day: list | None = None, preset: str = "eco", **attributes) -> None:
    await bench.go_to(hhmm)
    bench.thermostat("climate.salon", preset, **attributes)
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": [day or WEEKDAY] * 7}})
    bench.applied()
    bench.powered()


def salon(bench: Bench) -> str:
    return bench.hass.states.get("climate.salon").state


# ----- off slots -----

async def test_an_off_slot_turns_the_thermostat_off_and_sends_the_coldest_preset(bench: Bench):
    """An off slot sends off, then its preset, as a scene does: the coldest preset, so that a
    thermostat that heats anyway heats as little as possible (docs/decisions.md, "Scheduling")."""
    await start(bench, "22:00", NIGHT_OFF)  # comfort
    await bench.go_to("22:30")
    assert bench.powered() == {"climate.salon": "off"}
    assert bench.applied() == {"climate.salon": "frost"}
    assert salon(bench) == "off"


async def test_an_on_slot_turns_the_thermostat_back_on(bench: Bench):
    """The morning slot turns the thermostat on, in heat, with its preset (#96, #77)."""
    await start(bench, "06:00", NIGHT_OFF, state="off")
    await bench.go_to("06:30")
    assert bench.powered() == {"climate.salon": "heat"}
    assert bench.applied() == {"climate.salon": "comfort"}
    assert salon(bench) == "heat"


async def test_a_thermostat_already_off_on_the_right_preset_gets_nothing(bench: Bench):
    await start(bench, "23:00", NIGHT_OFF, "frost", state="off")
    await bench.save_weeks({"climate.salon": {"normal": [NIGHT_OFF] * 7}})
    assert bench.powered() == {} and bench.applied() == {}


async def test_a_thermostat_turned_off_by_a_script_comes_back_on_at_the_next_slot(bench: Bench):
    """#77: an "all off" script at bedtime is not an override, and the morning slot turns the
    thermostat back on."""
    await start(bench, "23:00")  # eco, on
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    await bench.go_to("06:00", day=1)
    assert bench.powered() == {}  # still off: nothing changed in the schedule
    await bench.go_to("06:30", day=1)
    assert bench.powered() == {"climate.salon": "heat"}
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_a_thermostat_turned_off_by_a_script_stays_off_through_midnight(bench: Bench):
    """The first slot of a day repeats the last one of the day before (eco, eco): it changes
    nothing, so it does not turn the thermostat back on (#77)."""
    await start(bench, "23:00")  # eco until 06:30
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    await bench.advance(60)  # 00:00: the day's first slot starts, eco again
    assert bench.powered() == {}
    await bench.advance(60)
    assert bench.powered() == {}
    await bench.go_to("06:30", day=1)
    assert bench.powered() == {"climate.salon": "heat"}


async def test_a_thermostat_turned_off_is_turned_on_when_the_weeks_are_saved(bench: Bench):
    """Upgrading: a thermostat turned off by hand in the past comes back on (CHANGELOG)."""
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", state="off")
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 7}})
    assert bench.powered() == {"climate.salon": "heat"}
    assert bench.applied() == {}  # already on eco
    assert salon(bench) == "heat"


# ----- off and on by hand: overrides -----

async def test_turning_the_thermostat_off_by_hand_during_an_on_slot_is_an_override(bench: Bench):
    await start(bench)
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    override = bench.overrides()["climate.salon"]
    assert override["target"] == OFF
    assert override["ends_at"] == "duration"
    await bench.go_to("11:59")
    assert bench.powered() == {}
    await bench.go_to("12:00")  # the override expires: back on, on its slot
    assert bench.overrides() == {}
    assert bench.powered() == {"climate.salon": "heat"}


async def test_turning_the_thermostat_off_with_its_button_is_an_override_too(bench: Bench):
    await start(bench)
    bench.thermostat("climate.salon", "eco", state="off", context=Context())  # no user: the device
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == OFF


async def test_turning_the_thermostat_back_on_by_hand_ends_its_off_override(bench: Bench):
    """Back on, the thermostat is set to its slot: what it restarted on is not a change."""
    await start(bench)
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "comfort", context=CTX_USER)  # back on, on comfort
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.applied() == {"climate.salon": "eco"}


async def test_turning_the_thermostat_on_by_hand_during_an_off_slot_is_an_override(bench: Bench):
    await start(bench, "23:00", NIGHT_OFF, "frost", state="off")
    bench.thermostat("climate.salon", "frost", context=CTX_USER)  # turned on
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == {"hvac_mode": "heat"}
    await bench.go_to("01:00", day=1)  # the override expires: off again
    assert bench.overrides() == {}
    assert bench.powered() == {"climate.salon": "off"}


async def test_a_preset_picked_while_the_thermostat_is_off_keeps_it_off(bench: Bench):
    bench.needs("vtherm", "standard")
    await start(bench, "23:00", NIGHT_OFF, state="off")
    bench.thermostat("climate.salon", "boost", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == {"hvac_mode": "off", "preset_mode": "boost"}


async def test_an_off_override_from_the_card_turns_the_thermostat_off_until_its_end(bench: Bench):
    """#77 without a script: "Arrêt" until the next slot, from the card."""
    await start(bench, "21:00")  # comfort
    await bench.set_override("climate.salon", bench.runtime.new_override(OFF, minutes=90))
    assert bench.powered() == {"climate.salon": "off"}
    assert salon(bench) == "off"
    await bench.go_to("22:30")
    assert bench.overrides() == {}
    assert bench.powered() == {"climate.salon": "heat"}
    assert salon(bench) == "heat"


async def test_an_override_from_the_card_turns_an_off_thermostat_on(bench: Bench):
    """Before #91, Chauffage waited for the thermostat to be turned back on."""
    await start(bench, "23:00", NIGHT_OFF, state="off")
    await bench.set_override("climate.salon", bench.runtime.new_override({"preset_mode": "comfort"}, minutes=60))
    assert bench.powered() == {"climate.salon": "heat"}
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_set_override_refuses_an_hvac_mode_home_assistant_does_not_know(bench: Bench):
    """"Off" or "heating": reproduce_state would ignore it silently, and the override would be
    recorded with nothing sent."""
    await start(bench, "23:00")
    for bad in ("Off", "heating"):
        with pytest.raises(vol.Invalid):
            await bench.hass.services.async_call(
                "chauffage", "set_override", {"entity_id": "climate.salon", "hvac_mode": bad}, blocking=True)
    assert bench.overrides() == {} and bench.powered() == {}


async def test_a_setpoint_changed_with_the_hvac_mode_by_hand_is_in_the_override(bench: Bench):
    """climate.set_temperature with hvac_mode cool and 24 °C writes one state: the override
    holds both, not the HVAC mode alone."""
    await start(bench, "10:00", [["00:00", "eco"]], hvac_modes=AC_MODES)
    await bench.schedule_says("normal", "heat")
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 24.0, state="cool", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == {"hvac_mode": "cool", "temperature": 24.0}


async def test_set_override_turns_a_thermostat_off_or_on(bench: Bench):
    """A script turns a thermostat off until the morning with the service (#77)."""
    await start(bench, "23:00")
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "hvac_mode": "off", "duration": 60}, blocking=True)
    assert bench.powered() == {"climate.salon": "off"}
    assert bench.overrides()["climate.salon"]["target"] == OFF
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "hvac_mode": "heat", "preset": "comfort"}, blocking=True)
    assert bench.powered() == {"climate.salon": "heat"}
    o = bench.overrides()["climate.salon"]
    assert o["target"]["hvac_mode"] == "heat" and o["preset"] == "comfort"


# ----- a reversible air conditioner -----

async def test_a_cooling_air_conditioner_keeps_cooling(bench: Bench):
    """Never a cooling AC switched to heat by a schedule that does not say heat or cool."""
    await start(bench, "17:00", state="cool", hvac_modes=AC_MODES)
    await bench.go_to("17:30")
    assert bench.powered() == {}
    assert bench.applied() == {}  # its own setpoint in cool, and not the default device preset (C1, D1)
    assert salon(bench) == "cool"


async def test_an_off_air_conditioner_without_heat_is_turned_on_in_the_mode_it_was_on(bench: Bench):
    await start(bench, "17:00", state="fan_only", hvac_modes=["off", "cool", "fan_only"])
    bench.thermostat("climate.salon", "eco", state="off", hvac_modes=["off", "cool", "fan_only"], context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    await bench.go_to("17:30")
    assert bench.powered() == {"climate.salon": "fan_only"}


async def test_an_off_air_conditioner_never_seen_on_is_turned_on_in_its_first_mode(bench: Bench):
    await bench.go_to("17:00")
    bench.thermostat("climate.salon", "eco", state="off", hvac_modes=["off", "cool", "fan_only"])
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 7}})
    assert bench.powered() == {"climate.salon": "cool"}


# ----- Versatile Thermostat: the intent, not the protection (requested_state) -----

def vtherm(bench: Bench, state: str, requested: str, preset: str = "eco", context: Context | None = None) -> None:
    """climate.salon, a VTherm 10.5: what it does (`state`), what it was asked (`requested`)."""
    bench.thermostat("climate.salon", preset, state=state, context=context or Context(),
                     requested_state={"hvac_mode": requested, "target_temperature": 17.0, "preset": preset})


async def start_vtherm(bench: Bench, hhmm: str, day: list | None = None) -> None:
    bench.needs("vtherm")
    bench.versatile_thermostat("climate.salon")
    await start(bench, hhmm, day)


async def test_a_vtherm_turned_off_by_its_window_is_not_an_override_and_is_not_turned_on(bench: Bench):
    """VTherm refuses heat while the window is open, and turns back on by itself when it closes:
    Chauffage sends the slots without an HVAC mode, and makes no override."""
    await start_vtherm(bench, "17:00")
    vtherm(bench, "off", "heat")  # window open
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    await bench.go_to("17:30")
    assert bench.powered() == {}
    assert bench.applied() == {"climate.salon": "comfort"}
    vtherm(bench, "heat", "heat", "comfort")  # window closed
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {} and bench.powered() == {}


async def test_a_vtherm_stopped_by_its_auto_start_stop_is_read_the_same_way(bench: Bench):
    await start_vtherm(bench, "10:00")
    vtherm(bench, "off", "heat")
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.runtime.snapshot()["thermostats"]["climate.salon"]["cause"] is None
    bench.thermostat("climate.salon", "eco", state="off", context=Context(),
                     requested_state={"hvac_mode": "heat", "target_temperature": 17.0, "preset": "eco"},
                     specific_states={"hvac_off_reason": "hvac_off_auto_start_stop"})
    await bench.hass.async_block_till_done()
    assert bench.runtime.snapshot()["thermostats"]["climate.salon"]["cause"] == "auto_start_stop"


async def test_a_vtherm_turned_off_by_hand_is_an_off_override(bench: Bench):
    """VTherm asked to be off: as any thermostat, an override, and on again at its end."""
    await start_vtherm(bench, "10:00")
    vtherm(bench, "off", "off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == OFF
    await bench.go_to("12:00")
    assert bench.powered() == {"climate.salon": "heat"}


async def test_a_vtherm_without_requested_state_is_read_as_before(bench: Bench):
    """Before VTherm 10.5: a VTherm turned off, by hand or by itself, keeps the preset asked and
    starts again on it (#74). Chauffage neither turns it on nor makes an off override."""
    await start_vtherm(bench, "17:00")
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    await bench.go_to("17:30")
    assert bench.powered() == {}
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_an_off_slot_is_satisfied_by_a_vtherm_without_requested_state_that_shows_off(bench: Bench):
    """Such a VTherm is read as on (#74), but it is off: the off slot is done, the command is not
    waited for, and a realignment does not send off again."""
    await start_vtherm(bench, "22:00", NIGHT_OFF)
    await bench.go_to("22:30")
    assert bench.powered() == {"climate.salon": "off"}
    assert bench.applied() == {"climate.salon": "frost"}
    bench.thermostat("climate.salon", "frost", state="off", context=Context())  # the VTherm takes frost, off
    await bench.hass.async_block_till_done()
    assert bench.runtime.pending("climate.salon") == []
    await bench.save_weeks({"climate.salon": {"normal": [NIGHT_OFF] * 7}})
    assert bench.powered() == {} and bench.applied() == {}
    # #74 kept: not turned on, no override
    assert bench.overrides() == {}
    await bench.go_to("23:00")
    assert bench.powered() == {}


# ----- what the card and the entities see -----

async def test_the_card_sees_the_hvac_mode_of_the_current_and_next_slot(bench: Bench):
    await start(bench, "23:00", NIGHT_OFF, state="off")
    planned = bench.runtime.snapshot()["planned"]["climate.salon"]
    assert (planned["preset"], planned["hvac_mode"]) == ("frost", "off")
    assert (planned["next_preset"], planned["next_hvac_mode"], planned["next_start"]) == (
        "comfort", None, "2026-10-13T06:30:00+02:00")
    sensor = bench.hass.states.get("sensor.salon_planned_preset")
    assert sensor.state == "frost"
    assert (sensor.attributes["hvac_mode"], sensor.attributes["next_hvac_mode"]) == ("off", None)
    assert sensor.attributes["target"] == bench.runtime.targets_of("climate.salon")["frost"] | OFF


async def test_a_script_reads_the_hvac_mode_of_the_slots(bench: Bench):
    await start(bench, "10:00", NIGHT_OFF)
    week = await bench.hass.services.async_call(
        "chauffage", "get_week", {"entity_id": "climate.salon"}, blocking=True, return_response=True)
    monday = week["climate.salon"]["monday"]
    assert monday[0] == {"start": "00:00", "end": "06:30", "preset": "frost", "hvac_mode": "off"}
    assert monday[1] == {"start": "06:30", "end": "08:30", "preset": "comfort"}


async def test_the_last_hvac_mode_a_thermostat_was_on_in_survives_a_restart(bench: Bench):
    await start(bench, "17:00", state="cool", hvac_modes=AC_MODES)
    assert bench.runtime.thermostats["climate.salon"]["hvac_mode"] == "cool"
    await bench.advance(1)  # the delayed save
    assert bench.storage["chauffage"]["data"]["thermostats"]["climate.salon"]["hvac_mode"] == "cool"


# ----- fan and vanes (lot 3 of #91) -----

AC_ATTRS = {"hvac_modes": AC_MODES, "fan_modes": ["auto", "1", "2", "3"], "swing_modes": ["auto", "swing"],
            "swing_horizontal_modes": ["auto", "split"], "fan_mode": "auto", "swing_mode": "auto", "swing_horizontal_mode": "auto"}


async def test_a_slot_can_set_the_fan_and_the_vanes(bench: Bench):
    day = [["00:00", "eco"], ["14:00", "comfort", {"fan_mode": "3", "swing_mode": "swing", "swing_horizontal_mode": "split"}]]
    await start(bench, "13:00", day, **AC_ATTRS)
    await bench.go_to("14:00")
    assert bench.applied() == {"climate.salon": "comfort"}
    assert bench.settings() == {("climate.salon", "fan_mode"): "3", ("climate.salon", "swing_mode"): "swing",
                                ("climate.salon", "swing_horizontal_mode"): "split"}
    assert bench.powered() == {}


async def test_a_preset_s_value_on_a_thermostat_can_set_the_fan(bench: Bench):
    await start(bench, "17:00", **AC_ATTRS)
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"preset_mode": "comfort", "fan_mode": "2"}})
    await bench.hass.async_block_till_done()
    assert bench.runtime.targets_of("climate.salon")["comfort"] == {"preset_mode": "comfort", "fan_mode": "2"}
    bench.settings()
    await bench.go_to("17:30")
    assert bench.settings() == {("climate.salon", "fan_mode"): "2"}


async def test_a_fan_already_set_is_not_sent_again(bench: Bench):
    day = [["00:00", "eco"], ["14:00", "comfort", {"fan_mode": "auto"}]]
    await start(bench, "13:00", day, **AC_ATTRS)
    await bench.go_to("14:00")
    assert bench.settings() == {}
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_an_override_that_only_sets_the_fan_or_the_cooling_setpoint_is_recorded(bench: Bench):
    """A target without preset, temperature or HVAC mode (the websocket API accepts it): no
    crash, and no kind or value for the automations of before #91."""
    await start(bench, "10:00", **AC_ATTRS)
    await bench.set_override("climate.salon", bench.runtime.new_override({"fan_mode": "3"}))
    assert bench.settings() == {("climate.salon", "fan_mode"): "3"}
    info = bench.runtime.override_info("climate.salon")
    assert (info["target"], info["kind"], info["value"]) == ({"fan_mode": "3"}, None, None)
    await bench.set_override("climate.salon", bench.runtime.new_override({"cool_temperature": 24}))
    assert bench.runtime.override_info("climate.salon")["kind"] is None


async def test_a_script_reads_the_fan_of_the_slots(bench: Bench):
    await start(bench, "10:00", [["00:00", "eco", {"fan_mode": "1"}]], **AC_ATTRS)
    week = await bench.hass.services.async_call(
        "chauffage", "get_week", {"entity_id": "climate.salon"}, blocking=True, return_response=True)
    assert week["climate.salon"]["monday"][0] == {"start": "00:00", "end": "24:00", "preset": "eco", "fan_mode": "1"}


# ----- a cooling setpoint in a preset's value (corrections C1), and the end "until tomorrow" (C4) -----

COOL_ATTRS = {"hvac_modes": AC_MODES}


async def test_a_cooling_only_ac_gets_the_base_setpoint(bench: Bench):
    bench.needs("plain")
    await start(bench, "13:00", [["00:00", "eco"], ["14:00", "comfort"]], state="cool", hvac_modes=["off", "cool", "fan_only"])
    bench.temperature_calls.clear()
    await bench.go_to("14:00")
    assert bench.temperature_calls == [("climate.salon", 20.0)]


async def test_a_heating_slot_ignores_the_cooling_setpoint(bench: Bench):
    bench.needs("plain")
    await start(bench, "17:00", **COOL_ATTRS)
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"temperature": 20, "cool_temperature": 25}})
    await bench.hass.async_block_till_done()
    bench.temperature_calls.clear()
    await bench.go_to("17:30")
    assert bench.temperature_calls == [("climate.salon", 20.0)]
    assert bench.runtime.targets_of("climate.salon")["comfort"] == {"temperature": 20.0, "cool_temperature": 25.0}


async def test_an_override_to_a_preset_in_cool_uses_the_cooling_setpoint(bench: Bench):
    await start(bench, "10:00", state="cool", **COOL_ATTRS)
    await bench.runtime.set_mapping("climate.salon", {"boost": {"temperature": 21, "cool_temperature": 23}})
    await bench.hass.async_block_till_done()
    bench.temperature_calls.clear()
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True)
    assert bench.temperature_calls == [("climate.salon", 23.0)]
    assert bench.overrides()["climate.salon"]["target"] == {"temperature": 21.0, "cool_temperature": 23.0}


async def test_an_override_temperature_typed_by_the_user_is_sent_in_cool(bench: Bench):
    """A temperature the user typed (no Chauffage preset) is their cooling target: sent in cool,
    unlike a preset's heating temperature (docs/decisions.md, "Presets")."""
    await start(bench, "10:00", state="cool", **COOL_ATTRS)
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 24}, blocking=True)
    assert bench.temperature_calls == [("climate.salon", 24.0)]
    assert bench.overrides()["climate.salon"]["target"] == {"temperature": 24.0}


async def test_an_override_that_switches_to_cool_with_a_temperature_sends_it(bench: Bench):
    await start(bench, "10:00", **COOL_ATTRS)
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 24, "hvac_mode": "cool"}, blocking=True)
    assert bench.powered() == {"climate.salon": "cool"}
    assert bench.temperature_calls == [("climate.salon", 24.0)]


async def test_a_preset_s_heating_temperature_is_still_not_sent_in_cool(bench: Bench):
    """The preset's value set by hand without a cooling setpoint: a heating value (D1)."""
    await start(bench, "10:00", state="cool", **COOL_ATTRS)
    await bench.runtime.set_mapping("climate.salon", {"boost": {"temperature": 21}})
    await bench.hass.async_block_till_done()
    bench.temperature_calls.clear()
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True)
    assert bench.temperature_calls == []
    assert bench.overrides()["climate.salon"]["preset"] == "boost"


async def test_the_card_sees_tomorrow_s_first_slot_that_changes_the_state(bench: Bench):
    """The end "until tomorrow" of an off override (C4): the 00:00 slot that repeats the evening
    does not count, across midnight and from Sunday to Monday."""
    await start(bench, "23:00", NIGHT_OFF)
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] == "2026-10-13T06:30:00+02:00"
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 5 + [[["00:00", "eco"], ["08:00", "comfort"], ["23:00", "eco"]]] * 2}})
    await bench.go_to("23:30", day=6)  # Sunday: tomorrow is a weekday
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] == "2026-10-19T06:30:00+02:00"
    await bench.save_weeks({"climate.salon": {"normal": [[["00:00", "eco"]]] * 7}})
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] is None


async def test_a_vtherm_heating_at_the_frost_setpoint_for_its_window_says_so(bench: Bench):
    """The window action "frost" keeps the VTherm on: the card is told the window anyway (C8)."""
    await start_vtherm(bench, "10:00")
    bench.thermostat("climate.salon", "eco", 7.0, context=Context(),
                     requested_state={"hvac_mode": "heat", "target_temperature": 17.0, "preset": "eco"},
                     specific_states={"window_manager": {"window_state": "on"}, "hvac_mode_reason": "hvac_off_window_detection"})
    await bench.hass.async_block_till_done()
    assert bench.runtime.snapshot()["thermostats"]["climate.salon"]["cause"] == "window"
    assert bench.overrides() == {}
