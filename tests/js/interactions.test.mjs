// Pointer and form interactions of the card and of the more-info block: dragging slots and
// override ends, row menu, copying a week, time fields, popovers, injection into the dialog,
// error messages.
import { fakeHass, fakeIntegrationHass, createCard, createView, cleanup, integrationData, typeTime, pressKey, WEEKDAY, WEEKEND } from './helpers.mjs';
import { cutSlot } from './driver.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, day, openMenu, openOverride, openSlot, redraw, save, selected, settle, unsaved } from './driver.mjs';
import { historyShown, shown } from './driver.mjs';
import { client } from '../../frontend/src/client/chauffage-client.ts';

const $ = (card, selector) => card.shadowRoot.querySelector(selector);
// One pixel per minute: clientX is a time of day in minutes
const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
const pointer = (el, type, clientX = 0) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
const override = { target: { temperature: 21.5 }, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
// The schedule tab that carries the active-schedule dot
const activeTab = (card) => {
  const dot = $(card, '.tab .dot');
  return dot ? dot.closest('.tab').dataset.schedule : null;
};
// The integration answers what a preset is worth on a thermostat: the card draws again
const answerAboutAPreset = async (hass) => { client.preview(hass, 'climate.salon', { id: 'other', name: 'Other', color: '#000', temperature: 18 }); await settle(); };

afterEach(() => cleanup());

describe('dragging a slot boundary', () => {
  const drag = async (card, toMinutes) => {
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    const handle = bar.querySelector('.handle[data-idx="1"]'); // 06:30
    pointer(handle, 'pointerdown', 390);
    pointer(handle, 'pointermove', toMinutes);
    pointer(handle, 'pointerup', toMinutes);
  };

  test('moves the time, snapped to the step', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await drag(card, 7 * 60 + 7);
    assert.equal(day(card, 'climate.salon', 0)[1], '07:00 comfort');
    assert.equal(unsaved(card), true);
  });

  test('stays between the neighboring slots', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await drag(card, 23 * 60);
    assert.equal(day(card, 'climate.salon', 0)[1], '08:15 comfort'); // next slot at 08:30, step 15 min
  });

  test('a press without moving changes nothing', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    const handle = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]')).querySelector('.handle[data-idx="1"]');
    pointer(handle, 'pointerdown', 390);
    pointer(handle, 'pointerup', 390);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    assert.ok(!unsaved(card));
  });

  test('an answer of the integration during the drag leaves the handle and the slots where the drag left them', async () => {
    const hass = fakeHass();
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    const handle = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]')).querySelector('.handle[data-idx="1"]'); // 06:30
    pointer(handle, 'pointerdown', 390);
    pointer(handle, 'pointermove', 420);
    await answerAboutAPreset(hass);
    pointer(handle, 'pointerup', 420); await settle();
    assert.equal(day(card, 'climate.salon', 0)[1], '07:00 comfort');
    const at = `${((420 / 1440) * 100).toFixed(3)}%`;
    assert.equal($(card, '.bar[data-climate="climate.salon"][data-day="0"] .handle[data-idx="1"]').style.left, at);
    assert.equal($(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').style.left, at);
  });
});

describe('scrolling the week with a finger (#67)', () => {
  const finger = async (el, type, clientX, clientY) => {
    const e = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX, clientY });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    el.dispatchEvent(e); await settle();
  };
  const salonMonday = (card) => geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));

  test('a vertical swipe that starts on a handle moves no time, even with a bit of sideways', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    const handle = salonMonday(card).querySelector('.handle[data-idx="1"]'); // 06:30
    await finger(handle, 'pointerdown', 390, 100);
    await finger(handle, 'pointermove', 396, 140); // 6 px sideways, 40 px down: a scroll
    await finger(handle, 'pointermove', 420, 300);
    await finger(handle, 'pointerup', 420, 300);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    assert.ok(!unsaved(card));
  });

  test('a finger moving a handle sideways still moves its time', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    const handle = salonMonday(card).querySelector('.handle[data-idx="1"]');
    await finger(handle, 'pointerdown', 390, 100);
    await finger(handle, 'pointermove', 420, 104);
    await finger(handle, 'pointerup', 420, 104);
    assert.equal(day(card, 'climate.salon', 0)[1], '07:00 comfort');
  });

  test('a few pixels sideways are not a move: a finger is not that steady', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    const handle = salonMonday(card).querySelector('.handle[data-idx="1"]');
    await finger(handle, 'pointerdown', 390, 100);
    await finger(handle, 'pointermove', 396, 100);
    await finger(handle, 'pointerup', 396, 100);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
  });

  test('a scroll that the browser takes over (pointercancel) puts the time back', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    const handle = salonMonday(card).querySelector('.handle[data-idx="1"]');
    await finger(handle, 'pointerdown', 390, 100);
    await finger(handle, 'pointermove', 420, 102);
    await finger(handle, 'pointercancel', 420, 102);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    assert.ok(!unsaved(card));
  });

  test('a vertical swipe that starts on the selected slot does not move it', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await openSlot(card, 'climate.salon', 1);
    const seg = salonMonday(card).querySelector('.seg[data-idx="1"]');
    await finger(seg, 'pointerdown', 450, 100);
    await finger(seg, 'pointermove', 456, 140);
    await finger(seg, 'pointermove', 480, 300);
    await finger(seg, 'pointerup', 480, 300);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
  });

  test('a schedule activated while a finger scrolls the week is shown when the finger lifts', async () => {
    const hass = fakeHass();
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    assert.equal(activeTab(card), 'normal');
    const handle = salonMonday(card).querySelector('.handle[data-idx="1"]');
    await finger(handle, 'pointerdown', 390, 100);
    hass.push(integrationData({ schedule: 'Absent' })); await settle();
    await finger(handle, 'pointermove', 392, 160); // a vertical swipe: a scroll, the drag is dropped
    await finger(handle, 'pointerup', 392, 160);
    assert.equal(activeTab(card), 'away');
  });

  test('an override set while a finger scrolls the week is shown when the finger lifts', async (t) => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }); // an hour of override, before midnight
    t.after(() => mock.timers.reset());
    const hass = fakeHass();
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    assert.equal($(card, '.override'), null);
    const handle = salonMonday(card).querySelector('.handle[data-idx="1"]');
    await finger(handle, 'pointerdown', 390, 100);
    const start = new Date(Date.now() - 10 * 60000).toISOString();
    const end = new Date(Date.now() + 60 * 60000).toISOString();
    hass.push(integrationData({ overrides: { 'climate.salon': { target: { temperature: 21.5 }, start, end } } })); await settle();
    await finger(handle, 'pointermove', 392, 160);
    await finger(handle, 'pointerup', 392, 160);
    assert.ok($(card, '.override-handle'), 'the override is drawn');
  });
});

