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

