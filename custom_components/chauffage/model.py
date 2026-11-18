"""Stored data of the integration, as plain JSON-compatible dictionaries (no HA import).
Vocabulary: docs/glossary.md.

    schedules:       [{"id": "normal", "name": "Normal"}, …]   renaming a schedule keeps its id
    active_schedule: "normal"
    presets:         [{"id": "comfort", "name": "Confort", "color": "#f57c00", "temperature": 20.0,
                       "cool_temperature": 25.0 (optional), "cool_color": "#0288d1" (optional)}, …]
                     "temperature" is the default when heating, for thermostats driven by
                     temperatures, and "cool_temperature" the default when cooling (#91). Either
                     can be empty ("temperature": None, no "cool_temperature"), not both: a
                     preset is only used in the HVAC modes it has a value for (engine.value_on).
                     "cool_color" is the color of the preset's cooling slots, when the user chose
                     one: without it, the card derives a cool shade from "color" (#91)
    thermostats:     {climate entity id: scheduled thermostat}, the thermostats Chauffage knows
                     (docs/decisions.md, "Scheduled thermostats"):
        paused:              True: kept, not controlled
        weeks:               {schedule id: [7 days, Monday first]}, one per schedule once it is
                             scheduled ({}: not scheduled); a day is a list of
                             [start "HH:MM", preset id] or [start, preset id, settings] slots,
                             the first one at "00:00"; two slots alike in a row stay two
                             slots. The settings are what the slot sets besides
                             its preset (#91): its HVAC mode ("hvac_mode"), and the fan and the
                             vanes of an air conditioner. The slot chooses the HVAC mode: "heat",
                             "cool" or "heat_cool" with a preset (the preset says how warm, for
                             that HVAC mode), "off", "fan_only", "dry" or "auto" without one
                             ([start, None, {"hvac_mode": "off"}]). An off slot sets nothing
                             else; the other slots without a preset may set the fan and the
                             vanes. A slot on a preset that says no HVAC mode (a week stored
                             before #91) is read as heat on an air conditioner that heats and
                             cools, as cool on one that only cools, and carries none on a
                             heater (engine.slot_hvac_mode)
        mapping:             {preset id: value}, what a preset means for this thermostat, only
                             what was set by hand: the rest is the preset's default
                             (engine.value_on). A value is
                             a partial state of the thermostat, as a scene holds it (#91). When
                             the thermostat heats: {"preset_mode": "comfort"} or
                             {"temperature": 20.5}, never both. When it cools: an optional
                             "cool_temperature". Then "fan_mode", "swing_mode" and
                             "swing_horizontal_mode". No "hvac_mode": the slot chooses it
        preset_temperatures: {climate preset: temperature} last seen on the thermostat, while it
                             did not cool
        cool_preset_temperatures: the same, last seen while it cooled (optional: none before
                             it cooled on one of its presets)
        own_settings:        {"fan_mode": "auto", …}: the fan and the vanes the thermostat had
                             before a slot or an override chose others, to give back by the next
                             one that chooses none (optional: none to give back)
        hvac_mode:           the HVAC mode the thermostat last heated or cooled in (None: not
                             seen on yet): what an off thermostat without heat is turned on in
        revision:            increases on every change of its weeks: a card saves against it, so
                             that two cards cannot overwrite each other's changes
    renamed:         {former climate entity id: current one}: a thermostat renamed in Home
                     Assistant, for the cards whose configuration still holds the former id
    overrides:       {climate entity id: {"target": {"temperature": 21.5} | {"preset_mode": "boost"}
                                                    | {"hvac_mode": "off"} (alone: an off
                                                    override sets nothing else) | …,
                                          "preset": "comfort" (optional), "start": ISO datetime,
                                          "end": ISO datetime,
                                          "ends_at": "duration" | "next_slot" |
                                                     "no_next_slot" (optional)}}: the target
                     is what the thermostat is set to; "preset", the Chauffage preset picked
                     (card, service), which the target means on this thermostat (none for a change
                     by hand); "ends_at", why a change by hand ends then: after the override
                     duration, at the next slot, or a week later as no slot changes its target
                     (none once its end is chosen on the card, nor before #83: an optional key,
                     no migration)
    pending:         {climate entity id: [{"target": {"temperature": 20.0} | {"preset_mode": "comfort"},
                                           "sent": ISO datetime}, …]}: commands sent that the
                     thermostat does not show yet, oldest first (a battery valve applies them
                     late); dropped once shown, or after a day
    revision:        increases on every change of the schedules or weeks; the card saves against
                     a revision so that two editors cannot overwrite each other
    rules:           [{"template": "{{ … }}", "schedule": "away" | None}, …]   activation rules, in
                     order: the first that applies gives the schedule; with a schedule, the rule
                     applies while its template is true; without (None), its template gives the
                     schedule (an id or a name) and the rule applies when it names one
    default_schedule: "normal" | None   the schedule when no rule is true (None: no change)
    rules_choice:    the schedule the rules chose last (None: none); a schedule chosen by hand
                     stays until this changes
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from . import const
from .const import (
    DEFAULT_PRESET_COLOR,
    DEFAULT_PRESET_TEMPERATURE,
    DEFAULT_PRESETS,
    DURATION,
    NEXT_SLOT,
    NO_NEXT_SLOT,
    NO_PRESET_MODES,
    OFF,
    PRESET_NAMES,
    SLOT_HVAC_MODES,
)

OVERRIDE_ENDS = (DURATION, NEXT_SLOT, NO_NEXT_SLOT)  # why a change by hand ends then

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DEFAULT_DAY = [["00:00", "eco"]]


class InvalidData(ValueError):
    """Data that does not follow the format above."""


def slug(name: str) -> str:
    """Id from a name: "Vacances d'été" → "vacances_d_ete"."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_") or "schedule"


