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

from . import model
from .const import DOMAIN

STORAGE_VERSION = 7
# 7.2: version 7 changed while it was in development (see _clean_development_v7)
STORAGE_MINOR_VERSION = 2
SAVE_DELAY = 1  # seconds: several quick changes are written once

Migration = Callable[[dict[str, Any], str], dict[str, Any]]


def _v1_to_v2(data: dict[str, Any], language: str) -> dict[str, Any]:
    """Heating levels (v0.3): slots named a VTherm preset now name a level with the same id, and
    each thermostat with that preset keeps using it (default mapping), so nothing changes."""
    return {
        **data,
        "levels": model.default_presets(language, model.used_presets(data.get("schedules", {}))),
        "mappings": {},
    }


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
        thermostat = model.new_thermostat(
            model.complete_weeks(weeks[entity_id], schedule_ids, preset_ids) if weeks.get(entity_id) else None,
            mappings.get(entity_id), temperatures.get(entity_id),
        )
        thermostat.pop("hvac_mode")  # added in version 7
        data["thermostats"][entity_id] = thermostat
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
    The values do not change. The HVAC mode a thermostat was last on in is not known yet."""
    def without(command: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in command.items() if key not in ("kind", "value")}

    return {
        **data,
        "thermostats": {
            entity_id: {**t, "mapping": {preset_id: {"preset_mode": v["preset"]} if "preset" in v else v
                                         for preset_id, v in t["mapping"].items()}, "hvac_mode": None}
            for entity_id, t in data["thermostats"].items()
        },
        "overrides": {entity_id: {"target": _target(o), **without(o)} for entity_id, o in data["overrides"].items()},
        "pending": {entity_id: [{"target": _target(c), **without(c)} for c in commands]
                    for entity_id, commands in data["pending"].items()},
    }


MIGRATIONS: dict[int, Migration] = {1: _v1_to_v2, 2: _v2_to_v3, 3: _v3_to_v4, 4: _v4_to_v5, 5: _v5_to_v6, 6: _v6_to_v7}


def _clean_development_v7(data: dict[str, Any]) -> dict[str, Any]:
    """Version 7.1 → 7.2. Version 7 changed while #91 was developed, before a release held it: a
    preset, a preset's value on a thermostat and a slot could set an HVAC mode, and a value could
    hold a climate preset and a temperature. Now the schedule says heat or cool, a slot only
    says off, and a value is a climate preset or a temperature (model.py). Only an installation
    of a development version holds such data; a released version 6 migrates to clean data."""
    off_preset = model.coldest_preset(data["presets"])

    def value(stored: dict[str, Any]) -> dict[str, Any]:
        kept = {key: v for key, v in stored.items() if key != "hvac_mode"}
        if "temperature" in kept:  # with a climate preset too: the temperature was the value shown
            kept.pop("preset_mode", None)
        return kept

    def slot(stored: list[Any]) -> list[Any]:
        settings = stored[2] if len(stored) > 2 else {}
        if settings.get("hvac_mode") != "off":
            settings = {key: v for key, v in settings.items() if key != "hvac_mode"}
        return [stored[0], stored[1], settings]

    return {
        **data,
        "presets": [{key: v for key, v in preset.items() if key != "hvac_mode"} for preset in data["presets"]],
        "thermostats": {
            entity_id: {
                **t,
                "mapping": {preset_id: kept for preset_id, stored in t["mapping"].items() if (kept := value(stored))},
                "weeks": {schedule_id: [model.normalize_day([slot(s) for s in day], off_preset) for day in week]
                          for schedule_id, week in t["weeks"].items()},
            }
            for entity_id, t in data["thermostats"].items()
        },
    }


class ChauffageStore(Store[dict[str, Any]]):
    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION, DOMAIN, minor_version=STORAGE_MINOR_VERSION)

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> dict[str, Any]:
        data = migrate(old_data, old_major_version, language=self.hass.config.language or "en")
        if old_major_version == STORAGE_VERSION and old_minor_version < 2:
            data = _clean_development_v7(data)
        return data


def migrate(data: dict[str, Any], version: int, target: int = STORAGE_VERSION,
            migrations: dict[int, Migration] | None = None, language: str = "en") -> dict[str, Any]:
    migrations = MIGRATIONS if migrations is None else migrations
    for v in range(version, target):
        if v not in migrations:
            raise ValueError(f"No migration from storage version {v}")
        data = migrations[v](data, language)
    return data
