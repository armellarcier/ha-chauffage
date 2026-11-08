// A slot sets more than a preset (#91), lot 2 in the card: the HVAC mode. A slot may turn a
// thermostat off, or set its mode; the week view, the slot popover, the override block, the
// presets tab and the thermostat card follow.
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { parseDay, serializeDay, normalize, planText, overrideLabel, makeLocale } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const OFF = { hvac_mode: 'off' };
const NIGHT = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', ['21:00', 'eco', OFF]];
const COOL_DAY = ['00:00 eco', ['14:00', 'comfort', { hvac_mode: 'cool' }], '20:00 eco'];
const AC_MODES = ['off', 'heat', 'cool', 'fan_only'];
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const lastCall = (hass) => hass.events.at(-1);
const day = (card, climate, d) => serializeDay(card._week(climate)[d]);

// The salon, a heater (heat / off), and the workshop, a reversible air conditioner (#61)
function setup({ weeks, targets, overrides, planned, thermostats, presets } = {}) {
  const data = integrationData({
    weeks: weeks || { 'climate.salon': { Normal: [NIGHT, NIGHT, NIGHT, NIGHT, NIGHT, WEEKEND, WEEKEND] },
      'climate.atelier': { Normal: [COOL_DAY, COOL_DAY, COOL_DAY, COOL_DAY, COOL_DAY, WEEKEND, WEEKEND] } },
    overrides, planned,
  });
  if (presets) data.presets = presets;
  data.targets = targets || {
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
    'climate.atelier': { comfort: { preset_mode: 'comfort', hvac_mode: 'cool' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
  };
  if (thermostats) Object.assign(data.thermostats, thermostats);
  const hass = fakeHass({ data });
  hass.data = data; // to push a change: hass.push({ ...hass.data, … })
  hass.states['climate.salon'].attributes.hvac_modes = ['off', 'heat'];
  hass.states['climate.salon'].attributes.preset_modes = ['none', 'frost', 'eco', 'comfort', 'boost'];
  hass.states['climate.atelier'] = { state: 'cool', attributes: { friendly_name: 'Atelier', current_temperature: 24, temperature: 20, preset_mode: 'comfort',
    preset_modes: ['eco', 'comfort', 'away', 'boost'], hvac_modes: AC_MODES, fan_modes: ['auto', '1', '2', '3'], swing_modes: ['auto', 'swing'] }, last_updated: '1' };
  hass.entities['climate.atelier'] = { entity_id: 'climate.atelier' };
  return hass;
}
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], show: 'all', ...config });
const select = (card, climate, d, idx) => { card._sel = { climate, day: d, idx }; card._render(); };

afterEach(() => cleanup());

