"""An override: a target that replaces the schedule on a thermostat until its end (docs/glossary.md)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..const import DURATION, NEXT_SLOT, NO_NEXT_SLOT, OFF
from .errors import InvalidData
from .target import AIR_KEYS, Target

OVERRIDE_ENDS = (DURATION, NEXT_SLOT, NO_NEXT_SLOT)  # why a change by hand ends then


@dataclass(frozen=True)
class Override:
    """`target`: what the thermostat is set to. `preset`: the Chauffage preset picked on the card
    or by a service, which the target means on this thermostat (None for a change by hand).
    `start` and `end`: ISO datetimes. `ends_at`: why a change by hand ends then (#83), after the
    override duration, at the next slot, or a week later as no slot changes its target (None for
    an override set or changed on the card or by a service)."""

    target: Target
    start: str
    end: str
    preset: str | None = None
    ends_at: str | None = None

    @classmethod
    def from_input(cls, override: Any) -> Override:
        if not isinstance(override, dict):
            raise InvalidData("an override must be a dictionary")
        # An override sets no fan and no vanes: they stay as the thermostat has them (an override
        # that holds only what was changed would carry them, docs/decisions.md)
        target = Target.from_input(override.get("target")).without(tuple(AIR_KEYS))
        if target.get("hvac_mode") == OFF:
            target = Target({"hvac_mode": OFF})  # an off override sets nothing else: no setpoint is sent
        start, end = override.get("start"), override.get("end")
        if not isinstance(start, str) or not isinstance(end, str):
            raise InvalidData("start and end must be ISO datetimes")
        preset = override.get("preset")
        ends_at = override.get("ends_at")
        return cls(target, start, end, preset if isinstance(preset, str) and preset else None,
                   ends_at if ends_at in OVERRIDE_ENDS else None)

    def to_stored(self) -> dict[str, Any]:
        out: dict[str, Any] = {"target": dict(self.target), "start": self.start, "end": self.end}
        if self.preset is not None:
            out["preset"] = self.preset
        if self.ends_at is not None:
            out["ends_at"] = self.ends_at
        return out
