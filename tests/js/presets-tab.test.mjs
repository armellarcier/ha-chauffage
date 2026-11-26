// The presets tab (#91): a temperature when heating and one when cooling, the cell popover, what
// a preset means on each thermostat, and colors that can be told apart and read.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, createView, valueOn } from './helpers.mjs';
import { STYLE as STYLE_TEXT, chipTextColor, coolColor, derivedCoolColor, presetModes, slotModeOn } from '../../frontend/src/index.ts';
import { $, $$, change, click, icons, text } from './houses/dom.mjs';
import { openOverride, settle } from './driver.mjs';
import { applyCell } from './driver.mjs';
import * as heaterAndAtelier from './houses/heater-and-atelier.mjs';
import * as everyHvacMode from './houses/every-hvac-mode.mjs';
import * as suiteAndValve from './houses/suite-and-valve.mjs';
import * as suiteAndCombles from './houses/suite-and-combles.mjs';
import * as atelierAndCombles from './houses/atelier-and-combles.mjs';

afterEach(() => cleanup());

// The salon, a heater (off and heat), and the atelier, a reversible air conditioner with a fan. The
// salon is off at night, and the atelier has a slot that sets the fan and the vanes.
{
  const { lastCall, setup } = heaterAndAtelier;

  describe('the presets tab', () => {
    const open = async (hass) => { const card = createView(hass, 'presets', { thermostats: ['climate.salon', 'climate.atelier'] }); await settle(); return card; };
    const cell = (card, preset, climate) => $(card, `[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="${climate}"]`);
    const rows = (card) => $$(card, '.cell-ed .pv-choices .pv-row').map((r) => `${text(r.querySelector('span'))}${r.querySelector('input[type=radio]').checked ? ' ✓' : ''}`);
    const choose = (card, value) => { const radio = $(card, `.cell-ed input[name="cell-choice"][value="${value}"]`); radio.checked = true; radio.dispatchEvent(new window.Event('change', { bubbles: true })); };
    const type = (card, selector, value) => { const field = $(card, `.cell-ed ${selector}`); field.value = value; field.dispatchEvent(new window.Event('input', { bubbles: true })); };

    test('a preset is a name, a color and a default temperature: it does not turn the thermostats off', async () => {
      const hass = setup();
      const card = await open(hass); await settle();
      assert.equal(text($(card, '[data-kind="preset"][data-preset="eco"] .pv-default')), '17° par défaut · 27°');
      click(card, '[data-kind="preset"][data-preset="eco"]'); await settle();
      assert.equal($(card, '.cell-ed .power'), null);
      assert.doesNotMatch(text($(card, '.cell-ed')), /Marche|Éteint|Fonctionnement/);
      await applyCell(card);
      assert.deepEqual(lastCall(hass).presets.find((p) => p.id === 'eco'), { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17, cool_temperature: 27 });
    });

    test('a preset has a cool color, derived from its color; the user can change it', async () => {
      const hass = setup();
      const card = await open(hass); await settle();
      click(card, '[data-kind="preset"][data-preset="eco"]'); await settle();
      const cool = () => $(card, '.cell-ed [data-cell-cool-color]');
      assert.equal(text(cool().closest('.pv-fields')).includes('Couleur en clim'), true);
      assert.equal(cool().value, derivedCoolColor('#43a047'));
      // The color changed: the cool color follows, and nothing more is stored
      change($(card, '.cell-ed [data-cell-color]'), '#ff0000'); await settle();
      assert.equal(cool().value, derivedCoolColor('#ff0000'));
      await applyCell(card);
      assert.deepEqual(lastCall(hass).presets.find((p) => p.id === 'eco'), { id: 'eco', name: 'Éco', color: '#ff0000', temperature: 17, cool_temperature: 27 });
      // A cool color of the user's own is stored, and no longer follows the color
      click(card, '[data-kind="preset"][data-preset="eco"]'); await settle();
      change(cool(), '#004488'); await settle();
      change($(card, '.cell-ed [data-cell-color]'), '#00ff00'); await settle();
      assert.equal(cool().value, '#004488');
      await applyCell(card);
      assert.deepEqual(lastCall(hass).presets.find((p) => p.id === 'eco'), { id: 'eco', name: 'Éco', color: '#00ff00', temperature: 17, cool_temperature: 27, cool_color: '#004488' });
    });

    test('a stored cool color shows in the popover and stays when another preset is saved; set back to the derived one, it is dropped', async () => {
      const hass = setup();
      hass.data.presets = hass.data.presets.map((p) => (p.id === 'eco' ? { ...p, cool_color: '#004488' } : p));
      const card = await open(hass); await settle();
      click(card, '[data-kind="preset"][data-preset="comfort"]'); await settle();
      await applyCell(card);
      assert.equal(lastCall(hass).presets.find((p) => p.id === 'eco').cool_color, '#004488');
      click(card, '[data-kind="preset"][data-preset="eco"]'); await settle();
      assert.equal($(card, '.cell-ed [data-cell-cool-color]').value, '#004488');
      change($(card, '.cell-ed [data-cell-cool-color]'), derivedCoolColor('#43a047')); await settle();
      await applyCell(card);
      assert.equal('cool_color' in lastCall(hass).presets.find((p) => p.id === 'eco'), false);
    });

    test('without a thermostat that cools, a preset shows no cool color', async () => {
      const card = createView(setup(), 'presets', { thermostats: ['climate.salon'] }); await settle();
      click(card, '[data-kind="preset"][data-preset="eco"]'); await settle();
      assert.equal($(card, '.cell-ed [data-cell-cool-color]'), null);
    });

    test('a cell asks one question: the default, its own preset, or a temperature', async () => {
      const hass = setup();
      const card = await open(hass); await settle();
      cell(card, 'comfort', 'climate.salon').click(); await settle();
      assert.deepEqual(rows(card), ['Par défaut (son préréglage Confort, 20°) ✓', 'Son préréglage', 'Température']);
      assert.equal($(card, '.cell-ed input[type=checkbox]'), null);
      assert.equal($(card, '.cell-ed [data-cell-hvac]'), null);
      assert.doesNotMatch(text($(card, '.cell-ed')), /Personnalisé|Cochez|Fonctionnement|En chauffe|En clim/);
      assert.ok($(card, '.cell-ed [data-act="capture"]'), 'Copy from the thermostat stays here');
      await applyCell(card);
      assert.equal(hass.events.some((e) => e.type === 'chauffage/mapping/set'), false, 'the default: nothing stored');
    });

    test('picking one of its presets chooses "Its preset"; the temperature\'s field chooses "Temperature"', async () => {
      const hass = setup();
      const card = await open(hass); await settle();
      cell(card, 'comfort', 'climate.salon').click(); await settle();
      change($(card, '.cell-ed [data-cell-preset]'), 'boost'); await settle();
      assert.deepEqual(rows(card), ['Par défaut (son préréglage Confort, 20°)', 'Son préréglage ✓', 'Température']);
      await applyCell(card);
      assert.deepEqual(lastCall(hass), { type: 'chauffage/mapping/set', entity_id: 'climate.salon', mapping: { comfort: { preset_mode: 'boost' } } });
      cell(card, 'comfort', 'climate.salon').click(); await settle();
      click(card, '.cell-ed [data-act="cell-step"][data-delta="0.5"]'); await settle();
      assert.deepEqual(rows(card), ['Par défaut (son préréglage Confort, 20°)', 'Son préréglage', 'Température ✓']);
      await applyCell(card);
      assert.deepEqual(lastCall(hass).mapping, { comfort: { temperature: 20.5 } }, 'a temperature, not a preset and a temperature');
      // Its own preset of the same name, chosen by hand, is the default
      cell(card, 'comfort', 'climate.salon').click(); await settle();
      choose(card, 'own'); await settle();
      hass.events.length = 0;
      await applyCell(card);
      assert.equal(hass.events.length, 0);
    });

    test('a stored value opens on its row; the default then OK drops it', async () => {
      const hass = setup();
      hass.data.mappings = { 'climate.salon': { comfort: { temperature: 19.5 }, eco: { preset_mode: 'frost' } } };
      hass.data.targets['climate.salon'].comfort = { temperature: 19.5 };
      const card = await open(hass); await settle();
      cell(card, 'eco', 'climate.salon').click(); await settle();
      assert.equal($(card, '.cell-ed [data-cell-preset]').value, 'frost');
      assert.deepEqual(rows(card).map((r) => r.endsWith('✓')), [false, true, false]);
      cell(card, 'comfort', 'climate.salon').click(); await settle();
      assert.deepEqual(rows(card).map((r) => r.endsWith('✓')), [false, false, true]);
      assert.equal($(card, '.cell-ed [data-cell-temp]').value, '19,5');
      choose(card, 'default'); await settle();
      await applyCell(card);
      assert.deepEqual(lastCall(hass).mapping, { eco: { preset_mode: 'frost' } });
      assert.equal($(card, '.cell-ed'), null);
    });

    test('an air conditioner that heats and cools: "En chauffe" over its rows, "En clim" over the same rows', async () => {
      const hass = setup();
      const card = await open(hass); await settle();
      cell(card, 'comfort', 'climate.atelier').click(); await settle();
      assert.deepEqual($$(card, '.cell-ed .pv-when').map(text), ['En chauffe', 'En clim']);
      assert.deepEqual($$(card, '.cell-ed .pv-when ha-icon').map((i) => i.getAttribute('icon')), ['mdi:fire', 'mdi:snowflake']);
      assert.equal($(card, '.cell-ed [data-cell-cool]').value, '');
      // A cooling temperature with the default when heating
      type(card, '[data-cell-cool]', '25,5'); await settle();
      await applyCell(card);
      assert.deepEqual(lastCall(hass).mapping, { comfort: { cool_temperature: 25.5 } });
      // And with a temperature when heating
      cell(card, 'comfort', 'climate.atelier').click(); await settle();
      type(card, '[data-cell-temp]', '20'); await settle();
      click(card, '.cell-ed .pv-cool [data-act="cell-step"][data-delta="0.5"]'); await settle(); // an empty field starts from 25°, never from the heating temperature
      await applyCell(card);
      assert.deepEqual(lastCall(hass).mapping, { comfort: { temperature: 20, cool_temperature: 25.5 } });
    });

    test('an empty cooling field says what the thermostat gets when cooling', async () => {
      const hass = setup();
      const card = await open(hass); await settle();
      const note = () => $(card, '.cell-ed .pv-cooldefault');
      cell(card, 'comfort', 'climate.atelier').click(); await settle(); // the default is its own preset: sent when cooling too
      assert.equal(text(note()), 'Par défaut (son préréglage Confort)');
      type(card, '[data-cell-temp]', '20'); await settle(); // a temperature when heating: when cooling, the default goes on
      assert.equal(text(note()), 'Par défaut (son préréglage Confort)');
      // A temperature typed when cooling chooses its row; the default stays in sight
      const chosen = () => $(card, '.cell-ed input[name="cell-cool-choice"]:checked').value;
      assert.equal(chosen(), 'default');
      type(card, '[data-cell-cool]', '25'); await settle();
      assert.equal(chosen(), 'temperature');
      assert.equal(text(note()), 'Par défaut (son préréglage Confort)');
      cell(card, 'frost', 'climate.atelier').click(); await settle(); // frost protection has no temperature when cooling
      assert.equal(text(note()), 'Pas utilisé en clim');
      // A thermostat without a preset of its own: the preset's temperature when cooling
      hass.states['climate.atelier'].attributes.preset_modes = [];
      cell(card, 'comfort', 'climate.atelier').click(); await settle();
      assert.equal(text(note()), 'Par défaut (25°)');
    });

    test('while the integration has not said what the default gives, the cell says nothing about it', async () => {
      const hass = setup();
      hass.presetPreviewAnswers = 'hold';
      const card = await open(hass); await settle();
      const note = () => $(card, '.cell-ed .pv-cooldefault');
      cell(card, 'eco', 'climate.salon').click(); await settle();
      assert.deepEqual(rows(card), ['Par défaut ✓', 'Son préréglage', 'Température']);
      cell(card, 'comfort', 'climate.atelier').click(); await settle();
      assert.equal(text(note()), 'Par défaut');
      // The user chooses a row while the answer is on its way: the answer still shows
      choose(card, 'temperature'); await settle();
      hass.answerPresetPreviews(); await settle(); await settle();
      assert.equal(text(note()), 'Par défaut (son préréglage Confort)');
      cell(card, 'eco', 'climate.salon').click(); await settle(); await settle();
      assert.deepEqual(rows(card), ['Par défaut (son préréglage Éco, 17°) ✓', 'Son préréglage', 'Température']);
    });

    test('a thermostat not scheduled yet: while the integration has not said what a preset gives, its cell shows no value', async () => {
      const salonOnly = { 'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } } };
      const hass = setup({ targets: salonOnly });
      hass.presetPreviewAnswers = 'hold';
      const card = await open(hass); await settle();
      assert.equal(text(cell(card, 'frost', 'climate.atelier').querySelector('.pv-val')), '');
      hass.answerPresetPreviews(); await settle(); await settle();
      assert.equal(text(cell(card, 'frost', 'climate.atelier').querySelector('.pv-val')), '7°');
    });

    test('an integration that does not answer: the cell says nothing about the default', async () => {
      const hass = setup();
      hass.presetPreviewAnswers = 'fail';
      const card = await open(hass); await settle();
      cell(card, 'eco', 'climate.salon').click(); await settle(); await settle();
      assert.deepEqual(rows(card), ['Par défaut ✓', 'Son préréglage', 'Température']);
      cell(card, 'comfort', 'climate.atelier').click(); await settle(); await settle();
      assert.equal(text($(card, '.cell-ed .pv-cooldefault')), 'Par défaut');
    });

    test('saved while the integration has not said what the default gives, the default stays the default', async () => {
      const hass = setup();
      hass.presetPreviewAnswers = 'hold';
      const card = await open(hass); await settle();
      cell(card, 'comfort', 'climate.salon').click(); await settle();
      await applyCell(card);
      assert.equal(hass.events.some((e) => e.type === 'chauffage/mapping/set'), false, 'the default: nothing stored');
      // Its own preset of the same name, chosen by hand, is the default once the integration answers
      cell(card, 'comfort', 'climate.salon').click(); await settle();
      choose(card, 'own'); await settle();
      await applyCell(card);
      hass.answerPresetPreviews(); await settle(); await settle();
      assert.equal(hass.events.some((e) => e.type === 'chauffage/mapping/set'), false, 'the default: nothing stored');
    });

    test('a cooling setpoint stored shows in its field and in the cell; with the default chosen, it is dropped', async () => {
      const hass = setup();
      hass.data.mappings = { 'climate.atelier': { comfort: { temperature: 20, cool_temperature: 25 } } };
      hass.data.targets['climate.atelier'].comfort = { temperature: 20, cool_temperature: 25 };
      const card = await open(hass); await settle();
      const shown = cell(card, 'comfort', 'climate.atelier'); await settle();
      assert.equal(text(shown.querySelector('.pv-val')), '20° · 25°');
      assert.deepEqual([...shown.querySelectorAll('.pv-val ha-icon')].map((i) => i.getAttribute('icon')), ['mdi:fire', 'mdi:snowflake']);
      shown.click(); await settle();
      assert.equal($(card, '.cell-ed [data-cell-cool]').value, '25');
      assert.equal($(card, '.cell-ed input[name="cell-cool-choice"]:checked').value, 'temperature');
      click(card, '.cell-ed input[name="cell-cool-choice"][value="default"]'); await settle();
      await applyCell(card);
      assert.deepEqual(lastCall(hass).mapping, { comfort: { temperature: 20 } });
    });

    test('a temperature that is not a number is not saved', async () => {
      const hass = setup();
      const card = await open(hass); await settle();
      cell(card, 'comfort', 'climate.salon').click(); await settle();
      type(card, '[data-cell-temp]', 'chaud'); await settle();
      await applyCell(card);
      assert.equal(hass.events.length, 0);
      assert.ok($(card, '.cell-ed'));
    });

    test('temperature fields show the user\'s decimal separator, and read both', async () => {
      const hass = setup();
      hass.data.mappings = { 'climate.salon': { frost: { temperature: 8.5 } } };
      const card = await open(hass); await settle();
      cell(card, 'frost', 'climate.salon').click(); await settle();
      const field = $(card, '.cell-ed [data-cell-temp]');
      assert.equal(field.value, '8,5');
      assert.equal(field.getAttribute('inputmode'), 'decimal');
      field.value = '9,5';
      await applyCell(card);
      assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 9.5 } });
      cell(card, 'frost', 'climate.salon').click(); await settle();
      $(card, '.cell-ed [data-cell-temp]').value = '10.5';
      await applyCell(card);
      assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 10.5 } });
    });

    test('the intro of the tab is short', async () => {
      assert.equal(text($(await open(setup()), '.pv-intro')),
        'Un préréglage est une intention (Confort, Éco…). Chaque thermostat la traduit en ses propres réglages. Choisissez un préréglage ou une case pour le modifier.');
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The presets have a cooling temperature. The card shows the
// suite.
{
  const { ALL, COMBLES, SALON, SUITE, TARGETS, presets, setup } = everyHvacMode;

  describe('the presets tab sets a temperature when heating and one when cooling', () => {
    const panel = async (hass) => { const card = createView(hass, 'presets', { thermostats: [SALON, SUITE, COMBLES] }); await settle(); return card; };

    test('a preset\'s header says both, and frost protection has no cooling temperature', async () => {
      const card = await panel(setup());
      const head = (id) => text($(card, `[data-kind="preset"][data-preset="${id}"]`));
      assert.match(head('comfort'), /20° par défaut.*25°/);
      assert.doesNotMatch(head('frost'), /·/);
    });

    test('the preset popover sets and clears the cooling temperature', async () => {
      const hass = setup();
      const card = await panel(hass);
      click(card, '[data-kind="preset"][data-preset="comfort"]'); await settle();
      const cool = $(card, '.cell-ed [data-cell-cool]');
      assert.equal(cool.value, '25');
      cool.value = '26,5';
      await applyCell(card);
      const saved = () => Object.fromEntries(hass.events.at(-1).presets.map((p) => [p.id, p]));
      assert.equal(saved().comfort.cool_temperature, 26.5);
      assert.equal(saved().frost.cool_temperature, undefined);
      // Boost is in no week: its temperature when cooling can be cleared
      click(card, '[data-kind="preset"][data-preset="boost"]'); await settle();
      $(card, '.cell-ed [data-cell-cool]').value = '';
      await applyCell(card);
      assert.equal('cool_temperature' in saved().boost, false);
      assert.equal(saved().boost.temperature, 21);
    });

    test('the preset popover clears the heating temperature', async () => {
      const hass = setup();
      const card = await panel(hass);
      click(card, '[data-kind="preset"][data-preset="boost"]'); await settle();
      $(card, '.cell-ed [data-cell-temp]').value = '';
      await applyCell(card);
      const boost = hass.events.at(-1).presets.find((p) => p.id === 'boost');
      assert.deepEqual([boost.temperature, boost.cool_temperature], [null, 23]);
    });

    test('a cell says what the thermostat gets when heating and when cooling', async () => {
      const card = await panel(setup());
      const cell = (climate, id) => text($(card, `[data-kind="thermostat"][data-climate="${climate}"][data-preset="${id}"] .pv-val`));
      assert.equal(cell(SUITE, 'comfort'), '20° · 25°'); await settle();
      assert.equal(cell(SUITE, 'frost'), '7°'); await settle();
      assert.equal(cell(COMBLES, 'frost'), '—'); await settle();
      assert.equal(cell(COMBLES, 'eco'), '27°'); await settle();
    });

    test('a cell says "?" for a preset of the thermostat whose temperature when cooling is not known yet', async () => {
      const own = { ...TARGETS, [COMBLES]: { ...TARGETS[COMBLES], comfort: { preset_mode: 'comfort', cool_preset_mode: 'comfort' } } };
      const card = await panel(setup({ targets: own }));
      assert.equal(text($(card, `[data-kind="thermostat"][data-climate="${COMBLES}"][data-preset="comfort"] .pv-val`)), '?');
      assert.match(text($(card, '.pv-note')), /^\? :/);
    });

    test('the cell popover says what an empty cooling field gives', async () => {
      const card = await panel(setup());
      click(card, `[data-kind="thermostat"][data-climate="${SUITE}"][data-preset="comfort"]`); await settle();
      assert.equal(text($(card, '.cell-ed .pv-cooldefault')), 'Par défaut (25°)');
      click(card, `[data-kind="thermostat"][data-climate="${SUITE}"][data-preset="frost"]`); await settle();
      assert.equal(text($(card, '.cell-ed .pv-cooldefault')), 'Pas utilisé en clim');
    });
  });

  describe('the card and the integration agree on what a preset means on a thermostat', () => {
    // The cases of tests/integration/test_presets_when_cooling.py and test_hvac_mode.py
    const P = Object.fromEntries(presets().map((p) => [p.id, p]));
    const hass = (attributes) => ({ states: { [SUITE]: { state: 'heat', attributes: { hvac_modes: ALL, supported_features: 3, ...attributes } } } });
    const on = (preset, cell, attributes = {}) => valueOn(preset, cell, hass(attributes), SUITE, true);

    test('a preset without a cooling temperature is not offered in cool, even with a preset of its own', async () => {
      for (const attributes of [{}, { preset_modes: ['frost', 'eco', 'comfort'] }]) {
        assert.deepEqual(presetModes(on(P.frost, null, attributes)), ['heat']);
        assert.deepEqual(presetModes(on(P.comfort, null, attributes)), ['heat', 'cool', 'heat_cool']);
      }
      assert.deepEqual(presetModes(on({ id: 'summer', temperature: null, cool_temperature: 26 }, null)), ['cool']);
    });

    test('the value set on the thermostat counts, each HVAC mode apart', async () => {
      assert.deepEqual(on(P.frost, { cool_temperature: 28 }), { temperature: 7, cool_temperature: 28, target_temp_low: 7, target_temp_high: 28 });
      const own = { preset_modes: ['frost', 'eco', 'comfort'] };
      assert.deepEqual(on(P.frost, null, own), { preset_mode: 'frost' });
      const cell = on(P.comfort, { temperature: 21 }, own);
      assert.deepEqual([cell.temperature, cell.cool_preset_mode, 'preset_mode' in cell], [21, 'comfort', false]);
      assert.deepEqual(presetModes(on(P.comfort, null, { supported_features: 1 })), ['heat', 'cool']);
    });

    test('the HVAC mode of a slot on a thermostat', async () => {
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
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and a valve that lists heat and auto. The card shows the suite. It is Monday, 10:00.
{
  const { SALON, SUITE, VANNE, cardOf, onMondayAtTen, select, setup } = suiteAndValve;

  describe('the cell popover of the presets tab', () => {
    onMondayAtTen();
    const panel = async (hass) => { const card = createView(hass, 'presets', { thermostats: [SALON, SUITE, VANNE] }); await settle(); return card; };
    const cell = (card, climate, preset) => click(card, `[data-kind="thermostat"][data-climate="${climate}"][data-preset="${preset}"]`);
    const coolRows = (card) => $$(card, '.cell-ed input[name="cell-cool-choice"]').map((r) => `${text(r.closest('label').querySelector('span'))}${r.checked ? ' ✓' : ''}`);

    test('when cooling has the same rows as when heating: the default, or a temperature', async () => {
      const card = await panel(setup());
      cell(card, SUITE, 'comfort'); await settle();
      assert.deepEqual(coolRows(card), ['Par défaut (25°) ✓', 'Température']);
      cell(card, SUITE, 'frost'); await settle();
      assert.deepEqual(coolRows(card), ['Pas utilisé en clim ✓', 'Température']);
    });

    test('+ on the cooling temperature starts from the default it shows, on the thermostat\'s step', async () => {
      const hass = setup({ step: 1 });
      const card = await panel(hass);
      cell(card, SUITE, 'comfort'); await settle();
      assert.equal($(card, '.cell-ed [data-cell-cool]').value, '25');
      click(card, '.cell-ed .pv-cool [data-act="cell-step"][data-dir="1"]'); await settle();
      assert.equal($(card, '.cell-ed [data-cell-cool]').value, '26');
      assert.deepEqual(coolRows(card).map((r) => r.endsWith('✓')), [false, true]);
      await applyCell(card);
      assert.deepEqual(hass.events.at(-1).mapping, { comfort: { cool_temperature: 26 } });
    });

    test('− on an empty cooling temperature starts from 25°, never from the heating temperature', async () => {
      const card = await panel(setup());
      cell(card, SUITE, 'frost'); await settle();
      assert.equal($(card, '.cell-ed [data-cell-cool]').value, '');
      click(card, '.cell-ed .pv-cool [data-act="cell-step"][data-dir="-1"]'); await settle();
      assert.equal($(card, '.cell-ed [data-cell-cool]').value, '24,5');
    });

    test('a temperature is stored on the thermostat\'s step: the cell shows what is stored', async () => {
      const hass = setup({ step: 1 });
      const card = await panel(hass);
      cell(card, SUITE, 'comfort'); await settle();
      const field = $(card, '.cell-ed [data-cell-temp]');
      field.value = '19,4';
      field.dispatchEvent(new window.Event('input', { bubbles: true })); await settle();
      await applyCell(card);
      assert.deepEqual(hass.events.at(-1).mapping, { comfort: { temperature: 19 } });
    });

    test('the default chosen when cooling stores no cooling temperature', async () => {
      const hass = setup();
      hass.data.mappings = { [SUITE]: { comfort: { cool_temperature: 24 } } };
      const card = await panel(hass);
      cell(card, SUITE, 'comfort'); await settle();
      assert.deepEqual(coolRows(card).map((r) => r.endsWith('✓')), [false, true]);
      click(card, '.cell-ed input[name="cell-cool-choice"][value="default"]'); await settle();
      await applyCell(card);
      assert.deepEqual(hass.events.at(-1).mapping, {});
    });

    test('a cell says which of the two temperatures is set here', async () => {
      const hass = setup();
      hass.data.mappings = { [SUITE]: { comfort: { cool_temperature: 24 }, eco: { temperature: 18 }, boost: { temperature: 22, cool_temperature: 22.5 } },
        [SALON]: { eco: { temperature: 18 } } };
      const card = await panel(hass);
      const how = (climate, id) => text($(card, `[data-kind="thermostat"][data-climate="${climate}"][data-preset="${id}"] .pv-how`));
      assert.equal(how(SUITE, 'comfort'), 'clim réglée ici');
      assert.equal(how(SUITE, 'eco'), 'chauffe réglée ici');
      assert.equal(how(SUITE, 'boost'), 'réglé ici');
      assert.equal(how(SALON, 'eco'), 'réglé ici');
    });

    test('a preset keeps a temperature that the weeks use', async () => {
      const hass = setup({ suite: ['00:00 eco', ['14:00', 'comfort', { hvac_mode: 'cool' }]] });
      const card = await panel(hass);
      const before = hass.events.length;
      click(card, '[data-kind="preset"][data-preset="comfort"]'); await settle();
      $(card, '.cell-ed [data-cell-cool]').value = '';
      await applyCell(card);
      assert.equal(hass.events.length, before, 'nothing is sent');
      assert.equal(text($(card, '.cell-ed .pv-error')), 'Utilisé en clim dans un planning : gardez une température.');
      // Boost is in no week
      click(card, '[data-kind="preset"][data-preset="boost"]'); await settle();
      $(card, '.cell-ed [data-cell-cool]').value = '';
      await applyCell(card);
      assert.equal(hass.events.at(-1).type, 'chauffage/presets/set');
    });

    test('the setpoint of a slot opens the presets tab on the thermostat\'s row', async () => {
      const card = await cardOf(setup());
      await select(card, SUITE, 1);
      assert.equal($(card, '.editor .setpoint-edit').dataset.navigate, `/chauffage/presets?thermostat=${encodeURIComponent(SUITE)}`);
      window.history.replaceState(null, '', `/chauffage/presets?thermostat=${encodeURIComponent(SUITE)}`);
      const tab = await panel(setup());
      assert.ok($(tab, `tr[data-climate="${SUITE}"]`).classList.contains('target'));
      assert.equal($$(tab, 'tr.target').length, 1);
      window.history.replaceState(null, '', '/');
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The card shows the salon. It is Monday, 10:00.
{
  const { COMBLES, SALON, SUITE, TARGETS, cardOf, onMondayAtTen, select, setup } = suiteAndCombles;

  describe('a preset keeps a temperature that a heat/cool slot uses', () => {
    onMondayAtTen();
    const panel = async (hass) => { const card = createView(hass, 'presets', { thermostats: [SALON, SUITE, COMBLES] }); await settle(); return card; };
    const clear = async (card, field) => {
      if (!$(card, '.cell-ed')) click(card, '[data-kind="preset"][data-preset="eco"]'); await settle();
      $(card, `.cell-ed [${field}]`).value = '';
      await applyCell(card);
    };

    test('with one of the thermostat\'s own presets as the value: a range needs both temperatures', async () => {
      const hass = setup({ suite: [['00:00', 'eco', { hvac_mode: 'heat_cool' }]], salon: ['00:00 comfort'], combles: ['00:00 comfort'], mappings: { [SUITE]: { eco: { preset_mode: 'eco' } } } });
      const card = await panel(hass);
      const before = hass.events.length;
      await clear(card, 'data-cell-cool');
      assert.equal(hass.events.length, before, 'nothing is sent');
      assert.equal(text($(card, '.cell-ed .pv-error')), 'Utilisé en clim dans un planning : gardez une température.');
      await clear(card, 'data-cell-temp');
      assert.equal(text($(card, '.cell-ed .pv-error')), 'Utilisé en chauffe dans un planning : gardez une température.');
    });

    test('a temperature set on the thermostat replaces the preset\'s', async () => {
      const hass = setup({ suite: [['00:00', 'eco', { hvac_mode: 'heat_cool' }]], salon: ['00:00 comfort'], combles: ['00:00 comfort'], mappings: { [SUITE]: { eco: { cool_temperature: 26 } } } });
      const card = await panel(hass);
      await clear(card, 'data-cell-cool');
      assert.equal(hass.events.at(-1).type, 'chauffage/presets/set');
    });
  });

  describe('a preset given a cooling value on one thermostat', () => {
    onMondayAtTen();
    test('is offered there when cooling, and nowhere else', async () => {
      // Frost protection has no temperature when cooling. The combles cool on it at their own 28°
      const targets = { ...TARGETS, [COMBLES]: { ...TARGETS[COMBLES], frost: { cool_temperature: 28 } } };
      const hass = setup({ targets, suite: [['00:00', 'eco', { hvac_mode: 'cool' }]] });
      const card = await cardOf(hass, { show: [COMBLES, SUITE] });
      const offered = async (climate) => { await select(card, climate, 0); return $$(card, '.editor .presets [data-act="preset"]').map((b) => b.dataset.preset); };
      assert.ok((await offered(COMBLES)).includes('frost'));
      assert.ok(!(await offered(SUITE)).includes('frost'));
      await openOverride(card, COMBLES);
      assert.ok($(card, '.override-ed [data-act="override-preset"][data-preset="frost"]'));
    });
  });

  describe('the text of a chip is dark where white is hard to read', () => {
    onMondayAtTen();
    test('white on a color that gives it a contrast of 4.5 at least, dark otherwise', async () => {
      assert.equal(chipTextColor(['#1976d2']), '#fff');
      assert.equal(chipTextColor(['#1a237e']), '#fff');
      assert.notEqual(chipTextColor(['#f57c00']), '#fff');
      assert.notEqual(chipTextColor(['#43a047']), '#fff');
    });

    test('a chip in two colors takes the text that reads best on its worst color', async () => {
      assert.notEqual(chipTextColor(['#f57c00', '#1976d2']), '#fff'); // orange and blue: dark
      assert.equal(chipTextColor(['#e53935', '#1a237e']), '#fff'); // red and navy: white
    });

    test('the chips of a slot follow it', async () => {
      const card = await cardOf(setup(), { show: [SUITE] });
      await select(card, SUITE, 1);
      assert.notEqual($(card, '.editor .presets [data-preset="comfort"]').style.color, 'rgb(255, 255, 255)');
      click(card, '.editor .mode-row [data-mode="cool"]'); await settle();
      assert.equal($(card, '.editor .presets [data-preset="comfort"]').style.color, 'rgb(255, 255, 255)');
    });
  });

  describe('the presets tab', () => {
    onMondayAtTen();
    const presetsTab = async (hass) => { const card = createView(hass, 'presets', { thermostats: [SALON, SUITE, COMBLES] }); await settle(); return card; };
    const open = (card, preset, climate) => click(card, `[data-act="cell"][data-kind="${climate ? 'thermostat' : 'preset'}"][data-preset="${preset}"]${climate ? `[data-climate="${climate}"]` : ''}`);

    test('an empty cooling field shows the preset\'s cooling temperature as a hint', async () => {
      const targets = { ...TARGETS, [SUITE]: { ...TARGETS[SUITE], comfort: { preset_mode: 'comfort', cool_preset_mode: 'comfort' } } };
      const hass = setup({ targets });
      hass.states[SUITE].attributes.preset_modes = ['eco', 'comfort']; // its own Comfort, whose temperature is not known
      const card = await presetsTab(hass);
      await open(card, 'comfort', SUITE); await settle();
      const field = $(card, '.cell-ed [data-cell-cool]');
      assert.equal(field.value, '');
      assert.equal(field.getAttribute('placeholder'), '25');
    });

    test('a list looks like the other fields, and a color is as high as a chip', async () => {
      assert.doesNotMatch(STYLE_TEXT, /\.cell-ed select \{[^}]*secondary-background-color/);
      assert.match(STYLE_TEXT, /\.cell-ed input\[type=color\] \{[^}]*height:var\(--chauffage-chip-h\)/);
    });

    test('the icons of the heating and cooling values are 14 px, on the line of their numbers', async () => {
      assert.match(STYLE_TEXT, /\.pv-val \.m ha-icon, \.pv-default \.m ha-icon \{ --mdc-icon-size:14px; width:14px; height:14px; vertical-align:-2px;/);
    });
  });
}

// The salon, a heater, the atelier, which heats and cools, and the combles, which only cool, with
// values of their own when cooling. The card shows the atelier.
{
  const { ATELIER, COMBLES, SALON, apart, cell, hsl, presetsTab, setup } = atelierAndCombles;

  describe('colors that can be told apart', () => {
    const FAN_CYAN = '#00bcd4'; // Home Assistant's color of fan only
    const OFF_GREY = '#616161'; // an off slot
    const STRIPES = ['#7b1fa2', '#9c4dcc']; // the purple stripes of an override
    const hueFrom = (a, b) => { const d = Math.abs(hsl(a).h - hsl(b).h); return Math.min(d, 360 - d); };
    // The presets of a new installation, in the integration's own colors
    const defaults = [{ id: 'comfort', color: '#f57c00' }, { id: 'eco', color: '#43a047' }, { id: 'boost', color: '#e53935' }, { id: 'frost', color: '#78909c' }];

    test('the cool colors of the default presets differ from each other, from fan only and from every heat color', async () => {
      const cool = defaults.map(coolColor);
      for (let i = 0; i < cool.length; i += 1) {
        for (let j = i + 1; j < cool.length; j += 1) assert.ok(apart(cool[i], cool[j]), `${defaults[i].id} ${cool[i]} and ${defaults[j].id} ${cool[j]}`);
        assert.ok(apart(cool[i], FAN_CYAN), `${defaults[i].id} ${cool[i]} and fan only`);
        for (const preset of defaults) assert.ok(apart(cool[i], preset.color), `${defaults[i].id} ${cool[i]} and the heat color of ${preset.id}`);
      }
    });

    test('no cool color is a purple: an override is drawn in purple stripes', async () => {
      for (const preset of [...defaults, { id: 'former frost', color: '#29b6f6' }]) {
        for (const stripe of STRIPES) assert.ok(hueFrom(coolColor(preset), stripe) >= 40, `${preset.id} ${coolColor(preset)} and ${stripe}`);
      }
      // Any other color: its derived cool color stays in the blues too
      for (const color of ['#ff0000', '#ffeb3b', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#9e9e9e']) {
        for (const stripe of STRIPES) assert.ok(hueFrom(coolColor({ color }), stripe) >= 25, `${color} gives ${coolColor({ color })}`);
        assert.ok(hueFrom(coolColor({ color }), FAN_CYAN) >= 12, `${color} gives ${coolColor({ color })}, too close to fan only`);
      }
    });

    test('frost protection of a new installation is not the grey of an off slot', async () => {
      assert.ok(Math.abs(hsl('#78909c').l - hsl(OFF_GREY).l) >= 0.15);
    });

    test('the cool color of an installation\'s frost protection (light blue) is still apart from the others', async () => {
      const cool = [...defaults.slice(0, 3), { id: 'frost', color: '#29b6f6' }].map(coolColor);
      for (let i = 0; i < 3; i += 1) assert.ok(apart(cool[i], cool[3]), `${cool[i]} and ${cool[3]}`);
    });

    test('frost protection of a new installation does not look like fan only', async () => {
      assert.ok(apart('#78909c', FAN_CYAN));
    });

    test('a cool color stays dark enough for white text, whatever the color', async () => {
      for (const color of ['#ffeb3b', '#ffffff', '#000000', '#f57c00', '#9e9e9e', '#80deea']) {
        const { l } = hsl(coolColor({ color }));
        assert.ok(l >= 0.28 && l <= 0.5, `${color} gives ${coolColor({ color })}`);
      }
    });
  });

  describe('the presets table', () => {
    test('a cell of a unit that only cools shows its cooling value, never a heating temperature', async () => {
      const card = await presetsTab(setup());
      assert.equal(text(cell(card, 'comfort', COMBLES).querySelector('.pv-val')), '26°'); await settle();
      assert.equal(text(cell(card, 'frost', COMBLES).querySelector('.pv-val')), '—'); await settle();
      assert.deepEqual(icons(cell(card, 'comfort', COMBLES)), ['mdi:snowflake']); await settle();
    });

    test('a cell of a unit that heats and cools shows what its own preset gives when cooling', async () => {
      const card = await presetsTab(setup());
      assert.equal(text(cell(card, 'eco', ATELIER).querySelector('.pv-val')), '17° · 27°'); await settle();
      assert.equal(text(cell(card, 'comfort', ATELIER).querySelector('.pv-val')), '20° · 24°'); await settle();
    });

    test('the popover of a unit that only cools asks for the cooling temperature alone', async () => {
      const card = await presetsTab(setup());
      cell(card, 'frost', COMBLES).click(); await settle();
      assert.equal($(card, '.cell-ed [data-cell-temp]'), null);
      // One question: the default, or a temperature when cooling
      assert.deepEqual($$(card, '.cell-ed input[name="cell-choice"]').map((r) => `${r.value}${r.checked ? ' ✓' : ''}`), ['default ✓', 'cool']);
      assert.ok($(card, '.cell-ed .pv-cool [data-cell-cool]'));
      assert.match(text($(card, '.cell-ed')), /Pas utilisé en clim/);
      assert.doesNotMatch(text($(card, '.cell-ed')), /En chauffe/);
    });

    test('its cooling temperature is saved without a heating value', async () => {
      const hass = setup();
      const card = await presetsTab(hass);
      cell(card, 'frost', COMBLES).click(); await settle();
      const field = $(card, '.cell-ed [data-cell-cool]');
      field.value = '28';
      field.dispatchEvent(new window.Event('input', { bubbles: true })); await settle();
      assert.equal($(card, '.cell-ed input[name="cell-choice"]:checked').value, 'cool', 'typing a temperature chooses its row');
      await applyCell(card);
      assert.deepEqual(hass.events.at(-1).mapping, { comfort: { cool_temperature: 26 }, frost: { cool_temperature: 28 } });
    });

    test('an empty cooling field says the default: what the thermostat\'s own preset gives when cooling', async () => {
      const card = await presetsTab(setup());
      cell(card, 'eco', ATELIER).click(); await settle();
      assert.equal(text($(card, '.cell-ed .pv-cooldefault')), 'Par défaut (son préréglage Éco, 27°)');
      const chosen = () => $(card, '.cell-ed input[name="cell-cool-choice"]:checked').value;
      assert.equal(chosen(), 'default');
      const field = $(card, '.cell-ed [data-cell-cool]');
      assert.equal(field.value, '27', 'the field opens on what the default gives');
      field.value = '26';
      field.dispatchEvent(new window.Event('input', { bubbles: true })); await settle();
      assert.equal(chosen(), 'temperature');
    });

    test('tapping a cell keeps the table where it was scrolled', async () => {
      const card = await presetsTab(setup());
      $(card, '.table-wrap').scrollLeft = 120;
      cell(card, 'boost', ATELIER).click(); await settle();
      assert.equal($(card, '.table-wrap').scrollLeft, 120);
      click(card, '.cell-ed [data-act="cell-close"]'); await settle();
      assert.equal($(card, '.table-wrap').scrollLeft, 120);
    });

    test('a table wider than the screen says there is more to the side', async () => {
      const card = await presetsTab(setup());
      const wrap = $(card, '.table-wrap');
      Object.defineProperty(wrap, 'scrollWidth', { value: 600, configurable: true });
      Object.defineProperty(wrap, 'clientWidth', { value: 340, configurable: true });
      wrap.dispatchEvent(new window.Event('scroll')); await settle();
      assert.ok(wrap.parentElement.classList.contains('more-right') && !wrap.parentElement.classList.contains('more-left'));
      wrap.scrollLeft = 260;
      wrap.dispatchEvent(new window.Event('scroll')); await settle();
      assert.ok(wrap.parentElement.classList.contains('more-left') && !wrap.parentElement.classList.contains('more-right'));
    });

    test('a preset\'s color is its color when heating, next to its color when cooling', async () => {
      const card = await presetsTab(setup());
      click(card, '[data-kind="preset"][data-preset="eco"]'); await settle();
      assert.match(text($(card, '.cell-ed .pv-fields')), /Couleur en chauffe.*Couleur en clim/);
      cleanup();
      const hass = setup();
      delete hass.states[ATELIER];
      delete hass.states[COMBLES];
      const heaters = createView(hass, 'presets', { thermostats: [SALON] }); await settle();
      click(heaters, '[data-kind="preset"][data-preset="eco"]'); await settle();
      assert.doesNotMatch(text($(heaters, '.cell-ed .pv-fields')), /Couleur en chauffe|Couleur en clim/);
    });
  });
}
