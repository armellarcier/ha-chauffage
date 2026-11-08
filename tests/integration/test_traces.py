"""What Chauffage does to the thermostats, and why, kept for analyses across integrations (#49):
every command sent and every override in the log (INFO), the overrides and the schedules
activated in the logbook, the stored data in the diagnostics."""

import logging
from pathlib import Path
import re

import pytest
from homeassistant.core import Context, Event, callback

from conftest import CTX_USER, KINDS, WEEKDAY, Bench, every_day
from custom_components.chauffage import diagnostics, logbook, websocket

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


async def test_a_thermostat_set_to_its_slot_once_ready_is_logged(bench: Bench, log):
    await start(bench)
    bench.hass.states.async_set("climate.salon", "heat", {"friendly_name": "Salon"})
    await bench.hass.async_block_till_done()
    log()
    bench.thermostat("climate.salon", "comfort", context=Context())
    await bench.hass.async_block_till_done()
    assert sent(log()) == ["thermostat ready, eco of schedule normal"]


async def test_a_vtherm_set_to_its_slot_once_ready_is_logged(bench: Bench, log):
    """A VTherm still starting is `off`: it is ready, not back from off."""
    bench.needs("vtherm")
    bench.versatile_thermostat("climate.salon")
    await start(bench)
    bench.hass.states.async_set("climate.salon", "off", {"temperature": None})
    await bench.hass.async_block_till_done()
    log()
    bench.thermostat("climate.salon", "comfort", is_ready=True, context=Context())
    await bench.hass.async_block_till_done()
    assert sent(log()) == ["thermostat ready, eco of schedule normal"]


async def test_a_vtherm_back_online_is_logged_as_back_online(bench: Bench, log):
    """An unavailable VTherm publishes no attribute, so no is_ready either."""
    bench.needs("vtherm")
    bench.versatile_thermostat("climate.salon")
    await start(bench)
    bench.hass.states.async_set("climate.salon", "unavailable", {})
    await bench.hass.async_block_till_done()
    log()
    bench.thermostat("climate.salon", "comfort", is_ready=True)
    await bench.hass.async_block_till_done()
    assert sent(log()) == ["back from unavailable, eco of schedule normal"]


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
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", target={"preset_mode": "boost"},
                     preset="boost", end="2026-10-12T12:00:00+02:00", source="service") == {
        "name": "Salon", "message": "override started: Boost until Monday 12:00 (by a service)", "entity_id": "climate.salon"}
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", target={"temperature": 21.5},
                     preset=None, end="2026-10-12T12:00:00+02:00", source="thermostat")["message"] \
        == "override started: 21.5 °C until Monday 12:00 (changed by hand)"
    assert described(bench, "chauffage_override_ended", entity_id="climate.salon", reason="expired")["message"] \
        == "override ended (expired)"


async def test_the_logbook_tells_an_override_that_turns_the_thermostat_off_or_on(bench: Bench):
    """An off override says off, and the preset the thermostat restarts on, if any (#91)."""
    await start(bench, "10:00")
    bench.hass.states.async_set("climate.salon", "heat", {"friendly_name": "Salon"})
    base = {"entity_id": "climate.salon", "preset": None, "end": "2026-10-12T12:00:00+02:00", "source": "thermostat"}
    assert described(bench, "chauffage_override_started", **base, target={"hvac_mode": "off"})["message"] \
        == "override started: off until Monday 12:00 (changed by hand)"
    assert described(bench, "chauffage_override_started", **{**base, "preset": "boost"}, target={"hvac_mode": "off", "preset_mode": "boost"})["message"] \
        == "override started: off, Boost until Monday 12:00 (changed by hand)"
    assert described(bench, "chauffage_override_started", **base, target={"hvac_mode": "cool", "temperature": 24.0})["message"] \
        == "override started: cool, 24 °C until Monday 12:00 (changed by hand)"
    assert described(bench, "chauffage_override_started", **base, target={"hvac_mode": "heat"})["message"] \
        == "override started: heat until Monday 12:00 (changed by hand)"
    bench.hass.config.language = "fr"
    assert described(bench, "chauffage_override_started", **{**base, "preset": "eco"}, target={"hvac_mode": "off", "preset_mode": "eco"})["message"] \
        == "dérogation : arrêt, Eco jusqu'à lundi 12:00 (changée à la main)"


