# How it works

**English** · [Français](how-it-works.fr.md)

This page is for the curious, and for contributors. [decisions.md](decisions.md) gives the
details and the reasons.

**Stored data.** Chauffage stores the schedules, the presets, the weeks and the current overrides
in `.storage/chauffage`. Each thermostat's weeks are under `thermostats.<climate>.weeks`, in
the format `{schedule id: [7 days × [[start, preset, settings?], …]]}`. The optional `settings`
hold the slot's HVAC mode and fan settings. An off or fan-only slot has no preset. The data has
a version, and Chauffage migrates it automatically.

**The scheduler.** Every minute, the scheduler applies the slots that start now, and ends the
overrides that expire. The scheduler also sets every thermostat to its schedule at startup, when
a schedule is activated, and when weeks are saved. The scheduler skips a thermostat that has an
override or is unavailable.

**Manual changes.** A setpoint, a preset or an HVAC mode changed by hand becomes an override,
for example a thermostat turned off by hand. Chauffage recognizes its own commands by their
context, and ignores the changes made by automations.

**The card.** The integration serves the card and loads it on every page, with
`add_extra_js_url`, so the block in the more-info dialog works everywhere. The card talks to the
integration over the websocket API, for example `chauffage/subscribe` or `chauffage/weeks/save`.
The integration refuses a save made from an outdated copy, so that a save never overwrites
someone else's changes.

**The history.** The card asks the integration for the last 7 days (`chauffage/history`). The
integration reads the measured temperature and the applied setpoint from Home Assistant's
recorder, and stores nothing.
