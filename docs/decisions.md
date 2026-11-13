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
  when the next eco slot starts. **Amended by #83**: the end of a change by hand is computed
  from the next slot when the override starts (see below). Once computed, the end is an end like
  any other, and a slot change still never ends an override.
- **The user chooses how a change by hand ends** (#83). A fixed duration fails in a common case:
  the living room raised at 21:30, during a comfort slot that ends at 22:30, heats until 23:30.
  A classic thermostat keeps a change until the next scheduled change, but that rule fails in
  another case: the office turned up at 18:30, whose next slot is at 6:00, heats all night. No
  rule suits every home, so the setting *End of overrides* has three choices: the
  override duration (`duration`), the next slot within the duration
  (`next_slot_within_duration`), and the next slot however far (`next_slot`). The setting only
  sets the end of a change detected on the thermostat. An end chosen on the card, in the panel or
  given to `chauffage.set_override` is the user's choice, so it stays: an override set until
  tomorrow 18:00 must hold through the night's slots.
  - **The default is the override duration**, the behavior before #83. Existing users see no
    change after the upgrade, and a user who wants the next slot chooses it. The value names
    say what the end is, so a fourth choice can come without renaming the others.
  - **A slot starting less than 15 minutes after the change does not count**, with both
    next-slot choices. Raised at 17:50, with comfort at 18:00, the override would last 10
    minutes: the user would see their change undone at once. The next slot that changes the
    target counts instead. 15 minutes is the step of the duration's arrows: a shorter minimum
    would undo a change made a few minutes before a slot, a longer one would skip short slots.
  - **A slot giving the same target as the slot before it does not count.** Such a slot changes
    nothing on the thermostat, so it is not a "scheduled change". The target is compared on
    this thermostat: two presets at the same temperature give the same target. The same preset
    on both sides of midnight is one slot.
  - **Without a next slot, *Until the next slot* keeps the change a week.** A week on a single
    preset has no slot that changes the target. The change should then last until the user ends
    it, or until the thermostat goes back to its slot. An override without an end would touch
    every reader of the override: the stored data, the scheduler that ends overrides, the
    card's timeline and time field, the *Override end* sensor, the events, the logbook and the
    services. A week is long enough to mean "until you end it" in a home, and every reader keeps
    working. The override says why it ends then: `no_next_slot`, shown as "no slot ahead".
  - **The end is computed once, when the override starts, from the active schedule.** A schedule
    activated later, or the setting changed later, does not move the end. Recomputing it would
    make the end of an override jump without anyone touching the thermostat, and the stored end
    would no longer be the truth. A new change by hand computes a new end.
  - **One setting for every thermostat, read through one function that takes the thermostat**
    (`manual_override_end_of`). Some users will want a setting per room, for example 30 minutes
    for the bathroom. A setting per thermostat can then come without changing the rule. Not
    before a request: a choice per thermostat is one more thing to understand.
  - **The override says why it ends then**, in an optional `ends_at` key: `duration`,
    `next_slot` or `no_next_slot`. The key is optional, so the stored format needs no migration:
    an override stored before #83 simply shows no reason. An end changed on the card drops the
    key, because the end is then the user's choice. A new value keeps it, with the same end.
  - **The reason is part of the end, in words**: "today, at the next slot", "today, 2 h after the
    change", "in a week, no slot ahead". A first version listed "today · after 2 h · 2 h 00 left":
    three fragments, and the duration twice. "then Eco (schedule)" keeps one form, with or
    without a reason. A time left over a day counts in days, "7 d left". The same line serves
    the card's popover, the more-info dialog and the thermostat card. For an administrator, a ⚙
    after the reason shows on a phone that the words open the settings.
  - **The reason leads to the setting.** Existing users never see the panel's next steps, and
    the surprise happens on the override. So for an administrator the reason is a link that opens
    the settings dialog. A user who is not an administrator cannot change the settings, so the
    reason stays plain text. Existing users also get a one-time notice on the *Thermostats* tab.
  - **"Until the next slot", for one override.** A user who wants one change to last the
    afternoon should not have to change the setting for every thermostat. The button shows the
    time, "Until 17:30 (next slot)", so that it is not mistaken for the setting, and so that the
    user sees it may shorten the override. It is hidden when the override already ends then,
    compared to the minute. The integration computes the next slot, in Home Assistant's time
    zone, and publishes it for each thermostat with the planned preset. The card shows that
    instant and sends exactly it, with `ends_at: next_slot`. A first version computed the next
    slot in the browser, so a phone in another time zone sent a wrong instant. The integration
    keeps the reason only if the end really is the next slot: the reason is never taken on trust
    from the card.
  - **The logbook and the events say why.** The started line ends with "(changed by hand, until
    the next slot)", and an expired change by hand ends with "override ended at the next slot"
    rather than "(expired)". The events carry `start` and `ends_at`, so the logbook can say "after
    2 h" without reading the stored data.
