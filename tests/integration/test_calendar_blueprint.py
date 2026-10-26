"""The calendar blueprint (blueprints/automation/chauffage/calendar_schedule.yaml): it writes the
schedule of the running calendar event into a text helper, read by an activation rule. When events
overlap, the one that started last wins; titles that name no schedule are ignored (README,
"Example: a calendar of schedules"; docs/decisions.md, "Activation rules").

The real blueprint runs in an automation; `calendar.get_events` is replaced by the events of each
test, as the bench does for the climate services."""

import asyncio
import shutil
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from homeassistant.core import ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from conftest import MONDAY, Bench

BLUEPRINT = Path(__file__).parents[2] / "blueprints/automation/chauffage/calendar_schedule.yaml"
CALENDAR = "calendar.chauffage"
HELPER = "input_text.calendar_schedule"
AUTOMATION = "automation.calendar_schedule"


@pytest.fixture
def expected_lingering_timers() -> bool:
    """The automation waits for the next event boundary, or the next reading of the calendar."""
    return True


class Calendar:
    """The events `calendar.get_events` returns: those overlapping the window asked for."""

    def __init__(self) -> None:
        self.events: list[dict] = []
        self.unreachable = False

    def add(self, summary: str, start: str, end: str) -> None:
        """An event, from day/time texts: "1 18:00" (Tuesday 18:00), or a day alone "1" (all day)."""
        self.events.append({"summary": summary, "start": moment(start), "end": moment(end)})

    async def get_events(self, call: ServiceCall) -> dict:
        if self.unreachable:
            raise HomeAssistantError("Unable to connect to the calendar (simulated)")
        start = dt_util.now()
        end = start + cv.time_period(call.data["duration"])
        return {CALENDAR: {"events": [e for e in self.events if overlaps(e, start, end)]}}


def moment(text: str) -> str:
    """ "1 18:00" → Tuesday 18:00 as the calendar gives it (ISO, with offset); "1" → Tuesday's date."""
    day, _, hhmm = text.partition(" ")
    if not hhmm:
        return (MONDAY.date() + timedelta(days=int(day))).isoformat()
    h, m = (int(x) for x in hhmm.split(":"))
    return (MONDAY + timedelta(days=int(day), hours=h, minutes=m)).isoformat()


def as_time(text: str) -> datetime:
    if "T" in text:
        return datetime.fromisoformat(text)
    return datetime.combine(date.fromisoformat(text), datetime.min.time(), MONDAY.tzinfo)


def overlaps(event: dict, start: datetime, end: datetime) -> bool:
    return as_time(event["start"]) < end and as_time(event["end"]) > start


async def at(bench: Bench, text: str) -> None:
    """Move the clock to "day HH:MM[:SS]" and let HA react (timers and the time pattern)."""
    day, hhmm = text.split(" ")
    h, m, *s = (int(x) for x in hhmm.split(":"))
    target = dt_util.as_utc(MONDAY + timedelta(days=int(day), hours=h, minutes=m, seconds=s[0] if s else 0))
    bench.freezer.move_to(target)
    async_fire_time_changed(bench.hass, target)
    await settle(bench)


async def settle(bench: Bench) -> None:
    """Let HA react. While the automation waits for the next boundary, `async_block_till_done` would
    wait for that wait too: let the loop run instead."""
    for _ in range(100):
        await asyncio.sleep(0)
        automation = bench.hass.states.get(AUTOMATION)
        if automation is None or not automation.attributes.get("current"):
            await bench.hass.async_block_till_done()
            return


@pytest.fixture
async def calendar(bench: Bench, tmp_path):
    """The integration with its three schedules (Normal, Away, Holiday), a rule reading the helper
    with Normal as the default, and an automation from the blueprint on the calendar."""
    hass = bench.hass
    await at(bench, "0 10:01")  # the next reading of the calendar is at 10:05
    await bench.setup()
    await bench.runtime.set_rules([{"template": "{{ states('%s') }}" % HELPER, "schedule": None}], "normal")
    cal = Calendar()
    hass.services.async_register("calendar", "get_events", cal.get_events, supports_response=SupportsResponse.ONLY)
    hass.states.async_set(CALENDAR, "off")
    hass.config.config_dir = str(tmp_path)
    shutil.copytree(BLUEPRINT.parent, tmp_path / "blueprints/automation/chauffage")
    assert await async_setup_component(hass, "input_text", {"input_text": {"calendar_schedule": {}}})
    assert await async_setup_component(hass, "automation", {"automation": {
        "id": "calendar_schedule",
        "alias": "Calendar schedule",
        "use_blueprint": {"path": "chauffage/calendar_schedule.yaml",
                          "input": {"calendar_entity": CALENDAR, "text_entity": HELPER}}}})
    await hass.async_block_till_done()
    yield cal
    # Stops the run waiting for a boundary, before the integration is unloaded
    await hass.services.async_call("automation", "turn_off", {"entity_id": AUTOMATION}, blocking=True)


