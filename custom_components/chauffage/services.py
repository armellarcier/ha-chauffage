"""Services for automations.

chauffage.set_override       sets a thermostat's temperature or preset, and its HVAC mode (off, or
                             one to turn it on in), for a while (the schedule resumes at the end),
                             like a manual change; off alone, without an end, lasts as the setting
                             *End of off overrides* says
chauffage.clear_override     ends it now: the thermostat resumes its schedule
chauffage.activate_schedule  activates a schedule by its stable id (unchanged when renamed)
chauffage.get_schedules      (response) the schedules, the active one, the one the rules give
chauffage.get_week           (response) the week of thermostats in a schedule, as HA's
                             schedule.get_schedule gives its schedules; a slot says its HVAC mode
                             when it chooses one (hvac_mode), and an off slot or a fan-only slot
                             has no preset (null)
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

import voluptuous as vol

from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.components.climate.const import HVACMode
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError, Unauthorized
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
        # One of Home Assistant's HVAC modes: reproduce_state ignores any other value silently
        vol.Optional("hvac_mode"): vol.In([mode.value for mode in HVACMode]),
        # Not both: refused by the service, with a message in the user's language
        vol.Optional("duration"): vol.All(vol.Coerce(int), vol.Range(min=1)),
        vol.Optional("end"): cv.datetime,
    }),
    cv.has_at_least_one_key("temperature", "preset", "hvac_mode"),
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


def refuse_contradictions(hass: HomeAssistant, data: dict) -> None:
    """What chauffage.set_override refuses, with a message that says why: an override that
    contradicts itself would be recorded and do something else than what was asked."""
    entity_id, mode = data[ATTR_ENTITY_ID], data.get("hvac_mode")

    def refuse(key: str, **placeholders: str) -> None:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key=key,
                                     translation_placeholders={"entity_id": entity_id, **placeholders})

    if "duration" in data and "end" in data:
        refuse("duration_and_end")
    # Off and fan only take no setpoint
    if mode in ("off", "fan_only") and ("temperature" in data or "preset" in data):
        refuse("no_setpoint_in_hvac_mode", hvac_mode=mode)
    state = hass.states.get(entity_id)
    listed = [str(getattr(m, "value", m)) for m in (state.attributes.get("hvac_modes") or ())] if state else []
    if mode is not None and listed and mode not in listed:
        refuse("hvac_mode_not_listed", hvac_mode=mode, hvac_modes=", ".join(listed))


async def may_control(hass: HomeAssistant, call: ServiceCall, entity_id: str) -> None:
    """An override changes one thermostat: the user who calls the service must control it, as
    with Home Assistant's own services that target an entity. An automation has no user."""
    if call.context.user_id is None:
        return
    user = await hass.auth.async_get_user(call.context.user_id)
    if user is None or not user.permissions.check_entity(entity_id, POLICY_CONTROL):
        raise Unauthorized(context=call.context, entity_id=entity_id, permission=POLICY_CONTROL)


@callback
def async_register(hass: HomeAssistant) -> None:
    async def set_override(call: ServiceCall) -> None:
        entity_id = call.data[ATTR_ENTITY_ID]
        await may_control(hass, call, entity_id)
        runtime = runtime_for(hass, entity_id)
        refuse_contradictions(hass, call.data)
        end: datetime | None = call.data.get("end")
        if end is not None:
            end = dt_util.as_local(end if end.tzinfo else end.replace(tzinfo=dt_util.get_default_time_zone()))
        minutes = call.data.get("duration")
        target: dict = {}
        preset_id = None
        if "temperature" in call.data:
            target["temperature"] = call.data["temperature"]
        elif "preset" in call.data:  # a Chauffage preset (what it means on this thermostat), else a climate preset of its own
            preset = call.data["preset"]
            meaning = runtime.targets_of(entity_id).get(preset)
            target, preset_id = (dict(meaning), preset) if meaning else ({"preset_mode": preset}, None)
        if "hvac_mode" in call.data:  # off, or a mode to turn the thermostat on in (#91)
            target["hvac_mode"] = call.data["hvac_mode"]
        if target == {"hvac_mode": "off"} and minutes is None and end is None:
            # Off without an end: as a thermostat turned off by hand (the setting *End of off overrides*)
            override = runtime.manual_override(entity_id, target, runtime.current(hass.states.get(entity_id)))
        else:
            override = runtime.new_override(target, minutes, end)
        if preset_id:
            override["preset"] = preset_id
        try:
            await runtime.set_override(entity_id, override, source="service", resend=True, context=call.context)
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
        await may_control(hass, call, entity_id)
        await runtime_for(hass, entity_id).set_override(entity_id, None, source="service", context=call.context)

    async def activate_schedule(call: ServiceCall) -> None:
        runtime = loaded_runtime(hass)
        await runtime.activate_schedule(known_schedule(runtime, call.data["schedule"]), source="service",
                                       context=call.context)

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
                name: [{"start": slot[0], "end": next_start, "preset": slot[1], **(slot[2] if len(slot) > 2 else {})}
                       for slot, next_start in zip(day, [s[0] for s in day[1:]] + ["24:00"])]
                for name, day in zip(DAYS, week)
            }
        return response

    hass.services.async_register(DOMAIN, "set_override", set_override, schema=SET_OVERRIDE_SCHEMA)
    hass.services.async_register(DOMAIN, "clear_override", clear_override, schema=CLEAR_OVERRIDE_SCHEMA)
    hass.services.async_register(DOMAIN, "activate_schedule", activate_schedule, schema=ACTIVATE_SCHEDULE_SCHEMA)
    hass.services.async_register(DOMAIN, "get_schedules", get_schedules, supports_response=SupportsResponse.ONLY)
    hass.services.async_register(DOMAIN, "get_week", get_week, schema=GET_WEEK_SCHEMA,
                                 supports_response=SupportsResponse.ONLY)
