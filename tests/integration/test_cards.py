"""The cards declare the thermostats they show; a repair proposes to pause an active thermostat no
card shows any more, another one to forget a thermostat whose entity is gone (docs/decisions.md,
"Scheduled thermostats", #27)."""

from datetime import timedelta

import pytest
from homeassistant.helpers import entity_registry as er, issue_registry as ir
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from conftest import Bench, every_day

WEEK = {"normal": every_day(("00:00", "eco"))}
UNLISTED = "unlisted_climate.salon"
MISSING = "missing_climate.grenier"


async def start(bench: Bench) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco", friendly_name="Salon")
    bench.thermostat("climate.bureau", "eco", friendly_name="Bureau")
    await bench.setup()
    await bench.save_weeks({"climate.salon": WEEK, "climate.bureau": WEEK})


async def declare(bench: Bench, card_id: str | None, *thermostats: str) -> None:
    bench.runtime.declare_card(card_id, list(thermostats))
    await bench.hass.async_block_till_done()


def issue(bench: Bench, issue_id: str):
    return ir.async_get(bench.hass).async_get_issue("chauffage", issue_id)


@pytest.fixture
def http_client(hass_client, hass_admin_user):
    """HTTP client whose token is created now (the bench's clock jumps ahead)."""

    async def connect(hass):
        refresh = await hass.auth.async_create_refresh_token(hass_admin_user, "https://example.com/")
        return await hass_client(hass.auth.async_create_access_token(refresh))

    return connect


async def fix(bench: Bench, http_client, issue_id: str, choice: str) -> dict:
    """Answers a repair from Settings → Repairs: its menu, then a choice."""
    assert await async_setup_component(bench.hass, "repairs", {})
    client = await http_client(bench.hass)
    response = await client.post("/api/repairs/issues/fix", json={"handler": "chauffage", "issue_id": issue_id})
    flow = await response.json()
    assert flow["type"] == "menu", flow
    response = await client.post(f"/api/repairs/issues/fix/{flow['flow_id']}", json={"next_step_id": choice})
    result = await response.json()
    await bench.hass.async_block_till_done()
    return {"menu": flow["menu_options"], **result}


# ----- declarations -----

async def test_a_card_declares_the_thermostats_it_shows(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass, admin=False)  # any user opening the dashboard
    await client.send_json_auto_id({"type": "chauffage/card/declare", "card_id": "c1",
                                    "thermostats": ["climate.salon", "climate.bureau"]})
    assert (await client.receive_json())["success"]
    assert bench.runtime.data["cards"]["c1"]["thermostats"] == ["climate.salon", "climate.bureau"]
    assert bench.runtime.thermostats["climate.salon"]["shown_at"] == dt_util.now().isoformat()
    assert issue(bench, UNLISTED) is None


async def test_a_thermostat_removed_from_the_only_card_showing_it_raises_a_repair(bench: Bench):
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c1", "climate.bureau")
    found = issue(bench, UNLISTED)
    assert found is not None and found.is_fixable
    assert found.translation_key == "unlisted"
    assert found.translation_placeholders == {"name": "Salon", "entity_id": "climate.salon"}
    assert not bench.runtime.is_paused("climate.salon")  # only proposed


async def test_no_repair_while_another_card_shows_it(bench: Bench):
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c2", "climate.salon")
    await declare(bench, "c1", "climate.bureau")
    assert issue(bench, UNLISTED) is None


async def test_no_repair_for_a_paused_thermostat(bench: Bench):
    await start(bench)
    await bench.runtime.set_paused("climate.salon", True)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c1", "climate.bureau")
    assert issue(bench, UNLISTED) is None


async def test_the_repair_closes_when_a_card_shows_the_thermostat_again(bench: Bench):
    """The card editor's dialog cancelled, or the thermostat added back."""
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c1", "climate.bureau")
    await declare(bench, "c1", "climate.bureau", "climate.salon")
    assert issue(bench, UNLISTED) is None


