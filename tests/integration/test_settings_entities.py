"""The settings of overrides as entities, on the Chauffage device (#83): a select *End of
overrides* and a number *Override duration*. They read and write the integration's options, so
the options flow, the panel and the entities always agree."""

import pytest
from homeassistant.const import EntityCategory
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr, entity_registry as er

from conftest import KINDS, WEEKDAY, Bench

SELECT = "select.chauffage_manual_override_end"
NUMBER = "number.chauffage_override_duration"


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


async def start(bench: Bench, options: dict | None = None) -> None:
    await bench.go_to("21:30")
    bench.thermostat("climate.salon", "eco")
    await bench.setup(options)
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 7}})
    bench.applied()


async def call(bench: Bench, domain: str, service: str, data: dict) -> None:
    await bench.hass.services.async_call(domain, service, data, blocking=True)
    await bench.hass.async_block_till_done()


async def test_the_settings_are_configuration_entities_of_the_chauffage_device(bench: Bench):
    await start(bench)
    registry = er.async_get(bench.hass)
    for entity_id in (SELECT, NUMBER):
        entry = registry.async_get(entity_id)
        assert entry.entity_category is EntityCategory.CONFIG
        assert dr.async_get(bench.hass).async_get(entry.device_id).name == "Chauffage"
    assert bench.hass.states.get(SELECT).name == "Chauffage End of overrides"
    assert bench.hass.states.get(NUMBER).name == "Chauffage Override duration"


async def test_the_select_shows_the_three_ends_of_a_change_by_hand_and_the_default(bench: Bench):
    await start(bench)
    state = bench.hass.states.get(SELECT)
    assert state.attributes["options"] == ["duration", "next_slot_within_duration", "next_slot"]
    assert state.state == "duration"


async def test_the_number_shows_the_override_duration_in_minutes_by_steps_of_1(bench: Bench):
    await start(bench, {"override_duration": 90})
    state = bench.hass.states.get(NUMBER)
    assert float(state.state) == 90
    assert (state.attributes["min"], state.attributes["max"], state.attributes["step"]) == (15, 1440, 1)
    assert state.attributes["unit_of_measurement"] == "min"


async def test_choosing_an_end_in_the_select_changes_the_option(bench: Bench):
    """An automation can choose *Until the next slot* during the holidays."""
    await start(bench)
    await call(bench, "select", "select_option", {"entity_id": SELECT, "option": "next_slot"})
    assert bench.entry.options["manual_override_end"] == "next_slot"
    assert bench.hass.states.get(SELECT).state == "next_slot"
    await bench.manual_setpoint("climate.salon", 22)
    assert bench.overrides()["climate.salon"]["ends_at"] == "next_slot"


async def test_setting_the_number_changes_the_override_duration(bench: Bench):
    await start(bench)
    await call(bench, "number", "set_value", {"entity_id": NUMBER, "value": 45})
    assert bench.entry.options["override_duration"] == 45
    assert bench.runtime.override_duration == 45
    assert float(bench.hass.states.get(NUMBER).state) == 45


async def test_the_entities_keep_the_other_options(bench: Bench):
    await start(bench, {"use_presets": False, "show_in_sidebar": False})
    await call(bench, "number", "set_value", {"entity_id": NUMBER, "value": 60})
    await call(bench, "select", "select_option", {"entity_id": SELECT, "option": "next_slot_within_duration"})
    assert bench.entry.options == {"use_presets": False, "show_in_sidebar": False, "override_duration": 60,
                                   "manual_override_end": "next_slot_within_duration"}


async def test_the_entities_follow_the_options_flow(bench: Bench):
    await start(bench)
    options = bench.hass.config_entries.options
    flow = await options.async_init(bench.entry.entry_id)
    await options.async_configure(flow["flow_id"], {"override_duration": 30, "manual_override_end": "next_slot"})
    await bench.hass.async_block_till_done()
    assert bench.hass.states.get(SELECT).state == "next_slot"
    assert float(bench.hass.states.get(NUMBER).state) == 30


