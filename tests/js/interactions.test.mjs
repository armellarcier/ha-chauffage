// Pointer and form interactions of the card and of the more-info block: dragging slots and
// override ends, row menu, copying a week, time fields, popovers, injection into the dialog,
// error messages.
import { fakeHass, fakeIntegrationHass, createCard, cleanup, integrationData, typeTime, pressKey, WEEKDAY } from './helpers.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const day = (card, climate, d, schedule) => serializeDay(card._week(climate, schedule)[d]);
const $ = (card, selector) => card.shadowRoot.querySelector(selector);
// One pixel per minute: clientX is a time of day in minutes
const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
const pointer = (el, type, clientX = 0) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
const override = { kind: 'temperature', value: 21.5, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };

afterEach(() => cleanup());

describe('dragging a slot boundary', () => {
  const drag = (card, toMinutes) => {
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    const handle = bar.querySelector('.handle[data-idx="1"]'); // 06:30
    pointer(handle, 'pointerdown', 390);
    pointer(handle, 'pointermove', toMinutes);
    pointer(handle, 'pointerup', toMinutes);
  };

  test('moves the time, snapped to the step', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    drag(card, 7 * 60 + 7);
    assert.equal(day(card, 'climate.salon', 0)[1], '07:00 comfort');
    assert.equal(card._dirty, true);
  });

  test('stays between the neighboring slots', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    drag(card, 23 * 60);
    assert.equal(day(card, 'climate.salon', 0)[1], '08:15 comfort'); // next slot at 08:30, step 15 min
  });

  test('a press without moving changes nothing', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    const handle = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]')).querySelector('.handle[data-idx="1"]');
    pointer(handle, 'pointerdown', 390);
    pointer(handle, 'pointerup', 390);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    assert.ok(!card._dirty);
  });
});

describe('dragging a whole slot', () => {
  // Slot 1: 06:30 → 08:30 comfort, between 00:00 eco and 08:30 eco (until 17:30)
  const drag = (card, idx, fromMinutes, toMinutes, pointerType) => {
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    const seg = bar.querySelector(`.seg[data-idx="${idx}"]`);
    const send = (type, clientX) => {
      const e = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX });
      if (pointerType) Object.defineProperty(e, 'pointerType', { value: pointerType });
      seg.dispatchEvent(e);
    };
    send('pointerdown', fromMinutes);
    send('pointermove', toMinutes);
    send('pointerup', toMinutes);
  };

  test('moves its start and its end together, snapped to the step', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    drag(card, 1, 7 * 60, 8 * 60 + 7);
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 eco', '07:30 comfort', '09:30 eco', '17:30 comfort', '22:30 eco']);
    assert.equal(card._dirty, true);
    assert.equal($(card, '.editor'), null); // a move does not open the slot's popover
  });

  test('stays between the neighboring slots, keeping its length', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    drag(card, 1, 7 * 60, 0);
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['00:15 comfort', '02:15 eco']);
    drag(card, 1, 60, 23 * 60);
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['15:15 comfort', '17:15 eco']); // next slot at 17:30
  });

  test('the first and the last slots of the day do not move', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    drag(card, 0, 3 * 60, 4 * 60);
    drag(card, 4, 23 * 60, 22 * 60);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    assert.ok(!card._dirty);
  });

  test('a tiny move is still a click: it selects the slot', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    drag(card, 1, 7 * 60, 7 * 60 + 2);
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click();
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    assert.ok($(card, '.editor'));
  });

  test('by touch, only the selected slot moves (a finger sliding over the week moves nothing)', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    drag(card, 1, 7 * 60, 8 * 60, 'touch');
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click();
    drag(card, 1, 7 * 60, 8 * 60, 'touch');
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['07:30 comfort', '09:30 eco']);
    assert.ok($(card, '.seg.sel[data-idx="1"]')); // still selected: it can slide again
  });
});

