"""Stored data of the integration, as plain JSON-compatible dictionaries (no HA import).

    modes:       [{"id": "normal", "name": "Normal"}, …]      renaming a mode keeps its id
    active_mode: "normal"
    levels:      [{"id": "comfort", "name": "Confort", "color": "#f57c00", "temperature": 20.0}, …]
                 heating levels; "temperature" is the default for thermostats mapped to temperatures
    mappings:    {climate entity id: {level id: {"preset": "comfort"} | {"temperature": 20.5}}}
                 only what was set by hand: the rest is engine.default_target
    schedules:   {climate entity id: {mode id: [7 days, Monday first]}}
                 a day is a list of [start "HH:MM", level id] slots, the first one at "00:00"
    overrides:   {climate entity id: {"kind": "temperature" | "preset", "value": 21.5 | "boost",
                                      "start": ISO datetime, "end": ISO datetime}}
    revision:    increases on every schedule change; the card saves against a revision so
                 that two editors cannot overwrite each other
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from .const import DEFAULT_LEVEL_COLOR, DEFAULT_LEVEL_TEMPERATURE, DEFAULT_LEVELS, LEVEL_NAMES

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DEFAULT_DAY = [["00:00", "eco"]]


class InvalidData(ValueError):
    """Data that does not follow the format above."""


def slug(name: str) -> str:
    """Mode id from a mode name: "Vacances d'été" → "vacances_d_ete"."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_") or "mode"


def unique_id(name: str, taken: set[str]) -> str:
    """An id from a name, not in `taken`: "Away" → "away", or "away_2" if taken."""
    base = new_id = slug(name)
    n = 2
    while new_id in taken:
        new_id = f"{base}_{n}"
        n += 1
    return new_id


def make_modes(names: list[str]) -> list[dict[str, str]]:
    """Modes with unique ids, in the given order (duplicate names are dropped)."""
    modes: list[dict[str, str]] = []
    for name in names:
        name = str(name).strip()
        if not name or any(m["name"] == name for m in modes):
            continue
        modes.append({"id": unique_id(name, {m["id"] for m in modes}), "name": name})
    return modes


def plan_modes(items: Any, current: list[dict[str, str]], active: str) -> tuple[list[dict[str, str]], dict[str, str | None]]:
    """The new ordered list of schedules ("modes") from the card's list: `{"id"}` keeps a
    schedule (with `"name"`: renamed), `{"name", "copy_of"?}` creates one, a missing id deletes
    one. Returns the list and the created ids with what they copy (None: empty)."""
    if not isinstance(items, list) or not items:
        raise InvalidData("at least one schedule is needed")
    names = {m["id"]: m["name"] for m in current}
    taken = set(names)
    modes: list[dict[str, str]] = []
    created: dict[str, str | None] = {}
    for item in items:
        if not isinstance(item, dict):
            raise InvalidData(f"invalid schedule: {item!r}")
        mode_id = item.get("id")
        if mode_id is not None and (mode_id not in names or any(m["id"] == mode_id for m in modes)):
            raise InvalidData(f"unknown or repeated schedule: {mode_id}")
        name = item.get("name", names.get(mode_id))
        if not isinstance(name, str) or not name.strip():
            raise InvalidData("a schedule needs a name")
        name = name.strip()
        if any(m["name"].casefold() == name.casefold() for m in modes):
            raise InvalidData(f"two schedules named {name}")
        if mode_id is None:
            source = item.get("copy_of")
            if source is not None and source not in names:
                raise InvalidData(f"unknown schedule to copy: {source}")
            mode_id = unique_id(name, taken)
            taken.add(mode_id)
            created[mode_id] = source
        modes.append({"id": mode_id, "name": name})
    if active not in {m["id"] for m in modes}:
        raise InvalidData("the active schedule cannot be deleted")
    return modes, created


COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def default_levels(language: str, extra: list[str] | None = None) -> list[dict[str, Any]]:
    """The four default levels named in `language`, then `extra` level ids (presets found in
    existing schedules, kept so that nothing changes for those thermostats)."""
    names = LEVEL_NAMES.get((language or "en").split("-")[0], LEVEL_NAMES["en"])
    levels = [{"id": i, "name": names[i], "color": c, "temperature": t} for i, c, t in DEFAULT_LEVELS]
    for level_id in extra or []:
        if not any(level["id"] == level_id for level in levels):
            levels.append({"id": level_id, "name": level_id, "color": DEFAULT_LEVEL_COLOR,
                           "temperature": DEFAULT_LEVEL_TEMPERATURE})
    return levels


def used_levels(schedules: dict[str, Any]) -> list[str]:
    """Level ids used in schedules, in order of appearance."""
    seen: list[str] = []
    for modes in schedules.values():
        for week in modes.values():
            for day in week:
                for _, level in day:
                    if level not in seen:
                        seen.append(level)
    return seen


def default_data(mode_names: list[str], language: str = "en") -> dict[str, Any]:
    modes = make_modes(mode_names)
    return {"modes": modes, "active_mode": modes[0]["id"], "levels": default_levels(language),
            "mappings": {}, "schedules": {}, "overrides": {}, "revision": 0}


def normalize_level(level: Any, taken_ids: set[str]) -> dict[str, Any]:
    """Validated level; a new level (no id) gets a unique id from its name."""
    if not isinstance(level, dict):
        raise InvalidData("a level must be a dictionary")
    name = str(level.get("name", "")).strip()
    if not name:
        raise InvalidData("a level needs a name")
    color = str(level.get("color", DEFAULT_LEVEL_COLOR))
    if not COLOR.match(color):
        raise InvalidData(f"invalid color: {color}")
    try:
        temperature = float(level.get("temperature", DEFAULT_LEVEL_TEMPERATURE))
    except (TypeError, ValueError) as err:
        raise InvalidData("invalid temperature") from err
    level_id = level.get("id")
    if not level_id:
        base = level_id = slug(name)
        n = 2
        while level_id in taken_ids:
            level_id = f"{base}_{n}"
            n += 1
    return {"id": str(level_id), "name": name, "color": color.lower(), "temperature": temperature}


def normalize_mapping(mapping: Any, level_ids: set[str]) -> dict[str, dict[str, Any]]:
    """{level id: {"preset": …} | {"temperature": …}} set by hand for one thermostat."""
    if not isinstance(mapping, dict):
        raise InvalidData("a mapping must be a dictionary")
    out: dict[str, dict[str, Any]] = {}
    for level_id, target in mapping.items():
        if level_id not in level_ids:
            raise InvalidData(f"unknown level: {level_id}")
        if isinstance(target, dict) and isinstance(target.get("preset"), str) and target["preset"]:
            out[level_id] = {"preset": target["preset"]}
        elif isinstance(target, dict) and "temperature" in target:
            try:
                out[level_id] = {"temperature": float(target["temperature"])}
            except (TypeError, ValueError) as err:
                raise InvalidData("invalid temperature") from err
        else:
            raise InvalidData(f"{level_id}: a preset or a temperature is needed")
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


def normalize_schedules(schedules: Any, mode_ids: set[str], level_ids: set[str] | None = None) -> dict[str, dict[str, Any]]:
    """Validated copy of schedules sent by the card or an import."""
    if not isinstance(schedules, dict):
        raise InvalidData("schedules must be a dictionary")
    out: dict[str, dict[str, Any]] = {}
    for entity_id, modes in schedules.items():
        if not isinstance(entity_id, str) or not entity_id.startswith("climate."):
            raise InvalidData(f"not a climate entity: {entity_id}")
        if not isinstance(modes, dict):
            raise InvalidData(f"{entity_id}: modes must be a dictionary")
        unknown = set(modes) - mode_ids
        if unknown:
            raise InvalidData(f"{entity_id}: unknown modes {sorted(unknown)}")
        out[entity_id] = {mode: normalize_week(week) for mode, week in modes.items()}
    if level_ids is not None:
        unknown_levels = set(used_levels(out)) - level_ids
        if unknown_levels:
            raise InvalidData(f"unknown levels {sorted(unknown_levels)}")
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
