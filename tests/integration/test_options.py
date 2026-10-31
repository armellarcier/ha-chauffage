"""Options (default settings), and what the card sets: presets, per-thermostat mappings."""

import pytest

from conftest import WEEKDAY, Bench, every_day

SCHEDULES = {"climate.salon": {"normal": [WEEKDAY] * 7}}


async def start(bench: Bench, options: dict | None = None) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.setup(options)
    await bench.save_weeks(SCHEDULES)
    bench.applied()


# ----- options: a single form -----

async def test_the_options_form(bench: Bench):
    await start(bench)
    options = bench.hass.config_entries.options
    flow = await options.async_init(bench.entry.entry_id)
    assert flow["type"] == "form"
    assert {str(key) for key in flow["data_schema"].schema} == {
        "override_duration", "use_presets", "allow_auto_start_stop_off",
    }
    result = await options.async_configure(flow["flow_id"], {
        "override_duration": 30,
        "use_presets": True,
        "allow_auto_start_stop_off": True,
    })
    assert result["type"] == "create_entry"
    await bench.hass.async_block_till_done()
    assert bench.runtime.override_duration == 30
    assert bench.runtime.allow_auto_start_stop_off is True


async def test_auto_start_stop_off_option_is_disabled_by_default(bench: Bench):
    await start(bench)
    assert bench.runtime.allow_auto_start_stop_off is False


async def test_without_presets_every_thermostat_is_driven_by_temperature(bench: Bench):
    """VTherm included: it receives the presets' temperatures (and switches to preset "none")."""
    await start(bench, {"use_presets": False})
    await bench.go_to("17:30")
    assert bench.temperature_calls[-1] == ("climate.salon", 20.0)
    assert bench.runtime.targets_of("climate.salon")["comfort"] == {"temperature": 20.0}


# ----- preset temperatures: published by Versatile Thermostat, else learned -----

async def test_the_temperature_of_each_preset_is_learned_while_it_is_active(bench: Bench):
    await start(bench)
    assert bench.runtime.learned_temperatures["climate.salon"] == {"eco": 17.0}
    bench.thermostat("climate.salon", "comfort", 20.5)
    await bench.hass.async_block_till_done()
    assert bench.runtime.learned_temperatures["climate.salon"] == {"eco": 17.0, "comfort": 20.5}
    # A manual setpoint (preset "none") is not a preset's temperature
    await bench.manual_setpoint("climate.salon", 23)
    assert bench.runtime.learned_temperatures["climate.salon"]["comfort"] == 20.5


async def test_learned_temperatures_are_given_to_the_card(bench: Bench):
    await start(bench)
    assert bench.runtime.snapshot()["preset_temperatures"] == {"climate.salon": {"eco": 17.0}}


async def test_the_card_gets_the_temperatures_versatile_thermostat_publishes(bench: Bench):
    """The ones a manual setpoint is compared with: VTherm 10+ publishes them in
    preset_temperatures, older versions in eco_temp… attributes; they win over learned ones."""
    await start(bench)
    bench.thermostat("climate.salon", "eco", preset_temperatures={"eco_temp": 16.5, "comfort_temp": 19.0})
    await bench.hass.async_block_till_done()
    assert bench.runtime.snapshot()["preset_temperatures"]["climate.salon"] == {"eco": 16.5, "comfort": 19.0}
    bench.thermostat("climate.salon", "comfort", boost_temp=22.0)
    await bench.hass.async_block_till_done()
    assert bench.runtime.snapshot()["preset_temperatures"]["climate.salon"] == {"eco": 17.0, "comfort": 20.0, "boost": 22.0}


