"""Heat/cool (#91): on a thermostat that takes a range of temperatures, a slot or an override
sends the preset's heating and cooling temperatures; on a thermostat that takes a single
setpoint, heat/cool is read as heat."""

import pytest
from homeassistant.core import Event, callback
from homeassistant.exceptions import ServiceValidationError

from conftest import CTX_USER, KINDS, Bench
from hvac_helpers import (
    PRESETS, RANGE, REVERSIBLE, SALON, SINGLE, by_hand, clear, override, presets_without, sent_to, start_ac_alone,
    start_ac_with_range, unit,
)

from custom_components.chauffage import logbook
from custom_components.chauffage.domain.manual_change import NewOverride, NoChange, classify
from custom_components.chauffage.domain.preset import Preset
from custom_components.chauffage.domain.preset_value import PresetValue
from custom_components.chauffage.domain.slot import slot_hvac_mode
from custom_components.chauffage.domain.target import Target
from custom_components.chauffage.domain.thermostat import Thermostat, setpoint_modes
from custom_components.chauffage.storage.schema import InvalidData


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def from_the_card(bench: Bench, client, override: dict | None) -> dict:
    await client.send_json_auto_id({"type": "chauffage/override/set", "entity_id": SALON, "override": override})
    reply = await client.receive_json()
    await bench.hass.async_block_till_done()
    return reply


# ----- a heat/cool slot -----

def test_heat_cool_needs_both_temperatures_and_a_thermostat_that_takes_a_range():
    single = Thermostat("heat", None, 20.0, hvac_modes=tuple(REVERSIBLE))
    assert PresetValue.from_target(Preset.from_stored(PRESETS["comfort"]).value_on(None, single).attributes()).offered_modes() == ["heat", "cool"]
    assert "heat_cool" not in setpoint_modes(single)
    assert setpoint_modes(unit()) == ["heat", "cool", "heat_cool"]


def test_heat_cool_is_read_as_heat_on_a_thermostat_that_takes_no_range():
    single = Thermostat("heat", None, 20.0, hvac_modes=tuple(REVERSIBLE))
    assert slot_hvac_mode({"hvac_mode": "heat_cool"}, single) == "heat"


async def test_a_heat_cool_slot_sends_the_heating_and_the_cooling_temperature(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco"], ["14:00", "comfort", {"hvac_mode": "heat_cool"}]], "13:00")
    await bench.go_to("14:00")
    assert bench.powered() == {SALON: "heat_cool"}
    assert bench.range_calls == [(SALON, 20.0, 25.0)] and sent_to(bench) == []
    planned = bench.runtime.read_model.planned_targets(SALON)
    assert planned["hvac_mode"] == "heat_cool"
    # The thermostat shows it: nothing more is sent at the next minute
    clear(bench)
    await bench.go_to("14:01")
    assert bench.range_calls == [] and bench.powered() == {}


async def test_a_heat_cool_slot_heats_on_a_thermostat_that_takes_no_range(bench: Bench):
    await bench.go_to("13:00")
    bench.thermostat(SALON, "eco", hvac_modes=REVERSIBLE)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"], ["14:00", "comfort", {"hvac_mode": "heat_cool"}]]] * 7}})
    assert bench.runtime.read_model.planned_targets(SALON)["next_hvac_mode"] == "heat"


async def test_no_preset_temperature_is_learned_in_heat_cool(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "comfort", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=20.0, target_temp_high=25.0)
    assert bench.runtime.installation.thermostats[SALON]["preset_temperatures"] == {}


async def test_a_range_whose_low_is_already_shown_is_sent_whole(bench: Bench):
    """climate.set_temperature takes target_temp_low and target_temp_high together. A range
    whose low the thermostat already shows was sent as its high alone: Home Assistant refused
    it, and Chauffage sent it again every minute."""
    await start_ac_with_range(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    await override(bench, hvac_mode="heat_cool", target_temp_low=17, target_temp_high=24)
    assert bench.range_calls == [(SALON, 17.0, 24.0)]
    await bench.advance(3)
    assert bench.range_calls == [(SALON, 17.0, 24.0)] and bench.runtime.gateway.pending(SALON) == []


def test_a_range_is_checked_once_fitted_to_the_thermostat():
    """27 °C and 29 °C on a thermostat that goes up to 26 °C: both become 26 °C, not a range."""
    unit = Thermostat("heat", None, 20.0, hvac_modes=tuple(REVERSIBLE), supports_range=True, max_temp=26.0)
    value = Preset.from_stored({**PRESETS["comfort"], "temperature": 27.0, "cool_temperature": 29.0}).value_on(None, unit, False).attributes()
    assert "target_temp_low" not in value and "heat_cool" not in PresetValue.from_target(value).offered_modes()
    value = Preset.from_stored(PRESETS["comfort"]).value_on(None, unit, False).attributes()
    assert (value["target_temp_low"], value["target_temp_high"]) == (20.0, 25.0)


def test_a_temperature_the_user_chose_is_sent_in_heat_cool():
    """The card and chauffage.set_override refuse a single temperature on a thermostat that takes
    a range in heat/cool. An override stored before that refusal is sent as it is: the
    thermostat may refuse it."""
    ranged = Thermostat("heat_cool", None, None, hvac_modes=tuple(REVERSIBLE), supports_range=True)
    assert Target({"temperature": 22.0}).completed_for(ranged, by_user=True) == {"temperature": 22.0}
    single = Thermostat("heat_cool", None, 21.0, hvac_modes=tuple(REVERSIBLE))
    assert Target({"temperature": 22.0}).completed_for(single, by_user=True) == {"temperature": 22.0}


@pytest.mark.parametrize("key", ["temperature", "cool_temperature"])
async def test_a_temperature_a_heat_cool_slot_uses_cannot_be_cleared_with_a_device_preset(bench: Bench, key: str):
    """The salon uses its own preset for Eco. A heat/cool slot needs two numbers: the heating
    and the cooling temperature of Eco. A device preset gives none, so neither can be cleared."""
    await start_ac_alone(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]])
    await bench.runtime.schedules.set_mapping(SALON, {"eco": {"preset_mode": "eco"}})
    with pytest.raises(InvalidData, match="eco"):
        await bench.runtime.schedules.set_presets(presets_without("eco", key))
    assert bench.runtime.installation.presets_by_id["eco"][key] is not None


