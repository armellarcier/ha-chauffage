"""Chauffage: weekly heating schedules for Home Assistant thermostats.

Work in progress (phase 1 of the roadmap, see docs/integration-plan.md): this config entry
does nothing yet; the package in packages/chauffage/ is still the released version.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Chauffage from its config entry."""
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the config entry."""
    return True
