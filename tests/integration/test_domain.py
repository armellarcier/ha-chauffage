"""The rules of Chauffage, on the domain objects (domain/) and the stored data (storage/schema.py)."""

from datetime import datetime, timedelta
from enum import Enum
from zoneinfo import ZoneInfo

import pytest

from custom_components.chauffage.domain.manual_change import NewOverride, NoChange, Resume, classify
from custom_components.chauffage.domain.pending import applied_command, expired_commands
from custom_components.chauffage.domain.plan import Forced, Plan, Resumed, Tick, due_targets, ended_overrides
from custom_components.chauffage.domain.preset import Preset
from custom_components.chauffage.domain.slot import Day, Slot, target_of
from custom_components.chauffage.domain.target import Target
from custom_components.chauffage.domain.thermostat import Thermostat, fit_temperature, ignored, own_preset_temperature, preset_value
from custom_components.chauffage.domain.timeline import current_and_next
from custom_components.chauffage.storage import schema
from custom_components.chauffage.storage.schema import InvalidData

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
PRESETS = {preset["id"]: preset for preset in schema.default_presets("en")}


def heat(preset="eco", temperature=17.0, state="heat", presets=VTHERM) -> Thermostat:
    return Thermostat(state, preset, temperature, presets, 5.0, 30.0, 0.5)


def plain(temperature=17.0, state="heat", **kw) -> Thermostat:
    """A thermostat without presets (generic_thermostat)."""
    return Thermostat(state, None, temperature, (), kw.get("min_temp", 5.0), kw.get("max_temp", 30.0), kw.get("step", 0.5))


def value_of(target: dict) -> object:
    """The one value of a target of lot 1: its climate preset, or its temperature."""
    return target.get("preset_mode", target.get("temperature"))


def targets(now, thermostats, schedule="normal", overrides=None, mappings=None, force=False, resumed=None, ended=(),
            since=None):
    plan = Plan(WEEKS, schedule, PRESETS, mappings or {}, overrides or {})
    reason = Forced("") if force else Resumed(resumed, "") if resumed else Tick(since, frozenset(ended))
    return [(entity_id, value_of(target)) for entity_id, target in due_targets(plan, now, thermostats, reason)]


# ----- slots -----

def test_the_slot_running_at_a_given_time():
    assert Day.from_stored(WEEKDAY).slot_at("06:29") == (Slot("eco", {}), False)
    assert Day.from_stored(WEEKDAY).slot_at("06:30") == (Slot("comfort", {}), True)
    assert Day.from_stored(WEEKDAY).slot_at("23:59") == (Slot("eco", {}), False)


def test_a_slot_in_the_hour_skipped_by_summer_time_starts_when_the_clocks_go_forward():
    """Regression: Sunday 28 March 2027, 2:00 → 3:00. A 2:30 slot doesn't exist that day: the
    engine applies it at 3:00 summer time (slot_at), so it starts then, not at 3:30."""
    week = [[["00:00", "eco"], ["02:30", "comfort"], ["12:00", "eco"]]] * 7
    now = datetime(2027, 3, 28, 1, 40, tzinfo=PARIS)
    assert current_and_next(week, now) == (Slot("eco", {}), Slot("comfort", {}), datetime(2027, 3, 28, 3, 0, tzinfo=PARIS))
    assert current_and_next(week, now)[2].utcoffset() == timedelta(hours=2)
    # The next day, the 2:30 slot exists again
    after = datetime(2027, 3, 28, 13, 0, tzinfo=PARIS)
    assert current_and_next(week, after)[2] == datetime(2027, 3, 29, 2, 30, tzinfo=PARIS)


def test_current_and_next_slot_even_on_another_day():
    eco, comfort = Slot("eco", {}), Slot("comfort", {})
    assert current_and_next(WEEK, at("10:00")) == (eco, comfort, at("17:30"))
    # Friday 23:00 → Saturday 08:00
    assert current_and_next(WEEK, at("23:00", day=4)) == (eco, comfort, at("08:00", day=5))
    assert current_and_next([[["00:00", "eco"]]] * 7, at("10:00")) == (eco, None, None)


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


def test_a_thermostat_that_is_not_ready_is_ignored():
    starting = Thermostat("heat", None, None, (), 5.0, 30.0, 0.5, ready=False)
    assert ignored(starting)
    assert targets(at("10:00"), {"climate.bureau": starting}, force=True) == []


def test_a_vtherm_turned_off_is_turned_on_like_any_thermostat():
    """A VTherm asked to be off (requested_state, #91) comes back on at the next slot, as any
    thermostat."""
    vtherm = Thermostat("off", "eco", 17.0, VTHERM, 5.0, 30.0, 0.5, leaves_preset_itself=True, hvac_modes=("off", "heat"))
    plan = Plan(WEEKS, "normal", PRESETS, {}, {})
    assert due_targets(plan, at("10:00"), {"climate.bureau": vtherm}, Forced("")) == [
        ("climate.bureau", {"preset_mode": "comfort", "hvac_mode": "heat"})]
    unavailable = Thermostat("unavailable", "eco", 17.0, VTHERM, 5.0, 30.0, 0.5, leaves_preset_itself=True)
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
    assert ended_overrides(overrides, at("10:00")) == ["climate.a", "climate.c"]