def unique_id(name: str, taken: set[str]) -> str:
    """An id from a name, not in `taken`: "Away" → "away", or "away_2" if taken."""
    base = new_id = slug(name)
    n = 2
    while new_id in taken:
        new_id = f"{base}_{n}"
        n += 1
    return new_id


def make_schedules(names: list[str]) -> list[dict[str, str]]:
    """Schedules with unique ids, in the given order (duplicate names are dropped)."""
    schedules: list[dict[str, str]] = []
    for name in names:
        name = str(name).strip()
        if not name or any(s["name"] == name for s in schedules):
            continue
        schedules.append({"id": unique_id(name, {s["id"] for s in schedules}), "name": name})
    return schedules


def plan_schedules(items: Any, current: list[dict[str, str]], active: str) -> tuple[list[dict[str, str]], dict[str, str | None]]:
    """The new ordered list of schedules from the card's list: `{"id"}` keeps a schedule (with
    `"name"`: renamed), `{"name", "copy_of"?}` creates one, a missing id deletes one. Returns the
    list and the created ids with what they copy (None: empty)."""
    if not isinstance(items, list) or not items:
        raise InvalidData("at least one schedule is needed")
    names = {s["id"]: s["name"] for s in current}
    taken = set(names)
    schedules: list[dict[str, str]] = []
    created: dict[str, str | None] = {}
    for item in items:
        if not isinstance(item, dict):
            raise InvalidData(f"invalid schedule: {item!r}")
        schedule_id = item.get("id")
        if schedule_id is not None and (schedule_id not in names or any(s["id"] == schedule_id for s in schedules)):
            raise InvalidData(f"unknown or repeated schedule: {schedule_id}")
        name = item.get("name", names.get(schedule_id))
        if not isinstance(name, str) or not name.strip():
            raise InvalidData("a schedule needs a name")
        name = name.strip()
        if any(s["name"].casefold() == name.casefold() for s in schedules):
            raise InvalidData(f"two schedules named {name}")
        if schedule_id is None:
            source = item.get("copy_of")
            if source is not None and source not in names:
                raise InvalidData(f"unknown schedule to copy: {source}")
            schedule_id = unique_id(name, taken)
            taken.add(schedule_id)
            created[schedule_id] = source
        schedules.append({"id": schedule_id, "name": name})
    if active not in {s["id"] for s in schedules}:
        raise InvalidData("the active schedule cannot be deleted")
    return schedules, created


COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def default_presets(language: str, extra: list[str] | None = None) -> list[dict[str, Any]]:
    """The four default presets named in `language`, then `extra` preset ids (found in existing
    weeks, kept so that nothing changes for those thermostats)."""
    names = PRESET_NAMES.get((language or "en").split("-")[0], PRESET_NAMES["en"])
    presets = [{"id": i, "name": names[i], "color": c, "temperature": t} | ({} if cool is None else {"cool_temperature": cool})
               for i, c, t, cool in DEFAULT_PRESETS]
    for preset_id in extra or []:
        if not any(preset["id"] == preset_id for preset in presets):
            presets.append({"id": preset_id, "name": preset_id, "color": DEFAULT_PRESET_COLOR,
                            "temperature": DEFAULT_PRESET_TEMPERATURE})
    return presets


