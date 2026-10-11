"""Services for automations.

chauffage.set_override       sets a thermostat's temperature or preset for a while (the schedule
                             resumes at the end), like a manual change
chauffage.clear_override     ends it now: the thermostat resumes its schedule
chauffage.activate_schedule  activates a schedule by its stable id (unchanged when renamed)
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

import voluptuous as vol

from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

from .const import DOMAIN

if TYPE_CHECKING:
    from .runtime import ChauffageRuntime

SET_OVERRIDE_SCHEMA = vol.All(
    vol.Schema({
        vol.Required(ATTR_ENTITY_ID): cv.entity_id,
        vol.Exclusive("temperature", "value"): vol.Coerce(float),
        vol.Exclusive("preset", "value"): cv.string,
        vol.Exclusive("duration", "end"): vol.All(vol.Coerce(int), vol.Range(min=1)),
        vol.Exclusive("end", "end"): cv.datetime,
    }),
    cv.has_at_least_one_key("temperature", "preset"),
)
CLEAR_OVERRIDE_SCHEMA = vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id})
ACTIVATE_SCHEDULE_SCHEMA = vol.Schema({vol.Required("schedule"): cv.string})


def loaded_runtime(hass: HomeAssistant) -> ChauffageRuntime:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    if not entries:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
    return entries[0].runtime_data


def runtime_for(hass: HomeAssistant, entity_id: str) -> ChauffageRuntime:
    runtime = loaded_runtime(hass)
    if entity_id not in runtime.data["weeks"]:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="not_scheduled", translation_placeholders={"entity_id": entity_id}
        )
    return runtime


@callback
def async_register(hass: HomeAssistant) -> None:
    async def set_override(call: ServiceCall) -> None:
        entity_id = call.data[ATTR_ENTITY_ID]
        runtime = runtime_for(hass, entity_id)
        end: datetime | None = call.data.get("end")
        if end is not None:
            end = dt_util.as_local(end if end.tzinfo else end.replace(tzinfo=dt_util.get_default_time_zone()))
        if "temperature" in call.data:
            kind, value, service, data = "temperature", call.data["temperature"], "set_temperature", {"temperature": call.data["temperature"]}
        else:
            kind, value, service, data = "preset", call.data["preset"], "set_preset_mode", {"preset_mode": call.data["preset"]}
        if not await runtime.call_climate(service, entity_id, data):
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="thermostat_failed", translation_placeholders={"entity_id": entity_id}
            )
        await runtime.set_override(entity_id, runtime.new_override(kind, value, call.data.get("duration"), end))

    async def clear_override(call: ServiceCall) -> None:
        entity_id = call.data[ATTR_ENTITY_ID]
        await runtime_for(hass, entity_id).set_override(entity_id, None)

    async def activate_schedule(call: ServiceCall) -> None:
        runtime = loaded_runtime(hass)
        schedule = call.data["schedule"]
        if schedule not in runtime.schedule_ids:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="unknown_schedule", translation_placeholders={"schedule": schedule}
            )
        await runtime.activate_schedule(schedule)

    hass.services.async_register(DOMAIN, "set_override", set_override, schema=SET_OVERRIDE_SCHEMA)
    hass.services.async_register(DOMAIN, "clear_override", clear_override, schema=CLEAR_OVERRIDE_SCHEMA)
    hass.services.async_register(DOMAIN, "activate_schedule", activate_schedule, schema=ACTIVATE_SCHEDULE_SCHEMA)
