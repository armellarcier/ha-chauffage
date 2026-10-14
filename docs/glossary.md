# Glossary (ubiquitous language)

One word per concept, the same in the UI, the docs, the code, the data and the tests. English is
canonical; the French column is the UI and docs wording.

| Term | French | Meaning |
|---|---|---|
| **Schedule** | Planning | A named weekly plan for the home, defined by the user (*Normal*, *Remote work*, *Holidays*, *Away*…): for each thermostat, a week of slots. One schedule is active at a time. |
| **Active schedule** | Planning actif | The schedule the thermostats follow now; switched from the card, the select entity or an automation. |
| **Week** | Semaine | What a schedule says for one thermostat: 7 days of slots. |
| **Slot** | Créneau | A start time and a preset; it lasts until the next slot of the day. |
| **Preset** | Préréglage | What a slot asks a thermostat for (*Comfort*, *Eco*, *Boost*, *Frost protection*…): a name, a color, a default temperature. For each thermostat, a preset is the climate preset with the same name when it has one, otherwise a temperature; it can be set per thermostat. It is the same idea as a climate entity's presets, extended to thermostats that have none. |
| **Override** | Dérogation | A temporary setpoint or preset on one thermostat, usually set by hand on the thermostat; it ends by itself and the thermostat resumes its schedule. |
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
