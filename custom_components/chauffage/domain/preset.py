"""A preset (docs/glossary.md)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ..const import AIR_KEYS, HEAT_COOL
from .preset_value import SETPOINT_KEYS, PresetValue
from .thermostat import Thermostat, fit_temperature, setpoint_modes

TEMPERATURES = ("temperature", "cool_temperature")


def _fitted(part: dict[str, Any], thermostat: Thermostat | None) -> dict[str, Any]:
    return {key: fit_temperature(value, thermostat) if key in TEMPERATURES else value for key, value in part.items()}


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
        air = {key: value for key, value in cell.items() if key in AIR_KEYS}
        return PresetValue(_fitted(heat_value, thermostat), _fitted(cool_value, thermostat), range_, air)