def test_an_enum_preset_is_read_as_its_value():
    class Preset(Enum):
        ECO = "eco"

    assert preset_value(Preset.ECO) == "eco"
    assert preset_value(None) is None


# ----- manual changes -----

def test_a_setpoint_changed_by_hand_is_a_temperature_override():
    assert classify(heat("eco", 17), heat("none", 21.5), by_user=True) == NewOverride(Target({"temperature": 21.5}))
    # Integrations without a user (physical knob) count too
    assert classify(heat("eco", 17), heat("none", 21.5), by_user=False) == NewOverride(Target({"temperature": 21.5}))


def test_a_preset_picked_by_a_user_is_a_preset_override():
    assert classify(heat("eco"), heat("boost"), by_user=True) == NewOverride(Target({"preset_mode": "boost"}))
    assert classify(heat("eco"), heat("boost"), by_user=False) == NoChange()


def test_no_override_when_nothing_relevant_changed_or_the_thermostat_is_off():
    assert classify(heat("eco", 17), heat("eco", 17), by_user=True) == NoChange()
    # Turned off and set to 21 in one state: the override says off, alone
    assert classify(heat("eco", 17), heat("none", 21, state="off"), by_user=True) == NewOverride(Target({"hvac_mode": "off"}))
    assert classify(heat("eco", 17, state="unavailable"), heat("none", 21), by_user=True) == NoChange()


# ----- the end of a change by hand -----

def next_change(entity_id="climate.salon", weeks=WEEKS, now=None, until=None):
    now = now or at("18:00")
    plan = Plan(weeks, "normal", PRESETS, {}, {})
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
    # Two slots in a row that are the same stay two slots: the user cut them
    assert schema.day([["08:00", "eco"], ["06:30", "comfort"], ["07:00", "comfort"]]).to_stored() == [
        ["00:00", "comfort"], ["07:00", "comfort"], ["08:00", "eco"]]
    assert schema.day(["00:00 eco", "6:30 comfort"]).to_stored() == [["00:00", "eco"], ["06:30", "comfort"]]
    assert schema.day([["25:00", "eco"], "nonsense"]).to_stored() == [["00:00", "eco"]]
    assert schema.day(None).to_stored() == [["00:00", "eco"]]


def test_schedules_are_validated():
    ok = schema.normalize_weeks({"climate.salon": {"normal": WEEK}}, {"normal"})
    assert ok["climate.salon"]["normal"] == WEEK
    for bad in ({"light.x": {}}, {"climate.salon": {"other": WEEK}}, {"climate.salon": {"normal": [WEEKDAY]}}):
        with pytest.raises(InvalidData):
            schema.normalize_weeks(bad, {"normal"})


def test_schedule_ids_are_unique_slugs_of_their_names():
    assert schema.make_schedules(["Normal", "Vacances d'été", "Normal", "normal!"]) == [
        {"id": "normal", "name": "Normal"},
        {"id": "vacances_d_ete", "name": "Vacances d'été"},
        {"id": "normal_2", "name": "normal!"},
    ]


def test_overrides_are_validated():
    o = schema.override({"target": {"temperature": "21.5"}, "start": "a", "end": "b"}).to_stored()
    assert o["target"] == {"temperature": 21.5}
    with pytest.raises(InvalidData):
        schema.override({"target": {"temp": 21}, "start": "a", "end": "b"}).to_stored()


def test_an_override_keeps_why_it_ends_if_the_reason_is_known():
    base = {"target": {"temperature": 21}, "start": "a", "end": "b"}
    assert schema.override({**base, "end_rule": "next_slot"}).to_stored()["end_rule"] == "next_slot"
    assert schema.override({**base, "end_rule": "no_next_slot"}).to_stored()["end_rule"] == "no_next_slot"
    assert "end_rule" not in schema.override({**base, "end_rule": "whenever"}).to_stored()


# ----- presets → climate presets or temperatures -----

def test_a_target_is_a_partial_state_the_thermostat_satisfies_or_not():
    """What a thermostat is set to is a partial state, as a scene holds it (#91): every key it
    holds must be shown by the thermostat."""
    assert Target({"preset_mode": "eco"}).satisfied_by(heat("eco", 17.0))
    assert not Target({"preset_mode": "eco"}).satisfied_by(heat("comfort", 20.0))
    assert Target({"temperature": 17.0}).satisfied_by(plain(17.2))
    assert not Target({"temperature": 17.0}).satisfied_by(plain(18.0))
    assert Target({"preset_mode": "eco", "temperature": 17.0}).satisfied_by(heat("eco", 17.0))
    assert not Target({"preset_mode": "eco", "temperature": 17.0}).satisfied_by(heat("eco", 18.0))



