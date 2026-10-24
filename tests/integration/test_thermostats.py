"""Scheduled thermostats: kept by the integration, whatever the cards send; forgotten only on
purpose (docs/decisions.md, "Scheduled thermostats", #27)."""

import pytest

from conftest import Bench, every_day, KINDS
from custom_components.chauffage import model
from custom_components.chauffage.runtime import StaleRevision


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


SALON = {"normal": every_day(("00:00", "eco"), ("17:30", "comfort"))}
BUREAU = {"normal": every_day(("00:00", "eco"), ("17:30", "comfort"))}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup()
    await bench.save_weeks({"climate.salon": SALON, "climate.bureau": BUREAU})
    bench.applied()


async def forget(bench: Bench, entity_id: str) -> None:
    await bench.runtime.forget(entity_id)
    await bench.hass.async_block_till_done()


async def test_a_thermostat_a_card_does_not_send_keeps_its_schedule(bench: Bench):
    """#27: removed from a card (or shown by another one), a thermostat is still scheduled."""
    await start(bench)
    await bench.save_weeks({"climate.bureau": {"normal": every_day(("00:00", "eco"))}})
    assert bench.runtime.weeks["climate.salon"]["normal"] == SALON["normal"]
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}
    await bench.manual_setpoint("climate.salon", 22)
    assert "climate.salon" in bench.overrides()


# ----- a week in every schedule -----

ECO_WEEK = every_day(("00:00", "eco"))


async def test_a_scheduled_thermostat_has_a_week_in_every_schedule(bench: Bench):
    """The card sent its week in one schedule: the others are eco all week, as a new schedule."""
    await start(bench)
    assert bench.runtime.weeks["climate.salon"] == {"normal": SALON["normal"], "away": ECO_WEEK, "holiday": ECO_WEEK}


async def test_saving_some_schedules_keeps_the_thermostat_s_other_weeks(bench: Bench):
    await start(bench)
    away = every_day(("00:00", "frost"))
    await bench.save_weeks({"climate.salon": {"away": away}})
    assert bench.runtime.weeks["climate.salon"] == {"normal": SALON["normal"], "away": away, "holiday": ECO_WEEK}


async def test_deleting_a_schedule_never_unschedules_a_thermostat(bench: Bench):
    await start(bench)
    await bench.activate_schedule("Away")
    await bench.set_schedules([{"id": "away"}, {"id": "holiday"}])
    await bench.hass.async_block_till_done()
    assert set(bench.runtime.scheduled) == {"climate.salon", "climate.bureau"}
    assert set(bench.runtime.weeks["climate.salon"]) == {"away", "holiday"}


async def test_a_forgotten_thermostat_is_no_longer_scheduled_nor_watched(bench: Bench):
    await start(bench)
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"temperature": 19.5}})
    await bench.manual_setpoint("climate.salon", 22)
    await forget(bench, "climate.salon")
    assert "climate.salon" not in bench.runtime.thermostats
    assert bench.overrides() == {}
    await bench.manual_setpoint("climate.salon", 23)
    assert bench.overrides() == {}
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.bureau": "comfort"}


async def test_a_copy_of_the_weeks_made_before_a_thermostat_was_forgotten_cannot_bring_it_back(bench: Bench):
    """Another card still holding the forgotten thermostat's weeks must reload first."""
    await start(bench)
    revision = bench.runtime.data["revision"]
    await forget(bench, "climate.salon")
    with pytest.raises(StaleRevision):
        await bench.runtime.save_weeks({"climate.salon": SALON, "climate.bureau": BUREAU}, revision)
    assert "climate.salon" not in bench.runtime.thermostats


async def test_values_of_the_presets_set_before_its_weeks_do_not_schedule_a_thermostat(bench: Bench):
    """Kept for when its weeks are saved, but nothing is planned: no switch, nothing to pause;
    its weeks schedule it, active."""
    await start(bench)
    bench.thermostat("climate.chambre", "eco")
    await bench.runtime.set_mapping("climate.chambre", {"comfort": {"temperature": 19.5}})
    await bench.hass.async_block_till_done()
    assert "climate.chambre" not in bench.runtime.snapshot()["thermostats"]
    assert bench.runtime.snapshot()["mappings"]["climate.chambre"] == {"comfort": {"temperature": 19.5}}
    assert bench.hass.states.get("switch.chambre_scheduling") is None
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_paused("climate.chambre", True)

    await bench.runtime.save_weeks({"climate.chambre": SALON}, revisions={"climate.chambre": None})
    await bench.hass.async_block_till_done()
    assert bench.runtime.snapshot()["thermostats"]["climate.chambre"]["paused"] is False
    assert bench.hass.states.get("switch.chambre_scheduling") is not None


async def test_values_of_the_presets_cleared_before_its_weeks_leave_nothing_behind(bench: Bench):
    """Nothing kept for a thermostat Chauffage does not schedule once its values are cleared:
    renaming it later reloads nothing."""
    await start(bench)
    bench.thermostat("climate.chambre", "eco")
    await bench.runtime.set_mapping("climate.chambre", {"comfort": {"temperature": 19.5}})
    await bench.runtime.set_mapping("climate.chambre", {})
    assert "climate.chambre" not in bench.runtime.thermostats


