"""An override: a target that replaces the schedule on a thermostat until its end (docs/glossary.md)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .target import Target


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

    def to_stored(self) -> dict[str, Any]:
        out: dict[str, Any] = {"target": dict(self.target), "start": self.start, "end": self.end}
        if self.preset is not None:
            out["preset"] = self.preset
        if self.ends_at is not None:
            out["ends_at"] = self.ends_at
        return out
