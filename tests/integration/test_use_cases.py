"""Use cases found missing by the functional analysis (docs/use-cases.md): thermostats coming
back, failed commands retried, missed minutes, week and DST boundaries, restarts."""

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import Context, CoreState
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from conftest import KINDS, MANUAL_PRESET, WEEKDAY, WEEKEND, Bench
from custom_components.chauffage import engine, model

FIXTURES = Path(__file__).parents[1] / "fixtures"
SCHEDULES = {"climate.salon": {"normal": [WEEKDAY] * 5 + [WEEKEND] * 2}}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def start(bench: Bench, hhmm: str = "10:00", day: int = 0) -> None:
    await bench.go_to(hhmm, day)
    bench.thermostat("climate.salon", "eco")
    await bench.setup()
    await bench.save_weeks(SCHEDULES)
    bench.applied()


# ----- thermostats coming back -----

async def test_a_thermostat_turned_back_on_is_set_to_its_schedule(bench: Bench):
    """Summer over: the thermostat is turned back on; it gets its preset right away."""
    await start(bench)
    bench.thermostat("climate.salon", "comfort", state="off")
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "comfort", context=Context(user_id="someone"))  # back on, still comfort
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_a_thermostat_back_online_is_set_to_its_schedule(bench: Bench):
    """A Zigbee valve unavailable during a slot change catches up as soon as it is back."""
    await start(bench, "17:00")
    bench.thermostat("climate.salon", "eco", state="unavailable")
    await bench.go_to("17:30")  # comfort slot: the valve is away
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "eco")
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}


# As VTherm 10.5 publishes it: the reason is in specific_states
AUTO_STOPPED = {"specific_states": {"is_on": False, "hvac_off_reason": "hvac_off_auto_start_stop"}}
TURNED_OFF = {"specific_states": {"is_on": False, "hvac_off_reason": "hvac_off_manual"}}


async def start_vtherm(bench: Bench, hhmm: str) -> None:
    """climate.salon is a Versatile Thermostat: registered by its integration."""
    bench.needs("vtherm")
    bench.versatile_thermostat("climate.salon")
    await start(bench, hhmm)


# The first state Versatile Thermostat 10.5 writes at a restart, as recorded in a development HA:
# off, no setpoint, no preset (VTherm builds its presets once Home Assistant has started), no
# is_ready. VTherm 8.6.2 starts the same way.
VTHERM_STARTING = ("off", {"current_temperature": None, "temperature": None, "friendly_name": "Salon"})


async def restart(bench: Bench, state: str, attributes: dict) -> None:
    """Home Assistant restarts at 10:00 (eco). Chauffage realigns the thermostats once Home
    Assistant has started; climate.salon then shows `state` and `attributes` (#93)."""
    if bench.kind == "vtherm":
        bench.versatile_thermostat("climate.salon")
    await start(bench, "10:00")
    bench.hass.set_state(CoreState.starting)
    bench.hass.states.async_remove("climate.salon")  # a restart: no state yet
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    bench.runtime.pause = 0
    bench.hass.states.async_set("climate.salon", state, attributes)
    bench.hass.set_state(CoreState.running)
    bench.hass.bus.async_fire(EVENT_HOMEASSISTANT_STARTED)
    await bench.hass.async_block_till_done()


async def test_a_thermostat_without_setpoint_or_preset_at_start_gets_its_slot_once_it_shows_one(bench: Bench):
    """A thermostat that shows neither a setpoint nor a preset has not restored its state yet: a
    command sent then could be a temperature instead of its preset."""
    await restart(bench, "heat", {"friendly_name": "Salon"})
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "comfort", context=Context())
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_a_vtherm_restarting_gets_its_preset_not_a_temperature(bench: Bench):
    """The real startup of VTherm: its first state gets nothing, then it shows its presets and
    gets its preset. Before #93, it got 17 °C and kept it until its next slot."""
    bench.needs("vtherm")
    await restart(bench, *VTHERM_STARTING)
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "comfort", is_ready=True, context=Context())
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.temperature_calls == []
    assert bench.overrides() == {}


