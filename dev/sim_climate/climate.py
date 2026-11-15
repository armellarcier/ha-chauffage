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

With `cooler`, the climate is a reversible air conditioner (#61, #91): it heats, cools (the
cooler, another input_boolean, read by dev/sim_rooms), chooses by itself in auto, or runs its
fan only, and it lists fan and swing modes like a real one. In cool, its presets give cooling
setpoints (eco 27 °C, comfort 25 °C), like a real one:

      - platform: sim_climate
        name: Atelier
        unique_id: sim_climate_atelier
        heater: input_boolean.radiateur_atelier
        cooler: input_boolean.clim_atelier
        sensor: sensor.temperature_atelier

`model` picks another air conditioner (#91):

- `heat_cool`: a plain unit that heats and cools, without presets, fan modes or swing modes. It
  is the device under a Versatile Thermostat "over a climate" in AC mode.
- `cooling`: a cooling-only unit, without `heater`. It cools, runs its fan only or is off, with
  cooling presets and fan modes.
- `daikin`: a reversible Daikin, as Home Assistant's `daikin` integration exposes it. One
  difference, on purpose: in heat_cool it takes a range of temperatures (target_temp_low and
  target_temp_high), which the real integration does not, so that the development HA has a
  thermostat for heat/cool slots.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.climate import (
    PLATFORM_SCHEMA as CLIMATE_PLATFORM_SCHEMA,
    ClimateEntity,
    ClimateEntityFeature,
    HVACAction,
    HVACMode,
)
from homeassistant.components.climate.const import ATTR_TARGET_TEMP_HIGH, ATTR_TARGET_TEMP_LOW
from homeassistant.const import ATTR_TEMPERATURE, CONF_NAME, CONF_UNIQUE_ID, UnitOfTemperature
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.restore_state import RestoreEntity

PRESETS = {"eco": 17.0, "comfort": 20.0, "away": 15.0, "boost": 22.0}
HYSTERESIS = 0.3
# What a reversible air conditioner lists (the values of issue #61)
AC_HVAC_MODES = [HVACMode.OFF, HVACMode.HEAT, HVACMode.COOL, HVACMode.AUTO, HVACMode.FAN_ONLY]
AC_FAN_MODES = ["auto", "1", "2", "3", "4", "5"]
AC_SWING_MODES = ["auto", "1_up", "2", "3", "4", "5_down", "swing"]
AC_SWING_HORIZONTAL_MODES = ["auto", "1_left", "2", "3", "4", "5_right", "split", "swing"]
# A plain unit that heats and cools
HEAT_COOL_HVAC_MODES = [HVACMode.OFF, HVACMode.HEAT, HVACMode.COOL]
# A cooling-only air conditioner: its presets are cooling setpoints
COOLING_HVAC_MODES = [HVACMode.OFF, HVACMode.COOL, HVACMode.FAN_ONLY]
COOLING_PRESETS = {"eco": 27.0, "comfort": 25.0, "away": 30.0, "boost": 23.0}
COOLING_FAN_MODES = ["auto", "low", "medium", "high"]
# What Home Assistant's daikin integration exposes for a BRP069 unit. Sources:
# - homeassistant/components/daikin/climate.py: the HVAC modes (HA_STATE_TO_DAIKIN), the presets
#   (HA_PRESET_TO_DAIKIN), a step of 1 °C, and the climate platform's default 7 to 35 °C;
# - pydaikin 2.19, daikin_brp069.py: the `f_rate` and `f_dir` translations, which daikin_base.py
#   title-cases. The integration has no horizontal swing mode.
DAIKIN_HVAC_MODES = [HVACMode.FAN_ONLY, HVACMode.DRY, HVACMode.COOL, HVACMode.HEAT, HVACMode.HEAT_COOL,
                     HVACMode.OFF]
DAIKIN_PRESET_MODES = ["none", "away", "eco", "boost"]
DAIKIN_FAN_MODES = ["Auto", "Silence", "1", "2", "3", "4", "5"]
DAIKIN_SWING_MODES = ["Off", "Vertical", "Horizontal", "3D"]
MODELS = ["heat_cool", "cooling", "daikin"]

PLATFORM_SCHEMA = CLIMATE_PLATFORM_SCHEMA.extend({
    vol.Required(CONF_NAME): cv.string,
    vol.Optional(CONF_UNIQUE_ID): cv.string,
    vol.Optional("heater"): cv.entity_id,
    vol.Optional("cooler"): cv.entity_id,
    vol.Required("sensor"): cv.entity_id,
    vol.Optional("model"): vol.In(MODELS),
})


async def async_setup_platform(hass: HomeAssistant, config: dict, async_add_entities: AddEntitiesCallback,
                               discovery_info: Any = None) -> None:
    async_add_entities([(SimDaikin if config.get("model") == "daikin" else SimClimate)(config)])


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
        self._heater = config.get("heater")
        self._cooler = config.get("cooler")
        self._sensor = config["sensor"]
        self._running: str | None = None  # the heater or the cooler, when one runs
        self._presets = PRESETS
        self._reversible = False
        self._attr_hvac_mode = HVACMode.HEAT
        self._attr_preset_mode = "eco"
        self._attr_target_temperature = PRESETS["eco"]
        # The range of a unit that takes one in heat_cool (see SimDaikin)
        self._low, self._high = 19.0, 25.0
        model = config.get("model")
        if model == "heat_cool":
            self._attr_hvac_modes = HEAT_COOL_HVAC_MODES
            self._attr_preset_modes = None
            self._attr_preset_mode = None
            self._attr_supported_features &= ~ClimateEntityFeature.PRESET_MODE
        elif model == "cooling":
            self._presets = COOLING_PRESETS
            self._attr_hvac_modes = COOLING_HVAC_MODES
            self._attr_hvac_mode = HVACMode.COOL
            self._attr_target_temperature = COOLING_PRESETS["eco"]
            self._attr_fan_modes = COOLING_FAN_MODES
            self._attr_fan_mode = "auto"
            self._attr_supported_features |= ClimateEntityFeature.FAN_MODE
        elif model is None and self._cooler:  # a reversible air conditioner
            self._reversible = True
            self._attr_hvac_modes = AC_HVAC_MODES
            self._attr_fan_modes = AC_FAN_MODES
            self._attr_swing_modes = AC_SWING_MODES
            self._attr_swing_horizontal_modes = AC_SWING_HORIZONTAL_MODES
            self._attr_fan_mode = "auto"
            self._attr_swing_mode = "auto"
            self._attr_swing_horizontal_mode = "auto"
            self._attr_supported_features |= (
                ClimateEntityFeature.FAN_MODE | ClimateEntityFeature.SWING_MODE
                | ClimateEntityFeature.SWING_HORIZONTAL_MODE
            )

    async def async_added_to_hass(self) -> None:
        if (last := await self.async_get_last_state()) is not None:
            if last.state in self._attr_hvac_modes:
                self._attr_hvac_mode = HVACMode(last.state)
            if self._attr_preset_modes:
                self._attr_preset_mode = last.attributes.get("preset_mode")
            self._attr_target_temperature = last.attributes.get(ATTR_TEMPERATURE) or self._attr_target_temperature
            self._low = last.attributes.get(ATTR_TARGET_TEMP_LOW) or self._low
            self._high = last.attributes.get(ATTR_TARGET_TEMP_HIGH) or self._high
            for key in ("fan_mode", "swing_mode", "swing_horizontal_mode"):
                if key in last.attributes and getattr(self, f"_attr_{key}s", None):
                    setattr(self, f"_attr_{key}", last.attributes[key])
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
        """Simple thermostat: heater on below the setpoint, off above it. An air conditioner in
        cool does the opposite with its cooler, and runs neither in fan only or dry. In auto
        and in heat_cool, it heats or cools to reach the setpoint. With a range (heat_cool on a
        unit that takes one), it heats under the low temperature and cools above the high one."""
        current, target = self._attr_current_temperature, self._attr_target_temperature
        if current is None or target is None:
            return
        mode = self._attr_hvac_mode
        low, high = (self._low, self._high) if self._ranged else (target, target)
        heats = mode in (HVACMode.HEAT, HVACMode.HEAT_COOL, HVACMode.AUTO)
        cools = mode in (HVACMode.COOL, HVACMode.HEAT_COOL, HVACMode.AUTO)
        if self._heater:
            on = heats and current < low - HYSTERESIS
            off = not heats or current > low + HYSTERESIS
            if on or off:
                await self._switch(self._heater, on)
        if self._cooler:
            cool = cools and current > high + HYSTERESIS
            stop = not cools or current < high - HYSTERESIS
            if cool or stop:
                await self._switch(self._cooler, cool)

    @property
    def _ranged(self) -> bool:
        """In heat_cool, on a unit that takes a range: its setpoint is the range."""
        return (self._attr_hvac_mode == HVACMode.HEAT_COOL
                and bool(self._attr_supported_features & ClimateEntityFeature.TARGET_TEMPERATURE_RANGE))

    @property
    def target_temperature(self) -> float | None:
        return None if self._ranged else self._attr_target_temperature

    @property
    def target_temperature_low(self) -> float | None:
        return self._low if self._ranged else None

    @property
    def target_temperature_high(self) -> float | None:
        return self._high if self._ranged else None

    def _take_range(self, kwargs: dict[str, Any]) -> bool:
        """The range of climate.set_temperature, when it gives one."""
        if kwargs.get(ATTR_TARGET_TEMP_LOW) is None or kwargs.get(ATTR_TARGET_TEMP_HIGH) is None:
            return False
        self._low, self._high = float(kwargs[ATTR_TARGET_TEMP_LOW]), float(kwargs[ATTR_TARGET_TEMP_HIGH])
        return True

    async def _switch(self, entity_id: str, on: bool) -> None:
        if on:
            self._running = entity_id
        elif self._running == entity_id:
            self._running = None
        await self.hass.services.async_call(
            "homeassistant", "turn_on" if on else "turn_off", {"entity_id": entity_id}, context=self._context
        )

    def _preset_temperature(self, preset_mode: str) -> float:
        """A reversible air conditioner's presets give cooling setpoints while it cools."""
        if self._reversible and self._attr_hvac_mode == HVACMode.COOL:
            return COOLING_PRESETS[preset_mode]
        return self._presets[preset_mode]

    async def async_set_preset_mode(self, preset_mode: str) -> None:
        self._attr_preset_mode = preset_mode
        self._attr_target_temperature = self._preset_temperature(preset_mode)
        await self._control()
        self.async_write_ha_state()

    async def async_set_temperature(self, **kwargs: Any) -> None:
        """A setpoint set by hand clears the preset (like many integrations)."""
        if not self._take_range(kwargs):
            self._attr_target_temperature = float(kwargs[ATTR_TEMPERATURE])
        self._attr_preset_mode = None
        await self._control()
        self.async_write_ha_state()

    async def async_set_hvac_mode(self, hvac_mode: HVACMode) -> None:
        self._attr_hvac_mode = hvac_mode
        if self._reversible and self._attr_preset_mode in self._presets:
            self._attr_target_temperature = self._preset_temperature(self._attr_preset_mode)
        await self._control()
        self.async_write_ha_state()

    async def async_set_fan_mode(self, fan_mode: str) -> None:
        self._attr_fan_mode = fan_mode
        self.async_write_ha_state()

    async def async_set_swing_mode(self, swing_mode: str) -> None:
        self._attr_swing_mode = swing_mode
        self.async_write_ha_state()

    async def async_set_swing_horizontal_mode(self, swing_horizontal_mode: str) -> None:
        self._attr_swing_horizontal_mode = swing_horizontal_mode
        self.async_write_ha_state()


class SimDaikin(SimClimate):
    """A reversible Daikin, as Home Assistant's daikin integration exposes it (see DAIKIN_*).

    A Daikin's presets are functions of the unit, not setpoints: away is its holiday mode, eco
    its "econo" mode and boost its "powerful" mode. A preset does not change the setpoint, and a
    setpoint set by hand does not clear the preset.

    Unlike the real one, it takes a range of temperatures in heat_cool (see the module's
    docstring)."""

    _attr_hvac_modes = DAIKIN_HVAC_MODES
    _attr_preset_modes = DAIKIN_PRESET_MODES
    _attr_fan_modes = DAIKIN_FAN_MODES
    _attr_swing_modes = DAIKIN_SWING_MODES
    _attr_supported_features = (
        ClimateEntityFeature.TURN_ON | ClimateEntityFeature.TURN_OFF | ClimateEntityFeature.TARGET_TEMPERATURE
        | ClimateEntityFeature.TARGET_TEMPERATURE_RANGE
        | ClimateEntityFeature.PRESET_MODE | ClimateEntityFeature.FAN_MODE | ClimateEntityFeature.SWING_MODE
    )
    _attr_min_temp = 7.0
    _attr_max_temp = 35.0
    _attr_target_temperature_step = 1

    def __init__(self, config: dict) -> None:
        super().__init__(config)
        self._attr_preset_mode = "none"
        self._attr_target_temperature = 20.0
        self._attr_fan_mode = "Auto"
        self._attr_swing_mode = "Off"

    @property
    def hvac_action(self) -> HVACAction | None:
        """As the integration does: heating in heat and cooling in cool, idle while the
        compressor is stopped, off when off, and nothing in the other modes."""
        mode = self._attr_hvac_mode
        if mode == HVACMode.OFF:
            return HVACAction.OFF
        if mode not in (HVACMode.HEAT, HVACMode.COOL):
            return None
        if self._running is None:
            return HVACAction.IDLE
        return HVACAction.HEATING if mode == HVACMode.HEAT else HVACAction.COOLING

    async def async_set_preset_mode(self, preset_mode: str) -> None:
        self._attr_preset_mode = preset_mode
        self.async_write_ha_state()

    async def async_set_temperature(self, **kwargs: Any) -> None:
        """The integration rounds the setpoint to half a degree, and keeps the preset."""
        if not self._take_range(kwargs):
            self._attr_target_temperature = round(float(kwargs[ATTR_TEMPERATURE]) * 2) / 2
        await self._control()
        self.async_write_ha_state()
