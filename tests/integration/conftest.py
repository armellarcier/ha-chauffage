"""Tests of the Chauffage integration (custom_components/chauffage).

A separate suite from tests/ha/ (the package): run with `scripts/test.sh integration`.
The bench mirrors tests/ha/conftest.py: simulated `climate.*` states, a recorder in place of
`climate.set_preset_mode`, a frozen clock moved forward explicitly.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from unittest.mock import PropertyMock, patch

import pytest
from homeassistant.core import Context, HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.chauffage.const import DOMAIN
from custom_components.chauffage.runtime import ChauffageRuntime

PARIS = ZoneInfo("Europe/Paris")
MONDAY = datetime(2026, 10, 12, tzinfo=PARIS)  # Monday, October 12, 2026
CTX_AUTOMATION = Context(parent_id="01AUTOMATION")  # change made by an automation
CTX_USER = Context(user_id="test-user")  # change made by a user in the UI

WEEKDAY = [["00:00", "eco"], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"], ["22:30", "eco"]]
WEEKEND = [["00:00", "eco"], ["08:00", "comfort"], ["23:00", "eco"]]


def every_day(*slots: tuple[str, str]) -> list:
    return [[list(s) for s in slots]] * 7


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Let Home Assistant load the integrations found in custom_components/."""
    return


@pytest.fixture
def entity_registry_enabled_by_default():
    """Entities disabled by default (per-thermostat sensors) are enabled in this test."""
    with patch("homeassistant.helpers.entity.Entity.entity_registry_enabled_default",
               new_callable=PropertyMock, return_value=True):
        yield


@pytest.fixture
def ws_client(hass_ws_client, hass_admin_user, hass_read_only_user):
    """Websocket client whose token is created now (the bench's clock jumps ahead)."""

    async def connect(hass: HomeAssistant, admin: bool = True):
        user = hass_admin_user if admin else hass_read_only_user
        refresh = await hass.auth.async_create_refresh_token(user, "https://example.com/")
        return await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))

    return connect


@pytest.fixture
def expected_lingering_timers() -> bool:
    """The scheduler's "every minute" timer is still armed at the end of a test."""
    return True


class Bench:
    """Drives the bench: time, simulated thermostats, schedules, overrides."""

    def __init__(self, hass: HomeAssistant, freezer) -> None:
        self.hass = hass
        self.freezer = freezer
        self.calls: list[tuple[str, str]] = []
        self.temperature_calls: list[tuple[str, float]] = []
        self.unreachable: set[str] = set()
        self.entry: MockConfigEntry | None = None

    @property
    def runtime(self) -> ChauffageRuntime:
        return self.entry.runtime_data

    async def setup(self, options: dict | None = None) -> None:
        self.entry = MockConfigEntry(domain=DOMAIN, title="Chauffage", options=options or {})
        self.entry.add_to_hass(self.hass)
        assert await self.hass.config_entries.async_setup(self.entry.entry_id)
        await self.hass.async_block_till_done()
        self.runtime.pause = 0

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
        """Thermostat reacting to a call from an automation."""
        self.thermostat(entity_id, preset, context=CTX_AUTOMATION)
        await self.hass.async_block_till_done()

    # ----- schedules / mode / overrides -----

    async def save_schedules(self, schedules: dict) -> None:
        """What the card sends when the user clicks Save."""
        await self.runtime.save_schedules(schedules)
        await self.hass.async_block_till_done()

    async def set_mode(self, name: str) -> None:
        await self.hass.services.async_call(
            "select", "select_option", {"entity_id": self.mode_entity, "option": name}, blocking=True
        )
        await self.hass.async_block_till_done()

    async def set_override(self, entity_id: str, override: dict | None) -> None:
        """What the card sends to extend (+30 min…) or remove an override."""
        await self.runtime.set_override(entity_id, override)
        await self.hass.async_block_till_done()

    @property
    def mode_entity(self) -> str:
        return self.hass.states.async_entity_ids("select")[0]

    def overrides(self) -> dict:
        return self.runtime.data["overrides"]

    def applied_presets(self) -> dict[str, str]:
        """Last preset requested per thermostat, then reset the call log."""
        result = {entity_id: preset for entity_id, preset in self.calls}
        self.calls.clear()
        return result


@pytest.fixture
async def bench(hass: HomeAssistant, freezer) -> Bench:
    await hass.config.async_set_time_zone("Europe/Paris")
    b = Bench(hass, freezer)
    # Start on Monday 00:00 so tests only move forward in time
    freezer.move_to(dt_util.as_utc(MONDAY))

    async def set_preset_mode(call: ServiceCall) -> None:
        ids = call.data["entity_id"]
        for entity_id in [ids] if isinstance(ids, str) else ids:
            b.calls.append((entity_id, call.data["preset_mode"]))
            if entity_id in b.unreachable:
                raise HomeAssistantError("Failed to send request: NWK_NO_ROUTE (simulated)")

    async def set_temperature(call: ServiceCall) -> None:
        """Versatile Thermostat: a setpoint switches to preset "none" (written with the call's context)."""
        b.temperature_calls.append((call.data["entity_id"], call.data["temperature"]))
        b.thermostat(call.data["entity_id"], "none", call.data["temperature"], context=call.context)

    hass.services.async_register("climate", "set_preset_mode", set_preset_mode)
    hass.services.async_register("climate", "set_temperature", set_temperature)
    return b
