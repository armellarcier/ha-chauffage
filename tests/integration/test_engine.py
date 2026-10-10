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
SCHEDULES = {
    "climate.salon": {"normal": WEEK, "away": [[["00:00", "eco"]]] * 7},
    "climate.bureau": {"normal": [[["00:00", "eco"], ["09:00", "comfort"], ["18:00", "eco"]]] * 7},
}


def at(hhmm: str, day: int = 0) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return MONDAY + timedelta(days=day, hours=h, minutes=m)


VTHERM = ("none", "frost", "eco", "comfort", "boost")
LEVELS = {level["id"]: level for level in model.default_levels("en")}


def heat(preset="eco", temperature=17.0, state="heat", presets=VTHERM) -> Thermostat:
    return Thermostat(state, preset, temperature, presets, 5.0, 30.0, 0.5)


def plain(temperature=17.0, state="heat", **kw) -> Thermostat:
    """A thermostat without presets (generic_thermostat)."""
    return Thermostat(state, None, temperature, (), kw.get("min_temp", 5.0), kw.get("max_temp", 30.0), kw.get("step", 0.5))


def targets(now, thermostats, mode="normal", overrides=None, mappings=None, **kw):
    plan = engine.Plan(SCHEDULES, mode, LEVELS, mappings or {}, overrides or {})
    return [(entity_id, target.value) for entity_id, target in engine.targets(plan, now, thermostats, **kw)]


# ----- slots -----

def test_the_slot_running_at_a_given_time():
    assert engine.slot_at(WEEKDAY, "06:29") == ("eco", False)
    assert engine.slot_at(WEEKDAY, "06:30") == ("comfort", True)
    assert engine.slot_at(WEEKDAY, "23:59") == ("eco", False)


def test_current_and_next_slot_even_on_another_day():
    assert engine.current_and_next(WEEK, at("10:00")) == ("eco", "comfort", at("17:30"))
    # Friday 23:00 → Saturday 08:00
    assert engine.current_and_next(WEEK, at("23:00", day=4)) == ("eco", "comfort", at("08:00", day=5))
    assert engine.current_and_next([[["00:00", "eco"]]] * 7, at("10:00")) == ("eco", None, None)


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


def test_another_mode_and_thermostats_without_that_mode():
    thermostats = {"climate.salon": heat("comfort"), "climate.bureau": heat("comfort")}
    assert targets(at("10:00"), thermostats, mode="away", force=True) == [("climate.salon", "eco")]


def test_off_unavailable_and_unknown_thermostats_are_ignored():
    for state in ("off", "unavailable", "unknown"):
        assert targets(at("10:00"), {"climate.bureau": heat("eco", state=state)}, force=True) == []
    assert targets(at("10:00"), {}, force=True) == []  # entity missing


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
    assert engine.manual_change(heat("eco", 17), heat("none", 21.5), by_user=True) == ("temperature", 21.5)
    # Integrations without a user (physical knob) count too
    assert engine.manual_change(heat("eco", 17), heat("none", 21.5), by_user=False) == ("temperature", 21.5)


def test_a_preset_picked_by_a_user_is_a_preset_override():
    assert engine.manual_change(heat("eco"), heat("boost"), by_user=True) == ("preset", "boost")
    assert engine.manual_change(heat("eco"), heat("boost"), by_user=False) is None


def test_no_override_when_nothing_relevant_changed_or_the_thermostat_is_off():
    assert engine.manual_change(heat("eco", 17), heat("eco", 17), by_user=True) is None
    assert engine.manual_change(heat("eco", 17), heat("none", 21, state="off"), by_user=True) is None
    assert engine.manual_change(heat("eco", 17, state="unavailable"), heat("none", 21), by_user=True) is None


# ----- data rules -----

def test_days_are_normalized_like_in_the_card():
    assert model.normalize_day([["08:00", "eco"], ["06:30", "comfort"], ["07:00", "comfort"]]) == [
        ["00:00", "comfort"], ["08:00", "eco"]]
    assert model.normalize_day(["00:00 eco", "6:30 comfort"]) == [["00:00", "eco"], ["06:30", "comfort"]]
    assert model.normalize_day([["25:00", "eco"], "nonsense"]) == [["00:00", "eco"]]
    assert model.normalize_day(None) == [["00:00", "eco"]]


def test_schedules_are_validated():
    ok = model.normalize_schedules({"climate.salon": {"normal": WEEK}}, {"normal"})
    assert ok["climate.salon"]["normal"] == WEEK
    for bad in ({"light.x": {}}, {"climate.salon": {"other": WEEK}}, {"climate.salon": {"normal": [WEEKDAY]}}):
        with pytest.raises(model.InvalidData):
            model.normalize_schedules(bad, {"normal"})


def test_mode_ids_are_unique_slugs_of_their_names():
    assert model.make_modes(["Normal", "Vacances d'été", "Normal", "normal!"]) == [
        {"id": "normal", "name": "Normal"},
        {"id": "vacances_d_ete", "name": "Vacances d'été"},
        {"id": "normal_2", "name": "normal!"},
    ]


