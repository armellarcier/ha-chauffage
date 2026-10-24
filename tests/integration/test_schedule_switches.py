"""A switch per schedule, on the Chauffage device: on for the active schedule; turning one on
activates it (docs/decisions.md, "Entities")."""

import pytest
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr, entity_registry as er

from conftest import KINDS, WEEKDAY, Bench, every_day

WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": every_day(("00:00", "frost"))}}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    await bench.setup()
    await bench.save_weeks(WEEKS)
    bench.applied()


def states(bench: Bench) -> dict[str, str]:
    return {e: bench.hass.states.get(e).state for e in bench.hass.states.async_entity_ids("switch")
            if e.startswith("switch.chauffage_schedule_")}


async def switch(bench: Bench, service: str, entity_id: str) -> None:
    await bench.hass.services.async_call("switch", service, {"entity_id": entity_id}, blocking=True)
    await bench.hass.async_block_till_done()


async def test_each_schedule_has_a_switch_on_for_the_active_one(bench: Bench):
    await start(bench)
    assert states(bench) == {"switch.chauffage_schedule_normal": "on", "switch.chauffage_schedule_away": "off",
                             "switch.chauffage_schedule_holiday": "off"}
    entry = er.async_get(bench.hass).async_get("switch.chauffage_schedule_away")
    device = dr.async_get(bench.hass).async_get(entry.device_id)
    assert device.name == "Chauffage" and entry.entity_category is None
    assert bench.hass.states.get("switch.chauffage_schedule_away").name == "Chauffage Away schedule"
    assert bench.runtime.snapshot()["schedule_entities"]["away"] == "switch.chauffage_schedule_away"  # for the card


async def test_turning_a_schedule_switch_on_activates_that_schedule(bench: Bench):
    await start(bench)
    await switch(bench, "turn_on", "switch.chauffage_schedule_away")
    assert bench.runtime.data["active_schedule"] == "away"
    assert bench.applied() == {"climate.salon": "frost"}
    assert states(bench) == {"switch.chauffage_schedule_normal": "off", "switch.chauffage_schedule_away": "on",
                             "switch.chauffage_schedule_holiday": "off"}
    assert bench.hass.states.get("select.chauffage_schedule").state == "Away"


async def test_turning_the_active_schedule_s_switch_off_says_to_turn_another_one_on(bench: Bench):
    """There is always an active schedule: it changes by turning another one on."""
    await start(bench)
    with pytest.raises(ServiceValidationError) as err:
        await switch(bench, "turn_off", "switch.chauffage_schedule_normal")
    assert err.value.translation_key == "active_schedule_off"
    assert bench.runtime.data["active_schedule"] == "normal"
    assert bench.hass.states.get("switch.chauffage_schedule_normal").state == "on"


async def test_turning_an_inactive_schedule_s_switch_off_changes_nothing(bench: Bench):
    await start(bench)
    await switch(bench, "turn_off", "switch.chauffage_schedule_away")
    assert bench.runtime.data["active_schedule"] == "normal"
    assert bench.applied() == {}


async def test_schedule_switches_follow_the_schedules(bench: Bench):
    """Created and deleted with the schedules; a rename changes the name, not the entity id."""
    await start(bench)
    await bench.set_schedules([{"id": "normal"}, {"id": "away", "name": "Out"}, {"id": "holiday"},
                               {"name": "Remote work", "copy_of": "normal"}])
    assert bench.hass.states.get("switch.chauffage_schedule_away").name == "Chauffage Out schedule"
    assert bench.hass.states.get("switch.chauffage_schedule_remote_work").state == "off"
    await bench.set_schedules([{"id": "normal"}, {"id": "away"}, {"id": "remote_work"}])
    assert er.async_get(bench.hass).async_get("switch.chauffage_schedule_holiday") is None
    assert set(states(bench)) == {"switch.chauffage_schedule_normal", "switch.chauffage_schedule_away",
                                  "switch.chauffage_schedule_remote_work"}



async def test_the_card_is_told_the_switch_of_a_new_schedule_or_a_new_entity_id(bench: Bench):
    """The switch is registered after the schedule is created: the card is told again, so that an
    icon chosen for it is shown."""
    await start(bench)
    sent = []
    bench.runtime.async_add_listener(lambda reason: sent.append(bench.runtime.snapshot()["schedule_entities"]))
    await bench.set_schedules([{"id": "normal"}, {"id": "away"}, {"id": "holiday"}, {"name": "Guests"}])
    assert sent[-1]["guests"] == "switch.chauffage_schedule_guests"
    er.async_get(bench.hass).async_update_entity("switch.chauffage_schedule_guests", new_entity_id="switch.guests")
    await bench.hass.async_block_till_done()
    assert sent[-1]["guests"] == "switch.guests"
