# Review library for ha-chauffage

Use this library to review the card in the development HA with Playwright: open a slot, an
override or a cell of the presets tab, measure what you see, and compare the thermostats'
states with what the card promised.

## What you need

- Docker, and the development HA running on port 8124 (`docker compose -f dev/compose.yaml up -d`).
  The library logs in as `dev` / `dev`.
- Git Bash on Windows, or any POSIX shell.

Nothing is installed on your machine. The script runs in the Playwright Docker image
(`mcr.microsoft.com/playwright:v1.55.0-noble`), which reaches the development HA at
`host.docker.internal`.

## Run a script

From the root of the repository:

```sh
dev/review/run.sh dev/review/examples/slot.mjs      # one command: the image, the library, your script
OUT=/c/tmp/shots dev/review/run.sh my-review.mjs phone dark
```

Your script can live anywhere: `run.sh` mounts its folder. Keep your own scripts out of the
repository, or in `dev/review/examples/` when they show a helper.

| Variable | Meaning | Default |
|---|---|---|
| `OUT` | The folder for the screenshots | `dev/review/out/` |
| `HA_PORT` | The port of the development HA | `8124` |
| `REPO` | The repository, for `dev/hass/.dev-token` | The repository of `run.sh` |

In the container, the library is `/review/lib.mjs`, your script's folder is `/work`, and the
screenshots go to `/out`. Import the library by its address in the container:

```js
import { launch, close, openSlot, tap, measureRow, contrast, states, shot } from '/review/lib.mjs';
```

After a reset of the development HA, the session kept in `.auth/` no longer works. The library
sees the login page and logs in again. To drop the kept session yourself, delete the `.auth`
folder next to `run.sh`: `rm -r dev/review/.auth`. Git ignores `.auth/` and `out/`.
`docker run --rm` in `run.sh` only removes the container: the screenshots, the session and the
`ha-review-playwright-<version>` volume stay. The volume holds the npm package of Playwright,
named after its version, so that the package always matches the browsers of the image.

The browser runs in the time zone of the development HA, read with the token of
`dev/hass/.dev-token`. So `'today'` and `'now'` are the development HA's, even in another time
zone.

