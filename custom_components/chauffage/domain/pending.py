"""Commands a thermostat applies late: a battery valve may take a command hours after it was sent
(docs/decisions.md, "Commands applied late")."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any

from .target import Target
from .thermostat import Thermostat, ignored
from .timeline import parse_datetime

PENDING_HOURS = 24  # a command a thermostat has not applied after a day is not waited for anymore


def applied_command(pending: list[Mapping[str, Any]], before: Thermostat | None, after: Thermostat) -> int | None:
    """Index of the latest command not applied yet that the thermostat has just taken (None: none).
    Only a change to it counts: a thermostat that already showed it (another report, its
    temperature) may still apply an older command."""
    if ignored(after):
        return None
    return next((i for i in range(len(pending) - 1, -1, -1)
                 if Target(pending[i]).satisfied_by(after) and not (before and Target(pending[i]).satisfied_by(before))),
                None)


def expired_commands(sent: list[Any], now: datetime) -> int:
    """How many of the oldest commands not applied yet (their ISO dates of sending, in order) are
    not waited for anymore."""
    limit = now - timedelta(hours=PENDING_HOURS)
    return next((i for i, date in enumerate(sent) if (d := parse_datetime(date)) is not None and d > limit),
                len(sent))
