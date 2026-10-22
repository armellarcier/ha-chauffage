"""Scheduling logic, without Home Assistant (unit-tested directly).

The active schedule's weeks give a preset per slot; each preset becomes, for a given thermostat,
one of its climate presets or a target temperature (a mapping set by hand, otherwise the default
from its capabilities). Vocabulary: docs/glossary.md.
See tests/integration/test_engine.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

from .const import MANUAL_PRESETS

IGNORED_STATES = frozenset({"off", "unavailable", "unknown"})
DEFAULT_STEP = 0.5


@dataclass(frozen=True)
class Thermostat:
    """What the scheduler needs to know about a climate entity."""

    state: str
    preset: str | None
    temperature: float | None
    presets: tuple[str, ...] = field(default=())
    min_temp: float | None = None
    max_temp: float | None = None
    step: float | None = None


@dataclass(frozen=True)
class Target:
    """What a thermostat should be set to: a preset, or a target temperature."""

    kind: str  # "preset" | "temperature"
    value: Any

    def as_dict(self) -> dict[str, Any]:
        return {self.kind: self.value}


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


def is_manual_preset(preset: str | None) -> bool:
    return preset is None or preset.lower() in MANUAL_PRESETS


# ----- presets → targets -----

def fit_temperature(value: float, thermostat: Thermostat | None) -> float:
    """A temperature the thermostat accepts: within its limits, on its step."""
    step = (thermostat.step if thermostat else None) or DEFAULT_STEP
    value = round(round(value / step) * step, 2)
    if thermostat and thermostat.min_temp is not None:
        value = max(value, thermostat.min_temp)
    if thermostat and thermostat.max_temp is not None:
        value = min(value, thermostat.max_temp)
    return value


def default_target(preset: dict[str, Any], thermostat: Thermostat | None, use_presets: bool = True) -> Target:
    """The thermostat's climate preset named like the preset if it has one (and climate presets
    are used), else the preset's temperature."""
    if use_presets and thermostat and preset["id"] in thermostat.presets:
        return Target("preset", preset["id"])
    return Target("temperature", fit_temperature(preset["temperature"], thermostat))


def resolve(
    preset_id: str | None,
    presets: dict[str, dict[str, Any]],
    mapping: dict[str, Any] | None,
    thermostat: Thermostat | None,
    use_presets: bool = True,
) -> Target | None:
    """Target of a preset for one thermostat: its mapping set by hand, else the default."""
    preset = presets.get(preset_id) if preset_id else None
    if preset is None:
        return None
    explicit = (mapping or {}).get(preset_id)
    if explicit and "preset" in explicit:
        return Target("preset", explicit["preset"])
    if explicit and "temperature" in explicit:
        return Target("temperature", fit_temperature(explicit["temperature"], thermostat))
    return default_target(preset, thermostat, use_presets)


def same_temperature(a: float | None, b: float | None, thermostat: Thermostat | None = None) -> bool:
    if a is None or b is None:
        return False
    step = (thermostat.step if thermostat else None) or DEFAULT_STEP
    return abs(a - b) < step / 2


def satisfied(target: Target, thermostat: Thermostat) -> bool:
    if target.kind == "preset":
        return thermostat.preset == target.value
    return same_temperature(thermostat.temperature, target.value, thermostat)


# ----- slots -----

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


@dataclass
class Plan:
    """The data a decision needs (the integration's stored data, see model.py)."""

    weeks: dict[str, dict[str, Any]]
    schedule: str  # the active schedule
    presets: dict[str, dict[str, Any]]
    mappings: dict[str, dict[str, Any]]
    overrides: dict[str, Any]
    use_presets: bool = True

    def preset_at(self, entity_id: str, now: datetime) -> tuple[str | None, bool]:
        week = self.weeks.get(entity_id, {}).get(self.schedule)
        if not week or len(week) != 7:
            return None, False
        return slot_at(week[now.weekday()], now.strftime("%H:%M"))

    def expected(self, entity_id: str, now: datetime, thermostat: Thermostat | None) -> Target | None:
        preset, _ = self.preset_at(entity_id, now)
        return resolve(preset, self.presets, self.mappings.get(entity_id), thermostat, self.use_presets)


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
) -> list[tuple[str, Target]]:
    """(thermostat, target) pairs to apply now, in schedule order.

    - force: realign every thermostat (schedule activated, weeks saved, HA started);
    - otherwise only thermostats whose preset changed since the previous check (`since`; a slot
      starting during a missed minute, or in the hour skipped by the change to summer time, is
      applied late rather than never), whose slot starts now, whose override just ended or was
      removed (resumed), or that must be realigned (`include`: back online, failed command);
    - thermostats with an active override, turned off, unavailable or already as expected are
      left alone.
    """
    out = []
    for entity_id in plan.weeks:
        if entity_id in plan.overrides and entity_id not in ended and entity_id != resumed:
            continue
        preset, starts_now = plan.preset_at(entity_id, now)
        thermostat = thermostats.get(entity_id)
        if preset is None or thermostat is None:
            continue
        changed = starts_now or (since is not None and plan.preset_at(entity_id, since)[0] != preset)
        if not (force or changed or entity_id == resumed or entity_id in ended or entity_id in include):
            continue
        target = resolve(preset, plan.presets, plan.mappings.get(entity_id), thermostat, plan.use_presets)
        if target is None or thermostat.state in IGNORED_STATES or satisfied(target, thermostat):
            continue
        out.append((entity_id, target))
    return out


