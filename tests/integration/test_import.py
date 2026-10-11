"""Import of a package installation (v0.1) when the integration is added."""

import json
from pathlib import Path

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import CoreState, ServiceCall
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import entity_registry as er, issue_registry as ir
from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import Bench

FIXTURES = Path(__file__).parents[1] / "fixtures"
PACKAGE = json.loads((FIXTURES / "schedules-v1.json").read_text(encoding="utf-8"))
OVERRIDE = {"type": "temp", "valeur": 21.5, "debut": "2026-10-12T09:30:00+02:00", "fin": "2026-10-12T11:30:00+02:00"}


def install_package(bench: Bench, version: int | None = None, active: str = "Absent") -> list:
    """States and automations of a package installation; returns the automation.turn_off calls."""
    hass = bench.hass
    attributes = {"programmes": PACKAGE["programmes"], **({"version": version} if version else {})}
    hass.states.async_set("sensor.programmes_chauffage", "2026-10-12T08:00:00+02:00", attributes)
    hass.states.async_set("sensor.derogations_chauffage", "x", {"derogations": {"climate.salon": OVERRIDE}})
    hass.states.async_set("input_select.mode_chauffage", active, {"options": ["Normal", "Absent", "Vacances"]})
    registry = er.async_get(hass)
    for unique_id in ("chauffage_programmes_hebdo", "chauffage_derogation_manuelle"):
        registry.async_get_or_create("automation", "automation", unique_id, suggested_object_id=unique_id)
    calls = []

    async def turn_off(call: ServiceCall) -> None:
        calls.append(call.data)

    hass.services.async_register("automation", "turn_off", turn_off)
    return calls


async def add_integration(bench: Bench):
    result = await bench.hass.config_entries.flow.async_init("chauffage", context={"source": config_entries.SOURCE_USER})
    return result


async def test_the_flow_says_what_will_be_imported(bench: Bench):
    install_package(bench)
    result = await add_integration(bench)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "import_package"
    assert result["description_placeholders"] == {"thermostats": "2", "schedules": "3"}


async def test_weeks_overrides_and_active_schedule_are_imported(bench: Bench):
    await bench.go_to("10:00")
    calls = install_package(bench)
    result = await add_integration(bench)
    result = await bench.hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await bench.hass.async_block_till_done()
    bench.entry = bench.hass.config_entries.async_entries("chauffage")[0]
    data = bench.runtime.data

    assert data["schedules"] == [{"id": "normal", "name": "Normal"}, {"id": "absent", "name": "Absent"},
                             {"id": "vacances", "name": "Vacances"}]
    assert data["active_schedule"] == "absent"
    salon = data["weeks"]["climate.salon"]
    assert set(salon) == {"normal", "absent", "vacances"}
    assert salon["normal"][0] == [["00:00", "eco"], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"], ["22:30", "eco"]]
    assert data["weeks"]["climate.bureau"]["normal"][5] == [["00:00", "frost"]]
    assert data["overrides"]["climate.salon"] == {
        "kind": "temperature", "value": 21.5, "start": OVERRIDE["debut"], "end": OVERRIDE["fin"]}

    # The package's automations are turned off, and the user is told to remove the package
    assert sorted(calls[0]["entity_id"]) == ["automation.chauffage_derogation_manuelle", "automation.chauffage_programmes_hebdo"]
    issue = ir.async_get(bench.hass).async_get_issue("chauffage", "package_installed")
    assert issue is not None
    assert issue.translation_placeholders == {"schedule_entity": "select.chauffage_schedule"}


async def test_the_issue_disappears_once_the_package_is_removed(bench: Bench):
    install_package(bench)
    result = await add_integration(bench)
    await bench.hass.config_entries.flow.async_configure(result["flow_id"], {})
    await bench.hass.async_block_till_done()
    entry = bench.hass.config_entries.async_entries("chauffage")[0]

    for entity_id in ("sensor.programmes_chauffage", "sensor.derogations_chauffage", "input_select.mode_chauffage"):
        bench.hass.states.async_remove(entity_id)
    await bench.hass.config_entries.async_reload(entry.entry_id)
    await bench.hass.async_block_till_done()
    assert ir.async_get(bench.hass).async_get_issue("chauffage", "package_installed") is None
    # The imported data was kept
    assert "climate.salon" in entry.runtime_data.data["weeks"]


async def test_package_data_from_a_newer_version_is_not_imported(bench: Bench):
    install_package(bench, version=2)
    result = await add_integration(bench)
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "package_too_new"


async def test_without_the_package_the_flow_has_a_single_step(bench: Bench):
    result = await add_integration(bench)
    assert result["step_id"] == "user"


async def test_a_first_setup_during_startup_waits_for_home_assistant_to_be_running(bench: Bench):
    """At startup the package's restored states and automations may not exist yet."""
    calls = install_package(bench)
    bench.hass.set_state(CoreState.starting)
    entry = MockConfigEntry(domain="chauffage")
    entry.add_to_hass(bench.hass)
    await bench.hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_RETRY

    bench.hass.set_state(CoreState.running)
    await bench.hass.config_entries.async_reload(entry.entry_id)
    await bench.hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert "climate.salon" in entry.runtime_data.data["weeks"]
    assert calls  # package automations turned off
