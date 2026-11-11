// The schedule says whether the air conditioners heat or cool. A slot says when the room is off,
// or which preset it gets. The preset says how warm, for each thermostat (#91). In the card: the
// week view, the slot popover, the schedule's menu, the override block, the presets tab and the
// thermostat card.
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { parseDay, serializeDay, normalize, planText, overrideLabel, makeLocale } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const OFF = { hvac_mode: 'off' };
const OFF_SLOT = ' frost {"hvac_mode":"off"}'; // an off slot holds the coldest preset
const NIGHT = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', ['21:00', 'frost', OFF]];
const FAN_DAY = ['00:00 eco', ['14:00', 'comfort', { fan_mode: '3', swing_mode: 'swing' }], '20:00 eco'];
const AC_MODES = ['off', 'heat', 'cool', 'fan_only'];
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const lastCall = (hass) => hass.events.at(-1);
const day = (card, climate, d) => serializeDay(card._week(climate)[d]);
const chips = (root, scope) => $$(root, `${scope} .presets button`).map((b) => `${text(b)}${b.classList.contains('on') ? ' ✓' : ''}`);

// The salon, a heater (heat / off), and the workshop, a reversible air conditioner (#61)
function setup({ weeks, targets, overrides, planned, thermostats, cooling } = {}) {
  const data = integrationData({
    weeks: weeks || { 'climate.salon': { Normal: [NIGHT, NIGHT, NIGHT, NIGHT, NIGHT, WEEKEND, WEEKEND] },
      'climate.atelier': { Normal: [FAN_DAY, FAN_DAY, FAN_DAY, FAN_DAY, FAN_DAY, WEEKEND, WEEKEND] } },
    overrides, planned,
  });
  data.targets = targets || {
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
    'climate.atelier': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 16 } },
  };
  data.preset_temperatures = { 'climate.salon': { comfort: 20, eco: 17, boost: 21 } };
  if (cooling) data.schedules[0].hvac_mode = cooling; // what the schedule Normal says for the air conditioners
  if (thermostats) Object.assign(data.thermostats, thermostats);
  const hass = fakeHass({ data });
  hass.data = data; // to push a change: hass.push({ ...hass.data, … })
  hass.states['climate.salon'].attributes.hvac_modes = ['off', 'heat'];
  hass.states['climate.salon'].attributes.preset_modes = ['none', 'frost', 'eco', 'comfort', 'boost'];
  hass.states['climate.atelier'] = { state: 'heat', attributes: { friendly_name: 'Atelier', current_temperature: 24, temperature: 20, preset_mode: 'comfort',
    preset_modes: ['eco', 'comfort', 'away', 'boost'], hvac_modes: AC_MODES, fan_modes: ['auto', '1', '2', '3'], swing_modes: ['auto', 'swing'] }, last_updated: '1' };
  hass.entities['climate.atelier'] = { entity_id: 'climate.atelier' };
  return hass;
}
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], show: 'all', ...config });
const select = (card, climate, d, idx) => { card._sel = { climate, day: d, idx }; card._render(); };
const thermostatCard = (hass, entity = 'climate.salon') => {
  const tc = document.createElement('chauffage-thermostat-card');
  tc.setConfig({ type: 'custom:chauffage-thermostat-card', entity });
  document.body.appendChild(tc);
  tc.hass = hass;
  return tc;
};
const moreInfo = (hass, entity = 'climate.salon') => {
  const el = document.createElement('chauffage-moreinfo');
  document.body.appendChild(el);
  el.entity = entity;
  el.hass = hass;
  return el;
};

afterEach(() => cleanup());

