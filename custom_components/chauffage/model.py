"""Stored data of the integration, as plain JSON-compatible dictionaries (no HA import).
Vocabulary: docs/glossary.md.

    schedules:       [{"id": "normal", "name": "Normal"}, …]   renaming a schedule keeps its id
    active_schedule: "normal"
    presets:         [{"id": "comfort", "name": "Confort", "color": "#f57c00", "temperature": 20.0,
                       "cool_temperature": 25.0 (optional), "cool_color": "#0288d1" (optional)}, …]
                     "temperature" is the default when heating, for thermostats driven by
                     temperatures, and "cool_temperature" the default when cooling (#91). Either
                     can be empty ("temperature": None, no "cool_temperature"), not both: a
                     preset is only used in the HVAC modes it has a value for (engine.value_on).
                     "cool_color" is the color of the preset's cooling slots, when the user chose
                     one: without it, the card derives a cool shade from "color" (#91)
    thermostats:     {climate entity id: scheduled thermostat}, the thermostats Chauffage knows
                     (docs/decisions.md, "Scheduled thermostats"):
        paused:              True: kept, not controlled
        weeks:               {schedule id: [7 days, Monday first]}, one per schedule once it is
                             scheduled ({}: not scheduled); a day is a list of
                             [start "HH:MM", preset id] or [start, preset id, settings] slots,
                             the first one at "00:00"; two slots alike in a row stay two
                             slots. The settings are what the slot sets besides
                             its preset (#91): its HVAC mode ("hvac_mode"), and the fan and the
                             vanes of an air conditioner. The slot chooses the HVAC mode: "heat",
                             "cool" or "heat_cool" with a preset (the preset says how warm, for
                             that HVAC mode), "off", "fan_only", "dry" or "auto" without one
                             ([start, None, {"hvac_mode": "off"}]). An off slot sets nothing
                             else; the other slots without a preset may set the fan and the
                             vanes. A slot on a preset that says no HVAC mode (a week stored
                             before #91) is read as heat on an air conditioner that heats and
                             cools, as cool on one that only cools, and carries none on a
                             heater (engine.slot_hvac_mode)
        mapping:             {preset id: value}, what a preset means for this thermostat, only
                             what was set by hand: the rest is the preset's default
                             (engine.value_on). A value is
                             a partial state of the thermostat, as a scene holds it (#91). When
                             the thermostat heats: {"preset_mode": "comfort"} or
                             {"temperature": 20.5}, never both. When it cools: an optional
                             "cool_temperature". Then "fan_mode", "swing_mode" and
                             "swing_horizontal_mode". No "hvac_mode": the slot chooses it
        preset_temperatures: {climate preset: temperature} last seen on the thermostat, while it
                             did not cool
        cool_preset_temperatures: the same, last seen while it cooled (optional: none before
                             it cooled on one of its presets)
        own_settings:        {"fan_mode": "auto", …}: the fan and the vanes the thermostat had
                             before a slot or an override chose others, to give back by the next
                             one that chooses none (optional: none to give back)
        revision:            increases on every change of its weeks: a card saves against it, so
                             that two cards cannot overwrite each other's changes
    renamed:         {former climate entity id: current one}: a thermostat renamed in Home
                     Assistant, for the cards whose configuration still holds the former id
    overrides:       {climate entity id: {"target": {"temperature": 21.5} | {"preset_mode": "boost"}
                                                    | {"hvac_mode": "off"} (alone: an off
                                                    override sets nothing else) | …,
                                          "preset": "comfort" (optional), "start": ISO datetime,
                                          "end": ISO datetime,
                                          "ends_at": "duration" | "next_slot" |
                                                     "no_next_slot" (optional)}}: the target
                     is what the thermostat is set to; "preset", the Chauffage preset picked
                     (card, service), which the target means on this thermostat (none for a change
                     by hand); "ends_at", why a change by hand ends then: after the override
                     duration, at the next slot, or a week later as no slot changes its target
                     (none for an override set or changed on the card or by a service, nor
                     before #83: an optional key, no migration)
    pending:         {climate entity id: [{"target": {"temperature": 20.0} | {"preset_mode": "comfort"},
                                           "sent": ISO datetime}, …]}: commands sent that the
                     thermostat does not show yet, oldest first (a battery valve applies them
                     late); dropped once shown, or after a day
    revision:        increases on every change of the schedules or weeks; the card saves the
                     list of schedules against it so that two editors cannot overwrite each other
    rules:           [{"template": "{{ … }}", "schedule": "away" | None}, …]   activation rules, in
                     order: the first that applies gives the schedule; with a schedule, the rule
                     applies while its template is true; without (None), its template gives the
                     schedule (an id or a name) and the rule applies when it names one
    default_schedule: "normal" | None   the schedule when no rule is true (None: no change)
    rules_choice:    the schedule the rules chose last (None: none); a schedule chosen by hand
                     stays until this changes
"""