def used_presets(weeks: dict[str, Any]) -> list[str]:
    """Preset ids used in the weeks, in order of appearance (an off or a fan-only slot has none)."""
    seen: list[str] = []
    for by_schedule in weeks.values():
        for week in by_schedule.values():
            for day in week:
                for slot in day:
                    if slot[1] is not None and slot[1] not in seen:
                        seen.append(slot[1])
    return seen


def new_thermostat(weeks: dict[str, Any] | None = None, mapping: dict[str, Any] | None = None,
                   preset_temperatures: dict[str, float] | None = None) -> dict[str, Any]:
    """A scheduled thermostat, active."""
    return {"paused": False, "weeks": weeks or {}, "mapping": mapping or {},
            "preset_temperatures": preset_temperatures or {}, "hvac_mode": None, "revision": 0}


def empty_week(preset_ids: list[str]) -> list[list[list[str]]]:
    """The week of a new schedule: eco all week (or the first preset, without eco)."""
    fill = "eco" if "eco" in preset_ids else preset_ids[0]
    return [[["00:00", fill]] for _ in range(7)]


def complete_weeks(weeks: dict[str, Any], schedule_ids: list[str], preset_ids: list[str]) -> dict[str, Any]:
    """A scheduled thermostat's weeks, one per schedule: a schedule it has none in gets the week of
    a new schedule (docs/decisions.md, "Scheduled thermostats")."""
    return {schedule_id: weeks[schedule_id] if schedule_id in weeks else empty_week(preset_ids)
            for schedule_id in schedule_ids}


def default_data(schedule_names: list[str], language: str = "en") -> dict[str, Any]:
    schedules = make_schedules(schedule_names)
    return {"schedules": schedules, "active_schedule": schedules[0]["id"], "presets": default_presets(language),
            "thermostats": {}, "renamed": {}, "overrides": {}, "pending": {}, "revision": 0,
            "rules": [], "default_schedule": None, "rules_choice": None}


def normalize_rules(rules: Any, default: Any, schedule_ids: set[str]) -> list[dict[str, Any]]:
    """Validated activation rules (the templates themselves are checked by the runtime, with HA)."""
    if not isinstance(rules, list):
        raise InvalidData("rules must be a list")
    out: list[dict[str, Any]] = []
    for rule in rules:
        if not isinstance(rule, dict):
            raise InvalidData(f"invalid rule: {rule!r}")
        template, schedule = rule.get("template"), rule.get("schedule")
        if not isinstance(template, str) or not template.strip():
            raise InvalidData("a rule needs a template")
        if schedule is not None and schedule not in schedule_ids:
            raise InvalidData(f"unknown schedule: {schedule}")
        out.append({"template": template.strip(), "schedule": schedule})
    if default is not None and default not in schedule_ids:
        raise InvalidData(f"unknown schedule: {default}")
    return out


def schedule_named(text: str, schedules: list[dict[str, str]]) -> str | None:
    """The schedule a template gives: its id, else its name (any case); None if none matches."""
    text = text.strip()
    if any(s["id"] == text for s in schedules):
        return text
    return next((s["id"] for s in schedules if s["name"].casefold() == text.casefold()), None)


def rules_outcome(rules: list[dict[str, Any]], results: list[Any], default: str | None) -> str | None:
    """The schedule of the first rule that applies (true, or a schedule given by its template),
    else the default one (a failed template does not apply); None without rules."""
    if not rules:
        return None
    return next((rule["schedule"] or result for rule, result in zip(rules, results) if result), default)


def normalize_preset(preset: Any, taken_ids: set[str]) -> dict[str, Any]:
    """Validated preset; a new preset (no id) gets a unique id from its name."""
    if not isinstance(preset, dict):
        raise InvalidData("a preset must be a dictionary")
    name = str(preset.get("name", "")).strip()
    if not name:
        raise InvalidData("a preset needs a name")
    color = str(preset.get("color", DEFAULT_PRESET_COLOR))
    if not COLOR.match(color):
        raise InvalidData(f"invalid color: {color}")
    # Its default temperature when heating and when cooling: either can be empty, not both (#91)
    try:
        temperature = preset.get("temperature", DEFAULT_PRESET_TEMPERATURE)
        temperature = None if temperature is None else float(temperature)
        cool_temperature = None if preset.get("cool_temperature") is None else float(preset["cool_temperature"])
    except (TypeError, ValueError) as err:
        raise InvalidData("invalid temperature") from err
    if temperature is None and cool_temperature is None:
        raise InvalidData("a preset needs a temperature when heating or when cooling")
    preset_id = preset.get("id") or unique_id(name, taken_ids)
    out = {"id": str(preset_id), "name": name, "color": color.lower(), "temperature": temperature}
    if cool_temperature is not None:
        out["cool_temperature"] = cool_temperature
    # The color of its cooling slots, when the user chose one (else the card derives it, #91)
    cool_color = preset.get("cool_color")
    if cool_color is not None:
        if not COLOR.match(str(cool_color)):
            raise InvalidData(f"invalid color: {cool_color}")
        out["cool_color"] = str(cool_color).lower()
    return out


