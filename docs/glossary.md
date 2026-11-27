# Glossary (ubiquitous language)

One word per concept, the same in the UI, the docs, the code, the data and the tests. English is
canonical; the French column is the UI and docs wording.

**The model, in two sentences.** A slot says when, and what the device does: its HVAC mode (off,
heat, cool, heat/cool, dry, auto or fan only), with its fan and its vanes. In heat, cool and
heat/cool, the slot's preset says how warm, for each thermostat and for that HVAC mode.

| Term | French | Meaning |
|---|---|---|
| **Schedule** | Planning | A named weekly plan for the home, defined by the user (*Normal*, *Remote work*, *Holidays*, *Away*…): for each thermostat, a week of slots. One schedule is active at a time. A schedule has no HVAC mode: each slot chooses its own (#91). |
| **Active schedule** | Planning actif | The schedule the thermostats follow now; switched from the card, the select entity or the schedule switches, an automation or the activation rules. |
| **Activation rule** | Règle d'activation | A template and the schedule it activates while it is true, or a template that gives the schedule itself (its id or its name). The rules are in order, the first that applies wins; the **default schedule** (*planning par défaut*) is activated when none applies. A schedule chosen by hand stays until the outcome of the rules changes. |
| **Scheduled thermostat** | Thermostat programmé | A `climate` entity with weeks in Chauffage: its weeks, the values of the presets on it, whether it is paused (values of the presets set before its weeks are kept, but do not schedule it); it has a week in every schedule. Stored data, not an entity; Home Assistant shows it through a device of its own (model *Scheduled thermostat*, [#57](https://github.com/armellarcier/ha-chauffage/issues/57)). Scheduled when its week is edited in a card, or when it is scheduled in the panel; it stays scheduled when it is removed from every card, and when it is paused (still scheduled, not controlled), until it is forgotten. |
| **Control** | Pilotage | Chauffage sending a scheduled thermostat what its schedule and overrides ask, and turning its manual changes into overrides. A scheduled thermostat is **controlled** (*piloté*) unless it is paused; its *Control* switch (*Pilotage*) says which. Scheduled is what Chauffage keeps (its weeks), controlled is what it does with them. |
| **Paused** | Pilotage suspendu | A scheduled thermostat Chauffage does not control: still scheduled, everything is kept, nothing is sent, manual changes are not overrides. Not the same as *off* (the thermostat turned off). Its *Control* switch (*Pilotage*) is off. The UI says *Pause control* / *Suspendre le pilotage* and *Resume control* / *Reprendre le pilotage*: what is paused is the control, not the heating. **Forgetting** (*oublier*) a thermostat drops its data. |
| **Week** | Semaine | What a schedule says for one thermostat: 7 days of slots. |
| **Slot** | Créneau | A start time, an HVAC mode and, in *Heat* (*Chauffe*), *Cool* (*Clim*) and *Heat/Cool* (*Chauffe/Clim*), a preset. It lasts until the next slot of the day. A slot that is **Off** (*Éteint*), **Fan only** (*Ventilation*), **Dry** (*Déshum.*) or **Auto** has no preset and no setpoint (#91). A heater's slot says no HVAC mode: a preset, or off. On an air conditioner, a slot stored without an HVAC mode heats. On a thermostat whose HVAC mode Chauffage does not control, a slot says no HVAC mode either (#159). A slot may set the fan and the vanes: its **settings** (*réglages*). Each slot is independent. A slot never sets a temperature. |
| **HVAC mode** | Mode HVAC | Home Assistant's `hvac_mode` of a thermostat: off, heat, cool, heat/cool, dry, auto, fan only. What the device does. On a thermostat that lists more than one besides off, every slot says its HVAC mode, and an override does too; a heater's slot carries none. Not when Chauffage does not control the thermostat's HVAC mode: then its slots and its overrides carry none (#159). Always in full: never "mode" alone, which was the former word for a schedule. |
| **Control the HVAC mode** | Contrôler le mode HVAC | The setting that lets Chauffage choose a thermostat's HVAC mode, on by default (#159). It is set for the house, and each thermostat follows the house or says on or off. Off, Chauffage never sends the thermostat an HVAC mode, and turning it off or on by hand is no override. |
| **Preset** | Préréglage | What a slot asks a thermostat for (*Comfort*, *Eco*, *Boost*, *Frost protection*…): a name, a color (and a **cool color**, *couleur en clim*, for its cooling slots, derived from its color unless the user chooses one), a default temperature when heating and a default temperature when cooling. Either temperature can be empty: a thermostat can use a preset in the HVAC modes the preset has a value for (#91). For each thermostat, a preset is the climate preset with the same name when it has one, otherwise a temperature; it can be set per thermostat. It is the same idea as a climate entity's presets, extended to thermostats that have none. A preset says how warm: it never turns a thermostat off, nor chooses between heat and cool. |
| **Value** (of a preset on a thermostat) | Valeur | What a preset means on one thermostat, when it is set for it: one of the thermostat's own presets, or a temperature. On an air conditioner, the value *when heating* (*en chauffe*), and a temperature *when cooling* (*en clim*): the slot's HVAC mode picks which one is sent, or the HVAC mode the thermostat shows when Chauffage does not control it (#159), and a heat/cool slot sends both temperatures, as a range. It may set the fan and the vanes. |
| **Default** (of a preset) | Par défaut | What a preset gives a thermostat when nobody set it for that thermostat: the thermostat's own preset of the same name, otherwise the preset's default temperature. Not "auto" or "automatic", which Home Assistant uses for the HVAC mode *auto*. |
| **Override** | Dérogation | A departure from the schedule on one thermostat, decided now: an HVAC mode, a setpoint or a preset until an end, usually set by hand on the thermostat. It is never planned (what is decided in advance belongs to the schedules), and a thermostat has one at most: a new one replaces it. It ends by itself and the thermostat resumes its schedule. |
| **Access level** | Niveau d'accès | What the users who are not admins may change in Chauffage: *Use* (*Utiliser*), *Plan* (*Programmer*) or *Set up* (*Configurer*), each including the one before. One access level for all of them, chosen by an admin; an admin of Home Assistant can always do everything ([#99](https://github.com/armellarcier/ha-chauffage/issues/99)). Always in full: never "level" alone, which was a preset before v0.4, nor "role", which Home Assistant uses for admin and user. |
| **History** | Historique | What happened, not what is planned: the temperature measured and the setpoint applied by each thermostat over the last 7 days, read from Home Assistant's recorder and drawn over the days of the week (each day shows its last occurrence). |

## Former words

Retired in v0.4 (code, stored data with a migration, websocket API, entities, card, docs):

| Former word | Now |
|---|---|
| Mode (`modes`, `active_mode`, `select.chauffage_mode`, `chauffage/mode/set`) | Schedule (`schedules`, `active_schedule`, `select.chauffage_schedule`, `chauffage/schedule/activate`) |
| Schedules, for the weeks of each thermostat (`schedules`, `chauffage/schedules/save`) | Weeks (`weeks`, `chauffage/weeks/save`) |
| Level, heating level (`levels`, *Levels* view, `next_level` attribute) | Preset (`presets`, *Presets* view, `next_preset`) |
| Programme (French, in old code) | Schedule, week |

Kept on purpose: the card's type, `custom:chauffage-programme-card`, because dashboards refer to it.