describe('a slot is a preset, or off', () => {
  test('a slot is parsed from the integration with its settings, and serialized back', () => {
    const segs = parseDay([['00:00', 'eco'], ['22:30', 'frost', OFF]]);
    assert.deepEqual(segs, [{ start: 0, preset: 'eco' }, { start: 22 * 60 + 30, preset: 'frost', settings: OFF }]);
    assert.deepEqual(serializeDay(segs), ['00:00 eco', '22:30 frost {"hvac_mode":"off"}']);
    assert.deepEqual(parseDay(serializeDay(segs)), segs);
  });

  test('the only HVAC mode a slot sets is off, and an off slot sets nothing else', () => {
    // A day copied before the schedule said heat or cool: the slot's mode is left out
    assert.deepEqual(parseDay([['00:00', 'eco'], ['14:00', 'comfort', { hvac_mode: 'cool', fan_mode: '2' }]]),
      [{ start: 0, preset: 'eco' }, { start: 840, preset: 'comfort', settings: { fan_mode: '2' } }]);
    assert.deepEqual(parseDay([['00:00', 'eco', { hvac_mode: 'off', fan_mode: '2' }]]), [{ start: 0, preset: 'eco', settings: OFF }]);
  });

  test('two off slots in a row are one slot, whatever preset they hold; other slots merge when their settings match too', () => {
    const merged = normalize([{ start: 0, preset: 'eco' }, { start: 600, preset: 'eco', settings: OFF }, { start: 700, preset: 'frost', settings: OFF },
      { start: 800, preset: 'eco' }, { start: 900, preset: 'eco', settings: { fan_mode: '1' } }]);
    assert.deepEqual(merged, [{ start: 0, preset: 'eco' }, { start: 600, preset: 'eco', settings: OFF }, { start: 800, preset: 'eco' },
      { start: 900, preset: 'eco', settings: { fan_mode: '1' } }]);
  });

  test('days are grouped on one row only when their slots match in full, settings included', () => {
    const plain = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', '21:00 eco'];
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
    assert.deepEqual(sent.weeks['climate.salon'].normal[0], [['00:00', 'eco'], ['06:30', 'boost'], ['08:30', 'eco'], ['17:30', 'comfort'], ['21:00', 'frost', OFF]]);
  });

  test('a piece cut out of an off slot is on; a piece cut out of a slot keeps its fan and its vanes', () => {
    const card = cardOf(setup());
    card._split('climate.salon', 0, 23 * 60); // in 21:00, off
    assert.deepEqual(day(card, 'climate.salon', 0).slice(4), [`21:00${OFF_SLOT}`, '23:00 comfort']);
    card._split('climate.atelier', 0, 16 * 60); // in 14:00 comfort, fan 3
    assert.deepEqual(day(card, 'climate.atelier', 0).slice(1, 3), ['14:00 comfort {"fan_mode":"3","swing_mode":"swing"}', '16:00 boost {"fan_mode":"3","swing_mode":"swing"}']);
  });

  test('a day copied to a thermostat that cannot be turned off loses its off slot, and the message says so', () => {
    const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
    card._hass.states['climate.atelier'].attributes.hvac_modes = ['heat', 'cool'];
    card._copyDay('climate.salon', 0, 'others');
    assert.deepEqual(day(card, 'climate.atelier', 0).at(-1), '21:00 frost');
    assert.match(text($(card, '.msg')), /réglages non pris en charge ignorés/);
  });
});

describe('the week view', () => {
  test('an off slot is grey, named Arrêt, with the power icon', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    const seg = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="4"]');
    assert.ok(seg.classList.contains('off'));
    assert.equal(seg.style.background, 'rgb(97, 97, 97)');
    assert.equal(seg.querySelector('.strip'), null, 'no preset to restart on: the user does not choose it');
    assert.equal(seg.querySelector('.l').textContent, 'Arrêt');
    assert.equal(seg.querySelector('.t ha-icon').getAttribute('icon'), 'mdi:power');
    assert.match(seg.title, /21:00 → 24:00 · Arrêt$/);
  });

  test('a slot that sets the fan or the vanes shows a fan, and its title says the values; no slot shows an HVAC mode', () => {
    const card = cardOf(setup({ cooling: 'cool' }), { show: ['climate.atelier'] });
    const segs = $$(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg');
    assert.deepEqual(segs.map((s) => (s.querySelector('.t ha-icon') || { getAttribute: () => null }).getAttribute('icon')), [null, 'mdi:fan', null]);
    assert.match(segs[1].title, /Confort · Ventilateur 3 · Volets Oscillation$/);
    assert.equal(segs[1].getAttribute('aria-label'), segs[1].title);
    assert.equal(segs[0].title, 'Atelier · 00:00 → 14:00 · Éco');
  });

  test('the legend lists the presets, and Arrêt only when a shown week has an off slot', () => {
    assert.match(text($(cardOf(setup(), { show: ['climate.salon'] }), '.legend')), /^Hors-gel.*Éco.*Confort.*Boost.*Arrêt/);
    const legend = text($(cardOf(setup({ cooling: 'cool' }), { show: ['climate.atelier'] }), '.legend'));
    assert.doesNotMatch(legend, /Arrêt|Climatisation/);
  });

  test('a thermostat\'s page (week_only) keeps Arrêt in its legend', () => {
    assert.equal(text($(cardOf(setup(), { show: ['climate.salon'], week_only: true }), '.legend')), 'Arrêt');
    assert.equal($(cardOf(setup(), { show: ['climate.atelier'], week_only: true }), '.legend'), null);
  });

  test('on an off slot, "Arrêt" wins over the time; too narrow for both, the icon alone, larger', () => {
    // A 2 h off slot and a 30 min off slot
    const short = ['00:00 eco', '06:30 comfort', ['08:30', 'frost', OFF], '10:30 comfort', ['17:30', 'frost', OFF], '18:00 comfort'];
    const hass = setup({ weeks: { 'climate.salon': { Normal: Array(7).fill(short) }, 'climate.atelier': { Normal: Array(7).fill(['00:00 eco']) } } });
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] }); // two thermostats: compact thresholds
    const seg = (idx) => $(card, `.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="${idx}"]`);
    assert.equal(seg(2).querySelector('.l').textContent, 'Arrêt');
    assert.equal(seg(2).querySelector('.t').textContent, '', 'the time gives way to the word');
    assert.ok(seg(2).querySelector('.t ha-icon'));
    assert.equal(seg(4).querySelector('.l').textContent, '');
    assert.ok(seg(4).querySelector('.t.alone ha-icon'), 'the icon alone, at 14 px');
    // An "on" slot of two hours keeps its time
    assert.equal(seg(1).querySelector('.t').textContent, '06:30');
  });
});

