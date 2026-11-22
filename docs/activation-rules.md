# Activation rules

**English** · [Français](activation-rules.fr.md)

Activation rules switch the schedule for you, without an automation. Write the rules in the
Chauffage panel, on the *Schedules* tab, below the schedules. Who may change the rules depends on
the [access level](panel.md#who-may-change-what).

## How the rules work

The rules are in order. **The first rule that applies wins.** When no rule applies, Chauffage
activates the default schedule. Without a default schedule, the active schedule stays.

A rule is a template. You can write a rule in two ways:

- **A template and a schedule.** The schedule is active while the template is true, for example
  `true`, `on` or `1`.
- **A template that gives the schedule.** The template returns the schedule's name or its stable
  id.

**A schedule chosen by hand** stays until the outcome of the rules changes. To go back to the
schedule of the rules at once, call `chauffage.activate_schedule` with the select's
`rules_choice` attribute.

## Example: EDF Tempo

To follow the EDF Tempo color of the day, write two rules and choose *Normal* as the default
schedule:

| Template | Schedule |
|---|---|
| `{{ is_state('sensor.edf_tempo_color', 'red') }}` | *Away* |
| `{{ is_state('sensor.edf_tempo_color', 'white') }}` | *Eco days* |
| (no rule applies) | *Normal* (default) |

You can also write a single rule whose template gives the schedule:

```jinja
{{ {'red': 'away', 'white': 'eco_days'}.get(states('sensor.edf_tempo_color'), 'normal') }}
```

## Example: a calendar of schedules

### One rule

You can plan your schedules in a calendar. Chauffage then activates the schedule named by the
current event.

1. Add a *Local Calendar* (Settings › Devices & services › Add integration), for example
   `calendar.chauffage`.
2. Add events named after your schedules. For example: *Holidays* from Friday evening to Sunday,
   *Away* until Tuesday 18:00, and *Remote work* every Wednesday as a recurring event.
3. Write one rule, and choose *Normal* as the default schedule:

   ```jinja
   {{ state_attr('calendar.chauffage', 'message') if is_state('calendar.chauffage', 'on') }}
   ```

While an event runs, the event's title gives the schedule. The title can be the schedule's name,
in any case, or its stable id. Between events, the default schedule applies.

Any calendar works the same way, for example Google or CalDAV. You can then plan from your
phone, or share the calendar with your household.

### Overlapping events

With the rule above, events must not overlap. A calendar entity shows only the event that
started first. So an *Away* evening during a week of *Holidays* is not seen.

To plan exceptions inside a longer event, use the blueprint
[`calendar_schedule.yaml`](../blueprints/automation/chauffage/calendar_schedule.yaml). The blueprint
writes the schedule of the event that started last into a text helper.

1. Create a *Text* helper (Settings › Devices & services › Helpers), for example
   `input_text.calendar_schedule`.
2. [![Import the blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Farmellarcier%2Fha-chauffage%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fchauffage%2Fcalendar_schedule.yaml),
   then create an automation from the blueprint, with your calendar and the helper.
3. Write a rule that reads the helper: `{{ states('input_text.calendar_schedule') }}`.

The blueprint sees a new or edited event every five minutes by default. For an online calendar,
choose fifteen minutes, because an online calendar only syncs at that pace.
