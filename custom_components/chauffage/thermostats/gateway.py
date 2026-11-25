"""The only way Chauffage commands a thermostat, and what it remembers of its commands.

- `send` sets a thermostat to a target, as a scene does, with Chauffage's own context.
- The commands a thermostat does not show yet are pending for a day (docs/decisions.md,
  "Commands applied late"): a battery valve may apply them hours later.
- The fan and the vanes a thermostat had before a slot or an override chose others are given
  back by the next one that chooses none (`own_settings`).
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Mapping
from datetime import datetime
import logging
from typing import Any

from homeassistant.core import Context, HomeAssistant, State, callback
from homeassistant.helpers.state import async_reproduce_state
from homeassistant.util import dt as dt_util

from .. import engine
from ..domain.target import EQUAL_KEYS, Target
from ..domain.thermostat import Thermostat, ignored, preset_value

_LOGGER = logging.getLogger(__name__)


def describe(command: Mapping[str, Any]) -> str:
    """A target, or an override or a command holding one, for the log: "preset_mode eco",
    "temperature 21.5"."""
    target = command["target"] if "target" in command else command
    return ", ".join(f"{key} {value}" for key, value in target.items())


def local_time(iso: str) -> str:
    """Local time of an ISO date, for the log."""
    when = engine.parse_datetime(iso)
    return dt_util.as_local(when).strftime("%H:%M:%S") if when else str(iso)


class ThermostatGateway:
    """`data`: the stored data (model.py), for its "pending" commands and each thermostat's
    "own_settings". `read`: what Chauffage knows of a thermostat from its state. `save`: saves
    the stored data."""

    def __init__(self, hass: HomeAssistant, data: dict[str, Any],
                 read: Callable[[State | None], Thermostat | None], save: Callable[[], None]) -> None:
        self.hass = hass
        self._data = data
        self._read = read
        self._save = save
        self._own_contexts: deque[str] = deque(maxlen=500)

    def is_own(self, context: Context) -> bool:
        """A state change Chauffage caused: not a change by hand."""
        return context.id in self._own_contexts

    # ----- commands -----

    async def reproduce(self, entity_id: str, hvac_mode: str | None, attributes: dict[str, Any]) -> bool:
        """Sets a thermostat to an HVAC mode (None: keeps its own) and attributes, as a scene
        does (Home Assistant's reproduce_state: the HVAC mode, the setpoint, then the preset, the
        swing and the fan), with the integration's own context; False if a call failed."""
        context = Context()
        self._own_contexts.append(context.id)
        # Not in HVAC_MODES, so reproduce_state sends no HVAC mode: the thermostat keeps its own
        state = State(entity_id, hvac_mode or "", attributes)
        try:
            await async_reproduce_state(self.hass, [state], context=context)
        except Exception as err:  # noqa: BLE001 — one unreachable valve must not stop the others
            _LOGGER.warning("%s: %s failed: %s", entity_id, describe({**attributes, **({"hvac_mode": hvac_mode} if hvac_mode else {})}), err)
            return False
        return True

    async def send(self, entity_id: str, target: Mapping[str, Any], why: str) -> bool:
        """Sets a thermostat to a target, as a scene does (#91): Home Assistant's reproduce_state
        sends the HVAC mode when it changes, the setpoint, then the preset, the vanes and the fan.
        A thermostat that shows the whole target (a VTherm: as it was asked) gets nothing;
        otherwise it gets the whole target (#112). Before a setpoint, a thermostat that
        lists the preset "none" leaves the preset it shows (Target.preset_to_leave), even when it
        already shows the setpoint. A thermostat that refuses to leave its preset gets the
        setpoint anyway (docs/decisions.md, "Scheduling"). Logged with `why`; False if a call
        failed. The command is pending until the thermostat takes it: a battery valve may apply
        it hours later, even after a failed call (the Zigbee message waits for it). A target the
        thermostat already shows in full sends nothing, and nothing is pending: a change by hand
        to that value later must not pass for a command applied late."""
        self._remember_settings(entity_id, target)
        commands = self._data["pending"].get(entity_id, [])
        # Not what the thermostat already shows, unless it may still apply an older command:
        # then everything, or what it shows now could be undone later
        state = self.hass.states.get(entity_id)
        actual = self._read(state)
        current = None if commands else actual
        shown = current is not None and Target(target).satisfied_by(current)
        # A thermostat that keeps its preset when it gets a setpoint leaves the preset first
        leave = Target(target).preset_to_leave(actual)
        if shown and leave is None:
            _LOGGER.debug("%s: %s already shown, nothing sent (%s)", entity_id, describe(target), why)
            return True
        # Otherwise the whole target, as a scene: a setpoint read in another HVAC mode, or on a
        # preset, says nothing of the one the thermostat will have (#112). The HVAC mode only
        # when it changes
        hvac_mode = target.get("hvac_mode")
        if current is not None and hvac_mode == current.state:
            hvac_mode = None
        attributes = {key: value for key, value in target.items() if key != "hvac_mode"}
        waiting = "".join(f"; not applied yet: {describe(c)} sent at {local_time(c['sent'])}" for c in commands)
        _LOGGER.info("%s: %s sent (%s)%s", entity_id, describe(target), why, waiting)
        # Only the preset to leave: the thermostat shows the rest, so nothing will be pending
        if not shown:
            if commands and commands[-1]["target"] == target:
                commands.pop()  # sent again: waited for from now
            commands.append({"target": dict(target), "sent": dt_util.now().isoformat()})
            self._data["pending"][entity_id] = commands
            self._save()
        if leave is not None:
            kept = preset_value(state.attributes.get("preset_mode"))
            if await self.reproduce(entity_id, hvac_mode, {"preset_mode": leave}):
                hvac_mode = None
            else:
                _LOGGER.warning("%s: could not leave its preset %s, the setpoint is sent anyway", entity_id, kept)
        return await self.reproduce(entity_id, hvac_mode, attributes)

    def needs(self, entity_id: str, sent: Mapping[str, Any], current: Thermostat | None) -> Mapping[str, Any] | None:
        """`sent`, the target to send, when the thermostat needs it: the thermostat does not
        show it, or would apply another command later. None when there is nothing to send."""
        if current is None:
            return sent
        # A device preset left on at the target's temperature would still fight the setpoint
        if not Target(sent).satisfied_by(current) or Target(sent).preset_to_leave(current) is not None:
            return sent
        commands = self.pending(entity_id)
        return sent if commands and commands[-1] != sent else None

    # ----- commands applied late (docs/decisions.md, "Commands applied late") -----

    def pending(self, entity_id: str) -> list[dict[str, Any]]:
        """The commands sent to a thermostat that it does not show yet, oldest first."""
        return [c["target"] for c in self._data["pending"].get(entity_id, [])]

    def last_pending(self) -> dict[str, dict[str, Any]]:
        """{thermostat: the last command sent to it that it does not show yet}."""
        return {e: commands[-1] for e in self._data["pending"] if (commands := self.pending(e))}

    @callback
    def applied(self, entity_id: str, before: Thermostat | None, after: Thermostat | None) -> dict[str, Any] | None:
        """The command not applied yet that the thermostat has just taken (None: none): that one
        and the older ones are done."""
        commands = self.pending(entity_id)
        index = engine.applied_command(commands, before, after) if after and commands else None
        if index is None:
            return None
        command = self._data["pending"][entity_id][index]
        self.drop_pending(entity_id, index + 1)
        return command

    @callback
    def drop_pending(self, entity_id: str, count: int | None = None) -> None:
        """Forgets a thermostat's oldest commands not applied yet (all of them by default)."""
        commands = self._data["pending"].get(entity_id)
        if not commands:
            return
        del commands[:count]
        if not commands:
            del self._data["pending"][entity_id]
        self._save()

    @callback
    def expire_pending(self, now: datetime) -> None:
        """Forgets the commands a thermostat has not applied after a day."""
        for entity_id, commands in list(self._data["pending"].items()):
            if expired := engine.expired_commands([c["sent"] for c in commands], now):
                self.drop_pending(entity_id, expired)

    @callback
    def renamed(self, old: str, new: str) -> None:
        """A thermostat renamed: its pending commands follow it."""
        self._data["pending"].pop(new, None)
        if old in self._data["pending"]:
            self._data["pending"][new] = self._data["pending"].pop(old)

    # ----- the fan and the vanes to give back -----

    def own_settings(self, entity_id: str) -> dict[str, str]:
        """The fan and the vanes to give back to a thermostat: what it had before a slot or an
        override chose others (docs/decisions.md, "Scheduling"). Only the values it still lists."""
        kept = self._data["thermostats"].get(entity_id, {}).get("own_settings") or {}
        state = self.hass.states.get(entity_id)
        attributes = state.attributes if state is not None else {}
        return {key: value for key, value in kept.items()
                if value in [preset_value(v) for v in attributes.get(f"{key}s") or [value]]}

    @callback
    def _remember_settings(self, entity_id: str, target: Mapping[str, Any]) -> None:
        """Before a command changes the fan or the vanes: what the thermostat shows is kept, to
        be given back by the next slot or override that chooses none."""
        t, state = self._data["thermostats"].get(entity_id), self.hass.states.get(entity_id)
        if t is None or state is None:
            return
        kept = t.get("own_settings") or {}
        for key in EQUAL_KEYS:
            shown = preset_value(state.attributes.get(key))
            if key in target and key not in kept and shown not in (None, target[key]):
                t["own_settings"] = kept = {**kept, key: shown}

    @callback
    def forget_settings(self, entity_id: str, before: Thermostat, after: Thermostat, given_back: bool) -> None:
        """The fan or the vanes changed. Given back by Chauffage (`given_back`): done once the
        thermostat shows them. Changed by hand: they are the user's choice, kept from now on.
        A thermostat that goes offline, or comes back, shows no fan or another one: nothing is
        forgotten then."""
        if ignored(before) or ignored(after):
            return
        t = self._data["thermostats"].get(entity_id) or {}
        kept = dict(t.get("own_settings") or {})
        for key in EQUAL_KEYS:
            shown = getattr(after, key)
            if key in kept and shown != getattr(before, key) and (not given_back or shown == kept[key]):
                del kept[key]
        if kept != (t.get("own_settings") or {}):
            t["own_settings"] = kept
            self._save()
