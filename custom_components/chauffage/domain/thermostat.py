"""What Chauffage knows of a thermostat, and the rules that only depend on it."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from ..const import FAN_ONLY, DRY, HEAT_COOL, MANUAL_PRESETS, OFF, SETPOINT_MODES

IGNORED_STATES = frozenset({"unavailable", "unknown"})
DEFAULT_STEP = 0.5
# The HVAC modes that take no setpoint: a target that holds one and says no HVAC mode turns the
# thermostat on from them. Not auto: a valve in auto takes a setpoint, and keeps auto
IDLE = (OFF, FAN_ONLY, DRY)
SETPOINTS = ("temperature", "target_temp_low", "target_temp_high")


@dataclass(frozen=True)
class Thermostat:
    """What the scheduler needs to know about a climate entity. `state` is its HVAC mode as
    asked: for a Versatile Thermostat that turned itself off, the one it was asked (#91)."""

    state: str
    preset: str | None
    temperature: float | None
    presets: tuple[str, ...] = field(default=())
    min_temp: float | None = None
    max_temp: float | None = None
    step: float | None = None
    # It goes to its manual preset by itself when it gets a setpoint (Versatile Thermostat)
    leaves_preset_itself: bool = False
    ready: bool = True  # it shows a known state (thermostats/generic.py)
    hvac_modes: tuple[str, ...] = field(default=())
    # The fan and the vanes of an air conditioner, as shown (#91)
    fan_mode: str | None = None
    swing_mode: str | None = None
    swing_horizontal_mode: str | None = None
    # Heat/cool: whether it takes a range of temperatures (TARGET_TEMPERATURE_RANGE), and the
    # range it shows
    supports_range: bool = False
    target_temp_low: float | None = None
    target_temp_high: float | None = None


def ignored(thermostat: Thermostat) -> bool:
    """A thermostat left alone: unavailable or unknown, or not ready yet. Not one turned off:
    the schedule decides whether a thermostat is off (#91)."""
    return not thermostat.ready or thermostat.state in IGNORED_STATES


def preset_value(raw: Any) -> str | None:
    """preset_mode as text: some integrations (ZHA…) expose an Enum (<Preset.ECO: 'eco'>)."""
    if raw is None:
        return None
    if isinstance(raw, Enum):
        raw = raw.value
    return str(raw)


def temperature_value(raw: Any) -> float | None:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def is_manual_preset(preset: str | None) -> bool:
    return preset is None or preset.lower() in MANUAL_PRESETS


def fit_temperature(value: float, thermostat: Thermostat | None) -> float:
    """A temperature the thermostat accepts: within its limits, on its step."""
    step = (thermostat.step if thermostat else None) or DEFAULT_STEP
    value = round(round(value / step) * step, 2)
    if thermostat and thermostat.min_temp is not None:
        value = max(value, thermostat.min_temp)
    if thermostat and thermostat.max_temp is not None:
        value = min(value, thermostat.max_temp)
    return value


def same_temperature(a: float | None, b: float | None, thermostat: Thermostat | None = None) -> bool:
    if a is None or b is None:
        return False
    step = (thermostat.step if thermostat else None) or DEFAULT_STEP
    return abs(a - b) < step / 2


def setpoint_modes(thermostat: Thermostat) -> list[str]:
    """The HVAC modes a slot on a preset may choose on a thermostat: heat, cool and heat/cool,
    the ones it lists. Heat/cool only when it takes a range of temperatures."""
    return [mode for mode in SETPOINT_MODES
            if mode in thermostat.hvac_modes and (mode != HEAT_COOL or thermostat.supports_range)]


def on_mode(thermostat: Thermostat, planned: str | None = None) -> str | None:
    """The HVAC mode to turn a thermostat on in, for a setpoint that says none (an override to a
    preset), as the card chooses the HVAC mode of an override: among the HVAC modes that take a
    setpoint (`setpoint_modes`), the one of the slot planned now (`planned`), else the one it
    runs in, else the first. In summer, an override to Comfort set by an automation during a
    cooling slot turns an air conditioner on in cool. Without one of them, its first HVAC mode
    but off, fan only and dry, for example auto. None when it lists none: a thermostat that
    only lists off and fan only is not turned on for a setpoint."""
    choices = setpoint_modes(thermostat)
    if planned in choices:
        return planned
    if thermostat.state in choices:
        return thermostat.state
    others = [mode for mode in thermostat.hvac_modes if mode not in IDLE]
    return (choices or others or [None])[0]


def own_preset_temperature(attributes: Mapping[str, Any], preset: str, learned: Mapping[str, Any],
                           cool: bool = False) -> float | None:
    """Temperature a thermostat's own preset gives: Versatile Thermostat publishes them
    (preset_temperatures: {"eco_temp": …}), otherwise the one last read while the thermostat was
    on that preset (`learned`). `cool`: the one it gives when cooling (a Versatile Thermostat in AC
    mode: "eco_cool_temp"; `learned` while it cooled)."""
    published = attributes.get("preset_temperatures")
    key = f"{preset}_cool_temp" if cool else f"{preset}_temp"
    value = published.get(key) if isinstance(published, Mapping) else None
    return temperature_value(learned.get(preset) if value is None else value)
