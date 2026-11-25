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


def asked(attributes: Mapping[str, Any], vtherm: bool = False) -> tuple[str | None, str | None, float | None]:
    """The HVAC mode, the preset and the setpoint a thermostat was asked for. Versatile
    Thermostat may change them by itself: it turns off for an open window or its auto start/stop,
    and sets the frost setpoint for a window (#92). VTherm keeps what it was asked for in
    requested_state. Its target_temperature is the last manual setpoint, so it counts only on
    the manual preset, and only when it is known. The HVAC mode is None without requested_state:
    the state says it."""
    preset = preset_value(attributes.get("preset_mode"))
    temperature = temperature_value(attributes.get("temperature"))
    requested = attributes.get("requested_state") if vtherm else None
    hvac_mode = None
    if isinstance(requested, Mapping) and requested.get("preset") is not None:
        preset = preset_value(requested["preset"])
        target = temperature_value(requested.get("target_temperature"))
        if is_manual_preset(preset) and target is not None:
            temperature = target
    if isinstance(requested, Mapping) and requested.get("hvac_mode") is not None:
        hvac_mode = preset_value(requested["hvac_mode"])
    return hvac_mode, preset, temperature


# Why a Versatile Thermostat protects itself, as it says it in specific_states: hvac_off_reason
# (for example "hvac_off_auto_start_stop" or "hvac_off_window") while it is off, and its window
# manager while it keeps heating at the frost setpoint for an open window. For the card, which
# then does not read VTherm's attributes.
OFF_CAUSES = {"window": "window", "window_detection": "window", "auto_start_stop": "auto_start_stop"}


def cause(attributes: Mapping[str, Any], state: str) -> str | None:
    """"window" or "auto_start_stop" when the thermostat says it turned itself off for that, or
    "window" while it heats at the frost setpoint for its open window; None otherwise."""
    specific = attributes.get("specific_states") if isinstance(attributes.get("specific_states"), Mapping) else {}
    window = specific.get("window_manager")
    if isinstance(window, Mapping) and str(window.get("window_state")) == "on":
        return "window"
    if state != OFF:
        return None
    reason = specific.get("hvac_off_reason")
    return OFF_CAUSES.get(str(preset_value(reason) or "").removeprefix("hvac_off_"))


def ready(attributes: Mapping[str, Any], vtherm: bool = False) -> bool:
    """Whether a thermostat shows a known state: a setpoint or a preset. At a restart, a
    thermostat may write a first state before it has restored its own: Versatile Thermostat
    writes `off` without setpoint or preset, and builds its presets once Home Assistant has
    started. A command sent then would be a temperature instead of its preset (#93). VTherm 9
    and later also say when they are not ready (is_ready)."""
    if vtherm and attributes.get("is_ready") is False:
        return False
    return any(attributes.get(key) is not None for key in (*SETPOINTS, "preset_mode"))


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


def back_to(expected: Target, thermostat: Thermostat, preset_temperature: float | None = None) -> bool:
    """The thermostat does what the slot asks: its preset (or its temperature), or a manual
    setpoint at the temperature that preset gives on this thermostat."""
    if satisfied(expected, thermostat):
        return True
    return (
        hvac_satisfied(expected, thermostat) and "preset_mode" in expected and is_manual_preset(thermostat.preset)
        and same_temperature(thermostat.temperature, preset_temperature, thermostat)
    )


def setpoint_changed(before: Thermostat, after: Thermostat, by_user: bool) -> Target | None:
    """The setpoint a person changed on a thermostat that stays in one HVAC mode, or None: a
    preset picked by a user (not one the thermostat sets by itself, such as VTherm's safety
    mode), a temperature set on the thermostat's manual preset (VTherm "none", none for the
    others), or a range in heat/cool on a thermostat that takes one. A preset's own temperature
    changed (VTherm preset temperatures) is not a change."""
    if after.preset != before.preset and not is_manual_preset(after.preset) and by_user:
        return {"preset_mode": after.preset}
    if after.state == HEAT_COOL and after.supports_range:
        if after.target_temp_low is None or after.target_temp_high is None or all(
                same_temperature(getattr(after, key), getattr(before, key), after) for key in RANGE_KEYS):
            return None
        return {key: getattr(after, key) for key in RANGE_KEYS}
    if is_manual_preset(after.preset) and after.temperature is not None and (
            after.preset != before.preset or not same_temperature(after.temperature, before.temperature, after)):
        return {"temperature": after.temperature}
    return None


def shown_setpoint(thermostat: Thermostat) -> Target | None:
    """The setpoint a thermostat shows, as an override holds it: its preset, its range in
    heat/cool, or its temperature on its manual preset."""
    if not is_manual_preset(thermostat.preset):
        return {"preset_mode": thermostat.preset}
    if thermostat.state == HEAT_COOL and thermostat.supports_range:
        if thermostat.target_temp_low is None or thermostat.target_temp_high is None:
            return None
        return {key: getattr(thermostat, key) for key in RANGE_KEYS}
    return None if thermostat.temperature is None else {"temperature": thermostat.temperature}


def manual_change(
    before: Thermostat, after: Thermostat, *, by_user: bool, expected: Target | None = None,
    preset_temperature: float | None = None, override: Target | None = None,
) -> Target | str | None:
    """What a change that is neither the integration's nor an automation's (the caller excludes
    those) means: the target of the override, RESUME, or None. docs/decisions.md, "A change by
    hand".

    A slot sets an HVAC mode and, in an HVAC mode that heats or cools, a setpoint (`expected`:
    what it sends this thermostat now). A change by hand of what the slot sets is an override
    on that point, added to the override in force (`override`):
    - the HVAC mode changed: the override takes it. Off, fan only, dry and auto take no
      setpoint, so the override then holds none;
    - the setpoint changed (`setpoint_changed`), in an HVAC mode that takes one and when the
      slot sets one: the override takes it, in place of the setpoint it held. A thermostat
      turned from an HVAC mode without a setpoint (off…) to one with a setpoint shows one: the
      override takes it (`shown_setpoint`).
    One change may hold both: the override takes what the thermostat shows.
    Back to what the override asks changes nothing (None): the override keeps its value and
    its end, even when the slot asks the same.
    A point back to what the slot asks leaves the override; with no point left, or the
    thermostat doing what the slot asks (`back_to`; `preset_temperature`: what the expected
    preset gives on this thermostat), the schedule resumes (RESUME).
    Chauffage sends nothing for a change by hand.
    """
    if ignored(after) or before.state in IGNORED_STATES:
        return None
    mode_changed = after.state != before.state
    slot_sets_one = expected is None or any(key in expected for key in SETPOINT_TARGET_KEYS)
    change = None
    if after.state in SETPOINT_MODES and slot_sets_one:
        change = setpoint_changed(before, after, by_user) if before.state in SETPOINT_MODES else shown_setpoint(after)
    if not mode_changed and change is None:
        return None
    target = dict(override or {})
    if mode_changed:
        target["hvac_mode"] = after.state
    if after.state not in SETPOINT_MODES or change is not None:
        target = {key: value for key, value in target.items() if key not in SETPOINT_TARGET_KEYS} | (change or {})
    if override is not None and same_target(target, override, after):
        return None
    if expected is None:
        return target
    if target.get("hvac_mode") is not None and hvac_satisfied(expected, after):
        target.pop("hvac_mode")
    back = hvac_satisfied(expected, after) and (
        not any(key in target for key in SETPOINT_TARGET_KEYS) or back_to(expected, after, preset_temperature))
    if back:
        return RESUME
    return target
