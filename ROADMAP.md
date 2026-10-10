# Roadmap

**English** · [Français](ROADMAP.fr.md)

ha-chauffage currently targets **[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**
(VTherm). This dependency is **temporary**: the goal is to work with **any Home Assistant
`climate` entity**, and to let users organize their thermostats into groups with their own
schedules and heating modes. This document explains why VTherm is the starting point and what
it takes to become generic.

## Why Versatile Thermostat for now

| What we need | What VTherm provides |
|---|---|
| A target per slot that the user can tune without touching the schedule | **Presets with a temperature per thermostat** (`comfort`, `eco`, `boost`, `frost`), editable in the UI: the schedule only says "comfort from 06:30" |
| Knowing when someone changed the setpoint by hand | VTherm **switches to preset `none`** on a manual setpoint change: a clear, reliable signal |
| Good regulation whatever the hardware | VTherm drives switches, valves or other climates with its own regulation (TPI), window / presence detection, safety… |
| One real setup to validate against | It is the author's installation (Zigbee valves behind VTherm thermostats) |

Starting with a single, well-behaved thermostat type let us get the core right first: weekly
schedules, modes, the editor card, temporary overrides and their end, and tests.

**Consequences we accept for now**

- Only thermostats exposing the `comfort` / `eco` / `boost` / `frost` presets are supported.
- Manual-change detection relies on VTherm's preset `none`.
- The development HA (`dev/setup/setup.py`) creates VTherm thermostats by walking through VTherm's
  config flow, field by field. That flow was discovered on VTherm 10.5.0 and may change.
  **We deliberately do not pin versions or add an end-to-end CI check of this setup yet**:
  this part will be replaced (see "Development environment" below), so hardening it now would be
  wasted effort. If it breaks, `docker compose logs setup` shows which step failed.

## Becoming generic

### 1. Heating levels instead of presets

Schedules should reference **heating levels** defined by the user (e.g. *Comfort*, *Eco*,
*Night*, *Frost protection*, *Off*), not a thermostat's preset names. Each level is then
**mapped per thermostat** (or per group, see below) to what that thermostat understands:

- a **preset** (`preset_mode`), when the thermostat has a matching one;
- a **setpoint** (`temperature`, or `target_temp_low` / `target_temp_high` for heat_cool);
- **off** (`hvac_mode: off`).

The mapping comes from each entity's capabilities: `supported_features`, `preset_modes`,
`hvac_modes`, `min_temp` / `max_temp` / `target_temp_step`. VTherm becomes one case among others
(levels mapped to its presets), and a thermostat without presets works with temperatures.

Slots may also carry a temperature directly ("21 °C from 06:30"), for users who don't want
named levels.

### 2. Manual-change detection without preset `none`

Instead of relying on a thermostat-specific signal:

- remember, per thermostat, **what the schedule last applied** (level, preset or setpoint, and when);
- a change is **manual** when the thermostat's target differs from that expectation **and** the
  change does not come from an automation (`context.parent_id` is empty — already used today);
- ignore the thermostat's own adjustments (window open, presence, safety…) through configurable
  rules, since some integrations change their setpoint by themselves.

### 3. Groups of thermostats

Today each thermostat has its own schedule. Many homes need **zones** sharing a schedule:
"bedrooms", "living areas", "bathrooms"…

- A **group** is a named set of climates; each climate belongs to at most one group.
- Schedules are defined **per group and per mode**; a thermostat may still get its own schedule
  (a group of one, or a per-thermostat exception within the group).
- The level mapping (step 1) can be set per group, with per-thermostat overrides
  (e.g. *Comfort* = 21 °C in the living room, 19 °C in bedrooms).
- Overrides stay per thermostat (a manual change in one room does not affect the group).
- The card edits groups: a row per group instead of a row per thermostat, membership edited
  in the card.

### 4. User-defined heating modes

Today the modes are fixed (`Normal` / `Absent` / `Vacances`, in `input_select.mode_chauffage`).

- Modes become **user-defined** (name, order), with schedules per (group, mode).
- The active mode can be **global or per group** (e.g. a guest room in *Away* while the rest is
  *Normal*).
- Mode changes stay plain HA entities (a `select` per group), so they can be driven by presence,
  a calendar (holidays) or any automation.
- A mode can be **time-limited** ("Away until Sunday 18:00"), like overrides.

### 5. From a YAML package to an integration

The package (template sensors storing data in attributes, events sent by the card) has reached
its limits: attribute size (the recorder ignores attributes over 16 KB), no real services, no
config UI, no HACS distribution. The generic version should be a **custom integration**
(`custom_components/chauffage`):

- storage with HA's `Store` (schedules, groups, modes, levels, overrides), with migrations;
- **services** (`chauffage.set_schedule`, `chauffage.set_override`, `chauffage.set_mode`…)
  used by the card and usable from automations;
- **entities**: a `select` per group for the mode, sensors for the current / next slot and the
  active override;
- a **config flow** to create groups and levels;
- the card served by the integration itself (no `extra_module_url` needed), installable with
  **HACS**;
- a migration from the current package (schedules and overrides imported once).

### 6. Development environment and tests

- The development HA gets **generic thermostats that need no UI configuration**: HA's
  [`generic_thermostat`](https://www.home-assistant.io/integrations/generic_thermostat/)
  (pure YAML), template climates, and a thermostat with presets but no `none` signal.
  VTherm stays as one profile among others. Most of `dev/setup/setup.py`'s config-flow walking
  then disappears.
- Tests run as a **matrix of thermostat types** (presets only, setpoint only, heat_cool, VTherm).
- Once this environment is stable: **pin HA and integration versions** (with a dependency bot
  proposing upgrades) and add an **end-to-end CI check** that boots the dev HA, runs the setup and
  verifies that the schedule is applied — the hardening deliberately postponed above.

## Order of work

| Phase | Content | Done when |
|---|---|---|
| 1 | Heating levels, mapping to preset / setpoint / off, capability detection | a `generic_thermostat` follows a schedule |
| 2 | Generic manual-change detection | overrides work on a thermostat without presets |
| 3 | Groups and user-defined modes (data model, then card) | two groups with different modes run side by side |
| 4 | Integration, services, storage, HACS, migration from the package | installed from HACS, existing data migrated |
| 5 | Generic dev environment, test matrix, pinned versions, end-to-end CI | CI covers every thermostat type |

Phases 1–3 can be prototyped in the current package to validate the behavior (with tests),
before moving to the integration in phase 4.