def test_a_preset_uses_the_thermostat_s_climate_preset_with_the_same_name():
    assert Preset.from_stored(PRESETS["comfort"]).value_on(None, heat()).attributes() == {"preset_mode": "comfort"}


def test_without_that_climate_preset_the_preset_s_temperature_is_used():
    standard = heat(presets=("eco", "comfort", "away", "boost"))  # no "frost"
    assert Preset.from_stored(PRESETS["frost"]).value_on(None, standard).attributes() == {"temperature": 7.0}
    assert Preset.from_stored(PRESETS["comfort"]).value_on(None, plain()).attributes() == {"temperature": 20.0}


def test_temperatures_are_fitted_to_the_thermostat():
    assert Preset.from_stored(PRESETS["frost"]).value_on(None, plain(min_temp=10.0)).attributes() == {"temperature": 10.0}
    assert Preset.from_stored(PRESETS["comfort"]).value_on(None, plain(max_temp=18.0)).attributes() == {"temperature": 18.0}
    assert fit_temperature(20.3, plain(step=0.5)) == 20.5
    assert fit_temperature(20.26, plain(step=0.1)) == 20.3


def test_a_mapping_set_by_hand_wins_over_the_default():
    mapping = {"comfort": {"temperature": 19.5}, "eco": {"preset_mode": "away"}}
    assert target_of("comfort", PRESETS, mapping, heat()) == {"temperature": 19.5}
    assert target_of("eco", PRESETS, mapping, heat()) == {"preset_mode": "away"}
    assert target_of("boost", PRESETS, mapping, heat()) == {"preset_mode": "boost"}
    assert target_of("unknown", PRESETS, mapping, heat()) is None


def test_a_thermostat_without_presets_gets_temperatures():
    thermostats = {"climate.salon": plain(17.0), "climate.bureau": plain(17.0)}
    assert targets(at("10:00"), thermostats, force=True) == [("climate.bureau", 20.0)]
    # Already at the preset's temperature (within half a step): nothing to send
    thermostats = {"climate.salon": plain(17.0), "climate.bureau": plain(20.2)}
    assert targets(at("10:00"), thermostats, force=True) == []


def test_temperature_expected_manual_changes():
    expected = {"temperature": 20.0}
    # A new setpoint, by a user or on the device itself
    assert classify(plain(20.0), plain(22.0), by_user=False, expected=expected) == NewOverride(Target({"temperature": 22.0}))
    # The thermostat reaching what the schedule expects is not an override: back to the schedule
    assert classify(plain(17.0), plain(20.0), by_user=False, expected=expected) == Resume()
    # VTherm mapped to temperatures: safety mode in (not an override) and out (back to the schedule)
    assert classify(heat("none", 20.0), heat("safety", 7.0), by_user=False, expected=expected) == NoChange()
    assert classify(heat("safety", 7.0), heat("none", 20.0), by_user=False, expected=expected) == Resume()
    # A preset picked by a user
    assert classify(heat("none", 20.0), heat("boost", 22.0), by_user=True, expected=expected) == NewOverride(Target({"preset_mode": "boost"}))
    # Then that preset's own temperature edited (VTherm): still that preset, as when a preset is expected
    assert classify(heat("boost", 22.0), heat("boost", 23.0), by_user=True, expected=expected) == NoChange()


def test_a_setpoint_change_keeping_the_preset_is_the_preset_s_temperature():
    """VTherm preset temperatures: editing the comfort temperature is not an override."""
    expected = {"preset_mode": "comfort"}
    assert classify(heat("comfort", 20.0), heat("comfort", 21.0), by_user=True, expected=expected) == NoChange()


def test_going_back_to_what_the_schedule_expects_resumes_it():
    """Issue #19: not a "Comfort in Comfort" override. As for overrides: a preset only when a
    user picks it (not VTherm leaving its safety mode), a setpoint by a user or on the device."""
    eco = {"preset_mode": "eco"}
    assert classify(heat("none", 21.5), heat("eco", 17.0), by_user=True, expected=eco) == Resume()
    assert classify(heat("none", 21.5), heat("eco", 17.0), by_user=False, expected=eco) == NoChange()
    # The slot's preset temperature edited (VTherm): still that preset, nothing to resume
    assert classify(heat("eco", 17.0), heat("eco", 18.0), by_user=True, expected=eco) == NoChange()
    seventeen = {"temperature": 17.0}
    assert classify(plain(21.5), plain(17.0), by_user=True, expected=seventeen) == Resume()
    assert classify(plain(21.5), plain(17.0), by_user=False, expected=seventeen) == Resume()
    # Something else changed (an attribute), the setpoint did not
    assert classify(plain(17.0), plain(17.0), by_user=True, expected=seventeen) == NoChange()