async def test_a_preset_temperature_changed_on_the_thermostat_reaches_the_card(bench: Bench):
    await start(bench)
    bench.thermostat("climate.salon", "eco", preset_temperatures={"eco_temp": 17.0, "comfort_temp": 19.0})
    await bench.hass.async_block_till_done()
    sent = []
    bench.runtime.async_add_listener(sent.append)
    bench.thermostat("climate.salon", "eco", preset_temperatures={"eco_temp": 17.0, "comfort_temp": 19.5})
    await bench.hass.async_block_till_done()
    assert sent
    assert bench.runtime.snapshot()["preset_temperatures"]["climate.salon"]["comfort"] == 19.5


async def test_a_paused_thermostat_still_sends_its_preset_temperatures_to_the_card(bench: Bench):
    await start(bench)
    await bench.runtime.set_paused("climate.salon", True)
    sent = []
    bench.runtime.async_add_listener(sent.append)
    bench.thermostat("climate.salon", "eco", preset_temperatures={"eco_temp": 17.0, "comfort_temp": 19.5})
    await bench.hass.async_block_till_done()
    assert sent
    assert bench.runtime.snapshot()["preset_temperatures"]["climate.salon"]["comfort"] == 19.5


async def test_the_card_gets_the_preset_temperatures_of_a_thermostat_not_scheduled_yet(bench: Bench):
    await start(bench)
    bench.thermostat("climate.cuisine", "eco", preset_temperatures={"eco_temp": 16.0, "comfort_temp": 19.0})
    assert bench.runtime.snapshot()["preset_temperatures"]["climate.cuisine"] == {"eco": 16.0, "comfort": 19.0}


# ----- set from the card (websocket) -----

async def test_the_card_sets_what_a_preset_means_for_a_thermostat(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/mapping/set", "entity_id": "climate.salon",
                                    "mapping": {"eco": {"temperature": 16.5}}})
    assert (await client.receive_json())["success"]
    await bench.hass.async_block_till_done()
    assert bench.temperature_calls[-1] == ("climate.salon", 16.5)
    await client.send_json_auto_id({"type": "chauffage/mapping/set", "entity_id": "climate.salon",
                                    "mapping": {"eco": {"preset": "unknown_climate_preset_is_fine"}, "sleep": {"temperature": 1}}})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "invalid_format"


async def test_the_card_edits_the_presets(bench: Bench, ws_client):
    await start(bench)
    presets = [dict(p) for p in bench.runtime.data["presets"] if p["id"] != "comfort"]
    presets.append({"name": "Nuit", "color": "#3f51b5", "temperature": 18})
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/presets/set", "presets": presets})
    reply = await client.receive_json()
    assert not reply["success"] and "replacement" in reply["error"]["message"]  # comfort is used
    await client.send_json_auto_id({"type": "chauffage/presets/set", "presets": presets, "replacements": {"comfort": "nuit"}})
    assert (await client.receive_json())["success"]
    assert [lv["id"] for lv in bench.runtime.data["presets"]] == ["eco", "boost", "frost", "nuit"]
    assert bench.runtime.weeks["climate.salon"]["normal"][0][1] == ["06:30", "nuit"]


@pytest.mark.parametrize("command", [
    {"type": "chauffage/presets/set", "presets": []},
    {"type": "chauffage/mapping/set", "entity_id": "climate.salon", "mapping": {}},
])
async def test_preset_and_mapping_changes_need_an_admin(bench: Bench, ws_client, command):
    await start(bench)
    client = await ws_client(bench.hass, admin=False)
    await client.send_json_auto_id(command)
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "unauthorized"


async def test_what_was_learned_on_a_forgotten_thermostat_is_dropped(bench: Bench):
    await bench.go_to("10:00")
    bench.thermostat("climate.cuisine", "eco")
    await bench.setup()
    await bench.save_weeks({"climate.cuisine": {"normal": every_day(("00:00", "eco"))}})
    assert bench.runtime.learned_temperatures == {"climate.cuisine": {"eco": 17.0}}
    await bench.runtime.forget("climate.cuisine")
    bench.thermostat("climate.cuisine", "comfort")
    await bench.hass.async_block_till_done()
    assert bench.runtime.learned_temperatures == {}
