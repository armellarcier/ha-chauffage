// The third review of the HVAC mode first (#91): an edit changes its slot only, a cut left as it
// was leaves nothing to save on an air conditioner, the override tag on the week, and the
// blocks' wording.
import { fakeHass, createCard, cleanup, integrationData, PRESETS } from './helpers.mjs';
import { serializeDay, CHIP_STYLE, STYLE as STYLE_TEXT, MORE_INFO_STYLE as MORE_INFO_STYLE_TEXT, FIELD_BOX, chipTextColor } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const day = (card, climate, d = 0, schedule) => serializeDay(card._week(climate, schedule)[d]);

const SALON = 'climate.salon'; // a heater
const SUITE = 'climate.suite'; // a reversible unit that lists every HVAC mode, and takes a range
const COMBLES = 'climate.combles'; // an air conditioner that only cools
const ALL = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'auto', 'fan_only'];
const week = (d) => Array(7).fill(d);
const DAY = ['00:00 eco', '14:00 comfort', '20:00 frost'];
const both = (heat, cool) => ({ temperature: heat, cool_temperature: cool, target_temp_low: heat, target_temp_high: cool });
const HEATS = { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } };
const TARGETS = {
  [SALON]: HEATS,
  [SUITE]: { comfort: both(20, 25), eco: both(17, 27), boost: both(21, 23), frost: { temperature: 7 } },
  [COMBLES]: { comfort: { cool_temperature: 25 }, eco: { cool_temperature: 27 }, boost: { cool_temperature: 23 } },
};
// Monday 10:00
const NOW = '2026-10-12T10:00:00+02:00';
const at = (hhmm) => `2026-10-12T${hhmm}:00+02:00`;

function setup({ suite = DAY, salon = DAY, combles = ['00:00 eco'], overrides, planned, targets = TARGETS, mappings = {} } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon), Absent: week(salon) }, [SUITE]: { Normal: week(suite) }, [COMBLES]: { Normal: week(combles) } },
    overrides, planned,
  });
  data.presets = PRESETS('fr');
  data.targets = targets;
  data.mappings = mappings;
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SALON].attributes.temperature = 17;
  hass.states[SUITE] = { state: 'heat', attributes: { friendly_name: 'Suite', temperature: 20, hvac_modes: ALL, supported_features: 3,
    fan_modes: ['auto', 'low', 'high'], swing_modes: ['off', 'vertical'] }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[SUITE] = { entity_id: SUITE };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: [SALON, SUITE, COMBLES], show: [SALON], group_days: false, ...config });
const select = (card, climate, idx, d = 0) => { card._sel = { climate, day: d, idx }; card._render(); };
const sent = (hass) => hass.events.at(-1).override;
const override = (target, more = {}) => ({ target, start: at('09:30'), end: at('11:30'), ...more });
const moreInfo = (hass, entity, embedded = false) => {
  const el = document.createElement('chauffage-moreinfo');
  if (embedded) el.setAttribute('embedded', '');
  document.body.appendChild(el);
  el.entity = entity;
  el.hass = hass;
  return el;
};
// One pixel per minute: clientX is a time of day in minutes
const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
const mouse = (el, type, clientX) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
const bar = (card, climate, d = 0) => geometry($(card, `.bar[data-climate="${climate}"][data-day="${d}"]`));
// Two taps at a time of day, on the slot running then
const doubleTap = (card, climate, minute, d = 0) => {
  for (let i = 0; i < 2; i += 1) {
    const segs = card._week(climate)[d];
    let idx = 0;
    segs.forEach((s, j) => { if (s.start <= minute) idx = j; });
    mouse(bar(card, climate, d).querySelector(`.seg[data-idx="${idx}"]`), 'click', minute);
  }
};

beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(NOW) }));
afterEach(() => { mock.timers.reset(); cleanup(); });

