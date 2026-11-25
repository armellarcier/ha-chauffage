// The driver: what a test does with a card, and what it reads from it, as a user would.
//
// Tests go through the driver, never through the card's private members. The driver clicks,
// types and reads the DOM, and reads what the card sent to the fake Home Assistant.
//
// A few functions still reach into the card, because the DOM doesn't show what they need, or
// because a user can't do it in a test (a timer, a panel's options). Each one says so with an
// "Internal:" comment. The phase that rewrites that part of the card rewrites these functions,
// and no test.
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { $, $$ } from './houses/dom.mjs';

export { $, $$, change, click, icons, rgb, text, week } from './houses/dom.mjs';

// ----- clicking -----

const selector = (act, data) => `[data-act="${act}"]${Object.entries(data)
  .map(([key, value]) => `[data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${value}"]`).join('')}`;

/** The control `[data-act="act"]` with these `data-*` attributes, or null. */
export const control = (card, act, data = {}) => $(card, selector(act, data));

/**
 * Clicks the control `[data-act="act"]` with these `data-*` attributes, for example
 * `act(card, 'preset', { preset: 'eco' })`. The control must be on screen.
 */
export function act(card, name, data = {}) {
  const el = control(card, name, data);
  if (!el) throw new Error(`no control ${selector(name, data)} on screen`);
  el.click();
  return el;
}

/** Lets the card finish what a click started: its calls to Home Assistant, and their answers. */
export const settle = () => new Promise((resolve) => { setImmediate(resolve); });

// ----- the week -----

/**
 * A thermostat's day, as the card would save it, in the schedule shown or in `schedule`.
 * Internal: the DOM doesn't show the fan or the vanes a slot sets.
 */
export const day = (card, climate, d = 0, schedule) => serializeDay(card._week(climate, schedule)[d]);

/** The slot whose popover is open: { climate, day, idx }, or null. */
export function selected(card) {
  const seg = $(card, '.bar .seg.sel');
  if (!seg) return null;
  const bar = seg.parentElement;
  return { climate: bar.dataset.climate, day: Number(bar.dataset.day), idx: Number(seg.dataset.idx) };
}

/**
 * Opens the popover of a slot.
 * Internal: a tap on a slot of the same row within 400 ms is a double tap, which cuts the slot.
 */
export function openSlot(card, climate, idx, d = 0) {
  card._sel = { climate, day: d, idx };
  card._render();
}

// One pixel per minute on a row: a click's clientX is a time of day in minutes
const geometry = (el) => {
  el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 });
  return el;
};

/** A row of the week: the bar of a thermostat's day, one pixel per minute. */
export const row = (card, climate, d = 0) => geometry($(card, `.bar[data-climate="${climate}"][data-day="${d}"]`));

/** The slot running at a time of day (in minutes), on a row. */
export function slotAt(card, climate, minute, d = 0) {
  const segs = $$(card, `.bar[data-climate="${climate}"][data-day="${d}"] .seg`);
  // A slot starts where its style places it, in percent of the day
  return segs.filter((seg) => Math.round(parseFloat(seg.style.left) * 14.4) <= minute).at(-1);
}

/** A tap on a row, at a time of day (in minutes). */
export function tapAt(card, climate, minute, d = 0) {
  row(card, climate, d);
  slotAt(card, climate, minute, d)
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true, composed: true, cancelable: true, clientX: minute }));
}

/** Two taps at a time of day, on the slot running then: they cut the slot there. */
export function doubleTap(card, climate, minute, d = 0) {
  tapAt(card, climate, minute, d);
  tapAt(card, climate, minute, d);
}

/**
 * A piece of a slot, cut at a time of day by a double tap, then set to `preset` in its popover.
 * By default, a preset that neither the slot nor the next one has.
 */