# The fan and the vanes of an air conditioner (#91)
AIR_KEYS = dict.fromkeys(const.AIR_KEYS, str)
# The attributes a slot's settings may set: everything but the setpoint, which its preset gives
# (its HVAC mode, then the fan and the vanes of an air conditioner, #91)
SETTING_KEYS = {"hvac_mode": str, **AIR_KEYS}
# The climate attributes a preset's value on a thermostat may set, and how their values are
# read. "preset_mode" or "temperature" is its value when the thermostat heats.
# "cool_temperature" is its setpoint when the thermostat cools: sent as the temperature in cool,
# see engine.complete
VALUE_KEYS = {"preset_mode": str, "temperature": float, "cool_temperature": float, **AIR_KEYS}
# The climate attributes the target of an override or of a command may set: an override also
# sets the HVAC mode (a thermostat turned off by hand, chauffage.set_override), and holds what
# its preset means in each HVAC mode (engine.value_on): its climate preset when cooling, its
# range in heat/cool
TARGET_KEYS = {**VALUE_KEYS, "cool_preset_mode": str, "target_temp_low": float, "target_temp_high": float,
               "hvac_mode": str}


def _normalize_attributes(attributes: Any, keys: dict[str, type], what: str) -> dict[str, Any]:
    if not isinstance(attributes, dict):
        raise InvalidData(f"{what} must be a dictionary")
    unknown = set(attributes) - set(keys)
    if unknown:
        raise InvalidData(f"unknown attributes in {what}: {sorted(unknown)}")
    out: dict[str, Any] = {}
    for key, read in keys.items():
        if key not in attributes:
            continue
        try:
            value = read(attributes[key])
        except (TypeError, ValueError) as err:
            raise InvalidData(f"invalid {key}") from err
        if read is str and not value:
            raise InvalidData(f"invalid {key}")
        out[key] = value
    return out


def normalize_target(target: Any) -> dict[str, Any]:
    """A validated target of an override or a command: a partial state of the thermostat with at
    least one known attribute (TARGET_KEYS). No rule between the attributes: a change by hand
    may write a preset and a temperature at once, and the thermostat decides what to do with
    both (docs/decisions.md, "Presets")."""
    out = _normalize_attributes(target, TARGET_KEYS, "a target")
    if not out:
        raise InvalidData("a target needs a climate preset, a temperature or an HVAC mode")
    return out


def normalize_settings(settings: Any) -> dict[str, Any]:
    """A slot's validated settings (SETTING_KEYS), possibly empty. Its HVAC mode is one of
    SLOT_HVAC_MODES. An off slot sets nothing else: the fan and the vanes mean nothing while the
    thermostat is off."""
    out = _normalize_attributes(settings, SETTING_KEYS, "the settings of a slot")
    mode = out.get("hvac_mode")
    if mode is not None and mode not in SLOT_HVAC_MODES:
        raise InvalidData(f"a slot's HVAC mode is one of {', '.join(SLOT_HVAC_MODES)}: {mode!r}")
    return {"hvac_mode": OFF} if mode == OFF else out


def normalize_value(value: Any) -> dict[str, Any]:
    """A validated value of a preset on a thermostat (VALUE_KEYS): one of its climate presets or
    a temperature, not both (when it heats), with an optional cooling setpoint (when it cools),
    fan and vanes. No HVAC mode: the slot chooses it."""
    out = _normalize_attributes(value, VALUE_KEYS, "the value of a preset")
    if not out:
        raise InvalidData("the value of a preset needs a climate preset or a temperature")
    if "preset_mode" in out and "temperature" in out:
        raise InvalidData("the value of a preset is a climate preset or a temperature, not both")
    return out


def normalize_mapping(mapping: Any, preset_ids: set[str]) -> dict[str, dict[str, Any]]:
    """{preset id: value} set by hand for one thermostat."""
    if not isinstance(mapping, dict):
        raise InvalidData("a mapping must be a dictionary")
    out: dict[str, dict[str, Any]] = {}
    for preset_id, value in mapping.items():
        if preset_id not in preset_ids:
            raise InvalidData(f"unknown preset: {preset_id}")
        try:
            out[preset_id] = normalize_value(value)
        except InvalidData as err:
            raise InvalidData(f"{preset_id}: {err}") from err
    return out


