"""Heating levels and per-thermostat mappings (phase 2)."""

import json
from pathlib import Path

import pytest

from conftest import WEEKDAY, Bench, every_day
from custom_components.chauffage import model

FIXTURES = Path(__file__).parents[1] / "fixtures"
SCHEDULES = {
    "climate.salon": {"normal": [WEEKDAY] * 7},
    "climate.bureau": {"normal": every_day(("00:00", "eco"), ("09:00", "comfort"), ("18:00", "eco"))},
}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "comfort")
    await bench.setup()
    await bench.save_schedules(SCHEDULES)
    bench.applied()


def levels(bench: Bench) -> list[dict]:
    return [dict(level) for level in bench.runtime.data["levels"]]


async def test_a_new_installation_has_the_four_default_levels(bench: Bench):
    await bench.setup()
    assert [(lv["id"], lv["temperature"]) for lv in bench.runtime.data["levels"]] == [
        ("comfort", 20.0), ("eco", 17.0), ("boost", 21.0), ("frost", 7.0)]


async def test_storage_from_v0_2_is_migrated_without_changing_anything(bench: Bench, hass_storage):
    """Slots named after VTherm presets now name levels with the same ids."""
    hass_storage["chauffage"] = json.loads((FIXTURES / "store-v1.json").read_text(encoding="utf-8"))
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    await bench.setup()
    data = bench.runtime.data
    assert [lv["id"] for lv in data["levels"]] == ["comfort", "eco", "boost", "frost"]
    assert data["mappings"] == {}
    assert data["schedules"]["climate.salon"]["normal"][0] == WEEKDAY
    assert bench.runtime.targets_of("climate.salon")["comfort"] == {"preset": "comfort"}


async def test_a_mapping_set_by_hand_is_applied(bench: Bench):
    await start(bench)
    await bench.runtime.set_mapping("climate.bureau", {"comfort": {"temperature": 19.5}})
    await bench.hass.async_block_till_done()
    assert bench.temperature_calls[-1] == ("climate.bureau", 19.5)
    assert bench.runtime.targets_of("climate.bureau")["comfort"] == {"temperature": 19.5}
    # Back to the defaults
    bench.applied()
    await bench.runtime.set_mapping("climate.bureau", {})
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.bureau": "comfort"}
    assert "climate.bureau" not in bench.runtime.data["mappings"]


async def test_the_level_s_default_temperature_follows_its_changes(bench: Bench):
    """A thermostat mapped to temperatures by default follows the level's default temperature."""
    bench.kind = "plain"
    await start(bench)
    new = levels(bench)
    new[0]["temperature"] = 21.5  # comfort
    await bench.runtime.set_levels(new)
    await bench.hass.async_block_till_done()
    assert bench.temperature_calls[-1] == ("climate.bureau", 21.5)


async def test_renaming_and_adding_levels(bench: Bench):
    await start(bench)
    new = levels(bench)
    new[1]["name"] = "Économique"
    new.append({"name": "Nuit", "color": "#3f51b5", "temperature": 18})
    await bench.runtime.set_levels(new)
    assert [lv["id"] for lv in bench.runtime.data["levels"]] == ["comfort", "eco", "boost", "frost", "nuit"]
    assert bench.runtime.data["levels"][1]["name"] == "Économique"


async def test_removing_a_level_used_in_schedules_needs_a_replacement(bench: Bench):
    await start(bench)
    without_comfort = [lv for lv in levels(bench) if lv["id"] != "comfort"]
    with pytest.raises(model.InvalidData):
        await bench.runtime.set_levels(without_comfort)
    revision = bench.runtime.data["revision"]
    await bench.runtime.set_levels(without_comfort, {"comfort": "boost"})
    await bench.hass.async_block_till_done()
    assert bench.runtime.data["schedules"]["climate.salon"]["normal"][0][1] == ["06:30", "boost"]
    assert bench.runtime.data["revision"] == revision + 1  # the card reloads its copy
    assert bench.applied() == {"climate.bureau": "boost"}


async def test_removing_a_level_drops_its_mappings(bench: Bench):
    await start(bench)
    await bench.runtime.set_mapping("climate.bureau", {"frost": {"temperature": 8}})
    await bench.runtime.set_levels([lv for lv in levels(bench) if lv["id"] != "frost"])
    assert bench.runtime.data["mappings"]["climate.bureau"] == {}


async def test_schedules_with_an_unknown_level_are_refused(bench: Bench):
    await start(bench)
    with pytest.raises(model.InvalidData):
        await bench.runtime.save_schedules({"climate.salon": {"normal": every_day(("00:00", "sleep"))}})


async def test_the_card_gets_levels_and_what_they_mean_per_thermostat(bench: Bench):
    await start(bench)
    snapshot = bench.runtime.snapshot()
    assert [lv["id"] for lv in snapshot["levels"]] == ["comfort", "eco", "boost", "frost"]
    assert snapshot["targets"]["climate.salon"]["eco"] == {"preset": "eco"}
