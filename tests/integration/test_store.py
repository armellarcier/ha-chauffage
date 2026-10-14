"""Storage format versions (.storage/chauffage) and migrations."""

import json
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant

from custom_components.chauffage import store as store_module
from custom_components.chauffage.store import STORAGE_VERSION, ChauffageStore, migrate

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
