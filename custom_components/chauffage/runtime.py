"""The scheduler: replaces the package's two automations.

- every minute: slots starting now, overrides ending now;
- full realignment when HA starts, the mode changes or the schedules are saved;
- a manual change on a scheduled thermostat becomes a temporary override.

The integration calls services with its own contexts: state changes carrying one of them are
its own (not manual changes).
"""

from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import Callable
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, Context, Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_change
from homeassistant.util import dt as dt_util

from . import engine, model
from .const import CONF_OVERRIDE_DURATION, CONF_USE_PRESETS, DEFAULT_OVERRIDE_DURATION, DEFAULT_USE_PRESETS
from .store import SAVE_DELAY, ChauffageStore

_LOGGER = logging.getLogger(__name__)

# Listener reasons: "data" (schedules, overrides, mode changed) or "tick" (every minute)
DATA, TICK = "data", "tick"


class StaleRevision(Exception):
    """Schedules saved from an outdated copy (edited elsewhere in the meantime)."""


def thermostat(state: State | None) -> engine.Thermostat | None:
    if state is None:
        return None
    attributes = state.attributes
    presets = attributes.get("preset_modes") or ()
    return engine.Thermostat(
        state.state,
        engine.preset_value(attributes.get("preset_mode")),
        engine.temperature_value(attributes.get("temperature")),
        tuple(p for p in (engine.preset_value(p) for p in presets) if p),
        engine.temperature_value(attributes.get("min_temp")),
        engine.temperature_value(attributes.get("max_temp")),
        engine.temperature_value(attributes.get("target_temp_step")),
    )


