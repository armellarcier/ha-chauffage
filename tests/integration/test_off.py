"""Off (#91): an off slot turns the thermostat off and sends nothing else. Turning a thermostat
off or on by hand is an override, which lasts as the setting *Turned off* says. A VTherm turned
off by its window or by its auto start/stop is not."""

import pytest
from homeassistant.core import Context, Event, callback

from conftest import CTX_AUTOMATION, CTX_USER, KINDS, MANUAL_PRESET, WEEKDAY, Bench
from hvac_helpers import (
    AC_MODES, BUREAU, HEAT, NIGHT_OFF, OFF, PRESETS, SALON, ac, clear, salon, start_ac, start_salon, state,
)

from custom_components.chauffage import engine


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


def vtherm(bench: Bench, state: str, requested: str, preset: str = "eco", context: Context | None = None) -> None:
    """climate.salon, a VTherm 10.5: what it does (`state`), what it was asked (`requested`)."""
    bench.thermostat("climate.salon", preset, state=state, context=context or Context(),
                     requested_state={"hvac_mode": requested, "target_temperature": 17.0, "preset": preset})


async def start_vtherm(bench: Bench, hhmm: str, day: list | None = None) -> None:
    bench.needs("vtherm")
    bench.versatile_thermostat("climate.salon")
    await start_salon(bench, hhmm, day)


async def turn_off(bench: Bench) -> dict:
    bench.thermostat(SALON, "eco", state="off", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    return bench.overrides()[SALON]


# ----- an off slot -----

async def test_an_off_slot_turns_the_thermostat_off_and_sends_no_setpoint(bench: Bench):
    """An off slot sends off, and nothing else: a thermostat turned on by hand later keeps its
    own last setpoint (docs/decisions.md, "Scheduling")."""
    await start_salon(bench, "22:00", NIGHT_OFF)  # comfort
    await bench.go_to("22:30")
    assert bench.powered() == {"climate.salon": "off"}
    assert bench.applied() == {}
    assert salon(bench) == "off"


async def test_an_on_slot_turns_the_thermostat_back_on(bench: Bench):
    """The morning slot turns the thermostat on, in heat, with its preset (#96, #77)."""
    await start_salon(bench, "06:00", NIGHT_OFF, state="off")
    await bench.go_to("06:30")
    assert bench.powered() == {"climate.salon": "heat"}
    assert bench.applied() == {"climate.salon": "comfort"}
    assert salon(bench) == "heat"


async def test_a_thermostat_already_off_on_the_right_preset_gets_nothing(bench: Bench):
    await start_salon(bench, "23:00", NIGHT_OFF, "frost", state="off")
    await bench.save_weeks({"climate.salon": {"normal": [NIGHT_OFF] * 7}})
    assert bench.powered() == {} and bench.applied() == {}


async def test_an_off_slot_only_turns_the_thermostat_off(bench: Bench):
    """Off, and nothing else: no preset, no setpoint. The next slot turns the thermostat on."""
    await start_ac(bench, "22:00", NIGHT_OFF, preset="comfort")
    await bench.go_to("22:30")
    assert bench.powered() == {SALON: "off", BUREAU: "off"}
    assert bench.applied() == {} and bench.temperature_calls == []
    await bench.go_to("06:30", day=1)
    assert bench.powered() == {SALON: "heat", BUREAU: "heat"}


async def test_an_off_slot_holds_no_preset_and_nothing_else(bench: Bench):
    await start_ac(bench)
    day = [["00:00", "eco"], ["12:00", "comfort", OFF], ["13:00", None, {"hvac_mode": "off", "fan_mode": "3"}], ["14:00", "eco"]]
    await bench.save_weeks({SALON: {"normal": [day] * 7}})
    assert bench.runtime.weeks[SALON]["normal"][0] == [["00:00", "eco"], ["12:00", None, OFF], ["13:00", None, OFF], ["14:00", "eco"]]


async def test_an_off_night_needs_no_rule(bench: Bench):
    """Off in the evening and off in the first slot of the next day: nothing is sent at midnight."""
    await start_ac(bench, "22:00", NIGHT_OFF)
    await bench.go_to("22:30")
    clear(bench)
    await bench.go_to("00:00", day=1)
    await bench.go_to("06:29", day=1)
    assert bench.powered() == {} and bench.applied() == {}


async def test_a_preset_removed_leaves_the_off_slots_alone(bench: Bench):
    await start_ac(bench, "10:00", [["00:00", "boost"], ["22:00", None, OFF]])
    presets = [p for p in bench.runtime.data["presets"] if p["id"] != "boost"]
    await bench.runtime.set_presets(presets, {"boost": "comfort"})
    assert bench.runtime.weeks[SALON]["normal"][0] == [["00:00", "comfort"], ["22:00", None, OFF]]


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


async def test_the_card_sees_tomorrow_s_first_slot_that_changes_the_state(bench: Bench):
    """The end "until tomorrow" of an off override (C4): the 00:00 slot that repeats the evening
    does not count, across midnight and from Sunday to Monday."""
    await start_salon(bench, "23:00", NIGHT_OFF)
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] == "2026-10-13T06:30:00+02:00"
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 5 + [[["00:00", "eco"], ["08:00", "comfort"], ["23:00", "eco"]]] * 2}})
    await bench.go_to("23:30", day=6)  # Sunday: tomorrow is a weekday
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] == "2026-10-19T06:30:00+02:00"
    await bench.save_weeks({"climate.salon": {"normal": [[["00:00", "eco"]]] * 7}})
    assert bench.runtime.planned_info("climate.salon")["next_day_slot_end"] is None


