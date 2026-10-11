"""Websocket API used by the card (vocabulary: docs/glossary.md).

chauffage/subscribe          everything the card needs, then again after every change
chauffage/weeks/save         {weeks, revision}: refused ("stale") if edited elsewhere meanwhile
chauffage/override/set       {entity_id, override | null}: extend or remove an override
chauffage/schedule/activate  {schedule}: activate a schedule (same as the select entity)
chauffage/schedules/set      {schedules, revision}: the ordered list of schedules: create (empty
                             or a copy), rename, move, delete (see model.plan_schedules)
chauffage/presets/set        {presets, replacements}: the presets (a removed preset used in the
                             weeks is replaced by the preset given in replacements)
chauffage/mapping/set        {entity_id, mapping}: what the presets mean for one thermostat
                             ({preset id: {"preset": climate preset} | {"temperature": …}}; {} = defaults)
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from . import model
from .const import DOMAIN
from .runtime import DATA, ChauffageRuntime, StaleRevision


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in (ws_subscribe, ws_save_weeks, ws_set_override, ws_activate_schedule, ws_set_schedules,
                    ws_set_presets, ws_set_mapping):
        websocket_api.async_register_command(hass, command)


def _runtime(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg_id: int) -> ChauffageRuntime | None:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    if not entries:
        connection.send_error(msg_id, "not_loaded", "The Chauffage integration is not set up")
        return None
    return entries[0].runtime_data


async def _run(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
               action: Callable[[ChauffageRuntime], Awaitable[Any]]) -> None:
    """Runs a change and answers with its result, or the error ("stale", "invalid_format")."""
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
