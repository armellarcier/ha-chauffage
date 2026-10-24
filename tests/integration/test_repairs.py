"""A repair proposes to forget a scheduled thermostat whose entity is gone from Home Assistant
(docs/decisions.md, "Scheduled thermostats")."""

import pytest
from homeassistant.helpers import entity_registry as er, issue_registry as ir
from homeassistant.setup import async_setup_component

from conftest import Bench, every_day

WEEK = {"normal": every_day(("00:00", "eco"))}
MISSING = "missing_climate.grenier"


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.setup()
    await bench.save_weeks({"climate.salon": WEEK})


def issue(bench: Bench, issue_id: str):
    return ir.async_get(bench.hass).async_get_issue("chauffage", issue_id)


@pytest.fixture
def http_client(hass_client, hass_admin_user):
    """HTTP client whose token is created now (the bench's clock jumps ahead)."""

    async def connect(hass):
        refresh = await hass.auth.async_create_refresh_token(hass_admin_user, "https://example.com/")
        return await hass_client(hass.auth.async_create_access_token(refresh))

    return connect


async def fix(bench: Bench, http_client, issue_id: str, choice: str) -> dict:
    """Answers a repair from Settings → Repairs: its menu, then a choice."""
    assert await async_setup_component(bench.hass, "repairs", {})
    client = await http_client(bench.hass)
    response = await client.post("/api/repairs/issues/fix", json={"handler": "chauffage", "issue_id": issue_id})
    flow = await response.json()
    assert flow["type"] == "menu", flow
    response = await client.post(f"/api/repairs/issues/fix/{flow['flow_id']}", json={"next_step_id": choice})
    result = await response.json()
    await bench.hass.async_block_till_done()
    return {"menu": flow["menu_options"], **result}


async def test_a_thermostat_whose_entity_is_gone_raises_a_repair_at_start(bench: Bench, hass_storage):
    await start(bench)
    await bench.save_weeks({"climate.grenier": WEEK})
    await bench.advance(1)  # delayed save
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    found = issue(bench, MISSING)
    assert found is not None and found.is_fixable and found.translation_key == "missing"
    assert found.translation_placeholders == {"entity_id": "climate.grenier"}
    assert issue(bench, "missing_climate.salon") is None


async def test_an_entity_removed_while_running_raises_the_repair(bench: Bench):
    await start(bench)
    registry = er.async_get(bench.hass)
    registry.async_get_or_create("climate", "test", "grenier", suggested_object_id="grenier")
    await bench.save_weeks({"climate.grenier": WEEK})
    registry.async_remove("climate.grenier")
    await bench.hass.async_block_till_done()
    assert issue(bench, MISSING) is not None


async def test_an_entity_made_again_with_the_same_id_closes_the_repair(bench: Bench):
    """Its integration removed and added again, a device paired again: the thermostat is back."""
    await start(bench)
    registry = er.async_get(bench.hass)
    registry.async_get_or_create("climate", "test", "grenier", suggested_object_id="grenier")
    await bench.save_weeks({"climate.grenier": WEEK})
    registry.async_remove("climate.grenier")
    await bench.hass.async_block_till_done()
    registry.async_get_or_create("climate", "test", "grenier-2", suggested_object_id="grenier")
    await bench.hass.async_block_till_done()
    assert registry.async_get("climate.grenier") is not None
    assert issue(bench, MISSING) is None
    assert "climate.grenier" in bench.runtime.scheduled


async def test_an_entity_without_state_but_still_registered_is_not_gone(bench: Bench):
    """Its integration did not start (yet): unavailable, not gone."""
    await start(bench)
    er.async_get(bench.hass).async_get_or_create("climate", "test", "grenier", suggested_object_id="grenier")
    await bench.save_weeks({"climate.grenier": WEEK})
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert issue(bench, MISSING) is None


async def test_the_missing_repair_forgets_the_thermostat_or_keeps_it(bench: Bench, http_client):
    await start(bench)
    await bench.save_weeks({"climate.grenier": WEEK, "climate.cave": WEEK})
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    result = await fix(bench, http_client, MISSING, "forget")
    assert result["menu"] == ["forget", "keep"]
    assert result["type"] == "create_entry"
    assert "climate.grenier" not in bench.runtime.thermostats
    await fix(bench, http_client, "missing_climate.cave", "keep")
    assert "climate.cave" in bench.runtime.thermostats
    assert issue(bench, "missing_climate.cave") is None


async def test_a_forgotten_thermostat_s_repairs_are_closed(bench: Bench):
    await start(bench)
    await bench.save_weeks({"climate.grenier": WEEK})
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    await bench.runtime.forget("climate.grenier")
    await bench.hass.async_block_till_done()
    assert issue(bench, MISSING) is None
