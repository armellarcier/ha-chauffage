# ha-chauffage

**English** · [Français](README.fr.md)

![Editing schedules, an override and the heating mode, then the thermostat's more-info dialog](docs/demo.gif)

Weekly heating schedules for Home Assistant thermostats: thermostats without presets, with
presets, or **[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**
(independent project, not affiliated with Versatile Thermostat):

- 3 modes (Normal / Away / Holiday — `Normal` / `Absent` / `Vacances`), a 7-day schedule per
  thermostat and per mode;
- visual Lovelace editor card (`custom:chauffage-programme-card`): drag time slots, copy / paste
  days, several thermostats per day, open a thermostat's more-info dialog from the schedule;
- **temporary overrides**: a setpoint changed by hand becomes temporary (2 h by default),
  shown and adjustable on the card and in the thermostat's more-info dialog, then the
  thermostat falls back to its schedule.

> The project's name is French (*chauffage* = heating); the integration and the card speak
> English and French.

## Installation

From v0.2, ha-chauffage is a **Home Assistant integration** configured from the UI: no YAML to
edit. Version 0.1 was a YAML package; [upgrading](#upgrading-from-the-package-v01) imports its
data automatically.

1. In HACS: ⋮ → *Custom repositories* → `https://github.com/armellarcier/ha-chauffage`, type
   *Integration*; then install **ha-chauffage** and restart Home Assistant. (While v0.2 is in
   beta, enable *Show beta versions* on the repository in HACS.)
2. Settings → Devices & services → *Add integration* → **Chauffage**.
3. Add the card to a dashboard (it is served by the integration: no resource to add):
   ```yaml
   type: custom:chauffage-programme-card
   thermostats:
     - entity: climate.living_room
       name: Living room
   ```
   The card follows the user's language and formats (12 / 24 h, decimal separator, first day of
   the week); English and French are available, and `language: en` or `language: fr` forces one.

Requires Home Assistant 2026.9 or later.

### What the integration provides

- **Heating mode** select (`select.chauffage_mode`): switch it from the card (open the
  mode tab, then "Activate") or from any automation (presence, calendar…).
- **Heating levels**: schedules use levels (by default *Comfort* 20 °C, *Eco* 17 °C, *Boost*
  21 °C, *Frost protection* 7 °C), not a thermostat's presets. For each thermostat, a level is
  its preset with the same name when it has one, otherwise the level's temperature; this can
  be changed per thermostat (a preset of its own, or a temperature). **Set in the card**,
  *Levels* view (switch at the top of the card, admins): a table with one column per level and
  one row per thermostat. The column header is the level (name, color; add, remove) and its
  default temperature; each cell says what that thermostat does at that level: automatic, one
  of its presets (⟲), or its own temperature (●).
- The table and the legend show each level's temperature. For a preset, no
  standard attribute gives it: the integration remembers the setpoint seen while that preset was
  active. **Versatile Thermostat bonus**: its preset temperatures are read directly from its
  attributes (`preset_temperatures` since VTherm 10, `comfort_temp`… before), a deliberate extra
  for VTherm users.
- Per scheduled thermostat, two sensors **disabled by default** (enable them on the
  thermostat's device page): **Schedule** (level planned now, next slot in attributes) and
  **Override end** (timestamp, usable as a time trigger).
- Services `chauffage.set_override` (temperature or preset for a duration or until a time) and
  `chauffage.clear_override`.
- Options (Settings → Devices & services → Chauffage → *Configure*), a single form: override
  duration (2 h by default), and *Use the thermostats' presets* (on by default; off, every
  thermostat is driven by temperatures, all set in the card).

### Upgrading from the package (v0.1)

1. Install the integration (steps 1–2 above) **without removing the package**: the setup
   offers to import its schedules, current overrides and active mode, then turns off the
   package's two automations so that only one scheduler drives the thermostats.
2. Check the card and the thermostats. To go back, delete the integration and turn the two
   `automation.chauffage_*` automations back on: the package's data is untouched.
3. Follow the repair shown in Settings: delete `packages/chauffage/` and `www/chauffage/`,
   remove the `extra_module_url` line and the `recorder` exclusions from `configuration.yaml`,
   restart. In your automations, replace `input_select.mode_chauffage` with
   `select.chauffage_mode`.

Upgrading the integration itself: read the [changelog](CHANGELOG.md) and update from HACS;
stored data is migrated automatically. Going back to an older version is not supported.

### Package installation (v0.1)

The [v0.1.0 release](https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0) is a YAML
package: unzip its ZIP into the configuration folder and follow the README of that version.

### Supported thermostats

Any `climate` entity with a target temperature, tested with three kinds:

- **Versatile Thermostat**: levels use its presets (`comfort`, `eco`, `boost`, `frost`), whose
  temperatures are set in VTherm; a setpoint changed by hand switches it to preset `none` and
  becomes an override;
- **thermostats with standard presets** (`eco`, `comfort`, `away`, `boost`…): levels use the
  presets with the same name, temperatures for the others (frost protection, for example);
- **thermostats without presets** (such as `generic_thermostat`): levels are temperatures; any
  setpoint changed by someone else becomes an override.

Not supported yet: heat / cool thermostats with a temperature range (`heat_cool`), and devices
that change their setpoint by themselves (they can look like manual changes). A device that keeps
its preset when its setpoint is changed by hand is better mapped to temperatures (options). See
the [roadmap](ROADMAP.md) for groups of thermostats and user-defined heating modes.

## Repository layout

```
custom_components/chauffage/        the integration (scheduler, entities, services, websocket API)
custom_components/chauffage/frontend/  Lovelace card + block injected into the more-info dialog
packages/chauffage/, www/           the v0.1 package and its card loader (until v0.2.0)
dev/harness.html, dev/*.js          test bench without HA (fake hass, ha-card and dialog)
dev/compose.yaml, dev/hass/         disposable development HA (Versatile Thermostat + simulated rooms)
tests/integration/, tests/js/       automated tests (pytest + in-memory HA, node --test + jsdom)
tests/ha/                           tests of the v0.1 package
tests/fixtures/                     stored data in each past format (migration tests)
scripts/                            test.sh, reload.sh, logs.sh, deploy.sh, demo.sh
.github/workflows/                  tests (CI), hassfest, HACS checks and releases
```

Development: see [CONTRIBUTING.md](CONTRIBUTING.md).

## How it works

- Data is stored in `.storage/chauffage` (versioned, migrated automatically): modes, schedules
  (`{climate: {mode id: [7 days × [[start, preset], …]]}}`), current overrides.
- **Scheduler**: every minute, applies the preset of the slots starting now and resumes the
  schedule of thermostats whose override ends; it realigns every thermostat at startup, when
  the mode changes and when schedules are saved. Thermostats with an active override, turned
  off or unavailable are left alone; an unreachable valve does not stop the others.
- **Manual changes**: a setpoint changed by hand (the thermostat switches to preset `none`) or
  a preset picked by a user becomes a temporary override. Changes made by the integration itself
  (its own context) or by an automation are ignored.
- **Card**: served by the integration and loaded on every page (card + more-info block); it
  talks to the integration over websocket (`chauffage/subscribe`, `chauffage/schedules/save`…);
  a save made from an outdated copy is refused instead of overwriting someone else's changes.

Known pitfalls (already handled, covered by tests): ZHA presets are Enums; dates with
microseconds are rejected by Safari; `ha-card` renders asynchronously (popover positioning).

## License

[MIT](LICENSE) © 2026 Armel Larcier
