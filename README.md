# ha-chauffage

**English** · [Français](README.fr.md)

![Editing schedules, an override and the heating mode, then the thermostat's more-info dialog](docs/demo.gif)

Weekly heating schedules for Home Assistant, for preset-based thermostats such as
**[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**
(independent project, not affiliated with Versatile Thermostat):

- 3 modes (Normal / Away / Holiday — `Normal` / `Absent` / `Vacances`), a 7-day schedule per
  thermostat and per mode;
- visual Lovelace editor card (`custom:chauffage-programme-card`): drag time slots, copy / paste
  days, several thermostats per day, open a thermostat's more-info dialog from the schedule;
- **temporary overrides**: a setpoint changed by hand becomes temporary (2 h by default),
  shown and adjustable on the card and in the thermostat's more-info dialog, then the
  thermostat falls back to its schedule.

> The project's name and entities are in French (*chauffage* = heating); the card speaks
> English and French.

## Installation

1. Download `ha-chauffage-vX.Y.Z.zip` from the [latest release](https://github.com/armellarcier/ha-chauffage/releases/latest)
   and unzip it into the Home Assistant configuration folder (`<config>`): it contains
   `www/chauffage/` and `packages/chauffage/`. From a clone of the repository, copy `www/*` to
   `<config>/www/chauffage/` and `packages/chauffage/*` to `<config>/packages/chauffage/`
   (or run `scripts/deploy.sh <config>`).
2. In `configuration.yaml`:
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   frontend:
     extra_module_url:
       - /local/chauffage/chauffage-loader.js
   recorder:
     exclude:
       entities:
         - sensor.programmes_chauffage
         - sensor.derogations_chauffage
         - sensor.suivi_vannes_chauffage
   ```
3. Restart Home Assistant, then add the card:
   ```yaml
   type: custom:chauffage-programme-card
   thermostats:
     - entity: climate.living_room
       name: Living room
   ```
   The card follows the user's language and formats (12 / 24 h, decimal separator, first day of
   the week); English and French are available, and `language: en` or `language: fr` forces one.

**Upgrading**: read the [changelog](CHANGELOG.md), replace the files, then reload the
automations and template entities (or restart). Stored schedules are migrated automatically when
an administrator opens Home Assistant; the data before the migration is kept in the `previous`
attribute of `sensor.programmes_chauffage`. Going back to an older version is not supported.

The active mode is `input_select.mode_chauffage`: switch it from the card (open the mode tab,
then "Activer") or from any automation (presence, calendar…).

### Supported thermostats

The schedule applies **presets** (`comfort`, `eco`, `boost`, `frost`), and manual changes are
detected because the thermostat switches to preset `none` when its setpoint is changed by hand.
This is how **Versatile Thermostat** behaves, and it is the tested setup. Thermostats without
these presets are not supported yet.

The Versatile Thermostat dependency is **temporary**: the goal is to support any `climate` entity,
with groups of thermostats, user-defined heating modes, and a UI in your language. See the
[roadmap](ROADMAP.md).

## Repository layout

```
packages/chauffage/chauffage.yaml   template sensors + automations (HA package)
www/chauffage-loader.js             stable loader (always loads the latest card version)
www/chauffage-programme-card.js     Lovelace card + block injected into the more-info dialog
dev/harness.html, dev/*.js          test bench without HA (fake hass, ha-card and dialog)
dev/compose.yaml, dev/hass/         disposable development HA (Versatile Thermostat + simulated rooms)
tests/ha/, tests/js/                 automated tests (pytest + in-memory HA, node --test + jsdom)
tests/fixtures/                     stored data in each past format (migration tests)
scripts/                            test.sh, reload.sh, logs.sh, deploy.sh
deploy/pre-receive                  git hook to deploy with git push
.github/workflows/                  tests (CI) and releases
```

Development and deployment: see [CONTRIBUTING.md](CONTRIBUTING.md).

## How it works

- `sensor.programmes_chauffage` (template sensor, triggered by the `chauffage_programmes_set`
  event sent by the card): `{climate: {mode: [7 × ["HH:MM preset", …]]}}`.
- `sensor.derogations_chauffage` (event `chauffage_derogation_set`, sent by the card or by the
  manual-change detection): `{climate: {type, valeur, debut, fin}}`; `derogation: null` removes it.
- `sensor.suivi_vannes_chauffage`: setpoint / preset of the thermostats used in the schedules;
  it triggers the manual-change detection (no entity list to maintain).
- **Weekly schedules** automation: applies the slot's preset (every minute, on mode change, when
  a schedule is saved, at startup), skips thermostats with an active override, and restores the
  schedule when the override ends.
- **Manual override** automation: a setpoint / preset change that does not come from an
  automation (`context.parent_id` is empty) creates an override.

Known pitfalls (already handled, covered by tests): ZHA presets are Enums, converted to text
(otherwise HA stores the whole sensor attribute as unreadable text); dates with microseconds
are rejected by Safari; `ha-card` renders asynchronously (popover positioning); an unreachable
Zigbee valve does not stop the schedule from being applied to the others.

## License

[MIT](LICENSE) © 2026 Armel Larcier
