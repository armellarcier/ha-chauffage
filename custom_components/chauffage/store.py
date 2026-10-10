"""Persistence in .storage/chauffage, with versioned migrations.

A format change bumps STORAGE_VERSION and adds MIGRATIONS[n] (version n → n + 1), tested with
a fixture of the old format in tests/fixtures/ (see CONTRIBUTING.md, "Data versions and
migrations").
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1
STORAGE_MINOR_VERSION = 1
SAVE_DELAY = 1  # seconds: several quick changes are written once

MIGRATIONS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {}


class ChauffageStore(Store[dict[str, Any]]):
    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION, DOMAIN, minor_version=STORAGE_MINOR_VERSION)

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> dict[str, Any]:
        return migrate(old_data, old_major_version)


def migrate(data: dict[str, Any], version: int, target: int = STORAGE_VERSION,
            migrations: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] | None = None) -> dict[str, Any]:
    migrations = MIGRATIONS if migrations is None else migrations
    for v in range(version, target):
        if v not in migrations:
            raise ValueError(f"No migration from storage version {v}")
        data = migrations[v](data)
    return data
