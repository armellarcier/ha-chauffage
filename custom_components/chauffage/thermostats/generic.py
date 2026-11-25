"""Any climate entity: read as it shows itself.

Why a thermostat protects itself (`cause`) is read on every thermostat, as `main` does: only
Versatile Thermostat publishes these attributes, but the reader does not need to know it.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from homeassistant.components.climate.const import ClimateEntityFeature
from homeassistant.core import State

from ..const import OFF
from ..domain.target import RANGE_KEYS
from ..domain.thermostat import SETPOINTS, Thermostat, preset_value, temperature_value

# Why a thermostat protects itself, as Versatile Thermostat says it in specific_states:
# hvac_off_reason (for example "hvac_off_auto_start_stop" or "hvac_off_window") while it is off,
# and its window manager while it keeps heating at the frost setpoint for an open window. For the
# card, which then does not read VTherm's attributes.
OFF_CAUSES = {"window": "window", "window_detection": "window", "auto_start_stop": "auto_start_stop"}


class GenericReader:
    """Reads a climate entity as it shows itself. A thermostat with standard presets and one
    without presets differ only by what they list."""

    # Whether the thermostat goes to its manual preset by itself when it gets a setpoint
    leaves_preset_itself = False

    def asked(self, attributes: Mapping[str, Any]) -> tuple[str | None, str | None, float | None]:
        """The HVAC mode, the preset and the setpoint the thermostat was asked for. The HVAC mode
        is None: the state says it."""
        return None, preset_value(attributes.get("preset_mode")), temperature_value(attributes.get("temperature"))

    def ready(self, attributes: Mapping[str, Any]) -> bool:
        """Whether the thermostat shows a known state: a setpoint or a preset. At a restart, a
        thermostat may write a first state before it has restored its own: Versatile Thermostat
        writes `off` without setpoint or preset, and builds its presets once Home Assistant has
        started. A command sent then would be a temperature instead of its preset (#93)."""
        return any(attributes.get(key) is not None for key in (*SETPOINTS, "preset_mode"))

    def read(self, state: State) -> Thermostat:
        """What the scheduler needs to know about the thermostat."""
        attributes = state.attributes
        hvac_mode, preset, temperature = self.asked(attributes)
        return Thermostat(
            hvac_mode or state.state,
            preset,
            temperature,
            tuple(p for p in (preset_value(p) for p in attributes.get("preset_modes") or ()) if p),
            temperature_value(attributes.get("min_temp")),
            temperature_value(attributes.get("max_temp")),
            temperature_value(attributes.get("target_temp_step")),
            self.leaves_preset_itself,
            self.ready(attributes),
            tuple(m for m in (preset_value(m) for m in attributes.get("hvac_modes") or ()) if m),
            fan_mode=preset_value(attributes.get("fan_mode")),
            swing_mode=preset_value(attributes.get("swing_mode")),
            swing_horizontal_mode=preset_value(attributes.get("swing_horizontal_mode")),
            supports_range=bool(int(attributes.get("supported_features") or 0)
                                & ClimateEntityFeature.TARGET_TEMPERATURE_RANGE),
            **{key: temperature_value(attributes.get(key)) for key in RANGE_KEYS},
        )

    def cause(self, state: State) -> str | None:
        """"window" or "auto_start_stop" when the thermostat says it turned itself off for that,
        or "window" while it heats at the frost setpoint for its open window; None otherwise."""
        attributes = state.attributes
        specific = attributes.get("specific_states") if isinstance(attributes.get("specific_states"), Mapping) else {}
        # VTherm 10.5 publishes its window manager as a top-level attribute
        window = specific.get("window_manager") if isinstance(specific.get("window_manager"), Mapping) \
            else attributes.get("window_manager")
        if isinstance(window, Mapping) and str(window.get("window_state")) == "on":
            return "window"
        if state.state != OFF:
            return None
        reason = specific.get("hvac_off_reason")
        return OFF_CAUSES.get(str(preset_value(reason) or "").removeprefix("hvac_off_"))