export function cutSlot(card, climate, d, minute, preset) {
  doubleTap(card, climate, minute, d);
  const sel = selected(card);
  if (!sel || sel.climate !== climate) return;
  const slots = day(card, climate, sel.day).map((slot) => slot.split(' ')[1]);
  const other = preset || ['comfort', 'eco', 'boost', 'frost'].find((id) => id !== slots[sel.idx] && id !== slots[sel.idx + 1]);
  act(card, 'preset', { preset: other });
}

// ----- the menu of a row -----

/** Opens the menu of a row, with its ⋮ button. */
export const openMenu = (card, climate, d = 0) => act(card, 'menu', { climate, day: d });

/**
 * Copies a day from its row's menu: `to` is "weekdays", "weekend", "all" or "others" (the other
 * thermostats shown), or nothing to copy the day to the clipboard.
 */
export function copyDay(card, climate, d, to) {
  openMenu(card, climate, d);
  act(card, to ? `fill-${to}` : 'copy-day', { climate, day: d });
}

// ----- overrides -----

const today = () => (new Date().getDay() + 6) % 7;

/**
 * Opens the popover of a thermostat's override: a tap on the override, or "New override" in
 * the menu of today's row when the thermostat has none.
 */
export function openOverride(card, climate) {
  const band = $(card, `.override[data-climate="${climate}"]`);
  if (band) {
    band.click();
    return;
  }
  openMenu(card, climate, today());
  act(card, 'override-new', { climate });
}

/** The week has changes not saved yet: the save bar is on screen. */
export const unsaved = (card) => !!$(card, '.savebar');

/** Clicks Save, and waits for the answer of the integration. */
export async function save(card) {
  act(card, 'save');
  await settle();
}

// ----- the card and the clock -----

/**
 * Draws the card again, as its timer does every 30 seconds.
 * Internal: the timer runs on the real clock.
 */
export const redraw = (card) => card._render();

// ----- more of the week -----

/** The row of a thermostat that shows a day of the week: its first day, as the days may be grouped. */
export const rowOf = (card, climate, d) => Math.max(...$$(card, `.bar[data-climate="${climate}"]`)
  .map((bar) => Number(bar.dataset.day)).filter((first) => first <= d));

/** The rows of the week, by the names of their days, for example `['Lun–Ven', 'Sam, Dim']`. */
export const rows = (card) => $$(card, '.dgroup .day').map((el) => el.textContent);

/** A thermostat's whole week, as the card would save it: its 7 days (see `day()`). */
export const wholeWeek = (card, climate, schedule) => [0, 1, 2, 3, 4, 5, 6].map((d) => day(card, climate, d, schedule));

/**
 * Gives the slot whose popover is open a preset: a tap on the preset in the popover.
 * Internal: the popover of an air conditioner's off or fan-only slot shows no presets, and the
 * card still gives such a slot a preset, in the HVAC mode of the slot before it.
 */
export function slotPreset(card, preset) {
  const chip = $(card, `.editor [data-act="preset"][data-preset="${preset}"]`);
  if (chip) chip.click();
  else card._action('preset', { preset });
}

/** Pastes the day copied (see `copyDay`) on a row, from the row's menu. */
export function pasteDay(card, climate, d) {
  openMenu(card, climate, d);
  act(card, 'paste-day', { climate, day: d });
}

/**
 * Sets every slot of a thermostat's week to heat or to cool (`mode`), with "All heat" or
 * "All cool" in the menu of its first row.
 */
export function weekHvac(card, climate, mode) {
  const first = Number($$(card, `.bar[data-climate="${climate}"]`)[0].dataset.day);
  openMenu(card, climate, first);
  act(card, 'week-hvac', { climate, mode });
}

/**
 * Places the open popover, as the card does a frame after it draws, from the sizes the test gave
 * to the card, the row and the popover.
 * Internal: the card waits for frames the simulated browser doesn't paint, and jsdom measures nothing.
 */
export const placePopover = (card) => card._placeEditor();