describe('dragging a whole slot', () => {
  // Slot 1: 06:30 → 08:30 comfort, between 00:00 eco and 08:30 eco (until 17:30)
  const drag = async (card, idx, fromMinutes, toMinutes, pointerType) => {
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    const seg = bar.querySelector(`.seg[data-idx="${idx}"]`);
    const send = async (type, clientX) => {
      const e = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX });
      if (pointerType) Object.defineProperty(e, 'pointerType', { value: pointerType });
      seg.dispatchEvent(e); await settle();
    };
    await send('pointerdown', fromMinutes);
    await send('pointermove', toMinutes);
    await send('pointerup', toMinutes);
  };

  test('moves its start and its end together, snapped to the step', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await drag(card, 1, 7 * 60, 8 * 60 + 7);
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 eco', '07:30 comfort', '09:30 eco', '17:30 comfort', '22:30 eco']);
    assert.equal(unsaved(card), true);
    assert.equal($(card, '.editor'), null); // a move does not open the slot's popover
  });

  test('stays between the neighboring slots, keeping its length', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await drag(card, 1, 7 * 60, 0);
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['00:15 comfort', '02:15 eco']);
    await drag(card, 1, 60, 23 * 60);
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['15:15 comfort', '17:15 eco']); // next slot at 17:30
  });

  test('the first and the last slots of the day do not move', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await drag(card, 0, 3 * 60, 4 * 60);
    await drag(card, 4, 23 * 60, 22 * 60);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    assert.ok(!unsaved(card));
  });

  test('a tiny move is still a click: it selects the slot', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await drag(card, 1, 7 * 60, 7 * 60 + 2);
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click(); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    assert.ok($(card, '.editor'));
  });

  test('by touch, only the selected slot moves (a finger sliding over the week moves nothing)', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await drag(card, 1, 7 * 60, 8 * 60, 'touch');
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click(); await settle();
    await drag(card, 1, 7 * 60, 8 * 60, 'touch');
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['07:30 comfort', '09:30 eco']);
    assert.ok($(card, '.seg.sel[data-idx="1"]')); // still selected: it can slide again
  });
});

