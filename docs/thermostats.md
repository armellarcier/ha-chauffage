# Supported thermostats

**English** · [Français](thermostats.fr.md)

Chauffage works with any `climate` entity that has a target temperature. The tests cover three
kinds of thermostats:

- **Versatile Thermostat.** Chauffage uses its presets, for example `comfort` or `eco`. You set
  their temperatures in Versatile Thermostat.
- **Thermostats with standard presets**, for example `eco` or `comfort`. Chauffage uses the
  thermostat's preset with the same name, and sets a temperature for the other presets.
- **Thermostats without presets**, for example `generic_thermostat`. Chauffage sets
  temperatures.

On every kind of thermostat, a setpoint you change by hand becomes an
[override](overrides.md).

**Air conditioners.** Each of these kinds can also be an air conditioner. On an air
conditioner, a slot chooses what the device does, for example *Cool* or *Heat/Cool*. See
[Air conditioners](air-conditioners.md).

**Devices that change their setpoint by themselves.** Chauffage doesn't support these devices
yet. Chauffage may take their changes for changes by hand.

**Devices that keep their preset after a change by hand.** For such a device, set every preset
to a temperature, in the Chauffage panel, on the *Presets* tab.

**Devices that round the setpoint.** Chauffage may take the rounded setpoint for a change by
hand. See
[Troubleshooting](troubleshooting.md#an-override-starts-when-nobody-touched-the-thermostat).

The [roadmap](../ROADMAP.md) says what comes next, for example groups of thermostats.
