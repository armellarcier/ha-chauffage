"""The commands on the schedules, the weeks, the presets and their values: from the card, the
entities and the services."""

from __future__ import annotations

import copy
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context
from homeassistant.helpers import entity_registry as er

from ..const import EVENT_SCHEDULE_ACTIVATED, HEAT_COOL
from ..domain.plan import Forced
from ..domain.slot import Slot, slot_hvac_mode
from ..domain.target import SETPOINT_KEYS
from ..storage import schema
from ..storage.schema import InvalidData
from ..thermostats.reader import read

if TYPE_CHECKING:
    from .runtime import ChauffageRuntime

_LOGGER = logging.getLogger(__name__)


class StaleRevision(Exception):
    """Weeks or schedules saved from an outdated copy (edited elsewhere in the meantime)."""


class Schedules:
    def __init__(self, runtime: ChauffageRuntime) -> None:
        self._runtime = runtime

    async def save_weeks(self, weeks: Any, revisions: dict[str, int | None] | None = None) -> None:
        """The weeks of the thermostats sent; the others keep theirs: a thermostat a card does
        not show stays scheduled (#27), only forget() drops it. A thermostat keeps its weeks in
        the schedules not sent, and gets the week of a new schedule in those it had none in: a
        scheduled thermostat has a week in every schedule. Saved against the revision of each
        thermostat sent (`revisions`; None: not scheduled when the copy was made). StaleRevision
        if one of them changed."""
        runtime = self._runtime
        installation = runtime.installation
        normalized = schema.normalize_weeks(weeks, installation.schedule_ids, installation.preset_ids)
        if any(runtime.registry.renamed_to(entity_id) for entity_id in normalized):
            raise StaleRevision  # a copy holding a former id: reloaded, the card sets it aside
        # A card may list a climate removed from Home Assistant: never schedule a ghost
        registry = er.async_get(runtime.hass)
        scheduled = installation.scheduled
        for entity_id in normalized:
            if (entity_id not in scheduled and runtime.hass.states.get(entity_id) is None
                    and registry.async_get(entity_id) is None):
                raise InvalidData(f"{entity_id} does not exist")
        if revisions is not None:
            for entity_id in normalized:
                current = scheduled.get(entity_id, {}).get("revision")
                if revisions.get(entity_id) != current:
                    raise StaleRevision
        # A thermostat whose HVAC mode Chauffage does not control: its slots choose none (#159)
        for entity_id, by_schedule in normalized.items():
            if not runtime.settings.controls_hvac_mode(entity_id) and any(
                    len(slot) > 2 and "hvac_mode" in slot[2]
                    for week in by_schedule.values() for day in week for slot in day):
                raise InvalidData(f"{entity_id}: Chauffage does not control its HVAC mode")
        schedule_ids = [schedule["id"] for schedule in installation.schedules]
        preset_ids = list(installation.presets_by_id)
        for entity_id, by_schedule in normalized.items():
            t = installation.thermostat(entity_id)
            t["weeks"] = schema.complete_weeks({**t["weeks"], **by_schedule}, schedule_ids, preset_ids)
        installation.weeks_changed(normalized)
        installation.revision += 1
        runtime.manual_changes.track()
        for entity_id in installation.active:
            runtime.learner.learn(runtime.hass.states.get(entity_id))
        installation.changed()
        await runtime.scheduler.apply(Forced("weeks saved"))

    async def set_presets(self, presets: list[Any], replacements: dict[str, str] | None = None) -> None:
        """New list of presets; a removed preset is replaced in the weeks by the preset given
        in `replacements` (it must exist), and its mappings are dropped."""
        installation = self._runtime.installation
        taken: set[str] = set()
        new_presets = []
        for preset in presets:
            normalized = schema.preset(preset, taken | installation.preset_ids).to_stored()
            if normalized["id"] in taken:
                raise InvalidData(f"duplicate preset: {normalized['id']}")
            taken.add(normalized["id"])
            new_presets.append(normalized)
        if not new_presets:
            raise InvalidData("at least one preset is needed")
        for preset in new_presets:
            self._refuse_lost_temperature(preset)
        removed = installation.preset_ids - taken
        replacements = replacements or {}
        used = set(schema.used_presets(installation.weeks))
        for preset_id in removed & used:
            if replacements.get(preset_id) not in taken:
                raise InvalidData(f"{preset_id} is used in the weeks: choose a replacement")
        if removed & used:
            # Only the thermostats that used a removed preset: the others' weeks do not change
            affected = {e: w for e, w in installation.weeks.items() if removed & set(schema.used_presets({e: w}))}
            for by_schedule in affected.values():
                for schedule_id, week in by_schedule.items():
                    by_schedule[schedule_id] = schema.week(
                        [[[slot[0], replacements.get(slot[1], slot[1]), *slot[2:]] for slot in day] for day in week]
                    ).to_stored()
            installation.weeks_changed(affected)
            installation.revision += 1
        for t in installation.thermostats.values():
            for preset_id in removed:
                t["mapping"].pop(preset_id, None)
        installation.presets = new_presets
        installation.changed()
        await self._runtime.scheduler.apply(Forced("presets changed"))

    def _refuse_lost_temperature(self, preset: dict[str, Any]) -> None:
        """Refuses a preset that loses its temperature when heating or when cooling while a
        week uses the preset in that HVAC mode: the slot would have nothing to send. As for a
        preset removed while the weeks use it. A thermostat with a value of its own for the
        preset, in that HVAC mode, does not need the preset's temperature. A heat/cool slot
        uses both temperatures: there, only a temperature of its own replaces the preset's."""
        installation = self._runtime.installation
        old = installation.presets_by_id.get(preset["id"])
        if old is None:
            return
        own = {"heat": SETPOINT_KEYS, "cool": ("preset_mode", "cool_temperature")}
        for mode, key in (("heat", "temperature"), ("cool", "cool_temperature")):
            if old.get(key) is None or preset.get(key) is not None:
                continue
            for entity_id, by_schedule in installation.weeks.items():
                cell = installation.mappings.get(entity_id, {}).get(preset["id"]) or {}
                current = self._runtime.gateway.read(self._runtime.hass.states.get(entity_id))
                modes = {slot_hvac_mode(Slot.from_stored(slot).settings, current) or "heat"
                         for week in by_schedule.values() for day in week for slot in day if slot[1] == preset["id"]}
                # A heat/cool slot sends two numbers: a device preset set by hand gives none
                if (mode in modes and not any(k in cell for k in own[mode])) or (HEAT_COOL in modes and key not in cell):
                    raise InvalidData(
                        f"{preset['id']} is used in the weeks when {'heating' if mode == 'heat' else 'cooling'}: "
                        "it needs a temperature there")

    async def set_mapping(self, entity_id: str, mapping: Any) -> None:
        """Mapping set by hand for one thermostat ({} = defaults only)."""
        installation = self._runtime.installation
        normalized = schema.mapping(mapping, installation.preset_ids)
        if normalized or entity_id in installation.scheduled:
            installation.thermostat(entity_id)["mapping"] = normalized
        else:
            installation.thermostats.pop(entity_id, None)  # not scheduled: nothing left to keep
        installation.changed()
        await self._runtime.scheduler.apply(Forced(f"mapping of {entity_id} changed"))

    def hvac_mode_changes(self, value: bool | None, entity_id: str | None = None) -> tuple[list[str], list[dict[str, Any]]]:
        """What setting *Control the HVAC mode* to `value` changes, for the house (`entity_id`
        None) or one thermostat (None: it follows the house): the scheduled thermostats that
        lose the control, and the slots that change in their weeks, in every schedule. A slot
        without a preset is removed ("removed"); a slot that runs in an HVAC mode on the
        thermostat loses it ("hvac_mode_removed")."""
        runtime = self._runtime
        installation = runtime.installation
        settings = runtime.settings
        house = value if entity_id is None else settings.hvac_mode_control
        losing = []
        for e in installation.scheduled:
            if entity_id is not None and e != entity_id:
                continue
            own = value if e == entity_id else settings.own_hvac_mode_control(e)
            if settings.controls_hvac_mode(e) and not (house if own is None else own):
                losing.append(e)
        changes = []
        for e in losing:
            current = read(runtime.hass, runtime.hass.states.get(e))  # as it runs with the control
            for schedule in installation.schedules:
                for day, slots in enumerate(installation.scheduled[e]["weeks"].get(schedule["id"]) or []):
                    for raw in slots:
                        slot_settings = Slot.from_stored(raw).settings
                        mode = slot_settings.get("hvac_mode") if raw[1] is None else slot_hvac_mode(slot_settings, current)
                        if mode is None and raw[1] is not None:
                            continue
                        changes.append({"entity_id": e, "schedule": schedule["id"], "day": day, "start": raw[0],
                                        "preset": raw[1], "hvac_mode": mode,
                                        "change": "removed" if raw[1] is None else "hvac_mode_removed"})
        return losing, changes

    async def set_hvac_mode_control(self, value: bool | None, entity_id: str | None = None,
                                    preview: bool = False) -> list[dict[str, Any]]:
        """Sets *Control the HVAC mode* for the house (`entity_id` None) or one thermostat (None:
        it follows the house), from the panel (#159). The thermostats that lose the control get
        their weeks converted (schema.without_hvac_modes) and their override without an HVAC
        mode: an off override, left with nothing, ends. `preview`: only says which slots change
        (hvac_mode_changes). Turning the control on converts nothing."""
        runtime = self._runtime
        installation = runtime.installation
        if entity_id is None and value is None:
            raise InvalidData("the house controls the HVAC mode or not")
        if entity_id is not None and entity_id not in installation.scheduled:
            raise InvalidData(f"not scheduled: {entity_id}")
        losing, changes = self.hvac_mode_changes(value, entity_id)
        if preview:
            return changes
        preset_ids = list(installation.presets_by_id)
        for e in losing:
            weeks = installation.thermostats[e]["weeks"]
            for schedule_id, week in weeks.items():
                weeks[schedule_id] = schema.without_hvac_modes(week, preset_ids)
            override = installation.overrides.get(e)
            if override is not None and "hvac_mode" in override["target"]:
                target = {key: v for key, v in override["target"].items() if key != "hvac_mode"}
                if target:
                    runtime.overrides.keep(e, {**override, "target": target}, "panel")
                else:
                    runtime.overrides.drop(e, "hvac_mode_not_controlled")
        if losing:
            installation.weeks_changed(losing)
            installation.revision += 1
        runtime.settings.set_hvac_mode_control(value, entity_id)
        installation.changed()
        await runtime.scheduler.apply(Forced("HVAC mode control changed"))
        return changes

    async def set_schedules(self, items: Any, revision: int | None = None) -> list[dict[str, str]]:
        """Create (empty or a copy), rename, move and delete schedules (see schema.plan_schedules).
        An empty schedule puts every scheduled thermostat in eco (or the first preset) all week:
        each keeps a week in every schedule. The active schedule and its weeks do not change: the
        thermostats are not touched."""
        installation = self._runtime.installation
        if revision is not None and revision != installation.revision:
            raise StaleRevision
        schedules, created = schema.plan_schedules(items, installation.schedules, installation.active_schedule)
        kept = {s["id"] for s in schedules}
        in_rules = ({rule["schedule"] for rule in installation.rules} | {installation.default_schedule}) - {None}
        if in_rules - kept:
            raise InvalidData(f"used by the activation rules: {sorted(in_rules - kept)}")
        preset_ids = list(installation.presets_by_id)
        for weeks in installation.weeks.values():
            for schedule_id in set(weeks) - kept:
                del weeks[schedule_id]
            for schedule_id, source in created.items():
                weeks[schedule_id] = copy.deepcopy(weeks[source]) if source in weeks else schema.empty_week(preset_ids)
        # Renamed or moved: no week changes. Created or deleted: every thermostat's weeks do (a
        # schedule deleted then created again may take the same id)
        if created or installation.schedule_ids - kept:
            installation.weeks_changed(installation.scheduled)
        installation.schedules = schedules
        installation.revision += 1
        installation.changed()
        return copy.deepcopy(schedules)

    async def activate(self, schedule_id: str, *, source: str, context: Context | None = None) -> None:
        """`source` (card, entity, service, rules) is told in the chauffage_schedule_activated event,
        fired on the select with the `context` of what activated it (the logbook says who)."""
        runtime = self._runtime
        installation = runtime.installation
        if schedule_id not in installation.schedule_ids:
            raise InvalidData(f"unknown schedule: {schedule_id}")
        if schedule_id == installation.active_schedule:
            return
        previous, installation.active_schedule = installation.active_schedule, schedule_id
        installation.changed()
        runtime.hass.bus.async_fire(EVENT_SCHEDULE_ACTIVATED, {
            "schedule": schedule_id, "schedule_name": installation.schedule_name(schedule_id),
            "previous_schedule": previous, "source": source, "entity_id": runtime.read_model.schedule_select(),
        }, context=context)
        _LOGGER.info("Schedule %s activated (%s), was %s", schedule_id, source, previous)
        await runtime.scheduler.apply(Forced(f"schedule {schedule_id} activated ({source})"))
