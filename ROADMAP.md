# Roadmap

**English** · [Français](ROADMAP.fr.md)

The goal: weekly heating schedules for **any Home Assistant `climate` entity**, set up entirely
from the UI, and eventually listed in HACS by default.

## Done

| Version | What |
|---|---|
| 0.1.0 | First release, as a YAML package (no longer maintained): schedules per thermostat and per mode, the editor card, temporary overrides, versioned data |
| 0.2 (betas) | The **Chauffage integration**: installed from HACS, configured from the UI, data in a versioned `Store` with migrations, mode select, sensors, services, websocket API, card served by the integration, English and French, import of the package's data ([docs/integration-plan.md](docs/integration-plan.md)) |
| 0.3.0 | **Heating levels** for any thermostat with a target temperature (Versatile Thermostat, standard presets, no presets), set in the card's *Levels* view; manual changes judged against what the schedule expects; tests on the three kinds of thermostats and a functional analysis ([docs/use-cases.md](docs/use-cases.md), [docs/phase-2-plan.md](docs/phase-2-plan.md)) |

## Short term

- Move the short-term tasks and the roadmap's steps to GitHub issues.
- Rewrite the demo scenario (`dev/demo/record.mjs`) and re-record `docs/demo.gif`: show the
  presets and the schedules, with three schedules **Normal**, **Vacances**, **Absent**, in this
  order (the order the development HA creates them in).

## Next

### 1. Schedules defined by the user

What were called *modes* (*Normal* / *Away* / *Holiday*, predefined) are **schedules**: named
weekly plans created by the user, one of them active (see [docs/glossary.md](docs/glossary.md)).
This step: create a schedule by duplicating another, rename, delete, reorder, and migrate the
existing modes; a new installation starts with a single schedule. Concept and user stories:
[docs/schedules-plan.md](docs/schedules-plan.md). Predefined modes are also what keeps
ha-chauffage out of the HACS default list.

### 2. Calendar of schedules

A year view, one row per month, with periods (days and times) colored by schedule, like the
weekly view with its slots; a **default schedule** applies outside the periods. It also covers
"activate *Away* until Tuesday" or "until 18:00" without writing an automation.

### 3. One vocabulary

Rename *modes* to *schedules* and *levels* to *presets* everywhere: code, stored data (with a
migration), websocket API, entities where users are not broken, card, docs
([docs/glossary.md](docs/glossary.md)).

### 4. Groups of thermostats

Zones sharing a schedule ("bedrooms", "living areas"), with exceptions per thermostat; overrides
stay per thermostat; the card edits groups. Builds on the schedules (step 1).

### 5. Thermostats that change their setpoint by themselves

Some devices adjust their own setpoint (open window, presence, safety): today it looks like a
manual change and becomes an override. Recognize these adjustments (rules per thermostat or per
integration).

### 6. More thermostats and slots

Heat / cool thermostats with a temperature range (`heat_cool`), an *Off* preset, slots carrying a
temperature directly ("21 °C from 06:30").

### 7. Development environment and CI

Pin the versions of Home Assistant and Versatile Thermostat in the development HA (with a
dependency bot proposing upgrades) and add an end-to-end CI check that starts it, runs the setup
and checks that a schedule is applied.

### 8. Card translations as files

Once the card is bundled: one JSON file per language with ICU MessageFormat (plurals), as in most
Home Assistant cards; more languages through contributions.

### 9. Editing the weeks

- **Undo** (Ctrl+Z, and redo) while editing the weeks in the card, until they are saved.
- **Copy and paste a whole day, all thermostats at once**: one day of every thermostat shown,
  pasted onto another day (today, the clipboard holds one thermostat's day).

## HACS default list

ha-chauffage is installed as a HACS *custom repository* (HACS shows no icon for those; Home
Assistant does, once installed). It will be submitted to the default list (`hacs/default`) once
schedules are no longer predefined (step 1), with a stable release.