def test_a_manual_setpoint_at_the_temperature_of_the_slot_s_preset_resumes_the_schedule():
    """What the slot gives on this thermostat: the temperature of its own preset, not the
    default temperature of the ha-chauffage preset (only used without that climate preset)."""
    eco = {"preset_mode": "eco"}
    knob = (heat("none", 21.5), heat("none", 17.0))
    assert classify(*knob, by_user=False, expected=eco, preset_temperature=17.0) == Resume()
    assert classify(*knob, by_user=False, expected=eco, preset_temperature=16.0) == NewOverride(Target({"temperature": 17.0}))
    assert classify(*knob, by_user=False, expected=eco) == NewOverride(Target({"temperature": 17.0}))  # not known


def test_an_override_already_at_what_the_slot_gives_is_kept():
    """Held from the card past the next slots: the thermostat coming back to it by itself
    (VTherm mapped to temperatures leaving its safety mode) does not end it."""
    seventeen = {"temperature": 17.0}
    back = (heat("safety", 7.0), heat("none", 17.0))
    assert classify(*back, by_user=False, expected=seventeen, override=seventeen) == NoChange()
    assert classify(*back, by_user=False, expected=seventeen, override={"temperature": 22.0}) == Resume()


def test_an_override_already_at_what_a_slot_with_a_fan_gives_is_kept():
    """An override sets no fan and may say no HVAC mode. Held past the next slots, it still holds
    the slot's value when the slot also sets the HVAC mode and the fan: the air conditioner coming
    back to it ends nothing."""
    def cooling(temperature: float) -> Thermostat:
        return Thermostat("cool", None, temperature, (), 16.0, 30.0, 0.5, hvac_modes=("off", "heat", "cool"),
                          fan_mode="high")

    slot = {"hvac_mode": "cool", "temperature": 24.0, "fan_mode": "high"}
    back = (cooling(22.0), cooling(24.0))
    for held in ({"temperature": 24.0}, {"hvac_mode": "cool", "temperature": 24.0}):
        assert classify(*back, by_user=True, expected=slot, override=held) == NoChange()
    assert classify(*back, by_user=True, expected=slot, override={"temperature": 26.0}) == Resume()


def test_the_temperature_of_a_thermostat_s_own_preset():
    """Versatile Thermostat publishes them (preset_temperatures); otherwise the one last read
    while the thermostat was on that preset."""
    assert own_preset_temperature({"preset_temperatures": {"eco_temp": 16.0}}, "eco", {"eco": 17.0}) == 16.0
    assert own_preset_temperature({}, "eco", {"eco": 17.0}) == 17.0
    assert own_preset_temperature({}, "eco", {}) is None


# ----- preset data -----

def test_default_presets_are_named_in_the_language_and_keep_unknown_ones():
    presets = schema.default_presets("fr", ["eco", "sleep"])
    assert [p["name"] for p in presets] == ["Confort", "Éco", "Boost", "Hors-gel", "sleep"]
    assert presets[-1]["id"] == "sleep"


def test_presets_and_mappings_are_validated():
    preset = schema.preset({"name": "Nuit", "color": "#123ABC", "temperature": "18.5"}, {"eco"}).to_stored()
    assert preset == {"id": "nuit", "name": "Nuit", "color": "#123abc", "temperature": 18.5}
    for bad in ({"name": ""}, {"name": "x", "color": "red"}, {"name": "x", "temperature": "hot"}):
        with pytest.raises(InvalidData):
            schema.preset(bad, set()).to_stored()
    assert schema.mapping({"eco": {"temperature": "17"}}, {"eco"}) == {"eco": {"temperature": 17.0}}
    # A value is a climate preset or a temperature, not both, and never an HVAC mode (docs/decisions.md)
    for bad in ({"eco": {}}, {"eco": {"preset_mode": ""}}, {"eco": {"fan": "high"}},
                {"eco": {"preset_mode": "eco", "temperature": 18}}, {"eco": {"temperature": 18, "hvac_mode": "cool"}}):
        with pytest.raises(InvalidData):
            schema.mapping(bad, {"eco"})
    with pytest.raises(InvalidData):
        schema.mapping({"night": {"preset_mode": "sleep"}}, {"eco"})


def test_weeks_with_an_unknown_preset_are_refused():
    with pytest.raises(InvalidData):
        schema.normalize_weeks({"climate.salon": {"normal": [[["00:00", "sleep"]]] * 7}}, {"normal"}, {"eco"})


# ----- commands applied late -----

def test_a_thermostat_takes_a_command_by_changing_to_it():
    pending = [{"temperature": 20.0}, {"temperature": 17.0}]
    eco, comfort = Thermostat("heat", None, 17.0), Thermostat("heat", None, 20.0)
    assert applied_command(pending, eco, comfort) == 0
    assert applied_command(pending, comfort, eco) == 1
    assert applied_command(pending, eco, eco) is None  # already showed it: may still apply 20
    assert applied_command(pending, eco, Thermostat("off", None, 20.0)) is None  # turned off


def test_commands_not_taken_after_a_day_are_not_waited_for():
    sent = [at("06:30").isoformat(), at("08:30").isoformat(), "unreadable"]
    assert expired_commands(sent, at("07:00", day=1)) == 1
    assert expired_commands(sent, at("09:00", day=1)) == 3
    assert expired_commands(sent, at("09:00")) == 0


