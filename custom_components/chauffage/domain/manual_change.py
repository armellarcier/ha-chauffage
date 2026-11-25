"""What a change by hand on a thermostat means (docs/decisions.md, "A change by hand")."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ..const import HEAT_COOL, SETPOINT_MODES
from .target import RANGE_KEYS, SETPOINT_TARGET_KEYS, Target
from .thermostat import IGNORED_STATES, Thermostat, ignored, is_manual_preset, same_temperature


@dataclass(frozen=True)
class NoChange:
    """Nothing the schedule or the override asks changed."""


@dataclass(frozen=True)
class Resume:
    """The thermostat is back to what the schedule asks: the override ends."""


@dataclass(frozen=True)
class NewOverride:
    """The override the change makes."""

    target: Target


ManualChange = NoChange | Resume | NewOverride


def back_to(expected: Target, thermostat: Thermostat, preset_temperature: float | None = None) -> bool:
    """The thermostat does what the slot asks: its preset (or its temperature), or a manual
    setpoint at the temperature that preset gives on this thermostat."""
    if expected.satisfied_by(thermostat):
        return True
    return (
        expected.hvac_satisfied_by(thermostat) and "preset_mode" in expected and is_manual_preset(thermostat.preset)
        and same_temperature(thermostat.temperature, preset_temperature, thermostat)
    )


def setpoint_changed(before: Thermostat, after: Thermostat, by_user: bool) -> dict[str, Any] | None:
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


def shown_setpoint(thermostat: Thermostat) -> dict[str, Any] | None:
    """The setpoint a thermostat shows, as an override holds it: its preset, its range in
    heat/cool, or its temperature on its manual preset."""
    if not is_manual_preset(thermostat.preset):
        return {"preset_mode": thermostat.preset}
    if thermostat.state == HEAT_COOL and thermostat.supports_range:
        if thermostat.target_temp_low is None or thermostat.target_temp_high is None:
            return None
        return {key: getattr(thermostat, key) for key in RANGE_KEYS}
    return None if thermostat.temperature is None else {"temperature": thermostat.temperature}


def classify(
    before: Thermostat, after: Thermostat, *, by_user: bool, expected: Mapping[str, Any] | None = None,
    preset_temperature: float | None = None, override: Mapping[str, Any] | None = None,
) -> ManualChange:
    """What a change that is neither the integration's nor an automation's (the caller excludes
    those) means.

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
    Back to what the override asks changes nothing (NoChange): the override keeps its value and
    its end, even when the slot asks the same.
    A point back to what the slot asks leaves the override; with no point left, or the
    thermostat doing what the slot asks (`back_to`; `preset_temperature`: what the expected
    preset gives on this thermostat), the schedule resumes (Resume).
    Chauffage sends nothing for a change by hand.
    """
    if ignored(after) or before.state in IGNORED_STATES:
        return NoChange()
    mode_changed = after.state != before.state
    slot_sets_one = expected is None or any(key in expected for key in SETPOINT_TARGET_KEYS)
    change = None
    if after.state in SETPOINT_MODES and slot_sets_one:
        change = setpoint_changed(before, after, by_user) if before.state in SETPOINT_MODES else shown_setpoint(after)
    if not mode_changed and change is None:
        return NoChange()
    target = dict(override or {})
    if mode_changed:
        target["hvac_mode"] = after.state
    if after.state not in SETPOINT_MODES or change is not None:
        target = {key: value for key, value in target.items() if key not in SETPOINT_TARGET_KEYS} | (change or {})
    if override is not None and Target(target).same_as(override, after):
        return NoChange()
    if expected is None:
        return NewOverride(Target(target))
    expected = Target(expected)
    if target.get("hvac_mode") is not None and expected.hvac_satisfied_by(after):
        target.pop("hvac_mode")
    back = expected.hvac_satisfied_by(after) and (
        not any(key in target for key in SETPOINT_TARGET_KEYS) or back_to(expected, after, preset_temperature))
    return Resume() if back else NewOverride(Target(target))
