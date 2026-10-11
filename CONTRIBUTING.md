# Contributing to ha-chauffage

**English** · [Français](CONTRIBUTING.fr.md)

Golden rule, as in most Home Assistant projects: **don't develop on your production HA.**
Work with the automated tests and a disposable development HA, then publish a pre-release.

## Prerequisites

- Git, Bash (Linux, macOS, or Git Bash / WSL on Windows), `curl`.
- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop on Windows / macOS) for the dev HA.

No build step: the card is a JavaScript file served as is. Node and Python are only used by
the automated tests, and Docker stands in for them if they are not installed.

## 1. The development HA

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

- Versatile Thermostat is installed automatically (`VTHERM_VERSION=… docker compose … up -d`
  for another version; `HA_VERSION=beta` to test the next HA release).
- The repository is **mounted live**: `custom_components/chauffage/` → the integration and its
  card.
- `dev/hass/packages/simulation.yaml` creates five virtual rooms: a heater
  `input_boolean.radiateur_*` and a temperature `sensor.temperature_*` that rises while the
  heater is on (sensors report every minute, like real ones). They cover **every kind of
  thermostat**:
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
sample schedules. A long-lived token is written to `dev/hass/.dev-token` and used by
`scripts/logs.sh` (no `.env` needed for the dev HA). State is kept in `dev/hass/` (not
versioned); to start over: `docker compose -f dev/compose.yaml down && git clean -fdX dev/hass`.

**Work loop:**

| I edit… | To apply it |
|---|---|
| `custom_components/chauffage/frontend/*.js` (card) | reload the browser page |
| `custom_components/chauffage/*.py`, `*.json` | `docker compose -f dev/compose.yaml restart homeassistant` |
| `dev/hass/configuration.yaml` | `docker compose -f dev/compose.yaml restart homeassistant` |

`scripts/logs.sh` shows the end of the log (filtered on the project; `scripts/logs.sh dev 200 all`
to see everything). To speed up testing of time-based logic, change temperatures with the
`input_number.temperature_*` sliders and the override duration (integration options).

## 2. Automated tests

```bash
scripts/test.sh          # everything (uses Node / Python if installed, Docker otherwise)
scripts/test.sh js       # card only
scripts/test.sh integration   # the integration (extra arguments go to pytest: scripts/test.sh integration -k ends)
scripts/test.sh coverage      # card and integration with coverage (fails below the minimum)
HA=min scripts/test.sh integration   # same, on the minimum supported HA (hacs.json, 2026.9)
```

| Suite | Tool | What it covers |
|---|---|---|
| `tests/integration/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component): a real in-memory Home Assistant with a frozen clock, `custom_components/` loaded | slots applied at the right time, modes, thermostats turned off or unreachable, manual-change detection, overrides and their end, the pure logic (`engine.py`), storage and migrations, entities, services, websocket API, config / options flows, import from the v0.1 package |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (simulated browser), with a fake HA and integration (`tests/js/helpers.mjs`) | the card: calculations, schedule editing, copy / paste, saving, overrides, levels, more-info |

The Python suite runs on the latest Home Assistant and on the minimum supported one (CI and
`HA=min`). Thermostats are plain simulated `climate.*` states and the `climate` services are
replaced by recorders; the `Bench` object (`conftest.py`) moves time forward, simulates a manual
change or the thermostat's response, and saves schedules like the card does. The behavior tests
run on **the three kinds of thermostats** (fixture `thermostat_kind`: `vtherm`, `standard`,
`plain`); a test that only makes sense for some kinds calls `bench.needs(...)`.

The tests also run on GitHub Actions for every push and pull request
(`.github/workflows/tests.yml`). **Run `scripts/test.sh` before publishing.**

## Demo animation

`docs/demo.gif` (shown at the top of the README) is recorded from the development HA:

```bash
scripts/demo.sh      # needs the dev HA running; Playwright + ffmpeg in Docker
```

The scenario lives in [`dev/demo/record.mjs`](dev/demo/record.mjs): it sets the browser clock
to a Tuesday morning, adds a demo override, plays the actions with a visible cursor, then
restores everything (override removed, Normal active again, edits of the weeks discarded).
Re-record it when the card's look changes.

## 3. Trying a version on a real Home Assistant

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
2. Re-record the demo (`scripts/demo.sh`) if the card's look changed.
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
- With the integration (roadmap, phase 1), the card will be bundled: translations will move to one
  JSON file per language with ICU MessageFormat (plurals), as in most Home Assistant cards.

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
- Data read from thermostats may hold Enums (e.g. a ZHA `preset_mode`): convert them to plain
  values (`.value`) before storing them or putting them in an attribute.
- Card changes are tried in the development HA, on every kind of thermostat.
