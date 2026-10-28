"""Entities: active-schedule select, per-thermostat sensors and Control switch."""

import pytest
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from conftest import KINDS, WEEKDAY, Bench, every_day

WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": every_day(("00:00", "frost"))}}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    await bench.setup()
    await bench.save_weeks(WEEKS)


async def test_the_active_schedule_select_lists_the_schedules_and_shows_the_active_one(bench: Bench):
    await start(bench)
    state = bench.hass.states.get("select.chauffage_schedule")
    assert state.attributes["options"] == ["Normal", "Away", "Holiday"]
    assert state.state == "Normal"
    await bench.activate_schedule("Away")
    assert bench.hass.states.get("select.chauffage_schedule").state == "Away"
    assert bench.runtime.data["active_schedule"] == "away"


async def test_the_select_of_an_older_version_becomes_select_chauffage_schedule(bench: Bench):
    """Before v0.4 it was select.chauffage_mode: automations must use the new id."""
    entry = MockConfigEntry(domain="chauffage", title="Chauffage")
    entry.add_to_hass(bench.hass)
    registry = er.async_get(bench.hass)
    registry.async_get_or_create("select", "chauffage", f"{entry.entry_id}_mode",
                                 suggested_object_id="chauffage_mode", config_entry=entry)
    await bench.setup(entry=entry)
    assert registry.async_get("select.chauffage_mode") is None
    renamed = registry.async_get("select.chauffage_schedule")
    assert renamed.unique_id == f"{entry.entry_id}_schedule"
    assert bench.hass.states.get("select.chauffage_schedule").state == "Normal"


async def test_an_entity_id_chosen_by_the_user_is_kept(bench: Bench):
    entry = MockConfigEntry(domain="chauffage", title="Chauffage")
    entry.add_to_hass(bench.hass)
    registry = er.async_get(bench.hass)
    registry.async_get_or_create("select", "chauffage", f"{entry.entry_id}_mode",
                                 suggested_object_id="heating", config_entry=entry)
    await bench.setup(entry=entry)
    assert bench.hass.states.get("select.heating").state == "Normal"
    assert bench.hass.states.get("select.chauffage_schedule") is None


async def test_the_planned_preset_and_override_sensors_are_enabled_by_default(bench: Bench):
    """The device page shows what Chauffage plans and whether there is an override; the override
    end, "Unknown" most of the time, stays disabled (docs/decisions.md, "Entities")."""
    await start(bench)
    registry = er.async_get(bench.hass)
    assert registry.async_get("sensor.salon_planned_preset").disabled_by is None
    assert registry.async_get("binary_sensor.salon_override").disabled_by is None
    end = registry.async_get("sensor.salon_override_end")
    assert end is not None and end.disabled_by is er.RegistryEntryDisabler.INTEGRATION
    assert bench.hass.states.get("sensor.salon_override_end") is None


async def test_the_planned_preset_sensor_shows_the_planned_preset_and_the_next_slot(bench: Bench):
    await start(bench)
    state = bench.hass.states.get("sensor.salon_planned_preset")
    assert state.state == "eco"
    assert state.attributes["next_preset"] == "comfort"
    assert state.attributes["next_start"].startswith("2026-10-12T17:30")
    await bench.go_to("17:30")
    assert bench.hass.states.get("sensor.salon_planned_preset").state == "comfort"
    await bench.activate_schedule("Away")
    assert bench.hass.states.get("sensor.salon_planned_preset").state == "frost"


async def test_the_planned_preset_sensor_gives_the_temperature_of_each_preset_on_the_thermostat(bench: Bench):
    """The temperature the thermostat has at each preset: its own preset's (learned while on it,
    published by Versatile Thermostat), else the preset's; unknown ones are left out."""
    await start(bench)
    temperatures = bench.hass.states.get("sensor.salon_planned_preset").attributes["temperatures"]
    expected = {
        "vtherm": {"eco": 17.0},  # on eco now (learned); comfort, boost, frost not known yet
        "standard": {"eco": 17.0, "frost": 7.0},  # no frost preset of its own: a temperature
        "plain": {"comfort": 20.0, "eco": 17.0, "boost": 21.0, "frost": 7.0},
    }
    assert temperatures == expected[bench.kind]


async def test_the_planned_preset_sensor_reads_the_temperatures_versatile_thermostat_publishes(bench: Bench):
    bench.needs("vtherm")
    await start(bench)
    bench.thermostat("climate.salon", "eco", friendly_name="Salon",
                     preset_temperatures={"comfort_temp": 19.5, "eco_temp": 16.5, "boost_temp": 22, "frost_temp": 8})
    await bench.hass.async_block_till_done()
    temperatures = bench.hass.states.get("sensor.salon_planned_preset").attributes["temperatures"]
    assert temperatures == {"comfort": 19.5, "eco": 16.5, "boost": 22.0, "frost": 8.0}


