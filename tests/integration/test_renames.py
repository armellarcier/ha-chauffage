"""A renamed climate entity is followed: its schedule, override and entities move to the new id
(docs/decisions.md, "Scheduled thermostats")."""

import pytest
from homeassistant.helpers import entity_registry as er, issue_registry as ir

from conftest import Bench, every_day, KINDS


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


SALON = {"normal": every_day(("00:00", "eco"), ("17:30", "comfort"))}


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    er.async_get(bench.hass).async_get_or_create("climate", "test", "salon", suggested_object_id="salon")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.setup()
    await bench.save_weeks({"climate.salon": SALON})
    bench.applied()


async def rename(bench: Bench, new: str = "climate.sejour") -> None:
    """Renamed in Settings → Entities: HA moves the state to the new id."""
    er.async_get(bench.hass).async_update_entity("climate.salon", new_entity_id=new)
    bench.hass.states.async_remove("climate.salon")
    bench.thermostat(new, "eco", friendly_name="Salon")
    await bench.hass.async_block_till_done()


async def test_a_renamed_thermostat_keeps_its_schedule_and_its_override(bench: Bench):
    await start(bench)
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"temperature": 19.5}})
    await bench.manual_setpoint("climate.salon", 22)
    await rename(bench)
    assert "climate.salon" not in bench.runtime.thermostats
    assert bench.runtime.weeks["climate.sejour"]["normal"] == SALON["normal"]
    assert bench.runtime.mappings["climate.sejour"] == {"comfort": {"temperature": 19.5}}
    assert "climate.sejour" in bench.overrides() and "climate.salon" not in bench.overrides()


async def test_a_renamed_thermostat_is_still_driven_and_watched(bench: Bench):
    await start(bench)
    await rename(bench)
    await bench.go_to("17:30")
    assert set(bench.applied()) == {"climate.sejour"}
    await bench.manual_setpoint("climate.sejour", 22)
    assert "climate.sejour" in bench.overrides()


async def test_a_renamed_thermostat_stays_paused(bench: Bench):
    await start(bench)
    await bench.runtime.set_paused("climate.salon", True)
    await rename(bench)
    assert bench.runtime.is_paused("climate.sejour")


async def test_its_entities_keep_their_ids_and_settings(bench: Bench):
    await start(bench)
    registry = er.async_get(bench.hass)
    registry.async_update_entity("sensor.salon_schedule", disabled_by=None)  # enabled by the user
    await rename(bench)
    await bench.hass.async_block_till_done()
    switch = registry.async_get("switch.salon_control")
    assert switch is not None and switch.unique_id.endswith("climate.sejour_control")
    sensor = registry.async_get("sensor.salon_schedule")
    assert sensor is not None and sensor.disabled_by is None
    assert bench.hass.states.get("switch.salon_control").state == "on"
    assert registry.async_get_entity_id("switch", "chauffage", f"{bench.entry.entry_id}_climate.salon_control") is None


async def test_its_entities_are_kept_through_a_change_made_before_the_reload(bench: Bench, monkeypatch, caplog):
    """The entry is reloaded to attach the entities to the new id; a change meanwhile (a value
    of a preset set) must neither remove them nor make them again."""
    await start(bench)
    registry = er.async_get(bench.hass)
    reloads = []
    monkeypatch.setattr(bench.hass.config_entries, "async_schedule_reload", reloads.append)
    await rename(bench)
    assert reloads == [bench.entry.entry_id]
    await bench.runtime.set_mapping("climate.sejour", {"comfort": {"temperature": 19.5}})  # before the reload
    await bench.hass.async_block_till_done()
    assert registry.async_get("sensor.salon_schedule") is not None
    assert registry.async_get("switch.salon_control") is not None
    assert "does not generate unique IDs" not in caplog.text


async def test_the_entities_of_a_thermostat_with_a_longer_id_stay_where_they_are(bench: Bench):
    """climate.salon renamed: climate.salon_bas's entities start with the same text."""
    await start(bench)
    bench.thermostat("climate.salon_bas", "eco", friendly_name="Salon bas")
    await bench.save_weeks({"climate.salon": SALON, "climate.salon_bas": SALON})
    registry = er.async_get(bench.hass)
    before = registry.async_get("switch.salon_bas_control").unique_id
    await rename(bench)
    assert registry.async_get("switch.salon_bas_control").unique_id == before
    assert registry.async_get("switch.salon_control").unique_id.endswith("climate.sejour_control")
    assert bench.runtime.weeks["climate.salon_bas"]["normal"] == SALON["normal"]


