"""An override: a target that replaces the schedule on a thermostat until its end (docs/glossary.md)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .target import Target


@dataclass(frozen=True)
class Override:
    """`target`: what the thermostat is set to. `preset`: the Chauffage preset picked on the card
    or by a service, which the target means on this thermostat (None for a change by hand).
    `start` and `end`: ISO datetimes. `end_rule`: the rule that chose the end, when Chauffage
    computed it (#83): after the override duration, at the next slot, or a week later as no slot
    changes its target (None once a person picks the end)."""

    target: Target
    start: str
    end: str
    preset: str | None = None
    end_rule: str | None = None

    def to_stored(self) -> dict[str, Any]:
        out: dict[str, Any] = {"target": dict(self.target), "start": self.start, "end": self.end}
        if self.preset is not None:
            out["preset"] = self.preset
        if self.end_rule is not None:
            out["end_rule"] = self.end_rule
        return out