async def test_the_repair_closes_when_the_thermostat_is_paused_or_forgotten_elsewhere(bench: Bench):
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c1", "climate.bureau")
    await bench.runtime.set_paused("climate.salon", True)
    await bench.hass.async_block_till_done()
    assert issue(bench, UNLISTED) is None


async def test_safety_net_a_thermostat_not_shown_for_a_week_while_others_are(bench: Bench):
    """A card deleted, or written in YAML without an id: its thermostats are no longer shown."""
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await bench.go_to("10:00", day=6)
    await declare(bench, None, "climate.bureau")
    assert issue(bench, UNLISTED) is None  # 6 days
    await bench.go_to("10:00", day=8)
    await declare(bench, None, "climate.bureau")
    assert issue(bench, UNLISTED) is not None


async def test_safety_net_nobody_opening_a_dashboard_for_a_week_flags_nothing(bench: Bench):
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await bench.go_to("10:00", day=9)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    assert issue(bench, UNLISTED) is None


async def test_a_thermostat_never_declared_counts_from_its_first_check(bench: Bench):
    """After the upgrade, no card has declared anything yet."""
    await start(bench)
    await declare(bench, None, "climate.bureau")
    assert issue(bench, UNLISTED) is None
    await bench.go_to("10:00", day=8)
    await declare(bench, None, "climate.bureau")
    assert issue(bench, UNLISTED) is not None


# ----- answering the repair -----

async def test_the_repair_pauses_the_thermostat(bench: Bench, http_client):
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c1", "climate.bureau")
    result = await fix(bench, http_client, UNLISTED, "pause")
    assert result["menu"] == ["pause", "keep", "forget"]
    assert result["type"] == "create_entry"
    assert bench.runtime.is_paused("climate.salon")
    assert issue(bench, UNLISTED) is None


async def test_the_repair_keeps_driving_it_until_it_is_removed_again(bench: Bench, http_client):
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c1", "climate.bureau")
    await fix(bench, http_client, UNLISTED, "keep")
    assert not bench.runtime.is_paused("climate.salon")
    assert issue(bench, UNLISTED) is None
    await bench.go_to("10:00", day=8)
    await declare(bench, "c1", "climate.bureau")
    assert issue(bench, UNLISTED) is None  # answered
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c1", "climate.bureau")
    assert issue(bench, UNLISTED) is not None  # shown, then removed again


async def test_the_repair_forgets_the_thermostat(bench: Bench, http_client):
    await start(bench)
    await declare(bench, "c1", "climate.salon", "climate.bureau")
    await declare(bench, "c1", "climate.bureau")
    await fix(bench, http_client, UNLISTED, "forget")
    assert "climate.salon" not in bench.runtime.thermostats
    assert issue(bench, UNLISTED) is None


# ----- a thermostat whose entity is gone -----

async def test_a_thermostat_whose_entity_is_gone_raises_a_repair_at_start(bench: Bench, hass_storage):
    await start(bench)
    await bench.save_weeks({"climate.grenier": WEEK})
    await bench.advance(1)  # delayed save
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    found = issue(bench, MISSING)
    assert found is not None and found.translation_key == "missing"
    assert found.translation_placeholders == {"entity_id": "climate.grenier"}
    assert issue(bench, "missing_climate.salon") is None


async def test_an_entity_removed_while_running_raises_the_repair(bench: Bench):
    await start(bench)
    registry = er.async_get(bench.hass)
    registry.async_get_or_create("climate", "test", "grenier", suggested_object_id="grenier")
    await bench.save_weeks({"climate.grenier": WEEK})
    registry.async_remove("climate.grenier")
    await bench.hass.async_block_till_done()
    assert issue(bench, MISSING) is not None


async def test_an_entity_without_state_but_still_registered_is_not_gone(bench: Bench):
    """Its integration did not start (yet): unavailable, not gone."""
    await start(bench)
    er.async_get(bench.hass).async_get_or_create("climate", "test", "grenier", suggested_object_id="grenier")
    await bench.save_weeks({"climate.grenier": WEEK})
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    assert issue(bench, MISSING) is None


