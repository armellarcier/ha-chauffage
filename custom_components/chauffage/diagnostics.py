"""The diagnostics download (#49): the stored data (weeks, overrides, commands not applied yet),
what the scheduler holds in memory, and the scheduled thermostats as they are now."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    runtime = entry.runtime_data
    states = {entity_id: hass.states.get(entity_id) for entity_id in runtime.scheduled}
    return {
        "version": runtime.version,
        "options": dict(entry.options),
        "data": runtime.data,
        "retry": sorted(runtime.retrying),
        "rule_results": runtime.rule_results,
        "states": {
            entity_id: {"state": state.state, "attributes": dict(state.attributes),
                        "last_changed": state.last_changed.isoformat(), "last_updated": state.last_updated.isoformat()}
            for entity_id, state in states.items() if state is not None
        },
    }
