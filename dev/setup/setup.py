"""First-run setup of the development Home Assistant (dev/compose.yaml, `setup` service).

Uses only HA's public APIs (onboarding, auth, config flows, websocket), so it keeps
working across HA versions. Every step is idempotent: running it again skips what is
already done.

  1. onboarding: user dev / dev, location, analytics, integrations
  2. long-lived access token written to /config/.dev-token (read by scripts/_ha.sh)
  3. three Versatile Thermostat "over a switch" thermostats on the simulated rooms
  4. a dashboard with the card
  5. the Chauffage integration's config entry
  6. two more schedules (Vacances, Absent: Normal, Vacances, Absent in this order) and sample weeks for every kind of thermostat (VTherm; kitchen: generic_thermostat without
     presets; guest room: standard presets, dev/sim_climate), saved through the integration
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import aiohttp

HA = os.environ.get("HA_URL", "http://homeassistant:8123")
CLIENT_ID = "http://localhost:8124/"
USER, PASSWORD = "dev", "dev"
TOKEN_FILE = Path("/config/.dev-token")


def log(msg: str) -> None:
    print(f"[setup] {msg}", flush=True)


async def wait_for_ha(session: aiohttp.ClientSession) -> None:
    for _ in range(180):
        try:
            async with session.get(f"{HA}/api/onboarding") as r:
                if r.status in (200, 401, 404):
                    return
        except aiohttp.ClientError:
            pass
        await asyncio.sleep(2)
    sys.exit("[setup] Home Assistant did not start in time")


async def onboarding(session: aiohttp.ClientSession) -> str | None:
    """Creates the dev user if needed; returns a short-lived access token, or None if
    onboarding was already done."""
    async with session.get(f"{HA}/api/onboarding") as r:
        if r.status != 200:
            return None
        done = {step["step"] for step in await r.json() if step["done"]}
    if "user" in done:
        return None

    log("onboarding: creating user dev / dev")
    async with session.post(f"{HA}/api/onboarding/users", json={
        "client_id": CLIENT_ID, "name": "Dev", "username": USER, "password": PASSWORD, "language": "fr",
    }) as r:
        r.raise_for_status()
        code = (await r.json())["auth_code"]
    async with session.post(f"{HA}/auth/token", data={
        "grant_type": "authorization_code", "code": code, "client_id": CLIENT_ID,
    }) as r:
        r.raise_for_status()
        token = (await r.json())["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    for step, payload in (
        ("core_config", {}),
        ("analytics", {}),
        ("integration", {"client_id": CLIENT_ID, "redirect_uri": CLIENT_ID}),
    ):
        async with session.post(f"{HA}/api/onboarding/{step}", json=payload, headers=headers) as r:
            log(f"onboarding: {step} → HTTP {r.status}")
    return token


async def login(session: aiohttp.ClientSession) -> str:
    """Access token through the regular login flow (onboarding already done)."""
    async with session.post(f"{HA}/auth/login_flow", json={
        "client_id": CLIENT_ID, "handler": ["homeassistant", None], "redirect_uri": CLIENT_ID,
    }) as r:
        flow = await r.json()
    async with session.post(f"{HA}/auth/login_flow/{flow['flow_id']}", json={
        "client_id": CLIENT_ID, "username": USER, "password": PASSWORD,
    }) as r:
        result = await r.json()
    if result.get("type") != "create_entry":
        sys.exit(f"[setup] login failed: {result}")
    async with session.post(f"{HA}/auth/token", data={
        "grant_type": "authorization_code", "code": result["result"], "client_id": CLIENT_ID,
    }) as r:
        r.raise_for_status()
        return (await r.json())["access_token"]


class WS:
    """Minimal Home Assistant websocket client."""

    def __init__(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        self.ws = ws
        self.next_id = 1

    async def call(self, **message) -> dict:
        message["id"] = self.next_id
        self.next_id += 1
        await self.ws.send_json(message)
        while True:
            reply = await self.ws.receive_json()
            if reply.get("id") == message["id"]:
                if not reply.get("success", True):
                    raise RuntimeError(f"{message['type']}: {reply.get('error')}")
                return reply.get("result")

    async def first_event(self, **message) -> dict:
        """Subscribes and returns the first event (the subscription stays open)."""
        message["id"] = self.next_id
        self.next_id += 1
        await self.ws.send_json(message)
        while True:
            reply = await self.ws.receive_json()
            if reply.get("id") != message["id"]:
                continue
            if not reply.get("success", True):
                raise RuntimeError(f"{message['type']}: {reply.get('error')}")
            if reply.get("type") == "event":
                return reply["event"]


async def open_ws(session: aiohttp.ClientSession, token: str) -> WS:
    ws = await session.ws_connect(f"{HA}/api/websocket")
    await ws.receive_json()  # auth_required
    await ws.send_json({"type": "auth", "access_token": token})
    if (await ws.receive_json())["type"] != "auth_ok":
        sys.exit("[setup] websocket authentication failed")
    return WS(ws)


async def long_lived_token(ws: WS) -> str:
    if TOKEN_FILE.exists() and TOKEN_FILE.read_text().strip():
        return TOKEN_FILE.read_text().strip()
    token = await ws.call(type="auth/long_lived_access_token", client_name="ha-chauffage dev", lifespan=3650)
    TOKEN_FILE.write_text(token + "\n")
    log(f"long-lived token written to {TOKEN_FILE}")
    return token


# ----- Versatile Thermostat -----

ROOMS = {"salon": "Salon", "bureau": "Bureau", "chambre": "Chambre"}
PRESET_TEMPERATURES = {"frost": 7, "eco": 17, "comfort": 20, "boost": 22}


class Api:
    """REST helper bound to an access token."""

    def __init__(self, session: aiohttp.ClientSession, token: str) -> None:
        self.session = session
        self.headers = {"Authorization": f"Bearer {token}"}

    async def get(self, path: str):
        async with self.session.get(f"{HA}/api/{path}", headers=self.headers) as r:
            return await r.json() if r.status == 200 else None

    async def post(self, path: str, payload: dict | None = None):
        async with self.session.post(f"{HA}/api/{path}", json=payload or {}, headers=self.headers) as r:
            body = await r.json(content_type=None)
            if r.status >= 400:
                raise RuntimeError(f"POST {path} → HTTP {r.status}: {body}")
            return body


async def create_vtherm(api: Api, room: str, name: str) -> None:
    """Walks through the Versatile Thermostat config flow for an "over a switch"
    thermostat (same screens as the UI, menu-based)."""
    flow = await api.post("config/config_entries/flow", {"handler": "versatile_thermostat", "show_advanced_options": True})
    flow_id = flow["flow_id"]

    async def step(data: dict) -> dict:
        result = await api.post(f"config/config_entries/flow/{flow_id}", data)
        if result.get("errors"):
            raise RuntimeError(f"VTherm {name}: {result['errors']}")
        return result

    await step({"thermostat_type": "thermostat_over_switch"})
    for section, forms in (
        ("main", [
            {"name": name, "temperature_sensor_entity_id": f"sensor.temperature_{room}", "cycle_min": 5,
             "use_main_central_config": False, "use_central_mode": False, "used_by_controls_central_boiler": False},
            {"external_temperature_sensor_entity_id": "sensor.temperature_exterieure",
             "temp_min": 7, "temp_max": 30, "step_temperature": 0.5},
        ]),
        ("type", [{"underlying_entity_ids": [f"input_boolean.radiateur_{room}"], "proportional_function": "tpi"}]),
        ("presets", [{"use_presets_central_config": False}]),
        ("tpi", [
            {"use_tpi_central_config": False},
            {"tpi_coef_int": 0.6, "tpi_coef_ext": 0.01, "minimal_activation_delay": 10, "minimal_deactivation_delay": 0},
        ]),
        ("advanced", [
            {"use_advanced_central_config": False},
            {"safety_delay_min": 60, "safety_min_on_percent": 0.5, "safety_default_on_percent": 0.1},
        ]),
    ):
        await step({"next_step_id": section})
        for form in forms:
            await step(form)
    result = await step({"next_step_id": "finalize"})
    if result.get("type") != "create_entry":
        raise RuntimeError(f"VTherm {name}: flow did not finish: {result}")


async def wait_for_entity(api: Api, entity_id: str) -> None:
    for _ in range(30):
        if await api.get(f"states/{entity_id}"):
            return
        await asyncio.sleep(1)
    raise RuntimeError(f"{entity_id} did not appear")


async def wait_until_running(api: Api) -> None:
    """Waits for the end of HA's startup: before that, restored states (such as the stored
    schedules) may not be there yet, and the sample schedules would overwrite them."""
    for _ in range(120):
        config = await api.get("config")
        if config and config.get("state") == "RUNNING":
            return
        await asyncio.sleep(2)
    raise RuntimeError("Home Assistant did not finish starting")


async def thermostats(api: Api) -> None:
    entries = await api.get("config/config_entries/entry?domain=versatile_thermostat") or []
    existing = {e["title"] for e in entries}
    for room, name in ROOMS.items():
        if name in existing:
            continue
        log(f"Versatile Thermostat: creating {name}")
        await create_vtherm(api, room, name)
        await wait_for_entity(api, f"climate.{room}")
        for preset, temperature in PRESET_TEMPERATURES.items():
            await api.post("services/number/set_value",
                           {"entity_id": f"number.{room}_preset_{preset}_temp", "value": temperature})
        await api.post("services/climate/set_hvac_mode", {"entity_id": f"climate.{room}", "hvac_mode": "heat"})


# ----- dashboard and sample schedules -----

# Thermostats of the other kinds (simulation.yaml): no presets, standard presets
OTHER_THERMOSTATS = {"climate.cuisine": "Cuisine", "climate.chambre_d_amis": "Chambre d'amis"}

CARD = {
    "type": "custom:chauffage-programme-card",
    "show": "all",
    "thermostats": [{"entity": f"climate.{room}", "name": name} for room, name in ROOMS.items()]
    + [{"entity": entity, "name": name} for entity, name in OTHER_THERMOSTATS.items()],
}

def day(*slots: str) -> list[list[str]]:
    """"06:30 comfort" → ["06:30", "comfort"]"""
    return [slot.split() for slot in slots]


WEEKDAY = day("00:00 eco", "06:30 comfort", "08:30 eco", "17:30 comfort", "22:30 eco")
WEEKEND = day("00:00 eco", "08:00 comfort", "23:00 eco")
# Schedules created after the default one (Normal), in this order
EXTRA_SCHEDULES = ["Vacances", "Absent"]
# Holidays: everyone home all day; Away: eco
HOLIDAY_DAY = day("00:00 eco", "07:30 comfort", "22:30 eco")
# Week of the first schedule (Normal), by thermostat
SAMPLE_WEEKS = {
    "climate.salon": [WEEKDAY] * 5 + [WEEKEND] * 2,
    "climate.bureau": [day("00:00 eco", "08:30 comfort", "18:00 eco")] * 5 + [day("00:00 eco")] * 2,
    "climate.chambre": [day("00:00 eco", "06:30 comfort", "07:30 eco", "21:00 comfort", "22:30 eco")] * 7,
    "climate.cuisine": [day("00:00 eco", "07:00 comfort", "09:00 eco", "18:30 comfort", "21:00 eco")] * 7,
    "climate.chambre_d_amis": [day("00:00 frost")] * 5 + [day("00:00 eco", "08:00 comfort", "22:00 eco")] * 2,
}


DASHBOARD_URL = "chauffage-dev"  # HA requires a hyphen in dashboard URLs


async def dashboard(ws: WS) -> None:
    """Dedicated "Chauffage" dashboard in the sidebar (recent HA versions no longer show
    the legacy default dashboard)."""
    dashboards = await ws.call(type="lovelace/dashboards/list")
    if any(d["url_path"] == DASHBOARD_URL for d in dashboards):
        # Existing dashboard: add the thermostats it does not list yet
        config = await ws.call(type="lovelace/config", url_path=DASHBOARD_URL)
        card = config["views"][0]["cards"][0]
        missing = [t for t in CARD["thermostats"] if t not in card.get("thermostats", [])]
        if missing:
            log(f"dashboard: adding {', '.join(t['entity'] for t in missing)} to the card")
            card["thermostats"] = card.get("thermostats", []) + missing
            await ws.call(type="lovelace/config/save", url_path=DASHBOARD_URL, config=config)
        return
    log(f"dashboard: creating /{DASHBOARD_URL} with the card")
    await ws.call(type="lovelace/dashboards/create", url_path=DASHBOARD_URL, title="Chauffage",
                  icon="mdi:radiator", show_in_sidebar=True, require_admin=False, mode="storage")
    await ws.call(type="lovelace/config/save", url_path=DASHBOARD_URL, config={
        "views": [{"title": "Chauffage", "path": "planning", "type": "panel", "cards": [CARD]}],
    })


async def integration(api: Api) -> None:
    if await api.get("config/config_entries/entry?domain=chauffage"):
        return
    log("integration: creating the Chauffage entry")
    flow = await api.post("config/config_entries/flow", {"handler": "chauffage"})
    await api.post(f"config/config_entries/flow/{flow['flow_id']}", {})


async def sample_schedules(ws: WS) -> None:
    """Sample schedules and weeks for the thermostats that have none, saved through the integration."""
    data = await ws.first_event(type="chauffage/subscribe")
    if len(data["schedules"]) == 1:
        log(f"schedules: creating {', '.join(EXTRA_SCHEDULES)}")
        result = await ws.call(type="chauffage/schedules/set",
                               schedules=[{"id": data["schedules"][0]["id"]}] + [{"name": n} for n in EXTRA_SCHEDULES])
        data["schedules"] = result["schedules"]
    weeks = data["weeks"]
    missing = [entity for entity in SAMPLE_WEEKS if entity not in weeks]
    if not missing:
        return
    first, *others = [s["id"] for s in data["schedules"]]
    for entity in missing:
        other_weeks = [[HOLIDAY_DAY] * 7, [day("00:00 eco")] * 7]
        weeks[entity] = {first: SAMPLE_WEEKS[entity], **dict(zip(others, other_weeks))}
    log(f"schedules: sample weeks for {', '.join(missing)}")
    await ws.call(type="chauffage/weeks/save", weeks=weeks)


async def main() -> None:
    async with aiohttp.ClientSession() as session:
        await wait_for_ha(session)
        token = await onboarding(session) or await login(session)
        ws = await open_ws(session, token)
        api = Api(session, await long_lived_token(ws))
        await wait_until_running(api)
        await thermostats(api)
        await dashboard(ws)
        await integration(api)
        await sample_schedules(ws)
        log(f"done — http://localhost:8124/{DASHBOARD_URL} (dev / dev)")


if __name__ == "__main__":
    asyncio.run(main())
