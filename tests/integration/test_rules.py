"""Activation rules (#1): an ordered list of "template → schedule", the first true one wins, the
default schedule otherwise. A schedule chosen by hand stays until the outcome of the rules changes
(docs/decisions.md, "Activation rules")."""

import pytest

from conftest import WEEKDAY, Bench
from custom_components.chauffage.model import InvalidData

WEEKS = {"climate.salon": {"normal": [WEEKDAY] * 7, "away": [[["00:00", "frost"]]] * 7,
                           "holiday": [[["00:00", "eco"]]] * 7}}
TEMPO = "sensor.edf_tempo_color"
RED = {"template": "{{ is_state('sensor.edf_tempo_color', 'red') }}", "schedule": "away"}
WHITE = {"template": "{{ is_state('sensor.edf_tempo_color', 'white') }}", "schedule": "holiday"}


async def start(bench: Bench, color: str = "blue") -> None:
    await bench.go_to("10:00")
    bench.hass.states.async_set(TEMPO, color)
    bench.thermostat("climate.salon", "comfort")
    await bench.setup()
    await bench.save_weeks(WEEKS)
    bench.applied()


async def set_rules(bench: Bench, rules: list, default: str | None = None) -> None:
    """What the card sends when the user saves the rules."""
    await bench.runtime.set_rules(rules, default)
    await bench.hass.async_block_till_done()


async def tempo(bench: Bench, color: str) -> None:
    bench.hass.states.async_set(TEMPO, color)
    await bench.hass.async_block_till_done()


def active(bench: Bench) -> str:
    return bench.runtime.data["active_schedule"]


async def restart(bench: Bench) -> None:
    await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    bench.runtime.pause = 0


# ----- choosing the schedule -----

async def test_the_first_true_rule_activates_its_schedule(bench: Bench):
    await start(bench, "red")
    await set_rules(bench, [RED, {"template": "{{ true }}", "schedule": "holiday"}], "normal")
    assert active(bench) == "away"
    assert bench.applied() == {"climate.salon": "frost"}
    assert bench.hass.states.get(bench.schedule_entity).state == "Away"


async def test_the_default_schedule_is_activated_when_no_rule_is_true(bench: Bench):
    await start(bench, "blue")
    await bench.activate_schedule("Holiday")
    await set_rules(bench, [RED, WHITE], "normal")
    assert active(bench) == "normal"


async def test_without_a_default_the_active_schedule_stays_when_no_rule_is_true(bench: Bench):
    await start(bench, "blue")
    await bench.activate_schedule("Holiday")
    await set_rules(bench, [RED], None)
    assert active(bench) == "holiday"


async def test_the_schedule_follows_the_entities_of_the_rules(bench: Bench):
    """The EDF Tempo color of the day (#1)."""
    await start(bench, "blue")
    await set_rules(bench, [RED, WHITE], "normal")
    await tempo(bench, "white")
    assert active(bench) == "holiday"
    await tempo(bench, "red")
    assert active(bench) == "away"
    assert bench.applied()["climate.salon"] == "frost"
    await tempo(bench, "blue")
    assert active(bench) == "normal"


async def test_a_rule_on_the_time_is_checked_as_time_goes_by(bench: Bench):
    await start(bench)
    await set_rules(bench, [{"template": "{{ now().hour >= 18 }}", "schedule": "away"}], "normal")
    assert active(bench) == "normal"
    await bench.go_to("18:00")
    await bench.advance(1)
    assert active(bench) == "away"


async def test_a_template_that_fails_counts_as_false(bench: Bench):
    await start(bench)
    failing = {"template": "{{ states('sensor.missing') | float / 0 }}", "schedule": "away"}
    await set_rules(bench, [failing, WHITE], "normal")
    assert active(bench) == "normal"
    assert bench.runtime.snapshot()["rule_results"] == [None, False]


# ----- a schedule chosen by hand -----

async def test_a_schedule_chosen_by_hand_stays_until_the_outcome_of_the_rules_changes(bench: Bench):
    await start(bench, "blue")
    await set_rules(bench, [RED], "normal")
    await bench.activate_schedule("Holiday")
    bench.hass.states.async_set("sensor.other", "1")  # unrelated: the rules still say Normal
    await tempo(bench, "blue")
    await bench.advance(5)
    assert active(bench) == "holiday"
    await tempo(bench, "red")  # tomorrow is red
    assert active(bench) == "away"


async def test_a_schedule_chosen_by_hand_survives_a_restart(bench: Bench):
    await start(bench, "blue")
    await set_rules(bench, [RED], "normal")
    await bench.activate_schedule("Holiday")
    await restart(bench)
    assert active(bench) == "holiday"