async def test_a_script_reads_the_hvac_mode_of_the_slots(bench: Bench):
    await start_salon(bench, "10:00", NIGHT_OFF)
    week = await bench.hass.services.async_call(
        "chauffage", "get_week", {"entity_id": "climate.salon"}, blocking=True, return_response=True)
    monday = week["climate.salon"]["monday"]
    assert monday[0] == {"start": "00:00", "end": "06:30", "preset": None, "hvac_mode": "off"}
    assert monday[1] == {"start": "06:30", "end": "08:30", "preset": "comfort"}


# ----- a thermostat turned off or on by a script -----

async def test_a_thermostat_turned_off_by_a_script_comes_back_on_at_the_next_slot(bench: Bench):
    """#77: an "all off" script at bedtime is not an override, and the morning slot turns the
    thermostat back on."""
    await start_salon(bench, "23:00")  # eco, on
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
    await start_salon(bench, "23:00")  # eco until 06:30
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_AUTOMATION)
    await bench.hass.async_block_till_done()
    await bench.advance(60)  # 00:00: the day's first slot starts, eco again
    assert bench.powered() == {}
    await bench.advance(60)
    assert bench.powered() == {}
    await bench.go_to("06:30", day=1)
    assert bench.powered() == {"climate.salon": "heat"}


async def test_an_air_conditioner_turned_off_by_a_script_stays_off_when_a_slot_only_adds_heat(bench: Bench):
    """A week stored before #91 says no HVAC mode, and a slot edited since says heat. On an air
    conditioner, both heat: eco that says heat after eco that says nothing changes nothing, and
    does not turn the air conditioner back on (#77)."""
    await start_ac(bench, "23:00", [["00:00", "eco", HEAT], ["06:30", "comfort"], ["22:30", "eco"]])
    bench.thermostat(SALON, "eco", state="off", context=CTX_AUTOMATION, hvac_modes=AC_MODES)
    await bench.hass.async_block_till_done()
    await bench.advance(60)  # 00:00: eco that says heat
    assert bench.powered() == {}


async def test_a_thermostat_turned_off_is_turned_on_when_the_weeks_are_saved(bench: Bench):
    """Upgrading: a thermostat turned off by hand in the past comes back on (CHANGELOG)."""
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", state="off")
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 7}})
    assert bench.powered() == {"climate.salon": "heat"}
    # Eco goes with the HVAC mode, as a scene does: what an off thermostat shows proves nothing (#112)
    assert bench.applied() == {"climate.salon": "eco"}
    assert salon(bench) == "heat"


