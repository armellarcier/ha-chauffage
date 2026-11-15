// The second review of the HVAC mode first (#91): two slots that become the same stay two
// slots, a double tap cuts a piece like its slot, an override that changes kind gets a new end,
// and the blocks name the HVAC modes as Home Assistant does.
import { fakeHass, createCard, cleanup, integrationData, PRESETS } from './helpers.mjs';
import { serializeDay, CHIP_STYLE, STYLE as STYLE_TEXT, MORE_INFO_STYLE as MORE_INFO_STYLE_TEXT, FIELD_BOX, chipTextColor } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const day = (card, climate, d = 0, schedule) => serializeDay(card._week(climate, schedule)[d]);

const SALON = 'climate.salon'; // a heater
const SUITE = 'climate.suite'; // a reversible unit that lists every HVAC mode, and takes a range
const COMBLES = 'climate.combles'; // an air conditioner that only cools
const ALL = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'auto', 'fan_only'];
const week = (d) => Array(7).fill(d);
const DAY = ['00:00 eco', '14:00 comfort', '20:00 frost'];
const both = (heat, cool) => ({ temperature: heat, cool_temperature: cool, target_temp_low: heat, target_temp_high: cool });
const HEATS = { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } };
const TARGETS = {
  [SALON]: HEATS,
  [SUITE]: { comfort: both(20, 25), eco: both(17, 27), boost: both(21, 23), frost: { temperature: 7 } },
  [COMBLES]: { comfort: { cool_temperature: 25 }, eco: { cool_temperature: 27 }, boost: { cool_temperature: 23 } },
};
// Monday 10:00
const NOW = '2026-10-12T10:00:00+02:00';
const at = (hhmm) => `2026-10-12T${hhmm}:00+02:00`;

function setup({ suite = DAY, salon = DAY, combles = ['00:00 eco'], overrides, planned, targets = TARGETS, mappings = {} } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon), Absent: week(salon) }, [SUITE]: { Normal: week(suite) }, [COMBLES]: { Normal: week(combles) } },
    overrides, planned,
  });
  data.presets = PRESETS('fr');
  data.targets = targets;
  data.mappings = mappings;
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SALON].attributes.temperature = 17;
  hass.states[SUITE] = { state: 'heat', attributes: { friendly_name: 'Suite', temperature: 20, hvac_modes: ALL, supported_features: 3,
    fan_modes: ['auto', 'low', 'high'], swing_modes: ['off', 'vertical'] }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[SUITE] = { entity_id: SUITE };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: [SALON, SUITE, COMBLES], show: [SALON], group_days: false, ...config });
const select = (card, climate, idx, d = 0) => { card._sel = { climate, day: d, idx }; card._render(); };
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
// One pixel per minute: clientX is a time of day in minutes
const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
const mouse = (el, type, clientX) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
const bar = (card, climate, d = 0) => geometry($(card, `.bar[data-climate="${climate}"][data-day="${d}"]`));
// Two taps at a time of day, on the slot running then
const doubleTap = (card, climate, minute, d = 0) => {
  for (let i = 0; i < 2; i += 1) {
    const segs = card._week(climate)[d];
    let idx = 0;
    segs.forEach((s, j) => { if (s.start <= minute) idx = j; });
    mouse(bar(card, climate, d).querySelector(`.seg[data-idx="${idx}"]`), 'click', minute);
  }
};

beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(NOW) }));
afterEach(() => { mock.timers.reset(); cleanup(); });

describe('two slots that become the same stay two slots', () => {
  test('a slot set to the preset of the slot before it is still there once its popover is closed', () => {
    const card = cardOf(setup());
    select(card, SALON, 1);
    click(card, '.editor [data-act="preset"][data-preset="eco"]');
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 eco', '20:00 frost']);
    assert.equal($$(card, `.bar[data-climate="${SALON}"][data-day="0"] .seg`).length, 3);
  });

  test('the two slots are saved as two slots', async () => {
    const hass = setup();
    const card = cardOf(hass);
    select(card, SALON, 1);
    click(card, '.editor [data-act="preset"][data-preset="eco"]');
    await card._save();
    assert.deepEqual(hass.events.at(-1).weeks[SALON].normal[0], [['00:00', 'eco'], ['14:00', 'eco'], ['20:00', 'frost']]);
    assert.equal(day(card, SALON).length, 3);
  });

  test('a week stored with two slots alike shows both', () => {
    const card = cardOf(setup({ salon: ['00:00 eco', '14:00 eco', '20:00 frost'] }));
    assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 eco', '20:00 frost']);
  });

  test('a slot deleted between two slots alike leaves one slot', () => {
    const card = cardOf(setup({ salon: ['00:00 eco', '14:00 comfort', '20:00 eco'] }));
    select(card, SALON, 1);
    click(card, '.editor [data-act="delete"]');
    assert.deepEqual(day(card, SALON), ['00:00 eco']);
  });

  test('an HVAC mode tried next to a slot in that HVAC mode keeps both slots', () => {
    const fan = ['17:00', null, { hvac_mode: 'fan_only' }];
    const card = cardOf(setup({ suite: ['00:00 eco', fan, ['20:30', 'comfort', { hvac_mode: 'cool' }]] }), { show: [SUITE] });
    select(card, SUITE, 2);
    click(card, '.editor .mode-row [data-mode="fan_only"]');
    click(card, '.editor [data-act="close"]');
    assert.equal(day(card, SUITE).length, 3);
  });

  test('a day copied to a thermostat that cannot follow its slots joins the slots that end up alike', () => {
    const card = cardOf(setup({ suite: ['00:00 eco', ['14:00', 'eco', { hvac_mode: 'cool' }]] }), { show: [SALON, SUITE] });
    card._copyDay(SUITE, 0, 'others');
    assert.deepEqual(day(card, SALON), ['00:00 eco']);
  });
});

