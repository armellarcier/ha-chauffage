"""Stored data of the integration, as plain JSON-compatible dictionaries (no HA import).

    modes:       [{"id": "normal", "name": "Normal"}, …]      renaming a mode keeps its id
    active_mode: "normal"
    schedules:   {climate entity id: {mode id: [7 days, Monday first]}}
                 a day is a list of [start "HH:MM", preset] slots, the first one at "00:00"
    overrides:   {climate entity id: {"kind": "temperature" | "preset", "value": 21.5 | "boost",
                                      "start": ISO datetime, "end": ISO datetime}}
    revision:    increases on every schedule change; the card saves against a revision so
                 that two editors cannot overwrite each other
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DEFAULT_DAY = [["00:00", "eco"]]


class InvalidData(ValueError):
    """Data that does not follow the format above."""


def slug(name: str) -> str:
    """Mode id from a mode name: "Vacances d'été" → "vacances_d_ete"."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_") or "mode"


def make_modes(names: list[str]) -> list[dict[str, str]]:
    """Modes with unique ids, in the given order (duplicate names are dropped)."""
    modes: list[dict[str, str]] = []
    for name in names:
        name = str(name).strip()
        if not name or any(m["name"] == name for m in modes):
            continue
        base = mode_id = slug(name)
        n = 2
        while any(m["id"] == mode_id for m in modes):
            mode_id = f"{base}_{n}"
            n += 1
        modes.append({"id": mode_id, "name": name})
    return modes


def default_data(mode_names: list[str]) -> dict[str, Any]:
    modes = make_modes(mode_names)
    return {"modes": modes, "active_mode": modes[0]["id"], "schedules": {}, "overrides": {}, "revision": 0}


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


def normalize_schedules(schedules: Any, mode_ids: set[str]) -> dict[str, dict[str, Any]]:
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
