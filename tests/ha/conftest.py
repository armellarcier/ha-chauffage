"""Test bench: loads the project's HA package into an in-memory Home Assistant.

Thermostats are simulated with plain `climate.*` states; the `climate.set_preset_mode`
service is replaced by a recorder (`Bench.calls`). The clock is frozen (`freezer`
fixture) and moved forward explicitly.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from homeassistant.core import Context, HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from homeassistant.util.yaml import load_yaml_dict
from pytest_homeassistant_custom_component.common import async_fire_time_changed

PACKAGE = Path(__file__).parents[2] / "packages" / "chauffage" / "chauffage.yaml"
PARIS = ZoneInfo("Europe/Paris")
# Monday, October 12, 2026
MONDAY = datetime(2026, 10, 12, tzinfo=PARIS)

# Context of a change made by an automation (like the schedule)
CTX_AUTOMATION = Context(parent_id="01AUTOMATION")
# Context of a change made by a user in the UI
CTX_USER = Context(user_id="test-user")


def without_delays(node):
    """Remove `delay` steps from actions (they only space out Zigbee commands and have
    no logical role): with the bench's frozen clock they would never elapse."""
    if isinstance(node, list):
        return [without_delays(n) for n in node if not (isinstance(n, dict) and "delay" in n)]
    if isinstance(node, dict):
        return {k: without_delays(v) for k, v in node.items()}
    return node


class Bench:
    """Drives the bench: time, simulated thermostats, schedules, overrides."""

    def __init__(self, hass: HomeAssistant, freezer) -> None:
        self.hass = hass
        self.freezer = freezer
        self.calls: list[tuple[str, str]] = []
        self.unreachable: set[str] = set()

    # ----- time -----

    async def go_to(self, hhmm: str, day: int = 0) -> None:
        """Move the clock to HH:MM (day 0 = Monday 2026-10-12) and let HA react."""
        h, m = (int(x) for x in hhmm.split(":"))
        target = dt_util.as_utc(MONDAY + timedelta(days=day, hours=h, minutes=m))
        self.freezer.move_to(target)
        async_fire_time_changed(self.hass, target)
        await self.hass.async_block_till_done()

    async def advance(self, minutes: int) -> None:
        target = dt_util.utcnow() + timedelta(minutes=minutes)
        self.freezer.move_to(target)
        async_fire_time_changed(self.hass, target)
        await self.hass.async_block_till_done()

    # ----- simulated thermostats -----

    def thermostat(self, entity_id: str, preset="eco", temperature: float | None = 17.0,
                   state: str = "heat", context: Context | None = None, **attributes) -> None:
        self.hass.states.async_set(
            entity_id, state,
            {"preset_mode": preset, "temperature": temperature,
             "preset_modes": ["none", "frost", "eco", "comfort", "boost"], **attributes},
            context=context,
        )

    async def manual_setpoint(self, entity_id: str, temperature: float) -> None:
        """Setpoint changed by hand: Versatile Thermostat switches to preset "none"."""
        self.thermostat(entity_id, "none", temperature, context=CTX_USER)
        await self.hass.async_block_till_done()

    async def thermostat_applies(self, entity_id: str, preset: str) -> None:
        """Thermostat reacting to a call from the schedule (automation context)."""
        self.thermostat(entity_id, preset, context=CTX_AUTOMATION)
        await self.hass.async_block_till_done()

    # ----- schedules / mode / overrides -----

    async def save_schedules(self, schedules: dict) -> None:
        """What the card sends when the user clicks Save."""
        self.hass.bus.async_fire("chauffage_programmes_set", {"programmes": schedules})
        await self.hass.async_block_till_done()

    async def set_mode(self, mode: str) -> None:
        await self.hass.services.async_call(
            "input_select", "select_option",
            {"entity_id": "input_select.mode_chauffage", "option": mode}, blocking=True,
        )
        await self.hass.async_block_till_done()

    async def set_override(self, entity_id: str, override: dict | None) -> None:
        """What the card sends to extend (+30 min…) or remove an override."""
        self.hass.bus.async_fire("chauffage_derogation_set", {"climate": entity_id, "derogation": override})
        await self.hass.async_block_till_done()

    def overrides(self) -> dict:
        state = self.hass.states.get("sensor.derogations_chauffage")
        return (state.attributes.get("derogations") if state else None) or {}

    def applied_presets(self) -> dict[str, str]:
        """Last preset requested per thermostat, then reset the call log."""
        result = {entity_id: preset for entity_id, preset in self.calls}
        self.calls.clear()
        return result


@pytest.fixture
def expected_lingering_timers() -> bool:
    """The automation's "every minute" trigger leaves a timer armed at the end of a test."""
    return True


@pytest.fixture
async def bench(hass: HomeAssistant, freezer) -> Bench:
    await hass.config.async_set_time_zone("Europe/Paris")
    b = Bench(hass, freezer)
    # Start on Monday 00:00 so tests only move forward in time (time triggers schedule
    # their next run from the moment they are set up)
    freezer.move_to(dt_util.as_utc(MONDAY))

    async def set_preset_mode(call: ServiceCall) -> None:
        ids = call.data["entity_id"]
        for entity_id in [ids] if isinstance(ids, str) else ids:
            b.calls.append((entity_id, call.data["preset_mode"]))
            if entity_id in b.unreachable:
                raise HomeAssistantError("Failed to send request: NWK_NO_ROUTE (simulated)")

    hass.services.async_register("climate", "set_preset_mode", set_preset_mode)

    package = without_delays(load_yaml_dict(PACKAGE))
    for domain in ("input_select", "template", "automation"):
        assert await async_setup_component(hass, domain, {domain: package[domain]})
    await hass.async_block_till_done()
    return b
