"""Persistence in .storage/chauffage, with versioned migrations.

A format change bumps STORAGE_VERSION and adds MIGRATIONS[n] (version n → n + 1), tested with
a fixture of the old format in tests/fixtures/ (see CONTRIBUTING.md, "Data versions and
migrations"). Migrations receive the data and Home Assistant's language (for names they create).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DEFAULT_PRESETS, DOMAIN

STORAGE_VERSION = 7
STORAGE_MINOR_VERSION = 1
SAVE_DELAY = 1  # seconds: several quick changes are written once

Migration = Callable[[dict[str, Any], str], dict[str, Any]]
# The default presets of version 2: (id, color, temperature), and their names by language. Later
# versions changed some colors and temperatures for new installations only (#91)
V2_PRESETS = (("comfort", "#f57c00", 20.0), ("eco", "#43a047", 17.0), ("boost", "#e53935", 21.0), ("frost", "#29b6f6", 7.0))
V2_PRESET_NAMES = {
    "en": {"comfort": "Comfort", "eco": "Eco", "boost": "Boost", "frost": "Frost protection"},
    "fr": {"comfort": "Confort", "eco": "Éco", "boost": "Boost", "frost": "Hors-gel"},
}
V2_EXTRA_PRESET = {"color": "#9e9e9e", "temperature": 19.0}


# The helpers of the migrations, frozen as they were when each migration was written: a change to
# the live code (model.py, domain/) must never change how an old format is migrated

def _used_presets_v2(weeks: dict[str, Any]) -> list[str]:
    """Preset ids used in the weeks of version 1, in order of appearance."""
    seen: list[str] = []
    for by_schedule in weeks.values():
        for week in by_schedule.values():
            for day in week:
                for slot in day:
                    if slot[1] is not None and slot[1] not in seen:
                        seen.append(slot[1])
    return seen


def _complete_weeks_v5(weeks: dict[str, Any], schedule_ids: list[str], preset_ids: list[str]) -> dict[str, Any]:
    """A thermostat's weeks of version 5, one per schedule: a schedule it has none in gets the
    week of a new schedule, eco all week (or the first preset, without eco)."""
    fill = "eco" if "eco" in preset_ids else preset_ids[0]
    return {schedule_id: weeks[schedule_id] if schedule_id in weeks else [[["00:00", fill]] for _ in range(7)]
            for schedule_id in schedule_ids}


def _v1_to_v2(data: dict[str, Any], language: str) -> dict[str, Any]:
    """Heating levels (v0.3): slots named a VTherm preset now name a level with the same id, and
    each thermostat with that preset keeps using it (default mapping), so nothing changes. The
    four default levels named in `language`, then the other ids found in the weeks."""
    names = V2_PRESET_NAMES.get((language or "en").split("-")[0], V2_PRESET_NAMES["en"])
    levels = [{"id": i, "name": names[i], "color": color, "temperature": t} for i, color, t in V2_PRESETS]
    for preset_id in _used_presets_v2(data.get("schedules", {})):
        if not any(level["id"] == preset_id for level in levels):
            levels.append({"id": preset_id, "name": preset_id, **V2_EXTRA_PRESET})
    return {**data, "levels": levels, "mappings": {}}


def _v2_to_v3(data: dict[str, Any], language: str) -> dict[str, Any]:
    """One vocabulary (v0.4, docs/glossary.md): modes are schedules, levels are presets, and the
    weeks of each thermostat (formerly "schedules") are weeks. Ids and contents are unchanged."""
    renamed = {"modes": "schedules", "active_mode": "active_schedule", "levels": "presets", "schedules": "weeks"}
    return {renamed.get(key, key): value for key, value in data.items()}


def _v3_to_v4(data: dict[str, Any], language: str) -> dict[str, Any]:
    """Activation rules (v0.5): none yet, the active schedule stays chosen by hand."""
    return {**data, "rules": [], "default_schedule": None, "rules_choice": None}


def _v4_to_v5(data: dict[str, Any], language: str) -> dict[str, Any]:
    """Scheduled thermostats (#27): the weeks, mappings and learned temperatures of each
    thermostat are kept together. A thermostat with weeks is scheduled, active; one with only a
    mapping was not controlled (left behind once removed from the card): kept, still not scheduled.
    A scheduled thermostat has a week in every schedule: one it had none in gets the week of a
    new schedule, eco all week, what the card showed for it."""
    data = dict(data)
    weeks, mappings = data.pop("weeks", {}), data.pop("mappings", {})
    temperatures = data.pop("preset_temperatures", {})
    schedule_ids = [schedule["id"] for schedule in data["schedules"]]
    preset_ids = [preset["id"] for preset in data["presets"]]
    data["thermostats"] = {}
    for entity_id in [*weeks, *(e for e in mappings if e not in weeks)]:
        # A scheduled thermostat of version 5, active
        data["thermostats"][entity_id] = {
            "paused": False,
            "weeks": _complete_weeks_v5(weeks[entity_id], schedule_ids, preset_ids) if weeks.get(entity_id) else {},
            "mapping": mappings.get(entity_id) or {},
            "preset_temperatures": temperatures.get(entity_id) or {},
            "revision": 0,
        }
    data["renamed"] = {}
    return data


def _v5_to_v6(data: dict[str, Any], language: str) -> dict[str, Any]:
    """Commands applied late (v0.7): none is waited for yet."""
    return {**data, "pending": {}}


def _target(command: dict[str, Any]) -> dict[str, Any]:
    """A command's target from its kind and value (the format before #91)."""
    return {"preset_mode": command["value"]} if command["kind"] == "preset" else {"temperature": command["value"]}


def _v6_to_v7(data: dict[str, Any], language: str) -> dict[str, Any]:
    """A slot sets more than a preset (#91): what a preset means for a thermostat, an override
    and a command not applied yet are partial states of the thermostat, as a scene holds them.
    The values do not change. The weeks do not change either: a slot without settings says
    no HVAC mode, and is read as slot.slot_hvac_mode says.

    A preset has a temperature when cooling too. The default presets get theirs, by their id:
    eco, comfort and boost. Frost protection and the presets the user created get none: they
    are not offered when cooling until the user gives them one. The temperatures when heating
    do not change."""
    def without(command: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in command.items() if key not in ("kind", "value")}

    cooling = {preset_id: cool for preset_id, _, _, cool in DEFAULT_PRESETS if cool is not None}
    return {
        **data,
        "presets": [{**preset, "cool_temperature": cooling[preset["id"]]} if preset["id"] in cooling else preset
                    for preset in data["presets"]],
        "thermostats": {
            entity_id: {**t, "mapping": {preset_id: {"preset_mode": v["preset"]} if "preset" in v else v
                                         for preset_id, v in t["mapping"].items()}}
            for entity_id, t in data["thermostats"].items()
        },
        "overrides": {entity_id: {"target": _target(o), **without(o)} for entity_id, o in data["overrides"].items()},
        "pending": {entity_id: [{"target": _target(c), **without(c)} for c in commands]
                    for entity_id, commands in data["pending"].items()},
    }


MIGRATIONS: dict[int, Migration] = {1: _v1_to_v2, 2: _v2_to_v3, 3: _v3_to_v4, 4: _v4_to_v5, 5: _v5_to_v6, 6: _v6_to_v7}


class ChauffageStore(Store[dict[str, Any]]):
    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION, DOMAIN, minor_version=STORAGE_MINOR_VERSION)

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> dict[str, Any]:
        return migrate(old_data, old_major_version, language=self.hass.config.language or "en")


def migrate(data: dict[str, Any], version: int, target: int = STORAGE_VERSION,
            migrations: dict[int, Migration] | None = None, language: str = "en") -> dict[str, Any]:
    migrations = MIGRATIONS if migrations is None else migrations
    for v in range(version, target):
        if v not in migrations:
            raise ValueError(f"No migration from storage version {v}")
        data = migrations[v](data, language)
    return data
