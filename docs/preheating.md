# Preheating tools

**English** · [Français](preheating.fr.md)

This page is for the developers of preheating tools, such as
[Intelligent Heating Pilot](https://github.com/RastaChaum/Intelligent-Heating-Pilot). A preheating
tool starts a thermostat before a slot, so that the room is warm when the slot starts.

Chauffage decides what happens to a thermostat, and when. Your tool decides how early to start.

## 1. Read the next change

Each scheduled thermostat has a **Next change** sensor (*Prochain changement* in French). The
sensor is enabled by default.

### The state

The state is a timestamp: when Chauffage will next change the thermostat.

- **Without an override**, the next change is the next slot that sends the thermostat something
  different. For example, on a thermostat without presets, an *Eco* slot at 17 °C followed by a
  *Night* slot at 17 °C sends 17 °C twice. The *Night* slot is not a change.
- **With an override**, the next change is the end of the override.
- **When no slot changes the thermostat** within a week, the state is unknown.
- **While the thermostat is paused**, the sensor is unavailable.

The sensor ignores the activation rules: Chauffage cannot predict when a rule switches the
schedule. When a rule or a user activates another schedule, the sensor follows the new schedule
at once.

### The attributes

The attributes are named like a `climate` entity's attributes, so your tool can pass them to the
`climate` services as they are.

| Attribute | What it gives | Example |
|---|---|---|
| `hvac_mode` | The HVAC mode the thermostat will have: the one Chauffage sends, or the one the thermostat keeps. | `"heat"` |
| `preset_mode` | The thermostat's own preset that Chauffage will send, or `null` when Chauffage sends a temperature. | `"comfort"` |
| `temperature` | The setpoint the thermostat will have, or `null` when Chauffage doesn't know it yet. | `20.0` |
| `target_temp_low`, `target_temp_high` | The range of a heat/cool slot. Only present for a heat/cool slot. | `20.0`, `25.0` |
| `preset` | The Chauffage preset of the slot that runs then. `null` for an off slot. | `"comfort"` |
| `preset_name` | The preset's name, as the user wrote it. | `"Comfort"` |

On a thermostat with presets of its own, Chauffage learns the temperature of each preset while
the thermostat is on it. A Versatile Thermostat publishes its preset temperatures, so Chauffage
knows them at once.

### What to send

1. When `hvac_mode` is `off`, Chauffage will turn the thermostat off. There is nothing to
   preheat.
2. When the thermostat is in another HVAC mode, send `hvac_mode` too, or don't preheat. For
   example, an air conditioner in fan only does not heat until it gets `heat`.
3. When `preset_mode` is set, send this preset. The `temperature` next to it tells you what the
   preset gives: don't send it.
4. Otherwise, send `temperature`, or the range of a heat/cool slot.

### Let the user choose the sensor

In your tool's configuration, let the user choose the **Next change** sensor of the thermostat,
as they choose a schedule entity. The sensor has the platform `chauffage` and the device class
`timestamp`.

## 2. Apply the next slot early

To preheat, set the thermostat to the next slot's value with a **context that has a parent**.
Chauffage treats this change like an automation's change: it creates no override.

```python
await hass.services.async_call(
    "climate", "set_preset_mode",
    {"entity_id": "climate.salon", "preset_mode": "comfort"},
    context=Context(parent_id=own_context.id),
)
```

If your integration changes its own climate entity, call
`self.async_set_context(Context(parent_id=...))` before `async_write_ha_state()`. Without a
context, Home Assistant creates an empty one, and Chauffage takes the change for a change on the
device.

For example, with a *Comfort* slot at 17:30 preheated from 16:45:

1. At 16:45, your tool sets *Comfort* with a parent context. Chauffage leaves the thermostat
   alone.
2. Until 17:30, Chauffage sends nothing to the thermostat.
3. At 17:30, the thermostat already has *Comfort*, so nothing changes.

## 3. Start again after a realignment

Chauffage sometimes sets a thermostat back to its current slot, for example when Home Assistant
starts or when the user edits a preset. This realignment cancels a preheat. Read the **Next
change** sensor again to decide whether to start again.

## A stable format

The state and the attributes above are stable. A change to them goes in the
[changelog](../CHANGELOG.md), under "Upgrading".
