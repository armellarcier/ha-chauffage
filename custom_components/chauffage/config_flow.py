"""Config flow: a single "Chauffage" entry, created from Settings → Devices & services.

Options: default settings (override duration, when a change by hand ends, whether Chauffage
controls the HVAC mode, use of the thermostats' climate presets) and the Chauffage panel's entry in the sidebar, with its name.
Presets and what they mean per thermostat are set in the panel.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.helpers.translation import async_get_translations

from .const import (
    ACCESS_LEVELS,
    CONF_ACCESS_LEVEL,
    CONF_HVAC_MODE_CONTROL,
    CONF_MANUAL_OVERRIDE_END,
    CONF_OFF_OVERRIDE_END,
    CONF_OVERRIDE_DURATION,
    CONF_SHOW_IN_SIDEBAR,
    CONF_SIDEBAR_TITLE,
    CONF_USE_PRESETS,
    DEFAULT_ACCESS_LEVEL,
    DEFAULT_HVAC_MODE_CONTROL,
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
    SIDEBAR_TITLE_MAX,
    TITLE,
    sidebar_title,
)


class ChauffageConfigFlow(ConfigFlow, domain=DOMAIN):
    """Creates the integration's only entry (single_config_entry in the manifest)."""

    VERSION = 1
    MINOR_VERSION = 2  # 2: the planned preset sensors enabled (__init__.async_migrate_entry)

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title=TITLE, data={})
        return self.async_show_form(step_id="user")

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
            # The dialog leaves out an empty name: the panel is then called Chauffage again.
            title = (user_input.get(CONF_SIDEBAR_TITLE) or "").strip()
            if len(title) > SIDEBAR_TITLE_MAX:
                errors[CONF_SIDEBAR_TITLE] = "sidebar_title_too_long"
            if not errors:
                data = {**self.config_entry.options, **user_input}
                if duration is not None:
                    data[CONF_OVERRIDE_DURATION] = int(duration)
                data.pop(CONF_SIDEBAR_TITLE, None)
                if title:
                    data[CONF_SIDEBAR_TITLE] = title
                self._data = data
                # Control the HVAC mode turned off (#159): the slots that change are shown first,
                # as the panel does. Closing the dialog then changes nothing
                if CONF_HVAC_MODE_CONTROL in user_input and self._runtime.settings.hvac_mode_control != data[CONF_HVAC_MODE_CONTROL]:
                    _, changes = self._runtime.schedules.hvac_mode_changes(data[CONF_HVAC_MODE_CONTROL])
                    if changes:
                        self._changes = changes
                        return await self.async_step_hvac_mode_control()
                    await self._runtime.schedules.set_hvac_mode_control(data[CONF_HVAC_MODE_CONTROL])
                return self.async_create_entry(data=data)
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
            # Whether Chauffage controls the HVAC mode, for the house (#159)
            vol.Required(
                CONF_HVAC_MODE_CONTROL, default=options.get(CONF_HVAC_MODE_CONTROL, DEFAULT_HVAC_MODE_CONTROL),
            ): selector.BooleanSelector(),
            vol.Required(
                CONF_USE_PRESETS, default=options.get(CONF_USE_PRESETS, DEFAULT_USE_PRESETS),
            ): selector.BooleanSelector(),
            vol.Required(
                CONF_SHOW_IN_SIDEBAR, default=options.get(CONF_SHOW_IN_SIDEBAR, DEFAULT_SHOW_IN_SIDEBAR),
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_SIDEBAR_TITLE, description={"suggested_value": sidebar_title(options)},
            ): selector.TextSelector(),
            vol.Required(
                CONF_ACCESS_LEVEL, default=options.get(CONF_ACCESS_LEVEL, DEFAULT_ACCESS_LEVEL),
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(options=list(ACCESS_LEVELS), translation_key=CONF_ACCESS_LEVEL,
                                              mode=selector.SelectSelectorMode.LIST)
            ),
        })
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)

    @property
    def _runtime(self) -> Any:
        return self.config_entry.runtime_data

    async def async_step_hvac_mode_control(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """The slots that change when the house stops controlling the HVAC mode (#159).
        Submitted: the weeks are converted and the options saved."""
        if user_input is not None:
            await self._runtime.schedules.set_hvac_mode_control(self._data[CONF_HVAC_MODE_CONTROL])
            return self.async_create_entry(data=self._data)
        return self.async_show_form(step_id="hvac_mode_control", data_schema=vol.Schema({}),
                                    description_placeholders={"changes": await self._changes_text()})

    async def _changes_text(self) -> str:
        """The slots that change, by thermostat and schedule, a slot's days together, as the
        panel lists them: "- Mon–Fri · 22:30 · Off → removed"."""
        hass = self.hass
        texts = await async_get_translations(hass, hass.config.language, "selector", {DOMAIN})
        word = lambda kind, key: texts.get(f"component.{DOMAIN}.selector.{kind}.options.{key}", str(key))  # noqa: E731
        installation = self._runtime.installation
        presets = installation.presets_by_id
        groups: dict[tuple[str, str], dict[tuple, list[int]]] = {}
        for c in self._changes:
            slot = (c["start"], c["preset"], c["hvac_mode"], c["change"])
            groups.setdefault((c["entity_id"], c["schedule"]), {}).setdefault(slot, []).append(c["day"])
        lines = []
        for (entity_id, schedule), slots in groups.items():
            state = hass.states.get(entity_id)
            lines.append(f"**{state.name if state else entity_id}** · {installation.schedule_name(schedule) or schedule}")
            for (start, preset, mode, change), days in sorted(slots.items(), key=lambda item: item[0][0]):
                name = presets.get(preset, {}).get("name", preset) if preset else None
                before = ", ".join(part for part in (name, word("hvac_mode", mode) if mode else None) if part)
                after = word("slot_change", "removed") if change == "removed" else name
                lines.append(f"- {_days(days, lambda d: word('day', d))} · {start} · {before} → {after}")
        return "\n".join(lines)


def _days(days: list[int], name: Any) -> str:
    """Days of a slot → "Mon–Fri", "Sat, Sun", "Mon, Wed–Fri", as the card writes them."""
    runs: list[list[int]] = []
    for day in sorted(days):
        if runs and runs[-1][1] == day - 1:
            runs[-1][1] = day
        else:
            runs.append([day, day])
    return ", ".join(f"{name(a)}–{name(b)}" if b - a >= 2 else f"{name(a)}, {name(b)}" if b > a else name(a)
                     for a, b in runs)
