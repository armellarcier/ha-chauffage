// The override block, in the card, the more-info dialog and the thermostat card (#91): the HVAC
// mode first, then the preset or the temperature, then the end.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup } from './helpers.mjs';
import { CHIP_STYLE, derivedCoolColor } from '../../frontend/src/index.ts';
import { $, $$, change, click, rgb, text } from './houses/dom.mjs';
import { openOverride as showOverride, redraw , settle } from './driver.mjs';
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

    test('the week view shows an off override with the off icon, the thermostat card as ⏱ Éteint, without setpoint', async () => {
      const hass = setup({ overrides: { 'climate.salon': offOverride } });
      hass.states['climate.salon'].attributes.temperature = 20;
      const card = await cardOf(hass, { show: ['climate.salon'] });
      assert.match(text($(card, '.override[data-climate="climate.salon"] .override-label')), /^⏱ → 11:30$/);
      assert.equal($(card, '.override[data-climate="climate.salon"] .override-label ha-icon').getAttribute('icon'), 'mdi:power');
      const tc = await thermostatCard(hass);
      assert.equal(text($(tc, '.tc-state')), '⏱ Éteint');
      assert.ok($(tc, '.tc-state').classList.contains('override'));
    });

    test('the HVAC modes then the presets on an air conditioner; one row of chips, Éteint first, on a heater: no Marche', async () => {
      const hass = setup({ overrides: { 'climate.atelier': boost, 'climate.salon': boost } });
      const card = await cardOf(hass, { show: ['climate.atelier', 'climate.salon'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      assert.deepEqual(modes(card), ['Éteint', 'Chauffe ✓', 'Clim', 'Ventilation']);
      assert.deepEqual(chips(card, '.override-ed'), ['Hors-gel', 'Éco', 'Confort', 'Boost ✓']);
      assert.equal($(card, '.override-ed select'), null);
      assert.equal($(card, '.override-ed .power'), null);
      assert.doesNotMatch(text($(card, '.override-ed')), /Marche|Fonctionnement/);
      click(card, '.override[data-climate="climate.salon"]'); await settle();
      assert.deepEqual(chips(card, '.override-ed'), ['Éteint', 'Hors-gel', 'Éco', 'Confort', 'Boost ✓']);
    });

    test('Éteint turns the override off, and nothing else', async () => {
      const hass = setup({ overrides: { 'climate.salon': boost } });
      const card = await cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]'); await settle();
      click(card, '.override-ed [data-act="override-off"]'); await settle();
      // Off from now, a week long without a next slot (the setting Turned off)
      assert.deepEqual(lastCall(hass).override, { target: OFF, start: new Date(at).toISOString(),
        end: new Date(new Date(at).getTime() + 7 * 24 * 3600000).toISOString() });
    });

    test('Ventilation sets the override to fan only, without setpoint; Chauffe tapped then heats again, at the setpoint shown', async () => {
      const hass = setup({ overrides: { 'climate.atelier': boost } });
      const card = await cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      click(card, '.override-ed [data-act="override-mode"][data-mode="fan_only"]'); await settle();
      assert.deepEqual(lastCall(hass).override, { target: FAN, ...span });
      hass.push({ ...hass.data, overrides: { 'climate.atelier': { target: FAN, ...span } } }); await settle();
      assert.deepEqual(modes(card), ['Éteint', 'Chauffe', 'Clim', 'Ventilation ✓']);
      assert.equal($(card, '.override-ed .presets'), null);
      assert.equal($(card, '.override-ed [data-override-temperature]'), null);
      click(card, '.override-ed [data-act="override-mode"][data-mode="heat"]'); await settle();
      assert.deepEqual(lastCall(hass).override.target, { temperature: 20, hvac_mode: 'heat' });
      assert.equal(lastCall(hass).override.preset, undefined);
    });

    test('an override to Boost shows the temperature of Boost, not the frost setpoint of an open window (#112)', async () => {
      const hass = setup({ overrides: { 'climate.salon': boost } });
      hass.states['climate.salon'].attributes.temperature = 7; // the window keeps it at its frost setpoint
      const card = await cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]'); await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '21');
      assert.equal($(await moreInfo(hass), '[data-override-temperature]').value, '21');
      // A new state of the thermostat, a moment later, leaves the field on Boost's temperature
      hass.states['climate.salon'] = { ...hass.states['climate.salon'], last_updated: '2' };
      card.hass = { ...hass }; await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '21');
    });

    test('an override to a preset whose temperature is not known follows the setpoint the thermostat shows', async () => {
      const hass = setup({ overrides: { 'climate.salon': boost } });
      hass.data.preset_temperatures = {};
      const card = await cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]'); await settle();
      hass.states['climate.salon'] = { ...hass.states['climate.salon'], attributes: { ...hass.states['climate.salon'].attributes, temperature: 22 }, last_updated: '2' };
      card.hass = { ...hass }; await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '22');
    });

    test('Clim, 22 °C typed, then Ventilation, then Clim: the override cools at the 22 °C the thermostat shows (#112)', async () => {
      const hass = setup({ overrides: { 'climate.atelier': boost } });
      const card = await cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      const follow = () => hass.push({ ...hass.data, overrides: { 'climate.atelier': { ...lastCall(hass).override } } });
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]'); await settle();
      follow();
      change($(card, '.override-ed [data-override-temperature]'), '22'); await settle();
      follow();
      click(card, '.override-ed [data-act="override-mode"][data-mode="fan_only"]'); await settle();
      follow();
      // In fan only, the air conditioner keeps showing the setpoint it had
      hass.states['climate.atelier'] = { ...hass.states['climate.atelier'], state: 'fan_only',
        attributes: { ...hass.states['climate.atelier'].attributes, temperature: 22 } };
      card.hass = hass; await settle();
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]'); await settle();
      assert.deepEqual(lastCall(hass).override.target, { temperature: 22, hvac_mode: 'cool' });
      assert.equal(lastCall(hass).override.preset, undefined);
    });

    test('an override to Boost in cool shows the temperature of Boost when cooling, not the setpoint shown (#112)', async () => {
      const cooling = { target: { ...OWN('boost'), hvac_mode: 'cool' }, preset: 'boost', ...span };
      const hass = setup({ overrides: { 'climate.atelier': cooling } });
      hass.data.cool_preset_temperatures = { 'climate.atelier': { boost: 23 } };
      hass.states['climate.atelier'] = { ...hass.states['climate.atelier'], state: 'cool',
        attributes: { ...hass.states['climate.atelier'].attributes, temperature: 7 } };
      const card = await cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '23');
    });

    test('Clim after Ventilation, on a thermostat that says its setpoint is null: the preset planned now, never 0 °C', async () => {
      const hass = setup({ overrides: { 'climate.atelier': { target: FAN, start: span.start, end: span.end } } });
      hass.states['climate.atelier'].attributes.temperature = null;
      const card = await cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]'); await settle();
      assert.ok(lastCall(hass).override.preset);
      assert.equal('temperature' in lastCall(hass).override.target, false);
    });

    test('Clim after Ventilation takes the setpoint shown within the thermostat\'s limits', async () => {
      const hass = setup({ overrides: { 'climate.atelier': { target: FAN, start: span.start, end: span.end } } });
      Object.assign(hass.states['climate.atelier'].attributes, { temperature: 7, min_temp: 16 });
      const card = await cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]'); await settle();
      assert.deepEqual(lastCall(hass).override.target, { temperature: 16, hvac_mode: 'cool' });
    });

    test('during a fan-only slot, a new override in Clim takes the setpoint shown too', async () => {
      const hass = setup({ planned: { 'climate.atelier': { preset: null, hvac_mode: 'fan_only' } } });
      hass.states['climate.atelier'] = { ...hass.states['climate.atelier'], state: 'fan_only',
        attributes: { ...hass.states['climate.atelier'].attributes, temperature: 22 } };
      const el = await moreInfo(hass, 'climate.atelier');
      $(el, '[data-new-override]').click(); await settle();
      $(el, '.mode-row [data-mode="cool"]').click(); await settle();
      assert.deepEqual(lastCall(hass).override.target, { temperature: 22, hvac_mode: 'cool' });
    });

    test('Clim after Ventilation, on a thermostat that shows no setpoint: the preset planned now', async () => {
      const hass = setup({ overrides: { 'climate.atelier': { target: FAN, start: span.start, end: span.end } } });
      delete hass.states['climate.atelier'].attributes.temperature;
      const card = await cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]'); await settle();
      assert.ok(lastCall(hass).override.preset);
      assert.equal('temperature' in lastCall(hass).override.target, false);
    });

    test('Ventilation during a fan-only slot resumes the schedule', async () => {
      const hass = setup({ overrides: { 'climate.atelier': boost }, planned: { 'climate.atelier': { preset: null, hvac_mode: 'fan_only' } } });
      const card = await cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      click(card, '.override-ed [data-act="override-mode"][data-mode="fan_only"]'); await settle();
      assert.equal(lastCall(hass).override, null);
    });

    test('a preset tapped during an off override turns the thermostat on; a temperature typed too', async () => {
      const hass = setup({ overrides: { 'climate.salon': offOverride } });
      const card = await cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]'); await settle();
      assert.deepEqual(chips(card, '.override-ed'), ['Éteint ✓', 'Hors-gel', 'Éco', 'Confort', 'Boost']);
      click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]'); await settle();
      // On from now, for the override duration
      assert.deepEqual(lastCall(hass).override, { target: { preset_mode: 'comfort' }, preset: 'comfort',
        start: new Date(at).toISOString(), end: new Date(new Date(at).getTime() + 2 * 3600000).toISOString() });
      change($(card, '.override-ed [data-override-temperature]'), '21'); await settle();
      assert.deepEqual(lastCall(hass).override.target, { temperature: 21 });
      // In the more-info block too
      const el = await moreInfo(hass);
      $(el, '[data-act="override-preset"][data-preset="eco"]').click(); await settle();
      assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'eco' });
    });

    test('Éteint on an "on" override during an off slot resumes the schedule', async () => {
      const hass = setup({ overrides: { 'climate.salon': boost }, planned: { 'climate.salon': { preset: null, hvac_mode: 'off' } } });
      const card = await cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]'); await settle();
      click(card, '.override-ed [data-act="override-off"]'); await settle();
      assert.equal(lastCall(hass).override, null);
    });

    test('an air conditioner switched to cool by hand keeps cooling when a preset is tapped or a temperature typed; its chips are in their cool colors', async () => {
      const cooling = { target: { hvac_mode: 'cool', fan_mode: '2' }, ...span };
      const hass = setup({ overrides: { 'climate.atelier': cooling } });
      const card = await cardOf(hass, { show: ['climate.atelier'] });
      click(card, '.override[data-climate="climate.atelier"]'); await settle();
      assert.equal($(card, '.override-ed [data-act="override-preset"][data-preset="eco"]').style.background, rgb(derivedCoolColor(PRESET_COLORS.eco)));
      click(card, '.override-ed [data-act="override-preset"][data-preset="eco"]'); await settle();
      assert.deepEqual(lastCall(hass).override.target, { ...OWN('eco'), hvac_mode: 'cool' });
      change($(card, '.override-ed [data-override-temperature]'), '24'); await settle();
      assert.deepEqual(lastCall(hass).override.target, { hvac_mode: 'cool', temperature: 24 });
      assert.equal(lastCall(hass).override.preset, undefined);
    });

    test('"then Éteint (schedule)" after an override, an off override included: an override never ends because a slot meets it', async () => {
      mock.timers.setTime(new Date('2026-10-12T21:30:00+02:00').getTime()); await settle();
      const evening = { start: '2026-10-12T20:30:00+02:00', end: '2026-10-12T22:00:00+02:00' };
      const heating = await moreInfo(setup({ overrides: { 'climate.salon': { ...boost, ...evening } } }));
      assert.match(text(heating.shadowRoot), /puis Éteint \(planning\)/);
      cleanup();
      const off = await moreInfo(setup({ overrides: { 'climate.salon': { ...offOverride, ...evening } } }));
      assert.match(text($(off, '.status')), /aujourd'hui · encore 30 min · puis Éteint \(planning\)/);
    });

    test('on a thermostat card the block is folded: the override, its end and Resume; Change unfolds the rest', async () => {
      const hass = setup({ overrides: { 'climate.salon': boost } });
      const tc = await thermostatCard(hass);
      const block = $(tc, 'chauffage-moreinfo');
      const fold = $(block, '.status details.change');
      assert.equal(fold.open, false);
      assert.equal(text(fold.querySelector('summary')), 'Modifier');
      assert.ok(fold.querySelector('.presets') && fold.querySelector('[data-override-temperature]') && fold.querySelector('[data-min="30"]'));
      assert.ok($(block, '.status [data-act="override-del"]') && !fold.querySelector('[data-act="override-del"]'), 'Resume stays in sight');
      assert.ok($(block, '.status input.time'), 'and the end');
      // Unfolded, it stays so when the block is drawn again
      fold.open = true;
      fold.dispatchEvent(new window.Event('toggle')); await settle();
      hass.states['climate.salon'] = { ...hass.states['climate.salon'], last_updated: '2' }; // a new state from Home Assistant
      tc.hass = hass; await settle();
      assert.equal($(block, '.status details.change').open, true);
      // In the more-info dialog, everything shows
      assert.equal($(await moreInfo(hass), '.status details.change'), null);
    });

    test('the temperature field shows the user\'s decimal separator, and reads both', async () => {
      const hass = setup({ overrides: { 'climate.salon': { target: { temperature: 21.5 }, ...span } } });
      const card = await cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]'); await settle();
      const field = $(card, '.override-ed [data-override-temperature]');
      assert.equal(field.value, '21,5');
      change(field, '22,5'); await settle();
      assert.deepEqual(lastCall(hass).override.target, { temperature: 22.5 });
    });
  });

  describe('a new off override lasts as the setting End of off overrides says', () => {
    const next = '2026-10-12T17:30:00+02:00';
    const turnOff = async (settings, planned = { preset: 'eco', hvac_mode: null, next_slot_end: next }) => {
      mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') });
      const hass = setup({ planned: { 'climate.salon': planned } });
      const card = await cardOf(hass, { show: ['climate.salon'] });
      hass.push({ ...hass.data, ...settings }); await settle();
      await showOverride(card, 'climate.salon');
      click(card, '.override-ed [data-act="override-off"]'); await settle();
      return lastCall(hass).override;
    };
    afterEach(() => mock.timers.reset());

    test('until the next slot by default, however far (#77 without a script)', async () => {
      const override = await turnOff({});
      assert.deepEqual(override.target, OFF);
      assert.deepEqual([override.end, override.end_rule], [next, 'next_slot']);
    });

    test('a week without a next slot', async () => {
      const override = await turnOff({}, { preset: 'eco', hvac_mode: null });
      assert.deepEqual([override.end, override.end_rule], ['2026-10-19T08:00:00.000Z', undefined]);
    });

    test('for the override duration', async () => {
      const override = await turnOff({ off_override_end: 'duration' });
      assert.deepEqual([override.end, override.end_rule], ['2026-10-12T10:00:00.000Z', undefined]);
    });

    test('for the override duration, or less if a slot starts first', async () => {
      assert.equal((await turnOff({ off_override_end: 'next_slot_within_duration' })).end, '2026-10-12T10:00:00.000Z');
      mock.timers.reset();
      cleanup();
      const sooner = '2026-10-12T11:00:00+02:00';
      const override = await turnOff({ off_override_end: 'next_slot_within_duration' }, { preset: 'eco', hvac_mode: null, next_slot_end: sooner });
      assert.deepEqual([override.end, override.end_rule], [sooner, 'next_slot']);
    });

    test('an integration older than the setting: the override duration, as before', async () => {
      assert.equal((await turnOff({ off_override_end: undefined })).end, '2026-10-12T10:00:00.000Z');
    });
  });

  describe('the end "until tomorrow" of an off override is the next morning', () => {
    let hass;
    const offOverride = { target: OFF, start: '2026-10-18T01:00:00+02:00', end: '2026-10-18T03:00:00+02:00' };
    const open = async (planned, at, override = offOverride) => {
      mock.timers.enable({ apis: ['Date'], now: new Date(at) });
      hass = setup({ overrides: { 'climate.salon': override }, planned: { 'climate.salon': { preset: 'eco', hvac_mode: null, next_preset: 'comfort', ...planned } } });
      const card = await cardOf(hass, { show: ['climate.salon'] });
      click(card, '.override[data-climate="climate.salon"]'); await settle();
      return card;
    };
    const weekday = { next_start: '2026-10-13T06:30:00+02:00', next_slot_end: '2026-10-12T22:30:00+02:00', next_day_slot_end: '2026-10-13T06:30:00+02:00' };
    afterEach(() => mock.timers.reset());

    test('"Jusqu\'à demain 06:30" on a weekday evening sets the end to the morning\'s slot', async () => {
      const card = await open(weekday, '2026-10-12T22:00:00+02:00', { target: OFF, start: '2026-10-12T21:30:00+02:00', end: '2026-10-12T23:30:00+02:00' });
      const button = $(card, '.override-ed [data-act="override-tomorrow"]');
      assert.equal(text(button), 'Jusqu\'à demain 06:30');
      button.click(); await settle();
      assert.equal(lastCall(hass).override.end, '2026-10-13T06:30:00+02:00');
      assert.equal(lastCall(hass).override.end_rule, undefined);
    });

    test('not on an override that heats, nor when the override already ends then', async () => {
      const evening = { start: '2026-10-12T21:30:00+02:00', end: '2026-10-12T23:30:00+02:00' };
      const heating = await open(weekday, '2026-10-12T22:00:00+02:00', { target: { preset_mode: 'boost' }, ...evening });
      assert.ok($(heating, '.override-ed [data-act="override-add"]'));
      assert.equal($(heating, '.override-ed [data-act="override-tomorrow"]'), null);
      cleanup();
      mock.timers.reset();
      const ends = await open(weekday, '2026-10-12T22:00:00+02:00', { target: OFF, ...evening, end: '2026-10-13T06:30:00+02:00' });
      assert.ok($(ends, '.override-ed [data-act="override-add"]'));
      assert.equal($(ends, '.override-ed [data-act="override-tomorrow"]'), null);
    });

    test('hidden when it is the next slot\'s instant: at 01:30 on Sunday, one button, "Jusqu\'à 08:00 (prochain créneau)"', async () => {
      const card = await open({ next_start: '2026-10-18T08:00:00+02:00', next_slot_end: '2026-10-18T08:00:00+02:00', next_day_slot_end: '2026-10-18T08:00:00+02:00' }, '2026-10-18T01:30:00+02:00');
      assert.equal($(card, '.override-ed [data-act="override-tomorrow"]'), null);
      assert.equal(text($(card, '.override-ed [data-act="override-next-slot"]')), 'Jusqu\'à 08:00 (prochain créneau)');
    });

    test('named by its day when it is not tomorrow: "Jusqu\'à lundi 06:30" on Saturday evening with a flat Sunday', async () => {
      const card = await open({ next_start: '2026-10-19T06:30:00+02:00', next_slot_end: '2026-10-17T23:00:00+02:00', next_day_slot_end: '2026-10-19T06:30:00+02:00' }, '2026-10-17T22:00:00+02:00');
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
    const open = async (hass) => { const card = await cardOf(hass); await showOverride(card, SUITE); return card; };
    const PLANNED = { [SUITE]: { preset: 'comfort', hvac_mode: 'heat' } };

    test('a new override starts on the HVAC mode planned, with the presets it can use', async () => {
      const card = await open(setup({ planned: { [SUITE]: { preset: 'comfort', hvac_mode: 'cool' } } }));
      // Nothing is chosen yet: Cool, the HVAC mode planned, is the default
      assert.deepEqual(modeRow(card, '.override-ed'), ['Éteint', 'Chauffe', 'Clim', 'Chauffe/Clim', 'Déshum.', 'Auto', 'Ventilation']);
      assert.equal($(card, '.override-ed .mode-row .default').dataset.mode, 'cool');
      assert.deepEqual(presetRow(card, '.override-ed'), ['Éco', 'Confort', 'Boost']);
    });

    test('dry is an override on its own: no preset, no temperature', async () => {
      const hass = setup({ planned: PLANNED });
      const card = await open(hass);
      await mode(card, 'dry', '.override-ed');
      assert.deepEqual(sent(hass).target, { hvac_mode: 'dry' });
      assert.equal(sent(hass).preset, undefined);
    });

    test('heat/cool sends the two temperatures of the preset planned', async () => {
      const hass = setup({ planned: PLANNED });
      const card = await open(hass);
      await mode(card, 'heat_cool', '.override-ed');
      assert.deepEqual(sent(hass).target, { ...both(20, 25), hvac_mode: 'heat_cool' });
      assert.equal(sent(hass).preset, 'comfort');
    });

    test('a dry override shows its HVAC mode chosen, and neither presets nor a temperature', async () => {
      const now = Date.now();
      const overrides = { [SUITE]: { target: { hvac_mode: 'dry' }, start: new Date(now - 60000).toISOString(), end: new Date(now + 3600000).toISOString() } };
      const card = await cardOf(setup({ overrides, planned: PLANNED }));
      await showOverride(card, SUITE);
      assert.deepEqual(modeRow(card, '.override-ed').filter((m) => m.endsWith('✓')), ['Déshum. ✓']);
      assert.equal($(card, '.override-ed .presets'), null);
      assert.equal($(card, '.override-ed [data-override-temperature]'), null);
      assert.equal(text($(card, '.override-ed .override-value')), 'Déshum.');
    });

    test('a heat/cool override says its range', async () => {
      const now = Date.now();
      const overrides = { [SUITE]: { target: { hvac_mode: 'heat_cool', target_temp_low: 19, target_temp_high: 24.5 },
        start: new Date(now - 60000).toISOString(), end: new Date(now + 3600000).toISOString() } };
      const card = await cardOf(setup({ overrides, planned: PLANNED }));
      await showOverride(card, SUITE);
      assert.equal(text($(card, '.override-ed .override-value')), 'Chauffe/Clim · 19–24,5 °C');
      assert.equal($(card, '.override-ed [data-override-temperature]'), null);
    });

    test('an override that only says an HVAC mode highlights no preset', async () => {
      const now = Date.now();
      const overrides = { [SUITE]: { target: { hvac_mode: 'cool' }, start: new Date(now - 60000).toISOString(), end: new Date(now + 3600000).toISOString() } };
      const summer = { ...TARGETS, [SUITE]: { ...TARGETS[SUITE], summer: { cool_temperature: 26 } } };
      const hass = setup({ overrides, planned: PLANNED, targets: summer });
      hass.data.presets.push({ id: 'summer', name: 'Été', color: '#123456', temperature: null, cool_temperature: 26 });
      const card = await cardOf(hass);
      await showOverride(card, SUITE);
      assert.deepEqual(presetRow(card, '.override-ed'), ['Éco', 'Confort', 'Boost', 'Été']);
    });

    test('a heater keeps one row', async () => {
      const card = await cardOf(setup(), { show: [SALON] });
      await showOverride(card, SALON);
      assert.equal($(card, '.override-ed .mode-row'), null);
      assert.equal(presetRow(card, '.override-ed')[0], 'Éteint');
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
    const open = async (card, climate) => showOverride(card, climate);
    const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
    beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
    afterEach(() => mock.timers.reset());

    test('a new override starts in the HVAC mode of the slot planned now', async () => {
      const hass = setup({ planned: planned('cool') });
      const card = await cardOf(hass);
      await open(card, ATELIER);
      assert.deepEqual(row(card), ['Chauffe', 'Clim ✓']);
      click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]'); await settle();
      assert.deepEqual(sent(hass).target, { ...OWN('boost'), hvac_mode: 'cool' });
      assert.equal(sent(hass).preset, 'boost');
    });

    test('a temperature typed carries the HVAC mode too', async () => {
      const hass = setup({ planned: planned('heat') });
      const card = await cardOf(hass);
      await open(card, ATELIER);
      assert.deepEqual(row(card), ['Chauffe ✓', 'Clim']);
      change($(card, '.override-ed [data-override-temperature]'), '22'); await settle();
      assert.deepEqual(sent(hass).target, { temperature: 22, hvac_mode: 'heat' });
    });

    test('Clim tapped on an override to a preset keeps the preset, in cool, until the same end', async () => {
      const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: boost } });
      const card = await cardOf(hass);
      click(card, `.override[data-climate="${ATELIER}"]`); await settle();
      assert.deepEqual(row(card), ['Chauffe ✓', 'Clim'], 'an override that says none: the planned HVAC mode');
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]'); await settle();
      assert.deepEqual(sent(hass), { target: { ...OWN('boost'), hvac_mode: 'cool' }, preset: 'boost', ...span });
    });

    test('Clim tapped without an override starts one on the planned preset, in cool', async () => {
      const hass = setup({ planned: planned('heat') });
      const card = await cardOf(hass);
      await open(card, ATELIER);
      click(card, '.override-ed [data-act="override-mode"][data-mode="cool"]'); await settle();
      assert.deepEqual(sent(hass).target, { ...OWN('comfort'), hvac_mode: 'cool' });
      assert.equal(sent(hass).preset, 'comfort');
    });

    test('during an off slot, the thermostat\'s own HVAC mode is the default, else heat', async () => {
      const hass = setup({ planned: { [ATELIER]: { preset: null, hvac_mode: 'off' } } });
      hass.states[ATELIER].state = 'cool';
      const card = await cardOf(hass);
      await open(card, ATELIER);
      assert.deepEqual(row(card), ['Chauffe', 'Clim ✓']);
      hass.states[ATELIER] = { ...hass.states[ATELIER], state: 'off' }; // Home Assistant gives a new state
      card.hass = hass; await settle();
      await redraw(card); // the popover follows it on the next full redraw
      assert.deepEqual(row(card), ['Chauffe ✓', 'Clim']);
    });

    test('the override of a unit that only cools cools; a heater\'s override says no HVAC mode', async () => {
      const hass = setup({ planned: planned('heat') });
      const card = await cardOf(hass, { show: [COMBLES, SALON] });
      await open(card, COMBLES);
      assert.deepEqual(row(card), ['Clim ✓']);
      click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]'); await settle();
      assert.deepEqual(sent(hass).target, { temperature: 21, cool_temperature: 23, hvac_mode: 'cool' });
      await open(card, SALON);
      assert.deepEqual(row(card), []);
      click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]'); await settle();
      assert.deepEqual(sent(hass).target, { preset_mode: 'boost' });
    });

    test('while Éteint is chosen, the temperature field and the presets are hidden', async () => {
      const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: { target: OFF, ...span } } });
      const card = await cardOf(hass);
      click(card, `.override[data-climate="${ATELIER}"]`); await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]'), null);
      assert.equal($(card, '.override-ed .presets'), null);
      assert.equal($(card, '.override-ed .mode-row [data-mode="off"]').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(row(card), ['Chauffe', 'Clim']);
      // Chauffe turns it back on, on the preset planned
      click(card, '.override-ed [data-act="override-mode"][data-mode="heat"]'); await settle();
      assert.deepEqual(sent(hass).target, { ...OWN('comfort'), hvac_mode: 'heat' });
    });

    test('an off override says its end as the others do: its reason, which leads to the setting, the time left, what comes then', async () => {
      const end = '2026-10-13T06:30:00+02:00';
      const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: { target: OFF, start: span.start, end, end_rule: 'next_slot' } } });
      const card = await cardOf(hass);
      click(card, `.override[data-climate="${ATELIER}"]`); await settle();
      assert.match(text($(card, '.override-ed .ed-head .muted')), /^demain, .+ ⚙ · encore .+ · puis .*Éco \(planning\)$/);
      assert.ok($(card, '.override-ed .ed-head .muted [data-open-settings]'));
    });

    test('an override to a preset that sends no setpoint in cool says so, and does not show its heating temperature', async () => {
      // Frost protection on a unit that only cools: 7 °C is never sent, the unit keeps its 26 °C
      const frost = { target: { temperature: 7, hvac_mode: 'cool' }, preset: 'frost', ...span };
      const hass = setup({ planned: planned('heat'), overrides: { [COMBLES]: frost } });
      const card = await cardOf(hass, { show: [COMBLES] });
      click(card, `.override[data-climate="${COMBLES}"]`); await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '26');
      assert.equal(text($(card, '.override-ed .override-note')), 'Consigne inchangée');
      // With a cooling temperature: that one, and no note
      hass.data.targets[COMBLES].frost = { temperature: 7, cool_temperature: 28 };
      hass.push({ ...hass.data, overrides: { [COMBLES]: { ...frost, target: { temperature: 7, cool_temperature: 28, hvac_mode: 'cool' } } } }); await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '28');
      assert.equal($(card, '.override-ed .override-note'), null);
      // A temperature the user typed is their own: shown as it is
      hass.push({ ...hass.data, overrides: { [COMBLES]: { target: { temperature: 23, hvac_mode: 'cool' }, ...span } } }); await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '23');
      assert.equal($(card, '.override-ed .override-note'), null);
    });

    test('on a unit that heats and cools, the same override says "unchanged when cooling"', async () => {
      const frost = { target: { temperature: 7, hvac_mode: 'cool' }, preset: 'frost', ...span };
      const card = await cardOf(setup({ planned: planned('cool'), overrides: { [ATELIER]: frost } }));
      click(card, `.override[data-climate="${ATELIER}"]`); await settle();
      assert.equal($(card, '.override-ed [data-override-temperature]').value, '20');
      assert.equal(text($(card, '.override-ed .override-note')), 'Consigne inchangée en clim');
    });

    test('the more-info block has the same row', async () => {
      const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: boost } });
      const el = document.createElement('chauffage-moreinfo');
      document.body.appendChild(el);
      el.entity = ATELIER; await settle();
      el.hass = hass; await settle();
      assert.deepEqual($$(el, '.mode-row [data-mode="heat"], .mode-row [data-mode="cool"]').map(text), ['Chauffe', 'Clim']);
      $(el, '[data-act="override-mode"][data-mode="cool"]').click(); await settle();
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
    const open = async (hass, climate = SUITE) => { const card = await cardOf(hass, { show: [climate] }); await showOverride(card, climate); return card; };

    test('shows the HVAC mode planned as the default, not as chosen', async () => {
      const card = await open(setup({ planned: PLANNED }));
      assert.deepEqual(modeRow(card, '.override-ed'), ['Éteint', 'Chauffe', 'Clim (default)', 'Chauffe/Clim', 'Déshum.', 'Auto', 'Ventilation']);
      assert.equal($(card, '.override-ed .mode-row .on'), null);
    });

    test('says the end it will have before the first tap', async () => {
      const card = await open(setup({ planned: PLANNED }));
      // The end of the HVAC mode it would take, then the end of Off, which differs
      assert.equal(text($(card, '.override-ed .end-new')), "2 h (jusqu'à 12:00) · Éteint : jusqu'à 17:30");
    });

    test('says its end in the more-info block and on a thermostat card too', async () => {
      const el = await moreInfo(setup({ planned: PLANNED }), SUITE);
      el.shadowRoot.querySelector('[data-new-override]').click(); await settle();
      assert.match(text(el.shadowRoot.querySelector('.end-new')), /^2 h \(jusqu'à 12:00\)/);
      assert.ok(el.shadowRoot.querySelector('.mode-row .default') && !el.shadowRoot.querySelector('.mode-row .on'));
    });

    test('on a valve that lists heat and auto, a preset tapped says no HVAC mode: the valve keeps auto', async () => {
      const hass = setup({ planned: { [VANNE]: { preset: 'eco' } } });
      const card = await open(hass, VANNE);
      assert.deepEqual(modeRow(card, '.override-ed'), ['Éteint', 'Chauffe', 'Auto (default)']);
      click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]'); await settle();
      assert.deepEqual(sent(hass).target, { temperature: 20 });
      // The temperature typed says none either
      const typedHass = setup({ planned: { [VANNE]: { preset: 'eco' } } });
      const typed = await open(typedHass, VANNE);
      const field = $(typed, '.override-ed [data-override-temperature]');
      field.value = '21';
      field.dispatchEvent(new window.Event('change', { bubbles: true })); await settle();
      assert.deepEqual(sent(typedHass).target, { temperature: 21 });
      // Heat tapped says heat
      const tappedHass = setup({ planned: { [VANNE]: { preset: 'eco' } } });
      const tapped = await open(tappedHass, VANNE);
      await mode(tapped, 'heat', '.override-ed');
      assert.equal(sent(tappedHass).target.hvac_mode, 'heat');
    });

    test('on a valve running in auto on its schedule, Chauffe tapped takes the preset planned now, not the setpoint shown (#112)', async () => {
      const hass = setup({ planned: { [VANNE]: { preset: 'eco' } } });
      const card = await open(hass, VANNE);
      await mode(card, 'heat', '.override-ed');
      assert.deepEqual(sent(hass).target, { temperature: 17, hvac_mode: 'heat' });
      assert.equal(sent(hass).preset, 'eco');
    });

    test('an override without an HVAC mode on the valve shows the HVAC mode it runs in', async () => {
      const hass = setup({ planned: { [VANNE]: { preset: 'eco' } }, overrides: { [VANNE]: override({ temperature: 20 }, { preset: 'comfort' }) } });
      const card = await cardOf(hass, { show: [VANNE] });
      await showOverride(card, VANNE);
      assert.deepEqual(modeRow(card, '.override-ed'), ['Éteint', 'Chauffe', 'Auto ✓']);
      assert.ok($(card, '.override-ed [data-act="override-preset"][data-preset="comfort"].on'));
    });
  });

  describe('the override block goes from the HVAC mode to the end', () => {
    onMondayAtTen();
    const PLANNED = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_slot_end: at('14:00') } };
    const COOL = { [SUITE]: override({ ...both(20, 25), hvac_mode: 'cool' }, { preset: 'comfort' }) };
    const PARTS = ['.mode-row', '.presets', '[data-override-temperature]', '.end-block'];

    test('in the card: the HVAC mode, the preset, the temperature, then one block for the end', async () => {
      const card = await cardOf(setup({ planned: PLANNED, overrides: COOL }));
      await showOverride(card, SUITE);
      const editor = $(card, '.override-ed');
      assert.ok(ascending(order(editor, PARTS)), `${order(editor, PARTS)}`);
      const end = $(card, '.override-ed .end-block');
      assert.ok(end.querySelector('[data-override-end]') && end.querySelector('[data-act="override-add"]') && end.querySelector('[data-act="override-next-slot"]'));
    });

    test('in the more-info block and on a thermostat card', async () => {
      for (const embedded of [false, true]) {
        const el = await moreInfo(setup({ planned: PLANNED, overrides: COOL }), SUITE, embedded);
        assert.ok(ascending(order(el.shadowRoot, PARTS)), `${order(el.shadowRoot, PARTS)}`);
        const end = el.shadowRoot.querySelector('.end-block');
        assert.ok(end.querySelector('[data-override-end]') && end.querySelector('[data-min="60"]') && end.querySelector('[data-act="override-next-slot"]'));
      }
    });

    test('the temperature has a − and a +, on the thermostat\'s step', async () => {
      const hass = setup({ planned: PLANNED, overrides: { [SUITE]: override({ temperature: 21, hvac_mode: 'heat' }) }, step: 1 });
      const card = await cardOf(hass);
      await showOverride(card, SUITE);
      assert.equal($(card, '.override-ed .pv-temp [data-override-temperature]').value, '21');
      click(card, '.override-ed .pv-temp [data-act="override-step"][data-dir="1"]'); await settle();
      assert.deepEqual(sent(hass).target, { temperature: 22, hvac_mode: 'heat' });
      const blockHass = setup({ planned: PLANNED, overrides: { [SUITE]: override({ temperature: 21, hvac_mode: 'heat' }) } });
      const el = await moreInfo(blockHass, SUITE);
      el.shadowRoot.querySelector('.pv-temp [data-dir="-1"]').click(); await settle();
      assert.deepEqual(sent(blockHass).target, { temperature: 20.5, hvac_mode: 'heat' });
    });
  });

  describe('an override names its HVAC mode on a thermostat that lists more than one', () => {
    onMondayAtTen();
    const PLANNED = { [SUITE]: { preset: 'eco', hvac_mode: 'heat' }, [SALON]: { preset: 'eco' } };
    const COOL = override({ ...both(20, 25), hvac_mode: 'cool' }, { preset: 'comfort', end: at('14:00') });
    // At 14:00 the suite's week plans Comfort, in heat

    test('the more-info block: "Clim · Confort 25°"; on a thermostat card, until when and what comes next', async () => {
      const el = await moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }), SUITE);
      assert.equal(text(el.shadowRoot.querySelector('.override-value')), '⏱ Clim · Confort 25°');
      const embedded = await moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }), SUITE, true);
      assert.equal(text(embedded.shadowRoot.querySelector('.override-until')), '⏱ jusqu\'à 14:00, puis Chauffage · Confort');
    });

    test('the thermostat card\'s header', async () => {
      const card = document.createElement('chauffage-thermostat-card');
      card.setConfig({ type: 'custom:chauffage-thermostat-card', entity: SUITE }); await settle();
      document.body.appendChild(card);
      card.hass = setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }); await settle();
      assert.equal(text($(card, '.tc-state')), '⏱ Clim · Confort 25°');
    });

    test('the thermostat card\'s header names the HVAC mode of an override to a temperature too', async () => {
      const card = document.createElement('chauffage-thermostat-card');
      card.setConfig({ type: 'custom:chauffage-thermostat-card', entity: SUITE }); await settle();
      document.body.appendChild(card);
      card.hass = setup({ planned: PLANNED, overrides: { [SUITE]: override({ temperature: 26, hvac_mode: 'cool' }, { end: at('14:00') }) } }); await settle();
      assert.equal(text($(card, '.tc-state')), '⏱ Clim · 26 °C');
    });

    test('the end of an override names the HVAC mode of the slot that follows', async () => {
      const el = await moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.end-block .muted')), /puis Chauffage · Confort \(planning\)$/);
    });

    test('the override on the week, and its tooltip', async () => {
      const card = await cardOf(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }));
      const badge = $(card, `.override[data-climate="${SUITE}"]`);
      assert.equal(badge.getAttribute('title'), 'Dérogation : Clim · Confort 25° jusqu\'à 14:00, puis Chauffe · Confort');
      // On the week: the icon of its HVAC mode and its end. The tooltip and its popover name it
      assert.match(text(badge.querySelector('.override-label')), /^⏱ → 14:00$/);
      assert.equal(badge.querySelector('.override-label ha-icon').getAttribute('icon'), 'mdi:snowflake');
    });

    test('the schedule followed names the HVAC mode too', async () => {
      const planned = { [SUITE]: { preset: 'comfort', hvac_mode: 'cool', next_preset: 'eco', next_hvac_mode: 'heat', next_start: at('17:30') } };
      const el = await moreInfo(setup({ planned }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status')), /Suit le planning : Climatisation · Confort jusqu'à 17:30, puis Chauffage · Éco/);
    });

    test('a heater names no HVAC mode', async () => {
      const hass = setup({ planned: PLANNED, overrides: { [SALON]: override({ temperature: 20 }, { preset: 'comfort', end: at('14:00') }) } });
      const el = await moreInfo(hass, SALON);
      assert.equal(text(el.shadowRoot.querySelector('.override-value')), '⏱ Confort 20°');
      assert.equal(text((await moreInfo(hass, SALON, true)).shadowRoot.querySelector('.override-until')), '⏱ jusqu\'à 14:00, puis Confort');
    });

    test('off and dry say themselves', async () => {
      const el = await moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: override({ hvac_mode: 'dry' }, { end: at('14:00') }) } }), SUITE);
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
    const off = override({ hvac_mode: 'off' }, { end: at('14:00'), end_rule: 'next_slot' });
    const planned = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_slot_end: at('14:00') } };
    const open = async (hass) => { const card = await cardOf(hass, { show: [SUITE] }); await showOverride(card, SUITE); return card; };

    test('an off override set to Cool lasts the override duration from now', async () => {
      const hass = setup({ overrides: { [SUITE]: off }, planned });
      const card = await open(hass);
      click(card, '.override-ed .mode-row [data-mode="cool"]'); await settle();
      const d = sent(hass);
      assert.equal(d.target.hvac_mode, 'cool');
      assert.equal(new Date(d.start).toISOString(), new Date(NOW).toISOString());
      assert.equal(new Date(d.end).toISOString(), new Date(at('12:00')).toISOString());
      assert.equal(d.end_rule, undefined);
    });

    test('an off override set to a preset or to a temperature too', async () => {
      const hass = setup({ overrides: { [SALON]: off }, planned: { [SALON]: { preset: 'eco', next_slot_end: at('14:00') } } });
      const card = await cardOf(hass);
      await showOverride(card, SALON);
      click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]'); await settle();
      assert.equal(new Date(sent(hass).end).toISOString(), new Date(at('12:00')).toISOString());
      assert.equal(sent(hass).end_rule, undefined);
    });

    test('an override turned off ends as the setting Turned off says', async () => {
      const hass = setup({ overrides: { [SUITE]: override({ temperature: 22, hvac_mode: 'heat' }) }, planned });
      const card = await open(hass);
      click(card, '.override-ed .mode-row [data-mode="off"]'); await settle();
      const d = sent(hass);
      assert.deepEqual(d.target, { hvac_mode: 'off' });
      assert.equal(new Date(d.end).toISOString(), new Date(at('14:00')).toISOString());
      assert.equal(d.end_rule, 'next_slot');
    });

    test('an override that stays on keeps its end', async () => {
      const hass = setup({ overrides: { [SUITE]: override({ temperature: 22, hvac_mode: 'heat' }) }, planned });
      const card = await open(hass);
      click(card, '.override-ed .mode-row [data-mode="cool"]'); await settle();
      assert.equal(sent(hass).end, at('11:30'));
      assert.equal(sent(hass).start, at('09:30'));
    });

    test('in the more-info block too', async () => {
      const hass = setup({ overrides: { [SUITE]: off }, planned });
      const el = await moreInfo(hass, SUITE);
      el.shadowRoot.querySelector('.mode-row [data-mode="cool"]').click(); await settle();
      assert.equal(new Date(sent(hass).end).toISOString(), new Date(at('12:00')).toISOString());
    });
  });

  describe('the HVAC mode a new override would take', () => {
    onMondayAtTen();
    test('is outlined in a neutral color, not in the color of a chosen HVAC mode', async () => {
      const card = await cardOf(setup({ planned: { [SUITE]: { preset: 'eco', hvac_mode: 'heat' } } }), { show: [SUITE] });
      await showOverride(card, SUITE);
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

    test('an override reads "Clim" in the more-info block, as its first row', async () => {
      const el = await moreInfo(setup({ overrides: cooling, planned }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.override-value')), /Clim · 24/);
      assert.doesNotMatch(text(el.shadowRoot.querySelector('.override-value')), /Climatisation/);
      assert.equal(text(el.shadowRoot.querySelector('.mode-row [data-mode="cool"]')), 'Clim');
    });

    test('what the schedule plans is a sentence: the names in full', async () => {
      const el = await moreInfo(setup({ planned }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status')), /Chauffage · Éco jusqu'à 14:00, puis Climatisation · Confort/);
    });

    test('without the words of Home Assistant, a sentence still says them as Home Assistant does: "Ventilation uniquement"', async () => {
      const toFan = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_preset: null, next_hvac_mode: 'fan_only', next_start: at('14:00') } };
      const el = await moreInfo(setup({ planned: toFan }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status')), /puis Ventilation uniquement/);
    });

    test('a sentence says them in the words of Home Assistant when it gives them', async () => {
      const hass = setup({ planned });
      hass.formatEntityState = (st, state) => ({ off: 'Éteint', heat: 'Chauffage', cool: 'Refroidissement' })[state] || state;
      const el = await moreInfo(hass, SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status')), /puis Refroidissement · Confort/);
    });

    test('a thermostat card names the override with the short name', async () => {
      const hass = setup({ overrides: cooling, planned });
      const card = document.createElement('chauffage-thermostat-card');
      card.setConfig({ entity: SUITE }); await settle();
      document.body.appendChild(card);
      card.hass = hass; await settle();
      assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Clim · 24/);
      assert.doesNotMatch(text(card.shadowRoot.querySelector('.tc-state')), /Climatisation/);
    });

    test('the schedule card keeps the short names', async () => {
      const card = await cardOf(setup({ overrides: cooling, planned }), { show: [SUITE] });
      await showOverride(card, SUITE);
      assert.match(text($(card, '.override-ed .override-value')), /^Clim · 24/);
    });

    test('the end of an override on the schedule card is a sentence: the names in full, as in the more-info block', async () => {
      const hass = setup({ overrides: cooling, planned });
      hass.formatEntityState = (st, state) => ({ off: 'Éteint', heat: 'Chaleur', cool: 'Refroidissement' })[state] || state;
      const card = await cardOf(hass, { show: [SUITE] });
      await showOverride(card, SUITE);
      assert.match(text($(card, '.override-ed')), /puis Chaleur · Éco \(planning\)/);
      assert.doesNotMatch(text($(card, '.override-ed')), /puis Chauffe ·/);
      assert.match(text((await moreInfo(hass, SUITE)).shadowRoot), /puis Chaleur · Éco \(planning\)/);
    });
  });

  describe('the line of the setpoint', () => {
    onMondayAtTen();
    test('says the setpoint, then a button to the presets tab for an administrator', async () => {
      const card = await cardOf(setup(), { show: [SUITE] });
      await select(card, SUITE, 1);
      const line = $(card, '.editor .setpoint-line');
      assert.equal(text(line.querySelector('.slot-setpoint')), 'Consigne : 20 °C');
      const edit = line.querySelector('.setpoint-edit');
      assert.equal(text(edit), 'Régler');
      assert.equal(edit.dataset.navigate, `/chauffage/presets?thermostat=${encodeURIComponent(SUITE)}`);
      assert.equal(edit.getAttribute('role'), 'link');
    });

    test('without the button for a user who is not an administrator', async () => {
      const hass = setup();
      hass.user = { is_admin: false };
      const card = await cardOf(hass, { show: [SUITE] });
      await select(card, SUITE, 1);
      const line = $(card, '.editor .setpoint-line');
      if (line) {
        assert.equal(text(line), 'Consigne : 20 °C');
        assert.equal(line.querySelector('.setpoint-edit'), null);
      }
    });

    test('the range of a heat/cool override is the same line', async () => {
      const hass = setup({ overrides: { [SUITE]: override({ ...TARGETS[SUITE].comfort, hvac_mode: 'heat_cool' }, { preset: 'comfort' }) } });
      const card = await cardOf(hass, { show: [SUITE] });
      await showOverride(card, SUITE);
      assert.equal(text($(card, '.override-ed .setpoint-line')), 'Consigne : 20–25 °C');
    });
  });

  describe('a thermostat card keeps its override block unfolded after an action from it', () => {
    onMondayAtTen();
    test('the first + sets the override, the second + is still there', async () => {
      const hass = setup();
      const card = await thermostatCard(hass, SALON);
      block(card).querySelector('[data-new-override]').click(); await settle();
      block(card).querySelector('[data-act="override-step"][data-dir="1"]').click(); await settle();
      assert.equal(sent(hass).target.temperature, 17.5);
      const change = block(card).querySelector('details.change');
      assert.equal(change.open, true);
      assert.ok(change.querySelector('[data-act="override-step"][data-dir="1"]'));
    });

    test('an override set elsewhere stays folded under Change', async () => {
      const card = await thermostatCard(setup({ overrides: { [SALON]: override({ temperature: 21 }) } }), SALON);
      assert.equal(block(card).querySelector('details.change').open, false);
    });
  });

  describe('the HVAC mode an override already has, tapped again', () => {
    onMondayAtTen();
    const fan = override({ hvac_mode: 'fan_only' });

    test('changes nothing', async () => {
      const hass = setup({ overrides: { [SUITE]: fan } });
      const card = await openOverride(hass, SUITE);
      const before = hass.events.length;
      click(card, '.override-ed .mode-row [data-mode="fan_only"]'); await settle();
      for (const e of hass.events.slice(before)) assert.deepEqual(e.override.target, { hvac_mode: 'fan_only' });
    });

    test('in the more-info block too', async () => {
      const hass = setup({ overrides: { [SUITE]: fan } });
      const el = await moreInfo(hass, SUITE);
      const before = hass.events.length;
      el.shadowRoot.querySelector('.mode-row [data-mode="fan_only"]').click(); await settle();
      for (const e of hass.events.slice(before)) assert.deepEqual(e.override.target, { hvac_mode: 'fan_only' });
    });
  });

  describe('Off tapped for a new override while the schedule plans off', () => {
    onMondayAtTen();
    const planned = { [SUITE]: { hvac_mode: 'off', next_slot_end: at('14:00') } };
    const idle = (hass) => { hass.states[SUITE].state = 'off'; return hass; };

    test('sets no override', async () => {
      const hass = idle(setup({ planned }));
      const card = await openOverride(hass, SUITE);
      const before = hass.events.length;
      click(card, '.override-ed .mode-row [data-mode="off"]'); await settle();
      assert.equal(hass.events.length, before);
    });

    test('in the more-info block too', async () => {
      const hass = idle(setup({ planned }));
      const el = await moreInfo(hass, SUITE);
      el.shadowRoot.querySelector('[data-new-override]').click(); await settle();
      const before = hass.events.length;
      el.shadowRoot.querySelector('.mode-row [data-mode="off"]').click(); await settle();
      assert.equal(hass.events.length, before);
    });

    test('turns off a thermostat that is on anyway', async () => {
      const hass = setup({ planned });
      const card = await openOverride(hass, SUITE);
      click(card, '.override-ed .mode-row [data-mode="off"]'); await settle();
      assert.deepEqual(sent(hass).target, { hvac_mode: 'off' });
    });
  });

  describe('the end a new override will have', () => {
    onMondayAtTen();
    const planned = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_slot_end: at('14:00') } };

    test('says the end of Off too, when Off ends at another time', async () => {
      const card = await openOverride(setup({ planned }), SUITE);
      assert.equal(text($(card, '.override-ed .end-new')), "2 h (jusqu'à 12:00) · Éteint : jusqu'à 14:00");
    });

    test('is one end when Off ends at the same time', async () => {
      const hass = setup({ planned });
      hass.data.off_override_end = 'duration';
      const card = await openOverride(hass, SUITE);
      assert.equal(text($(card, '.override-ed .end-new')), "2 h (jusqu'à 12:00)");
    });

    test('an override that is on says the end Off would give it, under the HVAC modes', async () => {
      const card = await openOverride(setup({ planned, overrides: { [SUITE]: override({ temperature: 21, hvac_mode: 'heat' }) } }), SUITE);
      // The next slot: said in words, the button of the end below says its time
      assert.equal(text($(card, '.override-ed .mode-row + .off-end')), "Éteint : jusqu'au prochain créneau");
    });

    test('on a heater, under the row that starts with Off', async () => {
      const hass = setup({ planned: { [SALON]: { preset: 'eco', next_slot_end: at('14:00') } },
        overrides: { [SALON]: override({ temperature: 21 }) } });
      const card = await openOverride(hass, SALON);
      assert.equal(text($(card, '.override-ed .presets + .off-end')), "Éteint : jusqu'au prochain créneau");
    });

    test('says its time when Off does not end at the next slot', async () => {
      const hass = setup({ planned: { [SUITE]: { preset: 'eco', hvac_mode: 'heat' } },
        overrides: { [SUITE]: override({ temperature: 21, hvac_mode: 'heat' }) } });
      const card = await openOverride(hass, SUITE);
      assert.match(text($(card, '.override-ed .off-end')), /^Éteint : jusqu'à .+ 10:00$/);
    });

    test('an off override says nothing more', async () => {
      const card = await openOverride(setup({ planned, overrides: { [SUITE]: override({ hvac_mode: 'off' }) } }), SUITE);
      assert.equal($(card, '.override-ed .off-end'), null);
    });

    test('the more-info block says it too', async () => {
      const el = await moreInfo(setup({ planned }), SUITE);
      el.shadowRoot.querySelector('[data-new-override]').click(); await settle();
      assert.match(text(el.shadowRoot.querySelector('.end-new')), /· Éteint : jusqu'à 14:00$/);
    });
  });

  describe('the line of the setpoint, when the temperature of a device preset is not known', () => {
    onMondayAtTen();
    const targets = { ...TARGETS, [SUITE]: { ...TARGETS[SUITE], comfort: { preset_mode: 'comfort' } } };

    test('keeps the button to the presets tab, without repeating the preset', async () => {
      const card = await cardOf(setup({ targets }), { show: [SUITE] });
      await select(card, SUITE, 1);
      const line = $(card, '.editor .setpoint-line');
      assert.equal(line.querySelector('.slot-setpoint'), null);
      assert.equal(text(line), 'Régler');
    });

    test('is not there for a user who is not an administrator', async () => {
      const hass = setup({ targets });
      hass.user = { is_admin: false };
      const card = await cardOf(hass, { show: [SUITE] });
      await select(card, SUITE, 1);
      assert.equal($(card, '.editor .setpoint-line'), null);
    });
  });

  describe('an override is said once', () => {
    onMondayAtTen();
    const dry = { [SUITE]: override({ hvac_mode: 'dry' }) };

    test('the more-info dialog says its end in the block of its end', async () => {
      const el = await moreInfo(setup({ overrides: dry }), SUITE);
      assert.match(text(el.shadowRoot.querySelector('.status .override-value')), /Déshum\./);
      assert.equal(el.shadowRoot.querySelector('.status .override-until'), null);
    });

    test('a thermostat card names it in its header, and says until when under it', async () => {
      const card = await thermostatCard(setup({ overrides: dry }), SUITE);
      assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Déshum\./);
      const line = block(card).querySelector('.status .line');
      assert.equal(line.querySelector('.override-value'), null);
      assert.match(text(line), /^⏱ jusqu'à 11:30/);
    });

    test('a fan-only override names its HVAC mode alone, even with a fan stored by an older version', async () => {
      const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'fan_only', fan_mode: 'high' }) } });
      const card = await thermostatCard(hass, SUITE);
      assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Ventilation$/);
    });
  });

  describe('an override sets no fan and no vanes', () => {
    onMondayAtTen();
    // The comfort preset's value on the suite sets the fan: a slot sends it, an override does not
    const targets = { ...TARGETS, [SUITE]: { ...TARGETS[SUITE], comfort: { ...TARGETS[SUITE].comfort, fan_mode: 'low', swing_mode: 'vertical' } } };

    test('a preset tapped for a new override sends no fan and no vanes', async () => {
      const hass = setup({ targets });
      const card = await openOverride(hass, SUITE);
      click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]'); await settle();
      assert.equal(sent(hass).preset, 'comfort');
      assert.ok(!('fan_mode' in sent(hass).target) && !('swing_mode' in sent(hass).target));
    });

    test('an HVAC mode tapped for a new override sends no fan either', async () => {
      const hass = setup({ targets, planned: { [SUITE]: { preset: 'comfort' } } });
      const card = await openOverride(hass, SUITE);
      click(card, '.override-ed .mode-row [data-mode="cool"]'); await settle();
      assert.ok(!('fan_mode' in sent(hass).target) && !('swing_mode' in sent(hass).target));
    });
  });
}