async def test_rules_whose_outcome_changed_during_a_restart_apply_at_start(bench: Bench):
    await start(bench, "blue")
    await set_rules(bench, [RED], "normal")
    await bench.hass.config_entries.async_unload(bench.entry.entry_id)
    bench.hass.states.async_set(TEMPO, "red")
    await bench.hass.config_entries.async_setup(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert active(bench) == "away"


# ----- editing the rules -----

async def test_saving_the_rules_applies_them_at_once_and_they_are_kept(bench: Bench, hass_storage):
    await start(bench, "red")
    await set_rules(bench, [RED], "normal")
    assert active(bench) == "away"
    await bench.advance(1)  # delayed save
    stored = hass_storage["chauffage"]["data"]
    assert (stored["rules"], stored["default_schedule"]) == ([RED], "normal")


async def test_without_rules_the_schedule_is_only_chosen_by_hand(bench: Bench):
    await start(bench, "blue")
    await set_rules(bench, [RED], "normal")
    await set_rules(bench, [], None)
    await bench.activate_schedule("Holiday")
    await tempo(bench, "red")
    assert active(bench) == "holiday"


@pytest.mark.parametrize("rules, default", [
    ([{"template": "{{ is_state('sensor.x', 'on') ", "schedule": "away"}], None),  # not a template
    ([{"template": "  ", "schedule": "away"}], None),
    ([{"template": "{{ true }}", "schedule": "unknown"}], None),
    ([{"template": "{{ true }}", "schedule": 3}], None),
    (["{{ true }}"], None),
    ([], "unknown"),
])
async def test_invalid_rules_are_refused(bench: Bench, rules, default):
    await start(bench)
    with pytest.raises(InvalidData):
        await bench.runtime.set_rules(rules, default)
    assert bench.runtime.data["rules"] == []


async def test_a_schedule_used_by_the_rules_cannot_be_deleted(bench: Bench):
    await start(bench)
    await set_rules(bench, [RED], "holiday")
    await bench.activate_schedule("Normal")
    for gone in ("away", "holiday"):
        with pytest.raises(InvalidData):
            await bench.set_schedules([{"id": s} for s in ("normal", "away", "holiday") if s != gone])
    assert len(bench.schedule_list()) == 3


async def test_the_card_gets_the_rules_and_whether_each_one_is_true_now(bench: Bench, ws_client):
    await start(bench, "white")
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/rules/set", "rules": [RED, WHITE], "default_schedule": "normal"})
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "chauffage/subscribe"})
    await client.receive_json()
    snapshot = (await client.receive_json())["event"]
    assert snapshot["rules"] == [RED, WHITE]
    assert snapshot["default_schedule"] == "normal"
    assert snapshot["rule_results"] == [False, True]
    await tempo(bench, "red")
    snapshot = (await client.receive_json())["event"]
    assert snapshot["rule_results"] == [True, False]


async def test_only_admins_set_the_rules(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass, admin=False)
    await client.send_json_auto_id({"type": "chauffage/rules/set", "rules": [RED], "default_schedule": None})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "unauthorized"


async def test_an_invalid_template_is_explained_to_the_card(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/rules/set", "default_schedule": None,
                                    "rules": [{"template": "{{ oops", "schedule": "away"}]})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "invalid_format"


# ----- a template that gives the schedule -----

COLORS = "{{ {'red': 'away', 'white': 'Holiday'}.get(states('sensor.edf_tempo_color'), 'none') }}"


async def test_a_template_can_give_the_schedule_by_its_id_or_its_name(bench: Bench):
    await start(bench, "red")
    await set_rules(bench, [{"template": COLORS, "schedule": None}], "normal")
    assert active(bench) == "away"
    await tempo(bench, "white")
    assert active(bench) == "holiday"
    await tempo(bench, "blue")  # "none": no schedule of that name, the default one
    assert active(bench) == "normal"


async def test_a_template_giving_no_known_schedule_lets_the_next_rule_decide(bench: Bench):
    await start(bench, "blue")
    await set_rules(bench, [{"template": COLORS, "schedule": None}, {"template": "{{ true }}", "schedule": "holiday"}])
    assert active(bench) == "holiday"
    assert bench.runtime.snapshot()["rule_results"] == [False, True]
    await tempo(bench, "red")
    assert active(bench) == "away"
    assert bench.runtime.snapshot()["rule_results"] == ["away", True]


async def test_a_schedule_named_only_inside_a_template_can_be_deleted(bench: Bench):
    await start(bench)
    await set_rules(bench, [{"template": COLORS, "schedule": None}])
    await bench.activate_schedule("Normal")
    await bench.set_schedules([{"id": "normal"}, {"id": "away"}])
    assert len(bench.schedule_list()) == 2


# ----- trying the rules being typed -----

async def preview(client, rules: list) -> dict:
    await client.send_json_auto_id({"type": "chauffage/rules/preview", "rules": rules})
    assert (await client.receive_json())["success"]
    return (await client.receive_json())["event"]


async def test_rules_being_typed_are_tried_as_the_integration_would(bench: Bench, ws_client):
    await start(bench, "white")
    client = await ws_client(bench.hass)
    rules = [RED, WHITE, {"template": COLORS, "schedule": None},
             {"template": "{{ states('sensor.edf_tempo_color') }}", "schedule": "away"}, {"template": "", "schedule": "away"}]
    event = await preview(client, rules)
    assert event["results"] == [False, True, "holiday", False, None]
    assert event["texts"] == ["False", "True", "Holiday", "white", None]
    assert event["errors"] == [None] * 5
    assert bench.runtime.data["rules"] == [], "nothing is saved"


async def test_a_rule_being_typed_is_tried_again_when_its_entities_change(bench: Bench, ws_client):
    await start(bench, "white")
    client = await ws_client(bench.hass)
    await preview(client, [RED])
    await tempo(bench, "red")
    assert (await client.receive_json())["event"]["results"] == [True]


async def test_a_rule_being_typed_with_an_error_says_why(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    event = await preview(client, [{"template": "{{ oops", "schedule": "away"},
                                   {"template": "{{ states('sensor.missing') | float / 0 }}", "schedule": "away"}])
    assert event["results"] == [None, None]
    assert all(event["errors"])


async def test_only_admins_try_rules(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass, admin=False)
    await client.send_json_auto_id({"type": "chauffage/rules/preview", "rules": [RED]})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "unauthorized"
