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

STORAGE_VERSION = 3
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


MIGRATIONS: dict[int, Migration] = {1: _v1_to_v2, 2: _v2_to_v3}


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
