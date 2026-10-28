"""Thermostats that apply a command late (battery valves asleep, Zigbee messages held for them):
a late setpoint is not a change by hand. docs/decisions.md, "Commands applied late"."""

import pytest
from homeassistant.core import Context
from homeassistant.helpers import entity_registry as er

from conftest import KINDS, Bench, every_day


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


SCHEDULES = {
    "climate.salon": {"normal": every_day(("00:00", "eco"), ("06:30", "comfort"), ("08:30", "eco"))},
    "climate.bureau": {"normal": every_day(("00:00", "eco"))},
}


async def start(bench: Bench) -> None:
    """06:00, eco everywhere; the living room's valve is slow: comfort is sent at 06:30 and not
    applied yet."""
    await bench.go_to("06:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    bench.slow.update({"climate.salon", "climate.bureau"})
    await bench.go_to("06:30")
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_a_command_not_applied_yet_is_sent_again_at_the_next_slot(bench: Bench):
    """The valve still shows eco at 08:30 because it never applied comfort: eco is sent anyway,
    or the comfort it applies later would stay."""
    await start(bench)
    await bench.go_to("08:30")
    assert bench.applied() == {"climate.salon": "eco"}


async def test_a_setpoint_the_valve_applies_late_is_not_an_override(bench: Bench):
    """Seen on a Tuya valve: comfort sent at 06:30, applied at 09:16, during the eco slot."""
    await start(bench)
    await bench.go_to("08:30")
    await bench.go_to("09:16")
    await bench.applies_late("climate.salon", "comfort")
    assert bench.overrides() == {}
    await bench.applies_late("climate.salon", "eco")
    assert bench.overrides() == {}


async def test_a_report_of_the_valve_that_already_showed_a_command_does_not_count_as_applying_it(bench: Bench):
    """Eco sent again at 08:30 to a valve that still showed eco: a later report (its measured
    temperature) still shows eco, and the valve may yet apply comfort."""
    await start(bench)
    await bench.go_to("08:30")
    await bench.go_to("08:45")
    bench.thermostat("climate.salon", "eco", current_temperature=18.5, context=Context())
    await bench.hass.async_block_till_done()
    await bench.go_to("09:16")
    await bench.applies_late("climate.salon", "comfort")
    assert bench.overrides() == {}


async def test_a_late_setpoint_does_not_end_an_override_and_the_override_is_sent_again(bench: Bench):
    """Turned to 21 on the valve before it applied comfort: the override stays, and the valve,
    now at comfort, is set back to 21."""
    await start(bench)
    await bench.go_to("07:00")
    await bench.change_on_device("climate.salon", 21)
    assert bench.overrides()["climate.salon"]["value"] == 21
    bench.applied()
    await bench.applies_late("climate.salon", "comfort")
    assert bench.overrides()["climate.salon"]["value"] == 21
    assert bench.temperature_calls[-1] == ("climate.salon", 21)


async def test_a_failed_command_applied_later_is_not_an_override(bench: Bench):
    """A Zigbee command can time out and still reach the valve once it wakes up."""
    await bench.go_to("06:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.bureau", "eco")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    bench.unreachable.add("climate.salon")
    await bench.go_to("06:30")
    await bench.go_to("08:30")
    await bench.applies_late("climate.salon", "comfort")
    assert bench.overrides() == {}


async def test_commands_not_applied_yet_survive_a_restart(bench: Bench):
    await start(bench)
    await bench.go_to("08:30")
    await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    bench.runtime.pause = 0
    await bench.go_to("09:16")
    await bench.applies_late("climate.salon", "comfort")
    assert bench.overrides() == {}


async def test_a_change_in_home_assistant_is_an_override_even_to_a_value_not_applied_yet(bench: Bench):
    """Only a change on the device can be a late command: one made by a user in Home Assistant
    is always theirs."""
    await start(bench)
    await bench.go_to("08:30")
    await bench.manual_setpoint("climate.salon", 20)
    assert bench.overrides()["climate.salon"]["value"] == 20


async def test_once_the_valve_applied_the_last_command_a_change_on_it_is_an_override(bench: Bench):
    await start(bench)
    await bench.go_to("08:30")
    await bench.applies_late("climate.salon", "comfort")
    await bench.applies_late("climate.salon", "eco")
    await bench.go_to("09:00")
    await bench.change_on_device("climate.salon", 20)
    assert bench.overrides()["climate.salon"]["value"] == 20


async def test_a_change_on_the_device_long_after_a_command_is_an_override(bench: Bench):
    """A command not applied after a day is not waited for anymore: turning the valve to its
    value is a change by hand."""
    await start(bench)
    await bench.set_override("climate.bureau", bench.runtime.new_override("temperature", 21.0))
    await bench.advance(3 * 60)  # the override ended: eco sent again, not applied either
    await bench.change_on_device("climate.bureau", 21)
    assert bench.overrides() == {}  # still a command the valve may apply late
    await bench.applies_late("climate.bureau", "eco")
    await bench.set_override("climate.bureau", bench.runtime.new_override("temperature", 21.0))
    await bench.advance(25 * 60)
    await bench.change_on_device("climate.bureau", 21)
    assert bench.overrides()["climate.bureau"]["value"] == 21


async def test_a_renamed_valve_still_waits_for_its_commands(bench: Bench):
    er.async_get(bench.hass).async_get_or_create("climate", "test", "salon", suggested_object_id="salon")
    await start(bench)
    await bench.go_to("08:30")
    er.async_get(bench.hass).async_update_entity("climate.salon", new_entity_id="climate.sejour")
    bench.hass.states.async_remove("climate.salon")
    bench.thermostat("climate.sejour", "eco")
    await bench.hass.async_block_till_done()
    bench.runtime.pause = 0
    await bench.applies_late("climate.sejour", "comfort")
    assert bench.overrides() == {}