describe('dragging the end of an override', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());

  test('in the card: sets the new end', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] });
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    const handle = bar.querySelector('.override-handle');
    pointer(handle, 'pointerdown', 690);
    pointer(handle, 'pointermove', 12 * 60 + 40);
    pointer(handle, 'pointerup');
        assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T10:45:00.000Z'); // 12:45 in Paris
  });

  test('in the more-info block: sets the new end', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    const handle = el.shadowRoot.querySelector('.override-handle');
    geometry(handle.closest('.bar'));
    pointer(handle, 'pointerdown', 690);
    pointer(handle, 'pointermove', 14 * 60);
    pointer(handle, 'pointerup');
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T12:00:00.000Z');
  });

  describe('on the days the clocks change (#43)', () => {
    const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
    const sunday = (start, end) => ({ 'climate.salon': { kind: 'temperature', value: 21.5, start, end } });
    const dragInCard = (hass, toMinutes) => {
      const card = createCard(hass, { show: ['climate.salon'], group_days: false });
      const handle = geometry($(card, '.bar[data-climate="climate.salon"][data-day="6"]')).querySelector('.override-handle');
      pointer(handle, 'pointerdown');
      pointer(handle, 'pointermove', toMinutes);
      pointer(handle, 'pointerup');
    };
    const dragInMoreInfo = (hass, toMinutes) => {
      const handle = moreInfoOf(hass).shadowRoot.querySelector('.override-handle');
      geometry(handle.closest('.bar'));
      pointer(handle, 'pointerdown');
      pointer(handle, 'pointermove', toMinutes);
      pointer(handle, 'pointerup');
    };

    test('clocks back, in the card: the end dropped at 13:00 is 13:00', () => {
      at('2026-10-25T10:00:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-10-25T10:00:00+01:00', '2026-10-25T11:30:00+01:00') });
      dragInCard(hass, 13 * 60);
      assert.equal(sentEnd(hass), '2026-10-25T12:00:00.000Z');
    });

    test('clocks back, in the more-info block: the end dropped at 13:00 is 13:00', () => {
      at('2026-10-25T10:00:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-10-25T10:00:00+01:00', '2026-10-25T11:30:00+01:00') });
      dragInMoreInfo(hass, 13 * 60);
      assert.equal(sentEnd(hass), '2026-10-25T12:00:00.000Z');
    });

    // 02:00-03:00 is played twice: during the second time, 02:45 is the one still to come
    test('clocks back, in the hour played twice: the end dropped is not the 02:45 already past', () => {
      at('2026-10-25T02:20:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-10-25T02:00:00+01:00', '2026-10-25T02:40:00+01:00') });
      dragInCard(hass, 2 * 60 + 45);
      assert.equal(sentEnd(hass), '2026-10-25T01:45:00.000Z'); // 02:45 winter time
    });

    test('clocks back, in the hour played twice: the end time field is not the 02:45 already past', () => {
      at('2026-10-25T02:20:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-10-25T02:00:00+01:00', '2026-10-25T02:40:00+01:00') });
      typeTime(moreInfoOf(hass).shadowRoot.querySelector('input.time[data-end]'), '02:45');
      assert.equal(sentEnd(hass), '2026-10-25T01:45:00.000Z');
    });

    test('clocks forward, in the card: the end dropped at 13:00 is 13:00', () => {
      at('2026-03-29T10:00:00+02:00');
      const hass = fakeHass({ overrides: sunday('2026-03-29T10:00:00+02:00', '2026-03-29T11:30:00+02:00') });
      dragInCard(hass, 13 * 60);
      assert.equal(sentEnd(hass), '2026-03-29T11:00:00.000Z');
    });

    // 02:00-03:00 does not exist: the end dropped there is when the clocks went forward
    test('clocks forward, in the card: the end dropped in the hour skipped is 03:00', () => {
      at('2026-03-29T01:00:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-03-29T01:00:00+01:00', '2026-03-29T01:30:00+01:00') });
      dragInCard(hass, 2 * 60 + 30);
      assert.equal(sentEnd(hass), '2026-03-29T01:00:00.000Z'); // 03:00 summer time
    });

    test('clocks forward, in the more-info block: the end dropped in the hour skipped is 03:00', () => {
      at('2026-03-29T01:00:00+01:00');
      const hass = fakeHass({ overrides: sunday('2026-03-29T01:00:00+01:00', '2026-03-29T01:30:00+01:00') });
      dragInMoreInfo(hass, 2 * 60 + 30);
      assert.equal(sentEnd(hass), '2026-03-29T01:00:00.000Z');
    });
  });

  const moreInfoOf = (hass) => {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    return el;
  };
  const sets = (hass) => hass.events.filter((m) => m.type === 'chauffage/override/set').length;
  const sentEnd = (hass) => new Date(hass.events.at(-1).override.end).toISOString();
  const thermostatChanged = (hass) => ({ ...hass, states: { ...hass.states,
    'climate.salon': { ...hass.states['climate.salon'], last_updated: '2' } } });
  const popoverEnd = (card) => {
    $(card, '.override[data-climate="climate.salon"]').click();
    return $(card, '.override-ed input.time[data-override-end]');
  };

  test('in the more-info block: the end time field', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    typeTime(moreInfoOf(hass).shadowRoot.querySelector('input.time[data-end]'), '09:00'); // already past today: tomorrow 09:00
    assert.equal(sentEnd(hass), '2026-10-13T07:00:00.000Z');
  });

  test('the end is a time to the minute, not on the step', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    typeTime(popoverEnd(createCard(hass, { show: ['climate.salon'] })), '12:07');
    assert.equal(sentEnd(hass), '2026-10-12T10:07:00.000Z');
  });

  test('in the more-info block: the end being typed keeps its field through the redraws, and is sent on leaving it', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = moreInfoOf(hass);
    const field = el.shadowRoot.querySelector('input.time[data-end]');
    field.focus();
    field.value = '12:00';
    el.hass = thermostatChanged(hass); // the thermostat reports, the minute changes…
    assert.equal(sets(hass), 0, 'nothing sent while typing');
    assert.ok(field.isConnected, 'the field is kept');
    field.blur();
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z');
    assert.notEqual(el.shadowRoot.querySelector('input.time[data-end]'), field, 'the redraw held back is done');
  });

  test('in the card\'s popover: the end being typed keeps its field through the redraws, and is sent on leaving it', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] });
    const field = popoverEnd(card);
    field.focus();
    field.value = '12:00';
    card._render(); // every 30 s during an override
    card.hass = thermostatChanged(hass);
    assert.equal(sets(hass), 0, 'nothing sent while typing');
    assert.ok(field.isConnected, 'the field is kept');
    field.blur();
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z');
    assert.notEqual($(card, '.override-ed input.time[data-override-end]'), field, 'the redraw held back is done');
  });

  test('in the card\'s popover: Enter sends the end being typed', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const field = popoverEnd(createCard(hass, { show: ['climate.salon'] }));
    field.focus();
    field.value = '12:30';
    pressKey(field, 'Enter');
    assert.equal(sentEnd(hass), '2026-10-12T10:30:00.000Z');
  });

  test('in the card\'s popover: the end typed is sent when tapping outside the card, and the popover closes', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] });
    const field = popoverEnd(card);
    field.focus();
    field.value = '12:00';
    // As a browser does: the pointer goes down outside (the popovers close), then the field loses the focus
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, composed: true }));
    field.blur();
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z');
    assert.equal($(card, '.override-ed'), null);
  });

  test('in the card\'s popover: an override ended elsewhere while its end is typed goes once the field is left', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] });
    const field = popoverEnd(card);
    field.focus();
    hass.push(integrationData({ overrides: {} })); // resumed from another device
    assert.ok(field.isConnected, 'the field is kept');
    field.blur();
    assert.equal($(card, '.override-ed'), null);
    assert.equal($(card, '.bar .override'), null);
  });

  test('a time not whole is shown again as it was, and nothing is sent', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] });
    typeTime(popoverEnd(card), '12:');
    assert.equal(sets(hass), 0);
    assert.equal($(card, '.override-ed input.time[data-override-end]').value, '11:30');
  });

  test('the arrow keys: an hour on the hours, the step on the minutes; sent on leaving the field', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = moreInfoOf(hass);
    const field = el.shadowRoot.querySelector('input.time[data-end]'); // 11:30
    field.focus();
    field.setSelectionRange(1, 1);
    pressKey(field, 'ArrowUp');
    assert.equal(field.value, '12:30');
    field.setSelectionRange(4, 4);
    pressKey(field, 'ArrowDown');
    pressKey(field, 'ArrowDown');
    assert.equal(field.value, '12:00');
    assert.equal(sets(hass), 0, 'nothing sent at each arrow');
    field.blur();
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z');
  });

  test('on a 12 h clock, ↑ on AM moves the end 12 hours later', () => {
    const locale = { language: 'en-US', time_format: '12', number_format: 'language', first_weekday: 'language' };
    const hass = fakeHass({ locale, overrides: { 'climate.salon': override } });
    const field = moreInfoOf(hass).shadowRoot.querySelector('input.time[data-end]'); // 11:30 AM
    field.focus();
    field.setSelectionRange(6, 6);
    pressKey(field, 'ArrowUp');
    field.blur();
    assert.equal(sentEnd(hass), '2026-10-12T21:30:00.000Z'); // 11:30 PM today
  });

  test('two quick taps on a small arrow move the end by two steps', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] });
    popoverEnd(card);
    $(card, '.override-ed .time-step[data-time-step="1"]').click();
    $(card, '.override-ed .time-step[data-time-step="1"]').click(); // before the new end comes back
    assert.equal(sentEnd(hass), '2026-10-12T10:00:00.000Z'); // 12:00
  });

  test('the small arrows move the end by the step, at once', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] });
    popoverEnd(card);
    $(card, '.override-ed .time-step[data-time-step="1"]').click();
    assert.equal(sentEnd(hass), '2026-10-12T09:45:00.000Z'); // 11:45
    const el = moreInfoOf(hass);
    el.shadowRoot.querySelector('.time-step[data-time-step="-1"]').click();
    assert.equal(sentEnd(hass), '2026-10-12T09:15:00.000Z'); // 11:15
  });

  test('an end moved before now by the arrows stays a step after now, not tomorrow', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, end: '2026-10-12T10:30:00+02:00' } } });
    const field = moreInfoOf(hass).shadowRoot.querySelector('input.time[data-end]');
    field.focus();
    field.setSelectionRange(1, 1);
    pressKey(field, 'ArrowDown'); // 09:30, already past
    field.blur();
    assert.equal(sentEnd(hass), '2026-10-12T08:15:00.000Z'); // 10:15 today
  });

  test('an end in three days moved by the small arrows stays in three days', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, end: '2026-10-15T11:30:00+02:00' } } });
    moreInfoOf(hass).shadowRoot.querySelector('.time-step[data-time-step="1"]').click();
    assert.equal(sentEnd(hass), '2026-10-15T09:45:00.000Z'); // 11:45 in three days
  });
});