# ----- a slot sets more than a preset: the HVAC mode (#91) -----

S = Slot
OFF = {"hvac_mode": "off"}
AC_MODES = ("off", "heat", "cool", "fan_only")


def ac(state="cool", preset="comfort", temperature=20.0, modes=AC_MODES) -> Thermostat:
    """A reversible air conditioner."""
    return Thermostat(state, preset, temperature, VTHERM, 5.0, 30.0, 0.5, hvac_modes=modes)


def test_a_slot_holds_a_preset_and_optional_settings():
    day = [["00:00", "eco"], ["07:00", "comfort", {"fan_mode": "1"}], ["22:00", None, OFF]]
    assert Day.from_stored(day).slot_at("06:59") == (S("eco", {}), False)
    assert Day.from_stored(day).slot_at("07:00") == (S("comfort", {"fan_mode": "1"}), True)
    assert Day.from_stored(day).slot_at("23:00") == (S(None, OFF), False)


def test_the_next_slot_may_differ_by_its_settings_only():
    """Eco, then eco in cool: the cooling slot is a change."""
    cool = {"hvac_mode": "cool"}
    week = [[["00:00", "eco"], ["22:00", "eco", cool]]] * 7
    assert current_and_next(week, at("10:00")) == (S("eco", {}), S("eco", cool), at("22:00"))
    assert current_and_next(week, at("23:00")) == (S("eco", cool), S("eco", {}), at("00:00", day=1))


def test_the_preset_says_how_warm_and_the_slot_says_the_hvac_mode_the_fan_and_the_vanes():
    """The preset's default, then its value on the thermostat, then the slot's settings
    (docs/decisions.md, "Presets"). The slot's HVAC mode: test_hvac_mode.py and test_air_conditioners.py."""
    presets = {**PRESETS, "away": {"id": "away", "name": "Away", "color": "#000000", "temperature": 15.0}}
    mapping = {"comfort": {"cool_temperature": 25.0, "fan_mode": "1"}, "eco": {"temperature": 18.0}}
    # The preset's own default
    assert target_of("away", presets, {}, ac()) == {"temperature": 15.0}
    assert target_of("boost", presets, {}, ac()) == {"preset_mode": "boost", "cool_preset_mode": "boost"}
    # The preset's value on this thermostat adds to the default, or replaces its setpoint, when
    # heating and when cooling apart
    assert target_of("comfort", presets, mapping, ac()) == {"preset_mode": "comfort", "cool_temperature": 25.0, "fan_mode": "1"}
    assert target_of("eco", presets, mapping, ac()) == {"temperature": 18.0, "cool_preset_mode": "eco"}
    # The slot has the last word: the fan and the vanes. Off is off, and nothing else
    # (and heat, on an air conditioner: test_air_conditioners.py)
    assert target_of("comfort", presets, mapping, ac(), settings={"fan_mode": "3"}) == {
        "preset_mode": "comfort", "cool_temperature": 25.0, "fan_mode": "3", "hvac_mode": "heat"}
    assert target_of("away", presets, {}, ac(), settings=OFF) == OFF


def test_a_target_without_hvac_mode_means_on():
    """An "on" target is satisfied by any HVAC mode but off (docs/decisions.md, "Scheduling")."""
    assert Target({"preset_mode": "comfort"}).satisfied_by(ac("cool"))
    assert Target({"preset_mode": "comfort"}).satisfied_by(ac("heat"))
    assert not Target({"preset_mode": "comfort"}).satisfied_by(ac("off"))
    assert Target(OFF).satisfied_by(ac("off"))
    assert not Target({"preset_mode": "comfort", "hvac_mode": "cool"}).satisfied_by(ac("heat"))


def test_an_off_thermostat_is_turned_on_in_the_hvac_mode_of_its_slot_else_heat_else_its_first_mode():
    """Never a cooling AC switched to heat: a thermostat that is on keeps its HVAC mode."""
    target = {"preset_mode": "comfort", "cool_preset_mode": "comfort"}
    sent = {"preset_mode": "comfort"}
    assert Target(target).completed_for(ac("cool")) == sent
    assert Target(target).completed_for(ac("off")) == {"preset_mode": "comfort", "hvac_mode": "heat"}
    cooler = ("off", "fan_only", "dry", "cool")
    assert Target(target).completed_for(ac("off"), planned="cool") == {"preset_mode": "comfort", "hvac_mode": "cool"}
    assert Target(target).completed_for(ac("off", modes=cooler)) == {"preset_mode": "comfort", "hvac_mode": "cool"}  # never dry
    assert Target(target).completed_for(ac("off", modes=())) == sent  # no HVAC mode known: nothing to turn on with
    assert Target({**target, "hvac_mode": "cool"}).completed_for(ac("off")) == {"preset_mode": "comfort", "hvac_mode": "cool"}


