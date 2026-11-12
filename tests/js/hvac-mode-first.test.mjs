// The HVAC mode first, then the presets (#91). On a thermostat that lists more than one "on"
// HVAC mode, the slot popover and the override block have two rows: what the device does, then
// how warm. A preset is only offered in the HVAC modes it has a value for.
import { fakeHass, createCard, cleanup, integrationData, PRESETS } from './helpers.mjs';
import { serializeDay, normalize, parseDay, valueOn, presetModes, slotModeOn } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const day = (card, climate, d = 0) => serializeDay(card._week(climate)[d]);
const icons = (el) => [...el.querySelectorAll('ha-icon')].map((i) => i.getAttribute('icon'));

const SALON = 'climate.salon'; // a heater
const SUITE = 'climate.suite'; // a reversible unit that lists every HVAC mode, and takes a range
const COMBLES = 'climate.combles'; // only cools
const ALL = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'auto', 'fan_only'];
const week = (d) => Array(7).fill(d);
const DAY = ['00:00 eco', '14:00 comfort', '20:00 frost'];
// The presets as the integration stores them: a temperature when heating and one when cooling
const COOLING = { comfort: 25, eco: 27, boost: 23 };
const presets = () => PRESETS('fr').map((p) => ({ ...p, ...(p.id in COOLING ? { cool_temperature: COOLING[p.id] } : {}) }));
// What each preset means on each thermostat, as the integration says it (engine.value_on)
const both = (heat, cool) => ({ temperature: heat, cool_temperature: cool, target_temp_low: heat, target_temp_high: cool });
const TARGETS = {
  [SALON]: { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } },
  [SUITE]: { comfort: both(20, 25), eco: both(17, 27), boost: both(21, 23), frost: { temperature: 7 } },
  [COMBLES]: { comfort: { temperature: 20, cool_temperature: 25 }, eco: { temperature: 17, cool_temperature: 27 },
    boost: { temperature: 21, cool_temperature: 23 }, frost: { temperature: 7 } },
};

function setup({ suite = DAY, combles = DAY, salon = DAY, overrides, planned, targets = TARGETS, modes = ALL, features = 3 } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon) }, [SUITE]: { Normal: week(suite) }, [COMBLES]: { Normal: week(combles) } },
    overrides, planned,
  });
  data.presets = presets();
  data.targets = targets;
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SUITE] = { state: 'heat', attributes: { friendly_name: 'Suite', temperature: 20, hvac_modes: modes, supported_features: features,
    fan_modes: ['auto', 'low', 'high'] }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[SUITE] = { entity_id: SUITE };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: [SALON, SUITE, COMBLES], show: [SUITE], group_days: false, ...config });
