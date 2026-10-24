"""Websocket API (used by the card) and services (used by automations)."""

from datetime import timedelta

import pytest
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util

from conftest import WEEKDAY, Bench, every_day

SCHEDULES = {"climate.salon": {"normal": [WEEKDAY] * 7}}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    bench.applied()


# ----- websocket -----

async def test_subscribe_sends_everything_then_every_change(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/subscribe"})
    assert (await client.receive_json())["success"]
    first = (await client.receive_json())["event"]
    assert [m["id"] for m in first["schedules"]] == ["normal", "away", "holiday"]
    assert first["weeks"]["climate.salon"]["normal"] == SCHEDULES["climate.salon"]["normal"]
    assert (first["active_schedule"], first["revision"], first["override_duration"]) == ("normal", 1, 120)

    await bench.activate_schedule("Away")
    assert (await client.receive_json())["event"]["active_schedule"] == "away"


async def test_saving_schedules_with_the_current_revision(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    week = [[["00:00", "comfort"]]] * 7
    await client.send_json_auto_id({"type": "chauffage/weeks/save", "weeks": {"climate.salon": {"normal": week}}, "revision": 1})
    reply = await client.receive_json()
    assert reply["success"] and reply["result"]["revision"] == 2
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_saving_from_an_outdated_copy_is_refused(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/weeks/save", "weeks": {}, "revision": 0})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "stale"
    assert bench.runtime.weeks["climate.salon"]["normal"] == SCHEDULES["climate.salon"]["normal"]


async def test_invalid_schedules_are_refused(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/weeks/save", "weeks": {"climate.salon": {"unknown": []}}})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "invalid_format"


async def test_overrides_and_active_schedule_from_the_card(bench: Bench, ws_client):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    client = await ws_client(bench.hass)
    o = bench.overrides()["climate.salon"]
    end = (dt_util.parse_datetime(o["end"]) + timedelta(minutes=30)).isoformat()
    await client.send_json_auto_id({"type": "chauffage/override/set", "entity_id": "climate.salon", "override": {**o, "end": end}})
    assert (await client.receive_json())["success"]
    assert bench.overrides()["climate.salon"]["end"] == end

    await client.send_json_auto_id({"type": "chauffage/override/set", "entity_id": "climate.salon", "override": None})
    assert (await client.receive_json())["success"]
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.applied() == {"climate.salon": "eco"}


async def test_an_override_created_from_the_card(bench: Bench, ws_client):
    """The card sends UTC times (JavaScript's toISOString)."""
    await start(bench)  # 10:00, eco
    client = await ws_client(bench.hass)
    override = {"kind": "temperature", "value": 22, "start": "2026-10-12T08:00:00.000Z", "end": "2026-10-12T10:00:00.000Z"}
    await client.send_json_auto_id({"type": "chauffage/override/set", "entity_id": "climate.salon", "override": override})
    assert (await client.receive_json())["success"]
    assert bench.temperature_calls == [("climate.salon", 22.0)]
    await bench.go_to("11:59")
    assert "climate.salon" in bench.overrides()
    await bench.go_to("12:00")  # 10:00 UTC
    assert bench.overrides() == {}
    assert bench.applied() == {"climate.salon": "eco"}


async def test_an_override_s_new_value_on_a_thermostat_that_does_not_answer(bench: Bench, ws_client):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    client = await ws_client(bench.hass)
    o = bench.overrides()["climate.salon"]
    bench.unreachable.add("climate.salon")
    await client.send_json_auto_id({"type": "chauffage/override/set", "entity_id": "climate.salon", "override": {**o, "value": 22}})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "thermostat_failed"
    assert bench.overrides()["climate.salon"] == o

    await client.send_json_auto_id({"type": "chauffage/schedule/activate", "schedule": "away"})
    assert (await client.receive_json())["success"]
    assert bench.runtime.data["active_schedule"] == "away"


async def test_writes_need_an_admin(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass, admin=False)
    await client.send_json_auto_id({"type": "chauffage/weeks/save", "weeks": {}})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "unauthorized"


# ----- services -----

async def test_set_override_drives_the_thermostat_and_records_the_override(bench: Bench):
    await start(bench)
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 22, "duration": 60}, blocking=True
    )
    assert bench.temperature_calls == [("climate.salon", 22.0)]
    o = bench.overrides()["climate.salon"]
    assert (o["kind"], o["value"]) == ("temperature", 22.0)
    assert dt_util.parse_datetime(o["end"]) - dt_util.parse_datetime(o["start"]) == timedelta(hours=1)
    # The thermostat's answer (same context) is not a second, manual override
    await bench.go_to("11:00")
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_set_override_does_not_send_what_the_thermostat_already_has(bench: Bench):
    await start(bench)  # on eco
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "preset": "eco", "duration": 60}, blocking=True
    )
    assert bench.applied() == {}
    assert bench.overrides()["climate.salon"]["value"] == "eco"


async def test_set_override_again_sets_a_thermostat_that_drifted(bench: Bench):
    """An automation can set the same override again: the thermostat gets it back if it lost it
    (restarted on its own preset, a command lost)."""
    await start(bench)

    async def set_22():
        await bench.hass.services.async_call(
            "chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 22}, blocking=True
        )

    await set_22()
    bench.thermostat("climate.salon", "eco")  # the thermostat, by itself
    await bench.hass.async_block_till_done()
    await set_22()
    assert bench.temperature_calls == [("climate.salon", 22.0)] * 2


async def test_set_override_with_a_preset_and_clear_override(bench: Bench):
    await start(bench)
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True
    )
    assert bench.applied() == {"climate.salon": "boost"}
    assert bench.overrides()["climate.salon"]["value"] == "boost"
    bench.thermostat("climate.salon", "boost")  # the thermostat applied it
    await bench.hass.services.async_call("chauffage", "clear_override", {"entity_id": "climate.salon"}, blocking=True)
    assert bench.overrides() == {}
    assert bench.applied() == {"climate.salon": "eco"}


async def test_services_refuse_thermostats_without_a_schedule(bench: Bench):
    await start(bench)
    with pytest.raises(ServiceValidationError):
        await bench.hass.services.async_call(
            "chauffage", "set_override", {"entity_id": "climate.cuisine", "preset": "boost"}, blocking=True
        )



async def test_a_subscription_goes_on_after_the_integration_is_reloaded(bench: Bench, ws_client):
    """Options changed, a thermostat renamed: the integration is reloaded under the open cards."""
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/subscribe"})
    assert (await client.receive_json())["success"]
    await client.receive_json()
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert (await client.receive_json())["event"]["active_schedule"] == "normal"  # sent again
    await bench.activate_schedule("Away")
    assert (await client.receive_json())["event"]["active_schedule"] == "away"
