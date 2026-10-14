# Contributing to ha-chauffage

**English** · [Français](CONTRIBUTING.fr.md)

Golden rule, as in most Home Assistant projects: **don't develop on your production HA.**
Work with the automated tests and a disposable development HA, then publish a pre-release.

## Prerequisites

- Git, Bash (Linux, macOS, or Git Bash / WSL on Windows), `curl`.
- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop on Windows / macOS) for the dev HA.

No build step: the card is a JavaScript file served as is. Node and Python are only used by
the automated tests, and Docker stands in for them if they are not installed.

## The development HA

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

- Versatile Thermostat is installed automatically (`VTHERM_VERSION=… docker compose … up -d`
  for another version; `HA_VERSION=beta` to test the next HA release).
- The repository is **mounted live**: `custom_components/chauffage/` → the integration and its
  card.
- `dev/hass/packages/simulation.yaml` creates five virtual rooms: a heater
  `input_boolean.radiateur_*` and a temperature `sensor.temperature_*` (reported every minute
  to 0.1 °C, like real sensors). The dev-only integration [`dev/sim_rooms/`](dev/sim_rooms/model.py)
  gives them a realistic thermal model: the radiator, the air, the walls and the sensor each have
  their inertia (a room heats up by about 1.7 °C an hour and cools down by about 0.6 °C an
  hour), the outdoor temperature follows the day, and people, doors opened and clouds disturb
  each room a little. They cover **every kind of thermostat**:
  - salon, bureau, chambre: **Versatile Thermostat** (presets, `none` on a manual setpoint);
  - cuisine: HA's **`generic_thermostat`**, without presets (declared in YAML);
  - chambre d'amis: **standard presets** (`eco`, `comfort`, `away`, `boost`, no `frost`;
    preset cleared on a manual setpoint), from the dev-only platform
    [`dev/sim_climate/`](dev/sim_climate/climate.py).

**Everything is set up automatically on first start** by the `setup` service
([`dev/setup/setup.py`](dev/setup/setup.py), through HA's public APIs): log in at
<http://localhost:8124/chauffage-dev> with **`dev` / `dev`**: the "Chauffage" dashboard
(sidebar) shows the card with the five thermostats (the three Versatile Thermostat ones are
"over a switch", preset temperatures 7 / 17 / 20 / 22 °C), the **Chauffage** integration and
sample schedules. **A new dev HA also starts with a week of history**: the week before its
creation, simulated with the same model, the thermostats following the sample schedules (with
a manual change one evening), so that the card's *History* shows realistic curves at once (the
recorder keeps 10 days). A long-lived token is written to `dev/hass/.dev-token` and used by
`scripts/logs.sh` (no `.env` needed for the dev HA). State is kept in `dev/hass/` (not
versioned); to start over: `docker compose -f dev/compose.yaml down && git clean -fdX dev/hass`.

A **second, new dev HA** next to yours (to try something on a clean one, or to record the demo):
another compose project, its own configuration folder (a copy of the versioned files of
`dev/hass`) and port:

```bash
mkdir -p /tmp/ha-fresh/packages && cp dev/hass/configuration.yaml /tmp/ha-fresh/ && cp dev/hass/packages/simulation.yaml /tmp/ha-fresh/packages/
DEV_HASS=/tmp/ha-fresh DEV_PORT=8125 docker compose -p ha-chauffage-fresh -f dev/compose.yaml up -d   # http://localhost:8125
```

**Work loop:**

| I edit… | To apply it |
|---|---|
| `custom_components/chauffage/frontend/*.js` (card) | reload the browser page |
| `custom_components/chauffage/*.py`, `*.json` | `docker compose -f dev/compose.yaml restart homeassistant` |
| `dev/hass/configuration.yaml`, `dev/sim_rooms/*.py`, `dev/sim_climate/*.py` | `docker compose -f dev/compose.yaml restart homeassistant` |

`scripts/logs.sh` shows the end of the log (filtered on the project; `scripts/logs.sh dev 200 all`
to see everything). To speed up testing of time-based logic, change temperatures with the
`input_number.temperature_*` sliders and the override duration (integration options).