describe('an edit changes its slot, and no other slot', () => {
  test('Insert a slot left as it is leaves nothing to save on an air conditioner', () => {
    const card = cardOf(setup(), { show: [SUITE] });
    select(card, SUITE, 0);
    click(card, '.editor [data-act="insert"]');
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SUITE), DAY);
    assert.equal($(card, '.savebar'), null, 'nothing to save');
  });

  test('a double tap left as it is too', () => {
    const card = cardOf(setup(), { show: [SUITE] });
    doubleTap(card, SUITE, 6 * 60);
    assert.deepEqual(day(card, SUITE), ['00:00 eco', '06:00 eco', '14:00 comfort', '20:00 frost']);
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SUITE), DAY);
    assert.equal($(card, '.savebar'), null, 'nothing to save');
  });

  test('an HVAC mode tapped on a slot leaves the other slots as they were stored', () => {
    const card = cardOf(setup(), { show: [SUITE] });
    select(card, SUITE, 1);
    click(card, '.editor .mode-row [data-mode="cool"]');
    assert.deepEqual(day(card, SUITE), ['00:00 eco', '14:00 comfort {"hvac_mode":"cool"}', '20:00 frost']);
  });

  test('a preset tapped on a slot too', () => {
    const card = cardOf(setup(), { show: [SUITE] });
    select(card, SUITE, 1);
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    assert.deepEqual(day(card, SUITE), ['00:00 eco', '14:00 boost', '20:00 frost']);
  });

  test('the HVAC mode a slot already runs in changes nothing', () => {
    const card = cardOf(setup(), { show: [SUITE] });
    select(card, SUITE, 1);
    assert.ok($(card, '.editor .mode-row [data-mode="heat"].on'), 'a slot without an HVAC mode heats');
    click(card, '.editor .mode-row [data-mode="heat"]');
    assert.deepEqual(day(card, SUITE), DAY);
    assert.equal($(card, '.savebar'), null, 'nothing to save');
  });
});

describe('a piece the card cut, whose start the user moves', () => {
  test('joins its slot again when it is left like its slot: a start typed', () => {
    const card = cardOf(setup());
    doubleTap(card, SALON, 6 * 60);
    card._setEdge('start', 7 * 60, { climate: SALON, day: 0, idx: 1 });
    assert.deepEqual(day(card, SALON), ['00:00 eco', '07:00 eco', '14:00 comfort', '20:00 frost']);
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SALON), DAY);
    assert.equal($(card, '.savebar'), null, 'nothing to save');
  });

  test('a start dragged', () => {
    const card = cardOf(setup());
    doubleTap(card, SALON, 6 * 60);
    const handle = bar(card, SALON).querySelector('.handle[data-idx="1"]');
    handle.setPointerCapture = () => {};
    const pointer = (el, type, clientX) => el.dispatchEvent(Object.assign(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }), { pointerId: 1, pointerType: 'mouse' }));
    pointer(handle, 'pointerdown', 6 * 60);
    pointer(handle, 'pointermove', 8 * 60);
    pointer(handle, 'pointerup', 8 * 60);
    assert.deepEqual(day(card, SALON), ['00:00 eco', '08:00 eco', '14:00 comfort', '20:00 frost']);
    select(card, SALON, 3);
    assert.deepEqual(day(card, SALON), DAY);
  });
});

const thermostatCard = (hass, entity) => {
  const card = document.createElement('chauffage-thermostat-card');
  card.setConfig({ entity });
  document.body.appendChild(card);
  card.hass = hass;
  return card;
};
const block = (card) => card.shadowRoot.querySelector('chauffage-moreinfo').shadowRoot;
const openOverride = (hass, climate, config = {}) => {
  const card = cardOf(hass, { show: [climate], ...config });
  card._overrideSel = { climate, create: !hass.data.overrides[climate] };
  card._render();
  return card;
};

describe('a thermostat card keeps its override block unfolded after an action from it', () => {
  test('the first + sets the override, the second + is still there', () => {
    const hass = setup();
    const card = thermostatCard(hass, SALON);
    block(card).querySelector('[data-new-override]').click();
    block(card).querySelector('[data-act="override-step"][data-dir="1"]').click();
    assert.equal(sent(hass).target.temperature, 17.5);
    const change = block(card).querySelector('details.change');
    assert.equal(change.open, true);
    assert.ok(change.querySelector('[data-act="override-step"][data-dir="1"]'));
  });

  test('an override set elsewhere stays folded under Change', () => {
    const card = thermostatCard(setup({ overrides: { [SALON]: override({ temperature: 21 }) } }), SALON);
    assert.equal(block(card).querySelector('details.change').open, false);
  });
});

describe('the schedule card says to restart Home Assistant', () => {
  test('when the data of an older integration comes after the card is drawn', () => {
    const hass = fakeHass({ data: null });
    const card = createCard(hass);
    assert.ok($(card, '.loading'));
    hass.push({ ...integrationData(), version: '0.0.1' });
    assert.match(text($(card, '.missing')), /redémarrez Home Assistant/);
  });

  test('and to reload the page when the card is the older one', () => {
    const hass = fakeHass({ data: null });
    const card = createCard(hass);
    hass.push({ ...integrationData(), version: '99.0.0' });
    assert.match(text($(card, '.missing')), /rechargez la page/);
  });
});

