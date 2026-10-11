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

## Words to retire

| Old word | Use instead | Where it still appears |
|---|---|---|
| Mode (`modes`, `active_mode`, `select.chauffage_mode`, `chauffage/mode/set`) | Schedule | data, websocket API, entity, code, card, docs |
| Level, heating level (`levels`, `level`, *Levels* view) | Preset | data, websocket API, sensors' attributes, code, card, docs |
| Programme (French, in old code and tests) | Schedule / week | card code, some test names |

Renaming them everywhere (code, data with a migration, API, entity ids where users are not
broken, UI, docs) is a roadmap item; new code and docs use the terms above from now on.
