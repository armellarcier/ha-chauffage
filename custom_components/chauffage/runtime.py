"""The scheduler: replaces the package's two automations.

- every minute: slots starting now, overrides ending now;
- full realignment when HA starts, a schedule is activated or the weeks are saved;
- a manual change on a scheduled thermostat becomes a temporary override;
- activation rules: their templates are tracked, and a change of their outcome activates a
  schedule (a schedule chosen by hand stays until then).

The integration calls services with its own contexts: state changes carrying one of them are
its own (not manual changes).
"""

from __future__ import annotations

import asyncio
import copy
from collections import deque
from collections.abc import Callable
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, Context, Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.exceptions import TemplateError
from homeassistant.helpers.event import (
    TrackTemplate,
    async_track_state_change_event,
    async_track_template_result,
    async_track_time_change,
)
from homeassistant.helpers.template import Template, result_as_boolean
from homeassistant.util import dt as dt_util

from . import engine, model
from .history import TemperatureHistory
from .const import CONF_OVERRIDE_DURATION, CONF_USE_PRESETS, DEFAULT_OVERRIDE_DURATION, DEFAULT_USE_PRESETS
from .store import SAVE_DELAY, ChauffageStore

_LOGGER = logging.getLogger(__name__)

# Listener reasons: "data" (schedules, weeks, presets, overrides changed) or "tick" (every minute)
DATA, TICK = "data", "tick"


class StaleRevision(Exception):
    """Weeks or schedules saved from an outdated copy (edited elsewhere in the meantime)."""