async def test_a_thermostat_without_weeks_turns_no_change_by_hand_into_an_override(bench: Bench):
    """Values of the presets set before its weeks are saved: nothing is planned for it yet, a
    setpoint changed by hand is its own."""
    await start(bench)
    bench.thermostat("climate.chambre", "eco")
    await bench.runtime.set_mapping("climate.chambre", {"comfort": {"temperature": 19.5}})
    await bench.hass.async_block_till_done()
    await bench.manual_setpoint("climate.chambre", 22)
    assert "climate.chambre" not in bench.overrides()


async def test_a_thermostat_forgotten_during_a_realignment_is_sent_nothing_more(bench: Bench):
    await start(bench)
    send = bench.runtime.call_climate

    async def forget_bureau_first(service, entity_id, data):
        if entity_id == "climate.salon" and "climate.bureau" in bench.runtime.thermostats:
            await bench.runtime.forget("climate.bureau")
        return await send(service, entity_id, data)

    bench.runtime.call_climate = forget_bureau_first
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_only_a_scheduled_thermostat_can_be_forgotten(bench: Bench):
    await start(bench)
    with pytest.raises(model.InvalidData):
        await forget(bench, "climate.cuisine")


async def test_the_card_forgets_a_thermostat(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/thermostat/forget", "entity_id": "climate.salon"})
    assert (await client.receive_json())["success"]
    assert "climate.salon" not in bench.runtime.thermostats

    await client.send_json_auto_id({"type": "chauffage/thermostat/forget", "entity_id": "climate.salon"})
    assert not (await client.receive_json())["success"]

    reader = await ws_client(bench.hass, admin=False)
    await reader.send_json_auto_id({"type": "chauffage/thermostat/forget", "entity_id": "climate.bureau"})
    assert not (await reader.receive_json())["success"]
    assert "climate.bureau" in bench.runtime.thermostats


# ----- revisions per thermostat: several cards editing the weeks -----

def revision(bench: Bench, entity_id: str) -> int:
    return bench.runtime.snapshot()["thermostats"][entity_id]["revision"]


async def test_two_cards_editing_different_thermostats_do_not_get_in_each_other_s_way(bench: Bench):
    await start(bench)
    salon, bureau = revision(bench, "climate.salon"), revision(bench, "climate.bureau")
    await bench.runtime.save_weeks({"climate.salon": {"normal": every_day(("00:00", "comfort"))}}, revisions={"climate.salon": salon})
    await bench.runtime.save_weeks({"climate.bureau": {"normal": every_day(("00:00", "frost"))}}, revisions={"climate.bureau": bureau})
    assert bench.runtime.weeks["climate.salon"]["normal"][0] == [["00:00", "comfort"]]
    assert bench.runtime.weeks["climate.bureau"]["normal"][0] == [["00:00", "frost"]]
    assert revision(bench, "climate.bureau") == bureau + 1


async def test_two_copies_of_the_same_thermostat_cannot_overwrite_each_other(bench: Bench):
    await start(bench)
    salon = revision(bench, "climate.salon")
    await bench.runtime.save_weeks({"climate.salon": {"normal": every_day(("00:00", "comfort"))}}, revisions={"climate.salon": salon})
    with pytest.raises(StaleRevision):
        await bench.runtime.save_weeks({"climate.salon": {"normal": every_day(("00:00", "frost"))}}, revisions={"climate.salon": salon})
    assert bench.runtime.weeks["climate.salon"]["normal"][0] == [["00:00", "comfort"]]


async def test_a_new_schedule_changes_every_thermostat_s_revision(bench: Bench):
    """A copy made before has no week for it: saving it must not drop the new schedule's week."""
    await start(bench)
    salon = revision(bench, "climate.salon")
    await bench.set_schedules([{"id": "normal"}, {"id": "away"}, {"id": "holiday"}, {"name": "Guests"}])
    with pytest.raises(StaleRevision):
        await bench.runtime.save_weeks({"climate.salon": SALON}, revisions={"climate.salon": salon})


async def test_a_thermostat_scheduled_meanwhile_by_another_card_is_not_overwritten(bench: Bench):
    """The copy did not know it (no revision): another card scheduled it in the meantime."""
    await start(bench)
    bench.thermostat("climate.cuisine", "eco")
    await bench.save_weeks({"climate.cuisine": SALON})
    with pytest.raises(StaleRevision):
        await bench.runtime.save_weeks({"climate.cuisine": BUREAU}, revisions={"climate.cuisine": None})


async def test_the_card_saves_with_the_revisions_of_the_thermostats_it_sends(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    salon = revision(bench, "climate.salon")
    await client.send_json_auto_id({"type": "chauffage/weeks/save", "weeks": {"climate.salon": SALON},
                                    "revisions": {"climate.salon": salon}})
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["revisions"] == {"climate.salon": salon + 1}
    await client.send_json_auto_id({"type": "chauffage/weeks/save", "weeks": {"climate.salon": SALON},
                                    "revisions": {"climate.salon": salon}})
    response = await client.receive_json()
    assert not response["success"] and response["error"]["code"] == "stale"
