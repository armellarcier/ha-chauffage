"""Config flow: a single "Chauffage" entry, created from Settings → Devices & services.

If the package (v0.1) is installed, the form says what will be imported (schedules, overrides,
active schedule); the import itself happens when the entry is set up (see importer.py).
Options: default settings (override duration, when a change by hand ends, the control of the
HVAC mode, use of the thermostats' climate presets) and the Chauffage panel's entry in the sidebar, with its name.
Presets and what they mean per thermostat are set in the panel.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigEntryState, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from . import importer
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
            # The dialog leaves out an empty name: the panel is then called Chauffage again.
            title = (user_input.get(CONF_SIDEBAR_TITLE) or "").strip()
            if len(title) > SIDEBAR_TITLE_MAX:
                errors[CONF_SIDEBAR_TITLE] = "sidebar_title_too_long"
            # Turned on or off, the weeks are converted by Chauffage: it must be running (#159)
            value = user_input.get(CONF_HVAC_MODE_CONTROL, DEFAULT_HVAC_MODE_CONTROL)
            if self._runtime() is None and value != self.config_entry.options.get(CONF_HVAC_MODE_CONTROL, DEFAULT_HVAC_MODE_CONTROL):
                errors[CONF_HVAC_MODE_CONTROL] = "not_running"
            if not errors:
                data = {**self.config_entry.options, **user_input}
                if duration is not None:
                    data[CONF_OVERRIDE_DURATION] = int(duration)
                data.pop(CONF_SIDEBAR_TITLE, None)
                if title:
                    data[CONF_SIDEBAR_TITLE] = title
                return await self._save(data)
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

    def _runtime(self) -> Any:
        """Chauffage's runtime, while the entry is loaded."""
        if self.config_entry.state is not ConfigEntryState.LOADED:
            return None
        return getattr(self.config_entry, "runtime_data", None)

    async def _save(self, data: dict[str, Any]) -> ConfigFlowResult:
        """Saves the options. *Control the HVAC mode* changed (#159) goes through the runtime, as
        from the panel: the weeks are converted and the thermostats realigned. Turning it off
        first lists the slots that change (async_step_hvac_mode_control), when there are any."""
        runtime = self._runtime()
        value = data.get(CONF_HVAC_MODE_CONTROL, DEFAULT_HVAC_MODE_CONTROL)
        if runtime is not None and value != runtime.hvac_mode_control:
            _, changes = runtime.hvac_mode_changes(value)
            if changes:
                self._data = data
                self._changes = changes
                return await self.async_step_hvac_mode_control()
            await runtime.set_hvac_mode_control(value)
        return self.async_create_entry(data=data)

    async def async_step_hvac_mode_control(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """The slots that change when the house stops controlling the HVAC mode. Submitted, the
        weeks are converted and the options saved. Closed, nothing changes."""
        if user_input is None:
            text = changes_text(self.hass, self._runtime(), self._changes)
            return self.async_show_form(step_id="hvac_mode_control", description_placeholders={"changes": text})
        runtime = self._runtime()
        if runtime is None:  # Chauffage stopped meanwhile: nothing to convert with
            return self.async_abort(reason="not_running")
        await runtime.set_hvac_mode_control(self._data[CONF_HVAC_MODE_CONTROL])
        return self.async_create_entry(data=self._data)


# The list of the slots that change, as the panel shows it (#159). Home Assistant does not
# translate a list in a placeholder: its words, in Home Assistant's language, English otherwise
TEXTS = {
    "en": {
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "removed": "removed",
        "hvac_modes": {"off": "Off", "heat": "Heat", "cool": "Cool", "heat_cool": "Heat/Cool", "dry": "Dry",
                       "auto": "Auto", "fan_only": "Fan only"},
    },
    "fr": {
        "days": ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], "removed": "supprimé",
        "hvac_modes": {"off": "Éteint", "heat": "Chauffe", "cool": "Clim", "heat_cool": "Chauffe/Clim",
                       "dry": "Déshum.", "auto": "Auto", "fan_only": "Ventilation"},
    },
}


def markdown_text(text: str) -> str:
    """A name, as plain text in Markdown: its `*`, `_`, `[` and the like are not markup."""
    return "".join(f"\\{c}" if c in "\\`*_[]<>#|" else c for c in text)


def days_text(days: list[int], names: list[str]) -> str:
    """Days in a row are a range: "Mon–Fri", "Sat, Sun", "Mon, Wed"."""
    runs: list[list[int]] = []
    for day in sorted(days):
        if runs and runs[-1][1] == day - 1:
            runs[-1][1] = day
        else:
            runs.append([day, day])
    return ", ".join(f"{names[a]}–{names[b]}" if b - a >= 2 else f"{names[a]}, {names[b]}" if b > a else names[a]
                     for a, b in runs)


def changes_text(hass: Any, runtime: Any, changes: list[dict[str, Any]]) -> str:
    """A Markdown list: each thermostat and schedule, then its slots, a slot's days together:
    "Mon–Sun · 22:30 · Off → removed", "Mon–Fri · 06:30 · Comfort, Cool → Comfort"."""
    texts = TEXTS["fr" if (hass.config.language or "").startswith("fr") else "en"]
    schedules = {s["id"]: s["name"] for s in runtime.data["schedules"]}
    groups: dict[tuple[str, str], dict[tuple, list[int]]] = {}
    for c in changes:
        slots = groups.setdefault((c["entity_id"], c["schedule"]), {})
        slots.setdefault((c["start"], c["preset"], c["hvac_mode"], c["change"]), []).append(c["day"])

    def preset(preset_id: str) -> str:
        return markdown_text((runtime.presets_by_id.get(preset_id) or {}).get("name", preset_id))

    lines = []
    for (entity_id, schedule), slots in groups.items():
        state = hass.states.get(entity_id)
        name = (state and state.attributes.get("friendly_name")) or entity_id
        lines.append(f"- **{markdown_text(name)}** · {markdown_text(schedules.get(schedule, schedule))}")
        for (start, preset_id, mode, change), days in sorted(slots.items(), key=lambda item: item[0][0]):
            before = ", ".join(x for x in (preset(preset_id) if preset_id else None,
                                           texts["hvac_modes"].get(mode, mode) if mode else None) if x)
            after = texts["removed"] if change == "removed" else preset(preset_id)
            lines.append(f"  - {days_text(days, texts['days'])} · {start} · {before} → {after}")
    return "\n".join(lines)
