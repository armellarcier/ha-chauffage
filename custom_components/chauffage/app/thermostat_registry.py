"""The thermostats Chauffage knows: paused, forgotten, renamed in Home Assistant, or gone (a
repair proposes to forget one whose entity is gone, repairs.py). docs/decisions.md, "Scheduled
thermostats"."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.core import Event, callback
from homeassistant.helpers import entity_registry as er

from .. import model, repairs
from ..const import DOMAIN, ENTITIES, PLANNED_PRESET_KEY, THERMOSTAT_ENTITIES, thermostat_unique_id
from ..domain.plan import Realign

if TYPE_CHECKING:
    from ..runtime import ChauffageRuntime


class ThermostatRegistry:
    def __init__(self, runtime: ChauffageRuntime) -> None:
        self._runtime = runtime

    async def set_paused(self, entity_id: str, paused: bool) -> None:
        """Pause (kept, not controlled, its override dropped and the thermostat left as it is) or
        resume (realigned at once)."""
        if entity_id not in self._runtime.scheduled:
            raise model.InvalidData(f"not scheduled: {entity_id}")
        if self._runtime.is_paused(entity_id) == paused:
            return
        self._runtime.thermostats[entity_id]["paused"] = paused
        if paused:
            self._runtime.overrides.drop(entity_id, "paused")
            self._runtime.scheduler.retry.discard(entity_id)
            self._runtime.gateway.drop_pending(entity_id)
        self._runtime._track_thermostats()
        self._runtime._changed()
        if not paused:
            self._runtime.learner.learn(self._runtime.hass.states.get(entity_id))
            await self._runtime.scheduler.apply(Realign(frozenset({entity_id}), "resumed after a pause"))

    async def forget(self, entity_id: str) -> None:
        """No longer scheduled: its data, override and entities are dropped, the thermostat left
        as it is. A new revision: a card's copy that still holds it must reload before saving."""
        if self._runtime.thermostats.pop(entity_id, None) is None:
            raise model.InvalidData(f"not scheduled: {entity_id}")
        self._runtime.overrides.drop(entity_id, "forgotten")
        self._runtime.scheduler.retry.discard(entity_id)
        self._runtime.gateway.drop_pending(entity_id)
        self._runtime.data["renamed"] = {former: e for former, e in self._runtime.data["renamed"].items() if e != entity_id}
        repairs.close_missing(self._runtime.hass, entity_id)
        self._runtime.data["revision"] += 1
        self._runtime._track_thermostats()
        self._runtime._changed()

    def renamed_to(self, entity_id: str) -> str | None:
        """The new id of a thermostat renamed from this one, unless the id is taken again."""
        current = self._runtime.data["renamed"].get(entity_id)
        if current is None or entity_id in self._runtime.thermostats or self._runtime.hass.states.get(entity_id) is not None:
            return None
        return current

    @callback
    def registry_updated(self, event: Event) -> None:
        action, entity_id = event.data.get("action"), event.data.get("entity_id")
        if action == "remove" and entity_id in self._runtime.scheduled:
            repairs.raise_missing(self._runtime.hass, entity_id)
        elif action == "create" and entity_id in self._runtime.scheduled:
            repairs.close_missing(self._runtime.hass, entity_id)  # made again with the same id
        elif action == "update" and event.data.get("old_entity_id") in self._runtime.thermostats:
            self.renamed(event.data["old_entity_id"], entity_id)
        if action != "remove" and entity_id in self._runtime._card_entities():
            self._runtime._notify(ENTITIES)  # an entity registered or renamed: the cards show its icon and open it
        entry = er.async_get(self._runtime.hass).async_get(entity_id) if entity_id else None
        if entity_id in self._runtime._planned_presets or (
                entry is not None and entry.domain == "sensor" and entry.platform == DOMAIN
                and entry.unique_id.endswith(f"_{PLANNED_PRESET_KEY}")):
            self._runtime._check_planned_preset()

    @callback
    def renamed(self, old: str, new: str) -> None:
        """A thermostat renamed in Home Assistant: its data and override move to the new id
        (`renamed` tells the cards still holding the former one), its entities keep their ids and
        settings (their unique ids follow), and the entry is reloaded to attach them to the new
        id. A new revision: a card's copy of the weeks holds
        the former id. Data still held under the new id (an entity gone, kept in its repair) is
        dropped with its entities: the renamed thermostat is the one that exists."""
        registry = er.async_get(self._runtime.hass)
        # Exact unique ids: climate.salon_bas's also start with "<entry>_climate.salon_"
        def unique_id(climate: str, key: str) -> str:
            return thermostat_unique_id(self._runtime.entry.entry_id, climate, key)

        if self._runtime.thermostats.pop(new, None) is not None:
            for key, platform in THERMOSTAT_ENTITIES.items():
                if entity_id := registry.async_get_entity_id(platform, DOMAIN, unique_id(new, key)):
                    registry.async_remove(entity_id)
            repairs.close_missing(self._runtime.hass, new)
        self._runtime.overrides.drop(new, "forgotten")
        self._runtime.gateway.renamed(old, new)
        self._runtime.thermostats[new] = self._runtime.thermostats.pop(old)
        self._runtime._weeks_changed([new])
        if old in self._runtime.data["overrides"]:
            self._runtime.data["overrides"][new] = self._runtime.data["overrides"].pop(old)
        renamed = self._runtime.data["renamed"]
        for former, current in list(renamed.items()):
            if current == old:
                renamed[former] = new
        renamed[old] = new
        renamed.pop(new, None)  # renamed back
        repairs.close_missing(self._runtime.hass, old)
        for key, platform in THERMOSTAT_ENTITIES.items():
            entity_id = registry.async_get_entity_id(platform, DOMAIN, unique_id(old, key))
            if entity_id:
                registry.async_update_entity(entity_id, new_unique_id=unique_id(new, key))
        self._runtime.data["revision"] += 1
        # Not notified: the entities wait for the reload (see reloading), which saves the data
        self._runtime.reloading = True
        self._runtime.hass.config_entries.async_schedule_reload(self._runtime.entry.entry_id)

