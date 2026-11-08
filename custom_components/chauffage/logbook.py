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
        # Why a change by hand ends then (#83): when it starts, and when it expires
        "started_why": "override started: {value} until {end} ({source}, {why})",
        "ends": {"duration": "for {duration}", "next_slot": "until the next slot", "no_next_slot": "no slot ahead"},
        "ended_at": {
            "duration": "override ended after {duration}", "next_slot": "override ended at the next slot",
            "no_next_slot": "override ended after a week, no slot ahead",
        },
        "hours": "{h} h", "hours_minutes": "{h} h {mm}", "minutes": "{m} min",
        # The HVAC mode an override sets (#91), as Home Assistant names them
        "hvac_modes": {
            "off": "off", "heat": "heat", "cool": "cool", "heat_cool": "heat/cool", "auto": "auto", "dry": "dry",
            "fan_only": "fan only",
        },
        # A cooling setpoint, the fan and the vanes an override sets (#91, lot 3)
        "cooling": "{value} when cooling",
        "settings": {"fan_mode": "fan {value}", "swing_mode": "vanes {value}", "swing_horizontal_mode": "horizontal vanes {value}"},
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
        "started_why": "dérogation : {value} jusqu'à {end} ({source}, {why})",
        "ends": {"duration": "pendant {duration}", "next_slot": "jusqu'au prochain créneau", "no_next_slot": "aucun créneau prévu"},
        "ended_at": {
            "duration": "dérogation terminée au bout de {duration}", "next_slot": "dérogation terminée au prochain créneau",
            "no_next_slot": "dérogation terminée au bout d'une semaine, aucun créneau prévu",
        },
        "hours": "{h} h", "hours_minutes": "{h} h {mm}", "minutes": "{m} min",
        "hvac_modes": {
            "off": "arrêt", "heat": "chauffage", "cool": "climatisation", "heat_cool": "chauffage/climatisation",
            "auto": "auto", "dry": "déshumidification", "fan_only": "ventilation",
        },
        "cooling": "{value} en climatisation",
        "settings": {"fan_mode": "ventilation {value}", "swing_mode": "volets {value}", "swing_horizontal_mode": "volets horizontaux {value}"},
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

    def degrees(value: Any) -> str:
        """21 °C, not 21.0 °C; 21,5 °C in French."""
        number = f"{round(float(value), 1):g}".replace(".", texts()["decimal"])
        return f"{number} {hass.config.units.temperature_unit}"

    def value(data: dict[str, Any]) -> str:
        """The override's value: its HVAC mode if it sets one, then the Chauffage preset's name,
        else what its target holds (a setpoint, a cooling setpoint), then the fan and the vanes.
        An event recorded before #91 holds a kind and a value instead of a target."""
        preset = (runtime().presets_by_id if runtime() else {}).get(data.get("preset"))
        target = data.get("target")
        if not isinstance(target, dict):
            key = "temperature" if data.get("kind") == "temperature" else "preset_mode"
            target = {key: data.get("value")}
        t = texts()
        parts = []
        if "hvac_mode" in target:  # off, or the HVAC mode the thermostat was turned on in (#91)
            parts.append(t["hvac_modes"].get(target["hvac_mode"], str(target["hvac_mode"])))
        if preset:
            parts.append(preset["name"])
        elif "temperature" in target:
            parts.append(degrees(target["temperature"]))
        elif "preset_mode" in target:
            parts.append(str(target["preset_mode"]))
        elif "cool_temperature" in target:
            parts.append(t["cooling"].format(value=degrees(target["cool_temperature"])))
        parts.extend(text.format(value=target[key]) for key, text in t["settings"].items() if key in target)
        return ", ".join(parts)

    def until(end: Any) -> str:
        """The end's day and time: the same line whatever the day it is read."""
        if not end:
            return "?"
        local = dt_util.as_local(end)
        return f"{texts()['days'][local.weekday()]} {local.strftime('%H:%M')}"

    def duration(data: dict[str, Any]) -> str:
        """How long the override lasts: "2 h", "1 h 30", "45 min"."""
        start, end = (engine.parse_datetime(data.get(key)) for key in ("start", "end"))
        minutes = round((end - start).total_seconds() / 60) if start and end else 0
        t = texts()
        if minutes < 60:
            return t["minutes"].format(m=minutes)
        if minutes % 60 == 0:
            return t["hours"].format(h=minutes // 60)
        return t["hours_minutes"].format(h=minutes // 60, mm=f"{minutes % 60:02d}")

    @callback
    def started(event: Event) -> dict[str, Any]:
        data, t = event.data, texts()
        end = engine.parse_datetime(data.get("end"))
        source = t["sources"].get(data.get("source"), data.get("source"))
        # A change by hand says why it ends then (#83)
        why = t["ends"].get(data.get("ends_at"))
        message = (t["started_why"].format(value=value(data), end=until(end), source=source,
                                           why=why.format(duration=duration(data)))
                   if why else t["started"].format(value=value(data), end=until(end), source=source))
        return {"name": name(data["entity_id"], data["entity_id"]), "entity_id": data["entity_id"], "message": message}

    @callback
    def ended(event: Event) -> dict[str, Any]:
        data, t = event.data, texts()
        # Expired: when it was meant to end, for a change by hand (#83)
        at = t["ended_at"].get(data.get("ends_at")) if data.get("reason") == "expired" else None
        message = (at.format(duration=duration(data)) if at
                   else t["ended"].format(reason=t["reasons"].get(data.get("reason"), data.get("reason"))))
        return {"name": name(data["entity_id"], data["entity_id"]), "entity_id": data["entity_id"], "message": message}

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
