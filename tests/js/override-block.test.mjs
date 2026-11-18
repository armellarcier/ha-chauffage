// The override block, in the card, the more-info dialog and the thermostat card (#91): the HVAC
// mode first, then the preset or the temperature, then the end.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup } from './helpers.mjs';
import { CHIP_STYLE, derivedCoolColor } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { $, $$, change, click, rgb, text } from './houses/dom.mjs';
import * as heaterAndAtelier from './houses/heater-and-atelier.mjs';
import * as everyHvacMode from './houses/every-hvac-mode.mjs';
import * as weeksBefore91 from './houses/weeks-before-91.mjs';
import * as suiteAndValve from './houses/suite-and-valve.mjs';
import * as suiteAndCombles from './houses/suite-and-combles.mjs';

afterEach(() => cleanup());

// The salon, a heater (off and heat), and the atelier, a reversible air conditioner with a fan. The
// salon is off at night, and the atelier has a slot that sets the fan and the vanes.
{
  const { FAN, OFF, OWN, PRESET_COLORS, cardOf, chips, lastCall, modes, moreInfo, setup, thermostatCard } = heaterAndAtelier;

  describe('the override block: off, fan only, a preset, a temperature and its end', () => {
    const at = '2026-10-12T10:00:00+02:00';
    const span = { start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const offOverride = { target: OFF, ...span };
    const boost = { target: { preset_mode: 'boost' }, preset: 'boost', ...span };
    beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(at) }));
    afterEach(() => mock.timers.reset());

    test('the week view shows an off override with the off icon, the thermostat card as ⏱ Arrêt, without setpoint', () => {
      const hass = setup({ overrides: { 'climate.salon': offOverride } });
      hass.states['climate.salon'].attributes.temperature = 20;
      const card = cardOf(hass, { show: ['climate.salon'] });
      assert.match(text($(card, '.override[data-climate="climate.salon"] .override-label')), /^⏱ → 11:30$/);
      assert.equal($(card, '.override[data-climate="climate.salon"] .override-label ha-icon').getAttribute('icon'), 'mdi:power');
      const tc = thermostatCard(hass);
      assert.equal(text($(tc, '.tc-state')), '⏱ Arrêt');
      assert.ok($(tc, '.tc-state').classList.contains('override'));
    });

    test('the HVAC modes then the presets on an air conditioner; one row of chips, Arrêt first, on a heater: no Marche', () => {
      const hass = setup({ overrides: { 'climate.atelier': boost, 'climate.salon': boost } });
      const card = cardOf(hass, { show: ['climate.atelier', 'climate.salon'] });
      click(card, '.override[data-climate="climate.atelier"]');
      assert.deepEqual(modes(card), ['Arrêt', 'Chauffe ✓', 'Clim', 'Ventilation']);
      assert.deepEqual(chips(card, '.override-ed'), ['Hors-gel', 'Éco', 'Confort', 'Boost ✓']);
      assert.equal($(card, '.override-ed select'), null);
      assert.equal($(card, '.override-ed .power'), null);
      assert.doesNotMatch(text($(card, '.override-ed')), /Marche|Fonctionnement/);
      click(card, '.override[data-climate="climate.salon"]');
      assert.deepEqual(chips(card, '.override-ed'), ['Arrêt', 'Hors-gel', 'Éco', 'Confort', 'Boost ✓']);
    });

    test('Arrêt turns the override off, and nothing else', () => {
      const hass = setup({ overrides: { 'climate.salon': boost } });
      const card = cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]');
      click(card, '.override-ed [data-act="override-off"]');
      // Off from now, a week long without a next slot (the setting Turned off)
      assert.deepEqual(lastCall(hass).override, { target: OFF, start: new Date(at).toISOString(),
        end: new Date(new Date(at).getTime() + 7 * 24 * 3600000).toISOString() });
    });

    test('Ventilation sets the override to fan only, without setpoint; Chauffe tapped then heats again', () => {
      const hass = setup({ overrides: { 'climate.atelier': boost } });
      const card = cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]');
      click(card, '.override-ed [data-act="override-mode"][data-mode="fan_only"]');
      assert.deepEqual(lastCall(hass).override, { target: FAN, ...span });
      hass.push({ ...hass.data, overrides: { 'climate.atelier': { target: FAN, ...span } } });
      assert.deepEqual(modes(card), ['Arrêt', 'Chauffe', 'Clim', 'Ventilation ✓']);
      assert.equal($(card, '.override-ed .presets'), null);
      assert.equal($(card, '.override-ed [data-override-temperature]'), null);
      click(card, '.override-ed [data-act="override-mode"][data-mode="heat"]');
      assert.deepEqual(lastCall(hass).override.target, { ...OWN('comfort'), hvac_mode: 'heat' });
      assert.equal(lastCall(hass).override.preset, 'comfort');
    });

    test('Ventilation during a fan-only slot resumes the schedule', () => {
      const hass = setup({ overrides: { 'climate.atelier': boost }, planned: { 'climate.atelier': { preset: null, hvac_mode: 'fan_only' } } });
      const card = cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]');
      click(card, '.override-ed [data-act="override-mode"][data-mode="fan_only"]');
      assert.equal(lastCall(hass).override, null);
    });

    test('a preset tapped during an off override turns the thermostat on; a temperature typed too', () => {
      const hass = setup({ overrides: { 'climate.salon': offOverride } });
      const card = cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]');
      assert.deepEqual(chips(card, '.override-ed'), ['Arrêt ✓', 'Hors-gel', 'Éco', 'Confort', 'Boost']);
      click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]');
      // On from now, for the override duration
      assert.deepEqual(lastCall(hass).override, { target: { preset_mode: 'comfort' }, preset: 'comfort',
        start: new Date(at).toISOString(), end: new Date(new Date(at).getTime() + 2 * 3600000).toISOString() });
      change($(card, '.override-ed [data-override-temperature]'), '21');
      assert.deepEqual(lastCall(hass).override.target, { temperature: 21 });
      // In the more-info block too
      const el = moreInfo(hass);
      $(el, '[data-act="override-preset"][data-preset="eco"]').click();
      assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'eco' });
    });

    test('Arrêt on an "on" override during an off slot resumes the schedule', () => {
      const hass = setup({ overrides: { 'climate.salon': boost }, planned: { 'climate.salon': { preset: null, hvac_mode: 'off' } } });
      const card = cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]');
      click(card, '.override-ed [data-act="override-off"]');
      assert.equal(lastCall(hass).override, null);
    });

    test('an air conditioner switched to cool by hand keeps cooling when a preset is tapped or a temperature typed; its chips are in their cool colors', () => {
      const cooling = { target: { hvac_mode: 'cool', fan_mode: '2' }, ...span };
      const hass = setup({ overrides: { 'climate.atelier': cooling } });
      const card = cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]');
      assert.equal($(card, '.override-ed [data-act="override-preset"][data-preset="eco"]').style.background, rgb(derivedCoolColor(PRESET_COLORS.eco)));
      click(card, '.override-ed [data-act="override-preset"][data-preset="eco"]');
      assert.deepEqual(lastCall(hass).override.target, { ...OWN('eco'), hvac_mode: 'cool' });
      change($(card, '.override-ed [data-override-temperature]'), '24');
      assert.deepEqual(lastCall(hass).override.target, { hvac_mode: 'cool', temperature: 24 });
      assert.equal(lastCall(hass).override.preset, undefined);
    });

    test('"then Arrêt (schedule)" after an override, an off override included: an override never ends because a slot meets it', () => {
      mock.timers.setTime(new Date('2026-10-12T21:30:00+02:00').getTime());
      const evening = { start: '2026-10-12T20:30:00+02:00', end: '2026-10-12T22:00:00+02:00' };
      const heating = moreInfo(setup({ overrides: { 'climate.salon': { ...boost, ...evening } } }));
      assert.match(text(heating.shadowRoot), /puis Arrêt \(planning\)/);
      cleanup();
      const off = moreInfo(setup({ overrides: { 'climate.salon': { ...offOverride, ...evening } } }));
      assert.match(text($(off, '.status')), /aujourd'hui, puis Arrêt/);
    });

    test('on a thermostat card the block is folded: the override, its end and Resume; Change unfolds the rest', () => {
      const hass = setup({ overrides: { 'climate.salon': boost } });
      const tc = thermostatCard(hass);
      const block = $(tc, 'chauffage-moreinfo');
      const fold = $(block, '.status details.change');
      assert.equal(fold.open, false);
      assert.equal(text(fold.querySelector('summary')), 'Modifier');
      assert.ok(fold.querySelector('.presets') && fold.querySelector('[data-override-temperature]') && fold.querySelector('[data-min="30"]'));
      assert.ok($(block, '.status [data-act="override-del"]') && !fold.querySelector('[data-act="override-del"]'), 'Resume stays in sight');
      assert.ok($(block, '.status input.time'), 'and the end');
      // Unfolded, it stays so when the block is drawn again
      fold.open = true;
      fold.dispatchEvent(new window.Event('toggle'));
      block._render();
      assert.equal($(block, '.status details.change').open, true);
      // In the more-info dialog, everything shows
      assert.equal($(moreInfo(hass), '.status details.change'), null);
    });

    test('the temperature field shows the user\'s decimal separator, and reads both', () => {
      const hass = setup({ overrides: { 'climate.salon': { target: { temperature: 21.5 }, ...span } } });
      const card = cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]');
      const field = $(card, '.override-ed [data-override-temperature]');
      assert.equal(field.value, '21,5');
      change(field, '22,5');
      assert.deepEqual(lastCall(hass).override.target, { temperature: 22.5 });
    });
  });

  describe('a new off override lasts as the setting End of off overrides says', () => {
    const next = '2026-10-12T17:30:00+02:00';
    const turnOff = (settings, planned = { preset: 'eco', hvac_mode: null, next_slot_end: next }) => {
      mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') });
      const hass = setup({ planned: { 'climate.salon': planned } });
      const card = cardOf(hass, { show: ['climate.salon'] });
      hass.push({ ...hass.data, ...settings });
      card._overrideSel = { climate: 'climate.salon', create: true };
      card._render();
      click(card, '.override-ed [data-act="override-off"]');
      return lastCall(hass).override;
    };
    afterEach(() => mock.timers.reset());

    test('until the next slot by default, however far (#77 without a script)', () => {
      const override = turnOff({});
      assert.deepEqual(override.target, OFF);
      assert.deepEqual([override.end, override.ends_at], [next, 'next_slot']);
    });

    test('a week without a next slot', () => {
      const override = turnOff({}, { preset: 'eco', hvac_mode: null });
      assert.deepEqual([override.end, override.ends_at], ['2026-10-19T08:00:00.000Z', undefined]);
    });

    test('for the override duration', () => {
      const override = turnOff({ off_override_end: 'duration' });
      assert.deepEqual([override.end, override.ends_at], ['2026-10-12T10:00:00.000Z', undefined]);
    });

    test('for the override duration, or less if a slot starts first', () => {
      assert.equal(turnOff({ off_override_end: 'next_slot_within_duration' }).end, '2026-10-12T10:00:00.000Z');
      mock.timers.reset();
      cleanup();
      const sooner = '2026-10-12T11:00:00+02:00';
      const override = turnOff({ off_override_end: 'next_slot_within_duration' }, { preset: 'eco', hvac_mode: null, next_slot_end: sooner });
      assert.deepEqual([override.end, override.ends_at], [sooner, 'next_slot']);
    });

    test('an integration older than the setting: the override duration, as before', () => {
      assert.equal(turnOff({ off_override_end: undefined }).end, '2026-10-12T10:00:00.000Z');
    });
  });

  describe('the end "until tomorrow" of an off override is the next morning', () => {
    const offOverride = { target: OFF, start: '2026-10-18T01:00:00+02:00', end: '2026-10-18T03:00:00+02:00' };
    const open = (planned, at, override = offOverride) => {
      mock.timers.enable({ apis: ['Date'], now: new Date(at) });
      const hass = setup({ overrides: { 'climate.salon': override }, planned: { 'climate.salon': { preset: 'eco', hvac_mode: null, next_preset: 'comfort', ...planned } } });
      const card = cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]');
      return card;
    };
    const weekday = { next_start: '2026-10-13T06:30:00+02:00', next_slot_end: '2026-10-12T22:30:00+02:00', next_day_slot_end: '2026-10-13T06:30:00+02:00' };
    afterEach(() => mock.timers.reset());

    test('"Jusqu\'à demain 06:30" on a weekday evening sets the end to the morning\'s slot', () => {
      const card = open(weekday, '2026-10-12T22:00:00+02:00', { target: OFF, start: '2026-10-12T21:30:00+02:00', end: '2026-10-12T23:30:00+02:00' });
      const button = $(card, '.override-ed [data-act="override-tomorrow"]');
      assert.equal(text(button), 'Jusqu\'à demain 06:30');
      button.click();
      assert.equal(lastCall(card._hass).override.end, '2026-10-13T06:30:00+02:00');
      assert.equal(lastCall(card._hass).override.ends_at, undefined);
    });

    test('not on an override that heats, nor when the override already ends then', () => {
      const evening = { start: '2026-10-12T21:30:00+02:00', end: '2026-10-12T23:30:00+02:00' };
      const heating = open(weekday, '2026-10-12T22:00:00+02:00', { target: { preset_mode: 'boost' }, ...evening });
      assert.ok($(heating, '.override-ed [data-act="override-add"]'));
      assert.equal($(heating, '.override-ed [data-act="override-tomorrow"]'), null);
      cleanup();
      mock.timers.reset();
      const ends = open(weekday, '2026-10-12T22:00:00+02:00', { target: OFF, ...evening, end: '2026-10-13T06:30:00+02:00' });
      assert.ok($(ends, '.override-ed [data-act="override-add"]'));
      assert.equal($(ends, '.override-ed [data-act="override-tomorrow"]'), null);
    });

    test('hidden when it is the next slot\'s instant: at 01:30 on Sunday, one button, "Jusqu\'à 08:00 (prochain créneau)"', () => {
      const card = open({ next_start: '2026-10-18T08:00:00+02:00', next_slot_end: '2026-10-18T08:00:00+02:00', next_day_slot_end: '2026-10-18T08:00:00+02:00' }, '2026-10-18T01:30:00+02:00');
      assert.equal($(card, '.override-ed [data-act="override-tomorrow"]'), null);
      assert.equal(text($(card, '.override-ed [data-act="override-next-slot"]')), 'Jusqu\'à 08:00 (prochain créneau)');
    });

    test('named by its day when it is not tomorrow: "Jusqu\'à lundi 06:30" on Saturday evening with a flat Sunday', () => {
      const card = open({ next_start: '2026-10-19T06:30:00+02:00', next_slot_end: '2026-10-17T23:00:00+02:00', next_day_slot_end: '2026-10-19T06:30:00+02:00' }, '2026-10-17T22:00:00+02:00');
      assert.equal(text($(card, '.override-ed [data-act="override-tomorrow"]')), 'Jusqu\'à lundi 06:30');
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The presets have a cooling temperature. The card shows the
// suite.
{
  const { SALON, SUITE, TARGETS, both, cardOf, mode, modeRow, presetRow, setup } = everyHvacMode;

  describe('an override has the same two rows', () => {
    const sent = (hass) => hass.events.at(-1).override;
    const open = (hass) => { const card = cardOf(hass); card._overrideSel = { climate: SUITE, create: true }; card._render(); return card; };
    const PLANNED = { [SUITE]: { preset: 'comfort', hvac_mode: 'heat' } };

    test('a new override starts on the HVAC mode planned, with the presets it can use', () => {
      const card = open(setup({ planned: { [SUITE]: { preset: 'comfort', hvac_mode: 'cool' } } }));
      // Nothing is chosen yet: Cool, the HVAC mode planned, is the default
      assert.deepEqual(modeRow(card, '.override-ed'), ['Arrêt', 'Chauffe', 'Clim', 'Chauffe/Clim', 'Déshum.', 'Auto', 'Ventilation']);
      assert.equal($(card, '.override-ed .mode-row .default').dataset.mode, 'cool');
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
      assert.equal(text($(card, '.override-ed .override-value')), 'Chauffe/Clim · 19–24,5 °C');
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
}

// Weeks stored before #91, whose slots say no HVAC mode: the salon, a heater, the atelier, which
// heats and cools, and the combles, which only cool. The card shows the atelier.
{
  const { ATELIER, COMBLES, OFF, OWN, SALON, cardOf, setup } = weeksBefore91;

  describe('the override block of an air conditioner says heat or cool', () => {
    const span = { start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const boost = { target: { preset_mode: 'boost' }, preset: 'boost', ...span };
    const planned = (mode) => ({ [ATELIER]: { preset: 'comfort', hvac_mode: mode }, [COMBLES]: { preset: 'eco', hvac_mode: 'cool' }, [SALON]: { preset: 'eco', hvac_mode: null } });
    const row = (card) => $$(card, '.override-ed .mode-row [data-mode="heat"], .override-ed .mode-row [data-mode="cool"]').map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' || b.classList.contains('default') ? ' ✓' : ''}`); // chosen, or the default of a new override
    const sent = (hass) => hass.events.at(-1).override;
    const open = (card, climate) => { card._action('override-new', { climate }); };
    const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
    beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
    afterEach(() => mock.timers.reset());

    test('a new override starts in the HVAC mode of the slot planned now', () => {
      const hass = setup({ planned: planned('cool') });
      const card = cardOf(hass);
      open(card, ATELIER);
      assert.deepEqual(row(card), ['Chauffe', 'Clim ✓']);
      click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]');
      assert.deepEqual(sent(hass).target, { ...OWN('boost'), hvac_mode: 'cool' });
      assert.equal(sent(hass).preset, 'boost');
    });

    test('a temperature typed carries the HVAC mode too', () => {
      const hass = setup({ planned: planned('heat') });
      const card = cardOf(hass);
      open(card, ATELIER);
      assert.deepEqual(row(card), ['Chauffe ✓', 'Clim']);
      change($(card, '.override-ed [data-override-temperature]'), '22');
      assert.deepEqual(sent(hass).target, { temperature: 22, hvac_mode: 'heat' });
    });

    test('Clim tapped on an override to a preset keeps the preset, in cool, until the same end', () => {
      const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: boost } });
      const card = cardOf(hass);
      click(card, `.override[data-climate="${ATELIER}"]`);
      assert.deepEqual(row(card), ['Chauffe ✓', 'Clim'], 'an override that says none: the planned HVAC mode');
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]');
      assert.deepEqual(sent(hass), { target: { ...OWN('boost'), hvac_mode: 'cool' }, preset: 'boost', ...span });
    });

    test('Clim tapped without an override starts one on the planned preset, in cool', () => {
      const hass = setup({ planned: planned('heat') });
      const card = cardOf(hass);
      open(card, ATELIER);
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]');
      assert.deepEqual(sent(hass).target, { ...OWN('comfort'), hvac_mode: 'cool' });
      assert.equal(sent(hass).preset, 'comfort');
    });

    test('during an off slot, the thermostat\'s own HVAC mode is the default, else heat', () => {
      const hass = setup({ planned: { [ATELIER]: { preset: null, hvac_mode: 'off' } } });
      hass.states[ATELIER].state = 'cool';
      const card = cardOf(hass);
      open(card, ATELIER);
      assert.deepEqual(row(card), ['Chauffe', 'Clim ✓']);
      hass.states[ATELIER].state = 'off';
      card._render();
      assert.deepEqual(row(card), ['Chauffe ✓', 'Clim']);
    });

    test('the override of a unit that only cools cools; a heater\'s override says no HVAC mode', () => {
      const hass = setup({ planned: planned('heat') });
      const card = cardOf(hass, { show: [COMBLES, SALON] });
      open(card, COMBLES);
      assert.deepEqual(row(card), ['Clim ✓']);
      click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]');
      assert.deepEqual(sent(hass).target, { temperature: 21, cool_temperature: 23, hvac_mode: 'cool' });
      open(card, SALON);
      assert.deepEqual(row(card), []);
      click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]');
      assert.deepEqual(sent(hass).target, { preset_mode: 'boost' });
    });

    test('while Arrêt is chosen, the temperature field and the presets are hidden', () => {
      const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: { target: OFF, ...span } } });
      const card = cardOf(hass);
      click(card, `.override[data-climate="${ATELIER}"]`);
      assert.equal($(card, '.override-ed [data-override-temperature]'), null);
      assert.equal($(card, '.override-ed .presets'), null);
      assert.equal($(card, '.override-ed .mode-row [data-mode="off"]').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(row(card), ['Chauffe', 'Clim']);
      // Chauffe turns it back on, on the preset planned
      click(card, '.override-ed [data-act="override-mode"][data-mode="heat"]');
      assert.deepEqual(sent(hass).target, { ...OWN('comfort'), hvac_mode: 'heat' });
    });

    test('an off override says its end in a few words', () => {
      const end = '2026-10-13T06:30:00+02:00';
      const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: { target: OFF, start: span.start, end, ends_at: 'next_slot' } } });
      const card = cardOf(hass);
      click(card, `.override[data-climate="${ATELIER}"]`);
      assert.equal(text($(card, '.override-ed .ed-head .muted')), 'demain, puis Éco');
      assert.match(text($(card, '.override-ed')), /Arrêt.*jusqu'à.*demain, puis Éco/);
    });

    test('an override to a preset that sends no setpoint in cool says so, and does not show its heating temperature', () => {
      // Frost protection on a unit that only cools: 7 °C is never sent, the unit keeps its 26 °C
      const frost = { target: { temperature: 7, hvac_mode: 'cool' }, preset: 'frost', ...span };
      const hass = setup({ planned: planned('heat'), overrides: { [COMBLES]: frost } });
      const card = cardOf(hass, { show: [COMBLES] });
      click(card, `.override[data-climate="${COMBLES}"]`);
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '26');
      assert.equal(text($(card, '.override-ed .override-note')), 'Consigne inchangée');
      // With a cooling temperature: that one, and no note
      hass.data.targets[COMBLES].frost = { temperature: 7, cool_temperature: 28 };
      hass.push({ ...hass.data, overrides: { [COMBLES]: { ...frost, target: { temperature: 7, cool_temperature: 28, hvac_mode: 'cool' } } } });
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '28');
      assert.equal($(card, '.override-ed .override-note'), null);
      // A temperature the user typed is their own: shown as it is
      hass.push({ ...hass.data, overrides: { [COMBLES]: { target: { temperature: 23, hvac_mode: 'cool' }, ...span } } });
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '23');
      assert.equal($(card, '.override-ed .override-note'), null);
    });

    test('on a unit that heats and cools, the same override says "unchanged when cooling"', () => {
      const frost = { target: { temperature: 7, hvac_mode: 'cool' }, preset: 'frost', ...span };
      const card = cardOf(setup({ planned: planned('cool'), overrides: { [ATELIER]: frost } }));
      click(card, `.override[data-climate="${ATELIER}"]`);
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '20');
      assert.equal(text($(card, '.override-ed .override-note')), 'Consigne inchangée en clim');
    });

    test('the more-info block has the same row', () => {
      const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: boost } });
      const el = document.createElement('chauffage-moreinfo');
      document.body.appendChild(el);
      el.entity = ATELIER;
      el.hass = hass;
      assert.deepEqual($$(el, '.mode-row [data-mode="heat"], .mode-row [data-mode="cool"]').map(text), ['Chauffe', 'Clim']);
      $(el, '[data-act="override-mode"][data-mode="cool"]').click();
      assert.deepEqual(sent(hass).target, { ...OWN('boost'), hvac_mode: 'cool' });
      // Its week draws the slots as they run on the air conditioner
      assert.ok($(el, '.bar.big .seg ha-icon[icon="mdi:fire"]'));
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and a valve that lists heat and auto. The card shows the suite. It is Monday, 10:00.
{
  const { SALON, SUITE, VANNE, ascending, at, both, cardOf, mode, modeRow, moreInfo, onMondayAtTen, order, override, sent, setup } = suiteAndValve;

  describe('a new override', () => {
    onMondayAtTen();
    const PLANNED = { [SUITE]: { preset: 'comfort', hvac_mode: 'cool', next_slot_end: at('17:30') } };
    const open = (hass, climate = SUITE) => { const card = cardOf(hass, { show: [climate] }); card._overrideSel = { climate, create: true }; card._render(); return card; };

    test('shows the HVAC mode planned as the default, not as chosen', () => {
      const card = open(setup({ planned: PLANNED }));
      assert.deepEqual(modeRow(card, '.override-ed'), ['Arrêt', 'Chauffe', 'Clim (default)', 'Chauffe/Clim', 'Déshum.', 'Auto', 'Ventilation']);
      assert.equal($(card, '.override-ed .mode-row .on'), null);
    });

    test('says the end it will have before the first tap', () => {
      const card = open(setup({ planned: PLANNED }));
      // The end of the HVAC mode it would take, then the end of Off, which differs
      assert.equal(text($(card, '.override-ed .end-new')), "jusqu'à 12:00 (2 h) · Arrêt : jusqu'à 17:30");
    });

    test('says its end in the more-info block and on a thermostat card too', () => {
      const el = moreInfo(setup({ planned: PLANNED }), SUITE);
      el.shadowRoot.querySelector('[data-new-override]').click();
      assert.match(text(el.shadowRoot.querySelector('.end-new')), /^jusqu'à 12:00 \(2 h\)/);
      assert.ok(el.shadowRoot.querySelector('.mode-row .default') && !el.shadowRoot.querySelector('.mode-row .on'));
    });

    test('on a valve that lists heat and auto, a preset tapped says no HVAC mode: the valve keeps auto', () => {
      const hass = setup({ planned: { [VANNE]: { preset: 'eco' } } });
      const card = open(hass, VANNE);
      assert.deepEqual(modeRow(card, '.override-ed'), ['Arrêt', 'Chauffe', 'Auto (default)']);
      click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]');
      assert.deepEqual(sent(hass).target, { temperature: 20 });
      // The temperature typed says none either
      const typed = open(setup({ planned: { [VANNE]: { preset: 'eco' } } }), VANNE);
      const field = $(typed, '.override-ed [data-override-temperature]');
      field.value = '21';
      field.dispatchEvent(new window.Event('change', { bubbles: true }));
      assert.deepEqual(sent(typed._hass).target, { temperature: 21 });
      // Heat tapped says heat
      const tapped = open(setup({ planned: { [VANNE]: { preset: 'eco' } } }), VANNE);
      mode(tapped, 'heat', '.override-ed');
      assert.equal(sent(tapped._hass).target.hvac_mode, 'heat');
    });

    test('an override without an HVAC mode on the valve shows the HVAC mode it runs in', () => {
      const hass = setup({ planned: { [VANNE]: { preset: 'eco' } }, overrides: { [VANNE]: override({ temperature: 20 }, { preset: 'comfort' }) } });
      const card = cardOf(hass, { show: [VANNE] });
      card._overrideSel = { climate: VANNE };
      card._render();
      assert.deepEqual(modeRow(card, '.override-ed'), ['Arrêt', 'Chauffe', 'Auto ✓']);
      assert.ok($(card, '.override-ed [data-act="override-preset"][data-preset="comfort"].on'));
    });
  });

  describe('the override block goes from the HVAC mode to the end', () => {
    onMondayAtTen();
    const PLANNED = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_slot_end: at('14:00') } };
    const COOL = { [SUITE]: override({ ...both(20, 25), hvac_mode: 'cool' }, { preset: 'comfort' }) };
    const PARTS = ['.mode-row', '.presets', '[data-override-temperature]', '.end-block'];

    test('in the card: the HVAC mode, the preset, the temperature, then one block for the end', () => {
      const card = cardOf(setup({ planned: PLANNED, overrides: COOL }));
      card._overrideSel = { climate: SUITE };
      card._render();
      const editor = $(card, '.override-ed');
      assert.ok(ascending(order(editor, PARTS)), `${order(editor, PARTS)}`);
      const end = $(card, '.override-ed .end-block');
      assert.ok(end.querySelector('[data-override-end]') && end.querySelector('[data-act="override-add"]') && end.querySelector('[data-act="override-next-slot"]'));
    });

    test('in the more-info block and on a thermostat card', () => {
      for (const embedded of [false, true]) {
        const el = moreInfo(setup({ planned: PLANNED, overrides: COOL }), SUITE, embedded);
        assert.ok(ascending(order(el.shadowRoot, PARTS)), `${order(el.shadowRoot, PARTS)}`);
        const end = el.shadowRoot.querySelector('.end-block');
        assert.ok(end.querySelector('[data-override-end]') && end.querySelector('[data-min="60"]') && end.querySelector('[data-act="override-next-slot"]'));
      }
    });

    test('the temperature has a − and a +, on the thermostat\'s step', () => {
      const hass = setup({ planned: PLANNED, overrides: { [SUITE]: override({ temperature: 21, hvac_mode: 'heat' }) }, step: 1 });
      const card = cardOf(hass);
      card._overrideSel = { climate: SUITE };
      card._render();
      assert.equal($(card, '.override-ed .pv-temp [data-override-temperature]').value, '21');
      click(card, '.override-ed .pv-temp [data-act="override-step"][data-dir="1"]');
      assert.deepEqual(sent(hass).target, { temperature: 22, hvac_mode: 'heat' });
      const el = moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: override({ temperature: 21, hvac_mode: 'heat' }) } }), SUITE);
      el.shadowRoot.querySelector('.pv-temp [data-dir="-1"]').click();
      assert.deepEqual(sent(el._hass).target, { temperature: 20.5, hvac_mode: 'heat' });
    });
  });

  describe('an override names its HVAC mode on a thermostat that lists more than one', () => {
    onMondayAtTen();
    const PLANNED = { [SUITE]: { preset: 'eco', hvac_mode: 'heat' }, [SALON]: { preset: 'eco' } };
    const COOL = override({ ...both(20, 25), hvac_mode: 'cool' }, { preset: 'comfort', end: at('14:00') });
    // At 14:00 the suite's week plans Comfort, in heat

    test('the more-info block: "Clim · Confort 25°"; on a thermostat card, until when and what comes next', () => {
      const el = moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }), SUITE);
      assert.equal(text(el.shadowRoot.querySelector('.override-value')), '⏱ Clim · Confort 25°');
      const embedded = moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }), SUITE, true);
      assert.equal(text(embedded.shadowRoot.querySelector('.override-until')), '⏱ jusqu\'à 14:00, puis Chauffage · Confort');
    });

    test('the thermostat card\'s header', () => {
      const card = document.createElement('chauffage-thermostat-card');
      card.setConfig({ type: 'custom:chauffage-thermostat-card', entity: SUITE });
      document.body.appendChild(card);
      card.hass = setup({ planned: PLANNED, overrides: { [SUITE]: COOL } });
      assert.equal(text($(card, '.tc-state')), '⏱ Clim · Confort 25°');
    });

    test('the thermostat card\'s header names the HVAC mode of an override to a temperature too', () => {
      const card = document.createElement('chauffage-thermostat-card');
      card.setConfig({ type: 'custom:chauffage-thermostat-card', entity: SUITE });
      document.body.appendChild(card);
      card.hass = setup({ planned: PLANNED, overrides: { [SUITE]: override({ temperature: 26, hvac_mode: 'cool' }, { end: at('14:00') }) } });
      assert.equal(text($(card, '.tc-state')), '⏱ Clim · 26 °C');
    });

    test('the end of an override names the HVAC mode of the slot that follows', () => {
      const el = moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.end-block .muted')), /puis Chauffage · Confort \(planning\)$/);
    });

    test('the override on the week, and its tooltip', () => {
      const card = cardOf(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }));
      const badge = $(card, `.override[data-climate="${SUITE}"]`);
      assert.equal(badge.getAttribute('title'), 'Dérogation : Clim · Confort 25° jusqu\'à 14:00, puis Chauffe · Confort');
      // On the week: the icon of its HVAC mode and its end. The tooltip and its popover name it
      assert.match(text(badge.querySelector('.override-label')), /^⏱ → 14:00$/);
      assert.equal(badge.querySelector('.override-label ha-icon').getAttribute('icon'), 'mdi:snowflake');
    });

    test('the schedule followed names the HVAC mode too', () => {
      const planned = { [SUITE]: { preset: 'comfort', hvac_mode: 'cool', next_preset: 'eco', next_hvac_mode: 'heat', next_start: at('17:30') } };
      const el = moreInfo(setup({ planned }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status')), /Suit le planning : Climatisation · Confort jusqu'à 17:30, puis Chauffage · Éco/);
    });

    test('a heater names no HVAC mode', () => {
      const hass = setup({ planned: PLANNED, overrides: { [SALON]: override({ temperature: 20 }, { preset: 'comfort', end: at('14:00') }) } });
      const el = moreInfo(hass, SALON);
      assert.equal(text(el.shadowRoot.querySelector('.override-value')), '⏱ Confort 20°');
      assert.equal(text(moreInfo(hass, SALON, true).shadowRoot.querySelector('.override-until')), '⏱ jusqu\'à 14:00, puis Confort');
    });

    test('off and dry say themselves', () => {
      const el = moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: override({ hvac_mode: 'dry' }, { end: at('14:00') }) } }), SUITE);
      assert.equal(text(el.shadowRoot.querySelector('.override-value')), '⏱ Déshum.');
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The card shows the salon. It is Monday, 10:00.
{
  const { NOW, SALON, SUITE, TARGETS, at, block, cardOf, moreInfo, onMondayAtTen, openOverride, override, select, sent, setup, thermostatCard } = suiteAndCombles;

  describe('an override that changes kind gets the end of its new kind', () => {
    onMondayAtTen();
    // Off since 09:30, until the next slot at 14:00 (the setting Turned off)
    const off = override({ hvac_mode: 'off' }, { end: at('14:00'), ends_at: 'next_slot' });
    const planned = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_slot_end: at('14:00') } };
    const open = (hass) => { const card = cardOf(hass, { show: [SUITE] }); card._overrideSel = { climate: SUITE }; card._render(); return card; };

    test('an off override set to Cool lasts the override duration from now', () => {
      const hass = setup({ overrides: { [SUITE]: off }, planned });
      const card = open(hass);
      click(card, '.override-ed .mode-row [data-mode="cool"]');
      const d = sent(hass);
      assert.equal(d.target.hvac_mode, 'cool');
      assert.equal(new Date(d.start).toISOString(), new Date(NOW).toISOString());
      assert.equal(new Date(d.end).toISOString(), new Date(at('12:00')).toISOString());
      assert.equal(d.ends_at, undefined);
    });

    test('an off override set to a preset or to a temperature too', () => {
      const hass = setup({ overrides: { [SALON]: off }, planned: { [SALON]: { preset: 'eco', next_slot_end: at('14:00') } } });
      const card = cardOf(hass);
      card._overrideSel = { climate: SALON };
      card._render();
      click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]');
      assert.equal(new Date(sent(hass).end).toISOString(), new Date(at('12:00')).toISOString());
      assert.equal(sent(hass).ends_at, undefined);
    });

    test('an override turned off ends as the setting Turned off says', () => {
      const hass = setup({ overrides: { [SUITE]: override({ temperature: 22, hvac_mode: 'heat' }) }, planned });
      const card = open(hass);
      click(card, '.override-ed .mode-row [data-mode="off"]');
      const d = sent(hass);
      assert.deepEqual(d.target, { hvac_mode: 'off' });
      assert.equal(new Date(d.end).toISOString(), new Date(at('14:00')).toISOString());
      assert.equal(d.ends_at, 'next_slot');
    });

    test('an override that stays on keeps its end', () => {
      const hass = setup({ overrides: { [SUITE]: override({ temperature: 22, hvac_mode: 'heat' }) }, planned });
      const card = open(hass);
      click(card, '.override-ed .mode-row [data-mode="cool"]');
      assert.equal(sent(hass).end, at('11:30'));
      assert.equal(sent(hass).start, at('09:30'));
    });

    test('in the more-info block too', () => {
      const hass = setup({ overrides: { [SUITE]: off }, planned });
      const el = moreInfo(hass, SUITE);
      el.shadowRoot.querySelector('.mode-row [data-mode="cool"]').click();
      assert.equal(new Date(sent(hass).end).toISOString(), new Date(at('12:00')).toISOString());
    });
  });

  describe('the HVAC mode a new override would take', () => {
    onMondayAtTen();
    test('is outlined in a neutral color, not in the color of a chosen HVAC mode', () => {
      const card = cardOf(setup({ planned: { [SUITE]: { preset: 'eco', hvac_mode: 'heat' } } }), { show: [SUITE] });
      card._overrideSel = { climate: SUITE, create: true };
      card._render();
      const preselected = $(card, '.override-ed .mode-row .mode.default');
      assert.equal(preselected.dataset.mode, 'heat');
      assert.equal(preselected.getAttribute('style'), null, 'no HVAC color');
      assert.equal(preselected.getAttribute('aria-pressed'), 'false');
      assert.equal($(card, '.override-ed .mode-row .mode.on'), null);
      assert.match(CHIP_STYLE, /\.mode-row \.mode\.default \{[^}]*dashed/);
      assert.doesNotMatch(CHIP_STYLE, /\.mode-row \.mode\.default \{[^}]*--mode-color/);
    });
  });

  describe('the HVAC modes: short names in labels, full names in sentences', () => {
    onMondayAtTen();
    const cooling = { [SUITE]: override({ temperature: 24, hvac_mode: 'cool' }) };
    const planned = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_preset: 'comfort', next_hvac_mode: 'cool', next_start: at('14:00') } };

    test('an override reads "Clim" in the more-info block, as its first row', () => {
      const el = moreInfo(setup({ overrides: cooling, planned }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.override-value')), /Clim · 24/);
      assert.doesNotMatch(text(el.shadowRoot.querySelector('.override-value')), /Climatisation/);
      assert.equal(text(el.shadowRoot.querySelector('.mode-row [data-mode="cool"]')), 'Clim');
    });

    test('what the schedule plans is a sentence: the names in full', () => {
      const el = moreInfo(setup({ planned }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status')), /Chauffage · Éco jusqu'à 14:00, puis Climatisation · Confort/);
    });

    test('a sentence says them in the words of Home Assistant when it gives them', () => {
      const hass = setup({ planned });
      hass.formatEntityState = (st, state) => ({ off: 'Éteint', heat: 'Chauffage', cool: 'Refroidissement' })[state] || state;
      const el = moreInfo(hass, SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status')), /puis Refroidissement · Confort/);
    });

    test('a thermostat card names the override with the short name', () => {
      const hass = setup({ overrides: cooling, planned });
      const card = document.createElement('chauffage-thermostat-card');
      card.setConfig({ entity: SUITE });
      document.body.appendChild(card);
      card.hass = hass;
      assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Clim · 24/);
      assert.doesNotMatch(text(card.shadowRoot.querySelector('.tc-state')), /Climatisation/);
    });

    test('the schedule card keeps the short names', () => {
      const card = cardOf(setup({ overrides: cooling, planned }), { show: [SUITE] });
      card._overrideSel = { climate: SUITE };
      card._render();
      assert.match(text($(card, '.override-ed .override-value')), /^Clim · 24/);
    });
  });

  describe('the line of the setpoint', () => {
    onMondayAtTen();
    test('says the setpoint, then a button to the presets tab for an administrator', () => {
      const card = cardOf(setup(), { show: [SUITE] });
      select(card, SUITE, 1);
      const line = $(card, '.editor .setpoint-line');
      assert.equal(text(line.querySelector('.slot-setpoint')), 'Consigne : 20 °C');
      const edit = line.querySelector('.setpoint-edit');
      assert.equal(text(edit), 'Régler');
      assert.equal(edit.dataset.navigate, `/chauffage/presets?thermostat=${encodeURIComponent(SUITE)}`);
      assert.equal(edit.getAttribute('role'), 'link');
    });

    test('without the button for a user who is not an administrator', () => {
      const hass = setup();
      hass.user = { is_admin: false };
      const card = cardOf(hass, { show: [SUITE] });
      card._sel = { climate: SUITE, day: 0, idx: 1 };
      card._render();
      const line = $(card, '.editor .setpoint-line');
      if (line) {
        assert.equal(text(line), 'Consigne : 20 °C');
        assert.equal(line.querySelector('.setpoint-edit'), null);
      }
    });

    test('the range of a heat/cool override is the same line', () => {
      const hass = setup({ overrides: { [SUITE]: override({ ...TARGETS[SUITE].comfort, hvac_mode: 'heat_cool' }, { preset: 'comfort' }) } });
      const card = cardOf(hass, { show: [SUITE] });
      card._overrideSel = { climate: SUITE };
      card._render();
      assert.equal(text($(card, '.override-ed .setpoint-line')), 'Consigne : 20–25 °C');
    });
  });

  describe('a thermostat card keeps its override block unfolded after an action from it', () => {
    onMondayAtTen();
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

  describe('the HVAC mode an override already has, tapped again', () => {
    onMondayAtTen();
    const fan = override({ hvac_mode: 'fan_only' });

    test('changes nothing', () => {
      const hass = setup({ overrides: { [SUITE]: fan } });
      const card = openOverride(hass, SUITE);
      const before = hass.events.length;
      click(card, '.override-ed .mode-row [data-mode="fan_only"]');
      for (const e of hass.events.slice(before)) assert.deepEqual(e.override.target, { hvac_mode: 'fan_only' });
    });

    test('in the more-info block too', () => {
      const hass = setup({ overrides: { [SUITE]: fan } });
      const el = moreInfo(hass, SUITE);
      const before = hass.events.length;
      el.shadowRoot.querySelector('.mode-row [data-mode="fan_only"]').click();
      for (const e of hass.events.slice(before)) assert.deepEqual(e.override.target, { hvac_mode: 'fan_only' });
    });
  });

  describe('Off tapped for a new override while the schedule plans off', () => {
    onMondayAtTen();
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
    onMondayAtTen();
    const planned = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_slot_end: at('14:00') } };

    test('says the end of Off too, when Off ends at another time', () => {
      const card = openOverride(setup({ planned }), SUITE);
      assert.equal(text($(card, '.override-ed .end-new')), "jusqu'à 12:00 (2 h) · Arrêt : jusqu'à 14:00");
    });

    test('is one end when Off ends at the same time', () => {
      const hass = setup({ planned });
      hass.data.off_override_end = 'duration';
      const card = openOverride(hass, SUITE);
      assert.equal(text($(card, '.override-ed .end-new')), "jusqu'à 12:00 (2 h)");
    });

    test('an override that is on says the end Off would give it', () => {
      const card = openOverride(setup({ planned, overrides: { [SUITE]: override({ temperature: 21, hvac_mode: 'heat' }) } }), SUITE);
      assert.equal(text($(card, '.override-ed .off-end')), "Arrêt : jusqu'à 14:00");
    });

    test('an off override says nothing more', () => {
      const card = openOverride(setup({ planned, overrides: { [SUITE]: override({ hvac_mode: 'off' }) } }), SUITE);
      assert.equal($(card, '.override-ed .off-end'), null);
    });

    test('the more-info block says it too', () => {
      const el = moreInfo(setup({ planned }), SUITE);
      el.shadowRoot.querySelector('[data-new-override]').click();
      assert.match(text(el.shadowRoot.querySelector('.end-new')), /· Arrêt : jusqu'à 14:00$/);
    });
  });

  describe('the line of the setpoint, when the temperature of a device preset is not known', () => {
    onMondayAtTen();
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
    onMondayAtTen();
    const dry = { [SUITE]: override({ hvac_mode: 'dry' }) };

    test('the more-info dialog says its end in the block of its end', () => {
      const el = moreInfo(setup({ overrides: dry }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status .override-value')), /Déshum\./);
      assert.equal(el.shadowRoot.querySelector('.status .override-until'), null);
    });

    test('a thermostat card names it in its header, and says until when under it', () => {
      const card = thermostatCard(setup({ overrides: dry }), SUITE);
      assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Déshum\./);
      const line = block(card).querySelector('.status .line');
      assert.equal(line.querySelector('.override-value'), null);
      assert.match(text(line), /^⏱ jusqu'à 11:30/);
    });

    test('a fan-only override names its HVAC mode alone, even with a fan stored by an older version', () => {
      const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'fan_only', fan_mode: 'high' }) } });
      const card = thermostatCard(hass, SUITE);
      assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Ventilation$/);
    });
  });

  describe('an override sets no fan and no vanes', () => {
    onMondayAtTen();
    // The comfort preset's value on the suite sets the fan: a slot sends it, an override does not
    const targets = { ...TARGETS, [SUITE]: { ...TARGETS[SUITE], comfort: { ...TARGETS[SUITE].comfort, fan_mode: 'low', swing_mode: 'vertical' } } };

    test('a preset tapped for a new override sends no fan and no vanes', () => {
      const hass = setup({ targets });
      const card = openOverride(hass, SUITE);
      click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]');
      assert.equal(sent(hass).preset, 'comfort');
      assert.ok(!('fan_mode' in sent(hass).target) && !('swing_mode' in sent(hass).target));
    });

    test('an HVAC mode tapped for a new override sends no fan either', () => {
      const hass = setup({ targets, planned: { [SUITE]: { preset: 'comfort' } } });
      const card = openOverride(hass, SUITE);
      click(card, '.override-ed .mode-row [data-mode="cool"]');
      assert.ok(!('fan_mode' in sent(hass).target) && !('swing_mode' in sent(hass).target));
    });
  });
}