Several reviewers can share the development HA. Each script has its own browser, and its theme
lives in that browser: one reviewer's dark theme does not change another's. Take a `backup` of
the thermostats you touch, not of everything (see [Data and states](#data-and-states)).

## A first script

```js
import { launch, close, openSlot, tap, measureRow, contrast, shot } from '/review/lib.mjs';

const page = await launch({ viewport: 'phone', theme: 'dark', deviceScaleFactor: 2 });
const editor = await openSlot(page, 'climate.suite_parentale', 'today', '12:00');
await tap(page, editor.locator('.mode-row [data-mode="cool"]'));
console.log(await measureRow(editor.locator('.mode-row')));
console.log(await contrast(editor.locator('.mode-row .mode.on span')));
await shot(page, 'slot-cool', { crop: editor });
await close();
```

## Helpers

Every helper takes the page first. A helper that opens something returns its locator.

### Pages

| Helper | What it does |
|---|---|
| `launch({ viewport, theme, deviceScaleFactor, lang })` | Opens a page, logged in. `viewport`: `'desktop'` (1280 × 900), `'phone'` (360 × 780, touch) or `{ width, height }`. `theme`: `'light'` or `'dark'`. |
| `login(page)` | Logs in if the page asks for it. `launch` calls it. |
| `openDashboard(page, view)` | Opens a view of the Chauffage dashboard: `0` (the schedule card) or `'pieces'` (the thermostat cards). |
| `openPanel(page, path)` | Opens a page of the Chauffage panel: `''`, `'presets'`, `'thermostats/climate.salon'`. |
| `setViewport(page, 'phone' \| 'desktop', { deviceScaleFactor })` | Gives the same address at another size. It returns a **new page**: touch emulation belongs to the browser context. |
| `setTheme(page, 'dark' \| 'light')` | Switches Home Assistant's theme, in this browser only. |
| `ensureTheme(page)` | Sets the launch theme again if Home Assistant reset it. `shot` and the helpers that open a page call it. |
| `tap(page, locator)` | A real touch on a phone page, a click otherwise. It tries again when the card redraws under it. |
| `card(page)` | The schedule card of the dashboard. |
| `close()` | Closes the browser. Call it at the end. |

### What you open

| Helper | What it opens |
|---|---|
| `openSlot(page, climate, day, time)` | The popover of the slot running at `time` (`'HH:MM'` or `'now'`) on `day` (`0` = Monday, or `'today'`). The thermostat is shown alone. The days stay grouped: the slot opens on the row of its day, with one tap, so the slot is never cut. |
| `openExistingOverride(page, climate, where)` | The block of the override the thermostat has now, in the same three places. It throws without an override: set one first with `chauffage.set_override`. |
| `openOverrideMenu(page, climate)` | The ⋮ menu of the thermostat's row today. Returns `{ menu, entry }`: `entry` is *Nouvelle dérogation…*. |
| `openSettings(page)` | The settings dialog, from the panel's cog: the ends of the overrides, the override duration, the access level. |
| `openOverride(page, climate, where)` | The override block. `where`: `'card'` (the popover of the schedule card), `'pieces'` (its thermostat card) or `'more-info'` (Home Assistant's dialog). Without an override, the block opens to set one. |
| `openPresetCell(page, climate, preset)` | A popover of the presets tab: the value of `preset` on `climate`, or the preset itself when `climate` is `null`. |

### Measures

| Helper | What it gives |
|---|---|
| `measureRow(locator)` | For each child of a row: its box, its radius, its font size, and the centre and height of its icon and of its text. An icon and a text on one line have the same `midY`. The icon is the child's own, measured on its drawing: the arrows of a time field inside a label do not count. |
| `describeRow(locator)` | The same, one line per child, for a log. |
| `contrast(locator)` | The WCAG contrast of the element's text against what is behind it: `{ fg, bg, ratio, aa, aaLarge, gradient }`. Backgrounds with an alpha are laid over the ancestors', through shadow roots. |
| `contrastPerGradient(locator)` | The contrast of the element's text on each color of its gradient: `[{ color, ratio, aa }]`. A heat/cool chip has two colors. |
| `buttonMetrics(locator)` | The buttons inside a block: `{ label, h, w, fontSize, radius, iconMidY, textMidY, baselineOff }`. `baselineOff` under 1 px: the icon and the label sit on one line. |

### Data and states

| Helper | What it does |
|---|---|
| `backup(page, scope)` | Takes the Chauffage data a review touches. `scope`: `{ thermostats: ['climate.salon'], presets: false, settings: false, schedule: false }`. Without a scope, the backup holds nothing: name the thermostats you touch. |
| `restore(page, saved)` | Puts back what the backup took, and nothing else, through the websocket API, as the card does. Returns `{ changed, left }`: the paths that differed, and the paths that still differ. |
| `data(page)` | What the integration publishes now (`chauffage/subscribe`). |
| `ws(page, message)` | A websocket command, as the logged-in user. |
| `states(entityIds)` | The states read from the REST API, with the token of `dev/hass/.dev-token`: `{ 'climate.salon': { state, temperature, preset_mode, … } }`. |
| `stateLine(entityId)` | One state as a line: `cool temperature=25 fan_mode=auto`. |

`restore` does not put back a schedule created or deleted meanwhile, nor the activation rules.

### Screenshots

`shot(page, name, { crop, fullPage })` writes `<width>-<theme>-<name>.png` in the output
folder. `crop` is a locator to shoot alone. For a sharper picture, open the page with
`launch({ deviceScaleFactor: 2 })`: the picture has the pixel density of its page. **Open the pictures**: a row can measure right and still look wrong.

## Examples

| Script | What it shows |
|---|---|
| `examples/slot.mjs` | A slot popover on a phone, in the dark theme: one HVAC mode chosen, the row measured, the contrast, a picture. |
| `examples/override.mjs` | A new override in the three places, the same block measured in each. |
| `examples/compare-states.mjs` | A slot changed and saved, the thermostat's state compared with what the popover said, then everything put back. |
| `examples/viewports.mjs` | One popover at 1280 px and at 360 px, in both themes, at twice the pixel density: `setViewport` and `setTheme`. |

## Tips

- **Put the data back.** Take `backup(page, { thermostats: [...] })` first, and call `restore`
  in a `finally` block: a script that stops half-way leaves its slots and its overrides in the
  development HA. `restore` refuses a backup without a scope: a backup of everything would put
  back what another reviewer changed meanwhile.
- **Wait for the thermostat.** After a save or an override, wait 3 to 4 seconds before you read
  `states()`: Chauffage spaces its commands out.
- **A phone page is a touch page.** Use `tap()`, not `locator.click()`: a click is a mouse.
- **Errors of the page are printed** as `PAGE ERROR`, with the content of a websocket error.
- **Selectors.** Playwright pierces the shadow roots: `card(page).locator('.editor .mode-row')`
  works. The parts of the blocks: `.mode-row` (HVAC modes), `.presets` (chips), `.pv-temp` (a
  temperature and its − and +), `.end-block` (the end of an override), `.end-new` (the end a
  new override will have), `.cell-ed` (a popover of the presets tab).
