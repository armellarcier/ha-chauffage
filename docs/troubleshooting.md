# Troubleshooting

**English** · [Français](troubleshooting.fr.md)

A thermostat didn't do what you expected? Here is where to look, in order.

## 1. The logbook

Open *Activity* (the logbook) without a filter. Chauffage records every override there, under
the thermostat's name. The line says where the override came from, for example the knob or the
card, and why the override ended.

To filter the logbook on one thermostat, filter on the thermostat **and** its *Override* sensor.
On the thermostat alone, the logbook hides Chauffage's lines.

The logbook records overrides, not slots. To see what a slot sent, read the Home Assistant logs
(step 2).

Schedule changes are recorded in the logbook of the *Active schedule* select.

## 2. The Home Assistant logs

To see every command sent to the thermostats and why, set Chauffage to the `info` level:

```yaml
logger:
  logs:
    custom_components.chauffage: info
```

## 3. Diagnostics

Download the diagnostics: Settings → Devices & services → Chauffage → ⋮ → *Download diagnostics*.
Attach this file to your issue. The file holds your schedules and the current state of the
thermostats.

## An override starts when nobody touched the thermostat

Your thermostat probably rounds the setpoint it receives, for example to the whole degree.
Chauffage sends 18.5 °C, the thermostat reports 18 °C, and Chauffage takes the difference for a
change by hand.

To confirm it, read the Home Assistant logs at the `info` level. Right after the temperature that
Chauffage sent, a line shows the rounded setpoint, for example:

```text
climate.bedroom_valve: changed on the device (heat, setpoint 16.0 → 18.0); the slot asks for temperature 18.5: an override
```

To stop these overrides, choose one of these fixes:

- In the Chauffage panel, on the *Presets* tab, give this thermostat temperatures that it
  accepts, for example 18 °C instead of 18.5 °C.
- Or tell Home Assistant the thermostat's step, in `configuration.yaml`. Chauffage then rounds
  every temperature to this step before it sends it.

```yaml
homeassistant:
  customize:
    climate.bedroom_valve:
      target_temp_step: 1
```

## The card shows "Configuration error" after a restart

Reload the page. In the companion app, close the app and open it again.

The page was opened while Home Assistant was starting, before Chauffage was set up. The error
stays until you reload the page.
