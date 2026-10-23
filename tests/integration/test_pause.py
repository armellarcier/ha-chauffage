"""A scheduled thermostat paused: kept, not driven (docs/decisions.md, "Scheduled thermostats")."""

import pytest
from homeassistant.exceptions import ServiceValidationError

from conftest import Bench, every_day, KINDS
from custom_components.chauffage import model


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


SCHEDULES = {
    "climate.salon": {"normal": every_day(("00:00", "eco"), ("17:30", "comfort"))},
    "climate.bureau": {"normal": every_day(("00:00", "eco"), ("17:30", "comfort"))},
}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    bench.applied()


async def pause(bench: Bench, entity_id: str, paused: bool = True) -> None:
    await bench.runtime.set_paused(entity_id, paused)
    await bench.hass.async_block_till_done()


async def test_a_paused_thermostat_is_not_driven(bench: Bench):
    await start(bench)
    await pause(bench, "climate.salon")
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.bureau": "comfort"}


async def test_a_thermostat_paused_during_a_realignment_is_sent_nothing_more(bench: Bench):
    """Realigning several thermostats takes a while (a pause between two): one paused meanwhile
    is skipped, and not retried if its command would have failed."""
    await start(bench)
    bench.unreachable.add("climate.bureau")
    send = bench.runtime.call_climate

    async def pause_bureau_first(service, entity_id, data):
        if entity_id == "climate.salon":
            await bench.runtime.set_paused("climate.bureau", True)
        return await send(service, entity_id, data)

    bench.runtime.call_climate = pause_bureau_first
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}
    await bench.advance(1)
    assert bench.applied() == {}


async def test_a_paused_thermostat_keeps_its_weeks_and_its_values(bench: Bench):
    await start(bench)
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"temperature": 19.5}})
    await pause(bench, "climate.salon")
    assert bench.runtime.weeks["climate.salon"] == SCHEDULES["climate.salon"]
    assert bench.runtime.mappings["climate.salon"] == {"comfort": {"temperature": 19.5}}


async def test_a_paused_thermostat_stays_paused_after_a_restart(bench: Bench):
    await start(bench)
    await pause(bench, "climate.salon")
    await bench.advance(1)  # delayed save
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert bench.runtime.is_paused("climate.salon")
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.bureau": "comfort"}


async def test_a_change_by_hand_on_a_paused_thermostat_is_not_an_override(bench: Bench):
    await start(bench)
    await pause(bench, "climate.salon")
    await bench.manual_setpoint("climate.salon", 22)
    assert "climate.salon" not in bench.overrides()


async def test_pausing_drops_the_current_override(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 22)
    assert "climate.salon" in bench.overrides()
    await pause(bench, "climate.salon")
    assert "climate.salon" not in bench.overrides()
    assert bench.applied() == {}  # the thermostat is left as it is


async def test_resuming_realigns_the_thermostat_at_once(bench: Bench):
    await start(bench)
    await pause(bench, "climate.salon")
    await bench.go_to("17:31")  # the comfort slot started at 17:30
    bench.applied()
    await pause(bench, "climate.salon", False)
    assert bench.applied() == {"climate.salon": "comfort"}
    await bench.manual_setpoint("climate.salon", 22)
    assert "climate.salon" in bench.overrides()  # watched again


async def test_no_override_can_be_set_on_a_paused_thermostat(bench: Bench):
    await start(bench)
    await pause(bench, "climate.salon")
    with pytest.raises(model.InvalidData):
        await bench.set_override("climate.salon", bench.runtime.new_override("temperature", 22))
    with pytest.raises(ServiceValidationError) as err:
        await bench.hass.services.async_call(
            "chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 22}, blocking=True
        )
    assert err.value.translation_key == "paused"
    assert bench.overrides() == {}


async def test_the_weeks_of_a_paused_thermostat_can_be_saved_without_resuming_it(bench: Bench):
    await start(bench)
    await pause(bench, "climate.salon")
    weeks = {**SCHEDULES, "climate.salon": {"normal": every_day(("00:00", "comfort"))}}
    await bench.save_weeks(weeks)
    assert bench.runtime.weeks["climate.salon"] == weeks["climate.salon"]
    assert bench.runtime.is_paused("climate.salon")
    assert bench.applied() == {}


async def test_only_a_scheduled_thermostat_can_be_paused(bench: Bench):
    await start(bench)
    with pytest.raises(model.InvalidData):
        await pause(bench, "climate.cuisine")


async def test_the_card_pauses_and_resumes_a_thermostat(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/subscribe"})
    assert (await client.receive_json())["success"]
    assert (await client.receive_json())["event"]["thermostats"]["climate.salon"]["paused"] is False

    await client.send_json_auto_id({"type": "chauffage/thermostat/set", "entity_id": "climate.salon", "paused": True})
    assert (await client.receive_json())["event"]["thermostats"]["climate.salon"]["paused"] is True
    assert (await client.receive_json())["success"]
    assert bench.runtime.is_paused("climate.salon")

    await client.send_json_auto_id({"type": "chauffage/thermostat/set", "entity_id": "climate.cuisine", "paused": True})
    response = await client.receive_json()
    assert not response["success"]
