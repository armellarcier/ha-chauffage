"""Options: override duration, heating levels, what each level means per thermostat."""

from conftest import WEEKDAY, Bench, every_day

SCHEDULES = {"climate.salon": {"normal": [WEEKDAY] * 7}}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.setup()
    await bench.save_schedules(SCHEDULES)
    bench.applied()


async def menu(bench: Bench, choice: str) -> dict:
    options = bench.hass.config_entries.options
    flow = await options.async_init(bench.entry.entry_id)
    assert flow["type"] == "menu"
    return await options.async_configure(flow["flow_id"], {"next_step_id": choice})


async def answer(bench: Bench, result: dict, data: dict) -> dict:
    result = await bench.hass.config_entries.options.async_configure(result["flow_id"], data)
    await bench.hass.async_block_till_done()
    return result


async def test_the_override_duration(bench: Bench):
    await start(bench)
    result = await answer(bench, await menu(bench, "general"), {"override_duration": 30})
    assert result["type"] == "create_entry"
    assert bench.runtime.override_duration == 30


async def test_editing_a_level(bench: Bench):
    await start(bench)
    result = await answer(bench, await menu(bench, "levels"), {"level": "eco"})
    assert result["step_id"] == "level"
    result = await answer(bench, result, {"name": "Économique", "color": [0, 128, 0], "temperature": 16.5})
    assert result["type"] == "create_entry"
    eco = bench.runtime.data["levels"][1]
    assert eco == {"id": "eco", "name": "Économique", "color": "#008000", "temperature": 16.5}


async def test_adding_a_level(bench: Bench):
    await start(bench)
    result = await answer(bench, await menu(bench, "levels"), {"level": "__add__"})
    await answer(bench, result, {"name": "Nuit", "color": [63, 81, 181], "temperature": 18})
    assert bench.runtime.data["levels"][-1] == {"id": "nuit", "name": "Nuit", "color": "#3f51b5", "temperature": 18.0}


async def test_deleting_an_unused_level(bench: Bench):
    await start(bench)
    result = await answer(bench, await menu(bench, "levels"), {"level": "frost"})
    result = await answer(bench, result, {"name": "Hors-gel", "color": [41, 182, 246], "temperature": 7, "delete": True})
    assert result["type"] == "create_entry"
    assert "frost" not in [lv["id"] for lv in bench.runtime.data["levels"]]


async def test_deleting_a_level_used_in_schedules_asks_for_a_replacement(bench: Bench):
    await start(bench)
    result = await answer(bench, await menu(bench, "levels"), {"level": "comfort"})
    result = await answer(bench, result, {"name": "Comfort", "color": [245, 124, 0], "temperature": 20, "delete": True})
    assert result["step_id"] == "replace"
    result = await answer(bench, result, {"replacement": "boost"})
    assert result["type"] == "create_entry"
    assert bench.runtime.data["schedules"]["climate.salon"]["normal"][0][1] == ["06:30", "boost"]


async def test_a_thermostat_s_levels(bench: Bench):
    await start(bench)
    result = await answer(bench, await menu(bench, "thermostats"), {"thermostat": "climate.salon"})
    assert result["step_id"] == "mapping"
    assert result["description_placeholders"] == {"thermostat": "Salon"}
    fields = {str(key): key for key in result["data_schema"].schema}
    assert "Comfort" in fields and "Comfort (°C)" in fields
    data = {"Comfort": "temperature", "Comfort (°C)": 19.5, "Eco": "preset:boost",
            "Boost": "auto", "Frost protection": "auto"}
    result = await answer(bench, result, data)
    assert result["type"] == "create_entry"
    assert bench.runtime.data["mappings"]["climate.salon"] == {"comfort": {"temperature": 19.5}, "eco": {"preset": "boost"}}
    assert bench.applied() == {"climate.salon": "boost"}  # eco now means its boost preset


async def test_no_thermostats_yet(bench: Bench):
    await bench.setup()
    result = await menu(bench, "thermostats")
    assert result["type"] == "abort" and result["reason"] == "no_thermostats"
