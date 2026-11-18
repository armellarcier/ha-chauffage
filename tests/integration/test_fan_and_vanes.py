"""The fan and the vanes (#91): a slot or a preset's value can set them, and a slot or an
override that chooses none gives back the fan the thermostat had."""

import pytest
from homeassistant.core import Context

from conftest import CTX_USER, KINDS, Bench
from hvac_helpers import AC_MODES, SALON, clear, start_ac_alone, start_salon

from custom_components.chauffage import engine


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


AC_ATTRS = {"hvac_modes": AC_MODES, "fan_modes": ["auto", "1", "2", "3"], "swing_modes": ["auto", "swing"],
            "swing_horizontal_modes": ["auto", "split"], "fan_mode": "auto", "swing_mode": "auto", "swing_horizontal_mode": "auto"}
FANS = {"fan_modes": ["auto", "1", "2", "3"], "fan_mode": "auto"}
FAN_DAY = [["00:00", "eco"], ["14:00", "comfort", {"fan_mode": "3"}], ["16:00", "comfort"], ["20:00", "eco"]]


def fan(bench: Bench) -> dict:
    return {attr: value for (_, attr), value in bench.settings().items()}


# ----- a slot sets the fan and the vanes -----

async def test_a_slot_can_set_the_fan_and_the_vanes(bench: Bench):
    day = [["00:00", "eco"], ["14:00", "comfort", {"fan_mode": "3", "swing_mode": "swing", "swing_horizontal_mode": "split"}]]
    await start_salon(bench, "13:00", day, **AC_ATTRS)
    await bench.go_to("14:00")
    assert bench.applied() == {"climate.salon": "comfort"}
    assert bench.settings() == {("climate.salon", "fan_mode"): "3", ("climate.salon", "swing_mode"): "swing",
                                ("climate.salon", "swing_horizontal_mode"): "split"}
    assert bench.powered() == {}


async def test_a_preset_s_value_on_a_thermostat_can_set_the_fan(bench: Bench):
    await start_salon(bench, "17:00", **AC_ATTRS)
    await bench.runtime.set_mapping("climate.salon", {"comfort": {"preset_mode": "comfort", "fan_mode": "2"}})
    await bench.hass.async_block_till_done()
    assert bench.runtime.targets_of("climate.salon")["comfort"] == {
        "preset_mode": "comfort", "cool_preset_mode": "comfort", "fan_mode": "2"}
    bench.settings()
    await bench.go_to("17:30")
    assert bench.settings() == {("climate.salon", "fan_mode"): "2"}


async def test_a_fan_already_set_is_not_sent_again(bench: Bench):
    day = [["00:00", "eco"], ["14:00", "comfort", {"fan_mode": "auto"}]]
    await start_salon(bench, "13:00", day, **AC_ATTRS)
    await bench.go_to("14:00")
    assert bench.settings() == {}
    assert bench.applied() == {"climate.salon": "comfort"}


async def test_an_override_that_only_sets_the_cooling_setpoint_is_recorded(bench: Bench):
    """A target without preset, temperature or HVAC mode (the websocket API accepts it): no
    crash, and no kind or value for the automations of before #91."""
    await start_salon(bench, "10:00", **AC_ATTRS)
    await bench.set_override("climate.salon", bench.runtime.new_override({"cool_temperature": 24}))
    assert bench.runtime.override_info("climate.salon")["kind"] is None


async def test_a_script_reads_the_fan_of_the_slots(bench: Bench):
    await start_salon(bench, "10:00", [["00:00", "eco", {"fan_mode": "1"}]], **AC_ATTRS)
    week = await bench.hass.services.async_call(
        "chauffage", "get_week", {"entity_id": "climate.salon"}, blocking=True, return_response=True)
    # As the slot runs on the air conditioner: it heats
    assert week["climate.salon"]["monday"][0] == {"start": "00:00", "end": "24:00", "preset": "eco", "hvac_mode": "heat", "fan_mode": "1"}


# ----- the fan and the vanes are given back -----