/**
 * Asks the card to save its weeks, as its Save button does, even when the card shows no Save
 * button. Resolves to true once saved.
 * Internal: checks that the card refuses a save that the access level forbids, without a button.
 */
export const trySave = (card) => card._save();

// ----- the thermostats and the schedules shown -----

/** The thermostats of the card, in the order of their chips. */
export const thermostats = (card) => $$(card, '.chip[data-climate]').map((chip) => chip.dataset.climate);

/** The thermostats shown: their chips are on. */
export const shown = (card) => $$(card, '.chip.on[data-climate]').map((chip) => chip.dataset.climate);

/**
 * The schedule a card shows: the id of its tab selected.
 * Internal: a week alone (a page of the panel) shows no tab, and names its schedule only in the
 * panel's heading.
 */
export function scheduleShown(card) {
  const tab = $(card, '.tab.on[data-schedule]');
  return tab ? tab.dataset.schedule : card._schedule;
}

/**
 * Opens the menu of the schedule shown, as the panel's ⋮ above the card does, under `button`.
 * Internal: the button is the panel's, outside the card.
 */
export const openScheduleMenuFrom = (card, button = null) => card._scheduleAction('schedule-menu', {}, button);

/**
 * Scrolls the tabs to the schedule shown, as the card does once on load.
 * Internal: jsdom has no layout, so a test lays the tabs out by hand after the card is drawn,
 * then asks for what the card does on load.
 */
export function placeTabsAsOnLoad(card) {
  card._tabsShown = undefined;
  card._placeTabs(0);
}

/**
 * The names of the schedules whose week has changes not saved yet, as the save bar of a
 * thermostat's sheet lists them: [] when the sheet has no save bar.
 */
export function unsavedWeeks(panel) {
  const bar = $(panel, '.sheet-savebar .dirty');
  if (!bar) return [];
  const names = bar.textContent.replace(/\s+/g, ' ').split(':').slice(1).join(':').trim();
  return names ? names.split(', ') : [];
}

// ----- the history -----

/** The history is shown: its button is on. */
export const historyShown = (card) => $$(card, '[data-act="history"].on').length > 0;

/**
 * A week of the panel shows the history of its days, as the panel's switch asks.
 * Internal: a week of the panel has no History button, and it draws the history only once the
 * recorder has answered.
 */
export const historyAsked = (card) => card._history.shown;

/**
 * The measured temperature of a thermostat's day, as the history drew it: pieces of
 * [minute, temperature] points.
 * Internal: the DOM draws the curve smoothed, not the temperatures it was drawn from.
 */
export const measured = (card, climate, d) => card._history.days[climate][d].current;

// ----- the presets tab and the rules -----

/** Clicks Apply in the popover of a preset or a cell, and waits for the answer of the integration. */
export async function applyCell(card) {
  act(card, 'cell-apply');
  await settle();
}

/** Clicks Save under the rules, and waits for the answer of the integration. */
export async function saveRules(card) {
  act(card, 'rules-save');
  await settle();
}

/**
 * Rules being typed are tried at once, and the rules shown are tried again now.
 * Internal: the card waits for a pause of 400 ms in the typing, on the real clock.
 */
export function tryRulesAtOnce(card) {
  card._previewDelay = 0;
  card._previewKey = null;
  card._render();
}

// ----- the page and the settings dialog -----

/** Presses Escape: the cards close their menus and popovers. */
export const escape = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

/**
 * Counts the reloads of the page that a card or the panel asks for, from now on: returns a
 * function that gives the count. The page is not reloaded.
 * Internal: jsdom can't reload a page.
 */
export function watchReloads(el) {
  let count = 0;
  el._reloadPage = () => { count += 1; };
  return () => count;
}

/**
 * Draws the settings dialog again, as its timer does 3 seconds after a setting is saved, to take
 * the "saved" mark away.
 * Internal: the timer runs on the real clock.
 */
export const redrawDialog = (dialog) => dialog._update();

