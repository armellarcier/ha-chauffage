"""Schedules defined by the user: created empty or as a copy, renamed, moved, deleted; stable ids
for automations (docs/decisions.md, "Schedules")."""

import pytest
from homeassistant.exceptions import ServiceValidationError

from conftest import WEEKDAY, WEEKEND, Bench
from custom_components.chauffage.model import InvalidData

SALON_WEEK = [WEEKDAY] * 5 + [WEEKEND] * 2
WEEKS = {
    "climate.salon": {"normal": SALON_WEEK, "away": [[["00:00", "frost"]]] * 7},
    "climate.bureau": {"normal": [WEEKDAY] * 7},
}
ECO_WEEK = [[["00:00", "eco"]]] * 7


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup()
    await bench.save_weeks(WEEKS)
    bench.applied()


def kept(*ids: str) -> list[dict]:
    """The current schedules with these ids, unchanged, in this order."""
    return [{"id": i} for i in ids]


def weeks_of(bench: Bench, schedule_id: str) -> dict:
    return {entity: weeks[schedule_id] for entity, weeks in bench.runtime.data["weeks"].items() if schedule_id in weeks}


# ----- a new installation, an existing one -----

async def test_a_new_installation_starts_with_a_single_schedule(bench: Bench):
    await bench.setup(schedules=None)
    assert bench.schedule_list() == [("normal", "Normal")]
    state = bench.hass.states.get(bench.schedule_entity)
    assert state.attributes["options"] == ["Normal"]
    assert (state.state, state.attributes["schedule_id"]) == ("Normal", "normal")


async def test_a_new_installation_in_french_too(bench: Bench):
    bench.hass.config.language = "fr"
    await bench.setup(schedules=None)
    assert bench.schedule_list() == [("normal", "Normal")]


async def test_an_existing_installation_keeps_its_schedules(bench: Bench):
    await start(bench)
    assert bench.schedule_list() == [("normal", "Normal"), ("away", "Away"), ("holiday", "Holiday")]
    assert bench.hass.states.get(bench.schedule_entity).attributes["options"] == ["Normal", "Away", "Holiday"]


# ----- creating -----

async def test_duplicating_a_schedule_copies_every_thermostat_s_week(bench: Bench):
    await start(bench)
    result = await bench.set_schedules(kept("normal", "away", "holiday") + [{"name": "Remote work", "copy_of": "normal"}])
    assert result[-1] == {"id": "remote_work", "name": "Remote work"}
    assert weeks_of(bench, "remote_work") == weeks_of(bench, "normal")
    assert bench.hass.states.get(bench.schedule_entity).attributes["options"][-1] == "Remote work"


async def test_an_empty_schedule_puts_every_scheduled_thermostat_in_eco_all_week(bench: Bench):
    await start(bench)
    await bench.set_schedules(kept("normal", "away", "holiday") + [{"name": "Guests"}])
    assert weeks_of(bench, "guests") == {"climate.salon": ECO_WEEK, "climate.bureau": ECO_WEEK}


async def test_an_empty_schedule_uses_the_first_preset_when_there_is_no_eco(bench: Bench):
    await start(bench)
    presets = [p for p in bench.runtime.data["presets"] if p["id"] != "eco"]
    await bench.runtime.set_presets(presets, {"eco": "frost"})
    await bench.set_schedules(kept("normal", "away", "holiday") + [{"name": "Guests"}])
    assert weeks_of(bench, "guests")["climate.salon"] == [[["00:00", "comfort"]]] * 7


async def test_creating_a_schedule_does_not_touch_the_thermostats(bench: Bench):
    await start(bench)
    await bench.set_schedules(kept("normal", "away", "holiday") + [{"name": "Guests"}])
    assert bench.applied() == {}
    assert bench.runtime.data["active_schedule"] == "normal"


async def test_a_new_schedule_gets_a_unique_id_from_its_name(bench: Bench):
    await start(bench)
    # "Away" is already the id of "Away": the new one gets another id
    await bench.set_schedules([{"id": "normal"}, {"id": "away", "name": "Out"}, {"id": "holiday"},
                               {"name": "Away"}, {"name": "Télétravail du mardi"}])
    assert bench.schedule_list()[3:] == [("away_2", "Away"), ("teletravail_du_mardi", "Télétravail du mardi")]


# ----- renaming, moving -----

async def test_renaming_a_schedule_keeps_its_id_its_weeks_and_the_active_one(bench: Bench):
    await start(bench)
    before = weeks_of(bench, "normal")
    await bench.set_schedules([{"id": "normal", "name": "Weekdays"}, {"id": "away"}, {"id": "holiday"}])
    assert bench.schedule_list()[0] == ("normal", "Weekdays")
    assert weeks_of(bench, "normal") == before
    state = bench.hass.states.get(bench.schedule_entity)
    assert (state.state, state.attributes["schedule_id"]) == ("Weekdays", "normal")
    assert bench.applied() == {}


