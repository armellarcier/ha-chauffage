# Phase 2: heating levels instead of presets — design and plan

Status: **draft for discussion** (see "Open decisions" at the end). Target: v0.3.0.
Roadmap context: [ROADMAP.md](../ROADMAP.md), "Becoming generic", sections 1 and 2.

Goal: schedules reference **heating levels** defined by the user instead of Versatile
Thermostat preset names, and each level is **mapped per thermostat** to what that thermostat
understands. Done when **a `generic_thermostat` (no presets) follows a schedule**, with
overrides, next to Versatile Thermostats that keep working exactly as today.

## What the user gets

- Levels with a name and a color, in the user's language: by default *Comfort*, *Eco*,
  *Boost*, *Frost protection* (today's four presets, same colors), and optionally *Off*.
- Each thermostat added to a schedule gets a **default mapping** from its capabilities:
  - it has a preset with the level's id (`comfort`, `eco`, `boost`; `frost` for VTherm, `away`
    as a fallback for frost protection) → that preset;
  - otherwise → a temperature (20 / 17 / 21 / 7 °C by default, within its min / max, rounded
    to its step);
  - *Off* → `hvac_mode: off`.
- The mapping can be changed per thermostat (preset, temperature or off for each level).
- The card shows levels (legend, editor buttons) and, for a temperature mapping, the
  temperature of the level for the focused thermostat (as it shows VTherm preset temperatures
  today).

## Data model (Store version 1 → 2)

```json
{
  "levels": [
    {"id": "comfort", "name": "Confort", "color": "#f57c00"},
    {"id": "eco", "name": "Éco", "color": "#43a047"},
    {"id": "boost", "name": "Boost", "color": "#e53935"},
    {"id": "frost", "name": "Hors-gel", "color": "#29b6f6"}
  ],
  "mappings": {
    "climate.salon": {"comfort": {"preset": "comfort"}, "eco": {"preset": "eco"}, "…": "…"},
    "climate.cuisine": {"comfort": {"temperature": 20.0}, "eco": {"temperature": 17.0}, "off": {"off": true}}
  },
  "schedules": {"climate.salon": {"normal": [[["00:00", "eco"], ["06:30", "comfort"]], "…"]}}
}
```

- **Slots keep their shape**: `[start, level id]`. The migration from version 1 creates the four
  default levels with the ids of today's presets, so existing schedules are unchanged, and a
  preset mapping for every scheduled thermostat (exactly today's behavior).
- Level ids are stable; names and colors can change. Removing a level used in a schedule is
  refused (or replaces it, see decisions).
- Mappings are created when a thermostat first appears in a schedule (default mapping from
  its capabilities) and removed with it.

## Engine

- `expected(level, mapping)` → what the thermostat should be: a preset, a target temperature,
  or off.
- `targets(...)` compares the thermostat's state with that expectation (preset equal; target
  temperature equal within half a step; state off) and returns **actions**:
  `set_preset_mode`, `set_temperature`, `set_hvac_mode off`, and turning a thermostat back on
  when the level is not *Off* (see decision 1).
- Manual changes: today's rules plus the integration's own context already cover a thermostat
  without presets (any setpoint change that is not ours becomes a temperature override). The
  remaining part of phase 3 (thermostats that change their setpoint by themselves) stays in
  phase 3.

## Configuration UI

- **Options flow** (Settings → Devices & services → Chauffage → Configure), as a menu:
  *Levels* (rename, color, add, remove), *Thermostats* (pick one, then for each level: preset /
  temperature / off, with the thermostat's presets and limits offered), *Override duration*.
- The card does not edit levels or mappings (rarely changed; the options flow is HA's standard
  place for configuration). It reads them through the websocket API.

## Card

- Levels come from the integration (`chauffage/subscribe` gains `levels` and `mappings`);
  `PRESETS` (colors) becomes the fallback for the package only.
- Legend and editor show the levels; the legend shows the mapped value for the focused
  thermostat ("Comfort 20 °" or "Comfort" for a preset).

## Development environment and tests

- The dev HA gets a **`generic_thermostat`** room (created through its config flow by
  `setup.py`, on a simulated heater and temperature), next to the three VTherm rooms.
- Engine: expectation and actions for each mapping kind; tests of the default mapping from
  capabilities (presets, min / max / step).
- Integration: the ported behavior tests run on a VTherm-like thermostat **and** on a
  temperature-only thermostat (parametrized bench); Store migration 1 → 2 with fixtures.
- Card: levels and mapped values in the legend, on the integration.

## Steps

1. Store v2 (levels, mappings) and its migration, with fixtures; default mapping from
   capabilities.
2. Engine and runtime: actions per mapping kind, comparison with the expectation; behavior
   tests on both thermostat kinds.
3. Options flow: levels, per-thermostat mapping.
4. Websocket API and card: levels, colors, mapped values.
5. Dev HA with a `generic_thermostat`; docs (README, CONTRIBUTING, changelog, roadmap);
   beta on the author's production.

## Open decisions

1. **The *Off* level and thermostats turned off by hand.** Today a thermostat turned off by hand
   (summer) is left alone. With an *Off* level the scheduler turns thermostats off and must
   turn them back on for the next level, but must not turn back on a thermostat the user turned
   off. Recommendation: the integration remembers which thermostats **it** turned off and only
   turns those back on; a thermostat turned off by someone else stays off (as today).
   Alternative: no *Off* level in phase 2.
2. **Removing a level used in schedules**: refuse, or replace it by another level chosen in the
   form. Recommendation: replace (the form asks which level takes its place).
3. **Default temperatures** of temperature mappings (20 / 17 / 22 / 7 °C) and where they are
   set: per thermostat only, or a default per level that new thermostats copy.
   Recommendation: a default temperature per level (in the *Levels* form), copied into each new
   thermostat's mapping and editable per thermostat.
4. **Version**: v0.3.0 (new stored format, migrated), with its own beta.
