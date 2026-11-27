"""A Versatile Thermostat: read as it was asked, not as it changed itself (#92)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ..domain.thermostat import is_manual_preset, preset_value, temperature_value
from .generic import GenericReader


class VThermReader(GenericReader):
    """Versatile Thermostat may change its HVAC mode, its preset and its setpoint by itself: it
    turns off for an open window or its auto start/stop, and sets the frost setpoint for a
    window. It keeps what it was asked for in requested_state. Off by its window or its auto
    start/stop, it is still "on" for Chauffage."""

    # VTherm goes to its manual preset by itself when it gets a setpoint
    leaves_preset_itself = True
    # VTherm keeps the setpoint asked while off, and starts again on it (#74)
    keeps_setpoint_while_off = True

    def asked(self, attributes: Mapping[str, Any]) -> tuple[str | None, str | None, float | None]:
        """VTherm's target_temperature in requested_state is the last manual setpoint, so it
        counts only on the manual preset, and only when it is known. The HVAC mode is None
        without requested_state: the state says it."""
        hvac_mode, preset, temperature = super().asked(attributes)
        requested = attributes.get("requested_state")
        if isinstance(requested, Mapping) and requested.get("preset") is not None:
            preset = preset_value(requested["preset"])
            target = temperature_value(requested.get("target_temperature"))
            if is_manual_preset(preset) and target is not None:
                temperature = target
        if isinstance(requested, Mapping) and requested.get("hvac_mode") is not None:
            hvac_mode = preset_value(requested["hvac_mode"])
        return hvac_mode, preset, temperature

    def ready(self, attributes: Mapping[str, Any]) -> bool:
        """VTherm 9 and later also say when they are not ready (is_ready)."""
        return attributes.get("is_ready") is not False and super().ready(attributes)
