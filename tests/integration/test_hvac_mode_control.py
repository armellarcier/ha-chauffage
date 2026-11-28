"""The setting *Control the HVAC mode* (#159): on by default. Off, a thermostat is scheduled as a
thermostat with a single HVAC mode, as in 0.9. Chauffage never sends it an HVAC mode, a change of
HVAC mode by hand is never an override, and a thermostat turned off is left alone, except a
VTherm, which gets its slots while off. Turning the setting off converts the weeks, after the
panel has shown what changes."""

import dataclasses

import pytest
from homeassistant.exceptions import ServiceValidationError

from conftest import CTX_USER, KINDS, WEEKDAY, Bench
from hvac_helpers import (
    AC_MODES, BUREAU, COOL, HEAT, NIGHT_OFF, OFF, SALON, ac, clear, override, salon, sent_to, start_ac,
)

from custom_components.chauffage import config_flow, engine, model


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


NO_CONTROL = {"hvac_mode_control": False}


async def start(bench: Bench, hhmm: str = "10:00", day: list | None = None, state: str = "heat",
                options: dict | None = NO_CONTROL, preset: str = "eco", **attributes) -> None:
    """The salon alone, a thermostat of the kind under test, with the HVAC mode not controlled
    for the house by default."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, preset, state=state, **attributes)
    await bench.setup(options)
    await bench.save_weeks({SALON: {"normal": [day or WEEKDAY] * 7}})
    clear(bench)


async def turn_off_by_hand(bench: Bench, entity_id: str = SALON, **attributes) -> None:
    bench.thermostat(entity_id, "eco", state="off", context=CTX_USER, **attributes)
    await bench.hass.async_block_till_done()


async def set_control(bench: Bench, value: bool | None, entity_id: str | None = None, preview: bool = False) -> list:
    changes = await bench.runtime.set_hvac_mode_control(value, entity_id, preview=preview)
    await bench.hass.async_block_till_done()
    return changes


# ----- the setting -----

async def test_chauffage_controls_the_hvac_mode_by_default(bench: Bench):
    """Nothing changes on upgrade: a thermostat turned off by hand is an off override."""
    await start(bench, options=None)
    assert bench.runtime.hvac_mode_control is True
    assert bench.runtime.controls_hvac_mode(SALON) is True
    await turn_off_by_hand(bench)
    assert bench.overrides()[SALON]["target"] == OFF


async def test_a_thermostat_follows_the_house_or_says_on_or_off(bench: Bench):
    await bench.go_to("10:00")
    for entity_id in (SALON, BUREAU):
        bench.thermostat(entity_id, "eco")
    await bench.setup(NO_CONTROL)
    await bench.save_weeks({e: {"normal": [WEEKDAY] * 7} for e in (SALON, BUREAU)})
    await set_control(bench, True, SALON)
    assert (bench.runtime.controls_hvac_mode(SALON), bench.runtime.controls_hvac_mode(BUREAU)) == (True, False)
    snapshot = bench.runtime.snapshot()
    assert snapshot["hvac_mode_control"] is False
    assert snapshot["thermostats"][SALON]["hvac_mode_control"] is True
    assert snapshot["thermostats"][BUREAU]["hvac_mode_control"] is None
    await turn_off_by_hand(bench, SALON)
    await turn_off_by_hand(bench, BUREAU)
    assert list(bench.overrides()) == [SALON]
    await set_control(bench, None, SALON)  # follows the house again
    assert bench.runtime.controls_hvac_mode(SALON) is False
    assert "hvac_mode_control" not in bench.runtime.thermostats[SALON]


async def test_the_setting_is_kept_through_a_restart(bench: Bench):
    await start(bench, options=None)
    await set_control(bench, False, SALON)
    await set_control(bench, False)
    await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert bench.entry.options["hvac_mode_control"] is False
    assert bench.runtime.thermostats[SALON]["hvac_mode_control"] is False


async def test_the_setting_is_changed_from_the_panel(bench: Bench, ws_client):
    await start(bench, options=None)
    client = await ws_client(bench.hass)
    await client.send_json({"id": 1, "type": "chauffage/hvac_mode_control/set", "value": False, "preview": True})
    response = await client.receive_json()
    assert response["success"] and response["result"] == {"changes": []}
    assert bench.runtime.hvac_mode_control is True  # a preview changes nothing
    await client.send_json({"id": 2, "type": "chauffage/hvac_mode_control/set", "value": False})
    assert (await client.receive_json())["success"]
    await client.send_json({"id": 3, "type": "chauffage/hvac_mode_control/set", "entity_id": SALON, "value": True})
    assert (await client.receive_json())["success"]
    await bench.hass.async_block_till_done()
    assert bench.runtime.hvac_mode_control is False and bench.runtime.controls_hvac_mode(SALON) is True
    # Only a thermostat says "follow the house"
    await client.send_json({"id": 4, "type": "chauffage/hvac_mode_control/set", "value": None})
    assert not (await client.receive_json())["success"]
    await client.send_json({"id": 5, "type": "chauffage/hvac_mode_control/set", "entity_id": "climate.nowhere",
                            "value": False})
    assert not (await client.receive_json())["success"]


async def test_users_who_may_not_set_up_cannot_change_the_setting(bench: Bench, ws_client):
    await start(bench, options=None)
    client = await ws_client(bench.hass, "household")
    await client.send_json({"id": 1, "type": "chauffage/hvac_mode_control/set", "value": False})
    assert not (await client.receive_json())["success"]
    assert bench.runtime.hvac_mode_control is True


# ----- off: no HVAC mode sent, none taken -----

async def test_without_control_a_thermostat_turned_off_by_hand_is_not_an_override(bench: Bench):
    """The thermostat stays off: the next slots send it nothing, as in 0.9."""
    await start(bench)
    await turn_off_by_hand(bench)
    assert bench.overrides() == {}
    await bench.go_to("17:30")
    assert bench.powered() == {} and bench.applied() == {}
    assert salon(bench) == "off"


async def test_without_control_a_thermostat_turned_back_on_gets_its_slot(bench: Bench):
    """Turned on by hand, the thermostat catches up with the slots it missed while off."""
    await start(bench)
    await turn_off_by_hand(bench)
    await bench.go_to("18:00")  # comfort since 17:30
    bench.thermostat(SALON, "eco", context=CTX_USER)  # back on, on eco
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {} and bench.powered() == {}
    assert bench.applied() == {SALON: "comfort"}


async def test_without_control_chauffage_never_turns_a_thermostat_on(bench: Bench):
    await start(bench, state="off")
    assert bench.powered() == {} and bench.applied() == {}
    await bench.go_to("17:30")
    await bench.set_override(SALON, bench.runtime.new_override(bench.runtime.targets_of(SALON)["comfort"])
                             | {"preset": "comfort"})
    assert bench.powered() == {} and bench.applied() == {}
    assert salon(bench) == "off"


async def test_without_control_a_vtherm_turned_off_gets_its_slots_and_stays_off(bench: Bench):
    """A VTherm accepts its slots while off (#74), and starts again on them."""
    bench.needs("vtherm")
    await bench.go_to("10:00")
    bench.versatile_thermostat(SALON)
    bench.thermostat(SALON, "eco")
    await bench.setup(NO_CONTROL)
    await bench.save_weeks({SALON: {"normal": [WEEKDAY] * 7}})
    clear(bench)
    bench.thermostat(SALON, "eco", state="off", context=CTX_USER,
                     requested_state={"hvac_mode": "off", "preset": "eco", "target_temperature": None})
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    await bench.go_to("17:30")
    assert bench.powered() == {}
    assert bench.applied() == {SALON: "comfort"}


async def test_without_control_an_air_conditioner_gets_the_value_of_the_hvac_mode_it_shows(bench: Bench):
    """Cooling, it gets the cooling value of comfort: 25 °C, or its own comfort preset."""
    await start(bench, state="cool", hvac_modes=AC_MODES)
    await bench.go_to("17:30")
    assert bench.powered() == {}
    if bench.kind == "plain":
        assert sent_to(bench) == [25.0]
    else:
        assert bench.applied() == {SALON: "comfort"}


async def test_without_control_an_hvac_mode_changed_by_hand_waits_for_the_next_slot(bench: Bench):
    """Owner's decision: switched from heat to cool by hand during comfort, the air conditioner is
    no override and gets nothing until the next slot, as in 0.9. The next slot gives it the
    cooling value."""
    await start(bench, "18:00", preset="comfort", hvac_modes=AC_MODES)
    bench.thermostat(SALON, "comfort", state="cool", hvac_modes=AC_MODES, context=CTX_USER)
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.powered() == {} and bench.applied() == {} and sent_to(bench) == []
    await bench.go_to("22:30")  # eco
    assert bench.powered() == {}
    if bench.kind == "plain":
        assert sent_to(bench) == [27.0]
    else:
        assert bench.applied() == {SALON: "eco"}


async def test_without_control_a_setpoint_changed_by_hand_is_still_an_override(bench: Bench):
    await start(bench)
    await bench.manual_setpoint(SALON, 21.0)
    assert bench.overrides()[SALON]["target"] == {"temperature": 21.0}


async def test_without_control_an_override_with_an_hvac_mode_is_refused(bench: Bench):
    await start(bench, hvac_modes=AC_MODES)
    with pytest.raises(ServiceValidationError) as refused:
        await override(bench, hvac_mode="off")
    assert refused.value.translation_key == "hvac_mode_not_controlled"
    with pytest.raises(model.InvalidData):
        await bench.set_override(SALON, bench.runtime.new_override({"hvac_mode": "cool", "temperature": 24.0}))
    assert bench.overrides() == {}
    await override(bench, temperature=21.0)  # a setpoint is still fine
    assert bench.overrides()[SALON]["target"] == {"temperature": 21.0}


async def test_without_control_a_week_with_an_hvac_mode_is_refused(bench: Bench):
    await start(bench)
    for day in (NIGHT_OFF, [["00:00", "eco", HEAT]]):
        with pytest.raises(model.InvalidData):
            await bench.save_weeks({SALON: {"normal": [day] * 7}})
    assert bench.runtime.weeks[SALON]["normal"][0] == WEEKDAY


# ----- turning the setting off converts the weeks -----

FAN = {"fan_mode": "3"}
AC_DAY = [["00:00", None, OFF], ["06:30", "comfort", {**COOL, **FAN}], ["08:30", "eco", HEAT],
          ["12:00", None, {"hvac_mode": "fan_only"}], ["17:30", "comfort"], ["22:30", None, OFF]]


async def start_converting(bench: Bench) -> None:
    await start_ac(bench, "10:00", AC_DAY)


async def test_turning_the_control_off_shows_the_slots_that_change_first(bench: Bench):
    """The panel lists them before anything changes: the slots removed, and those that lose
    their HVAC mode. The heater's off slots are removed too."""
    await start_converting(bench)
    changes = await set_control(bench, False, preview=True)
    assert bench.runtime.hvac_mode_control is True
    assert bench.runtime.weeks[SALON]["normal"][0] == AC_DAY
    monday = [c for c in changes if c["day"] == 0 and c["schedule"] == "normal"]
    assert [(c["entity_id"], c["start"], c["preset"], c["hvac_mode"], c["change"]) for c in monday] == [
        (SALON, "00:00", None, "off", "removed"),
        (SALON, "06:30", "comfort", "cool", "hvac_mode_removed"),
        (SALON, "08:30", "eco", "heat", "hvac_mode_removed"),
        (SALON, "12:00", None, "fan_only", "removed"),
        (SALON, "17:30", "comfort", "heat", "hvac_mode_removed"),  # as it runs on an air conditioner
        (SALON, "22:30", None, "off", "removed"),
        (BUREAU, "00:00", None, "off", "removed"),
        (BUREAU, "12:00", None, "fan_only", "removed"),  # the heater has no fan only: it did nothing
        (BUREAU, "22:30", None, "off", "removed"),
    ]
    # The other schedules are eco all week: in heat on the air conditioner, nothing on the heater
    away = [c for c in changes if c["day"] == 0 and c["schedule"] == "away"]
    assert [(c["entity_id"], c["start"], c["hvac_mode"]) for c in away] == [(SALON, "00:00", "heat")]
    assert len(changes) == 7 * (len(monday) + 2)


async def test_turning_the_control_off_converts_the_weeks(bench: Bench):
    """An off, fan-only, dry or auto slot is removed: the slot before it continues, from the day
    before at midnight. A heat, cool or heat/cool slot keeps its preset, and its fan."""
    await start_converting(bench)
    await set_control(bench, False)
    assert bench.runtime.weeks[SALON]["normal"][1] == [
        ["00:00", "comfort"], ["06:30", "comfort", FAN], ["08:30", "eco"], ["17:30", "comfort"]]
    assert bench.runtime.weeks[BUREAU]["normal"][1] == [
        ["00:00", "comfort"], ["06:30", "comfort", FAN], ["08:30", "eco"], ["17:30", "comfort"]]
    assert bench.runtime.thermostats[SALON]["revision"] == 2  # a card's copy is outdated


async def test_a_week_of_slots_without_a_preset_becomes_the_week_of_a_new_schedule(bench: Bench):
    """Nothing comes before an off slot that fills the whole week."""
    await start_ac(bench, "10:00", [["00:00", None, OFF]])
    await set_control(bench, False, SALON)
    assert bench.runtime.weeks[SALON]["normal"] == [[["00:00", "eco"]]] * 7


async def test_turning_the_control_off_for_one_thermostat_converts_its_weeks_only(bench: Bench):
    await start_converting(bench)
    changes = await set_control(bench, False, SALON, preview=True)
    assert {c["entity_id"] for c in changes} == {SALON}
    await set_control(bench, False, SALON)
    assert bench.runtime.weeks[BUREAU]["normal"][0] == AC_DAY


async def test_turning_the_control_off_for_the_house_spares_a_thermostat_that_says_on(bench: Bench):
    await start_converting(bench)
    await set_control(bench, True, BUREAU)
    assert {c["entity_id"] for c in await set_control(bench, False, preview=True)} == {SALON}


async def test_turning_the_control_on_again_converts_nothing(bench: Bench):
    await start_converting(bench)
    await set_control(bench, False)
    weeks = bench.runtime.weeks[SALON]["normal"]
    assert await set_control(bench, True, preview=True) == []
    await set_control(bench, True)
    assert bench.runtime.weeks[SALON]["normal"] == weeks


async def test_an_override_loses_its_hvac_mode_when_the_control_is_turned_off(bench: Bench):
    """An off override has nothing left: it ends. Another one keeps its setpoint."""
    await start_ac(bench)
    await override(bench, entity_id=SALON, hvac_mode="cool", temperature=24.0)
    await override(bench, entity_id=BUREAU, hvac_mode="off")
    await set_control(bench, False)
    assert bench.overrides() == {SALON: {**bench.overrides()[SALON], "target": {"temperature": 24.0}}}


async def test_turning_the_control_off_realigns_the_thermostats(bench: Bench):
    """The weeks changed: as when they are saved. A thermostat turned off stays off."""
    await start_ac(bench, "23:00", NIGHT_OFF, state="off")
    await set_control(bench, False)
    assert bench.powered() == {} and bench.applied() == {}


# ----- the options of the integration (the owner's decision of 2026-11-28) -----

async def options_with(bench: Bench, **user_input) -> dict:
    """The options flow, its form submitted with the options as they are, and `user_input`."""
    options = bench.hass.config_entries.options
    flow = await options.async_init(bench.entry.entry_id)
    defaults = {str(key): key.default() for key in flow["data_schema"].schema if callable(getattr(key, "default", None))}
    result = await options.async_configure(flow["flow_id"], {**defaults, **user_input})
    await bench.hass.async_block_till_done()
    return result


async def test_the_options_offer_the_control_of_the_hvac_mode_next_to_the_overrides(bench: Bench):
    await start(bench, options=None)
    flow = await bench.hass.config_entries.options.async_init(bench.entry.entry_id)
    keys = [str(key) for key in flow["data_schema"].schema]
    assert keys[keys.index("off_override_end") + 1] == "hvac_mode_control"
    key = next(k for k in flow["data_schema"].schema if str(k) == "hvac_mode_control")
    assert key.default() is True
    bench.hass.config_entries.options.async_abort(flow["flow_id"])


async def test_turning_the_control_off_in_the_options_lists_the_slots_that_change_first(bench: Bench):
    """As the panel does: by thermostat and schedule, a slot's days together. Submitting the
    list converts the weeks."""
    await start(bench, day=NIGHT_OFF, options=None, friendly_name="Salon")
    result = await options_with(bench, hvac_mode_control=False)
    assert (result["type"], result["step_id"]) == ("form", "hvac_mode_control")
    assert result["description_placeholders"]["changes"] == (
        "- **Salon** · Normal\n"
        "  - Mon–Sun · 00:00 · Off → removed\n"
        "  - Mon–Sun · 22:30 · Off → removed")
    assert bench.runtime.hvac_mode_control is True, "nothing changed yet"
    assert bench.runtime.weeks[SALON]["normal"][0] == NIGHT_OFF
    result = await bench.hass.config_entries.options.async_configure(result["flow_id"], {})
    await bench.hass.async_block_till_done()
    assert result["type"] == "create_entry"
    assert bench.runtime.hvac_mode_control is False
    assert bench.runtime.weeks[SALON]["normal"][0] == [["00:00", "comfort"], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"]]


async def test_the_list_of_the_options_says_which_slots_lose_their_hvac_mode(bench: Bench):
    await start_ac(bench, day=[["00:00", "eco"], ["06:30", "comfort", COOL]])
    result = await options_with(bench, hvac_mode_control=False)
    assert result["description_placeholders"]["changes"].splitlines()[1:3] == [
        "  - Mon–Sun · 00:00 · Eco, Heat → Eco",
        "  - Mon–Sun · 06:30 · Comfort, Cool → Comfort"]
    bench.hass.config_entries.options.async_abort(result["flow_id"])


async def test_the_options_cannot_change_the_control_while_chauffage_is_not_running(bench: Bench):
    """Its weeks could not be converted: the setting stays as it is, and the form says why."""
    await start(bench, day=NIGHT_OFF, options=None)
    await bench.hass.config_entries.async_unload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    result = await options_with(bench, hvac_mode_control=False)
    assert result["type"] == "form" and result["errors"] == {"hvac_mode_control": "not_running"}
    assert bench.entry.options.get("hvac_mode_control", True) is True


async def test_chauffage_stopped_during_the_list_of_the_options_changes_nothing(bench: Bench):
    await start(bench, day=NIGHT_OFF, options=None)
    result = await options_with(bench, hvac_mode_control=False)
    await bench.hass.config_entries.async_unload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    result = await bench.hass.config_entries.options.async_configure(result["flow_id"], {})
    assert (result["type"], result["reason"]) == ("abort", "not_running")
    assert bench.entry.options.get("hvac_mode_control", True) is True


def test_a_name_in_the_list_of_the_options_stays_plain_text():
    assert config_flow.markdown_text("*Salle_de_bain* [1]") == "\\*Salle\\_de\\_bain\\* \\[1\\]"


def test_the_days_of_a_slot_in_a_row_are_a_range():
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    assert config_flow.days_text([4, 0, 1, 2, 3], names) == "Mon–Fri"
    assert config_flow.days_text([5, 6], names) == "Sat, Sun"
    assert config_flow.days_text([0, 2, 3, 4, 6], names) == "Mon, Wed–Fri, Sun"


async def test_closing_the_list_in_the_options_changes_nothing(bench: Bench):
    await start(bench, day=NIGHT_OFF, options=None)
    result = await options_with(bench, hvac_mode_control=False, override_duration=30)
    bench.hass.config_entries.options.async_abort(result["flow_id"])
    await bench.hass.async_block_till_done()
    assert bench.runtime.hvac_mode_control is True
    assert bench.runtime.override_duration != 30
    assert bench.runtime.weeks[SALON]["normal"][0] == NIGHT_OFF


async def test_with_nothing_to_convert_the_options_turn_the_control_off_at_once(bench: Bench):
    """No list to show: the options are saved. An override loses its HVAC mode, as from the panel."""
    await start(bench, options=None)
    await override(bench, entity_id=SALON, hvac_mode="off")
    result = await options_with(bench, hvac_mode_control=False)
    assert result["type"] == "create_entry"
    assert bench.runtime.hvac_mode_control is False
    assert bench.overrides() == {}


async def test_the_options_turn_the_control_on_again(bench: Bench):
    await start(bench)
    result = await options_with(bench, hvac_mode_control=True)
    assert result["type"] == "create_entry"
    assert bench.runtime.hvac_mode_control is True


async def test_the_list_of_the_options_speaks_the_language_of_home_assistant(bench: Bench):
    bench.hass.config.language = "fr"
    await start(bench, day=NIGHT_OFF, options=None, friendly_name="Salon")
    result = await options_with(bench, hvac_mode_control=False)
    assert result["description_placeholders"]["changes"].splitlines()[1] == "  - Lun–Dim · 00:00 · Éteint → supprimé"


# ----- the engine -----

def test_a_thermostat_without_control_carries_no_hvac_mode():
    cooling = engine.Thermostat("cool", "comfort", 20.0, ("eco", "comfort"), hvac_modes=tuple(AC_MODES),
                                hvac_control=False)
    assert engine.slot_hvac_mode({"hvac_mode": "cool"}, cooling) is None
    assert engine.slot_hvac_mode({"hvac_mode": "off"}, cooling) is None
    off = engine.Thermostat("off", "comfort", 20.0, hvac_modes=tuple(AC_MODES), hvac_control=False)
    assert engine.ignored(off)
    assert not engine.ignored(engine.Thermostat("off", "comfort", 20.0, vtherm=True, hvac_control=False))
    assert engine.complete({"temperature": 20.0, "cool_temperature": 25.0}, cooling) == {"temperature": 25.0}
    assert engine.hvac_satisfied({"temperature": 20.0}, engine.Thermostat("fan_only", None, 20.0, hvac_control=False))


def test_a_change_of_hvac_mode_by_hand_is_no_override_without_control():
    before = ac("heat")
    after = engine.Thermostat("cool", "comfort", 20.0, ("eco", "comfort"), hvac_modes=tuple(AC_MODES))
    expected = {"preset_mode": "eco"}
    assert engine.manual_change(before, after, by_user=True, expected=expected) is not None
    before, after = (dataclasses.replace(t, hvac_control=False) for t in (before, after))
    assert engine.manual_change(before, after, by_user=True, expected=expected) is None
    # A preset picked in the same change is an override, without an HVAC mode
    boosted = dataclasses.replace(after, preset="boost", presets=("eco", "comfort", "boost"))
    assert engine.manual_change(before, boosted, by_user=True, expected=expected) == {"preset_mode": "boost"}
    # A VTherm off gets its setpoints: one picked while off is an override (#74)
    off = engine.Thermostat("off", "eco", 17.0, ("eco", "boost"), vtherm=True, hvac_control=False)
    assert engine.manual_change(off, dataclasses.replace(off, preset="boost"), by_user=True,
                                expected={"preset_mode": "eco"}) == {"preset_mode": "boost"}


def test_a_week_without_hvac_modes():
    week = [[["00:00", None, OFF], ["07:00", "comfort", {**COOL, **FAN}]], [["00:00", "eco"], ["12:00", None, OFF]],
            *[[["00:00", "eco"]]] * 5]
    assert model.without_hvac_modes(week, ["eco"]) == [
        [["00:00", "eco"], ["07:00", "comfort", FAN]], [["00:00", "eco"]], *[[["00:00", "eco"]]] * 5]
    assert model.without_hvac_modes([[["00:00", None, OFF]]] * 7, ["comfort", "eco"]) == [[["00:00", "eco"]]] * 7
