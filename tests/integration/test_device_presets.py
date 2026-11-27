"""A thermostat's own presets (#91): a device preset is sent in cool as in heat, and a device
preset that would fight a setpoint, as on a Daikin, is left first."""

import pytest
from homeassistant.core import ServiceCall
from homeassistant.exceptions import HomeAssistantError

from conftest import CTX_AUTOMATION, KINDS, Bench
from hvac_helpers import (
    AC_MODES, BUREAU, COOL, COOLING, ECO_IN_COOL, REVERSIBLE, SALON, ac, clear, start_ac, start_salon,
)

from custom_components.chauffage.domain.target import Target
from custom_components.chauffage.domain.thermostat import Thermostat


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


DAIKIN_PRESETS = ["none", "away", "eco", "boost"]


def daikin(preset: str | None = "eco", **more) -> Thermostat:
    return Thermostat("heat", preset, 24.0, presets=tuple(DAIKIN_PRESETS), hvac_modes=tuple(REVERSIBLE), **more)


async def daikin_on_eco(bench: Bench, temperature: float | None = None) -> None:
    """A Daikin on its eco preset, at 13:00. Its 14:00 slot asks for 21 °C."""
    bench.needs("standard")
    await bench.go_to("13:00")
    bench.thermostat(SALON, "eco", preset_modes=DAIKIN_PRESETS)
    await bench.setup()
    await bench.runtime.schedules.set_mapping(SALON, {"comfort": {"temperature": 21}})
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"], ["14:00", "comfort"]]] * 7}})
    bench.thermostat(SALON, "eco", temperature, preset_modes=DAIKIN_PRESETS)
    await bench.hass.async_block_till_done()
    clear(bench)


def refuse_presets(bench: Bench) -> None:
    """The thermostat refuses climate.set_preset_mode. It takes a setpoint and keeps its
    preset."""
    async def set_preset_mode(call: ServiceCall) -> None:
        bench.calls.append((call.data["entity_id"], call.data["preset_mode"]))
        raise HomeAssistantError("preset refused (simulated)")

    async def set_temperature(call: ServiceCall) -> None:
        entity_id, temperature = call.data["entity_id"], call.data["temperature"]
        bench.calls.append((entity_id, str(temperature)))
        current = bench.hass.states.get(entity_id)
        bench.hass.states.async_set(entity_id, current.state, {**current.attributes, "temperature": temperature},
                                    context=call.context)

    bench.hass.services.async_register("climate", "set_preset_mode", set_preset_mode)
    bench.hass.services.async_register("climate", "set_temperature", set_temperature)


# ----- a device preset when cooling -----

def test_in_cool_the_device_preset_is_sent_and_the_heating_temperature_is_not():
    own = {"preset_mode": "eco", "cool_preset_mode": "eco"}
    assert Target(own).completed_for(ac("cool")) == {"preset_mode": "eco"}
    assert Target({**own, "hvac_mode": "cool"}).completed_for(ac("heat")) == {"preset_mode": "eco", "hvac_mode": "cool"}
    assert Target({"preset_mode": "frost"}).completed_for(ac("cool")) == {}  # no value when cooling
    assert Target({"temperature": 21.0}).completed_for(ac("cool")) == {}
    assert Target({"temperature": 21.0, "cool_temperature": 26.0}).completed_for(ac("cool")) == {"temperature": 26.0}
    assert Target({"temperature": 24.0}).completed_for(ac("cool"), by_user=True) == {"temperature": 24.0}


async def test_in_cool_a_device_preset_stored_by_the_user_is_still_sent(bench: Bench):
    bench.needs("vtherm", "standard")
    await start_salon(bench, "13:00", ECO_IN_COOL, **COOLING)
    await bench.runtime.schedules.set_mapping("climate.salon", {"eco": {"preset_mode": "eco"}})
    await bench.hass.async_block_till_done()
    bench.applied()
    await bench.go_to("14:00")
    assert bench.applied() == {"climate.salon": "eco"}


async def test_the_card_sees_what_a_thermostat_s_own_preset_gives_when_cooling(bench: Bench):
    """A Versatile Thermostat publishes its cooling preset temperatures. Another thermostat
    shows it while it cools on the preset: learned apart from its heating temperature."""
    bench.needs("vtherm", "standard")
    if bench.kind == "vtherm":
        bench.versatile_thermostat(SALON)
    await start_ac(bench, "10:00", [["00:00", "comfort", COOL]], preset="comfort")
    published = {"preset_temperatures": {"comfort_temp": 20.0, "comfort_cool_temp": 25.0}} if bench.kind == "vtherm" else {}
    bench.thermostat(SALON, "comfort", 25.0, state="cool", hvac_modes=AC_MODES, context=CTX_AUTOMATION, **published)
    await bench.hass.async_block_till_done()
    snapshot = bench.runtime.read_model.snapshot()
    assert snapshot["cool_preset_temperatures"][SALON]["comfort"] == 25.0
    assert snapshot["preset_temperatures"][SALON]["comfort"] == 20.0
    assert SALON not in snapshot["cool_preset_temperatures"].get(BUREAU, {})


