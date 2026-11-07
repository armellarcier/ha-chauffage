"""Tests of the Chauffage integration (custom_components/chauffage).

Run with `scripts/test.sh integration`. The bench: simulated `climate.*` states, a recorder in place of
`climate.set_preset_mode`, a frozen clock moved forward explicitly.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from unittest.mock import PropertyMock, patch

import pytest
from homeassistant.auth.const import GROUP_ID_USER
from homeassistant.core import Context, HomeAssistant, ServiceCall
from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, MockUser, async_fire_time_changed

from custom_components.chauffage import model
from custom_components.chauffage.const import DOMAIN
from custom_components.chauffage.runtime import ChauffageRuntime
from custom_components.chauffage.store import STORAGE_VERSION

PARIS = ZoneInfo("Europe/Paris")
MONDAY = datetime(2026, 10, 12, tzinfo=PARIS)  # Monday, October 12, 2026
CTX_AUTOMATION = Context(parent_id="01AUTOMATION")  # change made by an automation
CTX_USER = Context(user_id="test-user")  # change made by a user in the UI

# The three kinds of thermostats the integration supports (CONTRIBUTING.md, "Tests first")
KINDS = ("vtherm", "standard", "plain")
PRESETS_OF = {
    "vtherm": ["none", "frost", "eco", "comfort", "boost"],  # Versatile Thermostat
    "standard": ["eco", "comfort", "away", "boost"],  # standard HA presets, no frost
    "plain": [],  # no presets (generic_thermostat)
}
MANUAL_PRESET = {"vtherm": "none", "standard": None, "plain": None}  # after a manual setpoint
PRESET_TEMPERATURES = {"comfort": 20.0, "eco": 17.0, "boost": 21.0, "frost": 7.0}  # defaults

WEEKDAY = [["00:00", "eco"], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"], ["22:30", "eco"]]
WEEKEND = [["00:00", "eco"], ["08:00", "comfort"], ["23:00", "eco"]]
# The schedules of an existing installation (the default of the bench); a new one has one schedule
EXISTING_SCHEDULES = ("Normal", "Away", "Holiday")


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
    """Websocket client whose token is created now (the bench's clock jumps ahead), for a `user`:
    "admin", "household" (a user of the household, who may control the entities) or "read_only"."""

    async def connect(hass: HomeAssistant, user: str = "admin"):
        if user == "household":
            who = MockUser(groups=[await hass.auth.async_get_group(GROUP_ID_USER)]).add_to_hass(hass)
        else:
            who = {"admin": hass_admin_user, "read_only": hass_read_only_user}[user]
        refresh = await hass.auth.async_create_refresh_token(who, "https://example.com/")
        return await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))

    return connect


@pytest.fixture
def thermostat_kind() -> str:
    """Kind of the simulated thermostats; modules testing every kind override this fixture."""
    return "vtherm"


@pytest.fixture
def expected_lingering_timers() -> bool:
    """The scheduler's "every minute" timer is still armed at the end of a test."""
    return True


class Bench:
    """Drives the bench: time, simulated thermostats, schedules, overrides."""

    def __init__(self, hass: HomeAssistant, freezer, kind: str = "vtherm", storage: dict | None = None) -> None:
        self.storage = {} if storage is None else storage
        self.hass = hass
        self.kind = kind
        self.freezer = freezer
        self.calls: list[tuple[str, str]] = []
        self.temperature_calls: list[tuple[str, float]] = []
        self.hvac_calls: list[tuple[str, str]] = []  # climate.set_hvac_mode calls (#91)
        self.setting_calls: list[tuple[str, str, str]] = []  # fan and swing modes set (#91, lot 3)
        self.unreachable: set[str] = set()
        self.slow: set[str] = set()  # accept a command, apply it later (battery valves)
        self.entry: MockConfigEntry | None = None

    @property
    def runtime(self) -> ChauffageRuntime:
        return self.entry.runtime_data

    async def setup(self, options: dict | None = None, schedules: tuple[str, ...] | None = EXISTING_SCHEDULES,
                    entry: MockConfigEntry | None = None) -> None:
        """Set the integration up; by default as an existing installation with three schedules
        (`schedules=None`: a new installation, or one importing the package)."""
        if schedules and DOMAIN not in self.storage:
            self.storage[DOMAIN] = {"version": STORAGE_VERSION, "minor_version": 1, "key": DOMAIN,
                                    "data": model.default_data(list(schedules))}
        self.entry = entry or MockConfigEntry(domain=DOMAIN, title="Chauffage", options=options or {})
        if entry is None:
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
        # The minute runs in the background: reproduce_state (#91) suspends inside it
        await self.hass.async_block_till_done(wait_background_tasks=True)

    async def advance(self, minutes: int) -> None:
        target = dt_util.utcnow() + timedelta(minutes=minutes)
        self.freezer.move_to(target)
        async_fire_time_changed(self.hass, target)
        # The minute runs in the background: reproduce_state (#91) suspends inside it
        await self.hass.async_block_till_done(wait_background_tasks=True)

    # ----- simulated thermostats -----

    def needs(self, *kinds: str) -> None:
        """Skip the test for the other kinds of thermostats."""
        if self.kind not in kinds:
            pytest.skip(f"not relevant for {self.kind} thermostats")

    def versatile_thermostat(self, entity_id: str = "climate.salon") -> None:
        """`entity_id` registered by Versatile Thermostat's integration, before its first state."""
        domain, object_id = entity_id.split(".")
        er.async_get(self.hass).async_get_or_create(domain, "versatile_thermostat", object_id,
                                                    suggested_object_id=object_id)

    def thermostat_on_a_valve(self, area: str | None = None, **entity: Any) -> dr.DeviceEntry:
        """climate.salon registered on the device of its valve, from another integration, in an
        area if given; `entity`: more of its registry entry (has_entity_name, original_name)."""
        other = MockConfigEntry(domain="test")
        other.add_to_hass(self.hass)
        devices = dr.async_get(self.hass)
        device = devices.async_get_or_create(config_entry_id=other.entry_id, identifiers={("test", "valve")},
                                             name="Vanne salon")
        if area:
            device = devices.async_update_device(device.id, area_id=ar.async_get(self.hass).async_create(area).id)
        er.async_get(self.hass).async_get_or_create("climate", "test", "valve", suggested_object_id="salon",
                                                    device_id=device.id, **entity)
        return device

    def thermostat(self, entity_id: str, preset: Any = "eco", temperature: float | None = None,
                   state: str = "heat", context: Context | None = None, **attributes) -> None:
        """A thermostat at a preset, as this kind shows it (its own climate preset, or the
        preset's default temperature); any other value is a raw climate preset ("none",
        "safety", an Enum…)."""
        presets = PRESETS_OF[self.kind]
        if isinstance(preset, str) and preset in PRESET_TEMPERATURES:
            climate_preset = preset if preset in presets else MANUAL_PRESET[self.kind]
            temperature = PRESET_TEMPERATURES[preset] if temperature is None else temperature
        else:
            climate_preset, temperature = preset, 17.0 if temperature is None else temperature
        values = {"temperature": temperature, "min_temp": 5, "max_temp": 30, "target_temp_step": 0.5,
                  "hvac_modes": ["off", "heat"]}
        if presets:
            values |= {"preset_mode": climate_preset, "preset_modes": presets}
        self.hass.states.async_set(entity_id, state, values | attributes, context=context)

    async def manual_setpoint(self, entity_id: str, temperature: float) -> None:
        """Setpoint changed by hand (VTherm switches to preset "none", standard ones clear it)."""
        self.thermostat(entity_id, MANUAL_PRESET[self.kind], temperature, context=CTX_USER)
        await self.hass.async_block_till_done()

    async def change_on_device(self, entity_id: str, temperature: float) -> None:
        """Setpoint changed on the thermostat itself (its knob): reported with a new context,
        neither a user's nor an automation's."""
        self.thermostat(entity_id, MANUAL_PRESET[self.kind], temperature, context=Context())
        await self.hass.async_block_till_done()

    async def applies_late(self, entity_id: str, preset: str) -> None:
        """A slow thermostat finally applies a command received earlier, and reports it as any
        change on the device."""
        self.thermostat(entity_id, preset, context=Context())
        await self.hass.async_block_till_done()

    async def thermostat_applies(self, entity_id: str, preset: str) -> None:
        """Thermostat reacting to a call from an automation."""
        self.thermostat(entity_id, preset, context=CTX_AUTOMATION)
        await self.hass.async_block_till_done()

    # ----- weeks / schedules / overrides -----

    async def save_weeks(self, weeks: dict) -> None:
        """What the card sends when the user clicks Save."""
        await self.runtime.save_weeks(weeks)
        await self.hass.async_block_till_done()

    async def activate_schedule(self, name: str) -> None:
        """Picks a schedule in the active-schedule select."""
        await self.hass.services.async_call(
            "select", "select_option", {"entity_id": self.schedule_entity, "option": name}, blocking=True
        )
        await self.hass.async_block_till_done()

    async def set_schedules(self, schedules: list[dict], revision: int | None = None) -> list[dict]:
        """What the card sends to create, rename, move or delete schedules."""
        result = await self.runtime.set_schedules(schedules, revision)
        await self.hass.async_block_till_done()
        return result

    def schedule_list(self) -> list[tuple[str, str]]:
        """(id, name) of the schedules, in order."""
        return [(s["id"], s["name"]) for s in self.runtime.data["schedules"]]

    async def set_override(self, entity_id: str, override: dict | None) -> None:
        """What the card sends to extend (+30 min…) or remove an override."""
        await self.runtime.set_override(entity_id, override, source="card")
        await self.hass.async_block_till_done()

    @property
    def schedule_entity(self) -> str:
        return self.hass.states.async_entity_ids("select")[0]

    def overrides(self) -> dict:
        return self.runtime.data["overrides"]

    def settings(self) -> dict[tuple[str, str], str]:
        """Last fan or swing mode requested per thermostat and attribute, then reset the call log."""
        result = {(entity_id, attr): value for entity_id, attr, value in self.setting_calls}
        self.setting_calls.clear()
        return result

    def powered(self) -> dict[str, str]:
        """Last HVAC mode requested per thermostat, then reset the call log."""
        result = {entity_id: mode for entity_id, mode in self.hvac_calls}
        self.hvac_calls.clear()
        return result

    def applied(self) -> dict[str, str]:
        """Last preset requested per thermostat (its climate preset, or the preset's default
        temperature), then reset the call log."""
        result = {entity_id: preset for entity_id, preset in self.calls}
        self.calls.clear()
        return result


@pytest.fixture
async def bench(hass: HomeAssistant, freezer, thermostat_kind, hass_storage) -> Bench:
    await hass.config.async_set_time_zone("Europe/Paris")
    b = Bench(hass, freezer, thermostat_kind, hass_storage)
    # Start on Monday 00:00 so tests only move forward in time
    freezer.move_to(dt_util.as_utc(MONDAY))

    async def set_preset_mode(call: ServiceCall) -> None:
        ids = call.data["entity_id"]
        for entity_id in [ids] if isinstance(ids, str) else ids:
            b.calls.append((entity_id, call.data["preset_mode"]))
            if entity_id in b.unreachable:
                raise HomeAssistantError("Failed to send request: NWK_NO_ROUTE (simulated)")

    async def set_temperature(call: ServiceCall) -> None:
        """The thermostat takes the setpoint (VTherm switches to preset "none"), written with the
        call's context."""
        entity_id, temperature = call.data["entity_id"], call.data["temperature"]
        b.temperature_calls.append((entity_id, temperature))
        preset = next((p for p, t in PRESET_TEMPERATURES.items() if t == temperature), str(temperature))
        b.calls.append((entity_id, preset))
        if entity_id in b.unreachable:
            raise HomeAssistantError("Failed to send request: NWK_NO_ROUTE (simulated)")
        if entity_id not in b.slow:
            current = hass.states.get(entity_id)
            b.thermostat(entity_id, MANUAL_PRESET[b.kind], temperature, state=current.state if current else "heat",
                         context=call.context)

    async def set_hvac_mode(call: ServiceCall) -> None:
        """The thermostat takes the HVAC mode and keeps its other attributes."""
        entity_id, mode = call.data["entity_id"], call.data["hvac_mode"]
        b.hvac_calls.append((entity_id, mode))
        if entity_id in b.unreachable:
            raise HomeAssistantError("Failed to send request: NWK_NO_ROUTE (simulated)")
        if entity_id not in b.slow:
            current = hass.states.get(entity_id)
            hass.states.async_set(entity_id, mode, dict(current.attributes) if current else {}, context=call.context)

    def setting(attr: str):
        """The thermostat takes a fan or swing mode (#91, lot 3)."""
        async def handler(call: ServiceCall) -> None:
            entity_id, value = call.data["entity_id"], call.data[attr]
            b.setting_calls.append((entity_id, attr, value))
            current = hass.states.get(entity_id)
            if current is not None and entity_id not in b.slow:
                hass.states.async_set(entity_id, current.state, {**current.attributes, attr: value}, context=call.context)
        return handler

    for attr in ("fan_mode", "swing_mode", "swing_horizontal_mode"):
        hass.services.async_register("climate", f"set_{attr}", setting(attr))
    hass.services.async_register("climate", "set_hvac_mode", set_hvac_mode)
    hass.services.async_register("climate", "set_preset_mode", set_preset_mode)
    hass.services.async_register("climate", "set_temperature", set_temperature)
    return b
