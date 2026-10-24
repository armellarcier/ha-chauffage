"""Repairs of scheduled thermostats (docs/decisions.md, "Scheduled thermostats"), answered from
Settings → Repairs:

- unlisted_<climate>: an active thermostat no card shows any more: pause it, keep driving it
  (until a card shows it again and it is removed again), or forget it;
- missing_<climate>: a thermostat whose entity is gone from Home Assistant: forget it, or keep it
  (an entity made again with the same id).

The issues themselves are raised and closed by the runtime.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import issue_registry as ir

from .const import DOMAIN

UNLISTED, MISSING = "unlisted", "missing"


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


class ThermostatFlow(RepairsFlow):
    """A menu of what to do with one thermostat."""

    choices: list[str]

    def __init__(self, entity_id: str) -> None:
        self.entity_id = entity_id

    @property
    def _runtime(self):
        from .services import loaded_runtime  # the integration's runtime, once loaded

        return loaded_runtime(self.hass)

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        state = self.hass.states.get(self.entity_id)
        return self.async_show_menu(
            step_id="init", menu_options=self.choices,
            description_placeholders={"name": state.name if state else self.entity_id, "entity_id": self.entity_id},
        )

    async def async_step_forget(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        runtime = self._runtime
        if self.entity_id in runtime.thermostats:
            await runtime.forget(self.entity_id)
        return self.async_create_entry(data={})


class UnlistedFlow(ThermostatFlow):
    choices = ["pause", "keep", "forget"]

    async def async_step_pause(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        runtime = self._runtime
        if self.entity_id in runtime.scheduled:
            await runtime.set_paused(self.entity_id, True)
        return self.async_create_entry(data={})

    async def async_step_keep(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        self._runtime.keep_unlisted(self.entity_id)
        return self.async_create_entry(data={})


class MissingFlow(ThermostatFlow):
    choices = ["forget", "keep"]

    async def async_step_keep(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        close_issue(self.hass, MISSING, self.entity_id)  # asked again at the next start
        return self.async_create_entry(data={})


async def async_create_fix_flow(hass: HomeAssistant, issue_id: str, data: dict[str, Any] | None) -> RepairsFlow:
    flow = UnlistedFlow if issue_id.startswith(f"{UNLISTED}_") else MissingFlow
    return flow((data or {})["entity_id"])