async def test_the_logbook_tells_an_override_that_sets_the_fan_the_vanes_or_the_cooling_setpoint(bench: Bench):
    """A target without preset, temperature or HVAC mode still gets a text (#91, lot 3)."""
    await start(bench, "10:00")
    bench.hass.states.async_set("climate.salon", "cool", {"friendly_name": "Salon"})
    base = {"entity_id": "climate.salon", "preset": None, "end": "2026-10-12T12:00:00+02:00", "source": "card"}
    assert described(bench, "chauffage_override_started", **base, target={"fan_mode": "3"})["message"] \
        == "override started: fan 3 until Monday 12:00 (from the card)"
    assert described(bench, "chauffage_override_started", **base, target={"swing_mode": "swing", "swing_horizontal_mode": "split"})["message"] \
        == "override started: vanes swing, horizontal vanes split until Monday 12:00 (from the card)"
    assert described(bench, "chauffage_override_started", **base, target={"cool_temperature": 24.0})["message"] \
        == "override started: 24 °C when cooling until Monday 12:00 (from the card)"
    assert described(bench, "chauffage_override_started", **{**base, "preset": "boost"}, target={"preset_mode": "boost", "fan_mode": "3"})["message"] \
        == "override started: Boost, fan 3 until Monday 12:00 (from the card)"
    bench.hass.config.language = "fr"
    assert described(bench, "chauffage_override_started", **base, target={"fan_mode": "3", "cool_temperature": 24.5})["message"] \
        == "dérogation : 24,5 °C en climatisation, ventilation 3 jusqu'à lundi 12:00 (depuis la carte)"


async def test_the_logbook_still_describes_an_override_recorded_before_0_10(bench: Bench):
    """Before #91, the events carried kind and value; the logbook reads the recorded ones."""
    await start(bench, "10:00")
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", kind="temperature", value=21.5,
                     preset=None, end="2026-10-12T12:00:00+02:00", source="card")["message"] \
        == "override started: 21.5 °C until Monday 12:00 (from the card)"
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", kind="preset", value="away",
                     preset=None, end="2026-10-12T12:00:00+02:00", source="card")["message"] \
        == "override started: away until Monday 12:00 (from the card)"


async def test_the_logbook_says_why_a_change_by_hand_ends_then(bench: Bench):
    """The reason of the end, from the setting End of a change by hand (#83)."""
    await start(bench, "10:00")
    bench.hass.states.async_set("climate.salon", "heat", {"friendly_name": "Salon"})
    change = {"entity_id": "climate.salon", "target": {"temperature": 22}, "preset": None,
              "start": "2026-10-12T10:00:00+02:00", "end": "2026-10-12T12:00:00+02:00", "source": "thermostat"}
    assert described(bench, "chauffage_override_started", **change, ends_at="duration")["message"] \
        == "override started: 22 °C until Monday 12:00 (changed by hand, for 2 h)"
    assert described(bench, "chauffage_override_started", **change, ends_at="next_slot")["message"] \
        == "override started: 22 °C until Monday 12:00 (changed by hand, until the next slot)"
    assert described(bench, "chauffage_override_started", **change, ends_at="no_next_slot")["message"] \
        == "override started: 22 °C until Monday 12:00 (changed by hand, no slot ahead)"
    ended = {"entity_id": "climate.salon", "reason": "expired", "start": "2026-10-12T10:00:00+02:00",
             "end": "2026-10-12T11:30:00+02:00"}
    assert described(bench, "chauffage_override_ended", **ended, ends_at="duration")["message"] \
        == "override ended after 1 h 30"
    assert described(bench, "chauffage_override_ended", **ended, ends_at="next_slot")["message"] \
        == "override ended at the next slot"
    assert described(bench, "chauffage_override_ended", **ended, ends_at="no_next_slot")["message"] \
        == "override ended after a week, no slot ahead"
    # Removed before its end: the reason of the removal, not of the end
    assert described(bench, "chauffage_override_ended", **ended | {"reason": "card"}, ends_at="next_slot")["message"] \
        == "override ended (from the card)"