describe('row menu', () => {
  test('the ⋮ button opens it; "Mon–Fri" copies the day', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    card._week('climate.salon')[2] = [{ start: 0, preset: 'frost' }];
    $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="0"]').click();
    assert.ok($(card, '.menu'));
    assert.ok($(card, '.menu [data-act="paste-day"]').disabled); // empty clipboard
    $(card, '.menu [data-act="fill-weekdays"]').click();
    assert.equal($(card, '.menu'), null);
    assert.deepEqual(day(card, 'climate.salon', 2), WEEKDAY);
  });

  test('Escape closes it, as it closes the popovers', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false });
    $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="0"]').click();
    assert.ok($(card, '.menu'));
    $(card, '.menu [data-act="fill-weekdays"]').focus();
    $(card, '.menu [data-act="fill-weekdays"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    assert.equal($(card, '.menu'), null);
  });

  test('a right click on a row opens it too; a click elsewhere closes it', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false });
    const bar = $(card, '.bar[data-climate="climate.salon"][data-day="1"]');
    bar.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 50 }));
    assert.match($(card, '.menu .mh').textContent, /Mardi/);
    $(card, '.legend').click();
    assert.equal($(card, '.menu'), null);
  });

  test('it holds what can be done with the day, and opens the thermostat (#39)', () => {
    let received = null;
    const intercept = (e) => { received = e.detail.entityId; e.stopPropagation(); };
    document.addEventListener('hass-more-info', intercept);
    try {
      const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false });
      card._openMenu('climate.salon', ((new Date().getDay() + 6) % 7 + 1) % 7, 0, 0); // not today
      const acts = [...card.shadowRoot.querySelectorAll('.menu [data-act]')].map((b) => b.dataset.act);
      assert.deepEqual(acts, ['copy-day', 'paste-day', 'fill-weekdays', 'fill-weekend', 'fill-all']);
      $(card, '.menu .mh [data-more-info="climate.salon"]').click();
      assert.equal(received, 'climate.salon');
    } finally {
      document.removeEventListener('hass-more-info', intercept);
    }
  });

  test('it opens upwards when there is no room below it in the window', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false });
    const button = $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="6"]');
    // The card from 0 to 2000 px, the button at 700–728 px, a 768 px high window, a 300 px menu
    $(card, 'ha-card').getBoundingClientRect = () => ({ top: 0, bottom: 2000, left: 0, right: 800, width: 800, height: 2000 });
    button.getBoundingClientRect = () => ({ top: 700, bottom: 728, left: 760, right: 788, width: 28, height: 28 });
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList.contains('menu') ? 300 : 0; } });
    try {
      window.innerHeight = 768;
      button.click();
      assert.equal($(card, '.menu').style.top, `${700 - 4 - 300}px`);
      $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="6"]').click(); // closes it
      button.getBoundingClientRect = () => ({ top: 100, bottom: 128, left: 760, right: 788, width: 28, height: 28 });
      $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="0"]').getBoundingClientRect = button.getBoundingClientRect;
      $(card, '[data-act="menu"][data-climate="climate.salon"][data-day="0"]').click();
      assert.equal($(card, '.menu').style.top, `${128 + 4}px`);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height);
    }
  });
});

