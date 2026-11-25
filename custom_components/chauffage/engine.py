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

from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from .const import AUTO, DRY, FAN_ONLY, HEAT_COOL, NO_PRESET_MODES, OFF, SETPOINT_MODES
from .domain.manual_change import NewOverride, Resume, classify
from .domain.preset import Preset
from .domain.preset_value import PresetValue
from .domain.slot import Day, Slot, Week, slot_hvac_mode, target_of
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
    "preset_value", "same_temperature", "setpoint_modes", "slot_hvac_mode", "temperature_value",
]


def parse_datetime(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


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


# ----- slots -----

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
            when = _first_instant_at((midnight + timedelta(days=offset)).replace(hour=hours, minute=minutes, fold=0))
            if _utc(when) <= _utc(now):
                # Now is in the second pass of the hour repeated when summer time ends: the slot
                # starts in that second pass too (its time of day is after now's)
                when = when.replace(fold=1)
            yield when, slot_of(raw)


def current_and_next(week: list[list[list[Any]]], now: datetime) -> tuple[Slot | None, Slot | None, datetime | None]:
    """The slot planned now, then the next different one and when it starts (within 7 days)."""
    current, _ = slot_at(week[now.weekday()], now.strftime("%H:%M"))
    for when, slot in slots_after(week, now):
        if slot != current:
            return current, slot, when
    return current, None, None


def ended_overrides(overrides: dict[str, Any], now: datetime) -> list[str]:
    """Thermostats whose override has ended (or is unreadable)."""
    ended = []
    for entity_id, override in overrides.items():
        end = parse_datetime(override.get("end")) if isinstance(override, dict) else None
        if end is None or end <= now:
            ended.append(entity_id)
    return ended


@dataclass
class Plan:
    """The data a decision needs (the integration's stored data, see model.py)."""

    weeks: dict[str, dict[str, Any]]
    schedule: str  # the active schedule
    presets: dict[str, dict[str, Any]]
    mappings: dict[str, dict[str, Any]]
    overrides: dict[str, Any]
    use_presets: bool = True
    # {thermostat: the fan and the vanes it had before a slot or an override chose others}
    own_settings: dict[str, dict[str, str]] = field(default_factory=dict)

    def week(self, entity_id: str) -> list[list[list[str]]] | None:
        """The thermostat's week in the active schedule (None: none, or not 7 days)."""
        week = self.weeks.get(entity_id, {}).get(self.schedule)
        return week if week and len(week) == 7 else None

    def slot_at(self, entity_id: str, now: datetime) -> tuple[Slot | None, bool]:
        week = self.week(entity_id)
        if week is None:
            return None, False
        return slot_at(week[now.weekday()], now.strftime("%H:%M"))

    def target_of(self, entity_id: str, slot: Slot | None, thermostat: Thermostat | None) -> Target | None:
        """What a slot means on a thermostat."""
        if slot is None:
            return None
        return resolve(slot.preset, self.presets, self.mappings.get(entity_id), thermostat, self.use_presets,
                       slot.settings)

    def sent_target_of(self, entity_id: str, slot: Slot | None, thermostat: Thermostat | None) -> Target | None:
        """What a slot sends a thermostat: what it means there, and the fan and the vanes the
        thermostat had before, when the slot chooses none (`restored`)."""
        return restored(self.target_of(entity_id, slot, thermostat), self.own_settings.get(entity_id))

    def expected(self, entity_id: str, now: datetime, thermostat: Thermostat | None) -> Target | None:
        slot, _ = self.slot_at(entity_id, now)
        return self.target_of(entity_id, slot, thermostat)

    def next_change(self, entity_id: str, now: datetime, thermostat: Thermostat | None, *,
                    not_before: datetime, until: datetime) -> datetime | None:
        """Start of the next slot that changes the thermostat's target, from `not_before` and
        before `until` (None: no such slot). A slot giving the same target as the slot before it
        changes nothing on the thermostat, so it does not count."""
        week = self.week(entity_id)
        if week is None:
            return None
        previous = self.expected(entity_id, now, thermostat)
        for when, slot in slots_after(week, now):
            if _utc(when) >= _utc(until):
                return None
            target = self.target_of(entity_id, slot, thermostat)
            if target is None or target == previous:
                continue
            previous = target
            if _utc(when) >= _utc(not_before):
                return when
        return None


def _first_instant_at(when: datetime) -> datetime:
    """The first instant the local clock shows `when` or later. `when` itself, unless it falls in
    the hour skipped when summer time starts: then the first minute after the jump, when slot_at
    gives that slot (2:30 → 3:00 summer time, not 3:30)."""
    wall = when.replace(tzinfo=None)
    if _utc(when).astimezone(when.tzinfo).replace(tzinfo=None) == wall:
        return when
    instant = _utc(when.replace(fold=1))  # before the jump, the clock shows an earlier time
    while instant.astimezone(when.tzinfo).replace(tzinfo=None) < wall:
        instant += timedelta(minutes=1)
    return instant.astimezone(when.tzinfo)


def _utc(when: datetime) -> datetime:
    """Datetimes sharing a time zone compare by wall-clock time: compare instants instead."""
    return when.astimezone(timezone.utc)


def targets(
    plan: Plan,
    now: datetime,
    thermostats: dict[str, Thermostat],
    *,
    force: bool = False,
    resumed: str | None = None,
    ended: frozenset[str] | list[str] = (),
    since: datetime | None = None,
    include: frozenset[str] | set[str] = frozenset(),
    pending: dict[str, Target] | None = None,
) -> list[tuple[str, Target]]:
    """(thermostat, target) pairs to apply now, in schedule order.

    - force: realign every thermostat (schedule activated, weeks saved, HA started);
    - otherwise only thermostats whose slot changed since the previous check (`since`; a slot
      starting during a missed minute, or in the hour skipped by the change to summer time, is
      applied late rather than never; without `since`, whose slot starts now), whose override
      just ended or was removed (resumed), or that must be realigned (`include`: back online,
      failed command);
    - thermostats with an active override, unavailable or already as expected are left alone.
      Not one that still has another command to apply (`pending`, the last command sent to each
      thermostat that it does not show yet): it would apply that one later. A thermostat turned
      off gets its slot, which turns it on unless the slot says off (`complete`).
    """
    pending = pending or {}
    out = []
    for entity_id in plan.weeks:
        if entity_id in plan.overrides and entity_id not in ended and entity_id != resumed:
            continue
        slot, starts_now = plan.slot_at(entity_id, now)
        thermostat = thermostats.get(entity_id)
        if slot is None or thermostat is None:
            continue
        # A slot that repeats the one before it (a day's first slot, eco after eco) changes
        # nothing: a thermostat turned off by a script at bedtime stays off (#77). Compared as
        # they run on the thermostat: on an air conditioner, a slot that says heat repeats one that
        # says nothing
        changed = (slot_on(plan.slot_at(entity_id, since)[0], thermostat) != slot_on(slot, thermostat)
                   if since is not None else starts_now)
        if not (force or changed or entity_id == resumed or entity_id in ended or entity_id in include):
            continue
        target = plan.sent_target_of(entity_id, slot, thermostat)
        if target is None or ignored(thermostat):
            continue
        target = complete(target, thermostat)
        # A device preset left on at the slot's temperature would still fight the setpoint
        if (satisfied(target, thermostat) and preset_to_leave(target, thermostat) is None
                and pending.get(entity_id, target) == target):
            continue
        out.append((entity_id, target))
    return out


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
