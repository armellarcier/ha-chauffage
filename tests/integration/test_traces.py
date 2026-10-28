"""What Chauffage does to the thermostats, and why, kept for analyses across integrations (#49):
every command sent and every override in the log (INFO), the overrides and the schedules
activated in the logbook, the stored data in the diagnostics."""

import logging
from pathlib import Path
import re

import pytest
from homeassistant.core import Context, Event, callback

from conftest import CTX_USER, KINDS, WEEKDAY, Bench, every_day
from custom_components.chauffage import diagnostics, logbook

LOGGER = "custom_components.chauffage.runtime"
COMPONENT = Path(__file__).parents[2] / "custom_components" / "chauffage"
WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": every_day(("00:00", "frost"))}}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


@pytest.fixture
def log(caplog):
    """The INFO messages of the scheduler since the previous call."""
    caplog.set_level(logging.INFO, logger=LOGGER)

    def read() -> list[str]:
        messages = [r.getMessage() for r in caplog.records if r.name == LOGGER and r.levelno == logging.INFO]
        caplog.clear()
        return messages
    return read


def sent(messages: list[str]) -> list[str]:
    """Why each command was sent (the text in brackets)."""
    return [m.split(" sent (", 1)[1].split("; not applied yet")[0].removesuffix(")") for m in messages if " sent (" in m]


async def start(bench: Bench, hhmm: str = "06:00") -> None:
    await bench.go_to(hhmm)
    bench.thermostat("climate.salon", "eco")
    await bench.setup()
    await bench.save_weeks(WEEKS)
    bench.applied()


async def service(bench: Bench, name: str, **data) -> None:
    await bench.hass.services.async_call("chauffage", name, data, blocking=True)
    await bench.hass.async_block_till_done()


# ----- commands -----

async def test_a_command_sent_at_a_new_slot_is_logged_with_its_slot(bench: Bench, log):
    await start(bench)
    log()
    await bench.go_to("06:30")
    (message,) = log()
    assert message.startswith("climate.salon: ")
    assert sent([message]) == ["new slot, comfort of schedule normal"]


async def test_a_realignment_logs_what_caused_it(bench: Bench, log):
    await start(bench, "07:00")  # comfort: saving the weeks sent it
    await bench.activate_schedule("Away")
    assert sent(log()) == ["weeks saved, comfort of schedule normal", "schedule away activated (entity), frost of schedule away"]


async def test_an_override_and_its_end_are_logged(bench: Bench, log):
    await start(bench, "10:00")
    log()
    await bench.manual_setpoint("climate.salon", 21.5)
    change, started = log()
    assert change.startswith("climate.salon: changed by a user (heat, ")
    assert "setpoint 17.0 → 21.5" in change
    assert started == "climate.salon: override started by thermostat: temperature 21.5 until 2026-10-12T12:00:00+02:00"
    await bench.go_to("12:00")
    ended, command = log()
    assert ended == "climate.salon: override ended (expired): temperature 21.5"
    assert sent([command]) == ["override ended (expired), eco of schedule normal"]


async def test_an_override_from_a_service_and_its_removal_are_logged(bench: Bench, log):
    await start(bench, "10:00")
    log()
    await service(bench, "set_override", entity_id="climate.salon", preset="boost")
    command, started = log()
    assert sent([command]) == ["override set by service"]
    assert started.startswith("climate.salon: override started by service: ")
    await service(bench, "clear_override", entity_id="climate.salon")
    ended, command = log()
    assert ended.startswith("climate.salon: override ended (service): ")
    assert sent([command]) == ["override ended (service), eco of schedule normal"]


async def test_an_override_extended_is_logged(bench: Bench, log):
    await start(bench, "10:00")
    await bench.manual_setpoint("climate.salon", 21.5)
    log()
    override = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**override, "end": "2026-10-12T14:00:00+02:00"})
    assert log() == ["climate.salon: override until 2026-10-12T14:00:00+02:00, set by card"]


async def test_going_back_to_the_slot_on_the_thermostat_is_logged(bench: Bench, log):
    await start(bench, "10:00")
    await bench.manual_setpoint("climate.salon", 21.5)
    log()
    bench.thermostat("climate.salon", "eco", context=CTX_USER)
    await bench.hass.async_block_till_done()
    change, ended = log()
    assert change.startswith("climate.salon: changed by a user (heat, ")
    assert change.endswith("back to its slot")
    assert ended == "climate.salon: override ended (thermostat): temperature 21.5"


async def test_a_thermostat_back_online_and_a_retry_are_logged(bench: Bench, log):
    await start(bench)
    bench.thermostat("climate.salon", "eco", state="unavailable")
    await bench.hass.async_block_till_done()
    bench.unreachable.add("climate.salon")
    bench.thermostat("climate.salon", "frost")
    await bench.hass.async_block_till_done()
    bench.unreachable.clear()
    await bench.advance(1)
    assert sent(log()) == ["back from unavailable, eco of schedule normal",
                           "retry after a failed command, eco of schedule normal"]


