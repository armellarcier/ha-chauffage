# Changelog

All notable changes to ha-chauffage. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/) (before 1.0, a minor version may change the
installation or the data; stored data is always migrated automatically).

Each entry says whether the release **migrates stored data** and what to do when upgrading.

## [Unreleased]

**Heating levels**: ha-chauffage works with any thermostat that has a target temperature, not
only Versatile Thermostat. **Stored data: migrated automatically** (nothing changes for
existing schedules).

### Added

- Heating levels (name, color, default temperature): by default *Comfort* 20 °C, *Eco* 17 °C,
  *Boost* 21 °C, *Frost protection* 7 °C. For each thermostat, a level is its preset with the
  same name, otherwise the level's temperature (within the thermostat's limits and step).
- Levels are set in the card's *Levels* view (Schedule | Levels switch at the top, admins
  only): a table with one column per level (name, color, default temperature; add, remove — a
  level used in schedules is replaced by another one) and one row per thermostat, each cell
  saying what that thermostat does at that level (automatic, one of its presets, or its own
  temperature).
- Options: a single form with the override duration and *Use the thermostats' presets* (on by
  default; off, every thermostat is driven by temperatures).
- Preset temperatures in the legend: learned while each preset is active (no standard attribute
  gives them); read directly from Versatile Thermostat's attributes (`comfort_temp`…).
- The card shows the levels, their colors, and what they mean for the displayed thermostat.
- Manual changes on thermostats driven by temperature: any setpoint set by someone else becomes
  an override; the thermostat reaching the expected temperature does not.

### Changed

- The **Schedule** sensor's state is a level id; its attributes are `level_name`, `target`,
  `next_level`, `next_level_name` and `next_start` (instead of `next_preset`).

### Upgrading

- Update from HACS and restart: the stored data is migrated (levels created with the ids of
  the former presets), schedules and thermostats behave as before. Automations reading the
  Schedule sensor's `next_preset` attribute must use `next_level`.

## [0.2.0-beta.3] - 2026-10-10

### Changed

- The safety-mode handling added in 0.2.0-beta.2 is removed: Versatile Thermostat keeps the
  requested preset during safety mode and returns to it by itself, so the usual rules are right
  (no override when it returns to the scheduled preset). With 0.2.0-beta.2, a preset or setpoint
  chosen by a user during safety mode was overwritten by the schedule; it is an override again.

## [0.2.0-beta.2] - 2026-10-10

### Fixed

- A thermostat leaving its own mode (Versatile Thermostat safety mode, after its temperature
  sensor stopped reporting) was taken for a manual change: an override was created and the
  schedule was not applied again. It now resumes its schedule (integration); the package no
  longer creates the override.

## [0.2.0-beta.1] - 2026-10-10

ha-chauffage becomes a Home Assistant integration, installed from HACS and configured from the
UI: no YAML to edit. **Stored data: imported from the package** (the package's own data is not
modified).

### Added

- `Chauffage` integration (`custom_components/chauffage`): the scheduler, data in
  `.storage/chauffage` (versioned), config flow and options flow (override duration).
- `select.chauffage_mode` to change the heating mode (replaces
  `input_select.mode_chauffage`).
- Per scheduled thermostat, **Schedule** and **Override end** sensors, disabled by default and
  attached to the thermostat's device.
- Services `chauffage.set_override` and `chauffage.clear_override`.
- The card is served by the integration and loaded on every page: no Lovelace resource and no
  `extra_module_url`. Two editors can no longer overwrite each other: a save made from an
  outdated copy is refused.
- Integration texts in English and French; tested on Home Assistant 2026.9 (minimum) and the
  latest version.

### Changed

- Changes made by the scheduler are recognized by its own context (instead of "not made by an
  automation"), which avoids mistaking a thermostat's answer for a manual change.

### Upgrading

- From the package (v0.1): install the integration from HACS **without removing the
  package**, then add it in Settings → Devices & services. Schedules, current overrides and the
  active mode are imported and the package's two automations are turned off; a repair then
  lists the files and lines to remove. Replace `input_select.mode_chauffage` with
  `select.chauffage_mode` in your automations. To go back: delete the integration and
  turn the two automations back on.

## [0.1.0] - 2026-10-10

First release. Installation: unzip `ha-chauffage-v0.1.0.zip` into the Home Assistant
configuration folder and add the `configuration.yaml` lines given in the README.

### Added

- Weekly heating schedules for Versatile Thermostat thermostats: one 7-day schedule per
  thermostat and per mode (`Normal` / `Absent` / `Vacances`), applied every minute by an
  automation; unreachable or switched-off thermostats are handled.
- `chauffage-programme-card`: visual schedule editor (several thermostats per day, drag to
  move slots, copy / paste of days and weeks, active mode switching).
- Temporary overrides: a manual setpoint or preset change lasts 2 hours, is shown on the
  schedule, can be extended or removed, then the thermostat resumes its schedule.
- Schedule and override block in the thermostat's more-info dialog.
- English and French UI following the user's Home Assistant profile (language, 12 / 24 h
  clock, number format, first day of the week).
- Stored schedules carry a schema version (`version` attribute of
  `sensor.programmes_chauffage`); the card migrates older data automatically and keeps the
  previous data (`previous` attribute).

### Upgrading

- From a pre-release installation: copy the new files and reload. The existing schedules are
  version 1, the current format: nothing is migrated.

[Unreleased]: https://github.com/armellarcier/ha-chauffage/compare/v0.2.0-beta.3...HEAD
[0.2.0-beta.3]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.2.0-beta.3
[0.2.0-beta.2]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.2.0-beta.2
[0.2.0-beta.1]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.2.0-beta.1
[0.1.0]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0
