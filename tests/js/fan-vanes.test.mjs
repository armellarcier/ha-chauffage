// The fan and the vanes of a reversible air conditioner (#91, lot 3), on a slot and on a preset's
// value, and "Copy from the thermostat", which fills the popover of a preset's value from the
// thermostat's current state.
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, afterEach } from 'node:test';
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

function setup({ weeks, mappings, locale, atelier = {} } = {}) {
  const data = integrationData({ weeks: weeks || { 'climate.salon': { Normal: Array(7).fill(WEEKDAY) }, 'climate.atelier': { Normal: [QUIET, QUIET, QUIET, QUIET, QUIET, WEEKEND, WEEKEND] } },
    language: locale ? locale.language : 'fr' });
  data.targets = {
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
    'climate.atelier': { comfort: { preset_mode: 'comfort', fan_mode: '3' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
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

afterEach(() => cleanup());

describe('fan and vanes on a slot', () => {
  test('an air conditioner\'s slot popover folds the fan and swing settings under "More settings"; a heater has none', () => {
    const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
    select(card, 'climate.atelier', 0, 0); // 00:00 eco, nothing set
    const more = $(card, '.editor details.more');
    assert.equal(text(more.querySelector('summary')), 'Plus de réglages');
    assert.equal(more.open, false);
    assert.deepEqual($$(card, '.editor details.more select').map((s) => s.dataset.slotSetting), ['fan_mode', 'swing_mode', 'swing_horizontal_mode']);
    assert.deepEqual($$(card, '.editor [data-slot-setting="fan_mode"] option').map((o) => `${o.value}:${o.textContent}`), [':Ne pas changer', 'auto:Auto', '1:1', '2:2', '3:3']);
    select(card, 'climate.salon', 0, 1);
    assert.equal($(card, '.editor details.more'), null);
  });

  test('a setting chosen is written on the slot; "Don\'t change" removes it; the summary lists the values set, and opens by itself', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    change($(card, '.editor [data-slot-setting="fan_mode"]'), '2');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco {"fan_mode":"2"}');
    assert.equal(text($(card, '.editor details.more summary')), 'Ventilateur 2');
    assert.equal($(card, '.editor details.more').open, true);
    change($(card, '.editor [data-slot-setting="fan_mode"]'), '');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco');
    select(card, 'climate.atelier', 0, 1); // 14:00: fan 1, swing
    assert.equal(text($(card, '.editor details.more summary')), 'Ventilateur 1 · Volets Oscillation');
  });

  test('the default option names the value the preset\'s value sets', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1); // comfort means fan 3 on this AC
    assert.equal($(card, '.editor [data-slot-setting="fan_mode"] option').textContent, '3 (préréglage)');
  });

  test('the week shows a fan on the slots that set the fan or the vanes, at any width, and their title says the values', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    const seg = (idx) => $(card, `.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="${idx}"]`);
    assert.equal(seg(1).querySelector('.t ha-icon.air').getAttribute('icon'), 'mdi:fan');
    assert.match(seg(1).title, /Confort · Ventilateur 1 · Volets Oscillation$/);
    assert.equal(seg(0).querySelector('ha-icon'), null);
    // A slot too narrow for its time and its name keeps the marker
    card._week('climate.atelier')[0] = [{ start: 0, preset: 'eco' }, { start: 840, preset: 'comfort', settings: { fan_mode: '1' } }, { start: 870, preset: 'eco' }];
    card._render();
    assert.equal(text(seg(1)), '');
    assert.ok(seg(1).querySelector('.t.alone ha-icon.air'));
  });

  test('short names of our own for the fan and the vanes, and a summary that is a button', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    assert.deepEqual($$(card, '.editor .more-row > span').map(text), ['Ventilateur', 'Volets', 'Volets horizontaux']);
    assert.ok($(card, '.editor details.more summary ha-icon[icon="mdi:chevron-down"]'));
  });

  test('the values of the vanes read in the user\'s language, word by word; the rest stays', () => {
    const options = (card) => $$(card, '.editor [data-slot-setting="swing_mode"] option').map((o) => o.textContent);
    const card = cardOf(setup({ atelier: { swing_modes: ['auto', '1_up', 'swing', '5_down'] } }), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    assert.deepEqual(options(card), ['Ne pas changer', 'Auto', '1 haut', 'Oscillation', '5 bas']);
    change($(card, '.editor [data-slot-setting="swing_mode"]'), '5_down');
    assert.equal(text($(card, '.editor details.more summary')), 'Volets 5 bas');
    cleanup();
    const english = cardOf(setup({ atelier: { swing_modes: ['auto', '1_up', 'swing', '5_down'] }, locale: { language: 'en' } }), { show: ['climate.atelier'] });
    select(english, 'climate.atelier', 0, 0);
    assert.deepEqual(options(english), ['Don’t change', 'Auto', '1 up', 'Swing', '5 down']);
  });

  test('Home Assistant\'s own name of a value comes first', () => {
    const hass = setup();
    hass.formatEntityAttributeValue = (st, attr, value) => (value === 'swing' ? 'Balancement' : value);
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0);
    assert.deepEqual($$(card, '.editor [data-slot-setting="swing_mode"] option').map((o) => o.textContent), ['Ne pas changer', 'Auto', '1 haut', 'Balancement']);
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

  test('the cell shows one icon for any fan or swing setting; its popover folds them under "More settings"', async () => {
    const hass = setup({ mappings: { 'climate.atelier': { comfort: { fan_mode: '3' } } } });
    const card = open(hass);
    assert.equal(cell(card, 'comfort', 'climate.atelier').querySelector('.pv-val ha-icon').getAttribute('icon'), 'mdi:tune-variant');
    assert.equal(cell(card, 'eco', 'climate.atelier').querySelector('.pv-val ha-icon'), null);
    cell(card, 'comfort', 'climate.atelier').click();
    const more = $(card, '.cell-ed details.more');
    assert.equal(more.open, true, 'a value is set: unfolded');
    assert.equal(text(more.querySelector('summary')), 'Ventilateur 3');
    assert.deepEqual($$(card, '.cell-ed details.more select').map((s) => s.dataset.cellSetting), ['fan_mode', 'swing_mode', 'swing_horizontal_mode']);
    assert.equal($(card, '.cell-ed [data-cell-setting="fan_mode"]').value, '3');
    assert.equal($(card, '.cell-ed [data-cell-setting="swing_mode"] option').textContent, 'Ne pas changer');
    change($(card, '.cell-ed [data-cell-setting="swing_mode"]'), '1_up');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { fan_mode: '3', swing_mode: '1_up' } }, 'with the default setpoint');
    // Folded when nothing is set
    cell(card, 'eco', 'climate.atelier').click();
    assert.equal($(card, '.cell-ed details.more').open, false);
    assert.equal(text($(card, '.cell-ed details.more summary')), 'Plus de réglages');
  });

  test('a heater has no fan or vanes', () => {
    const card = open(setup());
    cell(card, 'comfort', 'climate.salon').click();
    assert.equal($(card, '.cell-ed details.more'), null);
  });
});

