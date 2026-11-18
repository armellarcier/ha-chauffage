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

from .const import AIR_KEYS, AUTO, DRY, FAN_ONLY, HEAT_COOL, MANUAL_PRESETS, NO_PRESET_MODES, OFF, SETPOINT_MODES

IGNORED_STATES = frozenset({"unavailable", "unknown"})
DEFAULT_STEP = 0.5
# The HVAC modes that take no setpoint: a target that holds one and says no HVAC mode turns the
# thermostat on from them. Not auto: a valve in auto takes a setpoint, and keeps auto
IDLE = (OFF, FAN_ONLY, DRY)


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
    # The fan and the vanes of an air conditioner, as shown (#91)
    fan_mode: str | None = None
    swing_mode: str | None = None
    swing_horizontal_mode: str | None = None
    # Its HVAC mode as shown when `state` reads otherwise: "off" for a Versatile Thermostat
    # without requested_state that is off, read as on (#74). An off target is satisfied by it.
    shown: str | None = None
    # Heat/cool: whether it takes a range of temperatures (TARGET_TEMPERATURE_RANGE), and the
    # range it shows
    supports_range: bool = False
    target_temp_low: float | None = None
    target_temp_high: float | None = None


# The attributes of a target compared as they are, with the thermostat's field of the same name
EQUAL_KEYS = AIR_KEYS


SETPOINTS = ("temperature", "target_temp_low", "target_temp_high")


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
# (a target temperature), "target_temp_low" and "target_temp_high" (heat/cool), "hvac_mode". A
# slot's target says the slot's HVAC mode on this thermostat (`slot_hvac_mode`). The target of a
# preset holds its value for each HVAC mode (`value_on`): `complete` keeps the one of the HVAC
# mode it is sent in. A target without an HVAC mode (a heater's slot, an override to a preset)
# leaves the thermostat in the HVAC mode it has, or gets the one `on_mode` gives if it is off, in
# fan only or in dry (docs/decisions.md, "Scheduling").
Target = dict[str, Any]
SETPOINT_KEYS = ("preset_mode", "temperature")
# A preset's value when cooling, and in heat/cool: never sent as they are (see complete)
COOL_KEYS = ("cool_preset_mode", "cool_temperature")
RANGE_KEYS = ("target_temp_low", "target_temp_high")
TEMPERATURE_KEYS = ("temperature", "cool_temperature", *RANGE_KEYS)


def setpoint_modes(thermostat: Thermostat) -> list[str]:
    """The HVAC modes a slot on a preset may choose on a thermostat: heat, cool and heat/cool,
    the ones it lists. Heat/cool only when it takes a range of temperatures."""
    return [mode for mode in SETPOINT_MODES
            if mode in thermostat.hvac_modes and (mode != HEAT_COOL or thermostat.supports_range)]


def slot_hvac_mode(settings: Mapping[str, Any], thermostat: Thermostat | None) -> str | None:
    """The HVAC mode of a slot on a thermostat. Off, fan only, dry and auto are the slot's own.
    A slot on a preset keeps its HVAC mode when the thermostat can follow it (`setpoint_modes`).
    Otherwise, on a thermostat that cools, the slot heats, or cools when the thermostat does not
    heat: a week stored before #91 says no HVAC mode, and a day pasted from another thermostat
    may say one this thermostat does not list. A thermostat that only heats carries no HVAC
    mode: a heater with one HVAC mode never does, and a valve that also lists auto is left in
    the HVAC mode it has by a slot that says none. A thermostat whose HVAC modes are not known:
    as stored."""
    mode = settings.get("hvac_mode")
    if mode in NO_PRESET_MODES or thermostat is None or not thermostat.hvac_modes:
        return mode
    choices = setpoint_modes(thermostat)
    if mode in choices:
        several = len([m for m in thermostat.hvac_modes if m != OFF]) > 1
        return mode if several or mode != "heat" else None
    if choices in ([], ["heat"]):
        return None
    return "heat" if "heat" in choices else choices[0]


