"""The third review of "the slot chooses the HVAC mode first" (#91): the fan to give back kept
while a thermostat is offline, a device preset that cannot be left or that stays on at the
slot's temperature, and a window that must not teach a preset's temperature."""

import pytest

from homeassistant.core import Context, ServiceCall
from homeassistant.exceptions import HomeAssistantError

from conftest import KINDS, Bench

from custom_components.chauffage import model

from test_hvac_mode_review_2 import DAIKIN_PRESETS, FAN_DAY, FANS, SALON, clear, fan, start


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


# ----- the fan to give back, while the thermostat is offline -----

async def test_a_thermostat_back_online_still_gets_its_fan_back(bench: Bench):
    """The afternoon slot blows hard, then the air conditioner goes offline and comes back. The
    evening slot chooses no fan: the air conditioner gets back the fan it had before."""
    await start(bench, FAN_DAY, "13:00", **FANS)
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
    await start(bench, FAN_DAY, "13:00", **FANS)
    assert bench.runtime.snapshot()["thermostats"][SALON]["own_settings"] == {}
    await bench.go_to("14:00")
    assert bench.runtime.snapshot()["thermostats"][SALON]["own_settings"] == {"fan_mode": "auto"}


# ----- a device preset that would fight a setpoint -----

async def daikin_on_eco(bench: Bench, temperature: float | None = None) -> None:
    """A Daikin on its eco preset, at 13:00. Its 14:00 slot asks for 21 °C."""
    bench.needs("standard")
    await bench.go_to("13:00")
    bench.thermostat(SALON, "eco", preset_modes=DAIKIN_PRESETS)
    await bench.setup()
    await bench.runtime.set_mapping(SALON, {"comfort": {"temperature": 21}})
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


async def test_a_daikin_that_refuses_to_leave_its_preset_gets_the_setpoint_anyway(bench: Bench, caplog):
    """The call that leaves the preset failed. The setpoint is sent anyway: the room gets its
    temperature, even if the preset stays on. The refusal is logged, and not tried again every
    minute."""
    await daikin_on_eco(bench)
    refuse_presets(bench)
    await bench.go_to("14:00")
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and bench.runtime.pending(SALON) == []
    assert SALON not in bench.runtime.retrying
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
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and SALON in bench.runtime.retrying


async def test_a_daikin_already_at_the_slot_temperature_leaves_its_preset(bench: Bench):
    """The Daikin shows 21 °C already, on eco. The slot asks for 21 °C, not for eco: the preset
    is left, then the setpoint is sent, as a thermostat may change it when it leaves a preset."""
    await daikin_on_eco(bench, 21.0)
    await bench.go_to("14:00")
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and bench.runtime.pending(SALON) == []
    assert bench.overrides() == {}
    await bench.advance(3)
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and bench.runtime.pending(SALON) == []


# ----- a Versatile Thermostat's window -----

async def test_a_window_that_sets_the_frost_setpoint_teaches_no_preset_temperature(bench: Bench):
    """The window action "frost" keeps the VTherm on its preset and sets 7 °C: 7 °C is not the
    temperature of that preset."""
    bench.needs("vtherm")
    bench.versatile_thermostat(SALON)
    await bench.go_to("10:00")
    bench.thermostat(SALON, "eco")
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"]]] * 7}})
    before = dict(bench.runtime.thermostats[SALON]["preset_temperatures"])
    bench.thermostat(SALON, "eco", 7.0, context=Context(),
                     requested_state={"hvac_mode": "heat", "target_temperature": 17.0, "preset": "eco"},
                     specific_states={"window_manager": {"window_state": "on"}})
    await bench.hass.async_block_till_done()
    assert bench.runtime.thermostats[SALON]["preset_temperatures"] == before


# ----- the default colors -----

def test_a_new_installation_gets_a_boost_red_that_white_text_reads_on():
    """White on the former #e53935 is at 4.2:1, under the 4.5:1 of WCAG AA. Existing
    installations keep their colors: the stored presets are not touched (test_store.py)."""
    colors = {p["id"]: p["color"] for p in model.default_presets("en")}
    assert colors["boost"] == "#d32f2f"