async def test_moving_schedules_changes_the_order_of_the_options(bench: Bench):
    await start(bench)
    await bench.set_schedules(kept("holiday", "normal", "away"))
    assert [i for i, _ in bench.schedule_list()] == ["holiday", "normal", "away"]
    assert bench.hass.states.get(bench.schedule_entity).attributes["options"] == ["Holiday", "Normal", "Away"]


@pytest.mark.parametrize("name", ["", "   ", "Away", "away "])
async def test_a_name_must_be_set_and_not_taken(bench: Bench, name: str):
    await start(bench)
    with pytest.raises(InvalidData):
        await bench.set_schedules([{"id": "normal", "name": name}, {"id": "away"}, {"id": "holiday"}])
    assert bench.schedule_list()[0] == ("normal", "Normal")


async def test_a_new_schedule_cannot_take_an_existing_name(bench: Bench):
    await start(bench)
    with pytest.raises(InvalidData):
        await bench.set_schedules(kept("normal", "away", "holiday") + [{"name": "Holiday"}])


async def test_unknown_ids_and_copies_are_refused(bench: Bench):
    await start(bench)
    for schedules in ([{"id": "normal"}, {"id": "unknown"}],
                      kept("normal", "away", "holiday") + [{"name": "Copy", "copy_of": "unknown"}],
                      kept("normal", "normal", "away", "holiday"),
                      ["normal"]):
        with pytest.raises(InvalidData):
            await bench.set_schedules(schedules)
    assert len(bench.schedule_list()) == 3


# ----- deleting -----

async def test_deleting_a_schedule_removes_its_weeks(bench: Bench):
    await start(bench)
    await bench.set_schedules(kept("normal", "holiday"))
    assert [i for i, _ in bench.schedule_list()] == ["normal", "holiday"]
    assert weeks_of(bench, "away") == {}
    assert weeks_of(bench, "normal") == {"climate.salon": SALON_WEEK, "climate.bureau": [WEEKDAY] * 7}
    assert bench.hass.states.get(bench.schedule_entity).attributes["options"] == ["Normal", "Holiday"]


async def test_the_active_schedule_cannot_be_deleted(bench: Bench):
    await start(bench)
    with pytest.raises(InvalidData):
        await bench.set_schedules(kept("away", "holiday"))
    assert len(bench.schedule_list()) == 3


async def test_the_last_schedule_cannot_be_deleted(bench: Bench):
    await start(bench)
    with pytest.raises(InvalidData):
        await bench.set_schedules([])


async def test_overrides_survive_a_deleted_schedule(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    await bench.set_schedules(kept("normal"))
    assert "climate.salon" in bench.overrides()


# ----- automations: stable ids -----

async def test_an_automation_activates_a_schedule_by_its_id_even_once_renamed(bench: Bench):
    await start(bench)
    await bench.set_schedules([{"id": "normal"}, {"id": "away", "name": "Out for the day"}, {"id": "holiday"}])
    await bench.hass.services.async_call("chauffage", "activate_schedule", {"schedule": "away"}, blocking=True)
    await bench.hass.async_block_till_done()
    state = bench.hass.states.get(bench.schedule_entity)
    assert (state.state, state.attributes["schedule_id"]) == ("Out for the day", "away")
    assert bench.applied() == {"climate.salon": "frost"}


async def test_activating_an_unknown_schedule_says_so(bench: Bench):
    await start(bench)
    with pytest.raises(ServiceValidationError) as err:
        await bench.hass.services.async_call("chauffage", "activate_schedule", {"schedule": "nope"}, blocking=True)
    assert err.value.translation_key == "unknown_schedule"


# ----- from the card (websocket) -----

async def test_the_card_manages_schedules_with_the_revision_it_edited(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/schedules/set", "revision": 1,
                                    "schedules": kept("normal", "away", "holiday") + [{"name": "Guests", "copy_of": "away"}]})
    reply = await client.receive_json()
    assert reply["success"]
    assert reply["result"] == {"schedules": [{"id": "normal", "name": "Normal"}, {"id": "away", "name": "Away"},
                                         {"id": "holiday", "name": "Holiday"}, {"id": "guests", "name": "Guests"}],
                               "revision": 2}


async def test_the_card_cannot_manage_schedules_from_an_outdated_copy(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/schedules/set", "revision": 0, "schedules": kept("normal")})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "stale"
    assert len(bench.schedule_list()) == 3


async def test_invalid_schedule_lists_are_refused_with_the_reason(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/schedules/set", "schedules": kept("away", "holiday")})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "invalid_format"


async def test_only_admins_manage_schedules(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass, admin=False)
    await client.send_json_auto_id({"type": "chauffage/schedules/set", "schedules": kept("normal")})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "unauthorized"
    assert len(bench.schedule_list()) == 3