const select = (card, climate, idx, d = 0) => { card._sel = { climate, day: d, idx }; card._render(); };
const modeRow = (card, scope = '.editor') => $$(card, `${scope} .mode-row button`).map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`);
const presetRow = (card, scope = '.editor') => $$(card, `${scope} .presets button`).map((b) => `${text(b)}${b.classList.contains('on') ? ' ✓' : ''}`);
const mode = (card, m, scope = '.editor') => click(card, `${scope} .mode-row [data-mode="${m}"]`);
const seg = (card, climate, idx, d = 0) => $(card, `.bar[data-climate="${climate}"][data-day="${d}"] .seg[data-idx="${idx}"]`);

afterEach(() => cleanup());

describe('the slot popover says the HVAC mode first, then the presets', () => {
  test('the first row lists the HVAC modes of the thermostat, in a fixed order', () => {
    const card = cardOf(setup());
    select(card, SUITE, 1);
    assert.deepEqual(modeRow(card), ['Arrêt', 'Chauffe ✓', 'Clim', 'Chauffe/Clim', 'Déshum.', 'Auto', 'Ventilation']);
    assert.equal($(card, '.editor .mode-row').getAttribute('aria-label'), 'Mode HVAC');
  });

  test('each HVAC mode has Home Assistant\'s icon, and the chosen one Home Assistant\'s color', () => {
    const card = cardOf(setup({ suite: ['00:00 eco', ['14:00', 'comfort', { hvac_mode: 'cool' }]] }));
    select(card, SUITE, 1);
    assert.deepEqual(icons($(card, '.editor .mode-row')),
      ['mdi:power', 'mdi:fire', 'mdi:snowflake', 'mdi:sun-snowflake-variant', 'mdi:water-percent', 'mdi:thermostat-auto', 'mdi:fan']);
    assert.match($(card, '.editor .mode-row [data-mode="cool"]').getAttribute('style'), /--state-climate-cool-color/);
    assert.equal($(card, '.editor .mode-row [data-mode="heat"]').getAttribute('style'), null);
    // The label is an element of its own: the icon and the label are laid out by the button
    assert.equal($(card, '.editor .mode-row [data-mode="cool"] span').textContent, 'Clim');
  });

  test('the second row lists the presets that have a value for the HVAC mode: no frost protection when cooling', () => {
    const card = cardOf(setup());
    select(card, SUITE, 1);
    assert.deepEqual(presetRow(card), ['Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
    mode(card, 'cool');
    assert.deepEqual(presetRow(card), ['Éco', 'Confort ✓', 'Boost']);
    assert.equal(day(card, SUITE)[1], '14:00 comfort {"hvac_mode":"cool"}');
  });

  test('a slot whose preset has no value for the HVAC mode chosen takes one that has', () => {
    const card = cardOf(setup());
    select(card, SUITE, 2); // frost protection
    mode(card, 'cool');
    assert.equal(day(card, SUITE)[2], '20:00 comfort {"hvac_mode":"cool"}');
  });

  test('dry and auto have no preset and no setpoint, and still set the fan', () => {
    const card = cardOf(setup());
    select(card, SUITE, 1);
    mode(card, 'dry');
    assert.equal(day(card, SUITE)[1], '14:00 - {"hvac_mode":"dry"}');
    assert.deepEqual(modeRow(card).filter((m) => m.endsWith('✓')), ['Déshum. ✓']);
    assert.equal($(card, '.editor .presets'), null);
    assert.equal($(card, '.editor .slot-setpoint'), null);
    assert.ok($(card, '.editor details.more [data-slot-setting="fan_mode"]'));
    mode(card, 'auto');
    assert.equal(day(card, SUITE)[1], '14:00 - {"hvac_mode":"auto"}');
    // Back to a preset: one that keeps the slot apart from the slots around it (eco, frost)
    mode(card, 'heat');
    assert.equal(day(card, SUITE)[1], '14:00 comfort {"hvac_mode":"heat"}');
  });

  test('heat/cool takes the presets that have both temperatures, and says the range', () => {
    const card = cardOf(setup());
    select(card, SUITE, 1);
    mode(card, 'heat_cool');
    assert.equal(day(card, SUITE)[1], '14:00 comfort {"hvac_mode":"heat_cool"}');
    assert.deepEqual(presetRow(card), ['Éco', 'Confort ✓', 'Boost']);
    assert.match(text($(card, '.editor .slot-setpoint')), /20–25 °C/);
  });

  test('heat/cool is not offered on a thermostat that takes no range of temperatures', () => {
    const card = cardOf(setup({ features: 1 }));
    select(card, SUITE, 1);
    assert.ok(!modeRow(card).some((m) => m.startsWith('Chauffe/Clim')));
  });

  test('an HVAC mode no preset has a value for cannot be chosen', () => {
    const heatOnly = { ...TARGETS, [SUITE]: TARGETS[SALON] };
    const card = cardOf(setup({ targets: heatOnly }));
    select(card, SUITE, 1);
    assert.equal($(card, '.editor .mode-row [data-mode="cool"]').disabled, true);
    assert.equal($(card, '.editor .mode-row [data-mode="dry"]').disabled, false);
  });

  test('a heater keeps one row: Off, then the presets', () => {
    const card = cardOf(setup(), { show: [SALON] });
    select(card, SALON, 1);
    assert.equal($(card, '.editor .mode-row'), null);
    assert.deepEqual(presetRow(card), ['Arrêt', 'Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
  });

  test('an air conditioner that only cools has Cool chosen, and no frost protection', () => {
    const card = cardOf(setup(), { show: [COMBLES] });
    select(card, COMBLES, 1);
    assert.deepEqual(modeRow(card), ['Arrêt', 'Clim ✓', 'Ventilation']);
    assert.deepEqual(presetRow(card), ['Éco', 'Confort ✓', 'Boost']);
  });

  test('two slots in a row with the same HVAC mode and the same settings are one slot', () => {
    const dry = { hvac_mode: 'dry' };
    assert.deepEqual(serializeDay(normalize(parseDay([['00:00', 'eco'], ['10:00', null, dry], ['12:00', null, dry],
      ['14:00', null, { hvac_mode: 'dry', fan_mode: 'low' }], ['16:00', null, { hvac_mode: 'auto' }]]))),
    ['00:00 eco', '10:00 - {"hvac_mode":"dry"}', '14:00 - {"hvac_mode":"dry","fan_mode":"low"}', '16:00 - {"hvac_mode":"auto"}']);
  });
});

describe('the week and the legend', () => {
  const DAYS = ['00:00 eco', ['08:00', null, { hvac_mode: 'dry' }], ['12:00', 'comfort', { hvac_mode: 'heat_cool' }], ['18:00', null, { hvac_mode: 'auto' }]];

  test('a dry slot and an auto slot have Home Assistant\'s color and icon, with dots: not a preset\'s slot', () => {
    const card = cardOf(setup({ suite: DAYS }));
    assert.match(seg(card, SUITE, 1).getAttribute('style'), /--state-climate-dry-color.*radial-gradient/);
    assert.doesNotMatch(seg(card, SUITE, 2).getAttribute('style'), /radial-gradient/);
    assert.match($(card, '.legend .legend-off i').getAttribute('style'), /--state-climate-dry-color.*radial-gradient/);
    assert.deepEqual(icons(seg(card, SUITE, 1)), ['mdi:water-percent']);
    assert.match(seg(card, SUITE, 1).getAttribute('aria-label'), /Déshum\.$/);
    assert.match(seg(card, SUITE, 3).getAttribute('style'), /--state-climate-auto-color/);
    assert.deepEqual(icons(seg(card, SUITE, 3)), ['mdi:thermostat-auto']);
  });

  test('a heat/cool slot shows the heat color and the cool color of its preset', () => {
    const card = cardOf(setup({ suite: DAYS }));
    assert.match(seg(card, SUITE, 2).getAttribute('style'), /linear-gradient\(.*#f57c00.*#1976d2/);
    assert.deepEqual(icons(seg(card, SUITE, 2)), ['mdi:sun-snowflake-variant']);
    assert.match(seg(card, SUITE, 2).getAttribute('aria-label'), /Confort · Chauffe\/Clim$/);
  });

  test('the legend names dry and auto when a shown week has them', () => {
    const card = cardOf(setup({ suite: DAYS }));
    assert.deepEqual($$(card, '.legend .legend-off').map(text), ['Déshum.', 'Auto']);
    assert.deepEqual($$(cardOf(setup()), '.legend .legend-off').map(text), []);
  });

  test('the legend lists the presets the shown thermostats can use', () => {
    const names = (card) => $$(card, '.legend > span:not(.legend-off):not(.settings-link)').map((s) => text(s).split(' ')[0]);
    assert.deepEqual(names(cardOf(setup(), { show: [COMBLES] })), ['Éco', 'Confort', 'Boost']);
    assert.deepEqual(names(cardOf(setup(), { show: [SALON] })), ['Hors-gel', 'Éco', 'Confort', 'Boost']);
    // Frost protection heats: it has a heat color and no cool color next to an air conditioner
    const card = cardOf(setup());
    const frost = $$(card, '.legend > span').find((s) => text(s).startsWith('Hors-gel'));
    assert.ok(frost.querySelector('i.heat') && !frost.querySelector('i.cool'));
  });
});

describe('an override has the same two rows', () => {
  const sent = (hass) => hass.events.at(-1).override;
  const open = (hass) => { const card = cardOf(hass); card._overrideSel = { climate: SUITE, create: true }; card._render(); return card; };
  const PLANNED = { [SUITE]: { preset: 'comfort', hvac_mode: 'heat' } };

  test('a new override starts on the HVAC mode planned, with the presets it can use', () => {
    const card = open(setup({ planned: { [SUITE]: { preset: 'comfort', hvac_mode: 'cool' } } }));
    assert.deepEqual(modeRow(card, '.override-ed'), ['Arrêt', 'Chauffe', 'Clim ✓', 'Chauffe/Clim', 'Déshum.', 'Auto', 'Ventilation']);
    assert.deepEqual(presetRow(card, '.override-ed'), ['Éco', 'Confort', 'Boost']);
  });

  test('dry is an override on its own: no preset, no temperature', () => {
    const hass = setup({ planned: PLANNED });
    const card = open(hass);
    mode(card, 'dry', '.override-ed');
    assert.deepEqual(sent(hass).target, { hvac_mode: 'dry' });
    assert.equal(sent(hass).preset, undefined);
  });

  test('heat/cool sends the two temperatures of the preset planned', () => {
    const hass = setup({ planned: PLANNED });
    const card = open(hass);
    mode(card, 'heat_cool', '.override-ed');
    assert.deepEqual(sent(hass).target, { ...both(20, 25), hvac_mode: 'heat_cool' });
    assert.equal(sent(hass).preset, 'comfort');
  });

  test('a dry override shows its HVAC mode chosen, and neither presets nor a temperature', () => {
    const now = Date.now();
    const overrides = { [SUITE]: { target: { hvac_mode: 'dry' }, start: new Date(now - 60000).toISOString(), end: new Date(now + 3600000).toISOString() } };
    const card = cardOf(setup({ overrides, planned: PLANNED }));
    card._overrideSel = { climate: SUITE };
    card._render();
    assert.deepEqual(modeRow(card, '.override-ed').filter((m) => m.endsWith('✓')), ['Déshum. ✓']);
    assert.equal($(card, '.override-ed .presets'), null);
    assert.equal($(card, '.override-ed [data-override-temperature]'), null);
    assert.equal(text($(card, '.override-ed .override-value')), 'Déshum.');
  });

  test('a heat/cool override says its range', () => {
    const now = Date.now();
    const overrides = { [SUITE]: { target: { hvac_mode: 'heat_cool', target_temp_low: 19, target_temp_high: 24.5 },
      start: new Date(now - 60000).toISOString(), end: new Date(now + 3600000).toISOString() } };
    const card = cardOf(setup({ overrides, planned: PLANNED }));
    card._overrideSel = { climate: SUITE };
    card._render();
    assert.equal(text($(card, '.override-ed .override-value')), '19–24,5 °C');
    assert.equal($(card, '.override-ed [data-override-temperature]'), null);
  });

  test('an override that only says an HVAC mode highlights no preset', () => {
    const now = Date.now();
    const overrides = { [SUITE]: { target: { hvac_mode: 'cool' }, start: new Date(now - 60000).toISOString(), end: new Date(now + 3600000).toISOString() } };
    const summer = { ...TARGETS, [SUITE]: { ...TARGETS[SUITE], summer: { cool_temperature: 26 } } };
    const hass = setup({ overrides, planned: PLANNED, targets: summer });
    hass.data.presets.push({ id: 'summer', name: 'Été', color: '#123456', temperature: null, cool_temperature: 26 });
    const card = cardOf(hass);
    card._overrideSel = { climate: SUITE };
    card._render();
    assert.deepEqual(presetRow(card, '.override-ed'), ['Éco', 'Confort', 'Boost', 'Été']);
  });

  test('a heater keeps one row', () => {
    const card = cardOf(setup(), { show: [SALON] });
    card._overrideSel = { climate: SALON, create: true };
    card._render();
    assert.equal($(card, '.override-ed .mode-row'), null);
    assert.equal(presetRow(card, '.override-ed')[0], 'Arrêt');
  });
});

describe('the card and the integration agree on what a preset means on a thermostat', () => {
  // The cases of tests/integration/test_presets_per_hvac_mode.py
  const P = Object.fromEntries(presets().map((p) => [p.id, p]));
  const hass = (attributes) => ({ states: { [SUITE]: { state: 'heat', attributes: { hvac_modes: ALL, supported_features: 3, ...attributes } } } });
  const on = (preset, cell, attributes = {}) => valueOn(preset, cell, hass(attributes), SUITE, true);

  test('a preset without a cooling temperature is not offered in cool, even with a preset of its own', () => {
    for (const attributes of [{}, { preset_modes: ['frost', 'eco', 'comfort'] }]) {
      assert.deepEqual(presetModes(on(P.frost, null, attributes)), ['heat']);
      assert.deepEqual(presetModes(on(P.comfort, null, attributes)), ['heat', 'cool', 'heat_cool']);
    }
    assert.deepEqual(presetModes(on({ id: 'summer', temperature: null, cool_temperature: 26 }, null)), ['cool']);
  });

  test('the value set on the thermostat counts, each HVAC mode apart', () => {
    assert.deepEqual(on(P.frost, { cool_temperature: 28 }), { temperature: 7, cool_temperature: 28, target_temp_low: 7, target_temp_high: 28 });
    const own = { preset_modes: ['frost', 'eco', 'comfort'] };
    assert.deepEqual(on(P.frost, null, own), { preset_mode: 'frost' });
    const cell = on(P.comfort, { temperature: 21 }, own);
    assert.deepEqual([cell.temperature, cell.cool_preset_mode, 'preset_mode' in cell], [21, 'comfort', false]);
    assert.deepEqual(presetModes(on(P.comfort, null, { supported_features: 1 })), ['heat', 'cool']);
  });

  test('the HVAC mode of a slot on a thermostat', () => {
    const cases = [
      [null, ['off', 'heat'], null], ['heat', ['off', 'heat'], null],
      [null, ['off', 'heat', 'auto'], null], ['heat', ['off', 'heat', 'auto'], 'heat'],
      [null, ['off', 'heat', 'cool'], 'heat'], ['heat_cool', ALL, 'heat_cool'], ['heat_cool', ['off', 'heat', 'cool'], 'heat'],
      [null, ['off', 'cool', 'dry'], 'cool'], ['heat', ['off', 'cool', 'dry'], 'cool'],
      ['dry', ['off', 'heat'], 'dry'], ['auto', ALL, 'auto'],
    ];
    for (const [stored, modes, read] of cases) {
      const slot = { start: 0, preset: 'eco', ...(stored ? { settings: { hvac_mode: stored } } : {}) };
      assert.equal(slotModeOn(hass({ hvac_modes: modes }), SUITE, slot), read, `${stored} on ${modes}`);
    }
    assert.equal(slotModeOn(hass({ supported_features: 1 }), SUITE, { start: 0, preset: 'eco', settings: { hvac_mode: 'heat_cool' } }), 'heat');
  });
});

describe('the presets tab sets a temperature when heating and one when cooling', () => {
  const panel = (hass) => createCard(hass, { thermostats: [SALON, SUITE, COMBLES], view: 'presets' });

  test('a preset\'s header says both, and frost protection has no cooling temperature', () => {
    const card = panel(setup());
    const head = (id) => text($(card, `[data-kind="preset"][data-preset="${id}"]`));
    assert.match(head('comfort'), /20° par défaut.*25°/);
    assert.doesNotMatch(head('frost'), /·/);
  });

  test('the preset popover sets and clears the cooling temperature', async () => {
    const hass = setup();
    const card = panel(hass);
    click(card, '[data-kind="preset"][data-preset="comfort"]');
    const cool = $(card, '.cell-ed [data-cell-cool]');
    assert.equal(cool.value, '25');
    cool.value = '26,5';
    await card._action('cell-apply', {});
    const saved = () => Object.fromEntries(hass.events.at(-1).presets.map((p) => [p.id, p]));
    assert.equal(saved().comfort.cool_temperature, 26.5);
    assert.equal(saved().frost.cool_temperature, undefined);
    click(card, '[data-kind="preset"][data-preset="eco"]');
    $(card, '.cell-ed [data-cell-cool]').value = '';
    await card._action('cell-apply', {});
    assert.equal('cool_temperature' in saved().eco, false);
    assert.equal(saved().eco.temperature, 17);
  });

  test('the preset popover clears the heating temperature', async () => {
    const hass = setup();
    const card = panel(hass);
    click(card, '[data-kind="preset"][data-preset="boost"]');
    $(card, '.cell-ed [data-cell-temp]').value = '';
    await card._action('cell-apply', {});
    const boost = hass.events.at(-1).presets.find((p) => p.id === 'boost');
    assert.deepEqual([boost.temperature, boost.cool_temperature], [null, 23]);
  });

  test('a cell says what the thermostat gets when heating and when cooling', () => {
    const card = panel(setup());
    const cell = (climate, id) => text($(card, `[data-kind="thermostat"][data-climate="${climate}"][data-preset="${id}"] .pv-val`));
    assert.equal(cell(SUITE, 'comfort'), '20° · 25°');
    assert.equal(cell(SUITE, 'frost'), '7°');
    assert.equal(cell(COMBLES, 'frost'), '—');
    assert.equal(cell(COMBLES, 'eco'), '27°');
  });

  test('a cell says "?" for a preset of the thermostat whose temperature when cooling is not known yet', () => {
    const own = { ...TARGETS, [COMBLES]: { ...TARGETS[COMBLES], comfort: { preset_mode: 'comfort', cool_preset_mode: 'comfort' } } };
    const card = panel(setup({ targets: own }));
    assert.equal(text($(card, `[data-kind="thermostat"][data-climate="${COMBLES}"][data-preset="comfort"] .pv-val`)), '?');
    assert.match(text($(card, '.pv-note')), /^\? :/);
  });

  test('the cell popover says what an empty cooling field gives', () => {
    const card = panel(setup());
    click(card, `[data-kind="thermostat"][data-climate="${SUITE}"][data-preset="comfort"]`);
    assert.equal(text($(card, '.cell-ed .pv-cooldefault')), 'Par défaut (25°)');
    click(card, `[data-kind="thermostat"][data-climate="${SUITE}"][data-preset="frost"]`);
    assert.equal(text($(card, '.cell-ed .pv-cooldefault')), 'Pas utilisé en clim');
  });
});
