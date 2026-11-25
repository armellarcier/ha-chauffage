# Contributing to ha-chauffage

**English** · [Français](CONTRIBUTING.fr.md)

**Don't develop on your production Home Assistant.** Work with the automated tests and a
disposable development HA, then publish a pre-release to try your version on a real Home
Assistant.

## Prerequisites

- Git, Bash (Linux, macOS, or Git Bash / WSL on Windows), and `curl`.
- [Docker](https://docs.docker.com/get-docker/) for the development HA. On Windows and macOS,
  use Docker Desktop.

The card is written in TypeScript, in `frontend/src/`. esbuild bundles it into one file, which
the integration serves. Node builds the card and runs the card tests, and Python runs the
integration tests. If Node or Python is not installed, the scripts run them in Docker.

## Repository layout

```
custom_components/chauffage/        the integration (scheduler, entities, services, websocket API)
custom_components/chauffage/domain/ the rules of Chauffage as value objects, without Home Assistant
frontend/src/                       the card, in TypeScript: Lovelace cards, panel, block injected into
                                    the more-info dialog
custom_components/chauffage/frontend/  the built card, served by the integration (not in git)
dev/compose.yaml, dev/hass/         disposable development HA (Versatile Thermostat + simulated rooms)
dev/sim_rooms/, dev/sim_climate/    dev only: thermal model of the rooms (and a simulated week of
                                    history for a new dev HA), a climate with standard presets
tests/integration/, tests/js/       automated tests (pytest + in-memory HA, node --test + jsdom)
docs/                               the user guide (one page per topic, in English and French), and
                                    the glossary, design decisions, use cases and writing style
tests/fixtures/                     stored data in each past format (migration tests)
scripts/                            build.mjs, build.sh, test.sh, logs.sh, demo.sh
.github/workflows/                  tests (CI), hassfest, HACS checks and releases
```

### Add or move a page of the docs

1. Write the page in `docs/<topic>.md`, and its French version in `docs/<topic>.fr.md`.
2. Add a row for the page to the user-guide table of `docs/README.md` and `docs/README.fr.md`.
3. Add the same row to the *Documentation* table of `README.md` and `README.fr.md`, at the end
   of *Learn more*. If a README section presents the page's topic, link the page from it too.
4. When a section leaves the README, keep its anchor: add an `<a id>` to the *Moved sections*
   table of the README.

## The development HA

Start the development HA:

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

Open <http://localhost:8124/chauffage-dev> and log in with **`dev` / `dev`**. The *Chauffage*
dashboard, in the sidebar, shows the card with ten thermostats.

### What the development HA holds

The `setup` service ([`dev/setup/setup.py`](dev/setup/setup.py)) sets everything up on the first
start, through Home Assistant's public APIs: the **Chauffage** integration, the card and sample
schedules.

The repository is **mounted live**. Your changes to `custom_components/chauffage/` reach the
development HA without a copy.

`dev/hass/packages/simulation.yaml` creates ten simulated rooms. Each room has a heater
(`input_boolean.radiateur_*`) and a temperature sensor (`sensor.temperature_*`). The sensor
reports the temperature every minute, to 0.1 °C, like a real sensor. A room with an air
conditioner also has a cooler (`input_boolean.clim_*`): the cooler cools the room while the air
conditioner cools. The rooms cover **every kind of thermostat**:

| Rooms | Thermostat |
|---|---|
| salon, bureau, chambre | **Versatile Thermostat**, "over a switch", with presets at 7 / 17 / 20 / 22 °C. A manual setpoint sets the preset to `none`. |
| cuisine | Home Assistant's **`generic_thermostat`**, without presets, declared in YAML. |
| chambre d'amis | **Standard presets** (`eco`, `comfort`, `away`, `boost`, no `frost`), from the dev-only platform [`dev/sim_climate/`](dev/sim_climate/climate.py). A manual setpoint clears the preset. |
| véranda | **Versatile Thermostat**, "over a climate", with **auto start/stop**. The climate under it, `climate.clim_veranda`, comes from `dev/sim_climate/` and is not scheduled. |
| atelier | A **reversible air conditioner** from `dev/sim_climate/`: standard presets, `heat`, `cool`, `auto` and `fan_only`, with `fan_modes`, `swing_modes` and `swing_horizontal_modes` (the values of #61). In `cool`, `input_boolean.clim_atelier` cools the room, and its presets give cooling setpoints (`eco` 27 °C, `comfort` 25 °C). |
| mezzanine | **Versatile Thermostat**, "over a climate", in **AC mode**: `heat`, `cool` and `off`. In `cool`, its presets are at 27 / 25 / 23 °C (`eco`, `comfort`, `boost`). The climate under it, `climate.clim_mezzanine`, comes from `dev/sim_climate/` and is not scheduled. |
| combles | A **cooling-only air conditioner** from `dev/sim_climate/`: `cool`, `fan_only` and `off`, with `fan_modes` and standard presets at cooling setpoints. The room has no heater. |
| suite parentale | A **reversible Daikin**, simulated from what Home Assistant's `daikin` integration exposes: `heat`, `cool`, `heat_cool`, `dry` and `fan_only`, the presets `none`, `away`, `eco` and `boost`, with `fan_modes` and `swing_modes`. A preset does not change the setpoint. |

The sample weeks of the air conditioners show what a slot can choose. The suite parentale has
a slot that cools, a heat/cool slot, a dry slot, a fan-only slot and an off slot. The atelier
has an auto slot on the weekend.

The simulated Daikin differs from the real one on one point. In `heat_cool`, it takes a range
of temperatures, so that the development HA has a thermostat for heat/cool slots.

Two Versatile Thermostats also watch a **window**, an `input_boolean` you turn on to open it:

| Window | What the VTherm does while the window is open |
|---|---|
| `input_boolean.fenetre_bureau` | It keeps its preset and sets the frost setpoint. |
| `input_boolean.fenetre_chambre` | It turns off. |

To try auto start/stop, set `input_number.temperature_veranda` to 28 °C: the veranda turns off
within a minute. Set the slider to 12 °C: the veranda turns back on after about 7 minutes.

These VTherm features change the thermostat by themselves. They only exist on a new
development HA: an existing one keeps its Versatile Thermostats as they are.

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
| `frontend/src/*.ts` (the card) | Reload the browser page. The `card` service of the development HA builds the card again. |
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

To try something on a clean development HA, start a second one next to yours. The second
development HA is another compose project, with its own configuration folder and its own port:

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
| `tests/integration/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component): a real in-memory Home Assistant with a frozen clock, `custom_components/` loaded | slots applied at the right time, schedules, thermostats turned off or unreachable, manual-change detection, overrides and their end, activation rules, the pure logic (`domain/`, `engine.py`), storage and migrations, entities, services, websocket API, the history read from the recorder, config / options flows |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (simulated browser), with a fake HA and integration (`tests/js/helpers.mjs`) | the card: calculations, editing the weeks, copy / paste, saving, schedules, presets, activation rules, overrides, history and a day shown larger, more-info |

### The integration tests

In the integration tests, thermostats are plain simulated `climate.*` states, and recorders
replace the `climate` services. The `Bench` object (`conftest.py`) moves time forward, simulates
a manual change or the thermostat's response, and saves schedules as the card does.

The behavior tests run on **the three kinds of thermostats**, through the `thermostat_kind`
fixture: `vtherm`, `standard` and `plain`. If a test only makes sense for some kinds, call
`bench.needs(...)` in the test.

Read what Chauffage holds through the bench: `bench.presets()`, `bench.overrides()` or
`bench.snapshot()`, the message the card receives. To read what Chauffage saved, call
`await bench.stored()`. Never read `runtime.data`. To simulate data stored by an older version,
call `bench.edit_stored_data(...)`.

### The safety nets of the rewrite

These tests keep the behavior while the code is rewritten (see
[docs/rewrite-plan.md](docs/rewrite-plan.md)):

| Test | What it checks |
|---|---|
| `test_subscribe_golden.py` | The card receives exactly the message of `tests/integration/golden/subscribe.json`. |
| `test_store.py` | Chauffage saves the stored data back as it read it, from every past format. |
| `test_pure_domain.py` | The domain imports nothing from Home Assistant. |
| `tests/shared/cases.json` | The integration (`test_shared_cases.py`) and the card (`shared-cases.test.mjs`) give the same results. |

To change the message of `chauffage/subscribe` on purpose, delete `golden/subscribe.json`, run
the test once, and review the new file in the diff.

### The card tests

Drive the card through `tests/js/driver.mjs`, never through its private members. For example,
click a control with `act(card, 'save')`, and check `unsaved(card)` rather than `card._dirty`.
If the driver lacks a function, add it to the driver. Reach into the card only when no user
action can do it, and say why in an `Internal:` comment.

### The card's TypeScript

The card tests run the TypeScript sources without a build: Node removes the types. So:

- Write only syntax that Node can remove, for example no `enum` and no parameter properties.
- Import a module with its `.ts` extension.
- Check the types with `npm run typecheck`. `scripts/test.sh js` and the CI run it too.

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
- `README.md`, `README.fr.md`, `docs/installation.md` and `docs/installation.fr.md`.

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

## Reviewing the card in the development HA

To check a card change the way a user sees it, drive the development HA with Playwright. The
review library in [`dev/review/`](dev/review/README.md) opens a slot, an override or a cell of
the *Presets* tab, measures what it shows, and compares the thermostats' states with what the
card said.

Run a script from the root of the repository, with the development HA running:

```bash
dev/review/run.sh dev/review/examples/slot.mjs
```

The script runs in the Playwright Docker image, so you install nothing. The screenshots go to
`dev/review/out/`. Open them: a row can measure right and still look wrong.

Before a script changes slots or overrides, take a `backup` of the thermostats it touches, and
`restore` it at the end. [`dev/review/README.md`](dev/review/README.md) lists every helper.

## Demos

The README shows three demos, in `docs/media/`:

| GIF | What it shows |
|---|---|
| `week.gif` | a schedule copied and edited, another one activated, then the history |
| `override.gif` | a change by hand on a phone, then its end dragged later and 30 more minutes, on the room's card |
| `panel.gif` | the *Presets* tab of the panel, then the settings of Chauffage |

Each demo has its scenario in `dev/demo/scenarios/<name>.mjs`. `dev/demo/lib.mjs` logs in,
records the frames and cleans up, for every scenario.

### 1. Record the demos

```bash
scripts/demo.sh            # every demo
scripts/demo.sh override   # one demo
```

The script needs only Docker. Your development HA can keep running.

**The demo HA.** The script starts a new development HA, the demo HA, on port 8127. The clock
of the demo HA runs on a Tuesday at 17:30, Paris time, whatever the real time. So the demos
show the same day and the same hour at every recording. The demo HA has the sample data and
the simulated week of a new development HA. The script removes the demo HA at the end.

- To record at another time, set `DEMO_TIME`, for example `DEMO_TIME="wednesday 08:00"`.
- To keep the demo HA running after the recording, set `DEMO_KEEP=1`. Open it at
  <http://localhost:8127>, with `dev` / `dev`.

**The GIFs.** The script saves every frame the browser paints, without loss. Then ffmpeg makes
a GIF at 15 frames a second, with one palette built for the whole GIF. The script writes
`docs/media/<name>.gif`.

### 2. Check each GIF

Open each GIF before you commit it. A GIF can play to the end and still show the wrong thing.
Keep a demo under 30 seconds and under 2 MB.

### 3. Add a demo

1. Copy a scenario in `dev/demo/scenarios/`, and give it a new name.
2. Write its `scene`. Write its `prepare` with the integration's API, if the scene needs a state
   that the sample data doesn't have.
3. Add the name to the default list of `scripts/demo.sh`.
4. Show the GIF in the README section of its topic, and on the docs page of its topic.

## Trying a version on a real Home Assistant

### With a pre-release

To try a version on a real Home Assistant, publish a pre-release (see [Releasing](#releasing)).
Then install the pre-release from HACS, with beta versions enabled. HACS installs and updates a
pre-release like any release.

### Our shortcut: scripts/deploy.sh

**`scripts/deploy.sh` is a hack, at your own risk.** We keep it for our own quick tries between
two pre-releases. We don't support it: please don't open issues about it.

The script copies a commit straight into the configuration folder of your Home Assistant. HACS
doesn't know about it, and your Home Assistant runs a version that nobody released. Roll back, or
release the version, as soon as you have tried it.

#### 1. Check the prerequisites

- Home Assistant runs in a Docker container.
- Your machine has `bash` and `git`.
- `ssh <host>` works without a password, for example with a host alias in `~/.ssh/config`.
- The SSH user can write to the Home Assistant configuration folder and can run `docker`.
- The host has `bash` and `tar`.

#### 2. Set up `.env`

```bash
PROD_HA_CONFIG=home-assistant:/docker/homeassistant/config   # host:/folder, or a local folder
PROD_HA_CONTAINER=homeassistant
```

#### 3. Deploy

Commit your changes, then run:

```bash
scripts/deploy.sh
```

The script installs the last commit of your current branch. Changes that are not committed are
not deployed. Before it changes anything, the script prints the commit's sha.

The script stops Home Assistant, installs the commit, and starts Home Assistant again. The first
deploy also saves what is installed and its data in `<config>/.chauffage-backup`. Later deploys
keep this backup, and say which release it holds.

#### 4. Deploy another branch

To deploy another branch without checking it out, run `scripts/deploy.sh --branch <branch>`. To
pin the commit you reviewed, give its full sha instead.

For a branch that is only on GitHub, for example a contributor's, fetch it first:

```bash
git fetch origin <branch>
scripts/deploy.sh --branch origin/<branch>
```

Run the script from your own checkout of `main`.

#### 5. Roll back

```bash
scripts/deploy.sh --rollback
```

The rollback stops Home Assistant, puts back the release and its data, starts Home Assistant,
and deletes the backup.

Every change made in Chauffage since the first deploy is lost, for example a week you edited.
The rollback keeps the data of the dev version in `<config>/.chauffage-dev-data-<time>`. This
file has the format of the dev version, so the release may not read it.

If Chauffage was not installed before the first deploy, the rollback removes it.

#### 6. Or keep the version

If the version works, don't roll back:

1. Release the commit you tried (see [Releasing](#releasing)).
2. Update Chauffage from HACS to that release.

Home Assistant keeps the data you changed during the test. The backup is then out of date: the
next deploy makes a new one, and a rollback only deletes it.

#### What the backup does not cover

- **HACS.** HACS still shows the release you installed before the first deploy, until you
  update from HACS.
- **The integration's configuration.** The backup holds `.storage/chauffage`, not the
  integration's entry in `.storage/core.config_entries`. If your version raises the major
  version of the entry, the release can no longer load the integration after the rollback.

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

## Releasing

Versions follow [semantic versioning](https://semver.org/). Before 1.0, a minor version may
change the installation or the stored data. The stored data is always migrated automatically.

### 1. Run the tests

Run `scripts/test.sh`. Everything must be green, and every migration must have its fixture.

### 2. Decide whether to record the demos again

Ask the question at every release. Record a demo again (see [Demos](#demos)) when what it shows
looks different. When a visible feature is worth showing, extend the scenario of its topic, or
add a demo. Don't record anything again when the changes cannot be seen.

### 3. Set the version

Set the new version in `custom_components/chauffage/manifest.json`. The card takes its version
from the manifest when it is built. `tests/js/release.test.mjs` checks that the changelog has
the same version.

In `CHANGELOG.md`, move the "Unreleased" entries under the new version, with the date and the
upgrade steps.

### 4. Tag and push

Commit, then tag and push:

```bash
git tag -a v0.3.0 -m v0.3.0
git push origin main v0.3.0
```

The `Release` workflow (`.github/workflows/release.yml`) runs the tests and checks the version.
Then it builds the card and publishes the GitHub release, with the changelog entry and
`ha-chauffage.zip`.

The ZIP holds the files of `custom_components/chauffage/`, built card included. HACS installs
this ZIP (`zip_release` in `hacs.json`). Without HACS, unzip it into the
`custom_components/chauffage/` folder of the Home Assistant configuration.

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

- Write the texts in `frontend/src/i18n/`, one file per language, for example `en.ts`. Each
  file holds one object, with English keys and `{placeholder}` variables.
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

1. Copy `frontend/src/i18n/en.ts` to a file named after the language, and translate its texts.
2. Add the language to `I18N`, in `frontend/src/i18n/index.ts`.
3. Extend `resolveLanguage`, in `frontend/src/i18n/locale.ts`.
4. Run `scripts/test.sh js`.

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
- **Keep the French docs up to date.** The English docs (`README.md`, `CONTRIBUTING.md` and the
  pages of `docs/`) are the reference. Update the French version (`*.fr.md`) in the same commit.
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
