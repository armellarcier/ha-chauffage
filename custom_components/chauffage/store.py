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

STORAGE_VERSION = 5
STORAGE_MINOR_VERSION = 1
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
    mapping was not driven (left behind once removed from the card): kept, still not scheduled.
    A scheduled thermostat has a week in every schedule: one it had none in gets the week of a
    new schedule, eco all week, what the card showed for it."""
    data = dict(data)
    weeks, mappings = data.pop("weeks", {}), data.pop("mappings", {})
    temperatures = data.pop("preset_temperatures", {})
    schedule_ids = [schedule["id"] for schedule in data["schedules"]]
    preset_ids = [preset["id"] for preset in data["presets"]]
    data["thermostats"] = {
        entity_id: model.new_thermostat(
            model.complete_weeks(weeks[entity_id], schedule_ids, preset_ids) if weeks.get(entity_id) else None,
            mappings.get(entity_id), temperatures.get(entity_id),
        )
        for entity_id in [*weeks, *(e for e in mappings if e not in weeks)]
    }
    data["renamed"] = {}
    return data


MIGRATIONS: dict[int, Migration] = {1: _v1_to_v2, 2: _v2_to_v3, 3: _v3_to_v4, 4: _v4_to_v5}


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
