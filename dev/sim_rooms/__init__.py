"""Simulated rooms of the development HA, and a week of history for a new one (dev only).

    sim_rooms:          (dev/hass/configuration.yaml)

- Every 30 s, the temperature of each room (`input_number.temperature_<room>`, read by the
  `sensor.temperature_<room>` sensors of dev/hass/packages/simulation.yaml) follows its heater
  (`input_boolean.radiateur_<room>`) with the thermal model of model.py; the outdoor temperature
  (`input_number.temperature_exterieure`) follows the day. Moving a room's slider by hand sets
  its temperature, the model goes on from there.
- `sim_rooms.seed_history` (called by dev/setup/setup.py) writes into the recorder the week
  before the development HA was created, simulated with the same model: the thermostats follow
  the active schedule of the Chauffage integration, with a manual change one evening. A new
  development HA thus shows a realistic history at once; an existing one is left alone.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from . import history
from .model import ROOMS, State, day_of, outdoor, step, weather

DOMAIN = "sim_rooms"
TICK = timedelta(seconds=30)
_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    sim = Simulation(hass)
    async_track_time_interval(hass, sim.tick, TICK)
    hass.services.async_register(DOMAIN, "seed_history", sim.seed_history)
    return True


class Simulation:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.states: dict[str, State] = {}  # thermal state of each room
        self.written: dict[str, float] = {}  # value last written to its slider

    async def tick(self, now: datetime) -> None:
        now = dt_util.as_local(now)
        mildness, sunshine = weather(now.date())
        await self._set("input_number.temperature_exterieure", round(outdoor(now, mildness), 1))
        for name, room in ROOMS.items():
            slider = self.hass.states.get(f"input_number.temperature_{name}")
            if slider is None or slider.state in ("unknown", "unavailable"):
                continue
            value = float(slider.state)
            # Moved by hand (or first tick): the model goes on from the slider
            if name not in self.states or abs(value - self.written.get(name, value)) > 0.05:
                self.states[name] = State.at(value)
            heater = self.hass.states.get(f"input_boolean.radiateur_{name}")
            on = heater is not None and heater.state == "on"
            self.states[name] = step(room, self.states[name], on, now, TICK.total_seconds() / 3600,
                                     mildness, sunshine, day_of(room, now.date()))
            # The slider holds what the sensor measures (with its delay); the sensor rounds it
            self.written[name] = round(self.states[name].sensor, 2)
            await self._set(f"input_number.temperature_{name}", self.written[name])

    async def _set(self, entity_id: str, value: float) -> None:
        state = self.hass.states.get(entity_id)
        if state is None or state.state == str(value):
            return
        await self.hass.services.async_call("input_number", "set_value", {"entity_id": entity_id, "value": value})

    async def seed_history(self, call: ServiceCall) -> None:
        week = await history.seed(self.hass)
        if week is None:
            return
        # The rooms go on from where the simulated week ends
        for name, state in week.items():
            self.states[name] = state
            self.written[name] = round(state.sensor, 2)
            await self._set(f"input_number.temperature_{name}", self.written[name])