# ----- a device preset that would fight a setpoint -----

def test_a_thermostat_leaves_its_preset_before_a_setpoint():
    """A Daikin keeps its preset when it gets a setpoint: left on eco, it would go on saving
    energy against the temperature the slot asks for."""
    assert Target({"temperature": 21.0}).preset_to_leave(daikin()) == "none"
    assert Target({"target_temp_low": 20.0, "target_temp_high": 25.0}).preset_to_leave(daikin("boost")) == "none"


def test_a_thermostat_keeps_its_preset_without_a_setpoint_or_without_the_preset_none():
    assert Target({"preset_mode": "eco", "temperature": 21.0}).preset_to_leave(daikin("away")) is None
    assert Target({"fan_mode": "auto"}).preset_to_leave(daikin()) is None
    assert Target({"temperature": 21.0}).preset_to_leave(daikin("none")) is None
    assert Target({"temperature": 21.0}).preset_to_leave(daikin(None)) is None
    assert Target({"temperature": 21.0}).preset_to_leave(None) is None
    plain = Thermostat("heat", "eco", 17.0, presets=("eco", "comfort"), hvac_modes=("off", "heat"))
    assert Target({"temperature": 21.0}).preset_to_leave(plain) is None
    # A Versatile Thermostat goes to its manual preset by itself when it gets a setpoint
    vtherm = Thermostat("heat", "eco", 17.0, presets=("none", "eco"), hvac_modes=("off", "heat"), leaves_preset_itself=True)
    assert Target({"temperature": 21.0}).preset_to_leave(vtherm) is None


async def test_a_slot_on_a_temperature_takes_a_daikin_off_its_preset(bench: Bench):
    """The preset is left first, then the setpoint is sent: a thermostat may give back an older
    setpoint when it leaves a preset."""
    bench.needs("standard")
    await bench.go_to("13:00")
    bench.thermostat(SALON, "eco", preset_modes=DAIKIN_PRESETS)
    await bench.setup()
    await bench.runtime.schedules.set_mapping(SALON, {"comfort": {"temperature": 21}})
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"], ["14:00", "comfort"]]] * 7}})
    bench.thermostat(SALON, "eco", preset_modes=DAIKIN_PRESETS)
    await bench.hass.async_block_till_done()
    clear(bench)
    await bench.go_to("14:00")
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")]
    assert bench.overrides() == {}
    await bench.advance(3)
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and bench.runtime.gateway.pending(SALON) == []


async def test_a_daikin_that_refuses_to_leave_its_preset_gets_the_setpoint_anyway(bench: Bench, caplog):
    """The call that leaves the preset failed. The setpoint is sent anyway: the room gets its
    temperature, even if the preset stays on. The refusal is logged, and not tried again every
    minute."""
    await daikin_on_eco(bench)
    refuse_presets(bench)
    await bench.go_to("14:00")
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and bench.runtime.gateway.pending(SALON) == []
    assert SALON not in bench.runtime.scheduler.retry
    assert "could not leave its preset eco" in caplog.text
    # The Daikin keeps eco at 21 °C: nothing more is sent
    state = bench.hass.states.get(SALON)
    assert (state.attributes["preset_mode"], state.attributes["temperature"]) == ("eco", 21.0)
    bench.calls.clear()
    await bench.advance(3)
    assert bench.calls == [] and bench.overrides() == {}


async def test_an_unreachable_daikin_is_sent_its_slot_again(bench: Bench):
    """Every call failed: the slot is sent again at the next minutes."""
    await daikin_on_eco(bench)
    bench.unreachable.add(SALON)
    await bench.go_to("14:00")
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and SALON in bench.runtime.scheduler.retry


async def test_a_daikin_already_at_the_slot_temperature_leaves_its_preset(bench: Bench):
    """The Daikin shows 21 °C already, on eco. The slot asks for 21 °C, not for eco: the preset
    is left, then the setpoint is sent, as a thermostat may change it when it leaves a preset."""
    await daikin_on_eco(bench, 21.0)
    await bench.go_to("14:00")
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and bench.runtime.gateway.pending(SALON) == []
    assert bench.overrides() == {}
    await bench.advance(3)
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and bench.runtime.gateway.pending(SALON) == []
