# Entities, services and events

**English** · [Français](automations.fr.md)

Read this page to use Chauffage in your automations, scripts and dashboards. Chauffage gives
you three tools:

- **entities**, to read the planned preset and the overrides, and to change the settings;
- **services**, to start or end an override, activate a schedule, or read the weeks;
- **events**, to react when an override starts or ends, or when a schedule is activated.

## Entities

The entities appear by themselves. They read and change the same data as the card. You can
rename them and change their icons in Home Assistant.

### On each scheduled thermostat's device

Each scheduled thermostat gets a device of its own, named after the thermostat, with the model
*Scheduled thermostat*. You find this device in the thermostat's area, and under *Connected
devices* on the thermostat's own device page. The device's *Visit* button opens the
thermostat's page in the Chauffage panel.

| Entity | What it says |
|---|---|
| **Control** (switch) | Off while the thermostat is **paused**. |
| **Planned preset** (sensor) | Deprecated: use **Next change**. The preset planned now. |
| **Override** (binary sensor) | On while the thermostat has an override. |
| **Override end** (sensor, disabled by default) | The end of the current override, as a timestamp. |
| **Next change** (sensor) | When Chauffage next changes the thermostat, and to what. For preheating tools, see [Preheating tools](preheating.md). |

The sensors are unavailable while the thermostat is paused.

**Attributes of the planned preset sensor.**

- `preset_name`, and `target`.
- `hvac_mode`: the slot's HVAC mode, for example `off` or `cool`. A heater's slot has no HVAC
  mode. During a slot without a preset, the sensor's state is unknown.
- `next_preset`, `next_preset_name`, `next_hvac_mode` and `next_start`.
- `temperatures`: the temperature of each preset on this thermostat. During a slot that cools,
  this is the temperature when cooling.

**Attributes of the override sensor.**

- `target`: what the thermostat is set to, for example `{"temperature": 21.5}` or
  `{"preset_mode": "boost"}`.
- `preset`: the Chauffage preset asked for, if any.
- `end`.

**Installed before 0.6?** The planned preset sensor keeps its former id,
`sensor.<thermostat>_schedule` in English.

### On the *Chauffage* device

| Entity | What it says |
|---|---|
| **Active schedule** (select, `select.chauffage_schedule`) | The active schedule. Choose another option to activate another schedule. |
| **&lt;Schedule&gt; schedule** (switch, `switch.chauffage_schedule_<id>`) | One switch per schedule, on for the active schedule. Turn on a switch to activate its schedule. |
| **End of overrides** (select, `select.chauffage_manual_override_end`) | How long an override lasts: `duration`, `next_slot_within_duration` or `next_slot`. |
| **Turned off** (select, `select.chauffage_off_override_end`) | How long a thermostat turned off stays off: `next_slot` (the default), `duration` or `next_slot_within_duration`. |
| **Override duration** (number, `number.chauffage_override_duration`) | The override duration in minutes, from 15 minutes to 24 hours. |

The *Active schedule* select has two attributes. `schedule_id` is the active schedule's id.
`rules_choice` is the schedule that the activation rules give, and is empty without rules.

You cannot turn off the active schedule's switch. Turn on another schedule's switch instead. To
change the icon of a schedule's switch, open the schedule's ⋮ menu in the card, then *Change
the icon…*. The card shows this icon on the schedule's tab.

