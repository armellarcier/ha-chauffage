"""The message of `chauffage/subscribe`, on a house with every kind of thermostat, compared with
`golden/subscribe.json`.

The card reads this message. The rewrite must send exactly the same message. To accept a change
of the message on purpose, delete `golden/subscribe.json`, run the test once, and review the
new file in the diff.
"""

import json
from pathlib import Path

import pytest

from conftest import CTX_USER, WEEKDAY, WEEKEND, Bench
from hvac_helpers import COOL, RANGE, REVERSIBLE

GOLDEN = Path(__file__).parent / "golden" / "subscribe.json"


async def a_rich_house(bench: Bench) -> None:
    """A VTherm in an override, a thermostat with standard presets, one without presets, a paused
    one, a reversible air conditioner with a cooling slot, a range and a fan, and a rule."""
    await bench.go_to("10:00")
    bench.versatile_thermostat("climate.salon")
    bench.thermostat("climate.salon", "eco")
    bench.hass.states.async_set("climate.chambre", "heat", {
        "temperature": 17.0, "min_temp": 7, "max_temp": 35, "target_temp_step": 0.5, "hvac_modes": ["off", "heat"],
        "preset_mode": "eco", "preset_modes": ["eco", "comfort", "away", "boost"]})
    bench.hass.states.async_set("climate.cuisine", "heat", {
        "temperature": 17.0, "min_temp": 5, "max_temp": 30, "target_temp_step": 0.1, "hvac_modes": ["off", "heat"]})
    bench.hass.states.async_set("climate.atelier", "cool", {
        "temperature": 27.0, "target_temp_low": 19.0, "target_temp_high": 26.0, "min_temp": 16, "max_temp": 30,
        "target_temp_step": 1, "hvac_modes": REVERSIBLE, "supported_features": RANGE,
        "preset_mode": "eco", "preset_modes": ["eco", "comfort", "boost"],
        "fan_mode": "auto", "fan_modes": ["auto", "low", "high"]})
    bench.hass.states.async_set("climate.bureau", "heat", {
        "temperature": 17.0, "min_temp": 5, "max_temp": 30, "hvac_modes": ["off", "heat"]})
    await bench.setup()
    await bench.save_weeks({
        "climate.salon": {"normal": [WEEKDAY] * 5 + [WEEKEND] * 2, "away": [[["00:00", "frost"]]] * 7},
        "climate.chambre": {"normal": [WEEKDAY] * 7},
        "climate.cuisine": {"normal": [[["00:00", "eco"], ["11:00", "comfort"]]] * 7},
        "climate.atelier": {"normal": [[["00:00", "eco", COOL],
                                        ["08:00", "comfort", {"hvac_mode": "heat_cool", "fan_mode": "low"}],
                                        ["20:00", None, {"hvac_mode": "off"}]]] * 7},
        "climate.bureau": {"normal": [WEEKDAY] * 7},
    })
    await bench.runtime.registry.set_paused("climate.bureau", True)
    await bench.runtime.rules.set([{"template": "{{ is_state('input_boolean.away', 'on') }}", "schedule": "away"}],
                                  "normal")
    bench.thermostat("climate.salon", "none", 21.5, context=CTX_USER)
    await bench.hass.async_block_till_done()


async def test_the_card_receives_the_same_message(bench: Bench, ws_client):
    await a_rich_house(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/subscribe"})
    assert (await client.receive_json())["success"]
    message = (await client.receive_json())["event"]
    message |= {"device_id": "<device id>", "version": "<version>"}
    if not GOLDEN.exists():
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(json.dumps(message, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
        pytest.fail(f"{GOLDEN.name} written: review it, then run the test again")
    assert message == json.loads(GOLDEN.read_text(encoding="utf-8"))