async def test_the_override_sensor_is_on_while_the_thermostat_has_an_override(bench: Bench):
    await start(bench)
    assert bench.hass.states.get("binary_sensor.salon_override").state == "off"
    await bench.manual_setpoint("climate.salon", 21.5)
    state = bench.hass.states.get("binary_sensor.salon_override")
    assert state.state == "on"
    assert (state.attributes["kind"], state.attributes["value"]) == ("temperature", 21.5)
    assert state.attributes["end"] == "2026-10-12T12:00:00+02:00"
    await bench.go_to("12:00")
    assert bench.hass.states.get("binary_sensor.salon_override").state == "off"
    await bench.hass.services.async_call(
        "chauffage", "set_override", {"entity_id": "climate.salon", "preset": "boost"}, blocking=True
    )
    await bench.hass.async_block_till_done()
    state = bench.hass.states.get("binary_sensor.salon_override")
    assert state.state == "on" and state.attributes["preset"] == "boost"


async def test_the_override_sensor_gives_the_end_in_local_time_whoever_set_it(bench: Bench):
    """The card sends its ends in UTC: automations read the same format from every source."""
    await start(bench)
    await bench.set_override("climate.salon", {"kind": "temperature", "value": 21, "start": "2026-10-12T08:00:00Z",
                                               "end": "2026-10-12T10:00:00.250Z"})
    end = bench.hass.states.get("binary_sensor.salon_override").attributes["end"]
    assert end == "2026-10-12T12:00:00.250000+02:00"


async def test_the_override_end_sensor(bench: Bench, entity_registry_enabled_by_default):
    await start(bench)
    assert bench.hass.states.get("sensor.salon_override_end").state == "unknown"
    await bench.manual_setpoint("climate.salon", 21.5)
    state = bench.hass.states.get("sensor.salon_override_end")
    assert state.state == "2026-10-12T10:00:00+00:00"  # 12:00 in Paris
    assert (state.attributes["kind"], state.attributes["value"]) == ("temperature", 21.5)


async def test_the_planned_preset_sensor_of_an_existing_installation_keeps_its_id_and_is_enabled(bench: Bench):
    """Called *Schedule* and disabled by default before: its id is kept (automations use it), and
    it is enabled once, unless the user disabled it."""
    entry = MockConfigEntry(domain="chauffage", title="Chauffage", version=1, minor_version=1)
    entry.add_to_hass(bench.hass)
    registry = er.async_get(bench.hass)
    for climate, disabled_by in (("salon", er.RegistryEntryDisabler.INTEGRATION),
                                 ("bureau", er.RegistryEntryDisabler.USER)):
        registry.async_get_or_create("sensor", "chauffage", f"{entry.entry_id}_climate.{climate}_schedule",
                                     suggested_object_id=f"{climate}_schedule", config_entry=entry,
                                     disabled_by=disabled_by)
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.go_to("10:00")
    await bench.setup(entry=entry)
    await bench.save_weeks({**WEEKS, "climate.bureau": WEEKS["climate.salon"]})
    assert bench.hass.states.get("sensor.salon_schedule").state == "eco"
    assert registry.async_get("sensor.salon_planned_preset") is None
    assert registry.async_get("sensor.bureau_schedule").disabled_by is er.RegistryEntryDisabler.USER
    assert entry.minor_version == 2


async def test_entities_follow_the_scheduled_thermostats(bench: Bench):
    await start(bench)
    bench.thermostat("climate.bureau", "eco", friendly_name="Bureau")
    await bench.save_weeks({**WEEKS, "climate.bureau": {"normal": every_day(("00:00", "eco"))}})
    assert bench.hass.states.get("sensor.bureau_planned_preset").state == "eco"
    assert bench.hass.states.get("binary_sensor.bureau_override").state == "off"
    await bench.runtime.forget("climate.salon")
    await bench.hass.async_block_till_done()
    registry = er.async_get(bench.hass)
    assert registry.async_get("sensor.salon_planned_preset") is None
    assert registry.async_get("binary_sensor.salon_override") is None
    assert registry.async_get("switch.salon_control") is None
    assert registry.async_get("switch.bureau_control") is not None


async def test_a_forgotten_thermostat_s_disabled_sensors_leave_the_registry(bench: Bench):
    """Disabled by default, they are never added to HA: no registry entry left behind."""
    await start(bench)
    registry = er.async_get(bench.hass)
    assert registry.async_get("sensor.salon_override_end").disabled_by is er.RegistryEntryDisabler.INTEGRATION
    await bench.runtime.forget("climate.salon")
    await bench.hass.async_block_till_done()
    assert registry.async_get("sensor.salon_override_end") is None


