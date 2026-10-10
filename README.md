# ha-chauffage

**English** · [Français](README.fr.md)

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

> The project's name, entities and UI are in French (*chauffage* = heating).

## Installation

1. Copy `www/*` to `<config>/www/chauffage/` and `packages/chauffage/*` to
   `<config>/packages/chauffage/` (or run `scripts/deploy.sh <config>`).
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

The active mode is selected with `input_select.mode_chauffage`.

### Supported thermostats

The schedule applies **presets** (`comfort`, `eco`, `boost`, `frost`), and manual changes are
detected because the thermostat switches to preset `none` when its setpoint is changed by hand.
This is how **Versatile Thermostat** behaves, and it is the tested setup. Thermostats without
these presets are not supported yet (planned: setpoint-based slots and configurable preset names).

## Repository layout

```
packages/chauffage/chauffage.yaml   template sensors + automations (HA package)
www/chauffage-loader.js             stable loader (always loads the latest card version)
www/chauffage-programme-card.js     Lovelace card + block injected into the more-info dialog
dev/harness.html, dev/*.js          test bench without HA (fake hass, ha-card and dialog)
dev/compose.yaml, dev/hass/         disposable development HA (Versatile Thermostat + simulated rooms)
scripts/                            reload.sh, logs.sh, deploy.sh
deploy/pre-receive                  git hook to deploy with git push
```

Development and deployment: see [CONTRIBUTING.md](CONTRIBUTING.md) (in French).

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

Known pitfalls (already handled): multi-line templates need `{%- -%}` or HA cannot parse the
resulting dictionary; ZHA presets are Enums and are converted to text; dates with microseconds
are rejected by Safari; `ha-card` renders asynchronously (popover positioning); an unreachable
Zigbee valve does not stop the schedule from being applied to the others.