describe('a slot with settings', () => {
  test('a slot is parsed from the integration with its settings, and serialized back', () => {
    const segs = parseDay([['00:00', 'eco'], ['22:30', 'eco', OFF]]);
    assert.deepEqual(segs, [{ start: 0, preset: 'eco' }, { start: 22 * 60 + 30, preset: 'eco', settings: OFF }]);
    assert.deepEqual(serializeDay(segs), ['00:00 eco', '22:30 eco {"hvac_mode":"off"}']);
    assert.deepEqual(parseDay(serializeDay(segs)), segs);
  });

  test('two consecutive slots merge only when their settings are the same too', () => {
    const merged = normalize([{ start: 0, preset: 'eco' }, { start: 600, preset: 'eco', settings: OFF }, { start: 700, preset: 'eco', settings: OFF }, { start: 800, preset: 'eco' }]);
    assert.deepEqual(merged, [{ start: 0, preset: 'eco' }, { start: 600, preset: 'eco', settings: OFF }, { start: 800, preset: 'eco' }]);
  });

  test('days are grouped on one row only when their slots match in full, settings included', () => {
    const plain = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', '22:30 eco'];
    const card = cardOf(setup({ weeks: { 'climate.salon': { Normal: [NIGHT, plain, NIGHT, NIGHT, NIGHT, WEEKEND, WEEKEND] } } }), { show: ['climate.salon'] });
    assert.deepEqual(card._rows, [[0, 2, 3, 4], [1], [5, 6]]);
  });

  test('Save sends a slot with its settings as a third element', async () => {
    const hass = setup();
    const card = cardOf(hass, { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1);
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    await card._action('save', {});
    const sent = hass.events.find((e) => e.type === 'chauffage/weeks/save');
    assert.deepEqual(sent.weeks['climate.salon'].normal[0], [['00:00', 'eco'], ['06:30', 'boost'], ['08:30', 'eco'], ['17:30', 'comfort'], ['21:00', 'eco', OFF]]);
  });

  test('inserting a slot and splitting one keep the settings on every piece', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 4); // 21:00 eco, off
    card._split('climate.salon', 0, 23 * 60);
    assert.deepEqual(day(card, 'climate.salon', 0).slice(4), ['21:00 eco {"hvac_mode":"off"}', '23:00 comfort {"hvac_mode":"off"}']);
  });

  test('a day copied to a thermostat that lacks a setting loses it, and the message says so', () => {
    const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
    delete card._hass.states['climate.atelier'].attributes.hvac_modes;
    card._copyDay('climate.salon', 0, 'others');
    assert.deepEqual(day(card, 'climate.atelier', 0).at(-1), '21:00 eco');
    assert.match(text($(card, '.msg')), /réglages non pris en charge ignorés/);
  });
});

describe('the week view', () => {
  test('an off slot is grey, named Arrêt, with the preset it restarts on as a strip', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    const seg = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="4"]');
    assert.ok(seg.classList.contains('off'));
    assert.equal(seg.querySelector('.strip').style.background, 'rgb(67, 160, 71)');
    assert.equal(seg.querySelector('.l').textContent, 'Arrêt');
    assert.equal(seg.querySelector('.t ha-icon').getAttribute('icon'), 'mdi:power');
    assert.match(seg.title, /Arrêt \(Éco\)/);
  });

  test('a slot with an explicit HVAC mode shows the mode\'s icon, as does a preset whose value sets one', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    const icons = $$(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg').map((s) => (s.querySelector('.t ha-icon') || { getAttribute: () => null }).getAttribute('icon'));
    assert.deepEqual(icons, [null, 'mdi:snowflake', null]);
    // A preset whose value sets cool: the icon too, on a slot without settings
    const sunday = cardOf(setup({ weeks: { 'climate.atelier': { Normal: [['00:00 eco', '08:00 comfort']].concat(Array(6).fill(['00:00 eco'])) } } }), { show: ['climate.atelier'] });
    assert.equal($(sunday, '.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="1"] .t ha-icon').getAttribute('icon'), 'mdi:snowflake');
  });

  test('the legend adds Arrêt only when a shown week has an off slot', () => {
    assert.match(text($(cardOf(setup(), { show: ['climate.salon'] }), '.legend')), /Arrêt/);
    assert.doesNotMatch(text($(cardOf(setup(), { show: ['climate.atelier'] }), '.legend')), /Arrêt/);
  });
});

