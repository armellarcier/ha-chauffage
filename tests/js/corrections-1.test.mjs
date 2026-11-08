// Corrections after the first user panel (#91, scratchpad/corrections-1.md): the cooling setpoint
// of a preset's value (C1), the capture that never copies a preset (C2), On and Off that resume
// the schedule (C3), "until tomorrow" (C4), the one-time notice (C6), the window of a VTherm that
// keeps heating (C8), the slot popover's order and words (C10, C13, C14), the week view's labels
// (C11, C15), the cell popover's Default | Custom (C12), fan and vanes words (C16), numbers in the
// user's format (C17).
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const OFF = { hvac_mode: 'off' };
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const lastCall = (hass) => hass.events.at(-1);
const day = (card, climate, d) => serializeDay(card._week(climate)[d]);
const NIGHT = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', ['21:00', 'eco', OFF]];
const AC = { friendly_name: 'Atelier', current_temperature: 24, temperature: 20, preset_mode: 'comfort', preset_modes: ['eco', 'comfort', 'away', 'boost'],
  hvac_modes: ['off', 'heat', 'cool', 'fan_only'], fan_modes: ['auto', '1', '2'], swing_modes: ['auto', '1_up', 'swing'], fan_mode: '2', swing_mode: '1_up' };

function setup({ weeks, targets, mappings, overrides, planned, thermostats, atelier = {} } = {}) {
  const data = integrationData({
    weeks: weeks || { 'climate.salon': { Normal: Array(7).fill(NIGHT) }, 'climate.atelier': { Normal: [['00:00 eco', ['14:00', 'comfort', { hvac_mode: 'cool' }], '20:00 eco'], ...Array(6).fill(['00:00 eco'])] } },
    overrides, planned,
  });
  data.targets = targets || {
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
    'climate.atelier': { comfort: { temperature: 20, cool_temperature: 25 }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
  };
  if (mappings) data.mappings = mappings;
  if (thermostats) Object.assign(data.thermostats, thermostats);
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states['climate.salon'].attributes.hvac_modes = ['off', 'heat'];
  hass.states['climate.salon'].attributes.preset_modes = ['none', 'frost', 'eco', 'comfort', 'boost'];
  hass.states['climate.atelier'] = { state: 'cool', attributes: { ...AC, ...atelier }, last_updated: '1' };
  hass.entities['climate.atelier'] = { entity_id: 'climate.atelier' };
  return hass;
}
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], show: 'all', ...config });
const select = (card, climate, d, idx) => { card._sel = { climate, day: d, idx }; card._render(); };
const presetsView = (hass) => createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], view: 'presets' });
const cell = (card, preset, climate) => $(card, `[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="${climate}"]`);
const ticked = (card) => $$(card, '.cell-ed input[type=checkbox]').filter((c) => c.checked).map((c) => c.dataset.cellUse);
const thermostatCard = (hass, entity = 'climate.salon') => {
  const tc = document.createElement('chauffage-thermostat-card');
  tc.setConfig({ type: 'custom:chauffage-thermostat-card', entity });
  document.body.appendChild(tc);
  tc.hass = hass;
  return tc;
};

afterEach(() => cleanup());

describe('C1: a cooling setpoint in a preset\'s value', () => {
  test('a reversible AC\'s cell popover has two temperature rows, heating and cooling; the cell shows both', async () => {
    const hass = setup({ mappings: { 'climate.atelier': { comfort: { temperature: 20, cool_temperature: 25 } } } });
    const card = presetsView(hass);
    assert.equal(text(cell(card, 'comfort', 'climate.atelier').querySelector('.pv-val')), '20° · 25°');
    assert.equal(cell(card, 'comfort', 'climate.atelier').querySelector('.pv-val ha-icon').getAttribute('icon'), 'mdi:snowflake');
    cell(card, 'comfort', 'climate.atelier').click();
    assert.equal($(card, '.cell-ed .pv-row[data-attr="temperature"] [data-cell-temp]').getAttribute('aria-label'), 'Température en chauffage');
    assert.equal($(card, '.cell-ed .pv-row[data-attr="cool_temperature"] [data-cell-cool]').getAttribute('aria-label'), 'Température en climatisation');
    assert.deepEqual(ticked(card), ['temperature', 'cool_temperature']);
    click(card, '.cell-ed .pv-row[data-attr="cool_temperature"] [data-act="cell-step"][data-delta="0.5"]');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { temperature: 20, cool_temperature: 25.5 } });
  });

  test('a heater gets one temperature row; only a cooling setpoint shows as ❄ 25°', () => {
    const card = presetsView(setup({ mappings: { 'climate.atelier': { eco: { preset_mode: 'eco', cool_temperature: 26 } } }, targets: {
      'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
      'climate.atelier': { comfort: { temperature: 20 }, eco: { preset_mode: 'eco', cool_temperature: 26 }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } } } }));
    cell(card, 'comfort', 'climate.salon').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    assert.equal($(card, '.cell-ed .pv-row[data-attr="cool_temperature"]'), null);
    assert.equal(text(cell(card, 'eco', 'climate.atelier').querySelector('.pv-val')), '26°');
    assert.ok(cell(card, 'eco', 'climate.atelier').querySelector('.pv-val ha-icon[icon="mdi:snowflake"]'));
  });
});

