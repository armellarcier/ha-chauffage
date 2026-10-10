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


def heat(preset="eco", temperature=17.0, state="heat") -> Thermostat:
    return Thermostat(state, preset, temperature)


def targets(now, thermostats, mode="normal", overrides=None, **kw):
    return engine.targets(SCHEDULES, mode, now, overrides or {}, thermostats, **kw)


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


def test_the_thermostat_s_own_modes_are_not_manual_changes():
    """Versatile Thermostat's safety mode: entering it, then leaving it to preset "none"."""
    assert engine.manual_change(heat("eco", 17), heat("safety", 7), by_user=False) is None
    assert engine.manual_change(heat("safety", 7), heat("none", 18), by_user=False) is None
    assert engine.left_own_preset(heat("safety", 7), heat("none", 18))
    assert not engine.left_own_preset(heat("eco", 17), heat("none", 18))