describe('editing a slot', () => {
  const editor = (card) => {
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click(); // 06:30 → 08:30
    return { start: $(card, '.editor input.time[data-edge="start"]'), end: $(card, '.editor input.time[data-edge="end"]') };
  };

  test('the "to" time field moves the end of the slot', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    typeTime(editor(card).end, '09:00');
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:30 comfort', '09:00 eco']);
  });

  test('the "from" time field moves its start, within its neighbors', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    typeTime(editor(card).start, '09:30'); // after the slot's end (08:30): stops one step before it
    assert.equal(day(card, 'climate.salon', 0)[1], '08:15 comfort');
  });

  test('Tab from the start to the end keeps the end field, and both times are applied', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    const { start, end } = editor(card);
    start.focus();
    start.value = '06:00';
    end.focus(); // Tab
    await new Promise((resolve) => setTimeout(resolve));
    assert.equal(day(card, 'climate.salon', 0)[1], '06:00 comfort');
    assert.ok(end.isConnected, 'the end field is kept');
    assert.equal(card.shadowRoot.activeElement, end);
    end.value = '09:00';
    end.blur();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:00 comfort', '09:00 eco']);
  });

  test('the small arrows move the time by the step, at once', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    editor(card);
    $(card, '.editor input.time[data-edge="end"] + .time-spin [data-time-step="1"]').click();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:30 comfort', '08:45 eco']);
  });

  test('a time off the step stays in its field, and the small arrows put it back on the step', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    card._week('climate.salon')[0][1].start = 6 * 60 + 20; // 06:20, set with another step
    card._render();
    assert.equal(editor(card).start.value, '06:20');
    $(card, '.editor input.time[data-edge="start"] + .time-spin [data-time-step="-1"]').click();
    assert.equal(day(card, 'climate.salon', 0)[1], '06:15 comfort');
  });

  test('a click outside closes the editor', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click();
    assert.ok($(card, '.editor'));
    $(card, '.legend').click();
    assert.equal($(card, '.editor'), null);
  });
});