def week_on(week: list[list[list[Any]]], thermostat: Thermostat | None) -> list[list[list[Any]]]:
    """A week as it runs on a thermostat: each slot with its HVAC mode there (`slot_hvac_mode`).
    A slot that says heat and one that says nothing are then the same slot on an air
    conditioner: what compares two slots (the next different slot) reads this week."""
    def on(raw: list[Any]) -> list[Any]:
        settings = slot_on(slot_of(raw), thermostat).settings
        return [raw[0], raw[1], settings] if settings else [raw[0], raw[1]]

    return [[on(raw) for raw in day] for day in week]


def slot_on(slot: Slot | None, thermostat: Thermostat | None) -> Slot | None:
    """A slot as it runs on a thermostat: with its HVAC mode there (`slot_hvac_mode`)."""
    if slot is None:
        return None
    settings = {key: value for key, value in slot.settings.items() if key != "hvac_mode"}
    mode = slot_hvac_mode(slot.settings, thermostat)
    return Slot(slot.preset, {"hvac_mode": mode, **settings} if mode else settings)


def on_mode(thermostat: Thermostat, planned: str | None = None) -> str | None:
    """The HVAC mode to turn a thermostat on in, for a setpoint that says none (an override to a
    preset), as the card chooses the HVAC mode of an override: among the HVAC modes that take a
    setpoint (`setpoint_modes`), the one of the slot planned now (`planned`), else the one it
    runs in, else the first. In summer, an override to Comfort set by an automation during a
    cooling slot turns an air conditioner on in cool. Without one of them, its first HVAC mode
    but off, fan only and dry, for example auto. None when it lists none: a thermostat that
    only lists off and fan only is not turned on for a setpoint."""
    choices = setpoint_modes(thermostat)
    if planned in choices:
        return planned
    if thermostat.state in choices:
        return thermostat.state
    others = [mode for mode in thermostat.hvac_modes if mode not in IDLE]
    return (choices or others or [None])[0]


def needs_turning_on(target: Target, thermostat: Thermostat | None, planned: str | None = None) -> bool:
    """A target without an HVAC mode, on a thermostat that cannot follow it as it is: off, or in
    fan only or dry, while the target holds a setpoint (fan only and dry take none). A target
    without a setpoint turns nothing on: the slot of a preset that has no value on this
    thermostat has nothing to send. Not when the thermostat has no HVAC mode to be turned on
    in, nor when its state is not known yet."""
    if thermostat is None or not any(key in target for key in (*SETPOINT_KEYS, *COOL_KEYS, *RANGE_KEYS)):
        return False
    return thermostat.state in IDLE and on_mode(thermostat, planned) not in (None, thermostat.state)


def complete(target: Target, thermostat: Thermostat | None, by_user: bool = False,
             planned: str | None = None) -> Target:
    """The target to send. An off target is sent alone: no setpoint, so a thermostat turned on
    by hand keeps its own. A target without an HVAC mode gets the one to turn the thermostat on
    in when it is off, in fan only or in dry (see on_mode; `planned`: the HVAC mode of the slot
    planned now). A thermostat that heats or cools keeps its HVAC mode when the target says
    none: never a cooling air conditioner switched to heat.

    A preset's target holds its value for each HVAC mode (`value_on`). The one of the HVAC mode
    the target is sent in is kept. In cool, its cooling value replaces its heating one. In
    heat/cool, its range does. Without a value for that HVAC mode, no setpoint is sent: a
    heating temperature is never sent in cool (never 7 °C to an air conditioner, one that only
    cools included). A setpoint the user chose (`by_user`: an override without a Chauffage
    preset) is their target in any HVAC mode: sent (docs/decisions.md, "Presets")."""
    if target.get("hvac_mode") == OFF:
        return {"hvac_mode": OFF}
    out = {key: value for key, value in target.items() if key not in (*COOL_KEYS, *RANGE_KEYS)}
    if "hvac_mode" not in out and needs_turning_on(target, thermostat, planned):
        out["hvac_mode"] = on_mode(thermostat, planned)
    # A thermostat with no state yet, at a restart: the target is sent in the HVAC mode it says
    mode = out.get("hvac_mode") or (thermostat.state if thermostat is not None else None)
    value = None
    if mode == "cool":
        if "cool_temperature" in target:
            value = {"temperature": target["cool_temperature"]}
        elif "cool_preset_mode" in target:
            value = {"preset_mode": target["cool_preset_mode"]}
    elif mode == HEAT_COOL and all(key in target for key in RANGE_KEYS):
        value = {key: target[key] for key in RANGE_KEYS}
    if mode in ("cool", HEAT_COOL) and (value is not None or not by_user):
        out = {key: v for key, v in out.items() if key not in SETPOINT_KEYS}
    return {**out, **(value or {})}


