# Roadmap

**English** · [Français](ROADMAP.fr.md)

The goal: weekly heating schedules for **any Home Assistant `climate` entity**, set up entirely
from the UI, listed in HACS by default. Why things are the way they are:
[docs/decisions.md](docs/decisions.md); what changed in each version: [CHANGELOG.md](CHANGELOG.md).

This page holds the vision and the ideas retained, in order. Requests and ideas are discussed in
[GitHub issues](https://github.com/armellarcier/ha-chauffage/issues); an item retained links to
its issue when it has one.

## Done

| Version | What |
|---|---|
| 0.1.0 | First release, as a YAML package (no longer maintained): schedules per thermostat, the editor card, temporary overrides, versioned data |
| 0.2 (betas) | The **Chauffage integration**: installed from HACS, configured from the UI, data in a versioned `Store`, select entity, sensors, services, websocket API, card served by the integration, English and French, import of the package's data |
| 0.3.0 | **Presets** (then called heating levels) for any thermostat with a target temperature (Versatile Thermostat, standard presets, no presets), set in the card; manual changes judged against what the schedule expects; tests on the three kinds of thermostats; functional analysis ([docs/use-cases.md](docs/use-cases.md)) |
| 0.4.0 | **Schedules defined by the user** (created empty or as a copy, renamed, moved, deleted; stable ids for automations) and **one vocabulary** everywhere ([docs/glossary.md](docs/glossary.md)) |

### Activation rules

Done in 0.5 (in beta, [#1](https://github.com/armellarcier/ha-chauffage/issues/1)): schedules
activated by themselves, from an ordered list of rules written as templates, the first that
applies winning, a default schedule otherwise. See the [README](README.md#activation-rules).

## Short term

1. **HACS default list**: submitted with 0.4.0
   ([hacs/default#11827](https://github.com/hacs/default/pull/11827), every check passing),
   waiting for the HACS team's review (it can take months). Until then ha-chauffage is a HACS
   *custom repository* (HACS shows no icon for those; Home Assistant does, once installed). The
   repository must keep a single `manifest.json` (the development HA's simulated climate uses
   `manifest.dev.json`).
2. **Scheduled thermostats**
   ([#27](https://github.com/armellarcier/ha-chauffage/issues/27)): the integration keeps the
   list of thermostats it drives, the cards only show them (several cards, a thermostat in
   several). A thermostat is paused without losing anything (a *Scheduling* switch per
   thermostat), a repair proposes to pause it when no card shows it any more, a renamed
   `climate` is followed. Just as simple: adding a thermostat in a card schedules it. See
   [docs/decisions.md](docs/decisions.md#scheduled-thermostats).

## Next

### Calendar of schedules

Built on the [activation rules](#activation-rules). A year view, one row per month, with periods
(days and times) colored by schedule, like the weekly view with its slots. Its periods are rules
too. It also covers "activate *Away* until Tuesday" or "until 18:00".

### Groups of thermostats

Zones sharing their weeks ("bedrooms", "living areas"), with exceptions per thermostat; the
mapping of presets set per group (*Comfort* = 21 °C in the living room, 19 °C in the bedrooms);
an active schedule per group (a guest room on its own schedule while the rest is *Normal*);
overrides stay per thermostat; the card edits groups.

### Heating anticipation

Reach the temperature of a slot at its start time instead of starting to heat then: learn how
fast each room heats (from the history of the measured temperature and the setpoints applied,
and the outdoor temperature), then suggest earlier starts in the card or start heating early by
itself. Until then the card shows the measured temperature and the setpoint applied over the
week (the *History* button), for the user to judge.

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

- **History of the measured temperature** (in 0.5.0-beta.1: the last 7 days drawn over the week):
  browse earlier weeks, and show it in the thermostat's more-info dialog too.
- A build step (bundling), then the translations as files: one JSON file per language with ICU
  MessageFormat (plurals), as in most Home Assistant cards; more languages through contributions.

### Development environment and CI

- Pin the versions of Home Assistant and Versatile Thermostat in the development HA, with a
  dependency bot proposing upgrades; the setup walks through VTherm's config flow field by field
  and breaks when VTherm changes it (`docker compose logs setup` shows the step).
- An end-to-end check in CI that starts the development HA, runs the setup and checks that a
  schedule is applied, and the card works in the real frontend of the minimum and latest Home
  Assistant ([#6](https://github.com/armellarcier/ha-chauffage/issues/6)).
- Simulated thermostats for the kinds still missing (heat / cool, a thermostat that keeps its
  preset on a manual setpoint), in the tests and the development HA.

## Version 1.0

Once groups of thermostats are in and every kind of thermostat above is supported.
