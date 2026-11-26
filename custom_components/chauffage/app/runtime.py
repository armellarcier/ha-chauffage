"""The composition root: builds the services of a config entry, and starts and stops them.

- every minute: slots starting now, overrides ending now (scheduler.py);
- full realignment when HA starts, a schedule is activated or the weeks are saved;
- a manual change on a scheduled thermostat becomes a temporary override; a command the
  thermostat applies late (battery valve) does not (manual_changes.py);
- activation rules: their templates are tracked, and a change of their outcome activates a
  schedule (rule_engine.py);
- scheduled thermostats: kept whatever the cards show, paused or forgotten on purpose; a repair
  proposes to forget one whose entity is gone, a renamed one is followed (thermostat_registry.py).

The integration calls services with its own contexts: state changes carrying one of them are
its own (not manual changes).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_change

from ..const import TICK
from ..domain.plan import Forced
from ..history import TemperatureHistory
from ..store import ChauffageStore
from ..storage.installation import Installation
from ..thermostats.gateway import ThermostatGateway
from .learner import Learner
from .manual_changes import ManualChanges
from .overrides import OverrideService
from .read_model import SnapshotBuilder
from .rule_engine import RuleEngine
from .schedules import Schedules
from .scheduler import Scheduler
from .settings import Settings
from .thermostat_registry import ThermostatRegistry


class ChauffageRuntime:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, store: ChauffageStore, data: dict[str, Any],
                 version: str) -> None:
        self.hass = hass
        self.entry = entry
        self.version = version  # of the integration: a card older than it asks to reload the page
        self.pause = 0.3  # seconds between two thermostats (Zigbee network)
        # A thermostat renamed: the entry reloads to attach its entities to the new id, which
        # follow it meanwhile (their unique ids moved); nothing to add or remove until then
        self.reloading = False

        self.installation = Installation(store, data)
        self.settings = Settings(hass, entry)
        self.gateway = ThermostatGateway(hass, self.installation)
        self.learner = Learner(hass, self.installation)
        self.history = TemperatureHistory(hass)  # measured temperature, for the card
        self.overrides = OverrideService(self)
        self.manual_changes = ManualChanges(self)
        self.scheduler = Scheduler(self)
        self.schedules = Schedules(self)
        self.rules = RuleEngine(self)
        self.registry = ThermostatRegistry(self)
        self.read_model = SnapshotBuilder(self)
        self._unsubs: list[Callable[[], None]] = []

    async def async_start(self) -> None:
        self.scheduler.start()
        self._unsubs.append(async_track_time_change(self.hass, self._tick, second=0))
        self._unsubs.append(self.hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, self.registry.registry_updated))
        for reloaded in ("automation_reloaded", "script_reloaded"):
            self._unsubs.append(self.hass.bus.async_listen(reloaded, self.registry.check_planned_preset))
        self.manual_changes.track()
        for entity_id in self.installation.active:
            self.learner.learn(self.hass.states.get(entity_id))
        if self.hass.state is CoreState.running:
            self.entry.async_create_task(self.hass, self._started(), "chauffage realign")
        else:
            @callback
            def started(_event: Event) -> None:
                self._unsubs.remove(unsub)  # a one-time listener is gone once called
                self.entry.async_create_task(self.hass, self._started(), "chauffage realign")

            unsub = self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started)
            self._unsubs.append(unsub)

    async def _started(self) -> None:
        # The rules: their entities are not all there before
        self.registry.check_missing()
        self.registry.check_planned_preset()  # once the automations and scripts are loaded
        self.rules.track()
        await self.rules.follow()
        await self.scheduler.apply(Forced("Home Assistant started"))

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        self.manual_changes.stop()
        self.rules.stop()

    async def _tick(self, now: datetime) -> None:
        await self.scheduler.tick(now)
        self.installation.notify(TICK)