describe('the slot popover: the power row', () => {
  test('a heater gets Marche | Arrêt and no select; Arrêt writes off, Marche removes it', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1); // 06:30 comfort
    const row = $(card, '.editor .power');
    assert.equal(row.getAttribute('role'), 'group');
    assert.deepEqual($$(card, '.editor .power button').map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`), ['Marche ✓', 'Arrêt']);
    assert.equal($(card, '.editor [data-slot-hvac]'), null);
    click(card, '.editor [data-act="hvac"][data-mode="off"]');
    assert.equal(day(card, 'climate.salon', 0)[1], '06:30 comfort {"hvac_mode":"off"}');
    assert.ok(card._dirty);
    assert.equal($(card, '.editor [data-act="hvac"][data-mode="off"]').getAttribute('aria-pressed'), 'true');
    click(card, '.editor [data-act="hvac"][data-mode="on"]');
    assert.equal(day(card, 'climate.salon', 0)[1], '06:30 comfort');
  });

  test('an air conditioner gets the select of its modes, Keep current first', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 0); // 00:00 eco
    const options = $$(card, '.editor [data-slot-hvac] option').map((o) => `${o.value}:${o.textContent}${o.selected ? ' ✓' : ''}`);
    assert.deepEqual(options, [":Garder l'actuel ✓", 'heat:Chauffage', 'cool:Climatisation', 'fan_only:Ventilation']);
    change($(card, '.editor [data-slot-hvac]'), 'fan_only');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco {"hvac_mode":"fan_only"}');
    change($(card, '.editor [data-slot-hvac]'), '');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco');
  });

  test('The default option names the mode the preset\'s value sets; Arrêt hides the select', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1); // 14:00 comfort, cool on the slot; comfort means cool on this AC anyway
    assert.equal($(card, '.editor [data-slot-hvac] option').textContent, 'Climatisation (préréglage)');
    assert.equal($(card, '.editor [data-slot-hvac]').value, 'cool');
    click(card, '.editor [data-act="hvac"][data-mode="off"]');
    assert.equal($(card, '.editor [data-slot-hvac]'), null);
    assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 comfort {"hvac_mode":"off"}');
  });

  test('tapping a preset keeps the power row\'s value', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 4); // off
    click(card, '.editor [data-act="preset"][data-preset="frost"]');
    assert.equal(day(card, 'climate.salon', 0)[4], '21:00 frost {"hvac_mode":"off"}');
  });

  test('a thermostat without hvac_modes gets no power row, unless the slot already has a value', () => {
    const hass = setup();
    delete hass.states['climate.salon'].attributes.hvac_modes;
    const card = cardOf(hass, { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1);
    assert.equal($(card, '.editor .power'), null);
    select(card, 'climate.salon', 0, 4); // off: shown, not available
    assert.match(text($(card, '.editor .power')), /Arrêt \(indisponible\)/);
    assert.ok($(card, '.editor .power .unsupported'));
  });

  test('a value the thermostat no longer lists stays selected, marked, and cannot be chosen again', () => {
    const hass = setup();
    hass.states['climate.atelier'].attributes.hvac_modes = ['off', 'heat'];
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1); // cool, no longer listed
    const option = $(card, '.editor [data-slot-hvac] option:checked');
    assert.equal(text(option), 'Climatisation (indisponible)');
    assert.ok(option.classList.contains('unsupported'));
    change($(card, '.editor [data-slot-hvac]'), '');
    assert.equal($$(card, '.editor [data-slot-hvac] option').some((o) => o.value === 'cool'), false);
  });

  test('a valve without off gets no Arrêt, and a select only with two modes or more', () => {
    const hass = setup();
    hass.states['climate.salon'].attributes.hvac_modes = ['heat'];
    const card = cardOf(hass, { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1);
    assert.equal($(card, '.editor .power'), null);
    hass.states['climate.salon'].attributes.hvac_modes = ['auto', 'heat'];
    card.hass = { ...hass };
    select(card, 'climate.salon', 0, 1);
    assert.equal($(card, '.editor [data-act="hvac"][data-mode="off"]'), null);
    assert.deepEqual($$(card, '.editor [data-slot-hvac] option').map((o) => o.value), ['', 'auto', 'heat']);
  });

  test('on a slot of an off preset, Arrêt is chosen with nothing stored, and Marche stores an explicit mode', () => {
    const presets = [{ id: 'comfort', name: 'Confort', color: '#f57c00', temperature: 20 }, { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17 },
      { id: 'away', name: 'Absent', color: '#9e9e9e', temperature: 7, hvac_mode: 'off' }];
    const targets = { 'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, away: { temperature: 7, hvac_mode: 'off' } },
      'climate.atelier': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, away: { temperature: 7, hvac_mode: 'off' } } };
    const weeks = { 'climate.salon': { Normal: Array(7).fill(['00:00 away', '08:00 comfort']) }, 'climate.atelier': { Normal: Array(7).fill(['00:00 away', '08:00 comfort']) } };
    const card = cardOf(setup({ presets, targets, weeks }), { show: ['climate.salon', 'climate.atelier'] });
    select(card, 'climate.salon', 0, 0);
    assert.equal($(card, '.editor [data-act="hvac"][data-mode="off"]').getAttribute('aria-pressed'), 'true');
    assert.ok($(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="0"]').classList.contains('off'));
    click(card, '.editor [data-act="hvac"][data-mode="on"]');
    assert.equal(day(card, 'climate.salon', 0)[0], '00:00 away {"hvac_mode":"heat"}');
    click(card, '.editor [data-act="hvac"][data-mode="off"]');
    assert.equal(day(card, 'climate.salon', 0)[0], '00:00 away');
    // Several modes: the first one the thermostat lists, in a select without Par défaut
    select(card, 'climate.atelier', 0, 0);
    click(card, '.editor [data-act="hvac"][data-mode="on"]');
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 away {"hvac_mode":"heat"}');
    assert.deepEqual($$(card, '.editor [data-slot-hvac] option').map((o) => o.value), ['heat', 'cool', 'fan_only']);
  });
});

describe('texts that name a slot', () => {
  const loc = makeLocale(null, 'fr');
  const name = (id) => ({ eco: 'Éco', comfort: 'Confort' })[id] || id;

  test('"Follows the schedule" says Arrêt for an off slot, and for the next slot', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T23:00:00+02:00') });
    try {
      assert.equal(planText({ preset: 'eco', hvac_mode: 'off', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
        'Arrêt jusqu\'à 06:30 (demain), puis Confort');
      assert.equal(planText({ preset: 'comfort', hvac_mode: 'cool', next_preset: 'eco', next_hvac_mode: 'off', next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
        'Confort jusqu\'à 06:30 (demain), puis Arrêt');
    } finally { mock.timers.reset(); }
  });

  test('an override\'s label: Arrêt, or its mode when it only turns the thermostat on', () => {
    assert.equal(overrideLabel({ target: OFF }, loc), 'Arrêt');
    assert.equal(overrideLabel({ target: { hvac_mode: 'off', preset_mode: 'boost' } }, loc, [{ id: 'boost', name: 'Boost' }]), 'Arrêt');
    assert.equal(overrideLabel({ target: { hvac_mode: 'cool' } }, loc), 'Climatisation');
    assert.equal(overrideLabel({ target: { hvac_mode: 'cool', temperature: 24 } }, loc), '24 °C');
  });
});

describe('overrides with an HVAC mode', () => {
  const at = '2026-10-12T10:00:00+02:00';
  const offOverride = { target: OFF, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(at) }));
  afterEach(() => mock.timers.reset());

  test('the week view and the thermostat card show an off override as ⏱ Arrêt, without setpoint', () => {
    const hass = setup({ overrides: { 'climate.salon': offOverride } });
    hass.states['climate.salon'].attributes.temperature = 20;
    const card = cardOf(hass, { show: ['climate.salon'] });
    assert.match(text($(card, '.override[data-climate="climate.salon"] .override-label')), /⏱ Arrêt → 11:30/);
    const tc = document.createElement('chauffage-thermostat-card');
    tc.setConfig({ type: 'custom:chauffage-thermostat-card', entity: 'climate.salon' });
    document.body.appendChild(tc);
    tc.hass = hass;
    assert.equal(text($(tc, '.tc-state')), '⏱ Arrêt');
    assert.ok($(tc, '.tc-state').classList.contains('override'));
  });

  test('the override block gains the power row: Arrêt turns the override off, keeping its preset', () => {
    const hass = setup({ overrides: { 'climate.salon': { target: { preset_mode: 'boost' }, preset: 'boost', start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' } } });
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    assert.equal($(card, '.override-ed [data-act="override-hvac"][data-mode="on"]').getAttribute('aria-pressed'), 'true');
    click(card, '.override-ed [data-act="override-hvac"][data-mode="off"]');
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'boost', hvac_mode: 'off' });
    assert.equal(lastCall(hass).override.preset, 'boost');
  });

  test('Marche on an off override during an off slot makes it an "on" override with the slot\'s preset; a preset tapped makes one too', () => {
    const hass = setup({ overrides: { 'climate.salon': offOverride }, planned: { 'climate.salon': { preset: 'eco', hvac_mode: 'off', next_preset: 'comfort', next_start: '2026-10-13T06:30:00+02:00' } } });
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    assert.equal($(card, '.override-ed [data-act="override-hvac"][data-mode="off"]').getAttribute('aria-pressed'), 'true');
    click(card, '.override-ed [data-act="override-hvac"][data-mode="on"]');
    assert.deepEqual(lastCall(hass).override, { ...offOverride, target: { preset_mode: 'eco' }, preset: 'eco' });
    click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]');
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'comfort' });
  });

  test('an air conditioner\'s override block offers its modes; a mode chosen is kept when a preset is tapped', () => {
    const hass = setup({ overrides: { 'climate.atelier': { target: { preset_mode: 'boost' }, preset: 'boost', start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' } } });
    const card = cardOf(hass, { show: ['climate.atelier'] });
    click(card, '.override[data-climate="climate.atelier"]');
    change($(card, '.override-ed [data-override-hvac]'), 'fan_only');
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'boost', hvac_mode: 'fan_only' });
    hass.push({ ...hass.data, overrides: { 'climate.atelier': { ...lastCall(hass).override } } });
    click(card, '.override[data-climate="climate.atelier"]');
    click(card, '.override-ed [data-act="override-preset"][data-preset="eco"]');
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'eco', hvac_mode: 'fan_only' });
  });

  test('a temperature typed in the override block keeps the HVAC mode, the fan and the vanes, and drops the preset', () => {
    const cooling = { target: { preset_mode: 'boost', hvac_mode: 'cool', fan_mode: '2', swing_mode: 'swing' }, preset: 'boost', start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const hass = setup({ overrides: { 'climate.atelier': cooling, 'climate.salon': { ...offOverride, target: { hvac_mode: 'off', preset_mode: 'boost' }, preset: 'boost' } } });
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
    click(card, '.override[data-climate="climate.atelier"]');
    change($(card, '.override-ed [data-override-temperature]'), '24');
    assert.deepEqual(lastCall(hass).override.target, { hvac_mode: 'cool', fan_mode: '2', swing_mode: 'swing', temperature: 24 });
    assert.equal(lastCall(hass).override.preset, undefined);
    // An off override stays off: the thermostat restarts on that temperature
    click(card, '.override[data-climate="climate.salon"]');
    change($(card, '.override-ed [data-override-temperature]'), '21');
    assert.deepEqual(lastCall(hass).override.target, { hvac_mode: 'off', temperature: 21 });
    // In the more-info block too
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.atelier';
    el.hass = hass;
    change($(el, 'input[data-override-temperature]'), '25');
    assert.deepEqual(lastCall(hass).override.target, { hvac_mode: 'cool', fan_mode: '2', swing_mode: 'swing', temperature: 25 });
  });

  test('a new override from the card can be Arrêt until the next slot (#77 without a script)', () => {
    const hass = setup({ planned: { 'climate.salon': { preset: 'comfort', next_preset: 'eco', next_start: '2026-10-12T22:30:00+02:00', next_slot_end: '2026-10-12T22:30:00+02:00' } } });
    const card = cardOf(hass, { show: ['climate.salon'] });
    card._overrideSel = { climate: 'climate.salon', create: true };
    card._render();
    click(card, '.override-ed [data-act="override-hvac"][data-mode="off"]');
    assert.deepEqual(lastCall(hass).override.target, OFF);
    assert.equal(lastCall(hass).override.end, '2026-10-12T10:00:00.000Z'); // the override duration, 2 h
  });

  test('the off note is gone: an override on a thermostat that is off turns it on', () => {
    const hass = setup({ overrides: { 'climate.salon': { target: { preset_mode: 'boost' }, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' } } });
    hass.states['climate.salon'].state = 'off';
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    assert.equal($(card, '.off-note'), null);
  });

  test('in the more-info block: the power row, and "then Arrêt (schedule)" when the next slot is off', () => {
    const hass = setup({ overrides: { 'climate.salon': { target: { preset_mode: 'boost' }, preset: 'boost', start: '2026-10-12T21:00:00+02:00', end: '2026-10-12T23:00:00+02:00' } } });
    mock.timers.setTime(new Date('2026-10-12T21:30:00+02:00').getTime());
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    assert.match(text(el.shadowRoot), /puis Arrêt \(planning\)/);
    $(el, '[data-act="override-hvac"][data-mode="off"]').click();
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'boost', hvac_mode: 'off' });
    assert.equal($(el, '.off-note'), null);
  });
});

describe('the thermostat card chip and the row chip', () => {
  test('an off slot reads Arrêt, grey, without setpoint', () => {
    const hass = setup({ planned: { 'climate.salon': { preset: 'eco', hvac_mode: 'off', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' } } });
    hass.states['climate.salon'].state = 'off';
    hass.states['climate.salon'].attributes.temperature = 17;
    const tc = document.createElement('chauffage-thermostat-card');
    tc.setConfig({ type: 'custom:chauffage-thermostat-card', entity: 'climate.salon' });
    document.body.appendChild(tc);
    tc.hass = hass;
    assert.equal(text($(tc, '.tc-state')), 'Arrêt');
    assert.ok(!$(tc, '.tc-state').classList.contains('override'));
  });

  test('a VTherm off by its window or its auto start/stop says why, and the preset it restarts on', () => {
    const hass = setup({ thermostats: { 'climate.salon': { paused: false, revision: 7, cause: 'window' } } });
    hass.entities['climate.salon'].platform = 'versatile_thermostat';
    hass.states['climate.salon'].state = 'off';
    hass.states['climate.salon'].attributes.requested_state = { hvac_mode: 'heat', preset: 'comfort', target_temperature: 20 };
    const tc = document.createElement('chauffage-thermostat-card');
    tc.setConfig({ type: 'custom:chauffage-thermostat-card', entity: 'climate.salon' });
    document.body.appendChild(tc);
    tc.hass = hass;
    assert.equal(text($(tc, '.tc-state')), 'Fenêtre ouverte · Confort');
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
    assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'fenêtre ouverte');
    hass.push({ ...hass.data, thermostats: { ...hass.data.thermostats, 'climate.salon': { paused: false, revision: 7, cause: 'auto_start_stop' } } });
    assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'arrêt auto');
  });
});

describe('the presets tab', () => {
  const PRESETS = () => [{ id: 'comfort', name: 'Confort', color: '#f57c00', temperature: 20 }, { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17 },
    { id: 'away', name: 'Absent', color: '#9e9e9e', temperature: 7, hvac_mode: 'off' }];
  const TARGETS = () => ({
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, away: { temperature: 7, hvac_mode: 'off' } },
    'climate.atelier': { comfort: { preset_mode: 'comfort', hvac_mode: 'cool' }, eco: { preset_mode: 'eco' }, away: { temperature: 7, hvac_mode: 'off' } },
  });
  const open = (hass) => createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], view: 'presets' });
  const cell = (card, preset, climate) => $(card, `[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="${climate}"]`);
  const ticked = (card) => $$(card, '.cell-ed input[type=checkbox]').filter((c) => c.checked).map((c) => c.dataset.cellUse);

  test('a preset that turns the thermostats off: Arrêt in its header and its cells, a Marche | Arrêt switch in its popover', async () => {
    const hass = setup({ presets: PRESETS(), targets: TARGETS() });
    const card = open(hass);
    assert.equal(text($(card, '[data-kind="preset"][data-preset="away"] .pv-default')), 'Arrêt');
    assert.match(text(cell(card, 'away', 'climate.salon')), /^Arrêt/);
    click(card, '[data-kind="preset"][data-preset="eco"]');
    assert.equal($(card, '.cell-ed [data-act="cell-hvac"][data-mode="on"]').getAttribute('aria-pressed'), 'true');
    click(card, '.cell-ed [data-act="cell-hvac"][data-mode="off"]');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).presets[1], { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17, hvac_mode: 'off' });
    click(card, '[data-kind="preset"][data-preset="away"]');
    click(card, '.cell-ed [data-act="cell-hvac"][data-mode="on"]');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).presets[2], { id: 'away', name: 'Absent', color: '#9e9e9e', temperature: 7 });
  });

  test('a cell shows the HVAC icon of a value that sets one', () => {
    const card = open(setup({ presets: PRESETS(), targets: TARGETS() }));
    assert.equal(cell(card, 'comfort', 'climate.atelier').querySelector('.pv-val ha-icon').getAttribute('icon'), 'mdi:snowflake');
    assert.equal(cell(card, 'comfort', 'climate.salon').querySelector('.pv-val ha-icon'), null);
  });

  test('the cell popover: a checkbox per attribute, the default line, OK stores the ticked ones', async () => {
    const hass = setup({ presets: PRESETS(), targets: TARGETS() });
    const card = open(hass);
    cell(card, 'comfort', 'climate.salon').click();
    assert.match(text($(card, '.cell-ed .pv-defaultline')), /Par défaut : son préréglage Confort/);
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    assert.deepEqual(ticked(card), ['preset_mode']); // the default, shown in the new format
    assert.equal($(card, '.cell-ed [data-cell-hvac]'), null, 'a heater: no HVAC mode row');
    await card._action('cell-apply', {});
    assert.equal(hass.events.some((e) => e.type === 'chauffage/mapping/set'), false, 'equal to the default: nothing stored');
    // Using a field ticks its checkbox: the temperature typed is added to the preset
    cell(card, 'comfort', 'climate.salon').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    click(card, '.cell-ed [data-act="cell-step"][data-delta="0.5"]');
    assert.deepEqual(ticked(card), ['preset_mode', 'temperature']);
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { preset_mode: 'comfort', temperature: 20.5 } });
  });

  test('the cell popover of an air conditioner: the HVAC mode row, non-off modes only; Par défaut then OK drops the value', async () => {
    const hass = setup({ presets: PRESETS(), targets: TARGETS() });
    hass.data.mappings = { 'climate.atelier': { comfort: { preset_mode: 'comfort', hvac_mode: 'cool' } } };
    const card = open(hass);
    cell(card, 'comfort', 'climate.atelier').click();
    assert.deepEqual(ticked(card), ['preset_mode', 'hvac_mode']);
    assert.deepEqual($$(card, '.cell-ed [data-cell-hvac] option').map((o) => o.value), ['heat', 'cool', 'fan_only']);
    assert.equal($(card, '.cell-ed [data-cell-hvac]').value, 'cool');
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="default"]');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass), { type: 'chauffage/mapping/set', entity_id: 'climate.atelier', mapping: {} });
    assert.equal($(card, '.cell-ed'), null);
  });

  test('OK is refused with nothing ticked', () => {
    const card = open(setup({ presets: PRESETS(), targets: TARGETS() }));
    cell(card, 'comfort', 'climate.salon').click();
    click(card, '.cell-ed [data-act="cell-mode"][data-mode="custom"]');
    const box = $(card, '.cell-ed input[data-cell-use="preset_mode"]');
    box.checked = false;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.ok($(card, '.cell-ed [data-act="cell-apply"]').disabled);
  });

  test('the intro of the tab is shorter', () => {
    assert.equal(text($(open(setup({ presets: PRESETS(), targets: TARGETS() })), '.pv-intro')),
      'Un préréglage est une intention (Confort, Éco…). Chaque thermostat la traduit en ses propres réglages. Choisissez un préréglage ou une case pour le modifier.');
  });
});
