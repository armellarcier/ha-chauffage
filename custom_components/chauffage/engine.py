"""Scheduling logic, without Home Assistant (unit-tested directly).

The active schedule's weeks give a preset per slot; each preset becomes, for a given thermostat,
a target: a partial state of the thermostat, as a scene holds it (#91), with one of its climate
presets or a target temperature (a mapping set by hand, otherwise the default from its
capabilities). Vocabulary: docs/glossary.md.
See tests/integration/test_engine.py.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, NamedTuple

from .const import MANUAL_PRESETS

IGNORED_STATES = frozenset({"unavailable", "unknown"})
DEFAULT_STEP = 0.5
OFF = "off"
FAN_ONLY = "fan_only"
# The HVAC modes that take no setpoint: a slot on a preset turns the thermostat on from them
IDLE = (OFF, FAN_ONLY)
# The HVAC modes a slot or an override chooses between, and the only ones Chauffage learns and
# restarts a thermostat in: auto, heat/cool and dry are the thermostat's own business
HEAT_OR_COOL = ("heat", "cool")


@dataclass(frozen=True)
class Thermostat:
    """What the scheduler needs to know about a climate entity. `state` is its HVAC mode as
    asked: for a Versatile Thermostat that turned itself off, the one it was asked (#91)."""

    state: str
    preset: str | None
    temperature: float | None
    presets: tuple[str, ...] = field(default=())
    min_temp: float | None = None
    max_temp: float | None = None
    step: float | None = None
    vtherm: bool = False  # Versatile Thermostat
    ready: bool = True  # it shows a known state (see ready)
    hvac_modes: tuple[str, ...] = field(default=())
    last_hvac_mode: str | None = None  # the HVAC mode it last heated or cooled in (learned, stored)
    # The fan and the vanes of an air conditioner, as shown (#91)
    fan_mode: str | None = None
    swing_mode: str | None = None
    swing_horizontal_mode: str | None = None
    # Its HVAC mode as shown when `state` reads otherwise: "off" for a Versatile Thermostat
    # without requested_state that is off, read as on (#74). An off target is satisfied by it.
    shown: str | None = None


# The attributes of a target compared as they are, with the thermostat's field of the same name
EQUAL_KEYS = ("fan_mode", "swing_mode", "swing_horizontal_mode")


SETPOINTS = ("temperature", "target_temp_low", "target_temp_high")


def asked(attributes: Mapping[str, Any], vtherm: bool = False) -> tuple[str | None, str | None, float | None]:
    """The HVAC mode, the preset and the setpoint a thermostat was asked for. Versatile
    Thermostat may change them by itself: it turns off for an open window or its auto start/stop,
    and sets the frost setpoint for a window (#92). VTherm keeps what it was asked for in
    requested_state. Its target_temperature is the last manual setpoint, so it counts only on
    the manual preset. The HVAC mode is None without requested_state: the state says it."""
    preset = preset_value(attributes.get("preset_mode"))
    temperature = temperature_value(attributes.get("temperature"))
    requested = attributes.get("requested_state") if vtherm else None
    hvac_mode = None
    if isinstance(requested, Mapping) and requested.get("preset") is not None:
        preset = preset_value(requested["preset"])
        if is_manual_preset(preset):
            temperature = temperature_value(requested.get("target_temperature"))
    if isinstance(requested, Mapping) and requested.get("hvac_mode") is not None:
        hvac_mode = preset_value(requested["hvac_mode"])
    return hvac_mode, preset, temperature


# Why a Versatile Thermostat protects itself, as it says it: hvac_off_reason (moved into
# specific_states in VTherm 10.5, with values such as "hvac_off_auto_start_stop" or
# "hvac_off_window") while it is off, and its window manager while it keeps heating at the frost
# setpoint for an open window. For the card, which then does not read VTherm's attributes.
OFF_CAUSES = {"window": "window", "window_detection": "window", "auto_start_stop": "auto_start_stop"}


def cause(attributes: Mapping[str, Any], state: str) -> str | None:
    """"window" or "auto_start_stop" when the thermostat says it turned itself off for that, or
    "window" while it heats at the frost setpoint for its open window; None otherwise."""
    specific = attributes.get("specific_states") if isinstance(attributes.get("specific_states"), Mapping) else {}
    window = specific.get("window_manager") if isinstance(specific.get("window_manager"), Mapping) else attributes.get("window_manager")
    if isinstance(window, Mapping) and str(window.get("window_state")) == "on":
        return "window"
    if state != OFF:
        return None
    reason = specific.get("hvac_off_reason", attributes.get("hvac_off_reason"))
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


def ignored(thermostat: Thermostat) -> bool:
    """A thermostat left alone: unavailable or unknown, or not ready yet. Not one turned off:
    the schedule decides whether a thermostat is off (#91)."""
    return not thermostat.ready or thermostat.state in IGNORED_STATES


# What a thermostat should be set to: a partial state of the climate entity, as a scene holds it.
# Its keys are the climate attributes: "preset_mode" (one of its climate presets), "temperature"
# (a target temperature), "hvac_mode". A slot's target says the slot's HVAC mode on this
# thermostat (`slot_hvac_mode`): "off" or "fan_only" (alone, or with the fan and the vanes),
# "heat" or "cool" on an air conditioner, none on a heater. A target without an HVAC mode (a
# heater's slot, an override to a preset) leaves the thermostat in the HVAC mode it has, or gets
# the one `on_mode` gives if it is off or in fan only (docs/decisions.md, "Scheduling").
Target = dict[str, Any]
SETPOINT_KEYS = ("preset_mode", "temperature")


def slot_hvac_mode(settings: Mapping[str, Any], thermostat: Thermostat | None) -> str | None:
    """The HVAC mode of a slot on a thermostat. Off and fan only are the slot's own. On an air
    conditioner, every other slot heats or cools: a slot that says none is read as heat (a week
    stored before #91), and every slot cools on a thermostat that only cools. A heater never
    carries an HVAC mode. A thermostat whose HVAC modes are not known: as stored."""
    mode = settings.get("hvac_mode")
    if mode in IDLE or thermostat is None or not thermostat.hvac_modes:
        return mode
    if "cool" not in thermostat.hvac_modes:
        return None
    if "heat" not in thermostat.hvac_modes:
        return "cool"
    return "cool" if mode == "cool" else "heat"


def week_on(week: list[list[list[Any]]], thermostat: Thermostat | None) -> list[list[list[Any]]]:
    """A week as it runs on a thermostat: each slot with its HVAC mode there (`slot_hvac_mode`).
    A slot that says heat and one that says nothing are then the same slot on an air
    conditioner: what compares two slots (the next different slot) reads this week."""
    def on(raw: list[Any]) -> list[Any]:
        settings = dict(raw[2]) if len(raw) > 2 else {}
        mode = slot_hvac_mode(settings, thermostat)
        settings.pop("hvac_mode", None)
        if mode:
            settings = {"hvac_mode": mode, **settings}
        return [raw[0], raw[1], settings] if settings else [raw[0], raw[1]]

    return [[on(raw) for raw in day] for day in week]


def on_mode(thermostat: Thermostat) -> str | None:
    """The HVAC mode to turn a thermostat on in, for a setpoint that says none (an override to a
    preset): heat or cool, the one it last ran in if it still lists it, else heat, else its
    first HVAC mode but off and fan only (fan only when it has nothing else). None when it lists
    no HVAC mode. An air conditioner that cooled in July restarts in cool. Never in auto or dry
    because it was last seen there: a valve once in auto restarts in heat."""
    modes = [mode for mode in thermostat.hvac_modes if mode not in IDLE]
    if thermostat.last_hvac_mode in HEAT_OR_COOL and thermostat.last_hvac_mode in modes:
        return thermostat.last_hvac_mode
    if "heat" in modes:
        return "heat"
    if modes:
        return modes[0]
    return FAN_ONLY if FAN_ONLY in thermostat.hvac_modes else None


def needs_turning_on(target: Target, thermostat: Thermostat) -> bool:
    """A target without an HVAC mode, on a thermostat that cannot follow it as it is: off, or in
    fan only while the target holds a setpoint (fan only takes none). Not when the thermostat
    has no HVAC mode to be turned on in."""
    if thermostat.state == FAN_ONLY and not any(key in target for key in (*SETPOINT_KEYS, "cool_temperature")):
        return False
    return thermostat.state in IDLE and on_mode(thermostat) not in (None, thermostat.state)


def complete(target: Target, thermostat: Thermostat, by_user: bool = False) -> Target:
    """The target to send. An off target is sent alone: no setpoint, so a thermostat turned on
    by hand keeps its own. A target without an HVAC mode gets the one to turn the thermostat on
    in when it is off or in fan only (see on_mode). A thermostat that heats or cools keeps its
    HVAC mode when the target says none: never a cooling air conditioner switched to heat.

    In cool, the setpoint is the preset's cooling setpoint (`cool_temperature`, which replaces
    its preset and its temperature). Without one, a temperature is a heating value: it is never
    sent in cool (never 7 °C to an air conditioner, one that only cools included). Its climate
    preset is sent: the device knows what its own eco means in cool. Without either, no
    setpoint is sent. A temperature the user chose (`by_user`: an override without a Chauffage
    preset) is their cooling target: sent (docs/decisions.md, "Presets")."""
    if target.get("hvac_mode") == OFF:
        return {"hvac_mode": OFF}
    out = {key: value for key, value in target.items() if key != "cool_temperature"}
    if "hvac_mode" not in out and needs_turning_on(target, thermostat):
        out["hvac_mode"] = on_mode(thermostat)
    mode = out.get("hvac_mode") or thermostat.state
    if mode == "cool":
        if "cool_temperature" in target:
            out = {key: value for key, value in out.items() if key not in SETPOINT_KEYS}
            out["temperature"] = target["cool_temperature"]
        elif not by_user:
            out.pop("temperature", None)
    return out


def merge(base: Target, layer: Target | None) -> Target:
    """`layer` on top of `base`: a setpoint (a preset or a temperature) in the layer replaces
    the base's setpoint, the other attributes add up."""
    if not layer:
        return dict(base)
    if any(key in layer for key in SETPOINT_KEYS):
        base = {key: value for key, value in base.items() if key not in SETPOINT_KEYS}
    return {**base, **layer}


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
        return {"preset_mode": preset["id"]}
    return {"temperature": fit_temperature(preset["temperature"], thermostat)}


def resolve(
    preset_id: str | None,
    presets: dict[str, dict[str, Any]],
    mapping: dict[str, Any] | None,
    thermostat: Thermostat | None,
    use_presets: bool = True,
    settings: dict[str, Any] | None = None,
) -> Target | None:
    """Target of a slot (its preset and its settings) for one thermostat, or of a preset alone
    (`settings` None: an override to a preset, which says no HVAC mode). The slot chooses the
    HVAC mode (`slot_hvac_mode`). Off: off, and nothing else. Fan only: fan only, with the
    slot's fan and vanes; nothing on a thermostat that does not list fan only (it is left as it
    is). Otherwise the preset says how warm, in layers: its default (the thermostat's climate
    preset of the same name, or its temperature), then its value on this thermostat (the
    mapping set by hand), then the slot's fan and vanes. On an air conditioner the target says
    heat or cool; on a heater it says no HVAC mode."""
    mode = slot_hvac_mode(settings, thermostat) if settings is not None else None
    settings = settings or {}
    if mode == OFF:
        return {"hvac_mode": OFF}
    if mode == FAN_ONLY:
        if thermostat is not None and FAN_ONLY not in thermostat.hvac_modes:
            return None
        return dict(settings)
    preset = presets.get(preset_id) if preset_id else None
    if preset is None:
        return None
    air = {key: value for key, value in settings.items() if key != "hvac_mode"}
    target = merge(merge(default_target(preset, thermostat, use_presets), (mapping or {}).get(preset_id)), air)
    if mode and thermostat is not None and mode in thermostat.hvac_modes:
        target["hvac_mode"] = mode
    return fit(target, thermostat)


def same_temperature(a: float | None, b: float | None, thermostat: Thermostat | None = None) -> bool:
    if a is None or b is None:
        return False
    step = (thermostat.step if thermostat else None) or DEFAULT_STEP
    return abs(a - b) < step / 2


def fit(target: Target, thermostat: Thermostat | None) -> Target:
    """The target with its temperatures fitted to the thermostat (limits, step)."""
    return {key: fit_temperature(value, thermostat) if key in ("temperature", "cool_temperature") else value
            for key, value in target.items()}


def hvac_satisfied(target: Target, thermostat: Thermostat) -> bool:
    """The thermostat is in the target's HVAC mode (as read, or as shown: a VTherm read as on
    while it shows off satisfies an off target), or on when the target gives none: not off, and
    not in fan only when the target holds a setpoint."""
    if "hvac_mode" in target:
        return target["hvac_mode"] in (thermostat.state, thermostat.shown)
    return thermostat.state != OFF and not needs_turning_on(target, thermostat)


def satisfied(target: Target, thermostat: Thermostat) -> bool:
    """The thermostat shows every part of the target."""
    if not hvac_satisfied(target, thermostat):
        return False
    if "preset_mode" in target and thermostat.preset != target["preset_mode"]:
        return False
    if "temperature" in target and not same_temperature(thermostat.temperature, target["temperature"], thermostat):
        return False
    return all(getattr(thermostat, key) == target[key] for key in EQUAL_KEYS if key in target)


# ----- slots -----

class Slot(NamedTuple):
    """What a slot asks for: a preset, and optional settings: its HVAC mode, the fan and the
    vanes of an air conditioner (#91). An off slot and a fan-only slot have no preset. Stored as
    [start, preset] or [start, preset, settings]."""

    preset: str | None
    settings: dict[str, Any]


def slot_of(raw: list[Any]) -> Slot:
    return Slot(raw[1], raw[2] if len(raw) > 2 else {})


def slot_at(day: list[list[Any]], hhmm: str) -> tuple[Slot | None, bool]:
    """The slot running at HH:MM, and whether it starts exactly then."""
    slot, starts_now = None, False
    for raw in day:
        if raw[0] <= hhmm:
            slot, starts_now = slot_of(raw), raw[0] == hhmm
    return slot, starts_now


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
        # nothing: a thermostat turned off by a script at bedtime stays off (#77)
        changed = plan.slot_at(entity_id, since)[0] != slot if since is not None else starts_now
        if not (force or changed or entity_id == resumed or entity_id in ended or entity_id in include):
            continue
        target = plan.target_of(entity_id, slot, thermostat)
        if target is None or ignored(thermostat):
            continue
        target = complete(target, thermostat)
        if satisfied(target, thermostat) and pending.get(entity_id, target) == target:
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
    (preset_temperatures: {"eco_temp": …} since its version 10, eco_temp… before), otherwise
    the one last read while the thermostat was on that preset (`learned`). `cool`: the one it
    gives when cooling (a Versatile Thermostat in AC mode: "eco_cool_temp"; `learned` while it
    cooled)."""
    published = attributes.get("preset_temperatures")
    key = f"{preset}_cool_temp" if cool else f"{preset}_temp"
    value = published.get(key) if isinstance(published, dict) else attributes.get(key)
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


def same_target(a: Target, b: Target, thermostat: Thermostat | None = None) -> bool:
    """Two targets that set the thermostat alike (temperatures compared on its step)."""
    if set(a) != set(b):
        return False
    return all(same_temperature(a[key], b[key], thermostat) if key == "temperature" else a[key] == b[key] for key in a)


def manual_change(
    before: Thermostat, after: Thermostat, *, by_user: bool, expected: Target | None = None,
    preset_temperature: float | None = None, override: Target | None = None,
) -> Target | str | None:
    """What a change that is neither the integration's nor an automation's (the caller excludes
    those) means: the target of an override, RESUME, or None. docs/decisions.md, "Scheduling".

    Two gestures count: a preset picked by a user (not one the thermostat sets by itself, such
    as VTherm's safety mode), and a setpoint changed by a user or on the device (the thermostat
    on its manual preset: VTherm "none", none for the others). A setpoint change that keeps the
    preset is that preset's own temperature (VTherm preset temperatures): nothing.
    - Back to what the slot gives (`back_to`; `preset_temperature`: what the expected preset
      gives on this thermostat): RESUME, the override, if any, ends. Not when the override
      (`override`) already has that value: the thermostat comes back to it (an override holding
      the slot's value past the next slots).
    - Otherwise: an override to that preset, or to that setpoint. Not while the thermostat is
      off: it stays off, and keeps what the user set for when it is turned on.

    A third gesture: the HVAC mode changed, by a user or on the device (#91). Turned off during
    an "on" slot, or on during an off slot, or switched to another HVAC mode than the slot's: an
    override to that HVAC mode, with the preset or the setpoint changed in the same state if
    one was (climate.set_temperature with an HVAC mode writes both at once). Turned off: an
    override to off, alone. Back to an HVAC mode the slot accepts: RESUME, whatever the
    thermostat restarted on (the slot is applied). Heat to cool when the slot gives no HVAC
    mode is not a change: both are "on".
    """
    if ignored(after) or before.state in IGNORED_STATES:
        return None
    accepted = expected is not None and hvac_satisfied(expected, after)
    if after.state != before.state and accepted and not hvac_satisfied(expected, before):
        return RESUME
    switched = after.state != before.state and not accepted
    if after.state == OFF:
        return {"hvac_mode": OFF} if switched else None
    manual = is_manual_preset(after.preset)
    picked = after.preset != before.preset and not manual and by_user
    setpoint = manual and (
        after.preset != before.preset or not same_temperature(after.temperature, before.temperature, after)
    )
    changed = picked or (setpoint and after.temperature is not None)
    if not changed:
        return {"hvac_mode": after.state} if switched else None
    change = {"preset_mode": after.preset} if picked else {"temperature": after.temperature}
    if switched:
        return {"hvac_mode": after.state, **change}
    if expected is not None and back_to(expected, after, preset_temperature):
        held = override is not None and same_target(override, expected, after)
        return None if held else RESUME
    return change
