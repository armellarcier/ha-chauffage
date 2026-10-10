# Phase 1: a YAML-free integration — design and plan

Status: **agreed** (see "Decisions" at the end). Target: v0.2.0.
Roadmap context: [ROADMAP.md](../ROADMAP.md), phase 1 ("YAML-free integration").

Goal: replace the package (`packages/chauffage/`) and the `configuration.yaml` lines with a
custom integration installed from HACS and configured from the UI, **with the same behavior**
(VTherm presets, overrides, modes) and an **automatic import** of a package installation.
Heating levels, generic detection and groups (phases 2–4) are not in scope, but the data model
must not block them.

## What the user gets

1. HACS → install "ha-chauffage" → restart.
2. Settings → Devices & services → Add → "Chauffage". If the package is installed, the flow
   offers to **import** its schedules, overrides and active mode.
3. The card is available right away (no resource to add, no `extra_module_url`); the more-info
   block works on every page.
4. A repair issue explains how to remove the package files and lines once the import is done.

## Architecture

```
custom_components/chauffage/
  manifest.json        domain "chauffage", config_flow, dependencies: http, frontend; version
  __init__.py          setup / unload of the config entry; wires the parts below
  const.py
  model.py             pure data classes + (de)serialization — no HA import
  engine.py            pure logic: slot at a given time, what to apply, override end,
                       manual-change decision — no HA import, unit-tested directly
  store.py             persistence (helpers.storage.Store, versioned, migrations)
  runtime.py           the "automation": minute tick, state listeners, service calls
  select.py            select entity: active heating mode
  websocket.py         API for the card (subscribe, save schedules, overrides)
  services.yaml        services for automations (overrides)
  config_flow.py       config flow (+ import from the package) and options flow
  importer.py          reads a package installation (states of the package's entities)
  repairs / issues     "remove the package" issue after an import
  strings.json, translations/en.json, translations/fr.json, icons.json
  frontend/chauffage-card.js   the card, served by the integration
hacs.json
```

### Storage (`.storage/chauffage`)

One `Store(hass, version=1, key="chauffage")`, written with `async_delay_save`. English,
language-neutral keys:

```json
{
  "modes": [{"id": "normal", "name": "Normal"}, {"id": "away", "name": "Absent"}, {"id": "holiday", "name": "Vacances"}],
  "active_mode": "normal",
  "schedules": {
    "climate.salon": {"normal": [[["00:00", "eco"], ["06:30", "comfort"]], "…7 days, Monday first"]}
  },
  "overrides": {
    "climate.salon": {"kind": "temperature", "value": 21.5, "start": "2026-10-12T09:30:00+02:00", "end": "…"}
  },
  "revision": 42
}
```

- **Modes have an id** and a free name: renaming a mode no longer touches the schedules, and
  default names are created in the user's language. Phase 4 (per-group modes) adds a group key.
- **Slots are `[start, preset]` pairs**; phase 2 replaces `preset` by a heating level id
  (a Store migration, version 1 → 2).
- `revision` increases on every change: the card sends the revision it edited, and a save based
  on an older revision is refused (two browsers editing at once no longer overwrite each other).
- Settings that are not data (default override duration, manual preset names) live in the
  config entry **options** (options flow).
- Migrations: `Store` versions with `_async_migrate_func`, each step tested with a fixture of
  the old format (`tests/fixtures/store-v<n>.json`), as for the package data.

### Runtime (replaces the two automations)

- **Applying schedules**: a tick every minute (`async_track_time_change(second=0)`, as today),
  plus a full realignment when the mode changes, schedules are saved, or HA starts.
  `engine.targets(...)` returns the presets to apply; `runtime` calls
  `climate.set_preset_mode` with `continue_on_error` semantics (one unreachable valve does not
  block the others) and a short pause between calls.
- **Manual changes**: `async_track_state_change_event` on the scheduled climates. The
  integration calls services with **its own `Context`**: a change carrying that context (or
  having it as parent) is ours; otherwise the rules of today's template apply (preset `none`
  + new setpoint → temperature override; preset picked by a user → preset override). This is
  more reliable than "`parent_id` is empty" and prepares phase 3.
- **Overrides**: an end timer per override (`async_track_point_in_time`), restored at startup.
- No more template sensors: nothing large in the state machine or the recorder.

### Entities

- `select` **Heating mode** (translation_key `mode`): options = mode names, selecting one sets
  `active_mode`. Replaces `input_select.mode_chauffage` for automations (presence, calendar…).
- Per scheduled thermostat, **disabled by default**, attached to the thermostat's device, created
  and removed with the schedules (no list to maintain):
  - **Schedule** sensor: state = preset planned now (translated enum), attributes = next slot
    and its start time; for dashboards, mobile widgets, history ("why was it cold at 7?");
  - **Override end** sensor (`device_class: timestamp`, empty without override): shown as
    "in 1 h 30" by HA, usable directly as a time trigger ("notify me when it ends").

