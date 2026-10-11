"""Websocket API used by the card.

chauffage/subscribe       everything the card needs, then again after every change
chauffage/schedules/save  {schedules, revision}: refused ("stale") if edited elsewhere meanwhile
chauffage/override/set    {entity_id, override | null}: extend or remove an override
chauffage/mode/set        {mode}: activate a mode (same as the select entity)
chauffage/modes/set       {modes, revision}: the ordered list of schedules ("modes"): create
                          (empty or a copy), rename, move, delete (see model.plan_modes)
chauffage/levels/set      {levels, replacements}: heating levels (a removed level used in the
                          schedules is replaced by the level given in replacements)
chauffage/mapping/set     {entity_id, mapping}: what the levels mean for one thermostat
                          ({level id: {"preset": …} | {"temperature": …}}; {} = defaults)
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from . import model
from .const import DOMAIN
from .runtime import DATA, ChauffageRuntime, StaleRevision


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_subscribe)
    websocket_api.async_register_command(hass, ws_save_schedules)
    websocket_api.async_register_command(hass, ws_set_override)
    websocket_api.async_register_command(hass, ws_set_mode)
    websocket_api.async_register_command(hass, ws_set_modes)
    websocket_api.async_register_command(hass, ws_set_levels)
    websocket_api.async_register_command(hass, ws_set_mapping)


def _runtime(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg_id: int) -> ChauffageRuntime | None:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    if not entries:
        connection.send_error(msg_id, "not_loaded", "The Chauffage integration is not set up")
        return None
    return entries[0].runtime_data


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
    vol.Required("type"): "chauffage/schedules/save",
    vol.Required("schedules"): dict,
    vol.Optional("revision"): int,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_schedules(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    try:
        await runtime.save_schedules(msg["schedules"], msg.get("revision"))
    except StaleRevision:
        connection.send_error(msg["id"], "stale", "The schedules were changed elsewhere: reload them")
        return
    except model.InvalidData as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], {"revision": runtime.data["revision"]})


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/override/set",
    vol.Required("entity_id"): str,
    vol.Required("override"): vol.Any(None, dict),
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_override(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    try:
        await runtime.set_override(msg["entity_id"], msg["override"])
    except model.InvalidData as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "chauffage/mode/set", vol.Required("mode"): str})
@websocket_api.async_response
async def ws_set_mode(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    try:
        await runtime.set_mode(msg["mode"])
    except model.InvalidData as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/modes/set",
    vol.Required("modes"): list,
    vol.Optional("revision"): int,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_modes(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    try:
        modes = await runtime.set_modes(msg["modes"], msg.get("revision"))
    except StaleRevision:
        connection.send_error(msg["id"], "stale", "The schedules were changed elsewhere: reload them")
        return
    except model.InvalidData as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], {"modes": modes, "revision": runtime.data["revision"]})


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/levels/set",
    vol.Required("levels"): list,
    vol.Optional("replacements", default={}): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_levels(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    try:
        await runtime.set_levels(msg["levels"], msg["replacements"])
    except model.InvalidData as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/mapping/set",
    vol.Required("entity_id"): str,
    vol.Required("mapping"): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_mapping(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    try:
        await runtime.set_mapping(msg["entity_id"], msg["mapping"])
    except model.InvalidData as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"])
