"""Storage format versions (.storage/chauffage) and migrations."""

import json
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant

from custom_components.chauffage import store as store_module
from custom_components.chauffage.const import DOMAIN
from custom_components.chauffage.store import STORAGE_VERSION, ChauffageStore, migrate

from conftest import Bench

FIXTURES = Path(__file__).parents[1] / "fixtures"


def fixture(version: int) -> dict:
    return json.loads((FIXTURES / f"store-v{version}.json").read_text(encoding="utf-8"))


def test_every_storage_version_has_a_fixture_and_a_migration():
    for v in range(1, STORAGE_VERSION + 1):
        assert (FIXTURES / f"store-v{v}.json").exists(), f"tests/fixtures/store-v{v}.json"
    for v in range(1, STORAGE_VERSION):
        assert v in store_module.MIGRATIONS


def test_every_fixture_migrates_to_the_current_one():
    current = fixture(STORAGE_VERSION)["data"]
    for v in range(1, STORAGE_VERSION + 1):
        assert migrate(fixture(v)["data"], v) == current


def test_steps_run_in_order_and_a_missing_step_is_an_error():
    steps = {1: lambda d, lang: {**d, "a": 1}, 2: lambda d, lang: {**d, "b": d["a"] + 1}}
    assert migrate({}, 1, target=3, migrations=steps) == {"a": 1, "b": 2}
    with pytest.raises(ValueError):
        migrate({}, 1, target=4, migrations=steps)


async def test_a_stored_file_is_loaded(hass: HomeAssistant, hass_storage):
    hass_storage["chauffage"] = fixture(STORAGE_VERSION)
    assert await ChauffageStore(hass).async_load() == fixture(STORAGE_VERSION)["data"]


def test_version_3_speaks_the_project_s_vocabulary():
    """docs/glossary.md: schedules (formerly modes), weeks, presets (formerly levels); ids and
    contents do not change."""
    v2 = fixture(2)["data"]
    v3 = migrate(v2, 2, target=3)
    assert set(v3) == {"schedules", "active_schedule", "presets", "mappings", "weeks", "overrides", "revision"}
    assert (v3["schedules"], v3["active_schedule"]) == (v2["modes"], v2["active_mode"])
    assert (v3["weeks"], v3["presets"]) == (v2["schedules"], v2["levels"])


def test_version_4_adds_activation_rules_and_none_are_set():
    """An upgrade keeps choosing the active schedule by hand (docs/decisions.md, "Activation rules")."""
    v4 = migrate(fixture(3)["data"], 3)
    assert (v4["rules"], v4["default_schedule"], v4["rules_choice"]) == ([], None, None)


def test_version_5_keeps_each_thermostat_s_data_together():
    """docs/decisions.md, "Scheduled thermostats": nothing changes on upgrade. A thermostat with
    weeks is scheduled, active; one with only values of the presets set by hand was not driven
    (left behind once removed from the card, #27): they are kept, it is still not scheduled until
    it has weeks. A schedule a thermostat had no week in gets the week of a new schedule: eco all
    week, what the card showed for it."""
    v4 = fixture(4)["data"]
    weeks = v4["weeks"]["climate.salon"]
    assert set(weeks) == {"normal", "absent"}  # none in "vacances"
    v4 = {**v4, "mappings": {"climate.salon": {"eco": {"temperature": 16.5}}, "climate.bureau": {"eco": {"preset": "eco"}}},
          "preset_temperatures": {"climate.salon": {"eco": 17.0}}}
    v5 = migrate(v4, 4, target=5)
    assert not {"weeks", "mappings", "preset_temperatures"} & set(v5)
    assert v5["thermostats"] == {
        "climate.salon": {"paused": False, "revision": 0, "weeks": {**weeks, "vacances": [[["00:00", "eco"]]] * 7},
                          "mapping": {"eco": {"temperature": 16.5}}, "preset_temperatures": {"eco": 17.0}},
        "climate.bureau": {"paused": False, "revision": 0, "weeks": {}, "mapping": {"eco": {"preset": "eco"}},
                           "preset_temperatures": {}},
    }
    assert v5["renamed"] == {} and "cards" not in v5
    assert (v5["overrides"], v5["revision"]) == (v4["overrides"], v4["revision"])


def test_version_7_holds_targets_as_partial_states():
    """A slot sets more than a preset (#91): what a preset means for a thermostat, an override and
    a command not applied yet become partial states of the thermostat, as a scene holds them.
    The values do not change."""
    v6 = fixture(6)["data"]
    salon = v6["thermostats"]["climate.salon"]
    v6 = {**v6,
          "thermostats": {"climate.salon": {**salon, "mapping": {"eco": {"preset": "away"}, "comfort": {"temperature": 19.5}}}},
          "pending": {"climate.salon": [{"kind": "preset", "value": "comfort", "sent": "2026-10-12T06:30:00+02:00"}]}}
    v7 = migrate(v6, 6, target=7)
    assert v7["thermostats"]["climate.salon"]["mapping"] == {"eco": {"preset_mode": "away"}, "comfort": {"temperature": 19.5}}
    assert v7["overrides"]["climate.salon"] == {
        "target": {"temperature": 21.5}, "start": "2026-10-12T09:30:00+02:00", "end": "2026-10-12T11:30:00+02:00"}
    assert v7["pending"]["climate.salon"] == [{"target": {"preset_mode": "comfort"}, "sent": "2026-10-12T06:30:00+02:00"}]
    assert v7["thermostats"]["climate.salon"]["weeks"] == salon["weeks"]
    assert "hvac_mode" not in v7["thermostats"]["climate.salon"]  # Chauffage learns no HVAC mode


def test_version_8_names_the_rule_that_chose_the_end_of_an_override():
    """`ends_at` read like a date: the key is now `end_rule`, with the same values."""
    v7 = fixture(7)["data"]
    salon = v7["overrides"]["climate.salon"]
    v7 = {**v7, "overrides": {"climate.salon": {**salon, "ends_at": "next_slot"}, "climate.bureau": salon}}
    v8 = migrate(v7, 7, target=8)
    assert v8["overrides"] == {"climate.salon": {**salon, "end_rule": "next_slot"}, "climate.bureau": salon}


# ----- the stored data goes through Chauffage unchanged -----

@pytest.mark.parametrize("version", range(1, STORAGE_VERSION + 1))
async def test_the_stored_data_is_saved_back_as_it_was_read(bench: Bench, version: int):
    """Chauffage reads a file stored by any version and saves it back in the current format,
    without losing a value, even a key it doesn't know."""
    stored = fixture(version)
    stored["data"]["from_a_later_version"] = {"kept": True}
    bench.storage[DOMAIN] = stored
    await bench.go_to("10:00")
    await bench.setup()
    await bench.activate_schedule("Absent")
    expected = {**fixture(STORAGE_VERSION)["data"], "active_schedule": "absent", "from_a_later_version": {"kept": True}}
    assert await bench.stored() == expected