from __future__ import annotations

from typing import Any

from .const import DEFAULT_PRESET_COLOR, DEFAULT_PRESET_TEMPERATURE, DEFAULT_PRESETS, PRESET_NAMES
from .storage import schema
from .storage.schema import InvalidData, slug, unique_id

__all__ = ["InvalidData", "slug", "unique_id"]


def make_schedules(names: list[str]) -> list[dict[str, str]]:
    """Schedules with unique ids, in the given order (duplicate names are dropped)."""
    schedules: list[dict[str, str]] = []
    for name in names:
        name = str(name).strip()
        if not name or any(s["name"] == name for s in schedules):
            continue
        schedules.append({"id": unique_id(name, {s["id"] for s in schedules}), "name": name})
    return schedules


def plan_schedules(items: Any, current: list[dict[str, str]], active: str) -> tuple[list[dict[str, str]], dict[str, str | None]]:
    """The new ordered list of schedules from the card's list: `{"id"}` keeps a schedule (with
    `"name"`: renamed), `{"name", "copy_of"?}` creates one, a missing id deletes one. Returns the
    list and the created ids with what they copy (None: empty)."""
    if not isinstance(items, list) or not items:
        raise InvalidData("at least one schedule is needed")
    names = {s["id"]: s["name"] for s in current}
    taken = set(names)
    schedules: list[dict[str, str]] = []
    created: dict[str, str | None] = {}
    for item in items:
        if not isinstance(item, dict):
            raise InvalidData(f"invalid schedule: {item!r}")
        schedule_id = item.get("id")
        if schedule_id is not None and (schedule_id not in names or any(s["id"] == schedule_id for s in schedules)):
            raise InvalidData(f"unknown or repeated schedule: {schedule_id}")
        name = item.get("name", names.get(schedule_id))
        if not isinstance(name, str) or not name.strip():
            raise InvalidData("a schedule needs a name")
        name = name.strip()
        if any(s["name"].casefold() == name.casefold() for s in schedules):
            raise InvalidData(f"two schedules named {name}")
        if schedule_id is None:
            source = item.get("copy_of")
            if source is not None and source not in names:
                raise InvalidData(f"unknown schedule to copy: {source}")
            schedule_id = unique_id(name, taken)
            taken.add(schedule_id)
            created[schedule_id] = source
        schedules.append({"id": schedule_id, "name": name})
    if active not in {s["id"] for s in schedules}:
        raise InvalidData("the active schedule cannot be deleted")
    return schedules, created


def default_presets(language: str, extra: list[str] | None = None) -> list[dict[str, Any]]:
    """The four default presets named in `language`, then `extra` preset ids (found in existing
    weeks, kept so that nothing changes for those thermostats)."""
    names = PRESET_NAMES.get((language or "en").split("-")[0], PRESET_NAMES["en"])
    presets = [{"id": i, "name": names[i], "color": c, "temperature": t} | ({} if cool is None else {"cool_temperature": cool})
               for i, c, t, cool in DEFAULT_PRESETS]
    for preset_id in extra or []:
        if not any(preset["id"] == preset_id for preset in presets):
            presets.append({"id": preset_id, "name": preset_id, "color": DEFAULT_PRESET_COLOR,
                            "temperature": DEFAULT_PRESET_TEMPERATURE})
    return presets


def used_presets(weeks: dict[str, Any]) -> list[str]:
    """Preset ids used in the weeks, in order of appearance (an off or a fan-only slot has none)."""
    seen: list[str] = []
    for by_schedule in weeks.values():
        for week in by_schedule.values():
            for day in week:
                for slot in day:
                    if slot[1] is not None and slot[1] not in seen:
                        seen.append(slot[1])
    return seen


def new_thermostat(weeks: dict[str, Any] | None = None, mapping: dict[str, Any] | None = None,
                   preset_temperatures: dict[str, float] | None = None) -> dict[str, Any]:
    """A scheduled thermostat, active."""
    return {"paused": False, "weeks": weeks or {}, "mapping": mapping or {},
            "preset_temperatures": preset_temperatures or {}, "revision": 0}


def empty_week(preset_ids: list[str]) -> list[list[list[str]]]:
    """The week of a new schedule: eco all week (or the first preset, without eco)."""
    fill = "eco" if "eco" in preset_ids else preset_ids[0]
    return [[["00:00", fill]] for _ in range(7)]


