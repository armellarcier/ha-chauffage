"""The *Planned preset* sensor is deprecated in favour of *Next change* (#125): a repair warns
the installations that have it enabled, with the automations and scripts that use it."""

from unittest.mock import patch

import pytest
from homeassistant.helpers import entity_registry as er, issue_registry as ir
from homeassistant.setup import async_setup_component

from conftest import Bench, every_day

SENSOR = "sensor.salon_planned_preset"
WEEKS = {"climate.salon": {"normal": every_day(("00:00", "eco"))}}
DEPRECATED, USED = "deprecated_planned_preset", "deprecated_planned_preset_used"


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.setup()
    await bench.save_weeks(WEEKS)


def issues(bench: Bench) -> dict[str, ir.IssueEntry]:
    return {issue_id: issue for (domain, issue_id), issue in ir.async_get(bench.hass).issues.items()
            if domain == "chauffage" and issue_id.startswith(DEPRECATED)}


async def enable(bench: Bench, disabled_by: er.RegistryEntryDisabler | None = None) -> None:
    er.async_get(bench.hass).async_update_entity(SENSOR, disabled_by=disabled_by)
    await bench.hass.async_block_till_done()


async def test_the_planned_preset_sensor_stays_enabled_by_default_with_its_repair(bench: Bench):
    """Hestia Confort reads Chauffage through this sensor's state (#125): it stays enabled until
    the removal."""
    await start(bench)
    assert er.async_get(bench.hass).async_get(SENSOR).disabled_by is None
    assert DEPRECATED in issues(bench)


async def test_an_enabled_planned_preset_sensor_raises_a_deprecation_repair(bench: Bench):
    await start(bench)
    await enable(bench)
    issue = issues(bench)[DEPRECATED]
    assert issue.severity is ir.IssueSeverity.WARNING and not issue.is_fixable
    assert SENSOR in issue.translation_placeholders["sensors"]


async def test_disabling_the_planned_preset_sensor_closes_the_repair(bench: Bench):
    await start(bench)
    await enable(bench, er.RegistryEntryDisabler.USER)
    assert issues(bench) == {}


async def test_an_ignored_repair_stays_ignored(bench: Bench):
    """Checked again at each start and each change of the sensor: the user's *Ignore* is kept."""
    await start(bench)
    ir.async_ignore_issue(bench.hass, "chauffage", DEPRECATED, True)
    er.async_get(bench.hass).async_update_entity(SENSOR, name="Planned")
    await bench.hass.async_block_till_done()
    assert issues(bench)[DEPRECATED].dismissed_version is not None


async def test_the_repair_follows_the_automations_once_they_are_reloaded(bench: Bench):
    await start(bench)
    with patch("homeassistant.components.automation.automations_with_entity", return_value=["automation.heating"]):
        bench.hass.bus.async_fire("automation_reloaded")
        await bench.hass.async_block_till_done()
    assert "automation.heating" in issues(bench)[USED].translation_placeholders["users"]


@pytest.mark.parametrize("domain", ["automation", "script"])
async def test_the_repair_lists_the_automations_and_scripts_that_use_the_sensor(bench: Bench, domain: str):
    if domain == "automation":
        config = {"automation": [{"id": "heating", "alias": "Heating", "triggers": [
            {"trigger": "state", "entity_id": SENSOR}], "actions": []}]}
        user = "automation.heating"
    else:
        config = {"script": {"heating": {"sequence": [
            {"condition": "state", "entity_id": SENSOR, "state": "eco"}]}}}
        user = "script.heating"
    assert await async_setup_component(bench.hass, domain, config)
    await start(bench)
    await enable(bench)
    issue = issues(bench)
    assert DEPRECATED not in issue
    assert user in issue[USED].translation_placeholders["users"]
    assert SENSOR in issue[USED].translation_placeholders["sensors"]
