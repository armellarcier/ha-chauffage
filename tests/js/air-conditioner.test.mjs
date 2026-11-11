// On an air conditioner, every slot has an HVAC mode (#91): heat or cool on a thermostat that
// lists both, cool on one that only cools. A heater never carries one. In the card: the week, the
// slot popover, new slots, the week menu.
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const OFF = { hvac_mode: 'off' };
const COOL = { hvac_mode: 'cool' };
const HEAT = { hvac_mode: 'heat' };
const FAN = { hvac_mode: 'fan_only' };
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const day = (card, climate, d = 0) => serializeDay(card._week(climate)[d]);
const rgb = (hex) => { const el = document.createElement('i'); el.style.background = hex; return el.style.background; };
const icons = (el) => [...el.querySelectorAll('ha-icon')].map((i) => i.getAttribute('icon'));

const SALON = 'climate.salon'; // a heater
const ATELIER = 'climate.atelier'; // heats and cools
const COMBLES = 'climate.combles'; // only cools
// A week stored before #91: its slots say no HVAC mode
const OLD = ['00:00 eco', '14:00 comfort', '20:00 eco'];
const week = (d) => Array(7).fill(d);

function setup({ atelier = OLD, combles = OLD, salon = OLD, overrides, planned, targets } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon) }, [ATELIER]: { Normal: week(atelier) }, [COMBLES]: { Normal: week(combles) } },
    overrides, planned,
  });
  const own = { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } };
  data.targets = targets || { [SALON]: own, [ATELIER]: own, [COMBLES]: { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } } };
  data.preset_temperatures = { [SALON]: { comfort: 20, eco: 17, boost: 21 }, [ATELIER]: { comfort: 20, eco: 17, boost: 21 } };
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[ATELIER] = { state: 'heat', attributes: { friendly_name: 'Atelier', temperature: 20, preset_mode: 'comfort',
    preset_modes: ['eco', 'comfort', 'away', 'boost'], hvac_modes: ['off', 'heat', 'cool', 'fan_only'], fan_modes: ['auto', '1', '2', '3'] }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[ATELIER] = { entity_id: ATELIER };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: [SALON, ATELIER, COMBLES], show: [ATELIER], group_days: false, ...config });
