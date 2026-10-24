"""The week before a new development HA was created, simulated and written into the recorder.

The thermostats follow the active schedule of the Chauffage integration, like in real life: each
heater runs a share of every 10-minute cycle that grows with the gap to the setpoint (the TPI of
Versatile Thermostat), the room follows model.py, the sensors report a new value every 0.1 °C. One evening, someone turns the living room up by hand. Written as
ordinary recorded states (the recorder has no API to write the past), through the recorder's
own models and thread, before the first state the development HA recorded itself.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.db_schema import StateAttributes, States, StatesMeta
from homeassistant.components.recorder.tasks import RecorderTask
from homeassistant.core import HomeAssistant
from homeassistant.helpers.json import json_bytes
from homeassistant.helpers.recorder import session_scope
from homeassistant.util import dt as dt_util

from .model import ROOMS, State, day_of, outdoor, sensor, step, weather

_LOGGER = logging.getLogger(__name__)

DAYS = 8  # the card shows 7 days, from midnight 6 days ago
# TPI regulation, as Versatile Thermostat does: share of each cycle the heater is on
CYCLE = 10  # minutes
TPI_INDOOR = 0.6  # per °C below the setpoint
TPI_OUTDOOR = 0.03  # per °C between the setpoint and the outdoor temperature
# Room of each scheduled thermostat (dev/setup/setup.py)
THERMOSTATS = {
    "climate.salon": "salon", "climate.bureau": "bureau", "climate.chambre": "chambre",
    "climate.cuisine": "cuisine", "climate.chambre_d_amis": "amis",
}
# Someone turns the living room up by hand one evening (3 days ago, 19:00 → 21:00)
MANUAL = {"entity_id": "climate.salon", "days_ago": 3, "start": 19 * 60, "end": 21 * 60, "temperature": 22.0}

Row = tuple[float, str, dict[str, Any]]  # time (s), state, attributes


async def seed(hass: HomeAssistant) -> dict[str, State] | None:
    """Writes the simulated week; the rooms' states at its end, or None when the recorder
    already holds older history (an existing development HA)."""
    entities = [*THERMOSTATS, *(f"sensor.temperature_{room}" for room in ROOMS),
                *(f"input_boolean.radiateur_{room}" for room in ROOMS), "sensor.temperature_exterieure"]
    first = await _run(hass, lambda session: _first_recorded(session, entities))
    now = dt_util.utcnow().timestamp()
    if first is not None and first < now - 86400:
        _LOGGER.info("history already there: nothing written")
        return None
    end = dt_util.utc_from_timestamp(first if first is not None else now)
    rows, temperatures = _simulate(hass, end)
    written = await _run(hass, lambda session: _write(session, rows))
    _LOGGER.info("simulated week written: %s states", written)
    return temperatures


# ----- simulation -----

def _setpoints(hass: HomeAssistant) -> Callable[[str, datetime], tuple[str, float]] | None:
    """(preset, setpoint) of a thermostat at a time, from the Chauffage integration's active schedule."""
    entries = hass.config_entries.async_loaded_entries("chauffage")
    if not entries:
        return None
    runtime = entries[0].runtime_data
    data = runtime.data
    presets = {p["id"]: p.get("temperature") for p in data["presets"]}
    learned = runtime.learned_temperatures

    def at(entity_id: str, t: datetime) -> tuple[str, float]:
        week = runtime.weeks.get(entity_id, {}).get(data["active_schedule"]) or [[["00:00", "eco"]]] * 7
        minute = t.hour * 60 + t.minute
        preset = "eco"
        for hhmm, slot_preset in week[t.weekday()]:
            h, m = (int(x) for x in hhmm.split(":"))
            if h * 60 + m <= minute:
                preset = slot_preset
        temperature = learned.get(entity_id, {}).get(preset) or presets.get(preset) or 17.0
        return preset, float(temperature)

    return at


