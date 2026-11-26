"""Scheduling logic, without Home Assistant (unit-tested directly).

The active schedule's weeks give a preset per slot; each preset becomes, for a given thermostat,
a target: a partial state of the thermostat, as a scene holds it (#91), with one of its climate
presets or a target temperature (a mapping set by hand, otherwise the default from its
capabilities). Vocabulary: docs/glossary.md.
See tests/integration/test_engine.py.

The value objects live in domain/. The functions here that take and return plain dictionaries
are facades over them, until their callers use the value objects (rewrite phase I7).
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any

from .const import AUTO, DRY, FAN_ONLY, HEAT_COOL, NO_PRESET_MODES, OFF, SETPOINT_MODES
from .domain.manual_change import NewOverride, Resume, classify
from .domain.plan import ApplyReason, Forced, Plan, Realign, Resumed, Tick, due_targets, ended_overrides
from .domain.preset import Preset
from .domain.preset_value import PresetValue
from .domain.slot import Day, Slot, Week, slot_hvac_mode, target_of
from .domain.timeline import current_and_next, parse_datetime, slots_after
from .domain.target import (
    COOL_KEYS,
    EQUAL_KEYS,
    RANGE_KEYS,
    SETPOINT_KEYS,
    SETPOINT_TARGET_KEYS,
    TEMPERATURE_KEYS,
    Target,
)
from .domain.thermostat import (
    DEFAULT_STEP,
    IDLE,
    IGNORED_STATES,
    SETPOINTS,
    Thermostat,
    fit_temperature,
    ignored,
    is_manual_preset,
    on_mode,
    preset_value,
    same_temperature,
    setpoint_modes,
    temperature_value,
)

__all__ = [
    "AUTO", "COOL_KEYS", "DEFAULT_STEP", "DRY", "EQUAL_KEYS", "FAN_ONLY", "HEAT_COOL", "IDLE", "IGNORED_STATES",
    "NO_PRESET_MODES", "OFF", "RANGE_KEYS", "SETPOINTS", "SETPOINT_KEYS", "SETPOINT_MODES", "SETPOINT_TARGET_KEYS",
    "TEMPERATURE_KEYS", "Slot", "Target", "Thermostat", "fit_temperature", "ignored", "is_manual_preset", "on_mode",
    "preset_value", "same_temperature", "setpoint_modes", "slot_hvac_mode", "temperature_value", "Plan",
    "current_and_next", "ended_overrides", "parse_datetime", "slots_after", "Week",
]




# ----- facades over domain/ -----

def week_on(week: list[list[list[Any]]], thermostat: Thermostat | None) -> list[list[list[Any]]]:
    """A week as it runs on a thermostat (Week.on)."""
    return Week.from_stored(week).on(thermostat).to_stored()


def slot_on(slot: Slot | None, thermostat: Thermostat | None) -> Slot | None:
    """A slot as it runs on a thermostat (Slot.on)."""
    return None if slot is None else slot.on(thermostat)


def complete(target: Mapping[str, Any], thermostat: Thermostat | None, by_user: bool = False,
             planned: str | None = None) -> dict[str, Any]:
    """The target to send (Target.completed_for)."""
    return dict(Target(target).completed_for(thermostat, by_user, planned))


def preset_to_leave(attributes: Mapping[str, Any], thermostat: Thermostat | None) -> str | None:
    return Target(attributes).preset_to_leave(thermostat)


def restored(target: Mapping[str, Any] | None, own: Mapping[str, str] | None) -> dict[str, Any] | None:
    return None if target is None else dict(Target(target).with_own_settings(own))


def value_on(preset: Mapping[str, Any], cell: Mapping[str, Any] | None, thermostat: Thermostat | None,
             use_presets: bool = True) -> dict[str, Any]:
    """What a preset means on a thermostat, for each HVAC mode (Preset.value_on)."""
    return Preset.from_stored(preset).value_on(cell, thermostat, use_presets).attributes()


def offered_modes(value: Mapping[str, Any]) -> list[str]:
    """The HVAC modes a preset can be used in, from its value on a thermostat (`value_on`)."""
    return PresetValue.from_target(value).offered_modes()


def resolve(preset_id: str | None, presets: Mapping[str, Mapping[str, Any]], mapping: Mapping[str, Any] | None,
            thermostat: Thermostat | None, use_presets: bool = True,
            settings: Mapping[str, Any] | None = None) -> dict[str, Any] | None:
    """Target of a slot for one thermostat, or of a preset alone (slot.target_of)."""
    target = target_of(preset_id, presets, mapping, thermostat, use_presets, settings)
    return None if target is None else dict(target)


def fit(target: Mapping[str, Any], thermostat: Thermostat | None) -> dict[str, Any]:
    return dict(Target(target).fitted_to(thermostat))


def hvac_satisfied(target: Mapping[str, Any], thermostat: Thermostat) -> bool:
    return Target(target).hvac_satisfied_by(thermostat)


def satisfied(target: Mapping[str, Any], thermostat: Thermostat) -> bool:
    return Target(target).satisfied_by(thermostat)


def same_target(a: Mapping[str, Any], b: Mapping[str, Any], thermostat: Thermostat | None = None) -> bool:
    return Target(a).same_as(b, thermostat)


def slot_of(raw: list[Any]) -> Slot:
    return Slot.from_stored(raw)


def slot_at(day: list[list[Any]], hhmm: str) -> tuple[Slot | None, bool]:
    """The slot running at HH:MM, and whether it starts exactly then (Day.slot_at)."""
    return Day.from_stored(day).slot_at(hhmm)


# ----- slots (domain/timeline.py, domain/plan.py) -----

def reason_of(*, force: bool = False, resumed: str | None = None, ended: frozenset[str] | list[str] | None = (),
              since: datetime | None = None, include: frozenset[str] | set[str] | None = frozenset(),
              why: str | None = None) -> ApplyReason:
    """The ApplyReason of the flags it replaces (the facades of engine.targets and runtime.apply)."""
    why = why or "new slot"
    if force:
        return Forced(why)
    if resumed is not None:
        return Resumed(resumed, why)
    if include:
        return Realign(frozenset(include), why)
    return Tick(since, frozenset(ended or ()))


def targets(plan: Plan, now: datetime, thermostats: dict[str, Thermostat], *, force: bool = False,
            resumed: str | None = None, ended: frozenset[str] | list[str] = (), since: datetime | None = None,
            include: frozenset[str] | set[str] = frozenset(),
            pending: dict[str, Target] | None = None) -> list[tuple[str, dict[str, Any]]]:
    """(thermostat, target) pairs to apply now (plan.due_targets), from the flags of before
    ApplyReason."""
    reason = reason_of(force=force, resumed=resumed, ended=ended, since=since, include=include)
    return [(entity_id, dict(target)) for entity_id, target in due_targets(plan, now, thermostats, reason, pending=pending)]


# ----- commands applied late -----

PENDING_HOURS = 24  # a command a thermostat has not applied after a day is not waited for anymore


def applied_command(pending: list[Target], before: Thermostat | None, after: Thermostat) -> int | None:
    """Index of the latest command not applied yet that the thermostat has just taken (None: none).
    Only a change to it counts: a thermostat that already showed it (another report, its
    temperature) may still apply an older command."""
    if ignored(after):
        return None
    return next((i for i in range(len(pending) - 1, -1, -1)
                 if satisfied(pending[i], after) and not (before and satisfied(pending[i], before))), None)


def expired_commands(sent: list[Any], now: datetime) -> int:
    """How many of the oldest commands not applied yet (their ISO dates of sending, in order) are
    not waited for anymore."""
    limit = now - timedelta(hours=PENDING_HOURS)
    return next((i for i, date in enumerate(sent) if (d := parse_datetime(date)) is not None and d > limit),
                len(sent))


# ----- manual changes -----

RESUME = "resume"  # back to what the schedule expects


def preset_temperature(attributes: dict[str, Any], preset: str, learned: dict[str, Any],
                       cool: bool = False) -> float | None:
    """Temperature a thermostat's own preset gives: Versatile Thermostat publishes them
    (preset_temperatures: {"eco_temp": …}), otherwise
    the one last read while the thermostat was on that preset (`learned`). `cool`: the one it
    gives when cooling (a Versatile Thermostat in AC mode: "eco_cool_temp"; `learned` while it
    cooled)."""
    published = attributes.get("preset_temperatures")
    key = f"{preset}_cool_temp" if cool else f"{preset}_temp"
    value = published.get(key) if isinstance(published, dict) else None
    return temperature_value(learned.get(preset) if value is None else value)


def manual_change(
    before: Thermostat, after: Thermostat, *, by_user: bool, expected: Target | None = None,
    preset_temperature: float | None = None, override: Target | None = None,
) -> dict[str, Any] | str | None:
    """What a change by hand means (manual_change.classify): the target of the override,
    RESUME, or None."""
    change = classify(before, after, by_user=by_user, expected=expected, preset_temperature=preset_temperature,
                      override=override)
    if isinstance(change, NewOverride):
        return dict(change.target)
    return RESUME if isinstance(change, Resume) else None
