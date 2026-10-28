# Contributing to ha-chauffage

**English** · [Français](CONTRIBUTING.fr.md)

**Don't develop on your production Home Assistant.** Work with the automated tests and a
disposable development HA, then publish a pre-release to try your version on a real Home
Assistant.

## Prerequisites

- Git, Bash (Linux, macOS, or Git Bash / WSL on Windows), and `curl`.
- [Docker](https://docs.docker.com/get-docker/) for the development HA. On Windows and macOS,
  use Docker Desktop.

The card is a JavaScript file served as is, so there is no build step. Node and Python are only
used by the automated tests. If Node or Python is not installed, the tests run in Docker.

## The development HA

Start the development HA:

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

Open <http://localhost:8124/chauffage-dev> and log in with **`dev` / `dev`**. The *Chauffage*
dashboard, in the sidebar, shows the card with five thermostats.

### What the development HA holds

The `setup` service ([`dev/setup/setup.py`](dev/setup/setup.py)) sets everything up on the first
start, through Home Assistant's public APIs: the **Chauffage** integration, the card and sample
schedules.

The repository is **mounted live**. Your changes to `custom_components/chauffage/` reach the
development HA without a copy.

`dev/hass/packages/simulation.yaml` creates five simulated rooms. Each room has a heater
(`input_boolean.radiateur_*`) and a temperature sensor (`sensor.temperature_*`). The sensor
reports the temperature every minute, to 0.1 °C, like a real sensor. The rooms cover **every
kind of thermostat**:

| Rooms | Thermostat |
|---|---|
| salon, bureau, chambre | **Versatile Thermostat**, "over a switch", with presets at 7 / 17 / 20 / 22 °C. A manual setpoint sets the preset to `none`. |
| cuisine | Home Assistant's **`generic_thermostat`**, without presets, declared in YAML. |
| chambre d'amis | **Standard presets** (`eco`, `comfort`, `away`, `boost`, no `frost`), from the dev-only platform [`dev/sim_climate/`](dev/sim_climate/climate.py). A manual setpoint clears the preset. |

The dev-only integration [`dev/sim_rooms/`](dev/sim_rooms/model.py) gives the rooms a realistic
thermal model. The radiator, the air, the walls and the sensor each have their own inertia. A
room heats up by about 1.7 °C an hour and cools down by about 0.6 °C an hour. The outdoor
temperature follows the day, and people, open doors and clouds disturb each room a little.

**A new development HA starts with a week of history.** The setup simulates the week before the
development HA was created, with the same thermal model and the sample schedules, and a manual
change one evening. So the card's *History* shows realistic curves at once. The recorder keeps
10 days.

### Change the versions

- To use another version of Versatile Thermostat, set `VTHERM_VERSION`:
  `VTHERM_VERSION=… docker compose -f dev/compose.yaml up -d`.
- To try the next Home Assistant release, set `HA_VERSION=beta`.

### Apply your changes

| You edit… | To apply your change |
|---|---|
| `custom_components/chauffage/frontend/*.js` (the card) | Reload the browser page. |
| `custom_components/chauffage/*.py`, `*.json` | `docker compose -f dev/compose.yaml restart homeassistant` |
| `dev/hass/configuration.yaml`, `dev/sim_rooms/*.py`, `dev/sim_climate/*.py` | `docker compose -f dev/compose.yaml restart homeassistant` |

To see the end of the log, filtered on the project, run `scripts/logs.sh`. To see everything,
run `scripts/logs.sh dev 200 all`. `scripts/logs.sh` uses the long-lived token that the setup
writes to `dev/hass/.dev-token`, so you don't need a `.env` file.

To test time-based logic faster, change the temperatures with the `input_number.temperature_*`
sliders, and shorten the override duration in the integration's options.

### Start over

The development HA keeps its state in `dev/hass/`, which is not versioned. To start over:

```bash
docker compose -f dev/compose.yaml down && git clean -fdX dev/hass
```

### A second, new development HA

To try something on a clean development HA, or to record the demo, start a second one next to
yours. The second development HA is another compose project, with its own configuration folder
and its own port:

```bash
mkdir -p /tmp/ha-fresh/packages && cp dev/hass/configuration.yaml /tmp/ha-fresh/ && cp dev/hass/packages/simulation.yaml /tmp/ha-fresh/packages/
DEV_HASS=/tmp/ha-fresh DEV_PORT=8125 docker compose -p ha-chauffage-fresh -f dev/compose.yaml up -d   # http://localhost:8125
```

## Automated tests

```bash
scripts/test.sh          # everything (uses Node / Python if installed, Docker otherwise)
scripts/test.sh js       # card only
scripts/test.sh integration   # the integration (extra arguments go to pytest: scripts/test.sh integration -k ends)
scripts/test.sh coverage      # card and integration with coverage (fails below the minimum)
HA=min scripts/test.sh integration   # same, on the minimum supported HA (hacs.json, 2025.1)
```

**Run `scripts/test.sh` before you publish.** GitHub Actions also runs the tests on every push and
pull request (`.github/workflows/tests.yml`).

| Suite | Tool | What it covers |
|---|---|---|
| `tests/integration/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component): a real in-memory Home Assistant with a frozen clock, `custom_components/` loaded | slots applied at the right time, schedules, thermostats turned off or unreachable, manual-change detection, overrides and their end, activation rules, the pure logic (`engine.py`), storage and migrations, entities, services, websocket API, the history read from the recorder, config / options flows, import from the v0.1 package |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (simulated browser), with a fake HA and integration (`tests/js/helpers.mjs`) | the card: calculations, editing the weeks, copy / paste, saving, schedules, presets, activation rules, overrides, history and a day shown larger, more-info |

### The integration tests

In the integration tests, thermostats are plain simulated `climate.*` states, and recorders
replace the `climate` services. The `Bench` object (`conftest.py`) moves time forward, simulates
a manual change or the thermostat's response, and saves schedules as the card does.

The behavior tests run on **the three kinds of thermostats**, through the `thermostat_kind`
fixture: `vtherm`, `standard` and `plain`. If a test only makes sense for some kinds, call
`bench.needs(...)` in the test.

## Supported Home Assistant versions

ha-chauffage supports every Home Assistant version from the minimum version in `hacs.json`
(2025.1) to the latest release. We keep the minimum Home Assistant version as low as possible:
[docs/decisions.md](docs/decisions.md#process) explains why.

### 1. Raising the minimum Home Assistant version

Raise the minimum Home Assistant version only when the code needs a Home Assistant API that
older versions don't have, or when Home Assistant removes an API we use. Raise it in a minor
version of ha-chauffage, and give the reason in the changelog, under "Upgrading".

Change these files in the same commit:

- `hacs.json`;
- `tests/integration/requirements-min.txt`, with the `pytest-homeassistant-custom-component`
  version that ships this Home Assistant version;
- the name of the minimum-version job in `.github/workflows/tests.yml`;
- `README.md` and `README.fr.md`.

`tests/js/release.test.mjs` checks that these files give the same minimum version. If this Home
Assistant version needs another Python version, also change the Python version of the
minimum-version job, and of `HA=min` in `scripts/test.sh`.

### 2. Which Home Assistant versions the CI tests

On every push, the CI tests these Home Assistant versions:

- the latest release (`requirements.txt`, updated by Dependabot);
- the minimum version (`requirements-min.txt`, updated by hand);
- one release per quarter between the two (x.1, x.4, x.7, x.10);
- for every version check in the code, the versions just before and just after it.

To test the minimum Home Assistant version locally, run `HA=min scripts/test.sh integration`.

When Dependabot brings in a Home Assistant release from a new quarter,
`test_supported_versions.py` fails. To fix it, add the release of the previous quarter to the
test matrix: its `pytest-homeassistant-custom-component` version, its Python version, and pins
if an unpinned dependency breaks it.

### 3. Code that depends on the Home Assistant version

If your code uses an API that appeared after the minimum Home Assistant version, check that the
API exists. The code must keep working on the minimum version. Add a test for each case: with
the API, and without it.

### 4. Lowering the minimum Home Assistant version

Lower the minimum version by big steps, not one month at a time. In a pull request, lower the
minimum version and add the older versions to the test matrix. The CI shows what breaks.

The CI only tests the card against a fake Home Assistant. So also try the card in a development
HA running the new minimum version, for example with `HA_VERSION=2025.1.0`.

### 5. The Home Assistant beta

Every Monday, `.github/workflows/ha-beta.yml` runs the integration tests on the Home Assistant
beta. You can also run this workflow by hand from the *Actions* tab. A failure never blocks a
push or a release. The failure warns of a coming change in Home Assistant: fix it before the
Home Assistant release if possible, without raising the minimum version.

## Demo animation

The README shows `docs/demo.gif`. To record the demo again, start a second, new development HA
(see [above](#a-second-new-development-ha)), then run:

```bash
DEMO_NETWORK=ha-chauffage-fresh_default scripts/demo.sh      # Playwright + ffmpeg in Docker
```

The demo needs the sample data, the *Pièces* view and the simulated week of a new development
HA, with the French names *Normal*, *Vacances* and *Absent*.

The scenario lives in [`dev/demo/record.mjs`](dev/demo/record.mjs). The browser clock is set to
a Tuesday morning, with a demo override. The scenario then shows, in order:

1. a *Télétravail* schedule created as a copy of *Normal*, and its Tuesday edited;
2. the *Presets* view: a preset's popover, then a thermostat's cell;
3. *Vacances* activated;
4. a thermostat's more-info dialog;
5. the thermostat cards of the *Pièces* view, with 30 more minutes for the living room's
   override;
6. the living room's *History*, and one day shown larger. For this step, the scenario goes back
   to the real time, because the history is real.

At the end, the scenario restores everything: it removes the override and the new schedule,
activates *Normal* again, and does not save the edits of the weeks.

## Trying a version on a real Home Assistant

To try a development version on your own Home Assistant, publish a pre-release (see
[Releasing](#releasing)). Then install the pre-release from HACS, with beta versions enabled.

Without HACS, copy `custom_components/chauffage/` into `<config>/custom_components/chauffage/`,
then restart Home Assistant.

## Data versions and migrations

Installations must upgrade with no manual step and no data loss.

### The stored data

`.storage/chauffage` is a Home Assistant `Store` with a version: `STORAGE_VERSION`, in
`custom_components/chauffage/store.py`. When you change the format of the stored data:

1. Bump `STORAGE_VERSION`.
2. Add `MIGRATIONS[n]`, which migrates version n to version n + 1.
3. Add the fixture `tests/fixtures/store-v<n+1>.json`.

`tests/integration/test_store.py` checks that every fixture migrates to the latest version.
Never edit an old fixture.

A release that changes the format of the overrides may drop the current overrides instead of
migrating them. The thermostats then go back to their schedule. Say so in the changelog.

The card only sees the websocket API. The format of the websocket API changes with the
integration, so the card needs no migration.

### The data of the v0.1 package

The integration imports the data of the v0.1 package (`sensor.programmes_chauffage`) when it is
set up. The import lives in `importer.py`, and `tests/fixtures/schedules-v1.json` holds the
package's format.

## Releasing

Versions follow [semantic versioning](https://semver.org/). Before 1.0, a minor version may
change the installation or the stored data. The stored data is always migrated automatically.

### 1. Run the tests

Run `scripts/test.sh`. Everything must be green, and every migration must have its fixture.

### 2. Decide whether to record the demo again

Ask the question at every release. Record the demo again (see [Demo animation](#demo-animation)) when the card
looks different, or when a visible feature is worth showing: then extend the scenario. Don't
record it again when the changes cannot be seen.

### 3. Set the version

Set the new version in these files:

- `custom_components/chauffage/frontend/chauffage-programme-card.js` (`VERSION`);
- `package.json`;
- `custom_components/chauffage/manifest.json`.

`tests/js/release.test.mjs` checks that these versions match.

In `CHANGELOG.md`, move the "Unreleased" entries under the new version, with the date and the
upgrade steps.

### 4. Tag and push

Commit, then tag and push:

```bash
git tag -a v0.3.0 -m v0.3.0
git push origin main v0.3.0
```

The `Release` workflow (`.github/workflows/release.yml`) runs the tests and checks the version.
Then it publishes the GitHub release, with the changelog entry and `ha-chauffage-v0.3.0.zip`.
The ZIP holds `custom_components/chauffage/`, to unzip into the Home Assistant configuration
folder without HACS.

### Pre-releases

For a pre-release, for example `0.3.0-beta.1`, follow the same steps. A tag that contains `-` is
published as a GitHub pre-release. HACS only offers a pre-release to users who enable beta
versions.

A change to the stored data or to the installation goes through a beta first. Install the beta
on a real installation before the release.

## Translations

The card speaks English and French. The card follows the Home Assistant user's profile
(`hass.locale`):

- the **language**: French for any `fr*` language, and English otherwise;
- the **time format** (12 or 24 hours), the **number format** (the decimal separator) and the
  **first day of the week**;
- the temperature unit of the Home Assistant configuration.

The card's `language` option can force a language.

### The card's texts

- Write the texts in the `I18N` object of
  `custom_components/chauffage/frontend/chauffage-programme-card.js`. `I18N` holds one object per
  language, with English keys and `{placeholder}` variables.
- Give every language exactly the same keys and placeholders. `tests/js/i18n.test.mjs` checks
  it.
- Never write a format by hand. Times, day names and numbers come from the browser's `Intl` APIs,
  following `hass.locale` (see `makeLocale`).
- Don't translate the names of schedules and presets, for example `Normal` or `Confort`. These
  names are data, not UI texts. The integration creates the default names in the Home Assistant
  language.

### The integration's texts

The integration's texts use Home Assistant's translation files: `strings.json` (English, the
source), `translations/en.json` and `translations/fr.json`. Give them the same keys. Examples of
such texts: the config flow, the entities, the services, the repairs and the errors.

### Add a language

1. Add an object to `I18N`, with the same keys as `en`.
2. Extend `resolveLanguage`.
3. Run `scripts/test.sh js`.

Once the card is bundled (see the roadmap), the translations will move to one JSON file per
language, with ICU MessageFormat for plurals, as in most Home Assistant cards.

## Tests first

The tests are the documentation of ha-chauffage. Each test says in a sentence what ha-chauffage
does, for example `a_thermostat_back_online_is_set_to_its_schedule`, and proves it on every run.
So test everything, and write the tests first (TDD).

### 1. Write the test first

For a new behavior or a bug, write a test named after the use case, in the user's words. Run the
test and **see it fail**, for the expected reason. A test that passes at once proves nothing:
break the code on purpose and check that the test fails.

### 2. Write the code

Write the code that makes the test pass, and nothing more. Then clean up, with the tests green.

### 3. List the use case

Every use case has a test, listed in [docs/use-cases.md](docs/use-cases.md). When you add a use
case, add a row there.

Test what users do and expect, not lines of code. Think of error paths, limits (midnight, Sunday
to Monday, summer time), restarts, unreachable devices and other languages.

### 4. Test every kind of thermostat

The behavior tests of the integration run on Versatile Thermostat, on standard presets and on
thermostats without presets (`thermostat_kind`). Use `bench.needs(...)` only for a behavior that
cannot exist on a kind of thermostat.

### 5. Add a regression test to every fix

A fixed bug gets a regression test, which fails without the fix.

### Coverage

The CI fails below **97 %** coverage for the integration, and **95 %** for the card
(`scripts/test.sh coverage`). The README shows the current values. Treat coverage as a floor,
not as the goal: [docs/decisions.md](docs/decisions.md#process) explains why.

## Conventions

These conventions apply to every contributor, human or AI assistant. `AGENTS.md` and `CLAUDE.md`
point here.

- **Write the code in English**, even though the project is called `ha-chauffage`: the names of
  variables, functions and files, the comments, the specs and the tests. Some existing code still
  has French comments or names. Translate them when you modify the code around them.
- **Use one vocabulary**, defined in [docs/glossary.md](docs/glossary.md): *schedule*, *preset*,
  *slot* and *override*. Use the same words in the UI, the docs, the code, the data and the
  tests. In French, a preset is a *préréglage*, as in Home Assistant.
- **Name the Home Assistant entities in French.**
- **Write the commits in English**, short and descriptive.
- **Write the docs for the reader.** Read [docs/writing-style.md](docs/writing-style.md) before
  you edit a doc, a changelog entry or a pull request.
- **Keep the French docs up to date.** The English docs (`README.md`, `CONTRIBUTING.md`) are the
  reference. Update the French version (`*.fr.md`) in the same commit.
- **Write the tests first** (see [Tests first](#tests-first)): `tests/integration/` for the
  integration, `tests/js/` for the card.
- **Record the decisions.** When you make a choice that a future contributor might question,
  write the choice and its reason in [docs/decisions.md](docs/decisions.md).
- **Discuss requests and ideas in GitHub issues.** [ROADMAP.md](ROADMAP.md) holds the vision and
  the ideas we keep, with links to their issues.
- **Convert Enums to plain values.** Data read from thermostats may hold Enums, for example a ZHA
  `preset_mode`. Convert them with `.value` before you store them or put them in an attribute.
- **Say why Chauffage does something to a thermostat** (#49):
  - Send every command through `send()`, with its reason. `send()` logs the command at INFO.
  - Start and end every override through `_keep_override()` and `_drop_override()`, with its
    source or its reason. These functions log the override, fire the event, and describe it in
    the logbook.
  - Give a new source or reason its text in every language of `logbook.py`. `test_traces.py`
    checks it.
  - Give a new trace its test in `test_traces.py`.
- **Try your card changes in the development HA**, on every kind of thermostat.
- **Make the card work on phones.** The card must work by touch: show no information only on
  hover, and make no action only reachable with a mouse or a keyboard. The card must also work on
  a narrow screen, from 360 px wide. Try your card changes at that width in the development HA.