describe('a double tap cuts a piece like the slot it is cut from', () => {
  test('the piece has the slot\'s preset, and its popover is open', () => {
    const card = cardOf(setup());
    doubleTap(card, SALON, 6 * 60);
    assert.deepEqual(day(card, SALON), ['00:00 eco', '06:00 eco', '14:00 comfort', '20:00 frost']);
    assert.deepEqual(card._sel, { climate: SALON, day: 0, idx: 1 });
    assert.ok($(card, '.editor [data-act="preset"][data-preset="eco"].on'));
  });

  test('a piece cut out of an off slot is off', () => {
    const card = cardOf(setup({ salon: [['00:00', null, { hvac_mode: 'off' }], '14:00 comfort'] }));
    doubleTap(card, SALON, 6 * 60);
    assert.deepEqual(day(card, SALON), ['00:00 - {"hvac_mode":"off"}', '06:00 - {"hvac_mode":"off"}', '14:00 comfort']);
  });

  test('the piece left as it was cut joins its slot again when the popover closes', () => {
    const card = cardOf(setup());
    doubleTap(card, SALON, 6 * 60);
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SALON), DAY);
    assert.equal($(card, '.savebar'), null, 'nothing to save');
  });

  test('the piece left as it was cut joins its slot again when another slot is opened', () => {
    const card = cardOf(setup());
    doubleTap(card, SALON, 6 * 60);
    select(card, SALON, 3);
    assert.deepEqual(day(card, SALON), DAY);
    assert.deepEqual(card._sel, { climate: SALON, day: 0, idx: 2 });
  });

  test('the piece given a preset stays', () => {
    const card = cardOf(setup());
    doubleTap(card, SALON, 6 * 60);
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SALON), ['00:00 eco', '06:00 boost', '14:00 comfort', '20:00 frost']);
  });

  test('the piece is not saved while it is like its slot', async () => {
    const hass = setup();
    const card = cardOf(hass);
    doubleTap(card, SALON, 6 * 60);
    const before = hass.events.length;
    await card._save();
    assert.equal(hass.events.length, before, 'nothing changed: nothing is sent');
    assert.deepEqual(day(card, SALON), DAY);
  });

  test('Insert a slot makes a piece like the slot, in its middle', () => {
    const card = cardOf(setup());
    select(card, SALON, 0); // 00:00 → 14:00 eco
    click(card, '.editor [data-act="insert"]');
    assert.deepEqual(day(card, SALON).slice(0, 4), ['00:00 eco', '04:45 eco', '09:15 eco', '14:00 comfort']);
    assert.equal(card._sel.idx, 1);
    click(card, '.editor [data-act="preset"][data-preset="comfort"]');
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SALON).slice(0, 4), ['00:00 eco', '04:45 comfort', '09:15 eco', '14:00 comfort']);
  });

  test('a piece cut out of a piece: both join the slot again when left as they were cut', () => {
    const card = cardOf(setup());
    doubleTap(card, SALON, 6 * 60);
    click(card, '.editor [data-act="insert"]'); // in the piece from 06:00 to 14:00
    assert.equal(day(card, SALON).length, 6);
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SALON), DAY);
  });

  test('Insert a slot left as it is leaves the slot whole', () => {
    const card = cardOf(setup());
    select(card, SALON, 0);
    click(card, '.editor [data-act="insert"]');
    click(card, '.editor [data-act="close"]');
    assert.deepEqual(day(card, SALON), DAY);
  });
});