async def test_a_vtherm_before_version_9_gets_its_slot_once_it_shows_a_setpoint(bench: Bench):
    """VTherm 8 publishes no is_ready. A VTherm without presets configured shows only `none`:
    it gets the preset's temperature once it shows its setpoint."""
    bench.needs("vtherm")
    await restart(bench, *VTHERM_STARTING)
    assert bench.applied() == {}
    bench.hass.states.async_set("climate.salon", "heat", {"temperature": 20.0, "preset_mode": "none",
                                                          "preset_modes": ["none"]}, context=Context())
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.temperature_calls == [("climate.salon", 17.0)]


async def test_a_vtherm_that_says_it_is_not_ready_gets_its_slot_once_ready(bench: Bench):
    """VTherm 9 and later say when they are not ready (is_ready), for example while an underlying
    is unavailable."""
    bench.needs("vtherm")
    await restart(bench, "heat", {"temperature": 20.0, "is_ready": False})
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "comfort", is_ready=False, context=Context())  # presets built
    await bench.hass.async_block_till_done()
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "comfort", is_ready=True, context=Context())
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


async def test_an_override_on_a_thermostat_still_starting_is_sent_once_it_is_ready(bench: Bench):
    await restart(bench, "heat", {"friendly_name": "Salon"})
    await bench.set_override("climate.salon", bench.runtime.new_override("preset", "comfort", minutes=60))
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "eco", context=Context())
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_an_override_set_before_a_restart_is_sent_again_once_the_vtherm_is_ready(bench: Bench):
    await start_vtherm(bench, "10:00")
    await bench.set_override("climate.salon", bench.runtime.new_override("preset", "comfort", minutes=60))
    bench.applied()
    bench.hass.states.async_set("climate.salon", *VTHERM_STARTING)  # restarting: off, no setpoint
    await bench.hass.async_block_till_done()
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "eco", is_ready=True, context=Context())  # restored eco
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}
    assert "climate.salon" in bench.overrides()


async def test_a_thermostat_still_starting_gets_the_slot_that_started_meanwhile_once_ready(bench: Bench):
    """Its override expired and a new slot started while it was starting: it gets the new slot."""
    await restart(bench, "heat", {"friendly_name": "Salon"})
    await bench.set_override("climate.salon", bench.runtime.new_override("preset", "comfort", minutes=60))
    await bench.go_to("17:30")  # override expired, comfort slot
    assert bench.applied() == {}
    assert bench.overrides() == {}
    bench.thermostat("climate.salon", "eco", context=Context())
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_a_vtherm_no_longer_ready_is_not_an_override(bench: Bench):
    """Whatever a VTherm shows while it is not ready, it is not a change by hand."""
    await start_vtherm(bench, "10:00")
    bench.thermostat("climate.salon", "none", 22.0, is_ready=False, context=Context(user_id="someone"))
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.applied() == {}


async def test_a_vtherm_stopped_by_auto_start_stop_still_gets_its_slots(bench: Bench):
    """VTherm's auto start/stop turns it off when the room needs no heating for a while. VTherm
    keeps the preset asked and starts again when that preset needs heating: it must get the
    next slots while it is off (#74)."""
    await start_vtherm(bench, "17:00")
    bench.thermostat("climate.salon", "eco", state="off", **AUTO_STOPPED)
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}
    assert bench.overrides() == {}


async def test_a_vtherm_starting_again_after_auto_start_stop_is_not_an_override(bench: Bench):
    await start_vtherm(bench, "17:30")
    bench.thermostat("climate.salon", "comfort", state="off", **AUTO_STOPPED)
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "comfort", context=Context())  # started again by VTherm
    await bench.hass.async_block_till_done()
    assert bench.applied() == {}
    assert bench.overrides() == {}


