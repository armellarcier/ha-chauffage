# Schedules defined by the user — concept and user stories

Status: **decided** (see "Decisions"); implementation in progress, tests first.
Roadmap context: [ROADMAP.md](../ROADMAP.md), "Next", step 1. Vocabulary: [glossary.md](glossary.md).

## Concept

What ha-chauffage called *modes* are **schedules**: named weekly plans, one of them active. They
are not states of the home with a built-in meaning; what *Away* or *Holidays* means is only the
content the user gives them. The author's home, for example:

| Schedule | Content | Switched by |
|---|---|---|
| *Normal* | school and work days, some evenings earlier; repeats every week | default |
| *Normal + remote work* | *Normal*, with someone home on Tuesdays; used over long periods planned in advance | by hand, or an automation |
| *Holidays* | children and one parent at home | planned in advance; an automation goes back to *Normal* |
| *Away* | everyone out: "back at 18:00", "from Friday evening to next Wednesday" | automations |

Every week alike, or one week in two (odd / even weeks), is handled the same way: two schedules
and an automation switching them.

So ha-chauffage does not need predefined modes: it needs **schedules the user creates, names,
duplicates and deletes**. When a schedule is active and until when is the job of the
active-schedule entity, automations, and later a calendar of schedules (see "Later").

## Scope of this step

Managing schedules (create by duplication, rename, delete, reorder) and the migration of
existing installations. Not in this step: activating schedules over periods, "until Tuesday" /
"until 18:00" (calendar of schedules, later), groups of thermostats.

## User stories

**Seeing schedules** (exists today)
1. As a user, I see every schedule as a tab of the card, the active one marked, and I edit the
   weeks of any schedule, active or not.
2. As a user, I activate another schedule from the card, the select entity or an automation; all
   thermostats follow it at once (overrides are kept).

**Managing schedules** (new; admins only, like presets)
3. As an admin, I **duplicate** a schedule under a new name: every thermostat's week is copied;
   then I change only what differs (*Normal* → *Normal + remote work*).
4. As an admin, I create an **empty** schedule: every scheduled thermostat starts with one preset
   all week (*Eco*, or the first preset if there is no *Eco*), which I then edit.
5. As an admin, I **rename** a schedule; the name must not be empty or taken by another one. Its
   **id** does not change.
6. As an admin, I **delete** a schedule, after confirming; I cannot delete the active schedule
   (activate another one first) or the last one.
7. As an admin, I **reorder** schedules (order of the tabs and of the select's options).
8. As a user who is not an admin, I see the schedules and switch the active one, but cannot
   create, rename, delete or reorder them.

**Automations**
9. As a user, my automations keep working when I rename a schedule: every schedule has a
   **stable id**, given from its name when it is created and never changed (like an area or an
   entity id in HA), shown in the card; the service `chauffage.activate_schedule` takes that id,
   and the select entity's `schedule_id` attribute gives the active one (for triggers and
   conditions). The select entity's options stay the names, for dashboards.
10. As a user, I can switch schedules by date in an automation (odd / even weeks, end of
    holidays): documented with an example in the README.

**Upgrading**
11. As a user upgrading, my three modes become three schedules with the same names, order,
    weeks and active one: nothing changes for the thermostats, the card or the select entity.
12. As a new user, the integration starts with **a single schedule** (*Normal*, in the HA
    language); I create the others by duplication.

**Edge cases** (to cover with tests)
- Managing schedules while the card has unsaved edits of the weeks: the edits are saved first.
- Two admins at once: an action on a schedule another one has just deleted or renamed fails
  with a clear message, without losing data.
- A schedule with no week for a thermostat: that thermostat gets *Eco* all week (as today).
- Deleting a schedule removes its weeks for every thermostat; overrides are not affected.

## Decisions

1. A new installation starts with **a single schedule**, *Normal*.
2. A schedule can be created **empty** or as a **copy** of another one.
3. **Stable ids**, as everywhere in HA: the id comes from the name at creation and never
   changes; automations use it (`chauffage.activate_schedule`, attribute `schedule_id`).
4. Unsaved edits of the weeks are **saved first**.
5. The entity id stays **`select.chauffage_mode`** for now (renamed with the vocabulary step);
   its name becomes *Active schedule* / *Planning actif*.
6. In the card, a **"+"** tab creates a schedule (empty or a copy of a chosen one); a **⋮**
   menu on the open tab renames (showing the id), moves left / right, deletes.
7. French UI: *preset* is translated **préréglage**, as in Home Assistant.

## API

- Websocket `chauffage/modes/set` (admins): the ordered list of schedules
  `[{id, name} | {name, copy_of?}]`, with the `revision` the card edited. Known ids are kept
  (renamed, moved), missing ones deleted (not the active one, not the last one), items without
  an id created (copy of `copy_of`, or empty). Returns the new list. The names in the API and the
  data stay *modes* until the vocabulary step (roadmap 3), done in one go.
- Service `chauffage.activate_schedule` (`schedule`: id).

## Later (roadmap)

- **Calendar of schedules**: a year view, one row per month, with periods (days and times)
  colored by schedule, like the weekly view with slots. A **default schedule** applies outside
  the periods. It also covers "activate *Away* until Tuesday" or "until 18:00" without an
  automation.
- **Vocabulary**: rename modes → schedules and levels → presets everywhere (glossary).
