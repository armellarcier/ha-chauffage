"""Services for automations.

chauffage.set_override       sets a thermostat's temperature or preset for a while (the schedule
                             resumes at the end), like a manual change
chauffage.clear_override     ends it now: the thermostat resumes its schedule
chauffage.activate_schedule  activates a schedule by its stable id (unchanged when renamed)
chauffage.get_schedules      (response) the schedules, the active one, the one the rules give
chauffage.get_week           (response) the week of thermostats in a schedule, as HA's
                             schedule.get_schedule gives its schedules
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .runtime import ThermostatFailed, ThermostatPaused

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
GET_WEEK_SCHEMA = vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_ids, vol.Optional("schedule"): cv.string})
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def loaded_runtime(hass: HomeAssistant) -> ChauffageRuntime:
    # async_loaded_entries: not in older Home Assistant versions
    entries = [e for e in hass.config_entries.async_entries(DOMAIN) if e.state is ConfigEntryState.LOADED]
    if not entries:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
    return entries[0].runtime_data


def runtime_for(hass: HomeAssistant, entity_id: str) -> ChauffageRuntime:
    runtime = loaded_runtime(hass)
    if entity_id not in runtime.scheduled:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="not_scheduled", translation_placeholders={"entity_id": entity_id}
        )
    return runtime


def known_schedule(runtime: ChauffageRuntime, schedule: str) -> str:
    if schedule not in runtime.schedule_ids:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="unknown_schedule", translation_placeholders={"schedule": schedule}
        )
    return schedule


@callback
def async_register(hass: HomeAssistant) -> None:
    async def set_override(call: ServiceCall) -> None:
        entity_id = call.data[ATTR_ENTITY_ID]
        runtime = runtime_for(hass, entity_id)
        end: datetime | None = call.data.get("end")
        if end is not None:
            end = dt_util.as_local(end if end.tzinfo else end.replace(tzinfo=dt_util.get_default_time_zone()))
        minutes = call.data.get("duration")
        if "temperature" in call.data:
            override = runtime.new_override("temperature", call.data["temperature"], minutes, end)
        else:  # a Chauffage preset (what it means on this thermostat), else a climate preset of its own
            preset = call.data["preset"]
            override = runtime.preset_override(entity_id, preset, minutes, end) or runtime.new_override("preset", preset, minutes, end)
        try:
            await runtime.set_override(entity_id, override, source="service", resend=True)
        except ThermostatPaused as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="paused", translation_placeholders={"entity_id": entity_id}
            ) from err
        except ThermostatFailed as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="thermostat_failed", translation_placeholders={"entity_id": entity_id}
            ) from err

    async def clear_override(call: ServiceCall) -> None:
        entity_id = call.data[ATTR_ENTITY_ID]
        await runtime_for(hass, entity_id).set_override(entity_id, None, source="service")

    async def activate_schedule(call: ServiceCall) -> None:
        runtime = loaded_runtime(hass)
        await runtime.activate_schedule(known_schedule(runtime, call.data["schedule"]), source="service")

    async def get_schedules(call: ServiceCall) -> ServiceResponse:
        runtime = loaded_runtime(hass)
        entities = runtime.schedule_entities()
        return {
            "schedules": [{"id": s["id"], "name": s["name"], "entity_id": entities.get(s["id"])}
                          for s in runtime.data["schedules"]],
            **{key: runtime.data[key] for key in ("active_schedule", "rules_choice", "default_schedule")},
        }

    async def get_week(call: ServiceCall) -> ServiceResponse:
        runtime = loaded_runtime(hass)
        schedule = known_schedule(runtime, call.data.get("schedule", runtime.data["active_schedule"]))
        response = {}
        for entity_id in call.data[ATTR_ENTITY_ID]:
            week = runtime_for(hass, entity_id).weeks[entity_id][schedule]
            response[entity_id] = {"schedule": schedule} | {
                name: [{"start": start, "end": next_start, "preset": preset}
                       for (start, preset), next_start in zip(day, [s for s, _ in day[1:]] + ["24:00"])]
                for name, day in zip(DAYS, week)
            }
        return response

    hass.services.async_register(DOMAIN, "set_override", set_override, schema=SET_OVERRIDE_SCHEMA)
    hass.services.async_register(DOMAIN, "clear_override", clear_override, schema=CLEAR_OVERRIDE_SCHEMA)
    hass.services.async_register(DOMAIN, "activate_schedule", activate_schedule, schema=ACTIVATE_SCHEDULE_SCHEMA)
    hass.services.async_register(DOMAIN, "get_schedules", get_schedules, supports_response=SupportsResponse.ONLY)
    hass.services.async_register(DOMAIN, "get_week", get_week, schema=GET_WEEK_SCHEMA,
                                 supports_response=SupportsResponse.ONLY)