async def test_a_preset_picked_on_a_vtherm_stopped_by_auto_start_stop_is_an_override(bench: Bench):
    await start_vtherm(bench, "10:00")
    bench.thermostat("climate.salon", "eco", state="off", **AUTO_STOPPED)
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "comfort", state="off", context=Context(user_id="someone"), **AUTO_STOPPED)
    await bench.hass.async_block_till_done()
    override = bench.overrides()["climate.salon"]
    assert (override["kind"], override["value"]) == ("preset", "comfort")


async def test_a_vtherm_turned_off_by_hand_still_gets_its_slots(bench: Bench):
    """VTherm keeps the preset asked while it is off, whatever turned it off, and stays off: the
    slot is waiting when it is turned back on."""
    await start_vtherm(bench, "17:00")
    bench.thermostat("climate.salon", "eco", state="off", **TURNED_OFF)
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}


# Versatile Thermostat 10.5 with a window sensor, as recorded in a development HA (#92). With the
# "Frost protection" action, an open window sets the frost setpoint and keeps the preset. With
# the "Turn off" action, it turns the VTherm off. The setpoint and preset asked are kept in
# requested_state.
TEMPERATURE_SLOTS = {"eco": {"temperature": 17.5}, "comfort": {"temperature": 19.0}}


def vtherm_window(bench: Bench, asked: float, shown: float, state: str = "heat") -> None:
    """climate.salon, a VTherm on a temperature slot (`asked`), shows `shown`: VTherm changed it
    by itself, for example for an open window."""
    bench.thermostat(
        "climate.salon", "none", shown, state=state, context=Context(),
        current_state={"hvac_mode": state, "target_temperature": shown, "preset": "none"},
        requested_state={"hvac_mode": "heat", "target_temperature": asked, "preset": "none"},
    )


async def start_vtherm_on_temperature_slots(bench: Bench, hhmm: str) -> None:
    await start_vtherm(bench, hhmm)
    await bench.runtime.set_mapping("climate.salon", TEMPERATURE_SLOTS)
    await bench.hass.async_block_till_done()
    bench.applied()


async def test_a_vtherm_window_lowering_the_setpoint_of_a_temperature_slot_is_not_an_override(bench: Bench):
    await start_vtherm_on_temperature_slots(bench, "10:00")
    vtherm_window(bench, asked=17.5, shown=7.0)  # window open
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    vtherm_window(bench, asked=17.5, shown=17.5)  # window closed
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}
    assert bench.applied() == {}


async def test_a_slot_change_while_a_vtherm_window_is_open_is_kept_once_it_closes(bench: Bench):
    """Before #92, the window made an override, so the next slot was not sent. Once the window
    closed, the old slot's setpoint became a 2-hour override."""
    await start_vtherm_on_temperature_slots(bench, "17:00")
    vtherm_window(bench, asked=17.5, shown=7.0)
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "19.0"}
    vtherm_window(bench, asked=19.0, shown=7.0)  # VTherm keeps the frost setpoint
    await bench.hass.async_block_till_done()
    vtherm_window(bench, asked=19.0, shown=19.0)  # window closed
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}


async def test_a_setpoint_changed_by_hand_while_a_vtherm_window_is_open_is_an_override(bench: Bench):
    await start_vtherm_on_temperature_slots(bench, "10:00")
    vtherm_window(bench, asked=17.5, shown=7.0)
    await bench.hass.async_block_till_done()
    vtherm_window(bench, asked=21.0, shown=7.0)  # the knob, while VTherm keeps the frost setpoint
    await bench.hass.async_block_till_done()
    override = bench.overrides()["climate.salon"]
    assert (override["kind"], override["value"]) == ("temperature", 21.0)


