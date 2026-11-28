"""What a thermostat should be set to: a partial state of the climate entity, as a scene holds it.

Its keys are the climate attributes: "preset_mode" (one of its climate presets), "temperature"
(a target temperature), "target_temp_low" and "target_temp_high" (heat/cool), "hvac_mode", and
the fan and the vanes of an air conditioner. A slot's target says the slot's HVAC mode on this
thermostat (`slot.slot_hvac_mode`). The target of a slot or of an override to a preset also
holds the preset's value when cooling ("cool_preset_mode", "cool_temperature"), as it is stored:
`Target.completed_for` asks the preset's value (`PresetValue.setpoint_in`) for the setpoint of
the HVAC mode it is sent in. A target without an HVAC mode (a heater's slot, an override to a
preset) leaves the thermostat in the HVAC mode it has, or gets the one `on_mode` gives if it is
off, in fan only or in dry (docs/decisions.md, "Scheduling").
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

from ..const import AIR_KEYS, OFF
from .preset_value import COOL_KEYS, RANGE_KEYS, SETPOINT_KEYS, PresetValue
from .thermostat import (
    IDLE,
    SETPOINTS,
    Thermostat,
    fit_temperature,
    is_manual_preset,
    on_mode,
    same_temperature,
)

TEMPERATURE_KEYS = ("temperature", "cool_temperature", *RANGE_KEYS)
# The keys of a target that hold its setpoint: a preset, a temperature or a range
SETPOINT_TARGET_KEYS = (*SETPOINT_KEYS, *COOL_KEYS, *RANGE_KEYS)
# The attributes of a target compared as they are, with the thermostat's field of the same name:
# the fan and the vanes of an air conditioner
EQUAL_KEYS = AIR_KEYS


class Target(Mapping[str, Any]):
    """A partial state of a thermostat, immutable. Equal to any mapping with the same items."""

    __slots__ = ("_attributes",)

    def __init__(self, attributes: Mapping[str, Any] | None = None) -> None:
        self._attributes = dict(attributes or {})

    def __getitem__(self, key: str) -> Any:
        return self._attributes[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._attributes)

    def __len__(self) -> int:
        return len(self._attributes)

    def __repr__(self) -> str:
        return f"Target({self._attributes!r})"

    @property
    def has_setpoint(self) -> bool:
        return any(key in self for key in SETPOINT_TARGET_KEYS)

    def without(self, keys: tuple[str, ...]) -> Target:
        return Target({key: value for key, value in self.items() if key not in keys})

    def fitted_to(self, thermostat: Thermostat | None) -> Target:
        """The target with its temperatures fitted to the thermostat (limits, step)."""
        return Target({key: fit_temperature(value, thermostat) if key in TEMPERATURE_KEYS else value
                       for key, value in self.items()})

    def needs_turning_on(self, thermostat: Thermostat | None, planned: str | None = None) -> bool:
        """A target without an HVAC mode, on a thermostat that cannot follow it as it is: off, or
        in fan only or dry, while the target holds a setpoint (fan only and dry take none). A
        target without a setpoint turns nothing on: the slot of a preset that has no value on
        this thermostat has nothing to send. Not when the thermostat has no HVAC mode to be
        turned on in, nor when its state is not known yet, nor when Chauffage does not control
        its HVAC mode (#159)."""
        if thermostat is None or not thermostat.hvac_control or not self.has_setpoint:
            return False
        return thermostat.state in IDLE and on_mode(thermostat, planned) not in (None, thermostat.state)

    def completed_for(self, thermostat: Thermostat | None, by_user: bool = False,
                      planned: str | None = None) -> Target:
        """The target to send. An off target is sent alone: no setpoint, so a thermostat turned
        on by hand keeps its own. A target without an HVAC mode gets the one to turn the
        thermostat on in when it is off, in fan only or in dry (see on_mode; `planned`: the HVAC
        mode of the slot planned now). A thermostat that heats or cools keeps its HVAC mode when
        the target says none: never a cooling air conditioner switched to heat.

        The setpoint is the preset's value in the HVAC mode the target is sent in
        (PresetValue.setpoint_in): never 7 °C to an air conditioner in cool. `by_user`: an
        override without a Chauffage preset, whose setpoint is sent in any HVAC mode."""
        if self.get("hvac_mode") == OFF:
            return Target({"hvac_mode": OFF})
        out = dict(self.without((*COOL_KEYS, *RANGE_KEYS)))
        if "hvac_mode" not in out and self.needs_turning_on(thermostat, planned):
            out["hvac_mode"] = on_mode(thermostat, planned)
        # A thermostat with no state yet, at a restart: the target is sent in the HVAC mode it says
        mode = out.get("hvac_mode") or (thermostat.state if thermostat is not None else None)
        setpoint = PresetValue.from_target(self).setpoint_in(mode, by_user)
        if setpoint is not None:
            out = {key: v for key, v in out.items() if key not in SETPOINT_KEYS} | setpoint
        return Target(out)

    def hvac_satisfied_by(self, thermostat: Thermostat) -> bool:
        """The thermostat is in the target's HVAC mode, or on when the target gives none: not off,
        and not in fan only or dry when the target holds a setpoint. Any HVAC mode when Chauffage
        does not control it (#159)."""
        if not thermostat.hvac_control:
            return True
        if "hvac_mode" in self:
            return self["hvac_mode"] == thermostat.state
        return thermostat.state != OFF and not self.needs_turning_on(thermostat)

    def satisfied_by(self, thermostat: Thermostat) -> bool:
        """The thermostat shows every part of the target."""
        if not self.hvac_satisfied_by(thermostat):
            return False
        if "preset_mode" in self and thermostat.preset != self["preset_mode"]:
            return False
        if "temperature" in self and not same_temperature(thermostat.temperature, self["temperature"], thermostat):
            return False
        if any(key in self and not same_temperature(getattr(thermostat, key), self[key], thermostat)
               for key in RANGE_KEYS):
            return False
        return all(getattr(thermostat, key) == self[key] for key in EQUAL_KEYS if key in self)

    def same_as(self, other: Mapping[str, Any], thermostat: Thermostat | None = None) -> bool:
        """Two targets that set the thermostat alike (temperatures compared on its step)."""
        if set(self) != set(other):
            return False
        return all(same_temperature(self[key], other[key], thermostat) if key in TEMPERATURE_KEYS
                   else self[key] == other[key] for key in self)

    def with_own_settings(self, own: Mapping[str, str] | None) -> Target:
        """The target with the fan and the vanes to give back to the thermostat (`own`: what it
        had before a slot or an override chose others), for those the target does not choose. An
        off target is sent alone."""
        if not own or self.get("hvac_mode") == OFF:
            return self
        return Target({**{key: value for key, value in own.items() if key not in self}, **self})

    def preset_to_leave(self, thermostat: Thermostat | None) -> str | None:
        """The preset "none" to set before this setpoint is sent, on a thermostat that lists it
        and shows another preset; None otherwise. A Daikin keeps its preset when it gets a
        setpoint: its eco preset would go on against the temperature asked. Set before the
        setpoint: a thermostat may give back an older setpoint when it leaves a preset. Not on a
        Versatile Thermostat, which goes to its manual preset by itself."""
        if thermostat is None or thermostat.leaves_preset_itself or is_manual_preset(thermostat.preset):
            return None
        if "preset_mode" in self or not any(key in self for key in SETPOINTS):
            return None
        return next((preset for preset in thermostat.presets if preset.lower() == "none"), None)
