# Roadmap

**English** · [Français](ROADMAP.fr.md)

The goal: weekly heating schedules for **any Home Assistant `climate` entity**, set up entirely
from the UI, and eventually listed in HACS by default.

## Done

| Version | What |
|---|---|
| 0.1.0 | First release, as a YAML package (no longer maintained): schedules per thermostat and per mode, the editor card, temporary overrides, versioned data |
| 0.2 (betas) | The **Chauffage integration**: installed from HACS, configured from the UI, data in a versioned `Store` with migrations, mode select, sensors, services, websocket API, card served by the integration, English and French, import of the package's data ([docs/integration-plan.md](docs/integration-plan.md)) |
| 0.3.0 | **Presets** (then called heating levels) for any thermostat with a target temperature (Versatile Thermostat, standard presets, no presets), set in the card's *Levels* view (now *Presets*); manual changes judged against what the schedule expects; tests on the three kinds of thermostats and a functional analysis ([docs/use-cases.md](docs/use-cases.md), [docs/phase-2-plan.md](docs/phase-2-plan.md)) |

## Short term

- Move the short-term tasks and the roadmap's steps to GitHub issues.
- Rewrite the demo scenario (`dev/demo/record.mjs`) and re-record `docs/demo.gif`: show the
  presets and the schedules, with three schedules **Normal**, **Vacances**, **Absent**, in this
  order (the order the development HA creates them in).

## Next

### 1. Schedules defined by the user, one vocabulary

**Done (unreleased, v0.4)**: what were called *modes* (*Normal* / *Away* / *Holiday*,
predefined) are **schedules** the user creates (empty or as a copy), renames, moves and deletes,
with stable ids for automations ([docs/schedules-plan.md](docs/schedules-plan.md)); and one
vocabulary everywhere — schedules, weeks, slots, presets, overrides
([docs/glossary.md](docs/glossary.md)), with a migration of the stored data.

### 2. Calendar of schedules

A year view, one row per month, with periods (days and times) colored by schedule, like the
weekly view with its slots; a **default schedule** applies outside the periods. It also covers
"activate *Away* until Tuesday" or "until 18:00" without writing an automation.

### 3. Groups of thermostats

Zones sharing a schedule ("bedrooms", "living areas"), with exceptions per thermostat; overrides
stay per thermostat; the card edits groups. Builds on the schedules (step 1).

### 4. Thermostats that change their setpoint by themselves

Some devices adjust their own setpoint (open window, presence, safety): today it looks like a
manual change and becomes an override. Recognize these adjustments (rules per thermostat or per
integration).

### 5. More thermostats and slots

Heat / cool thermostats with a temperature range (`heat_cool`), an *Off* preset, slots carrying a
temperature directly ("21 °C from 06:30").

### 6. Development environment and CI

Pin the versions of Home Assistant and Versatile Thermostat in the development HA (with a
dependency bot proposing upgrades) and add an end-to-end CI check that starts it, runs the setup
and checks that a schedule is applied.

### 7. Card translations as files

Once the card is bundled: one JSON file per language with ICU MessageFormat (plurals), as in most
Home Assistant cards; more languages through contributions.

### 8. Editing the weeks

- **Undo** (Ctrl+Z, and redo) while editing the weeks in the card, until they are saved.
- **Copy and paste a whole day, all thermostats at once**: one day of every thermostat shown,
  pasted onto another day (today, the clipboard holds one thermostat's day).

## HACS default list

ha-chauffage is installed as a HACS *custom repository* (HACS shows no icon for those; Home
Assistant does, once installed). It will be submitted to the default list (`hacs/default`) once
schedules are no longer predefined (step 1), with a stable release.