describe('C2: the capture copies from the thermostat, never its preset', () => {
  test('in a cell: the setpoint of the current mode (cooling), the mode, the fan and the vanes; the preset is left alone', async () => {
    const hass = setup();
    const card = presetsView(hass);
    cell(card, 'eco', 'climate.atelier').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    assert.equal(text($(card, '.cell-ed [data-act="capture"]')), 'Copier depuis le thermostat');
    click(card, '.cell-ed [data-act="capture"]');
    assert.deepEqual(ticked(card), ['cool_temperature', 'hvac_mode', 'fan_mode', 'swing_mode']);
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '20');
    assert.equal($(card, '.cell-ed [data-cell-hvac]').value, 'cool');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { eco: { cool_temperature: 20, hvac_mode: 'cool', fan_mode: '2', swing_mode: '1_up' } });
  });

  test('a plain heater\'s slot popover has no capture; its cell popover keeps it', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1);
    assert.equal($(card, '.editor [data-act="capture"]'), null);
    const view = presetsView(setup());
    cell(view, 'comfort', 'climate.salon').click();
    click(view, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    assert.ok($(view, '.cell-ed [data-act="capture"]'));
  });
});

describe('C3, C4: an off override\'s block', () => {
  const at = '2026-10-12T10:00:00+02:00';
  const offOverride = { target: OFF, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(at) }));
  afterEach(() => mock.timers.reset());

  test('On during an "on" slot resumes the schedule; Off during an off slot too', () => {
    const hass = setup({ overrides: { 'climate.salon': offOverride }, planned: { 'climate.salon': { preset: 'eco', hvac_mode: null, next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' } } });
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    click(card, '.override-ed [data-act="override-hvac"][data-mode="on"]');
    assert.equal(lastCall(hass).override, null);
    const on = { target: { preset_mode: 'boost' }, preset: 'boost', start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const night = setup({ overrides: { 'climate.salon': on }, planned: { 'climate.salon': { preset: 'eco', hvac_mode: 'off', next_preset: 'comfort', next_start: '2026-10-13T06:30:00+02:00' } } });
    const card2 = cardOf(night, { show: ['climate.salon'] });
    click(card2, '.override[data-climate="climate.salon"]');
    click(card2, '.override-ed [data-act="override-hvac"][data-mode="off"]');
    assert.equal(lastCall(night).override, null);
  });

  test('"Until tomorrow 06:30" sets the end to tomorrow\'s first slot that changes the state; hidden when the override ends then', () => {
    const planned = { 'climate.salon': { preset: 'comfort', hvac_mode: null, next_preset: 'eco', next_start: '2026-10-12T21:00:00+02:00', next_slot_end: '2026-10-12T21:00:00+02:00', next_day_slot_end: '2026-10-13T06:30:00+02:00' } };
    const hass = setup({ overrides: { 'climate.salon': offOverride }, planned });
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    const button = $(card, '.override-ed [data-act="override-tomorrow"]');
    assert.equal(text(button), 'Jusqu\'à demain 06:30');
    button.click();
    assert.equal(lastCall(hass).override.end, '2026-10-13T06:30:00+02:00');
    assert.equal(lastCall(hass).override.ends_at, undefined);
    // Not on an "on" override, nor when the override already ends then
    const on = setup({ overrides: { 'climate.salon': { ...offOverride, target: { preset_mode: 'boost' } } }, planned });
    const card2 = cardOf(on, { show: ['climate.salon'] });
    click(card2, '.override[data-climate="climate.salon"]');
    assert.equal($(card2, '.override-ed [data-act="override-tomorrow"]'), null);
    const ends = setup({ overrides: { 'climate.salon': { ...offOverride, end: '2026-10-13T06:30:00+02:00' } }, planned });
    const card3 = cardOf(ends, { show: ['climate.salon'] });
    click(card3, '.override[data-climate="climate.salon"]');
    assert.equal($(card3, '.override-ed [data-act="override-tomorrow"]'), null);
  });
});

// C6, the one-time notice about the new off behavior: panel.test.mjs ("telling existing users")

describe('C8: a VTherm heating at the frost setpoint for its window', () => {
  test('the chip says Fenêtre ouverte · Éco, without setpoint', () => {
    const hass = setup({ thermostats: { 'climate.salon': { paused: false, revision: 7, cause: 'window' } } });
    hass.states['climate.salon'].attributes.temperature = 7;
    hass.states['climate.salon'].attributes.requested_state = { hvac_mode: 'heat', preset: 'eco', target_temperature: 17 };
    assert.equal(text($(thermostatCard(hass), '.tc-state')), 'Fenêtre ouverte · Éco');
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
    assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'fenêtre ouverte');
  });
});

describe('C10, C13, C14: the slot popover', () => {
  test('the power row comes first; an off slot labels the presets "Au rallumage"; Off clears the fan and the vanes', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    change($(card, '.editor [data-slot-setting="fan_mode"]'), '1');
    const order = $$(card, '.editor > *').map((el) => el.className.split(' ')[0]);
    assert.ok(order.indexOf('power') < order.indexOf('presets'), order.join(','));
    assert.equal($(card, '.editor .presets .when-back-on'), null);
    click(card, '.editor [data-act="hvac"][data-mode="off"]');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco {"hvac_mode":"off"}');
    assert.equal(text($(card, '.editor .presets .when-back-on')), 'Au rallumage');
    assert.equal($(card, '.editor details.more'), null);
    click(card, '.editor [data-act="hvac"][data-mode="on"]');
    assert.ok($(card, '.editor details.more'));
    assert.equal($(card, '.editor .power .unsupported'), null);
  });

  test('the HVAC select has a visible label and a clear default option', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    assert.equal(text($(card, '.editor .hvac-row > span')), 'Fonctionnement');
    assert.equal($(card, '.editor [data-slot-hvac] option').textContent, 'Garder l\'actuel');
    const cool = cardOf(setup({ targets: { 'climate.atelier': { eco: { preset_mode: 'eco', hvac_mode: 'cool' } }, 'climate.salon': {} } }), { show: ['climate.atelier'] });
    select(cool, 'climate.atelier', 0, 0);
    assert.equal($(cool, '.editor [data-slot-hvac] option').textContent, 'Climatisation (préréglage)');
  });

  test('the setpoint the slot will apply: cooling, kept, heating, or the device preset', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1); // comfort in cool: 25
    assert.equal(text($(card, '.editor .slot-setpoint')), 'Consigne : 25 °C');
    assert.equal($(card, '.editor .slot-setpoint').getAttribute('data-navigate'), '/chauffage/presets');
    select(card, 'climate.atelier', 0, 0); // eco (its own preset) while the AC cools: unchanged
    assert.equal(text($(card, '.editor .slot-setpoint')), 'Consigne : inchangée');
    const heat = cardOf(setup({ atelier: { state: 'heat' } }), { show: ['climate.atelier'] });
    heat._hass.states['climate.atelier'].state = 'heat';
    heat._render();
    select(heat, 'climate.atelier', 0, 0);
    assert.equal(text($(heat, '.editor .slot-setpoint')), 'Consigne : son préréglage Éco');
    const salon = cardOf(setup(), { show: ['climate.salon'] });
    select(salon, 'climate.salon', 0, 1);
    assert.equal(text($(salon, '.editor .slot-setpoint')), 'Consigne : son préréglage Confort');
  });
});

