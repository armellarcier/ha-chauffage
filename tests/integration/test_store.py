"""Storage format versions (.storage/chauffage) and migrations."""

import json
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant

from custom_components.chauffage import store as store_module
from custom_components.chauffage.store import STORAGE_MINOR_VERSION, STORAGE_VERSION, ChauffageStore, migrate

FIXTURES = Path(__file__).parents[1] / "fixtures"
CURRENT = f"{STORAGE_VERSION}.{STORAGE_MINOR_VERSION}" if STORAGE_MINOR_VERSION > 1 else STORAGE_VERSION


def fixture(version: int | str) -> dict:
    return json.loads((FIXTURES / f"store-v{version}.json").read_text(encoding="utf-8"))


def test_every_storage_version_has_a_fixture_and_a_migration():
    for v in range(1, STORAGE_VERSION + 1):
        assert (FIXTURES / f"store-v{v}.json").exists(), f"tests/fixtures/store-v{v}.json"
    for v in range(1, STORAGE_VERSION):
        assert v in store_module.MIGRATIONS


def test_every_fixture_migrates_to_the_current_one():
    current = fixture(CURRENT)["data"]
    for v in range(1, STORAGE_VERSION + 1):
        assert migrate(fixture(v)["data"], v) == current


def test_steps_run_in_order_and_a_missing_step_is_an_error():
    steps = {1: lambda d, lang: {**d, "a": 1}, 2: lambda d, lang: {**d, "b": d["a"] + 1}}
    assert migrate({}, 1, target=3, migrations=steps) == {"a": 1, "b": 2}
    with pytest.raises(ValueError):
        migrate({}, 1, target=4, migrations=steps)


async def test_a_stored_file_is_loaded(hass: HomeAssistant, hass_storage):
    hass_storage["chauffage"] = fixture(CURRENT)
    assert await ChauffageStore(hass).async_load() == fixture(CURRENT)["data"]


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


def test_version_6_2_gives_every_schedule_its_layers_and_none_are_set():
    """Schedule layers: an upgrade adds none, so every thermostat follows its schedule as before."""
    v6_2 = migrate(fixture(6)["data"], 6)
    assert all(schedule["layers"] == [] for schedule in v6_2["schedules"])
    assert all(thermostat["layer_weeks"] == {} for thermostat in v6_2["thermostats"].values())


async def test_a_file_saved_by_this_version_is_read_back_as_is(hass: HomeAssistant, hass_storage):
    hass_storage["chauffage"] = fixture("6.2")
    assert await ChauffageStore(hass).async_load() == fixture("6.2")["data"]


def test_layers_kept_through_a_downgrade_are_kept_on_the_way_back():
    """Layers are a minor version (6.2): a version without them reads the file, keeps what it does
    not know and saves it as 6.1. Installing layers again keeps the layers still there."""
    layered = fixture("6.2")["data"]
    layered["schedules"][0]["layers"] = [{"id": "office_occupied", "name": "Office occupied", "enabled": True, "condition": None}]
    layered["thermostats"]["climate.salon"]["layer_weeks"] = {"office_occupied": [[["00:00", None]]] * 7}
    assert migrate(layered, 6, minor_version=1) == layered


def test_a_newer_minor_version_is_read_by_a_version_without_its_migration():
    """What a version without layers does with a 6.2 file: same major version, so no error."""
    assert migrate(fixture("6.2")["data"], 6, minor_version=2) == fixture("6.2")["data"]


def test_the_weeks_of_layers_lost_during_a_downgrade_do_not_come_back():
    """A version without layers drops them when the schedules are edited, not their weeks: a new
    layer with the same name must not get those weeks."""
    data = fixture("6.2")["data"]
    data["thermostats"]["climate.salon"]["layer_weeks"] = {"gone": [[["00:00", "boost"]]] * 7}
    assert migrate(data, 6, minor_version=1)["thermostats"]["climate.salon"]["layer_weeks"] == {}

