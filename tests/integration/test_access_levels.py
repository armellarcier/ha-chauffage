"""What users who are not admins may change: one access level for all of them, chosen by an admin
(#99, docs/decisions.md, "Who may do what"). An admin can always do everything."""

from unittest.mock import patch

import pytest
from homeassistant.core import Context
from homeassistant.exceptions import Unauthorized

from conftest import WEEKDAY, Bench

SCHEDULES = {"climate.salon": {"normal": [WEEKDAY] * 7}}
LEVELS = ("use", "plan", "set_up")


async def start(bench: Bench, access_level: str | None = None) -> None:
    await bench.go_to("10:00")
    bench.thermostat("climate.salon", "eco")
    bench.thermostat("climate.cuisine", "eco")
    await bench.setup({"access_level": access_level} if access_level else None)
    await bench.save_weeks(SCHEDULES)
    bench.applied()


def commands(bench: Bench) -> dict[str, tuple[str, dict]]:
    """Each change of the websocket API, with a valid message, and the access level it needs."""
    return {
        "set an override": ("use", {"type": "chauffage/override/set", "entity_id": "climate.salon", "override": None}),
        "pause a thermostat": ("use", {"type": "chauffage/thermostat/set", "entity_id": "climate.salon", "paused": True}),
        "activate a schedule": ("use", {"type": "chauffage/schedule/activate", "schedule": "away"}),
        "edit the weeks": ("plan", {"type": "chauffage/weeks/save", "weeks": SCHEDULES}),
        "manage the schedules": ("plan", {"type": "chauffage/schedules/set",
                                          "schedules": [{"id": i} for i, _ in bench.schedule_list()]}),
        "schedule another thermostat": ("set_up", {"type": "chauffage/weeks/save",
                                                   "weeks": {"climate.cuisine": {"normal": [WEEKDAY] * 7}}}),
        "set the presets": ("set_up", {"type": "chauffage/presets/set", "presets": bench.runtime.data["presets"]}),
        "set a thermostat's presets": ("set_up", {"type": "chauffage/mapping/set", "entity_id": "climate.salon", "mapping": {}}),
        "write the rules": ("set_up", {"type": "chauffage/rules/set", "rules": [], "default_schedule": None}),
        "try the rules": ("set_up", {"type": "chauffage/rules/preview", "rules": []}),
        "change the settings of overrides": ("set_up", {"type": "chauffage/settings/set", "manual_override_end": "next_slot"}),
        "forget a thermostat": ("set_up", {"type": "chauffage/thermostat/forget", "entity_id": "climate.salon"}),
    }


async def send(bench: Bench, ws_client, message: dict, user: str = "household") -> dict:
    client = await ws_client(bench.hass, user=user)
    await client.send_json_auto_id(message)
    return await client.receive_json()


@pytest.mark.parametrize("access_level", LEVELS)
@pytest.mark.parametrize("change", ["set an override", "pause a thermostat", "activate a schedule",
                                    "edit the weeks", "manage the schedules", "schedule another thermostat",
                                    "set the presets", "set a thermostat's presets", "write the rules",
                                    "try the rules", "change the settings of overrides", "forget a thermostat"])
async def test_a_user_who_is_not_an_admin_changes_what_the_access_level_allows(bench: Bench, ws_client, access_level, change):
    await start(bench, access_level)
    needed, message = commands(bench)[change]
    reply = await send(bench, ws_client, message)
    allowed = LEVELS.index(access_level) >= LEVELS.index(needed)
    assert reply["success"] is allowed, reply
    if not allowed:
        assert reply["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("change", ["edit the weeks", "manage the schedules", "schedule another thermostat",
                                    "set the presets", "write the rules", "change the settings of overrides"])
async def test_an_admin_changes_everything_whatever_the_access_level(bench: Bench, ws_client, change):
    await start(bench, "use")
    reply = await send(bench, ws_client, commands(bench)[change][1], user="admin")
    assert reply["success"], reply


async def test_the_access_level_is_use_by_default_as_before(bench: Bench, ws_client):
    """An upgrade changes nothing: a user who is not an admin uses the heating, and no more."""
    await start(bench)
    assert bench.runtime.access_level == "use"
    reply = await send(bench, ws_client, commands(bench)["edit the weeks"][1])
    assert reply["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("change", ["activate a schedule", "edit the weeks", "set a thermostat's presets",
                                    "manage the schedules", "write the rules", "change the settings of overrides"])
async def test_an_access_level_never_goes_beyond_home_assistant_s_permissions(bench: Bench, ws_client, change):
    """A read-only user may control no thermostat: whatever the access level, nothing changes from
    the cards."""
    await start(bench, "set_up")
    reply = await send(bench, ws_client, commands(bench)[change][1], user="read_only")
    assert reply["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("change", ["activate a schedule", "manage the schedules", "set the presets",
                                    "write the rules", "change the settings of overrides"])
async def test_a_change_that_reaches_every_room_needs_the_control_of_every_thermostat(bench: Bench, ws_client, change):
    """A user who may control the living room only does not change what every room follows."""
    await start(bench, "set_up")
    await bench.save_weeks({"climate.cuisine": {"normal": [WEEKDAY] * 7}})
    reply = await send(bench, ws_client, commands(bench)[change][1], user="salon_only")
    assert reply["error"]["code"] == "unauthorized"