describe('copying a week', () => {
  test('to another thermostat and schedule', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    const select = $(card, '.copyweek');
    select.value = 'climate.bureau|away';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(day(card, 'climate.bureau', 0, 'away'), WEEKDAY);
    assert.equal(card._dirty, true);
  });
});

describe('the override popover in the card', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());

  test('opens on a click; "+30 min" and the end time field', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    assert.ok($(card, '.override-ed'));
    $(card, '.override-ed [data-act="override-add"][data-min="30"]').click();
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T10:00:00.000Z');
    typeTime($(card, '.override-ed input.time[data-override-end]'), '18:00');
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T16:00:00.000Z');
  });

  // What the integration says each preset means on this thermostat (here: no climate presets)
  const withTargets = (overrides = { 'climate.salon': override }) => {
    const data = integrationData({ overrides });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { temperature: 17 } } };
    return fakeHass({ data });
  };

  test('the popover says what the thermostat goes back to at the end', () => {
    const card = createCard(withTargets(), { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    assert.match($(card, '.override-ed').textContent, /puis Éco \(planning\)/); // 11:30: the 08:30 eco slot
  });

  test('without an override, today\'s row menu sets a temporary setpoint, for the override duration', () => {
    const hass = withTargets({});
    const card = createCard(hass, { show: ['climate.salon'], group_days: false });
    card._openMenu('climate.salon', 1, 0, 0); // Tuesday: not today
    assert.equal($(card, '.menu [data-act="override-new"]'), null);
    card._openMenu('climate.salon', 0, 0, 0); // Monday: today
    $(card, '.menu [data-act="override-new"]').click();
    $(card, '.override-ed .presets [data-preset="comfort"]').click();
    const sent = hass.events.at(-1);
    assert.equal(sent.type, 'chauffage/override/set');
    assert.deepEqual(sent.override, { kind: 'temperature', value: 20, preset: 'comfort', start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('a preset picked in the popover becomes the override, until the same end', () => {
    const hass = withTargets();
    const card = createCard(hass, { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    $(card, '.override-ed .presets [data-preset="comfort"]').click();
    const sent = hass.events.at(-1);
    assert.equal(sent.type, 'chauffage/override/set');
    assert.deepEqual(sent.override, { ...override, kind: 'temperature', value: 20, preset: 'comfort' });
  });

  test('an override set to a preset shows that preset, on a thermostat without presets', () => {
    const card = createCard(withTargets({ 'climate.salon': { ...override, value: 20, preset: 'comfort' } }), { show: ['climate.salon'] });
    assert.match($(card, '.override[data-climate="climate.salon"]').title, /Confort/);
    $(card, '.override[data-climate="climate.salon"]').click();
    assert.equal($(card, '.override-ed .override-value').textContent, 'Confort');
    assert.ok($(card, '.override-ed .presets [data-preset="comfort"]').classList.contains('on'));
  });

  test('an override at a preset\'s temperature does not show that preset', () => {
    const data = integrationData({ overrides: { 'climate.salon': { ...override, value: 20 } } });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { temperature: 17 } } };
    const card = createCard(fakeHass({ data }), { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    assert.equal($(card, '.override-ed .override-value').textContent, '20 °C');
    assert.equal($(card, '.override-ed .presets .on'), null);
  });

  test('a temperature typed in the popover replaces the override\'s preset', () => {
    const hass = withTargets({ 'climate.salon': { ...override, value: 20, preset: 'comfort' } });
    const card = createCard(hass, { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    const input = $(card, '.override-ed input[data-override-temperature]');
    input.value = '22';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(hass.events.at(-1).override, { ...override, kind: 'temperature', value: 22 });
  });

  test('a temperature typed in the popover becomes the override', () => {
    const hass = withTargets();
    const card = createCard(hass, { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    const input = $(card, '.override-ed input[data-override-temperature]');
    assert.equal(input.value, '21.5');
    input.value = '22';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(hass.events.at(-1).override, { ...override, kind: 'temperature', value: 22 });
  });

  test('a temperature being typed in the popover survives a redraw of the card', () => {
    const card = createCard(withTargets(), { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    const input = $(card, '.override-ed input[data-override-temperature]');
    input.focus();
    input.value = '2';
    card._render(); // every 30 s during an override, or another thermostat's override changed
    const after = $(card, '.override-ed input[data-override-temperature]');
    assert.equal(after.value, '2');
    assert.equal(card.shadowRoot.activeElement, after);
  });

  test('with a preset, the temperature field shows the thermostat\'s setpoint, even once it answers', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, kind: 'preset', value: 'eco' } } });
    const salon = (temperature) => ({ ...hass.states['climate.salon'], attributes: { ...hass.states['climate.salon'].attributes, temperature } });
    hass.states = { ...hass.states, 'climate.salon': salon(21.5) };
    const card = createCard(hass, { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    card.hass = { ...hass, states: { ...hass.states, 'climate.salon': salon(17) } };  // the thermostat answers
    assert.equal($(card, '.override-ed input[data-override-temperature]').value, '17');
  });
});

describe('thermostat selection', () => {
  test('"Multiple" makes a click add a thermostat', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    $(card, '[data-act="multi-sel"]').click();
    $(card, '.chip[data-climate="climate.bureau"]').click();
    assert.deepEqual(card._shown, ['climate.salon', 'climate.bureau']);
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

  test('the block is added to a scheduled thermostat\'s dialog', () => {
    const { info } = dialog(fakeHass(), 'climate.salon');
    const block = info.shadowRoot.querySelector('chauffage-moreinfo');
    assert.ok(block);
    assert.equal(block.entity, 'climate.salon');
  });

  test('no block for a thermostat without a schedule, nor for other entities', () => {
    assert.equal(dialog(fakeHass(), 'climate.bureau').info.shadowRoot.querySelector('chauffage-moreinfo'), null);
    document.querySelector('home-assistant').remove();
    assert.equal(dialog(fakeHass(), 'light.kitchen').info.shadowRoot.querySelector('chauffage-moreinfo'), null);
  });

  test('with the integration', () => {
    const { info } = dialog(fakeIntegrationHass(), 'climate.salon');
    assert.ok(info.shadowRoot.querySelector('chauffage-moreinfo'));
  });
});

describe('error messages', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());
  const failing = (hass) => { hass.callWS = async () => { throw { message: 'boom' }; }; hass.callService = hass.callWS; return hass; };

  test('saving, removing an override, activating a schedule', async () => {
    const hass = failing(fakeHass({ overrides: { 'climate.salon': override } }));
    const card = createCard(hass, { show: ['climate.salon'] });
    card._split('climate.salon', 0, 12 * 60);
    await card._save();
    assert.match($(card, '.msg').textContent, /Erreur : boom/);
    assert.equal(card._dirty, true);

    await card._sendOverride('climate.salon', null);
    assert.match($(card, '.msg').textContent, /boom/);
    assert.ok(card._overrides()['climate.salon'], 'the override is shown again');

    card._schedule = 'away';
    await card._activateSchedule('away');
    assert.match($(card, '.msg').textContent, /boom/);
  });

  test('a preset change refused by the integration', async () => {
    const hass = failing(fakeIntegrationHass());
    const card = createCard(hass, { view: 'presets' });
    $(card, '[data-kind="preset"][data-preset="eco"]').click();
    await card._action('cell-apply', {});
    assert.match($(card, '.msg').textContent, /boom/);
    assert.ok($(card, '[data-panel="cell"]'), 'the panel stays open');
  });
});

describe('dashboard editor helpers', () => {
  test('the size of the card grows with the thermostats shown', () => {
    const card = createCard(fakeHass(), { show: 'all' });
    assert.equal(card.getCardSize(), 4 + 7 * 2);
  });
});

// ----- use cases found missing by the functional analysis (docs/use-cases.md) -----

describe('slot editor buttons', () => {
  const select = (card, idx) => $(card, `.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="${idx}"]`).click();

  test('"Insert a slot" splits the slot in three, the middle one in another preset', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    select(card, 2); // 08:30 → 17:30 eco
    $(card, '.editor [data-act="insert"]').click();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(2, 5), ['08:30 eco', '11:30 comfort', '14:30 eco']);
  });

  test('"Delete" removes the slot (the previous one takes its time)', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    select(card, 1); // 06:30 comfort
    $(card, '.editor [data-act="delete"]').click();
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 eco', '17:30 comfort', '22:30 eco']);
    assert.equal($(card, '.editor'), null);
  });

  test('deleting the first slot: the next one starts at midnight; a single slot cannot be deleted', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    card._week('climate.salon')[0] = [{ start: 0, preset: 'eco' }, { start: 600, preset: 'comfort' }];
    card._render();
    select(card, 0);
    $(card, '.editor [data-act="delete"]').click();
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 comfort']);
    card._lastClick = null; // not a double click
    select(card, 0);
    $(card, '.editor [data-act="delete"]').click();
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 comfort']);
  });

  test('✕ closes the editor without changing anything', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    select(card, 1);
    $(card, '.editor [data-act="close"]').click();
    assert.equal($(card, '.editor'), null);
    assert.ok(!card._dirty);
  });
});

describe('double click on a slot', () => {
  test('adds a slot where the slot was clicked, without moving the next one', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    bar.querySelector('.seg[data-idx="2"]').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12 * 60 }));
    const again = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]')).querySelector('.seg[data-idx="2"]');
    again.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12 * 60 }));
    assert.deepEqual(day(card, 'climate.salon', 0).slice(2, 5), ['08:30 eco', '12:00 boost', '17:30 comfort']);
  });
});