def test_a_thermostat_turned_off_gets_its_slots_and_is_turned_on():
    """The schedule decides whether a thermostat is off (#91): a thermostat turned off is not
    left alone anymore, unlike one unavailable or unknown."""
    off = Thermostat("off", "eco", 17.0, VTHERM, 5.0, 30.0, 0.5, hvac_modes=("off", "heat"))
    plan = Plan(WEEKS, "normal", PRESETS, {}, {})
    assert due_targets(plan, at("10:00"), {"climate.bureau": off}, Forced("")) == [
        ("climate.bureau", {"preset_mode": "comfort", "hvac_mode": "heat"})]
    for state in ("unavailable", "unknown"):
        assert targets(at("10:00"), {"climate.bureau": heat("eco", state=state)}, force=True) == []


def test_an_off_slot_turns_the_thermostat_off_and_sends_nothing_else():
    """An off slot has no preset: off, alone (docs/decisions.md)."""
    week = [[["00:00", "comfort"], ["22:00", None, OFF]]] * 7
    plan = Plan({"climate.salon": {"normal": week}}, "normal", PRESETS, {}, {})
    assert due_targets(plan, at("22:00"), {"climate.salon": ac("heat")}, Tick(None)) == [("climate.salon", OFF)]
    assert due_targets(plan, at("22:00"), {"climate.salon": ac("off", "boost")}, Tick(None)) == []


def test_a_slot_with_settings_is_a_change_the_tick_applies():
    """A slot that only changes the settings of the slot before it is applied at its start."""
    week = [[["00:00", "eco"], ["22:00", "eco", {"fan_mode": "1"}]]] * 7
    plan = Plan({"climate.salon": {"normal": week}}, "normal", PRESETS, {}, {})
    assert due_targets(plan, at("22:00"), {"climate.salon": ac("heat", "eco")}, Tick(at("21:59"))) == [
        ("climate.salon", {"preset_mode": "eco", "fan_mode": "1", "hvac_mode": "heat"})]


def test_an_off_slot_is_a_next_slot_that_changes_the_target():
    """The end of a change by hand counts an off slot as a change (#83)."""
    weeks = {"climate.salon": {"normal": [[["00:00", "eco"], ["22:00", None, OFF]]] * 7}}
    assert next_change(weeks=weeks) == at("22:00")


def test_turning_a_thermostat_off_by_hand_during_an_on_slot_is_an_off_override():
    expected = {"preset_mode": "comfort"}
    assert classify(ac("heat"), ac("off"), by_user=True, expected=expected) == NewOverride(Target(OFF))
    assert classify(ac("heat"), ac("off"), by_user=False, expected=expected) == NewOverride(Target(OFF))  # its button
    assert classify(ac("heat"), ac("off"), by_user=True) == NewOverride(Target(OFF))  # no week: still a change


def test_turning_a_thermostat_on_by_hand_during_an_off_slot_is_an_override():
    expected = OFF
    assert classify(ac("off", "eco"), ac("heat", "eco"), by_user=True, expected=expected) == NewOverride(Target({"hvac_mode": "heat"}))
    assert classify(ac("off", "eco"), ac("cool", "eco"), by_user=False, expected=expected) == NewOverride(Target({"hvac_mode": "cool"}))


def test_turning_a_thermostat_back_on_on_its_slot_ends_its_off_override():
    """Back on in any HVAC mode the slot accepts, on the slot's setpoint: the schedule resumes.
    Back on another setpoint: the override takes the setpoint the thermostat shows."""
    expected = {"preset_mode": "comfort"}
    assert classify(ac("off", "comfort"), ac("heat", "comfort"), by_user=True, expected=expected, override=OFF) == Resume()
    assert classify(ac("off", "comfort"), ac("cool", "comfort"), by_user=False, expected=expected, override=OFF) == Resume()
    assert classify(ac("off", "eco"), ac("heat", "eco"), by_user=True, expected=expected, override=OFF) == NewOverride(Target({"preset_mode": "eco"}))
    # Turned off again while the slot says off: back to the slot too
    assert classify(ac("heat"), ac("off"), by_user=True, expected=OFF, override={"hvac_mode": "heat"}) == Resume()


def test_switching_the_hvac_mode_by_hand_is_an_override_when_the_slot_sets_one():
    expected = {"preset_mode": "comfort", "hvac_mode": "cool"}
    assert classify(ac("cool"), ac("heat"), by_user=True, expected=expected) == NewOverride(Target({"hvac_mode": "heat"}))
    assert classify(ac("heat"), ac("cool"), by_user=True, expected=expected, override={"hvac_mode": "heat"}) == Resume()
    # Without an HVAC mode on the slot, heat and cool are both "on": the thermostat does what
    # its slot asks, so the slot is applied again
    assert classify(ac("heat"), ac("cool"), by_user=True, expected={"preset_mode": "comfort"}) == Resume()


