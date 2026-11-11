"""Config flow: a single "Chauffage" entry, created from Settings → Devices & services.

If the package (v0.1) is installed, the form says what will be imported (schedules, overrides,
active schedule); the import itself happens when the entry is set up (see importer.py).
Options: default settings (override duration, when a change by hand ends, use of the
thermostats' climate presets) and the Chauffage panel's entry in the sidebar. Presets and what
they mean per thermostat are set in the panel.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from . import importer
from .const import (
    ACCESS_LEVELS,
    CONF_ACCESS_LEVEL,
    CONF_MANUAL_OVERRIDE_END,
    CONF_OFF_OVERRIDE_END,
    CONF_OVERRIDE_DURATION,
    CONF_SHOW_IN_SIDEBAR,
    CONF_USE_PRESETS,
    DEFAULT_ACCESS_LEVEL,
    DEFAULT_MANUAL_OVERRIDE_END,
    DEFAULT_OFF_OVERRIDE_END,
    DEFAULT_OVERRIDE_DURATION,
    DEFAULT_SHOW_IN_SIDEBAR,
    DEFAULT_USE_PRESETS,
    DOMAIN,
    MANUAL_OVERRIDE_ENDS,
    OVERRIDE_DURATION_MAX,
    OVERRIDE_DURATION_MIN,
    OVERRIDE_DURATION_STEP,
    TITLE,
)


class ChauffageConfigFlow(ConfigFlow, domain=DOMAIN):
    """Creates the integration's only entry (single_config_entry in the manifest)."""

    VERSION = 1
    MINOR_VERSION = 2  # 2: the planned preset sensors enabled (__init__.async_migrate_entry)

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
    """Default settings, and the panel's entry in the sidebar. Presets are set in the panel."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            # The same rule as the number entity and the panel: a whole number of minutes. The
            # selector checks the minimum and the maximum.
            duration = user_input.get(CONF_OVERRIDE_DURATION)
            if duration is not None and duration % OVERRIDE_DURATION_STEP:
                errors[CONF_OVERRIDE_DURATION] = "invalid_override_duration"
            else:
                if duration is not None:
                    user_input = {**user_input, CONF_OVERRIDE_DURATION: int(duration)}
                return self.async_create_entry(data={**self.config_entry.options, **user_input})
        options = {**self.config_entry.options, **(user_input or {})}
        schema = vol.Schema({
            vol.Required(
                CONF_OVERRIDE_DURATION, default=options.get(CONF_OVERRIDE_DURATION, DEFAULT_OVERRIDE_DURATION),
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(min=OVERRIDE_DURATION_MIN, max=OVERRIDE_DURATION_MAX,
                                              step=OVERRIDE_DURATION_STEP, unit_of_measurement="min",
                                              mode=selector.NumberSelectorMode.BOX)
            ),
            vol.Required(
                CONF_MANUAL_OVERRIDE_END,
                default=options.get(CONF_MANUAL_OVERRIDE_END, DEFAULT_MANUAL_OVERRIDE_END),
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(options=list(MANUAL_OVERRIDE_ENDS), translation_key=CONF_MANUAL_OVERRIDE_END,
                                              mode=selector.SelectSelectorMode.LIST)
            ),
            # The same choices, for a thermostat turned off by hand (#91)
            vol.Required(
                CONF_OFF_OVERRIDE_END,
                default=options.get(CONF_OFF_OVERRIDE_END, DEFAULT_OFF_OVERRIDE_END),
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(options=list(MANUAL_OVERRIDE_ENDS), translation_key=CONF_MANUAL_OVERRIDE_END,
                                              mode=selector.SelectSelectorMode.LIST)
            ),
            vol.Required(
                CONF_USE_PRESETS, default=options.get(CONF_USE_PRESETS, DEFAULT_USE_PRESETS),
            ): selector.BooleanSelector(),
            vol.Required(
                CONF_SHOW_IN_SIDEBAR, default=options.get(CONF_SHOW_IN_SIDEBAR, DEFAULT_SHOW_IN_SIDEBAR),
            ): selector.BooleanSelector(),
            vol.Required(
                CONF_ACCESS_LEVEL, default=options.get(CONF_ACCESS_LEVEL, DEFAULT_ACCESS_LEVEL),
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(options=list(ACCESS_LEVELS), translation_key=CONF_ACCESS_LEVEL,
                                              mode=selector.SelectSelectorMode.LIST)
            ),
        })
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
