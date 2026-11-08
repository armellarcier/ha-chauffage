// A slot sets more than a preset (#91), lot 3 in the card: the fan and the vanes of a reversible
// air conditioner, on a slot and on a preset's value, and the capture button that fills a popover
// from the thermostat's current state.
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const lastCall = (hass) => hass.events.at(-1);
const day = (card, climate, d) => serializeDay(card._week(climate)[d]);
const QUIET = ['00:00 eco', ['14:00', 'comfort', { fan_mode: '1', swing_mode: 'swing' }], '20:00 eco'];
const AC = { friendly_name: 'Atelier', current_temperature: 24, temperature: 20, preset_mode: 'comfort', preset_modes: ['eco', 'comfort', 'away', 'boost'],
  hvac_modes: ['off', 'heat', 'cool', 'fan_only'], fan_modes: ['auto', '1', '2', '3'], swing_modes: ['auto', '1_up', 'swing'], swing_horizontal_modes: ['auto', 'split'],
  fan_mode: '2', swing_mode: 'swing', swing_horizontal_mode: 'auto' };

function setup({ weeks, mappings, atelier = {} } = {}) {
  const data = integrationData({ weeks: weeks || { 'climate.salon': { Normal: Array(7).fill(WEEKDAY) }, 'climate.atelier': { Normal: [QUIET, QUIET, QUIET, QUIET, QUIET, WEEKEND, WEEKEND] } } });
  data.targets = {
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
    'climate.atelier': { comfort: { preset_mode: 'comfort', fan_mode: '3' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
  };
  if (mappings) data.mappings = mappings;
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

afterEach(() => cleanup());

describe('fan and vanes on a slot', () => {
  test('an air conditioner\'s slot popover folds the fan and swing settings under "More settings"; a heater has none', () => {
    const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
    select(card, 'climate.atelier', 0, 0); // 00:00 eco, nothing set
    const more = $(card, '.editor details.more');
    assert.equal(text(more.querySelector('summary')), 'Plus de réglages');
    assert.equal(more.open, false);
    assert.deepEqual($$(card, '.editor details.more select').map((s) => s.dataset.slotSetting), ['fan_mode', 'swing_mode', 'swing_horizontal_mode']);
    assert.deepEqual($$(card, '.editor [data-slot-setting="fan_mode"] option').map((o) => `${o.value}:${o.textContent}`), [":Garder l'actuel", 'auto:Auto', '1:1', '2:2', '3:3']);
    select(card, 'climate.salon', 0, 1);
    assert.equal($(card, '.editor details.more'), null);
  });

  test('a setting chosen is written on the slot; Keep current removes it; the summary lists the values set, and opens by itself', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    change($(card, '.editor [data-slot-setting="fan_mode"]'), '2');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco {"fan_mode":"2"}');
    assert.equal(text($(card, '.editor details.more summary')), 'Ventilation 2');
    assert.equal($(card, '.editor details.more').open, true);
    change($(card, '.editor [data-slot-setting="fan_mode"]'), '');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco');
    select(card, 'climate.atelier', 0, 1); // 14:00: fan 1, swing
    assert.equal(text($(card, '.editor details.more summary')), 'Ventilation 1 · Volets Swing');
  });

  test('The default option names the value the preset\'s value sets; the week view shows no extra icon', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1); // comfort means fan 3 on this AC
    assert.equal($(card, '.editor [data-slot-setting="fan_mode"] option').textContent, '3 (préréglage)');
    assert.equal($(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="1"] ha-icon'), null);
  });

  test('the open state of "More settings" survives a redraw', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    const more = $(card, '.editor details.more');
    more.open = true;
    more.dispatchEvent(new window.Event('toggle'));
    card._render();
    assert.equal($(card, '.editor details.more').open, true);
  });

  test('a day copied to a thermostat that lists no fan loses the fan setting', () => {
    const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
    card._copyDay('climate.atelier', 0, 'others');
    assert.equal(day(card, 'climate.salon', 0)[1], '14:00 comfort');
    assert.match(text($(card, '.msg')), /réglages non pris en charge ignorés/);
  });
});

