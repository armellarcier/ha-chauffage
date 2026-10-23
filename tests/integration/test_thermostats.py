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
    assert bench.runtime.weeks["climate.salon"] == SALON
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}
    await bench.manual_setpoint("climate.salon", 22)
    assert "climate.salon" in bench.overrides()


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


async def test_a_thermostat_without_weeks_turns_no_change_by_hand_into_an_override(bench: Bench):
    """Values of the presets set before its weeks are saved schedule a thermostat, but nothing
    is planned for it yet: a setpoint changed by hand is its own."""
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