describe('the slot popover: off, or a preset', () => {
  test('one row of chips, Arrêt first; nothing else decides whether the thermostat is on', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1); // 06:30 comfort
    assert.deepEqual(chips(card, '.editor'), ['Arrêt', 'Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
    assert.equal($(card, '.editor .power'), null);
    assert.equal($(card, '.editor select'), null, 'no HVAC mode, and no fan on a heater');
    assert.equal($(card, '.editor [data-act="capture"]'), null);
    assert.doesNotMatch(text($(card, '.editor')), /Marche|Fonctionnement|Au rallumage|Copier depuis/);
  });

  test('Arrêt turns the slot off, on the coldest preset; a preset turns it back on', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1);
    click(card, '.editor [data-act="slot-off"]');
    assert.equal(day(card, 'climate.salon', 0)[1], `06:30${OFF_SLOT}`);
    assert.ok(card._dirty);
    assert.deepEqual(chips(card, '.editor'), ['Arrêt ✓', 'Hors-gel', 'Éco', 'Confort', 'Boost']);
    assert.equal($(card, '.editor [data-act="slot-off"]').getAttribute('aria-pressed'), 'true');
    click(card, '.editor [data-act="preset"][data-preset="frost"]');
    assert.equal(day(card, 'climate.salon', 0)[1], '06:30 frost');
  });

  test('an air conditioner\'s off slot drops its fan and its vanes; a preset tapped keeps them', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1); // 14:00 comfort, fan 3
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 boost {"fan_mode":"3","swing_mode":"swing"}');
    click(card, '.editor [data-act="slot-off"]');
    assert.equal(day(card, 'climate.atelier', 0)[1], `14:00${OFF_SLOT}`);
    assert.equal($(card, '.editor details.more'), null);
  });

  test('a thermostat that lists no off has no Arrêt; an off slot it has stays, marked', () => {
    const hass = setup();
    hass.states['climate.salon'].attributes.hvac_modes = ['auto', 'heat'];
    const card = cardOf(hass, { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1);
    assert.equal($(card, '.editor [data-act="slot-off"]'), null);
    select(card, 'climate.salon', 0, 4);
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
    select(card, 'climate.atelier', 0, 1); // its own preset, whose temperature is not known yet
    assert.equal(setpoint(card), 'Consigne : son préréglage Confort');
  });

  test('in a schedule that says cool: the cooling setpoint, or "unchanged when cooling" without one', () => {
    const setpoint = (card) => text($(card, '.editor .slot-setpoint'));
    const hass = setup({ cooling: 'cool' });
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
    select(card, 'climate.atelier', 0, 1);
    assert.equal(setpoint(card), 'Consigne inchangée en clim');
    select(card, 'climate.salon', 0, 1); // a heater ignores what the schedule says
    assert.equal(setpoint(card), 'Consigne : 20 °C (son préréglage Confort)');
    hass.data.targets['climate.atelier'].comfort = { preset_mode: 'comfort', cool_temperature: 25.5 };
    hass.push({ ...hass.data });
    select(card, 'climate.atelier', 0, 1);
    assert.equal(setpoint(card), 'Consigne : 25,5 °C');
    // A device preset the user stored is sent when cooling too
    hass.data.targets['climate.atelier'].comfort = { preset_mode: 'boost' };
    hass.data.mappings = { 'climate.atelier': { comfort: { preset_mode: 'boost' } } };
    hass.push({ ...hass.data });
    select(card, 'climate.atelier', 0, 1);
    assert.equal(setpoint(card), 'Consigne : son préréglage Boost');
  });

  test('in a schedule that does not say: what the air conditioner does now decides', () => {
    const hass = setup();
    hass.states['climate.atelier'].state = 'cool';
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1);
    assert.equal(text($(card, '.editor .slot-setpoint')), 'Consigne inchangée en clim');
    // The schedule says heat: the heating value, whatever the air conditioner does now
    hass.push({ ...hass.data, schedules: hass.data.schedules.map((s) => (s.id === 'normal' ? { ...s, hvac_mode: 'heat' } : s)) });
    select(card, 'climate.atelier', 0, 1);
    assert.equal(text($(card, '.editor .slot-setpoint')), 'Consigne : son préréglage Confort');
  });
});