describe('Copy from the thermostat, in the popover of a preset\'s value', () => {
  const open = (hass, preset = 'eco') => {
    const card = createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], view: 'presets' });
    $(card, `[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="climate.atelier"]`).click();
    return card;
  };
  const chosen = (card) => $(card, '.cell-ed input[name="cell-choice"]:checked').value;

  test('an air conditioner that cools gives its setpoint as the cooling one, its fan and its vanes, never its preset; nothing is saved before OK', async () => {
    const hass = setup();
    const card = open(hass);
    const button = $(card, '.cell-ed [data-act="capture"]');
    assert.equal(text(button), 'Copier depuis le thermostat');
    button.click();
    assert.equal(text($(card, '.cell-ed [data-act="capture"]')), 'Copié ✓');
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '20'); // the AC cools: its setpoint is the cooling one
    assert.equal($(card, '.cell-ed .pv-coolnote').hidden, true);
    assert.equal(chosen(card), 'default', 'the heating value is left alone');
    assert.equal($(card, '.cell-ed [data-cell-setting="fan_mode"]').value, '2');
    assert.equal($(card, '.cell-ed details.more').open, true);
    assert.equal(hass.events.some((e) => e.type === 'chauffage/mapping/set'), false);
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { eco: { cool_temperature: 20, fan_mode: '2', swing_mode: 'swing', swing_horizontal_mode: 'auto' } });
  });

  test('a thermostat that heats, or is off, gives its setpoint as the temperature, in the user\'s number format', () => {
    const hass = setup({ atelier: { preset_mode: 'none', temperature: 23.5 } });
    hass.states['climate.atelier'].state = 'off';
    const card = open(hass);
    click(card, '.cell-ed [data-act="capture"]');
    assert.equal(chosen(card), 'temperature');
    assert.equal($(card, '.cell-ed [data-cell-temp]').value, '23,5');
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '');
  });

  test('disabled while the thermostat is unavailable', () => {
    const hass = setup();
    hass.states['climate.atelier'].state = 'unavailable';
    const button = $(open(hass), '.cell-ed [data-act="capture"]');
    assert.ok(button.disabled);
    assert.match(text(button), /indisponible/);
  });
});