async def test_renamed_to_the_id_of_a_thermostat_whose_entity_is_gone(bench: Bench):
    """climate.sejour was scheduled, then its entity deleted (its repair answered "keep"): the
    renamed thermostat is the one that exists, its data and entities win; the former ones go."""
    await bench.go_to("10:00")
    registry = er.async_get(bench.hass)
    registry.async_get_or_create("climate", "test", "salon", suggested_object_id="salon")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    bench.thermostat("climate.sejour", "eco", friendly_name="Séjour")
    await bench.setup()
    await bench.save_weeks({"climate.salon": SALON, "climate.sejour": {"normal": every_day(("00:00", "frost"))}})
    await bench.manual_setpoint("climate.sejour", 22)
    bench.hass.states.async_remove("climate.sejour")
    await bench.hass.async_block_till_done()
    assert registry.async_get("switch.sejour_control") is not None

    await rename(bench)
    assert bench.runtime.weeks["climate.sejour"]["normal"] == SALON["normal"]
    assert "climate.sejour" not in bench.overrides()
    assert registry.async_get("switch.sejour_control") is None
    switch = registry.async_get("switch.salon_control")
    assert switch is not None and switch.unique_id.endswith("climate.sejour_control")


async def test_renamed_back(bench: Bench):
    await start(bench)
    await rename(bench)
    er.async_get(bench.hass).async_update_entity("climate.sejour", new_entity_id="climate.salon")
    bench.hass.states.async_remove("climate.sejour")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.hass.async_block_till_done()
    assert bench.runtime.weeks["climate.salon"]["normal"] == SALON["normal"]
    assert er.async_get(bench.hass).async_get("switch.salon_control").unique_id.endswith("climate.salon_control")


async def test_the_cards_learn_the_new_id(bench: Bench):
    """A card whose configuration still holds the former id shows a notice with the new one."""
    await start(bench)
    await rename(bench)
    assert bench.runtime.snapshot()["renamed"] == {"climate.salon": "climate.sejour"}


async def test_renamed_twice(bench: Bench):
    await start(bench)
    await rename(bench)
    er.async_get(bench.hass).async_update_entity("climate.sejour", new_entity_id="climate.living")
    bench.hass.states.async_remove("climate.sejour")
    bench.thermostat("climate.living", "eco", friendly_name="Salon")
    await bench.hass.async_block_till_done()
    assert bench.runtime.weeks["climate.living"]["normal"] == SALON["normal"]
    assert bench.runtime.snapshot()["renamed"] == {"climate.salon": "climate.living", "climate.sejour": "climate.living"}


async def test_a_forgotten_thermostat_is_no_longer_where_its_former_ids_lead(bench: Bench):
    """A card holding the former id would set it aside forever, pointing to nothing."""
    await start(bench)
    await rename(bench)
    await bench.runtime.forget("climate.sejour")
    assert bench.runtime.snapshot()["renamed"] == {}


async def test_a_rename_is_not_an_entity_gone(bench: Bench):
    await start(bench)
    await rename(bench)
    assert ir.async_get(bench.hass).async_get_issue("chauffage", "missing_climate.salon") is None
    assert ir.async_get(bench.hass).async_get_issue("chauffage", "missing_climate.sejour") is None


async def test_a_rename_survives_a_restart(bench: Bench):
    await start(bench)
    await rename(bench)
    await bench.advance(1)  # delayed save
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert bench.runtime.weeks["climate.sejour"]["normal"] == SALON["normal"]
    assert bench.runtime.snapshot()["renamed"] == {"climate.salon": "climate.sejour"}


async def test_a_copy_of_the_weeks_made_before_a_rename_must_be_reloaded(bench: Bench):
    """It still holds the former id: saving it would schedule that id again."""
    from custom_components.chauffage.runtime import StaleRevision

    await start(bench)
    revision = bench.runtime.data["revision"]
    await rename(bench)
    with pytest.raises(StaleRevision):
        await bench.runtime.save_weeks({"climate.salon": SALON}, revision)


async def test_saving_weeks_under_a_former_id_is_refused(bench: Bench):
    """A card not edited since the rename: the weeks would schedule an id no entity has."""
    from custom_components.chauffage.runtime import StaleRevision

    await start(bench)
    await rename(bench)
    with pytest.raises(StaleRevision):
        await bench.runtime.save_weeks({"climate.salon": SALON}, revisions={"climate.salon": None})
    assert "climate.salon" not in bench.runtime.thermostats


async def test_a_former_id_given_to_another_entity_is_that_entity(bench: Bench):
    """climate.salon renamed climate.sejour, then a new climate.salon: weeks saved under
    climate.salon schedule the new one, not climate.sejour."""
    await start(bench)
    await rename(bench)
    bench.thermostat("climate.salon", "eco", friendly_name="Salon neuf")
    week = every_day(("00:00", "frost"))
    await bench.runtime.save_weeks({"climate.salon": {"normal": week}}, revisions={"climate.salon": None})
    assert bench.runtime.weeks["climate.salon"]["normal"] == week
    assert bench.runtime.weeks["climate.sejour"]["normal"] == SALON["normal"]
