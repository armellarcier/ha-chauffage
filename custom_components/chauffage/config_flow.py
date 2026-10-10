"""Config flow: a single "Chauffage" entry, created from Settings → Devices & services."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import DOMAIN, TITLE


class ChauffageConfigFlow(ConfigFlow, domain=DOMAIN):
    """Creates the integration's only entry (single_config_entry in the manifest)."""

    VERSION = 1
    MINOR_VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title=TITLE, data={})
        return self.async_show_form(step_id="user")