describe('dragging the end of an override', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());

  test('in the card: sets the new end', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    const handle = bar.querySelector('.override-handle');
    pointer(handle, 'pointerdown', 690);
    pointer(handle, 'pointermove', 12 * 60 + 40);
    pointer(handle, 'pointerup');
        assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T10:45:00.000Z'); // 12:45 in Paris
  });

  test('in the card, an answer of the integration during the drag: the new end is sent and drawn', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    const handle = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]')).querySelector('.override-handle');
    pointer(handle, 'pointerdown', 690);
    pointer(handle, 'pointermove', 12 * 60 + 40);
    await answerAboutAPreset(hass);
    pointer(handle, 'pointerup'); await settle();
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T10:45:00.000Z'); // 12:45 in Paris
    const drawn = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .override-handle').parentElement;
    assert.equal(drawn.style.width, `${(((12 * 60 + 45 - 570) / 1440) * 100).toFixed(3)}%`);
  });

  test('in the card, a schedule activated while the end is held without moving is shown when it is released', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    assert.equal(activeTab(card), 'normal');
    const handle = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]')).querySelector('.override-handle');
    pointer(handle, 'pointerdown', 690);
    hass.push(integrationData({ schedule: 'Absent', overrides: { 'climate.salon': override } })); await settle();
    pointer(handle, 'pointerup'); await settle();
    assert.equal(activeTab(card), 'away');
  });

  test('in the more-info block: sets the new end', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon'; await settle();
    el.hass = hass; await settle();
    const handle = el.shadowRoot.querySelector('.override-handle');
    geometry(handle.closest('.bar'));
    pointer(handle, 'pointerdown', 690);
    pointer(handle, 'pointermove', 14 * 60);
    pointer(handle, 'pointerup');
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T12:00:00.000Z');
  });

  describe('on the days the clocks change (#43)', () => {
    const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
    const sunday = (start, end) => ({ 'climate.salon': { target: { temperature: 21.5 }, start, end } });
    const dragInCard = async (hass, toMinutes) => {
      const card = createCard(hass, { show: ['climate.salon'], group_days: false }); await settle();
      const handle = geometry($(card, '.bar[data-climate="climate.salon"][data-day="6"]')).querySelector('.override-handle');
      pointer(handle, 'pointerdown');
      pointer(handle, 'pointermove', toMinutes);
      pointer(handle, 'pointerup');
    };
    const dragInMoreInfo = async (hass, toMinutes) => {
      const handle = (await moreInfoOf(hass)).shadowRoot.querySelector('.override-handle');
      geometry(handle.closest('.bar'));
      pointer(handle, 'pointerdown');
      pointer(handle, 'pointermove', toMinutes);
      pointer(handle, 'pointerup');
    };

    test('clocks back, in the card: the end dropped at 13:00 is 13:00', async () => {
      at('2026-10-25T10:00:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-10-25T10:00:00+01:00', '2026-10-25T11:30:00+01:00') });
      await dragInCard(hass, 13 * 60);
      assert.equal(sentEnd(hass), '2026-10-25T12:00:00.000Z');
    });

    test('clocks back, in the more-info block: the end dropped at 13:00 is 13:00', async () => {
      at('2026-10-25T10:00:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-10-25T10:00:00+01:00', '2026-10-25T11:30:00+01:00') });
      await dragInMoreInfo(hass, 13 * 60);
      assert.equal(sentEnd(hass), '2026-10-25T12:00:00.000Z');
    });

    // 02:00-03:00 is played twice: during the second time, 02:45 is the one still to come
    test('clocks back, in the hour played twice: the end dropped is not the 02:45 already past', async () => {
      at('2026-10-25T02:20:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-10-25T02:00:00+01:00', '2026-10-25T02:40:00+01:00') });
      await dragInCard(hass, 2 * 60 + 45);
      assert.equal(sentEnd(hass), '2026-10-25T01:45:00.000Z'); // 02:45 winter time
    });

    test('clocks back, in the hour played twice: the end time field is not the 02:45 already past', async () => {
      at('2026-10-25T02:20:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-10-25T02:00:00+01:00', '2026-10-25T02:40:00+01:00') });
      typeTime((await moreInfoOf(hass)).shadowRoot.querySelector('input.time[data-override-end]'), '02:45'); await settle();
      assert.equal(sentEnd(hass), '2026-10-25T01:45:00.000Z');
    });

    test('clocks forward, in the card: the end dropped at 13:00 is 13:00', async () => {
      at('2026-03-29T10:00:00+02:00');
      const hass = fakeHass({ overrides: sunday('2026-03-29T10:00:00+02:00', '2026-03-29T11:30:00+02:00') });
      await dragInCard(hass, 13 * 60);
      assert.equal(sentEnd(hass), '2026-03-29T11:00:00.000Z');
    });

    // 02:00-03:00 does not exist: the end dropped there is when the clocks went forward
    test('clocks forward, in the card: the end dropped in the hour skipped is 03:00', async () => {
      at('2026-03-29T01:00:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-03-29T01:00:00+01:00', '2026-03-29T01:30:00+01:00') });
      await dragInCard(hass, 2 * 60 + 30);
      assert.equal(sentEnd(hass), '2026-03-29T01:00:00.000Z'); // 03:00 summer time
    });

    test('clocks forward, in the more-info block: the end dropped in the hour skipped is 03:00', async () => {
      at('2026-03-29T01:00:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-03-29T01:00:00+01:00', '2026-03-29T01:30:00+01:00') });
      await dragInMoreInfo(hass, 2 * 60 + 30);
      assert.equal(sentEnd(hass), '2026-03-29T01:00:00.000Z');
    });
  });

  const moreInfoOf = async (hass) => {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon'; await settle();
    el.hass = hass; await settle();
    await settle();
    return el;
  };
  const sets = (hass) => hass.events.filter((m) => m.type === 'chauffage/override/set').length;
  const sentEnd = (hass) => new Date(hass.events.at(-1).override.end).toISOString();
  const thermostatChanged = (hass) => ({ ...hass, states: { ...hass.states,
    'climate.salon': { ...hass.states['climate.salon'], last_updated: '2' } } });
  const popoverEnd = async (card) => {
    await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    return $(card, '.override-ed input.time[data-override-end]');
  };

  test('in the more-info block: the end time field', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    typeTime((await moreInfoOf(hass)).shadowRoot.querySelector('input.time[data-override-end]'), '09:00'); await settle(); // already past today: tomorrow 09:00
    assert.equal(sentEnd(hass), '2026-10-13T07:00:00.000Z');
  });

  test('the end is a time to the minute, not on the step', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    typeTime(await popoverEnd(createCard(hass, { show: ['climate.salon'] })), '12:07'); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T10:07:00.000Z');
  });

  test('in the more-info block: the end being typed keeps its field through the redraws, and is sent on leaving it', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = await moreInfoOf(hass);
    const field = el.shadowRoot.querySelector('input.time[data-override-end]');
    field.focus();
    field.value = '12:00';
    el.hass = thermostatChanged(hass); await settle(); // the thermostat reports, the minute changes…
    assert.equal(sets(hass), 0, 'nothing sent while typing');
    assert.ok(field.isConnected, 'the field is kept');
    field.blur(); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z');
    assert.notEqual(el.shadowRoot.querySelector('input.time[data-override-end]'), field, 'the redraw held back is done');
  });

  test('in the card\'s popover: the end being typed keeps its field through the redraws, and is sent on leaving it', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    const field = await popoverEnd(card);
    field.focus();
    field.value = '12:00';
    await redraw(card); // every 30 s during an override
    card.hass = thermostatChanged(hass); await settle();
    assert.equal(sets(hass), 0, 'nothing sent while typing');
    assert.ok(field.isConnected, 'the field is kept');
    field.blur(); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z');
    assert.notEqual($(card, '.override-ed input.time[data-override-end]'), field, 'the redraw held back is done');
  });

  test('in the card\'s popover: Enter sends the end being typed', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const field = await popoverEnd(createCard(hass, { show: ['climate.salon'] })); await settle();
    field.focus();
    field.value = '12:30';
    pressKey(field, 'Enter'); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T10:30:00.000Z');
  });

  test('in the card\'s popover: the end typed is sent when tapping outside the card, and the popover closes', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    const field = await popoverEnd(card);
    field.focus();
    field.value = '12:00';
    // As a browser does: the pointer goes down outside (the popovers close), then the field loses the focus
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, composed: true })); await settle();
    field.blur(); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z');
    assert.equal($(card, '.override-ed'), null);
  });

  test('in the card\'s popover: an override ended elsewhere while its end is typed goes once the field is left', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    const field = await popoverEnd(card);
    field.focus();
    hass.push(integrationData({ overrides: {} })); await settle(); // resumed from another device
    assert.ok(field.isConnected, 'the field is kept');
    field.blur(); await settle();
    assert.equal($(card, '.override-ed'), null);
    assert.equal($(card, '.bar .override'), null);
  });

  test('a time not whole is shown again as it was, and nothing is sent', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    typeTime(await popoverEnd(card), '12:'); await settle();
    assert.equal(sets(hass), 0);
    assert.equal($(card, '.override-ed input.time[data-override-end]').value, '11:30');
  });

  test('the arrow keys: an hour on the hours, the step on the minutes; sent on leaving the field', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = await moreInfoOf(hass);
    const field = el.shadowRoot.querySelector('input.time[data-override-end]'); // 11:30
    field.focus();
    field.setSelectionRange(1, 1);
    pressKey(field, 'ArrowUp'); await settle();
    assert.equal(field.value, '12:30');
    field.setSelectionRange(4, 4);
    pressKey(field, 'ArrowDown'); await settle();
    pressKey(field, 'ArrowDown'); await settle();
    assert.equal(field.value, '12:00');
    assert.equal(sets(hass), 0, 'nothing sent at each arrow');
    field.blur(); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z');
  });

  test('on a 12 h clock, ↑ on AM moves the end 12 hours later', async () => {
    const locale = { language: 'en-US', time_format: '12', number_format: 'language', first_weekday: 'language' };
    const hass = fakeHass({ locale, overrides: { 'climate.salon': override } });
    const field = (await moreInfoOf(hass)).shadowRoot.querySelector('input.time[data-override-end]'); // 11:30 AM
    field.focus();
    field.setSelectionRange(6, 6);
    pressKey(field, 'ArrowUp'); await settle();
    field.blur(); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T21:30:00.000Z'); // 11:30 PM today
  });

  test('two quick taps on a small arrow move the end by two steps', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    await popoverEnd(card);
    $(card, '.override-ed .time-step[data-time-step="1"]').click(); await settle();
    $(card, '.override-ed .time-step[data-time-step="1"]').click(); await settle(); // before the new end comes back
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z'); // 12:00
  });

  test('the small arrows move the end by the step, at once', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    await popoverEnd(card);
    $(card, '.override-ed .time-step[data-time-step="1"]').click(); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T09:45:00.000Z'); // 11:45
    const el = await moreInfoOf(hass);
    el.shadowRoot.querySelector('.time-step[data-time-step="-1"]').click(); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T09:15:00.000Z'); // 11:15
  });

  test('an end moved before now by the arrows stays a step after now, not tomorrow', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, end: '2026-10-12T10:30:00+02:00' } } });
    const field = (await moreInfoOf(hass)).shadowRoot.querySelector('input.time[data-override-end]');
    field.focus();
    field.setSelectionRange(1, 1);
    pressKey(field, 'ArrowDown'); await settle(); // 09:30, already past
    field.blur(); await settle();
    assert.equal(sentEnd(hass), '2026-10-12T08:15:00.000Z'); // 10:15 today
  });

  test('an end in three days moved by the small arrows stays in three days', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, end: '2026-10-15T11:30:00+02:00' } } });
    (await moreInfoOf(hass)).shadowRoot.querySelector('.time-step[data-time-step="1"]').click(); await settle();
    assert.equal(sentEnd(hass), '2026-10-15T09:45:00.000Z'); // 11:45 in three days
  });
});