describe('a piece cut on a row of days', () => {
  const grouped = (hass) => cardOf(hass, { group_days: true });

  test('joins its slot again on every day of the row', () => {
    const card = grouped(setup());
    doubleTap(card, SALON, 6 * 60);
    assert.equal(day(card, SALON, 4).length, 4, 'the cut is on every day of the row');
    click(card, '.editor [data-act="close"]');
    for (let d = 0; d < 7; d += 1) assert.deepEqual(day(card, SALON, d), DAY);
  });

  test('joins its slot again when another schedule is shown, on every day', async () => {
    const hass = setup();
    const card = grouped(hass);
    doubleTap(card, SALON, 6 * 60);
    click(card, '.tab[data-schedule="away"]');
    for (let d = 0; d < 7; d += 1) assert.deepEqual(day(card, SALON, d, 'normal'), DAY);
    const before = hass.events.length;
    await card._save();
    assert.equal(hass.events.length, before, 'no day was left cut: nothing to save');
  });

  test('a slot tried in another schedule keeps its change on every day of its row', async () => {
    const hass = setup();
    const card = grouped(hass);
    select(card, SALON, 1);
    click(card, '.editor [data-act="preset"][data-preset="eco"]');
    click(card, '.tab[data-schedule="away"]');
    await card._save();
    const saved = hass.events.at(-1).weeks[SALON].normal;
    for (let d = 0; d < 7; d += 1) assert.deepEqual(saved[d], [['00:00', 'eco'], ['14:00', 'eco'], ['20:00', 'frost']]);
  });
});

describe('a preset keeps a temperature that a heat/cool slot uses', () => {
  const panel = (hass) => createCard(hass, { thermostats: [SALON, SUITE, COMBLES], view: 'presets' });
  const clear = async (card, field) => {
    if (!$(card, '.cell-ed')) click(card, '[data-kind="preset"][data-preset="eco"]');
    $(card, `.cell-ed [${field}]`).value = '';
    await card._action('cell-apply', {});
  };

  test('with one of the thermostat\'s own presets as the value: a range needs both temperatures', async () => {
    const hass = setup({ suite: [['00:00', 'eco', { hvac_mode: 'heat_cool' }]], salon: ['00:00 comfort'], combles: ['00:00 comfort'], mappings: { [SUITE]: { eco: { preset_mode: 'eco' } } } });
    const card = panel(hass);
    const before = hass.events.length;
    await clear(card, 'data-cell-cool');
    assert.equal(hass.events.length, before, 'nothing is sent');
    assert.equal(text($(card, '.cell-ed .pv-error')), 'Utilisé en clim dans un planning : gardez une température.');
    await clear(card, 'data-cell-temp');
    assert.equal(text($(card, '.cell-ed .pv-error')), 'Utilisé en chauffe dans un planning : gardez une température.');
  });

  test('a temperature set on the thermostat replaces the preset\'s', async () => {
    const hass = setup({ suite: [['00:00', 'eco', { hvac_mode: 'heat_cool' }]], salon: ['00:00 comfort'], combles: ['00:00 comfort'], mappings: { [SUITE]: { eco: { cool_temperature: 26 } } } });
    const card = panel(hass);
    await clear(card, 'data-cell-cool');
    assert.equal(hass.events.at(-1).type, 'chauffage/presets/set');
  });
});

