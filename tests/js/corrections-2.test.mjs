// Corrections after the second user panel (#91, corrections-2): the setpoint line of a cooling AC
// (D1), "until tomorrow" is the next morning (D2), the off slot's label and the legend of a
// thermostat's page (D4), the pause wording (D5), the two temperature rows (D6), the vane values
// in the user's language (D7).
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const OFF = { hvac_mode: 'off' };
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const NIGHT = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', ['21:00', 'eco', OFF]];
// A 2 h off slot and a 30 min off slot, for the labels of narrow segments
const SHORT_OFFS = ['00:00 eco', '06:30 comfort', ['08:30', 'eco', OFF], '10:30 comfort', ['17:30', 'eco', OFF], '18:00 comfort'];
const AC = { friendly_name: 'Atelier', current_temperature: 24, temperature: 20, preset_mode: 'comfort', preset_modes: ['eco', 'comfort', 'away', 'boost'],
  hvac_modes: ['off', 'heat', 'cool', 'fan_only'], fan_modes: ['auto', '1', '2'], swing_modes: ['auto', '1_up', 'swing', '5_down'], fan_mode: '2', swing_mode: '1_up' };

function setup({ weeks, targets, mappings, overrides, planned, locale, atelier = {} } = {}) {
  const data = integrationData({
    weeks: weeks || { 'climate.salon': { Normal: Array(7).fill(NIGHT) }, 'climate.atelier': { Normal: [['00:00 eco', ['14:00', 'comfort', { hvac_mode: 'cool' }], '20:00 eco'], ...Array(6).fill(['00:00 eco'])] } },
    overrides, planned, language: locale ? locale.language : 'fr',
  });
  data.targets = targets || {
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
    'climate.atelier': { comfort: { temperature: 20, cool_temperature: 25 }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
  };
  if (mappings) data.mappings = mappings;
  const hass = fakeHass({ data, ...(locale ? { locale } : {}) });
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

afterEach(() => cleanup());

describe('D1: the setpoint line of a cooling AC on a preset without a cooling value', () => {
  test('the default leaves the AC alone ("unchanged"); a stored device preset is sent; a cooling value is sent', () => {
    const byDefault = cardOf(setup(), { show: ['climate.atelier'] });
    select(byDefault, 'climate.atelier', 0, 0); // eco, Keep current, the AC cools
    assert.equal(text($(byDefault, '.editor .slot-setpoint')), 'Consigne : inchangée');
    const stored = cardOf(setup({ mappings: { 'climate.atelier': { eco: { preset_mode: 'eco' } } } }), { show: ['climate.atelier'] });
    select(stored, 'climate.atelier', 0, 0);
    assert.equal(text($(stored, '.editor .slot-setpoint')), 'Consigne : son préréglage Éco');
    const cooling = cardOf(setup({ mappings: { 'climate.atelier': { eco: { preset_mode: 'eco', cool_temperature: 26 } } },
      targets: { 'climate.atelier': { eco: { preset_mode: 'eco', cool_temperature: 26 } }, 'climate.salon': {} } }), { show: ['climate.atelier'] });
    select(cooling, 'climate.atelier', 0, 0);
    assert.equal(text($(cooling, '.editor .slot-setpoint')), 'Consigne : 26 °C');
  });
});

describe('D2: "until tomorrow" is the next morning', () => {
  const offOverride = { target: OFF, start: '2026-10-18T01:00:00+02:00', end: '2026-10-18T03:00:00+02:00' };
  const open = (planned, at) => {
    mock.timers.enable({ apis: ['Date'], now: new Date(at) });
    const hass = setup({ overrides: { 'climate.salon': offOverride }, planned: { 'climate.salon': { preset: 'eco', hvac_mode: null, next_preset: 'comfort', ...planned } } });
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    return card;
  };
  afterEach(() => mock.timers.reset());

  test('hidden when it is the next slot\'s instant: at 01:30 on Sunday, one button, "Jusqu\'à 08:00 (prochain créneau)"', () => {
    const card = open({ next_start: '2026-10-18T08:00:00+02:00', next_slot_end: '2026-10-18T08:00:00+02:00', next_day_slot_end: '2026-10-18T08:00:00+02:00' }, '2026-10-18T01:30:00+02:00');
    assert.equal($(card, '.override-ed [data-act="override-tomorrow"]'), null);
    assert.equal(text($(card, '.override-ed [data-act="override-next-slot"]')), 'Jusqu\'à 08:00 (prochain créneau)');
  });

  test('named by its day when it is not tomorrow: "Jusqu\'à lundi 06:30" on Saturday evening with a flat Sunday', () => {
    const card = open({ next_start: '2026-10-19T06:30:00+02:00', next_slot_end: '2026-10-17T23:00:00+02:00', next_day_slot_end: '2026-10-19T06:30:00+02:00' }, '2026-10-17T22:00:00+02:00');
    assert.equal(text($(card, '.override-ed [data-act="override-tomorrow"]')), 'Jusqu\'à lundi 06:30');
  });

  test('"Jusqu\'à demain 06:30" on a weekday evening', () => {
    const card = open({ next_start: '2026-10-13T06:30:00+02:00', next_slot_end: '2026-10-12T22:30:00+02:00', next_day_slot_end: '2026-10-13T06:30:00+02:00' }, '2026-10-12T22:00:00+02:00');
    assert.equal(text($(card, '.override-ed [data-act="override-tomorrow"]')), 'Jusqu\'à demain 06:30');
  });
});

describe('D4: the meaning of a grey slot', () => {
  test('on an off slot, "Arrêt" wins over the time; too narrow for both, the icon alone, larger', () => {
    const hass = setup({ weeks: { 'climate.salon': { Normal: Array(7).fill(SHORT_OFFS) }, 'climate.atelier': { Normal: Array(7).fill(['00:00 eco']) } } });
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] }); // two thermostats: compact thresholds
    const twoHours = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="2"]');
    assert.equal(twoHours.querySelector('.l').textContent, 'Arrêt');
    assert.equal(twoHours.querySelector('.t').textContent, '', 'the time gives way to the word');
    assert.ok(twoHours.querySelector('.t ha-icon'));
    const halfHour = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="4"]');
    assert.equal(halfHour.querySelector('.l').textContent, '');
    assert.ok(halfHour.querySelector('.t.alone ha-icon'), 'the icon alone, at 14 px');
    // An "on" slot of two hours keeps its time, as before
    const comfort = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]');
    assert.equal(comfort.querySelector('.t').textContent, '06:30');
  });

  test('a thermostat\'s page (week_only) shows the legend of the HVAC icons used', () => {
    const hass = setup();
    const card = createCard(hass, { thermostats: ['climate.salon'], week_only: true, schedule_tabs: false, panel: true });
    assert.match(text($(card, '.legend')), /Arrêt/);
    assert.ok($(card, '.legend .legend-hvac ha-icon[icon="mdi:power"]'));
    assert.equal($(card, '.legend [data-act="copyweek-menu"]'), null);
    const plain = createCard(setup({ weeks: { 'climate.salon': { Normal: Array(7).fill(WEEKDAY) } } }), { thermostats: ['climate.salon'], week_only: true, schedule_tabs: false, panel: true });
    assert.equal($(plain, '.legend'), null, 'no legend without an icon to explain');
  });
});

