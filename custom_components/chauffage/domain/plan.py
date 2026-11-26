"""What the thermostats follow, and which of them to set now (docs/decisions.md, "Scheduling")."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .slot import Day, Slot, target_of
from .target import Target
from .thermostat import Thermostat, ignored
from .timeline import parse_datetime, slots_after, utc


@dataclass(frozen=True)
class Forced:
    """Every thermostat is set to its slot: a schedule activated, weeks saved, HA started."""

    why: str


@dataclass(frozen=True)
class Tick:
    """The minute: the thermostats whose slot changed since the previous one (`since`; without
    it, whose slot starts now), and those whose override has just ended (`ended`)."""

    since: datetime | None = None
    ended: frozenset[str] = frozenset()


@dataclass(frozen=True)
class Resumed:
    """A thermostat whose override was removed."""

    entity_id: str
    why: str


@dataclass(frozen=True)
class Realign:
    """Thermostats to set to their slot: back online, resumed after a pause, a command applied
    late."""

    entity_ids: frozenset[str]
    why: str


ApplyReason = Forced | Tick | Resumed | Realign


def why_of(reason: ApplyReason, entity_id: str, retried: bool) -> str:
    """Why a thermostat is sent its slot, for the log."""
    if retried:
        return "retry after a failed command"
    if isinstance(reason, Tick):
        return "override ended (expired)" if entity_id in reason.ended else "new slot"
    return reason.why


def ended_overrides(overrides: Mapping[str, Any], now: datetime) -> list[str]:
    """Thermostats whose override has ended (or is unreadable)."""
    ended = []
    for entity_id, override in overrides.items():
        end = parse_datetime(override.get("end")) if isinstance(override, dict) else None
        if end is None or end <= now:
            ended.append(entity_id)
    return ended


@dataclass
class Plan:
    """The data a decision needs (the integration's stored data, see storage/schema.py)."""

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
        return Day.from_stored(week[now.weekday()]).slot_at(now.strftime("%H:%M"))

    def target_of(self, entity_id: str, slot: Slot | None, thermostat: Thermostat | None) -> Target | None:
        """What a slot means on a thermostat."""
        if slot is None:
            return None
        return target_of(slot.preset, self.presets, self.mappings.get(entity_id), thermostat, self.use_presets,
                         slot.settings)

    def sent_target_of(self, entity_id: str, slot: Slot | None, thermostat: Thermostat | None) -> Target | None:
        """What a slot sends a thermostat: what it means there, and the fan and the vanes the
        thermostat had before, when the slot chooses none."""
        target = self.target_of(entity_id, slot, thermostat)
        return None if target is None else target.with_own_settings(self.own_settings.get(entity_id))

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
            if utc(when) >= utc(until):
                return None
            target = self.target_of(entity_id, slot, thermostat)
            if target is None or target == previous:
                continue
            previous = target
            if utc(when) >= utc(not_before):
                return when
        return None


def due_targets(plan: Plan, now: datetime, thermostats: Mapping[str, Thermostat], reason: ApplyReason, *,
                retry: frozenset[str] = frozenset(),
                pending: Mapping[str, Mapping[str, Any]] | None = None) -> list[tuple[str, Target]]:
    """(thermostat, target) pairs to apply now, in schedule order.

    - Forced: every thermostat;
    - Tick: the thermostats whose slot changed since the previous check (a slot starting during
      a missed minute, or in the hour skipped by the change to summer time, is applied late
      rather than never), and those whose override just ended;
    - Resumed and Realign: the thermostats they name;
    - and always those whose last command failed (`retry`).
    Thermostats with an active override, unavailable or already as expected are left alone. Not
    one that still has another command to apply (`pending`, the last command sent to each
    thermostat that it does not show yet): it would apply that one later. A thermostat turned
    off gets its slot, which turns it on unless the slot says off (Target.completed_for)."""
    pending = pending or {}
    since = reason.since if isinstance(reason, Tick) else None
    ended = reason.ended if isinstance(reason, Tick) else frozenset()
    resumed = reason.entity_id if isinstance(reason, Resumed) else None
    named = {resumed} if resumed else reason.entity_ids if isinstance(reason, Realign) else frozenset()
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
        if since is not None:
            before = plan.slot_at(entity_id, since)[0]
            changed = (before.on(thermostat) if before else None) != slot.on(thermostat)
        else:
            changed = starts_now
        if not (isinstance(reason, Forced) or changed or entity_id in ended or entity_id in named or entity_id in retry):
            continue
        target = plan.sent_target_of(entity_id, slot, thermostat)
        if target is None or ignored(thermostat):
            continue
        target = target.completed_for(thermostat)
        # A device preset left on at the slot's temperature would still fight the setpoint
        if (target.satisfied_by(thermostat) and target.preset_to_leave(thermostat) is None
                and pending.get(entity_id, target) == target):
            continue
        out.append((entity_id, target))
    return out