def _simulate(hass: HomeAssistant, end: datetime) -> tuple[dict[str, list[Row]], dict[str, State]]:
    setpoint = _setpoints(hass)
    local_end = dt_util.as_local(end)
    start = (local_end - timedelta(days=DAYS)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows: dict[str, list[Row]] = {}
    last: dict[str, tuple] = {}

    def record(entity_id: str, t: datetime, state: str, attributes: dict[str, Any], key: tuple) -> None:
        if last.get(entity_id) == key:
            return
        last[entity_id] = key
        rows.setdefault(entity_id, []).append((t.timestamp(), state, attributes))

    def attributes_of(entity_id: str, **values: Any) -> tuple[str, dict[str, Any]]:
        """Attributes of the entity now (friendly name, unit…), with the simulated values."""
        state = hass.states.get(entity_id)
        base = {k: v for k, v in (state.attributes if state else {}).items() if k != "measured_at"}
        return (state.state if state else "unknown"), {**base, **values}

    states = {room: State.at(17.5) for room in ROOMS}
    heaters = {room: False for room in ROOMS}
    on_minutes = {room: 0 for room in ROOMS}  # of the current cycle
    reported: dict[str, float | None] = {room: None for room in ROOMS}  # last value of each sensor
    manual_day = (local_end - timedelta(days=MANUAL["days_ago"])).date()
    t = start
    while t < local_end:
        mildness, sunshine = weather(t.date())
        ext = outdoor(t, mildness)
        _, ext_attributes = attributes_of("sensor.temperature_exterieure")
        record("sensor.temperature_exterieure", t, f"{ext:.1f}", ext_attributes, (round(ext, 1),))
        for entity_id, room in THERMOSTATS.items():
            if hass.states.get(entity_id) is None:
                continue
            preset, target = setpoint(entity_id, t) if setpoint else ("eco", 17.0)
            minute = t.hour * 60 + t.minute
            manual = (entity_id == MANUAL["entity_id"] and t.date() == manual_day
                      and MANUAL["start"] <= minute < MANUAL["end"])
            if manual:
                preset, target = "none", MANUAL["temperature"]
            shown = reported[room] = sensor(ROOMS[room], states[room], t, reported[room])
            if minute % CYCLE == 0:
                share = TPI_INDOOR * (target - shown) + TPI_OUTDOOR * (target - ext)
                on_minutes[room] = round(max(0.0, min(1.0, share)) * CYCLE)
            heaters[room] = minute % CYCLE < on_minutes[room]
            _, sensor_attributes = attributes_of(f"sensor.temperature_{room}")
            record(f"sensor.temperature_{room}", t, f"{shown:.1f}", sensor_attributes, (shown,))
            _, heater_attributes = attributes_of(f"input_boolean.radiateur_{room}")
            record(f"input_boolean.radiateur_{room}", t, "on" if heaters[room] else "off", heater_attributes,
                   (heaters[room],))
            hvac, climate_attributes = attributes_of(
                entity_id, current_temperature=shown, temperature=target,
                hvac_action="heating" if heaters[room] else "idle")
            if "preset_mode" in climate_attributes:
                modes = climate_attributes.get("preset_modes") or []
                climate_attributes["preset_mode"] = (preset if preset in modes
                                                     else "none" if "none" in modes else None)
            record(entity_id, t, hvac, climate_attributes,
                   (shown, target, climate_attributes.get("preset_mode"), heaters[room]))
            states[room] = step(ROOMS[room], states[room], heaters[room], t, 1 / 60, mildness, sunshine,
                                day_of(ROOMS[room], t.date()))
        t += timedelta(minutes=1)
    return rows, states


# ----- recorder -----

def _first_recorded(session, entities: list[str]) -> float | None:
    ids = [m.metadata_id for m in session.query(StatesMeta).filter(StatesMeta.entity_id.in_(entities))]
    if not ids:
        return None
    first = session.query(States.last_updated_ts).filter(States.metadata_id.in_(ids)) \
        .order_by(States.last_updated_ts).first()
    return first[0] if first else None


def _write(session, rows: dict[str, list[Row]]) -> int:
    """Adds the rows as recorded states. Only for entities the recorder already knows (it caches
    the ids of the entities it records)."""
    metas = {m.entity_id: m.metadata_id
             for m in session.query(StatesMeta).filter(StatesMeta.entity_id.in_(list(rows)))}
    shared: dict[str, StateAttributes] = {}
    count = 0
    for entity_id, entity_rows in rows.items():
        if entity_id not in metas:
            continue
        previous_state, changed_at = None, None
        for time, state, attributes in entity_rows:
            text = json_bytes(attributes).decode()
            if text not in shared:
                shared[text] = StateAttributes(shared_attrs=text, hash=StateAttributes.hash_shared_attrs_bytes(text.encode()))
            if state != previous_state:
                previous_state, changed_at = state, time
            session.add(States(
                state=state, metadata_id=metas[entity_id], state_attributes=shared[text], origin_idx=0,
                last_updated_ts=time, last_changed_ts=None if changed_at == time else changed_at,
            ))
            count += 1
    return count


@dataclass(slots=True)
class _Job(RecorderTask):
    """Runs a function on the recorder's thread, with a session, and hands back its result."""

    job: Callable[[Any], Any]
    loop: asyncio.AbstractEventLoop
    future: asyncio.Future

    def run(self, instance) -> None:
        try:
            with session_scope(session=instance.get_session()) as session:
                result = self.job(session)
        except Exception as err:  # noqa: BLE001 - handed back to the caller
            self.loop.call_soon_threadsafe(self.future.set_exception, err)
            return
        self.loop.call_soon_threadsafe(self.future.set_result, result)


async def _run(hass: HomeAssistant, job: Callable[[Any], Any]) -> Any:
    future = hass.loop.create_future()
    get_instance(hass).queue_task(_Job(job, hass.loop, future))
    return await future