describe('row menu', () => {
  test('the ⋮ button opens it; "Mon–Fri" copies the day', async () => {
    const weeks = { 'climate.salon': { Normal: [WEEKDAY, WEEKDAY, ['00:00 frost'], WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } };
    const card = createCard(fakeHass({ weeks }), { show: ['climate.salon'] }); await settle();
    $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="0"]').click(); await settle();
    assert.ok($(card, '.menu'));
    assert.ok($(card, '.menu [data-act="paste-day"]').disabled); // empty clipboard
    $(card, '.menu [data-act="fill-weekdays"]').click(); await settle();
    assert.equal($(card, '.menu'), null);
    assert.deepEqual(day(card, 'climate.salon', 2), WEEKDAY);
  });

  test('Escape closes it, as it closes the popovers', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false }); await settle();
    $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="0"]').click(); await settle();
    assert.ok($(card, '.menu'));
    $(card, '.menu [data-act="fill-weekdays"]').focus();
    $(card, '.menu [data-act="fill-weekdays"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })); await settle();
    assert.equal($(card, '.menu'), null);
  });

  test('a right click on a row opens it too; a click elsewhere closes it', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false }); await settle();
    const bar = $(card, '.bar[data-climate="climate.salon"][data-day="1"]');
    bar.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 50 })); await settle();
    assert.match($(card, '.menu .mh').textContent, /Mardi/);
    $(card, '.legend').click(); await settle();
    assert.equal($(card, '.menu'), null);
  });

  test('it holds what can be done with the day, and opens the thermostat (#39)', async () => {
    let received = null;
    const intercept = (e) => { received = e.detail.entityId; e.stopPropagation(); };
    document.addEventListener('hass-more-info', intercept);
    try {
      const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false }); await settle();
      openMenu(card, 'climate.salon', ((new Date().getDay() + 6) % 7 + 1) % 7); await settle(); // not today
      const acts = [...card.shadowRoot.querySelectorAll('.menu [data-act]')].map((b) => b.dataset.act);
      assert.deepEqual(acts, ['copy-day', 'paste-day', 'fill-weekdays', 'fill-weekend', 'fill-all']);
      $(card, '.menu .mh [data-more-info="climate.salon"]').click(); await settle();
      assert.equal(received, 'climate.salon');
    } finally {
      document.removeEventListener('hass-more-info', intercept);
    }
  });

  test('it opens upwards when there is no room below it in the window', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false }); await settle();
    const button = $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="6"]');
    // The card from 0 to 2000 px, the button at 700–728 px, a 768 px high window, a 300 px menu
    $(card, 'ha-card').getBoundingClientRect = () => ({ top: 0, bottom: 2000, left: 0, right: 800, width: 800, height: 2000 });
    button.getBoundingClientRect = () => ({ top: 700, bottom: 728, left: 760, right: 788, width: 28, height: 28 });
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList.contains('menu') ? 300 : 0; } });
    try {
      window.innerHeight = 768;
      button.click(); await settle();
      assert.equal($(card, '.menu').style.top, `${700 - 4 - 300}px`);
      $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="6"]').click(); await settle(); // closes it
      button.getBoundingClientRect = () => ({ top: 100, bottom: 128, left: 760, right: 788, width: 28, height: 28 });
      $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="0"]').getBoundingClientRect = button.getBoundingClientRect;
      $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="0"]').click(); await settle();
      assert.equal($(card, '.menu').style.top, `${128 + 4}px`);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height);
    }
  });
});