async def test_the_missing_repair_forgets_the_thermostat_or_keeps_it(bench: Bench, http_client):
    await start(bench)
    await bench.save_weeks({"climate.grenier": WEEK, "climate.cave": WEEK})
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    result = await fix(bench, http_client, MISSING, "forget")
    assert result["menu"] == ["forget", "keep"]
    assert "climate.grenier" not in bench.runtime.thermostats
    await fix(bench, http_client, "missing_climate.cave", "keep")
    assert "climate.cave" in bench.runtime.thermostats
    assert issue(bench, "missing_climate.cave") is None


async def test_a_forgotten_thermostat_s_repairs_are_closed(bench: Bench):
    await start(bench)
    await bench.save_weeks({"climate.grenier": WEEK})
    assert await bench.hass.config_entries.async_reload(bench.entry.entry_id)
    await bench.hass.async_block_till_done()
    await bench.runtime.forget("climate.grenier")
    await bench.hass.async_block_till_done()
    assert issue(bench, MISSING) is None


# ----- a card duplicated with its id -----

async def test_a_card_duplicated_with_its_id_is_recognized(bench: Bench):
    """HA's "Duplicate" copies the card's configuration, its id too: two cards shown at the same
    time declare different lists under one id. No repair from that."""
    await start(bench)
    bench.runtime.declare_card("c1", ["climate.salon", "climate.bureau"], instance="a")
    bench.runtime.declare_card("c1", ["climate.bureau"], instance="b")
    await bench.hass.async_block_till_done()
    assert issue(bench, UNLISTED) is None
    assert bench.runtime.snapshot()["duplicated_cards"] == ["c1"]


async def test_the_same_card_showing_fewer_thermostats_is_not_a_duplicate(bench: Bench):
    """Edited: the card is drawn again (a new instance), a while later."""
    await start(bench)
    bench.runtime.declare_card("c1", ["climate.salon", "climate.bureau"], instance="a")
    await bench.advance(2)
    bench.runtime.declare_card("c1", ["climate.bureau"], instance="b")
    await bench.hass.async_block_till_done()
    assert issue(bench, UNLISTED) is not None
    assert bench.runtime.snapshot()["duplicated_cards"] == []


async def test_one_card_declaring_again_is_not_a_duplicate(bench: Bench):
    await start(bench)
    bench.runtime.declare_card("c1", ["climate.salon", "climate.bureau"], instance="a")
    bench.runtime.declare_card("c1", ["climate.bureau"], instance="a")
    await bench.hass.async_block_till_done()
    assert issue(bench, UNLISTED) is not None
    assert bench.runtime.snapshot()["duplicated_cards"] == []


async def test_a_duplicated_id_is_forgotten_after_a_week(bench: Bench):
    """Once one of the cards got its own id, the other one declares alone."""
    await start(bench)
    bench.runtime.declare_card("c1", ["climate.salon", "climate.bureau"], instance="a")
    bench.runtime.declare_card("c1", ["climate.bureau"], instance="b")
    await bench.go_to("10:00", day=8)
    bench.runtime.declare_card("c1", ["climate.salon", "climate.bureau"], instance="c")
    assert bench.runtime.snapshot()["duplicated_cards"] == []


async def test_the_card_sends_its_instance(bench: Bench, ws_client):
    await start(bench)
    client = await ws_client(bench.hass)
    for instance, thermostats in (("a", ["climate.salon", "climate.bureau"]), ("b", ["climate.bureau"])):
        await client.send_json_auto_id({"type": "chauffage/card/declare", "card_id": "c1", "instance": instance,
                                        "thermostats": thermostats})
        assert (await client.receive_json())["success"]
    assert bench.runtime.snapshot()["duplicated_cards"] == ["c1"]