describe('an override that changes kind gets the end of its new kind', () => {
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

describe('a preset given a cooling value on one thermostat', () => {
  test('is offered there when cooling, and nowhere else', () => {
    // Frost protection has no temperature when cooling. The combles cool on it at their own 28°
    const targets = { ...TARGETS, [COMBLES]: { ...TARGETS[COMBLES], frost: { cool_temperature: 28 } } };
    const hass = setup({ targets, suite: [['00:00', 'eco', { hvac_mode: 'cool' }]] });
    const card = cardOf(hass, { show: [COMBLES, SUITE] });
    const offered = (climate) => { select(card, climate, 0); return $$(card, '.editor .presets [data-act="preset"]').map((b) => b.dataset.preset); };
    assert.ok(offered(COMBLES).includes('frost'));
    assert.ok(!offered(SUITE).includes('frost'));
    card._overrideSel = { climate: COMBLES, create: true };
    card._sel = null;
    card._render();
    assert.ok($(card, '.override-ed [data-act="override-preset"][data-preset="frost"]'));
  });
});

describe('the HVAC mode a new override would take', () => {
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

describe('the first row is a grid of three columns with five or six HVAC modes', () => {
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

describe('an override on a week with several thermostats', () => {
  test('says its HVAC mode and its end on the week, without a tooltip', () => {
    const hass = setup({ overrides: { [SUITE]: override({ temperature: 24, hvac_mode: 'cool' }) } });
    const card = cardOf(hass, { show: [SALON, SUITE] });
    const tag = $(card, `.override[data-climate="${SUITE}"] .override-tag`);
    assert.ok(tag, 'a short override has a tag next to it');
    assert.match(text(tag), /11:30/);
    assert.equal(tag.querySelector('ha-icon').getAttribute('icon'), 'mdi:snowflake');
  });

  test('on a heater: its end', () => {
    const hass = setup({ overrides: { [SALON]: override({ temperature: 21 }) } });
    const card = cardOf(hass, { show: [SALON, SUITE] });
    const tag = $(card, `.override[data-climate="${SALON}"] .override-tag`);
    assert.match(text(tag), /11:30/);
    assert.equal(tag.querySelector('ha-icon'), null);
  });

  test('a long override has its label inside (the stylesheet shows the label or the tag, from the width)', () => {
    const hass = setup({ overrides: { [SUITE]: override({ temperature: 24, hvac_mode: 'cool' }, { end: at('16:30') }) } });
    const card = cardOf(hass, { show: [SALON, SUITE] });
    assert.match(text($(card, `.override[data-climate="${SUITE}"] .override-label`)), /16:30/);
    assert.match(STYLE_TEXT, /\.override-tag \{[^}]*display:none/);
  });
});

describe('the more-info block and a thermostat card name the HVAC modes in full', () => {
  const cooling = { [SUITE]: override({ temperature: 24, hvac_mode: 'cool' }) };
  const planned = { [SUITE]: { preset: 'eco', hvac_mode: 'heat', next_preset: 'comfort', next_hvac_mode: 'cool', next_start: at('14:00') } };

  test('an override reads "Climatisation", its first row keeps the short "Clim"', () => {
    const el = moreInfo(setup({ overrides: cooling, planned }), SUITE);
    assert.match(text(el.shadowRoot.querySelector('.override-value')), /Climatisation · 24/);
    assert.equal(text(el.shadowRoot.querySelector('.mode-row [data-mode="cool"]')), 'Clim');
  });

  test('what the schedule plans too', () => {
    const el = moreInfo(setup({ planned }), SUITE);
    assert.match(text(el.shadowRoot.querySelector('.status')), /Chauffage · Éco jusqu'à 14:00, puis Climatisation · Confort/);
  });

  test('in the words of Home Assistant when it gives them', () => {
    const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'off' }) }, planned });
    hass.formatEntityState = (st, state) => ({ off: 'Éteint', heat: 'Chauffage', cool: 'Refroidissement' })[state] || state;
    const el = moreInfo(hass, SUITE);
    assert.match(text(el.shadowRoot.querySelector('.override-value')), /Éteint/);
  });

  test('on a thermostat card', () => {
    const hass = setup({ overrides: cooling, planned });
    const card = document.createElement('chauffage-thermostat-card');
    card.setConfig({ entity: SUITE });
    document.body.appendChild(card);
    card.hass = hass;
    assert.match(text(card.shadowRoot.querySelector('.tc-state')), /Climatisation/);
  });

  test('the schedule card keeps the short names', () => {
    const card = cardOf(setup({ overrides: cooling, planned }), { show: [SUITE] });
    card._overrideSel = { climate: SUITE };
    card._render();
    assert.match(text($(card, '.override-ed .override-value')), /^Clim · 24/);
  });
});

describe('a slot without a preset on a narrow week', () => {
  test('is marked, so that its name wins over its time', () => {
    const card = cardOf(setup({ salon: [['00:00', null, { hvac_mode: 'off' }], '06:30 comfort'] }), { show: [SALON, SUITE] });
    const segs = $$(card, `.bar[data-climate="${SALON}"][data-day="0"] .seg`);
    assert.ok(segs[0].classList.contains('word'));
    assert.ok(!segs[1].classList.contains('word'));
    assert.match(STYLE_TEXT, /\.multi \.seg\.word \.t/);
  });
});

describe('the line of the setpoint', () => {
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

describe('the text of a chip is dark where white is hard to read', () => {
  test('white on a color that gives it a contrast of 4.5 at least, dark otherwise', () => {
    assert.equal(chipTextColor(['#1976d2']), '#fff');
    assert.equal(chipTextColor(['#1a237e']), '#fff');
    assert.notEqual(chipTextColor(['#f57c00']), '#fff');
    assert.notEqual(chipTextColor(['#43a047']), '#fff');
  });

  test('a chip in two colors takes the text that reads best on its worst color', () => {
    assert.notEqual(chipTextColor(['#f57c00', '#1976d2']), '#fff'); // orange and blue: dark
    assert.equal(chipTextColor(['#e53935', '#1a237e']), '#fff'); // red and navy: white
  });

  test('the chips of a slot follow it', () => {
    const card = cardOf(setup(), { show: [SUITE] });
    select(card, SUITE, 1);
    assert.notEqual($(card, '.editor .presets [data-preset="comfort"]').style.color, 'rgb(255, 255, 255)');
    click(card, '.editor .mode-row [data-mode="cool"]');
    assert.equal($(card, '.editor .presets [data-preset="comfort"]').style.color, 'rgb(255, 255, 255)');
  });
});

describe('one height for the buttons and the fields', () => {
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
