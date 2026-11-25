"""Slots, days and weeks: what a schedule asks a thermostat, and when (docs/glossary.md).

Stored, a day is a list of [start "HH:MM", preset id] or [start, preset id, settings] slots, the
first one at "00:00", and a week is 7 days, Monday first (model.py).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, NamedTuple

from ..const import NO_PRESET_MODES, OFF
from .preset import Preset
from .target import Target
from .thermostat import Thermostat, setpoint_modes


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


def target_of(
    preset_id: str | None,
    presets: Mapping[str, Mapping[str, Any]],
    mapping: Mapping[str, Any] | None,
    thermostat: Thermostat | None,
    use_presets: bool = True,
    settings: Mapping[str, Any] | None = None,
) -> Target | None:
    """Target of a slot (its preset and its settings) for one thermostat, or of a preset alone
    (`settings` None: an override to a preset, which says no HVAC mode). The slot chooses the
    HVAC mode (`slot_hvac_mode`). Off: off, and nothing else. Fan only, dry and auto: the HVAC
    mode, with the slot's fan and vanes; nothing on a thermostat that does not list it (it is
    left as it is). Otherwise the preset says how warm, for each HVAC mode (`Preset.value_on`),
    then the slot's fan and vanes. The target says the slot's HVAC mode when the thermostat
    carries one."""
    mode = slot_hvac_mode(settings, thermostat) if settings is not None else None
    air = {key: value for key, value in (settings or {}).items() if key != "hvac_mode"}
    if mode == OFF:
        return Target({"hvac_mode": OFF})
    if mode in NO_PRESET_MODES:
        if thermostat is not None and mode not in thermostat.hvac_modes:
            return None
        return Target({"hvac_mode": mode, **air})
    stored = presets.get(preset_id) if preset_id else None
    if stored is None:
        return None
    value = Preset.from_stored(stored).value_on((mapping or {}).get(preset_id), thermostat, use_presets)
    target = {**value.attributes(), **air}
    if mode and thermostat is not None and mode in thermostat.hvac_modes:
        target["hvac_mode"] = mode
    return Target(target)


class Slot(NamedTuple):
    """What a slot asks for: a preset, and optional settings: its HVAC mode, the fan and the
    vanes of an air conditioner (#91). An off slot and a fan-only slot have no preset."""

    preset: str | None
    settings: dict[str, Any]

    @classmethod
    def from_stored(cls, raw: list[Any]) -> Slot:
        return cls(raw[1], raw[2] if len(raw) > 2 else {})

    def to_stored(self, start: str) -> list[Any]:
        return [start, self.preset, self.settings] if self.settings else [start, self.preset]

    def on(self, thermostat: Thermostat | None) -> Slot:
        """The slot as it runs on a thermostat: with its HVAC mode there (`slot_hvac_mode`)."""
        settings = {key: value for key, value in self.settings.items() if key != "hvac_mode"}
        mode = slot_hvac_mode(self.settings, thermostat)
        return Slot(self.preset, {"hvac_mode": mode, **settings} if mode else settings)


@dataclass(frozen=True)
class Day:
    """The slots of a day, by start time, the first one at 00:00."""

    slots: tuple[tuple[str, Slot], ...]

    @classmethod
    def from_stored(cls, raw: list[list[Any]]) -> Day:
        return cls(tuple((slot[0], Slot.from_stored(slot)) for slot in raw))

    def to_stored(self) -> list[list[Any]]:
        return [slot.to_stored(start) for start, slot in self.slots]

    def slot_at(self, hhmm: str) -> tuple[Slot | None, bool]:
        """The slot running at HH:MM, and whether it starts exactly then."""
        found, starts_now = None, False
        for start, slot in self.slots:
            if start <= hhmm:
                found, starts_now = slot, start == hhmm
        return found, starts_now


@dataclass(frozen=True)
class Week:
    """The 7 days of a thermostat's week in one schedule, Monday first."""

    days: tuple[Day, ...]

    @classmethod
    def from_stored(cls, raw: list[list[list[Any]]]) -> Week:
        return cls(tuple(Day.from_stored(day) for day in raw))

    def to_stored(self) -> list[list[list[Any]]]:
        return [day.to_stored() for day in self.days]

    def on(self, thermostat: Thermostat | None) -> Week:
        """The week as it runs on a thermostat: each slot with its HVAC mode there. A slot that
        says heat and one that says nothing are then the same slot on an air conditioner: what
        compares two slots (the next different slot) reads this week."""
        return Week(tuple(Day(tuple((start, slot.on(thermostat)) for start, slot in day.slots))
                          for day in self.days))