describe('an evening off slot keeps the air conditioner off until the morning', () => {
  const week = () => ({ 'climate.atelier': { Normal: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } });

  test('turning the evening off turns off the next day\'s first slot, which only continued the evening, and says so', () => {
    const card = cardOf(setup({ weeks: week() }), { show: ['climate.atelier'], group_days: false });
    select(card, 'climate.atelier', 0, 4); // Monday, 22:30 eco
    click(card, '.editor [data-act="slot-off"]');
    assert.equal(day(card, 'climate.atelier', 0)[4], `22:30${OFF_SLOT}`);
    assert.deepEqual(day(card, 'climate.atelier', 1).slice(0, 2), [`00:00${OFF_SLOT}`, '06:30 comfort']);
    assert.equal(text($(card, '.msg')), 'Arrêt toute la nuit, jusqu’à 06:30');
    assert.ok($(card, '.bar[data-climate="climate.atelier"][data-day="1"] .seg[data-idx="0"]').classList.contains('off'), 'shown as off');
    assert.deepEqual(day(card, 'climate.atelier', 2), WEEKDAY, 'the other days do not change');
  });

  test('from Sunday to Monday too', () => {
    const card = cardOf(setup({ weeks: week() }), { show: ['climate.atelier'], group_days: false });
    select(card, 'climate.atelier', 6, 2); // Sunday, 23:00 eco
    click(card, '.editor [data-act="slot-off"]');
    assert.deepEqual(day(card, 'climate.atelier', 0).slice(0, 2), [`00:00${OFF_SLOT}`, '06:30 comfort']);
  });

  test('a morning that starts on another preset is a choice: it stays', () => {
    const days = week();
    days['climate.atelier'].Normal[1] = ['00:00 comfort', '08:30 eco'];
    const card = cardOf(setup({ weeks: days }), { show: ['climate.atelier'], group_days: false });
    select(card, 'climate.atelier', 0, 4);
    click(card, '.editor [data-act="slot-off"]');
    assert.equal(day(card, 'climate.atelier', 1)[0], '00:00 comfort');
    assert.equal(text($(card, '.msg')), '');
  });

  test('a slot turned off during the day changes no other day', () => {
    const card = cardOf(setup({ weeks: week() }), { show: ['climate.atelier'], group_days: false });
    select(card, 'climate.atelier', 0, 2); // 08:30 eco
    click(card, '.editor [data-act="slot-off"]');
    assert.equal(day(card, 'climate.atelier', 1)[0], '00:00 eco');
  });

  test('on a row of days, each evening turns off the morning after', () => {
    const card = cardOf(setup({ weeks: week() }), { show: ['climate.atelier'] });
    assert.deepEqual(card._rows, [[0, 1, 2, 3, 4], [5, 6]]);
    select(card, 'climate.atelier', 0, 4);
    click(card, '.editor [data-act="slot-off"]');
    for (const d of [0, 1, 2, 3, 4]) assert.equal(day(card, 'climate.atelier', d).at(-1), `22:30${OFF_SLOT}`);
    for (const d of [1, 2, 3, 4, 5]) assert.equal(day(card, 'climate.atelier', d)[0], `00:00${OFF_SLOT}`);
    // Monday morning follows Sunday evening, which is on: the week shows it
    assert.equal(day(card, 'climate.atelier', 0)[0], '00:00 eco');
    assert.deepEqual(card._rows, [[0], [1, 2, 3, 4], [5], [6]]);
  });
});

