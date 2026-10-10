"""Import of a package installation (packages/chauffage/, v0.1).

The package keeps its data in the state machine: schedules in sensor.programmes_chauffage
("programmes", "version" attributes), overrides in sensor.derogations_chauffage, the active mode
in input_select.mode_chauffage. Once imported, its automations are turned off (reversible) so
that two schedulers never drive the valves, and a repair issue explains how to remove it.
"""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er, issue_registry as ir

from . import model
from .const import (
    DOMAIN,
    PACKAGE_AUTOMATIONS,
    PACKAGE_DATA_VERSION,
    PACKAGE_MODE,
    PACKAGE_OVERRIDES,
    PACKAGE_SCHEDULES,
)

_LOGGER = logging.getLogger(__name__)
ISSUE_PACKAGE = "package_installed"
OVERRIDE_KINDS = {"temp": "temperature", "preset": "preset"}


class PackageTooNew(Exception):
    """Package data saved by a newer version than this import understands."""


def package_installed(hass: HomeAssistant) -> bool:
    return hass.states.get(PACKAGE_SCHEDULES) is not None


def package_summary(hass: HomeAssistant) -> dict[str, Any] | None:
    """What an import would bring (shown in the config flow), or None without a package."""
    state = hass.states.get(PACKAGE_SCHEDULES)
    if state is None:
        return None
    version = state.attributes.get("version") or 1
    if not isinstance(version, int) or version > PACKAGE_DATA_VERSION:
        raise PackageTooNew
    programmes = state.attributes.get("programmes")
    programmes = programmes if isinstance(programmes, dict) else {}
    modes = {mode for modes in programmes.values() if isinstance(modes, dict) for mode in modes}
    return {"thermostats": len(programmes), "modes": len(modes)}


def from_package(hass: HomeAssistant) -> dict[str, Any]:
    """The package's data converted to the integration's format (see model.py)."""
    package_summary(hass)  # raises PackageTooNew
    schedules_state = hass.states.get(PACKAGE_SCHEDULES)
    programmes = schedules_state.attributes.get("programmes") if schedules_state else None
    programmes = programmes if isinstance(programmes, dict) else {}

    mode_state = hass.states.get(PACKAGE_MODE)
    names = list(mode_state.attributes.get("options", [])) if mode_state else []
    for modes in programmes.values():  # modes used in the schedules but no longer offered
        if isinstance(modes, dict):
            names += [name for name in modes if name not in names]
    modes = model.make_modes(names or ["Normal"])
    ids = {m["name"]: m["id"] for m in modes}

    schedules: dict[str, dict[str, Any]] = {}
    for entity_id, by_mode in programmes.items():
        if not isinstance(by_mode, dict) or not str(entity_id).startswith("climate."):
            continue
        weeks = {}
        for name, week in by_mode.items():
            if isinstance(week, list) and len(week) == 7 and name in ids:
                weeks[ids[name]] = [model.normalize_day(day) for day in week]
        if weeks:
            schedules[entity_id] = weeks

    overrides: dict[str, Any] = {}
    overrides_state = hass.states.get(PACKAGE_OVERRIDES)
    raw = overrides_state.attributes.get("derogations") if overrides_state else None
    for entity_id, o in (raw if isinstance(raw, dict) else {}).items():
        try:
            overrides[entity_id] = model.normalize_override({
                "kind": OVERRIDE_KINDS.get(o.get("type")),
                "value": o.get("valeur"),
                "start": o.get("debut"),
                "end": o.get("fin"),
            })
        except (AttributeError, model.InvalidData):
            _LOGGER.warning("Override of %s not imported (unreadable): %s", entity_id, o)

    active = mode_state.state if mode_state else None
    return {
        "modes": modes,
        "active_mode": ids.get(active, modes[0]["id"]),
        # The package's presets become levels with the same ids (see store._v1_to_v2)
        "levels": model.default_levels(hass.config.language or "en", model.used_levels(schedules)),
        "mappings": {},
        "schedules": schedules,
        "overrides": overrides,
        "revision": 0,
    }


async def async_turn_off_package(hass: HomeAssistant) -> list[str]:
    """Turns off the package's automations (they can be turned back on). Returns their ids."""
    registry = er.async_get(hass)
    entity_ids = [
        entity_id
        for unique_id in PACKAGE_AUTOMATIONS
        if (entity_id := registry.async_get_entity_id("automation", "automation", unique_id))
    ]
    if entity_ids and not hass.services.has_service("automation", "turn_off"):
        _LOGGER.warning("Could not turn off the package automations %s: turn them off by hand", entity_ids)
    elif entity_ids:
        await hass.services.async_call(
            "automation", "turn_off", {"entity_id": entity_ids, "stop_actions": True}, blocking=True
        )
    return entity_ids


def async_update_package_issue(hass: HomeAssistant, mode_entity_id: str | None) -> None:
    """Repair issue shown while the package is still installed."""
    if package_installed(hass):
        ir.async_create_issue(
            hass,
            DOMAIN,
            ISSUE_PACKAGE,
            is_fixable=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key=ISSUE_PACKAGE,
            translation_placeholders={"mode_entity": mode_entity_id or "select.…"},
            learn_more_url="https://github.com/armellarcier/ha-chauffage#upgrading-from-the-package-v01",
        )
    else:
        ir.async_delete_issue(hass, DOMAIN, ISSUE_PACKAGE)
