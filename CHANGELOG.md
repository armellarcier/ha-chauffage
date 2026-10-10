# Changelog

All notable changes to ha-chauffage. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/) (before 1.0, a minor version may change the
installation or the data; stored data is always migrated automatically).

Each entry says whether the release **migrates stored data** and what to do when upgrading.

## [Unreleased]

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

[Unreleased]: https://github.com/armellarcier/ha-chauffage/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0