describe('the schedule says whether the air conditioners heat or cool', () => {
  const choices = (card) => $$(card, '.sched-menu [data-act="schedule-hvac"]').map((b) => `${text(b)}${b.getAttribute('aria-checked') === 'true' ? ' ✓' : ''}`);

  test('a schedule\'s menu offers Ne pas changer, Chauffage and Climatisation', async () => {
    const hass = setup();
    const card = cardOf(hass);
    click(card, '.tab-tool[data-act="schedule-menu"]');
    assert.match(text($(card, '.sched-menu')), /Clims/);
    assert.deepEqual(choices(card), ['Ne pas changer ✓', 'Chauffage', 'Climatisation']);
    await card._action('schedule-hvac', { mode: 'cool' });
    assert.deepEqual(lastCall(hass), { type: 'chauffage/schedules/set', revision: 4,
      schedules: [{ id: 'normal', hvac_mode: 'cool' }, { id: 'away' }, { id: 'holiday' }] });
    assert.equal($(card, '.sched-menu'), null, 'the menu closes');
  });

  test('the schedule\'s tab shows ❄ or 🔥, and the menu checks the choice; Ne pas changer removes it', async () => {
    const hass = setup({ cooling: 'cool' });
    const card = cardOf(hass);
    const icon = $(card, '.tab[data-schedule="normal"] .tab-hvac');
    assert.equal(icon.getAttribute('icon'), 'mdi:snowflake');
    assert.equal(icon.getAttribute('title'), 'Climatisation');
    assert.equal($(card, '.tab[data-schedule="away"] .tab-hvac'), null);
    click(card, '.tab-tool[data-act="schedule-menu"]');
    assert.deepEqual(choices(card), ['Ne pas changer', 'Chauffage', 'Climatisation ✓']);
    await card._action('schedule-hvac', { mode: '' });
    assert.deepEqual(lastCall(hass).schedules[0], { id: 'normal', hvac_mode: null });
    hass.push({ ...hass.data, schedules: hass.data.schedules.map((s) => (s.id === 'normal' ? { ...s, hvac_mode: 'heat' } : s)) });
    assert.equal($(card, '.tab[data-schedule="normal"] .tab-hvac').getAttribute('icon'), 'mdi:fire');
  });

  test('the choice already made sends nothing', async () => {
    const hass = setup({ cooling: 'cool' });
    const card = cardOf(hass);
    click(card, '.tab-tool[data-act="schedule-menu"]');
    await card._action('schedule-hvac', { mode: 'cool' });
    assert.equal(hass.events.length, 0);
  });

  test('hidden when no scheduled thermostat heats and cools, unless the schedule already says', () => {
    const heaters = setup();
    heaters.states['climate.atelier'].attributes.hvac_modes = ['off', 'heat'];
    const card = cardOf(heaters);
    click(card, '.tab-tool[data-act="schedule-menu"]');
    assert.deepEqual(choices(card), []);
    const said = setup({ cooling: 'heat' });
    said.states['climate.atelier'].attributes.hvac_modes = ['off', 'heat'];
    const other = cardOf(said);
    click(other, '.tab-tool[data-act="schedule-menu"]');
    assert.deepEqual(choices(other), ['Ne pas changer', 'Chauffage ✓', 'Climatisation']);
  });

  test('the panel\'s Plannings page shows it on the schedule\'s row, and sets it from the row\'s menu', async () => {
    const hass = setup({ cooling: 'cool' });
    const card = createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], view: 'schedules', panel: true });
    assert.equal($(card, '.th-row[data-schedule="normal"] .tab-hvac').getAttribute('icon'), 'mdi:snowflake');
    click(card, '.th-row[data-schedule="away"] [data-act="schedule-menu"]');
    assert.deepEqual(choices(card), ['Ne pas changer ✓', 'Chauffage', 'Climatisation']);
    await card._action('schedule-hvac', { mode: 'heat' });
    assert.deepEqual(lastCall(hass).schedules, [{ id: 'normal' }, { id: 'away', hvac_mode: 'heat' }, { id: 'holiday' }]);
  });
});