def test_a_setpoint_or_a_preset_changed_with_the_hvac_mode_is_part_of_the_override():
    """climate.set_temperature with an HVAC mode writes one state: the override holds both, by
    the rules of each gesture (a preset counts when a user picked it)."""
    heating = {"preset_mode": "comfort", "hvac_mode": "heat"}
    assert classify(ac("heat"), ac("cool", "none", 24.0), by_user=True, expected=heating) == NewOverride(Target({"hvac_mode": "cool", "temperature": 24.0}))
    # Turned off: off, alone, whatever came with it
    assert classify(ac("heat"), ac("off", "boost", 21.0), by_user=True, expected={"preset_mode": "comfort"}) == NewOverride(Target(OFF))
    assert classify(ac("heat"), ac("off", "boost", 21.0), by_user=False, expected={"preset_mode": "comfort"}) == NewOverride(Target(OFF))
    # Heat to cool during an "on" slot is no change of HVAC mode, and the setpoint still counts
    assert classify(ac("heat"), ac("cool", "none", 24.0), by_user=True, expected={"preset_mode": "comfort"}) == NewOverride(Target({"temperature": 24.0}))
    # Back on, on a setpoint other than the slot's: the override takes that setpoint
    assert classify(ac("off", "eco"), ac("heat", "none", 24.0), by_user=True, expected={"preset_mode": "comfort"}, override=OFF) == NewOverride(Target({"temperature": 24.0}))


def test_a_change_by_hand_is_added_to_the_override_in_force():
    """Each change by hand changes one point of the override, and keeps the others."""
    heating = {"preset_mode": "eco", "hvac_mode": "heat"}
    after_mode = classify(ac("heat", "eco"), ac("cool", "eco"), by_user=True, expected=heating).target
    assert after_mode == {"hvac_mode": "cool"}
    assert classify(ac("cool", "eco"), ac("cool", "none", 23.0), by_user=True, expected=heating, override=after_mode) == NewOverride(Target({"hvac_mode": "cool", "temperature": 23.0}))
    # A new setpoint replaces the one the override held
    assert classify(ac("cool", "none", 23.0), ac("cool", "boost"), by_user=True, expected=heating, override={"hvac_mode": "cool", "temperature": 23.0}) == NewOverride(Target({"hvac_mode": "cool", "preset_mode": "boost"}))
    # Off holds no setpoint
    assert classify(ac("cool", "none", 23.0), ac("off", "none", 23.0), by_user=True, expected=heating, override={"hvac_mode": "cool", "temperature": 23.0}) == NewOverride(Target(OFF))


def test_the_schedule_resumes_when_the_thermostat_does_what_its_slot_asks():
    """Back to the slot's HVAC mode and to its setpoint: the schedule resumes. A setpoint that
    is not the slot's keeps the override."""
    comfort = {"preset_mode": "comfort", "hvac_mode": "heat"}
    assert classify(ac("cool", "comfort"), ac("heat", "comfort"), by_user=True, expected=comfort, override={"hvac_mode": "cool"}) == Resume()
    assert classify(ac("cool", "none", 23.0), ac("heat", "none", 23.0), by_user=True, expected=comfort, override={"hvac_mode": "cool", "temperature": 23.0}, preset_temperature=20.0) == NewOverride(Target({"temperature": 23.0}))
    assert classify(ac("heat", "none", 23.0), ac("heat", "none", 20.0), by_user=True, expected=comfort, override={"temperature": 23.0}, preset_temperature=20.0) == Resume()


def test_a_setpoint_changed_during_a_slot_without_a_setpoint_is_not_an_override():
    """Off, fan only, dry and auto slots control the HVAC mode only."""
    for mode in ("off", "fan_only", "dry", "auto"):
        assert classify(ac(mode, "eco"), ac(mode, "boost"), by_user=True, expected={"hvac_mode": mode}) == NoChange()
        assert classify(ac(mode, "none", 20.0), ac(mode, "none", 23.0), by_user=True, expected={"hvac_mode": mode}) == NoChange()


def test_a_preset_picked_while_the_thermostat_is_off_is_not_an_override():
    """The thermostat stays off, and keeps the preset for when it is turned on."""
    expected = {"preset_mode": "comfort"}
    assert classify(ac("off", "eco"), ac("off", "boost"), by_user=True, expected=expected) == NoChange()
    assert classify(ac("off", "eco"), ac("off", "comfort"), by_user=True, expected=expected) == NoChange()


