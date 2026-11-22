"""Repair of a scheduled thermostat whose entity is gone from Home Assistant (docs/decisions.md,
"Scheduled thermostats"), answered from Settings → Repairs: forget it, or keep it (an entity made
again with the same id).

The issues themselves are raised and closed by the runtime.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import issue_registry as ir

from .const import DOMAIN

MISSING = "missing"


@callback
def raise_missing(hass: HomeAssistant, entity_id: str) -> None:
    ir.async_create_issue(
        hass, DOMAIN, f"{MISSING}_{entity_id}", is_fixable=True, is_persistent=False,
        severity=ir.IssueSeverity.WARNING, translation_key=MISSING,
        translation_placeholders={"entity_id": entity_id}, data={"entity_id": entity_id},
    )


@callback
def close_missing(hass: HomeAssistant, entity_id: str) -> None:
    ir.async_delete_issue(hass, DOMAIN, f"{MISSING}_{entity_id}")


DEPRECATED_PLANNED_PRESET = "deprecated_planned_preset"


@callback
def check_planned_preset(hass: HomeAssistant, sensors: list[str]) -> None:
    """The *Planned preset* sensor is deprecated (docs/decisions.md, "Entities"): a warning while
    one is enabled (`sensors`), with the automations and scripts that use it, if any."""
    from homeassistant.components.automation import automations_with_entity
    from homeassistant.components.script import scripts_with_entity

    users = sorted({user for sensor in sensors
                    for user in (*automations_with_entity(hass, sensor), *scripts_with_entity(hass, sensor))})
    used = f"{DEPRECATED_PLANNED_PRESET}_used"
    issue_id = (used if users else DEPRECATED_PLANNED_PRESET) if sensors else None
    # Only the other one is deleted: an issue created again keeps the user's *Ignore*
    for other in (DEPRECATED_PLANNED_PRESET, used):
        if other != issue_id:
            ir.async_delete_issue(hass, DOMAIN, other)
    if issue_id is None:
        return
    ir.async_create_issue(
        hass, DOMAIN, issue_id, is_fixable=False, is_persistent=False,
        severity=ir.IssueSeverity.WARNING, translation_key=issue_id,
        translation_placeholders={"sensors": "\n".join(f"- {s}" for s in sorted(sensors)),
                                  "users": "\n".join(f"- {u}" for u in users)},
    )


class MissingFlow(RepairsFlow):
    """A menu of what to do with a thermostat whose entity is gone."""

    def __init__(self, entity_id: str) -> None:
        self.entity_id = entity_id

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        return self.async_show_menu(
            step_id="init", menu_options=["forget", "keep"], description_placeholders={"entity_id": self.entity_id},
        )

    async def async_step_forget(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        from .services import loaded_runtime  # the integration's runtime, once loaded

        runtime = loaded_runtime(self.hass)
        if self.entity_id in runtime.thermostats:
            await runtime.forget(self.entity_id)
        return self.async_create_entry(data={})

    async def async_step_keep(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        close_missing(self.hass, self.entity_id)  # asked again at the next start
        return self.async_create_entry(data={})


async def async_create_fix_flow(hass: HomeAssistant, issue_id: str, data: dict[str, Any] | None) -> RepairsFlow:
    return MissingFlow((data or {})["entity_id"])