[Choose how long an override lasts](overrides.md#choose-how-long-an-override-lasts) and [Turn a
thermostat off by hand](overrides.md#turn-a-thermostat-off-by-hand) explain the *End of
overrides* and *Turned off* settings.

### Voice assistants

You can say "turn off the living room control" or "turn on the Holidays schedule". Home
Assistant exposes new switches to voice assistants. The *Control* switches created before 0.6
are not exposed. To expose an entity or not, go to Settings → Voice assistants → Expose.

## Services

| Action | What it does |
|---|---|
| `chauffage.set_override` | Sets an override on a thermostat, for a duration or until a time. |
| `chauffage.clear_override` | Ends the override. The thermostat goes back to its schedule now. |
| `chauffage.activate_schedule` | Activates a schedule, by its stable id. |
| `chauffage.get_schedules` | Returns the schedules, `active_schedule`, `rules_choice` and `default_schedule`. |
| `chauffage.get_week` | Returns the weeks of the thermostats in a schedule, the active schedule by default. |

### `chauffage.set_override`

An override sets an HVAC mode, a temperature or a preset. A preset means the same as in the
card.

- **Turn off.** Set `hvac_mode: off`. Without a duration or a time, the thermostat stays off as
  long as the *Turned off* setting says.
- **Turn on in an HVAC mode.** Set `hvac_mode`, for example `heat` or `cool`. `dry`, `auto` and
  `fan_only` take no temperature and no preset.
- **Heat/cool.** `heat_cool` takes a preset, or `target_temp_low` and `target_temp_high`.

The action refuses a request that contradicts itself, and its message says why. For example,
the action refuses `off` with a temperature, or a duration and a time together.

### `chauffage.get_schedules`

Each schedule has its `id`, its `name` and the `entity_id` of its switch.

### `chauffage.get_week`

`chauffage.get_week` returns one entry for each thermostat, like Home Assistant's
`schedule.get_schedule`. Each entry has its `schedule`, and a list for each day, for example
`monday`. Each slot has its `start`, its `end` and its `preset`.

On a thermostat with HVAC modes, a slot also has its `hvac_mode`, for example `heat` or `off`.
A slot that is off, fan only, dry or auto has no preset, so its `preset` is empty.

For example, to send tomorrow's comfort time:

```yaml
- action: chauffage.get_week
  data:
    entity_id: climate.salon
  response_variable: week
- action: notify.mobile_app_phone
  data:
    message: >-
      {% set tomorrow = (now() + timedelta(days=1)).strftime('%A') | lower %}
      Tomorrow the living room is in comfort from
      {{ week['climate.salon'][tomorrow] | selectattr('preset', 'eq', 'comfort') | map(attribute='start') | first }}
```

## Events

Use these events with the *Event* trigger:

| Event | When |
|---|---|
| `chauffage_override_started` | An override starts, or gets a new value. |
| `chauffage_override_end_changed` | Only the end of an override changes. |
| `chauffage_override_ended` | An override ends. |
| `chauffage_schedule_activated` | A schedule is activated. |

The logbook says who changed the thermostat, used the card, called the action or chose the
schedule.

### Override events

The three override events carry `entity_id`, `start` and `end`.

`chauffage_override_started` and `chauffage_override_end_changed` also carry:

- `target`, for example `{"temperature": 21.5}`, and `preset`;
- `source`: `thermostat` (changed by hand), `card`, `panel` (the Chauffage panel) or `service`.

`chauffage_override_ended` also carries `reason`, for example `expired`, `thermostat` (set back
to its schedule by hand) or `card`. The other reasons are `panel`, `service`, `paused` and
`forgotten`.

When Chauffage chose the end of the override, `end_rule` says which rule chose it: `duration`,
`next_slot` or `no_next_slot`. For example, a change by hand that lasts until the next slot
carries `next_slot`. When you pick the end yourself, the events carry no `end_rule`.

### Schedule event

`chauffage_schedule_activated` carries:

- `schedule` (the stable id), `schedule_name` and `previous_schedule`;
- `entity_id`, the *Active schedule* select;
- `source`: `card`, `panel`, `entity` (the select or a schedule switch), `service` or `rules`.

### Example

To get a notification when someone changes a thermostat by hand:

```yaml
triggers:
  - trigger: event
    event_type: chauffage_override_started
    event_data:
      source: thermostat
actions:
  - action: notify.mobile_app_phone
    data:
      message: "{{ trigger.event.data.entity_id }}: {{ trigger.event.data.target.values() | join(', ') }} until {{ as_datetime(trigger.event.data.end).strftime('%H:%M') }}"
```