## Automated tests

```bash
scripts/test.sh          # everything (uses Node / Python if installed, Docker otherwise)
scripts/test.sh js       # card only
scripts/test.sh integration   # the integration (extra arguments go to pytest: scripts/test.sh integration -k ends)
scripts/test.sh coverage      # card and integration with coverage (fails below the minimum)
HA=min scripts/test.sh integration   # same, on the minimum supported HA (hacs.json, 2025.1)
```

| Suite | Tool | What it covers |
|---|---|---|
| `tests/integration/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component): a real in-memory Home Assistant with a frozen clock, `custom_components/` loaded | slots applied at the right time, modes, thermostats turned off or unreachable, manual-change detection, overrides and their end, activation rules, the pure logic (`engine.py`), storage and migrations, entities, services, websocket API, the history read from the recorder, config / options flows, import from the v0.1 package |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (simulated browser), with a fake HA and integration (`tests/js/helpers.mjs`) | the card: calculations, editing the weeks, copy / paste, saving, schedules, presets, activation rules, overrides, history and a day shown larger, more-info |

The Python suite runs on the latest Home Assistant and on the minimum supported one (CI and
`HA=min`). Thermostats are plain simulated `climate.*` states and the `climate` services are
replaced by recorders; the `Bench` object (`conftest.py`) moves time forward, simulates a manual
change or the thermostat's response, and saves schedules like the card does. The behavior tests
run on **the three kinds of thermostats** (fixture `thermostat_kind`: `vtherm`, `standard`,
`plain`); a test that only makes sense for some kinds calls `bench.needs(...)`.

The tests also run on GitHub Actions for every push and pull request
(`.github/workflows/tests.yml`). **Run `scripts/test.sh` before publishing.**

## Supported Home Assistant versions

**The minimum stays as low as possible.** ha-chauffage supports every Home Assistant from the
minimum in `hacs.json` (also written in the READMEs) to the latest release.

- **The minimum only rises when a Home Assistant API requires it**: a feature or a fix needs an
  API that older versions do not have, or an API we use is removed. Not to follow the releases,
  nor to drop old code that still works. A rise goes into a minor version, with the reason in
  the changelog ("Upgrading"). Change `hacs.json`, `tests/integration/requirements-min.txt` (the
  `pytest-homeassistant-custom-component` that ships that Home Assistant), the job name in
  `.github/workflows/tests.yml` and the READMEs together: `tests/js/release.test.mjs` checks
  that they agree. If that Home Assistant needs another Python, change it too (the `python` of
  the job, and of `HA=min` in `scripts/test.sh`).
- **The CI tests the supported versions**, on every push (the matrix of the `python` job in
  `.github/workflows/tests.yml`): the latest release (`requirements.txt`, moved forward by
  Dependabot, `.github/dependabot.yml`), the minimum (`requirements-min.txt`, moved only by
  hand; `HA=min scripts/test.sh integration` locally), one version per quarter since (x.1, x.4,
  x.7, x.10), and both sides of a version check in the code. Not every month: a quarter is
  enough to catch an API that comes or goes. When Dependabot brings in a new quarter,
  `test_supported_versions.py` fails until the previous one has its line in the matrix (the
  `pytest-homeassistant-custom-component` of that Home Assistant, its Python, and pins if an
  unpinned dependency breaks it). Versions older than the minimum are not tested.
- **Going down is tried by big steps**, not month by month: in a pull request, lower the minimum
  and add the older versions to the matrix; the CI shows what breaks. The card is then tried in
  a development HA on the chosen version (`HA_VERSION=2025.1.0`): the CI only tests it against
  a fake HA, not against the real frontend of that version. In October 2026 the minimum went
  from 2026.9 down to 2025.1; 2024.10 needs an options flow and a recorder that work
  differently.
- **The next release is tried every week**: `.github/workflows/ha-beta.yml` runs the
  integration tests on the Home Assistant beta (on Monday, or by hand from the *Actions* tab).
  It never blocks a push or a release; a failure warns of a coming change, to fix before the
  release of Home Assistant if possible, without raising the minimum.
- Code that depends on the version (an API that appeared after the minimum) checks for it and
  keeps working on the minimum, with a test on each side.

## Demo animation

`docs/demo.gif` (shown at the top of the README) is recorded from the development HA:

```bash
scripts/demo.sh      # needs the dev HA running; Playwright + ffmpeg in Docker
```

The scenario lives in [`dev/demo/record.mjs`](dev/demo/record.mjs): on a Tuesday morning (browser
clock) with a demo override, it creates a *Télétravail* schedule as a copy of *Normal*, edits its
Tuesday, shows the *Presets* view, activates *Vacances*, opens a thermostat's more-info dialog,
then shows the living room's *History* and one day larger (back to the real time: the history
is real), with a visible cursor; then it restores everything (override and created schedule
removed, *Normal* active again, edits of the weeks not saved). It expects the sample data and
the simulated week of a new development HA (*Normal*, *Vacances*, *Absent*, French names):
record from a second, new dev HA (above) with
`DEMO_NETWORK=ha-chauffage-fresh_default scripts/demo.sh`. Whether to re-record it is a question asked
at every release (see "Releasing").

## Trying a version on a real Home Assistant

The integration is installed with HACS (see the README), or by copying
`custom_components/chauffage/` into `<config>/custom_components/chauffage/` and restarting HA.
To try a development version on your own HA, publish a pre-release (see "Releasing") and install
it from HACS with beta versions enabled.

## Data versions and migrations

Installations must upgrade with no manual step and no data loss.

`.storage/chauffage` is a Home Assistant `Store` with a version (`STORAGE_VERSION` in
`custom_components/chauffage/store.py`). A format change bumps it and adds `MIGRATIONS[n]`
(version n → n + 1), with `tests/fixtures/store-v<n+1>.json`; `tests/integration/test_store.py`
checks that every fixture migrates to the latest one. Never edit an old fixture. The card only
sees the websocket API, whose format changes with the integration.

Overrides last a few hours: a release that changes their format may drop the existing ones (the
thermostats resume their schedule) instead of migrating them; say so in the changelog.

The data of the v0.1 package (`sensor.programmes_chauffage`, format in
`tests/fixtures/schedules-v1.json`) is imported by the integration (`importer.py`) when it is set
up.

## Releasing

Versions follow [semantic versioning](https://semver.org/); before 1.0, a minor version may
change the installation or the data (always migrated automatically). Checklist:

1. `scripts/test.sh`: everything green, migrations tested with fixtures.
2. **The demo: ask the question at every release.** Re-record it (`scripts/demo.sh`) when the
   card looks different or a visible feature is worth showing (extend the scenario); not when
   the changes cannot be seen.
3. Set the version in `custom_components/chauffage/frontend/chauffage-programme-card.js`
   (`VERSION`), `package.json` and `custom_components/chauffage/manifest.json`; move the
   "Unreleased" entries of `CHANGELOG.md` under the new version, with the date and the upgrade
   steps. `tests/js/release.test.mjs` checks that these versions match.
4. Commit, then tag and push:
   ```bash
   git tag -a v0.3.0 -m v0.3.0
   git push origin main v0.3.0
   ```
   The `Release` workflow (`.github/workflows/release.yml`) runs the tests, checks the version,
   and publishes the GitHub release with the changelog entry and `ha-chauffage-v0.3.0.zip`
   (`custom_components/chauffage/`, to unzip into the HA configuration folder without HACS).

**Pre-releases** (`0.3.0-beta.1`): same steps; a tag containing `-` is published as a GitHub
pre-release (offered by HACS only to users who enable beta versions). A change to the stored data
or the installation goes through a beta installed on a real installation before the release.


## Translations

The card speaks English and French. It follows the Home Assistant user's profile
(`hass.locale`): **language** (French for any `fr*` language, English otherwise; the card's
`language` option can force it), **time format** (12 / 24 h), **number format** (decimal
separator), **first day of the week**, and the temperature unit of the HA configuration.

- Texts live in the `I18N` object of `custom_components/chauffage/frontend/chauffage-programme-card.js`, one object per
  language, with English keys and `{placeholder}` variables.
- Every language has exactly the same keys and placeholders: `tests/js/i18n.test.mjs` checks it.
- Formats are never written by hand: times, day names and numbers come from the browser's `Intl`
  APIs, following `hass.locale` (see `makeLocale`).
- Schedule and preset names (`Normal`, `Confort`…) are data, not UI texts: they are not
  translated (the integration creates the default ones in the HA language).
- The integration's texts (config flow, entities, services, repairs, errors) use Home
  Assistant's translation files: `strings.json` (English, source) and `translations/en.json`,
  `translations/fr.json`, with the same keys.
- To add a language: add an object to `I18N` (same keys as `en`), extend `resolveLanguage`, and
  run `scripts/test.sh js`.
- Once the card is bundled (roadmap), translations will move to one JSON file per language with
  ICU MessageFormat (plurals), as in most Home Assistant cards.

## Tests first

**The tests are the documentation**: they say what ha-chauffage does, in sentences
(`a_thermostat_back_online_is_set_to_its_schedule`), and prove it on every run. So everything is
tested, and tests come first (TDD):

1. **Write the test first**, for a new behavior or a bug: a test named after the use case, in
   the user's words. Run it and **see it fail**, for the expected reason (a test that passes at
   once proves nothing: check that it fails when the code is broken on purpose).
2. **Write the code** that makes it pass, nothing more; then clean up with the tests green.
3. **Every use case has a test**, listed in [docs/use-cases.md](docs/use-cases.md): add a row
   when you add a use case. Test what users do and expect, not lines of code: error paths,
   limits (midnight, Sunday → Monday, summer time), restarts, unreachable devices, other
   languages.
4. **Every kind of thermostat**: the behavior tests of the integration run on Versatile
   Thermostat, standard presets and thermostats without presets (`thermostat_kind`); use
   `bench.needs(...)` only for a behavior that cannot exist on a kind.
5. **A fixed bug gets a regression test** that fails without the fix.

Coverage is a floor, not the goal (100 % of the lines does not mean every use case is
covered): the CI fails below **97 %** for the integration and **95 %** for the card
(`scripts/test.sh coverage`), and the README shows the current values.

## Conventions

These conventions apply to every contributor, human or AI assistant
(`AGENTS.md` and `CLAUDE.md` point here).

- **Code in English**, even though the project is called `ha-chauffage`: variable, function
  and file names, comments, specs and tests. Some existing code still has French comments or
  identifiers: translate them when you modify the surrounding code.
- **One vocabulary** ([docs/glossary.md](docs/glossary.md)): *schedule*, *preset*, *slot*,
  *override*, the same in the UI, docs, code, data and tests. In French, a preset is a
  *préréglage*, as in Home Assistant.
- HA entity names in French.
- **Commits in English**, short and descriptive.
- **Documentation** (`README`, `CONTRIBUTING`): the English version (`*.md`) is canonical.
  The French version (`*.fr.md`) is always maintained and updated in the same commit.
- **Tests first** (see above): `tests/integration/` for the integration, `tests/js/` for the
  card.
- **Decisions**: a choice a future contributor might question (and why it was made) goes to
  [docs/decisions.md](docs/decisions.md). Requests and ideas are discussed in GitHub issues;
  [ROADMAP.md](ROADMAP.md) holds the vision and the ideas retained, linking to their issues.
- Data read from thermostats may hold Enums (e.g. a ZHA `preset_mode`): convert them to plain
  values (`.value`) before storing them or putting them in an attribute.
- Card changes are tried in the development HA, on every kind of thermostat.
- **Mobile too**: the card is used in the Home Assistant app on phones. Everything works by
  touch (no information only shown on hover, no action only reachable with a mouse or a
  keyboard) and on a narrow screen (from 360 px wide); card changes are also tried at that width
  in the development HA.
