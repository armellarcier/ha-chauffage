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


async def test_the_data_of_a_development_version_7_is_cleaned(hass: HomeAssistant, hass_storage):
    """Version 7 changed while #91 was developed, before any release held it: a preset, a preset's
    value and a slot could set an HVAC mode. Version 7.2 keeps what the model still holds: a slot
    says off, or the fan and the vanes; a value is a climate preset or a temperature."""
    stored = fixture(STORAGE_VERSION)
    data = stored["data"]
    data["schedules"][0]["hvac_mode"] = "cool"  # what the model holds now: kept
    data["presets"][0]["hvac_mode"] = "off"
    salon = data["thermostats"]["climate.salon"]
    salon["mapping"] = {
        "comfort": {"preset_mode": "comfort", "temperature": 19.0, "cool_temperature": 25.0, "hvac_mode": "heat", "fan_mode": "3"},
        "eco": {"hvac_mode": "cool"}, "boost": {"preset_mode": "boost", "hvac_mode": "off"}}
    week = salon["weeks"]["normal"]
    week[0] = [["00:00", "eco", {"hvac_mode": "off"}], ["07:00", "comfort", {"hvac_mode": "cool", "fan_mode": "2"}],
               ["09:00", "comfort", {"hvac_mode": "heat"}], ["22:00", "boost", {"hvac_mode": "off", "fan_mode": "1"}]]
    others = [list(day) for day in week[1:]]
    hass_storage["chauffage"] = {**stored, "minor_version": 1}
    loaded = await ChauffageStore(hass).async_load()
    assert loaded["schedules"][0]["hvac_mode"] == "cool"
    assert "hvac_mode" not in loaded["presets"][0]
    assert loaded["thermostats"]["climate.salon"]["mapping"] == {
        "comfort": {"temperature": 19.0, "cool_temperature": 25.0, "fan_mode": "3"}, "boost": {"preset_mode": "boost"}}
    cleaned = loaded["thermostats"]["climate.salon"]["weeks"]["normal"]
    off = {"hvac_mode": "off"}
    assert cleaned[0] == [["00:00", "frost", off], ["07:00", "comfort", {"fan_mode": "2"}], ["09:00", "comfort"], ["22:00", "frost", off]]
    assert cleaned[1:] == others
    assert loaded["overrides"] == data["overrides"]


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
    assert v7["thermostats"]["climate.salon"]["hvac_mode"] is None  # the last HVAC mode it was on in: unknown yet
