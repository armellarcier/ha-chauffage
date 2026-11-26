"""Overrides: set, changed, ended, and told (events, log, logbook).

Every override starts and ends through `keep()` and `drop()`, with its source or its reason
(CONTRIBUTING.md, "Conventions", #49).
"""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, callback
from homeassistant.util import dt as dt_util

from .. import engine, model
from ..const import (
    DURATION,
    EVENT_OVERRIDE_END_CHANGED,
    EVENT_OVERRIDE_ENDED,
    EVENT_OVERRIDE_STARTED,
    MAX_MANUAL_OVERRIDE,
    MIN_MANUAL_OVERRIDE,
    NEXT_SLOT,
    NO_NEXT_SLOT,
)
from ..domain.plan import Resumed
from ..thermostats.gateway import describe

if TYPE_CHECKING:
    from ..runtime import ChauffageRuntime

_LOGGER = logging.getLogger(__name__)


class ThermostatFailed(Exception):
    """The thermostat could not be set to an override's value."""


class ThermostatPaused(model.InvalidData):
    """An override asked for a paused thermostat."""


def end_data(override: dict[str, Any]) -> dict[str, Any]:
    """An override's start and end in local time, and why it ends then if known (a change by
    hand, #83), for the events and the logbook."""
    out = {}
    for key in ("start", "end"):
        if when := engine.parse_datetime(override.get(key)):
            out[key] = dt_util.as_local(when).isoformat()
    if override.get("ends_at"):
        out["ends_at"] = override["ends_at"]
    return out