describe('editing a slot', () => {
  const editor = async (card) => {
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click(); await settle(); // 06:30 → 08:30
    return { start: $(card, '.editor input.time[data-edge="start"]'), end: $(card, '.editor input.time[data-edge="end"]') };
  };

  test('the "to" time field moves the end of the slot', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    typeTime((await editor(card)).end, '09:00'); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:30 comfort', '09:00 eco']);
  });

  test('the "from" time field moves its start, within its neighbors', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    typeTime((await editor(card)).start, '09:30'); await settle(); // after the slot's end (08:30): stops one step before it
    assert.equal(day(card, 'climate.salon', 0)[1], '08:15 comfort');
  });

  test('Tab from the start to the end keeps the end field, and both times are applied', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    const { start, end } = await editor(card);
    start.focus();
    start.value = '06:00';
    end.focus(); // Tab
    await new Promise((resolve) => setTimeout(resolve));
    assert.equal(day(card, 'climate.salon', 0)[1], '06:00 comfort');
    assert.ok(end.isConnected, 'the end field is kept');
    assert.equal(card.shadowRoot.activeElement, end);
    end.value = '09:00';
    end.blur(); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:00 comfort', '09:00 eco']);
  });

  test('the small arrows move the time by the step, at once', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await editor(card);
    $(card, '.editor input.time[data-edge="end"] + .time-spin [data-time-step="1"]').click(); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:30 comfort', '08:45 eco']);
  });

  test('a time off the step stays in its field, and the small arrows put it back on the step', async () => {
    const monday = ['00:00 eco', '06:20 comfort', '08:30 eco', '17:30 comfort', '22:30 eco']; // 06:20, set with another step
    const weeks = { 'climate.salon': { Normal: [monday, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } };
    const card = createCard(fakeHass({ weeks }), { show: ['climate.salon'] }); await settle();
    assert.equal((await editor(card)).start.value, '06:20');
    $(card, '.editor input.time[data-edge="start"] + .time-spin [data-time-step="-1"]').click(); await settle();
    assert.equal(day(card, 'climate.salon', 0)[1], '06:15 comfort');
  });

  test('a start rounded back onto the start of the slot: the field shows the start the slot keeps', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    typeTime((await editor(card)).start, '06:37'); await settle(); // step 15 min
    assert.equal(day(card, 'climate.salon', 0)[1], '06:30 comfort');
    assert.equal($(card, '.editor input.time[data-edge="start"]').value, '06:30');
  });

  test('an end rounded back onto the end of the slot: the field shows the end the slot keeps', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    typeTime((await editor(card)).end, '08:34'); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:30 comfort', '08:30 eco']);
    assert.equal($(card, '.editor input.time[data-edge="end"]').value, '08:30');
  });

  test('a click outside closes the editor', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click(); await settle();
    assert.ok($(card, '.editor'));
    $(card, '.legend').click(); await settle();
    assert.equal($(card, '.editor'), null);
  });
});

describe('copying a week', () => {
  test('to another thermostat and schedule, from a menu: a list would act as soon as an option is picked', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    assert.equal($(card, 'select.copyweek'), null);
    $(card, '[data-act="copyweek-menu"]').click(); await settle();
    const menu = $(card, '.copyweek-menu');
    assert.ok(menu.classList.contains('menu'));
    menu.querySelector('[data-act="copy-week"][data-climate="climate.bureau"][data-schedule="away"]').click(); await settle();
    assert.equal($(card, '.copyweek-menu'), null);
    assert.deepEqual(day(card, 'climate.bureau', 0, 'away'), WEEKDAY);
    assert.equal(unsaved(card), true);
  });

  test('its menu stays in the window: it opens on the side with more room, no taller than that room', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    const button = $(card, '[data-act="copyweek-menu"]');
    $(card, 'ha-card').getBoundingClientRect = () => ({ top: -500, bottom: 300, left: 0, right: 900, width: 900 });
    // Near the top of the window (the page scrolled down): downwards
    button.getBoundingClientRect = () => ({ top: 40, bottom: 72, left: 700, right: 880 });
    button.click(); await settle();
    let menu = $(card, '.copyweek-menu');
    assert.equal(menu.style.top, '576px');
    assert.equal(menu.style.bottom, '');
    assert.equal(menu.style.maxHeight, `${window.innerHeight - 72 - 16}px`);
    $(card, '[data-act="copyweek-menu"]').click(); await settle(); // closed
    // Near the bottom of the window: upwards
    $(card, 'ha-card').getBoundingClientRect = () => ({ top: 0, bottom: window.innerHeight, left: 0, right: 900, width: 900 });
    const again = $(card, '[data-act="copyweek-menu"]');
    again.getBoundingClientRect = () => ({ top: window.innerHeight - 60, bottom: window.innerHeight - 28, left: 700, right: 880 });
    again.click(); await settle();
    menu = $(card, '.copyweek-menu');
    assert.equal(menu.style.bottom, '64px');
    assert.equal(menu.style.top, '');
    assert.equal(menu.style.maxHeight, `${window.innerHeight - 60 - 16}px`);
  });

  test('its menu closes with a click elsewhere or Escape, copying nothing', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    $(card, '[data-act="copyweek-menu"]').click(); await settle();
    $(card, '.legend').click(); await settle();
    assert.equal($(card, '.copyweek-menu'), null);
    $(card, '[data-act="copyweek-menu"]').click(); await settle();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); await settle();
    assert.equal($(card, '.copyweek-menu'), null);
    assert.equal(unsaved(card), false);
  });
});

