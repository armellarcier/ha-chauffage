# ha-chauffage

[![Tests](https://github.com/armellarcier/ha-chauffage/actions/workflows/tests.yml/badge.svg)](https://github.com/armellarcier/ha-chauffage/actions/workflows/tests.yml)
![Coverage (integration)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/armellarcier/ha-chauffage/badges/coverage-integration.json)
![Coverage (card)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/armellarcier/ha-chauffage/badges/coverage-card.json)
[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/TRlbXsQ2yu)

**English** · [Français](README.fr.md)

![Editing schedules, an override and the active schedule, the thermostat's more-info dialog, then the history of the measured temperature and a day shown larger](docs/demo.gif)

Weekly heating schedules for Home Assistant thermostats: thermostats without presets, with
presets, or **[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**
(independent project, not affiliated with Versatile Thermostat):

- **schedules** you create, duplicate and name (*Normal*, *Remote work*, *Holidays*,
  *Away*…), each with a 7-day week per thermostat; one is active, switched from the card or by
  automations;
- visual Lovelace editor card (`custom:chauffage-programme-card`): drag time slots, copy / paste
  days, several thermostats per day, open a thermostat's more-info dialog from the schedule, see
  the temperature measured over the last 7 days drawn over each day;
- **temporary overrides**: a setpoint changed by hand becomes temporary (2 h by default),
  shown and adjustable (its end, and its value: a preset or a temperature) on the card and in
  the thermostat's more-info dialog, then the thermostat falls back to its schedule. Going back
  to the slot's preset by hand resumes the schedule at once.

> The project's name is French (*chauffage* = heating); the integration and the card speak
> English and French.

## Installation

From v0.2, ha-chauffage is a **Home Assistant integration** configured from the UI: no YAML to
edit. Version 0.1 was a YAML package; [upgrading](#upgrading-from-the-package-v01) imports its
data automatically.

1. In HACS: ⋮ → *Custom repositories* → `https://github.com/armellarcier/ha-chauffage`, type
   *Integration*; then install **ha-chauffage** and restart Home Assistant.
2. Settings → Devices & services → *Add integration* → **Chauffage**.
3. Add the card to a dashboard (it is served by the integration: no resource to add): *Add card*
   → **Heating schedules**, or in YAML:
   ```yaml
   type: custom:chauffage-programme-card
   thermostats:
     - entity: climate.living_room
       name: Living room
   ```
   The card follows the user's language and formats (12 / 24 h, decimal separator, first day of
   the week); English and French are available, and `language: en` or `language: fr` forces one.
   The thermostats, their names and the other options can also be set from the card's visual
   editor (Edit card); `language` is only set in YAML.

Requires Home Assistant 2025.1 or later. This minimum only rises when a Home Assistant API
requires it, in a minor version announced in the [changelog](CHANGELOG.md); the tests run on it,
on one version per quarter since, on the latest Home Assistant and, every week, on the beta.

### What the integration provides

Vocabulary: a **schedule** is a weekly plan (*Normal*, *Holidays*…) with a **week** per
thermostat, made of **slots**; each slot asks for a **preset** (*Comfort*, *Eco*…); an
**override** is a temporary change on one thermostat ([glossary](docs/glossary.md)).

#### Schedules

- A new installation starts with a single schedule, *Normal*.
- In the card (admins), **+** creates a schedule: empty, or a copy of another one. **⋮** on the
  open tab renames, moves or deletes it.
- Each schedule has a **stable id**, shown in *Rename…*. It never changes, even when the
  schedule is renamed: automations use it.

#### Active schedule

One schedule is active at a time: the **Active schedule** select (`select.chauffage_schedule`).

- From the card: open the schedule's tab, then *Activate*.
- From an automation: the service `chauffage.activate_schedule` and the select's `schedule_id`
  attribute, both with the stable id.

For example, odd and even weeks:

```yaml
triggers:
  - trigger: time
    at: "00:00:00"
conditions:
  - condition: template
    value_template: "{{ now().weekday() == 0 }}"
actions:
  - action: chauffage.activate_schedule
    data:
      schedule: "{{ 'normal' if now().isocalendar().week % 2 == 0 else 'odd_weeks' }}"
```

#### Activation rules

Schedules activated by themselves, without writing an automation: the card's *Rules* view
(admins) holds an ordered list of rules.

- **The first rule that applies wins.** When none does, the default schedule is activated (or,
  without one, the active schedule stays).
- **A rule is a template**, in one of two ways:
  - a template and the schedule it activates while the template is true. True and false are
    read as in a template condition: `true`, `on`, `yes`, `1`…; any other text is false;
  - a template that gives the schedule itself, by its id or its name.
- **Rules are tried as you type them**: each one shows what its template gives now (or its
  error), and whether it applies.
- **A schedule chosen by hand stays** until the outcome of the rules changes.

For example, following the EDF Tempo color of the day, two rules and a default schedule:

| Template | Schedule |
|---|---|
| `{{ is_state('sensor.edf_tempo_color', 'red') }}` | *Away* |
| `{{ is_state('sensor.edf_tempo_color', 'white') }}` | *Eco days* |
| (none is true) | *Normal* (default) |

Or a single rule whose template gives the schedule:

```jinja
{{ {'red': 'away', 'white': 'eco_days'}.get(states('sensor.edf_tempo_color'), 'normal') }}
```

#### Presets

Slots ask for the integration's presets: by default *Comfort* 20 °C, *Eco* 17 °C, *Boost* 21 °C
and *Frost protection* 7 °C.

- **For each thermostat**, a preset is the thermostat's own preset with the same name when it
  has one, otherwise the preset's temperature. This can be changed per thermostat: one of its
  own presets, or a temperature.
- **Set in the card**, *Presets* view (admins): a table with one column per preset, from the
  coldest to the warmest, and one row per thermostat. A column header is the preset (name,
  color, default temperature; add, remove); each cell says what that thermostat does with it:
  automatic, one of its own presets (⟲), or its own temperature (●). A click on a cell opens a
  popover to change it, as for the slots.
- **Temperatures shown**: the table and the legend show each preset's temperature. No standard
  attribute gives the temperature of a thermostat's own preset: the integration remembers the
  setpoint seen while that preset was active.
- **Versatile Thermostat bonus**: its preset temperatures are read directly from its attributes
  (`preset_temperatures` since VTherm 10, `comfort_temp`… before).

#### Sensors and services

Per scheduled thermostat, two sensors, **disabled by default** (enable them on the thermostat's
device page):

- **Schedule**: the preset planned now; attributes `preset_name`, `target`, `next_preset`,
  `next_preset_name`, `next_start`.
- **Override end**: a timestamp, usable as a time trigger.

Services:

- `chauffage.set_override`: a temperature or a preset, for a duration or until a time.
- `chauffage.clear_override`: the thermostat resumes its schedule now.
- `chauffage.activate_schedule`: activates a schedule by its stable id.

#### Options

Settings → Devices & services → Chauffage → *Configure*:

- **Override duration**: 2 h by default.
- **Use the thermostats' presets**: on by default. Off, every thermostat is driven by
  temperatures, all set in the card.

### Upgrading from the package (v0.1)

1. Install the integration (steps 1–2 above) **without removing the package**: the setup
   offers to import its weeks, current overrides and active schedule (the package's "mode"),
   then turns off the package's two automations so that only one scheduler drives the
   thermostats.
2. Check the card and the thermostats. To go back, delete the integration and turn the two
   `automation.chauffage_*` automations back on: the package's data is untouched.
3. Follow the repair shown in Settings: delete `packages/chauffage/` and `www/chauffage/`,
   remove the `extra_module_url` line and the `recorder` exclusions from `configuration.yaml`,
   restart. In your automations, replace `input_select.mode_chauffage` with
   `select.chauffage_schedule`.

Upgrading the integration itself: read the [changelog](CHANGELOG.md) and update from HACS;
stored data is migrated automatically. Going back to an older version is not supported.

### Package installation (v0.1)

The [v0.1.0 release](https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0) is a YAML
package, no longer maintained: unzip its ZIP into the configuration folder and follow the README
of that version.

### Supported thermostats

Any `climate` entity with a target temperature, tested with three kinds:

- **Versatile Thermostat**: presets use its own (`comfort`, `eco`, `boost`, `frost`), whose
  temperatures are set in VTherm; a setpoint changed by hand switches it to preset `none` and
  becomes an override;
- **thermostats with standard presets** (`eco`, `comfort`, `away`, `boost`…): presets use the
  thermostat's own with the same name, temperatures for the others (frost protection, for
  example);
- **thermostats without presets** (such as `generic_thermostat`): presets are temperatures; any
  setpoint changed by someone else becomes an override.

Not supported yet: heat / cool thermostats with a temperature range (`heat_cool`), and devices
that change their setpoint by themselves (they can look like manual changes). A device that keeps
its preset when its setpoint is changed by hand is better set to temperatures (the card's
*Presets* view). See the [roadmap](ROADMAP.md) for groups of thermostats and a calendar of
schedules.

## Repository layout

```
custom_components/chauffage/        the integration (scheduler, entities, services, websocket API)
custom_components/chauffage/frontend/  Lovelace card + block injected into the more-info dialog
dev/compose.yaml, dev/hass/         disposable development HA (Versatile Thermostat + simulated rooms)
dev/sim_rooms/, dev/sim_climate/    dev only: thermal model of the rooms (and a simulated week of
                                    history for a new dev HA), a climate with standard presets
tests/integration/, tests/js/       automated tests (pytest + in-memory HA, node --test + jsdom)
docs/                               glossary, design decisions, use cases and their tests
tests/fixtures/                     stored data in each past format (migration tests)
scripts/                            test.sh, logs.sh, demo.sh
.github/workflows/                  tests (CI), hassfest, HACS checks and releases
```

Development: see [CONTRIBUTING.md](CONTRIBUTING.md).

## How it works

- Data is stored in `.storage/chauffage` (versioned, migrated automatically): schedules, presets,
  weeks (`{climate: {schedule id: [7 days × [[start, preset], …]]}}`), current overrides.
- **Scheduler**: every minute, applies the preset of the slots starting now and resumes the
  schedule of thermostats whose override ends; it realigns every thermostat at startup, when
  a schedule is activated and when weeks are saved. Thermostats with an active override, turned
  off or unavailable are left alone; an unreachable valve does not stop the others.
- **Manual changes**: a setpoint changed by hand (the thermostat switches to preset `none`) or
  a preset picked by a user becomes a temporary override; a user going back to what the slot
  expects ends it instead. Changes made by the integration itself
  (its own context) or by an automation are ignored.
- **Card**: served by the integration and loaded on every page (card + more-info block); it
  talks to the integration over websocket (`chauffage/subscribe`, `chauffage/weeks/save`…);
  a save made from an outdated copy is refused instead of overwriting someone else's changes.
- **History**: the card asks the integration for the measured temperature and the setpoint
  applied over the last 7 days (`chauffage/history`); the integration reads them from HA's
  recorder, keeps only these two values (HA's own history sends every attribute of a thermostat,
  megabytes for a week) and keeps what it read in memory, so the card's refreshes only read the
  last minutes.

Known pitfalls (already handled, covered by tests): ZHA presets are Enums; dates with
microseconds are rejected by Safari; `ha-card` renders asynchronously (popover positioning).

## License

[MIT](LICENSE) © 2026 Armel Larcier
