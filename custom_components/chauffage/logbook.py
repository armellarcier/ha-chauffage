"""Logbook descriptions of the events (#49): an override starting or ending on a thermostat, with
where it came from and why it ended, and a schedule activated. The reason stays in the history
without enabling the logs (docs/decisions.md, "Entities")."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.util import dt as dt_util

from . import engine
from .const import DOMAIN, EVENT_OVERRIDE_ENDED, EVENT_OVERRIDE_STARTED, EVENT_SCHEDULE_ACTIVATED

# Home Assistant does not translate logbook descriptions: in its language, English otherwise
TEXTS = {
    "en": {
        "started": "override started: {value} until {end} ({source})",
        "ended": "override ended ({reason})",
        "activated": "activated schedule {schedule} ({source})",
        "sources": {
            "thermostat": "changed on the thermostat", "card": "from the card", "service": "by a service",
            "entity": "from its entity", "rules": "by the activation rules",
        },
        "reasons": {
            "expired": "expired", "thermostat": "back to the schedule on the thermostat",
            "card": "removed from the card", "service": "removed by a service",
            "paused": "thermostat paused", "forgotten": "thermostat forgotten",
        },
    },
    "fr": {
        "started": "dérogation : {value} jusqu'à {end} ({source})",
        "ended": "dérogation terminée ({reason})",
        "activated": "a activé le planning {schedule} ({source})",
        "sources": {
            "thermostat": "changée sur le thermostat", "card": "depuis la carte", "service": "par un service",
            "entity": "depuis son entité", "rules": "par les règles d'activation",
        },
        "reasons": {
            "expired": "expirée", "thermostat": "retour au planning sur le thermostat",
            "card": "retirée depuis la carte", "service": "retirée par un service",
            "paused": "thermostat en pause", "forgotten": "thermostat oublié",
        },
    },
}


@callback
def async_describe_events(
    hass: HomeAssistant, async_describe_event: Callable[[str, str, Callable[[Event], dict[str, Any]]], None]
) -> None:
    def texts() -> dict[str, Any]:
        return TEXTS.get((hass.config.language or "en").split("-")[0], TEXTS["en"])

    def runtime() -> Any:
        return next((runtime for entry in hass.config_entries.async_entries(DOMAIN)
                     if (runtime := getattr(entry, "runtime_data", None))), None)

    def thermostat_name(entity_id: str) -> str:
        state = hass.states.get(entity_id)
        return state.name if state else entity_id

    def value(data: dict[str, Any]) -> str:
        preset = (runtime().presets_by_id if runtime() else {}).get(data.get("preset"))
        if preset:
            return preset["name"]
        if data.get("kind") == "temperature":
            return f"{data.get('value')} {hass.config.units.temperature_unit}"
        return str(data.get("value"))

    @callback
    def started(event: Event) -> dict[str, Any]:
        data, t = event.data, texts()
        end = engine.parse_datetime(data.get("end"))
        return {"name": thermostat_name(data["entity_id"]), "entity_id": data["entity_id"],
                "message": t["started"].format(value=value(data), end=dt_util.as_local(end).strftime("%H:%M") if end else "?",
                                               source=t["sources"].get(data.get("source"), data.get("source")))}

    @callback
    def ended(event: Event) -> dict[str, Any]:
        data, t = event.data, texts()
        return {"name": thermostat_name(data["entity_id"]), "entity_id": data["entity_id"],
                "message": t["ended"].format(reason=t["reasons"].get(data.get("reason"), data.get("reason")))}

    @callback
    def activated(event: Event) -> dict[str, Any]:
        data, t = event.data, texts()
        out = {"name": "Chauffage", "message": t["activated"].format(
            schedule=data.get("schedule_name") or data.get("schedule"),
            source=t["sources"].get(data.get("source"), data.get("source")))}
        if (current := runtime()) and (select := current.schedule_select()):
            out["entity_id"] = select
        return out

    async_describe_event(DOMAIN, EVENT_OVERRIDE_STARTED, started)
    async_describe_event(DOMAIN, EVENT_OVERRIDE_ENDED, ended)
    async_describe_event(DOMAIN, EVENT_SCHEDULE_ACTIVATED, activated)
