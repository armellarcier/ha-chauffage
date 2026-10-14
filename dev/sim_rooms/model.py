"""Thermal model of the development HA's rooms (dev/sim_rooms).

Everything in a real room has inertia, which is what makes its temperature curves round:

- the radiator (its water or oil) warms up for a while once switched on and keeps heating for a
  while once switched off;
- the air, quick, warmed by the radiator and by free gains, exchanging with the walls and leaking
  to the outdoors;
- the walls and furniture, slow: they hold the heat, so a room cools down more slowly than it
  heats up;
- the sensor, which follows the air with a few minutes' delay and reports to 0.1 °C.

    radiator: dR/dt = (power × heater_on − R) / RADIATOR_LAG
    air:      dT/dt = R + gains − exchange × (T − T_walls) − leak × (T − T_outdoor)
    walls:    dT_walls/dt = inertia × exchange × (T − T_walls) − loss × (T_walls − T_outdoor)
    sensor:   dS/dt = (T − S) / SENSOR_LAG

Real rooms are never regular: people come and go (heat), a door or a window stays open for a few
minutes, clouds hide the sun, the wind changes the losses. These disturbances are random but
always the same for a given room and day, so the live simulation and the history of a day agree;
they act through the air, so they never make sharp corners either. A room heats up by about
1.7 °C an hour and cools down by about 0.6 °C an hour once the heating stops.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from functools import lru_cache
import math
import random
from typing import NamedTuple

RADIATOR_LAG = 0.35  # hours: a radiator reaches (or loses) two thirds of its output in ~20 min
SENSOR_LAG = 0.12  # hours: a sensor follows the air with ~7 min of delay
GAIN_LAG = 0.1  # hours: a door opened or people coming in change the air gradually


@dataclass(frozen=True)
class Room:
    power: float  # °C per hour the radiator brings to the air at full output
    exchange: float = 0.4  # per hour, air ↔ walls
    inertia: float = 0.35  # how much the walls follow the air (ratio of the air's mass to theirs)
    leak: float = 0.03  # per hour, air → outdoor (draughts)
    loss: float = 0.015  # per hour, walls → outdoor
    sun: float = 0.0  # °C per hour at the sunniest time of a sunny day
    cooking: bool = False
    seed: int = 0


class State(NamedTuple):
    air: float
    walls: float
    radiator: float = 0.0  # °C per hour it brings now
    sensor: float | None = None
    gain: float = 0.0  # free gains (or losses) acting now, °C per hour

    @classmethod
    def at(cls, temperature: float) -> State:
        return cls(temperature, temperature - 0.8, 0.0, temperature, 0.0)


# Room of each simulated heater / temperature (dev/hass/packages/simulation.yaml)
ROOMS = {
    "salon": Room(power=3.5, sun=0.7, seed=1),  # large, south facing
    "bureau": Room(power=4.2, leak=0.04, sun=0.3, seed=2),  # small, warms up fast
    "chambre": Room(power=3.6, seed=3),
    "cuisine": Room(power=3.8, leak=0.045, cooking=True, seed=4),
    "amis": Room(power=3.3, loss=0.02, seed=5),  # north facing, seldom used
}


def weather(day: date) -> tuple[float, float]:
    """The weather of a day, always the same for that day: (mildness in °C, sunshine 0 → 1)."""
    rng = random.Random(day.toordinal())
    return rng.uniform(-2.5, 2.5), rng.choice([0.15, 0.4, 0.7, 1.0])


def outdoor(t: datetime, mildness: float = 0.0) -> float:
    """Outdoor temperature in October: about 6 °C before dawn, 13 °C mid-afternoon, with gusts."""
    hour = t.hour + t.minute / 60
    wobble = 0.4 * math.sin(hour * 2.3 + t.toordinal()) + 0.25 * math.sin(hour * 5.1)
    return 9.5 + mildness + 3.5 * math.cos((hour - 15) / 24 * 2 * math.pi) + wobble


@dataclass
class Day:
    """The random events of one room on one day: (start, end, °C per hour) in minutes."""

    events: list[tuple[int, int, float]] = field(default_factory=list)
    clouds: list[float] = field(default_factory=list)  # sun let through, per quarter of an hour


@lru_cache(maxsize=64)
def day_of(room: Room, day: date) -> Day:
    rng = random.Random(day.toordinal() * 31 + room.seed)
    d = Day()
    # People at home: a little heat in the morning and in the evening, more at weekends
    home = [(6 * 60 + 30, 8 * 60 + 30), (18 * 60, 23 * 60)] if day.weekday() < 5 else [(8 * 60, 23 * 60)]
    for start, end in home:
        d.events.append((start + rng.randint(-30, 30), end + rng.randint(-40, 40), rng.uniform(0.15, 0.4)))
    # Doors and windows opened for a few minutes
    for _ in range(rng.randint(1, 4)):
        start = rng.randint(7 * 60, 22 * 60)
        d.events.append((start, start + rng.randint(3, 12), -rng.uniform(1.5, 4.0)))
    # A window left open to air the room in the morning, some days
    if rng.random() < 0.4:
        start = rng.randint(8 * 60, 10 * 60)
        d.events.append((start, start + rng.randint(10, 20), -rng.uniform(3.0, 6.0)))
    d.clouds = [rng.uniform(0.2, 1.0) for _ in range(96)]
    return d


def gains(room: Room, t: datetime, sunshine: float, day: Day) -> float:
    """Free gains (and losses) in °C per hour: sun through the clouds, cooking, people, doors."""
    hour = t.hour + t.minute / 60
    minute = t.hour * 60 + t.minute
    gain = sum(rate for start, end, rate in day.events if start <= minute < end)
    if room.sun and 10.5 <= hour <= 17:
        gain += room.sun * sunshine * day.clouds[minute // 15] * math.sin((hour - 10.5) / 6.5 * math.pi)
    if room.cooking and (12 <= hour < 12.75 or 19 <= hour < 20):
        gain += 1.4
    return gain


def step(room: Room, state: State, heater_on: bool, t: datetime, hours: float,
         mildness: float, sunshine: float, day: Day) -> State:
    """The room's state after `hours` (a minute or less)."""
    air, walls, radiator, felt, gain = state
    ext = outdoor(t, mildness)
    flow = room.exchange * (air - walls)
    radiator += ((room.power if heater_on else 0.0) - radiator) / RADIATOR_LAG * hours
    gain += (gains(room, t, sunshine, day) - gain) / GAIN_LAG * hours
    air += (radiator + gain - flow - room.leak * (air - ext)) * hours
    walls += (room.inertia * flow - room.loss * (walls - ext)) * hours
    felt = air if felt is None else felt + (air - felt) / SENSOR_LAG * hours
    return State(air, walls, radiator, felt, gain)


def sensor(room: Room, state: State, t: datetime, reported: float | None) -> float:
    """What a sensor reports, to 0.1 °C, with a little noise; like real (Zigbee) sensors, a new
    value only once it has moved by a whole step from the last one reported."""
    rng = random.Random(int(t.timestamp()) // 60 * 7 + room.seed)
    measured = (state.sensor if state.sensor is not None else state.air) + rng.gauss(0, 0.03)
    if reported is not None and abs(measured - reported) < 0.1:
        return reported
    return round(measured, 1)
