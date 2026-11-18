// The slot popover (#91): the HVAC mode first, then the presets offered in it, the fan and the
// vanes, and a popover that fits a phone.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKDAY, WEEKEND, cleanup } from './helpers.mjs';
import { CHIP_STYLE, FIELD_BOX, MORE_INFO_STYLE as MORE_INFO_STYLE_TEXT, STYLE as STYLE_TEXT, derivedCoolColor, normalize, parseDay, serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { $, $$, change, click, day, icons, rgb, text, week } from './houses/dom.mjs';
import * as heaterAndAtelier from './houses/heater-and-atelier.mjs';
import * as everyHvacMode from './houses/every-hvac-mode.mjs';
import * as weeksBefore91 from './houses/weeks-before-91.mjs';
import * as suiteAndValve from './houses/suite-and-valve.mjs';
import * as suiteAndCombles from './houses/suite-and-combles.mjs';
import * as atelierAndCombles from './houses/atelier-and-combles.mjs';

afterEach(() => cleanup());

// The salon, a heater (off and heat), and the atelier, a reversible air conditioner with a fan. The
// salon is off at night, and the atelier has a slot that sets the fan and the vanes.
{
  const { COOL, FAN_DAY, OFF_SLOT, PRESET_COLORS, SUMMER, cardOf, chips, modes, pressed, select, setup } = heaterAndAtelier;

  describe('the slot popover', () => {
    const hvac = (card) => $$(card, '.editor .mode-row [data-mode="heat"], .editor .mode-row [data-mode="cool"]').map(pressed);

    test('a heater: one row of chips, Arrêt first; no Ventilation, no HVAC mode', () => {
      const card = cardOf(setup(), { show: ['climate.salon'] });
      select(card, 'climate.salon', 0, 1); // 06:30 comfort
      assert.deepEqual(chips(card, '.editor'), ['Arrêt', 'Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
      assert.equal($(card, '.editor .mode-row'), null);
      assert.equal($(card, '.editor select'), null, 'no fan on a heater');
      assert.equal($(card, '.editor [data-act="capture"]'), null);
      assert.doesNotMatch(text($(card, '.editor')), /Marche|Fonctionnement|Au rallumage|Copier depuis|Clim|Ventilation/);
    });

    test('an air conditioner: its HVAC modes first, Arrêt, Chauffe, Clim, Ventilation; then the presets', () => {
      const card = cardOf(setup(), { show: ['climate.atelier'] });
      select(card, 'climate.atelier', 0, 1); // 14:00 comfort
      assert.deepEqual(modes(card), ['Arrêt', 'Chauffe ✓', 'Clim', 'Ventilation'], 'one is always chosen');
      assert.deepEqual(chips(card, '.editor'), ['Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
      assert.equal($(card, '.editor .mode-row').getAttribute('aria-label'), 'Mode HVAC');
      assert.deepEqual($$(card, '.editor .mode-row ha-icon').map((i) => i.getAttribute('icon')), ['mdi:power', 'mdi:fire', 'mdi:snowflake', 'mdi:fan']);
    });

    test('Clim makes the slot cool, and the chips take their cool colors; Chauffe makes it heat again', () => {
      const card = cardOf(setup(), { show: ['climate.atelier'] });
      select(card, 'climate.atelier', 0, 1);
      click(card, '.editor [data-act="slot-mode"][data-mode="cool"]');
      assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 comfort {"hvac_mode":"cool","fan_mode":"3","swing_mode":"swing"}');
      assert.ok(card._dirty);
      assert.deepEqual(hvac(card), ['Chauffe', 'Clim ✓']);
      assert.equal($(card, '.editor [data-act="preset"][data-preset="comfort"]').style.background, rgb(derivedCoolColor(PRESET_COLORS.comfort)));
      click(card, '.editor [data-act="preset"][data-preset="eco"]'); // another preset keeps the HVAC mode
      assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 eco {"hvac_mode":"cool","fan_mode":"3","swing_mode":"swing"}');
      click(card, '.editor [data-act="slot-mode"][data-mode="heat"]');
      assert.deepEqual(hvac(card), ['Chauffe ✓', 'Clim']);
      click(card, '.editor [data-act="slot-mode"][data-mode="heat"]');
      assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 eco {"hvac_mode":"heat","fan_mode":"3","swing_mode":"swing"}');
      assert.equal($(card, '.editor [data-act="preset"][data-preset="comfort"]').style.background, rgb(PRESET_COLORS.comfort));
    });

    test('Ventilation: no preset, no setpoint; the fan in sight, the vanes under "Plus de réglages"', () => {
      const card = cardOf(setup(), { show: ['climate.atelier'] });
      select(card, 'climate.atelier', 0, 1);
      click(card, '.editor [data-act="slot-mode"][data-mode="fan_only"]');
      assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 - {"hvac_mode":"fan_only","fan_mode":"3","swing_mode":"swing"}');
      assert.deepEqual(modes(card), ['Arrêt', 'Chauffe', 'Clim', 'Ventilation ✓']);
      assert.equal($(card, '.editor .presets'), null);
      assert.equal($(card, '.editor .slot-setpoint'), null);
      assert.equal(text($(card, '.editor details.more summary')), 'Volets Oscillation');
      assert.equal($(card, '.editor .more-rows.direct [data-slot-setting="fan_mode"]').value, '3');
      change($(card, '.editor [data-slot-setting="fan_mode"]'), '1');
      assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 - {"hvac_mode":"fan_only","fan_mode":"1","swing_mode":"swing"}');
      // Chauffe tapped: the slot is on its preset again, and keeps its fan and its vanes
      click(card, '.editor [data-act="slot-mode"][data-mode="heat"]');
      assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 comfort {"hvac_mode":"heat","fan_mode":"1","swing_mode":"swing"}');
    });

    test('Arrêt turns the slot off: no preset, no fan, no vanes; a preset turns it back on', () => {
      const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
      select(card, 'climate.salon', 0, 1);
      click(card, '.editor [data-act="slot-off"]');
      assert.equal(day(card, 'climate.salon', 0)[1], `06:30${OFF_SLOT}`);
      assert.deepEqual(chips(card, '.editor'), ['Arrêt ✓', 'Hors-gel', 'Éco', 'Confort', 'Boost']);
      assert.equal($(card, '.editor [data-act="slot-off"]').getAttribute('aria-pressed'), 'true');
      click(card, '.editor [data-act="preset"][data-preset="frost"]');
      assert.equal(day(card, 'climate.salon', 0)[1], '06:30 frost');
      select(card, 'climate.atelier', 0, 1); // 14:00 comfort, fan 3
      click(card, '.editor [data-act="slot-off"]');
      assert.equal(day(card, 'climate.atelier', 0)[1], `14:00${OFF_SLOT}`);
      assert.equal($(card, '.editor details.more'), null);
      assert.equal($(card, '.editor .presets'), null);
      assert.deepEqual(modes(card), ['Arrêt ✓', 'Chauffe', 'Clim', 'Ventilation']);
    });

    test('each slot is independent: an evening turned off changes no other day, and says nothing', () => {
      const week = { 'climate.atelier': { Normal: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } };
      const card = cardOf(setup({ weeks: week }), { show: ['climate.atelier'], group_days: false });
      select(card, 'climate.atelier', 0, 4); // Monday, 22:30 eco
      click(card, '.editor [data-act="slot-off"]');
      assert.equal(day(card, 'climate.atelier', 0)[4], `22:30${OFF_SLOT}`);
      assert.deepEqual(day(card, 'climate.atelier', 1), WEEKDAY);
      assert.equal(text($(card, '.msg')), '');
    });

    test('a cooling-only air conditioner has Clim chosen; with nothing else to choose, one row', () => {
      const hass = setup();
      hass.states['climate.atelier'].attributes.hvac_modes = ['off', 'cool', 'fan_only'];
      const card = cardOf(hass, { show: ['climate.atelier'] });
      select(card, 'climate.atelier', 0, 1);
      assert.deepEqual(modes(card), ['Arrêt', 'Clim ✓', 'Ventilation']);
      hass.states['climate.atelier'].attributes.hvac_modes = ['off', 'cool'];
      select(card, 'climate.atelier', 0, 1);
      assert.equal($(card, '.editor .mode-row'), null);
      assert.deepEqual(chips(card, '.editor'), ['Arrêt', 'Éco', 'Confort ✓', 'Boost']);
    });

    test('a thermostat that lists no off has no Arrêt; an off slot or a fan-only slot it has stays, marked; a cool slot heats', () => {
      const hass = setup({ weeks: { 'climate.salon': { Normal: Array(7).fill(SUMMER) }, 'climate.atelier': { Normal: Array(7).fill(FAN_DAY) } } });
      hass.states['climate.salon'].attributes.hvac_modes = ['auto', 'heat'];
      const card = cardOf(hass, { show: ['climate.salon'] });
      select(card, 'climate.salon', 0, 0);
      assert.equal($(card, '.editor [data-act="slot-off"]'), null);
      assert.equal($(card, '.editor [data-act="slot-mode"][data-mode="fan_only"]'), null);
      select(card, 'climate.salon', 0, 1); // comfort, cool
      assert.deepEqual(modes(card), ['Chauffe ✓', 'Auto'], 'a thermostat that does not cool heats');
      select(card, 'climate.salon', 0, 2);
      assert.equal(text($(card, '.editor [data-act="slot-mode"][data-mode="fan_only"]')), 'Ventilation (indisponible)');
      select(card, 'climate.salon', 0, 3);
      assert.equal(text($(card, '.editor [data-act="slot-off"]')), 'Arrêt (indisponible)');
      assert.ok($(card, '.editor [data-act="slot-off"]').classList.contains('unsupported'));
    });

    test('the Setpoint line gives the number the slot will apply', () => {
      const setpoint = (card) => text($(card, '.editor .slot-setpoint') || { textContent: '' });
      const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
      select(card, 'climate.salon', 0, 1); // comfort: its own preset, 20 °C
      assert.equal(setpoint(card), 'Consigne : 20 °C (son préréglage Confort)');
      click(card, '.editor [data-act="preset"][data-preset="frost"]');
      assert.equal(setpoint(card), 'Consigne : 7 °C');
      select(card, 'climate.salon', 0, 4); // off
      assert.equal(setpoint(card), '');
      select(card, 'climate.atelier', 0, 1); // its own preset, whose temperature is not known yet: the chip names it
      assert.equal(setpoint(card), '');
    });

    test('on a slot that cools: the cooling temperature, else its own preset, else "unchanged when cooling"', () => {
      const setpoint = (card) => text($(card, '.editor .slot-setpoint') || { textContent: '' });
      const hass = setup({ atelier: ['00:00 eco', ['14:00', 'comfort', COOL], ['20:00', 'frost', COOL]] });
      const card = cardOf(hass, { show: ['climate.atelier'] });
      select(card, 'climate.atelier', 0, 1); // comfort in cool: its own preset, which the device reads in cool
      assert.equal(setpoint(card), '');
      hass.data.cool_preset_temperatures = { 'climate.atelier': { comfort: 25 } };
      hass.push({ ...hass.data });
      card._render();
      assert.equal(setpoint(card), 'Consigne : 25 °C (son préréglage Confort)');
      // Frost protection has no value when cooling: a slot stored with it stays, marked, and sends no setpoint
      select(card, 'climate.atelier', 0, 2);
      assert.ok($(card, '.editor [data-act="preset"][data-preset="frost"]').classList.contains('unsupported'));
      assert.equal(setpoint(card), 'Consigne inchangée en clim');
      hass.data.targets['climate.atelier'].frost = { temperature: 16, cool_temperature: 25.5 };
      hass.push({ ...hass.data });
      card._render();
      assert.equal(setpoint(card), 'Consigne : 25,5 °C');
    });

    test('a slot without an HVAC mode heats, whatever the air conditioner does now', () => {
      const hass = setup();
      hass.states['climate.atelier'].state = 'cool';
      hass.data.targets['climate.atelier'].comfort = { temperature: 20 };
      const card = cardOf(hass, { show: ['climate.atelier'] });
      select(card, 'climate.atelier', 0, 1);
      assert.equal(text($(card, '.editor .slot-setpoint')), 'Consigne : 20 °C');
      // Comfort has no value when cooling on this thermostat: the slot takes a preset that has one
      click(card, '.editor [data-act="slot-mode"][data-mode="cool"]');
      assert.ok($(card, '.editor [data-act="preset"][data-preset="eco"].on'));
      assert.equal($(card, '.editor .slot-setpoint'), null, 'its own preset, whose temperature is not known');
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The presets have a cooling temperature. The card shows the
// suite.
{
  const { COMBLES, SALON, SUITE, TARGETS, cardOf, mode, modeRow, presetRow, select, setup } = everyHvacMode;

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
      assert.ok($(card, '.editor [data-slot-setting="fan_mode"]'));
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

    test('two slots in a row with the same HVAC mode and the same settings stay two slots', () => {
      const dry = { hvac_mode: 'dry' };
      assert.deepEqual(serializeDay(normalize(parseDay([['00:00', 'eco'], ['10:00', null, dry], ['12:00', null, dry],
        ['14:00', null, { hvac_mode: 'dry', fan_mode: 'low' }], ['16:00', null, { hvac_mode: 'auto' }]]))),
      ['00:00 eco', '10:00 - {"hvac_mode":"dry"}', '12:00 - {"hvac_mode":"dry"}', '14:00 - {"hvac_mode":"dry","fan_mode":"low"}', '16:00 - {"hvac_mode":"auto"}']);
    });
  });
}

// Weeks stored before #91, whose slots say no HVAC mode: the salon, a heater, the atelier, which
// heats and cools, and the combles, which only cool. The card shows the atelier.
{
  const { ATELIER, COMBLES, COOL, cardOf, select, setup } = weeksBefore91;

  describe('a thermostat in cool never gets a heating temperature: the popover says so', () => {
    const setpoint = (card) => text($(card, '.editor .slot-setpoint') || { textContent: '' });

    test('on a unit that only cools, a preset without a cooling temperature leaves the setpoint alone', () => {
      const hass = setup({ combles: ['00:00 eco', '14:00 frost'] });
      const card = cardOf(hass, { show: [COMBLES] });
      select(card, COMBLES, 1);
      assert.equal(setpoint(card), 'Consigne inchangée');
      hass.data.targets[COMBLES].frost = { temperature: 7, cool_temperature: 28 };
      hass.push({ ...hass.data });
      card._render();
      assert.equal(setpoint(card), 'Consigne : 28 °C');
    });

    test('its own preset is named with what it gives when cooling, once known', () => {
      const hass = setup({ atelier: ['00:00 eco', ['14:00', 'comfort', COOL]] });
      hass.data.cool_preset_temperatures = { [ATELIER]: { comfort: 25 } };
      const card = cardOf(hass);
      select(card, ATELIER, 1);
      assert.equal(setpoint(card), 'Consigne : 25 °C (son préréglage Confort)');
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and a valve that lists heat and auto. The card shows the suite. It is Monday, 10:00.
{
  const { SUITE, both, cardOf, mode, onMondayAtTen, override, select, sent, setup } = suiteAndValve;

  describe('fan only and dry show the fan speed at once', () => {
    onMondayAtTen();
    test('a fan-only slot has its fan in sight, and its vanes under More settings', () => {
      const card = cardOf(setup({ suite: ['00:00 eco', ['14:00', null, { hvac_mode: 'fan_only' }]] }));
      select(card, SUITE, 1);
      const fan = $(card, '.editor [data-slot-setting="fan_mode"]');
      assert.ok(fan && !fan.closest('details'), 'the fan is not folded');
      assert.ok($(card, '.editor details.more [data-slot-setting="swing_mode"]'));
      assert.equal($(card, '.editor details.more [data-slot-setting="fan_mode"]'), null);
      mode(card, 'dry');
      assert.ok(!$(card, '.editor [data-slot-setting="fan_mode"]').closest('details'));
    });

    test('a slot on a preset keeps its fan under More settings', () => {
      const card = cardOf(setup());
      select(card, SUITE, 1);
      assert.ok($(card, '.editor details.more [data-slot-setting="fan_mode"]'));
    });

    test('a fan-only override sets the fan speed', () => {
      const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'fan_only' }) } });
      const card = cardOf(hass);
      card._overrideSel = { climate: SUITE };
      card._render();
      const fan = $(card, '.override-ed [data-override-setting="fan_mode"]');
      assert.ok(fan);
      fan.value = 'high';
      fan.dispatchEvent(new window.Event('change', { bubbles: true }));
      assert.deepEqual(sent(hass).target, { hvac_mode: 'fan_only', fan_mode: 'high' });
      // Not on an override that heats
      const heats = cardOf(setup({ overrides: { [SUITE]: override({ ...both(20, 25), hvac_mode: 'heat' }, { preset: 'comfort' }) } }));
      heats._overrideSel = { climate: SUITE };
      heats._render();
      assert.equal($(heats, '.override-ed [data-override-setting]'), null);
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The card shows the salon. It is Monday, 10:00.
{
  const { ALL, SALON, SUITE, cardOf, onMondayAtTen, openOverride, override, select, setup } = suiteAndCombles;

  describe('the first row is a grid of three columns with five or six HVAC modes', () => {
    onMondayAtTen();
    const rowOf = (modes) => {
      const hass = setup();
      hass.states[SUITE].attributes.hvac_modes = modes;
      const card = cardOf(hass, { show: [SUITE] });
      select(card, SUITE, 0);
      return $(card, '.editor .mode-row');
    };

    test('five or six HVAC modes: rows of three', () => {
      assert.ok(rowOf(['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only']).classList.contains('cols3'));
      assert.ok(rowOf(['off', 'heat', 'cool', 'dry', 'fan_only']).classList.contains('cols3'));
    });

    test('four or seven HVAC modes wrap as they come', () => {
      assert.ok(!rowOf(['off', 'heat', 'cool', 'fan_only']).classList.contains('cols3'));
      assert.ok(!rowOf(ALL).classList.contains('cols3'));
    });
  });

  describe('one height for the buttons and the fields', () => {
    onMondayAtTen();
    test('the buttons of a popover and of the more-info block are as high as a chip, at 13 px', () => {
      assert.match(STYLE_TEXT, /\.editor \.btn \{[^}]*height:var\(--chauffage-chip-h\)[^}]*font-size:13px/);
      assert.match(MORE_INFO_STYLE_TEXT, /\n {2}button \{[^}]*height:var\(--chauffage-chip-h\)[^}]*font-size:13px/);
    });

    test('the rows of a block are one gap apart', () => {
      assert.match(CHIP_STYLE, /--chauffage-row-gap:10px/);
      assert.match(STYLE_TEXT, /\.editor \{[^}]*gap:var\(--chauffage-row-gap\)/);
      assert.match(MORE_INFO_STYLE_TEXT, /\.status\.derogation \{[^}]*gap:var\(--chauffage-row-gap\)/);
    });

    test('a field is as high as a chip, with its radius', () => {
      assert.match(FIELD_BOX, /height:var\(--chauffage-chip-h, 34px\)/);
      assert.match(FIELD_BOX, /border-radius:8px/);
    });
  });

  describe('the choice that sets no fan and no vanes', () => {
    onMondayAtTen();
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

  describe('the popover of a slot leaves the save bar free', () => {
    onMondayAtTen();
    test('it opens above its row when it would cover Cancel and Save', () => {
      const card = cardOf(setup());
      select(card, SALON, 1);
      click(card, '.editor [data-act="preset"][data-preset="boost"]');
      assert.ok($(card, '.savebar'));
      const rect = (top, height) => () => ({ left: 0, right: 360, width: 360, top, bottom: top + height, height });
      $(card, 'ha-card').getBoundingClientRect = rect(0, 900);
      $(card, '.seg.sel').parentElement.getBoundingClientRect = rect(500, 38);
      $(card, '.seg.sel').getBoundingClientRect = rect(500, 38);
      $(card, '.savebar').getBoundingClientRect = rect(708, 60);
      const editor = $(card, '.editor');
      Object.defineProperty(editor, 'offsetHeight', { value: 200 });
      Object.defineProperty(editor, 'offsetWidth', { value: 340 });
      card._placeEditor();
      // 500 + 38 + 9 + 200 = 747: inside the window (768), but under the save bar (from 708)
      assert.ok(editor.classList.contains('above'));
    });

    test('the save bar stays over a popover that has no room above', () => {
      const z = (selector) => Number(new RegExp(`\\n  ${selector} \\{[^}]*z-index:(\\d+)`).exec(STYLE_TEXT)[1]);
      assert.ok(z('\\.savebar') > z('\\.editor'));
    });
  });

  describe('the first row on a narrow block', () => {
    onMondayAtTen();
    test('three columns only where the block is narrow: a class on the popover, the width of the more-info block', () => {
      assert.doesNotMatch(CHIP_STYLE, /\n {2}\.mode-row\.cols3 \{[^}]*display:grid/);
      assert.match(STYLE_TEXT, /\.narrow \.mode-row\.cols3 \{[^}]*display:grid[^}]*column-gap:4px/);
      assert.match(STYLE_TEXT, /\.narrow \.mode-row\.cols3 \.mode \{[^}]*padding:0 5px[^}]*gap:4px/);
      assert.match(MORE_INFO_STYLE_TEXT, /\.wrap \{[^}]*container-type:inline-size/);
      assert.match(MORE_INFO_STYLE_TEXT, /@container \(max-width:419px\) \{\s*\.mode-row\.cols3 \{[^}]*display:grid/);
    });

    test('the popover of a narrow card is marked narrow', () => {
      const card = cardOf(setup(), { show: [SUITE] });
      select(card, SUITE, 1);
      const rect = (width) => () => ({ left: 0, right: width, width, top: 0, bottom: 38, height: 38 });
      for (const [width, narrow] of [[360, true], [900, false]]) {
        $(card, 'ha-card').getBoundingClientRect = rect(width);
        $(card, '.seg.sel').parentElement.getBoundingClientRect = rect(width);
        card._placeEditor();
        assert.equal($(card, '.editor').classList.contains('narrow'), narrow);
      }
    });

    test('the chosen HVAC mode is as wide as the others: no bold that moves its column', () => {
      assert.doesNotMatch(CHIP_STYLE, /\.mode-row \.mode\.on \{[^}]*font-weight/);
    });

    test('the HVAC mode a new override would take is outlined, not filled', () => {
      assert.match(CHIP_STYLE, /\.mode-row \.mode\.default \{[^}]*border:1px dashed[^}]*background:none/);
    });
  });

  describe('fields and buttons for a finger', () => {
    onMondayAtTen();
    test('the arrows of a time field are a − and a + as high as a chip on a touch screen', () => {
      assert.match(STYLE_TEXT, /@media \(pointer:coarse\) \{\s*\.time-spin \{[^}]*flex-direction:row-reverse/);
      assert.match(STYLE_TEXT, /\.time-step \{[^}]*width:var\(--chauffage-chip-h, 34px\); height:var\(--chauffage-chip-h, 34px\)/);
      assert.match(MORE_INFO_STYLE_TEXT, /@media \(pointer:coarse\)/);
    });

    test('a field writes at 13 px, as a chip does', () => {
      assert.match(FIELD_BOX, /font:inherit; font-size:13px/);
    });

    test('the words before a time field sit on the line of the field', () => {
      assert.match(CHIP_STYLE, /\.end-block label \{[^}]*height:var\(--chauffage-chip-h\)[^}]*align-items:center/);
      assert.match(STYLE_TEXT, /\.ed-times label \{[^}]*height:var\(--chauffage-chip-h\)/);
    });
  });
}

// The salon, a heater, the atelier, which heats and cools, and the combles, which only cool, with
// values of their own when cooling. The card shows the atelier.
{
  const { ATELIER, SALON, cardOf, cell, presetsTab, select, setup } = atelierAndCombles;

  describe('a device\'s own values are named as Home Assistant names them', () => {
    const named = (hass) => {
      hass.formatEntityAttributeValue = (state, attr, value) => ({ 'preset_mode away': 'Absent', 'fan_mode low': 'Faible' })[`${attr} ${value}`] || String(value);
      return hass;
    };

    test('its presets, in the cell popover and in the cell', async () => {
      const hass = named(setup());
      hass.data.targets[ATELIER].frost = { preset_mode: 'away' };
      const card = presetsTab(hass);
      assert.equal(text(cell(card, 'frost', ATELIER).querySelector('.pv-how')), 'son préréglage Absent');
      cell(card, 'frost', ATELIER).click();
      assert.deepEqual([...$(card, '.cell-ed [data-cell-preset]').options].map((o) => o.textContent), ['Éco', 'Confort', 'Absent', 'Boost']);
    });

    test('its fan, in a slot', () => {
      const card = cardOf(named(setup()));
      select(card, ATELIER, 1);
      assert.deepEqual([...$(card, '.editor [data-slot-setting="fan_mode"]').options].map((o) => o.textContent).slice(1), ['Auto', 'Faible', 'High']);
    });

    test('Home Assistant\'s translations are the next source, then the value as it is', () => {
      const hass = setup();
      hass.localize = (key) => ({ 'component.climate.entity_component._.state_attributes.preset_mode.state.away': 'Absent',
        'component.climate.entity_component._.state_attributes.fan_mode.state.low': 'Faible' })[key] || '';
      hass.data.targets[ATELIER].frost = { preset_mode: 'away' };
      hass.data.targets[ATELIER].boost = { preset_mode: 'turbo' };
      const card = presetsTab(hass);
      assert.equal(text(cell(card, 'frost', ATELIER).querySelector('.pv-how')), 'son préréglage Absent');
      assert.equal(text(cell(card, 'boost', ATELIER).querySelector('.pv-how')), 'son préréglage turbo');
    });
  });

  describe('a slot\'s fan chosen again', () => {
    test('the value it already has does not mark the week unsaved', () => {
      const card = cardOf(setup({ atelier: ['00:00 eco', ['12:00', 'comfort', { hvac_mode: 'heat', fan_mode: 'low' }]] }));
      select(card, ATELIER, 1);
      change($(card, '.editor [data-slot-setting="fan_mode"]'), 'low');
      assert.equal(card._dirty, false);
      select(card, ATELIER, 0);
      change($(card, '.editor [data-slot-setting="fan_mode"]'), '');
      assert.equal(card._dirty, false);
      change($(card, '.editor [data-slot-setting="fan_mode"]'), 'high');
      assert.equal(card._dirty, true);
    });
  });

  describe('the hint speaks of a finger on a touch screen', () => {
    test('whatever the number of rooms shown: a screen without hover, or with a coarse pointer', async () => {
      const { readFileSync } = await import('node:fs');
      const source = readFileSync(new URL('../../custom_components/chauffage/frontend/chauffage-programme-card.js', import.meta.url), 'utf8');
      const rules = source.match(/@media \(hover:none\), \(pointer:coarse\) \{[^}]*\.hint \.mouse \{ display:none; \}/g) || [];
      assert.equal(rules.length, 2, 'in the card and in the panel');
      for (const show of [[SALON], 'all']) {
        const card = cardOf(setup(), { show });
        assert.equal($$(card, '.hint .touch').length, 1);
        cleanup();
      }
    });
  });
}
