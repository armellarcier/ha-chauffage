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


def issue_id(kind: str, entity_id: str) -> str:
    return f"{kind}_{entity_id}"


@callback
def raise_issue(hass: HomeAssistant, kind: str, entity_id: str, placeholders: dict[str, str]) -> None:
    ir.async_create_issue(
        hass, DOMAIN, issue_id(kind, entity_id), is_fixable=True, is_persistent=False,
        severity=ir.IssueSeverity.WARNING, translation_key=kind,
        translation_placeholders=placeholders, data={"entity_id": entity_id},
    )


@callback
def close_issue(hass: HomeAssistant, kind: str, entity_id: str) -> None:
    ir.async_delete_issue(hass, DOMAIN, issue_id(kind, entity_id))


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
        close_issue(self.hass, MISSING, self.entity_id)  # asked again at the next start
        return self.async_create_entry(data={})


async def async_create_fix_flow(hass: HomeAssistant, issue_id: str, data: dict[str, Any] | None) -> RepairsFlow:
    return MissingFlow((data or {})["entity_id"])
