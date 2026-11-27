"""The reader of a thermostat, chosen by the integration that provides it."""

from __future__ import annotations

from typing import Protocol

from homeassistant.core import HomeAssistant, State
from homeassistant.helpers import entity_registry as er

from ..domain.thermostat import Thermostat
from .generic import GenericReader
from .vtherm import VThermReader

VTHERM = "versatile_thermostat"  # Versatile Thermostat's integration


class ThermostatReader(Protocol):
    def read(self, state: State, hvac_control: bool = True) -> Thermostat:
        """What the scheduler needs to know about the thermostat, and whether Chauffage controls
        its HVAC mode (#159)."""

    def cause(self, state: State) -> str | None:
        """Why the thermostat protects itself: "window", "auto_start_stop", or None."""


GENERIC, VTHERM_READER = GenericReader(), VThermReader()


def _reader(hass: HomeAssistant, entity_id: str) -> ThermostatReader:
    """A Versatile Thermostat is recognized by its integration, not by its attributes: VTherm
    moved some of them (#74)."""
    entry = er.async_get(hass).async_get(entity_id)
    return VTHERM_READER if entry is not None and entry.platform == VTHERM else GENERIC


def read(hass: HomeAssistant, state: State | None, hvac_control: bool = True) -> Thermostat | None:
    """What the scheduler needs to know about a thermostat. `hvac_control`: whether Chauffage
    controls its HVAC mode (#159, Settings.controls_hvac_mode)."""
    return _reader(hass, state.entity_id).read(state, hvac_control) if state is not None else None


def cause(hass: HomeAssistant, state: State | None) -> str | None:
    """Why a thermostat protects itself: "window", "auto_start_stop", or None."""
    return _reader(hass, state.entity_id).cause(state) if state is not None else None
