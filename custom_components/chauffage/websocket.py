"""Websocket API used by the card (vocabulary: docs/glossary.md).

chauffage/subscribe          everything the card needs, then again after every change
chauffage/weeks/save         {weeks, revision}: refused ("stale") if edited elsewhere meanwhile
chauffage/override/set       {entity_id, override | null}: change (value, end) or remove an override;
                             a new value is sent to the thermostat
chauffage/schedule/activate  {schedule}: activate a schedule (same as the select entity)
chauffage/schedules/set      {schedules, revision}: the ordered list of schedules: create (empty
                             or a copy), rename, move, delete (see model.plan_schedules)
chauffage/presets/set        {presets, replacements}: the presets (a removed preset used in the
                             weeks is replaced by the preset given in replacements)
chauffage/mapping/set        {entity_id, mapping}: what the presets mean for one thermostat
                             ({preset id: {"preset": climate preset} | {"temperature": …}}; {} = defaults)
chauffage/rules/set          {rules, default_schedule}: the activation rules ([{"template", "schedule"}],
                             the first that applies wins; schedule null: the template gives it) and
                             the schedule when none applies (or null)
chauffage/rules/preview      {rules}: tries rules being typed, as the integration would, then again
                             when their entities change: {results, texts, errors}, one per rule
chauffage/thermostat/set     {entity_id, paused}: pause (kept, not driven) or resume a scheduled
                             thermostat
chauffage/thermostat/forget  {entity_id}: no longer scheduled, its data dropped
chauffage/history            {entity_ids, start_time, end_time?}: measured and target temperatures,
                             {entity_id: [[time (s), measured, target], …]} (see history.py)
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from . import model
from .const import DOMAIN
from .runtime import DATA, ChauffageRuntime, StaleRevision, ThermostatFailed


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in (ws_subscribe, ws_save_weeks, ws_set_override, ws_activate_schedule, ws_set_schedules,
                    ws_set_presets, ws_set_mapping, ws_set_thermostat, ws_forget_thermostat, ws_set_rules, ws_preview_rules, ws_history):
        websocket_api.async_register_command(hass, command)


def _runtime(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg_id: int) -> ChauffageRuntime | None:
    # async_loaded_entries: not in older Home Assistant versions
    entries = [e for e in hass.config_entries.async_entries(DOMAIN) if e.state is ConfigEntryState.LOADED]
    if not entries:
        connection.send_error(msg_id, "not_loaded", "The Chauffage integration is not set up")
        return None
    return entries[0].runtime_data


async def _run(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
               action: Callable[[ChauffageRuntime], Awaitable[Any]]) -> None:
    """Runs a change and answers with its result, or the error ("stale", "invalid_format",
    "thermostat_failed")."""
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    try:
        result = await action(runtime)
    except StaleRevision:
        connection.send_error(msg["id"], "stale", "The schedules were changed elsewhere: reload them")
        return
    except model.InvalidData as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    except ThermostatFailed as err:
        connection.send_error(msg["id"], "thermostat_failed", f"{err} did not answer")
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): "chauffage/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return

    @callback
    def forward(reason: str) -> None:
        if reason == DATA:
            connection.send_message(websocket_api.event_message(msg["id"], runtime.snapshot()))

    connection.subscriptions[msg["id"]] = runtime.async_add_listener(forward)
    connection.send_result(msg["id"])
    connection.send_message(websocket_api.event_message(msg["id"], runtime.snapshot()))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/weeks/save",
    vol.Required("weeks"): dict,
    vol.Optional("revision"): int,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_weeks(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def save(runtime: ChauffageRuntime) -> dict[str, int]:
        await runtime.save_weeks(msg["weeks"], msg.get("revision"))
        return {"revision": runtime.data["revision"]}

    await _run(hass, connection, msg, save)


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/override/set",
    vol.Required("entity_id"): str,
    vol.Required("override"): vol.Any(None, dict),
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_override(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.set_override(msg["entity_id"], msg["override"]))


@websocket_api.websocket_command({vol.Required("type"): "chauffage/schedule/activate", vol.Required("schedule"): str})
@websocket_api.async_response
async def ws_activate_schedule(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.activate_schedule(msg["schedule"]))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/schedules/set",
    vol.Required("schedules"): list,
    vol.Optional("revision"): int,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_schedules(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def set_schedules(runtime: ChauffageRuntime) -> dict[str, Any]:
        schedules = await runtime.set_schedules(msg["schedules"], msg.get("revision"))
        return {"schedules": schedules, "revision": runtime.data["revision"]}

    await _run(hass, connection, msg, set_schedules)


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/presets/set",
    vol.Required("presets"): list,
    vol.Optional("replacements", default={}): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_presets(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.set_presets(msg["presets"], msg["replacements"]))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/mapping/set",
    vol.Required("entity_id"): str,
    vol.Required("mapping"): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_mapping(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.set_mapping(msg["entity_id"], msg["mapping"]))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/thermostat/set",
    vol.Required("entity_id"): str,
    vol.Required("paused"): bool,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_thermostat(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.set_paused(msg["entity_id"], msg["paused"]))


@websocket_api.websocket_command({vol.Required("type"): "chauffage/thermostat/forget", vol.Required("entity_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_forget_thermostat(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.forget(msg["entity_id"]))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/rules/set",
    vol.Required("rules"): list,
    vol.Required("default_schedule"): vol.Any(None, str),
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_rules(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.set_rules(msg["rules"], msg["default_schedule"]))


PREVIEW_TEXT = 255  # characters of a template's text sent back


@websocket_api.websocket_command({vol.Required("type"): "chauffage/rules/preview", vol.Required("rules"): [dict]})
@websocket_api.require_admin
@callback
def ws_preview_rules(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Admins only, like HA's render_template: a template can read any entity."""
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    rules = [{"template": str(rule.get("template") or ""), "schedule": rule.get("schedule") or None} for rule in msg["rules"]]

    @callback
    def send() -> None:
        rendered = [runtime.render_rule(rule) for rule in rules]
        connection.send_message(websocket_api.event_message(msg["id"], {
            "results": [result for result, _, _ in rendered],
            "texts": [text if text is None else text[:PREVIEW_TEXT] for _, text, _ in rendered],
            "errors": [error for _, _, error in rendered],
        }))

    connection.subscriptions[msg["id"]] = runtime.track_templates([rule["template"] for rule in rules], send) or (lambda: None)
    connection.send_result(msg["id"])
    send()


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/history",
    vol.Required("entity_ids"): [str],
    vol.Required("start_time"): str,
    vol.Optional("end_time"): str,
})
@websocket_api.async_response
async def ws_history(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if "recorder" not in hass.config.components:
        connection.send_error(msg["id"], "no_recorder", "The recorder is not set up: no history")
        return
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    start = dt_util.parse_datetime(msg["start_time"])
    end = dt_util.parse_datetime(msg["end_time"]) if "end_time" in msg else dt_util.utcnow()
    if start is None or end is None:
        connection.send_error(msg["id"], "invalid_format", "Invalid start_time or end_time")
        return
    connection.send_result(msg["id"], await runtime.history.read(msg["entity_ids"], start, end))