async def test_a_command_sent_again_and_one_applied_late_are_logged(bench: Bench, log):
    """The traces of #50: a battery valve that applies its commands hours later."""
    await start(bench)
    bench.slow.add("climate.salon")
    await bench.go_to("06:30")
    log()
    await bench.go_to("08:30")
    (command,) = log()
    assert sent([command]) == ["new slot, eco of schedule normal"]
    assert "; not applied yet: " in command and " sent at 06:30:00" in command
    await bench.go_to("09:16")
    await bench.applies_late("climate.salon", "comfort")
    (late,) = log()
    assert late.startswith("climate.salon: applied late a command sent at 06:30:00 (")
    assert late.endswith("): not an override, a newer command is not applied yet")
    await bench.applies_late("climate.salon", "eco")
    (late,) = log()
    assert late.endswith("): not an override, set back to its slot")


# ----- logbook -----

def describers(bench: Bench) -> dict:
    found = {}
    logbook.async_describe_events(bench.hass, lambda domain, event_type, describe: found.update({event_type: describe}))
    return found


def described(bench: Bench, event_type: str, **data) -> dict:
    return describers(bench)[event_type](Event(event_type, data))


async def test_the_logbook_tells_an_override_with_where_it_came_from_and_why_it_ended(bench: Bench):
    await start(bench, "10:00")
    bench.hass.states.async_set("climate.salon", "heat", {"friendly_name": "Salon"})
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", kind="preset",
                     value="boost", preset="boost", end="2026-10-12T12:00:00+02:00", source="service") == {
        "name": "Salon", "message": "override started: Boost until 12:00 (by a service)", "entity_id": "climate.salon"}
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", kind="temperature",
                     value=21.5, preset=None, end="2026-10-12T12:00:00+02:00", source="thermostat")["message"] \
        == "override started: 21.5 °C until 12:00 (changed by hand)"
    assert described(bench, "chauffage_override_ended", entity_id="climate.salon", reason="expired")["message"] \
        == "override ended (expired)"


async def test_the_logbook_tells_a_schedule_activated_in_the_select_s_logbook(bench: Bench):
    """Next to the select's change ("Schedule → Away"), what activated it."""
    await start(bench)
    select = bench.schedule_entity
    assert described(bench, "chauffage_schedule_activated", schedule="away", schedule_name="Away",
                     previous_schedule="normal", source="rules", entity_id=select) == {
        "name": bench.hass.states.get(select).name, "message": "Away activated (by the activation rules)",
        "entity_id": select}


async def test_the_events_carry_the_context_of_what_caused_them(bench: Bench, hass_admin_user):
    """The logbook then says who: the user who changed the thermostat, called the service or
    picked the schedule."""
    await start(bench, "10:00")
    contexts = []

    @callback  # in the order fired (a plain function runs as a job, in any order)
    def listen(event: Event) -> None:
        contexts.append((event.event_type, event.context.user_id))
    for event_type in ("chauffage_override_started", "chauffage_override_ended", "chauffage_schedule_activated"):
        bench.hass.bus.async_listen(event_type, listen)
    await bench.manual_setpoint("climate.salon", 21.5)  # CTX_USER
    user = Context(user_id=hass_admin_user.id)
    await bench.hass.services.async_call("chauffage", "clear_override", {"entity_id": "climate.salon"},
                                         blocking=True, context=user)
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 22},
                                         blocking=True, context=user)
    await bench.hass.services.async_call("select", "select_option", {"entity_id": bench.schedule_entity, "option": "Away"},
                                         blocking=True, context=user)
    await bench.hass.async_block_till_done()
    assert contexts == [
        ("chauffage_override_started", "test-user"),
        ("chauffage_override_ended", user.user_id),
        ("chauffage_override_started", user.user_id),
        ("chauffage_schedule_activated", user.user_id),
    ]


async def test_the_logbook_speaks_the_language_of_home_assistant(bench: Bench):
    bench.hass.config.language = "fr"
    await start(bench)
    assert described(bench, "chauffage_override_ended", entity_id="climate.salon", reason="card")["message"] \
        == "dérogation terminée (retirée depuis la carte)"


def test_every_source_and_reason_in_the_code_has_a_logbook_text_in_every_language():
    """A new source of overrides or schedules, or a new reason for an override to end, is told
    in the logbook (CONTRIBUTING.md, "Conventions")."""
    code = "\n".join(p.read_text(encoding="utf-8") for p in COMPONENT.glob("*.py"))
    sources = set(re.findall(r'source="(\w+)"', code))
    reasons = set(re.findall(r'_drop_override\([^,()]+, "(\w+)"\)', code)) | {"card", "service", "thermostat"}
    assert {"card", "service", "entity", "rules", "thermostat"} <= sources  # the scan finds them
    assert {"paused", "forgotten", "expired"} <= reasons
    for language, texts in logbook.TEXTS.items():
        assert sources <= set(texts["sources"]), language
        assert reasons <= set(texts["reasons"]), language
        assert texts.keys() == logbook.TEXTS["en"].keys(), language


# ----- diagnostics -----

async def test_the_diagnostics_hold_the_stored_data_and_the_thermostats_now(bench: Bench):
    await start(bench, "10:00")
    await bench.manual_setpoint("climate.salon", 21.5)
    found = await diagnostics.async_get_config_entry_diagnostics(bench.hass, bench.entry)
    assert found["data"]["overrides"]["climate.salon"]["value"] == 21.5
    assert "climate.salon" in found["data"]["thermostats"]
    assert found["states"]["climate.salon"]["attributes"]["temperature"] == 21.5
    assert found["retry"] == []
    assert found["options"] == {}