describe('edits in progress', () => {
  test('schedules saved elsewhere do not replace unsaved edits', () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass, { show: ['climate.salon'] });
    card._split('climate.salon', 0, 12 * 60);
    const mine = day(card, 'climate.salon', 0);
    hass.push({ schedules: [{ id: 'normal', name: 'Normal' }], active_schedule: 'normal',
      weeks: { 'climate.salon': { normal: Array(7).fill([['00:00', 'frost']]) } }, overrides: {}, revision: 9 });
    assert.deepEqual(day(card, 'climate.salon', 0), mine);
    assert.equal(card._dirty, true);
  });

  test('"Cancel" then loads what was saved elsewhere', () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass, { show: ['climate.salon'] });
    card._split('climate.salon', 0, 12 * 60);
    hass.push({ schedules: [{ id: 'normal', name: 'Normal' }], active_schedule: 'normal',
      weeks: { 'climate.salon': { normal: Array(7).fill([['00:00', 'frost']]) } }, overrides: {}, revision: 9 });
    $(card, '[data-act="cancel"]').click();
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 frost']);
  });

  test('a bar says there are unsaved changes, with Cancel and Save, and stays in sight (#39)', () => {
    const card = createCard(fakeIntegrationHass(), { show: ['climate.salon'] });
    assert.equal($(card, '.savebar'), null); // nothing changed: no bar, no disabled buttons
    assert.equal($(card, '[data-act="save"]'), null);
    card._split('climate.salon', 0, 12 * 60);
    const bar = $(card, '.savebar');
    assert.match(bar.textContent, /Modifications non enregistrées/);
    assert.ok(bar.querySelector('[data-act="cancel"]'));
    assert.ok(bar.querySelector('[data-act="save"]'));
    // After the weeks, sticky (CSS): it stays at the bottom of the window while the card scrolls
    assert.ok(bar.compareDocumentPosition($(card, '.dgroup')) & Node.DOCUMENT_POSITION_PRECEDING);
    bar.querySelector('[data-act="cancel"]').click();
    assert.equal($(card, '.savebar'), null);
  });
});

