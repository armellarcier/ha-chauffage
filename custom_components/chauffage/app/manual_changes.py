"""What Chauffage does when a scheduled thermostat changes (docs/decisions.md, "A change by hand").

Each step of `state_changed` has its own method: what the thermostat publishes, a thermostat back
online, a change Chauffage or an automation made, a command applied late, and a change by hand.
"""

from __future__ import annotations

import dataclasses
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.core import Event, EventStateChangedData, State, callback
from homeassistant.util import dt as dt_util

from .. import engine
from ..domain.manual_change import NoChange, Resume, classify
from ..domain.plan import Realign
from ..domain.thermostat import Thermostat, ignored
from ..thermostats.gateway import describe, local_time

if TYPE_CHECKING:
    from ..runtime import ChauffageRuntime

_LOGGER = logging.getLogger(__name__)


def _change(before: Thermostat, after: Thermostat) -> str:
    """What changed on a thermostat, for the log: its state, and the preset and the setpoint
    it was asked for, the ones the override is made of (#92)."""
    parts = [after.state]
    if before.preset or after.preset:
        parts.append(f"preset {before.preset} → {after.preset}")
    parts.append(f"setpoint {before.temperature} → {after.temperature}")
    return ", ".join(parts)


class ManualChanges:
    def __init__(self, runtime: ChauffageRuntime) -> None:
        self._runtime = runtime

    @callback
    def state_changed(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        self._published(old, new)
        # Paused thermostats are followed for their preset temperatures only
        if old is None or new is None or self._runtime.is_paused(new.entity_id):
            return
        runtime = self._runtime
        before, after = runtime.current(old), runtime.current(new)
        runtime.gateway.forget_settings(new.entity_id, before, after, given_back=runtime.gateway.is_own(new.context))
        applied = runtime.gateway.applied(new.entity_id, before, after)
        if ignored(before) and not ignored(after):
            self._back_online(old, new, before)
            return
        context = new.context
        # Changes made by the schedule, or by any automation / script, are not overrides
        if runtime.gateway.is_own(context) or context.parent_id is not None:
            return
        if applied and context.user_id is None:
            self._applied_late(new, applied)
            return
        self._by_hand(old, new, before, after)

    @callback
    def _published(self, old: State | None, new: State | None) -> None:
        """What the thermostat publishes and the card shows: the temperatures of its presets,
        and why it protects itself."""
        runtime = self._runtime
        if not runtime._learn(new) and (runtime.temperatures_of(old) != runtime.temperatures_of(new)
                                        or runtime.temperatures_of(old, cool=True) != runtime.temperatures_of(new, cool=True)
                                        or runtime._cause_of(old) != runtime._cause_of(new)):
            runtime._notify()

    @callback
    def _back_online(self, old: State, new: State, before: Thermostat) -> None:
        """Turned back on, back online, or ready after a restart: the thermostat may have missed
        slot changes, and never got the override set while it was away."""
        back = ignored(dataclasses.replace(before, ready=True))
        why = f"back from {old.state}" if back else "thermostat ready"
        runtime = self._runtime
        runtime.entry.async_create_task(runtime.hass, runtime.scheduler.realign(new.entity_id, why), "chauffage catch up")

    @callback
    def _applied_late(self, new: State, applied: dict[str, Any]) -> None:
        """On the device, a command sent earlier and applied late: not a change by hand (in
        doubt, no override). Set back once the thermostat has no newer command to apply."""
        runtime = self._runtime
        if runtime.gateway.pending(new.entity_id):
            then = "a newer command is not applied yet"
        else:
            then = "set back to its " + ("override" if new.entity_id in runtime.data["overrides"] else "slot")
            runtime.entry.async_create_task(runtime.hass, runtime.scheduler.realign(new.entity_id), "chauffage realign late")
        _LOGGER.info("%s: applied late a command sent at %s (%s): not an override, %s",
                     new.entity_id, local_time(applied["sent"]), describe(applied), then)

    @callback
    def _by_hand(self, old: State, new: State, before: Thermostat, after: Thermostat) -> None:
        """A change by hand: an override, the end of the override, or nothing (classify)."""
        runtime = self._runtime
        context = new.context
        plan = runtime.plan()
        slot, _ = plan.slot_at(new.entity_id, dt_util.now())
        expected = plan.target_of(new.entity_id, slot, after)
        if expected is not None:  # what the slot sends this thermostat now
            expected = engine.complete(expected, after)
        preset_temperature = runtime.preset_temperature(new, expected["preset_mode"], after.state == "cool") \
            if expected is not None and "preset_mode" in expected else None
        current = runtime.data["overrides"].get(new.entity_id)
        change = classify(before, after, by_user=context.user_id is not None, expected=expected,
                          preset_temperature=preset_temperature, override=current["target"] if current else None)
        if isinstance(change, NoChange):
            return
        _LOGGER.info("%s: changed %s (%s); the slot asks for %s: %s", new.entity_id,
                     "by a user" if context.user_id else "on the device", _change(before, after),
                     describe(expected) if expected else "nothing",
                     "back to its slot" if isinstance(change, Resume) else "an override")
        if isinstance(change, Resume):
            if new.entity_id in runtime.data["overrides"]:
                resume = runtime.overrides.set(new.entity_id, None, source="thermostat", context=context)
            else:  # turned back on without an override: it may have missed slots while off
                resume = runtime.scheduler.apply(Realign(frozenset({new.entity_id}), f"back from {old.state}"))
            runtime.entry.async_create_task(runtime.hass, resume, "chauffage resume")
            return
        target = dict(change.target)
        recorded = runtime.overrides.manual(new.entity_id, target, after)
        if current and current.get("preset") and all(
                target.get(key) == current["target"].get(key) for key in engine.SETPOINT_TARGET_KEYS):
            recorded["preset"] = current["preset"]  # its setpoint is still the preset's
        runtime.overrides.record(new.entity_id, recorded, context)
