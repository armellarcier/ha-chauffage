"""Stored data of the integration, as plain JSON-compatible dictionaries (no HA import).
Vocabulary: docs/glossary.md.

    schedules:       [{"id": "normal", "name": "Normal"}, …]   renaming a schedule keeps its id
    active_schedule: "normal"
    presets:         [{"id": "comfort", "name": "Confort", "color": "#f57c00", "temperature": 20.0}, …]
                     "temperature" is the default for thermostats driven by temperatures
    thermostats:     {climate entity id: scheduled thermostat}, the thermostats Chauffage knows
                     (docs/decisions.md, "Scheduled thermostats"):
        paused:              True: kept, not driven
        weeks:               {schedule id: [7 days, Monday first]}; a day is a list of
                             [start "HH:MM", preset id] slots, the first one at "00:00"
        mapping:             {preset id: {"preset": "comfort"} | {"temperature": 20.5}}, what a
                             preset means for this thermostat, only what was set by hand: the
                             rest is engine.default_target
        preset_temperatures: {climate preset: temperature} last seen on the thermostat
        revision:            increases on every change of its weeks: a card saves against it, so
                             that two cards cannot overwrite each other's changes
        shown_at:            ISO datetime a card last showed it (None: not yet)
        kept_unlisted:       True: driven although no card shows it (answered in its repair),
                             until a card shows it again
    cards:           {card id: {"thermostats": [climate entity id, …], "seen_at": ISO datetime,
                                "instance": id of the card as drawn, "duplicated_at"?: ISO datetime}},
                     what each card showed when it was last displayed (its id is written in its
                     configuration by the card editor; two cards sharing it: duplicated)
    renamed:         {former climate entity id: current one}: a thermostat renamed in Home
                     Assistant, for the cards whose configuration still holds the former id
    overrides:       {climate entity id: {"kind": "temperature" | "preset", "value": 21.5 | "boost",
                                          "start": ISO datetime, "end": ISO datetime}}
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

from .const import DEFAULT_PRESET_COLOR, DEFAULT_PRESET_TEMPERATURE, DEFAULT_PRESETS, PRESET_NAMES

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
    `"name"`: renamed), `{"name", "copy_of"?}` creates one, a missing id deletes one. Returns
    the list and the created ids with what they copy (None: empty)."""
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
    presets = [{"id": i, "name": names[i], "color": c, "temperature": t} for i, c, t in DEFAULT_PRESETS]
    for preset_id in extra or []:
        if not any(preset["id"] == preset_id for preset in presets):
            presets.append({"id": preset_id, "name": preset_id, "color": DEFAULT_PRESET_COLOR,
                            "temperature": DEFAULT_PRESET_TEMPERATURE})
    return presets


def used_presets(weeks: dict[str, Any]) -> list[str]:
    """Preset ids used in the weeks, in order of appearance."""
    seen: list[str] = []
    for by_schedule in weeks.values():
        for week in by_schedule.values():
            for day in week:
                for _, preset in day:
                    if preset not in seen:
                        seen.append(preset)
    return seen


def new_thermostat(weeks: dict[str, Any] | None = None, mapping: dict[str, Any] | None = None,
                   preset_temperatures: dict[str, float] | None = None) -> dict[str, Any]:
    """A scheduled thermostat, active."""
    return {"paused": False, "weeks": weeks or {}, "mapping": mapping or {},
            "preset_temperatures": preset_temperatures or {}, "revision": 0, "shown_at": None,
            "kept_unlisted": False}


def default_data(schedule_names: list[str], language: str = "en") -> dict[str, Any]:
    schedules = make_schedules(schedule_names)
    return {"schedules": schedules, "active_schedule": schedules[0]["id"], "presets": default_presets(language),
            "thermostats": {}, "cards": {}, "renamed": {}, "overrides": {}, "revision": 0,
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
    try:
        temperature = float(preset.get("temperature", DEFAULT_PRESET_TEMPERATURE))
    except (TypeError, ValueError) as err:
        raise InvalidData("invalid temperature") from err
    preset_id = preset.get("id") or unique_id(name, taken_ids)
    return {"id": str(preset_id), "name": name, "color": color.lower(), "temperature": temperature}


def normalize_mapping(mapping: Any, preset_ids: set[str]) -> dict[str, dict[str, Any]]:
    """{preset id: {"preset": climate preset} | {"temperature": …}} set by hand for one thermostat."""
    if not isinstance(mapping, dict):
        raise InvalidData("a mapping must be a dictionary")
    out: dict[str, dict[str, Any]] = {}
    for preset_id, target in mapping.items():
        if preset_id not in preset_ids:
            raise InvalidData(f"unknown preset: {preset_id}")
        if isinstance(target, dict) and isinstance(target.get("preset"), str) and target["preset"]:
            out[preset_id] = {"preset": target["preset"]}
        elif isinstance(target, dict) and "temperature" in target:
            try:
                out[preset_id] = {"temperature": float(target["temperature"])}
            except (TypeError, ValueError) as err:
                raise InvalidData("invalid temperature") from err
        else:
            raise InvalidData(f"{preset_id}: a climate preset or a temperature is needed")
    return out


def normalize_day(slots: Any) -> list[list[str]]:
    """Sorted slots, first one at 00:00, duplicates and consecutive identical presets merged
    (same rules as the card). Invalid slots are dropped; an empty day is eco all day."""
    if not isinstance(slots, list):
        return [list(s) for s in DEFAULT_DAY]
    by_start: dict[str, str] = {}
    for slot in slots:
        if isinstance(slot, str):  # package format: "HH:MM preset"
            slot = slot.split()
        if not isinstance(slot, (list, tuple)) or len(slot) != 2:
            continue
        start, preset = str(slot[0]), str(slot[1]).strip()
        if len(start) == 4:  # "6:30"
            start = "0" + start
        if HHMM.match(start) and preset:
            by_start[start] = preset  # the last one wins
    day: list[list[str]] = []
    for start in sorted(by_start):
        if not day or day[-1][1] != by_start[start]:
            day.append([start, by_start[start]])
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
    kind = override.get("kind")
    if kind not in ("temperature", "preset"):
        raise InvalidData("kind must be temperature or preset")
    value = override.get("value")
    try:
        value = float(value) if kind == "temperature" else str(value)
    except (TypeError, ValueError) as err:
        raise InvalidData("invalid override value") from err
    start, end = override.get("start"), override.get("end")
    if not isinstance(start, str) or not isinstance(end, str):
        raise InvalidData("start and end must be ISO datetimes")
    return {"kind": kind, "value": value, "start": start, "end": end}