class OverrideService:
    """The overrides of the stored data (`runtime.data["overrides"]`, model.py)."""

    def __init__(self, runtime: ChauffageRuntime) -> None:
        self._runtime = runtime

    @property
    def _overrides(self) -> dict[str, dict[str, Any]]:
        return self._runtime.data["overrides"]

    async def set(self, entity_id: str, override: dict[str, Any] | None, *, source: str,
                  resend: bool = False, context: Context | None = None) -> None:
        """Create / change / extend (override) or remove (None) a thermostat's override, from the
        card or the service (`source`, told in the events with the `context` of the change;
        "thermostat" for a change on it back to the schedule).

        A temperature is fitted to the thermostat (limits, step). A new override or a new value
        is sent to the thermostat unless it already has it; a new end alone is not, unless
        `resend` (the service: an automation setting it again puts back a thermostat that lost
        it). ThermostatFailed, and nothing recorded, if the thermostat could not be reached; none
        on a paused thermostat."""
        runtime = self._runtime
        if entity_id not in runtime.scheduled:
            raise model.InvalidData(f"not scheduled: {entity_id}")
        if override is not None and runtime.is_paused(entity_id):
            raise ThermostatPaused(f"paused: {entity_id}")
        if override is None:
            if not self.drop(entity_id, source, context):
                return
            runtime._changed()
            await runtime.scheduler.apply(Resumed(entity_id, f"override ended ({source})"))
            return
        override = model.normalize_override(override)
        current = runtime.current(runtime.hass.states.get(entity_id))
        target = override["target"] = engine.fit(override["target"], current)
        before = self._overrides.get(entity_id)
        # Only a change by hand says why it ends then (record): not the card, not a service
        override.pop("ends_at", None)
        new_value = before is None or before["target"] != target
        left_alone = current is not None and engine.ignored(current)  # sent when it is back
        to_send = None
        if (new_value or resend) and not left_alone:
            to_send = runtime.needs(entity_id, target, current, by_user=not override.get("preset"))
        if to_send is not None and not await runtime.gateway.send(entity_id, to_send, f"override set by {source}"):
            raise ThermostatFailed(entity_id)
        self.keep(entity_id, override, source, context)
        runtime._changed()

    def refuse_lone_temperature(self, entity_id: str, override: Any) -> None:
        """Refuses a new override to a single temperature in heat/cool, on a thermostat that
        takes a range there, as chauffage.set_override does: the thermostat would refuse the
        temperature, and the override would do nothing. An override that already has this value
        keeps it: its end may still change."""
        target = override.get("target") if isinstance(override, dict) else None
        if (not isinstance(target, dict) or "temperature" not in target or override.get("preset")
                or any(key in target for key in engine.RANGE_KEYS)):
            return
        before = self._overrides.get(entity_id)
        current = self._runtime.current(self._runtime.hass.states.get(entity_id))
        if current is None or not current.supports_range or (before and before["target"] == engine.fit(target, current)):
            return
        if (target.get("hvac_mode") or current.state) == engine.HEAT_COOL:
            raise model.InvalidData(f"{entity_id} takes a range of temperatures in heat_cool, not a single temperature")

    def next_slot_end(self, entity_id: str, current: engine.Thermostat | None, plan: engine.Plan | None = None,
                      now: datetime | None = None) -> datetime | None:
        """The start of the next slot that changes the thermostat's target, as for a change by
        hand made now: at least MIN_MANUAL_OVERRIDE minutes away, within a week. None without one."""
        now, plan = now or dt_util.now(), plan or self._runtime.plan()
        not_before = dt_util.as_local(dt_util.as_utc(now) + timedelta(minutes=MIN_MANUAL_OVERRIDE))
        until = dt_util.as_local(dt_util.as_utc(now) + timedelta(minutes=MAX_MANUAL_OVERRIDE))
        return plan.next_change(entity_id, now, current, not_before=not_before, until=until)

    @callback
    def record(self, entity_id: str, override: dict[str, Any], context: Context | None = None) -> None:
        """The override of a change by hand, only recorded: the thermostat set it itself, and
        sending it back could undo a second change made meanwhile."""
        self.keep(entity_id, model.normalize_override(override), "thermostat", context)
        self._runtime._changed()

    def info(self, entity_id: str) -> dict[str, Any]:
        """A thermostat's override as automations see it (sensor, event): its target, the preset
        it was set to, its end in local time (None without override)."""
        override = self._overrides.get(entity_id) or {}
        end = engine.parse_datetime(override.get("end"))
        return {"target": override.get("target"), "preset": override.get("preset"),
                "end": dt_util.as_local(end).isoformat() if end else None}

    @callback
    def keep(self, entity_id: str, override: dict[str, Any], source: str, context: Context | None = None) -> None:
        """Records an override, and tells it: a new one or a new value as an override started,
        a new end alone as an end changed."""
        before = self._overrides.get(entity_id)
        self._overrides[entity_id] = override
        info = self.info(entity_id)
        bus = self._runtime.hass.bus
        if before is None or any(before.get(key) != override.get(key) for key in ("target", "preset")):
            _LOGGER.info("%s: override started by %s: %s until %s", entity_id, source, describe(override), info["end"])
            bus.async_fire(EVENT_OVERRIDE_STARTED, {"entity_id": entity_id, **info, "source": source,
                                                    **end_data(override)}, context=context)
        elif engine.parse_datetime(before.get("end")) != engine.parse_datetime(override.get("end")):
            _LOGGER.info("%s: override until %s, set by %s", entity_id, info["end"], source)
            bus.async_fire(EVENT_OVERRIDE_END_CHANGED, {"entity_id": entity_id, **info, "source": source,
                                                        **end_data(override)}, context=context)

    @callback
    def drop(self, entity_id: str, reason: str, context: Context | None = None) -> bool:
        """Removes a thermostat's override, and tells why; False if it had none."""
        override = self._overrides.pop(entity_id, None)
        if override is None:
            return False
        _LOGGER.info("%s: override ended (%s): %s", entity_id, reason, describe(override))
        self._runtime.hass.bus.async_fire(EVENT_OVERRIDE_ENDED, {"entity_id": entity_id, "reason": reason,
                                                                 **end_data(override)}, context=context)
        return True

    def new(self, target: engine.Target, minutes: int | None = None, end: datetime | None = None) -> dict[str, Any]:
        start = dt_util.now().replace(microsecond=0)
        # On the instant: wall-clock arithmetic is wrong in the hour repeated when summer time ends
        end = end or dt_util.as_local(dt_util.as_utc(start) + timedelta(minutes=minutes or self._runtime.override_duration))
        return {"target": dict(target), "start": start.isoformat(), "end": end.replace(microsecond=0).isoformat()}

    def manual(self, entity_id: str, target: engine.Target, current: engine.Thermostat | None) -> dict[str, Any]:
        """The override of a change by hand (#83), by the setting *End of a change by hand*, or
        *Turned off* for a thermostat turned off (#91): after the override duration
        (DURATION), at the next slot that changes the thermostat's target in the active schedule
        but at the latest after the duration (NEXT_SLOT_WITHIN_DURATION), or at that slot
        however far (NEXT_SLOT: a week later without one). A slot starting less than
        MIN_MANUAL_OVERRIDE minutes after the change does not count. Computed once, now: a
        schedule activated or a setting changed later does not move the end."""
        off = target.get("hvac_mode") == engine.OFF
        setting = self._runtime.off_override_end if off else self._runtime.manual_override_end
        unbounded = setting == NEXT_SLOT
        override = self.new(target, MAX_MANUAL_OVERRIDE if unbounded else None)
        if setting == DURATION:
            return override | {"ends_at": DURATION}
        # In the local time zone (not a fixed offset): the slots follow its DST changes
        start, end = (dt_util.as_local(engine.parse_datetime(override[key])) for key in ("start", "end"))
        # On the instant: wall-clock arithmetic is wrong in the hour repeated when summer time ends
        not_before = dt_util.as_local(dt_util.as_utc(start) + timedelta(minutes=MIN_MANUAL_OVERRIDE))
        slot = self._runtime.plan().next_change(entity_id, start, current, not_before=not_before, until=end)
        if slot is not None:
            return override | {"end": slot.isoformat(), "ends_at": NEXT_SLOT}
        return override | {"ends_at": NO_NEXT_SLOT if unbounded else DURATION}
