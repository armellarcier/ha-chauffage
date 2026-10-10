# Phase 2: heating levels instead of presets — design and plan

Status: **steps 1–5 done** (see "Decisions" at the end); remaining: the v0.3.0 pre-release on
the author's production. Target: v0.3.0, published as pre-releases first.
Roadmap context: [ROADMAP.md](../ROADMAP.md), "Becoming generic", sections 1 and 2.

Goal: schedules reference **heating levels** defined by the user instead of Versatile
Thermostat preset names, and each level is **mapped per thermostat** to what that thermostat
understands. Done when **a `generic_thermostat` (no presets) follows a schedule**, with
overrides, next to Versatile Thermostats that keep working exactly as today.

## What the user gets

- Levels with a name, a color and a default temperature, in the user's language: by default
  *Comfort* 20 °C, *Eco* 17 °C, *Boost* 21 °C, *Frost protection* 7 °C (today's four presets,
  same colors). No *Off* level in phase 2: thermostats turned off are left alone, as today.
- Each thermostat added to a schedule gets a **default mapping** from its capabilities:
  - it has a preset with the level's id (`comfort`, `eco`, `boost`, `frost`) → that preset;
  - otherwise → the level's default temperature, within its min / max, rounded to its step.
- The mapping can be changed per thermostat (preset or temperature for each level). A
  thermostat that keeps the default follows later changes of the level's default temperature;
  one set by hand keeps its own value.
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
    "climate.cuisine": {"comfort": {"temperature": 20.5}}
  },
  "schedules": {"climate.salon": {"normal": [[["00:00", "eco"], ["06:30", "comfort"]], "…"]}}
}
```

- **Slots keep their shape**: `[start, level id]`. The migration from version 1 creates the four
  default levels with the ids of today's presets, so existing schedules are unchanged, and a
  preset mapping for every scheduled thermostat (exactly today's behavior).
- Level ids are stable; names and colors can change. Removing a level used in a schedule is
  refused (or replaces it, see decisions).
- `mappings` only holds what was set by hand; everything else is the default mapping, computed
  from the thermostat's current capabilities (so a thermostat that was unavailable when it was
  added gets the right mapping once it is back).
- Levels also carry their default temperature (`"temperature": 20.0`).

## Engine

- `expected(level, mapping)` → what the thermostat should be: a preset or a target temperature.
- `targets(...)` compares the thermostat's state with that expectation (preset equal; target
  temperature equal within half a step) and returns **actions**: `set_preset_mode` or
  `set_temperature`.
- Manual changes are judged against what the schedule expects:
  - temperature mapping: a setpoint change that is not the integration's (nor an automation's)
    becomes a temperature override; a preset picked by a user becomes a preset override;
  - preset mapping: today's rules (manual preset such as `none` + setpoint → temperature
    override; preset picked by a user → preset override). A setpoint change that keeps the
    preset is the preset's own temperature (VTherm preset temperatures): not an override.
    Devices that keep their preset on a manual setpoint can be mapped to temperatures.
  The remaining part of phase 3 (thermostats that change their setpoint by themselves) stays in
  phase 3.

## Configuration UI

Changed after a first version (see "Changes from the plan"):

- **In the card** (admins): a click on a level in the legend sets what it means for the
  displayed thermostat (one of its presets or a temperature, or back to the default);
  *⚙ Levels* renames, recolors, adds or removes levels and sets their default temperature.
- **Options**: a single form with the default settings, the override duration and *Use the
  thermostats' presets* (on by default; off, every thermostat is driven by temperatures).
- Preset temperatures are shown in the legend: learned while each preset is active (no standard
  attribute gives them), read from Versatile Thermostat's attributes (`comfort_temp`…), a
  deliberate extra for VTherm users.

## Card

- Levels come from the integration (`chauffage/subscribe` gains `levels` and `mappings`);
  `PRESETS` (colors) becomes the fallback for the package only.
- Legend and editor show the levels; the legend shows the mapped value for the focused
  thermostat ("Comfort 20 °" or "Comfort" for a preset).

## Development environment and tests

- Every kind of thermostat, in the dev HA and in the tests:
  - **Versatile Thermostat** (presets `comfort` / `eco` / `boost` / `frost`, `none` on a manual
    setpoint, safety mode): the three existing rooms;
  - **standard HA presets** (`eco`, `comfort`, `away`, `boost`, no `frost`; preset cleared on a
    manual setpoint): a small dev-only climate (`dev/sim_climate/`), so its behavior is
    controlled; frost protection is then a temperature mapping;
  - **no presets**: HA's `generic_thermostat`, declared in YAML on a simulated heater (its UI
    flow only accepts a `switch` or a `fan`).
- Engine: expectation and actions for each mapping kind; tests of the default mapping from
  capabilities (presets, min / max / step).
- Integration: the behavior tests run on the three kinds (parametrized bench); Store
  migration 1 → 2 with fixtures.
- Card: levels and mapped values in the legend, on the integration.

## Steps

1. Store v2 (levels, mappings) and its migration, with fixtures; default mapping from
   capabilities.
2. Engine and runtime: actions per mapping kind, comparison with the expectation; behavior
   tests on both thermostat kinds.
3. Options flow: levels, per-thermostat mapping.
4. Websocket API and card: levels, colors, mapped values.
5. Dev HA with the three kinds of thermostats; docs (README, CONTRIBUTING, changelog,
   roadmap); v0.3.0 pre-release on the author's production.

## Decisions

1. **No *Off* level** in phase 2: thermostats turned off (by hand, for the summer) are left
   alone, as today.
2. **Removing a level used in schedules** replaces it: the form asks which level takes its
   place.
3. **Default temperature per level** (in the *Levels* form), used by every thermostat mapped to
   temperatures unless set per thermostat.
4. **Version**: v0.3.0, published as pre-releases first.

## Changes from the plan

- **Levels and mappings are set in the card**, not in the options flow: HA's option forms (no
  layout, generated fields, no preview) proved impractical for setting temperatures room by
  room. The options keep a single form of default settings.