async def test_a_vtherm_turned_off_by_its_window_is_not_an_override(bench: Bench):
    await start_vtherm_on_temperature_slots(bench, "17:00")
    vtherm_window(bench, asked=17.5, shown=17.5, state="off")  # window open
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "19.0"}
    vtherm_window(bench, asked=19.0, shown=19.0, state="off")
    await bench.hass.async_block_till_done()
    vtherm_window(bench, asked=19.0, shown=19.0)  # window closed
    await bench.hass.async_block_till_done()
    assert bench.overrides() == {}


async def test_a_vtherm_is_recognized_by_its_integration_not_by_its_attributes(bench: Bench):
    """VTherm moved hvac_off_reason once, and publishes none right after being turned off. A
    thermostat of another integration with the same attributes is left alone."""
    await start_vtherm(bench, "17:00")
    bench.thermostat("climate.salon", "eco", state="off")  # no attribute of VTherm's
    bench.thermostat("climate.bureau", "eco", state="off", hvac_off_reason="hvac_off_manual", **TURNED_OFF)
    await bench.save_weeks({**SCHEDULES, "climate.bureau": SCHEDULES["climate.salon"]})
    bench.applied()
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_an_override_on_a_turned_off_vtherm_is_sent_at_once(bench: Bench):
    await start_vtherm(bench, "10:00")
    bench.thermostat("climate.salon", "eco", state="off", **TURNED_OFF)
    await bench.hass.async_block_till_done()
    await bench.set_override("climate.salon", bench.runtime.new_override("preset", "comfort", minutes=60))
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_an_override_on_a_turned_off_thermostat_waits_until_it_is_turned_back_on(bench: Bench):
    """A thermostat that is not a VTherm could turn heating back on when it gets the override."""
    await start(bench, "10:00")
    bench.thermostat("climate.salon", "eco", state="off")
    await bench.hass.async_block_till_done()
    await bench.set_override("climate.salon", bench.runtime.new_override("preset", "comfort", minutes=60))
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "eco", context=Context(user_id="someone"))  # turned back on
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_an_override_on_an_unavailable_thermostat_is_sent_when_it_is_back_online(bench: Bench):
    """A Zigbee valve away when the override is set gets it as soon as it is back."""
    await start(bench, "10:00")
    bench.thermostat("climate.salon", "eco", state="unavailable")
    await bench.hass.async_block_till_done()
    await bench.set_override("climate.salon", bench.runtime.new_override("preset", "comfort", minutes=60))
    assert bench.applied() == {}
    bench.thermostat("climate.salon", "eco")  # back online
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_a_thermostat_turned_off_that_is_not_a_vtherm_is_left_alone(bench: Bench):
    """Tado, evohome or Netatmo turn heating back on when they get a setpoint."""
    await start(bench, "17:00")
    bench.thermostat("climate.salon", "eco", state="off")
    await bench.go_to("17:30")
    assert bench.applied() == {}


async def test_a_thermostat_coming_back_keeps_its_override(bench: Bench):
    """Back online on its override, it gets nothing: not its slot, not the override again."""
    await start(bench)
    await bench.manual_setpoint("climate.salon", 22)
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 22, state="unavailable")
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", MANUAL_PRESET[bench.kind], 22)
    await bench.hass.async_block_till_done()
    assert bench.applied() == {}
    assert bench.overrides()["climate.salon"]["value"] == 22


# ----- failed commands -----

async def test_a_failed_command_is_retried_the_next_minutes(bench: Bench):
    """NWK_NO_ROUTE: the valve did not get the command; it is sent again every minute."""
    await start(bench, "17:00")
    bench.unreachable.add("climate.salon")
    await bench.go_to("17:30")
    assert bench.applied() == {"climate.salon": "comfort"}  # tried, failed
    await bench.go_to("17:31")
    assert bench.applied() == {"climate.salon": "comfort"}  # tried again
    bench.unreachable.clear()
    await bench.go_to("17:32")
    assert bench.applied() == {"climate.salon": "comfort"}  # delivered
    bench.thermostat("climate.salon", "comfort", context=None)
    await bench.go_to("17:33")
    assert bench.applied() == {}  # done: no more retries


