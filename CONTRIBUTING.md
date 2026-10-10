# Contributing to ha-chauffage

**English** · [Français](CONTRIBUTING.fr.md)

Golden rule, as in most Home Assistant projects: **don't develop on your production HA.**
Work with the test harness and a disposable development HA, then deploy.

## Prerequisites

- Git, Bash (Linux, macOS, or Git Bash / WSL on Windows), `curl`.
- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop on Windows / macOS) for the dev HA.
- Python 3 (optional) to serve the test harness.

No build step: the card is a JavaScript file served as is. Node and Python are only used by
the automated tests, and Docker stands in for them if they are not installed.

## 1. Card UI: the test harness (fastest)

```bash
python3 -m http.server 8000      # at the repository root
```

Open <http://localhost:8000/dev/harness.html>. The harness simulates Home Assistant: states,
the project's sensors, events, deferred rendering of `ha-card`, and a thermostat's more-info
dialog (buttons at the top of the page). Edit `www/chauffage-programme-card.js`, reload the page.

## 2. HA logic: the development HA

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

- Versatile Thermostat is installed automatically (`VTHERM_VERSION=… docker compose … up -d`
  for another version; `HA_VERSION=beta` to test the next HA release).
- The repository is **mounted live**: `www/` → `/local/chauffage/`, `packages/chauffage/` → HA package.
- `dev/hass/packages/simulation.yaml` creates three virtual rooms (salon, bureau, chambre):
  a heater `input_boolean.radiateur_*` and a temperature `sensor.temperature_*` that rises
  while the heater is on.

**Everything is set up automatically on first start** by the `setup` service
([`dev/setup/setup.py`](dev/setup/setup.py), through HA's public APIs): log in at
<http://localhost:8124/chauffage-dev> with **`dev` / `dev`**: the "Chauffage" dashboard (sidebar) shows the card,
with three Versatile Thermostat thermostats (salon, bureau, chambre: "over a switch", preset
temperatures 7 / 17 / 20 / 22 °C) and sample schedules. A long-lived token is written to
`dev/hass/.dev-token` and used by `scripts/reload.sh` and `scripts/logs.sh` (no `.env` needed
for the dev HA). State is kept in `dev/hass/` (not versioned); to start over:
`docker compose -f dev/compose.yaml down && git clean -fdX dev/hass`.

**Work loop:**

| I edit… | To apply it |
|---|---|
| `www/*.js` | reload the browser page |
| `packages/chauffage/chauffage.yaml` | `scripts/reload.sh` (checks the config, then reloads) |
| `dev/hass/configuration.yaml` | `docker compose -f dev/compose.yaml restart homeassistant` |

`scripts/logs.sh` shows the end of the log (filtered on the project; `scripts/logs.sh dev 200 all`
to see everything). To speed up testing of time-based logic, change temperatures with the
`input_number.temperature_*` sliders and the override duration (`duree_defaut`).

## 3. Automated tests

```bash
scripts/test.sh          # everything (uses Node / Python if installed, Docker otherwise)
scripts/test.sh js       # card only
scripts/test.sh ha       # HA logic only (extra arguments go to pytest: scripts/test.sh ha -k ends)
```

| Suite | Tool | What it covers |
|---|---|---|
| `tests/ha/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component): a real in-memory Home Assistant with a frozen clock | the package: slots applied at the right time, modes, thermostats turned off or unreachable, manual-change detection, overrides and their end |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (simulated browser) | the card: calculations, schedule editing, copy / paste, saving, overrides, more-info |

In `tests/ha/`, thermostats are plain simulated `climate.*` states and `climate.set_preset_mode`
is replaced by a recorder; the `Bench` object (`conftest.py`) moves time forward, simulates a
manual change or the thermostat's response, and saves schedules like the card does.

The tests also run on GitHub Actions for every push and pull request
(`.github/workflows/tests.yml`). **Run `scripts/test.sh` before deploying.**

## 4. Deploying to a real Home Assistant

The project is installed by **copying files** into the HA configuration:

| Repository | HA configuration |
|---|---|
| `www/*` | `<config>/www/chauffage/` |
| `packages/chauffage/*` | `<config>/packages/chauffage/` |

and once in `configuration.yaml`:

```yaml
homeassistant:
  packages: !include_dir_named packages
frontend:
  extra_module_url:
    - /local/chauffage/chauffage-loader.js
recorder:
  exclude:
    entities:
      - sensor.programmes_chauffage
      - sensor.derogations_chauffage
      - sensor.suivi_vannes_chauffage
```

Whether HA runs in Docker, in a VM (HA OS) or in a venv, only the path of its configuration
folder matters. Three ways to copy:

### a. By hand
Copy the files (Samba, File editor add-on, scp…), then reload automations and template
entities (Developer tools → YAML), or restart HA.

### b. `scripts/deploy.sh`
```bash
scripts/deploy.sh /path/to/config              # HA on the same machine
scripts/deploy.sh myserver:/path/to/config     # over SSH
```
With `PROD_HA_URL` / `PROD_HA_TOKEN` in `.env`, the script checks the configuration after
copying, **restores the previous version if it is invalid**, otherwise reloads HA.

### c. `git push` (for your own server)
A bare repository on the HA machine, with the [`deploy/pre-receive`](deploy/pre-receive) hook:
`git push prod` deploys through `deploy.sh`, and **the push is rejected** if the configuration
is invalid (production unchanged).

```bash
# On the HA server (as a user allowed to write to the HA config)
git init --bare /srv/ha-chauffage.git
cd /srv/ha-chauffage.git
git config deploy.haconfig /path/to/config
curl -fsSL -o hooks/pre-receive https://raw.githubusercontent.com/armellarcier/ha-chauffage/main/deploy/pre-receive
chmod +x hooks/pre-receive
printf 'PROD_HA_URL=http://localhost:8123\nPROD_HA_TOKEN=…\n' > deploy.env && chmod 600 deploy.env

# On the dev machine
git remote add prod myserver:/srv/ha-chauffage.git
git push prod main
```

The card updates when the page is reloaded: `chauffage-loader.js` detects the new version
(no `?v=` to change, no restart).

## Conventions

These conventions apply to every contributor, human or AI assistant
(`AGENTS.md` and `CLAUDE.md` point here).

- **Code in English**, even though the project is called `ha-chauffage`: variable, function
  and file names, comments, specs and tests. Some existing code still has French comments or
  identifiers: translate them when you modify the surrounding code.
- HA entity names in French.
- **Commits in English**, short and descriptive.
- **Documentation** (`README`, `CONTRIBUTING`): the English version (`*.md`) is canonical.
  The French version (`*.fr.md`) is always maintained and updated in the same commit.
- **Every behavior change comes with a test** (`tests/ha/` for the package, `tests/js/` for the
  card); a fixed bug gets a regression test.
- Template sensor attributes must only contain plain values (text, numbers, lists,
  dictionaries): a single Enum (e.g. a ZHA `preset_mode`) makes HA store the whole attribute
  as text. Convert with `.value`.
- New card features are tried in the harness first
  (`dev/fake-ha.js` simulates HA: extend it if needed).
