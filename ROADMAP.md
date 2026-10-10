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

## First release, migrations, then a YAML-free system

The current package works and is used daily: it deserves a **first release** soon, so users can
install a known version. It is a stepping stone: the next major step replaces it with a **fully
configurable integration, without any YAML**.

### Versioned data and migrations, from the first release

Every release that changes stored data must upgrade existing installations automatically, with no
manual step and no data loss:

- a **schema version** is stored with the data (schedules, overrides, settings); data created
  before the first release counts as version 1;
- **migrations** are small ordered steps (version N → N+1), run automatically when the data is
  loaded; each one is idempotent and **tested with fixtures of the old format** (`tests/fixtures/`);
- a **backup** of the previous data is kept before migrating; downgrades are not supported, and the
  release notes say so;
- while the package is the distributed version, the card migrates the data it loads and saves it
  back; in the integration, migrations use HA's own mechanisms (`Store` versions,
  `async_migrate_entry` for config entries);
- **releases**: semantic versioning, a `CHANGELOG.md`, Git tags and GitHub releases (which HACS
  relies on). Release checklist: tests green, migrations tested, demo re-recorded if the UI
  changed, changelog updated.

**Done in v0.1.0** for the schedules (schema version, card-side migrations with backup,
fixtures, changelog, release workflow): see CONTRIBUTING.md, "Data versions and migrations" and
"Releasing". Overrides are short-lived and not migrated.

### Then, quickly: no more YAML

The first release still asks users to copy files and edit `configuration.yaml` (package,
`extra_module_url`, recorder exclusions). The integration (section 5 below) removes all of it:
installation from HACS, then **everything configured from the UI** — thermostats, modes, heating
levels, override duration, detection rules. Its first version includes the **automatic migration
from the package release** (schedules, overrides and active mode imported, then instructions to
remove the package).

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

### 5. From a YAML package to a YAML-free integration

The package (template sensors storing data in attributes, events sent by the card) has reached
its limits: attribute size (the recorder ignores attributes over 16 KB), no real services, no
config UI, no HACS distribution, and YAML to edit by hand. The next major version is a **custom
integration** (`custom_components/chauffage`):

- **no YAML at all**: a config flow and an options flow cover every setting (thermostats, modes,
  heating levels, groups, override duration, detection rules);
- storage with HA's `Store` (schedules, groups, modes, levels, overrides), with versioned
  migrations (see above);
- **services** (`chauffage.set_schedule`, `chauffage.set_override`, `chauffage.set_mode`…)
  used by the card and usable from automations;
- **entities**: a `select` per group for the mode, sensors for the current / next slot and the
  active override;
- the card served by the integration itself (no `extra_module_url` needed), installable with
  **HACS**;
- an **automatic migration from the package release** (schedules, overrides and mode imported).

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

### 7. Internationalization

**Done — the card** speaks English and French and follows the user's Home Assistant profile
(`hass.locale`): language, 12 / 24 h clock, decimal separator, first day of the week, and the
temperature unit. Texts are in one dictionary per language (same keys, checked by tests); times,
day names and numbers come from the browser's `Intl` APIs. See CONTRIBUTING.md, "Translations".

**Still in French**: the mode names (`Normal` / `Absent` / `Vacances`, which are data), entity and
event names (`input_select.mode_chauffage`, `sensor.derogations_chauffage`,
`chauffage_derogation_set`) and the stored keys (`valeur`, `debut`, `fin`). Next steps:

- **Integration** (phase 1): HA's own translation system (`strings.json`, `translations/*.json`)
  for entity names (`translation_key`), states, services, the config flow and error messages.
- **Card translations as files**: once the integration bundles the card, one JSON file per language
  and ICU MessageFormat (plurals), as most Home Assistant cards do; more languages through
  contributions.
- **Language-neutral identifiers**: English, stable keys for entities, events, services and stored
  data (`value`, `start`, `end`…); only what the user sees is translated. Default modes and heating
  levels are created with names in the user's language, then freely renamed.
- **Documentation**: already in English (canonical) and French; other languages welcome.

The neutral identifiers come with the move to the integration (phase 1), where the migration from
the package release renames the stored keys.

## Order of work

| Phase | Content | Done when |
|---|---|---|
| 0 | **First release** of the current package: `CHANGELOG.md`, versioned data, migration framework with tests | v0.1.0 tagged and published on GitHub; stored data carries a schema version |
| 1 | **YAML-free integration**: config / options flow, storage, services, entities, card served by the integration, HACS, translations, language-neutral identifiers, automatic migration from the package release | installed from HACS with no YAML; a package installation is migrated automatically; UI in English and French |
| 2 | Heating levels, mapping to preset / setpoint / off, capability detection | a `generic_thermostat` follows a schedule |
| 3 | Generic manual-change detection | overrides work on a thermostat without presets |
| 4 | Groups and user-defined modes (data model, then card) | two groups with different modes run side by side |
| 5 | Generic dev environment, test matrix, pinned versions, end-to-end CI | CI covers every thermostat type |

Phases 2–4 are built directly in the integration. The card already speaks English and French
(section 7); its translations are reused as is by the integration.