describe('fan and vanes on a preset\'s value', () => {
  const open = (hass) => createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], view: 'presets' });
  const cell = (card, preset, climate) => $(card, `[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="${climate}"]`);

  test('the cell shows one icon for any fan or swing setting; its popover has a row per attribute', async () => {
    const hass = setup({ mappings: { 'climate.atelier': { comfort: { preset_mode: 'comfort', fan_mode: '3' } } } });
    const card = open(hass);
    assert.equal(cell(card, 'comfort', 'climate.atelier').querySelector('.pv-val ha-icon').getAttribute('icon'), 'mdi:tune-variant');
    assert.equal(cell(card, 'eco', 'climate.atelier').querySelector('.pv-val ha-icon'), null);
    cell(card, 'comfort', 'climate.atelier').click();
    const rows = $$(card, '.cell-ed .pv-row').map((r) => `${r.dataset.attr}${r.querySelector('input').checked ? ' ✓' : ''}`);
    assert.deepEqual(rows, ['preset_mode ✓', 'temperature', 'cool_temperature', 'hvac_mode', 'fan_mode ✓', 'swing_mode', 'swing_horizontal_mode']);
    assert.equal($(card, '.cell-ed [data-cell-setting="fan_mode"]').value, '3');
    change($(card, '.cell-ed [data-cell-setting="swing_mode"]'), '1_up'); // ticks it
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { preset_mode: 'comfort', fan_mode: '3', swing_mode: '1_up' } });
  });

  test('a heater has no fan or swing rows', () => {
    const card = open(setup());
    cell(card, 'comfort', 'climate.salon').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    assert.deepEqual($$(card, '.cell-ed .pv-row').map((r) => r.dataset.attr), ['preset_mode', 'temperature']);
  });
});

describe('the capture button', () => {
  test('in the slot popover: fills the power row, the mode, the fan and the swings from the thermostat, staged like any edit', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    const button = $(card, '.editor [data-act="capture"]');
    assert.equal(text(button), 'Copier depuis le thermostat');
    button.click();
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco {"hvac_mode":"cool","fan_mode":"2","swing_mode":"swing","swing_horizontal_mode":"auto"}'); // what the thermostat shows
    assert.ok(card._dirty);
    assert.equal(text($(card, '.editor [data-act="capture"]')), 'Copié ✓');
  });

  test('a heater with one mode and no fan has nothing to copy: its slot popover has no capture button', () => {
    const hass = setup();
    hass.states['climate.salon'].state = 'off';
    hass.states['climate.salon'].attributes.requested_state = { hvac_mode: 'heat', preset: 'comfort', target_temperature: 20 };
    hass.entities['climate.salon'].platform = 'versatile_thermostat';
    const card = cardOf(hass, { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1);
    assert.equal($(card, '.editor [data-act="capture"]'), null);
    assert.equal($(card, '.editor [data-act="hvac"][data-mode="on"]').getAttribute('aria-pressed'), 'true');
  });

  test('a thermostat turned off gives Off', () => {
    const hass = setup({ atelier: {} });
    hass.states['climate.atelier'].state = 'off';
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    click(card, '.editor [data-act="capture"]');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco {"hvac_mode":"off","fan_mode":"2","swing_mode":"swing","swing_horizontal_mode":"auto"}');
  });

  test('disabled while the thermostat is unavailable', () => {
    const hass = setup();
    hass.states['climate.atelier'].state = 'unavailable';
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    const button = $(card, '.editor [data-act="capture"]');
    assert.ok(button.disabled);
    assert.match(text(button), /indisponible/);
  });

  test('in the cell popover: fills the setpoint of the mode the thermostat runs in, its mode, its fan and swings, never its preset, and saves nothing by itself', async () => {
    const hass = setup();
    const card = createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], view: 'presets' });
    $(card, '[data-act="cell"][data-kind="thermostat"][data-preset="eco"][data-climate="climate.atelier"]').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    click(card, '.cell-ed [data-act="capture"]');
    const ticked = $$(card, '.cell-ed input[type=checkbox]').filter((c) => c.checked).map((c) => c.dataset.cellUse);
    assert.deepEqual(ticked, ['cool_temperature', 'hvac_mode', 'fan_mode', 'swing_mode', 'swing_horizontal_mode']);
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '20'); // the AC cools: its setpoint is the cooling one
    assert.equal($(card, '.cell-ed [data-cell-hvac]').value, 'cool');
    assert.equal($(card, '.cell-ed [data-cell-setting="fan_mode"]').value, '2');
    assert.equal(hass.events.some((e) => e.type === 'chauffage/mapping/set'), false);
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { eco: { cool_temperature: 20, hvac_mode: 'cool', fan_mode: '2', swing_mode: 'swing', swing_horizontal_mode: 'auto' } });
  });

  test('in the cell popover: a thermostat off fills the heating setpoint and leaves the mode unticked', () => {
    const hass = setup({ atelier: { preset_mode: 'none', temperature: 23.5 } });
    hass.states['climate.atelier'].state = 'off';
    const card = createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], view: 'presets' });
    $(card, '[data-act="cell"][data-kind="thermostat"][data-preset="eco"][data-climate="climate.atelier"]').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    click(card, '.cell-ed [data-act="capture"]');
    const ticked = $$(card, '.cell-ed input[type=checkbox]').filter((c) => c.checked).map((c) => c.dataset.cellUse);
    assert.deepEqual(ticked, ['temperature', 'fan_mode', 'swing_mode', 'swing_horizontal_mode']);
    assert.equal($(card, '.cell-ed [data-cell-temp]').value, '23,5'); // the user's number format
  });
});