# ----- off and on by hand: overrides -----

async def test_turning_the_thermostat_off_by_hand_during_an_on_slot_is_an_override(bench: Bench):
    await start_salon(bench)
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    override = bench.overrides()["climate.salon"]
    assert override["target"] == OFF
    assert override["ends_at"] == "next_slot"  # by default, off until the next slot (see below)
    await bench.go_to("17:29")
    assert bench.powered() == {}
    await bench.go_to("17:30")  # the override expires: back on, on its slot
    assert bench.overrides() == {}
    assert bench.powered() == {"climate.salon": "heat"}


async def test_turning_the_thermostat_off_with_its_button_is_an_override_too(bench: Bench):
    await start_salon(bench)
    bench.thermostat("climate.salon", "eco", state="off", context=Context())  # no user: the device
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == OFF


async def test_turning_the_thermostat_back_on_by_hand_ends_its_off_override(bench: Bench):
    """Back on, on the setpoint it showed while off: the thermostat does what its slot asks."""
    await start_salon(bench)
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "eco", context=CTX_USER)  # back on
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}


async def test_a_thermostat_back_on_on_another_setpoint_keeps_an_override(bench: Bench):
    """Back on, on comfort while its slot asks eco: the thermostat does not do what its slot
    asks, so the override goes on, on comfort. Chauffage sends nothing."""
    await start_salon(bench)
    bench.thermostat("climate.salon", "eco", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "comfort", context=CTX_USER)  # back on, on comfort
    await bench.hass.async_block_till_done()
    assert "hvac_mode" not in bench.overrides()["climate.salon"]["target"]
    assert bench.applied() == {}


async def test_a_thermostat_back_on_on_the_setpoint_it_had_before_off_keeps_that_override(bench: Bench):
    """19.5 °C by hand, off by hand, back on at 19.5 °C while its slot asks eco: the thermostat
    does not do what its slot asks, so the override takes the 19.5 °C it shows. Chauffage sends
    nothing (docs/decisions.md, "A change by hand")."""
    await start_salon(bench)
    await bench.manual_setpoint("climate.salon", 19.5)
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 19.5, state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    bench.applied(), bench.powered(), bench.temperature_calls.clear()
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 19.5, context=CTX_USER)  # back on
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == {"temperature": 19.5}
    assert bench.applied() == {} and bench.powered() == {} and bench.temperature_calls == []


async def test_turning_the_thermostat_on_by_hand_during_an_off_slot_is_an_override(bench: Bench):
    await start_salon(bench, "23:00", NIGHT_OFF, "frost", state="off")
    bench.thermostat("climate.salon", "frost", context=CTX_USER)  # turned on
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["target"] == {"hvac_mode": "heat"}
    await bench.go_to("01:00", day=1)  # the override expires: off again
    assert bench.overrides() == {}
    assert bench.powered() == {"climate.salon": "off"}