async def test_a_temperature_set_on_the_thermostat_serves_its_heat_cool_slots(bench: Bench):
    """The salon has its own cooling temperature for Eco: Eco's default when cooling is not
    used by its heat/cool slots."""
    await start_ac_alone(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]])
    await bench.runtime.schedules.set_mapping(SALON, {"eco": {"cool_temperature": 26}})
    await bench.runtime.schedules.set_presets(presets_without("eco", "cool_temperature"))
    assert "cool_temperature" not in bench.runtime.installation.presets_by_id["eco"]


# ----- a heat/cool override -----

async def test_set_override_takes_heat_cool_with_a_pair_of_temperatures(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco"]])
    await override(bench, hvac_mode="heat_cool", target_temp_low=19, target_temp_high=24.5)
    assert bench.powered() == {SALON: "heat_cool"} and bench.range_calls == [(SALON, 19.0, 24.5)]
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": "heat_cool", "target_temp_low": 19.0, "target_temp_high": 24.5}


async def test_the_logbook_says_the_range_of_a_heat_cool_override(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco"]])
    events: list[Event] = []
    bench.hass.bus.async_listen("chauffage_override_started", callback(lambda event: events.append(event)))
    await override(bench, hvac_mode="heat_cool", target_temp_low=19, target_temp_high=24.5, duration=60)
    described = {}
    logbook.async_describe_events(bench.hass, lambda domain, name, describe: described.update({name: describe}))
    assert "heat/cool, 19–24.5 °C" in described["chauffage_override_started"](events[0])["message"]
    bench.hass.config.language = "fr"
    assert "19–24,5 °C" in described["chauffage_override_started"](events[0])["message"]


async def test_set_override_takes_heat_cool_with_a_preset(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco"]])
    await override(bench, hvac_mode="heat_cool", preset="eco")
    assert bench.range_calls == [(SALON, 17.0, 27.0)]
    assert bench.overrides()[SALON]["preset"] == "eco"


async def test_set_override_refuses_heat_cool_on_a_thermostat_that_takes_no_range(bench: Bench):
    await bench.go_to("10:00")
    bench.thermostat(SALON, "eco", hvac_modes=REVERSIBLE)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"]]] * 7}})
    with pytest.raises(ServiceValidationError):
        await override(bench, hvac_mode="heat_cool", preset="eco")


async def test_set_override_refuses_a_temperature_while_the_thermostat_runs_heat_cool_on_a_range(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    with pytest.raises(ServiceValidationError):
        await override(bench, temperature=22)
    assert bench.overrides() == {} and bench.temperature_calls == []
    # With an HVAC mode that takes one setpoint, the temperature is sent
    await override(bench, temperature=22, hvac_mode="heat")
    assert bench.powered() == {SALON: "heat"} and bench.temperature_calls == [(SALON, 22.0)]


async def test_a_temperature_set_from_the_card_in_heat_cool_is_not_sent_again_every_minute(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    await bench.set_override(SALON, bench.runtime.overrides.new({"temperature": 22.0}))
    await bench.advance(3)
    assert sent_to(bench) == [22.0]  # once


async def test_the_card_cannot_set_a_single_temperature_in_heat_cool(bench: Bench, ws_client):
    """A thermostat that takes a range in heat/cool refuses a single temperature. The service
    refuses such an override, and the websocket API recorded it: an override that did nothing."""
    await start_ac_alone(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    client = await ws_client(bench.hass)
    for target in ({"temperature": 22}, {"temperature": 22, "hvac_mode": "heat_cool"}):
        reply = await from_the_card(bench, client, bench.runtime.overrides.new(target))
        assert not reply["success"] and reply["error"]["code"] == "invalid_format"
    assert bench.overrides() == {} and bench.temperature_calls == []
    # In an HVAC mode that takes one setpoint, the temperature is sent
    reply = await from_the_card(bench, client, bench.runtime.overrides.new({"temperature": 22, "hvac_mode": "cool"}))
    assert reply["success"] and bench.temperature_calls == [(SALON, 22.0)]


async def test_the_card_changes_the_end_of_an_override_recorded_in_heat_cool(bench: Bench, ws_client):
    """An override recorded before the refusal, or set by hand on the device, keeps its value:
    the card may still change its end, and remove it."""
    await start_ac_alone(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    override = bench.runtime.overrides.new({"temperature": 22.0})
    await bench.set_override(SALON, override)
    client = await ws_client(bench.hass)
    reply = await from_the_card(bench, client, {**override, "end": "2026-10-12T15:00:00+02:00"})
    assert reply["success"] and bench.overrides()[SALON]["end"] == "2026-10-12T15:00:00+02:00"


async def test_a_single_temperature_is_taken_in_heat_cool_without_a_range(bench: Bench, ws_client):
    """A thermostat that takes one setpoint in heat/cool, as a Daikin."""
    await bench.go_to("10:00")
    bench.thermostat(SALON, "eco", state="heat_cool", hvac_modes=REVERSIBLE)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"]]] * 7}})
    client = await ws_client(bench.hass)
    reply = await from_the_card(bench, client, bench.runtime.overrides.new({"temperature": 22}))
    assert reply["success"] and bench.overrides()[SALON]["target"] == {"temperature": 22.0}


# ----- heat/cool by hand -----

async def test_switching_to_heat_cool_by_hand_sends_nothing(bench: Bench):
    """The person chose an HVAC mode: the override holds it, and Chauffage sends no range."""
    await start_ac_with_range(bench, [["00:00", "eco", {"hvac_mode": "heat"}]])
    by_hand(bench, "heat_cool")
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": "heat_cool"}
    assert bench.range_calls == [] and bench.applied() == {}


async def test_a_range_changed_by_hand_in_heat_cool_is_an_override(bench: Bench):
    await start_ac_with_range(bench, [["00:00", "comfort", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=20.0, target_temp_high=25.0)
    await bench.go_to("10:01")
    clear(bench)
    bench.thermostat(SALON, None, None, state="heat_cool", hvac_modes=REVERSIBLE, supported_features=RANGE,
                     target_temp_low=19.0, target_temp_high=24.0, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides()[SALON]["target"] == {"target_temp_low": 19.0, "target_temp_high": 24.0}
    assert bench.range_calls == []
    # Back to the slot's range: the override ends
    bench.thermostat(SALON, None, None, state="heat_cool", hvac_modes=REVERSIBLE, supported_features=RANGE,
                     target_temp_low=20.0, target_temp_high=25.0, context=CTX_USER)
    await bench.hass.async_block_till_done(wait_background_tasks=True)
    assert bench.overrides() == {}


async def test_a_setpoint_changed_by_hand_in_heat_cool_is_an_override_without_a_range(bench: Bench):
    """A thermostat that takes one setpoint in heat/cool, as a Daikin: its setpoint changed by
    hand is an override, as in heat."""
    await start_ac_with_range(bench, [["00:00", "eco"]], features=SINGLE)
    by_hand(bench, "heat_cool", features=SINGLE)
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"] == {"hvac_mode": "heat_cool"}
    by_hand(bench, "heat_cool", 23.0, features=SINGLE)
    await bench.hass.async_block_till_done()
    assert bench.overrides()[SALON]["target"]["temperature"] == 23.0
    assert bench.temperature_calls == [] and bench.range_calls == []


def test_a_single_setpoint_in_heat_cool_is_read_only_without_a_range():
    before = Thermostat("heat_cool", None, 21.0, hvac_modes=tuple(REVERSIBLE))
    after = Thermostat("heat_cool", None, 23.0, hvac_modes=tuple(REVERSIBLE))
    assert classify(before, after, by_user=True) == NewOverride(Target({"temperature": 23.0}))
    ranged = {"supports_range": True, "target_temp_low": 18.0, "target_temp_high": 25.0}
    before, after = (Thermostat("heat_cool", None, t, hvac_modes=tuple(REVERSIBLE), **ranged) for t in (21.0, 23.0))
    assert classify(before, after, by_user=True) == NoChange()
