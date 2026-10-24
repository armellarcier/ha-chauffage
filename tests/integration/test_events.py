"""Events for automations: an override starting or ending on a thermostat, a schedule activated,
each saying where it came from (docs/decisions.md, "Entities")."""

import pytest
from homeassistant.core import Event

from conftest import CTX_USER, KINDS, WEEKDAY, Bench, every_day

WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": every_day(("00:00", "frost"))}}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    """Every behavior test runs on each kind of thermostat (VTherm, standard presets, none)."""
    return request.param


@pytest.fixture
def events(hass) -> dict[str, list[dict]]:
    """The data of each event fired, by type."""
    fired: dict[str, list[dict]] = {}
    for event_type in ("chauffage_override_started", "chauffage_override_ended", "chauffage_schedule_activated"):
        def listen(event: Event, event_type: str = event_type) -> None:
            fired.setdefault(event_type, []).append(dict(event.data))
        hass.bus.async_listen(event_type, listen)
    return fired


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    await bench.setup()
    await bench.save_weeks(WEEKS)
    bench.applied()


async def service(bench: Bench, name: str, **data) -> None:
    await bench.hass.services.async_call("chauffage", name, data, blocking=True)
    await bench.hass.async_block_till_done()


# ----- overrides -----

async def test_a_manual_change_turned_into_an_override_is_told(bench: Bench, events):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    assert events["chauffage_override_started"] == [{
        "entity_id": "climate.salon", "kind": "temperature", "value": 21.5, "preset": None,
        "end": "2026-10-12T12:00:00+02:00", "source": "thermostat",
    }]


async def test_an_override_set_by_a_service_or_the_card_is_told(bench: Bench, events):
    await start(bench)
    await service(bench, "set_override", entity_id="climate.salon", preset="boost")
    await bench.set_override("climate.salon", bench.runtime.new_override("temperature", 19))
    started = events["chauffage_override_started"]
    assert [(e["preset"], e["source"]) for e in started] == [("boost", "service"), (None, "card")]


async def test_an_override_only_extended_is_not_told_again(bench: Bench, events):
    """Its end is on the override sensor; automations hear of a start once."""
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    override = bench.overrides()["climate.salon"]
    await bench.set_override("climate.salon", {**override, "end": "2026-10-12T14:00:00+02:00"})
    assert len(events["chauffage_override_started"]) == 1


async def test_an_override_ending_says_why(bench: Bench, events):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    await bench.go_to("12:00")  # its end
    await service(bench, "set_override", entity_id="climate.salon", temperature=22)
    await service(bench, "clear_override", entity_id="climate.salon")
    await bench.set_override("climate.salon", bench.runtime.new_override("temperature", 22))
    await bench.set_override("climate.salon", None)
    await bench.set_override("climate.salon", bench.runtime.new_override("temperature", 22))
    await bench.runtime.set_paused("climate.salon", True)
    await bench.runtime.set_paused("climate.salon", False)
    await bench.set_override("climate.salon", bench.runtime.new_override("temperature", 22))
    await bench.runtime.forget("climate.salon")
    await bench.hass.async_block_till_done()
    assert events["chauffage_override_ended"] == [
        {"entity_id": "climate.salon", "reason": reason}
        for reason in ("expired", "service", "card", "paused", "forgotten")
    ]


async def test_an_override_ended_by_going_back_to_the_schedule_on_the_thermostat_is_told(bench: Bench, events):
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    bench.thermostat("climate.salon", "eco", context=CTX_USER)  # back to the slot's preset
    await bench.hass.async_block_till_done()
    assert events["chauffage_override_ended"] == [{"entity_id": "climate.salon", "reason": "thermostat"}]


# ----- schedules -----

async def test_activating_a_schedule_is_told_with_where_it_came_from(bench: Bench, events):
    await start(bench)
    await bench.activate_schedule("Away")  # the select
    await service(bench, "activate_schedule", schedule="holiday")
    await bench.hass.services.async_call("switch", "turn_on", {"entity_id": "switch.chauffage_schedule_normal"},
                                         blocking=True)
    await bench.hass.async_block_till_done()
    await bench.runtime.activate_schedule("away", source="card")
    assert events["chauffage_schedule_activated"] == [
        {"schedule": "away", "schedule_name": "Away", "previous_schedule": "normal", "source": "entity"},
        {"schedule": "holiday", "schedule_name": "Holiday", "previous_schedule": "away", "source": "service"},
        {"schedule": "normal", "schedule_name": "Normal", "previous_schedule": "holiday", "source": "entity"},
        {"schedule": "away", "schedule_name": "Away", "previous_schedule": "normal", "source": "card"},
    ]


async def test_a_schedule_activated_by_the_rules_is_told(bench: Bench, events):
    await start(bench)
    bench.hass.states.async_set("input_boolean.away", "on")
    await bench.runtime.set_rules([{"template": "{{ is_state('input_boolean.away', 'on') }}", "schedule": "away"}], None)
    await bench.hass.async_block_till_done()
    assert events["chauffage_schedule_activated"][-1]["source"] == "rules"


async def test_a_schedule_already_active_is_not_told_again(bench: Bench, events):
    await start(bench)
    await bench.activate_schedule("Normal")
    assert "chauffage_schedule_activated" not in events


async def test_an_override_extended_while_the_minute_is_applied_is_kept(bench: Bench, events):
    """Applying the slots takes a while (spaced out commands): an override extended meanwhile from
    the card has not ended."""
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21.5)
    runtime, apply = bench.runtime, bench.runtime.apply

    async def slow_apply(**kwargs):
        override = runtime.data["overrides"].get("climate.salon")
        if override:  # the card adds 30 minutes meanwhile
            await runtime.set_override("climate.salon", {**override, "end": "2026-10-12T12:30:00+02:00"}, source="card")
        await apply(**kwargs)

    runtime.apply = slow_apply
    await bench.go_to("12:00")
    assert "climate.salon" in bench.overrides()
    assert "chauffage_override_ended" not in events
