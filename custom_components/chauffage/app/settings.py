"""The settings of Chauffage: the options of the config entry. The options flow, the
configuration entities and the panel change them. And whether Chauffage controls a thermostat's
HVAC mode (#159): its own setting, stored with it, else the house's, an option."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from ..const import (
    ACCESS_LEVELS,
    CONF_ACCESS_LEVEL,
    CONF_HVAC_MODE_CONTROL,
    CONF_MANUAL_OVERRIDE_END,
    CONF_OFF_OVERRIDE_END,
    CONF_OVERRIDE_DURATION,
    CONF_USE_PRESETS,
    DEFAULT_ACCESS_LEVEL,
    DEFAULT_HVAC_MODE_CONTROL,
    DEFAULT_MANUAL_OVERRIDE_END,
    DEFAULT_OFF_OVERRIDE_END,
    DEFAULT_OVERRIDE_DURATION,
    DEFAULT_USE_PRESETS,
    MANUAL_OVERRIDE_ENDS,
    OVERRIDE_DURATION_MAX,
    OVERRIDE_DURATION_MIN,
    OVERRIDE_DURATION_STEP,
)
from ..storage.installation import Installation
from ..storage.schema import InvalidData


class Settings:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, installation: Installation) -> None:
        self._hass = hass
        self._entry = entry
        self._installation = installation

    @property
    def override_duration(self) -> int:
        return int(self._entry.options.get(CONF_OVERRIDE_DURATION, DEFAULT_OVERRIDE_DURATION))

    @property
    def manual_override_end(self) -> str:
        """The setting *End of a change by hand*, for every thermostat: DURATION (the default),
        NEXT_SLOT_WITHIN_DURATION or NEXT_SLOT (an unknown value: the default)."""
        end = self._entry.options.get(CONF_MANUAL_OVERRIDE_END)
        return end if end in MANUAL_OVERRIDE_ENDS else DEFAULT_MANUAL_OVERRIDE_END

    @property
    def off_override_end(self) -> str:
        """The setting *Turned off* (#91), for a thermostat turned off by hand: the
        same choices, NEXT_SLOT by default (an unknown value: the default)."""
        end = self._entry.options.get(CONF_OFF_OVERRIDE_END)
        return end if end in MANUAL_OVERRIDE_ENDS else DEFAULT_OFF_OVERRIDE_END

    @property
    def use_presets(self) -> bool:
        return bool(self._entry.options.get(CONF_USE_PRESETS, DEFAULT_USE_PRESETS))

    @property
    def hvac_mode_control(self) -> bool:
        """The setting *Control the HVAC mode* of the house (#159): on by default."""
        return bool(self._entry.options.get(CONF_HVAC_MODE_CONTROL, DEFAULT_HVAC_MODE_CONTROL))

    def own_hvac_mode_control(self, entity_id: str) -> bool | None:
        """A thermostat's own setting *Control the HVAC mode*: None, it follows the house."""
        return self._installation.thermostats.get(entity_id, {}).get(CONF_HVAC_MODE_CONTROL)

    def controls_hvac_mode(self, entity_id: str) -> bool:
        """Whether Chauffage controls a thermostat's HVAC mode: its own setting, else the house's."""
        own = self.own_hvac_mode_control(entity_id)
        return self.hvac_mode_control if own is None else own

    @callback
    def set_hvac_mode_control(self, value: bool | None, entity_id: str | None = None) -> None:
        """Sets *Control the HVAC mode* for the house (`entity_id` None) or one thermostat (None:
        it follows the house). Converts nothing: see Schedules.set_hvac_mode_control."""
        if entity_id is None:
            self._update({CONF_HVAC_MODE_CONTROL: value})
        elif value is None:
            self._installation.thermostats[entity_id].pop(CONF_HVAC_MODE_CONTROL, None)
        else:
            self._installation.thermostats[entity_id][CONF_HVAC_MODE_CONTROL] = value

    @property
    def access_level(self) -> str:
        """What users who are not admins may change (#99): USE (the default), PLAN or SET_UP (an
        unknown value: the default)."""
        level = self._entry.options.get(CONF_ACCESS_LEVEL)
        return level if level in ACCESS_LEVELS else DEFAULT_ACCESS_LEVEL

    @callback
    def set_override_settings(self, manual_override_end: str | None = None,
                              override_duration: int | None = None, off_override_end: str | None = None) -> None:
        """Changes the settings of overrides in the integration's options, as the options flow
        does: from the configuration entities and the panel. InvalidData for an unknown end or
        a duration out of range or not in whole minutes."""
        options: dict[str, Any] = {}
        for key, end in ((CONF_MANUAL_OVERRIDE_END, manual_override_end), (CONF_OFF_OVERRIDE_END, off_override_end)):
            if end is None:
                continue
            if end not in MANUAL_OVERRIDE_ENDS:
                raise InvalidData(f"unknown end of an override: {end}")
            options[key] = end
        if override_duration is not None:
            if (not OVERRIDE_DURATION_MIN <= override_duration <= OVERRIDE_DURATION_MAX
                    or override_duration % OVERRIDE_DURATION_STEP):
                raise InvalidData(f"override duration out of range or not in whole minutes: {override_duration}")
            options[CONF_OVERRIDE_DURATION] = int(override_duration)
        if options:
            self._update(options)

    @callback
    def set_access_level(self, access_level: str) -> None:
        """From the panel, as the options flow does. InvalidData for an unknown access level."""
        if access_level not in ACCESS_LEVELS:
            raise InvalidData(f"unknown access level: {access_level}")
        self._update({CONF_ACCESS_LEVEL: access_level})

    def _update(self, options: dict[str, Any]) -> None:
        self._hass.config_entries.async_update_entry(self._entry, options={**self._entry.options, **options})
