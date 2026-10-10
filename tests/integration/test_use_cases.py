"""Use cases found missing by the functional analysis (docs/use-cases.md): thermostats coming
back, failed commands retried, missed minutes, week and DST boundaries, restarts."""

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from homeassistant.core import Context
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from conftest import KINDS, WEEKDAY, WEEKEND, Bench, every_day
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
    await bench.save_schedules(SCHEDULES)
    bench.applied()


# ----- thermostats coming back -----

async def test_a_thermostat_turned_back_on_is_set_to_its_schedule(bench: Bench):
    """Summer over: the thermostat is turned back on; it gets its level right away."""
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


async def test_a_thermostat_coming_back_keeps_its_override(bench: Bench):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 22)
    bench.thermostat("climate.salon", "eco", state="unavailable")
    await bench.hass.async_block_till_done()
    bench.thermostat("climate.salon", "eco")
    await bench.hass.async_block_till_done()
    assert bench.applied() == {}


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
                       {lv["id"]: lv for lv in model.default_levels("en")}, {}, {})
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
    """Last Sunday of October: 03:00 → 02:00; the planned level stays right."""
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


async def test_a_thermostat_removed_from_the_schedules_is_no_longer_watched(bench: Bench):
    await start(bench)
    bench.thermostat("climate.bureau", "eco")
    await bench.save_schedules({"climate.bureau": {"normal": every_day(("00:00", "eco"))}})
    await bench.manual_setpoint("climate.salon", 22)
    assert bench.overrides() == {}
