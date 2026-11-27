// Short slots stay within reach (#91): a tap that lands on a handle opens the slot under it, an
// end typed as 24:00 is the end of the day, and a time typed onto a neighbor leaves no sliver.
import { fakeHass, createCard, cleanup, typeTime, WEEKDAY } from './helpers.mjs';
import { tagSide } from '../../frontend/src/index.ts';
import { act, day as dayOf, openSlot, selected, settle } from './driver.mjs';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as dom from './houses/dom.mjs';
import * as suiteAndValve from './houses/suite-and-valve.mjs';
import * as suiteAndCombles from './houses/suite-and-combles.mjs';

const SALON = 'climate.salon';
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
// One pixel per minute: clientX is a time of day in minutes
const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
const mouse = (el, type, clientX) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
const bar = (card) => geometry($(card, `.bar[data-climate="${SALON}"][data-day="0"]`));
const handle = (card, idx) => { bar(card); return $(card, `.bar[data-climate="${SALON}"][data-day="0"] .handle[data-idx="${idx}"]`); };
const tap = (el, clientX) => { mouse(el, 'pointerdown', clientX); mouse(el, 'pointerup', clientX); mouse(el, 'click', clientX); };
const day = (card) => dayOf(card, SALON);
const select = async (card, idx) => await openSlot(card, SALON, idx);
const field = (card, edge) => $(card, `.editor input.time[data-edge="${edge}"]`);
// A quarter of an hour of boost at 14:00: narrower than a handle
const SHORT = ['00:00 eco', '14:00 boost', '14:15 comfort', '22:30 eco'];
const cardOf = async (weekday = WEEKDAY) => { const card = createCard(fakeHass({ weeks: { [SALON]: { Normal: Array(7).fill(weekday) } } }), { show: [SALON], group_days: false }); await settle(); return card; };

afterEach(() => cleanup());

describe('a tap that lands on a handle', () => {
  test('opens the slot under it: a quarter of an hour is narrower than its two handles', async () => {
    const card = await cardOf(SHORT);
    tap(handle(card, 1), 14 * 60 + 5); await settle(); // the handle of 14:00, 5 minutes into the short slot
    assert.deepEqual(selected(card), { climate: SALON, day: 0, idx: 1 });
    assert.ok($(card, '.editor'));
    act(card, 'close'); await settle();
    tap(handle(card, 2), 14 * 60 + 20); await settle(); // the handle of 14:15, on its right half
    assert.equal(selected(card).idx, 2);
    act(card, 'close'); await settle();
    tap(handle(card, 1), 14 * 60 - 4); await settle(); // the handle of 14:00, on its left half
    assert.equal(selected(card).idx, 0);
  });

  test('opens the slot where the finger went down, not where the browser put the click', async () => {
    // On a touch screen, Chromium moves the click to the centre of the handle it picked: read
    // there, the time is the edge of the slot, and one tap in three opened the neighbor
    const card = await cardOf();
    const h = handle(card, 4); // the handle of 22:30
    mouse(h, 'pointerdown', 22 * 60 + 38); await settle();
    mouse(h, 'pointerup', 22 * 60 + 38); await settle();
    mouse(h, 'click', 22 * 60 + 29); await settle(); // the click, moved just left of the handle's centre
    assert.equal(selected(card).idx, 4, 'the slot of 22:30, under the finger');
    act(card, 'close'); await settle();
    // A click without a pointerdown before it (a keyboard, an old browser) reads its own place
    mouse(handle(card, 4), 'click', 22 * 60 + 15); await settle(); // elsewhere: not the second tap of a double tap
    assert.equal(selected(card).idx, 3);
  });

  test('keeps the selected slot when the handle is one of its own', async () => {
    const card = await cardOf(SHORT);
    await select(card, 2);
    tap(handle(card, 2), 14 * 60 + 12); await settle(); // its start handle, on the short slot's side
    assert.equal(selected(card).idx, 2);
    tap(handle(card, 3), 22 * 60 + 35); await settle(); // its end handle
    assert.equal(selected(card).idx, 2);
  });

  test('opens nothing after the handle was dragged', async () => {
    const card = await cardOf();
    const h = handle(card, 1);
    mouse(h, 'pointerdown', 390); await settle();
    mouse(h, 'pointermove', 420); await settle();
    mouse(h, 'pointerup', 420); await settle();
    mouse(handle(card, 1), 'click', 420); await settle();
    assert.equal(day(card)[1], '07:00 comfort');
    assert.equal(selected(card), null);
  });

  test('opens nothing with read-only weeks', async () => {
    const hass = fakeHass({ weeks: { [SALON]: { Normal: Array(7).fill(SHORT) } } });
    hass.user = { is_admin: false };
    const card = createCard(hass, { show: [SALON], group_days: false }); await settle();
    assert.equal($(card, '.handle'), null);
  });
});

