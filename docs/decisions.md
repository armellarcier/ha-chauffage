# Design decisions

Why ha-chauffage works the way it does. Each decision says what was chosen and why; the tests
prove the behavior ([use-cases.md](use-cases.md)), the [changelog](../CHANGELOG.md) says when it
changed. Vocabulary: [glossary.md](glossary.md). Add a decision here when you make one that a
future contributor might question.

## Integration

- **An integration, not a YAML package** (v0.2). The v0.1 package (template sensors holding the
  data, automations, events from the card) hit its limits: attribute size, no real services, no
  configuration UI, no HACS, YAML to edit by hand. Its data is still imported when the
  integration is added (`importer.py`).
- **Domain `chauffage`, a single config entry.** One installation per Home Assistant; entity
  ids do not depend on the language (`select.chauffage_schedule`), their names are translated.
- **Data in a versioned `Store`** (`.storage/chauffage`), migrated automatically, each migration
  tested with a fixture of the former format. Going back to an older version is not supported.
- **A first setup waits for Home Assistant to be running** (retried automatically): during
  startup, the package's restored states and automations may not exist yet.
- **Settings in the card, not in the options flow.** HA's option forms (generated fields, no
  layout, no preview) proved impractical for setting temperatures room by room. The options
  keep a single form of defaults (override duration, use of the thermostats' own presets).

## Scheduling

- **A tick every minute** applies the slots starting now and the overrides ending now; every
  thermostat is realigned when HA starts, a schedule is activated or the weeks are saved. A
  slot that started during a missed minute (HA busy, summer time) is applied late, not never.
- **The integration recognizes its own changes by their context**, not only by "not made by an
  automation": a thermostat's answer to the scheduler can never become an override.
- **A manual change is judged against what the schedule expects**: on a thermostat driven by
  temperature, any other setpoint is an override; the thermostat reaching the expected
  temperature is not.
- **An override departs from the schedule, now: it is never planned.** Its first source is a
  change made by hand on the thermostat: someone in the room wants something else than the
  schedule, at that moment. The card, the more-info dialog and `set_override` called at that
  moment are other ways to say the same thing. It lasts until its end; its stored `start` is
  when it was made, not a start to wait for. What is decided in advance ("tomorrow from 8:00 to
  18:00, the children's bedrooms on frost protection") is part of the plan, so it belongs to the
  schedules (activation rules, the coming calendar of schedules, issue #13), not to overrides.
  Hence **one override per thermostat at most**: a change by hand on a thermostat that already
  has an override means the user changed their mind, so it replaces the override (going back to
  what the slot expects ends it, see below). There is no stack of overrides and no override
  waiting to start. An automation calling `set_override` at 8:00 is consistent with this: it
  departs from the schedule at 8:00.
- **An override only ends at its end, when it is removed, or when a change on the thermostat
  goes back to what the slot gives** (issue #19: no "Comfort in Comfort" override). Going back
  follows the same rules as creating an override, the same on every kind of thermostat: a
  preset picked by a user (not by the thermostat itself, such as VTherm leaving its safety
  mode), or a setpoint changed by a user or on the device (its knob). "What the slot gives" is
  measured on the thermostat: its preset, or a manual setpoint at the temperature of that
  preset on this thermostat (published by VTherm, otherwise the last one read while on that
  preset), not the default temperature of the ha-chauffage preset. Not when the override
  already has that value: the thermostat coming back to it by itself does not end an override
  held past the next slots. A slot change never ends an override, even to a slot with the
  override's value: an override set for a day during the first comfort slot must still hold
  when the next eco slot starts.
- **Holding the slot's preset past the next slots is done from the card**, not by hand: the
  override popover (opened on an override, or from today's row menu, "Temporary setpoint…"),
  and the block in the thermostat's more-info dialog, create an override or change its value (a
  preset, or a temperature), and the integration sends it to the thermostat. Picking the slot's
  preset on the thermostat is read as "back to the schedule". Both show what the thermostat
  goes back to at the end ("then Eco (schedule)"), so that an override reads as a departure
  from the schedule. The card sends what the preset means on that thermostat (its climate
  preset, or a temperature), so the stored format of overrides does not change; on a thermostat
  without presets, "Comfort" picked in the card shows as its temperature.
- **One way to set an override's value on the thermostat** (`runtime.set_override`), which
  fits a temperature to the thermostat (limits, step) as for the slots, and never sends what the
  thermostat already has. The caller says what to send: the card, a new override or a new value
  (a new end alone is not sent, so it works on an unreachable thermostat); the `set_override`
  service, the value every time (an automation setting it again puts a thermostat that lost it
  back); a change by hand, nothing (the thermostat set it itself: sending it back could undo a
  second change made meanwhile).
- **Thermostats turned off, unavailable or overridden are left alone**; one coming back is
  realigned at once. A command that was not delivered is sent again every minute. Commands are
  spaced out (Zigbee networks).
- **Commands applied late: in doubt, no override.** A battery valve (Zigbee, asleep most of the
  time) may apply a command an hour or more later, even after a call that failed; its state in
  HA does not change meanwhile. Seen in production on a Tuya valve: comfort sent at 7:00, still
  shown at eco when eco was due at 8:00 (so nothing was sent), applied at 9:16 and taken for a
  change on the device: an override nobody made. The integration now keeps the commands sent
  that a thermostat has not taken yet (`pending`, stored: a restart must not bring the false
  override back). A thermostat that would still apply another command is sent the slot's even
  when it seems to have it already. A change on the device to a pending command is that
  command, applied late: no override, an override is not ended, and the thermostat is set back
  to its override or slot once it has no newer command to apply. Only a change to the value
  counts as taking it: a report that already showed it (its measured temperature) does not, as
  an older command may still come. The price: someone turning the valve to a value still
  pending, within a day of sending it, makes no override. Accepted: a missed override is seen
  at once and done again (the valve, the card), a false one heats a room at the wrong
  temperature for hours without anyone knowing why. A change made in Home Assistant by a user
  is always an override. After a day a command is not waited for anymore.
- **No special case for Versatile Thermostat's safety mode**: VTherm keeps the requested preset
  and returns to it by itself, so the usual rules are right (v0.2.0-beta.3 removed a special
  case that overwrote a user's choice).

## Presets

- **Presets of the integration, not of a thermostat** (v0.3). Slots ask for *Comfort*, *Eco*…;
  for each thermostat, a preset is its own climate preset with the same name when it has one
  (and the option allows it), otherwise the preset's temperature, fitted to the thermostat's
  limits and step. It can be set by hand per thermostat. Versatile Thermostat becomes one case
  among others.
- **No *Off* preset** (yet): thermostats turned off, by hand or for the summer, are left alone.
- **A preset used in the weeks cannot simply be removed**: another one takes its place.
- **Temperatures of the thermostats' own presets** are learned while each preset is active (no
  standard attribute gives them); Versatile Thermostat's are read from its attributes, a
  deliberate extra for its users. The integration computes them and sends them to the card
  ([#22](https://github.com/armellarcier/ha-chauffage/issues/22)): what the card shows is what a
  manual setpoint is compared with, from one copy of the logic.

## Schedules

- **Schedules are defined by the user** (v0.4), not predefined modes: their meaning (a day out,
  holidays, remote work…) is only their content; when one is active and until when is the job of
  the select entity, automations, the activation rules, and later a calendar of schedules.
- **A new installation has a single schedule**, *Normal*; others are created empty (eco, or the
  first preset, all week) or as a copy.
- **Stable ids**, as everywhere in HA: given from the name when a schedule is created, never
  changed; automations use them (`chauffage.activate_schedule`, attribute `schedule_id`). The
  select's options stay the names, for dashboards.
- **The active schedule and the last one cannot be deleted**; unsaved edits of the weeks are
  saved before a schedule is created, renamed, moved or deleted. Nor can a schedule used by the
  activation rules: the rules would point at nothing.

## Activation rules

- **An ordered list of rules "template → schedule", the first true one wins, an optional default
  schedule otherwise** (v0.5, [#1](https://github.com/armellarcier/ha-chauffage/issues/1)), not a
  condition on each schedule: two true conditions would need a hidden priority, here the order
  is the priority and it is visible. Without a default and with no true rule, the active
  schedule stays.
- **Templates, not a condition editor of our own**: a template can express anything (an entity's
  state, the time, several entities), users already write them for other integrations, and HA's
  Developer tools try them (the *Rules* view links there). The integration tracks them with HA's
  own template tracking (`async_track_template_result`: the entities they read, and the time when
  they use `now()`); a template that fails does not apply, and is shown as an error.
- **True or false as HA's template conditions read it** (`result_as_boolean` on the rendered
  text: `true`, `on`, `yes`, `1`, `enable`; any other text is false, `red` or `2` included), so
  that a template behaves as it does in an automation.
- **A rule without a schedule: its template gives the schedule**, by its id or its name (any
  case), and the rule applies when it names one. One template can then map a value to schedules
  (the three Tempo colors) instead of one rule per value; a text that names no schedule lets the
  next rule decide. Ids are recommended: a rename keeps them.
- **The calendar blueprint writes a text helper read by a rule; it does not activate the schedule
  itself** (`blueprints/automation/chauffage/calendar_schedule.yaml`). It reads the calendar every
  five minutes: activating the schedule each time would undo a schedule chosen by hand, and would
  compete with the other rules. Through a rule, the order of the rules, the default schedule, a
  choice by hand that stays and the card's preview all work as for any rule.
- **Rules are tried as they are typed, by the integration** (`chauffage/rules/preview`), not by
  HA's `render_template`: the same rendering and the same reading as the saved rules (true or
  false, the schedule named), and again when their entities change. Admins only, like
  `render_template`: a template can read any entity.
- **A plain text field in the card**, not HA's template code editor: that editor is an internal
  element of HA's frontend, loaded lazily (not on every dashboard) and the card redraws with
  `innerHTML`. The integration checks the template when the rules are saved and refuses an
  invalid one with HA's message.
- **A schedule chosen by hand stays until the outcome of the rules changes** (the card, the select
  or an automation), like an override that ends by itself: the rules take over again when they
  give another schedule (tomorrow's Tempo color), not at their next evaluation. The outcome last
  applied is stored (`rules_choice`), so a choice by hand also survives a restart; saving the rules
  applies them at once. Rules are evaluated once HA has started, when their entities are there.

## Scheduled thermostats

- **The integration keeps the list of scheduled thermostats; the cards only show them.** A card
  saved the weeks of every thermostat, so the thermostats in its configuration did not say which
  ones were controlled: one removed from the card stayed controlled (#27). A card cannot decide
  either: a user may have several cards (one per floor), a thermostat may be in two of them, and
  removing one from every card does not mean its schedule should be lost. Like HA's entities,
  hidden (not shown) is not disabled (not running). This follows the Scheduler component (the
  integration owns the schedules, which can be disabled, the cards show and filter them) and
  Climate Scheduler (entities picked to be scheduled, a schedule turned off without losing it).
- **A scheduled thermostat is stored data, not a device or an entity**: a `climate` entity and
  what Chauffage knows about it (weeks, values of the presets, learned temperatures, paused or
  not), by its entity id. It is seen in HA through the entities made for
  it (a switch, three sensors), attached to the thermostat's device like HA's own helpers; a
  device of ours per thermostat would double the devices and put the living room's settings
  somewhere else than the living room's thermostat. A thermostat without a device (a
  `generic_thermostat` written in YAML) gets entities without a device, named after it, as HA
  does for any entity without one; not the *Chauffage* service device.
- **Adding a thermostat in a card schedules it**, active: no list to fill in, no step before the
  card works. **A scheduled thermostat is one with weeks, one in every schedule**: the weeks the
  card sent, and in the other schedules the week of a new schedule (eco all week, or the first
  preset), as creating a schedule gives every thermostat. A thermostat without a week in some
  schedule was a state nobody chose (the card only drew a default week for it): saves had to
  tell a week drawn from a week edited, and deleting a schedule could unschedule a thermostat
  without a word. Values of the presets set first are kept for it, but schedule nothing (no
  switch, nothing to pause), as the weeks alone say what is scheduled.
- **Paused: still scheduled, not controlled.** A paused thermostat keeps everything; Chauffage
  sends it nothing, does not turn manual changes into overrides and drops its current override; its
  sensors are unavailable. Resuming realigns it at once. Paused is not *off*: off is the
  thermostat turned off by someone, which Chauffage already respects; paused is Chauffage not
  controlling it, whatever the thermostat does (a room run by hand for a few days, the end of the
  heating season, a test). **Forgetting** it is another action, which drops its data.
- **A switch per scheduled thermostat (*Control*, *Pilotage*)**, on: controlled, off: paused. Not
  *Scheduling* (*Programmation*): a paused thermostat is still scheduled (it keeps its weeks), so
  a switch named after the schedule read "off" on a thermostat the card lists as scheduled. A
  plain entity since 0.6 (see "Entities"), a configuration entity before.
  No service for pausing (the switch is enough), none for forgetting (dropping data is chosen in
  the card, or in the repair of an entity gone).
- **In the card, a paused thermostat stays**, marked paused with a *Resume* button; its weeks
  can still be edited (to prepare the return), saving does not resume it; no override can be
  set on it.
- **The cards do not tell the integration what they show.** Removing a thermostat from a card
  does not stop its schedule: it is paused or forgotten on purpose, from its switch or the
  card's *Thermostats* view, which lists every scheduled thermostat and marks the ones not in
  this card; the card editor says so when a scheduled thermostat is removed. Detecting a
  thermostat no card shows any more was tried (each card declared its list under a hidden id,
  and a repair proposed to pause a thermostat no card showed) and dropped: a Lovelace card has no
  id, and the cases piled up (a card duplicated with its id, YAML cards without one, previews,
  dashboards left open for weeks that declare once, a safety net after a week), each answer
  adding state and false alarms for what an explicit pause does. The integration does not read
  the dashboards either: their storage is internal to Lovelace, and YAML or generated dashboards
  would be missed.
- **A repair for a thermostat whose entity is gone** from HA: forget it, or keep it (an entity
  made again with the same id, which closes the repair).
- **A renamed `climate` entity is followed by the integration**, as HA's helpers follow their
  source entity: it listens to the entity registry and moves the thermostat's data and its
  entities to the new id. **Not by the card**: like HA's own cards, a card does not
  change what its configuration says by itself. A thermostat of its configuration renamed is set
  aside with a notice giving the new id, and the card editor offers to use it. Replacing it
  silently showed a thermostat the configuration does not name, and went wrong once an id was
  given to another entity (salon renamed, then chambre renamed salon). An id an entity has again
  is that entity, never the renamed one; weeks saved under a former id are refused (reload).
- **A card's subscription survives a reload of the integration** (options changed, a thermostat
  renamed): the cards open in the page follow the new runtime and get its data at once.
- **Saves send the weeks of the thermostats edited**, each with its own revision: two cards
  showing the same thermostat cannot overwrite each other, and do not block the others.
- **Stored per thermostat** (`thermostats: {climate: {paused, weeks, mapping,
  preset_temperatures, revision}}`). The overrides stay apart: short-lived, a release may drop
  them. Migrated from the current keys, nothing changing on upgrade: a thermostat with weeks is
  active, and gets the week of a new schedule in the schedules it had none in (what the card
  showed for it); one with only values of the presets was not controlled (left behind when it was
  removed from the card), they are kept and it is still not scheduled. Ready for groups of
  thermostats (roadmap), whose weeks would be owned by a group.

## Entities

What ha-chauffage knows is shown in Home Assistant itself, so that it can be seen and used in
dashboards, automations, scripts and by voice without the card
([#31](https://github.com/armellarcier/ha-chauffage/issues/31)).

- **Entities hold no state of their own.** The stored data stays the only state (the active
  schedule, the weeks, the overrides, the paused thermostats); entities show it and change it
  through the same methods as the card (`activate_schedule`, `set_paused`…). The select and the
  schedule switches cannot disagree.
- **Home Assistant's own building blocks**: an entity's name and icon are customized in Home
  Assistant (entity registry), not stored by ha-chauffage. The card reads the icon chosen for a
  schedule's switch (`hass.entities`) and shows it on the schedule's tab; no icon by default (the
  same icon on every tab would only take room). The schedule's name in ha-chauffage stays the
  reference: a name changed in Home Assistant only applies in Home Assistant.
- **The *Control* switch is a plain entity**, not a configuration one: pausing a thermostat is
  an everyday action, not a setting. Home Assistant marks the device triggers, conditions and
  actions of configuration entities as secondary, and does not expose them to Assist. Switches
  made before keep the Assist exposure chosen then (Home Assistant stores it when it first sees
  an entity): said in the README rather than changed behind the user's back.
- **One switch per schedule** (*Holidays schedule*, *Planning Vacances*), on the *Chauffage*
  device, beside the select (kept, to pick among all at once): a schedule becomes something
  that can be turned on from a dashboard button, a scene or by voice. Radio buttons: turning one
  on activates it and turns the previous one off. **The active one cannot be turned off**: there
  is always an active schedule, and turning it off would not say which one to activate; the
  service is refused with a message that says to turn another one on (a silent refusal looked
  like a bug). Named "*<name>* schedule", not "*<name>* active": "turn on the Holidays schedule"
  reads naturally by voice, the state says whether it is active; and not to be confused with the
  per-thermostat *Control* switch, which says **whether** a thermostat follows its weeks, a
  schedule switch says **which** weeks are read. Entity id `switch.chauffage_schedule_<id>`
  whatever the language and the name (automations and docs refer to it, like
  `select.chauffage_schedule`); unique id from the schedule's id, so a rename keeps it and its
  name follows the schedule's.
- **No entity per preset** (a temperature `number` per thermostat and preset): thermostats ×
  presets would make many entities, and on a thermostat with presets of its own the temperature
  belongs to the thermostat. The *Planned preset* sensor gives them in its `temperatures`
  attribute (not `targets`: the sensor already has `target`, what a preset means, a preset or a
  temperature).
- **The *Schedule* sensor became *Planned preset***: it shows a preset, and would have been
  confused with the schedule switches. Its unique id does not change, so existing entity ids
  and automations are kept.
- **Enabled by default: *Planned preset* and *Override*** (a binary sensor, simpler in
  automations than a timestamp, its attributes carrying the end). The device page then shows
  what ha-chauffage plans and whether there is an override, and the device's logbook reads like
  the history of its decisions; the cost is a few more entities in the generated *Overview*
  dashboard. The *Override end* sensor stays disabled by default: "Unknown" most of the time
  looks like an error; kept for those who want the end as a state. Installations from before
  enable *Planned preset* once (config entry 1.2), unless the user disabled it.
- **On a paused thermostat the sensors are unavailable**, Home Assistant's convention for a
  value that has no meaning.
- **No "resume the rules" service.** Rules are never disabled: a schedule chosen by hand stays
  until their outcome changes, then they take over again by themselves. The select's
  `rules_choice` attribute shows what they give, and an automation can activate it.
- **Events, not more entities, for what happens**: `chauffage_override_started` /
  `_ended`, `chauffage_schedule_activated`. They make visible what was not (a manual change
  turned into an override) and are the base for device triggers later. Who started an override
  (`source`: thermostat, card, service) is kept apart from why it ended (`reason`: expired,
  thermostat, card, service, paused, forgotten). An override whose end alone changes is not
  started again (the binary sensor carries the end).
- **Logbook descriptions of the events, logs of every command** (#49, which reverses "no
  logbook descriptions of our own"): the binary sensor's changes say that an override started
  or ended, not why, and the events are not shown anywhere; analyses across integrations need
  the reason. The events are described in the thermostat's logbook (the select's for a
  schedule, next to its change: the schedule event carries the select's `entity_id`, or the
  logbook filtered on it would leave it out), in Home Assistant's language (it does not translate
  logbook descriptions). The events carry the context of what caused them (a user's change,
  service call, card), so the logbook says who. Every
  command sent, override and change seen on a thermostat is logged at INFO with why, off by
  default like any INFO log. The diagnostics download holds the stored data, `pending` commands
  included, rather than an attribute recorded on every command.
- **Services with a response for structured data** (`get_schedules`, `get_week`) instead of
  more entities. `get_week` answers as Home Assistant's `schedule.get_schedule` does: by entity,
  then by day name, each slot with its start and end.
- **Override ends in local time** in the binary sensor and the events, whoever set them (the
  card sends UTC): automations read one format.

## Card

- **No build step**: one JavaScript file, served by the integration and loaded on every page
  (card and more-info block). Bundling comes with the translations as files (roadmap).
- **Loaded with `add_extra_js_url`, registered twice if needed**, not as a Lovelace resource
  (nothing to configure, and the more-info block needs it on every page). The module is loaded
  in parallel with HA's frontend, which replaces `customElements` with a scoped registry
  polyfill: a card evaluated first (cached) would be unknown to it. The card defines its
  elements again once `<home-assistant>` is defined, in the registry in place then (#2).
- **Saves carry the revision they edited**: a save from an outdated copy is refused instead of
  overwriting someone else's changes.
- **The card's type stays `custom:chauffage-programme-card`**: dashboards refer to it.
- **The card is newer than the integration right after an update** (HACS replaces the files,
  HA is not restarted yet): it asks for a restart instead of breaking.
- **The history of the measured temperature is read from HA's recorder**, not stored by the
  integration: nothing to keep or migrate, and it works for any thermostat with a
  `current_temperature`. Hence the last 7 days (within the recorder's default 10-day retention),
  each weekday showing its last occurrence; one scale per thermostat for its 7 days (comparable
  days), set by the measured temperature and the setpoints within 3° of it: a setpoint further
  away (frost protection at night) would flatten the curve, so it stays on the edge of the bar.
  The measured temperature is a smooth 1.5 px white line, without outline or shadow (an outline
  left grey inside the curve): straight lines between the values, held flat until 15 minutes
  before a change (the integration only sends changes: a straight line would invent a slope over
  hours, steps looked aliased). The setpoint applied is a 1 px bright yellow line with a drop
  shadow, drawn over it and the slots' handles (a dashed line was lost under the handles and where
  the curves cross; yellow without shadow vanished on the orange of *Comfort*; a dark line was not
  liked). No derived value (heating delay, rate) is shown: the user judges, heating anticipation
  is on the roadmap.
- **The integration reads that history for the card (`chauffage/history`)** instead of the card
  calling HA's `history/history_during_period`: for a `climate` entity, HA sends every attribute
  of every change (`climate` is a "significant" domain, so neither `significant_changes_only` nor
  `minimal_response` reduce it, and attributes cannot be picked), 6.7 MB for a week of the
  development HA's five thermostats, seconds on a small server or a remote connection. The
  integration keeps only the measured and target temperatures, when one of them changes (200 kB),
  and keeps what it read in memory: a later call only reads the last minutes. Not the
  temperature sensors' statistics (tiny): a thermostat does not say which sensor it uses, some
  have none, and the setpoint is only in the thermostat's attributes. The card falls back to HA's
  history while HA has not been restarted after an update.
- **Identical days are grouped when they are drawn, not in the data** (#11): a week stays 7 days
  (the scheduler, the storage, `get_week` and automations do not change, nothing to migrate), and
  the card shows the days with the same slots on one row, edited as a whole. Groups chosen and
  stored (*Mon–Fri / Sat / Sun*, as some thermostats do) were more predictable, but needed a new
  format and a migration, exceptions inside a group, and a meaning for thermostats grouped
  differently; deduced groups apply at once to existing schedules. Hence: with several
  thermostats shown, a row holds the days identical for every one of them; editing a row never
  splits it (a day is made different with each day shown, *Group days* off), and *Copy to…*
  joins rows. The history is per day: it shows each day, and grouping the days hides it (two
  buttons that seemed both on while one was ignored were confusing). Today's row carries the
  current time and today's piece of an override; another row shows where it ends (with the handle
  to move the end), or else the days of the row it covers.
- **A slot is moved whole by dragging it**, its neighbors giving or taking the time; the first
  and the last slots of the day stay (they start or end the day). A move under 5 px is still a
  click (the popover); a move does not select the slot (its popover would cover the row).
  **By touch, only the selected slot moves**: a finger sliding over the
  week (to scroll, or to read a day shown larger) must not move slots by accident; tap it, then
  slide it.
- **The visual editor follows HA's own card editors** (Entities, Tile): one row per thermostat
  (drag handle, picker, remove, edit), the edit button opening the thermostat's page with its
  optional name. It is built on HA's elements (`ha-entity-picker`, `ha-sortable`, `ha-form`),
  already loaded in the card editor dialog. It also gives the card the *Layout* tab of sections
  views (#10).
- **Names as HA's cards have them**: `name` is text or pieces (area, device, entity…), chosen
  with HA's `entity_name` selector and shown with `hass.formatEntityName`, like the Tile card,
  so a name made of pieces follows a renamed area or device. Both are recent (formatting in
  2025.10, the field in 2025.11) and the card supports 2025.1: it checks for them (the function
  on `hass`, the version for the field, which is loaded lazily and cannot be detected) and,
  before, offers a text field and shows a text name or the thermostat's own one.
- **`language` is only set in YAML**: the card follows the user's profile (language and
  formats), like every HA card, none of which offers that option. It also forces the more-info
  block of every card. It stays readable for the configurations that use it.
- **A preview shows what its config says**, not the thermostats last chosen on the device
  (kept for the next visit, shared by the cards): in the *Add card* dialog every thermostat is
  there but only the first is shown, and in the card editor the *show every thermostat* switch
  is seen. A choice made in a preview is not kept. HA marks the cards it previews (`preview`)
  except in the *By card* list, recognized by its `hui-card-picker`.
- **What a thermostat does now goes in a card of its own**, not in the schedule card (#39). The
  schedule card is made to edit schedules. "Why is this room heating, until when, and can I
  change it for now?" is asked every day, often on a phone, next to the room's other cards: so
  the thermostat card holds one thermostat and users place it in their own dashboards, like HA's
  Tile or Thermostat cards. A *Now* view in the schedule card, with a line per thermostat, was
  tried first and dropped: it made the schedule card do two jobs, and could not be placed next
  to a room's lights. The thermostat card reuses the block of the more-info dialog (why and
  until when, today, the temporary setpoint, the week): one piece of code, the same in both.
  The schedule card's chips no longer show temperatures: their length changed with the state,
  so they wrapped and moved the card.
- **Everything a card names opens in Home Assistant** (#39): thermostats, a schedule's switch,
  the active-schedule select, a thermostat's own entities (*Control*, *Override*, *Planned
  preset*) and devices. Users build automations, dashboards and history on these entities; a
  card that names them without reaching them sends users searching the entity list. Entities
  open in their more-info dialog (`hass-more-info`, like HA's tiles); a device in its page,
  for admins only (non-admins cannot open settings pages). The integration tells the cards the
  ids of its entities: a thermostat without a device has entities named after it, not attached
  to it, that the card cannot find otherwise. What opens looks like a link (dotted underline),
  since a finger cannot hover it.
- **A cell of the *Presets* view says what it is, in words**: "its *Comfort* preset", "set
  here", "default", under the temperature. Symbols (`⟲`, `●`, grey) with a key under the table
  had to be learned, and could not be read at a glance on a phone. A preset's header holds all
  of the preset (name, color, default temperature), and deleting is a button of its own with
  its confirmation, not a checkbox applied by *OK*.
- **Unsaved edits are said where the user is**: a bar sticky at the bottom of the window, not
  disabled buttons at the foot of a card several screens long (edits of Monday, Save after
  Sunday). A switch of schedule tab keeps the edits (they are saved together), and the bar
  stays.
- **A time field is a text field masked by Maskito, not `<input type="time">`** (#63). A
  browser shows its time input in the format of its own language, and a page cannot change it:
  an English browser showed "8:30 AM" to a user whose profile says 24 hours. A list of times
  was tried first: it followed the profile, but it was slow to use, and it could not offer
  every minute for the end of an override. HA's own `ha-time-input` is only loaded on the pages
  that need it, and it is not a public API. So the card uses a text field, masked by
  [Maskito](https://github.com/taiga-family/maskito): "1225" gives 12:25, and AM / PM on a 12 h
  clock. Maskito is a tested, maintained library (Apache-2.0); its own masking code would have
  been the hardest part to write and test here.
  - **Maskito is copied in `frontend/vendor/`**, its core and its time mask only (22 kB), as
    esm.sh builds them: the card has no build step. `scripts/vendor-maskito.sh` downloads them
    again, with the license. Once the card is bundled (roadmap), Maskito becomes a dependency.
  - **The time is applied on Enter or on leaving the field**, not at each key: the card is not
    redrawn while a time is typed. Tab to the other time field applies the time once that
    field has the focus, so that the redraw waits instead of replacing the field being typed in.
  - **The small arrows and the arrow keys**, like those of `<input type="time">`. The small
    arrows move the time by the step, and are out of the Tab order. The arrow keys move the
    hours by an hour and the minutes by the step: Maskito's own step moved the hours by the step
    too.
  - **The end of an override is typed to the minute**: it needs no step, unlike the slots.

## Process

- **Tests first, and the tests are the documentation** (CONTRIBUTING.md, "Tests first"); every
  behavior test runs on the three kinds of thermostats.
- **A change to the stored data or the installation goes through a beta** installed on a real
  installation before the release.
- **The minimum Home Assistant stays as low as possible** and only rises when a Home Assistant
  API requires it (CONTRIBUTING.md, "Supported Home Assistant versions"): a heating schedule is
  set up once and its HA is often not updated every month; dropping it for a version number
  would cost users more than testing several versions costs us. The tests run on the minimum,
  one version per quarter since (not every month: enough to catch an API that comes or goes, for
  a few jobs), the latest release, and every week on the beta (never blocking). The first minimum
  (2026.9) was only the version tried then; it went down to 2025.1 by replacing APIs that were
  only conveniences (`async_entity_id_to_device`, `async_loaded_entries`,
  `last_updated_timestamp`, `AddConfigEntryEntitiesCallback`) and attaching the sensors to the
  thermostat's device through `device_info` before 2025.8. 2024.10 would need a second
  options-flow code path and a recorder that behaves differently: not worth it for now.
- **One vocabulary** ([glossary.md](glossary.md)), in the UI, the docs, the code and the data.
- **Version 1.0** once ha-chauffage works with groups of thermostats and any thermostat.
- **A new development HA starts with a simulated week of history** (dev/sim_rooms): the
  *History* of the card, the demo and any work on heating curves need days of data, and HA's
  recorder has no API to write the past. The week is written once, through the recorder's own
  models and thread (internal APIs, acceptable for a dev-only tool that follows HA stable), with
  the same thermal model as the live simulation. That model has inertia everywhere (radiator,
  air, walls, sensor) and random but plausible disturbances: regular sawtooth curves and
  straight slopes looked fake.
- **Coverage is a floor, not the goal** (97 % for the integration, 95 % for the card). 100 % of
  the lines does not mean that every use case is covered. The use cases
  ([use-cases.md](use-cases.md)) say what to test. The coverage floor only catches code that no
  test runs.
- **A release may drop the current overrides instead of migrating them.** An override lasts a
  few hours. Losing one costs the user less than a migration costs us: the thermostat goes back
  to its schedule. The changelog says so.
- **The card works on phones, by touch, from 360 px wide.** Users often open the card in the Home
  Assistant app on their phone. So no information is only shown on
  hover, and no action needs a mouse or a keyboard.
- **The docs are written for the reader** ([writing-style.md](writing-style.md), #53). The
  README and CONTRIBUTING read like generated text: packed sentences, chains of colons and
  semicolons, every case in parentheses, and French translated word by word. The writing guide
  gives the rules and examples, mainly for AI edits, where this style came from. CONTRIBUTING
  says what to do, and this file says why.