def normalize_day(slots: Any) -> list[list[Any]]:
    """Sorted slots, first one at 00:00, one slot per start time (same rules as the card). Two
    slots in a row that are the same stay two slots: the user cut them, and the second one
    changes nothing on the thermostat (engine.targets). A slot is [start, preset] or
    [start, preset, settings] (#91); empty settings are left out. An off, a fan-only, a dry and
    an auto slot have no preset (None). Invalid slots are dropped, invalid settings refused; an
    empty day is eco all day."""
    if not isinstance(slots, list):
        return [list(s) for s in DEFAULT_DAY]
    by_start: dict[str, tuple[str | None, dict[str, Any]]] = {}
    for slot in slots:
        if isinstance(slot, str):  # package format: "HH:MM preset"
            slot = slot.split()
        if not isinstance(slot, (list, tuple)) or len(slot) not in (2, 3):
            continue
        start = str(slot[0])
        settings = normalize_settings(slot[2]) if len(slot) == 3 else {}
        if settings.get("hvac_mode") in NO_PRESET_MODES:
            preset = None  # the user does not choose one: nothing to send
        else:
            preset = str(slot[1]).strip() if slot[1] is not None else ""
            if not preset:
                continue
        if len(start) == 4:  # "6:30"
            start = "0" + start
        if HHMM.match(start):
            by_start[start] = (preset, settings)  # the last one wins
    day: list[list[Any]] = []
    for start in sorted(by_start):
        preset, settings = by_start[start]
        day.append([start, preset, settings] if settings else [start, preset])
    if not day:
        return [list(s) for s in DEFAULT_DAY]
    day[0][0] = "00:00"
    return day


def normalize_week(week: Any) -> list[list[list[str]]]:
    if not isinstance(week, list) or len(week) != 7:
        raise InvalidData("a week must have 7 days")
    return [normalize_day(day) for day in week]


def normalize_weeks(weeks: Any, schedule_ids: set[str], preset_ids: set[str] | None = None) -> dict[str, dict[str, Any]]:
    """Validated copy of the weeks sent by the card or an import."""
    if not isinstance(weeks, dict):
        raise InvalidData("weeks must be a dictionary")
    out: dict[str, dict[str, Any]] = {}
    for entity_id, by_schedule in weeks.items():
        if not isinstance(entity_id, str) or not entity_id.startswith("climate."):
            raise InvalidData(f"not a climate entity: {entity_id}")
        if not isinstance(by_schedule, dict):
            raise InvalidData(f"{entity_id}: the weeks by schedule must be a dictionary")
        unknown = set(by_schedule) - schedule_ids
        if unknown:
            raise InvalidData(f"{entity_id}: unknown schedules {sorted(unknown)}")
        out[entity_id] = {schedule: normalize_week(week) for schedule, week in by_schedule.items()}
    if preset_ids is not None:
        unknown_presets = set(used_presets(out)) - preset_ids
        if unknown_presets:
            raise InvalidData(f"unknown presets {sorted(unknown_presets)}")
    return out


def normalize_override(override: Any) -> dict[str, Any]:
    if not isinstance(override, dict):
        raise InvalidData("an override must be a dictionary")
    # An override sets no fan and no vanes: they stay as the thermostat has them (an override
    # that holds only what was changed would carry them, docs/decisions.md)
    target = {key: value for key, value in normalize_target(override.get("target")).items() if key not in AIR_KEYS}
    if target.get("hvac_mode") == OFF:
        target = {"hvac_mode": OFF}  # an off override sets nothing else: no setpoint is sent
    start, end = override.get("start"), override.get("end")
    if not isinstance(start, str) or not isinstance(end, str):
        raise InvalidData("start and end must be ISO datetimes")
    out = {"target": target, "start": start, "end": end}
    preset = override.get("preset")
    if isinstance(preset, str) and preset:
        out["preset"] = preset
    if override.get("ends_at") in OVERRIDE_ENDS:
        out["ends_at"] = override["ends_at"]
    # An off override made by hand during another override keeps it, to give it back when the
    # thermostat is turned back on (runtime._given_back); one level only
    before_off = override.get("before_off")
    if isinstance(before_off, dict) and "before_off" not in before_off:
        out["before_off"] = normalize_override(before_off)
    return out
