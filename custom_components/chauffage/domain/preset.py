"""A preset, and what it is worth on a thermostat (docs/glossary.md)."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from ..const import DEFAULT_PRESET_COLOR, DEFAULT_PRESET_TEMPERATURE, HEAT_COOL
from .errors import InvalidData
from .ids import unique_id
from .target import (
    COOL_KEYS,
    EQUAL_KEYS,
    RANGE_KEYS,
    SETPOINT_KEYS,
    VALUE_KEYS,
    Target,
    attributes_from_input,
)
from .thermostat import Thermostat, fit_temperature, setpoint_modes

COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def value_from_input(value: Any) -> dict[str, Any]:
    """A validated value of a preset on one thermostat, set by hand (VALUE_KEYS): one of its
    climate presets or a temperature, not both (when it heats), with an optional cooling setpoint
    (when it cools), fan and vanes. No HVAC mode: the slot chooses it."""
    out = attributes_from_input(value, VALUE_KEYS, "the value of a preset")
    if not out:
        raise InvalidData("the value of a preset needs a climate preset or a temperature")
    if "preset_mode" in out and "temperature" in out:
        raise InvalidData("the value of a preset is a climate preset or a temperature, not both")
    return out


def mapping_from_input(mapping: Any, preset_ids: set[str]) -> dict[str, dict[str, Any]]:
    """The mapping of one thermostat: {preset id: value} set by hand."""
    if not isinstance(mapping, dict):
        raise InvalidData("a mapping must be a dictionary")
    out: dict[str, dict[str, Any]] = {}
    for preset_id, value in mapping.items():
        if preset_id not in preset_ids:
            raise InvalidData(f"unknown preset: {preset_id}")
        try:
            out[preset_id] = value_from_input(value)
        except InvalidData as err:
            raise InvalidData(f"{preset_id}: {err}") from err
    return out


@dataclass(frozen=True)
class PresetValue:
    """What a preset is worth on one thermostat, for each HVAC mode, temperatures fitted to it:
    `heat` ({"preset_mode"} or {"temperature"}), `cool` ({"cool_preset_mode"} or
    {"cool_temperature"}), `range` (heat/cool: low and high), and the fan and the vanes (`air`).
    A part is empty when the preset has no value for that HVAC mode."""

    heat: Mapping[str, Any] = field(default_factory=dict)
    cool: Mapping[str, Any] = field(default_factory=dict)
    range: tuple[float, float] | None = None
    air: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def from_target(cls, target: Mapping[str, Any]) -> PresetValue:
        """The value held by a target (Target.completed_for picks the part to send)."""
        low, high = (target.get(key) for key in RANGE_KEYS)
        return cls({key: target[key] for key in SETPOINT_KEYS if key in target},
                   {key: target[key] for key in COOL_KEYS if key in target},
                   (low, high) if low is not None and high is not None else None,
                   {key: target[key] for key in EQUAL_KEYS if key in target})

    def offered_modes(self) -> list[str]:
        """The HVAC modes the preset can be used in: those it has a value for."""
        modes = [mode for mode, part in (("heat", self.heat), ("cool", self.cool)) if part]
        return [*modes, HEAT_COOL] if self.range is not None else modes

    def as_target(self) -> Target:
        range_ = dict(zip(RANGE_KEYS, self.range)) if self.range is not None else {}
        return Target({**self.heat, **self.cool, **range_, **self.air})


@dataclass(frozen=True)
class Preset:
    """A preset: a name, a color, and its default temperature when heating and when cooling
    (#91). Either temperature can be empty, not both. `cool_color` is the color of its cooling
    slots, when the user chose one: without it, the card derives a cool shade from `color`."""

    id: str
    name: str | None = None
    color: str | None = None
    temperature: float | None = None
    cool_temperature: float | None = None
    cool_color: str | None = None

    @classmethod
    def from_stored(cls, stored: Mapping[str, Any]) -> Preset:
        return cls(stored["id"], stored.get("name"), stored.get("color"), stored.get("temperature"),
                   stored.get("cool_temperature"), stored.get("cool_color"))

    @classmethod
    def from_input(cls, preset: Any, taken_ids: set[str]) -> Preset:
        """A validated preset; a new preset (no id) gets a unique id from its name."""
        if not isinstance(preset, dict):
            raise InvalidData("a preset must be a dictionary")
        name = str(preset.get("name", "")).strip()
        if not name:
            raise InvalidData("a preset needs a name")
        color = str(preset.get("color", DEFAULT_PRESET_COLOR))
        if not COLOR.match(color):
            raise InvalidData(f"invalid color: {color}")
        # Its default temperature when heating and when cooling: either can be empty, not both (#91)
        try:
            temperature = preset.get("temperature", DEFAULT_PRESET_TEMPERATURE)
            temperature = None if temperature is None else float(temperature)
            cool_temperature = None if preset.get("cool_temperature") is None else float(preset["cool_temperature"])
        except (TypeError, ValueError) as err:
            raise InvalidData("invalid temperature") from err
        if temperature is None and cool_temperature is None:
            raise InvalidData("a preset needs a temperature when heating or when cooling")
        cool_color = preset.get("cool_color")
        if cool_color is not None and not COLOR.match(str(cool_color)):
            raise InvalidData(f"invalid color: {cool_color}")
        return cls(str(preset.get("id") or unique_id(name, taken_ids)), name, color.lower(), temperature,
                   cool_temperature, None if cool_color is None else str(cool_color).lower())

    def to_stored(self) -> dict[str, Any]:
        out = {"id": self.id, "name": self.name, "color": self.color, "temperature": self.temperature}
        if self.cool_temperature is not None:
            out["cool_temperature"] = self.cool_temperature
        if self.cool_color is not None:
            out["cool_color"] = self.cool_color
        return out

    def value_on(self, cell: Mapping[str, Any] | None, thermostat: Thermostat | None,
                 use_presets: bool = True) -> PresetValue:
        """What the preset means on a thermostat, for each HVAC mode. The one place that says
        which HVAC modes a preset can be used in on a thermostat (the card reads it too,
        `presetModesOn`). `cell`: the value set by hand for this thermostat (its mapping).

        - When heating: the value set by hand, else the preset's default: the thermostat's
          climate preset named like the preset if it has one (and climate presets are used),
          else the preset's temperature. Nothing when the preset has no temperature when heating.
        - When cooling, on a thermostat that cools: the cooling temperature set by hand, else the
          climate preset set by hand (the thermostat reads it for the HVAC mode it runs in), else
          the preset's default, as when heating. Nothing when the preset has no temperature when
          cooling: frost protection never cools.
        - In heat/cool, on a thermostat that takes a range: the two temperatures, each one set by
          hand or the preset's, when it has both and the low one is under the high one once
          fitted to the thermostat. A climate preset is not used: the range needs numbers.
        Then the fan and the vanes set by hand. Temperatures are fitted to the thermostat."""
        cell = cell or {}
        own = self.id if use_presets and thermostat and self.id in thermostat.presets else None
        heat, cool = self.temperature, self.cool_temperature
        heat_value: dict[str, Any] = {key: cell[key] for key in SETPOINT_KEYS if key in cell}
        if not heat_value and heat is not None:
            heat_value = {"preset_mode": own} if own else {"temperature": heat}
        cool_value: dict[str, Any] = {}
        if thermostat and "cool" in thermostat.hvac_modes:
            if "cool_temperature" in cell:
                cool_value = {"cool_temperature": cell["cool_temperature"]}
            elif "preset_mode" in cell:
                cool_value = {"cool_preset_mode": cell["preset_mode"]}
            elif cool is not None:
                cool_value = {"cool_preset_mode": own} if own else {"cool_temperature": cool}
        range_ = None
        low, high = cell.get("temperature", heat), cell.get("cool_temperature", cool)
        if thermostat and HEAT_COOL in setpoint_modes(thermostat) and low is not None and high is not None:
            # Compared once fitted: two temperatures above the thermostat's maximum are not a range
            low, high = fit_temperature(low, thermostat), fit_temperature(high, thermostat)
            if low < high:
                range_ = (low, high)
        air = {key: value for key, value in cell.items() if key in EQUAL_KEYS}
        value = PresetValue(heat_value, cool_value, range_, air).as_target()
        return PresetValue.from_target(value.fitted_to(thermostat))