# ----- manual changes -----

RESUME = ("resume", None)  # back to what the schedule expects


def preset_temperature(attributes: dict[str, Any], preset: str, learned: dict[str, Any]) -> float | None:
    """Temperature a thermostat's own preset gives: Versatile Thermostat publishes them
    (preset_temperatures: {"eco_temp": …} since its version 10, eco_temp… before), otherwise
    the one last read while the thermostat was on that preset (`learned`)."""
    published = attributes.get("preset_temperatures")
    key = f"{preset}_temp"
    value = published.get(key) if isinstance(published, dict) else attributes.get(key)
    return temperature_value(learned.get(preset) if value is None else value)


def back_to(expected: Target, thermostat: Thermostat, preset_temperature: float | None = None) -> bool:
    """The thermostat does what the slot asks: its preset (or its temperature), or a manual
    setpoint at the temperature that preset gives on this thermostat."""
    if satisfied(expected, thermostat):
        return True
    return (
        expected.kind == "preset" and is_manual_preset(thermostat.preset)
        and same_temperature(thermostat.temperature, preset_temperature, thermostat)
    )


def manual_change(
    before: Thermostat, after: Thermostat, *, by_user: bool, expected: Target | None = None,
    preset_temperature: float | None = None, override: Target | None = None,
) -> tuple[str, Any] | None:
    """Override created by a change that is neither the integration's nor an automation's
    (the caller excludes those), as (kind, value), RESUME, or None.

    Going back to what the schedule expects (`back_to`; `preset_temperature`: what the expected
    preset gives on this thermostat) resumes it (RESUME: the override, if any, ends), with the
    same rules as overrides: a preset picked by a user, or a setpoint changed by a user or on
    the device. Not when the override (`override`) already has that value: the thermostat
    comes back to it (an override holding the slot's value past the next slots).
    Otherwise, judged against what the schedule expects (`expected`):
    - temperature expected: any new setpoint that differs from it is a temperature override; a
      preset picked by a user is a preset override; a preset the thermostat sets by itself
      (VTherm safety mode…) is not an override;
    - preset expected (or nothing known): the thermostat switches to its manual preset (VTherm:
      "none") on a setpoint changed by hand → temperature override; a preset picked by a user →
      preset override. A setpoint change that keeps the preset is that preset's own
      temperature (VTherm preset temperatures): not an override.
    """
    if after.state in IGNORED_STATES or before.state in ("unavailable", "unknown"):
        return None
    manual = is_manual_preset(after.preset)
    picked = after.preset != before.preset and not manual and by_user
    setpoint = manual and (
        after.preset != before.preset or not same_temperature(after.temperature, before.temperature, after)
    )
    if expected is not None and (picked or setpoint) and back_to(expected, after, preset_temperature):
        held = override is not None and override.kind == expected.kind and (
            override.value == expected.value
            or (expected.kind == "temperature" and same_temperature(override.value, expected.value, after))
        )
        return None if held else RESUME
    if expected is not None and expected.kind == "temperature":
        if after.preset != before.preset and not manual:
            return ("preset", after.preset) if by_user else None
        if after.temperature is None or same_temperature(after.temperature, expected.value, after):
            return None
        if after.temperature != before.temperature or after.preset != before.preset:
            return "temperature", after.temperature
        return None
    if manual and after.temperature is not None and (
        after.temperature != before.temperature or after.preset != before.preset
    ):
        return "temperature", after.temperature
    if not manual and after.preset != before.preset and by_user:
        return "preset", after.preset
    return None