describe('D5: the pause wording', () => {
  test('the Thermostats page says what a paused control is', () => {
    const card = createCard(setup(), { thermostats: ['climate.salon'], view: 'thermostats' });
    assert.equal(text($(card, '.th-hint')), 'Chauffage pilote les thermostats programmés. Un thermostat au pilotage suspendu reste programmé : il garde ses semaines, mais Chauffage n\'y touche plus.');
  });
});

describe('D6: the two temperature rows', () => {
  test('on a reversible AC, the rows say Chauffage and Climatisation, each with its icon; the cell shows both icons', () => {
    const card = presetsView(setup({ mappings: { 'climate.atelier': { comfort: { temperature: 20, cool_temperature: 25 } } } }));
    const value = cell(card, 'comfort', 'climate.atelier').querySelector('.pv-val');
    assert.equal(text(value), '20° · 25°');
    assert.deepEqual([...value.querySelectorAll('ha-icon')].map((i) => i.getAttribute('icon')), ['mdi:fire', 'mdi:snowflake']);
    cell(card, 'comfort', 'climate.atelier').click();
    const label = (attr) => $(card, `.cell-ed .pv-row[data-attr="${attr}"] > span`);
    assert.equal(text(label('temperature')), 'Chauffage');
    assert.equal(label('temperature').querySelector('ha-icon').getAttribute('icon'), 'mdi:fire');
    assert.equal(text(label('cool_temperature')), 'Climatisation');
    assert.equal(label('cool_temperature').querySelector('ha-icon').getAttribute('icon'), 'mdi:snowflake');
    assert.equal($(card, '.cell-ed [data-cell-temp]').getAttribute('aria-label'), 'Température en chauffage');
    assert.equal($(card, '.cell-ed [data-cell-cool]').getAttribute('aria-label'), 'Température en climatisation');
    assert.equal($(card, '.cell-ed .pv-row[data-attr="temperature"] .pv-field ha-icon'), null, 'the icon moved before the label');
  });

  test('a heater keeps one row, "Température", without an icon', () => {
    const card = presetsView(setup());
    cell(card, 'comfort', 'climate.salon').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    const label = $(card, '.cell-ed .pv-row[data-attr="temperature"] > span');
    assert.equal(text(label), 'Température');
    assert.equal(label.querySelector('ha-icon'), null);
  });
});

describe('D7: vane values in the user\'s language', () => {
  test('the common words are translated, word by word; the rest stays', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    assert.deepEqual($$(card, '.editor [data-slot-setting="swing_mode"] option').map((o) => o.textContent), ['Garder l\'actuel', 'Auto', '1 haut', 'Oscillation', '5 bas']);
    change($(card, '.editor [data-slot-setting="swing_mode"]'), '5_down');
    assert.equal(text($(card, '.editor details.more summary')), 'Volets 5 bas');
  });

  test('in English', () => {
    const card = cardOf(setup({ locale: { language: 'en' } }), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    assert.deepEqual($$(card, '.editor [data-slot-setting="swing_mode"] option').map((o) => o.textContent), ['Keep current', 'Auto', '1 up', 'Swing', '5 down']);
  });

  test('Home Assistant\'s own name of a value comes first', () => {
    const hass = setup();
    hass.formatEntityAttributeValue = (st, attr, value) => (value === 'swing' ? 'Balancement' : value);
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    assert.deepEqual($$(card, '.editor [data-slot-setting="swing_mode"] option').map((o) => o.textContent), ['Garder l\'actuel', 'Auto', '1 haut', 'Balancement', '5 bas']);
  });
});