# ----- missed minutes -----

async def test_a_slot_starting_during_a_missed_minute_is_applied(bench: Bench):
    """HA busy (or the clock jumping): the minute of the slot start is skipped."""
    await start(bench, "17:28")
    target = dt_util.as_utc(datetime(2026, 10, 12, 17, 31, tzinfo=ZoneInfo("Europe/Paris")))
    bench.freezer.move_to(target)
    async_fire_time_changed(bench.hass, target)  # 17:29 and 17:30 never ticked
    await bench.hass.async_block_till_done()
    assert bench.applied() == {"climate.salon": "comfort"}


def test_spring_forward_a_slot_in_the_skipped_hour_is_applied_at_3_00():
    """Last Sunday of March: 02:00 → 03:00; a 02:30 slot happens at 03:00."""
    paris = ZoneInfo("Europe/Paris")
    week = [[["00:00", "eco"], ["02:30", "comfort"]]] * 7
    plan = engine.Plan({"climate.salon": {"normal": week}}, "normal",
                       {lv["id"]: lv for lv in model.default_presets("en")}, {}, {})
    thermostat = engine.Thermostat("heat", "eco", 17.0, ("eco", "comfort"))
    before = datetime(2027, 3, 28, 1, 59, tzinfo=paris)
    after = (before.astimezone(ZoneInfo("UTC")) + timedelta(minutes=1)).astimezone(paris)  # 03:00 local
    assert after.strftime("%H:%M") == "03:00"
    targets = engine.targets(plan, after, {"climate.salon": thermostat}, since=before)
    assert targets == [("climate.salon", engine.Target("preset", "comfort"))]


# ----- week and DST boundaries -----

async def test_sunday_to_monday(bench: Bench):
    """Sunday's last slot (23:00 eco) then Monday morning (06:30 comfort)."""
    await start(bench, "22:59", day=6)
    bench.thermostat("climate.salon", "comfort")
    await bench.go_to("23:00", day=6)
    assert bench.applied() == {"climate.salon": "eco"}
    bench.thermostat("climate.salon", "eco")  # the thermostat applied it
    await bench.go_to("06:30", day=7)
    assert bench.applied() == {"climate.salon": "comfort"}


def test_fall_back_the_repeated_hour_changes_nothing():
    """Last Sunday of October: 03:00 → 02:00; the planned preset stays right."""
    paris = ZoneInfo("Europe/Paris")
    week = [[["00:00", "eco"], ["06:30", "comfort"]]] * 7
    first = datetime(2026, 10, 25, 2, 30, tzinfo=paris, fold=0)
    second = datetime(2026, 10, 25, 2, 30, tzinfo=paris, fold=1)
    assert engine.current_and_next(week, first)[:2] == ("eco", "comfort")
    assert engine.current_and_next(week, second)[2] == datetime(2026, 10, 25, 6, 30, tzinfo=paris)


# ----- restarts -----

async def test_overrides_survive_a_restart(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["value"] == 21


async def test_an_override_that_ended_while_home_assistant_was_stopped(bench: Bench, hass_storage):
    stored = json.loads((FIXTURES / "store-v2.json").read_text(encoding="utf-8"))  # override until 11:30
    hass_storage["chauffage"] = stored
    await bench.go_to("12:00")
    bench.thermostat("climate.salon", "comfort")
    await bench.setup()
    await bench.go_to("12:01")
    assert bench.applied() == {"climate.salon": "eco"}
    assert bench.overrides() == {}


# ----- watching -----

async def test_a_change_on_the_thermostat_itself_is_an_override(bench: Bench):
    """A knob turned on the valve: no user, no automation."""
    bench.needs("vtherm", "plain")
    await start(bench)
    bench.thermostat("climate.salon", "none" if bench.kind == "vtherm" else "eco", 22, context=Context())
    await bench.hass.async_block_till_done()
    assert bench.overrides()["climate.salon"]["value"] == 22


