"""The card asks the integration what a preset is worth on a thermostat while the user edits it
(chauffage/preset/preview): the integration alone computes it (docs/rewrite-plan.md, section 6,
item 6)."""

from conftest import WEEKDAY, Bench

AC_MODES = ["off", "heat", "cool"]


async def start(bench: Bench, **attributes) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", **attributes)
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": [WEEKDAY] * 7}})


async def preview(bench: Bench, ws_client, **msg) -> dict:
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/preset/preview", "entity_id": "climate.salon", **msg})
    return await client.receive_json()


async def test_the_preview_of_a_saved_preset_is_what_the_card_receives(bench: Bench, ws_client):
    await start(bench, hvac_modes=AC_MODES)
    comfort = next(p for p in bench.presets() if p["id"] == "comfort")
    answer = await preview(bench, ws_client, preset=comfort)
    assert answer["success"]
    assert answer["result"]["value"] == bench.snapshot()["targets"]["climate.salon"]["comfort"]


async def test_the_preview_gives_the_hvac_modes_a_preset_can_be_used_in(bench: Bench, ws_client):
    """Frost protection has no temperature when cooling: never in cool."""
    await start(bench, hvac_modes=AC_MODES)
    frost = next(p for p in bench.presets() if p["id"] == "frost")
    comfort = next(p for p in bench.presets() if p["id"] == "comfort")
    assert (await preview(bench, ws_client, preset=frost))["result"]["modes"] == ["heat"]
    assert (await preview(bench, ws_client, preset=comfort))["result"]["modes"] == ["heat", "cool"]


async def test_the_preview_takes_a_preset_and_a_value_the_user_has_not_saved(bench: Bench, ws_client):
    await start(bench, hvac_modes=AC_MODES)
    edited = {"id": "comfort", "name": "Confort", "color": "#f57c00", "temperature": 19.0, "cool_temperature": 26.0}
    answer = await preview(bench, ws_client, preset=edited, value={"temperature": 21.3, "cool_temperature": 24.0})
    assert answer["result"]["value"] == {"temperature": 21.5, "cool_temperature": 24.0}  # fitted to the step


async def test_the_preview_refuses_an_invalid_value(bench: Bench, ws_client):
    await start(bench)
    comfort = next(p for p in bench.presets() if p["id"] == "comfort")
    answer = await preview(bench, ws_client, preset=comfort, value={"preset_mode": "eco", "temperature": 20.0})
    assert not answer["success"]
    assert answer["error"]["code"] == "invalid_format"
