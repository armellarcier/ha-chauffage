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
  **Amended by #57**: the settings move from the card to the Chauffage panel,
  which reuses the card's views. The options flow keeps its single form. See
  [The panel](#the-panel).

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
  **Superseded by #57**: each scheduled thermostat now gets a device of ours,
  including a thermostat without a device of its own. The reason is an address for its weeks
  without injecting a block into the more-info dialog. See
  [A device per scheduled thermostat](#devices).
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
  **Amended by #57**: the *Thermostats* view moves from the card to the
  Chauffage panel. The panel reads the dashboards' configurations in the browser, for admins
  only, to say where each thermostat is shown. The integration still does not read them. See
  [The panel's pages](#the-panels-pages).
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
- **The same loading as the integrations that inject into HA's own pages** (#59, 2026-10). Home
  Assistant offers no API to add content to the more-info dialog, so browser_mod and UIX use the
  same kind of injection as Chauffage. Both load their module with `add_extra_js_url`, and add a
  dashboard resource at the same URL for Google Cast. card-mod asks for both too, the resource
  and `extra_module_url`. A plain dashboard resource, the usual way for a card, would leave the
  more-info block without its module outside the dashboards.
- **No fix for the pages served while HA starts, only documentation** (#59, 2026-10). HA serves
  its pages a few seconds before the custom integrations are set up. Such a page lacks the card,
  and the frontend never loads a module added after the page was served, so the card shows
  "Configuration error" until a reload. Every integration that uses `add_extra_js_url` has this
  problem, and none fixes it: a browser_mod user reproduced it by opening the iOS app while HA
  started (thomasloven/hass-browser_mod#941), closed without a fix. A resource at the card's own
  URL would not help, because that URL answers 404 until Chauffage is set up. A `data:` loader
  saved as a dashboard resource worked (PR #60), but it had to poll, guess the card's version and
  could import a stale card after an upgrade: too much for a reload. The real fix belongs to
  HA's frontend, which could subscribe to `frontend/subscribe_extra_js`.
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
  **Amended by #57**: every scheduled thermostat now has a device of ours, so no
  entity is named after its thermostat any more. The integration still tells the cards the ids of
  its entities. See [Devices](#devices).
- **A cell of the *Presets* view says what it is, in words**: "its *Comfort* preset", "set
  here", "default", under the temperature. Symbols (`⟲`, `●`, grey) with a key under the table
  had to be learned, and could not be read at a glance on a phone. A preset's header holds all
  of the preset (name, color, default temperature), and deleting is a button of its own with
  its confirmation, not a checkbox applied by *OK*.
- **Unsaved edits are said where the user is**: a bar sticky at the bottom of the window, not
  disabled buttons at the foot of a card several screens long (edits of Monday, Save after
  Sunday). A switch of schedule tab keeps the edits (they are saved together), and the bar
  stays. **One save for every schedule of the card**: the user cannot miss a *Save* because
  the tab shown is not the schedule edited. A thermostat's sheet in the panel is different: its
  weeks are all shown at once, and each save bar sits under the week it saves (see
  [The panel's pages](#the-panels-pages)).
- **A time field is a text field read by the card's own parser, not `<input type="time">`**
  (#63). A browser shows its time input in the format of its own language, and a page cannot
  change it: an English browser showed "8:30 AM" to a user whose profile says 24 hours. The
  field shows the time with Intl, like the rest of the card, and `parseTime()` reads it when it
  is left: "1225", "12:25", "12h25", "7", "7p", "7:30 pm", or the words of the user's language
  for AM and PM.
  - **Tried and dropped: a list of times.** It followed the profile, but it was slow to use,
    and it could not offer every minute for the end of an override.
  - **Tried and dropped: the Maskito library**, which masks the field while it is typed. The
    card has no build step, so Maskito had to be copied, minified, in the card's folder: no
    dependency tool would see it, and its import could stop the card and the more-info block on
    every page if it failed to load. A parser of the times people type, read when the field is
    left, is a few dozen lines and is tested here. Maskito can come back once the card is
    bundled (roadmap).
  - **Not HA's own `ha-time-input`**: it is only loaded on the pages that need it, and it is
    not a public API.
  - **The number keypad on phones, on a 12 h clock too.** A time typed without AM / PM keeps
    the period of the field, so the letters are not needed.
  - **The time is applied on Enter or on leaving the field**, not at each key: the card is not
    redrawn while a time is typed. Tab to the other time field applies the time once that
    field has the focus, so that the redraw waits instead of replacing the field being typed in.
  - **The small arrows and the arrow keys**, like those of `<input type="time">`. The small
    arrows move the time by the step, and are out of the Tab order. The arrow keys move the
    hours by an hour, the minutes by the step, and AM / PM by 12 hours. The hours and the minutes
    are the first two groups of digits, because the separator depends on the language: "08:30",
    "08.30" in Finnish.
  - **A time field is as wide as the longest time of the profile's format**, for example
    "10:45 PM" or "10:45 p. m.". A fixed width would cut the longer formats, or push the
    popover's close button to a second row with the shorter ones.
  - **The end of an override is typed to the minute**: it needs no step, unlike the slots.
  - **The arrows move the end of an override by as much**, not to the next time it is that
    time of day: an end moved before now would jump to tomorrow, and an end in three days would
    come back within a day. A time typed is still the next time it is that time.
  - **On a 12 h clock, a time typed without AM / PM keeps the period of the field**: "0715" in
    a field at "06:00 PM" means 7:15 PM. Except 12, which is noon: "1230" in a morning field
    means half past noon, not half past midnight.

## Chauffage panel and devices (#57)

These decisions come from [#57](https://github.com/armellarcier/ha-chauffage/issues/57), first
tried as a prototype, then tested (version 0.8.0-alpha.1). Their use cases and tests are in
[use-cases.md](use-cases.md#chauffage-panel-and-devices-57). When a decision here reverses an
older one, the older one says so.

### Devices

- **A device per scheduled thermostat.** This reverses "A scheduled thermostat is stored data, not
  a device or an entity" (see "Scheduled thermostats"). The scheduled thermostat stays stored
  data, keyed by its `climate` entity id. Home Assistant shows it through a device of ours. The
  reason is an official address for a thermostat's weeks. Without this device, the only way to
  reach the weeks outside a dashboard was the block injected into the more-info dialog. Home
  Assistant has no extension point for that dialog, so the injection breaks silently when Home
  Assistant changes it.
- **The device's name is the thermostat's name.** The device takes the name of the thermostat's
  state. At startup, the state may not exist yet. The device then takes the name of the
  thermostat's registry entry, else the name of the thermostat's device, else the entity id.
- **The device's model says what it is**: *Scheduled thermostat*, or *Thermostat programmé* in
  French. Home Assistant does not translate device models, so the integration picks the model in
  Home Assistant's language. The manufacturer is *ha-chauffage*.
- **The device goes in the thermostat's area.** The integration suggests the area of the
  thermostat's entity, else the area of the thermostat's device.
- **The device is connected via the thermostat's own device.** Home Assistant's page of the
  thermostat's device then lists our device under *Connected devices*. Our device's page shows
  *Connected via* the thermostat. From Home Assistant 2026.10, the device names its parent by the
  parent's id (`via_device_id`); before, by one of the parent's identifiers (`via_device`,
  deprecated in 2026.10, it stops working in 2027.8).
- **The device's *Visit* button opens the thermostat's sheet in the panel.** The device's
  `configuration_url` is `homeassistant://chauffage/thermostats/<climate>`.
- **Forgetting a thermostat removes its device.**
- **At setup, Chauffage keeps only its own devices**: the service device and one per scheduled
  thermostat. A device of a thermostat renamed or forgotten while Home Assistant was stopped goes
  (a rename reloads the integration, so a renamed thermostat's former device goes at once). So
  does what 0.7 left on a thermostat's own device: before HA 2025.8, 0.7 attached its entities
  through the thermostat's device, so HA listed Chauffage among the device's integrations; from HA
  2026.8, HA split that into a device of Chauffage of its own, with the thermostat's identifiers.
  A device that still holds an entity of Chauffage is never touched.
- **Upgrading from 0.7 changes no stored data** (storage version 6 before and after). The
  entities keep their ids, their names and their settings, and move to the new device. Checked on
  a real upgrade of a development HA, from 0.7.0-beta.4 to 0.8.0-alpha.3. One visible change: an
  entity of a thermostat without a device of its own is now named after the new device, for
  example *Cuisine Pilotage* instead of *Pilotage Cuisine*.
- **A thermostat without a device of its own also gets one**, for example a `generic_thermostat`
  written in YAML. Every scheduled thermostat works the same way. So the entity names "*X* of
  *thermostat*" (the `*_of` translation keys) and the Home Assistant version switch
  `DEVICE_ENTRY_ATTACHES` are gone.
- **Entity ids and unique ids do not change.** Only their device changes. Dashboards and
  automations that target the entities keep working.

### The panel

- **A *Chauffage* panel, for admins only** (`require_admin=True`). Every change of the websocket API
  needs an admin, except activating a schedule. Home Assistant's device pages are also for admins
  only.
- **The panel's sidebar icon is our own icon**, `chauffage:logo`. The card's JavaScript registers it
  in `window.customIcons`. The icon is drawn from the brand icon: bars of slots and a clock. The
  icon does not depend on the integration's name, which may change. The limit: if the card's
  JavaScript does not load, the icon is empty.
- **The sidebar entry is an option, on by default** (*Show Chauffage in the sidebar*). An
  integration should not force an entry into the sidebar. Out of the sidebar, the panel is
  registered without a title or an icon: Home Assistant shows no entry for a panel without a
  title, on every supported version, as for its own *Profile* panel. The panel keeps its
  addresses, so the cards' links and the devices' *Visit* button still open it.
  - **Not `show_in_sidebar`**: Home Assistant 2025.1 does not have it.
  - **Not only the user's own setting**: each user can hide an entry from the sidebar, but on
    each browser, one by one.
- **Dashboard cards are for everyday use. The panel is for configuration.** The schedule card no
  longer has the *Presets*, *Rules* and *Thermostats* views. Admins see three links to the panel's
  pages in their place.
- **The schedule card keeps its week editor**, and the panel has one too. The card is the only
  place that compares the weeks of several thermostats side by side: a card is a group of
  thermostats that the user chose to show together, for example the bedrooms. The panel shows one
  thermostat, or one schedule for every thermostat.
- **The panel has lists, then sheets**, as Home Assistant's settings do. A list has the panel's
  tabs: *Thermostats*, *Schedules* and *Presets*. *Thermostats* comes first (0.8.0-alpha.2):
  everything starts from a scheduled thermostat, and a new user starts there. A sheet is about one schedule or one
  thermostat. A sheet has no tabs. Its title is a breadcrumb, for example "Thermostats ›
  Bureau", where "Thermostats" links to the list. A sheet keeps Home Assistant's menu button.
- **Rejected: tabs on the sheets.** A selected tab would change the page, and the sheet would have
  two ways back. Tabs also say that the content is the tab's. On a phone, the sheet would show
  two bars. Home Assistant does not do it.
- **Rejected: a back arrow and a breadcrumb.** The sheet would have two ways back.
- **Rejected: an *Overview* page.** Showing what the home does now is the dashboard cards' job.
- **The activation rules are on the *Schedules* page**, below the list. The rules decide which
  schedule is active.

### The panel's addresses

- **One address per page.**

  | Address | Page |
  |---|---|
  | `/chauffage` | Redirects to `/chauffage/thermostats`, the first tab |
  | `/chauffage/schedules` | The schedules and the activation rules |
  | `/chauffage/schedules/<id>` | A schedule's sheet |
  | `/chauffage/thermostats` | The scheduled thermostats |
  | `/chauffage/thermostats/<climate>` | A thermostat's sheet |
  | `/chauffage/presets` | The presets |
  | `/chauffage/rules` | Redirects to `/chauffage/schedules` |
  | `/chauffage/<climate>` | The first prototype's address: redirects to `/chauffage/thermostats/<climate>` |

- **A deleted schedule's sheet goes back to the list of schedules.**
- **A thermostat's address uses its `climate` entity id**, not a device id. The entity id is the
  scheduled thermostat's key in the storage, the services and the websocket API. A user can read
  it, and write it in an automation. The entity id stays the same if the device is created again.
  The downside: renaming the `climate` entity changes the address. So the address of a renamed
  thermostat redirects to its new id, through the store's `renamed`.

### The panel's pages

- **The *Thermostats* page: one row per scheduled thermostat**, sorted by name. A row shows the
  thermostat's name, which opens its sheet. A badge says *Controlled* or *Paused*. The row says
  where the dashboards show the thermostat, then gives the *Pause* or *Resume* button. The rarer
  actions wait behind ⋮: open the thermostat, open its devices, forget it.
- **Devices are named by their name and model everywhere**, for example "Bureau (Thermostat
  programmé)", in the ⋮ menu of the *Thermostats* page too. The labels "Its Chauffage device" and
  "The thermostat's device" are gone: the model says which device is which.
- **Any thermostat can be forgotten from the panel**, after a confirmation. The panel is not a
  card, so "not in this card" no longer limits forgetting.
- **"Shown in *dashboard* › *view*" is read from every dashboard's configuration, in the browser.**
  The panel walks the stacks, the sections and the conditional cards. This amends "The integration
  does not read the dashboards either" (see "Scheduled thermostats"): the integration still does
  not, the panel does, for admins only. Home Assistant's generated dashboards have no
  configuration, so they show no placement. A change of a dashboard needs a page reload.
- **"Schedule another thermostat" on the *Thermostats* page.** The admin picks a `climate` that
  Chauffage does not schedule yet, then *Schedule*. Chauffage saves it with the week of a new
  schedule in every schedule, as adding it to a card does.
- **A thermostat's sheet starts with a header.** The header shows Home Assistant's own tile card for
  the thermostat: the current temperature and what the thermostat does. A tap on the tile opens
  the thermostat. The header also shows the *Pause* button, "Shown in", and "Devices: *name*
  (*model*)".
- **The tile is top right, aligned with the surface below.** On the left, the header shows "Shown
  in…", "Devices: …" and the *Pause* button. On a phone, the tile comes first, above the rest.
- **The *Pause* button does not move when it turns into *Resume*.** The badge comes after the
  button, not before it.
- **The header always says whether Chauffage controls the thermostat**, with a badge after the
  button: *Controlled* (green) or *Paused*. *Paused* stands out (the warning color, bold): the
  thermostat then runs by hand, and the user must see it at a glance.
- **A paused thermostat's sheet says it is paused once**, in its header. The weeks stacked below
  do not repeat the card's note "… is paused: Chauffage does not control it · Resume" (card
  option `paused_note: false`). The weeks stay dimmed, as in the card.
- **The tile card relies on an internal of Home Assistant's frontend.** Outside a dashboard, Home
  Assistant's card helpers do not exist yet. The panel loads the dashboards' code to get them
  (`cardHelpers`), so the tile may break when Home Assistant changes that code.
- **Then the sheet shows one surface**, in this order:
  1. The thermostat's presets, side by side: for each preset, its color and name, its value on
     this thermostat and where the value comes from. They are the legend of its weeks. The
     presets' definitions stay on the *Presets* tab.
  2. Its weeks, one per schedule, stacked, under the heading *Weeks* (*Semaines*). Each week's
     heading is the schedule's name, a link to its sheet, with an *Active* badge on the active
     schedule.
- **The heading is *Weeks*, not *Its weeks*** (the `weeksTitle` key). The possessive read badly.
- **A thermostat's presets are a row of items, not a table of one row** (after 0.8.0-alpha.2). A
  table with a single row only repeated the table's headers. The items sit side by side and wrap:
  four on a computer, two per line at 360 px, with no horizontal scroll. An item opens the same
  editor as a cell of the *Presets* table.
- **On a thermostat's sheet, copying a week starts from the week it copies.** Each week's heading
  has a *Copy to…* list (*Copier vers…*) of the other schedules. The list copies this thermostat's
  week in this schedule to the schedule chosen. The card's list at the foot of the weeks ("Copy
  Bureau's week to…", every thermostat in every schedule) does not fit a page about one
  thermostat, so the sheet hides it (card option `copy_week: false`). A schedule's sheet and the
  dashboard card keep that list.
- **Copying week A to schedule B asks to save B, never A.** The copy lands in B's week at once,
  unsaved: B's save bar appears, with the message "The *Normal* week copied here". Week A is not
  touched. If A has edits not saved yet, the copy takes A as shown, and A keeps its own edits.
  The prototype first put the copy in A's card: A's save bar asked to save A, and saving it in
  fact saved B.
- **A week stacked on a thermostat's sheet has no foot**: no legend, no copy list, and no empty
  message line. So the sheet shows no empty space under each week.
- **On a thermostat's sheet, today stands out only in the active schedule's week** (card option
  `today: 'active'`). The weeks of the other schedules do not mark today. A schedule's sheet and
  the dashboard card still mark today.
- **One *Group days* switch for all the weeks of a thermostat's sheet.** The switch shares its
  choice with the cards. The choice is kept in this browser. The editing hint is shown once.
- **A thermostat's sheet has the card's two switches, *Group days* and *History*** (0.8.0-alpha.2),
  for all its weeks. As on the card, the history shows each day, so grouping the days hides it.
  Both choices are the ones the cards keep in this browser. The alpha.1 had no *History* switch:
  a history turned on in a card showed on the sheet, and the days could not be grouped any more.
- **A day copied in one week can be pasted in any other week of the page**, for example from
  *Normal* to *Away* on a thermostat's sheet, or from one dashboard card to another. Every card
  reads the copied day when it is used, from this browser's storage. The alpha.2 read it once,
  when the card was drawn: the other weeks of a sheet offered nothing to paste. A new copy
  replaces the one before it, and only the day copied last stands out (dotted) in every card:
  the place of the copied day is kept with the copy, not in the card that copied it.
- **In the panel, the sheet's `group_days` wins** over the choice kept in the browser. The
  prototype first did the opposite, and the switch did nothing.
- **A schedule's sheet shows every thermostat's week in this schedule.** It shows this schedule's
  tab only, with its ⋮ menu (rename, copy, delete), and no "+".
- **The *Schedules* page lists each schedule**, with an *Active* badge, *Activate* and *Edit*.
  "+ New schedule" opens a name field in the list.

### Welcoming a new user (0.8.0-alpha.2)

- **A new user goes to the panel first, with no thermostat scheduled yet.** The panel must not
  show an empty page. Its *Thermostats* page welcomes the user instead, and leads them to
  schedule their first thermostats.
- **The welcome says what Chauffage does, in three steps**: choose the thermostats, set their
  weeks, then add a card to a dashboard for every day.
- **The welcome lists every `climate` entity, none ticked.** The user ticks the thermostats to
  schedule, then *Schedule N thermostats*. Nothing is ticked at first, because scheduling a
  thermostat controls it at once: it follows the week of a new schedule (eco all week). The
  welcome says so before the button. A heat pump or an air conditioner may be a `climate` too,
  and the user may not want Chauffage to control it.
- **With no `climate` entity at all**, the welcome says that Home Assistant has no thermostat
  yet, and links to Settings → Devices & services to add one.
- **Once the first thermostats are scheduled, the page says what to do next**: open a
  thermostat to set its weeks and its presets, add the *Heating schedules* card to a dashboard.
  The next steps stay until the user closes them; this browser remembers it.
- **Before the first thermostat, the *Schedules* and *Presets* pages say so**, with a link to
  the *Thermostats* tab. Their content stays: a user may create schedules first.

### The more-info block

- **The block injected in the more-info dialog stays.** See [The UX review](#the-ux-review-080-beta2).
- **The block's link to the thermostat's sheet says "Open in Chauffage"** (*Ouvrir dans
  Chauffage*, the `openInPanel` key). "Chauffage" is the panel's title as Home Assistant shows it
  in the sidebar, so the link follows a renamed panel or integration.
- **A link from the more-info dialog to a page closes the dialog first**, then opens the page
  (`leaveMoreInfo`). The page is, for example, the thermostat's sheet or a device. Home Assistant
  keeps the open dialog in the address (`?more-info-entity-id=`), and closes the dialog by going
  back in the history. So the page opens only once the dialog has left the address. Otherwise,
  going back undoes the navigation. The prototype first had this bug: the dialog stayed open, and
  the page did not open.

### The UX review (0.8.0-beta.2)

A review of every surface, before the merge into `main`, settled these choices.

- **One role per surface.** The schedule card is for every day, on a group of thermostats. The
  thermostat card and the more-info block are for one thermostat, now. The panel is for
  configuration. The devices and the entities are for automations, voice and Home Assistant's
  history: no user path needs them.
- **The more-info block stays, lighter.** Its foot keeps *Open in Chauffage* (admins only, as the
  panel) and *Pause*. The links to the *Control*, *Override* and *Planned preset* entities and to
  the device go: the device's page lists them, and the panel's sheet links both devices. The
  block keeps its preset chips and its temperature field: on a thermostat without presets, they
  are the only way to pick a Chauffage preset.
- **A pause ends with *Control*** (*Piloter*), the name of the switch. "Resume" stays for the
  override only (*Resume the schedule*), so the block never shows two "Resume" buttons.
- **A thermostat chip keeps its ↗ link to the more-info dialog.** With one thermostat shown, it
  is the only link to the thermostat. Its tap area grows on a touch screen.
- **A tap on a chip shows that thermostat only**, like a switch. *Multiple* stays the way to show
  several thermostats.
- **The schedule card's link to the settings sits in its presets legend**, for admins: *Set the
  presets*. The card had three links (*Presets*, *Rules*, *Thermostats*) at its top, in another
  order than the panel's tabs. The legend showed the presets without saying where to set them.
- **Two ways to schedule a thermostat stay**: adding it to a card, or the panel. Removing one
  would gain little.
- **A ⋮ button always opens a floating menu**, as in the card. The panel's list of thermostats
  unfolded a row of actions instead. A row of this list opens the thermostat's sheet, and its
  badge only says *Paused*, the exception.
- **A week is copied from a ⋮ menu**, not from a list that acts as soon as an option is picked.
- **One save bar for a thermostat's sheet.** It names the weeks not saved yet, and saves them in
  one call. On a phone, a bar under a week further up the page went unseen. A copy still marks
  only its target week as not saved.
- **Every user can set, change and end an override from a card.** The `chauffage.set_override`
  and `chauffage.clear_override` services were already open to every user, and anyone can turn
  the thermostat's knob. The websocket command keeps its format: only its permission changes.
- **One word for each thing**, as the glossary says: *override* (*dérogation*), not "temporary
  setpoint"; *slot* (*créneau*), not "plage"; the panel's *tabs* (*onglets*).
- **The card's panel-only options are internal.** The panel passes them to the card in its own
  key, not as options a dashboard could set.

### Open questions

Settle these questions before the panel and the devices are released.

- **Existing installations.** The cards lose their *Presets*, *Rules* and *Thermostats* views. The
  entities move to a new device, so automations that target the thermostat's device lose them.
  This needs a changelog entry, a beta, and links to the panel.
- **Two devices with the same name in the same area**: the thermostat's and ours. Should our device
  carry a mark, for example "Bureau (Chauffage)"?
- **The device must follow the thermostat**: a renamed `climate` (the device's identifier holds
  the entity id), a new area, a new name. The prototype does not check these cases yet.
- **The integration's name.** If the name changes, the `/chauffage/...` addresses need redirects.

## Process

- **A prototype records its decisions and use cases as it goes**, and nothing is committed
  without its tests. The decisions go in this file, the use cases in
  [use-cases.md](use-cases.md), marked *pending* until their tests exist.
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
  With #57, the sensors are on a device of ours on every Home Assistant
  version, so the switch at 2025.8 (`DEVICE_ENTRY_ATTACHES`) is gone. See [Devices](#devices).
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
