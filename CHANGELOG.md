# Changelog

All notable changes to ha-chauffage. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/) (before 1.0, a minor version may change the
installation or the data; stored data is always migrated automatically).

Each entry says whether the release **migrates stored data** and what to do when upgrading.

## [Unreleased]

**Scheduled thermostats**, first part ([#27](https://github.com/armellarcier/ha-chauffage/issues/27)).
**Migrates stored data** (version 5): the weeks, values of the presets and learned temperatures
of each thermostat are kept together. Nothing to do when upgrading; nothing changes for the
thermostats. A thermostat removed from the card earlier, of which only values of the presets were
left, keeps them and is still not scheduled, until it gets weeks again. A scheduled thermostat
gets a week in every schedule: eco all week in those it had none in, what the card showed.

### Added

- A thermostat can be **paused**: Chauffage keeps its weeks but no longer drives it, until it is
  resumed (realigned at once). A *Scheduling* switch per thermostat, in the settings of its
  device page, pauses and resumes it, from an automation too. No override can be set on a paused
  thermostat; its sensors are unavailable. The card shows a paused thermostat (on its chip, a
  notice with *Resume*, its rows dimmed) and pauses or resumes it from a row's menu; its weeks
  stay editable. The more-info block says it is paused.
- A *Thermostats* view in the card: every thermostat Chauffage schedules, paused or not, and the
  ones no longer in this card, to pause, resume or **forget** (after a confirmation): a forgotten
  thermostat's data is dropped and it is no longer driven. A thermostat this card shows cannot be
  forgotten from it. The card editor says when a thermostat removed from the card is still
  scheduled, and where to pause or forget it.
- A **repair** (Settings → Repairs) proposes to forget a scheduled thermostat whose entity is gone
  from Home Assistant, or to keep it; it closes by itself when an entity is made again with that id.
- A thermostat **renamed** in Home Assistant (its entity id) keeps its schedule, override and
  entities. A card whose configuration still holds the former id shows a notice with the new
  one, and the card editor offers to use it.

- Saving the weeks only sends the thermostats changed, each against its own revision: two cards
  (or two people) editing different thermostats no longer refuse each other's save.

### Fixed

- Reloading the integration after Home Assistant has started no longer logs "Unable to remove
  unknown job listener".
- The cards open in the browser keep receiving the integration's data after it is reloaded
  (options changed): they no longer need the page to be reloaded.

### Changed

- Saving the weeks no longer unschedules the thermostats a card does not send: a thermostat
  removed from a card, or shown by another card, keeps its schedule (#27). Stopping it is done
  by pausing or forgetting it.
- A scheduled thermostat has a week in every schedule (eco all week where none was saved, as the
  card showed it): activating a schedule it had no week in now drives it, instead of leaving it
  as it was. Deleting a schedule no longer unschedules a thermostat whose only week it held.

## [0.6.0-beta.2] - 2026-10-22

**A temporary setpoint set from the card**, and what follows an override shown
([#19](https://github.com/armellarcier/ha-chauffage/issues/19)). Does not migrate stored data.

### Added

- A temporary setpoint can be **set from the card** (the menu of today's row, *Temporary
  setpoint…*) and from the thermostat's more-info dialog, with no override yet: a preset or a
  temperature, for the override duration. That is the way to keep the current preset past the
  next slots (#19).
- The override popover and the more-info dialog say what the thermostat goes back to at the
  override's end: "then Eco (schedule)".

### Changed

- On a thermostat driven by temperatures, editing the temperature of the preset it is on (a
  VTherm preset picked by hand) is no longer an override, as when the slot expects a preset.

## [0.6.0-beta.1] - 2026-10-22

**Overrides: back to the schedule by hand, and their value changed from the card**
([#19](https://github.com/armellarcier/ha-chauffage/issues/19)). Does not migrate stored data;
overrides in progress are kept.

### Added

- The override's **value** can be changed in the card's override popover and in the
  thermostat's more-info dialog: one of the presets, or a temperature, until the same end. The
  thermostat follows. This is the way to keep the current preset past the next slots (#19).

### Fixed

- Going back to the slot's preset on the thermostat during an override no longer creates an
  override to that same preset ("Comfort in Comfort"): it ends the override and the thermostat
  follows its schedule again (#19). Turning the thermostat's knob back to what the slot gives
  also ends it, on every kind of thermostat: the slot's temperature, or the temperature of the
  slot's preset on this thermostat (the thermostat then gets its preset back). The override
  was kept, showing the old setpoint and holding back the next slots until its end.
- Changing an override's value through the websocket API (`chauffage/override/set`) now sets
  the thermostat to it, or answers `thermostat_failed`; it was only recorded.

### Upgrading

- Picking the slot's preset by hand during an override now **resumes the schedule**. To keep
  that preset past the next slots, change the override's value in the card's override popover
  or the thermostat's more-info dialog (or use the `chauffage.set_override` service), then
  extend it.

## [0.5.1] - 2026-10-21

**A visual editor for the card**, and a better place in the *Add card* dialog. Does not migrate
stored data. Home Assistant 2025.1 or later.

### Added

- The card has a **visual editor** (dashboard → Edit card), laid out like Home Assistant's own
  cards: the thermostats (reordered by dragging), an optional name for each one (from Home
  Assistant 2025.11, HA's name field: text, or pieces such as the area and the device), showing
  them all at first, and the time step, without writing YAML. Options written in YAML that it
  does not show (such as `language`) are kept. In a sections view, the *Layout* tab can now
  resize the card (#10).
- Names made of pieces are shown as Home Assistant's own cards show them (from 2025.10).
- In the *Add card* dialog: a live preview (every thermostat, the first one shown), a link to
  the documentation, the name in the language of Home Assistant, the card suggested for a
  thermostat (*By entity* tab, Home Assistant 2026.6 or later), and a new card starts with the
  thermostats that already have a schedule (all of them before any schedule).

### Fixed

- *Rules* view: **Save** is only enabled when the rules have changed, and is disabled again
  once they are saved, so it is clear whether they are saved (#16).

### Upgrading

- From 0.5.0: update from HACS, restart HA, then reload the browser page. Cards written in YAML
  keep working as they are; `language` is still read from YAML but no longer offered in the
  visual editor.

## [0.5.0] - 2026-10-19

**History, activation rules, and a card easier to read**: it gathers 0.5.0-beta.1 (the history
of the measured temperature) and 0.5.0-beta.2 (activation rules), below, and the changes here.
**Migrates stored data** automatically (v3 → v4, in 0.5.0-beta.2: no rules yet, nothing
changes). Home Assistant 2025.1 or later.

### Added

- A slot can be **moved whole** by dragging it in the card: its start and end move together,
  its neighbors adapt. By touch, tap the slot first, then slide it.

### Changed

- **Home Assistant 2025.1 or later** (instead of 2026.9): the integration and the card are
  tested on it. The minimum now only rises when a Home Assistant API requires it; the tests run
  on it, on one version per quarter since, on the latest release and, every week, on the beta.
- *Presets* view: a cell is edited in a **popover** next to it, like a slot, instead of a form
  at the bottom of the card. The presets are shown **from the coldest to the warmest** (table,
  legend, slot popover). When "automatic" means the thermostat's own preset, it is the first
  choice of the list of its presets ("Auto (Comfort)"), instead of a separate choice that
  repeated it.
- **Today stands out** in the card, to find it at a glance among the days and thermostats: its
  whole row is tinted in the accent color, with a border on each side, thicker on the left
  ([#12](https://github.com/armellarcier/ha-chauffage/issues/12)).
- The current time is **one line across all the thermostats** of today, even from three
  thermostats on (it was broken between the bars), with a triangle at each end, like a playhead,
  with a light shadow.
- The names of the days and of the thermostats are aligned against their bars (to the right),
  and the column of the names is only as wide as the longest name shown (100 px at most, 60 px
  on a phone).
- Before Home Assistant 2025.8, the thermostat's sensors are attached to its device the way
  older versions allow it: the device also lists the Chauffage integration.

### Upgrading

- From 0.4.x or a 0.5.0 beta: update from HACS, restart HA, then reload the browser page. The
  stored data is migrated by itself; nothing else to do.

## [0.5.0-beta.2] - 2026-10-14

**Activation rules**: schedules activated by themselves
([#1](https://github.com/armellarcier/ha-chauffage/issues/1)). **Migrates stored data** (v3 → v4:
no rules yet, nothing changes).

### Added

- **Rules** view in the card (admins): an ordered list of rules, the first that applies wins, a
  default schedule otherwise (or the active schedule stays). A rule is a template and the
  schedule it activates while the template is true (read as HA's template conditions read it),
  or a template that gives the schedule itself, by its id or its name. For example, following
  the EDF Tempo color of the day: `{{ is_state('sensor.edf_tempo_color', 'red') }}` → *Away*.
  Templates are tracked by Home Assistant (the entities they read, and the time with `now()`); a
  template that fails does not apply.
- Rules are **tried as they are typed**: each one shows what its template gives now (or its
  error, or that its text is neither true nor false, or names no schedule) and whether it
  applies, updated when its entities change; the view says which schedule the saved rules give.
- A schedule chosen by hand (card, select, automation) stays until the outcome of the rules
  changes, even across a restart.
- Websocket `chauffage/rules/set` and `chauffage/rules/preview` (admins); the subscription also
  sends `rules`, `default_schedule` and `rule_results`.

### Changed

- A schedule used by the rules cannot be deleted.

### Upgrading

- Update from HACS, restart HA, then reload the browser page.

## [0.5.0-beta.1] - 2026-10-14

**History of the measured temperature**, drawn over each day of the week with the setpoint
applied. Nothing changes in the stored data.

### Added

- **History** button in the card: the temperature measured over the last 7 days, drawn over
  each day of the week (Monday shows last Monday, today until now), with the setpoint the
  thermostat actually applied (a yellow line over it); a slot's tooltip gives the temperatures
  measured and the setpoints applied during it.
  Read from Home Assistant's recorder by the integration (websocket `chauffage/history`: only
  the two temperatures, the days already read kept in memory), only while the history is shown;
  then every 5 minutes, only what is new.
- A day can be shown larger, from its row menu (or by clicking the name of the day when one
  thermostat is shown): a scale in degrees, and the time, measured temperature and setpoint
  under the mouse, or along a finger sliding on the bar on a phone.

### Upgrading

- Update from HACS, restart HA, then reload the browser page (until HA is restarted, the card
  reads HA's own history, much slower).

## [0.4.1] - 2026-10-14

**Fix: the card missing after a reload.** Nothing changes in the stored data.

### Fixed

- "Custom element doesn't exist: chauffage-programme-card" after a reload, once the card was
  in the browser cache: it was registered before HA's frontend replaced the custom element
  registry ([#2](https://github.com/armellarcier/ha-chauffage/issues/2)). Remove a Lovelace
  resource added as a workaround (it is harmless if kept).

### Upgrading

- From 0.4.0: update from HACS, restart HA, then reload the browser page.

## [0.4.0] - 2026-10-11

**Schedules defined by the user, one vocabulary**: it gathers 0.4.0-beta.1 (below) and this
fix. **Stored data: migrated automatically.** **Breaking** for automations: an entity id and
sensor attributes are renamed (see "Upgrading" in 0.4.0-beta.1).

### Fixed

- A schedule name being typed in the card's "+" or "⋮" menu was erased when the card redrew
  itself (every 30 s during an override), and the name field did not get the focus.

### Upgrading

- From 0.3.0: update from HACS and restart, then follow "Upgrading" in 0.4.0-beta.1
  (`select.chauffage_schedule`, `chauffage.activate_schedule`, `next_preset`…).
- From 0.4.0-beta.1: update from HACS and restart; nothing else changes.

## [0.4.0-beta.1] - 2026-10-11

**Schedules defined by the user, one vocabulary**: what were the three fixed modes are schedules
you create, name, duplicate and delete; modes are now called schedules and heating levels
presets, everywhere ([glossary](docs/glossary.md)). **Stored data: migrated automatically**
(same names, ids and contents). **Breaking**: an entity id and sensor attributes are renamed
(see "Upgrading").

### Added

- In the card, **+** opens a menu to create a schedule, empty (eco all week) or a copy of
  another one; **⋮** on the open tab opens a menu to rename it (showing its id), move it, or
  delete it after a confirmation (not the active one). Unsaved edits of the weeks are saved
  first. Admins only.
- Every schedule has a **stable id**, which does not change when it is renamed, for automations:
  service `chauffage.activate_schedule`, attribute `schedule_id` of the select entity.

### Changed

- A new installation starts with a single schedule, *Normal* (instead of three modes).
- One vocabulary: *schedule* (formerly mode), *week*, *slot*, *preset* (formerly level; French:
  *préréglage*), *override*. The card's *Levels* view is now *Presets*.
- The select entity is now **`select.chauffage_schedule`** (formerly `select.chauffage_mode`),
  named *Active schedule*.
- The **Schedule** sensors' attributes `level_name`, `next_level`, `next_level_name` are now
  `preset_name`, `next_preset`, `next_preset_name`.
- Websocket API (used by the card): `chauffage/weeks/save`, `chauffage/schedule/activate`,
  `chauffage/schedules/set`, `chauffage/presets/set`; the subscription sends `schedules`,
  `active_schedule`, `presets`, `weeks`.

### Fixed

- The thermostat's more-info block showed the active schedule's id instead of its name.
- After an update from HACS, until Home Assistant restarts, the card asks for a restart instead
  of breaking (its file is already the new one, the running integration is still the former).

### Upgrading

- Update from HACS and restart: the stored data is migrated (version 3), the select entity
  becomes `select.chauffage_schedule` (unless you gave it another id). In your automations,
  replace `select.chauffage_mode` with `select.chauffage_schedule` (or use
  `chauffage.activate_schedule` with the schedule's id), and the sensors' `next_level`,
  `level_name`, `next_level_name` attributes with `next_preset`, `preset_name`,
  `next_preset_name`.

## [0.3.0] - 2026-10-11

First stable version of the **Chauffage integration**, installed from HACS and configured from
the UI, with heating levels for any thermostat: it gathers 0.2.0-beta.1 to 0.3.0-beta.1 (below).
**Stored data: imported from the v0.1 package, or migrated from a beta.**

### Removed

- The v0.1 YAML package (`packages/chauffage/`, `www/chauffage-loader.js`) is no longer
  distributed or maintained: the integration replaces it and imports its data. The card no
  longer reads the package's sensors; without the integration, it says so.
- The release ZIP now holds `custom_components/chauffage/` (installation without HACS).

### Upgrading

- From 0.3.0-beta.1: update from HACS and restart; nothing else changes.
- From an earlier beta: see the "Upgrading" notes of 0.3.0-beta.1.
- From the v0.1 package: follow "Upgrading" in 0.2.0-beta.1 (install the integration without
  removing the package, add it, then follow the repair to remove the package).

## [0.3.0-beta.1] - 2026-10-11

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

### Fixed

- A thermostat turned back on, or back online after being unavailable, gets its level at once
  (it waited for the next slot, sometimes hours).
- A command a valve did not receive (Zigbee `NWK_NO_ROUTE`…) is sent again every minute until
  delivered (it waited for the next slot).
- A slot starting during a minute the scheduler missed (HA busy) or in the hour skipped by the
  change to summer time is applied late instead of never.

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

[Unreleased]: https://github.com/armellarcier/ha-chauffage/compare/v0.6.0-beta.2...HEAD
[0.6.0-beta.2]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.6.0-beta.2
[0.6.0-beta.1]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.6.0-beta.1
[0.5.1]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.5.1
[0.5.0]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.5.0
[0.5.0-beta.2]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.5.0-beta.2
[0.5.0-beta.1]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.5.0-beta.1
[0.4.1]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.4.1
[0.4.0]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.4.0
[0.4.0-beta.1]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.4.0-beta.1
[0.3.0]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.3.0
[0.3.0-beta.1]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.3.0-beta.1
[0.2.0-beta.3]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.2.0-beta.3
[0.2.0-beta.2]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.2.0-beta.2
[0.2.0-beta.1]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.2.0-beta.1
[0.1.0]: https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0