describe('C11, C15: the week view', () => {
  test('the HVAC icon sits on the time\'s line, the name on the next; the off strip is 3 px; the legend names the icons used', () => {
    const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
    const off = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="4"]');
    assert.ok(off.querySelector('.t ha-icon'), 'the icon in the time line');
    assert.equal(off.querySelector('.m'), null);
    assert.equal(off.querySelector('.l').textContent, 'Arrêt');
    assert.equal(off.querySelector('.strip').style.height, '3px');
    const legend = text($(card, '.legend'));
    assert.match(legend, /Climatisation/);
    assert.match(legend, /Arrêt/);
    assert.doesNotMatch(legend, /Chauffage/);
    assert.equal($$(card, '.legend .legend-hvac ha-icon').length, 2);
  });
});

describe('C12: the cell popover opens on Default or Custom', () => {
  test('nothing stored: Default chosen, one read-only line, OK saves nothing; Custom shows the boxes prefilled from the default', async () => {
    const hass = setup();
    const card = presetsView(hass);
    cell(card, 'comfort', 'climate.salon').click();
    assert.equal($(card, '.cell-ed [data-act="cell-mode"][data-mode="default"]').getAttribute('aria-pressed'), 'true');
    assert.equal(text($(card, '.cell-ed .pv-defaultline')), 'Par défaut : son préréglage Confort');
    assert.equal($(card, '.cell-ed .pv-row'), null);
    assert.equal($(card, '.cell-ed [data-act="cell-reset"]'), null);
    await card._action('cell-apply', {});
    assert.equal(hass.events.some((e) => e.type === 'chauffage/mapping/set'), false);
    cell(card, 'comfort', 'climate.salon').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    assert.deepEqual(ticked(card), ['preset_mode']);
    assert.equal(text($(card, '.cell-ed .pv-row[data-attr="preset_mode"] > span')), 'Préréglage de l\'appareil');
    const box = $(card, '.cell-ed input[data-cell-use="preset_mode"]');
    box.checked = false;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.ok($(card, '.cell-ed [data-act="cell-apply"]').disabled);
    assert.equal(text($(card, '.cell-ed .pv-need')), 'Cochez au moins un réglage.');
  });

  test('a stored value opens on Custom; Default then OK drops it', async () => {
    const hass = setup({ mappings: { 'climate.salon': { frost: { temperature: 8 } } } });
    const card = presetsView(hass);
    cell(card, 'frost', 'climate.salon').click();
    assert.equal($(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(ticked(card), ['temperature']);
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="default"]');
    assert.equal(text($(card, '.cell-ed .pv-defaultline')), 'Par défaut : son préréglage Hors-gel');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass), { type: 'chauffage/mapping/set', entity_id: 'climate.salon', mapping: {} });
  });
});

