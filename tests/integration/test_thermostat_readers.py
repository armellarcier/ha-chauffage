"""How Chauffage reads a thermostat from its state: a Versatile Thermostat as it was asked, any
other climate entity as it shows itself (thermostats/)."""

from homeassistant.core import State

from custom_components.chauffage.thermostats.generic import GenericReader
from custom_components.chauffage.thermostats.vtherm import VThermReader

GENERIC, VTHERM = GenericReader(), VThermReader()


def cause(attributes: dict, state: str) -> str | None:
    return GENERIC.cause(State("climate.salon", state, attributes))


def test_a_thermostat_is_ready_once_it_shows_a_setpoint_or_a_preset():
    """At a restart, a thermostat may write a first state before it has restored its own: VTherm
    writes `off` without setpoint or preset (#93)."""
    assert not GENERIC.ready({})
    assert not GENERIC.ready({"temperature": None, "current_temperature": None})
    assert GENERIC.ready({"temperature": 20.0})
    assert GENERIC.ready({"preset_mode": "eco"})
    assert GENERIC.ready({"target_temp_low": 18.0, "target_temp_high": 24.0})  # heat_cool


def test_a_vtherm_is_not_ready_while_it_says_so():
    """VTherm 9 and later publish is_ready; VTherm 8 publishes nothing."""
    assert not VTHERM.ready({"temperature": 20.0, "is_ready": False})
    assert VTHERM.ready({"temperature": 20.0, "is_ready": True})
    assert VTHERM.ready({"temperature": 20.0})  # VTherm 8
    assert GENERIC.ready({"temperature": 20.0, "is_ready": False})  # not a VTherm's attribute


def test_a_vtherm_asked_for_no_setpoint_keeps_the_setpoint_it_shows():
    """A requested_state on the manual preset without a setpoint: the setpoint shown counts."""
    shown = {"preset_mode": "none", "temperature": 19.0,
             "requested_state": {"hvac_mode": "heat", "target_temperature": None, "preset": "none"}}
    assert VTHERM.asked(shown) == ("heat", "none", 19.0)


def test_a_vtherm_is_read_as_it_was_asked_not_as_it_changed_itself():
    """VTherm keeps what it was asked for in requested_state (#92): an open window turns it off
    or sets the frost setpoint, and its intent stays heat."""
    window = {"preset_mode": "none", "temperature": 7.0,
              "requested_state": {"hvac_mode": "heat", "target_temperature": 17.5, "preset": "none"}}
    assert VTHERM.asked(window) == ("heat", "none", 17.5)
    assert GENERIC.asked(window) == (None, "none", 7.0)  # not a VTherm's attribute


def test_a_vtherm_on_a_preset_keeps_the_setpoint_it_shows():
    """On a preset, requested_state keeps the last manual setpoint, not the preset's."""
    window = {"preset_mode": "eco", "temperature": 7.0,
              "requested_state": {"hvac_mode": "heat", "target_temperature": 19.0, "preset": "eco"}}
    assert VTHERM.asked(window) == ("heat", "eco", 7.0)
    central = {"preset_mode": "frost", "temperature": 7.0,
               "requested_state": {"hvac_mode": "heat", "target_temperature": 19.0, "preset": "comfort"}}
    assert VTHERM.asked(central) == ("heat", "comfort", 7.0)


def test_a_vtherm_without_requested_state_is_read_as_it_shows():
    """A state without requested_state: the attributes as they are."""
    assert VTHERM.asked({"preset_mode": "eco", "temperature": 17.0}) == (None, "eco", 17.0)
    assert VTHERM.asked({"preset_mode": "eco", "temperature": 17.0, "requested_state": {}}) == (None, "eco", 17.0)


def test_a_vtherm_goes_to_its_manual_preset_by_itself():
    """Versatile Thermostat leaves its preset when it gets a setpoint: Chauffage sets no preset
    "none" before the setpoint (Target.preset_to_leave)."""
    attributes = {"preset_mode": "eco", "preset_modes": ["none", "eco"], "temperature": 17.0}
    assert VTHERM.read(State("climate.salon", "heat", attributes)).leaves_preset_itself
    assert not GENERIC.read(State("climate.salon", "heat", attributes)).leaves_preset_itself


def test_why_a_vtherm_protects_itself():
    """For the card: VTherm says why it turned itself off (hvac_off_reason in its
    specific_states), and whether its window is open while it keeps heating at the frost setpoint (window_manager, C8)."""
    assert cause({"specific_states": {"hvac_off_reason": "hvac_off_window"}}, "off") == "window"
    assert cause({"specific_states": {"hvac_off_reason": "hvac_off_auto_start_stop"}}, "off") == "auto_start_stop"
    assert cause({"specific_states": {"hvac_off_reason": "hvac_off_manual"}}, "off") is None
    # The window action "frost": the VTherm stays on
    assert cause({"specific_states": {"window_manager": {"window_state": "on"}, "hvac_mode_reason": "hvac_off_window_detection"}}, "heat") == "window"
    assert cause({"specific_states": {"window_manager": {"window_state": "off"}, "hvac_mode_reason": "hvac_off_window_detection"}}, "heat") is None
    assert cause({"specific_states": {"hvac_off_reason": "hvac_off_auto_start_stop"}}, "heat") is None  # started again
    assert cause({}, "heat") is None
