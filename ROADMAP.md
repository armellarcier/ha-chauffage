# Roadmap

**English** · [Français](ROADMAP.fr.md)

The goal: weekly heating schedules for **any Home Assistant `climate` entity**, set up entirely
from the UI, and eventually listed in HACS by default.

## Done

| Version | What |
|---|---|
| 0.1.0 | First release, as a YAML package (no longer maintained): schedules per thermostat and per mode, the editor card, temporary overrides, versioned data |
| 0.2 (betas) | The **Chauffage integration**: installed from HACS, configured from the UI, data in a versioned `Store` with migrations, mode select, sensors, services, websocket API, card served by the integration, English and French, import of the package's data ([docs/integration-plan.md](docs/integration-plan.md)) |
| 0.3.0 | **Heating levels** for any thermostat with a target temperature (Versatile Thermostat, standard presets, no presets), set in the card's *Levels* view; manual changes judged against what the schedule expects; tests on the three kinds of thermostats and a functional analysis ([docs/use-cases.md](docs/use-cases.md), [docs/phase-2-plan.md](docs/phase-2-plan.md)) |

## Next

### 1. Rethink the heating modes

Today there are three modes, *Normal* / *Away* / *Holiday*, created at setup with a weekly
schedule per thermostat and per mode, and one active mode for the whole home. What they mean is
only implied by their names: is *Away* a day out or a week? does *Holiday* end by itself? what
about a guest room nobody uses? Fixed, predefined modes are also what keeps ha-chauffage out of
the HACS default list.

The work is done in this order:

1. **Concept and function**: what a mode is, what users actually need (a day out, holidays, an
   empty room, a home office day…), what can be planned in advance, what ends by itself.
2. **Use cases / user stories**, added to [docs/use-cases.md](docs/use-cases.md).
3. **Implementation, tests first** (see CONTRIBUTING.md, "Tests first"), with a migration of the
   existing modes and schedules.

Ideas to examine then, not decisions: user-defined modes, a mode limited in time ("away until
Sunday 18:00"), a mode for some rooms only, modes driven by presence or a calendar.

### 2. Groups of thermostats

Zones sharing a schedule ("bedrooms", "living areas"), with exceptions per thermostat; overrides
stay per thermostat; the card edits groups. Depends on the outcome of the modes work.

### 3. Thermostats that change their setpoint by themselves

Some devices adjust their own setpoint (open window, presence, safety): today it looks like a
manual change and becomes an override. Recognize these adjustments (rules per thermostat or per
integration).

### 4. More thermostats and slots

Heat / cool thermostats with a temperature range (`heat_cool`), an *Off* level, slots carrying a
temperature directly ("21 °C from 06:30").

### 5. Development environment and CI

Pin the versions of Home Assistant and Versatile Thermostat in the development HA (with a
dependency bot proposing upgrades) and add an end-to-end CI check that starts it, runs the setup
and checks that a schedule is applied.

### 6. Card translations as files

Once the card is bundled: one JSON file per language with ICU MessageFormat (plurals), as in most
Home Assistant cards; more languages through contributions.

## HACS default list

ha-chauffage is installed as a HACS *custom repository* (HACS shows no icon for those; Home
Assistant does, once installed). It will be submitted to the default list (`hacs/default`) once
the heating modes are no longer predefined (step 1), with a stable release.
