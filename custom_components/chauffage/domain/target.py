"""What a thermostat should be set to: a partial state of the climate entity, as a scene holds it.

Its keys are the climate attributes: "preset_mode" (one of its climate presets), "temperature"
(a target temperature), "target_temp_low" and "target_temp_high" (heat/cool), "hvac_mode", and
the fan and the vanes of an air conditioner. A slot's target says the slot's HVAC mode on this
thermostat (`slot.slot_hvac_mode`). The target of a preset also holds its value when cooling
("cool_preset_mode", "cool_temperature", see preset.PresetValue): `Target.completed_for` keeps
the one of the HVAC mode it is sent in. A target without an HVAC mode (a heater's slot, an
override to a preset) leaves the thermostat in the HVAC mode it has, or gets the one `on_mode`
gives if it is off, in fan only or in dry (docs/decisions.md, "Scheduling").
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

from .. import const
from ..const import HEAT_COOL, OFF
from .errors import InvalidData
from .thermostat import (
    IDLE,
    SETPOINTS,
    Thermostat,
    fit_temperature,
    is_manual_preset,
    on_mode,
    same_temperature,
)

SETPOINT_KEYS = ("preset_mode", "temperature")
# A preset's value when cooling, and in heat/cool: never sent as they are (see completed_for)
COOL_KEYS = ("cool_preset_mode", "cool_temperature")
RANGE_KEYS = ("target_temp_low", "target_temp_high")
TEMPERATURE_KEYS = ("temperature", "cool_temperature", *RANGE_KEYS)
# The keys of a target that hold its setpoint: a preset, a temperature or a range
SETPOINT_TARGET_KEYS = (*SETPOINT_KEYS, *COOL_KEYS, *RANGE_KEYS)
# The attributes of a target compared as they are, with the thermostat's field of the same name
EQUAL_KEYS = const.AIR_KEYS

# How the attributes given by the card or a service are read. The fan and the vanes of an air
# conditioner (#91)
AIR_KEYS = dict.fromkeys(const.AIR_KEYS, str)
# The attributes a slot's settings may set: everything but the setpoint, which its preset gives
# (its HVAC mode, then the fan and the vanes of an air conditioner, #91)
SETTING_KEYS = {"hvac_mode": str, **AIR_KEYS}
# The climate attributes a preset's value on a thermostat may set. "preset_mode" or
# "temperature" is its value when the thermostat heats. "cool_temperature" is its setpoint when
# the thermostat cools: sent as the temperature in cool, see Target.completed_for
VALUE_KEYS = {"preset_mode": str, "temperature": float, "cool_temperature": float, **AIR_KEYS}
# The climate attributes the target of an override or of a command may set: an override also
# sets the HVAC mode (a thermostat turned off by hand, chauffage.set_override), and holds what
# its preset means in each HVAC mode (preset.PresetValue): its climate preset when cooling, its
# range in heat/cool
TARGET_KEYS = {**VALUE_KEYS, "cool_preset_mode": str, "target_temp_low": float, "target_temp_high": float,
               "hvac_mode": str}


def attributes_from_input(attributes: Any, keys: dict[str, type], what: str) -> dict[str, Any]:
    """The known attributes (`keys`: how each one is read), read, in the order of `keys`."""
    if not isinstance(attributes, dict):
        raise InvalidData(f"{what} must be a dictionary")
    unknown = set(attributes) - set(keys)
    if unknown:
        raise InvalidData(f"unknown attributes in {what}: {sorted(unknown)}")
    out: dict[str, Any] = {}
    for key, read in keys.items():
        if key not in attributes:
            continue
        try:
            value = read(attributes[key])
        except (TypeError, ValueError) as err:
            raise InvalidData(f"invalid {key}") from err
        if read is str and not value:
            raise InvalidData(f"invalid {key}")
        out[key] = value
    return out


class Target(Mapping[str, Any]):
    """A partial state of a thermostat, immutable. Equal to any mapping with the same items."""

    __slots__ = ("_attributes",)

    def __init__(self, attributes: Mapping[str, Any] | None = None) -> None:
        self._attributes = dict(attributes or {})

    @classmethod
    def from_input(cls, target: Any) -> Target:
        """A validated target of an override or a command: a partial state of the thermostat with
        at least one known attribute (TARGET_KEYS). No rule between the attributes: a change by
        hand may write a preset and a temperature at once, and the thermostat decides what to do
        with both (docs/decisions.md, "Presets")."""
        out = attributes_from_input(target, TARGET_KEYS, "a target")
        if not out:
            raise InvalidData("a target needs a climate preset, a temperature or an HVAC mode")
        return cls(out)

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
        turned on in, nor when its state is not known yet."""
        if thermostat is None or not self.has_setpoint:
            return False
        return thermostat.state in IDLE and on_mode(thermostat, planned) not in (None, thermostat.state)

    def completed_for(self, thermostat: Thermostat | None, by_user: bool = False,
                      planned: str | None = None) -> Target:
        """The target to send. An off target is sent alone: no setpoint, so a thermostat turned
        on by hand keeps its own. A target without an HVAC mode gets the one to turn the
        thermostat on in when it is off, in fan only or in dry (see on_mode; `planned`: the HVAC
        mode of the slot planned now). A thermostat that heats or cools keeps its HVAC mode when
        the target says none: never a cooling air conditioner switched to heat.

        A preset's target holds its value for each HVAC mode (preset.PresetValue). The one of
        the HVAC mode the target is sent in is kept. In cool, its cooling value replaces its
        heating one. In heat/cool, its range does. Without a value for that HVAC mode, no
        setpoint is sent: a heating temperature is never sent in cool (never 7 °C to an air
        conditioner, one that only cools included). A setpoint the user chose (`by_user`: an
        override without a Chauffage preset) is their target in any HVAC mode: sent
        (docs/decisions.md, "Presets")."""
        if self.get("hvac_mode") == OFF:
            return Target({"hvac_mode": OFF})
        out = dict(self.without((*COOL_KEYS, *RANGE_KEYS)))
        if "hvac_mode" not in out and self.needs_turning_on(thermostat, planned):
            out["hvac_mode"] = on_mode(thermostat, planned)
        # A thermostat with no state yet, at a restart: the target is sent in the HVAC mode it says
        mode = out.get("hvac_mode") or (thermostat.state if thermostat is not None else None)
        value = None
        if mode == "cool":
            if "cool_temperature" in self:
                value = {"temperature": self["cool_temperature"]}
            elif "cool_preset_mode" in self:
                value = {"preset_mode": self["cool_preset_mode"]}
        elif mode == HEAT_COOL and all(key in self for key in RANGE_KEYS):
            value = {key: self[key] for key in RANGE_KEYS}
        if mode in ("cool", HEAT_COOL) and (value is not None or not by_user):
            out = {key: v for key, v in out.items() if key not in SETPOINT_KEYS}
        return Target({**out, **(value or {})})

    def hvac_satisfied_by(self, thermostat: Thermostat) -> bool:
        """The thermostat is in the target's HVAC mode, or on when the target gives none: not off,
        and not in fan only or dry when the target holds a setpoint."""
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
        if thermostat is None or thermostat.vtherm or is_manual_preset(thermostat.preset):
            return None
        if "preset_mode" in self or not any(key in self for key in SETPOINTS):
            return None
        return next((preset for preset in thermostat.presets if preset.lower() == "none"), None)