describe('the hint under the weeks', () => {
  test('speaks of the mouse, or of the finger on a touch screen', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    assert.match($(card, '.hint .mouse').textContent, /Clic sur une plage pour la modifier/);
    assert.match($(card, '.hint .touch').textContent, /Toucher une plage pour la modifier/);
  });
});

describe('thermostats shown', () => {
  test('the selection is kept for the next visit', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    $(card, '.chip[data-climate="climate.bureau"]').click();
    document.body.innerHTML = ''; // page reloaded: localStorage is kept
    const again = createCard(fakeHass(), { show: ['climate.salon'] });
    assert.deepEqual(again._shown, ['climate.bureau']);
  });

  test('"All" shows every thermostat', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    $(card, '[data-act="show-all"]').click();
    assert.deepEqual(card._shown, ['climate.salon', 'climate.bureau']);
  });
});

describe('presets without the thermostats\' own presets (option off)', () => {
  test('every cell is a temperature', () => {
    const data = {
      schedules: [{ id: 'normal', name: 'Normal' }], active_schedule: 'normal', weeks: {}, overrides: {}, revision: 1,
      presets: [{ id: 'comfort', name: 'Confort', color: '#f57c00', temperature: 20 }],
      mappings: {}, targets: {}, preset_temperatures: {}, use_presets: false,
    };
    const hass = fakeIntegrationHass({ data });
    hass.states['climate.salon'].attributes.preset_modes = ['comfort'];
    const card = createCard(hass, { view: 'presets' });
    const cell = $(card, '[data-kind="thermostat"][data-preset="comfort"][data-climate="climate.salon"]');
    assert.equal(cell.querySelector('.pv-val').textContent, '20°'); // the preset's default, not the thermostat's own preset
    assert.equal(cell.querySelector('.pv-how').textContent, 'par défaut');
  });
});