- **The settings of overrides live in the options, the panel and two entities** (#83). Users
  did not find the override duration, three clicks away from the card in the integration's
  options. The settings dialog shows both settings, with the user's own duration in the labels.
  The *Chauffage* device gets two configuration entities, the select *End of overrides* and the number
  *Override duration*, so a dashboard or an automation can change them, for example *Until the
  next slot* during the holidays. The options stay the only state: the entities and the panel
  read and write them (see "Entities"), so the options flow, the panel and the entities always
  agree. A change of the options notifies the entities and the cards.
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
- **Thermostats unavailable or overridden are left alone**; one coming back is realigned at
  once. A command that was not delivered is sent again every minute. Commands are spaced out
  (Zigbee networks).
- **The schedule decides whether a thermostat is off** (#91, #96, #77). Before, a thermostat
  turned off was left alone: some integrations turn heating back on when they get a setpoint
  (Tado, evohome, Netatmo), and turned off was the only way to say "no heating". So a thermostat
  turned off at bedtime by a script never came back on in the morning (#77), and a schedule could
  not stop a thermostat (#96). Now a slot can say `off`, in its settings (the optional third
  element of a slot, `["22:00", null, {"hvac_mode": "off"}]`).
  - **The slot chooses the HVAC mode, and the preset says how warm for it.** A slot's settings
    may hold `hvac_mode`: `heat` or `cool` with a preset, `off` or `fan_only` without one. The
    preset's value on a thermostat holds what the preset means when the thermostat heats (a
    climate preset or a temperature) and when it cools (`cool_temperature`), as Versatile
    Thermostat's presets do. The slot's HVAC mode picks which one is sent. A preset and a
    preset's value have no HVAC mode: a value could say "heat" and hold a cooling temperature.
  - **Two models came before this one.** The first one let a preset, a preset's value, a slot
    and an override each set the HVAC mode, the last one winning: nobody could predict what a
    slot would do. The second one put heat or cool on the schedule, and only off on a slot. It
    read well, but a day could not cool in the afternoon and heat in the morning, and a user
    had to copy a schedule to change the season. The owner chose the slot: the week shows every
    choice, where the user already looks.
  - **On an air conditioner, every slot on a preset heats or cools.** This reverses "a slot
    without an HVAC mode leaves the thermostat in the one it has". With that rule a slot had
    three states, *Heat*, *Cool* and "unchanged", and the third one could not be read in the
    week: what the room got depended on what the thermostat did before. The owner chose two
    states. The rule lives in one place on each side: `engine.slot_hvac_mode` in the
    integration, `slotModeOn` in the card. Both read a slot the same way:
    - on a thermostat that lists `heat` and `cool`, the slot's HVAC mode, and `heat` when the
      slot says none;
    - on a thermostat that lists `cool` and not `heat`, always `cool`, whatever the slot says:
      a day pasted from a reversible unit cools;
    - on a thermostat that does not list `cool`, a heater, no HVAC mode at all: the target of
      its slot holds none, and it is turned on as before;
    - on a thermostat whose HVAC modes are not known (unavailable), the slot as stored.
  - **A stored slot without an HVAC mode is read, not migrated.** Stored data of version 6, and
    weeks saved by a development version 7, hold slots that say none. Rewriting them would need
    the HVAC modes of each thermostat, which the migration does not have, and which may change
    (a thermostat replaced). So the rule above applies when a slot is read, and the card writes
    the HVAC mode of every slot of a day the user edits. **This changes the behavior of an
    upgraded installation**: a reversible air conditioner that cools is switched to heat by a
    week that says nothing. The changelog says so under "Upgrading".
  - **A new slot takes the HVAC mode of the slot it comes from**: a slot inserted or cut in a
    slot keeps its HVAC mode. In an off slot or a fan-only slot, it takes the HVAC mode of the
    slot on a preset before it in the day, else heat. A new slot that heated in the middle of a
    summer day would be a surprise.
  - **Each slot is independent**: a slot does not inherit the HVAC mode of the slot before it
    when it runs. It says its own.
  - **A target without an HVAC mode turns on a thermostat that is off or in fan only**: in the
    HVAC mode it last heated or cooled in (learned and stored, as the temperatures of its own
    presets are), else in `heat`, else in its first HVAC mode but off and fan only. Such a
    target is a heater's slot, or an override to a preset set by an automation. Heat came first
    before: an air conditioner that cooled in July restarted in heat on an override to
    *Comfort*. Fan only takes no setpoint, so a preset slot that follows a fan-only slot must
    leave it, as it leaves off. A thermostat that lists no HVAC mode gets its setpoint only.
  - **Chauffage only knows heat and cool.** They are what a slot and an override choose
    between, so they are the only HVAC modes Chauffage learns, restarts a thermostat in, and
    carries a value into. A version learned any HVAC mode: a valve seen once in `auto`
    restarted in `auto`, an air conditioner last in `dry` in `dry`. And `dry`, `auto` or
    `heat_cool` chosen by hand made Chauffage send the slot's heating value. Now such a change
    is recorded as an override to that HVAC mode, and nothing is sent, as before #91.
  - **A temperature belongs to the HVAC mode it was set in.** An override to 22 °C set while
    heating, then cool chosen by hand: the override keeps cool and its end, and drops the
    temperature. 22 °C was never meant as a cooling setpoint. An override to a preset keeps the
    preset: its value when cooling applies.
  - **Scripts and the sensor read the slots as they run.** `chauffage.get_week` and the
    planned-preset sensor give each slot's HVAC mode on the thermostat (`engine.week_on`), not
    the stored one: a script must not have to know the rule. The sensor's `temperatures` are
    the cooling ones during a slot that cools.
  - **A thermostat without fan only is left as it is by a fan-only slot**: the slot has no
    preset to fall back on. The card only offers the HVAC modes the thermostat lists, so this
    only happens to a week copied by an automation.
  - **Switching an air conditioner by hand to another HVAC mode than the slot's is an
    override**, as turning it off is, and as switching it to fan only is.
  - **Heat or cool chosen by hand keeps the value in force.** The person chose an HVAC mode,
    not a setpoint. So the override keeps its preset and its end when the thermostat had one,
    else it takes the preset of the slot, and Chauffage sends that value in the new HVAC mode.
    Before, the override held the HVAC mode alone, and an existing override to *Comfort* was
    left as it was: a Versatile Thermostat then went to its own *Comfort* for cooling (25 °C),
    and the temperature when cooling set in Chauffage (24 °C) was never sent. This is the one
    case where a change by hand makes Chauffage send something: the value is the one planned,
    in the HVAC mode the person asked for. In an off slot or a fan-only slot there is no value
    to keep: the thermostat keeps its own last setpoint.
  - **An off slot has no preset, and Chauffage sends only off.** A first version sent a preset
    with off, as a scene does, and chose the coldest preset so that a thermostat that heats
    anyway heats as little as possible. The preset was hidden: the user could not see it, and
    a thermostat turned on by hand restarted on it, at 7 °C, instead of on its own last
    setpoint. Now an off slot and an off override send `{"hvac_mode": "off"}` and nothing else.
    Two off slots in a row are one slot. An off slot sets nothing else: the fan and the vanes
    mean nothing while the thermostat is off. A thermostat that turns back on when it receives
    a setpoint (Tado) receives none.
  - **A fan-only slot has no preset either.** Fan only takes no setpoint. The slot may set the
    fan and the vanes, under *More settings*. Two fan-only slots in a row are one slot when
    their fan and their vanes are the same.
  - **No rule at midnight.** A night is two slots: the last one of a day and the first one of
    the next day. A version of the card turned off the next morning's first slot when the
    evening was turned off. The rule changed a day the user was not editing, and it could not
    tell a morning the user wants on from one that only continued the evening. Now each slot is
    independent: to keep a room off through the night, turn off both slots. Two off slots
    across midnight give the same target, so nothing is sent at midnight.
  - **An override never ends because a slot meets it.** A version ended an off override when
    an off slot started. An override then had two ends, and the card had to explain the second
    one. An override ends at its end, or when the user puts the thermostat back on what its
    slot plans, as before #91.
  - **A thermostat turned off by hand stays off until the next slot, by default.** The setting
    *End of off overrides* has the three choices of *End of overrides*, and its own default.
    Two hours of off is rarely what a person who turns a radiator off means: they air a room,
    or they leave. The next slot that changes the thermostat is when the schedule would have
    acted anyway. The setting also gives the end of `chauffage.set_override` called with
    `hvac_mode: off` and no end, and of *Off* tapped on the card. The end the user chooses on
    the card or in the service still wins.
  - **Turning a thermostat off by hand during an "on" slot is a manual change**, like a setpoint
    changed by hand: an `off` override, and then the thermostat comes back on, on its slot.
    Turning it on by hand during an off slot is an override too: the thermostat keeps its own
    last setpoint. A
    change by an automation or a script is not an override, as for a setpoint: a thermostat
    turned off by an "all off" script stays off until the next slot that changes something
    (#77). A day's first slot repeats the last slot of the day before in most weeks (eco at
    22:30, eco at 00:00): it changes nothing, so the tick does not apply it, and the thermostat
    stays off until the morning. Before #91, every slot start was applied, which sent nothing to
    a thermostat already on its preset; now it would turn one off back on. Turned back on by
    hand, a thermostat ends its off override at once and gets its slot: what it restarted on is
    not a choice of the user. A preset or a setpoint changed on the thermostat itself while it
    is off is not an override: the thermostat stays off, and keeps what the user set for when it
    is turned on. A preset tapped in the card's override block turns it on (see below).
  - **Chauffage applies a target like a scene**, with Home Assistant's `async_reproduce_state`:
    the HVAC mode, then the setpoint, then the preset, the swing and the fan, in Home
    Assistant's order. Chauffage sends only the attributes the thermostat does not show, and the
    HVAC mode only when it must change. `send()` stays the single path of every command, with
    its reason logged. A thermostat that may still apply an older command (pending) gets the
    whole target.
  - **The device validates the values, not Chauffage.** Chauffage keeps no rule such as "this
    thermostat has no cool": the card offers only the values the thermostat lists, and the
    thermostat decides. Chauffage only checks the shape of its own data: what each layer may
    hold (`model.py`).
  - **The slot's HVAC mode and a preset's cooling setpoint work together.** A preset's value
    may hold a cooling setpoint, `cool_temperature`, next to its heating one. A reversible air
    conditioner wants Comfort at 20 °C in winter and at 25 °C in summer, and the user panel
    refused a second *Comfort* preset for that. The slot says which of the two applies: when
    the target is applied in `cool`, the cooling setpoint replaces the preset and the
    temperature of the target. In `heat`, the cooling setpoint is dropped. The rule lives in
    `engine.complete()`, with the "on" rule, so overrides and slots follow it alike, also when
    the slot does not say and the air conditioner cools by itself.
  - **In cool, Chauffage sends the thermostat's own preset, and never its own heating
    temperature.** Without a cooling setpoint, a temperature is a heating value: a thermostat
    that lists `heat` and `cool` does not get it, so 17 °C never reaches an air conditioner that
    cools. Its climate preset is sent, also the one a preset gets from its name: the device
    knows what its own `eco` means in cool (Versatile Thermostat has AC preset temperatures). A
    version dropped the name-based preset in cool, after a simulated air conditioner cooled to
    17 °C on `eco`. That protected a device with wrong presets, and left every device with
    right ones without a setpoint. A user whose device cools too much on a preset sets a
    cooling temperature for it. An air conditioner that only cools follows the same rule. A
    version sent it the preset's temperature, "the base setpoint": an override to frost
    protection cooled a room to 7 °C. On such a unit a preset without a cooling temperature
    and without a device preset sends no setpoint, and the unit keeps its own. A temperature the
    user typed in an override is their cooling target: sent. The slot popover's *Setpoint* line
    uses the same rule, and reads "Setpoint unchanged" when nothing is sent. The legend, the
    presets table and the cell popover of a unit that only cools show cooling values alone.
  - **What a thermostat's own preset gives when cooling is kept apart.** A Versatile Thermostat
    in AC mode publishes it (`comfort_cool_temp`). For the others, Chauffage learns it while the
    thermostat cools on the preset, in `cool_preset_temperatures`, an optional key of a
    scheduled thermostat: no migration. Before, a setpoint read while cooling was learned as
    the preset's heating temperature. The card shows it as the default of the cooling field:
    "Default (its *Comfort* preset, 25°)".
  - **Each preset has a heat color and a cool color.** A cooling slot is drawn in its preset's
    cool color, in the week, the legend and the chips, with a snowflake. The cool color is
    derived from the preset's color: the hue moves into the blues, in the order of the hues,
    and the shade stays dark enough for white text. So a new preset needs no second choice, and
    a preset whose color changes keeps a matching cool color. The user can choose another one
    in the preset's popover. Only a color the user chose is stored (`cool_color`): the card
    derives the rest, so the integration holds no color rule.
  - **The default presets have cool colors chosen by hand.** Derived by the formula, the four
    default colors gave four blues a few degrees of hue apart. Now the card holds a blue for
    *Comfort*, a dark teal for *Eco*, a navy for *Boost* and a light indigo for *Frost
    protection*: hue and lightness both differ. No purple: a first palette had a violet and a
    purple, the colors of the stripes of an override. A test checks that the cool colors differ
    from each other, from fan only, from every heat color and from those stripes. Any other
    color still uses the formula, whose hues stay between 200° and 250° for the same reason.
  - **Frost protection of a new installation is a blue grey** (`#78909c`). Its light blue
    looked like Home Assistant's cyan of fan only. Existing installations keep the colors they
    stored, and the migration from version 1 keeps the light blue: a color the user sees every
    day does not change in an update.
  - **The legend marks its swatches** with a flame and a snowflake when a shown thermostat
    cools, and gives the cool value after the heat value. Two unmarked squares per preset did
    not say which was which.
  - **Fan only is drawn in Home Assistant's color of fan only**
    (`--state-climate-fan_only-color`, cyan by default), with a fan icon and dark text: white is
    not legible on that cyan. Off stays grey. Both are chips of their own, before the presets.
  - **The slot popover gives the number the slot will apply**: "Setpoint: 20 °C (its *Comfort*
    preset)". A slot never sets a temperature: the preset says how warm, and an override is the
    knob. So the popover must show the number the preset gives, or the user reads "its Comfort
    preset" and has to open another screen to know what the room gets.
  - **"Until tomorrow" for an off override is the next morning**: the first slot of today that
    changes the thermostat's state when it is still to come, else the first one of tomorrow, or
    of the next day that has one. Computed by the integration (`next_day_slot_end`), because the
    card cannot tell a 00:00 slot that repeats the evening from one that changes something. At
    01:30 the morning is today's, the same instant as the next slot: the card then hides the
    button, so one button says it. Before, "tomorrow" at 01:30 on Sunday meant Monday, 29 h
    away. The button names the day when the morning is not tomorrow (a flat Sunday).
  - **Chauffage's logbook lines do not show for a thermostat filtered alone, and Chauffage
    cannot change that.** Home Assistant's logbook only queries the custom events whose
    describer domain is the config-entry domain of one of the filtered entities
    (`async_determine_event_types`): for `climate.bureau`, Versatile Thermostat's events, never
    `chauffage`'s, whatever `entity_id` the event carries. Filtered on the thermostat and its
    *Override* sensor (a `chauffage` entity), both the gate and the `entity_id` matcher pass,
    and the lines show. Registering the describers under another domain would not help: the
    gate uses config-entry domains, not entity domains, and a YAML thermostat has none. Firing
    `logbook_entry` events instead would show the lines on the thermostat alone, but duplicate
    them in the unfiltered logbook next to the described events, which automations rely on. So
    the README says to filter on the thermostat and its *Override* sensor.
  - **The fan and the vanes are more keys of the same partial state** (#61): `fan_mode`,
    `swing_mode` and `swing_horizontal_mode`, on a slot's settings and on a preset's value,
    compared and sent as they are. The fan differs with the time of day (#61), so a slot keeps
    them, under *More settings*, on air conditioners only. A slot that sets one shows a mark in
    the week, down to a narrow segment, and its title and its `aria-label` say the values: a
    slot's settings are never invisible. A slot that chooses an HVAC mode shows its icon the
    same way: a power icon, a fan, a snowflake or a flame.
  - **Heat and Cool are a row under the presets of the slot popover**, only on a thermostat
    that lists heat and cool: a heater never sees it, and an air conditioner that only cools
    has nothing to choose. One of the two is always filled; tapped again, it stays. The words
    are short: *Heat*, *Cool* (*Chauffe*, *Clim*).
  - **The week menu sets a whole week to heat or to cool** (*All heat*, *All cool*). Changing
    the season of a week slot by slot is fifteen taps. The items are in the ⋮ menu of a day on
    the card, and in the ⋮ menu of a week in the panel. They edit the week shown, unsaved until
    *Save*, like any edit.
  - **A capture button fills the popover of a preset's value from the thermostat's current
    state**, in the spirit of Home Assistant's scene editor, and never saves by itself: the
    value waits for *OK*. The button says where it copies from (*Copy from the thermostat*). It
    never copies the thermostat's preset: the user panel saw it tick "Comfort" in the *Boost*
    cell. It copies the setpoint instead, as the cooling temperature while an air conditioner
    that also heats cools, and the fan and the vanes. The slot popover has no capture: a slot
    is a preset or off, and the button never copied either.
  - **The override block says off, fan only, a preset, a temperature and an end.** *On* and the
    list of HVAC modes are gone: Home Assistant's own controls, just above the block in the
    more-info dialog, already set the HVAC mode, and a change made there is an override by
    hand. On an air conditioner that heats and cools, the block has the *Heat · Cool* row of a
    slot: an override from the card always says its HVAC mode, so a preset tapped never
    depends on what the thermostat happens to do. A new override starts in the HVAC mode of the
    slot planned now; during an off slot or a fan-only slot, in the one the thermostat runs in,
    else heat. While *Off* is chosen the temperature field and the row are hidden: off takes
    neither.
  - **`chauffage.set_override` refuses what contradicts itself.** Off or fan only with a
    temperature or a preset, an HVAC mode the thermostat does not list, a duration with an end:
    each was recorded and did something else than asked. The device still validates the values
    (see below); these three are contradictions in the call itself, and the message says which.
  - **An end changed is an event of its own**, `chauffage_override_end_changed`, so the logbook
    tells it. `chauffage_override_started` stays for a new override or a new value: automations
    that count overrides are not triggered by "+30 min". *Off* is the first chip of the row of presets, then *Fan only* on a thermostat that
    lists it. A preset tapped, or a temperature typed, on an off override turns the thermostat
    on: a person who taps *Comfort* on a thermostat that is off expects heat. An off override
    holds nothing but off. *Off* tapped on an "on" override
    during an off slot ends the override, as setting a thermostat back to what its slot plans
    by hand does. `chauffage.set_override` keeps its `hvac_mode` field, for automations.
  - **On a thermostat card, the override block is folded.** The card showed eight controls
    before the end. Now it shows the override, its end and *Resume the schedule*, and *Change*
    unfolds the presets, the temperature and the durations. The more-info dialog shows
    everything: the user opened it to act.
  - **The chips of the presets keep their full color.** Unchosen chips were drawn at half
    opacity, which reads as disabled. A ring marks the chosen chip.
  - **"Until tomorrow" is one tap, the configured end stays the default** for an off override:
    the setting *End of off overrides*. The button sets the end to tomorrow's first slot that
    changes the thermostat's state, computed by the integration.
  - **The cell popover asks one question, with three answers**: *Default (its Comfort preset,
    20°)*, *Its preset* or *Temperature*, as radio rows. A first version asked twice, *Default |
    Custom* then a checkbox per setting, so a user could tick nothing, or tick a device preset
    and a temperature together and leave the device to decide. Using a row's field chooses the
    row. On an air conditioner that heats and cools, the rows are headed *When heating*, and a
    field of its own holds the temperature *when cooling*. Empty, with a temperature when
    heating, it reads "Setpoint unchanged when cooling"; with one of the thermostat's own
    presets when heating, it says nothing, because that preset is sent when cooling too. The
    cooling field is not under the *Temperature* row, so a device preset or the default when
    heating can go with a temperature when cooling. The fan and the vanes are under *More
    settings*.
  - **The card names the fan and the vanes with short words of its own** (*Fan*, *Vanes*,
    *Horizontal vanes*), not Home Assistant's attribute names, which are too long for a popover.
    The values keep Home Assistant's names when it has them, else "1_up" reads "1 up", and the
    common words of a vane value are translated word by word ("1 haut", "Oscillation"); any
    other word stays as it is.
  - **This is a behavior change for upgrading users**: a thermostat turned off by hand in the
    past comes back on at the next slot, and at the restart that follows the upgrade. The
    changelog says so under "Upgrading". A thermostat to leave alone is paused.
- **A Versatile Thermostat is read as it was asked, not as it protects itself** (#91, #92).
  VTherm turns itself off for an open window or with its auto start/stop, and refuses heat
  until the cause ends. VTherm 10.5 keeps what it was asked for in `requested_state`
  (`hvac_mode`, `preset`, `target_temperature`): Chauffage reads the HVAC mode there, so a VTherm
  off by its window is "on" for Chauffage. It never gets an off override, Chauffage never sends
  it heat while the window is open, and it gets its slots meanwhile, so it restarts on the right
  preset. A VTherm asked to be off (turned off by hand) is an off override, as any thermostat.
  Why not the window: reading `is_window_detected` or the window action would tie Chauffage to
  one VTherm feature. For the card, Chauffage says why a VTherm protects itself (`cause`: `window`
  or `auto_start_stop`), so the card does not read VTherm's attributes. The window comes from
  `window_manager.window_state`, because the window action *frost* keeps the VTherm on, at the
  frost setpoint: the card must say "Window open" then too, and `hvac_off_reason` only exists
  while the VTherm is off. The auto start/stop still comes from `hvac_off_reason`.
  - **A VTherm without `requested_state` keeps the behavior before #91** (#74): off, it is read
    as on. It gets its slots and its override while off, stays off, and starts again on them.
    Chauffage neither turns it on nor takes it for turned off by hand. An off slot is still
    satisfied by it: `engine.Thermostat` keeps the HVAC mode shown (`shown`) next to the one
    read, and an off target accepts either, so the off command is not waited for and a
    realignment does not send off again. Before #91, a first fix
    (0.7.1) only counted the reason `hvac_off_auto_start_stop`; that reason moved once, from a
    top-level attribute to `specific_states` (VTherm 10.5), and VTherm publishes no reason right
    after being turned off, so Chauffage leaves the decision to VTherm. Older versions are not
    checked; they are rare, and the risk is accepted.
- **A thermostat that shows neither a setpoint nor a preset is left alone, like an unavailable
  thermostat** (#93). At a restart, VTherm writes a first state before it has restored its own:
  `off`, no setpoint, no preset, no `is_ready` (VTherm 10.5 and 8.6.2 alike). It builds its
  presets once Home Assistant has started, at the same moment Chauffage realigns the
  thermostats. Without presets, Chauffage would send the VTherm the preset's temperature instead
  of the preset, and the VTherm would keep that temperature until its next slot. A thermostat
  that shows no setpoint (`temperature`, `target_temp_low`, `target_temp_high`) and no preset
  has no known state, whatever its kind: Chauffage could not compare it with its slot anyway.
  Once it shows one, the back-online path sets it to its slot or its override.
  - **A VTherm whose `is_ready` is false is not ready either.** VTherm 9 and later publish
    `is_ready`, for example false while an underlying is unavailable. An absent `is_ready` blocks
    nothing: if VTherm moves or renames the attribute, Chauffage still controls it.
  - **Other ideas, rejected.** Reading the VTherm version to require `is_ready` from 9 on would
    stop every VTherm if the attribute moved. Realigning when the presets change would undo a
    change by hand written with them. Sending the preset anyway and letting the thermostat
    refuse it means a refusal and a warning at each restart, and a refusal at each slot for a
    VTherm without presets. Fixed delays are guesses. Realigning at start only what changed
    during the downtime is a design change, not a fix: it needs stored data, and leaves a change
    made by hand while Home Assistant was down.
  - **Accepted risk.** A VTherm may write a state with its restored setpoint but not yet its
    presets, for example when an underlying changes during the startup. If Chauffage's command
    lands after the presets are built, the VTherm keeps the temperature until its next slot. It
    takes two coincidences. A thermostat that shows no setpoint for a moment while someone
    changes it by hand is set back to its slot, as one back from unavailable is. So is a change
    by hand made on a VTherm while its `is_ready` is false, for example while an underlying is
    lost: it is not an override.
- **VTherm is recognized by its integration, not by its attributes**: the platform of its entity
  in the entity registry is `versatile_thermostat`, in the integration and in the card
  (`hass.entities`). The attributes VTherm publishes have changed between versions, and another
  integration could publish the same names. The name of an integration does not change.
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
- **A VTherm is read as it was asked, not as it changed itself** (#92). VTherm publishes two
  states since its version 8: `current_state`, what it does now, and `requested_state`, what it
  was asked for.
  An open window with the *Frost protection* action sets the frost setpoint and keeps the
  preset. On a temperature slot, Chauffage took the frost setpoint for a change on the device:
  an override at 7 °C while the window was open. If the slot changed meanwhile, the old slot's
  setpoint became a 2-hour override once the window closed.
  - **What Chauffage reads.** For a VTherm with `requested_state`, Chauffage reads the preset
    from `requested_state`. On the manual preset (`none`), it also reads the setpoint from
    `requested_state`. On another preset, `requested_state` keeps the last manual setpoint, not
    the preset's: Chauffage reads the setpoint VTherm shows. Without `requested_state`, for
    example a VTherm older than version 8, Chauffage reads the attributes as before.
  - **What Chauffage learns.** A VTherm can show another preset than the one asked, for example
    *frost* while its central mode is in frost protection. Chauffage then learns no preset
    temperature: the setpoint shown is not the asked preset's.
  - **Why not the window.** Reading `is_window_detected` or the window action would tie
    Chauffage to one VTherm feature. `requested_state` also covers the other changes VTherm
    makes by itself on the manual preset, for example the central mode, the power shedding or
    the safety mode. On another preset, Chauffage reads the setpoint VTherm shows, as before:
    a setpoint that keeps the preset was never an override.
  - **What is checked.** In a development HA with VTherm 10.5, without the fix: the *Frost
    protection* action made an override on a temperature slot, and none on a preset slot. The
    *Turn off* action made no override. With the fix, on VTherm 10.6.4: neither action makes an
    override, and a slot change while the window is open applies once it closes. The other
    changes VTherm makes by itself are only read in VTherm's code, not tested.
  - **The timed preset.** VTherm writes a timed preset into `requested_state` since its
    version 9.3.3. Chauffage sees it as a preset picked by a user. Its end leaves a stale
    override: #101.
- **No special case for Versatile Thermostat's safety mode**: VTherm keeps the requested preset
  and returns to it by itself, so the usual rules are right (v0.2.0-beta.3 removed a special
  case that overwrote a user's choice).

## Presets

- **Presets of the integration, not of a thermostat** (v0.3). Slots ask for *Comfort*, *Eco*…;
  for each thermostat, a preset is its own climate preset with the same name when it has one
  (and the option allows it), otherwise the preset's temperature, fitted to the thermostat's
  limits and step. It can be set by hand per thermostat. Versatile Thermostat becomes one case
  among others.
- **What a preset means on a thermostat is a partial state, as a scene holds it** (#91, stored
  data version 7). A target is a dictionary of climate attributes: `{"preset_mode": "comfort"}`
  or `{"temperature": 19}`. Overrides and the commands not applied yet hold a target too.
  Before, a target was a kind and a value, "preset" or "temperature": a slot could not set
  anything else. With a partial state, off, the fan and the vanes are more keys, read and
  applied the same way. The events and the sensors keep `kind` and `value` next to the target,
  read from its first attribute, so existing automations keep working. An override that sets
  none of them (the fan, a cooling setpoint) has no kind and no value.
- **A preset's value on a thermostat is a climate preset or a temperature, not both, and never
  an HVAC mode.** A first version stored any mix, as a scene does, and let the device decide
  what to do with a preset and a temperature together. The user could not tell what the room
  would get. Now the integration refuses both together, and the card asks for one. A value
  may add a cooling setpoint, a fan and vanes to it; alone, they add to the default. The target
  of an override stays free: a change by hand may write a preset and a temperature at once, and
  an override sets the HVAC mode. An off override holds nothing but off.
- **Storage version 7 changed in place, and has no cleanup of development data.** Version 7
  only existed on the branch of #91: the main branch and every release hold version 6. So the
  model changed its format without a version 8, and the store's minor version stays 1. The
  migration from version 6 changes no week: a slot without settings says no HVAC mode, and is
  read as heat on an air conditioner that heats and cools, as cool on one that only cools (see
  "Scheduling"). A user who upgrades from version 6 loses nothing. A development version stored other things in version 7 (an HVAC mode on a schedule,
  a preset on an off slot). The code reads them without harm: a schedule's HVAC mode is
  ignored, and an off slot is off whatever preset it holds. They are gone once the weeks or the
  schedules are saved again.
- **A preset's temperature is a heating value; a temperature the user typed is their target in
  any HVAC mode.** In `cool`, a preset without a cooling setpoint (`cool_temperature`) keeps its
  temperature for itself: the cooling value of a preset is `cool_temperature`, so sending its
  temperature would cool to a heating setpoint. An override without a Chauffage preset is
  another matter: its temperature comes from the card's field, from `chauffage.set_override
  temperature`, or from a change by hand, so the user chose it for the HVAC mode the thermostat
  runs in, and Chauffage sends it in `cool` too. `engine.complete()` tells the two apart
  (`by_user`).
- **No *Off* preset.** Off is what a slot says, not how warm a preset is (#91, "Scheduling").
  A first version let a preset turn the thermostats off, so "off" existed in four forms. A home
  turned off is a schedule whose slots are off.
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
  **Amended by the UX review**: saving the rules applies them only when what they give changes, as
  when their entities change. A schedule chosen by hand stays if the outcome is the same. Two
  testers lost a *Holiday* chosen by hand when they edited a rule.

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
  **Amended by the UX review**: editing a thermostat's week in a card schedules it, not adding the
  thermostat to the card. A card showing a thermostat that Chauffage does not schedule draws a new
  schedule's week for it, dimmed, with a note, and does not send that week until someone edits it.
  Before, saving any thermostat of the card scheduled them all: a user who scheduled 3 thermostats
  in the panel found 5 controlled. The integration also refuses to schedule a climate that has
  neither a state nor a registry entry.
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
  **Amended by the UX review**: the button says *Resume control* (*Piloter*), after the switch. See
  [The UX review](#the-ux-review-080-beta2).
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
- **The settings of overrides are configuration entities** (#83): the select *End of a change
  by hand* and the number *Override duration*, on the *Chauffage* device. They read and write
  the integration's options, the only state of a setting, as the schedule switches read and
  write the active schedule. Configuration entities, because they are settings, not everyday
  actions. Fixed entity ids, `select.chauffage_manual_override_end` and
  `number.chauffage_override_duration`, whatever the language. The number takes any whole
  number of minutes, from 15 minutes to 24 hours, as the options flow.
- **One rule for the override duration, on every path**: any whole number of minutes, from 15
  minutes to 24 hours. The 15 minutes are only the step of the panel's arrows, not a rule: 50
  minutes or 2 h 40 are durations too. The number entity and the options flow have a step of 1.
  Home Assistant checks their minimum and maximum. Chauffage checks the whole minutes itself:
  the options flow shows a form error, and the number entity raises a `ServiceValidationError`
  with a translated message, not "Unknown error". `chauffage/settings/set` answers
  `invalid_format`. A first version required a multiple of 15 minutes, so a number entity set to
  50 gave "Unknown error".
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
- **The panel asks to reload the page when the page runs a former card** (0.8.1). Home
  Assistant's service worker serves a page from its cache, then updates the cache in the
  background. So the first page loaded after an update can load the former card, while the panel,
  declared by the integration, loads the new module. The new module keeps the former card's
  elements, defined first, and the new panel can't use them. The panel compares the card's
  `version` with its own, not the classes: a second copy of the same version works.
- **The *Reload* button empties the service worker's caches first** (0.8.1). Without it, the
  first reload gets the former page from the cache again. The companion app has no hard reload,
  and its *Reset frontend cache* setting is hard to find. Emptying every cache of the page costs
  one download of Home Assistant's files, once.
- **The card subscribes again itself after a reconnection** (0.8.2). The companion app keeps its
  page open while Home Assistant restarts. The page reconnects as soon as Home Assistant answers,
  often before Chauffage is set up. Home Assistant's websocket library then replays the
  subscription once, gets `not_loaded` or `unknown_command`, and never tries again: the card
  stays on its former data, or on "…". So the card subscribes with `resubscribe: false`, and
  subscribes again on the connection's `ready` event.
- **A subscription that fails is tried again, less and less often** (0.8.2): after 5 s, then
  twice as long each time, up to a minute, while a card or the panel is on the page. A
  subscription that brings no data within 10 s is made again too, because the integration always
  sends its data at once.
- **The panel shows the same notice as the cards** (0.8.2): "…", the integration not set up,
  Home Assistant to restart, or the page to reload. One function, `sourceNotice`, chooses the
  notice for the schedule card, the thermostat card and the panel. The panel keeps its tabs and
  its menu button above the notice.
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
  the tab shown is not the schedule edited. A thermostat's page in the panel is different: its
  weeks are all shown at once, and one save bar at the bottom of the window saves them all (see
  [The UX review](#the-ux-review-080-beta2)).
- **A tap that lands on a handle opens the slot under it** (#91). The handles are 18 px wide
  and sit on the edges of a slot: a slot of a quarter of an hour at 1280 px, or of two hours on
  a phone, was covered by its two handles and could not be opened. Narrower handles would be
  harder to drag. So a tap, a press without a move, on a handle opens the slot under the
  finger. A handle of the selected slot does nothing on a tap: the slot stays selected, and its
  handles stay easy to drag. The slot is the one where the finger went down (`pointerdown`):
  on a touch screen, Chromium moves the click to the centre of the handle, the very edge of
  the slot, and one tap in three opened the neighbor.
- **A time typed onto a neighbor removes the slot between** (#91). The end of a slot typed as
  the end of the next slot was moved back by a step, and left the next slot a step long: a
  sliver nobody asked for. Now the slot between is removed. An end typed as 24:00, or 00:00, is
  the end of the day.
- **The presets table says when it is wider than the screen** (#91): a fade and a chevron on
  the right, a shadow along the names once scrolled. A tap on a cell redraws the table: the
  card puts it back where it was scrolled, before it places the popover on the cell.
- ***Several* starts from the room tapped when every room is shown** (#91). With every room
  shown, the first tap removed a room. A person who presses *Several* wants to pick rooms.
- **A device's own values are named as Home Assistant names them** (#91): its presets, its fan
  and its vanes, by `hass.formatEntityAttributeValue`, else by the climate domain's
  translations, else in the card's words, else as they are.
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
- **The device's *Visit* button opens the thermostat's page in the panel.** The device's
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
  **Amended by the review of the PR**: a thermostat with a device of its own is renamed too: its
  entities move to the scheduled thermostat's device, named after the thermostat, so *Vanne salon
  Override* becomes *Salon Override*. The changelog says so under *Upgrading*. The device's name
  follows the thermostat's name as Home Assistant builds it from the registry, so it does not
  change when the thermostat's state is not there yet at startup.
- **A thermostat without a device of its own also gets one**, for example a `generic_thermostat`
  written in YAML. Every scheduled thermostat works the same way. So the entity names "*X* of
  *thermostat*" (the `*_of` translation keys) and the Home Assistant version switch
  `DEVICE_ENTRY_ATTACHES` are gone.
- **Entity ids and unique ids do not change.** Only their device changes. Dashboards and
  automations that target the entities keep working.

### The panel

- **A *Chauffage* panel, for admins**, and for every user when the access level is *Set up*. Each
  change of the websocket API needs an access level, and the control of the thermostats it
  reaches: see [Who may do what](#who-may-do-what-99). Home Assistant's device pages are for
  admins only.
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
  longer has the *Presets*, *Rules* and *Thermostats* views. Admins find *Set the presets* in the card's
  legend, and a button with Chauffage's icon that opens the panel.
- **The schedule card keeps its week editor**, and the panel has one too. The card is the only
  place that compares the weeks of several thermostats side by side: a card is a group of
  thermostats that the user chose to show together, for example the bedrooms. The panel shows one
  thermostat, or one schedule for every thermostat.
- **The panel has lists, then pages**, as Home Assistant's settings do. A list has the panel's
  tabs: *Thermostats*, *Schedules* and *Presets*. *Thermostats* comes first (0.8.0-alpha.2):
  everything starts from a scheduled thermostat, and a new user starts there. A page is about one schedule or one
  thermostat. A page has no tabs. Its title is a breadcrumb, for example "Thermostats ›
  Bureau", where "Thermostats" links to the list. A page keeps Home Assistant's menu button.
- **Rejected: tabs on the pages.** A selected tab would change the page, and the page would have
  two ways back. Tabs also say that the content is the tab's. On a phone, the page would show
  two bars. Home Assistant does not do it.
- **Rejected: a back arrow and a breadcrumb.** The page would have two ways back.
- **Rejected: an *Overview* page.** Showing what the home does now is the dashboard cards' job.
- **The activation rules are on the *Schedules* tab**, below the list. The rules decide which
  schedule is active.

### Who may do what (#99)

#### Why change

Home Assistant has two roles: administrator, and user. Today Chauffage lets a user who is not an
admin use the heating, and keeps the rest for admins. Many homes give a non-admin account to each
wall tablet (#99). In those homes, nobody can edit the weeks where the heating is used.

The weeks were not kept for admins on purpose. The first websocket API put every write behind an
admin, as Home Assistant does for its configuration. Its test only compared an admin with a
read-only user. Overrides and the pause were opened later, one at a time.

Who may change what is the owner's choice. Chauffage must make the choice clear, and offer enough
cases to fit a real home, but no more.

#### The access levels

An admin chooses one access level for every user who is not an admin: *Use*, *Plan* or *Set up*. An
access level is cumulative: *Plan* includes *Use*, and *Set up* includes *Plan*. An admin of Home
Assistant can always do everything.

| What the user can do | *Use* | *Plan* | *Set up* | Admin |
|---|:-:|:-:|:-:|:-:|
| See the schedules, the weeks, the presets and the history | ✓ | ✓ | ✓ | ✓ |
| Set, change and end an override | ✓ | ✓ | ✓ | ✓ |
| Pause a thermostat and resume its control | ✓ | ✓ | ✓ | ✓ |
| Activate a schedule | ✓ | ✓ | ✓ | ✓ |
| Edit and save the weeks | | ✓ | ✓ | ✓ |
| Create, copy, rename, move and delete schedules | | ✓ | ✓ | ✓ |
| Open the Chauffage panel | | | ✓ | ✓ |
| Set the presets, and their values on each thermostat | | | ✓ | ✓ |
| Write the activation rules | | | ✓ | ✓ |
| Schedule another thermostat, or forget one | | | ✓ | ✓ |
| Change the settings of overrides | | | ✓ | ✓ |
| Choose the access level | | | | ✓ |
| Open the integration's options and the devices' pages | | | | ✓ |

The last row belongs to Home Assistant, which keeps these pages for admins.

#### The decisions

- **One access level for every user who is not an admin, not one per user.** Chauffage keeps Home
  Assistant's two roles. An access level per user would protect little: with *Use*, a user can already
  pause a thermostat or change its setpoint. It would cost a lot: a list of users to keep up to
  date, stored data, a row per user to set, and tests per user. A home that hides the editing from
  a child uses Home Assistant's tools: another dashboard, or the card's visibility per user. If
  homes ask for exceptions per user, the access level becomes their default, and nothing breaks.
- **Three access levels, not one switch per feature.** A switch per feature makes the owner read and
  weigh about ten boxes. Three access levels cover the homes we know: a home that only uses the
  heating, a home that plans from a shared tablet, a home run by two people.
- **The access levels follow the reach of a change.** *Use* changes one thermostat for a few hours.
  *Plan* changes the coming weeks of the home. *Set up* changes what every slot of every room
  means, and which thermostats Chauffage controls.
- **The schedules go with the weeks.** Creating a *Holidays* schedule is planning, not setting up.
  The activation rules go with *Set up*: they are templates, and a wrong one changes the active
  schedule by itself.
- ***Set up* lets users write templates.** Home Assistant keeps its own template preview for
  admins. With *Set up*, a user who is not an admin writes the activation rules and tries them, so
  the integration renders these templates. The owner chooses it, as the rest of *Set up*.
- **The week of a thermostat not scheduled yet needs *Set up*.** Saving that week schedules the
  thermostat, as adding it in the panel does. With *Plan*, the card shows that week read only.
- **A change that reaches every room needs the control of every scheduled thermostat.** The
  active schedule, the schedules, the presets, the rules and the settings of overrides are such
  changes. A change of one thermostat, such as its week or its presets, needs the control of that
  thermostat.
- **No access level below *Use*.** Home Assistant lets every non-admin user control the thermostats and
  the *Control* switch. An access level below *Use* would block the card, but not the thermostat's own
  card, so it would protect nothing. Chauffage protects as much as Home Assistant does, no more.
- **An access level never goes beyond Home Assistant's permissions.** Every action on a thermostat still
  needs the control of that thermostat. In practice, Home Assistant's UI gives every non-admin
  user the control of every entity. Only a user made read-only outside the UI lacks it, and that
  user changes nothing from the cards and the panel, whatever the access level.
- **The access level covers the cards and the panel, not the entities and the services.** The
  entities of Chauffage, for example *Override duration* or a schedule's switch, follow Home
  Assistant's permissions, as every entity does. The services follow them too:
  `chauffage.set_override` and `chauffage.clear_override` need the control of the thermostat,
  as Home Assistant's services that target an entity do. `chauffage.activate_schedule` targets no
  entity, so it checks nothing: even a read-only user can call it. The active-schedule select
  needs the control of the select, and the cards need the control of every scheduled thermostat.
  Activating a schedule changes no setting and nothing a user cannot change back.
- **Admins are told of the access level, not of the end of overrides (#83).** The panel shows one
  notice at a time. The settings dialog holds both settings, so an admin who opens it sees the
  end of overrides too.
- ***Plan* works from the dashboard card.** The card already edits the weeks, and creates,
  renames, moves and deletes schedules. *Plan* needs no panel.
- ***Set up* opens the panel.** The presets, the rules and the scheduled thermostats live in the
  panel only. So Home Assistant registers the panel for every user with *Set up*, and for admins
  only otherwise. The sidebar entry keeps its option, and every user who may open the panel sees
  it. Each user can hide the entry in their own profile.
- **A user who loses *Set up* leaves the panel at once.** Home Assistant removes a panel from a
  user who may no longer open it, and sends the user to the home page. Weeks edited in the panel
  and not saved are lost. The panel cannot keep them: it is gone. Lowering the access level is
  rare, and an admin decides it.
- ***Use* is the default.** It is what non-admins can do today, so an upgrade changes nothing.
- **Only an admin chooses the access level.** A user with *Set up* who could choose it could give every
  user everything.
- **The choice is explained where it is made.** An admin chooses the access level in the panel's
  settings dialog. Each access level shows, in one line, what it lets users change, and *Set up* says
  that it changes every room.

### The panel's addresses

- **One address per page.**

  | Address | Page |
  |---|---|
  | `/chauffage` | Redirects to `/chauffage/thermostats`, the first tab |
  | `/chauffage/schedules` | The schedules and the activation rules |
  | `/chauffage/schedules/<id>` | A schedule's page |
  | `/chauffage/thermostats` | The scheduled thermostats |
  | `/chauffage/thermostats/<climate>` | A thermostat's page |
  | `/chauffage/presets` | The presets |
  | `/chauffage/rules` | Redirects to `/chauffage/schedules` |
  | `/chauffage/<climate>` | The first prototype's address: redirects to `/chauffage/thermostats/<climate>` |

- **A deleted schedule's page goes back to the list of schedules.**
- **A thermostat's address uses its `climate` entity id**, not a device id. The entity id is the
  scheduled thermostat's key in the storage, the services and the websocket API. A user can read
  it, and write it in an automation. The entity id stays the same if the device is created again.
  The downside: renaming the `climate` entity changes the address. So the address of a renamed
  thermostat redirects to its new id, through the store's `renamed`.

### The panel's pages

- **The *Thermostats* tab: one row per scheduled thermostat**, sorted by name. A row shows the
  thermostat's name, which opens its page. A badge says *Controlled* or *Paused*. The row says
  where the dashboards show the thermostat, then gives the *Pause* or *Resume* button. The rarer
  actions wait behind ⋮: open the thermostat, open its devices, forget it.
  **Amended by the UX review**: only a paused thermostat has a badge, *Paused*, the
  exception. The whole row opens the page, and *Pause* or *Control* moves to the row's ⋮ menu.
- **Devices are named by their name and model everywhere**, for example "Bureau (Thermostat
  programmé)", in the ⋮ menu of the *Thermostats* tab too. The labels "Its Chauffage device" and
  "The thermostat's device" are gone: the model says which device is which.
- **Any thermostat can be forgotten from the panel**, after a confirmation. The panel is not a
  card, so "not in this card" no longer limits forgetting.
- **"Shown in *dashboard* › *view*" is read from every dashboard's configuration, in the browser.**
  The panel walks the stacks, the sections and the conditional cards. This amends "The integration
  does not read the dashboards either" (see "Scheduled thermostats"): the integration still does
  not, the panel does, for admins only. Home Assistant's generated dashboards have no
  configuration, so they show no placement. A change of a dashboard needs a page reload.
- **"Schedule another thermostat" on the *Thermostats* tab.** The admin picks a `climate` that
  Chauffage does not schedule yet, then *Schedule*. Chauffage saves it with the week of a new
  schedule in every schedule, as adding it to a card does.
- **A thermostat's page starts with a header.** The header shows Home Assistant's own tile card for
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
  **Amended by the UX review**: the header shows a badge only when the thermostat is
  paused, as the *Thermostats* tab does.
- **A paused thermostat's page says it is paused once**, in its header. The weeks stacked below
  do not repeat the card's note "… is paused: Chauffage does not control it · Resume" (card
  option `week_only`). The weeks stay dimmed, as in the card.
- **The tile card relies on an internal of Home Assistant's frontend.** Outside a dashboard, Home
  Assistant's card helpers do not exist yet. The panel loads the dashboards' code to get them
  (`cardHelpers`), so the tile may break when Home Assistant changes that code.
- **Then the page shows one surface**, in this order:
  1. The thermostat's presets, side by side: for each preset, its color and name, its value on
     this thermostat and where the value comes from. They are the legend of its weeks. The
     presets' definitions stay on the *Presets* tab.
  2. Its weeks, one per schedule, stacked, under the heading *Weeks* (*Semaines*). Each week's
     heading is the schedule's name, a link to its page, with an *Active* badge on the active
     schedule.
- **The heading is *Weeks*, not *Its weeks*** (the `weeksTitle` key). The possessive read badly.
- **A thermostat's presets are a row of items, not a table of one row** (after 0.8.0-alpha.2). A
  table with a single row only repeated the table's headers. The items sit side by side and wrap:
  four on a computer, two per line at 360 px, with no horizontal scroll. An item opens the same
  editor as a cell of the *Presets* table.
- **On a thermostat's page, copying a week starts from the week it copies.** Each week's heading
  has a *Copy to…* list (*Copier vers…*) of the other schedules. The list copies this thermostat's
  week in this schedule to the schedule chosen. The card's list at the foot of the weeks ("Copy
  Bureau's week to…", every thermostat in every schedule) does not fit a page about one
  thermostat, so the page hides it (card option `week_only`). A schedule's page and the
  dashboard card keep that list.
  **Amended by the UX review**: each week's heading has a ⋮ button, which opens a
  menu of the other schedules. On the card, a button opens the same kind of menu. Nothing is
  copied until the user picks a schedule in the menu.
- **Copying week A to schedule B asks to save B, never A.** The copy lands in B's week at once,
  unsaved: B's save bar appears, with the message "The *Normal* week copied here". Week A is not
  touched. If A has edits not saved yet, the copy takes A as shown, and A keeps its own edits.
  The prototype first put the copy in A's card: A's save bar asked to save A, and saving it in
  fact saved B.
- **A week stacked on a thermostat's page has no foot**: no legend, no copy list, and no empty
  message line. So the page shows no empty space under each week.
- **On a thermostat's page, today stands out only in the active schedule's week** (card option
  `week_only`). The weeks of the other schedules do not mark today. A schedule's page and
  the dashboard card still mark today.
- **One *Group days* switch for all the weeks of a thermostat's page.** The switch shares its
  choice with the cards. The choice is kept in this browser. The editing hint is shown once.
- **A thermostat's page has the card's two switches, *Group days* and *History*** (0.8.0-alpha.2),
  for all its weeks. As on the card, the history shows each day, so grouping the days hides it.
  Both choices are the ones the cards keep in this browser. The alpha.1 had no *History* switch:
  a history turned on in a card showed on the page, and the days could not be grouped any more.
- **A day copied in one week can be pasted in any other week of the page**, for example from
  *Normal* to *Away* on a thermostat's page, or from one dashboard card to another. Every card
  reads the copied day when it is used, from this browser's storage. The alpha.2 read it once,
  when the card was drawn: the other weeks of a page offered nothing to paste. A new copy
  replaces the one before it, and only the day copied last stands out (dotted) in every card:
  the place of the copied day is kept with the copy, not in the card that copied it.
- **In the panel, the page's `group_days` wins** over the choice kept in the browser. The
  prototype first did the opposite, and the switch did nothing.
- **A schedule's page shows every thermostat's week in this schedule.** It shows this schedule's
  tab only, with its ⋮ menu (rename, copy, delete), and no "+".
  **Amended by the UX review**: the page shows no tab. A ⋮ button next to the page's
  title renames or deletes the schedule. A copy starts from the "+" of the *Schedules* tab.
- **The *Schedules* tab lists each schedule**, with an *Active* badge, *Activate* and *Edit*.
  "+ New schedule" opens a name field in the list.
  **Amended by the UX review**: the page follows the model of the *Thermostats* tab.
  The whole row opens the schedule's page, and its ⋮ menu activates, renames, moves or deletes the schedule.
  *Activate* left the row: the button made the rows uneven.
  "+ New schedule" opens the card's "+" menu: an empty schedule or a copy.

### Welcoming a new user (0.8.0-alpha.2)

- **A new user goes to the panel first, with no thermostat scheduled yet.** The panel must not
  show an empty page. Its *Thermostats* tab welcomes the user instead, and leads them to
  schedule their first thermostats.
- **The welcome says what Chauffage does in one sentence**, then lists the thermostats to tick.
  Setting their weeks and adding a card to a dashboard come as the next steps.
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
- **Before the first thermostat, the *Schedules* and *Presets* tabs say so**, with a link to
  the *Thermostats* tab. Their content stays: a user may create schedules first.
- **The next steps say what a change by hand does** (#83), with the current setting, for example
  "A setpoint you change by hand lasts 2 hours. Then the thermostat goes back to its schedule."
  Overrides surprise users: the knob is turned, and two hours later the thermostat goes back to
  its schedule. A button opens the settings dialog.
- **A settings dialog, not a tab**, holds the *Overrides* section (#83). A first version
  had a fourth tab, *Settings*. The tab was too heavy for two settings, and a fourth tab was cut
  off on a 360 px phone. The UX reviews of #83 asked for a direct path from the surprise, a
  layout read by touch at 360 px, labels that carry the duration, and little density, not for a
  tab. Above all, the link from the reason of an override's end left the view: it closed the
  more-info dialog, then opened the panel, and the card's popover was lost. The browser's Back
  then returned to the dashboard without them.
  - **The dialog opens on top of the view, without navigating**: from the reason of an
    override's end (the card's popover, the more-info dialog, the thermostat card), from the ⚙ of
    the panel's toolbar, from the one-time notice and from the next steps. Closing it, or Back,
    returns to the view as it was, the popover or the more-info dialog still open.
  - **Home Assistant's dialog manager opens it**: the card fires `show-dialog` with
    `dialogTag: chauffage-settings-dialog`. The manager puts the dialog on top of the dialogs
    already open, gives it `hass`, and gives it a history entry, so Back closes the top dialog
    only. The dialog follows the manager's contract, from 2025.1 to today: `showDialog()`,
    `closeDialog()`, and `dialog-closed` once closed. Over the more-info dialog, the manager
    replaces the more-info's history entry instead of adding one. Back then closes the settings
    and keeps the more-info open, without `?more-info-entity-id=` in the address.
  - **Home Assistant's `ha-dialog` draws it when the page has it**, else the browser's
    `<dialog>`, with `showModal()` and Home Assistant's colors. `ha-dialog` changed in 2025:
    Material's dialog takes a `heading` and our ✕, Web Awesome's takes a `headerTitle` and has
    its own ✕. Both are `open` and say `closed`. Without Home Assistant's frontend (no
    `<home-assistant>`), the dialog opens by itself and takes its own history entry.
  - **In Material's `ha-dialog` (Home Assistant 2025.1), Escape closes the settings dialog
    only.** Every Material dialog open listens to Escape on the whole document, so one Escape
    closed the settings dialog and the more-info dialog under it. While the settings dialog is
    open in Material's dialog, it catches Escape on the window first, stops it, and closes
    itself. Web Awesome's dialog is a browser `<dialog>`: Escape only reaches the dialog on top,
    so the settings dialog leaves Escape to it. Material's dialog also gets `hideActions`: the
    settings dialog has no buttons at its foot, and Material would show an empty band there.
  - **A press or Escape in the dialog does not close the card's popover under it.**
  - **Its foot links to the other options**, for an administrator: *Other Chauffage options*,
    a link alone. Home Assistant offers no address that opens an options flow,
    from 2025.1 to today, so the link opens the integration's page, where *Configure* opens them.
    The link leaves the view: the dialog closes first, its history entry is taken back, then the
    page opens. Back then returns to the view under the dialog.
  - **`/chauffage/settings` still works**: it opens the *Thermostats* tab and the dialog on top.
  - **One name: overrides.** The section is *Overrides*, the setting *End of overrides*, as the
    card and the logbook say "override". One line under the heading says that a setpoint changed
    by hand becomes an override.
  - **The dialog keeps only labels, and the README explains.** The dialog reads like Home
    Assistant's own settings: a heading, one line, the fields and their short labels. A sentence
    and an example under each choice made the dialog heavy, and users found it hard to read. The
    README's table explains the three ends, with the example of the living room and the office.
  - **The duration first, then the choices that use it**, in the dialog, the options flow and the
    README. Each choice carries the user's duration, "For 2 h (default)", "For 2 h, or less if a
    slot starts first". The entity's states and the options flow keep static labels with "the
    override duration", as they cannot follow a value.
  - **Radio buttons, each a whole row to tap**, with a label only. One note under the choices,
    always shown, says that a slot that starts in less than 15 minutes doesn't count.
  - **The duration is a stepped field, the same code as the end of an override** ("until 01:30
    ▲▼"): a text in hours and minutes, "2 h 45", with two small arrows that move it by 15 minutes,
    from 15 minutes to 24 hours. One implementation serves both fields: the markup, the arrows,
    the arrow keys, the reading of a typed value on leaving or on Enter, and the style. A kind of
    field says how to show, read and move its value. A duration is typed as a time is, with the
    same parsing: "4" is 4 h, "0040" 40 minutes, "245", "2:45" and "2h45" are 2 h 45. "165" is no
    time, so no duration either. From 2 h 40, the arrows go to 2 h 45 or 2 h 30, as those of a
    time field. A value out of range, or not a duration, is refused next to the field, and the
    field shows the duration kept. A first version used a list of 15, 30, 45 minutes and whole
    hours, then Home Assistant's dropdown: neither could give 2 h 45.
  - **A change is sent at once**, as in Home Assistant's settings. The controls wait for the
    answer, then say "Saved".
  - **The dialog says nothing of the entities, nor that no thermostat is scheduled yet.** The
    README documents the entities, and the settings work without a thermostat.

### The more-info block

- **The block injected in the more-info dialog stays.** See [The UX review](#the-ux-review-080-beta2).
- **The block's link to the thermostat's page says "Open in Chauffage"** (*Ouvrir dans
  Chauffage*, the `openInPanel` key). "Chauffage" is the panel's title as Home Assistant shows it
  in the sidebar, so the link follows a renamed panel or integration.
  **Amended by the UX review**: the link says what it does, *Edit its week* (*Modifier sa
  semaine*, the `editWeek` key), and opens the thermostat's page on its week in the active
  schedule (`?week=<schedule>`), scrolled to it, with no highlight: its *Active* badge is enough. A tap on the week shown in the
  block does the same. A tap on one day would be ambiguous with the days grouped, so the link goes
  to the week only. The page keeps the schedules' order: it scrolls, it does not move the active
  week first.
- **A link from the more-info dialog to a page closes the dialog first**, then opens the page
  (`leaveMoreInfo`). The page is, for example, the thermostat's page or a device. Home Assistant
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
- **A schedule's icon is changed in its switch's settings.** The ⋮ menu of a schedule opens Home
  Assistant's more-info dialog on its *Settings* view (`view: "settings"`), as Home Assistant's own
  pages do for a scene. Renaming and picking an icon are Home Assistant's usual paths for an
  entity, so Chauffage does not store an icon of its own. *Rename…* stays Chauffage's: the
  schedule's name shows on the tabs, and the switch's name follows it.
- **The more-info block stays, lighter.** Its foot keeps *Edit its week* (admins only, as the
  panel) and *Pause* (anyone who may control the thermostat). The links to the *Control*, *Override* and *Planned preset* entities and to
  the device go: the device's page lists them, and the panel's page links both devices. The
  block keeps its preset chips and its temperature field: on a thermostat without presets, they
  are the only way to pick a Chauffage preset.
- **A pause ends with *Resume control*** (*Piloter*), after the *Control* switch. "Resume" stays for the
  override only (*Resume the schedule*), so the block never shows two "Resume" buttons.
- **A thermostat chip keeps its ↗ link to the more-info dialog.** With one thermostat shown, it
  is the only link to the thermostat. Its tap area grows on a touch screen.
- **A tap on a chip shows that thermostat only**, like a switch. *Multiple* stays the way to show
  several thermostats.
- **The schedule card's link to the settings sits in its presets legend**, for admins: *Set the
  presets*. The card had three links (*Presets*, *Rules*, *Thermostats*) at its top, in another
  order than the panel's tabs. The legend showed the presets without saying where to set them.
  A button with Chauffage's icon, at the card's top right, opens the panel, as the dashboards
  open their own panels.
- **Two ways to schedule a thermostat stay**: editing its week in a card, or the panel. Removing one
  would gain little.
- **A ⋮ button always opens a floating menu**, as in the card. The panel's list of thermostats
  unfolded a row of actions instead. A row of this list opens the thermostat's page, and its
  badge only says *Paused*, the exception.
- **A week is copied from a ⋮ menu**, not from a list that acts as soon as an option is picked.
- **One save bar for a thermostat's page.** It names the weeks not saved yet, and saves them in
  one call. On a phone, a bar under a week further up the page went unseen. A copy still marks
  only its target week as not saved.
- **Every user can set, change and end an override from a card.** The `chauffage.set_override`
  and `chauffage.clear_override` services were already open to every user, and anyone can turn
  the thermostat's knob. The websocket command keeps its format: only its permission changes.
- **Every user who may control a thermostat can pause it and resume it from a card**, as with its
  *Control* switch, which any such user could already turn off. The panel stays for admins: its
  thermostat menu keeps *Pause*, and the more-info block keeps *Edit its week* for admins only.
- **One word for each thing**, as the glossary says: *override* (*dérogation*), not "temporary
  setpoint"; *slot* (*créneau*), not "plage"; the panel's *tabs* (*onglets*).
- **The panel's lists look like the list of the integration's page**: an icon, the name and a
  line under it, a chevron, then the actions after a divider. The whole row is one link, chevron
  included, except its actions. The card copies this style with the theme's variables. It does not use
  `ha-list-item-button`: that component is internal to Home Assistant's frontend, it was renamed
  since 2025.1, and a dashboard may not load it. If Home Assistant restyles its lists, adjust the
  copy.
- **The schedule tabs scroll natively, with no scrollbar.** A fade shows on each side where
  schedules are hidden. With a mouse, an arrow lies over the fade: it scrolls with the browser's
  smooth scrolling, which stops when the user scrolls. The card does not take over the wheel. The
  arrows are always in the page, shown by a class, so showing them moves no tab. On a touch screen,
  the fade alone: a finger scrolls.
- **The list is a card of its own**, on the *Thermostats* and *Schedules* tabs: its first and last
  rows touch the card's edges, with a line between two rows, as on the integration's page. The
  texts, the link to the integration's page and the action to add one sit outside that card.
  *+ New schedule* sits under the list, as the form to add a thermostat: the *Schedules* tab has a
  second section, the rules, so a floating button would not say which list it adds to.
- **One attribute leads to a page**: `data-navigate`, holding the address, for every link to a page
  of the panel or to a dashboard. Four attributes did it, and every click handler had to know them
  all.
- **The card's panel-only options are internal.** The panel passes them to the card in its own
  key, not as options a dashboard could set.
  The weeks stacked on a thermostat's page take one of them, `week_only`: the week alone, without
  chips, tabs, hint, paused note, legend or save bar, today marked in the active schedule only.
  Eight options always set together used to do it.

### Open questions

- **Two devices with the same name in the same area**: the thermostat's and ours. Should our device
  carry a mark, for example "Bureau (Chauffage)"?
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
- **The repository keeps a single `manifest.json`.** HACS lists ha-chauffage in its default
  repositories, and its checks expect one manifest. The development HA's simulated climate uses
  `manifest.dev.json` for this reason.
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