async def test_the_cards_get_the_settings_changed_by_the_entities(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json({"id": 1, "type": "chauffage/subscribe"})
    assert (await client.receive_json())["success"]
    first = await client.receive_json()
    assert first["event"]["manual_override_end"] == "duration"
    await call(bench, "select", "select_option", {"entity_id": SELECT, "option": "next_slot"})
    event = await client.receive_json()
    assert event["event"]["manual_override_end"] == "next_slot"


# ----- the panel: chauffage/settings/set -----

async def test_the_panel_changes_the_settings(bench: Bench, ws_client):
    await start(bench, {"use_presets": False})
    client = await ws_client(bench.hass)
    await client.send_json({"id": 1, "type": "chauffage/settings/set", "manual_override_end": "next_slot_within_duration",
                            "override_duration": 180})
    assert (await client.receive_json())["success"]
    await bench.hass.async_block_till_done()
    assert bench.entry.options == {"use_presets": False, "manual_override_end": "next_slot_within_duration",
                                   "override_duration": 180}
    assert bench.hass.states.get(SELECT).state == "next_slot_within_duration"
    assert float(bench.hass.states.get(NUMBER).state) == 180


async def test_the_panel_changes_one_setting_at_a_time(bench: Bench, ws_client):
    await start(bench, {"override_duration": 60})
    client = await ws_client(bench.hass)
    await client.send_json({"id": 1, "type": "chauffage/settings/set", "manual_override_end": "next_slot"})
    assert (await client.receive_json())["success"]
    assert bench.entry.options == {"override_duration": 60, "manual_override_end": "next_slot"}


@pytest.mark.parametrize("settings", [{"manual_override_end": "whenever"}, {"override_duration": 10},
                                      {"override_duration": 1455}])
async def test_the_panel_cannot_set_an_unknown_end_or_a_duration_out_of_range(bench: Bench, ws_client, settings):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json({"id": 1, "type": "chauffage/settings/set", **settings})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "invalid_format"
    assert bench.entry.options == {}


async def test_only_an_admin_changes_the_settings(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass, user="household")
    await client.send_json({"id": 1, "type": "chauffage/settings/set", "manual_override_end": "next_slot"})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "unauthorized"
    assert bench.entry.options == {}


@pytest.mark.parametrize("value", [50.5])
async def test_the_number_refuses_a_duration_that_is_not_whole_minutes_with_a_clear_error(bench: Bench, value):
    """Home Assistant checks the minimum and the maximum: Chauffage explains the rest."""
    await start(bench, {"override_duration": 90})
    with pytest.raises(ServiceValidationError) as err:
        await call(bench, "number", "set_value", {"entity_id": NUMBER, "value": value})
    assert err.value.translation_key == "invalid_override_duration"
    assert bench.entry.options == {"override_duration": 90}


async def test_any_whole_number_of_minutes_is_a_duration_the_15_minutes_are_the_arrows_step(bench: Bench, ws_client):
    """50 minutes from the number entity, 2 h 40 from the panel."""
    await start(bench)
    await call(bench, "number", "set_value", {"entity_id": NUMBER, "value": 50})
    assert bench.entry.options["override_duration"] == 50
    client = await ws_client(bench.hass)
    await client.send_json({"id": 1, "type": "chauffage/settings/set", "override_duration": 160})
    assert (await client.receive_json())["success"]
    assert bench.runtime.override_duration == 160


@pytest.mark.parametrize("value", [10, 1500])
async def test_the_number_refuses_a_duration_out_of_range(bench: Bench, value):
    await start(bench, {"override_duration": 90})
    with pytest.raises(ServiceValidationError):
        await call(bench, "number", "set_value", {"entity_id": NUMBER, "value": value})
    assert bench.entry.options == {"override_duration": 90}
