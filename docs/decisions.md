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
  deliberate extra for its users.

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

Being worked on ([#27](https://github.com/armellarcier/ha-chauffage/issues/27)): until it is
released, a thermostat is scheduled as long as it has weeks, and the card saves the weeks of every
thermostat it loaded.

- **The integration keeps the list of scheduled thermostats; the cards only show them.** A card
  saved the weeks of every thermostat, so the thermostats in its configuration did not say which
  ones were driven: one removed from the card stayed driven (#27). A card cannot decide either:
  a user may have several cards (one per floor), a thermostat may be in two of them, and
  removing one from every card does not mean its schedule should be lost. Like HA's entities,
  hidden (not shown) is not disabled (not running). This follows the Scheduler component (the
  integration owns the schedules, which can be disabled, the cards show and filter them) and
  Climate Scheduler (entities picked to be scheduled, a schedule turned off without losing it).
- **A scheduled thermostat is stored data, not a device or an entity**: a `climate` entity and
  what Chauffage knows about it (weeks, values of the presets, learned temperatures, paused or
  not, the cards that show it), by its entity id. It is seen in HA through the entities made for
  it (a switch, two sensors), attached to the thermostat's device like HA's own helpers; a
  device of ours per thermostat would double the devices and put the living room's settings
  somewhere else than the living room's thermostat.
- **Adding a thermostat in a card schedules it**, active, with the default week: no list to
  fill in, no step before the card works.
- **Paused: kept, not driven.** A paused thermostat keeps everything; Chauffage sends it
  nothing, does not turn manual changes into overrides and drops its current override; its
  sensors are unavailable. Resuming realigns it at once. Paused is not *off*: off is the
  thermostat turned off by someone, which Chauffage already respects; paused is Chauffage not
  driving, whatever the thermostat does (a room run by hand for a few days, the end of the
  heating season, a test). **Forgetting** it is another action, which drops its data.
- **A switch per scheduled thermostat (*Scheduling*)**, on: active, off: paused. A configuration
  entity (`entity_category: config`), enabled by default: on the device's page with its
  settings, in automations, not in the generated *Overview* dashboard nor exposed to Assist. No
  service for pausing (the switch is enough), none for forgetting (dropping data is chosen in a
  repair or the card).
- **In the card, a paused thermostat stays**, marked paused with a *Resume* button; its weeks
  can still be edited (to prepare the return), saving does not resume it; no override can be
  set on it.
- **Each card declares the thermostats it shows** (`chauffage/card/declare`), when it is first
  shown, not in a preview: HA tells a card its configuration, not when the dashboard is saved.
  A Lovelace card has no id, so the visual editor writes a hidden `card_id` in its
  configuration. The integration does not read the dashboards: their storage is internal to
  Lovelace, and YAML or generated dashboards would be missed.
- **A repair proposes to pause an active thermostat no card shows any more**, with a menu:
  pause, keep driving, forget; it closes by itself when a card declares the thermostat again
  (a dialog cancelled, the thermostat added back). A repair waits for an answer in
  *Settings → Repairs*, instead of a question asked while the card is edited. Raised when a
  card declares its list without a thermostat that no other card has; as a safety net (a card
  deleted, written in YAML without an id, duplicated with its id), when an active thermostat
  has not been shown for days while others have (relative, so that nobody opening a dashboard
  for a week flags nothing). Paused thermostats raise none: they drive nothing.
- **A repair for a thermostat whose entity is gone** from HA: forget it, or keep it (an entity
  made again with the same id).
- **A renamed `climate` entity is followed**: the integration listens to the entity registry
  and moves the thermostat's data, its declared cards and its entities to the new id; the card
  uses the new id the integration gives for one still in its configuration.
- **Saves send the weeks of the thermostats edited**, each with its own revision: two cards
  showing the same thermostat cannot overwrite each other, and do not block the others.
- **Stored per thermostat** (`thermostats: {climate: {paused, weeks, mapping,
  preset_temperatures, revision, shown_at}}`), and per card (`cards: {card_id: {thermostats,
  seen_at}}`, a declaration replacing the card's list). The overrides stay apart: short-lived, a
  release may drop them. Migrated from the current keys, nothing changing on upgrade: a
  thermostat with weeks is active; one with only values of the presets was not driven (left
  behind when it was removed from the card), it is kept, paused. Ready for groups of thermostats (roadmap), whose weeks would be owned by a group.

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
