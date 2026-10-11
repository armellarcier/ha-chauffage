# Roadmap

**English** · [Français](ROADMAP.fr.md)

The goal: weekly heating schedules for **any Home Assistant `climate` entity**, set up entirely
from the UI, listed in HACS by default. Why things are the way they are:
[docs/decisions.md](docs/decisions.md); what changed in each version: [CHANGELOG.md](CHANGELOG.md).

## Done

| Version | What |
|---|---|
| 0.1.0 | First release, as a YAML package (no longer maintained): schedules per thermostat, the editor card, temporary overrides, versioned data |
| 0.2 (betas) | The **Chauffage integration**: installed from HACS, configured from the UI, data in a versioned `Store`, select entity, sensors, services, websocket API, card served by the integration, English and French, import of the package's data |
| 0.3.0 | **Presets** (then called heating levels) for any thermostat with a target temperature (Versatile Thermostat, standard presets, no presets), set in the card; manual changes judged against what the schedule expects; tests on the three kinds of thermostats; functional analysis ([docs/use-cases.md](docs/use-cases.md)) |
| 0.4.0 (beta) | **Schedules defined by the user** (created empty or as a copy, renamed, moved, deleted; stable ids for automations) and **one vocabulary** everywhere ([docs/glossary.md](docs/glossary.md)) |

## Short term

1. Run 0.4.0-beta.1 on a real installation (the author's) for a few days, then release **0.4.0**.
2. Submit ha-chauffage to the **HACS default list** (`hacs/default`) with 0.4.0: it works with
   any `climate` entity and nothing is predefined anymore. Until then it is a HACS *custom
   repository* (HACS shows no icon for those; Home Assistant does, once installed).
3. Rewrite the demo scenario (`dev/demo/record.mjs`) and re-record `docs/demo.gif`: show the
   presets and the schedules, with three schedules **Normal**, **Vacances**, **Absent**, in this
   order (the order the development HA creates them in).
4. Move the roadmap's items to **GitHub issues** (this page then summarizes them).

## Next

### Calendar of schedules

A year view, one row per month, with periods (days and times) colored by schedule, like the
weekly view with its slots; a **default schedule** applies outside the periods. It also covers
"activate *Away* until Tuesday" or "until 18:00" without writing an automation.

### Groups of thermostats

Zones sharing their weeks ("bedrooms", "living areas"), with exceptions per thermostat; the
mapping of presets set per group (*Comfort* = 21 °C in the living room, 19 °C in the bedrooms);
an active schedule per group (a guest room on its own schedule while the rest is *Normal*);
overrides stay per thermostat; the card edits groups.

### Thermostats that change their setpoint by themselves

Some devices adjust their own setpoint (open window, presence, safety): today it looks like a
manual change and becomes an override. Recognize these adjustments (rules per thermostat or per
integration).

### More thermostats and slots

- Heat / cool thermostats with a temperature range (`heat_cool`: `target_temp_low` /
  `target_temp_high`).
- An *Off* preset (`hvac_mode: off`).
- Slots carrying a temperature directly ("21 °C from 06:30"), without a named preset.

### Editing the weeks

- **Undo** (Ctrl+Z, and redo) while editing the weeks in the card, until they are saved.
- **Copy and paste a whole day, all thermostats at once**: one day of every thermostat shown,
  pasted onto another day (today, the clipboard holds one thermostat's day).

### Card

- A build step (bundling), then the translations as files: one JSON file per language with ICU
  MessageFormat (plurals), as in most Home Assistant cards; more languages through contributions.

### Development environment and CI

- Pin the versions of Home Assistant and Versatile Thermostat in the development HA, with a
  dependency bot proposing upgrades; the setup walks through VTherm's config flow field by field
  and breaks when VTherm changes it (`docker compose logs setup` shows the step).
- An end-to-end check in CI that starts the development HA, runs the setup and checks that a
  schedule is applied.
- Simulated thermostats for the kinds still missing (heat / cool, a thermostat that keeps its
  preset on a manual setpoint), in the tests and the development HA.

## Version 1.0

Once groups of thermostats are in and every kind of thermostat above is supported.