describe('the override popover in the card', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());

  test('the same editor as the more-info block: the value, then the end and the durations, Resume the schedule', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    const ed = $(card, '.override-ed');
    const order = ['.presets', 'input[data-override-temperature]', 'input.time[data-override-end]', '[data-act="override-add"]', '[data-act="override-del"]']
      .map((s) => ed.querySelector(s));
    for (let i = 1; i < order.length; i += 1) {
      assert.ok(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}: in the block's order`);
    }
    assert.equal(ed.querySelector('[data-act="override-del"]').textContent, 'Reprendre le planning');
  });

  test('opens on a click; "+30 min" and the end time field', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    assert.ok($(card, '.override-ed'));
    $(card, '.override-ed [data-act="override-add"][data-min="30"]').click(); await settle();
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T10:00:00.000Z');
    typeTime($(card, '.override-ed input.time[data-override-end]'), '18:00'); await settle();
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T16:00:00.000Z');
  });

  // What the integration says each preset means on this thermostat (here: no climate presets)
  const withTargets = (overrides = { 'climate.salon': override }) => {
    const data = integrationData({ overrides });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { temperature: 17 } } };
    return fakeHass({ data });
  };

  test('the popover says what the thermostat goes back to at the end', async () => {
    const card = createCard(withTargets(), { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    assert.match($(card, '.override-ed').textContent, /puis Éco \(planning\)/); // 11:30: the 08:30 eco slot
  });

  test('without an override, today\'s row menu sets a temporary setpoint, for the override duration', async () => {
    const hass = withTargets({});
    const card = createCard(hass, { show: ['climate.salon'], group_days: false }); await settle();
    openMenu(card, 'climate.salon', 1); await settle(); // Tuesday: not today
    assert.equal($(card, '.menu [data-act="override-new"]'), null);
    openMenu(card, 'climate.salon', 0); await settle(); // Monday: today
    $(card, '.menu [data-act="override-new"]').click(); await settle();
    $(card, '.override-ed .presets [data-preset="comfort"]').click(); await settle();
    const sent = hass.events.at(-1);
    assert.equal(sent.type, 'chauffage/override/set');
    assert.deepEqual(sent.override, { target: { temperature: 20 }, preset: 'comfort', start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('a preset picked in the popover becomes the override, until the same end', async () => {
    const hass = withTargets();
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    $(card, '.override-ed .presets [data-preset="comfort"]').click(); await settle();
    const sent = hass.events.at(-1);
    assert.equal(sent.type, 'chauffage/override/set');
    assert.deepEqual(sent.override, { ...override, target: { temperature: 20 }, preset: 'comfort' });
  });

  test('an override set to a preset shows that preset, on a thermostat without presets', async () => {
    const card = createCard(withTargets({ 'climate.salon': { ...override, target: { temperature: 20 }, preset: 'comfort' } }), { show: ['climate.salon'] }); await settle();
    assert.match($(card, '.override[data-climate="climate.salon"]').title, /Confort/);
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    assert.equal($(card, '.override-ed .override-value').textContent, 'Confort 20°');
    assert.ok($(card, '.override-ed .presets [data-preset="comfort"]').classList.contains('on'));
  });

  test('an override at a preset\'s temperature does not show that preset', async () => {
    const data = integrationData({ overrides: { 'climate.salon': { ...override, target: { temperature: 20 } } } });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { temperature: 17 } } };
    const card = createCard(fakeHass({ data }), { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    assert.equal($(card, '.override-ed .override-value').textContent, '20 °C');
    assert.equal($(card, '.override-ed .presets .on'), null);
  });

  test('a temperature typed in the popover replaces the override\'s preset', async () => {
    const hass = withTargets({ 'climate.salon': { ...override, target: { temperature: 20 }, preset: 'comfort' } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    const input = $(card, '.override-ed input[data-override-temperature]');
    input.value = '22';
    input.dispatchEvent(new Event('change', { bubbles: true })); await settle();
    assert.deepEqual(hass.events.at(-1).override, { ...override, target: { temperature: 22 } });
  });

  test('a temperature typed in the popover becomes the override', async () => {
    const hass = withTargets();
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    const input = $(card, '.override-ed input[data-override-temperature]');
    assert.equal(input.value, '21,5'); // the user's number format
    input.value = '22';
    input.dispatchEvent(new Event('change', { bubbles: true })); await settle();
    assert.deepEqual(hass.events.at(-1).override, { ...override, target: { temperature: 22 } });
  });

  test('a temperature being typed in the popover survives a redraw of the card', async () => {
    const card = createCard(withTargets(), { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    const input = $(card, '.override-ed input[data-override-temperature]');
    input.focus();
    input.value = '2';
    await redraw(card); // every 30 s during an override, or another thermostat's override changed
    const after = $(card, '.override-ed input[data-override-temperature]');
    assert.equal(after.value, '2');
    assert.equal(card.shadowRoot.activeElement, after);
  });

  test('with a preset, the temperature field shows the thermostat\'s setpoint, even once it answers', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, target: { preset_mode: 'eco' } } } });
    const salon = (temperature) => ({ ...hass.states['climate.salon'], attributes: { ...hass.states['climate.salon'].attributes, temperature } });
    hass.states = { ...hass.states, 'climate.salon': salon(21.5) };
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    $(card, '.override[data-climate="climate.salon"]').click(); await settle();
    card.hass = { ...hass, states: { ...hass.states, 'climate.salon': salon(17) } }; await settle();  // the thermostat answers
    assert.equal($(card, '.override-ed input[data-override-temperature]').value, '17');
  });
});

describe('thermostat selection', () => {
  test('"Multiple" makes a click add a thermostat', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    $(card, '[data-act="multi-sel"]').click(); await settle();
    $(card, '.chip[data-climate="climate.bureau"]').click(); await settle();
    assert.deepEqual(shown(card), ['climate.salon', 'climate.bureau']);
  });
});

describe('the more-info dialog', () => {
  afterEach(() => { clearInterval(window.__chauffageMoreInfoTimer); document.querySelector('home-assistant')?.remove(); });

  // Home Assistant's DOM: <home-assistant> → <ha-more-info-dialog> → <ha-more-info-info>
  const dialog = (hass, entityId) => {
    const ha = document.createElement('home-assistant');
    ha.hass = hass;
    ha.attachShadow({ mode: 'open' });
    const dlg = document.createElement('ha-more-info-dialog');
    dlg.attachShadow({ mode: 'open' });
    dlg._entityId = entityId;
    const info = document.createElement('ha-more-info-info');
    info.attachShadow({ mode: 'open' });
    dlg.shadowRoot.appendChild(info);
    ha.shadowRoot.appendChild(dlg);
    document.body.appendChild(ha);
    window.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId } }));
    return { dlg, info };
  };

  test('the block is added to a scheduled thermostat\'s dialog', async () => {
    const { info } = dialog(fakeHass(), 'climate.salon');
    const block = info.shadowRoot.querySelector('chauffage-moreinfo');
    assert.ok(block);
    assert.equal(block.entity, 'climate.salon');
  });

  test('no block for a thermostat without a schedule, nor for other entities', async () => {
    assert.equal(dialog(fakeHass(), 'climate.bureau').info.shadowRoot.querySelector('chauffage-moreinfo'), null);
    document.querySelector('home-assistant').remove();
    assert.equal(dialog(fakeHass(), 'light.kitchen').info.shadowRoot.querySelector('chauffage-moreinfo'), null);
  });

  test('with the integration', async () => {
    const { info } = dialog(fakeIntegrationHass(), 'climate.salon');
    assert.ok(info.shadowRoot.querySelector('chauffage-moreinfo'));
  });
});

