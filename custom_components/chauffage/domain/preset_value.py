"""What a preset is worth on one thermostat, for each HVAC mode (docs/glossary.md)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from ..const import AIR_KEYS, HEAT_COOL

SETPOINT_KEYS = ("preset_mode", "temperature")
# A preset's value when cooling: never sent as it is (see PresetValue.setpoint_in)
COOL_KEYS = ("cool_preset_mode", "cool_temperature")
RANGE_KEYS = ("target_temp_low", "target_temp_high")


@dataclass(frozen=True)
class PresetValue:
    """`heat`: {"preset_mode"} or {"temperature"}. `cool`: {"cool_preset_mode"} or
    {"cool_temperature"}. `range`: heat/cool, low and high. `air`: the fan and the vanes. A part
    is empty when the preset has no value for that HVAC mode."""

    heat: Mapping[str, Any] = field(default_factory=dict)
    cool: Mapping[str, Any] = field(default_factory=dict)
    range: tuple[float, float] | None = None
    air: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def from_target(cls, target: Mapping[str, Any]) -> PresetValue:
        """The value held by a target: a slot's or an override's holds the preset's value in
        each HVAC mode, as it is stored (storage/schema.py)."""
        low, high = (target.get(key) for key in RANGE_KEYS)
        return cls({key: target[key] for key in SETPOINT_KEYS if key in target},
                   {key: target[key] for key in COOL_KEYS if key in target},
                   (low, high) if low is not None and high is not None else None,
                   {key: target[key] for key in AIR_KEYS if key in target})

    def attributes(self) -> dict[str, Any]:
        """The value as a target holds it."""
        range_ = dict(zip(RANGE_KEYS, self.range)) if self.range is not None else {}
        return {**self.heat, **self.cool, **range_, **self.air}

    def offered_modes(self) -> list[str]:
        """The HVAC modes the preset can be used in: those it has a value for."""
        modes = [mode for mode, part in (("heat", self.heat), ("cool", self.cool)) if part]
        return [*modes, HEAT_COOL] if self.range is not None else modes

    def setpoint_in(self, mode: str | None, by_user: bool = False) -> dict[str, Any] | None:
        """The setpoint to send in an HVAC mode, in place of the heating one; None when the
        heating one stays. In cool, the cooling value. In heat/cool, the range. Without a value
        for that HVAC mode, no setpoint ({}): a heating temperature is never sent in cool. A
        setpoint the user chose (`by_user`: an override without a Chauffage preset) is their
        target in any HVAC mode: it stays (docs/decisions.md, "Presets")."""
        value = None
        if mode == "cool" and self.cool:
            value = ({"temperature": self.cool["cool_temperature"]} if "cool_temperature" in self.cool
                     else {"preset_mode": self.cool["cool_preset_mode"]})
        elif mode == HEAT_COOL and self.range is not None:
            value = dict(zip(RANGE_KEYS, self.range))
        if mode in ("cool", HEAT_COOL) and (value is not None or not by_user):
            return value or {}
        return None