async def test_the_logbook_says_why_a_change_by_hand_ends_then_in_french(bench: Bench):
    bench.hass.config.language = "fr"
    await start(bench, "10:00")
    change = {"entity_id": "climate.salon", "target": {"temperature": 22}, "preset": None,
              "start": "2026-10-12T10:00:00+02:00", "end": "2026-10-13T22:30:00+02:00", "source": "thermostat"}
    assert described(bench, "chauffage_override_started", **change, ends_at="next_slot")["message"] \
        == "dérogation : 22 °C jusqu'à mardi 22:30 (changée à la main, jusqu'au prochain créneau)"
    assert described(bench, "chauffage_override_started", **change | {"end": "2026-10-12T12:00:00+02:00"},
                     ends_at="duration")["message"] \
        == "dérogation : 22 °C jusqu'à lundi 12:00 (changée à la main, pendant 2 h)"
    ended = {"entity_id": "climate.salon", "reason": "expired", "start": "2026-10-12T10:00:00+02:00",
             "end": "2026-10-12T12:00:00+02:00"}
    assert described(bench, "chauffage_override_ended", **ended, ends_at="duration")["message"] \
        == "dérogation terminée au bout de 2 h"
    assert described(bench, "chauffage_override_ended", **ended, ends_at="next_slot")["message"] \
        == "dérogation terminée au prochain créneau"
    assert described(bench, "chauffage_override_ended", **ended, ends_at="no_next_slot")["message"] \
        == "dérogation terminée au bout d'une semaine, aucun créneau prévu"
    assert described(bench, "chauffage_override_ended", entity_id="climate.salon", reason="expired")["message"] \
        == "dérogation terminée (expirée)"


async def test_the_events_of_a_change_by_hand_carry_why_it_ends(bench: Bench):
    await start(bench, "10:00")
    events = []
    for event_type in ("chauffage_override_started", "chauffage_override_ended"):
        bench.hass.bus.async_listen(event_type, lambda event: events.append(dict(event.data)))
    await bench.manual_setpoint("climate.salon", 21.5)
    await bench.go_to("12:00")
    await bench.hass.async_block_till_done()
    started, ended = events
    assert (started["ends_at"], started["start"], started["end"]) == (
        "duration", "2026-10-12T10:00:00+02:00", "2026-10-12T12:00:00+02:00")
    assert (ended["reason"], ended["ends_at"], ended["start"], ended["end"]) == (
        "expired", "duration", "2026-10-12T10:00:00+02:00", "2026-10-12T12:00:00+02:00")


async def test_the_events_of_an_override_from_the_card_say_no_reason(bench: Bench):
    await start(bench, "10:00")
    events = []
    bench.hass.bus.async_listen("chauffage_override_started", lambda event: events.append(dict(event.data)))
    await service(bench, "set_override", entity_id="climate.salon", temperature=22)
    assert "ends_at" not in events[0]