### API for the card (websocket)

| Command | Purpose |
|---|---|
| `chauffage/subscribe` | full data (modes, active mode, schedules, overrides, revision), then a push on every change |
| `chauffage/schedules/save` | `{schedules, revision}` → refused if the revision is stale |
| `chauffage/override/set` | `{entity_id, override \| null}` (create, extend, remove) |
| `chauffage/mode/set` | active mode (same as the select entity) |

Admin-only commands for writes (`@require_admin`), like firing events today.

### Services (for automations)

`chauffage.set_override` (entity_id, temperature or preset, duration or end),
`chauffage.clear_override` (entity_id). Mode changes use `select.select_option`.

### The card

- Served by the integration: `async_register_static_paths` (`/chauffage/chauffage-card.js`)
  and `frontend.add_extra_js_url` with `?v=<integration version>`: loaded on every page (card
  registration + more-info block), cached until the next version. `chauffage-loader.js`, the
  Lovelace resource and `extra_module_url` disappear.
- Data source: `chauffage/subscribe` instead of the package sensors and events. The editing UI
  is unchanged. Card options `sensor`, `event`, `derog_sensor`, `derog_event`, `mode_entity`
  are removed (no longer needed).
- Translations stay inline (I18N object, no build step) — see decision 3.

### Import from the package

- Detected from the package's entities: `sensor.programmes_chauffage` (schedules + `version`),
  `sensor.derogations_chauffage`, `input_select.mode_chauffage`.
- Package data is migrated to its current version first (data version 1 today; a newer
  version than supported is refused), then converted: modes get ids (`Normal` → `normal`…,
  names kept), slots become pairs, overrides get English keys (`valeur` → `value`, `debut` →
  `start`, `fin` → `end`, `type` `temp` → `temperature`).
- To avoid two schedulers fighting, the import **turns off** the package automations
  (`automation.turn_off`, reversible), then raises a **repair issue** with the removal steps
  (files, `configuration.yaml` lines) and a reminder that `input_select.mode_chauffage` in
  user automations must be replaced by the new select entity.
- Import is only possible while the package is still installed (documented in the upgrade
  notes); tested with fixtures of package data (`tests/fixtures/schedules-v1.json` and an
  overrides fixture).

## Tests

- `engine.py` / `model.py`: plain pytest, no HA (fast, exhaustive).
- Integration: pytest-homeassistant-custom-component with `enable_custom_integrations`; the
  existing behavior tests (`test_schedules.py`, `test_overrides.py`) are **ported** to drive the
  integration instead of the package — they are the specification of the behavior to keep.
- Config flow, options flow, import (fixtures), Store migrations, websocket commands, services.
- Card: the jsdom tests get a fake websocket backend instead of fake sensors.
- CI: `hassfest` and the HACS validation action (done in step 1), and the Python suites run on
  two HA versions: the minimum supported one (2026.9, the author's production) and the latest;
  `hacs.json` then declares that minimum.

## Development environment

- `dev/compose.yaml` mounts `custom_components/chauffage` live; `setup.py` creates the config
  entry through the config flow instead of loading the package.
- A `package` profile keeps the package installed, to test the import end to end.
- Python changes need an HA restart (`docker compose restart homeassistant`); card changes still
  only need a page reload.

## Steps (one PR each, tests green at every step)

1. **Skeleton**: manifest, empty config flow (single instance), `hacs.json`, hassfest + HACS
   checks in CI, dev HA mounting the integration.
2. **Model, engine, Store**: pure logic ported from the package templates, with its tests.
3. **Runtime + select**: schedules applied, overrides and manual detection; behavior tests
   ported from `tests/ha/`.
4. **Websocket API, services, translations** (en / fr `strings.json`).
5. **Card on the integration**: subscribe / save / overrides over websocket, served by the
   integration; loader removed.
6. **Import from the package**: config flow step, package automations turned off, repair
   issue; tested with fixtures.
7. **Docs, demo, release v0.2.0**: README (HACS install, upgrade from 0.1), CONTRIBUTING,
   changelog with the upgrade steps.

The package stays in the repository until v0.2.0 is released, then is removed (users of
v0.1.0 upgrade through the import).

## Decisions

1. **Domain name**: `chauffage`, consistent with the repository name (service names such as
   `chauffage.set_override`, storage key, entity ids).
2. **Per-thermostat entities**: in phase 1 (step 3), disabled by default, see "Entities".
3. **Card build step** (JSON translations + ICU MessageFormat, bundling): later; the inline
   dictionaries stay in phase 1.
4. **Version**: v0.2.0 (breaking change, allowed before 1.0); 1.0 once groups and generic
   thermostats are in.