async def edit(bench: Bench, calendar: Calendar, state: str = "on") -> None:
    """The calendar's own state changes, as when its current or next event is edited."""
    bench.hass.states.async_set(CALENDAR, state, {"message": calendar.events[0]["summary"]})
    await settle(bench)


def helper(bench: Bench) -> str:
    return bench.hass.states.get(HELPER).state


def active(bench: Bench) -> str:
    return bench.runtime.data["active_schedule"]


async def test_an_evening_away_inside_holidays_wins_then_holidays_resume(bench: Bench, calendar: Calendar):
    calendar.add("Holiday", "0", "3")
    calendar.add("Away", "1 18:02", "1 20:03")  # between two readings of the calendar
    await edit(bench, calendar)
    assert (helper(bench), active(bench)) == ("Holiday", "holiday")
    await at(bench, "1 18:00")
    assert active(bench) == "holiday"
    await at(bench, "1 18:02:01")
    assert (helper(bench), active(bench)) == ("Away", "away")
    await at(bench, "1 20:00")
    await at(bench, "1 20:03:01")
    assert (helper(bench), active(bench)) == ("Holiday", "holiday")


async def test_between_events_the_default_schedule_applies(bench: Bench, calendar: Calendar):
    calendar.add("Away", "0 12:00", "0 14:00")
    await edit(bench, calendar, "off")
    assert (helper(bench), active(bench)) == ("", "normal")
    await at(bench, "0 11:56")
    await at(bench, "0 12:00:01")
    assert active(bench) == "away"
    await at(bench, "0 13:56")
    await at(bench, "0 14:00:01")
    assert (helper(bench), active(bench)) == ("", "normal")


async def test_an_event_named_after_no_schedule_is_ignored(bench: Bench, calendar: Calendar):
    calendar.add("Holiday", "0", "3")
    calendar.add("Dentist", "0 09:00", "0 12:00")
    await edit(bench, calendar)
    assert (helper(bench), active(bench)) == ("Holiday", "holiday")


async def test_a_title_as_an_id_or_in_capitals_names_its_schedule(bench: Bench, calendar: Calendar):
    await bench.set_schedules([{"id": s, "name": n} for s, n in bench.schedule_list()]
                              [:2] + [{"id": "holiday", "name": "Vacances"}])  # renamed: its id stays
    calendar.add(" VACANCES ", "0 09:00", "0 11:00")
    calendar.add("holiday", "0 10:32", "0 12:00")
    calendar.add("Away", "0 10:31", "0 12:00")
    await edit(bench, calendar)
    assert active(bench) == "holiday"
    await at(bench, "0 10:30")
    await at(bench, "0 10:31:01")
    assert active(bench) == "away"
    await at(bench, "0 10:32:01")
    assert (helper(bench), active(bench)) == ("holiday", "holiday")


async def test_an_event_added_while_running_is_seen_at_the_next_reading(bench: Bench, calendar: Calendar):
    calendar.add("Holiday", "0", "3")
    await edit(bench, calendar)
    calendar.add("Away", "0 09:00", "0 12:00")  # the calendar's own state does not change
    await at(bench, "0 10:04")
    assert active(bench) == "holiday"
    await at(bench, "0 10:05")
    assert (helper(bench), active(bench)) == ("Away", "away")


async def test_a_schedule_created_while_its_event_runs_is_followed_at_once(bench: Bench, calendar: Calendar):
    calendar.add("remote_work", "0 09:00", "0 12:00")  # its id, before the schedule exists
    await edit(bench, calendar)
    assert (helper(bench), active(bench)) == ("", "normal")
    await bench.set_schedules([{"id": s, "name": n} for s, n in bench.schedule_list()] + [{"name": "Remote work"}])
    await settle(bench)
    assert (helper(bench), active(bench)) == ("remote_work", "remote_work")


async def test_an_all_day_event_follows_local_midnight(bench: Bench, calendar: Calendar):
    calendar.add("Holiday", "1", "2")  # Tuesday
    await edit(bench, calendar)
    await at(bench, "0 23:56")
    assert active(bench) == "normal"
    await at(bench, "1 00:00:01")
    assert active(bench) == "holiday"
    await at(bench, "1 23:56")
    await at(bench, "2 00:00:01")
    assert active(bench) == "normal"


async def test_a_calendar_that_cannot_be_read_leaves_the_schedule(bench: Bench, calendar: Calendar):
    calendar.add("Holiday", "0", "3")
    await edit(bench, calendar)
    calendar.unreachable = True
    await at(bench, "0 10:05")
    assert (helper(bench), active(bench)) == ("Holiday", "holiday")