def complete_weeks(weeks: dict[str, Any], schedule_ids: list[str], preset_ids: list[str]) -> dict[str, Any]:
    """A scheduled thermostat's weeks, one per schedule: a schedule it has none in gets the week of
    a new schedule (docs/decisions.md, "Scheduled thermostats")."""
    return {schedule_id: weeks[schedule_id] if schedule_id in weeks else empty_week(preset_ids)
            for schedule_id in schedule_ids}


def default_data(schedule_names: list[str], language: str = "en") -> dict[str, Any]:
    schedules = make_schedules(schedule_names)
    return {"schedules": schedules, "active_schedule": schedules[0]["id"], "presets": default_presets(language),
            "thermostats": {}, "renamed": {}, "overrides": {}, "pending": {}, "revision": 0,
            "rules": [], "default_schedule": None, "rules_choice": None}


def normalize_rules(rules: Any, default: Any, schedule_ids: set[str]) -> list[dict[str, Any]]:
    """Validated activation rules (the templates themselves are checked by the runtime, with HA)."""
    if not isinstance(rules, list):
        raise InvalidData("rules must be a list")
    out: list[dict[str, Any]] = []
    for rule in rules:
        if not isinstance(rule, dict):
            raise InvalidData(f"invalid rule: {rule!r}")
        template, schedule = rule.get("template"), rule.get("schedule")
        if not isinstance(template, str) or not template.strip():
            raise InvalidData("a rule needs a template")
        if schedule is not None and schedule not in schedule_ids:
            raise InvalidData(f"unknown schedule: {schedule}")
        out.append({"template": template.strip(), "schedule": schedule})
    if default is not None and default not in schedule_ids:
        raise InvalidData(f"unknown schedule: {default}")
    return out


def schedule_named(text: str, schedules: list[dict[str, str]]) -> str | None:
    """The schedule a template gives: its id, else its name (any case); None if none matches."""
    text = text.strip()
    if any(s["id"] == text for s in schedules):
        return text
    return next((s["id"] for s in schedules if s["name"].casefold() == text.casefold()), None)


def rules_outcome(rules: list[dict[str, Any]], results: list[Any], default: str | None) -> str | None:
    """The schedule of the first rule that applies (true, or a schedule given by its template),
    else the default one (a failed template does not apply); None without rules."""
    if not rules:
        return None
    return next((rule["schedule"] or result for rule, result in zip(rules, results) if result), default)


# Facades over storage/schema.py, until their callers use it (rewrite phase I7)

def normalize_preset(preset: Any, taken_ids: set[str]) -> dict[str, Any]:
    """Validated preset; a new preset (no id) gets a unique id from its name."""
    return schema.preset(preset, taken_ids).to_stored()


def normalize_target(target: Any) -> dict[str, Any]:
    """A validated target of an override or a command (storage/schema.py)."""
    return dict(schema.target(target))


def normalize_settings(settings: Any) -> dict[str, Any]:
    """A slot's validated settings (storage/schema.py)."""
    return schema.settings(settings)


def normalize_value(value: Any) -> dict[str, Any]:
    """A validated value of a preset on a thermostat (storage/schema.py)."""
    return schema.value(value)


def normalize_mapping(mapping: Any, preset_ids: set[str]) -> dict[str, dict[str, Any]]:
    """{preset id: value} set by hand for one thermostat."""
    return schema.mapping(mapping, preset_ids)


def normalize_day(slots: Any) -> list[list[Any]]:
    """Sorted slots, first one at 00:00, one slot per start time (storage/schema.py)."""
    return schema.day(slots).to_stored()


def normalize_week(week: Any) -> list[list[list[str]]]:
    return schema.week(week).to_stored()


def normalize_weeks(weeks: Any, schedule_ids: set[str], preset_ids: set[str] | None = None) -> dict[str, dict[str, Any]]:
    """Validated copy of the weeks sent by the card or an import."""
    if not isinstance(weeks, dict):
        raise InvalidData("weeks must be a dictionary")
    out: dict[str, dict[str, Any]] = {}
    for entity_id, by_schedule in weeks.items():
        if not isinstance(entity_id, str) or not entity_id.startswith("climate."):
            raise InvalidData(f"not a climate entity: {entity_id}")
        if not isinstance(by_schedule, dict):
            raise InvalidData(f"{entity_id}: the weeks by schedule must be a dictionary")
        unknown = set(by_schedule) - schedule_ids
        if unknown:
            raise InvalidData(f"{entity_id}: unknown schedules {sorted(unknown)}")
        out[entity_id] = {schedule: normalize_week(week) for schedule, week in by_schedule.items()}
    if preset_ids is not None:
        unknown_presets = set(used_presets(out)) - preset_ids
        if unknown_presets:
            raise InvalidData(f"unknown presets {sorted(unknown_presets)}")
    return out


def normalize_override(override: Any) -> dict[str, Any]:
    return schema.override(override).to_stored()