const select = (card, climate, idx, d = 0) => { card._sel = { climate, day: d, idx }; card._render(); };
const hvacRow = (card) => $$(card, '.editor .hvac-row button').map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`);
const seg = (card, climate, idx, d = 0) => $(card, `.bar[data-climate="${climate}"][data-day="${d}"] .seg[data-idx="${idx}"]`);

afterEach(() => cleanup());

describe('on an air conditioner, every slot says heat or cool', () => {
  test('the popover\'s Heat · Cool row always has one chosen: a slot stored without an HVAC mode heats', () => {
    const card = cardOf(setup());
    select(card, ATELIER, 1);
    assert.deepEqual(hvacRow(card), ['Chauffe ✓', 'Clim']);
    assert.equal($(card, '.editor .hvac-row').getAttribute('aria-label'), 'Mode HVAC');
  });

  test('tapping the chosen HVAC mode again does not clear it', () => {
    const card = cardOf(setup({ atelier: ['00:00 eco', ['14:00', 'comfort', COOL]] }));
    select(card, ATELIER, 1);
    assert.deepEqual(hvacRow(card), ['Chauffe', 'Clim ✓']);
    click(card, '.editor [data-act="slot-hvac"][data-mode="cool"]');
    assert.deepEqual(hvacRow(card), ['Chauffe', 'Clim ✓']);
    assert.equal(card._dirty, false);
    click(card, '.editor [data-act="slot-hvac"][data-mode="heat"]');
    assert.deepEqual(hvacRow(card), ['Chauffe ✓', 'Clim']);
    assert.equal(day(card, ATELIER)[1], '14:00 comfort {"hvac_mode":"heat"}');
  });

  test('the week draws a slot stored without an HVAC mode as a heating slot, with its flame', () => {
    const card = cardOf(setup());
    assert.equal(seg(card, ATELIER, 1).style.background, rgb('#f57c00'));
    assert.deepEqual(icons(seg(card, ATELIER, 1)), ['mdi:fire']);
    assert.match(seg(card, ATELIER, 1).getAttribute('aria-label'), /Confort · Chauffe$/);
  });

  test('an air conditioner that only cools has no row to choose from, and its slots are cooling slots', () => {
    const card = cardOf(setup(), { show: [COMBLES] });
    assert.deepEqual(icons(seg(card, COMBLES, 1)), ['mdi:snowflake']);
    assert.notEqual(seg(card, COMBLES, 1).style.background, rgb('#f57c00'));
    assert.match(seg(card, COMBLES, 1).getAttribute('aria-label'), /Confort · Clim$/);
    select(card, COMBLES, 1);
    assert.equal($(card, '.editor .hvac-row'), null);
  });

  test('a heater never carries an HVAC mode: a slot pasted with cool is a plain slot', () => {
    const card = cardOf(setup({ salon: ['00:00 eco', ['14:00', 'comfort', COOL]] }), { show: [SALON] });
    assert.equal(seg(card, SALON, 1).style.background, rgb('#f57c00'));
    assert.deepEqual(icons(seg(card, SALON, 1)), []);
    select(card, SALON, 1);
    assert.equal($(card, '.editor .hvac-row'), null);
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    assert.equal(day(card, SALON)[1], '14:00 boost');
  });

  test('days that only differ by an HVAC mode left unsaid are one row', () => {
    const mixed = [OLD, ['00:00 eco', ['14:00', 'comfort', HEAT], '20:00 eco'], ...Array(5).fill(OLD)];
    const hass = setup();
    hass.data.weeks[ATELIER].normal = mixed.map((d) => d.map((s) => (Array.isArray(s) ? s : s.split(' '))));
    const card = cardOf(hass, { group_days: true });
    assert.deepEqual(card._rows, [[0, 1, 2, 3, 4, 5, 6]]);
  });

  test('an edit writes the HVAC mode of every slot of the day: heat or cool, and cool on a unit that only cools', () => {
    const card = cardOf(setup(), { show: [ATELIER, COMBLES] });
    select(card, ATELIER, 1);
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    assert.deepEqual(day(card, ATELIER), ['00:00 eco {"hvac_mode":"heat"}', '14:00 boost {"hvac_mode":"heat"}', '20:00 eco {"hvac_mode":"heat"}']);
    select(card, COMBLES, 1);
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    assert.deepEqual(day(card, COMBLES), ['00:00 eco {"hvac_mode":"cool"}', '14:00 boost {"hvac_mode":"cool"}', '20:00 eco {"hvac_mode":"cool"}']);
  });
});

describe('a new slot takes the HVAC mode of the slot it comes from', () => {
  const SUMMER = ['00:00 eco', ['12:00', 'comfort', COOL], ['20:00', null, OFF]];

  test('a slot inserted in a cooling slot cools', () => {
    const card = cardOf(setup({ atelier: SUMMER }));
    select(card, ATELIER, 1);
    click(card, '.editor [data-act="insert"]');
    assert.deepEqual(day(card, ATELIER).slice(1, 4), ['12:00 comfort {"hvac_mode":"cool"}', '14:45 eco {"hvac_mode":"cool"}', '17:15 comfort {"hvac_mode":"cool"}']);
  });

  test('a cut made in a cooling slot gives two cooling slots', () => {
    const card = cardOf(setup({ atelier: SUMMER }));
    card._split(ATELIER, 0, 15 * 60);
    assert.deepEqual(day(card, ATELIER).slice(1, 3), ['12:00 comfort {"hvac_mode":"cool"}', '15:00 eco {"hvac_mode":"cool"}']);
  });

  test('a slot inserted in an off slot takes the HVAC mode of the slot before it', () => {
    const card = cardOf(setup({ atelier: SUMMER }));
    select(card, ATELIER, 2);
    click(card, '.editor [data-act="insert"]');
    assert.match(day(card, ATELIER)[3], /^21:15 \w+ \{"hvac_mode":"cool"\}$/);
  });

  test('without a slot on a preset before it, the new slot heats', () => {
    const card = cardOf(setup({ atelier: [['00:00', null, OFF], ['12:00', null, FAN]] }));
    select(card, ATELIER, 0);
    click(card, '.editor [data-act="insert"]');
    assert.match(day(card, ATELIER)[1], /^04:00 \w+ \{"hvac_mode":"heat"\}$/);
  });

  test('a preset tapped on an off slot takes the HVAC mode of the slot before it', () => {
    const card = cardOf(setup({ atelier: SUMMER }));
    select(card, ATELIER, 2);
    click(card, '.editor [data-act="preset"][data-preset="eco"]');
    assert.equal(day(card, ATELIER)[2], '20:00 eco {"hvac_mode":"cool"}');
  });
});

describe('the week menu sets every slot of a week to heat or to cool', () => {
  const MIXED = ['00:00 eco', ['12:00', 'comfort', COOL], ['18:00', null, FAN], ['20:00', null, OFF]];

  test('All cool sets every slot on a preset of the thermostat\'s week, in the schedule shown, and waits for Save', () => {
    const hass = setup({ atelier: MIXED });
    const card = cardOf(hass);
    card._action('menu', { climate: ATELIER, day: '0' }, $(card, `[data-act="menu"][data-climate="${ATELIER}"]`));
    assert.deepEqual($$(card, '.menu [data-act^="week-hvac"]').map(text), ['Tout en chauffe', 'Tout en clim']);
    click(card, '.menu [data-act="week-hvac"][data-mode="cool"]');
    for (let d = 0; d < 7; d += 1) {
      assert.deepEqual(day(card, ATELIER, d), ['00:00 eco {"hvac_mode":"cool"}', '12:00 comfort {"hvac_mode":"cool"}',
        '18:00 - {"hvac_mode":"fan_only"}', '20:00 - {"hvac_mode":"off"}']);
    }
    assert.equal(card._dirty, true);
    assert.equal(hass.events.some((e) => e.type === 'chauffage/weeks/save'), false);
    assert.equal(day(card, SALON)[1], '14:00 comfort');
  });

  test('All heat does the opposite', () => {
    const card = cardOf(setup({ atelier: MIXED }));
    card._action('week-hvac', { climate: ATELIER, mode: 'heat' });
    assert.equal(day(card, ATELIER, 3)[1], '12:00 comfort {"hvac_mode":"heat"}');
  });

  test('the menu of a heater, and of a unit that only cools, has no such item', () => {
    const card = cardOf(setup(), { show: [SALON, COMBLES] });
    for (const climate of [SALON, COMBLES]) {
      card._menu = null;
      card._action('menu', { climate, day: '0' }, $(card, `[data-act="menu"][data-climate="${climate}"]`));
      assert.equal($$(card, '.menu [data-act="week-hvac"]').length, 0);
    }
  });

  test('in English: All heat, All cool, and the row reads Heat · Cool', () => {
    const hass = setup();
    hass.locale = { ...hass.locale, language: 'en' };
    hass.language = 'en';
    const card = cardOf(hass);
    card._action('menu', { climate: ATELIER, day: '0' }, $(card, `[data-act="menu"][data-climate="${ATELIER}"]`));
    assert.deepEqual($$(card, '.menu [data-act="week-hvac"]').map(text), ['All heat', 'All cool']);
    select(card, ATELIER, 1);
    assert.deepEqual(hvacRow(card), ['Heat ✓', 'Cool']);
  });
});

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

describe('the override block of an air conditioner says heat or cool', () => {
  const span = { start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
  const boost = { target: { preset_mode: 'boost' }, preset: 'boost', ...span };
  const planned = (mode) => ({ [ATELIER]: { preset: 'comfort', hvac_mode: mode }, [COMBLES]: { preset: 'eco', hvac_mode: 'cool' }, [SALON]: { preset: 'eco', hvac_mode: null } });
  const row = (card) => $$(card, '.override-ed .hvac-row button').map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`);
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
    assert.deepEqual(sent(hass).target, { preset_mode: 'boost', hvac_mode: 'cool' });
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
    click(card, '.override-ed [data-act="override-hvac"][data-mode="cool"]');
    assert.deepEqual(sent(hass), { target: { preset_mode: 'boost', hvac_mode: 'cool' }, preset: 'boost', ...span });
  });

  test('Clim tapped without an override starts one on the planned preset, in cool', () => {
    const hass = setup({ planned: planned('heat') });
    const card = cardOf(hass);
    open(card, ATELIER);
    click(card, '.override-ed [data-act="override-hvac"][data-mode="cool"]');
    assert.deepEqual(sent(hass).target, { preset_mode: 'comfort', hvac_mode: 'cool' });
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

  test('a unit that only cools has no row, and its override cools; a heater\'s override says no HVAC mode', () => {
    const hass = setup({ planned: planned('heat') });
    const card = cardOf(hass, { show: [COMBLES, SALON] });
    open(card, COMBLES);
    assert.deepEqual(row(card), []);
    click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]');
    assert.deepEqual(sent(hass).target, { temperature: 21, hvac_mode: 'cool' });
    open(card, SALON);
    assert.deepEqual(row(card), []);
    click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]');
    assert.deepEqual(sent(hass).target, { preset_mode: 'boost' });
  });

  test('while Arrêt is chosen, the temperature field and the Heat · Cool row are hidden', () => {
    const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: { target: OFF, ...span } } });
    const card = cardOf(hass);
    click(card, `.override[data-climate="${ATELIER}"]`);
    assert.equal($(card, '.override-ed [data-override-temperature]'), null);
    assert.deepEqual(row(card), []);
    assert.ok($(card, '.override-ed [data-act="override-preset"]'), 'a preset turns it back on');
  });

  test('an off override says its end in a few words', () => {
    const end = '2026-10-13T06:30:00+02:00';
    const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: { target: OFF, start: span.start, end, ends_at: 'next_slot' } } });
    const card = cardOf(hass);
    click(card, `.override[data-climate="${ATELIER}"]`);
    assert.equal(text($(card, '.override-ed .ed-head .muted')), 'demain, puis Éco');
    assert.match(text($(card, '.override-ed')), /Arrêt.*jusqu'à.*demain, puis Éco/);
  });

  test('the more-info block has the same row', () => {
    const hass = setup({ planned: planned('heat'), overrides: { [ATELIER]: boost } });
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = ATELIER;
    el.hass = hass;
    assert.deepEqual($$(el, '.hvac-row button').map(text), ['Chauffe', 'Clim']);
    $(el, '[data-act="override-hvac"][data-mode="cool"]').click();
    assert.deepEqual(sent(hass).target, { preset_mode: 'boost', hvac_mode: 'cool' });
    // Its week draws the slots as they run on the air conditioner
    assert.ok($(el, '.bar.big .seg ha-icon[icon="mdi:fire"]'));
  });
});
