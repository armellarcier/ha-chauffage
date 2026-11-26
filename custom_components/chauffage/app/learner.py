"""The temperatures of a thermostat's own presets: published by the thermostat (Versatile
Thermostat), else learned while the thermostat was on them."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.core import State, callback

from ..const import DRY, FAN_ONLY, HEAT_COOL
from ..domain.thermostat import ignored, is_manual_preset, own_preset_temperature, preset_value

if TYPE_CHECKING:
    from ..runtime import ChauffageRuntime


class Learner:
    def __init__(self, runtime: ChauffageRuntime) -> None:
        self._runtime = runtime

    def _learned(self, entity_id: str, cool: bool = False) -> dict[str, float]:
        """{own preset: temperature} learned from a thermostat. `cool`: while it cooled."""
        key = "cool_preset_temperatures" if cool else "preset_temperatures"
        return self._runtime.thermostats.get(entity_id, {}).get(key, {})

    def preset_temperature(self, state: State, preset: str, cool: bool = False) -> float | None:
        """Temperature a thermostat's own preset gives (published, else learned): the one the
        card shows, and the one a manual setpoint is compared with. `cool`: when it cools."""
        return own_preset_temperature(state.attributes, preset, self._learned(state.entity_id, cool), cool)

    def temperatures_of(self, state: State | None, cool: bool = False) -> dict[str, float]:
        """{own preset: temperature} of a thermostat, for its presets and the learned ones.
        `cool`: what they give when it cools."""
        if state is None:
            return {}
        learned = self._learned(state.entity_id, cool)
        temperatures = {p: self.preset_temperature(state, p, cool)
                        for p in {*self._runtime.current(state).presets, *learned}}
        return {p: t for p, t in temperatures.items() if t is not None}

    @callback
    def learn(self, state: State | None) -> bool:
        """While a thermostat is on a preset, its setpoint is that preset's temperature: its
        cooling temperature while it cools, kept apart. In heat/cool, in dry and in fan only, the
        setpoint shown is not a preset's temperature: nothing is learned."""
        runtime = self._runtime
        current = runtime.current(state)
        if current is None or ignored(current) or state.entity_id not in runtime.thermostats:
            return False
        data = runtime.thermostats[state.entity_id]
        learned = False
        temperatures = (data.setdefault("cool_preset_temperatures", {}) if current.state == "cool"
                        else data["preset_temperatures"])
        # A VTherm on another preset than asked, for example its central mode in frost
        # protection: its setpoint is not the asked preset's temperature (#92). Nor is the frost
        # setpoint it shows on the asked preset while its window is open
        if (current.temperature is not None and not is_manual_preset(current.preset)
                and runtime._cause_of(state) is None
                and current.state not in (HEAT_COOL, DRY, FAN_ONLY)
                and current.preset == preset_value(state.attributes.get("preset_mode"))
                and temperatures.get(current.preset) != current.temperature):
            temperatures[current.preset] = current.temperature
            learned = True
        if learned:
            runtime._changed()
        return learned