async def test_a_thermostat_turned_on_by_hand_during_an_off_slot_keeps_its_own_setpoint(bench: Bench):
    await start_ac(bench, "23:00", NIGHT_OFF, state="off")
    bench.thermostat(SALON, "eco", state="heat", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"] == HEAT
    assert bench.applied() == {} and bench.temperature_calls == []


async def test_a_preset_picked_while_the_thermostat_is_off_keeps_it_off(bench: Bench):
    """No override: the thermostat stays off, and keeps the preset for when it is turned on."""
    bench.needs("vtherm", "standard")
    await start_salon(bench, "23:00", NIGHT_OFF, state="off")
    bench.thermostat("climate.salon", "boost", state="off", context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {} and bench.powered() == {}


async def test_a_preset_or_a_setpoint_changed_while_the_thermostat_is_off_is_not_an_override(bench: Bench):
    """The thermostat stays off, and keeps what the user set for when it is turned on."""
    await start_ac(bench, "23:00", NIGHT_OFF, state="off")
    bench.thermostat(SALON, "boost", 23.0, state="off", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.powered() == {} and bench.applied() == {}


def test_a_change_made_while_off_is_not_an_override():
    expected = {"preset_mode": "comfort"}
    assert engine.manual_change(ac("off"), ac("off"), by_user=True, expected=OFF) is None
    off, boosted = ac("off"), engine.Thermostat("off", "boost", 23.0, ("eco", "comfort", "boost"), hvac_modes=tuple(AC_MODES))
    assert engine.manual_change(off, boosted, by_user=True, expected=OFF) is None
    assert engine.manual_change(off, boosted, by_user=True, expected=expected, override=OFF) is None
    # Turned off with a preset picked in the same state: off, alone
    assert engine.manual_change(ac("heat"), boosted, by_user=True, expected=expected) == OFF


async def test_a_preset_picked_on_an_off_air_conditioner_turns_it_on(bench: Bench):
    await start_ac(bench, "10:00", [["00:00", None, OFF]], state="off")
    override = bench.runtime.new_override(bench.runtime.targets_of(SALON)["comfort"]) | {"preset": "comfort"}
    await bench.set_override(SALON, override)
    assert bench.powered() == {SALON: "heat"}
    assert "hvac_mode" not in bench.overrides()[SALON]["target"]


# ----- an off override from the card or a script -----

async def test_an_off_override_from_the_card_turns_the_thermostat_off_until_its_end(bench: Bench):
    """#77 without a script: "Éteint" until the next slot, from the card."""
    await start_salon(bench, "21:00")  # comfort
    await bench.set_override("climate.salon", bench.runtime.new_override(OFF, minutes=90))
    assert bench.powered() == {"climate.salon": "off"}
    assert salon(bench) == "off"
    await bench.go_to("22:30")
    assert bench.overrides() == {}
    assert bench.powered() == {"climate.salon": "heat"}
    assert salon(bench) == "heat"


async def test_an_override_from_the_card_turns_an_off_thermostat_on(bench: Bench):
    """Before #91, Chauffage waited for the thermostat to be turned back on."""
    await start_salon(bench, "23:00", NIGHT_OFF, state="off")
    await bench.set_override("climate.salon", bench.runtime.new_override({"preset_mode": "comfort"}, minutes=60))
    assert bench.powered() == {"climate.salon": "heat"}
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_set_override_turns_a_thermostat_off_or_on(bench: Bench):
    """A script turns a thermostat off until the morning with the service (#77)."""
    await start_salon(bench, "23:00")
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "hvac_mode": "off", "duration": 60}, blocking=True)
    assert bench.powered() == {"climate.salon": "off"}
    assert bench.overrides()["climate.salon"]["target"] == OFF
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "hvac_mode": "heat", "preset": "comfort"}, blocking=True)
    assert bench.powered() == {"climate.salon": "heat"}
    o = bench.overrides()["climate.salon"]
    assert o["target"]["hvac_mode"] == "heat" and o["preset"] == "comfort"


async def test_an_off_override_only_turns_the_thermostat_off(bench: Bench):
    await start_ac(bench, "21:00", preset="comfort")
    await bench.set_override(SALON, bench.runtime.new_override({"hvac_mode": "off", "preset_mode": "frost"}, minutes=90))
    assert bench.overrides()[SALON]["target"] == OFF
    assert bench.powered() == {SALON: "off"}
    assert bench.applied() == {} and bench.temperature_calls == []


async def test_an_override_never_ends_because_a_slot_meets_it(bench: Bench):
    """Turned off from the card at 22:00 until 23:30, with an off slot at 22:30: the override
    holds to its end, and ends as expired."""
    ended: list[dict] = []

    @callback
    def listen(event: Event) -> None:
        ended.append(dict(event.data))

    bench.hass.bus.async_listen("chauffage_override_ended", listen)
    await start_ac(bench, "22:00", NIGHT_OFF, preset="comfort")
    await bench.set_override(SALON, bench.runtime.new_override(OFF, minutes=90))
    await bench.go_to("22:30")
    assert SALON in bench.overrides() and ended == []
    await bench.go_to("23:30")
    assert [(event["entity_id"], event["reason"]) for event in ended] == [(SALON, "expired")]
    assert state(bench) == "off"