describe('the choice that sets no fan and no vanes', () => {
  const first = (card, attr = 'fan_mode') => $(card, `.editor [data-slot-setting="${attr}"] option`).textContent;

  test('reads "the thermostat\'s own", with the fan the thermostat shows', () => {
    const hass = setup();
    hass.states[SUITE].attributes.fan_mode = 'low';
    const card = cardOf(hass, { show: [SUITE] });
    select(card, SUITE, 1);
    assert.equal(first(card), 'Celui du thermostat (Low)');
    assert.equal(first(card, 'swing_mode'), 'Celui du thermostat', 'not known: no brackets');
  });

  test('with the fan the thermostat gets back, while a slot chose another one', () => {
    const hass = setup();
    hass.states[SUITE].attributes.fan_mode = 'low';
    hass.data.thermostats[SUITE].own_settings = { fan_mode: 'high' };
    const card = cardOf(hass, { show: [SUITE] });
    select(card, SUITE, 1);
    assert.equal(first(card), 'Celui du thermostat (High)');
  });

  test('in an override too', () => {
    const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'fan_only' }) } });
    hass.states[SUITE].attributes.fan_mode = 'low';
    const card = openOverride(hass, SUITE);
    assert.equal($(card, '.override-ed [data-override-setting="fan_mode"] option').textContent, 'Celui du thermostat (Low)');
  });
});

describe('the HVAC mode an override already has, tapped again', () => {
  const fan = override({ hvac_mode: 'fan_only', fan_mode: 'high' });

  test('keeps its fan', () => {
    const hass = setup({ overrides: { [SUITE]: fan } });
    const card = openOverride(hass, SUITE);
    const before = hass.events.length;
    click(card, '.override-ed .mode-row [data-mode="fan_only"]');
    assert.ok(hass.events.slice(before).every((e) => e.override && e.override.target.fan_mode === 'high'));
  });

  test('in the more-info block too', () => {
    const hass = setup({ overrides: { [SUITE]: fan } });
    const el = moreInfo(hass, SUITE);
    const before = hass.events.length;
    el.shadowRoot.querySelector('.mode-row [data-mode="fan_only"]').click();
    assert.ok(hass.events.slice(before).every((e) => e.override && e.override.target.fan_mode === 'high'));
  });
});

describe('a time typed in a slot', () => {
  const MORNING = ['00:00 eco', '08:00 comfort', '14:00 boost'];

  test('rounded onto the start of the slot before it does not remove that slot', () => {
    const card = cardOf(setup({ salon: MORNING }));
    card._setEdge('start', 8 * 60 + 5, { climate: SALON, day: 0, idx: 2 });
    assert.deepEqual(day(card, SALON), ['00:00 eco', '08:00 comfort', '08:15 boost']);
  });

  test('typed exactly onto the start of the slot before it removes that slot', () => {
    const card = cardOf(setup({ salon: MORNING }));
    card._setEdge('start', 8 * 60, { climate: SALON, day: 0, idx: 2 });
    assert.deepEqual(day(card, SALON), ['00:00 eco', '08:00 boost']);
  });

  test('an end rounded onto the end of the slot after it does not remove that slot', () => {
    const card = cardOf(setup());
    card._setEdge('end', 19 * 60 + 55, { climate: SALON, day: 0, idx: 0 });
    assert.deepEqual(day(card, SALON), ['00:00 eco', '19:45 comfort', '20:00 frost']);
  });

  test('an end typed exactly onto the end of the slot after it removes that slot', () => {
    const card = cardOf(setup());
    card._setEdge('end', 20 * 60, { climate: SALON, day: 0, idx: 0 });
    assert.deepEqual(day(card, SALON), ['00:00 eco', '20:00 frost']);
  });
});

describe('All cool and All heat', () => {
  const MIXED = ['00:00 eco', ['06:00', 'comfort', { hvac_mode: 'heat_cool' }], ['09:00', null, { hvac_mode: 'dry' }],
    ['12:00', 'comfort', { hvac_mode: 'cool' }], ['18:00', null, { hvac_mode: 'auto' }], ['20:00', null, { hvac_mode: 'fan_only' }], ['22:00', null, { hvac_mode: 'off' }]];

  test('switch the heating and the cooling slots, and leave the others as they are', () => {
    const card = cardOf(setup({ suite: MIXED }), { show: [SUITE] });
    card._setWeekHvac(SUITE, 'cool');
    assert.deepEqual(day(card, SUITE), ['00:00 eco {"hvac_mode":"cool"}', '06:00 comfort {"hvac_mode":"heat_cool"}', '09:00 - {"hvac_mode":"dry"}',
      '12:00 comfort {"hvac_mode":"cool"}', '18:00 - {"hvac_mode":"auto"}', '20:00 - {"hvac_mode":"fan_only"}', '22:00 - {"hvac_mode":"off"}']);
    card._setWeekHvac(SUITE, 'heat');
    assert.equal(day(card, SUITE)[1], '06:00 comfort {"hvac_mode":"heat_cool"}');
    assert.equal(day(card, SUITE)[3], '12:00 comfort {"hvac_mode":"heat"}');
  });
});