async def test_a_user_changes_the_week_of_a_thermostat_they_may_control(bench: Bench, ws_client):
    await start(bench, "plan")
    reply = await send(bench, ws_client, commands(bench)["edit the weeks"][1], user="salon_only")
    assert reply["success"], reply


async def test_weeks_sent_with_a_thermostat_not_scheduled_yet_need_set_up(bench: Bench, ws_client):
    """With Plan, the weeks of the living room and of a kitchen not scheduled yet are refused
    together: saving them would schedule the kitchen."""
    await start(bench, "plan")
    weeks = {**SCHEDULES, "climate.cuisine": {"normal": [WEEKDAY] * 7}}
    reply = await send(bench, ws_client, {"type": "chauffage/weeks/save", "weeks": weeks})
    assert reply["error"]["code"] == "unauthorized"
    assert "climate.cuisine" not in bench.runtime.scheduled


async def test_a_refused_setting_changes_nothing(bench: Bench, ws_client):
    """The access level and a duration out of range sent together: nothing is half applied."""
    await start(bench)
    reply = await send(bench, ws_client, {"type": "chauffage/settings/set", "access_level": "plan",
                                          "override_duration": 7}, user="admin")
    assert reply["error"]["code"] == "invalid_format"
    assert bench.runtime.access_level == "use"


async def test_the_card_is_told_the_access_level(bench: Bench, ws_client):
    await start(bench, "plan")
    client = await ws_client(bench.hass, user="household")
    await client.send_json_auto_id({"type": "chauffage/subscribe"})
    assert (await client.receive_json())["success"]
    assert (await client.receive_json())["event"]["access_level"] == "plan"


async def test_an_admin_chooses_the_access_level_from_the_panel(bench: Bench, ws_client):
    await start(bench)
    reply = await send(bench, ws_client, {"type": "chauffage/settings/set", "access_level": "plan"}, user="admin")
    assert reply["success"]
    assert bench.entry.options["access_level"] == "plan"
    assert bench.runtime.access_level == "plan"


async def test_only_an_admin_chooses_the_access_level(bench: Bench, ws_client):
    """A user with Set up who could choose it could give every user everything."""
    await start(bench, "set_up")
    reply = await send(bench, ws_client, {"type": "chauffage/settings/set", "access_level": "plan"})
    assert reply["error"]["code"] == "unauthorized"
    assert bench.runtime.access_level == "set_up"


async def test_an_unknown_access_level_is_refused(bench: Bench, ws_client):
    await start(bench)
    reply = await send(bench, ws_client, {"type": "chauffage/settings/set", "access_level": "everything"}, user="admin")
    assert reply["error"]["code"] == "invalid_format"
    assert bench.runtime.access_level == "use"


async def test_the_options_form_chooses_the_access_level(bench: Bench):
    await start(bench)
    options = bench.hass.config_entries.options
    flow = await options.async_init(bench.entry.entry_id)
    await options.async_configure(flow["flow_id"], {"override_duration": 120, "access_level": "set_up"})
    await bench.hass.async_block_till_done()
    assert bench.runtime.access_level == "set_up"


# ----- the services -----

@pytest.mark.parametrize(("service", "data"), [
    ("set_override", {"entity_id": "climate.salon", "temperature": 25}),
    ("clear_override", {"entity_id": "climate.salon"}),
])
async def test_a_read_only_user_cannot_change_an_override_with_a_service(bench: Bench, hass_read_only_user, service, data):
    """The user may not control the thermostat: the service refuses, as Home Assistant's own
    services that target an entity do."""
    await start(bench)
    await bench.manual_setpoint("climate.salon", 21)
    before = bench.overrides()
    with pytest.raises(Unauthorized):
        await bench.hass.services.async_call("chauffage", service, data, blocking=True,
                                             context=Context(user_id=hass_read_only_user.id))
    assert bench.overrides() == before


async def test_a_user_of_the_household_changes_an_override_with_a_service(bench: Bench, hass_admin_user):
    """An automation (no user) and every user who may control the thermostat still can."""
    await start(bench)
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": "climate.salon", "temperature": 22},
                                         blocking=True, context=Context(user_id=hass_admin_user.id))
    assert bench.overrides()["climate.salon"]["value"] == 22


# ----- the panel -----

async def setup_with_the_panel(bench: Bench, access_level: str | None = None) -> None:
    bench.hass.config.components.add("frontend")
    with patch("custom_components.chauffage.frontend.add_extra_js_url"):
        await start(bench, access_level)


def panel(bench: Bench):
    return bench.hass.data["frontend_panels"]["chauffage"]


@pytest.mark.parametrize(("access_level", "admins_only"), [("use", True), ("plan", True), ("set_up", False)])
async def test_set_up_opens_the_panel_to_every_user(bench: Bench, access_level, admins_only):
    """*Plan* works from the dashboard card: the panel holds the presets, the rules and the
    thermostats, which need *Set up*."""
    await setup_with_the_panel(bench, access_level)
    assert panel(bench).require_admin is admins_only


async def test_the_panel_follows_the_access_level_without_a_restart(bench: Bench):
    await setup_with_the_panel(bench)
    for access_level, admins_only in (("set_up", False), ("plan", True)):
        bench.runtime.set_access_level(access_level)
        await bench.hass.async_block_till_done()
        assert panel(bench).require_admin is admins_only
        assert panel(bench).sidebar_title == "Chauffage"
