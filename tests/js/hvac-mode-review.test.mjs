// The review of the HVAC mode first (#91): a slot stays apart from its neighbors while its
// popover is open, an override names its HVAC mode and its end, short slots are cut by touch,
// and the cell popover steps from what it shows.
import { fakeHass, createCard, cleanup, integrationData, PRESETS } from './helpers.mjs';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const day = (card, climate, d = 0) => serializeDay(card._week(climate)[d]);

const SALON = 'climate.salon'; // a heater
const SUITE = 'climate.suite'; // a reversible unit that lists every HVAC mode, and takes a range
const VANNE = 'climate.vanne'; // a valve that lists heat and auto
const ALL = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'auto', 'fan_only'];
const week = (d) => Array(7).fill(d);
const DAY = ['00:00 eco', '14:00 comfort', '20:00 frost'];
const both = (heat, cool) => ({ temperature: heat, cool_temperature: cool, target_temp_low: heat, target_temp_high: cool });
const HEATS = { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } };
const TARGETS = {
  [SALON]: HEATS, [VANNE]: HEATS,
  [SUITE]: { comfort: both(20, 25), eco: both(17, 27), boost: both(21, 23), frost: { temperature: 7 } },
};
// Monday 10:00
const NOW = '2026-10-12T10:00:00+02:00';
const at = (hhmm) => `2026-10-12T${hhmm}:00+02:00`;

