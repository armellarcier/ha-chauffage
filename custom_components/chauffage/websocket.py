"""Websocket API used by the card (vocabulary: docs/glossary.md).

chauffage/subscribe          everything the card needs, then again after every change, when a
                             planned preset changes, and after the integration is reloaded
chauffage/weeks/save         {weeks, revisions | revision}: the weeks of the thermostats sent, against
                             the revision of each ({climate: revision | null}), or the global one
                             (older cards); refused ("stale") if edited elsewhere meanwhile
chauffage/override/set       {entity_id, override | null, source?}: change (value, end) or remove an override;
                             a new value is sent to the thermostat. Any user who may control the
                             thermostat, not only an admin
chauffage/schedule/activate  {schedule, source?}: activate a schedule (same as the select entity)
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
chauffage/thermostat/set     {entity_id, paused}: pause (kept, not controlled) or resume a scheduled
                             thermostat. Any user who may control the thermostat
chauffage/thermostat/forget  {entity_id}: no longer scheduled, its data dropped
chauffage/settings/set       {manual_override_end?, override_duration?}: the settings of overrides,
                             in the integration's options (as the options flow and the entities)
chauffage/history            {entity_ids, start_time, end_time?}: measured and target temperatures,
                             {entity_id: [[time (s), measured, target], …]} (see history.py)
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable
from functools import wraps
from typing import Any

import voluptuous as vol

from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.util import dt as dt_util

from . import model
from .const import ACCESS_LEVELS, CONF_ACCESS_LEVEL, DOMAIN, PLAN, SET_UP
from .runtime import DATA, ENTITIES, ChauffageRuntime, StaleRevision, ThermostatFailed


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in (ws_subscribe, ws_save_weeks, ws_set_override, ws_activate_schedule, ws_set_schedules,
                    ws_set_presets, ws_set_mapping, ws_set_thermostat, ws_forget_thermostat,
                    ws_set_rules, ws_preview_rules, ws_history, ws_set_settings):
        websocket_api.async_register_command(hass, command)


def _runtime(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg_id: int) -> ChauffageRuntime | None:
    # async_loaded_entries: not in older Home Assistant versions
    entries = [e for e in hass.config_entries.async_entries(DOMAIN) if e.state is ConfigEntryState.LOADED]
    if not entries:
        connection.send_error(msg_id, "not_loaded", "The Chauffage integration is not set up")
        return None
    return entries[0].runtime_data


def _may_control(connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> bool:
    """Overrides and pause: anyone who may control the thermostat, as with its knob, its Control
    switch and the services, not only an admin. Answers "unauthorized" otherwise."""
    if connection.user.permissions.check_entity(msg["entity_id"], POLICY_CONTROL):
        return True
    connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Unauthorized")
    return False


ADMIN = "admin"  # above every access level: only an admin
_RANKS = (*ACCESS_LEVELS, ADMIN)

# What a change needs, from its message: an access level, and the thermostats the user must
# control. By default every scheduled thermostat: the change reaches every room
Needs = Callable[[ChauffageRuntime, dict[str, Any]], tuple[str, Iterable[str]]]


def _every_thermostat(level: str) -> Needs:
    return lambda runtime, msg: (level, runtime.scheduled)


def _thermostat(level: str) -> Needs:
    return lambda runtime, msg: (level, (msg["entity_id"],))


def require_access(needs: Needs) -> Callable:
    """A change an admin can always make. A user who is not an admin makes it when the access
    level allows it (#99), and only on thermostats they may control: an access level never goes
    beyond Home Assistant's permissions. Answers "unauthorized" otherwise."""

    def decorate(handler: Callable) -> Callable:
        @wraps(handler)
        def check(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
            user = connection.user
            if user is None or not user.is_admin:
                entries = [e for e in hass.config_entries.async_entries(DOMAIN) if e.state is ConfigEntryState.LOADED]
                if user is None or not entries:
                    raise Unauthorized
                runtime: ChauffageRuntime = entries[0].runtime_data
                level, thermostats = needs(runtime, msg)
                if (_RANKS.index(runtime.access_level) < _RANKS.index(level)
                        or not all(user.permissions.check_entity(e, POLICY_CONTROL) for e in thermostats)):
                    raise Unauthorized
            handler(hass, connection, msg)

        return check

    return decorate


def _weeks_needs(runtime: ChauffageRuntime, msg: dict[str, Any]) -> tuple[str, Iterable[str]]:
    """Editing the weeks is planning; the weeks of a thermostat not scheduled yet schedule it,
    which is setting up."""
    thermostats = list(msg["weeks"])
    return (PLAN if all(e in runtime.scheduled for e in thermostats) else SET_UP), thermostats


def _settings_needs(runtime: ChauffageRuntime, msg: dict[str, Any]) -> tuple[str, Iterable[str]]:
    """Only an admin chooses the access level: a user with Set up who could would give every
    user everything."""
    return (ADMIN if CONF_ACCESS_LEVEL in msg else SET_UP), runtime.scheduled


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


# Where a change of the card or the panel comes from, told in the events and the logbook (an
# older card sends none: "card")
SOURCES = ("card", "panel")


SUBSCRIBERS = f"{DOMAIN}_subscribers"


class _Subscriber:
    """A card subscribed to the data: it follows the runtime of the moment, so that it goes on
    receiving after the integration is reloaded (options changed, a thermostat renamed)."""

    def __init__(self, connection: websocket_api.ActiveConnection, msg_id: int) -> None:
        self.connection, self.msg_id = connection, msg_id
        self.runtime: ChauffageRuntime | None = None
        self._unsub: Callable[[], None] | None = None
        self._planned: dict[str, Any] | None = None  # as last sent

    @callback
    def attach(self, runtime: ChauffageRuntime) -> None:
        self.detach()
        self.runtime = runtime
        self._unsub = runtime.async_add_listener(self._changed)
        self.send()

    @callback
    def detach(self) -> None:
        if self._unsub is not None:
            self._unsub()
            self._unsub = None

    @callback
    def _changed(self, reason: str) -> None:
        # Every minute (TICK): only when a planned preset changed; ENTITIES: the ids the cards open
        if reason in (DATA, ENTITIES) or self.runtime.planned_presets() != self._planned:
            self.send()

    @callback
    def send(self) -> None:
        snapshot = self.runtime.snapshot()
        self._planned = snapshot["planned"]
        self.connection.send_message(websocket_api.event_message(self.msg_id, snapshot))


@callback
def async_attach_subscribers(hass: HomeAssistant, runtime: ChauffageRuntime) -> None:
    """The cards subscribed before a reload follow the new runtime, and get its data at once."""
    for subscriber in hass.data.get(SUBSCRIBERS, ()):
        subscriber.attach(runtime)


@websocket_api.websocket_command({vol.Required("type"): "chauffage/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if (runtime := _runtime(hass, connection, msg["id"])) is None:
        return
    subscriber = _Subscriber(connection, msg["id"])
    subscribers: set[_Subscriber] = hass.data.setdefault(SUBSCRIBERS, set())
    subscribers.add(subscriber)

    @callback
    def unsubscribe() -> None:
        subscribers.discard(subscriber)
        subscriber.detach()

    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_result(msg["id"])
    subscriber.attach(runtime)


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/weeks/save",
    vol.Required("weeks"): dict,
    vol.Optional("revision"): int,
    vol.Optional("revisions"): {str: vol.Any(None, int)},
})
@require_access(_weeks_needs)
@websocket_api.async_response
async def ws_save_weeks(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async def save(runtime: ChauffageRuntime) -> dict[str, Any]:
        await runtime.save_weeks(msg["weeks"], msg.get("revision"), msg.get("revisions"))
        return {"revision": runtime.data["revision"],
                "revisions": {e: t["revision"] for e, t in runtime.scheduled.items() if e in msg["weeks"]}}

    await _run(hass, connection, msg, save)


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/override/set",
    vol.Required("entity_id"): str,
    vol.Required("override"): vol.Any(None, dict),
    vol.Optional("source", default="card"): vol.In(SOURCES),
})
@websocket_api.async_response
async def ws_set_override(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if not _may_control(connection, msg):
        return
    await _run(hass, connection, msg, lambda runtime: runtime.set_override(
        msg["entity_id"], msg["override"], source=msg["source"], context=connection.context(msg)))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/schedule/activate",
    vol.Required("schedule"): str,
    vol.Optional("source", default="card"): vol.In(SOURCES),
})
@websocket_api.async_response
async def ws_activate_schedule(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.activate_schedule(
        msg["schedule"], source=msg["source"], context=connection.context(msg)))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/schedules/set",
    vol.Required("schedules"): list,
    vol.Optional("revision"): int,
})
@require_access(_every_thermostat(PLAN))
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
@require_access(_every_thermostat(SET_UP))
@websocket_api.async_response
async def ws_set_presets(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.set_presets(msg["presets"], msg["replacements"]))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/mapping/set",
    vol.Required("entity_id"): str,
    vol.Required("mapping"): dict,
})
@require_access(_thermostat(SET_UP))
@websocket_api.async_response
async def ws_set_mapping(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.set_mapping(msg["entity_id"], msg["mapping"]))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/thermostat/set",
    vol.Required("entity_id"): str,
    vol.Required("paused"): bool,
})
@websocket_api.async_response
async def ws_set_thermostat(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if not _may_control(connection, msg):
        return
    await _run(hass, connection, msg, lambda runtime: runtime.set_paused(msg["entity_id"], msg["paused"]))


@websocket_api.websocket_command({vol.Required("type"): "chauffage/thermostat/forget", vol.Required("entity_id"): str})
@require_access(_thermostat(SET_UP))
@websocket_api.async_response
async def ws_forget_thermostat(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.forget(msg["entity_id"]))


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/rules/set",
    vol.Required("rules"): list,
    vol.Required("default_schedule"): vol.Any(None, str),
})
@require_access(_every_thermostat(SET_UP))
@websocket_api.async_response
async def ws_set_rules(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _run(hass, connection, msg, lambda runtime: runtime.set_rules(msg["rules"], msg["default_schedule"]))


PREVIEW_TEXT = 255  # characters of a template's text sent back


@websocket_api.websocket_command({vol.Required("type"): "chauffage/rules/preview", vol.Required("rules"): [dict]})
@require_access(_every_thermostat(SET_UP))
@callback
def ws_preview_rules(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Admins, and users with Set up, who write the rules: Home Assistant keeps render_template
    for admins, so the access level Set up says that it lets users write templates."""
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


@websocket_api.websocket_command({
    vol.Required("type"): "chauffage/settings/set",
    vol.Optional("manual_override_end"): str,
    vol.Optional("override_duration"): int,
    vol.Optional(CONF_ACCESS_LEVEL): str,
})
@require_access(_settings_needs)
@websocket_api.async_response
async def ws_set_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The settings of overrides and the access level, from the panel: the integration's
    options, as the options flow and the configuration entities change them."""
    async def set_settings(runtime: ChauffageRuntime) -> None:
        if CONF_ACCESS_LEVEL in msg:
            runtime.set_access_level(msg[CONF_ACCESS_LEVEL])
        runtime.set_override_settings(msg.get("manual_override_end"), msg.get("override_duration"))

    await _run(hass, connection, msg, set_settings)