def test_overrides_are_validated():
    o = model.normalize_override({"kind": "temperature", "value": "21.5", "start": "a", "end": "b"})
    assert o["value"] == 21.5
    with pytest.raises(model.InvalidData):
        model.normalize_override({"kind": "temp", "value": 21, "start": "a", "end": "b"})


# ----- heating levels → presets or temperatures -----

def test_a_level_uses_the_thermostat_s_preset_with_the_same_name():
    assert engine.default_target(LEVELS["comfort"], heat()) == engine.Target("preset", "comfort")


def test_without_that_preset_the_level_s_temperature_is_used():
    standard = heat(presets=("eco", "comfort", "away", "boost"))  # no "frost"
    assert engine.default_target(LEVELS["frost"], standard) == engine.Target("temperature", 7.0)
    assert engine.default_target(LEVELS["comfort"], plain()) == engine.Target("temperature", 20.0)


def test_temperatures_are_fitted_to_the_thermostat():
    assert engine.default_target(LEVELS["frost"], plain(min_temp=10.0)).value == 10.0
    assert engine.default_target(LEVELS["comfort"], plain(max_temp=18.0)).value == 18.0
    assert engine.fit_temperature(20.3, plain(step=0.5)) == 20.5
    assert engine.fit_temperature(20.26, plain(step=0.1)) == 20.3


def test_a_mapping_set_by_hand_wins_over_the_default():
    mapping = {"comfort": {"temperature": 19.5}, "eco": {"preset": "away"}}
    assert engine.resolve("comfort", LEVELS, mapping, heat()) == engine.Target("temperature", 19.5)
    assert engine.resolve("eco", LEVELS, mapping, heat()) == engine.Target("preset", "away")
    assert engine.resolve("boost", LEVELS, mapping, heat()) == engine.Target("preset", "boost")
    assert engine.resolve("unknown", LEVELS, mapping, heat()) is None


def test_a_thermostat_without_presets_gets_temperatures():
    thermostats = {"climate.salon": plain(17.0), "climate.bureau": plain(17.0)}
    assert targets(at("10:00"), thermostats, force=True) == [("climate.bureau", 20.0)]
    # Already at the level's temperature (within half a step): nothing to send
    thermostats = {"climate.salon": plain(17.0), "climate.bureau": plain(20.2)}
    assert targets(at("10:00"), thermostats, force=True) == []


def test_temperature_expected_manual_changes():
    expected = engine.Target("temperature", 20.0)
    # A new setpoint, by a user or on the device itself
    assert engine.manual_change(plain(20.0), plain(22.0), by_user=False, expected=expected) == ("temperature", 22.0)
    # The thermostat reaching what the schedule expects is not an override
    assert engine.manual_change(plain(17.0), plain(20.0), by_user=False, expected=expected) is None
    # VTherm mapped to temperatures: safety mode in and out
    assert engine.manual_change(heat("none", 20.0), heat("safety", 7.0), by_user=False, expected=expected) is None
    assert engine.manual_change(heat("safety", 7.0), heat("none", 20.0), by_user=False, expected=expected) is None
    # A preset picked by a user
    assert engine.manual_change(heat("none", 20.0), heat("boost", 22.0), by_user=True, expected=expected) == ("preset", "boost")


def test_a_setpoint_change_keeping_the_preset_is_the_preset_s_temperature():
    """VTherm preset temperatures: editing the comfort temperature is not an override."""
    expected = engine.Target("preset", "comfort")
    assert engine.manual_change(heat("comfort", 20.0), heat("comfort", 21.0), by_user=True, expected=expected) is None


# ----- level data -----

def test_default_levels_are_named_in_the_language_and_keep_unknown_presets():
    levels = model.default_levels("fr", ["eco", "sleep"])
    assert [lv["name"] for lv in levels] == ["Confort", "Éco", "Boost", "Hors-gel", "sleep"]
    assert levels[-1]["id"] == "sleep"


def test_levels_and_mappings_are_validated():
    level = model.normalize_level({"name": "Nuit", "color": "#123ABC", "temperature": "18.5"}, {"eco"})
    assert level == {"id": "nuit", "name": "Nuit", "color": "#123abc", "temperature": 18.5}
    for bad in ({"name": ""}, {"name": "x", "color": "red"}, {"name": "x", "temperature": "hot"}):
        with pytest.raises(model.InvalidData):
            model.normalize_level(bad, set())
    assert model.normalize_mapping({"eco": {"temperature": "17"}}, {"eco"}) == {"eco": {"temperature": 17.0}}
    with pytest.raises(model.InvalidData):
        model.normalize_mapping({"night": {"preset": "sleep"}}, {"eco"})


def test_schedules_with_an_unknown_level_are_refused():
    with pytest.raises(model.InvalidData):
        model.normalize_schedules({"climate.salon": {"normal": [[["00:00", "sleep"]]] * 7}}, {"normal"}, {"eco"})
