# Glossary (ubiquitous language)

One word per concept, the same in the UI, the docs, the code, the data and the tests. English is
canonical; the French column is the UI and docs wording.

| Term | French | Meaning |
|---|---|---|
| **Schedule** | Planning | A named weekly plan for the home, defined by the user (*Normal*, *Remote work*, *Holidays*, *Away*…): for each thermostat, a week of slots. One schedule is active at a time. |
| **Active schedule** | Planning actif | The schedule the thermostats follow now; switched from the card, the select entity or the schedule switches, an automation or the activation rules. |
| **Activation rule** | Règle d'activation | A template and the schedule it activates while it is true, or a template that gives the schedule itself (its id or its name). The rules are in order, the first that applies wins; the **default schedule** (*planning par défaut*) is activated when none applies. A schedule chosen by hand stays until the outcome of the rules changes. |
| **Scheduled thermostat** | Thermostat programmé | A `climate` entity with weeks in Chauffage: its weeks, the values of the presets on it, whether it is paused (values of the presets set before its weeks are kept, but do not schedule it); it has a week in every schedule. Stored data, not an entity; the prototype of [#57](https://github.com/armellarcier/ha-chauffage/issues/57) shows it in Home Assistant through a device of its own (model *Scheduled thermostat*). Added by putting it in a card, it stays scheduled when it is removed from every card, and when it is paused (still scheduled, not controlled), until it is forgotten. Being introduced ([#27](https://github.com/armellarcier/ha-chauffage/issues/27)). |
| **Control** | Pilotage | Chauffage sending a scheduled thermostat what its schedule and overrides ask, and turning its manual changes into overrides. A scheduled thermostat is **controlled** (*piloté*) unless it is paused; its *Control* switch (*Pilotage*) says which. Scheduled is what Chauffage keeps (its weeks), controlled is what it does with them. |
| **Paused** | En pause | A scheduled thermostat Chauffage does not control: still scheduled, everything is kept, nothing is sent, manual changes are not overrides. Not the same as *off* (the thermostat turned off). Its *Control* switch (*Pilotage*) is off. **Forgetting** (*oublier*) a thermostat drops its data. |
| **Week** | Semaine | What a schedule says for one thermostat: 7 days of slots. |
| **Slot** | Créneau | A start time and a preset; it lasts until the next slot of the day. |
| **Preset** | Préréglage | What a slot asks a thermostat for (*Comfort*, *Eco*, *Boost*, *Frost protection*…): a name, a color, a default temperature. For each thermostat, a preset is the climate preset with the same name when it has one, otherwise a temperature; it can be set per thermostat. It is the same idea as a climate entity's presets, extended to thermostats that have none. |
| **Override** | Dérogation | A departure from the schedule on one thermostat, decided now: a setpoint or preset until an end, usually set by hand on the thermostat. It is never planned (what is decided in advance belongs to the schedules), and a thermostat has one at most: a new one replaces it. It ends by itself and the thermostat resumes its schedule. |
| **History** | Historique | What happened, not what is planned: the temperature measured and the setpoint applied by each thermostat over the last 7 days, read from Home Assistant's recorder and drawn over the days of the week (each day shows its last occurrence). |

## Former words

Retired in v0.4 (code, stored data with a migration, websocket API, entities, card, docs):

| Former word | Now |
|---|---|
| Mode (`modes`, `active_mode`, `select.chauffage_mode`, `chauffage/mode/set`) | Schedule (`schedules`, `active_schedule`, `select.chauffage_schedule`, `chauffage/schedule/activate`) |
| Schedules, for the weeks of each thermostat (`schedules`, `chauffage/schedules/save`) | Weeks (`weeks`, `chauffage/weeks/save`) |
| Level, heating level (`levels`, *Levels* view, `next_level` attribute) | Preset (`presets`, *Presets* view, `next_preset`) |
| Programme (French, in old code) | Schedule, week |

Kept on purpose: the card's type, `custom:chauffage-programme-card` (dashboards refer to it), and
the v0.1 package's entities read by the import (`input_select.mode_chauffage`,
`sensor.programmes_chauffage`…).
