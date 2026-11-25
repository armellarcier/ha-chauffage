"""The reader of a thermostat, chosen by the integration that provides it."""

from __future__ import annotations

from typing import Protocol

from homeassistant.core import State

from ..domain.thermostat import Thermostat
from .generic import GenericReader
from .vtherm import VThermReader

VTHERM = "versatile_thermostat"  # Versatile Thermostat's integration


class ThermostatReader(Protocol):
    def read(self, state: State) -> Thermostat:
        """What the scheduler needs to know about the thermostat."""

    def cause(self, state: State) -> str | None:
        """Why the thermostat protects itself: "window", "auto_start_stop", or None."""


GENERIC, VTHERM_READER = GenericReader(), VThermReader()


def reader_for(platform: str | None) -> ThermostatReader:
    """A Versatile Thermostat is recognized by its integration, not by its attributes: VTherm
    moved some of them (#74)."""
    return VTHERM_READER if platform == VTHERM else GENERIC