class ThermostatFailed(Exception):
    """The thermostat could not be set to an override's value."""


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
        self.pause = 0.3  # seconds between two thermostats (Zigbee network)
        self._own_contexts: deque[str] = deque(maxlen=500)
        self._lock = asyncio.Lock()
        self._listeners: set[Callable[[str], None]] = set()
        self._unsubs: list[Callable[[], None]] = []
        self._unsub_states: Callable[[], None] | None = None
        self._last_tick: datetime | None = None
        self._retry: set[str] = set()  # thermostats whose last command failed
        self.history = TemperatureHistory(hass)  # measured temperature, for the card
        self._unsub_rules: Callable[[], None] | None = None
        self.rule_results: list[Any] = []  # each rule now (see render_rule)

    # ----- life cycle -----

    async def async_start(self) -> None:
        self._last_tick = dt_util.now()  # the realignment below covers the time before
        self._unsubs.append(async_track_time_change(self.hass, self._tick, second=0))
        self._track_thermostats()
        for entity_id in self.active:
            self._learn(self.hass.states.get(entity_id))
        if self.hass.state is CoreState.running:
            self.entry.async_create_task(self.hass, self._started(), "chauffage realign")
        else:
            @callback
            def started(_event: Event) -> None:
                self.entry.async_create_task(self.hass, self._started(), "chauffage realign")

            self._unsubs.append(self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started))

    async def _started(self) -> None:
        # The rules wait for HA to have started: their entities are not all there before
        self._track_rules()
        await self.follow_rules()
        await self.apply(force=True)

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        if self._unsub_rules:
            self._unsub_rules()
            self._unsub_rules = None

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
    def schedule_ids(self) -> set[str]:
        return {m["id"] for m in self.data["schedules"]}

    def schedule_name(self, schedule_id: str) -> str | None:
        return next((m["name"] for m in self.data["schedules"] if m["id"] == schedule_id), None)

    @property
    def preset_ids(self) -> set[str]:
        return {preset["id"] for preset in self.data["presets"]}

    @property
    def thermostats(self) -> dict[str, dict[str, Any]]:
        """The scheduled thermostats, paused ones included (model.py)."""
        return self.data["thermostats"]

    @property
    def active(self) -> list[str]:
        """The scheduled thermostats Chauffage drives (not paused)."""
        return [entity_id for entity_id, t in self.thermostats.items() if not t["paused"]]

    def is_paused(self, entity_id: str) -> bool:
        return self.thermostats.get(entity_id, {}).get("paused", False)

    @property
    def weeks(self) -> dict[str, dict[str, Any]]:
        """{thermostat: {schedule id: week}}, the thermostats' own dictionaries."""
        return {entity_id: t["weeks"] for entity_id, t in self.thermostats.items()}

    @property
    def mappings(self) -> dict[str, dict[str, Any]]:
        return {entity_id: t["mapping"] for entity_id, t in self.thermostats.items() if t["mapping"]}

    @property
    def preset_temperatures(self) -> dict[str, dict[str, float]]:
        return {entity_id: t["preset_temperatures"] for entity_id, t in self.thermostats.items() if t["preset_temperatures"]}

    def plan(self) -> engine.Plan:
        """What the active thermostats follow: paused ones are left out."""
        return engine.Plan(
            {entity_id: self.thermostats[entity_id]["weeks"] for entity_id in self.active},
            self.data["active_schedule"],
            {preset["id"]: preset for preset in self.data["presets"]},
            self.mappings,
            self.data["overrides"],
            self.use_presets,
        )

    @property
    def use_presets(self) -> bool:
        return bool(self.entry.options.get(CONF_USE_PRESETS, DEFAULT_USE_PRESETS))

    def targets_of(self, entity_id: str) -> dict[str, dict[str, Any]]:
        """What each preset means for a thermostat (mapping set by hand, else the default)."""
        plan = self.plan()
        current = thermostat(self.hass.states.get(entity_id))
        out = {}
        for preset_id in plan.presets:
            target = engine.resolve(preset_id, plan.presets, plan.mappings.get(entity_id), current, plan.use_presets)
            if target:
                out[preset_id] = target.as_dict()
        return out

    def snapshot(self) -> dict[str, Any]:
        """Everything the card needs."""
        return {
            "schedules": self.data["schedules"],
            "active_schedule": self.data["active_schedule"],
            "presets": self.data["presets"],
            "thermostats": {e: {"paused": t["paused"]} for e, t in self.thermostats.items()},
            "mappings": self.mappings,
            "targets": {e: self.targets_of(e) for e in self.thermostats},
            "weeks": self.weeks,
            "overrides": self.data["overrides"],
            "preset_temperatures": self.preset_temperatures,
            "use_presets": self.use_presets,
            "revision": self.data["revision"],
            "override_duration": self.override_duration,
            "rules": self.data["rules"],
            "default_schedule": self.data["default_schedule"],
            "rule_results": self.rule_results,
        }

    def planned(self, entity_id: str, now: datetime | None = None) -> tuple[str | None, str | None, datetime | None]:
        """(preset now, next preset, its start) for a thermostat in the active schedule."""
        week = self.weeks.get(entity_id, {}).get(self.data["active_schedule"])
        if not week:
            return None, None, None
        return engine.current_and_next(week, now or dt_util.now())

    # ----- writing -----

    def _scheduled(self, entity_id: str) -> dict[str, Any]:
        """The thermostat's data; a thermostat the card brings is scheduled, active."""
        return self.thermostats.setdefault(entity_id, model.new_thermostat())

    async def save_weeks(self, weeks: Any, revision: int | None = None) -> None:
        if revision is not None and revision != self.data["revision"]:
            raise StaleRevision
        normalized = model.normalize_weeks(weeks, self.schedule_ids, self.preset_ids)
        for entity_id in set(self.thermostats) - set(normalized):
            if self.thermostats[entity_id]["mapping"]:
                self.thermostats[entity_id].update(weeks={}, preset_temperatures={})
            else:
                del self.thermostats[entity_id]
        for entity_id, by_schedule in normalized.items():
            self._scheduled(entity_id)["weeks"] = by_schedule
        self.data["revision"] += 1
        self._track_thermostats()
        for entity_id in self.active:
            self._learn(self.hass.states.get(entity_id))
        self._changed()
        await self.apply(force=True)

    async def set_paused(self, entity_id: str, paused: bool) -> None:
        """Pause (kept, not driven, its override dropped and the thermostat left as it is) or
        resume (realigned at once)."""
        if entity_id not in self.thermostats:
            raise model.InvalidData(f"not scheduled: {entity_id}")
        if self.is_paused(entity_id) == paused:
            return
        self.thermostats[entity_id]["paused"] = paused
        if paused:
            self.data["overrides"].pop(entity_id, None)
            self._retry.discard(entity_id)
        self._track_thermostats()
        self._changed()
        if not paused:
            self._learn(self.hass.states.get(entity_id))
            await self.apply(include={entity_id})

    async def set_presets(self, presets: list[Any], replacements: dict[str, str] | None = None) -> None:
        """New list of presets; a removed preset is replaced in the weeks by the preset given
        in `replacements` (it must exist), and its mappings are dropped."""
        taken: set[str] = set()
        new_presets = []
        for preset in presets:
            normalized = model.normalize_preset(preset, taken | self.preset_ids)
            if normalized["id"] in taken:
                raise model.InvalidData(f"duplicate preset: {normalized['id']}")
            taken.add(normalized["id"])
            new_presets.append(normalized)
        if not new_presets:
            raise model.InvalidData("at least one preset is needed")
        removed = self.preset_ids - taken
        replacements = replacements or {}
        used = set(model.used_presets(self.weeks))
        for preset_id in removed & used:
            if replacements.get(preset_id) not in taken:
                raise model.InvalidData(f"{preset_id} is used in the weeks: choose a replacement")
        if removed & used:
            for by_schedule in self.weeks.values():
                for schedule_id, week in by_schedule.items():
                    by_schedule[schedule_id] = model.normalize_week(
                        [[[start, replacements.get(preset, preset)] for start, preset in day] for day in week]
                    )
            self.data["revision"] += 1
        for t in self.thermostats.values():
            for preset_id in removed:
                t["mapping"].pop(preset_id, None)
        self.data["presets"] = new_presets
        self._changed()
        await self.apply(force=True)

    async def set_mapping(self, entity_id: str, mapping: Any) -> None:
        """Mapping set by hand for one thermostat ({} = defaults only)."""
        normalized = model.normalize_mapping(mapping, self.preset_ids)
        if normalized or entity_id in self.thermostats:
            self._scheduled(entity_id)["mapping"] = normalized
            self._track_thermostats()
        self._changed()
        await self.apply(force=True)

    async def set_schedules(self, items: Any, revision: int | None = None) -> list[dict[str, str]]:
        """Create (empty or a copy), rename, move and delete schedules (see model.plan_schedules).
        An empty schedule puts every scheduled thermostat in eco (or the first preset) all week.
        The active schedule and its weeks do not change: the thermostats are not touched."""
        if revision is not None and revision != self.data["revision"]:
            raise StaleRevision
        schedules, created = model.plan_schedules(items, self.data["schedules"], self.data["active_schedule"])
        kept = {s["id"] for s in schedules}
        in_rules = ({rule["schedule"] for rule in self.data["rules"]} | {self.data["default_schedule"]}) - {None}
        if in_rules - kept:
            raise model.InvalidData(f"used by the activation rules: {sorted(in_rules - kept)}")
        preset_ids = [preset["id"] for preset in self.data["presets"]]
        fill = "eco" if "eco" in preset_ids else preset_ids[0]
        for weeks in self.weeks.values():
            for schedule_id in set(weeks) - kept:
                del weeks[schedule_id]
            for schedule_id, source in created.items():
                if source is None:
                    weeks[schedule_id] = [[["00:00", fill]] for _ in range(7)]
                elif source in weeks:
                    weeks[schedule_id] = copy.deepcopy(weeks[source])
        self.data["schedules"] = schedules
        self.data["revision"] += 1
        self._changed()
        return copy.deepcopy(schedules)

    async def activate_schedule(self, schedule_id: str) -> None:
        if schedule_id not in self.schedule_ids:
            raise model.InvalidData(f"unknown schedule: {schedule_id}")
        if schedule_id == self.data["active_schedule"]:
            return
        self.data["active_schedule"] = schedule_id
        self._changed()
        await self.apply(force=True)

    # ----- activation rules -----

    async def set_rules(self, rules: Any, default_schedule: Any) -> None:
        """New activation rules, applied at once (even over a schedule chosen by hand)."""
        normalized = model.normalize_rules(rules, default_schedule, self.schedule_ids)
        for rule in normalized:
            try:
                Template(rule["template"], self.hass).ensure_valid()
            except TemplateError as err:
                raise model.InvalidData(f"invalid template: {err}") from err
        self.data["rules"], self.data["default_schedule"] = normalized, default_schedule
        self._changed()
        self._track_rules()
        await self.follow_rules(force=True)

    @callback
    def _track_rules(self) -> None:
        """Watches the entities (and the time) the templates of the rules depend on."""
        if self._unsub_rules:
            self._unsub_rules()
        self.rule_results = []

        @callback
        def changed() -> None:
            self.entry.async_create_task(self.hass, self.follow_rules(), "chauffage rules")

        self._unsub_rules = self.track_templates([rule["template"] for rule in self.data["rules"]], changed)

    @callback
    def track_templates(self, templates: list[str], action: Callable[[], None]) -> Callable[[], None] | None:
        """Calls `action` (a callback) when the result of one of these templates may have changed:
        HA's template tracking (the entities they read, the time when they use now()). Empty and
        invalid templates are left out; None when nothing is tracked."""
        tracked = []
        for text in templates:
            template = Template(text, self.hass)
            try:
                template.ensure_valid()
            except TemplateError:
                continue
            if text.strip():
                tracked.append(TrackTemplate(template, None))
        if not tracked:
            return None

        @callback
        def changed(_event: Event | None, _updates: list) -> None:
            action()

        return async_track_template_result(self.hass, tracked, changed).async_remove

    def render_rule(self, rule: dict[str, Any]) -> tuple[Any, str | None, str | None]:
        """(result, text, error) of a rule now. The result: True / False for a rule with a schedule,
        the schedule its template gives (False: none) for a rule without; None when its template is
        empty or fails (the rule does not apply)."""
        if not rule["template"].strip():
            return None, None, None
        try:
            text = Template(rule["template"], self.hass).async_render(parse_result=False)
        except TemplateError as err:
            return None, None, str(err)
        if rule["schedule"]:
            return result_as_boolean(text), text, None
        return model.schedule_named(text, self.data["schedules"]) or False, text, None

    def _evaluate_rules(self) -> list[Any]:
        results = []
        for rule in self.data["rules"]:
            result, _, error = self.render_rule(rule)
            if error:
                _LOGGER.warning("Activation rule %s: %s", rule["template"], error)
            results.append(result)
        return results

    async def follow_rules(self, force: bool = False) -> None:
        """Activates the schedule the rules give when their outcome changed (or `force`)."""
        results = self._evaluate_rules()
        notify = results != self.rule_results
        self.rule_results = results
        outcome = model.rules_outcome(self.data["rules"], results, self.data["default_schedule"])
        changed = outcome != self.data["rules_choice"]
        if changed:
            self.data["rules_choice"] = outcome
            self._changed()
        elif notify:
            self._notify(DATA)
        if outcome is not None and (changed or force):
            await self.activate_schedule(outcome)

    async def set_override(self, entity_id: str, override: dict[str, Any] | None, *, resend: bool = False) -> None:
        """Create / change / extend (override) or remove (None) a thermostat's override, from the
        card or the service.

        A temperature is fitted to the thermostat (limits, step). A new override or a new value
        is sent to the thermostat unless it already has it; a new end alone is not, unless
        `resend` (the service: an automation setting it again puts back a thermostat that lost
        it). ThermostatFailed, and nothing recorded, if the thermostat could not be reached; none
        on a paused thermostat."""
        if override is not None and self.is_paused(entity_id):
            raise model.InvalidData(f"paused: {entity_id}")
        if override is None:
            if self.data["overrides"].pop(entity_id, None) is None:
                return
            self._changed()
            await self.apply(resumed=entity_id)
            return
        override = model.normalize_override(override)
        current = thermostat(self.hass.states.get(entity_id))
        if override["kind"] == "temperature" and current is not None:
            override["value"] = engine.fit_temperature(override["value"], current)
        target = engine.Target(override["kind"], override["value"])
        before = self.data["overrides"].get(entity_id)
        new_value = before is None or (before["kind"], before["value"]) != (target.kind, target.value)
        if (new_value or resend) and (current is None or not engine.satisfied(target, current)):
            service, data = (
                ("set_temperature", {"temperature": target.value}) if target.kind == "temperature"
                else ("set_preset_mode", {"preset_mode": target.value})
            )
            if not await self.call_climate(service, entity_id, data):
                raise ThermostatFailed(entity_id)
        self.data["overrides"][entity_id] = override
        self._changed()

    @callback
    def record_override(self, entity_id: str, override: dict[str, Any]) -> None:
        """The override of a change by hand, only recorded: the thermostat set it itself, and
        sending it back could undo a second change made meanwhile."""
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

    async def apply(self, *, force: bool = False, resumed: str | None = None, ended: list[str] | None = None,
                    since: datetime | None = None, include: set[str] | None = None) -> None:
        async with self._lock:
            todo = engine.targets(
                self.plan(),
                dt_util.now(),
                {e: t for e in self.active if (t := thermostat(self.hass.states.get(e)))},
                force=force,
                resumed=resumed,
                ended=ended or (),
                since=since,
                include=frozenset(include or ()) | frozenset(self._retry),
            )
            # A thermostat to retry that needs nothing anymore (already right, override, off…)
            self._retry &= {entity_id for entity_id, _ in todo}
            for i, (entity_id, target) in enumerate(todo):
                if i and self.pause:
                    await asyncio.sleep(self.pause)
                if target.kind == "preset":
                    done = await self.call_climate("set_preset_mode", entity_id, {"preset_mode": target.value})
                else:
                    done = await self.call_climate("set_temperature", entity_id, {"temperature": target.value})
                # Not delivered (unreachable valve…): sent again at the next minutes
                if done:
                    self._retry.discard(entity_id)
                else:
                    self._retry.add(entity_id)

    async def _tick(self, now: datetime) -> None:
        ended = engine.ended_overrides(self.data["overrides"], dt_util.now())
        since, self._last_tick = self._last_tick, dt_util.now()
        await self.apply(ended=ended, since=since)
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
        entities = self.active
        self._unsub_states = (
            async_track_state_change_event(self.hass, entities, self._state_changed) if entities else None
        )

    @callback
    def _learn(self, state: State | None) -> None:
        """While a thermostat is on a preset, its setpoint is that preset's temperature."""
        current = thermostat(state)
        if current is None or current.state in engine.IGNORED_STATES or current.temperature is None:
            return
        if engine.is_manual_preset(current.preset) or state.entity_id not in self.thermostats:
            return
        known = self.thermostats[state.entity_id]["preset_temperatures"]
        if known.get(current.preset) != current.temperature:
            known[current.preset] = current.temperature
            self._changed()

    @callback
    def _state_changed(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        self._learn(new)
        if old is None or new is None:
            return
        if old.state in engine.IGNORED_STATES and new.state not in engine.IGNORED_STATES:
            # Turned back on, or back online: the thermostat may have missed slot changes
            self.entry.async_create_task(self.hass, self.apply(include={new.entity_id}), "chauffage catch up")
            return
        context = new.context
        # Changes made by the schedule, or by any automation / script, are not overrides
        if context.id in self._own_contexts or context.parent_id is not None:
            return
        after = thermostat(new)
        expected = self.plan().expected(new.entity_id, dt_util.now(), after)
        preset_temperature = engine.preset_temperature(
            dict(new.attributes), expected.value, self.thermostats[new.entity_id]["preset_temperatures"]
        ) if expected is not None and expected.kind == "preset" else None
        current = self.data["overrides"].get(new.entity_id)
        change = engine.manual_change(
            thermostat(old), after, by_user=context.user_id is not None, expected=expected,
            preset_temperature=preset_temperature,
            override=engine.Target(current["kind"], current["value"]) if current else None,
        )
        if change is None:
            return
        if change == engine.RESUME:
            if new.entity_id in self.data["overrides"]:
                self.entry.async_create_task(self.hass, self.set_override(new.entity_id, None), "chauffage resume")
            return
        self.record_override(new.entity_id, self.new_override(*change))
