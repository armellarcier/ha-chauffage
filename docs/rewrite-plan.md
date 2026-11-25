# Rewrite plan

This plan rewrites ha-chauffage, the integration and the card, so that the code is clean and
maintainable. The rewrite changes the structure of the code, not the behavior of Chauffage.

The line numbers below come from `main`, after the merge of the Rooms and Heating summary cards
(#129).

## In short

- **We rewrite step by step, not in one go.** The real specification of Chauffage is in 1,833
  tests (759 pytest, 1,074 node) and in [decisions.md](decisions.md). Each phase ships with the
  tests green.
- **Most of the work is in the card.** The card is one file of 10,059 lines, without components,
  redrawn with `innerHTML`. We move it to TypeScript and Lit, bundled with esbuild, split into
  modules.
- **The integration is restructured, its rules are not rewritten.** `engine.py` and `model.py`
  are already pure: they import nothing from Home Assistant. The problems are the god class
  `ChauffageRuntime` and the bare dictionaries.

## The owner's decisions

The owner answered the open questions of the plan on 2026-11-25:

| Question | Decision |
|---|---|
| How does HACS get the bundled card? | HACS installs a ZIP built by the CI (`zip_release`). The repository doesn't hold the bundle. |
| When do we add a build step? | Now, in phase C0. The bundling item of the roadmap moves into this plan. |
| JavaScript with JSDoc, or TypeScript? | TypeScript, from phase C0. |
| Do we freeze the week editor during phase C5? | Yes. |
| Which Versatile Thermostat versions do we support? | 10.5 and later. |
| How long do we keep the v0.1 import? | The rewrite removes it, in its first step. |
| Where does the rewrite happen? | On the `rewrite` branch. Nothing goes into `main` before the end of the rewrite. |
| How do we try the rewrite on a real Home Assistant? | With one alpha at the end, published from the `rewrite` branch. |
| Which behavior rules do we simplify? | The eight proposals of section 6, answered on 2026-11-25. |

## 1. What makes the code hard to maintain

### The integration (3,941 lines of Python)

| Problem | Where |
|---|---|
| **A god class** | `ChauffageRuntime`, `runtime.py:199-1497`: 1,299 lines, about a hundred methods, 12 mutable fields. It handles the life cycle, the options, reading the thermostats, the snapshot for the card, the entity registry, renames, presets, schedules, rules, overrides, late commands, the timer and manual changes. |
| **A do-everything function** | `_state_changed`, `runtime.py:1431-1496`: 66 lines and 8 early returns. It learns presets, notifies, handles late commands and thermostats back online, filters contexts, classifies the manual change and records the override. |
| **Side effects mixed with decisions** | `send`, `runtime.py:1232-1279`, and `set_override`, `runtime.py:1066-1110`, decide and act in the same function. |
| **Shared mutable state without an owner** | `websocket.py`, `services.py`, the entity platforms and `diagnostics.py` read `runtime.data`, a dict of dicts, directly. The tests read it 46 times. |
| **Primitive obsession** | `Target = dict[str, Any]` (`engine.py:129`) is described by 9 sets of keys. The same dict holds two concepts: the value of a preset for each HVAC mode, and what Chauffage sends. A slot is a list `[start, preset, settings?]`, read as `slot[1]`. |
| **Flags in cascade** | `engine.targets` takes `force`, `resumed`, `ended`, `since`, `include` and `pending` (`engine.py:569-580`). A `vtherm` boolean goes through the whole call chain. The `shown` field (`engine.py:46-48`) is a VTherm case stored in the common type. |
| **Cache by parameter passing** | `plan or self.plan()`, `now or dt_util.now()` and `thermostat or self.current(...)` in `runtime.py:605-700` and `1128-1135`. |
| **Duplicated logic** | `as_local(as_utc(x) + timedelta)` appears 5 times in `runtime.py`. The override end is validated twice, in `runtime.py:296-312` and `315-333`. |
| **Migrations tied to live code** | `_v1_to_v2` and `_v4_to_v5` call `model.used_presets` and `model.complete_weeks` (`store.py:42,73`). A change to these functions changes a past migration. |
| **Docs that drift** | `model.py:47` describes a stored `hvac_mode` key per thermostat. No code seems to read or write this key. |

Keep what is sound: `engine.py` and `model.py` without Home Assistant imports, the versioned
migrations with their fixtures, and the convention `send()` / `_keep_override()` /
`_drop_override()`.

### The card (10,059 lines in one file)

| Problem | Where |
|---|---|
| **A god class** | `ChauffageProgrammeCard`, lines 3076-6477: 3,400 lines, 160 methods, about 35 mutable fields in the constructor, and a dozen more created on the fly, such as `_schedEd` or `_copyWeekMenu`. |
| **Five screens in one class** | `_draw` (4491-4650) switches on `_view`: weeks, presets, schedules, thermostats, rules. The panel gets its pages by configuring the card with `PANEL_OPTIONS`. |
| **Full redraws** | 35 uses of `innerHTML`, `setHtml` or `fillCard`. `_render` (4401-4428) saves and restores six UI states by hand, for example the caret of a rule and the scroll of the table. |
| **Hand-made change detection** | `set hass` (3184-3273) compares 9 "stamps", each one guarded against a drag in progress. |
| **Centralized events** | `_bindEvents` (4681-5098) has 417 lines of delegation. `_action` and three sister functions switch on about 70 `data-act` strings. |
| **Mutable module singletons** | `INTEGRATION`, `lastSource`, `PLACEMENTS` and `HTML_OF`. The last configured card overwrites `MORE_INFO_CFG` (line 3169). |
| **Rules duplicated from Python** | `valueOn`, `slotModeOn`, `fitTemperature` and `normalize` copy `engine.py` and `model.py`. The copies already drift: Python compares `low < high` after fitting the values to the thermostat (`engine.py:345`), the card before (line 1276). |
| **Translations in the code** | `I18N` takes 700 lines of the file. |

### The tests

- **The pytest tests test the behavior.** They go through `Bench` and never read a private
  member of the runtime. They depend on the names of the runtime's public methods, on
  `runtime.data`, and on the signatures of `engine.*` (about 300 references) and `model.*`
  (about 80).
- **Many node tests test the internals.** 16 files hold about 420 references to private
  members, for example `card._action` (68) and `card._render` (44). The tests of the recent
  cards, such as rooms and summary, have none.

## 2. The target integration

Data becomes immutable value objects. The pure functions become methods of these objects. A
class keeps state only when it has a life cycle or a side effect. The Home Assistant platform
files stay at the root.

```
custom_components/chauffage/
  domain/                    pure, no homeassistant import (a test checks it)
    slot.py                  Slot, Day, Week (from_stored / to_stored)
    preset.py                Preset, PresetValue (heat, cool, range, air), Mapping
    target.py                Target: satisfied_by(), fitted_to(), completed_for()
    thermostat.py            ThermostatState, Capabilities
    override.py              Override, OverrideEndPolicy
    timeline.py              slots_after, next_change, summer time
    manual_change.py         classify() -> NoChange | Resume | NewOverride
    pending.py               PendingCommands
    rules.py                 rules_outcome, schedule_named
    plan.py                  Plan, due_targets(plan, now, states, ApplyReason)
  storage/
    store.py                 ChauffageStore, STORAGE_VERSION (unchanged: 7)
    migrations.py            v1 to v7 on raw dicts, frozen, with their own helpers
    schema.py                validates the input and builds the domain objects
    installation.py          Installation: the only owner of the data, revisions, saving
  thermostats/
    reader.py                ThermostatReader (Protocol): read(State), cause(State)
    vtherm.py                VThermReader
    generic.py               GenericReader: standard presets and no presets
    gateway.py               ThermostatGateway.send(entity_id, target, why)
  app/
    runtime.py               composition root, under 200 lines
    scheduler.py             tick, apply(ApplyReason), retry, lock
    overrides.py             OverrideService: set, clear, keep(), drop(), events
    manual_changes.py        the steps of today's _state_changed, each one named
    schedules.py             activate, set_schedules, save_weeks, set_presets, set_mapping
    rule_engine.py           template tracking, follow_rules
    thermostat_registry.py   pause, forget, rename, repairs
    learner.py               learned preset temperatures
    read_model.py            SnapshotBuilder, planned_info, next_change_info
    settings.py              entry options
  websocket.py, services.py  thin adapters to app/
  sensor.py, switch.py, select.py, number.py, binary_sensor.py, entity.py
  logbook.py, repairs.py, diagnostics.py, config_flow.py, frontend.py, history.py, const.py
```

**Two thermostat readers, not three.** The code has only one real fork: VTherm or not. Standard
presets and no presets differ only by their capabilities. The `thermostat_kind` fixture keeps
its three values.

**Two types replace the ambiguous `Target`.** `PresetValue` holds what a preset is worth for
each HVAC mode. `Target` holds the partial state Chauffage sends. `to_stored()` writes the same
keys as today.

**`ApplyReason` replaces the six flags.** Its cases are `Forced(why)`, `Tick(since)`,
`OverrideEnded(ids)`, `Resumed(id)` and `Realign(ids, why)`. The "why" of the log comes from the
object.

**Side effects live in three places.** `ThermostatGateway` calls the `climate` services and
keeps the pending commands. `OverrideService` fires the events and fills the logbook.
`Installation` saves and notifies. The #49 convention keeps its names: `gateway.send(...)`,
`overrides.keep(...)` and `overrides.drop(...)`. Update `CONTRIBUTING.md` and `test_traces.py`
in the same commit.

**The stored data doesn't migrate.** `STORAGE_VERSION` stays at 7. A round-trip test,
`to_stored(from_stored(x)) == x`, runs on `store-v7.json` and on every older fixture once
migrated. Unknown keys are kept.

**The websocket contract doesn't change.** `SnapshotBuilder` returns exactly the dict of today's
`snapshot()` (`runtime.py:520-562`).

## 3. The target card

### Build, TypeScript and Lit

- **Bundle with esbuild.** Native ES modules without a build would break the cache: only the
  entry point carries `?v=`. The bundle keeps the name `chauffage-programme-card.js` and the URL
  `/chauffage_frontend/…?v=`. The card type stays `custom:chauffage-programme-card`.
- **Ship the bundle in a ZIP.** Add `zip_release` and `filename` to `hacs.json`. The `Release`
  workflow builds the card, then zips `custom_components/chauffage/` with the bundle. The
  repository holds the sources only, and `.gitignore` excludes the bundle.
- **Write the card in TypeScript.** `tsc --noEmit` checks the types in the CI. esbuild strips
  the types when it bundles.
- **Run the tests on the TypeScript sources, without a build.** Node 22.18 and later strips the
  types by itself. So write only erasable syntax: no `enum`, no `namespace`, no parameter
  properties. `tsc --erasableSyntaxOnly` checks it. Raise the Node version of the CI to 22.18
  at least.
- **Declare Lit properties without decorators.** Decorators are not erasable syntax. Use
  `static properties` and `declare` fields instead.
- **Bundle Lit, don't borrow Home Assistant's.** Home Assistant doesn't export Lit, and getting
  it from the prototype of a Home Assistant element is fragile across versions. Lit removes the
  hand-made save and restore of the focus, the caret and the scroll.
- **Give each top-level element one shadow root.** The card, the more-info block, the panel and
  the dialog each have one. Their sub-components render in the light DOM
  (`createRenderRoot() { return this; }`). So the selectors of the tests, of `dev/review/` and of
  `dev/demo/` keep working, and the card keeps one stylesheet.

### Modules

Every module is a `.ts` file. The tree below gives the `.js` names of the current code, to show
where each piece comes from.

```
frontend/src/
  index.js                   defines the elements and customCards, exports for the tests
  i18n/en.js, fr.js, locale.js
  domain/                    no DOM: slot, day, preset-value, override, colors, time, history
  client/
    chauffage-client.js      one subscription per page (today's INTEGRATION), injectable
    snapshot.js              typed read model (today's makeDataSource)
    commands.js              saveWeeks, setOverride, setPresets…
  state/
    week-draft.js            draft of the weeks: dirty, revisions, selection, clipboard
    override-draft.js, rules-draft.js, history-store.js, preferences.js
  controllers/               Lit ReactiveControllers
    snapshot-controller.js, slot-drag.js, override-end-drag.js, popover-placement.js
  components/
    week/                    week-grid, day-row, slot-bar, slot-popover, override-popover, legend
    views/                   presets-view, schedules-view, thermostats-view, rules-view
    shared/                  chip, stepped-field, mode-row, notice, entity-link
  cards/                     programme-card, thermostat-card, rooms-card, summary-card, editors
  more-info/, panel/, settings-dialog/
  styles/
```

**State needs no library.** The integration pushes an immutable `Snapshot`. Each card owns its
drafts, such as `WeekDraft`. A draft is a class without DOM, tested directly. `WeekDraft` makes
undo possible later.

**Drags stay smooth.** A drag controller changes the styles during the gesture and commits on
release. The touch rules of #67 live in `slot-drag.js`.

**The panel uses the views directly.** `PANEL_OPTIONS` disappears.

**The card stops copying `value_on`.** The integration computes what a preset is worth on a
thermostat, and the card asks for it through a websocket command. The other shared rules, such
as `fitTemperature`, get a JSON file of cases that runs in both pytest and node.

**Translations get one file per language** from phase C0. ICU MessageFormat stays on the
roadmap.

## 4. The phases

Each phase ships with the tests green and the coverage above its floor. The sizes are orders of
magnitude, in days of focused work.

### First step: less code to rewrite (4 to 6 days)

The first step removes code that the rewrite would otherwise carry over.

1. **Remove the v0.1 import.** Remove `importer.py`, its call in `__init__.py` and
   `config_flow.py`, its texts in `strings.json` and the translations, `test_import.py` and
   `schedules-v1.json`. Remove its mentions in the READMEs, `docs/installation.md`, the
   glossary, the use cases and `CONTRIBUTING.md`. Say in the changelog, under "Upgrading", that
   a v0.1 user must first install 0.10.0, the last release that imports.
2. **Require Versatile Thermostat 10.5.** Document the minimum Versatile Thermostat version in
   `docs/installation.md` and `docs/thermostats.md`, with their French versions. Say it in the
   changelog, under "Upgrading".
3. **Remove the code for Versatile Thermostat before 10.5.** Every supported VTherm publishes
   `requested_state`, `specific_states` and `preset_temperatures`. So remove:
   - the `shown` field and "off read as on" for a VTherm without `requested_state`
     (`engine.py:46-48`, `runtime.py:108-110` and `134-135`);
   - the top-level `hvac_off_reason` and `window_manager` in `cause` (`engine.py:91-101`);
   - the top-level `eco_temp` keys in `preset_temperature` (`engine.py:658-660`);
   - the tests of these cases, and their entries in [decisions.md](decisions.md), marked as
     removed.
4. **Apply the simplified behavior rules** of section 6, on the current code, with their tests
   first. So the phases that follow change no behavior.

### Phase 0: the safety nets (4 to 6 days)

- In pytest, make `Bench` stop reading `runtime.data`. Add the storage round-trip test, a
  golden test of the `chauffage/subscribe` message on a rich house, and a test that `domain/`
  doesn't import `homeassistant`.
- In node, add a driver, `tests/js/driver.mjs`, built from `tests/js/houses/dom.mjs`. Move the
  tests from private members to the driver, on the current code. For example,
  `card._action('x', ds)` becomes a click on `[data-act="x"]`, and `card._dirty` becomes "the
  save bar is visible".
- Add the file of shared Python and JS cases.

A rewritten test can stop testing anything. Break the code on purpose and see each rewritten
test fail.

### The integration

| Phase | Content | Size | Risk |
|---|---|---|---|
| I1 | Value objects (`Slot`, `Week`, `Preset`, `PresetValue`, `Target`, `Override`) under the current functions. `engine.py` and `model.py` become facades. | 4-5 d | Target equality (`same_target`, comparison on the step) |
| I2 | `ThermostatReader` for VTherm and the rest. The `vtherm` flag leaves the domain. | 2-3 d | VTherm turned off by its window or its auto start/stop (#74, #92) |
| I3 | `ThermostatGateway`: `send`, `reproduce`, `pending`, contexts, `own_settings` | 3-4 d | Order of the calls and late commands (`test_late_setpoints.py`, `test_traces.py`) |
| I4 | `OverrideService` and `manual_changes` | 4-5 d | The hardest phase: `test_overrides.py`, `test_override_end.py`, `test_off.py` |
| I5 | `Scheduler` with `ApplyReason`, `RuleEngine`, `ThermostatRegistry`, `Learner` | 4-5 d | The lock and background tasks, renames that reload the entry |
| I6 | `Installation` owns the data. `SnapshotBuilder`. Entities, websocket, services and diagnostics stop reading dicts. Add the websocket command that previews what a preset is worth on a thermostat (section 6, item 6). | 3-4 d | The `DATA`, `TICK` and `ENTITIES` notifications |
| I7 | Remove the facades, freeze the migrations with their helpers, update the docs | 2 d | Low |

From I1 to I6, `entry.runtime_data` keeps today's public method names, which delegate.

### The card

| Phase | Content | Size | Risk |
|---|---|---|---|
| C0 | Split into TypeScript modules without changing the logic, add esbuild and `tsc`, generate `VERSION`, switch HACS to `zip_release`. Adapt `release.yml`, `scripts/deploy.sh`, the development HA, `deploy.test.mjs` and `release.test.mjs`. Move `I18N` to one file per language. | 5-7 d | The first `zip_release` release, a development HA that serves a built card, `mixed-versions.test.mjs` (#36) |
| C1 | `ChauffageClient`, `Snapshot` and the drafts, without touching the rendering | 4-5 d | `subscription.test.mjs`, the singleton reset in `helpers.mjs` |
| C2 | Lit on the leaf elements: summary, rooms, thermostat card, more-info block | 4-6 d | Async rendering in jsdom: the driver waits for `updateComplete` |
| C3 | Settings dialog, editors, panel shell and routing | 5-6 d | `leaveMoreInfo`, browser history |
| C4 | Presets, schedules, thermostats and rules views as their own elements | 6-8 d | The cell popover, the caret of the rules |
| C5 | The week editor: grid, bars, popovers, drag, copy and paste, history. The popovers ask the integration what a preset is worth, and the card's copy of `valueOn` goes. | 10-14 d | The biggest phase. Freeze changes to the week editor during C5. |
| C6 | Clean up: remove `setHtml`, `fillCard`, `PANEL_OPTIONS` and the stamps | 2 d | Low |

In total, about 22 to 28 days for the integration and 36 to 48 days for the card, plus the first step and phase 0.
Once the websocket contract is frozen, the two tracks are independent.

Order: the first step, phase 0, then C0, then I1 to I7 alongside C1 and C2, then C3 to C6.

### How a phase is delivered

Claude delivers each phase on its own, with the `/rewrite-phase` skill
(`.claude/skills/rewrite-phase/`):

1. Branch from `rewrite`, and open a pull request against `rewrite`.
2. Get the CI green, then a scoped review by an independent agent.
3. Merge into `rewrite`. Nothing goes into `main`.

A fix on `main` during the rewrite comes into `rewrite` by a merge of `main`. Its regression
test carries the fix: the rewritten code passes the test, it doesn't copy the fix.

At the end, publish an alpha from `rewrite` and install it on a real Home Assistant. The owner
decides when `rewrite` goes into `main`.

## 5. The tests

**Keep as they are:**

- the pytest tests that go through `Bench`, the websocket, the services or the entities, about
  600 tests;
- `test_store.py` and the `store-v*.json` fixtures, never edited;
- `test_traces.py`;
- the node tests without private access, such as `i18n.test.mjs` and `release.test.mjs`.

**Rewrite, because they test internals:**

- `test_engine.py` (77 tests) and the direct calls to `engine.*` and `model.*` in other files,
  such as `test_heat_cool.py`. Move them to `tests/unit/domain/` during I1 to I5, with the same
  cases and the same names.
- The 16 node files with private access, such as `week-editing` and `override-block`. Move them
  to the driver in phase 0, before the rewrite.
- The imports of pure functions from the big file. Point them to `frontend/src/index.js`.

**Add these seams:** fake gateways and readers, a clock injected into the domain, an injectable
`ChauffageClient`, drafts tested without DOM, the golden snapshot, and the shared cases.

**Coverage keeps its floors**, 97 % for the integration and 95 % for the card, measured on
the TypeScript sources of `frontend/src/**`, not on the bundle. Remove a facade in the phase that removes its last caller.

## 6. Risks, questions and proposals

### Risks

- **An edge case without a test can regress.** Before each phase, read its section of
  [decisions.md](decisions.md) and add the missing tests on the current code.
- **Lit may not run well in jsdom**, because of async rendering and the lack of
  `adoptedStyleSheets`. Phase C2 tries Lit on the cheapest cards. If it fails, review the choice
  of Lit before C4.
- **The switch to `zip_release` can break an update.** HACS installs the content of the
  repository today. The alpha at the end of the rewrite is the first `zip_release` version:
  install it from HACS on a real Home Assistant before the release.
- **Reloading the page is no longer enough in development.** The development HA mounts the
  repository live, but the card now needs a build. Contributors run `esbuild --watch`. Update
  `CONTRIBUTING.md` and `CONTRIBUTING.fr.md`.
- **The tests need Node 22.18 or later**, to run TypeScript without a build. Raise the Node
  version of the CI and of the Docker fallback of `scripts/test.sh`.
- **The #49 convention moves with the code.** Move `test_traces.py` in the same commit.

### Behavior rules we simplify

The owner answered these eight proposals on 2026-11-25. Apply items 1, 2, 4, 5, 7 and 8 in the
first step, on the current code. Item 3 moves with phase I3, and item 6 with phases I6 and C5.

1. **Weeks are saved against the revision of each thermostat only.** Remove the global
   `revision` of `chauffage/weeks/save` (`runtime.py:722`), kept for old cards. The card
   served by the integration already sends `revisions`. The global revision stays for the list
   of schedules.
2. **Only a change by hand sets `ends_at`.** Any change of the override from the card or a
   service removes `ends_at`, and the logbook then gives the end time alone
   (`runtime.py:1094-1101`). Example: you drag the end of an override to the next slot, and the
   logbook says "until 22:00".
3. **The three resend mechanisms stay**: the retry after a failed call, the commands pending
   for 24 hours, and the forced apply of a thermostat. Each one has its own job. Phase I3 moves
   all three into `ThermostatGateway`.
4. **The legacy `kind` and `value` fields of the override events go** in the release of the
   rewrite (`_kind_and_value`, `runtime.py:156-164`). Say it in the changelog, under
   "Upgrading". The deprecated *Planned preset* sensor (#125) still goes in 0.12, as announced.
5. **Remove `manual_override_end_of(entity_id)`** (`runtime.py:302-305`), a hook for a
   per-thermostat setting (#83) that doesn't exist.
6. **The integration alone computes what a preset is worth on a thermostat.** Phase I6 adds a
   websocket preview command, and phase C5 removes the card's `valueOn`. The `low < high`
   difference disappears with the copy.
7. **The more-info block uses its defaults**: the language of the Home Assistant profile, and
   identical days grouped. It no longer takes the options of the last configured card
   (`MORE_INFO_CFG`, card line 3169).
8. **Remove the `hvac_mode` key per thermostat from the docs of `model.py:47`.** No code reads
   or writes this key.