describe('C16, C17: words and numbers', () => {
  test('short names of our own for the fan and the vanes, readable values, a summary that is a button', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    assert.deepEqual($$(card, '.editor .more-row > span').map(text), ['Ventilation', 'Volets']);
    assert.deepEqual($$(card, '.editor [data-slot-setting="swing_mode"] option').map((o) => o.textContent), ['Garder l\'actuel', 'Auto', '1 up', 'Swing']);
    change($(card, '.editor [data-slot-setting="swing_mode"]'), '1_up');
    assert.equal(text($(card, '.editor details.more summary')), 'Volets 1 up');
    assert.ok($(card, '.editor details.more summary ha-icon[icon="mdi:chevron-down"]'));
  });

  test('temperature fields show the user\'s decimal separator, and read both', async () => {
    const hass = setup({ mappings: { 'climate.salon': { frost: { temperature: 8.5 } } } });
    const card = presetsView(hass);
    cell(card, 'frost', 'climate.salon').click();
    const field = $(card, '.cell-ed [data-cell-temp]');
    assert.equal(field.value, '8,5');
    assert.equal(field.getAttribute('inputmode'), 'decimal');
    field.value = '9,5';
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 9.5 } });
    cell(card, 'frost', 'climate.salon').click();
    $(card, '.cell-ed [data-cell-temp]').value = '10.5';
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 10.5 } });
  });

  test('the override block\'s temperature field too', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') });
    try {
      const hass = setup({ overrides: { 'climate.salon': { target: { temperature: 21.5 }, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' } } });
      const card = cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]');
      const field = $(card, '.override-ed [data-override-temperature]');
      assert.equal(field.value, '21,5');
      change(field, '22,5');
      assert.deepEqual(lastCall(hass).override.target, { temperature: 22.5 });
    } finally { mock.timers.reset(); }
  });
});