function setup({ suite = DAY, salon = DAY, vanne = DAY, overrides, planned, targets = TARGETS, step } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon) }, [SUITE]: { Normal: week(suite) }, [VANNE]: { Normal: week(vanne) } },
    overrides, planned,
  });
  data.presets = PRESETS('fr');
  data.targets = targets;
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SALON].attributes.temperature = 17;
  hass.states[SUITE] = { state: 'heat', attributes: { friendly_name: 'Suite', temperature: 20, hvac_modes: ALL, supported_features: 3,
    fan_modes: ['auto', 'low', 'high'], swing_modes: ['off', 'vertical'], ...(step ? { target_temp_step: step } : {}) }, last_updated: '1' };
  hass.states[VANNE] = { state: 'auto', attributes: { friendly_name: 'Vanne', temperature: 19, hvac_modes: ['off', 'heat', 'auto'] }, last_updated: '1' };
  hass.entities[SUITE] = { entity_id: SUITE };
  hass.entities[VANNE] = { entity_id: VANNE };
  return hass;
}
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: [SALON, SUITE, VANNE], show: [SUITE], group_days: false, ...config });
const select = (card, climate, idx, d = 0) => { card._sel = { climate, day: d, idx }; card._render(); };
const mode = (card, m, scope = '.editor') => click(card, `${scope} .mode-row [data-mode="${m}"]`);
const modeRow = (card, scope = '.editor') => $$(card, `${scope} .mode-row button`)
  .map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}${b.classList.contains('default') ? ' (default)' : ''}`);
const sent = (hass) => hass.events.at(-1).override;
const override = (target, more = {}) => ({ target, start: at('09:30'), end: at('11:30'), ...more });
const moreInfo = (hass, entity, embedded = false) => {
  const el = document.createElement('chauffage-moreinfo');
  if (embedded) el.setAttribute('embedded', '');
  document.body.appendChild(el);
  el.entity = entity;
  el.hass = hass;
  return el;
};
// The classes of the parts of a block, in the order they are drawn
const order = (root, selectors) => {
  const all = [...root.querySelectorAll(selectors.join(','))];
  return selectors.map((s) => all.indexOf(root.querySelector(s)));
};
const ascending = (list) => list.every((v, i) => v >= 0 && (i === 0 || v > list[i - 1]));

beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(NOW) }));
afterEach(() => { mock.timers.reset(); cleanup(); });

describe('a slot stays apart from its neighbors, while its popover is open and after', () => {
  // Thursday: fan only from 17:00, then Cool on Comfort from 20:30
  const THU = ['00:00 eco', ['17:00', null, { hvac_mode: 'fan_only' }], ['20:30', 'comfort', { hvac_mode: 'cool' }]];
  const FAN = '- {"hvac_mode":"fan_only"}';

  test('trying Fan only next to a fan-only slot keeps the two slots, and Cool gives the slot back its preset', () => {
    const card = cardOf(setup({ suite: THU }));
    select(card, SUITE, 2, 3);
    mode(card, 'fan_only');
    assert.deepEqual(day(card, SUITE, 3).slice(1), [`17:00 ${FAN}`, `20:30 ${FAN}`]);
    assert.deepEqual(card._sel, { climate: SUITE, day: 3, idx: 2 });
    assert.equal($$(card, `.bar[data-climate="${SUITE}"][data-day="3"] .seg`).length, 3);
    mode(card, 'cool');
    assert.deepEqual(day(card, SUITE, 3).slice(1), [`17:00 ${FAN}`, '20:30 comfort {"hvac_mode":"cool"}']);
  });

  test('the two slots stay two when the popover closes', () => {
    const card = cardOf(setup({ suite: THU }));
    select(card, SUITE, 2, 3);
    mode(card, 'fan_only');
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SUITE, 3).slice(1), [`17:00 ${FAN}`, `20:30 ${FAN}`]);
  });

  test('the two slots stay two when another slot is opened, and the slot forgets the preset it had', () => {
    const card = cardOf(setup({ suite: THU }));
    select(card, SUITE, 2, 3);
    mode(card, 'fan_only');
    select(card, SUITE, 0, 3);
    assert.deepEqual(day(card, SUITE, 3).slice(1), [`17:00 ${FAN}`, `20:30 ${FAN}`]);
    assert.deepEqual(card._sel, { climate: SUITE, day: 3, idx: 0 });
    assert.equal(card._trial, null);
  });

  test('the two slots are saved as two', async () => {
    const hass = setup({ suite: THU });
    const card = cardOf(hass);
    select(card, SUITE, 2, 3);
    mode(card, 'fan_only');
    await card._save();
    assert.equal(hass.events.at(-1).weeks[SUITE].normal[3].length, 3);
    assert.equal(day(card, SUITE, 3).length, 3);
  });

  test('a preset tapped that is the neighbor\'s keeps the slot until the popover closes', () => {
    const card = cardOf(setup(), { show: [SALON] });
    select(card, SALON, 1);
    click(card, '.editor [data-act="preset"][data-preset="eco"]');
    assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 eco', '20:00 frost']);
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 boost', '20:00 frost']);
  });
});

describe('fan only and dry show the fan speed at once', () => {
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

describe('a new override', () => {
  const PLANNED = { [SUITE]: { preset: 'comfort', hvac_mode: 'cool', next_slot_end: at('17:30') } };
  const open = (hass, climate = SUITE) => { const card = cardOf(hass, { show: [climate] }); card._overrideSel = { climate, create: true }; card._render(); return card; };

  test('shows the HVAC mode planned as the default, not as chosen', () => {
    const card = open(setup({ planned: PLANNED }));
    assert.deepEqual(modeRow(card, '.override-ed'), ['Arrêt', 'Chauffe', 'Clim (default)', 'Chauffe/Clim', 'Déshum.', 'Auto', 'Ventilation']);
    assert.equal($(card, '.override-ed .mode-row .on'), null);
  });

  test('says the end it will have before the first tap', () => {
    const card = open(setup({ planned: PLANNED }));
    // One end: the one of the HVAC mode it would take. Off says its own once it is tapped
    assert.equal(text($(card, '.override-ed .end-new')), 'jusqu\'à 12:00 (2 h)');
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
  const PLANNED = { [SUITE]: { preset: 'eco', hvac_mode: 'heat' }, [SALON]: { preset: 'eco' } };
  const COOL = override({ ...both(20, 25), hvac_mode: 'cool' }, { preset: 'comfort', end: at('14:00') });
  // At 14:00 the suite's week plans Comfort, in heat

  test('the more-info block: "Climatisation · Confort 25°"; on a thermostat card, until when and what comes next', () => {
    const el = moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }), SUITE);
    assert.equal(text(el.shadowRoot.querySelector('.override-value')), '⏱ Climatisation · Confort 25°');
    const embedded = moreInfo(setup({ planned: PLANNED, overrides: { [SUITE]: COOL } }), SUITE, true);
    assert.equal(text(embedded.shadowRoot.querySelector('.override-until')), '⏱ jusqu\'à 14:00, puis Chauffage · Confort');
  });

  test('the thermostat card\'s header', () => {
    const card = document.createElement('chauffage-thermostat-card');
    card.setConfig({ type: 'custom:chauffage-thermostat-card', entity: SUITE });
    document.body.appendChild(card);
    card.hass = setup({ planned: PLANNED, overrides: { [SUITE]: COOL } });
    assert.equal(text($(card, '.tc-state')), '⏱ Climatisation · Confort 25°');
  });

  test('the thermostat card\'s header names the HVAC mode of an override to a temperature too', () => {
    const card = document.createElement('chauffage-thermostat-card');
    card.setConfig({ type: 'custom:chauffage-thermostat-card', entity: SUITE });
    document.body.appendChild(card);
    card.hass = setup({ planned: PLANNED, overrides: { [SUITE]: override({ temperature: 26, hvac_mode: 'cool' }, { end: at('14:00') }) } });
    assert.equal(text($(card, '.tc-state')), '⏱ Climatisation · 26 °C');
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
    assert.equal(text(el.shadowRoot.querySelector('.override-value')), '⏱ Déshumidification');
  });
});

describe('a short slot', () => {
  // One pixel per minute: clientX is a time of day in minutes
  const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
  const mouse = (el, type, clientX) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
  const handle = (card, idx) => { geometry($(card, `.bar[data-climate="${SALON}"][data-day="0"]`)); return $(card, `.bar[data-climate="${SALON}"][data-day="0"] .handle[data-idx="${idx}"]`); };
  const tap = (el, clientX) => { mouse(el, 'pointerdown', clientX); mouse(el, 'pointerup', clientX); mouse(el, 'click', clientX); };
  // Half an hour of boost at 14:00: narrower than its two handles
  const SHORT = ['00:00 eco', '14:00 boost', '14:30 comfort', '22:30 eco'];
  const short = (slots = SHORT) => cardOf(setup({ salon: slots }), { show: [SALON] });

  test('is cut by a double tap, though the second tap lands on a handle of the slot selected', () => {
    const card = short();
    tap(handle(card, 1), 14 * 60 + 5); // selects the short slot
    assert.equal(card._sel.idx, 1);
    tap(handle(card, 1), 14 * 60 + 5); // the second tap, on its own handle
    assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 boost', '14:15 boost', '14:30 comfort', '22:30 eco']);
  });

  test('of one step cannot be cut: the double tap keeps it selected', () => {
    const card = short(['00:00 eco', '14:00 boost', '14:15 comfort', '22:30 eco']);
    tap(handle(card, 1), 14 * 60 + 5);
    tap(handle(card, 1), 14 * 60 + 5);
    assert.equal(day(card, SALON).length, 4);
    assert.equal(card._sel.idx, 1);
  });

  test('a long slot is not cut by a double tap on its own handle', () => {
    const card = short();
    card._sel = { climate: SALON, day: 0, idx: 2 };
    card._render();
    tap(handle(card, 3), 22 * 60 + 25);
    tap(handle(card, 3), 22 * 60 + 25);
    assert.equal(day(card, SALON).length, 4);
  });

  test('Insert cuts a slot of two steps in two', () => {
    const card = short();
    select(card, SALON, 1);
    const insert = $(card, '.editor [data-act="insert"]');
    assert.equal(insert.disabled, false);
    insert.click();
    assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 boost', '14:15 boost', '14:30 comfort', '22:30 eco']);
    // One step: nothing to insert
    const one = short(['00:00 eco', '14:00 boost', '14:15 comfort', '22:30 eco']);
    select(one, SALON, 1);
    assert.equal($(one, '.editor [data-act="insert"]').disabled, true);
  });
});

describe('the cell popover of the presets tab', () => {
  const panel = (hass) => createCard(hass, { thermostats: [SALON, SUITE, VANNE], view: 'presets' });
  const cell = (card, climate, preset) => click(card, `[data-kind="thermostat"][data-climate="${climate}"][data-preset="${preset}"]`);
  const coolRows = (card) => $$(card, '.cell-ed input[name="cell-cool-choice"]').map((r) => `${text(r.closest('label').querySelector('span'))}${r.checked ? ' ✓' : ''}`);

  test('when cooling has the same rows as when heating: the default, or a temperature', () => {
    const card = panel(setup());
    cell(card, SUITE, 'comfort');
    assert.deepEqual(coolRows(card), ['Par défaut (25°) ✓', 'Température']);
    cell(card, SUITE, 'frost');
    assert.deepEqual(coolRows(card), ['Pas utilisé en clim ✓', 'Température']);
  });

  test('+ on the cooling temperature starts from the default it shows, on the thermostat\'s step', async () => {
    const hass = setup({ step: 1 });
    const card = panel(hass);
    cell(card, SUITE, 'comfort');
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '25');
    click(card, '.cell-ed .pv-cool [data-act="cell-step"][data-dir="1"]');
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '26');
    assert.deepEqual(coolRows(card).map((r) => r.endsWith('✓')), [false, true]);
    await card._action('cell-apply', {});
    assert.deepEqual(hass.events.at(-1).mapping, { comfort: { cool_temperature: 26 } });
  });

  test('− on an empty cooling temperature starts from 25°, never from the heating temperature', () => {
    const card = panel(setup());
    cell(card, SUITE, 'frost');
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '');
    click(card, '.cell-ed .pv-cool [data-act="cell-step"][data-dir="-1"]');
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '24,5');
  });

  test('a temperature is stored on the thermostat\'s step: the cell shows what is stored', async () => {
    const hass = setup({ step: 1 });
    const card = panel(hass);
    cell(card, SUITE, 'comfort');
    const field = $(card, '.cell-ed [data-cell-temp]');
    field.value = '19,4';
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    await card._action('cell-apply', {});
    assert.deepEqual(hass.events.at(-1).mapping, { comfort: { temperature: 19 } });
  });

  test('the default chosen when cooling stores no cooling temperature', async () => {
    const hass = setup();
    hass.data.mappings = { [SUITE]: { comfort: { cool_temperature: 24 } } };
    const card = panel(hass);
    cell(card, SUITE, 'comfort');
    assert.deepEqual(coolRows(card).map((r) => r.endsWith('✓')), [false, true]);
    click(card, '.cell-ed input[name="cell-cool-choice"][value="default"]');
    await card._action('cell-apply', {});
    assert.deepEqual(hass.events.at(-1).mapping, {});
  });

  test('a cell says which of the two temperatures is set here', () => {
    const hass = setup();
    hass.data.mappings = { [SUITE]: { comfort: { cool_temperature: 24 }, eco: { temperature: 18 }, boost: { temperature: 22, cool_temperature: 22.5 } },
      [SALON]: { eco: { temperature: 18 } } };
    const card = panel(hass);
    const how = (climate, id) => text($(card, `[data-kind="thermostat"][data-climate="${climate}"][data-preset="${id}"] .pv-how`));
    assert.equal(how(SUITE, 'comfort'), 'clim réglée ici');
    assert.equal(how(SUITE, 'eco'), 'chauffe réglée ici');
    assert.equal(how(SUITE, 'boost'), 'réglé ici');
    assert.equal(how(SALON, 'eco'), 'réglé ici');
  });

  test('a preset keeps a temperature that the weeks use', async () => {
    const hass = setup({ suite: ['00:00 eco', ['14:00', 'comfort', { hvac_mode: 'cool' }]] });
    const card = panel(hass);
    const before = hass.events.length;
    click(card, '[data-kind="preset"][data-preset="comfort"]');
    $(card, '.cell-ed [data-cell-cool]').value = '';
    await card._action('cell-apply', {});
    assert.equal(hass.events.length, before, 'nothing is sent');
    assert.equal(text($(card, '.cell-ed .pv-error')), 'Utilisé en clim dans un planning : gardez une température.');
    // Boost is in no week
    click(card, '[data-kind="preset"][data-preset="boost"]');
    $(card, '.cell-ed [data-cell-cool]').value = '';
    await card._action('cell-apply', {});
    assert.equal(hass.events.at(-1).type, 'chauffage/presets/set');
  });

  test('the setpoint of a slot opens the presets tab on the thermostat\'s row', () => {
    const card = cardOf(setup());
    select(card, SUITE, 1);
    assert.equal($(card, '.editor .setpoint-edit').dataset.navigate, `/chauffage/presets?thermostat=${encodeURIComponent(SUITE)}`);
    window.history.replaceState(null, '', `/chauffage/presets?thermostat=${encodeURIComponent(SUITE)}`);
    const tab = panel(setup());
    assert.ok($(tab, `tr[data-climate="${SUITE}"]`).classList.contains('target'));
    assert.equal($$(tab, 'tr.target').length, 1);
    window.history.replaceState(null, '', '/');
  });
});

describe('the legend and the week', () => {
  const DAYS = ['00:00 eco', ['06:00', null, { hvac_mode: 'dry' }], ['12:00', 'comfort', { hvac_mode: 'heat_cool' }], ['18:00', null, { hvac_mode: 'auto' }]];
  const seg = (card, idx) => $(card, `.bar[data-climate="${SUITE}"][data-day="0"] .seg[data-idx="${idx}"]`);

  test('the legend names heat/cool when a shown week has it', () => {
    const card = cardOf(setup({ suite: DAYS }));
    const entry = $(card, '.legend .legend-heat-cool');
    assert.equal(text(entry), 'Chauffe/Clim');
    assert.match(entry.querySelector('i').getAttribute('style'), /linear-gradient/);
    assert.equal($(cardOf(setup()), '.legend .legend-heat-cool'), null);
  });

  test('a heat/cool slot wide enough says its preset', () => {
    const card = cardOf(setup({ suite: DAYS }));
    assert.equal(text(seg(card, 2).querySelector('.l')), 'Confort');
  });

  test('a heat/cool slot of two hours says its preset rather than its time: its two colors are no preset\'s color', () => {
    const card = cardOf(setup({ suite: ['00:00 eco', ['12:00', 'comfort', { hvac_mode: 'heat_cool' }], ['14:00', 'comfort', { hvac_mode: 'cool' }]] }));
    assert.equal(text(seg(card, 1).querySelector('.l')), 'Confort');
    assert.equal(text(seg(card, 1).querySelector('.t')), '');
  });

  test('a dry slot is hatched in Home Assistant\'s color of dry on a neutral base: it does not look like Comfort', () => {
    const card = cardOf(setup({ suite: DAYS }));
    const style = seg(card, 1).getAttribute('style');
    assert.match(style, /repeating-linear-gradient\(.*--state-climate-dry-color/);
    assert.match(style, /--secondary-background-color/);
    assert.doesNotMatch(style, /radial-gradient/);
    assert.match(seg(card, 3).getAttribute('style'), /repeating-linear-gradient\(.*--state-climate-auto-color/);
    assert.match($(card, '.legend .legend-off i').getAttribute('style'), /repeating-linear-gradient\(.*--state-climate-dry-color/);
  });

  test('every chip and HVAC mode button has one height, from one variable', async () => {
    const { CHIP_STYLE } = await import('../../custom_components/chauffage/frontend/chauffage-programme-card.js');
    assert.match(CHIP_STYLE, /--chauffage-chip-h:34px/);
    assert.match(CHIP_STYLE, /\.mode-row \.mode, \.presets button \{[^}]*height:var\(--chauffage-chip-h\)/);
    assert.match(CHIP_STYLE, /\.mode-row \{[^}]*margin-bottom:0/);
    assert.match(CHIP_STYLE, /\.mode\.on \{[^}]*color-mix\(in srgb, var\(--mode-color\) 20%, transparent\)/);
  });
});