def preset_to_leave(attributes: Target, thermostat: Thermostat | None) -> str | None:
    """The preset "none" to set before a setpoint is sent (`attributes`: what is sent), on a
    thermostat that lists it and shows another preset; None otherwise. A Daikin keeps its
    preset when it gets a setpoint: its eco preset would go on against the temperature asked.
    Set before the setpoint: a thermostat may give back an older setpoint when it leaves a
    preset. Not on a Versatile Thermostat, which goes to its manual preset by itself."""
    if thermostat is None or thermostat.vtherm or is_manual_preset(thermostat.preset):
        return None
    if "preset_mode" in attributes or not any(key in attributes for key in SETPOINTS):
        return None
    return next((preset for preset in thermostat.presets if preset.lower() == "none"), None)


def restored(target: Target | None, own: Mapping[str, str] | None) -> Target | None:
    """The target with the fan and the vanes to give back to the thermostat (`own`: what it had
    before a slot or an override chose others), for those the target does not choose. An off
    target is sent alone."""
    if target is None or not own or target.get("hvac_mode") == OFF:
        return target
    return {**{key: value for key, value in own.items() if key not in target}, **target}


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


def value_on(preset: dict[str, Any], cell: Mapping[str, Any] | None, thermostat: Thermostat | None,
             use_presets: bool = True) -> Target:
    """What a preset means on a thermostat, for each HVAC mode. The one place that says which
    HVAC modes a preset can be used in on a thermostat (`offered_modes` reads the result; the
    card reads it too, `presetModesOn`).

    - When heating ("preset_mode" or "temperature"): the value set by hand for this thermostat
      (`cell`), else the preset's default: the thermostat's climate preset named like the preset
      if it has one (and climate presets are used), else the preset's temperature. Nothing when
      the preset has no temperature when heating.
    - When cooling ("cool_temperature" or "cool_preset_mode"), on a thermostat that cools: the
      cooling temperature set by hand, else the climate preset set by hand (the thermostat reads
      it for the HVAC mode it runs in), else the preset's default, as when heating. Nothing when
      the preset has no temperature when cooling: frost protection never cools.
    - In heat/cool ("target_temp_low" and "target_temp_high"), on a thermostat that takes a
      range: the two temperatures, each one set by hand or the preset's, when it has both and
      the low one is under the high one once fitted to the thermostat. A climate preset is not
      used: the range needs numbers.
    Then the fan and the vanes set by hand. Temperatures are fitted to the thermostat."""
    cell = cell or {}
    own = preset["id"] if use_presets and thermostat and preset["id"] in thermostat.presets else None
    heat, cool = preset.get("temperature"), preset.get("cool_temperature")
    out: Target = {key: cell[key] for key in SETPOINT_KEYS if key in cell}
    if not out and heat is not None:
        out = {"preset_mode": own} if own else {"temperature": heat}
    if thermostat and "cool" in thermostat.hvac_modes:
        if "cool_temperature" in cell:
            out["cool_temperature"] = cell["cool_temperature"]
        elif "preset_mode" in cell:
            out["cool_preset_mode"] = cell["preset_mode"]
        elif cool is not None:
            out |= {"cool_preset_mode": own} if own else {"cool_temperature": cool}
    low, high = cell.get("temperature", heat), cell.get("cool_temperature", cool)
    if thermostat and HEAT_COOL in setpoint_modes(thermostat) and low is not None and high is not None:
        # Compared once fitted: two temperatures above the thermostat's maximum are not a range
        low, high = fit_temperature(low, thermostat), fit_temperature(high, thermostat)
        if low < high:
            out |= {"target_temp_low": low, "target_temp_high": high}
    out |= {key: value for key, value in cell.items() if key in EQUAL_KEYS}
    return fit(out, thermostat)