describe('texts that name a slot', () => {
  const loc = makeLocale(null, 'fr');
  const name = (id) => ({ eco: 'Éco', comfort: 'Confort' })[id] || id;

  test('"Follows the schedule" says Arrêt for an off slot, and for the next slot', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T23:00:00+02:00') });
    try {
      assert.equal(planText({ preset: 'frost', hvac_mode: 'off', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
        'Arrêt jusqu\'à 06:30 (demain), puis Confort');
      assert.equal(planText({ preset: 'comfort', hvac_mode: 'cool', next_preset: 'frost', next_hvac_mode: 'off', next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
        'Confort jusqu\'à 06:30 (demain), puis Arrêt');
    } finally { mock.timers.reset(); }
  });

  test('an override\'s label: Arrêt, or the HVAC mode it was switched to by hand', () => {
    assert.equal(overrideLabel({ target: OFF }, loc), 'Arrêt');
    assert.equal(overrideLabel({ target: { hvac_mode: 'cool' } }, loc), 'Climatisation');
    assert.equal(overrideLabel({ target: { hvac_mode: 'cool', temperature: 24 } }, loc), '24 °C');
  });
});

describe('the override block: off, a preset, a temperature and its end', () => {
  const at = '2026-10-12T10:00:00+02:00';
  const span = { start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
  const offOverride = { target: OFF, ...span };
  const boost = { target: { preset_mode: 'boost' }, preset: 'boost', ...span };
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(at) }));
  afterEach(() => mock.timers.reset());

  test('the week view and the thermostat card show an off override as ⏱ Arrêt, without setpoint', () => {
    const hass = setup({ overrides: { 'climate.salon': offOverride } });
    hass.states['climate.salon'].attributes.temperature = 20;
    const card = cardOf(hass, { show: ['climate.salon'] });
    assert.match(text($(card, '.override[data-climate="climate.salon"] .override-label')), /⏱ Arrêt → 11:30/);
    const tc = thermostatCard(hass);
    assert.equal(text($(tc, '.tc-state')), '⏱ Arrêt');
    assert.ok($(tc, '.tc-state').classList.contains('override'));
  });

  test('one row of chips, Arrêt first: no Marche, no HVAC mode', () => {
    const hass = setup({ overrides: { 'climate.atelier': boost } });
    const card = cardOf(hass, { show: ['climate.atelier'] });
    click(card, '.override[data-climate="climate.atelier"]');
    assert.deepEqual(chips(card, '.override-ed'), ['Arrêt', 'Hors-gel', 'Éco', 'Confort', 'Boost ✓']);
    assert.equal($(card, '.override-ed select'), null);
    assert.equal($(card, '.override-ed .power'), null);
    assert.doesNotMatch(text($(card, '.override-ed')), /Marche|Fonctionnement/);
  });

  test('Arrêt turns the override off, and nothing else', () => {
    const hass = setup({ overrides: { 'climate.salon': boost } });
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    click(card, '.override-ed [data-act="override-off"]');
    assert.deepEqual(lastCall(hass).override, offOverride);
  });

  test('a preset tapped during an off override turns the thermostat on; a temperature typed too', () => {
    const hass = setup({ overrides: { 'climate.salon': offOverride } });
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    assert.deepEqual(chips(card, '.override-ed'), ['Arrêt ✓', 'Hors-gel', 'Éco', 'Confort', 'Boost']);
    click(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]');
    assert.deepEqual(lastCall(hass).override, { ...offOverride, target: { preset_mode: 'comfort' }, preset: 'comfort' });
    change($(card, '.override-ed [data-override-temperature]'), '21');
    assert.deepEqual(lastCall(hass).override.target, { temperature: 21 });
    // In the more-info block too
    const el = moreInfo(hass);
    $(el, '[data-act="override-preset"][data-preset="eco"]').click();
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'eco' });
  });

  test('Arrêt on an "on" override during an off slot resumes the schedule', () => {
    const hass = setup({ overrides: { 'climate.salon': boost }, planned: { 'climate.salon': { preset: 'frost', hvac_mode: 'off' } } });
    const card = cardOf(hass, { show: ['climate.salon'] });
    click(card, '.override[data-climate="climate.salon"]');
    click(card, '.override-ed [data-act="override-off"]');
    assert.equal(lastCall(hass).override, null);
  });

  test('an air conditioner switched to cool by hand keeps cooling when a preset is tapped or a temperature typed', () => {
    const cooling = { target: { hvac_mode: 'cool', fan_mode: '2' }, ...span };
    const hass = setup({ overrides: { 'climate.atelier': cooling } });
    const card = cardOf(hass, { show: ['climate.atelier'] });
    click(card, '.override[data-climate="climate.atelier"]');
    click(card, '.override-ed [data-act="override-preset"][data-preset="eco"]');
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'eco', hvac_mode: 'cool' });
    change($(card, '.override-ed [data-override-temperature]'), '24');
    assert.deepEqual(lastCall(hass).override.target, { hvac_mode: 'cool', temperature: 24 });
    assert.equal(lastCall(hass).override.preset, undefined);
  });

  test('a new override from the card can be Arrêt (#77 without a script)', () => {
    const hass = setup();
    const card = cardOf(hass, { show: ['climate.salon'] });
    card._overrideSel = { climate: 'climate.salon', create: true };
    card._render();
    click(card, '.override-ed [data-act="override-off"]');
    assert.deepEqual(lastCall(hass).override.target, OFF);
    assert.equal(lastCall(hass).override.end, '2026-10-12T10:00:00.000Z'); // the override duration, 2 h
  });

  test('"then Arrêt (schedule)" after an override that heats; never after an off override', () => {
    mock.timers.setTime(new Date('2026-10-12T21:30:00+02:00').getTime());
    const evening = { start: '2026-10-12T20:30:00+02:00', end: '2026-10-12T22:00:00+02:00' };
    const heating = moreInfo(setup({ overrides: { 'climate.salon': { ...boost, ...evening } } }));
    assert.match(text(heating.shadowRoot), /puis Arrêt \(planning\)/);
    cleanup();
    // Off until 22:00, and the schedule is off from 21:00: the off override ends there
    const off = moreInfo(setup({ overrides: { 'climate.salon': { ...offOverride, ...evening } } }));
    assert.doesNotMatch(text($(off, '.status')), /puis/);
  });

  test('on a thermostat card the block is folded: the override, its end and Resume; Change unfolds the rest', () => {
    const hass = setup({ overrides: { 'climate.salon': boost } });
    const tc = thermostatCard(hass);
    const block = $(tc, 'chauffage-moreinfo');
    const fold = $(block, '.status details.change');
    assert.equal(fold.open, false);
    assert.equal(text(fold.querySelector('summary')), 'Modifier');
    assert.ok(fold.querySelector('.presets') && fold.querySelector('[data-override-temperature]') && fold.querySelector('[data-min="30"]'));
    assert.ok($(block, '.status [data-del]') && !fold.querySelector('[data-del]'), 'Resume stays in sight');
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

describe('the thermostat card chip and the row chip', () => {
  test('a VTherm heating at the frost setpoint for its open window says so, without setpoint', () => {
    const hass = setup({ thermostats: { 'climate.salon': { paused: false, revision: 7, cause: 'window' } } });
    hass.states['climate.salon'].attributes.temperature = 7;
    hass.states['climate.salon'].attributes.requested_state = { hvac_mode: 'heat', preset: 'eco', target_temperature: 17 };
    assert.equal(text($(thermostatCard(hass), '.tc-state')), 'Fenêtre ouverte · Éco');
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
    assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'fenêtre ouverte');
  });

  test('an off slot reads Arrêt, grey, without setpoint', () => {
    const hass = setup({ planned: { 'climate.salon': { preset: 'frost', hvac_mode: 'off', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' } } });
    hass.states['climate.salon'].state = 'off';
    hass.states['climate.salon'].attributes.temperature = 17;
    const tc = thermostatCard(hass);
    assert.equal(text($(tc, '.tc-state')), 'Arrêt');
    assert.ok(!$(tc, '.tc-state').classList.contains('override'));
  });

  test('a VTherm off by its window or its auto start/stop says why, and the preset it restarts on', () => {
    const hass = setup({ thermostats: { 'climate.salon': { paused: false, revision: 7, cause: 'window' } } });
    hass.entities['climate.salon'].platform = 'versatile_thermostat';
    hass.states['climate.salon'].state = 'off';
    hass.states['climate.salon'].attributes.requested_state = { hvac_mode: 'heat', preset: 'comfort', target_temperature: 20 };
    const tc = thermostatCard(hass);
    assert.equal(text($(tc, '.tc-state')), 'Fenêtre ouverte · Confort');
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
    assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'fenêtre ouverte');
    hass.push({ ...hass.data, thermostats: { ...hass.data.thermostats, 'climate.salon': { paused: false, revision: 7, cause: 'auto_start_stop' } } });
    assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'arrêt auto');
  });
});

describe('the presets tab', () => {
  const open = (hass) => createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], view: 'presets' });
  const cell = (card, preset, climate) => $(card, `[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="${climate}"]`);
  const rows = (card) => $$(card, '.cell-ed .pv-choices .pv-row').map((r) => `${text(r.querySelector('span'))}${r.querySelector('input[type=radio]').checked ? ' ✓' : ''}`);
  const choose = (card, value) => { $(card, `.cell-ed input[name="cell-choice"][value="${value}"]`).checked = true; };
  const type = (card, selector, value) => { const field = $(card, `.cell-ed ${selector}`); field.value = value; field.dispatchEvent(new window.Event('input', { bubbles: true })); };

  test('a preset is a name, a color and a default temperature: it does not turn the thermostats off', async () => {
    const hass = setup();
    const card = open(hass);
    assert.equal(text($(card, '[data-kind="preset"][data-preset="eco"] .pv-default')), '17° par défaut');
    click(card, '[data-kind="preset"][data-preset="eco"]');
    assert.equal($(card, '.cell-ed .power'), null);
    assert.doesNotMatch(text($(card, '.cell-ed')), /Marche|Arrêt|Fonctionnement/);
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).presets.find((p) => p.id === 'eco'), { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17 });
  });

  test('a cell asks one question: the default, its own preset, or a temperature', async () => {
    const hass = setup();
    const card = open(hass);
    cell(card, 'comfort', 'climate.salon').click();
    assert.deepEqual(rows(card), ['Par défaut (son préréglage Confort, 20°) ✓', 'Son préréglage', 'Température']);
    assert.equal($(card, '.cell-ed input[type=checkbox]'), null);
    assert.equal($(card, '.cell-ed [data-cell-hvac]'), null);
    assert.doesNotMatch(text($(card, '.cell-ed')), /Personnalisé|Cochez|Fonctionnement|En chauffe|En clim/);
    assert.ok($(card, '.cell-ed [data-act="capture"]'), 'Copy from the thermostat stays here');
    await card._action('cell-apply', {});
    assert.equal(hass.events.some((e) => e.type === 'chauffage/mapping/set'), false, 'the default: nothing stored');
  });

  test('picking one of its presets chooses "Its preset"; the temperature\'s field chooses "Temperature"', async () => {
    const hass = setup();
    const card = open(hass);
    cell(card, 'comfort', 'climate.salon').click();
    change($(card, '.cell-ed [data-cell-preset]'), 'boost');
    assert.deepEqual(rows(card), ['Par défaut (son préréglage Confort, 20°)', 'Son préréglage ✓', 'Température']);
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass), { type: 'chauffage/mapping/set', entity_id: 'climate.salon', mapping: { comfort: { preset_mode: 'boost' } } });
    cell(card, 'comfort', 'climate.salon').click();
    click(card, '.cell-ed [data-act="cell-step"][data-delta="0.5"]');
    assert.deepEqual(rows(card), ['Par défaut (son préréglage Confort, 20°)', 'Son préréglage', 'Température ✓']);
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { temperature: 20.5 } }, 'a temperature, not a preset and a temperature');
    // Its own preset of the same name, chosen by hand, is the default
    cell(card, 'comfort', 'climate.salon').click();
    choose(card, 'own');
    hass.events.length = 0;
    await card._action('cell-apply', {});
    assert.equal(hass.events.length, 0);
  });

  test('a stored value opens on its row; the default then OK drops it', async () => {
    const hass = setup();
    hass.data.mappings = { 'climate.salon': { comfort: { temperature: 19.5 }, eco: { preset_mode: 'frost' } } };
    hass.data.targets['climate.salon'].comfort = { temperature: 19.5 };
    const card = open(hass);
    cell(card, 'eco', 'climate.salon').click();
    assert.equal($(card, '.cell-ed [data-cell-preset]').value, 'frost');
    assert.deepEqual(rows(card).map((r) => r.endsWith('✓')), [false, true, false]);
    cell(card, 'comfort', 'climate.salon').click();
    assert.deepEqual(rows(card).map((r) => r.endsWith('✓')), [false, false, true]);
    assert.equal($(card, '.cell-ed [data-cell-temp]').value, '19,5');
    choose(card, 'default');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { eco: { preset_mode: 'frost' } });
    assert.equal($(card, '.cell-ed'), null);
  });

  test('an air conditioner that heats and cools: "En chauffe" over the rows, "En clim" over a field of its own', async () => {
    const hass = setup();
    const card = open(hass);
    cell(card, 'comfort', 'climate.atelier').click();
    assert.deepEqual($$(card, '.cell-ed .pv-when').map(text), ['En chauffe', 'En clim']);
    assert.deepEqual($$(card, '.cell-ed .pv-when ha-icon').map((i) => i.getAttribute('icon')), ['mdi:fire', 'mdi:snowflake']);
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '');
    assert.equal($(card, '.cell-ed .pv-coolnote').hidden, false);
    assert.equal(text($(card, '.cell-ed .pv-coolnote')), 'Consigne inchangée en clim');
    // A cooling setpoint with the default when heating
    type(card, '[data-cell-cool]', '25,5');
    assert.equal($(card, '.cell-ed .pv-coolnote').hidden, true);
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { cool_temperature: 25.5 } });
    // And with a temperature when heating
    cell(card, 'comfort', 'climate.atelier').click();
    type(card, '[data-cell-temp]', '20');
    click(card, '.cell-ed .pv-cool [data-act="cell-step"][data-delta="0.5"]'); // from the heating temperature
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { temperature: 20, cool_temperature: 20.5 } });
  });

  test('a cooling setpoint stored shows in its field and in the cell; emptied, it is dropped', async () => {
    const hass = setup();
    hass.data.mappings = { 'climate.atelier': { comfort: { temperature: 20, cool_temperature: 25 } } };
    hass.data.targets['climate.atelier'].comfort = { temperature: 20, cool_temperature: 25 };
    const card = open(hass);
    const shown = cell(card, 'comfort', 'climate.atelier');
    assert.equal(text(shown.querySelector('.pv-val')), '20° · 25°');
    assert.deepEqual([...shown.querySelectorAll('.pv-val ha-icon')].map((i) => i.getAttribute('icon')), ['mdi:fire', 'mdi:snowflake']);
    shown.click();
    assert.equal($(card, '.cell-ed [data-cell-cool]').value, '25');
    assert.equal($(card, '.cell-ed .pv-coolnote').hidden, true);
    type(card, '[data-cell-cool]', '');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { temperature: 20 } });
  });

  test('a temperature that is not a number is not saved', async () => {
    const hass = setup();
    const card = open(hass);
    cell(card, 'comfort', 'climate.salon').click();
    type(card, '[data-cell-temp]', 'chaud');
    await card._action('cell-apply', {});
    assert.equal(hass.events.length, 0);
    assert.ok($(card, '.cell-ed'));
  });

  test('temperature fields show the user\'s decimal separator, and read both', async () => {
    const hass = setup();
    hass.data.mappings = { 'climate.salon': { frost: { temperature: 8.5 } } };
    const card = open(hass);
    cell(card, 'frost', 'climate.salon').click();
    const field = $(card, '.cell-ed [data-cell-temp]');
    assert.equal(field.value, '8,5');
    assert.equal(field.getAttribute('inputmode'), 'decimal');
    field.value = '9,5';
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 9.5 } });
    cell(card, 'frost', 'climate.salon').click();
    $(card, '.cell-ed [data-cell-temp]').value = '10.5';
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 10.5 } });
  });

  test('the intro of the tab is short', () => {
    assert.equal(text($(open(setup()), '.pv-intro')),
      'Un préréglage est une intention (Confort, Éco…). Chaque thermostat la traduit en ses propres réglages. Choisissez un préréglage ou une case pour le modifier.');
  });
});