# ----- how long an off override lasts -----

async def test_a_thermostat_turned_off_by_hand_stays_off_until_the_next_slot_by_default(bench: Bench):
    """Off at 10:00, the next slot that changes the thermostat is at 17:30: far beyond the 2 hours
    of the override duration, which is for setpoints."""
    await start_ac(bench)
    override = await turn_off(bench)
    assert (override["target"], override["end"], override["ends_at"]) == (OFF, "2026-10-12T17:30:00+02:00", "next_slot")
    await bench.go_to("17:29")
    assert bench.powered() == {}
    await bench.go_to("17:30")
    assert bench.overrides() == {} and bench.powered() == {SALON: "heat"}


async def test_an_off_override_can_last_the_override_duration(bench: Bench):
    await start_ac(bench, options={"off_override_end": "duration"})
    override = await turn_off(bench)
    assert (override["end"], override["ends_at"]) == ("2026-10-12T12:00:00+02:00", "duration")


async def test_an_off_override_can_last_the_override_duration_or_less(bench: Bench):
    await start_ac(bench, "16:00", options={"off_override_end": "next_slot_within_duration"})
    override = await turn_off(bench)
    assert (override["end"], override["ends_at"]) == ("2026-10-12T17:30:00+02:00", "next_slot")


async def test_an_off_override_without_a_next_slot_lasts_a_week(bench: Bench):
    await start_ac(bench, "10:00", [["00:00", "eco"]])
    override = await turn_off(bench)
    assert (override["end"], override["ends_at"]) == ("2026-10-19T10:00:00+02:00", "no_next_slot")


async def test_a_script_that_turns_a_thermostat_off_without_an_end_follows_the_setting(bench: Bench):
    """The end follows the setting *Turned off*. Only a change by hand says why it ends then."""
    await start_ac(bench)
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": SALON, "hvac_mode": "off"}, blocking=True)
    override = bench.overrides()[SALON]
    assert override["end"] == "2026-10-12T17:30:00+02:00" and "ends_at" not in override
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": SALON, "hvac_mode": "off", "duration": 60}, blocking=True)
    assert bench.overrides()[SALON]["end"] == "2026-10-12T11:00:00+02:00"


async def test_the_end_of_off_overrides_does_not_change_the_end_of_the_others(bench: Bench):
    await start_ac(bench)
    await bench.manual_setpoint(SALON, 22.5)
    override = bench.overrides()[SALON]
    assert (override["end"], override["ends_at"]) == ("2026-10-12T12:00:00+02:00", "duration")


async def test_the_end_of_off_overrides_is_a_setting(bench: Bench, ws_client):
    """In the options, on a select entity and from the panel, next to *End of overrides*."""
    await start_ac(bench)
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
    await start_ac(bench, options={"off_override_end": "whenever"})
    assert bench.runtime.off_override_end == "next_slot"


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


# ----- Versatile Thermostat: the intent, not the protection (requested_state) -----

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
    await bench.go_to("17:30")
    assert bench.powered() == {"climate.salon": "heat"}


async def test_a_vtherm_heating_at_the_frost_setpoint_for_its_window_says_so(bench: Bench):
    """The window action "frost" keeps the VTherm on: the card is told the window anyway (C8)."""
    await start_vtherm(bench, "10:00")
    bench.thermostat("climate.salon", "eco", 7.0, context=Context(),
                     requested_state={"hvac_mode": "heat", "target_temperature": 17.0, "preset": "eco"},
                     specific_states={"window_manager": {"window_state": "on"}, "hvac_mode_reason": "hvac_off_window_detection"})
    await bench.hass.async_block_till_done()
    assert bench.runtime.snapshot()["thermostats"]["climate.salon"]["cause"] == "window"
    assert bench.overrides() == {}