describe('a time typed in the slot popover', () => {
  test('24:00 as the end of a slot is the end of the day: the slots after it go', async () => {
    const card = await cardOf();
    await select(card, 1);
    typeTime(field(card, 'end'), '24:00'); await settle();
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort']);
    assert.equal($(card, '.editor .fixed:last-of-type').textContent, '24:00');
  });

  test('00:00 as the end of a slot is the end of the day too', async () => {
    const card = await cardOf();
    await select(card, 3);
    typeTime(field(card, 'end'), '0'); await settle();
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort']);
  });

  test('24:15 is not a time: the field shows the end again', async () => {
    const card = await cardOf();
    await select(card, 1);
    typeTime(field(card, 'end'), '24:15'); await settle();
    assert.deepEqual(day(card), WEEKDAY);
  });

  test('an end typed onto the end of the next slot removes that slot: no sliver is left', async () => {
    const card = await cardOf(['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 boost', '22:30 eco']);
    await select(card, 1);
    typeTime(field(card, 'end'), '17:30'); await settle();
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '17:30 boost', '22:30 eco']);
    typeTime(field(card, 'end'), '23:00'); await settle(); // past the next slot: it goes, the one after it starts later
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '23:00 eco']);
  });

  test('an end typed inside the next slot shortens it, as before', async () => {
    const card = await cardOf();
    await select(card, 1);
    typeTime(field(card, 'end'), '12:00'); await settle();
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '12:00 eco', '17:30 comfort', '22:30 eco']);
  });

  test('a start typed onto the start of the slot before it removes that slot', async () => {
    const card = await cardOf(['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 boost', '22:30 eco']);
    await select(card, 3);
    typeTime(field(card, 'start'), '08:30'); await settle();
    assert.deepEqual(day(card), ['00:00 eco', '06:30 comfort', '08:30 boost', '22:30 eco']);
    assert.equal(selected(card).idx, 2);
    typeTime(field(card, 'start'), '00:00'); await settle(); // the start of the day: the slot is the first one
    assert.deepEqual(day(card), ['00:00 boost', '22:30 eco']);
  });
});

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and a valve that lists heat and auto. The card shows the suite. It is Monday, 10:00.
{
  const { $ } = dom;
  const day = dayOf;
  const { SALON, cardOf, onMondayAtTen, select, setup } = suiteAndValve;

  describe('a short slot', () => {
    onMondayAtTen();
    // One pixel per minute: clientX is a time of day in minutes
    const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
    const mouse = (el, type, clientX) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
    const handle = (card, idx) => { geometry($(card, `.bar[data-climate="${SALON}"][data-day="0"]`)); return $(card, `.bar[data-climate="${SALON}"][data-day="0"] .handle[data-idx="${idx}"]`); };
    const tap = (el, clientX) => { mouse(el, 'pointerdown', clientX); mouse(el, 'pointerup', clientX); mouse(el, 'click', clientX); };
    // Half an hour of boost at 14:00: narrower than its two handles
    const SHORT = ['00:00 eco', '14:00 boost', '14:30 comfort', '22:30 eco'];
    const short = async (slots = SHORT) => await cardOf(setup({ salon: slots }), { show: [SALON] });

    test('is cut by a double tap, though the second tap lands on a handle of the slot selected', async () => {
      const card = await short();
      tap(handle(card, 1), 14 * 60 + 5); await settle(); // selects the short slot
      assert.equal(selected(card).idx, 1);
      tap(handle(card, 1), 14 * 60 + 5); await settle(); // the second tap, on its own handle
      assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 boost', '14:15 boost', '14:30 comfort', '22:30 eco']);
    });

    test('of one step cannot be cut: the double tap keeps it selected', async () => {
      const card = await short(['00:00 eco', '14:00 boost', '14:15 comfort', '22:30 eco']);
      tap(handle(card, 1), 14 * 60 + 5); await settle();
      tap(handle(card, 1), 14 * 60 + 5); await settle();
      assert.equal(day(card, SALON).length, 4);
      assert.equal(selected(card).idx, 1);
    });

    test('a long slot is not cut by a double tap on its own handle', async () => {
      const card = await short();
      await openSlot(card, SALON, 2);
      tap(handle(card, 3), 22 * 60 + 25); await settle();
      tap(handle(card, 3), 22 * 60 + 25); await settle();
      assert.equal(day(card, SALON).length, 4);
    });

    test('Insert cuts a slot of two steps in two', async () => {
      const card = await short();
      await select(card, SALON, 1);
      const insert = $(card, '.editor [data-act="insert"]');
      assert.equal(insert.disabled, false);
      insert.click(); await settle();
      assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 boost', '14:15 boost', '14:30 comfort', '22:30 eco']);
      // One step: nothing to insert
      const one = await short(['00:00 eco', '14:00 boost', '14:15 comfort', '22:30 eco']);
      await select(one, SALON, 1);
      assert.equal($(one, '.editor [data-act="insert"]').disabled, true);
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The card shows the salon. It is Monday, 10:00.
{
  const day = dayOf;
  const { SALON, bar, cardOf, onMondayAtTen, select, setup } = suiteAndCombles;
  // A time typed in the start or end field of a salon slot's popover
  const edge = async (card, which, idx, time) => {
    await select(card, SALON, idx);
    typeTime(dom.$(card, `.editor input.time[data-edge="${which}"]`), time); await settle();
  };

  describe('a time typed in a slot', () => {
    onMondayAtTen();
    const MORNING = ['00:00 eco', '08:00 comfort', '14:00 boost'];

    test('rounded onto the start of the slot before it does not remove that slot', async () => {
      const card = await cardOf(setup({ salon: MORNING }));
      await edge(card, 'start', 2, '08:05');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '08:00 comfort', '08:15 boost']);
    });

    test('typed exactly onto the start of the slot before it removes that slot', async () => {
      const card = await cardOf(setup({ salon: MORNING }));
      await edge(card, 'start', 2, '08:00');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '08:00 boost']);
    });

    test('an end rounded onto the end of the slot after it does not remove that slot', async () => {
      const card = await cardOf(setup());
      await edge(card, 'end', 0, '19:55');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '19:45 comfort', '20:00 frost']);
    });

    test('an end typed exactly onto the end of the slot after it removes that slot', async () => {
      const card = await cardOf(setup());
      await edge(card, 'end', 0, '20:00');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '20:00 frost']);
    });
  });

  describe('where the tag of a short override goes', () => {
    onMondayAtTen();
    const bar = { left: 0, right: 300 };
    const tag = { width: 70 };

    test('after the override when nothing is there', async () => {
      assert.equal(tagSide(tag, { left: 100, right: 120 }, bar, [{ left: 0, right: 40 }, { left: 220, right: 260 }]), '');
    });

    test('before it when the next slot\'s label is close', async () => {
      assert.equal(tagSide(tag, { left: 100, right: 120 }, bar, [{ left: 0, right: 20 }, { left: 140, right: 180 }]), 'before');
    });

    test('before it at the end of the day', async () => {
      assert.equal(tagSide(tag, { left: 240, right: 280 }, bar, []), 'before');
    });

    test('above the bar when both sides hold a label', async () => {
      assert.equal(tagSide(tag, { left: 100, right: 120 }, bar, [{ left: 40, right: 90 }, { left: 140, right: 180 }]), 'above');
    });

    test('above, from its right edge, when it would leave the bar', async () => {
      assert.equal(tagSide(tag, { left: 250, right: 270 }, bar, [{ left: 200, right: 240 }]), 'above end');
    });
  });
}