def offered_modes(value: Target) -> list[str]:
    """The HVAC modes a preset can be used in, from its value on a thermostat (`value_on`):
    those it has a value for."""
    has = {"heat": SETPOINT_KEYS, "cool": COOL_KEYS}
    modes = [mode for mode, keys in has.items() if any(key in value for key in keys)]
    return [*modes, HEAT_COOL] if all(key in value for key in RANGE_KEYS) else modes


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
    HVAC mode (`slot_hvac_mode`). Off: off, and nothing else. Fan only, dry and auto: the HVAC
    mode, with the slot's fan and vanes; nothing on a thermostat that does not list it (it is
    left as it is). Otherwise the preset says how warm, for each HVAC mode (`value_on`), then
    the slot's fan and vanes. The target says the slot's HVAC mode when the thermostat carries
    one."""
    mode = slot_hvac_mode(settings, thermostat) if settings is not None else None
    air = {key: value for key, value in (settings or {}).items() if key != "hvac_mode"}
    if mode == OFF:
        return {"hvac_mode": OFF}
    if mode in NO_PRESET_MODES:
        if thermostat is not None and mode not in thermostat.hvac_modes:
            return None
        return {"hvac_mode": mode, **air}
    preset = presets.get(preset_id) if preset_id else None
    if preset is None:
        return None
    target = {**value_on(preset, (mapping or {}).get(preset_id), thermostat, use_presets), **air}
    if mode and thermostat is not None and mode in thermostat.hvac_modes:
        target["hvac_mode"] = mode
    return target


def same_temperature(a: float | None, b: float | None, thermostat: Thermostat | None = None) -> bool:
    if a is None or b is None:
        return False
    step = (thermostat.step if thermostat else None) or DEFAULT_STEP
    return abs(a - b) < step / 2


def fit(target: Target, thermostat: Thermostat | None) -> Target:
    """The target with its temperatures fitted to the thermostat (limits, step)."""
    return {key: fit_temperature(value, thermostat) if key in TEMPERATURE_KEYS else value
            for key, value in target.items()}


def hvac_satisfied(target: Target, thermostat: Thermostat) -> bool:
    """The thermostat is in the target's HVAC mode (as read, or as shown: a VTherm read as on
    while it shows off satisfies an off target), or on when the target gives none: not off, and
    not in fan only or dry when the target holds a setpoint."""
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
    if any(key in target and not same_temperature(getattr(thermostat, key), target[key], thermostat) for key in RANGE_KEYS):
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
    return all(same_temperature(a[key], b[key], thermostat) if key in TEMPERATURE_KEYS else a[key] == b[key] for key in a)


# The keys of a target that hold its setpoint: a preset, a temperature or a range
SETPOINT_TARGET_KEYS = (*SETPOINT_KEYS, *COOL_KEYS, *RANGE_KEYS)


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
      slot sets one: the override takes it, in place of the setpoint it held.
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
    change = setpoint_changed(before, after, by_user) if after.state in SETPOINT_MODES and slot_sets_one else None
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
