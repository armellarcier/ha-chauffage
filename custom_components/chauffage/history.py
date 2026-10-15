"""History of the measured temperature, for the card (`chauffage/history`).

Home Assistant's history API sends every attribute of every recorded state of a thermostat:
`climate` is a "significant" domain (an attribute change is a change, `minimal_response` keeps
the attributes), so a week is megabytes, mostly attributes the card does not use (VTherm's power,
window…). The integration reads the recorder on the server instead, keeps only the measured and
target temperatures (the rows that change one of them), and keeps what it read in memory: a later
call only reads the minutes since.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from functools import partial
from typing import Any

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant, State
from homeassistant.util import dt as dt_util

# The recorder writes the states every few seconds: the last minute is read again next time
RECORDER_DELAY = timedelta(minutes=1)
# Rows kept in memory: the card shows 7 days (from midnight 6 days ago)
KEEP = timedelta(days=8)

# [time (s), measured temperature, target temperature]; None, None while the thermostat is unavailable
Row = list[Any]


def _number(value: Any) -> float | None:
    try:
        return None if value is None or isinstance(value, bool) else float(value)
    except (TypeError, ValueError):
        return None


def _row(state: State) -> Row:
    time = state.last_updated.timestamp()  # last_updated_timestamp: not in older HA versions
    if state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
        return [time, None, None]
    return [time, _number(state.attributes.get("current_temperature")), _number(state.attributes.get("temperature"))]


class TemperatureHistory:
    """Rows of each thermostat read from the recorder, from `_start` to `_until` (timestamps)."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._lock = asyncio.Lock()
        self._rows: dict[str, list[Row]] = {}
        self._start: dict[str, float] = {}
        self._until: dict[str, float] = {}

    async def read(self, entity_ids: list[str], start: datetime, end: datetime) -> dict[str, list[Row]]:
        """Rows from `start` (the state at `start` first) to `end`."""
        begin, finish = start.timestamp(), end.timestamp()
        async with self._lock:
            new = [e for e in entity_ids if self._start.get(e, finish) > begin]
            if new:
                await self._read(new, start, end, since=None)
            # The others since what was already read, grouped by time
            since: dict[float, list[str]] = {}
            for entity_id in entity_ids:
                if entity_id not in new and self._until[entity_id] < finish:
                    since.setdefault(self._until[entity_id], []).append(entity_id)
            for time, ids in since.items():
                await self._read(ids, dt_util.utc_from_timestamp(time), end, since=time)
            until = min(finish, (dt_util.utcnow() - RECORDER_DELAY).timestamp())
            for entity_id in entity_ids:
                self._until[entity_id] = max(self._until[entity_id], until)
            result = {entity_id: self._window(entity_id, begin, finish) for entity_id in entity_ids}
            for entity_id in entity_ids:
                self._forget(entity_id)
            return result

    async def _read(self, entity_ids: list[str], start: datetime, end: datetime, since: float | None) -> None:
        # Imported here: the integration is set up even without the recorder
        from homeassistant.components.recorder import get_instance, history  # noqa: PLC0415

        # A state recorded exactly at the start is neither "the state at the start" nor in the
        # period for the recorder: read from just before
        if since is None:
            start -= timedelta(seconds=1)
        states = await get_instance(self.hass).async_add_executor_job(partial(
            history.get_significant_states, self.hass, start, end, entity_ids,
            include_start_time_state=since is None, significant_changes_only=False,
        ))
        for entity_id in entity_ids:
            if since is None:
                self._rows[entity_id] = []
                self._start[entity_id] = self._until[entity_id] = start.timestamp() + 1
            else:
                # Rows read before the recorder had written everything: read again
                self._rows[entity_id] = [r for r in self._rows[entity_id] if r[0] <= since]
            rows = self._rows[entity_id]
            for state in states.get(entity_id, []):
                row = _row(state)
                if row[0] > (since or 0) and (not rows or rows[-1][1:] != row[1:]):
                    rows.append(row)

    def _window(self, entity_id: str, begin: float, finish: float) -> list[Row]:
        """The rows of a period, the one before it moved to its start."""
        rows = self._rows[entity_id]
        before = [r for r in rows if r[0] <= begin]
        result = [[begin, *before[-1][1:]]] if before else []
        return result + [r for r in rows if begin < r[0] <= finish]

    def _forget(self, entity_id: str) -> None:
        """Forgets the rows older than KEEP (the one before them is kept: the value at the start).
        Not the rows before a period asked: a card asks for the last minutes every 5 minutes, the
        next one opened for the whole week."""
        horizon = (dt_util.utcnow() - KEEP).timestamp()
        rows = self._rows[entity_id]
        old = sum(1 for r in rows if r[0] <= horizon)
        if old:
            rows[:] = rows[old - 1:]
            self._start[entity_id] = max(self._start[entity_id], horizon)
