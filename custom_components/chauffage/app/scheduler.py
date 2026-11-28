"""Sends the thermostats their slot: every minute, and when something asks for it (ApplyReason).

The scheduler also owns two of the three resend mechanisms (docs/rewrite-plan.md, section 6,
item 3): the retry of a failed command at the next minutes, and the forced apply of one
thermostat (`realign`). The commands pending for a day are the gateway's.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import TYPE_CHECKING

from homeassistant.util import dt as dt_util

from ..domain.plan import ApplyReason, Plan, Realign, Tick, due_targets, ended_overrides, why_of
from ..domain.target import Target
from ..domain.thermostat import Thermostat, ignored

if TYPE_CHECKING:
    from .runtime import ChauffageRuntime


class Scheduler:
    def __init__(self, runtime: ChauffageRuntime) -> None:
        self._runtime = runtime
        self.lock = asyncio.Lock()
        self.retry: set[str] = set()  # thermostats whose last command failed
        self._last_tick: datetime | None = None

    def start(self) -> None:
        self._last_tick = dt_util.now()  # the realignment at the start covers the time before

    def plan(self) -> Plan:
        """What the active thermostats follow: paused ones are left out."""
        runtime = self._runtime
        installation = runtime.installation
        return Plan(
            {entity_id: installation.thermostats[entity_id]["weeks"] for entity_id in installation.active},
            installation.active_schedule,
            installation.presets_by_id,
            installation.mappings,
            installation.overrides,
            runtime.settings.use_presets,
            {entity_id: own for entity_id in installation.active if (own := runtime.gateway.own_settings(entity_id))},
        )

    def needs(self, entity_id: str, target: Target, current: Thermostat | None,
              by_user: bool = False) -> Target | None:
        """An override's target as it is sent, when the thermostat needs it
        (ThermostatGateway.needs). The target is completed for the thermostat
        (Target.completed_for): without an HVAC mode, a thermostat that is off is turned on in
        the HVAC mode of the slot planned now, as the card does. `by_user`: an override without
        a Chauffage preset (in cool, a temperature the user typed is sent, a preset's heating
        temperature is not)."""
        plan = self.plan()
        slot, _ = plan.slot_at(entity_id, dt_util.now())
        planned = plan.target_of(entity_id, slot, current) or {}
        to_send = Target(target).completed_for(current, by_user, planned.get("hvac_mode"))
        return self._runtime.gateway.needs(entity_id, to_send, current)

    async def apply(self, reason: ApplyReason) -> None:
        """Sends the thermostats their slot (plan.due_targets); the reason, logged with each
        command, says why."""
        runtime = self._runtime
        installation = runtime.installation
        async with self.lock:
            now, retry = dt_util.now(), set(self.retry)
            plan = self.plan()
            states = {e: t for e in installation.active if (t := runtime.gateway.read(runtime.hass.states.get(e)))}
            todo = due_targets(plan, now, states, reason, retry=frozenset(retry), pending=runtime.gateway.last_pending())
            # A thermostat to retry that needs nothing anymore (already right, override, off…)
            self.retry &= {entity_id for entity_id, _ in todo}
            for i, (entity_id, target) in enumerate(todo):
                if i and runtime.pause:
                    await asyncio.sleep(runtime.pause)
                if entity_id not in installation.thermostats or installation.is_paused(entity_id):
                    continue  # paused or forgotten meanwhile
                why = why_of(reason, entity_id, entity_id in retry)
                slot, _ = plan.slot_at(entity_id, now)
                what = slot.preset or slot.settings.get("hvac_mode")  # an off or a fan-only slot has no preset
                done = await runtime.gateway.send(entity_id, target, f"{why}, {what} of schedule {installation.active_schedule}")
                # Not delivered (unreachable valve…): sent again at the next minutes
                if done:
                    self.retry.discard(entity_id)
                else:
                    self.retry.add(entity_id)

    async def tick(self, now: datetime) -> None:
        """Every minute: the overrides that end, the commands not waited for anymore, the slots
        that start."""
        runtime = self._runtime
        ended = ended_overrides(runtime.installation.overrides, dt_util.now())
        since, self._last_tick = self._last_tick, dt_util.now()
        # Dropped before the slots are applied (which takes a while): one set again meanwhile is a
        # new override, sent to the thermostat
        for entity_id in ended:
            runtime.overrides.drop(entity_id, "expired")
        if ended:
            runtime.installation.changed()
        runtime.gateway.expire_pending(dt_util.now())
        await self.apply(Tick(since, frozenset(ended)))

    async def realign(self, entity_id: str, why: str = "command applied late") -> None:
        """A command applied late, after the thermostat was meant to do something else, or a
        thermostat turned back on: set to its override, or to its slot."""
        runtime = self._runtime
        override = runtime.installation.overrides.get(entity_id)
        if override is None:
            await self.apply(Realign(frozenset({entity_id}), why))
            return
        async with self.lock:
            current = runtime.gateway.read(runtime.hass.states.get(entity_id))
            if current is None or ignored(current):
                return
            to_send = self.needs(entity_id, override["target"], current, by_user=not override.get("preset"))
            if to_send is not None:
                await runtime.gateway.send(entity_id, to_send, f"{why}, back to the override")