async def test_the_logbook_tells_a_schedule_activated_in_the_select_s_logbook(bench: Bench):
    """Next to the select's change ("Schedule → Away"), what activated it."""
    await start(bench)
    select = bench.schedule_entity
    assert described(bench, "chauffage_schedule_activated", schedule="away", schedule_name="Away",
                     previous_schedule="normal", source="rules", entity_id=select) == {
        "name": bench.hass.states.get(select).name, "message": "schedule activated: Away (by the activation rules)",
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
        == "dérogation terminée (depuis la carte)"
    # Numbers as the language writes them, and the day of the end: the same line read on any day
    await bench.go_to("10:00")
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", target={"temperature": 21.5},
                     preset=None, end="2026-10-12T12:00:00+02:00", source="card")["message"] \
        == "dérogation : 21,5 °C jusqu'à lundi 12:00 (depuis la carte)"
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", target={"temperature": 21.0},
                     preset=None, end="2026-10-13T06:00:00+02:00", source="card")["message"] \
        == "dérogation : 21 °C jusqu'à mardi 06:00 (depuis la carte)"
    await bench.go_to("10:00", day=1)  # read the next day
    assert described(bench, "chauffage_override_started", entity_id="climate.salon", target={"temperature": 21.5},
                     preset=None, end="2026-10-12T12:00:00+02:00", source="card")["message"] \
        == "dérogation : 21,5 °C jusqu'à lundi 12:00 (depuis la carte)"


async def test_the_logbook_names_the_panel_when_a_change_comes_from_it(bench: Bench, ws_client):
    """The panel used to pass for "the card" in the logbook and the events."""
    await start(bench, "10:00")
    bench.hass.config.language = "fr"
    sources = []

    @callback  # in the order fired (a plain function runs as a job, in any order)
    def listen(event: Event) -> None:
        sources.append(event.data["source"])
    bench.hass.bus.async_listen("chauffage_schedule_activated", listen)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/schedule/activate", "schedule": "away", "source": "panel"})
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "chauffage/schedule/activate", "schedule": "normal"})
    assert (await client.receive_json())["success"]
    await bench.hass.async_block_till_done()
    assert sources == ["panel", "card"]  # a card, or an older one, sends no source
    assert described(bench, "chauffage_schedule_activated", schedule="away", schedule_name="Absent",
                     source="panel", entity_id=bench.schedule_entity)["message"] \
        == "planning activé : Absent (depuis le panneau)"
    assert described(bench, "chauffage_override_ended", entity_id="climate.salon", reason="panel")["message"] \
        == "dérogation terminée (depuis le panneau)"


def test_every_source_and_reason_in_the_code_has_a_logbook_text_in_every_language():
    """A new source of overrides or schedules, or a new reason for an override to end, is told
    in the logbook (CONTRIBUTING.md, "Conventions")."""
    code = "\n".join(p.read_text(encoding="utf-8") for p in COMPONENT.glob("*.py"))
    sources = set(re.findall(r'source="(\w+)"', code)) | set(websocket.SOURCES)  # sent by the card or the panel
    reasons = set(re.findall(r'_drop_override\([^,()]+, "(\w+)"\)', code)) | {"service", "thermostat"} | set(websocket.SOURCES)
    assert {"card", "service", "entity", "rules", "thermostat"} <= sources  # the scan finds them
    assert {"paused", "forgotten", "expired"} <= reasons
    for language, texts in logbook.TEXTS.items():
        assert sources <= set(texts["sources"]), language
        assert reasons <= set(texts["reasons"]), language
        assert set(texts["hvac_modes"]) == {"off", "heat", "cool", "heat_cool", "auto", "dry", "fan_only"}, language
        assert set(texts["settings"]) == {"fan_mode", "swing_mode", "swing_horizontal_mode"}, language
        assert texts.keys() == logbook.TEXTS["en"].keys(), language


# ----- diagnostics -----

async def test_the_diagnostics_hold_the_stored_data_and_the_thermostats_now(bench: Bench):
    await start(bench, "10:00")
    await bench.manual_setpoint("climate.salon", 21.5)
    found = await diagnostics.async_get_config_entry_diagnostics(bench.hass, bench.entry)
    assert found["data"]["overrides"]["climate.salon"]["target"] == {"temperature": 21.5}
    assert "climate.salon" in found["data"]["thermostats"]
    assert found["states"]["climate.salon"]["attributes"]["temperature"] == 21.5
    assert found["retry"] == []
    assert found["options"] == {}
