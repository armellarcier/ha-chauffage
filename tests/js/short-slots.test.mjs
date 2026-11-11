// Short slots stay within reach (#91): a tap that lands on a handle opens the slot under it, an
// end typed as 24:00 is the end of the day, and a time typed onto a neighbor leaves no sliver.
import { fakeHass, createCard, cleanup, typeTime, WEEKDAY } from './helpers.mjs';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const SALON = 'climate.salon';
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
// One pixel per minute: clientX is a time of day in minutes
const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
const mouse = (el, type, clientX) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
const bar = (card) => geometry($(card, `.bar[data-climate="${SALON}"][data-day="0"]`));
const handle = (card, idx) => { bar(card); return $(card, `.bar[data-climate="${SALON}"][data-day="0"] .handle[data-idx="${idx}"]`); };
const tap = (el, clientX) => { mouse(el, 'pointerdown', clientX); mouse(el, 'pointerup', clientX); mouse(el, 'click', clientX); };
const day = (card) => serializeDay(card._week(SALON)[0]);
const select = (card, idx) => { card._sel = { climate: SALON, day: 0, idx }; card._render(); };
const field = (card, edge) => $(card, `.editor input.time[data-edge="${edge}"]`);
// A quarter of an hour of boost at 14:00: narrower than a handle
const SHORT = ['00:00 eco', '14:00 boost', '14:15 comfort', '22:30 eco'];
const cardOf = (weekday = WEEKDAY) => createCard(fakeHass({ weeks: { [SALON]: { Normal: Array(7).fill(weekday) } } }), { show: [SALON], group_days: false });

afterEach(() => cleanup());

describe('a tap that lands on a handle', () => {
  test('opens the slot under it: a quarter of an hour is narrower than its two handles', () => {
    const card = cardOf(SHORT);
    tap(handle(card, 1), 14 * 60 + 5); // the handle of 14:00, 5 minutes into the short slot
    assert.deepEqual(card._sel, { climate: SALON, day: 0, idx: 1 });
    assert.ok($(card, '.editor'));
    card._action('close', {});
    tap(handle(card, 2), 14 * 60 + 20); // the handle of 14:15, on its right half
    assert.equal(card._sel.idx, 2);
    card._action('close', {});
    tap(handle(card, 1), 14 * 60 - 4); // the handle of 14:00, on its left half
    assert.equal(card._sel.idx, 0);
  });

  test('keeps the selected slot when the handle is one of its own', () => {
    const card = cardOf(SHORT);
    select(card, 2);
    tap(handle(card, 2), 14 * 60 + 12); // its start handle, on the short slot's side
    assert.equal(card._sel.idx, 2);
    tap(handle(card, 3), 22 * 60 + 35); // its end handle
    assert.equal(card._sel.idx, 2);
  });

  test('opens nothing after the handle was dragged', () => {
    const card = cardOf();
    const h = handle(card, 1);
    mouse(h, 'pointerdown', 390);
    mouse(h, 'pointermove', 420);
    mouse(h, 'pointerup', 420);
    mouse(handle(card, 1), 'click', 420);
    assert.equal(day(card)[1], '07:00 comfort');
    assert.equal(card._sel, null);
  });

  test('opens nothing with read-only weeks', () => {
    const hass = fakeHass({ weeks: { [SALON]: { Normal: Array(7).fill(SHORT) } } });
    hass.user = { is_admin: false };
    const card = createCard(hass, { show: [SALON], group_days: false });
    assert.equal($(card, '.handle'), null);
  });
});

describe('a time typed in the slot popover', () => {
  test('24:00 as the end of a slot is the end of the day: the slots after it go', () => {
    const card = cardOf();
    select(card, 1);
    typeTime(field(card, 'end'), '24:00');
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort']);
    assert.equal($(card, '.editor .fixed:last-of-type').textContent, '24:00');
  });

  test('00:00 as the end of a slot is the end of the day too', () => {
    const card = cardOf();
    select(card, 3);
    typeTime(field(card, 'end'), '0');
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort']);
  });

  test('24:15 is not a time: the field shows the end again', () => {
    const card = cardOf();
    select(card, 1);
    typeTime(field(card, 'end'), '24:15');
    assert.deepEqual(day(card), WEEKDAY);
  });

  test('an end typed onto the end of the next slot removes that slot: no sliver is left', () => {
    const card = cardOf(['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 boost', '22:30 eco']);
    select(card, 1);
    typeTime(field(card, 'end'), '17:30');
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '17:30 boost', '22:30 eco']);
    typeTime(field(card, 'end'), '23:00'); // past the next slot: it goes, the one after it starts later
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '23:00 eco']);
  });

  test('an end typed inside the next slot shortens it, as before', () => {
    const card = cardOf();
    select(card, 1);
    typeTime(field(card, 'end'), '12:00');
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '12:00 eco', '17:30 comfort', '22:30 eco']);
  });

  test('a start typed onto the start of the slot before it removes that slot', () => {
    const card = cardOf(['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 boost', '22:30 eco']);
    select(card, 3);
    typeTime(field(card, 'start'), '08:30');
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '08:30 boost', '22:30 eco']);
    assert.equal(card._sel.idx, 2);
    typeTime(field(card, 'start'), '00:00'); // the start of the day: the slot is the first one
    assert.deepEqual(day(card), ['00:00 boost', '22:30 eco']);
  });
});
