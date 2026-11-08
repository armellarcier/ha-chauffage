"""Schedule layers: a schedule's layers apply on top of its weeks, while they are enabled and their
condition is true. Where a layer has no slot (a gap), the schedule shows through."""

import pytest

from conftest import KINDS, WEEKDAY, Bench
from custom_components.chauffage.model import InvalidData


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": [[["00:00", "frost"]]] * 7,
                           "holiday": [[["00:00", "eco"]]] * 7}}
PRESENCE = "binary_sensor.salon_presence"
OCCUPIED = {"name": "Living room occupied", "condition": "{{ is_state('binary_sensor.salon_presence', 'on') }}"}
# Comfort from 09:00 to 17:00; outside it, the schedule
OCCUPIED_WEEK = [[["00:00", None], ["09:00", "comfort"], ["17:00", None]]] * 7


async def start(bench: Bench, presence: str = "off") -> None:
    await bench.go_to("10:00")
    bench.hass.states.async_set(PRESENCE, presence)
    bench.thermostat("climate.salon", "eco")
    await bench.setup()
    await bench.save_weeks(WEEKS)
    bench.applied()


async def set_layers(bench: Bench, layers: list, schedule: str = "normal") -> list:
    """What the card sends when the user saves a schedule's layers."""
    result = await bench.runtime.set_layers(schedule, layers)
    await bench.hass.async_block_till_done()
    return result


async def occupied_layer(bench: Bench, **layer) -> str:
    """The living-room layer, with its week, as the card saves them; its id."""
    [saved] = await set_layers(bench, [{**OCCUPIED, **layer}])
    await bench.runtime.save_weeks({}, layer_weeks={"climate.salon": {saved["id"]: OCCUPIED_WEEK}})
    await bench.hass.async_block_till_done()
    return saved["id"]


async def presence(bench: Bench, state: str) -> None:
    bench.hass.states.async_set(PRESENCE, state)
    await bench.hass.async_block_till_done()


async def test_a_layer_applies_its_slots_while_its_condition_is_true(bench: Bench):
    await start(bench)
    await occupied_layer(bench)
    assert bench.applied() == {}  # nobody in the room: the schedule's eco
    await presence(bench, "on")
    assert bench.applied() == {"climate.salon": "comfort"}
    await presence(bench, "off")
    assert bench.applied() == {"climate.salon": "eco"}


async def test_the_gaps_of_a_layer_let_the_schedule_through(bench: Bench):
    """At 17:00 the layer's gap starts: the schedule's eco until its comfort at 17:30."""
    await start(bench, "on")
    await occupied_layer(bench)
    assert bench.applied() == {"climate.salon": "comfort"}
    await bench.go_to("17:00")
    assert bench.applied() == {"climate.salon": "eco"}
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_a_layer_without_a_condition_applies_while_it_is_enabled(bench: Bench):
    await start(bench)
    layer_id = await occupied_layer(bench, condition=None)
    assert bench.applied() == {"climate.salon": "comfort"}
    await set_layers(bench, [{"id": layer_id, **OCCUPIED, "condition": None, "enabled": False}])
    assert bench.applied() == {"climate.salon": "eco"}


async def test_a_disabled_layer_does_not_apply_even_when_its_condition_is_true(bench: Bench):
    await start(bench, "on")
    await occupied_layer(bench, enabled=False)
    await presence(bench, "off")
    await presence(bench, "on")
    assert bench.applied() == {}


async def test_only_the_layers_of_the_active_schedule_apply(bench: Bench):
    await start(bench, "on")
    await occupied_layer(bench)
    bench.applied()
    await bench.activate_schedule("Away")
    assert bench.applied() == {"climate.salon": "frost"}
    await presence(bench, "off")
    await presence(bench, "on")
    assert bench.applied() == {}
    await bench.activate_schedule("Normal")
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_an_override_stays_when_a_layer_starts_applying(bench: Bench):
    await start(bench)
    await occupied_layer(bench)
    await bench.manual_setpoint("climate.salon", 19.0)
    assert "climate.salon" in bench.overrides()
    bench.applied()
    await presence(bench, "on")
    assert bench.applied() == {}
    assert "climate.salon" in bench.overrides()


async def test_the_layers_apply_again_after_a_restart(bench: Bench):
    await start(bench, "on")
    await occupied_layer(bench)
    await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    bench.runtime.pause = 0
    assert bench.runtime.layers_applying == ("living_room_occupied",)
    await presence(bench, "off")
    assert bench.applied() == {"climate.salon": "eco"}


