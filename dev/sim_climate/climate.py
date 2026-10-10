"""Development-only climate with standard Home Assistant presets (dev HA of ha-chauffage).

Many integrations expose presets such as eco / comfort / away / boost (no "frost") and clear the
preset when the setpoint is changed by hand. This platform behaves that way, on a simulated
heater (input_boolean) and temperature sensor:

    climate:
      - platform: sim_climate
        name: Chambre d'amis
        unique_id: sim_climate_amis
        heater: input_boolean.radiateur_amis
        sensor: sensor.temperature_amis
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.climate import (
    PLATFORM_SCHEMA as CLIMATE_PLATFORM_SCHEMA,
    ClimateEntity,
    ClimateEntityFeature,
    HVACMode,
)
from homeassistant.const import ATTR_TEMPERATURE, CONF_NAME, CONF_UNIQUE_ID, UnitOfTemperature
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.restore_state import RestoreEntity

PRESETS = {"eco": 17.0, "comfort": 20.0, "away": 15.0, "boost": 22.0}
HYSTERESIS = 0.3

PLATFORM_SCHEMA = CLIMATE_PLATFORM_SCHEMA.extend({
    vol.Required(CONF_NAME): cv.string,
    vol.Optional(CONF_UNIQUE_ID): cv.string,
    vol.Required("heater"): cv.entity_id,
    vol.Required("sensor"): cv.entity_id,
})


async def async_setup_platform(hass: HomeAssistant, config: dict, async_add_entities: AddEntitiesCallback,
                               discovery_info: Any = None) -> None:
    async_add_entities([SimClimate(config)])


class SimClimate(ClimateEntity, RestoreEntity):
    _attr_hvac_modes = [HVACMode.HEAT, HVACMode.OFF]
    _attr_preset_modes = list(PRESETS)
    _attr_supported_features = (
        ClimateEntityFeature.TARGET_TEMPERATURE | ClimateEntityFeature.PRESET_MODE
        | ClimateEntityFeature.TURN_ON | ClimateEntityFeature.TURN_OFF
    )
    _attr_temperature_unit = UnitOfTemperature.CELSIUS
    _attr_min_temp = 5.0
    _attr_max_temp = 30.0
    _attr_target_temperature_step = 0.5

    def __init__(self, config: dict) -> None:
        self._attr_name = config[CONF_NAME]
        self._attr_unique_id = config.get(CONF_UNIQUE_ID)
        self._heater = config["heater"]
        self._sensor = config["sensor"]
        self._attr_hvac_mode = HVACMode.HEAT
        self._attr_preset_mode = "eco"
        self._attr_target_temperature = PRESETS["eco"]

    async def async_added_to_hass(self) -> None:
        if (last := await self.async_get_last_state()) is not None:
            self._attr_hvac_mode = HVACMode(last.state) if last.state in self._attr_hvac_modes else HVACMode.HEAT
            self._attr_preset_mode = last.attributes.get("preset_mode")
            self._attr_target_temperature = last.attributes.get(ATTR_TEMPERATURE, self._attr_target_temperature)
        self.async_on_remove(async_track_state_change_event(self.hass, [self._sensor], self._sensor_changed))
        self._read_sensor()

    @callback
    def _sensor_changed(self, event: Event[EventStateChangedData]) -> None:
        self._read_sensor()
        self.hass.async_create_task(self._control())
        self.async_write_ha_state()

    def _read_sensor(self) -> None:
        state = self.hass.states.get(self._sensor)
        try:
            self._attr_current_temperature = float(state.state) if state else None
        except ValueError:
            self._attr_current_temperature = None

    async def _control(self) -> None:
        """Simple thermostat: heater on below the setpoint, off above it."""
        current, target = self._attr_current_temperature, self._attr_target_temperature
        if current is None or target is None:
            return
        on = self._attr_hvac_mode == HVACMode.HEAT and current < target - HYSTERESIS
        off = self._attr_hvac_mode == HVACMode.OFF or current > target + HYSTERESIS
        if on or off:
            await self.hass.services.async_call(
                "homeassistant", "turn_on" if on else "turn_off", {"entity_id": self._heater}, context=self._context
            )

    async def async_set_preset_mode(self, preset_mode: str) -> None:
        self._attr_preset_mode = preset_mode
        self._attr_target_temperature = PRESETS[preset_mode]
        await self._control()
        self.async_write_ha_state()

    async def async_set_temperature(self, **kwargs: Any) -> None:
        """A setpoint set by hand clears the preset (like many integrations)."""
        self._attr_target_temperature = float(kwargs[ATTR_TEMPERATURE])
        self._attr_preset_mode = None
        await self._control()
        self.async_write_ha_state()

    async def async_set_hvac_mode(self, hvac_mode: HVACMode) -> None:
        self._attr_hvac_mode = hvac_mode
        await self._control()
        self.async_write_ha_state()