describe('error messages', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());
  // Every change fails. The questions about presets are still answered, as the integration
  // answers them from its data
  const failing = (hass) => {
    const ask = hass.callWS;
    hass.callService = async () => { throw { message: 'boom' }; };
    hass.callWS = async (msg) => (msg.type === 'chauffage/preset/preview' ? ask(msg) : hass.callService());
    return hass;
  };

  test('saving, removing an override, activating a schedule', async () => {
    const hass = failing(fakeHass({ overrides: { 'climate.salon': override } }));
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    await cutSlot(card, 'climate.salon', 0, 12 * 60);
    await save(card);
    assert.match($(card, '.msg').textContent, /Erreur : boom/);
    assert.equal(unsaved(card), true);

    await openOverride(card, 'climate.salon');
    act(card, 'override-del'); await settle();
    await settle();
    assert.match($(card, '.msg').textContent, /boom/);
    assert.ok($(card, '.override[data-climate="climate.salon"]'), 'the override is shown again');

    $(card, '.tab[data-schedule="away"]').click(); await settle();
    act(card, 'activate-schedule'); await settle();
    await settle();
    assert.match($(card, '.msg').textContent, /boom/);
  });

  test('a preset change refused by the integration', async () => {
    const hass = failing(fakeIntegrationHass());
    const card = createView(hass, 'presets'); await settle();
    $(card, '[data-kind="preset"][data-preset="eco"]').click(); await settle();
    act(card, 'cell-apply'); await settle();
    await settle();
    assert.match($(card, '.msg').textContent, /boom/);
    assert.ok($(card, '[data-panel="cell"]'), 'the panel stays open');
  });
});

describe('dashboard editor helpers', () => {
  test('the size of the card grows with the thermostats shown', async () => {
    const card = createCard(fakeHass(), { show: 'all' }); await settle();
    assert.equal(card.getCardSize(), 4 + 7 * 2);
  });
});

// ----- use cases found missing by the functional analysis (docs/use-cases.md) -----

describe('slot editor buttons', () => {
  const select = async (card, idx) => { $(card, `.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="${idx}"]`).click(); await settle(); };

  test('"Insert a slot" splits the slot in three, the middle one selected', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await select(card, 2); // 08:30 → 17:30 eco
    $(card, '.editor [data-act="insert"]').click(); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(2, 5), ['08:30 eco', '11:30 eco', '14:30 eco']);
    assert.equal(selected(card).idx, 3);
  });

  test('"Delete" removes the slot (the previous one takes its time)', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await select(card, 1); // 06:30 comfort
    $(card, '.editor [data-act="delete"]').click(); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 eco', '17:30 comfort', '22:30 eco']);
    assert.equal($(card, '.editor'), null);
  });

  test('deleting the first slot: the next one starts at midnight; a single slot cannot be deleted', async () => {
    const weeks = { 'climate.salon': { Normal: [['00:00 eco', '10:00 comfort'], WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } };
    const card = createCard(fakeHass({ weeks }), { show: ['climate.salon'] }); await settle();
    await select(card, 0);
    $(card, '.editor [data-act="delete"]').click(); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 comfort']);
    // Elsewhere on the slot: not the second click of a double click
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="0"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, clientX: 12 * 60 })); await settle();
    $(card, '.editor [data-act="delete"]').click(); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 comfort']);
  });

  test('✕ closes the editor without changing anything', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    await select(card, 1);
    $(card, '.editor [data-act="close"]').click(); await settle();
    assert.equal($(card, '.editor'), null);
    assert.ok(!unsaved(card));
  });
});

describe('double click on a slot', () => {
  test('adds a slot where the slot was clicked, without moving the next one', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    bar.querySelector('.seg[data-idx="2"]').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12 * 60 })); await settle();
    const again = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]')).querySelector('.seg[data-idx="2"]');
    again.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12 * 60 })); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(2, 5), ['08:30 eco', '12:00 eco', '17:30 comfort']);
    assert.equal(selected(card).idx, 3);
  });
});