async def test_removing_a_layer_drops_its_weeks(bench: Bench):
    await start(bench, "on")
    await occupied_layer(bench)
    await set_layers(bench, [])
    assert bench.runtime.thermostats["climate.salon"]["layer_weeks"] == {}
    assert bench.applied() == {"climate.salon": "eco"}


async def test_deleting_a_schedule_drops_the_weeks_of_its_layers(bench: Bench):
    await start(bench)
    [saved] = await set_layers(bench, [OCCUPIED], schedule="holiday")
    await bench.runtime.save_weeks({}, layer_weeks={"climate.salon": {saved["id"]: OCCUPIED_WEEK}})
    await bench.set_schedules([{"id": "normal"}, {"id": "away"}])
    assert bench.runtime.thermostats["climate.salon"]["layer_weeks"] == {}


async def test_a_new_layer_never_takes_the_id_of_another_schedule_s_layer(bench: Bench):
    await start(bench)
    [first] = await set_layers(bench, [OCCUPIED])
    [second] = await set_layers(bench, [OCCUPIED], schedule="holiday")
    assert first["id"] != second["id"]


async def test_invalid_layers_are_refused(bench: Bench):
    await start(bench)
    with pytest.raises(InvalidData):
        await set_layers(bench, [{"name": "Broken", "condition": "{{ is_state( }}"}])
    with pytest.raises(InvalidData):
        await set_layers(bench, [OCCUPIED], schedule="unknown")
    with pytest.raises(InvalidData):
        await bench.runtime.save_weeks({}, layer_weeks={"climate.salon": {"unknown": OCCUPIED_WEEK}})


async def test_the_card_gets_the_layers_their_weeks_and_which_apply(bench: Bench):
    await start(bench, "on")
    layer_id = await occupied_layer(bench)
    snapshot = bench.runtime.snapshot()
    assert snapshot["schedules"][0]["layers"] == [{"id": layer_id, **OCCUPIED, "enabled": True}]
    assert snapshot["layer_weeks"] == {"climate.salon": {layer_id: OCCUPIED_WEEK}}
    assert snapshot["layers_applying"] == [layer_id]


async def test_the_card_sets_a_schedule_s_layers_and_saves_their_weeks(bench: Bench, ws_client):
    await start(bench, "on")
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/layers/set", "schedule": "normal", "layers": [OCCUPIED]})
    reply = await client.receive_json()
    assert reply["success"]
    [layer] = reply["result"]["layers"]
    await client.send_json_auto_id({"type": "chauffage/weeks/save", "weeks": {},
                                    "layer_weeks": {"climate.salon": {layer["id"]: OCCUPIED_WEEK}}})
    reply = await client.receive_json()
    assert reply["success"] and "climate.salon" in reply["result"]["revisions"]
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_only_admins_set_the_layers(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass, user="read_only")
    await client.send_json_auto_id({"type": "chauffage/layers/set", "schedule": "normal", "layers": [OCCUPIED]})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "unauthorized"


async def test_the_planned_preset_follows_the_layers_that_apply(bench: Bench):
    """10:00, the schedule's eco until 17:30. The layer gives comfort until 17:00, then its gap."""
    await start(bench)
    await occupied_layer(bench)
    assert bench.runtime.planned("climate.salon")[:2] == ("eco", "comfort")
    await presence(bench, "on")
    current, next_preset, next_start = bench.runtime.planned("climate.salon")
    assert (current, next_preset, next_start.strftime("%H:%M")) == ("comfort", "eco", "17:00")
    await presence(bench, "off")
    assert bench.runtime.planned("climate.salon")[2].strftime("%H:%M") == "17:30"


async def test_the_planned_preset_sensor_changes_with_the_layers(bench: Bench):
    await start(bench)
    await occupied_layer(bench)
    assert bench.hass.states.get("sensor.salon_planned_preset").state == "eco"
    await presence(bench, "on")
    assert bench.hass.states.get("sensor.salon_planned_preset").state == "comfort"


async def test_the_card_is_told_what_is_planned_with_the_layers(bench: Bench):
    await start(bench, "on")
    await occupied_layer(bench)
    assert bench.runtime.snapshot()["planned"]["climate.salon"]["preset"] == "comfort"


async def test_a_paused_thermostat_still_says_what_is_planned_with_the_layers(bench: Bench):
    await start(bench, "on")
    await occupied_layer(bench)
    await bench.runtime.set_paused("climate.salon", True)
    assert bench.runtime.planned("climate.salon")[0] == "comfort"
