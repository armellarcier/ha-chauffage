"""Scheduling logic without Home Assistant (engine.py) and data rules (model.py)."""

from datetime import datetime, timedelta
from enum import Enum
from zoneinfo import ZoneInfo

import pytest

from custom_components.chauffage import engine, model
from custom_components.chauffage.engine import Thermostat

PARIS = ZoneInfo("Europe/Paris")
MONDAY = datetime(2026, 10, 12, tzinfo=PARIS)
WEEKDAY = [["00:00", "eco"], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"], ["22:30", "eco"]]
WEEKEND = [["00:00", "eco"], ["08:00", "comfort"], ["23:00", "eco"]]
WEEK = [WEEKDAY] * 5 + [WEEKEND] * 2
WEEKS = {
    "climate.salon": {"normal": WEEK, "away": [[["00:00", "eco"]]] * 7},
    "climate.bureau": {"normal": [[["00:00", "eco"], ["09:00", "comfort"], ["18:00", "eco"]]] * 7},
}


def at(hhmm: str, day: int = 0) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return MONDAY + timedelta(days=day, hours=h, minutes=m)


VTHERM = ("none", "frost", "eco", "comfort", "boost")
PRESETS = {preset["id"]: preset for preset in model.default_presets("en")}


def heat(preset="eco", temperature=17.0, state="heat", presets=VTHERM) -> Thermostat:
    return Thermostat(state, preset, temperature, presets, 5.0, 30.0, 0.5)


def plain(temperature=17.0, state="heat", **kw) -> Thermostat:
    """A thermostat without presets (generic_thermostat)."""
    return Thermostat(state, None, temperature, (), kw.get("min_temp", 5.0), kw.get("max_temp", 30.0), kw.get("step", 0.5))


def value_of(target: dict) -> object:
    """The one value of a target of lot 1: its climate preset, or its temperature."""
    return target.get("preset_mode", target.get("temperature"))


def targets(now, thermostats, schedule="normal", overrides=None, mappings=None, **kw):
    plan = engine.Plan(WEEKS, schedule, PRESETS, mappings or {}, overrides or {})
    return [(entity_id, value_of(target)) for entity_id, target in engine.targets(plan, now, thermostats, **kw)]


# ----- slots -----

def test_the_slot_running_at_a_given_time():
    assert engine.slot_at(WEEKDAY, "06:29") == (engine.Slot("eco", {}), False)
    assert engine.slot_at(WEEKDAY, "06:30") == (engine.Slot("comfort", {}), True)
    assert engine.slot_at(WEEKDAY, "23:59") == (engine.Slot("eco", {}), False)


def test_a_slot_in_the_hour_skipped_by_summer_time_starts_when_the_clocks_go_forward():
    """Regression: Sunday 28 March 2027, 2:00 → 3:00. A 2:30 slot doesn't exist that day: the
    engine applies it at 3:00 summer time (slot_at), so it starts then, not at 3:30."""
    week = [[["00:00", "eco"], ["02:30", "comfort"], ["12:00", "eco"]]] * 7
    now = datetime(2027, 3, 28, 1, 40, tzinfo=PARIS)
    assert engine.current_and_next(week, now) == (engine.Slot("eco", {}), engine.Slot("comfort", {}), datetime(2027, 3, 28, 3, 0, tzinfo=PARIS))
    assert engine.current_and_next(week, now)[2].utcoffset() == timedelta(hours=2)
    # The next day, the 2:30 slot exists again
    after = datetime(2027, 3, 28, 13, 0, tzinfo=PARIS)
    assert engine.current_and_next(week, after)[2] == datetime(2027, 3, 29, 2, 30, tzinfo=PARIS)


def test_current_and_next_slot_even_on_another_day():
    eco, comfort = engine.Slot("eco", {}), engine.Slot("comfort", {})
    assert engine.current_and_next(WEEK, at("10:00")) == (eco, comfort, at("17:30"))
    # Friday 23:00 → Saturday 08:00
    assert engine.current_and_next(WEEK, at("23:00", day=4)) == (eco, comfort, at("08:00", day=5))
    assert engine.current_and_next([[["00:00", "eco"]]] * 7, at("10:00")) == (eco, None, None)


# ----- what to apply -----

def test_forced_realignment_applies_every_thermostat_off_its_slot():
    thermostats = {"climate.salon": heat("eco"), "climate.bureau": heat("eco")}
    assert targets(at("10:00"), thermostats, force=True) == [("climate.bureau", "comfort")]


def test_without_force_only_slots_starting_now():
    thermostats = {"climate.salon": heat("boost"), "climate.bureau": heat("eco")}
    assert targets(at("10:01"), thermostats) == []
    assert targets(at("17:30"), thermostats) == [("climate.salon", "comfort")]


def test_the_day_of_the_week_is_respected():
    thermostats = {"climate.salon": heat("eco")}
    assert targets(at("08:00", day=5), thermostats) == [("climate.salon", "comfort")]
    assert targets(at("08:00", day=0), thermostats) == []


def test_another_schedule_and_thermostats_without_a_week_in_it():
    thermostats = {"climate.salon": heat("comfort"), "climate.bureau": heat("comfort")}
    assert targets(at("10:00"), thermostats, schedule="away", force=True) == [("climate.salon", "eco")]


def test_unavailable_and_unknown_thermostats_are_ignored():
    for state in ("unavailable", "unknown"):
        assert targets(at("10:00"), {"climate.bureau": heat("eco", state=state)}, force=True) == []
    assert targets(at("10:00"), {}, force=True) == []  # entity missing


def test_a_thermostat_is_ready_once_it_shows_a_setpoint_or_a_preset():
    """At a restart, a thermostat may write a first state before it has restored its own: VTherm
    writes `off` without setpoint or preset (#93)."""
    assert not engine.ready({})
    assert not engine.ready({"temperature": None, "current_temperature": None})
    assert engine.ready({"temperature": 20.0})
    assert engine.ready({"preset_mode": "eco"})
    assert engine.ready({"target_temp_low": 18.0, "target_temp_high": 24.0})  # heat_cool


def test_a_vtherm_is_not_ready_while_it_says_so():
    """VTherm 9 and later publish is_ready; VTherm 8 publishes nothing."""
    assert not engine.ready({"temperature": 20.0, "is_ready": False}, vtherm=True)
    assert engine.ready({"temperature": 20.0, "is_ready": True}, vtherm=True)
    assert engine.ready({"temperature": 20.0}, vtherm=True)  # VTherm 8
    assert engine.ready({"temperature": 20.0, "is_ready": False})  # not a VTherm's attribute


def test_a_thermostat_that_is_not_ready_is_ignored():
    starting = Thermostat("heat", None, None, (), 5.0, 30.0, 0.5, ready=False)
    assert engine.ignored(starting)
    assert targets(at("10:00"), {"climate.bureau": starting}, force=True) == []


def test_a_vtherm_turned_off_is_turned_on_like_any_thermostat():
    """A VTherm asked to be off (requested_state, #91) comes back on at the next slot, as any
    thermostat. Before #91 it got its slots while off and stayed off (#74): that reading stays
    for a VTherm without requested_state, see runtime.thermostat."""
    vtherm = Thermostat("off", "eco", 17.0, VTHERM, 5.0, 30.0, 0.5, vtherm=True, hvac_modes=("off", "heat"))
    plan = engine.Plan(WEEKS, "normal", PRESETS, {}, {})
    assert engine.targets(plan, at("10:00"), {"climate.bureau": vtherm}, force=True) == [
        ("climate.bureau", {"preset_mode": "comfort", "hvac_mode": "heat"})]
    unavailable = Thermostat("unavailable", "eco", 17.0, VTHERM, 5.0, 30.0, 0.5, vtherm=True)
    assert targets(at("10:00"), {"climate.bureau": unavailable}, force=True) == []


def test_overrides_are_left_alone_until_they_end_or_are_removed():
    thermostats = {"climate.salon": heat("none", 21.5), "climate.bureau": heat("eco")}
    overrides = {"climate.salon": {"end": at("12:00").isoformat()}}
    assert targets(at("10:00"), thermostats, overrides=overrides, force=True) == [("climate.bureau", "comfort")]
    assert targets(at("12:00"), thermostats, overrides=overrides, ended=["climate.salon"]) == [("climate.salon", "eco")]
    assert targets(at("10:00"), thermostats, overrides=overrides, resumed="climate.salon") == [("climate.salon", "eco")]


def test_ended_overrides():
    overrides = {
        "climate.a": {"end": at("10:00").isoformat()},
        "climate.b": {"end": at("10:01").isoformat()},
        "climate.c": {"end": "garbage"},
    }
    assert engine.ended_overrides(overrides, at("10:00")) == ["climate.a", "climate.c"]


def test_an_enum_preset_is_read_as_its_value():
    class Preset(Enum):
        ECO = "eco"

    assert engine.preset_value(Preset.ECO) == "eco"
    assert engine.preset_value(None) is None


# ----- manual changes -----

def test_a_setpoint_changed_by_hand_is_a_temperature_override():
    assert engine.manual_change(heat("eco", 17), heat("none", 21.5), by_user=True) == {"temperature": 21.5}
    # Integrations without a user (physical knob) count too
    assert engine.manual_change(heat("eco", 17), heat("none", 21.5), by_user=False) == {"temperature": 21.5}


def test_a_preset_picked_by_a_user_is_a_preset_override():
    assert engine.manual_change(heat("eco"), heat("boost"), by_user=True) == {"preset_mode": "boost"}
    assert engine.manual_change(heat("eco"), heat("boost"), by_user=False) is None


def test_no_override_when_nothing_relevant_changed_or_the_thermostat_is_off():
    assert engine.manual_change(heat("eco", 17), heat("eco", 17), by_user=True) is None
    assert engine.manual_change(heat("eco", 17), heat("none", 21, state="off"), by_user=True) == {"hvac_mode": "off"}
    assert engine.manual_change(heat("eco", 17, state="unavailable"), heat("none", 21), by_user=True) is None


# ----- the end of a change by hand -----

def next_change(entity_id="climate.salon", weeks=WEEKS, now=None, until=None):
    now = now or at("18:00")
    plan = engine.Plan(weeks, "normal", PRESETS, {}, {})
    return plan.next_change(entity_id, now, heat(), not_before=now, until=until or now + timedelta(days=2))


def test_the_next_slot_that_changes_the_target():
    assert next_change() == at("22:30")


def test_no_next_slot_without_a_week():
    assert next_change("climate.cuisine") is None


def test_no_next_slot_before_the_limit():
    assert next_change(until=at("22:30")) is None


def test_no_next_slot_in_a_week_on_a_single_preset():
    weeks = {"climate.salon": {"normal": [[["00:00", "eco"]]] * 7}}
    assert next_change(weeks=weeks, until=at("18:00", day=10)) is None


def test_a_slot_of_an_unknown_preset_changes_nothing():
    weeks = {"climate.salon": {"normal": [[["00:00", "eco"], ["19:00", "gone"], ["20:00", "comfort"]]] * 7}}
    assert next_change(weeks=weeks) == at("20:00")


# ----- data rules -----

def test_days_are_normalized_like_in_the_card():
    assert model.normalize_day([["08:00", "eco"], ["06:30", "comfort"], ["07:00", "comfort"]]) == [
        ["00:00", "comfort"], ["08:00", "eco"]]
    assert model.normalize_day(["00:00 eco", "6:30 comfort"]) == [["00:00", "eco"], ["06:30", "comfort"]]
    assert model.normalize_day([["25:00", "eco"], "nonsense"]) == [["00:00", "eco"]]
    assert model.normalize_day(None) == [["00:00", "eco"]]


def test_schedules_are_validated():
    ok = model.normalize_weeks({"climate.salon": {"normal": WEEK}}, {"normal"})
    assert ok["climate.salon"]["normal"] == WEEK
    for bad in ({"light.x": {}}, {"climate.salon": {"other": WEEK}}, {"climate.salon": {"normal": [WEEKDAY]}}):
        with pytest.raises(model.InvalidData):
            model.normalize_weeks(bad, {"normal"})


def test_schedule_ids_are_unique_slugs_of_their_names():
    assert model.make_schedules(["Normal", "Vacances d'été", "Normal", "normal!"]) == [
        {"id": "normal", "name": "Normal"},
        {"id": "vacances_d_ete", "name": "Vacances d'été"},
        {"id": "normal_2", "name": "normal!"},
    ]


def test_overrides_are_validated():
    o = model.normalize_override({"target": {"temperature": "21.5"}, "start": "a", "end": "b"})
    assert o["target"] == {"temperature": 21.5}
    with pytest.raises(model.InvalidData):
        model.normalize_override({"target": {"temp": 21}, "start": "a", "end": "b"})


def test_an_override_keeps_why_it_ends_if_the_reason_is_known():
    base = {"target": {"temperature": 21}, "start": "a", "end": "b"}
    assert model.normalize_override({**base, "ends_at": "next_slot"})["ends_at"] == "next_slot"
    assert model.normalize_override({**base, "ends_at": "no_next_slot"})["ends_at"] == "no_next_slot"
    assert "ends_at" not in model.normalize_override({**base, "ends_at": "whenever"})


# ----- presets → climate presets or temperatures -----

def test_a_target_is_a_partial_state_the_thermostat_satisfies_or_not():
    """What a thermostat is set to is a partial state, as a scene holds it (#91): every key it
    holds must be shown by the thermostat."""
    assert engine.satisfied({"preset_mode": "eco"}, heat("eco", 17.0))
    assert not engine.satisfied({"preset_mode": "eco"}, heat("comfort", 20.0))
    assert engine.satisfied({"temperature": 17.0}, plain(17.2))
    assert not engine.satisfied({"temperature": 17.0}, plain(18.0))
    assert engine.satisfied({"preset_mode": "eco", "temperature": 17.0}, heat("eco", 17.0))
    assert not engine.satisfied({"preset_mode": "eco", "temperature": 17.0}, heat("eco", 18.0))



def test_a_preset_uses_the_thermostat_s_climate_preset_with_the_same_name():
    assert engine.default_target(PRESETS["comfort"], heat()) == {"preset_mode": "comfort"}


def test_without_that_climate_preset_the_preset_s_temperature_is_used():
    standard = heat(presets=("eco", "comfort", "away", "boost"))  # no "frost"
    assert engine.default_target(PRESETS["frost"], standard) == {"temperature": 7.0}
    assert engine.default_target(PRESETS["comfort"], plain()) == {"temperature": 20.0}


def test_temperatures_are_fitted_to_the_thermostat():
    assert engine.default_target(PRESETS["frost"], plain(min_temp=10.0)) == {"temperature": 10.0}
    assert engine.default_target(PRESETS["comfort"], plain(max_temp=18.0)) == {"temperature": 18.0}
    assert engine.fit_temperature(20.3, plain(step=0.5)) == 20.5
    assert engine.fit_temperature(20.26, plain(step=0.1)) == 20.3


def test_a_mapping_set_by_hand_wins_over_the_default():
    mapping = {"comfort": {"temperature": 19.5}, "eco": {"preset_mode": "away"}}
    assert engine.resolve("comfort", PRESETS, mapping, heat()) == {"temperature": 19.5}
    assert engine.resolve("eco", PRESETS, mapping, heat()) == {"preset_mode": "away"}
    assert engine.resolve("boost", PRESETS, mapping, heat()) == {"preset_mode": "boost"}
    assert engine.resolve("unknown", PRESETS, mapping, heat()) is None


def test_a_thermostat_without_presets_gets_temperatures():
    thermostats = {"climate.salon": plain(17.0), "climate.bureau": plain(17.0)}
    assert targets(at("10:00"), thermostats, force=True) == [("climate.bureau", 20.0)]
    # Already at the preset's temperature (within half a step): nothing to send
    thermostats = {"climate.salon": plain(17.0), "climate.bureau": plain(20.2)}
    assert targets(at("10:00"), thermostats, force=True) == []


def test_temperature_expected_manual_changes():
    expected = {"temperature": 20.0}
    # A new setpoint, by a user or on the device itself
    assert engine.manual_change(plain(20.0), plain(22.0), by_user=False, expected=expected) == {"temperature": 22.0}
    # The thermostat reaching what the schedule expects is not an override: back to the schedule
    assert engine.manual_change(plain(17.0), plain(20.0), by_user=False, expected=expected) == engine.RESUME
    # VTherm mapped to temperatures: safety mode in (not an override) and out (back to the schedule)
    assert engine.manual_change(heat("none", 20.0), heat("safety", 7.0), by_user=False, expected=expected) is None
    assert engine.manual_change(heat("safety", 7.0), heat("none", 20.0), by_user=False, expected=expected) == engine.RESUME
    # A preset picked by a user
    assert engine.manual_change(heat("none", 20.0), heat("boost", 22.0), by_user=True, expected=expected) == {"preset_mode": "boost"}
    # Then that preset's own temperature edited (VTherm): still that preset, as when a preset is expected
    assert engine.manual_change(heat("boost", 22.0), heat("boost", 23.0), by_user=True, expected=expected) is None


def test_a_setpoint_change_keeping_the_preset_is_the_preset_s_temperature():
    """VTherm preset temperatures: editing the comfort temperature is not an override."""
    expected = {"preset_mode": "comfort"}
    assert engine.manual_change(heat("comfort", 20.0), heat("comfort", 21.0), by_user=True, expected=expected) is None


def test_going_back_to_what_the_schedule_expects_resumes_it():
    """Issue #19: not a "Comfort in Comfort" override. As for overrides: a preset only when a
    user picks it (not VTherm leaving its safety mode), a setpoint by a user or on the device."""
    eco = {"preset_mode": "eco"}
    assert engine.manual_change(heat("none", 21.5), heat("eco", 17.0), by_user=True, expected=eco) == engine.RESUME
    assert engine.manual_change(heat("none", 21.5), heat("eco", 17.0), by_user=False, expected=eco) is None
    # The slot's preset temperature edited (VTherm): still that preset, nothing to resume
    assert engine.manual_change(heat("eco", 17.0), heat("eco", 18.0), by_user=True, expected=eco) is None
    seventeen = {"temperature": 17.0}
    assert engine.manual_change(plain(21.5), plain(17.0), by_user=True, expected=seventeen) == engine.RESUME
    assert engine.manual_change(plain(21.5), plain(17.0), by_user=False, expected=seventeen) == engine.RESUME
    # Something else changed (an attribute), the setpoint did not
    assert engine.manual_change(plain(17.0), plain(17.0), by_user=True, expected=seventeen) is None


def test_a_manual_setpoint_at_the_temperature_of_the_slot_s_preset_resumes_the_schedule():
    """What the slot gives on this thermostat: the temperature of its own preset, not the
    default temperature of the ha-chauffage preset (only used without that climate preset)."""
    eco = {"preset_mode": "eco"}
    knob = (heat("none", 21.5), heat("none", 17.0))
    assert engine.manual_change(*knob, by_user=False, expected=eco, preset_temperature=17.0) == engine.RESUME
    assert engine.manual_change(*knob, by_user=False, expected=eco, preset_temperature=16.0) == {"temperature": 17.0}
    assert engine.manual_change(*knob, by_user=False, expected=eco) == {"temperature": 17.0}  # not known


def test_an_override_already_at_what_the_slot_gives_is_kept():
    """Held from the card past the next slots: the thermostat coming back to it by itself
    (VTherm mapped to temperatures leaving its safety mode) does not end it."""
    seventeen = {"temperature": 17.0}
    back = (heat("safety", 7.0), heat("none", 17.0))
    assert engine.manual_change(*back, by_user=False, expected=seventeen, override=seventeen) is None
    assert engine.manual_change(*back, by_user=False, expected=seventeen, override={"temperature": 22.0}) == engine.RESUME


def test_the_temperature_of_a_thermostat_s_own_preset():
    """Versatile Thermostat publishes them (preset_temperatures since its version 10, eco_temp…
    before); otherwise the one last read while the thermostat was on that preset."""
    assert engine.preset_temperature({"preset_temperatures": {"eco_temp": 16.0}}, "eco", {"eco": 17.0}) == 16.0
    assert engine.preset_temperature({"eco_temp": 16.5}, "eco", {}) == 16.5
    assert engine.preset_temperature({}, "eco", {"eco": 17.0}) == 17.0
    assert engine.preset_temperature({}, "eco", {}) is None


# ----- preset data -----

def test_default_presets_are_named_in_the_language_and_keep_unknown_ones():
    presets = model.default_presets("fr", ["eco", "sleep"])
    assert [p["name"] for p in presets] == ["Confort", "Éco", "Boost", "Hors-gel", "sleep"]
    assert presets[-1]["id"] == "sleep"


def test_presets_and_mappings_are_validated():
    preset = model.normalize_preset({"name": "Nuit", "color": "#123ABC", "temperature": "18.5"}, {"eco"})
    assert preset == {"id": "nuit", "name": "Nuit", "color": "#123abc", "temperature": 18.5}
    for bad in ({"name": ""}, {"name": "x", "color": "red"}, {"name": "x", "temperature": "hot"}):
        with pytest.raises(model.InvalidData):
            model.normalize_preset(bad, set())
    assert model.normalize_mapping({"eco": {"temperature": "17"}}, {"eco"}) == {"eco": {"temperature": 17.0}}
    # A preset and a temperature together: the device decides what to do with both (docs/decisions.md)
    assert model.normalize_mapping({"eco": {"preset_mode": "eco", "temperature": 18}}, {"eco"}) == {"eco": {"preset_mode": "eco", "temperature": 18.0}}
    for bad in ({"eco": {}}, {"eco": {"preset_mode": ""}}, {"eco": {"fan": "high"}}):
        with pytest.raises(model.InvalidData):
            model.normalize_mapping(bad, {"eco"})
    with pytest.raises(model.InvalidData):
        model.normalize_mapping({"night": {"preset_mode": "sleep"}}, {"eco"})


def test_weeks_with_an_unknown_preset_are_refused():
    with pytest.raises(model.InvalidData):
        model.normalize_weeks({"climate.salon": {"normal": [[["00:00", "sleep"]]] * 7}}, {"normal"}, {"eco"})


# ----- commands applied late -----

def test_a_thermostat_takes_a_command_by_changing_to_it():
    pending = [{"temperature": 20.0}, {"temperature": 17.0}]
    eco, comfort = Thermostat("heat", None, 17.0), Thermostat("heat", None, 20.0)
    assert engine.applied_command(pending, eco, comfort) == 0
    assert engine.applied_command(pending, comfort, eco) == 1
    assert engine.applied_command(pending, eco, eco) is None  # already showed it: may still apply 20
    assert engine.applied_command(pending, eco, Thermostat("off", None, 20.0)) is None  # turned off


def test_commands_not_taken_after_a_day_are_not_waited_for():
    sent = [at("06:30").isoformat(), at("08:30").isoformat(), "unreadable"]
    assert engine.expired_commands(sent, at("07:00", day=1)) == 1
    assert engine.expired_commands(sent, at("09:00", day=1)) == 3
    assert engine.expired_commands(sent, at("09:00")) == 0


# ----- a slot sets more than a preset: the HVAC mode (#91) -----

S = engine.Slot
OFF = {"hvac_mode": "off"}
AC_MODES = ("off", "heat", "cool", "fan_only")


def ac(state="cool", preset="comfort", temperature=20.0, modes=AC_MODES, last=None) -> Thermostat:
    """A reversible air conditioner."""
    return Thermostat(state, preset, temperature, VTHERM, 5.0, 30.0, 0.5, hvac_modes=modes, last_hvac_mode=last)


def test_a_slot_holds_a_preset_and_optional_settings():
    day = [["00:00", "eco"], ["07:00", "comfort", {"hvac_mode": "cool"}], ["22:00", "eco", OFF]]
    assert engine.slot_at(day, "06:59") == (S("eco", {}), False)
    assert engine.slot_at(day, "07:00") == (S("comfort", {"hvac_mode": "cool"}), True)
    assert engine.slot_at(day, "23:00") == (S("eco", OFF), False)


def test_the_next_slot_may_differ_by_its_settings_only():
    """Eco, then eco turned off: the off slot is a change."""
    week = [[["00:00", "eco"], ["22:00", "eco", OFF]]] * 7
    assert engine.current_and_next(week, at("10:00")) == (S("eco", {}), S("eco", OFF), at("22:00"))
    assert engine.current_and_next(week, at("23:00")) == (S("eco", OFF), S("eco", {}), at("00:00", day=1))


def test_the_hvac_mode_comes_from_the_slot_then_the_preset_s_value_then_the_preset():
    """Three layers, the last one wins (docs/decisions.md, "Presets")."""
    presets = {**PRESETS, "away": {"id": "away", "name": "Away", "color": "#000000", "temperature": 15.0, "hvac_mode": "off"}}
    mapping = {"comfort": {"hvac_mode": "cool"}, "eco": {"temperature": 18.0}}
    # The preset's own default
    assert engine.resolve("away", presets, {}, ac()) == {"temperature": 15.0, "hvac_mode": "off"}
    assert engine.resolve("boost", presets, {}, ac()) == {"preset_mode": "boost"}
    # The preset's value on this thermostat adds to the default, or replaces its setpoint
    assert engine.resolve("comfort", presets, mapping, ac()) == {"preset_mode": "comfort", "hvac_mode": "cool"}
    assert engine.resolve("eco", presets, mapping, ac()) == {"temperature": 18.0}
    assert engine.resolve("away", presets, {"away": {"preset_mode": "frost"}}, ac()) == {"preset_mode": "frost", "hvac_mode": "off"}
    # The slot has the last word
    assert engine.resolve("comfort", presets, mapping, ac(), settings={"hvac_mode": "heat"}) == {"preset_mode": "comfort", "hvac_mode": "heat"}
    assert engine.resolve("away", presets, {}, ac(), settings={"hvac_mode": "heat"}) == {"temperature": 15.0, "hvac_mode": "heat"}


def test_a_target_without_hvac_mode_means_on():
    """An "on" target is satisfied by any HVAC mode but off (docs/decisions.md, "Scheduling")."""
    assert engine.satisfied({"preset_mode": "comfort"}, ac("cool"))
    assert engine.satisfied({"preset_mode": "comfort"}, ac("heat"))
    assert not engine.satisfied({"preset_mode": "comfort"}, ac("off"))
    assert engine.satisfied({"preset_mode": "comfort", "hvac_mode": "off"}, ac("off"))
    assert not engine.satisfied({"preset_mode": "comfort", "hvac_mode": "cool"}, ac("heat"))


def test_an_off_thermostat_is_turned_on_in_heat_else_its_last_mode_else_its_first_mode():
    """Never a cooling AC switched to heat: a thermostat that is on keeps its HVAC mode."""
    target = {"preset_mode": "comfort"}
    assert engine.complete(target, ac("cool")) == target
    assert engine.complete(target, ac("off")) == {"preset_mode": "comfort", "hvac_mode": "heat"}
    cooler = ("off", "cool", "fan_only")
    assert engine.complete(target, ac("off", modes=cooler, last="fan_only")) == {"preset_mode": "comfort", "hvac_mode": "fan_only"}
    assert engine.complete(target, ac("off", modes=cooler)) == {"preset_mode": "comfort", "hvac_mode": "cool"}
    assert engine.complete(target, ac("off", modes=())) == target  # no HVAC mode known: nothing to turn on with
    assert engine.complete({"preset_mode": "comfort", "hvac_mode": "cool"}, ac("off")) == {"preset_mode": "comfort", "hvac_mode": "cool"}


def test_a_thermostat_turned_off_gets_its_slots_and_is_turned_on():
    """The schedule decides whether a thermostat is off (#91): a thermostat turned off is not
    left alone anymore, unlike one unavailable or unknown."""
    off = Thermostat("off", "eco", 17.0, VTHERM, 5.0, 30.0, 0.5, hvac_modes=("off", "heat"))
    plan = engine.Plan(WEEKS, "normal", PRESETS, {}, {})
    assert engine.targets(plan, at("10:00"), {"climate.bureau": off}, force=True) == [
        ("climate.bureau", {"preset_mode": "comfort", "hvac_mode": "heat"})]
    for state in ("unavailable", "unknown"):
        assert targets(at("10:00"), {"climate.bureau": heat("eco", state=state)}, force=True) == []


def test_an_off_slot_turns_the_thermostat_off_and_keeps_its_preset():
    """"Eco + off" means off, and start again on eco: the preset is sent while off, as a scene
    does (docs/decisions.md)."""
    week = [[["00:00", "comfort"], ["22:00", "eco", OFF]]] * 7
    plan = engine.Plan({"climate.salon": {"normal": week}}, "normal", PRESETS, {}, {})
    assert engine.targets(plan, at("22:00"), {"climate.salon": ac("heat")}) == [
        ("climate.salon", {"preset_mode": "eco", "hvac_mode": "off"})]
    assert engine.targets(plan, at("22:00"), {"climate.salon": ac("off", "eco")}) == []


def test_a_slot_with_settings_is_a_change_the_tick_applies():
    """A slot that only changes the settings of the slot before it is applied at its start."""
    week = [[["00:00", "eco"], ["22:00", "eco", OFF]]] * 7
    plan = engine.Plan({"climate.salon": {"normal": week}}, "normal", PRESETS, {}, {})
    assert engine.targets(plan, at("22:00"), {"climate.salon": ac("heat", "eco")}, since=at("21:59")) == [
        ("climate.salon", {"preset_mode": "eco", "hvac_mode": "off"})]


def test_an_off_slot_is_a_next_slot_that_changes_the_target():
    """The end of a change by hand counts an off slot as a change (#83)."""
    weeks = {"climate.salon": {"normal": [[["00:00", "eco"], ["22:00", "eco", OFF]]] * 7}}
    assert next_change(weeks=weeks) == at("22:00")


def test_a_vtherm_is_read_as_it_was_asked_not_as_it_changed_itself():
    """VTherm keeps what it was asked for in requested_state (#92): an open window turns it off
    or sets the frost setpoint, and its intent stays heat."""
    window = {"preset_mode": "none", "temperature": 7.0,
              "requested_state": {"hvac_mode": "heat", "target_temperature": 17.5, "preset": "none"}}
    assert engine.asked(window, vtherm=True) == ("heat", "none", 17.5)
    assert engine.asked(window) == (None, "none", 7.0)  # not a VTherm's attribute


def test_a_vtherm_on_a_preset_keeps_the_setpoint_it_shows():
    """On a preset, requested_state keeps the last manual setpoint, not the preset's."""
    window = {"preset_mode": "eco", "temperature": 7.0,
              "requested_state": {"hvac_mode": "heat", "target_temperature": 19.0, "preset": "eco"}}
    assert engine.asked(window, vtherm=True) == ("heat", "eco", 7.0)
    central = {"preset_mode": "frost", "temperature": 7.0,
               "requested_state": {"hvac_mode": "heat", "target_temperature": 19.0, "preset": "comfort"}}
    assert engine.asked(central, vtherm=True) == ("heat", "comfort", 7.0)


def test_a_vtherm_without_requested_state_is_read_as_it_shows():
    """VTherm before its state manager, or a state without it."""
    assert engine.asked({"preset_mode": "eco", "temperature": 17.0}, vtherm=True) == (None, "eco", 17.0)
    assert engine.asked({"preset_mode": "eco", "temperature": 17.0, "requested_state": {}}, vtherm=True) \
        == (None, "eco", 17.0)


def test_why_a_vtherm_is_off():
    """For the card: VTherm says why it turned itself off, as hvac_off_reason (VTherm 10.5 moved
    it into specific_states)."""
    assert engine.off_cause({"specific_states": {"hvac_off_reason": "hvac_off_window"}}) == "window"  # VTherm 10.5
    assert engine.off_cause({"specific_states": {"hvac_off_reason": "hvac_off_auto_start_stop"}}) == "auto_start_stop"
    assert engine.off_cause({"hvac_off_reason": "auto_start_stop"}) == "auto_start_stop"
    assert engine.off_cause({"specific_states": {"hvac_off_reason": "hvac_off_manual"}}) is None
    assert engine.off_cause({}) is None


def test_turning_a_thermostat_off_by_hand_during_an_on_slot_is_an_off_override():
    expected = {"preset_mode": "comfort"}
    assert engine.manual_change(ac("heat"), ac("off"), by_user=True, expected=expected) == OFF
    assert engine.manual_change(ac("heat"), ac("off"), by_user=False, expected=expected) == OFF  # its button
    assert engine.manual_change(ac("heat"), ac("off"), by_user=True) == OFF  # no week: still a change


def test_turning_a_thermostat_on_by_hand_during_an_off_slot_is_an_override():
    expected = {"preset_mode": "eco", "hvac_mode": "off"}
    assert engine.manual_change(ac("off", "eco"), ac("heat", "eco"), by_user=True, expected=expected) == {"hvac_mode": "heat"}
    assert engine.manual_change(ac("off", "eco"), ac("cool", "eco"), by_user=False, expected=expected) == {"hvac_mode": "cool"}


def test_turning_a_thermostat_back_on_ends_its_off_override():
    """Back on in any HVAC mode the slot accepts: the override ends, and the thermostat is set
    to its slot (what it restarted on does not count as a change)."""
    expected = {"preset_mode": "comfort"}
    assert engine.manual_change(ac("off", "eco"), ac("heat", "eco"), by_user=True, expected=expected, override=OFF) == engine.RESUME
    assert engine.manual_change(ac("off", "eco"), ac("cool", "eco"), by_user=False, expected=expected, override=OFF) == engine.RESUME
    # Turned off again while the slot says off: back to the slot too
    assert engine.manual_change(ac("heat"), ac("off"), by_user=True, expected={"preset_mode": "eco", "hvac_mode": "off"},
                                override={"hvac_mode": "heat"}) == engine.RESUME


def test_switching_the_hvac_mode_by_hand_is_an_override_when_the_slot_sets_one():
    expected = {"preset_mode": "comfort", "hvac_mode": "cool"}
    assert engine.manual_change(ac("cool"), ac("heat"), by_user=True, expected=expected) == {"hvac_mode": "heat"}
    assert engine.manual_change(ac("heat"), ac("cool"), by_user=True, expected=expected, override={"hvac_mode": "heat"}) == engine.RESUME
    # Without an HVAC mode on the slot, switching heat to cool is not a change: both are "on"
    assert engine.manual_change(ac("heat"), ac("cool"), by_user=True, expected={"preset_mode": "comfort"}) is None


def test_a_preset_picked_while_the_thermostat_is_off_keeps_it_off():
    """The override says off, and the preset the thermostat restarts on."""
    expected = {"preset_mode": "comfort"}
    assert engine.manual_change(ac("off", "eco"), ac("off", "boost"), by_user=True, expected=expected) \
        == {"hvac_mode": "off", "preset_mode": "boost"}
    assert engine.manual_change(ac("off", "eco"), ac("off", "comfort"), by_user=True, expected=expected) \
        == {"hvac_mode": "off", "preset_mode": "comfort"}


def test_settings_of_a_slot_are_validated():
    assert model.normalize_day([["00:00", "eco", {"hvac_mode": "off"}], ["07:00", "comfort", {}]]) == [
        ["00:00", "eco", OFF], ["07:00", "comfort"]]
    # Consecutive slots merge only when their settings are the same too
    assert model.normalize_day([["00:00", "eco"], ["22:00", "eco", OFF], ["23:00", "eco", OFF]]) == [
        ["00:00", "eco"], ["22:00", "eco", OFF]]
    assert model.used_presets({"climate.salon": {"normal": [[["00:00", "eco", OFF]]] * 7}}) == ["eco"]
    for bad in (["00:00", "eco", "off"], ["00:00", "eco", {"hvac_mode": ""}], ["00:00", "eco", {"temperature": 19}]):
        with pytest.raises(model.InvalidData):
            model.normalize_day([bad])


def test_a_preset_may_set_a_default_hvac_mode():
    preset = model.normalize_preset({"name": "Off", "temperature": 7, "hvac_mode": "off"}, set())
    assert preset == {"id": "off", "name": "Off", "color": model.DEFAULT_PRESET_COLOR, "temperature": 7.0, "hvac_mode": "off"}
    assert "hvac_mode" not in model.normalize_preset({"name": "Eco", "hvac_mode": None}, set())
    with pytest.raises(model.InvalidData):
        model.normalize_preset({"name": "Eco", "hvac_mode": ""}, set())


def test_a_target_may_set_the_hvac_mode_alone():
    assert model.normalize_target({"hvac_mode": "off"}) == OFF
    assert model.normalize_target({"hvac_mode": "cool", "temperature": "24"}) == {"hvac_mode": "cool", "temperature": 24.0}