describe('edits in progress', () => {
  test('schedules saved elsewhere do not replace unsaved edits', async () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    await cutSlot(card, 'climate.salon', 0, 12 * 60);
    const mine = day(card, 'climate.salon', 0);
    hass.push({ schedules: [{ id: 'normal', name: 'Normal' }], active_schedule: 'normal',
      weeks: { 'climate.salon': { normal: Array(7).fill([['00:00', 'frost']]) } }, overrides: {}, revision: 9 });
    assert.deepEqual(day(card, 'climate.salon', 0), mine);
    assert.equal(unsaved(card), true);
  });

  test('"Cancel" then loads what was saved elsewhere', async () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    await cutSlot(card, 'climate.salon', 0, 12 * 60);
    hass.push({ schedules: [{ id: 'normal', name: 'Normal' }], active_schedule: 'normal',
      weeks: { 'climate.salon': { normal: Array(7).fill([['00:00', 'frost']]) } }, overrides: {}, revision: 9 });
    $(card, '[data-act="cancel"]').click(); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 frost']);
  });

  test('a bar says there are unsaved changes, with Cancel and Save, and stays in sight (#39)', async () => {
    const card = createCard(fakeIntegrationHass(), { show: ['climate.salon'] }); await settle();
    assert.equal($(card, '.savebar'), null); // nothing changed: no bar, no disabled buttons
    assert.equal($(card, '[data-act="save"]'), null);
    await cutSlot(card, 'climate.salon', 0, 12 * 60);
    const bar = $(card, '.savebar');
    assert.match(bar.textContent, /Modifications non enregistrées/);
    assert.ok(bar.querySelector('[data-act="cancel"]'));
    assert.ok(bar.querySelector('[data-act="save"]'));
    // After the weeks, sticky (CSS): it stays at the bottom of the window while the card scrolls
    assert.ok(bar.compareDocumentPosition($(card, '.dgroup')) & Node.DOCUMENT_POSITION_PRECEDING);
    bar.querySelector('[data-act="cancel"]').click(); await settle();
    assert.equal($(card, '.savebar'), null);
  });
});

describe('the hint under the weeks', () => {
  test('speaks of the mouse, or of the finger on a touch screen', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    assert.match($(card, '.hint .mouse').textContent, /Clic sur un créneau pour le modifier/);
    assert.match($(card, '.hint .touch').textContent, /Toucher un créneau pour le modifier/);
  });
});

describe('thermostats shown', () => {
  test('the selection is kept for the next visit', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    $(card, '.chip[data-climate="climate.bureau"]').click(); await settle();
    document.body.innerHTML = ''; // page reloaded: localStorage is kept
    const again = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    assert.deepEqual(shown(again), ['climate.bureau']);
  });

  test('"All" shows every thermostat', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    $(card, '[data-act="show-all"]').click(); await settle();
    assert.deepEqual(shown(card), ['climate.salon', 'climate.bureau']);
  });
});

describe('presets without the thermostats\' own presets (option off)', () => {
  test('every cell is a temperature', async () => {
    const data = {
      schedules: [{ id: 'normal', name: 'Normal' }], active_schedule: 'normal', weeks: {}, overrides: {}, revision: 1,
      presets: [{ id: 'comfort', name: 'Confort', color: '#f57c00', temperature: 20 }],
      mappings: {}, targets: {}, preset_temperatures: {}, use_presets: false,
    };
    const hass = fakeIntegrationHass({ data });
    hass.states['climate.salon'].attributes.preset_modes = ['comfort'];
    const card = createView(hass, 'presets'); await settle();
    const cell = $(card, '[data-kind="thermostat"][data-preset="comfort"][data-climate="climate.salon"]');
    assert.equal(cell.querySelector('.pv-val').textContent, '20°'); // the preset's default, not the thermostat's own preset
    assert.equal(cell.querySelector('.pv-how').textContent, 'par défaut');
  });
});

describe('a tap while a menu or a popover is open', () => {
  test('with a day\'s menu open, a tap on another control only closes the menu', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false }); await settle();
    await openMenu(card, 'climate.salon', 1); await settle();
    act(card, 'history'); await settle();
    assert.equal($(card, '.menu'), null);
    assert.equal(historyShown(card), false);
  });

  test('with the menu to copy a week open, a tap on another control only closes the menu', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    act(card, 'copyweek-menu'); await settle();
    act(card, 'history'); await settle();
    assert.equal($(card, '.copyweek-menu'), null);
    assert.equal(historyShown(card), false);
  });

  test('with a schedule\'s menu open, a tap on another control only closes the menu', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    act(card, 'schedule-new'); await settle();
    act(card, 'history'); await settle();
    assert.equal($(card, '.sched-menu'), null);
    assert.equal(historyShown(card), false);
  });

  test('with a schedule\'s menu open, the arrows of the tabs scroll and leave the menu open', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    act(card, 'schedule-new'); await settle();
    $(card, '[data-tabs-scroll="right"]').click(); await settle();
    assert.ok($(card, '.sched-menu'));
  });

  test('with a slot\'s popover open, a tap on another control closes the popover and does what the control does', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle();
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click(); await settle();
    assert.ok($(card, '.editor'));
    act(card, 'history'); await settle();
    assert.equal($(card, '.editor'), null);
    assert.equal(historyShown(card), true);
  });

  test('a tap on a control of a view of the panel does not reach the element that shows the view', async () => {
    const frame = createView(fakeHass(), 'rules'); await settle();
    let reached = 0;
    frame.addEventListener('click', () => { reached += 1; });
    frame.shadowRoot.querySelector('[data-act="rule-add"]').click(); await settle();
    assert.equal(reached, 0);
  });
});

describe('the card and a push that changes something else', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());

  test('an override removed stays removed through a push that does not touch the overrides', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    hass.callWS = async (msg) => { hass.events.push(msg); return null; };
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    await openOverride(card, 'climate.salon');
    act(card, 'override-del'); await settle();
    assert.equal($(card, '.override[data-climate="climate.salon"]'), null, 'removed at once');
    hass.push(integrationData({ paused: ['climate.bureau'], overrides: { 'climate.salon': override } })); await settle();
    assert.equal($(card, '.override[data-climate="climate.salon"]'), null, 'still removed');
  });
});