describe('Off tapped for a new override while the schedule plans off', () => {
  const planned = { [SUITE]: { hvac_mode: 'off', next_slot_end: at('14:00') } };
  const idle = (hass) => { hass.states[SUITE].state = 'off'; return hass; };

  test('sets no override', () => {
    const hass = idle(setup({ planned }));
    const card = openOverride(hass, SUITE);
    const before = hass.events.length;
    click(card, '.override-ed .mode-row [data-mode="off"]');
    assert.equal(hass.events.length, before);
  });

  test('in the more-info block too', () => {
    const hass = idle(setup({ planned }));
    const el = moreInfo(hass, SUITE);
    el.shadowRoot.querySelector('[data-new-override]').click();
    const before = hass.events.length;
    el.shadowRoot.querySelector('.mode-row [data-mode="off"]').click();
    assert.equal(hass.events.length, before);
  });

  test('turns off a thermostat that is on anyway', () => {
    const hass = setup({ planned });
    const card = openOverride(hass, SUITE);
    click(card, '.override-ed .mode-row [data-mode="off"]');
    assert.deepEqual(sent(hass).target, { hvac_mode: 'off' });
  });
});

describe('the end a new override will have', () => {
  test('is one end: the one of the HVAC mode it would take', () => {
    const hass = setup({ planned: { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_slot_end: at('14:00') } } });
    const card = openOverride(hass, SUITE);
    assert.equal(text($(card, '.override-ed .end-new')), 'jusqu\'à 12:00 (2 h)');
  });
});

describe('the line of the setpoint, when the temperature of a device preset is not known', () => {
  const targets = { ...TARGETS, [SUITE]: { ...TARGETS[SUITE], comfort: { preset_mode: 'comfort' } } };

  test('keeps the button to the presets tab, without repeating the preset', () => {
    const card = cardOf(setup({ targets }), { show: [SUITE] });
    select(card, SUITE, 1);
    const line = $(card, '.editor .setpoint-line');
    assert.equal(line.querySelector('.slot-setpoint'), null);
    assert.equal(text(line), 'Régler');
  });

  test('is not there for a user who is not an administrator', () => {
    const hass = setup({ targets });
    hass.user = { is_admin: false };
    const card = cardOf(hass, { show: [SUITE] });
    card._sel = { climate: SUITE, day: 0, idx: 1 };
    card._render();
    assert.equal($(card, '.editor .setpoint-line'), null);
  });
});

describe('an override is said once', () => {
  const dry = { [SUITE]: override({ hvac_mode: 'dry' }) };

  test('the more-info dialog says its end in the block of its end', () => {
    const el = moreInfo(setup({ overrides: dry }), SUITE);
    assert.match(text(el.shadowRoot.querySelector('.status .override-value')), /Déshumidification/);
    assert.equal(el.shadowRoot.querySelector('.status .override-until'), null);
  });

  test('a thermostat card names it in its header, and says until when under it', () => {
    const card = thermostatCard(setup({ overrides: dry }), SUITE);
    assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Déshumidification/);
    const line = block(card).querySelector('.status .line');
    assert.equal(line.querySelector('.override-value'), null);
    assert.match(text(line), /^⏱ jusqu'à 11:30/);
  });

  test('a fan-only override names its fan', () => {
    const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'fan_only', fan_mode: 'high' }) } });
    const card = thermostatCard(hass, SUITE);
    assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Ventilation · High$/);
  });
});

describe('two slots alike in a row', () => {
  test('have a faded handle between them', () => {
    const card = cardOf(setup({ salon: ['00:00 eco', '06:00 eco', '14:00 comfort'] }));
    const handles = $$(card, `.bar[data-climate="${SALON}"][data-day="0"] .handle`);
    assert.deepEqual(handles.map((h) => h.classList.contains('same')), [true, false]);
    assert.match(STYLE_TEXT, /\.handle\.same::after/);
  });
});
