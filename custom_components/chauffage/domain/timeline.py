"""When slots start, in local time, through the changes to and from summer time."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

from .slot import Day, Slot


def parse_datetime(value: Any) -> datetime | None:
    """An ISO datetime with its time zone; None otherwise."""
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def utc(when: datetime) -> datetime:
    """Datetimes sharing a time zone compare by wall-clock time: compare instants instead."""
    return when.astimezone(timezone.utc)


def first_instant_at(when: datetime) -> datetime:
    """The first instant the local clock shows `when` or later. `when` itself, unless it falls in
    the hour skipped when summer time starts: then the first minute after the jump, when slot_at
    gives that slot (2:30 → 3:00 summer time, not 3:30)."""
    wall = when.replace(tzinfo=None)
    if utc(when).astimezone(when.tzinfo).replace(tzinfo=None) == wall:
        return when
    instant = utc(when.replace(fold=1))  # before the jump, the clock shows an earlier time
    while instant.astimezone(when.tzinfo).replace(tzinfo=None) < wall:
        instant += timedelta(minutes=1)
    return instant.astimezone(when.tzinfo)


def slots_after(week: list[list[list[Any]]], now: datetime) -> Iterator[tuple[datetime, Slot]]:
    """(start, slot) of the slots starting after now, for 7 days, in order. Every start is an
    instant after now."""
    hhmm = now.strftime("%H:%M")
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    for offset in range(8):
        for raw in week[(now.weekday() + offset) % 7]:
            start = raw[0]
            if offset == 0 and start <= hhmm:
                continue
            hours, minutes = (int(x) for x in start.split(":"))
            # Calendar arithmetic on the local date (DST changes keep the wall-clock time)
            when = first_instant_at((midnight + timedelta(days=offset)).replace(hour=hours, minute=minutes, fold=0))
            if utc(when) <= utc(now):
                # Now is in the second pass of the hour repeated when summer time ends: the slot
                # starts in that second pass too (its time of day is after now's)
                when = when.replace(fold=1)
            yield when, Slot.from_stored(raw)


def current_and_next(week: list[list[list[Any]]], now: datetime) -> tuple[Slot | None, Slot | None, datetime | None]:
    """The slot planned now, then the next different one and when it starts (within 7 days)."""
    current, _ = Day.from_stored(week[now.weekday()]).slot_at(now.strftime("%H:%M"))
    for when, slot in slots_after(week, now):
        if slot != current:
            return current, slot, when
    return current, None, None