async def test_a_slot_that_chooses_no_fan_gives_back_the_fan_the_thermostat_had(bench: Bench):
    """The afternoon slot blows hard. The evening slot chooses no fan: the air conditioner gets
    back the fan it had before the afternoon, not the afternoon's."""
    await start_ac_alone(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:00")
    assert fan(bench) == {"fan_mode": "3"}
    await bench.go_to("16:00")
    assert fan(bench) == {"fan_mode": "auto"}
    assert bench.hass.states.get(SALON).attributes["fan_mode"] == "auto"
    # Given back once: the fan is the user's again
    await bench.go_to("20:00")
    assert fan(bench) == {}


async def test_a_fan_set_by_hand_is_kept_by_the_slots_that_choose_none(bench: Bench):
    await start_ac_alone(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:00")
    current = bench.hass.states.get(SALON)
    bench.hass.states.async_set(SALON, current.state, {**current.attributes, "fan_mode": "1"}, context=CTX_USER)
    await bench.hass.async_block_till_done()
    clear(bench)
    await bench.go_to("16:00")
    assert fan(bench) == {} and bench.hass.states.get(SALON).attributes["fan_mode"] == "1"


async def test_an_override_leaves_the_fan_as_it_is(bench: Bench):
    """An override from the card, during the slot that blows hard: an override sets no fan, so
    the air conditioner keeps blowing hard. At its end, the slot is sent again, with its fan."""
    await start_ac_alone(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:10")
    clear(bench)
    await bench.set_override(SALON, bench.runtime.new_override({"temperature": 23.0}, 30))
    assert fan(bench) == {}
    await bench.advance(31)
    assert bench.overrides() == {} and fan(bench) == {"fan_mode": "3"}


async def test_an_off_slot_gives_no_fan_back(bench: Bench):
    """An off slot sends off, and nothing else. The next slot that chooses no fan gives the fan
    back."""
    day = [["00:00", "eco"], ["14:00", "comfort", {"fan_mode": "3"}], ["16:00", None, {"hvac_mode": "off"}], ["18:00", "eco"]]
    await start_ac_alone(bench, day, "13:00", **FANS)
    await bench.go_to("14:00")
    clear(bench)
    await bench.go_to("16:00")
    assert fan(bench) == {} and bench.powered() == {SALON: "off"}
    await bench.go_to("18:00")
    assert fan(bench) == {"fan_mode": "auto"}


async def test_a_fan_the_thermostat_no_longer_lists_is_not_given_back(bench: Bench):
    await start_ac_alone(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:00")
    current = bench.hass.states.get(SALON)
    bench.hass.states.async_set(SALON, current.state, {**current.attributes, "fan_modes": ["1", "2", "3"]},
                                context=current.context)
    await bench.hass.async_block_till_done()
    clear(bench)
    await bench.go_to("16:00")
    assert fan(bench) == {}


def test_the_fan_given_back_never_replaces_the_one_a_target_chooses():
    own = {"fan_mode": "auto", "swing_mode": "off"}
    assert engine.restored({"temperature": 20.0, "fan_mode": "3"}, own) == {"temperature": 20.0, "fan_mode": "3", "swing_mode": "off"}
    assert engine.restored({"hvac_mode": "off"}, own) == {"hvac_mode": "off"}
    assert engine.restored(None, own) is None


async def test_a_thermostat_back_online_still_gets_its_fan_back(bench: Bench):
    """The afternoon slot blows hard, then the air conditioner goes offline and comes back. The
    evening slot chooses no fan: the air conditioner gets back the fan it had before."""
    await start_ac_alone(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:00")
    shown = bench.hass.states.get(SALON)
    bench.hass.states.async_set(SALON, "unavailable", {})
    await bench.hass.async_block_till_done()
    bench.hass.states.async_set(SALON, shown.state, dict(shown.attributes), context=Context())
    await bench.hass.async_block_till_done()
    clear(bench)
    await bench.go_to("16:00")
    assert fan(bench) == {"fan_mode": "auto"}


async def test_the_card_is_told_the_fan_a_thermostat_gets_back(bench: Bench):
    """The card names it in the choice that sets no fan: "Thermostat's own (auto)"."""
    await start_ac_alone(bench, FAN_DAY, "13:00", **FANS)
    assert bench.runtime.snapshot()["thermostats"][SALON]["own_settings"] == {}
    await bench.go_to("14:00")
    assert bench.runtime.snapshot()["thermostats"][SALON]["own_settings"] == {"fan_mode": "auto"}


# ----- an override never holds the fan or the vanes -----

async def test_an_override_never_holds_the_fan_or_the_vanes(bench: Bench):
    """The fan and the vanes of an override come later (an override that holds only what was
    changed). Sent by the card or by an older card, they are dropped, and nothing is sent."""
    await start_ac_alone(bench, [["00:00", "eco"]], "10:00", **FANS)
    await bench.set_override(SALON, bench.runtime.new_override(
        {"hvac_mode": "fan_only", "fan_mode": "3", "swing_mode": "vertical"}))
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": "fan_only"}
    assert fan(bench) == {}


async def test_an_override_to_a_preset_does_not_take_the_fan_of_its_value(bench: Bench):
    """The preset's value on the thermostat sets the fan: a slot on that preset sends it, an
    override to that preset does not."""
    await start_ac_alone(bench, [["00:00", "eco"]], "10:00", **FANS)
    await bench.runtime.set_mapping(SALON, {"comfort": {"temperature": 21, "fan_mode": "1"}})
    clear(bench)
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": SALON, "preset": "comfort"},
                                         blocking=True)
    await bench.hass.async_block_till_done()
    assert "fan_mode" not in bench.overrides()[SALON]["target"]
    assert fan(bench) == {}


@pytest.mark.parametrize("mode", ["dry", "fan_only"])
async def test_a_fan_changed_by_hand_during_an_override_is_left_as_it_is(bench: Bench, mode: str):
    """An override in dry or in fan only. The fan set to 3 on the thermostat changes nothing in
    the override, and Chauffage does not set another fan back."""
    await start_ac_alone(bench, [["00:00", "eco"]], "10:00", **FANS)
    await bench.set_override(SALON, bench.runtime.new_override({"hvac_mode": mode}))
    before = dict(bench.overrides()[SALON])
    current = bench.hass.states.get(SALON)
    bench.hass.states.async_set(SALON, current.state, {**current.attributes, "fan_mode": "3"}, context=CTX_USER)
    await bench.hass.async_block_till_done()
    clear(bench)
    assert bench.overrides()[SALON] == before
    await bench.go_to("10:30")
    assert fan(bench) == {} and bench.hass.states.get(SALON).attributes["fan_mode"] == "3"
