"""Config flow: a single "Chauffage" entry, created from Settings → Devices & services.

If the package (v0.1) is installed, the form says what will be imported (schedules, overrides,
active mode); the import itself happens when the entry is set up (see importer.py).
Options: default override duration.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from . import importer
from .const import CONF_OVERRIDE_DURATION, DEFAULT_OVERRIDE_DURATION, DOMAIN, TITLE


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
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        schema = vol.Schema({
            vol.Required(
                CONF_OVERRIDE_DURATION,
                default=self.config_entry.options.get(CONF_OVERRIDE_DURATION, DEFAULT_OVERRIDE_DURATION),
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(min=15, max=1440, step=15, unit_of_measurement="min",
                                              mode=selector.NumberSelectorMode.BOX)
            ),
        })
        return self.async_show_form(step_id="init", data_schema=schema)