def test_settings_of_a_slot_are_validated():
    assert schema.day([["00:00", "eco", {"hvac_mode": "off"}], ["07:00", "comfort", {}]]).to_stored() == [
        ["00:00", None, OFF], ["07:00", "comfort"]]
    cool = {"hvac_mode": "cool"}
    day = [["00:00", "eco"], ["21:00", "eco", cool], ["22:00", "eco", cool], ["23:00", "comfort", cool]]
    assert schema.day(day).to_stored() == day
    assert schema.used_presets({"climate.salon": {"normal": [[["00:00", None, OFF], ["08:00", "eco", cool]]] * 7}}) == ["eco"]
    # A slot's HVAC mode is one of Home Assistant's
    for bad in (["00:00", "eco", "off"], ["00:00", "eco", {"hvac_mode": ""}], ["00:00", "eco", {"temperature": 19}],
                ["00:00", "eco", {"hvac_mode": "defrost"}]):
        with pytest.raises(InvalidData):
            schema.day([bad]).to_stored()
    # Heat and cool need a preset: a slot without one is dropped, as any invalid slot
    assert schema.day([["00:00", "eco"], ["12:00", None, cool], ["13:00", None]]).to_stored() == [["00:00", "eco"]]
    # An off slot has no preset
    assert schema.day([["00:00", "eco"], ["22:00", "eco", OFF], ["23:00", "comfort", OFF]]).to_stored() == [
        ["00:00", "eco"], ["22:00", None, OFF], ["23:00", None, OFF]]


def test_the_target_of_an_override_may_set_the_hvac_mode_alone():
    assert dict(schema.target({"hvac_mode": "off"})) == OFF
    assert dict(schema.target({"hvac_mode": "cool", "temperature": "24"})) == {"hvac_mode": "cool", "temperature": 24.0}


# ----- fan and vanes (lot 3 of #91) -----

def test_a_target_may_set_the_fan_and_the_vanes():
    assert dict(schema.target({"fan_mode": "3", "swing_mode": "swing", "swing_horizontal_mode": "split"})) == {
        "fan_mode": "3", "swing_mode": "swing", "swing_horizontal_mode": "split"}
    assert schema.day([["00:00", "eco", {"fan_mode": "1"}]]).to_stored() == [["00:00", "eco", {"fan_mode": "1"}]]
    with pytest.raises(InvalidData):
        dict(schema.target({"fan_mode": ""}))


def test_the_fan_and_the_vanes_are_satisfied_by_equal_values():
    quiet = Thermostat("cool", "comfort", 20.0, VTHERM, fan_mode="1", swing_mode="auto")
    assert Target({"fan_mode": "1"}).satisfied_by(quiet)
    assert not Target({"fan_mode": "3"}).satisfied_by(quiet)
    assert Target({"preset_mode": "comfort", "swing_mode": "auto"}).satisfied_by(quiet)
    assert not Target({"swing_horizontal_mode": "split"}).satisfied_by(quiet)  # not shown: not satisfied


# ----- a cooling setpoint in a preset's value (corrections C1) -----

def test_in_cool_the_cooling_setpoint_replaces_the_preset_and_its_temperature():
    both = {"preset_mode": "comfort", "temperature": 20.0, "cool_temperature": 25.0}
    assert Target(both).completed_for(ac("cool")) == {"temperature": 25.0}
    assert Target({"temperature": 20.0, "cool_temperature": 25.0, "hvac_mode": "cool"}).completed_for(ac("heat")) == {"temperature": 25.0, "hvac_mode": "cool"}
    # Not in cool: the cooling setpoint is not sent
    assert Target(both).completed_for(ac("heat")) == {"preset_mode": "comfort", "temperature": 20.0}
    assert Target(both).completed_for(ac("off")) == {"preset_mode": "comfort", "temperature": 20.0, "hvac_mode": "heat"}


def test_in_cool_without_a_cooling_setpoint_the_setpoint_is_left_alone():
    """Also on an air conditioner that only cools: it never gets a heating temperature."""
    assert Target({"preset_mode": "comfort", "temperature": 20.0}).completed_for(ac("cool")) == {}
    cooler = ac("cool", modes=("off", "cool", "fan_only"))
    assert Target({"temperature": 20.0}).completed_for(cooler) == {}


def test_a_temperature_the_user_chose_is_sent_in_cool():
    """An override without a Chauffage preset: the temperature is the user's cooling target, not
    a preset's heating value (docs/decisions.md, "Presets")."""
    assert Target({"temperature": 24.0}).completed_for(ac("cool"), by_user=True) == {"temperature": 24.0}
    assert Target({"temperature": 24.0, "hvac_mode": "cool"}).completed_for(ac("heat"), by_user=True) \
        == {"temperature": 24.0, "hvac_mode": "cool"}
    # A preset's value when heating is dropped. Its climate preset when cooling is sent
    assert Target({"temperature": 21.0}).completed_for(ac("cool")) == {}
    assert Target({"preset_mode": "eco"}).completed_for(ac("cool")) == {}
    assert Target({"temperature": 21.0, "cool_preset_mode": "eco"}).completed_for(ac("cool")) == {"preset_mode": "eco"}
    # A climate preset the user picked by hand is theirs in any HVAC mode
    assert Target({"preset_mode": "eco"}).completed_for(ac("cool"), by_user=True) == {"preset_mode": "eco"}


def test_the_cooling_setpoint_is_validated_and_fitted():
    assert dict(schema.target({"cool_temperature": "25"})) == {"cool_temperature": 25.0}
    assert Target({"cool_temperature": 25.3}).fitted_to(plain(step=0.5)) == {"cool_temperature": 25.5}