async def test_sensors_are_attached_to_the_thermostat_s_device(bench: Bench):
    other = MockConfigEntry(domain="test")
    other.add_to_hass(bench.hass)
    device = dr.async_get(bench.hass).async_get_or_create(
        config_entry_id=other.entry_id, identifiers={("test", "valve")}, name="Vanne salon"
    )
    er.async_get(bench.hass).async_get_or_create("climate", "test", "valve", suggested_object_id="salon",
                                                 device_id=device.id)
    await start(bench)
    registry = er.async_get(bench.hass)
    for entity_id in ("sensor.vanne_salon_planned_preset", "binary_sensor.vanne_salon_override",
                      "switch.vanne_salon_control"):
        entry = registry.async_get(entity_id)
        assert entry is not None and entry.device_id == device.id


# ----- Control switch (docs/decisions.md, "Scheduled thermostats") -----

async def test_each_scheduled_thermostat_has_a_control_switch_among_its_main_entities(bench: Bench):
    """Not a configuration entity: pausing is an everyday action, offered with the device's main
    triggers, conditions and actions in the automation editor, and to Assist."""
    await start(bench)
    entry = er.async_get(bench.hass).async_get("switch.salon_control")
    assert entry is not None and entry.disabled_by is None
    assert entry.entity_category is None
    assert bench.hass.states.get("switch.salon_control").state == "on"


async def test_turning_the_control_switch_off_pauses_the_thermostat(bench: Bench):
    await start(bench)
    await bench.hass.services.async_call("switch", "turn_off", {"entity_id": "switch.salon_control"}, blocking=True)
    await bench.hass.async_block_till_done()
    assert bench.runtime.is_paused("climate.salon")
    assert bench.hass.states.get("switch.salon_control").state == "off"
    await bench.hass.services.async_call("switch", "turn_on", {"entity_id": "switch.salon_control"}, blocking=True)
    await bench.hass.async_block_till_done()
    assert not bench.runtime.is_paused("climate.salon")


async def test_the_control_switch_shows_a_pause_made_from_the_card(bench: Bench):
    await start(bench)
    await bench.runtime.set_paused("climate.salon", True)
    await bench.hass.async_block_till_done()
    assert bench.hass.states.get("switch.salon_control").state == "off"


async def test_the_sensors_of_a_paused_thermostat_are_unavailable(bench: Bench, entity_registry_enabled_by_default):
    await start(bench)
    await bench.runtime.set_paused("climate.salon", True)
    await bench.hass.async_block_till_done()
    for entity_id in ("sensor.salon_planned_preset", "binary_sensor.salon_override", "sensor.salon_override_end"):
        assert bench.hass.states.get(entity_id).state == "unavailable"
    assert bench.hass.states.get("switch.salon_control").state == "off"  # the switch stays usable
    await bench.runtime.set_paused("climate.salon", False)
    await bench.hass.async_block_till_done()
    assert bench.hass.states.get("sensor.salon_planned_preset").state == "eco"


# ----- What the card opens (#39) -----

async def test_the_card_is_told_the_entities_of_each_thermostat_and_of_chauffage(bench: Bench):
    """The cards open the entities and devices they mention; a thermostat without a device has no
    other way to find its own entities (they are named after it, not attached to it)."""
    await start(bench)
    snapshot = bench.runtime.snapshot()
    assert snapshot["thermostat_entities"]["climate.salon"] == {
        "control": "switch.salon_control", "override": "binary_sensor.salon_override",
        "planned_preset": "sensor.salon_planned_preset", "override_end": "sensor.salon_override_end",
    }
    assert snapshot["schedule_select"] == "select.chauffage_schedule"
    assert dr.async_get(bench.hass).async_get(snapshot["device_id"]).name == "Chauffage"


async def test_the_chauffage_device_is_found_without_a_deprecated_call(bench: Bench, caplog):
    """From Home Assistant 2026.10, looking a device up by identifiers alone is deprecated (they are
    no longer unique across config entries) and stops working in 2027.8; older ones only have it."""
    await start(bench)
    caplog.clear()
    device = dr.async_get(bench.hass).async_get(bench.runtime.device_id())
    assert device is not None and device.name == "Chauffage"
    assert "deprecated" not in caplog.text


async def test_the_card_is_told_an_entity_renamed_by_the_user(bench: Bench):
    await start(bench)
    sent = []
    bench.runtime.async_add_listener(lambda reason: sent.append(bench.runtime.snapshot()["thermostat_entities"]))
    er.async_get(bench.hass).async_update_entity("switch.salon_control", new_entity_id="switch.salon_pilotage")
    await bench.hass.async_block_till_done()
    assert sent and sent[-1]["climate.salon"]["control"] == "switch.salon_pilotage"


async def test_the_card_is_told_the_active_schedule_select_renamed_by_the_user(bench: Bench):
    await start(bench)
    sent = []
    bench.runtime.async_add_listener(lambda reason: sent.append(bench.runtime.snapshot()["schedule_select"]))
    er.async_get(bench.hass).async_update_entity("select.chauffage_schedule", new_entity_id="select.planning_actif")
    await bench.hass.async_block_till_done()
    assert sent and sent[-1] == "select.planning_actif"
