"""Config flow: a single "Chauffage" entry, created from Settings → Devices & services.

If the package (v0.1) is installed, the form says what will be imported (schedules, overrides,
active mode); the import itself happens when the entry is set up (see importer.py).
Options: override duration, heating levels, what each level means per thermostat.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from . import engine, importer, model
from .const import (
    CONF_OVERRIDE_DURATION,
    DEFAULT_LEVEL_COLOR,
    DEFAULT_LEVEL_TEMPERATURE,
    DEFAULT_OVERRIDE_DURATION,
    DOMAIN,
    TITLE,
)
from .runtime import thermostat


class ChauffageConfigFlow(ConfigFlow, domain=DOMAIN):
    """Creates the integration's only entry (single_config_entry in the manifest)."""

    VERSION = 1
    MINOR_VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        try:
            summary = importer.package_summary(self.hass)
        except importer.PackageTooNew:
            return self.async_abort(reason="package_too_new")
        if user_input is not None:
            return self.async_create_entry(title=TITLE, data={})
        if summary is None:
            return self.async_show_form(step_id="user")
        return self.async_show_form(
            step_id="import_package",
            description_placeholders={k: str(v) for k, v in summary.items()},
        )

    async def async_step_import_package(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.async_step_user(user_input or {})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> ChauffageOptionsFlow:
        return ChauffageOptionsFlow()


class ChauffageOptionsFlow(OptionsFlow):
    """Menu: general settings, heating levels, what each level means per thermostat.

    Levels and mappings are stored data (the runtime saves them); only the override duration is
    a config entry option.
    """

    def __init__(self) -> None:
        self._level_id: str | None = None
        self._levels: list[dict[str, Any]] = []
        self._climate: str | None = None

    @property
    def _runtime(self):
        return self.config_entry.runtime_data

    def _done(self) -> ConfigFlowResult:
        return self.async_create_entry(data=dict(self.config_entry.options))

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return self.async_show_menu(step_id="init", menu_options=["general", "levels", "thermostats"])

    # ----- general -----

    async def async_step_general(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data={**self.config_entry.options, **user_input})
        schema = vol.Schema({
            vol.Required(
                CONF_OVERRIDE_DURATION,
                default=self.config_entry.options.get(CONF_OVERRIDE_DURATION, DEFAULT_OVERRIDE_DURATION),
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(min=15, max=1440, step=15, unit_of_measurement="min",
                                              mode=selector.NumberSelectorMode.BOX)
            ),
        })
        return self.async_show_form(step_id="general", data_schema=schema)

    # ----- levels -----

    async def async_step_levels(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        levels = self._runtime.data["levels"]
        if user_input is not None:
            self._level_id = None if user_input["level"] == ADD else user_input["level"]
            return await self.async_step_level()
        options = [selector.SelectOptionDict(value=lv["id"], label=lv["name"]) for lv in levels]
        options.append(selector.SelectOptionDict(value=ADD, label=f"+ {text(self.hass, 'add_level')}"))
        schema = vol.Schema({vol.Required("level"): selector.SelectSelector(
            selector.SelectSelectorConfig(options=options, mode=selector.SelectSelectorMode.LIST))})
        return self.async_show_form(step_id="levels", data_schema=schema)

    async def async_step_level(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        levels = [dict(lv) for lv in self._runtime.data["levels"]]
        current = next((lv for lv in levels if lv["id"] == self._level_id), None)
        errors: dict[str, str] = {}
        if user_input is not None:
            if user_input.get("delete") and current:
                self._levels = [lv for lv in levels if lv["id"] != current["id"]]
                if current["id"] in model.used_levels(self._runtime.data["schedules"]):
                    return await self.async_step_replace()
                return await self._save_levels()
            edited = {"name": user_input["name"], "color": hex_color(user_input["color"]),
                      "temperature": user_input["temperature"]}
            if current:
                current.update(edited)
            else:
                levels.append(edited)
            self._levels = levels
            try:
                return await self._save_levels()
            except model.InvalidData:
                errors["base"] = "invalid_level"
        defaults = current or {"name": "", "color": DEFAULT_LEVEL_COLOR, "temperature": DEFAULT_LEVEL_TEMPERATURE}
        fields: dict[Any, Any] = {
            vol.Required("name", default=defaults["name"]): selector.TextSelector(),
            vol.Required("color", default=rgb(defaults["color"])): selector.ColorRGBSelector(),
            vol.Required("temperature", default=defaults["temperature"]): selector.NumberSelector(
                selector.NumberSelectorConfig(min=5, max=30, step=0.5, unit_of_measurement="°C",
                                              mode=selector.NumberSelectorMode.BOX)),
        }
        if current and len(levels) > 1:
            fields[vol.Optional("delete", default=False)] = selector.BooleanSelector()
        return self.async_show_form(step_id="level", data_schema=vol.Schema(fields), errors=errors)

    async def async_step_replace(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """The deleted level is used in schedules: which level takes its place."""
        if user_input is not None:
            return await self._save_levels({self._level_id: user_input["replacement"]})
        options = [selector.SelectOptionDict(value=lv["id"], label=lv["name"]) for lv in self._levels]
        schema = vol.Schema({vol.Required("replacement"): selector.SelectSelector(
            selector.SelectSelectorConfig(options=options))})
        return self.async_show_form(step_id="replace", data_schema=schema)

    async def _save_levels(self, replacements: dict[str, str] | None = None) -> ConfigFlowResult:
        await self._runtime.set_levels(self._levels, replacements)
        return self._done()

    # ----- thermostats -----

    async def async_step_thermostats(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        climates = list(self._runtime.data["schedules"])
        if not climates:
            return self.async_abort(reason="no_thermostats")
        if user_input is not None:
            self._climate = user_input["thermostat"]
            return await self.async_step_mapping()
        options = [selector.SelectOptionDict(value=e, label=self._name(e)) for e in climates]
        schema = vol.Schema({vol.Required("thermostat"): selector.SelectSelector(
            selector.SelectSelectorConfig(options=options))})
        return self.async_show_form(step_id="thermostats", data_schema=schema)

    async def async_step_mapping(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """For each level: automatic, one of the thermostat's presets, or a temperature.
        Field names are the level names (levels are user-defined: no translation keys)."""
        runtime, climate = self._runtime, self._climate
        levels = runtime.data["levels"]
        explicit = runtime.data["mappings"].get(climate, {})
        current = thermostat(self.hass.states.get(climate))
        if user_input is not None:
            mapping = {}
            for lv in levels:
                choice = user_input.get(lv["name"], AUTO)
                if choice == TEMPERATURE:
                    mapping[lv["id"]] = {"temperature": user_input.get(temperature_field(lv), lv["temperature"])}
                elif choice.startswith(PRESET):
                    mapping[lv["id"]] = {"preset": choice[len(PRESET):]}
            await runtime.set_mapping(climate, mapping)
            return self._done()
        presets = list(current.presets) if current else []
        fields: dict[Any, Any] = {}
        for lv in levels:
            default = engine.default_target(lv, current)
            auto_label = text(self.hass, "auto_preset" if default.kind == "preset" else "auto_temperature",
                              value=default.value)
            options = [selector.SelectOptionDict(value=AUTO, label=auto_label)]
            options += [selector.SelectOptionDict(value=f"{PRESET}{p}", label=text(self.hass, "preset", value=p))
                        for p in presets if not engine.is_manual_preset(p)]
            options.append(selector.SelectOptionDict(value=TEMPERATURE, label=text(self.hass, "temperature")))
            mine = explicit.get(lv["id"], {})
            chosen = f"{PRESET}{mine['preset']}" if "preset" in mine else TEMPERATURE if "temperature" in mine else AUTO
            fields[vol.Required(lv["name"], default=chosen)] = selector.SelectSelector(
                selector.SelectSelectorConfig(options=options))
            fields[vol.Optional(temperature_field(lv), default=mine.get("temperature", lv["temperature"]))] = (
                selector.NumberSelector(selector.NumberSelectorConfig(
                    min=5, max=30, step=0.5, unit_of_measurement="°C", mode=selector.NumberSelectorMode.BOX)))
        return self.async_show_form(step_id="mapping", data_schema=vol.Schema(fields),
                                    description_placeholders={"thermostat": self._name(climate)})

    def _name(self, entity_id: str) -> str:
        state = self.hass.states.get(entity_id)
        return state.name if state else entity_id


ADD, AUTO, TEMPERATURE, PRESET = "__add__", "auto", "temperature", "preset:"

# Option labels built here (they include values): English and French
TEXTS = {
    "en": {"add_level": "Add a level", "auto_preset": "Automatic (preset {value})",
           "auto_temperature": "Automatic ({value} °C)", "preset": "Preset {value}", "temperature": "Temperature"},
    "fr": {"add_level": "Ajouter un niveau", "auto_preset": "Automatique (preset {value})",
           "auto_temperature": "Automatique ({value} °C)", "preset": "Preset {value}", "temperature": "Température"},
}


def text(hass, key: str, **values: Any) -> str:
    language = (hass.config.language or "en").split("-")[0]
    return TEXTS.get(language, TEXTS["en"])[key].format(**values)


def temperature_field(level: dict[str, Any]) -> str:
    return f"{level['name']} (°C)"


def rgb(color: str) -> list[int]:
    return [int(color[i:i + 2], 16) for i in (1, 3, 5)]


def hex_color(value: Any) -> str:
    return "#" + "".join(f"{int(c):02x}" for c in value)
