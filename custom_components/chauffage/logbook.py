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
        "activated": "schedule activated: {schedule} ({source})",
        "decimal": ".",
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "sources": {
            "thermostat": "changed by hand", "card": "from the card", "panel": "from the panel", "service": "by a service",
            "entity": "from the select or a schedule switch", "rules": "by the activation rules",
        },
        "reasons": {
            "expired": "expired", "thermostat": "back to the schedule on the thermostat",
            "card": "from the card", "panel": "from the panel", "service": "by a service",
            "paused": "thermostat paused", "forgotten": "thermostat forgotten",
        },
    },
    "fr": {
        "started": "dérogation : {value} jusqu'à {end} ({source})",
        "ended": "dérogation terminée ({reason})",
        "activated": "planning activé : {schedule} ({source})",
        "decimal": ",",
        "days": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
        "sources": {
            "thermostat": "changée à la main", "card": "depuis la carte", "panel": "depuis le panneau", "service": "par un service",
            "entity": "depuis le sélecteur ou un interrupteur de planning", "rules": "par les règles d'activation",
        },
        "reasons": {
            "expired": "expirée", "thermostat": "retour au planning sur le thermostat",
            "card": "depuis la carte", "panel": "depuis le panneau", "service": "par un service",
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

    def name(entity_id: str | None, default: str) -> str:
        state = hass.states.get(entity_id) if entity_id else None
        return state.name if state else default

    def value(data: dict[str, Any]) -> str:
        preset = (runtime().presets_by_id if runtime() else {}).get(data.get("preset"))
        if preset:
            return preset["name"]
        if data.get("kind") == "temperature":
            # 21 °C, not 21.0 °C; 21,5 °C in French
            number = f"{round(float(data.get('value')), 1):g}".replace(".", texts()["decimal"])
            return f"{number} {hass.config.units.temperature_unit}"
        return str(data.get("value"))

    def until(end: Any) -> str:
        """The end's time, with its day when the override does not end today."""
        if not end:
            return "?"
        local = dt_util.as_local(end)
        if local.date() == dt_util.now().date():
            return local.strftime("%H:%M")
        return f"{texts()['days'][local.weekday()]} {local.strftime('%H:%M')}"

    @callback
    def started(event: Event) -> dict[str, Any]:
        data, t = event.data, texts()
        end = engine.parse_datetime(data.get("end"))
        return {"name": name(data["entity_id"], data["entity_id"]), "entity_id": data["entity_id"],
                "message": t["started"].format(value=value(data), end=until(end),
                                               source=t["sources"].get(data.get("source"), data.get("source")))}

    @callback
    def ended(event: Event) -> dict[str, Any]:
        data, t = event.data, texts()
        return {"name": name(data["entity_id"], data["entity_id"]), "entity_id": data["entity_id"],
                "message": t["ended"].format(reason=t["reasons"].get(data.get("reason"), data.get("reason")))}

    @callback
    def activated(event: Event) -> dict[str, Any]:
        # On the select, next to its change ("Schedule → Away"); older events have no entity_id
        data, t = event.data, texts()
        select = data.get("entity_id") or ((current := runtime()) and current.schedule_select())
        out = {"name": name(select, "Chauffage"), "message": t["activated"].format(
            schedule=data.get("schedule_name") or data.get("schedule"),
            source=t["sources"].get(data.get("source"), data.get("source")))}
        if select:
            out["entity_id"] = select
        return out

    async_describe_event(DOMAIN, EVENT_OVERRIDE_STARTED, started)
    async_describe_event(DOMAIN, EVENT_OVERRIDE_ENDED, ended)
    async_describe_event(DOMAIN, EVENT_SCHEDULE_ACTIVATED, activated)
