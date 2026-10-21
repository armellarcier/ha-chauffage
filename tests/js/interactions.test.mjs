// Pointer and form interactions of the card and of the more-info block: dragging slots and
// override ends, row menu, copying a week, time fields, popovers, injection into the dialog,
// error messages.
import { fakeHass, fakeIntegrationHass, createCard, cleanup, integrationData, WEEKDAY } from './helpers.mjs';
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

  test('in the more-info block: the end time field', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    const input = el.shadowRoot.querySelector('input[data-end]');
    input.value = '09:00'; // already past today: tomorrow 09:00
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-13T07:00:00.000Z');
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

  test('a right click on a row opens it too; a click elsewhere closes it', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    const bar = $(card, '.bar[data-climate="climate.salon"][data-day="1"]');
    bar.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 50 }));
    assert.match($(card, '.menu .mh').textContent, /Mardi/);
    $(card, '.legend').click();
    assert.equal($(card, '.menu'), null);
  });
});

describe('editing a slot', () => {
  test('the "to" time field moves the end of the slot', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click(); // 06:30 → 08:30
    const end = $(card, '.editor input[data-edge="end"]');
    end.value = '09:00';
    end.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:30 comfort', '09:00 eco']);
  });

  test('the "from" time field moves its start, within its neighbors', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click();
    const start = $(card, '.editor input[data-edge="start"]');
    start.value = '09:30'; // after the slot's end (08:30): stops one step before it
    start.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(day(card, 'climate.salon', 0)[1], '08:15 comfort');
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
    const input = $(card, '.override-ed input[data-override-end]');
    input.value = '18:00';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T16:00:00.000Z');
  });

  // What the integration says each preset means on this thermostat (here: no climate presets)
  const withTargets = () => {
    const data = integrationData({ overrides: { 'climate.salon': override } });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { temperature: 17 } } };
    return fakeHass({ data });
  };

  test('a preset picked in the popover becomes the override, until the same end', () => {
    const hass = withTargets();
    const card = createCard(hass, { show: ['climate.salon'] });
    $(card, '.override[data-climate="climate.salon"]').click();
    $(card, '.override-ed .presets [data-preset="comfort"]').click();
    const sent = hass.events.at(-1);
    assert.equal(sent.type, 'chauffage/override/set');
    assert.deepEqual(sent.override, { ...override, kind: 'temperature', value: 20 });
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
    card._dirty = true;
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
    const card = createCard(hass);
    $(card, '[data-act="view"][data-view="presets"]').click();
    $(card, '[data-kind="default"][data-preset="eco"]').click();
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
  test('adds a cut where the slot was clicked', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    const bar = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]'));
    bar.querySelector('.seg[data-idx="2"]').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12 * 60 }));
    const again = geometry($(card, '.bar[data-climate="climate.salon"][data-day="0"]')).querySelector('.seg[data-idx="2"]');
    again.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12 * 60 }));
    assert.deepEqual(day(card, 'climate.salon', 0).slice(2, 4), ['08:30 eco', '12:00 comfort']);
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
    const card = createCard(hass);
    $(card, '[data-act="view"][data-view="presets"]').click();
    const cell = $(card, '[data-kind="thermostat"][data-preset="comfort"][data-climate="climate.salon"]');
    assert.equal(cell.textContent.trim(), '20°');
  });
});
