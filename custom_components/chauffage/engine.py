"""Scheduling logic, without Home Assistant (unit-tested directly).

Same rules as the package's automations ("programmes hebdomadaires" and "dérogation
manuelle"), see tests/integration/test_engine.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

from .const import MANUAL_PRESETS

IGNORED_STATES = frozenset({"off", "unavailable", "unknown"})


@dataclass(frozen=True)
class Thermostat:
    """What the scheduler needs to know about a climate entity."""

    state: str
    preset: str | None
    temperature: float | None


def preset_value(raw: Any) -> str | None:
    """preset_mode as text: some integrations (ZHA…) expose an Enum (<Preset.ECO: 'eco'>)."""
    if raw is None:
        return None
    if isinstance(raw, Enum):
        raw = raw.value
    return str(raw)


def temperature_value(raw: Any) -> float | None:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def parse_datetime(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def slot_at(day: list[list[str]], hhmm: str) -> tuple[str | None, bool]:
    """Preset of the slot running at HH:MM, and whether that slot starts exactly then."""
    preset, starts_now = None, False
    for start, slot_preset in day:
        if start <= hhmm:
            preset, starts_now = slot_preset, start == hhmm
    return preset, starts_now


def current_and_next(week: list[list[list[str]]], now: datetime) -> tuple[str | None, str | None, datetime | None]:
    """Preset planned now, then the next different one and when it starts (within 7 days)."""
    hhmm = now.strftime("%H:%M")
    current, _ = slot_at(week[now.weekday()], hhmm)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    for offset in range(8):
        day = (now.weekday() + offset) % 7
        for start, preset in week[day]:
            if offset == 0 and start <= hhmm:
                continue
            if preset != current:
                hours, minutes = (int(x) for x in start.split(":"))
                # Calendar arithmetic on the local date (DST changes keep the wall-clock time)
                when = (midnight + timedelta(days=offset)).replace(hour=hours, minute=minutes)
                return current, preset, when
    return current, None, None


def ended_overrides(overrides: dict[str, Any], now: datetime) -> list[str]:
    """Thermostats whose override has ended (or is unreadable)."""
    ended = []
    for entity_id, override in overrides.items():
        end = parse_datetime(override.get("end")) if isinstance(override, dict) else None
        if end is None or end <= now:
            ended.append(entity_id)
    return ended


def targets(
    schedules: dict[str, dict[str, Any]],
    mode: str,
    now: datetime,
    overrides: dict[str, Any],
    thermostats: dict[str, Thermostat],
    *,
    force: bool = False,
    resumed: str | None = None,
    ended: frozenset[str] | list[str] = (),
) -> list[tuple[str, str]]:
    """(thermostat, preset) pairs to apply now, in schedule order.

    - force: realign every thermostat (mode changed, schedules saved, HA started);
    - otherwise only thermostats whose slot starts now, whose override just ended, or whose
      override was removed (resumed);
    - thermostats with an active override, turned off, unavailable or already on the right
      preset are left alone.
    """
    hhmm = now.strftime("%H:%M")
    out = []
    for entity_id, modes in schedules.items():
        week = modes.get(mode)
        if not week or len(week) != 7:
            continue
        if entity_id in overrides and entity_id not in ended and entity_id != resumed:
            continue
        preset, starts_now = slot_at(week[now.weekday()], hhmm)
        thermostat = thermostats.get(entity_id)
        if preset is None or thermostat is None:
            continue
        if not (force or starts_now or entity_id == resumed or entity_id in ended):
            continue
        if thermostat.state in IGNORED_STATES or thermostat.preset == preset:
            continue
        out.append((entity_id, preset))
    return out


def manual_change(before: Thermostat, after: Thermostat, *, by_user: bool) -> tuple[str, Any] | None:
    """Override created by a manual change, as (kind, value), or None.

    The caller has already excluded changes made by the schedule or by an automation.
    - setpoint changed by hand: the thermostat switches to its manual preset (VTherm: "none");
    - preset picked by a user.
    """
    if after.state in IGNORED_STATES or before.state in ("unavailable", "unknown"):
        return None
    manual = after.preset is None or after.preset.lower() in MANUAL_PRESETS
    if manual and after.temperature is not None and (
        after.temperature != before.temperature or after.preset != before.preset
    ):
        return "temperature", after.temperature
    if not manual and after.preset != before.preset and by_user:
        return "preset", after.preset
    return None