class ChauffageRuntime:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, store: ChauffageStore, data: dict[str, Any]) -> None:
        self.hass = hass
        self.entry = entry
        self.store = store
        self.data = data
        # Temperature last seen for each preset of each thermostat (no standard attribute gives
        # it): shown by the card. Not in older stored data.
        data.setdefault("preset_temperatures", {})
        self.pause = 0.3  # seconds between two thermostats (Zigbee network)
        self._own_contexts: deque[str] = deque(maxlen=500)
        self._lock = asyncio.Lock()
        self._listeners: set[Callable[[str], None]] = set()
        self._unsubs: list[Callable[[], None]] = []
        self._unsub_states: Callable[[], None] | None = None

    # ----- life cycle -----

    async def async_start(self) -> None:
        self._unsubs.append(async_track_time_change(self.hass, self._tick, second=0))
        self._track_thermostats()
        for entity_id in self.data["schedules"]:
            self._learn(self.hass.states.get(entity_id))
        if self.hass.state is CoreState.running:
            self.entry.async_create_task(self.hass, self.apply(force=True), "chauffage realign")
        else:
            @callback
            def started(_event: Event) -> None:
                self.entry.async_create_task(self.hass, self.apply(force=True), "chauffage realign")

            self._unsubs.append(self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started))

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None

    # ----- listeners (entities, websocket) -----

    @callback
    def async_add_listener(self, listener: Callable[[str], None]) -> Callable[[], None]:
        self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)

    @callback
    def _notify(self, reason: str = DATA) -> None:
        for listener in list(self._listeners):
            listener(reason)

    @callback
    def _changed(self) -> None:
        self.store.async_delay_save(lambda: self.data, SAVE_DELAY)
        self._notify(DATA)

    # ----- reading -----

    @property
    def override_duration(self) -> int:
        return int(self.entry.options.get(CONF_OVERRIDE_DURATION, DEFAULT_OVERRIDE_DURATION))

    @property
    def mode_ids(self) -> set[str]:
        return {m["id"] for m in self.data["modes"]}

    def mode_name(self, mode_id: str) -> str | None:
        return next((m["name"] for m in self.data["modes"] if m["id"] == mode_id), None)

    @property
    def level_ids(self) -> set[str]:
        return {level["id"] for level in self.data["levels"]}

    def plan(self) -> engine.Plan:
        return engine.Plan(
            self.data["schedules"],
            self.data["active_mode"],
            {level["id"]: level for level in self.data["levels"]},
            self.data["mappings"],
            self.data["overrides"],
            self.use_presets,
        )

    @property
    def use_presets(self) -> bool:
        return bool(self.entry.options.get(CONF_USE_PRESETS, DEFAULT_USE_PRESETS))

    def targets_of(self, entity_id: str) -> dict[str, dict[str, Any]]:
        """What each level means for a thermostat (mapping set by hand, else the default)."""
        plan = self.plan()
        current = thermostat(self.hass.states.get(entity_id))
        out = {}
        for level_id in plan.levels:
            target = engine.resolve(level_id, plan.levels, plan.mappings.get(entity_id), current, plan.use_presets)
            if target:
                out[level_id] = target.as_dict()
        return out

    def snapshot(self) -> dict[str, Any]:
        """Everything the card needs."""
        return {
            "modes": self.data["modes"],
            "active_mode": self.data["active_mode"],
            "levels": self.data["levels"],
            "mappings": self.data["mappings"],
            "targets": {e: self.targets_of(e) for e in self.data["schedules"]},
            "schedules": self.data["schedules"],
            "overrides": self.data["overrides"],
            "preset_temperatures": self.data["preset_temperatures"],
            "use_presets": self.use_presets,
            "revision": self.data["revision"],
            "override_duration": self.override_duration,
        }

    def planned(self, entity_id: str, now: datetime | None = None) -> tuple[str | None, str | None, datetime | None]:
        """(level now, next level, its start) for a thermostat in the active mode."""
        week = self.data["schedules"].get(entity_id, {}).get(self.data["active_mode"])
        if not week:
            return None, None, None
        return engine.current_and_next(week, now or dt_util.now())

    # ----- writing -----

    async def save_schedules(self, schedules: Any, revision: int | None = None) -> None:
        if revision is not None and revision != self.data["revision"]:
            raise StaleRevision
        self.data["schedules"] = model.normalize_schedules(schedules, self.mode_ids, self.level_ids)
        for entity_id in set(self.data["preset_temperatures"]) - set(self.data["schedules"]):
            del self.data["preset_temperatures"][entity_id]
        self.data["revision"] += 1
        self._track_thermostats()
        for entity_id in self.data["schedules"]:
            self._learn(self.hass.states.get(entity_id))
        self._changed()
        await self.apply(force=True)

    async def set_levels(self, levels: list[Any], replacements: dict[str, str] | None = None) -> None:
        """New list of levels; a removed level is replaced in the schedules by the level given
        in `replacements` (it must exist), and its mappings are dropped."""
        taken: set[str] = set()
        new_levels = []
        for level in levels:
            normalized = model.normalize_level(level, taken | self.level_ids)
            if normalized["id"] in taken:
                raise model.InvalidData(f"duplicate level: {normalized['id']}")
            taken.add(normalized["id"])
            new_levels.append(normalized)
        if not new_levels:
            raise model.InvalidData("at least one level is needed")
        removed = self.level_ids - taken
        replacements = replacements or {}
        used = set(model.used_levels(self.data["schedules"]))
        for level_id in removed & used:
            if replacements.get(level_id) not in taken:
                raise model.InvalidData(f"{level_id} is used in schedules: choose a replacement")
        if removed & used:
            for modes in self.data["schedules"].values():
                for mode, week in modes.items():
                    modes[mode] = model.normalize_week(
                        [[[start, replacements.get(level, level)] for start, level in day] for day in week]
                    )
            self.data["revision"] += 1
        for mapping in self.data["mappings"].values():
            for level_id in removed:
                mapping.pop(level_id, None)
        self.data["levels"] = new_levels
        self._changed()
        await self.apply(force=True)

    async def set_mapping(self, entity_id: str, mapping: Any) -> None:
        """Mapping set by hand for one thermostat ({} = defaults only)."""
        normalized = model.normalize_mapping(mapping, self.level_ids)
        if normalized:
            self.data["mappings"][entity_id] = normalized
        else:
            self.data["mappings"].pop(entity_id, None)
        self._changed()
        await self.apply(force=True)

    async def set_mode(self, mode_id: str) -> None:
        if mode_id not in self.mode_ids:
            raise model.InvalidData(f"unknown mode: {mode_id}")
        if mode_id == self.data["active_mode"]:
            return
        self.data["active_mode"] = mode_id
        self._changed()
        await self.apply(force=True)

    async def set_override(self, entity_id: str, override: dict[str, Any] | None) -> None:
        """Create / extend (override) or remove (None) a thermostat's override."""
        if override is None:
            if self.data["overrides"].pop(entity_id, None) is None:
                return
            self._changed()
            await self.apply(resumed=entity_id)
            return
        self.data["overrides"][entity_id] = model.normalize_override(override)
        self._changed()

    def new_override(self, kind: str, value: Any, minutes: int | None = None, end: datetime | None = None) -> dict[str, Any]:
        start = dt_util.now().replace(microsecond=0)
        end = end or start + timedelta(minutes=minutes or self.override_duration)
        return {"kind": kind, "value": value, "start": start.isoformat(), "end": end.replace(microsecond=0).isoformat()}

    async def call_climate(self, service: str, entity_id: str, data: dict[str, Any]) -> bool:
        """Calls a climate service with the integration's own context; False if it failed."""
        context = Context()
        self._own_contexts.append(context.id)
        try:
            await self.hass.services.async_call(
                "climate", service, {"entity_id": entity_id, **data}, blocking=True, context=context
            )
        except Exception as err:  # noqa: BLE001 — one unreachable valve must not stop the others
            _LOGGER.warning("%s: climate.%s failed: %s", entity_id, service, err)
            return False
        return True

    # ----- scheduling -----

    async def apply(self, *, force: bool = False, resumed: str | None = None, ended: list[str] | None = None) -> None:
        async with self._lock:
            schedules = self.data["schedules"]
            todo = engine.targets(
                self.plan(),
                dt_util.now(),
                {e: t for e in schedules if (t := thermostat(self.hass.states.get(e)))},
                force=force,
                resumed=resumed,
                ended=ended or (),
            )
            for i, (entity_id, target) in enumerate(todo):
                if i and self.pause:
                    await asyncio.sleep(self.pause)
                if target.kind == "preset":
                    await self.call_climate("set_preset_mode", entity_id, {"preset_mode": target.value})
                else:
                    await self.call_climate("set_temperature", entity_id, {"temperature": target.value})

    async def _tick(self, now: datetime) -> None:
        ended = engine.ended_overrides(self.data["overrides"], dt_util.now())
        await self.apply(ended=ended)
        if ended:
            for entity_id in ended:
                self.data["overrides"].pop(entity_id, None)
            self._changed()
        self._notify(TICK)

    # ----- manual changes -----

    @callback
    def _track_thermostats(self) -> None:
        if self._unsub_states:
            self._unsub_states()
        entities = list(self.data["schedules"])
        self._unsub_states = (
            async_track_state_change_event(self.hass, entities, self._state_changed) if entities else None
        )

    @callback
    def _learn(self, state: State | None) -> None:
        """While a thermostat is on a preset, its setpoint is that preset's temperature."""
        current = thermostat(state)
        if current is None or current.state in engine.IGNORED_STATES or current.temperature is None:
            return
        if engine.is_manual_preset(current.preset):
            return
        known = self.data["preset_temperatures"].setdefault(state.entity_id, {})
        if known.get(current.preset) != current.temperature:
            known[current.preset] = current.temperature
            self._changed()

    @callback
    def _state_changed(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        self._learn(new)
        if old is None or new is None:
            return
        context = new.context
        # Changes made by the schedule, or by any automation / script, are not overrides
        if context.id in self._own_contexts or context.parent_id is not None:
            return
        after = thermostat(new)
        expected = self.plan().expected(new.entity_id, dt_util.now(), after)
        change = engine.manual_change(thermostat(old), after, by_user=context.user_id is not None, expected=expected)
        if change is None:
            return
        override = self.new_override(*change)
        self.entry.async_create_task(self.hass, self.set_override(new.entity_id, override), "chauffage override")
