// The slot chooses the HVAC mode: heat or cool with a preset, off or fan only without one. The
// preset says how warm, for each thermostat and for that HVAC mode (#91). In the card: the week
// view, the slot popover, the override block, the presets tab and the thermostat card.
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { parseDay, serializeDay, normalize, planText, overrideLabel, makeLocale, coolColor, derivedCoolColor } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const OFF = { hvac_mode: 'off' };
const COOL = { hvac_mode: 'cool' };
const FAN = { hvac_mode: 'fan_only' };
const OFF_SLOT = ' - {"hvac_mode":"off"}'; // an off slot has no preset
const NIGHT = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', ['21:00', null, OFF]];
const FAN_DAY = ['00:00 eco', ['14:00', 'comfort', { fan_mode: '3', swing_mode: 'swing' }], '20:00 eco'];
// Comfort in cool in the afternoon, then fan only in the evening
const SUMMER = ['00:00 eco', ['14:00', 'comfort', COOL], ['20:00', null, { hvac_mode: 'fan_only', fan_mode: '3' }], ['23:00', null, OFF]];
const AC_MODES = ['off', 'heat', 'cool', 'fan_only'];
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const lastCall = (hass) => hass.events.at(-1);
const day = (card, climate, d) => serializeDay(card._week(climate)[d]);
const chips = (root, scope) => $$(root, `${scope} .presets button`).map((b) => `${text(b)}${b.classList.contains('on') ? ' ✓' : ''}`);
// A color as the browser writes it in a style: "rgb(25, 118, 210)"
const rgb = (hex) => { const el = document.createElement('i'); el.style.background = hex; return el.style.background; };
const PRESET_COLORS = { comfort: '#f57c00', eco: '#43a047', boost: '#e53935', frost: '#29b6f6' };

// The salon, a heater (heat / off), and the workshop, a reversible air conditioner (#61)
function setup({ weeks, targets, overrides, planned, thermostats, atelier } = {}) {
  const data = integrationData({
    weeks: weeks || { 'climate.salon': { Normal: [NIGHT, NIGHT, NIGHT, NIGHT, NIGHT, WEEKEND, WEEKEND] },
      'climate.atelier': { Normal: Array(5).fill(atelier || FAN_DAY).concat([WEEKEND, WEEKEND]) } },
    overrides, planned,
  });
  data.targets = targets || {
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
    'climate.atelier': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 16 } },
  };
  data.preset_temperatures = { 'climate.salon': { comfort: 20, eco: 17, boost: 21 } };
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

describe('a slot is a preset, off, or fan only', () => {
  test('a slot is parsed from the integration with its settings, and serialized back', () => {
    const segs = parseDay([['00:00', 'eco'], ['14:00', 'comfort', COOL], ['22:30', null, OFF]]);
    assert.deepEqual(segs, [{ start: 0, preset: 'eco' }, { start: 840, preset: 'comfort', settings: COOL }, { start: 22 * 60 + 30, preset: null, settings: OFF }]);
    assert.deepEqual(serializeDay(segs), ['00:00 eco', '14:00 comfort {"hvac_mode":"cool"}', '22:30 - {"hvac_mode":"off"}']);
    assert.deepEqual(parseDay(serializeDay(segs)), segs);
  });

  test('a slot\'s HVAC mode is heat, cool, off or fan only; off and fan only have no preset, and off sets nothing else', () => {
    assert.deepEqual(parseDay([['00:00', 'eco'], ['14:00', 'comfort', { fan_mode: '2', hvac_mode: 'cool' }]]),
      [{ start: 0, preset: 'eco' }, { start: 840, preset: 'comfort', settings: { hvac_mode: 'cool', fan_mode: '2' } }]);
    assert.deepEqual(parseDay([['00:00', 'eco', { hvac_mode: 'auto', fan_mode: '2' }]]), [{ start: 0, preset: 'eco', settings: { fan_mode: '2' } }]);
    assert.deepEqual(parseDay([['00:00', 'eco', { hvac_mode: 'off', fan_mode: '2' }]]), [{ start: 0, preset: null, settings: OFF }]);
    assert.deepEqual(parseDay([['00:00', 'eco', { hvac_mode: 'fan_only', fan_mode: '2' }]]), [{ start: 0, preset: null, settings: { hvac_mode: 'fan_only', fan_mode: '2' } }]);
    // A slot without a preset and without off or fan only is not a slot
    assert.deepEqual(parseDay([['00:00', 'eco'], ['12:00', null, COOL]]), [{ start: 0, preset: 'eco' }]);
  });

  test('two off slots in a row are one slot; two fan-only slots too when their settings are equal', () => {
    const quiet = { hvac_mode: 'fan_only', fan_mode: '1' };
    const merged = normalize([{ start: 0, preset: 'eco' }, { start: 600, preset: null, settings: OFF }, { start: 700, preset: null, settings: OFF },
      { start: 800, preset: null, settings: FAN }, { start: 850, preset: null, settings: FAN }, { start: 900, preset: null, settings: quiet },
      { start: 1000, preset: 'eco' }, { start: 1100, preset: 'eco', settings: COOL }]);
    assert.deepEqual(merged, [{ start: 0, preset: 'eco' }, { start: 600, preset: null, settings: OFF }, { start: 800, preset: null, settings: FAN },
      { start: 900, preset: null, settings: quiet }, { start: 1000, preset: 'eco' }, { start: 1100, preset: 'eco', settings: COOL }]);
  });

  test('days are grouped on one row only when their slots match in full, settings included', () => {
    const plain = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', '21:00 eco'];
    const card = cardOf(setup({ weeks: { 'climate.salon': { Normal: [NIGHT, plain, NIGHT, NIGHT, NIGHT, WEEKEND, WEEKEND] } } }), { show: ['climate.salon'] });
    assert.deepEqual(card._rows, [[0, 2, 3, 4], [1], [5, 6]]);
  });

  test('Save sends a slot with its settings as a third element, and no preset for an off slot', async () => {
    const hass = setup();
    const card = cardOf(hass, { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1);
    click(card, '.editor [data-act="preset"][data-preset="boost"]');
    await card._action('save', {});
    const sent = hass.events.find((e) => e.type === 'chauffage/weeks/save');
    assert.deepEqual(sent.weeks['climate.salon'].normal[0], [['00:00', 'eco'], ['06:30', 'boost'], ['08:30', 'eco'], ['17:30', 'comfort'], ['21:00', null, OFF]]);
  });

  test('a piece cut out of an off slot or of a fan-only slot is on a preset; out of a slot, it keeps its HVAC mode, its fan and its vanes', () => {
    const card = cardOf(setup({ atelier: SUMMER }));
    card._split('climate.salon', 0, 23 * 60); // in 21:00, off
    assert.deepEqual(day(card, 'climate.salon', 0).slice(4), [`21:00${OFF_SLOT}`, '23:00 comfort']);
    card._split('climate.atelier', 0, 16 * 60); // in 14:00 comfort, cool
    assert.deepEqual(day(card, 'climate.atelier', 0).slice(1, 3), ['14:00 comfort {"hvac_mode":"cool"}', '16:00 eco {"hvac_mode":"cool"}']);
    card._split('climate.atelier', 0, 21 * 60); // in 20:00 fan only, fan 3
    assert.deepEqual(day(card, 'climate.atelier', 0).slice(3, 5), ['20:00 - {"hvac_mode":"fan_only","fan_mode":"3"}', '21:00 comfort {"fan_mode":"3"}']);
  });

  test('a day copied to a thermostat that cannot be turned off loses its off slot, and the message says so', () => {
    const card = cardOf(setup(), { show: ['climate.salon', 'climate.atelier'] });
    card._hass.states['climate.atelier'].attributes.hvac_modes = ['heat', 'cool'];
    card._copyDay('climate.salon', 0, 'others');
    assert.deepEqual(day(card, 'climate.atelier', 0).at(-1), '17:30 comfort', 'the slot before it goes on');
    assert.match(text($(card, '.msg')), /réglages non pris en charge ignorés/);
  });

  test('a day copied to a heater loses its cool and its fan-only slots', () => {
    const card = cardOf(setup({ atelier: SUMMER }), { show: ['climate.salon', 'climate.atelier'] });
    card._copyDay('climate.atelier', 0, 'others');
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 eco', '14:00 comfort', `23:00${OFF_SLOT}`]);
  });
});

describe('the week view', () => {
  test('an off slot is grey, named Arrêt, with the power icon', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    const seg = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="4"]');
    assert.ok(seg.classList.contains('off'));
    assert.equal(seg.style.background, 'rgb(97, 97, 97)');
    assert.equal(seg.querySelector('.l').textContent, 'Arrêt');
    assert.equal(seg.querySelector('.t ha-icon').getAttribute('icon'), 'mdi:power');
    assert.match(seg.title, /21:00 → 24:00 · Arrêt$/);
  });

  test('a cooling slot is drawn in its preset\'s cool color, with a snowflake; its title says Clim', () => {
    const card = cardOf(setup({ atelier: SUMMER }), { show: ['climate.atelier'] });
    const seg = (idx) => $(card, `.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="${idx}"]`);
    const comfort = { id: 'comfort', color: PRESET_COLORS.comfort };
    assert.equal(seg(1).style.background, rgb(coolColor(comfort)));
    assert.notEqual(seg(1).style.background, rgb(PRESET_COLORS.comfort));
    assert.equal(seg(1).querySelector('.t ha-icon').getAttribute('icon'), 'mdi:snowflake');
    assert.match(seg(1).title, /14:00 → 20:00 · Confort · Clim$/);
    assert.equal(seg(0).style.background, rgb(PRESET_COLORS.eco), 'a slot without an HVAC mode keeps the heat color');
    assert.equal(seg(0).querySelector('ha-icon'), null);
  });

  test('a preset\'s own cool color wins over the derived one', () => {
    const hass = setup({ atelier: SUMMER });
    hass.data.presets = hass.data.presets.map((p) => (p.id === 'comfort' ? { ...p, cool_color: '#123456' } : p));
    const card = cardOf(hass, { show: ['climate.atelier'] });
    assert.equal($(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="1"]').style.background, rgb('#123456'));
  });

  test('the derived cool colors are blue shades, dark enough for white text, one per preset', () => {
    const cool = Object.values(PRESET_COLORS).map(derivedCoolColor);
    assert.equal(new Set(cool).size, 4);
    for (const hex of cool) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(b > r && b > g, `${hex} is a blue`);
      assert.ok((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5, `${hex} is dark enough for white text`);
    }
    assert.equal(derivedCoolColor('not a color'), derivedCoolColor('#9e9e9e'));
  });

  test('a fan-only slot has Home Assistant\'s color of fan only, a fan, and the word Ventilation', () => {
    const card = cardOf(setup({ atelier: SUMMER }), { show: ['climate.atelier'] });
    const seg = $(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="2"]');
    assert.ok(seg.classList.contains('fan'));
    assert.equal(seg.style.background, '', 'its color is its class\'s: var(--state-climate-fan_only-color), cyan by default');
    assert.match($(card, 'style').textContent, /\.seg\.fan[^}]*background:var\(--state-climate-fan_only-color, rgb\(0, 188, 212\)\)/);
    assert.match($(card, 'style').textContent, /\.seg\.fan[^}]*color:rgba\(0,0,0,\.87\)/, 'dark text: white is not legible on cyan');
    assert.equal(seg.querySelector('.l').textContent, 'Ventilation');
    assert.deepEqual([...seg.querySelectorAll('.t ha-icon')].map((i) => i.getAttribute('icon')), ['mdi:fan', 'mdi:tune-variant']);
    assert.match(seg.title, /20:00 → 23:00 · Ventilation · Ventilateur 3$/);
  });

  test('a slot that sets the fan or the vanes shows a mark, and its title says the values', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    const segs = $$(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg');
    assert.deepEqual(segs.map((s) => (s.querySelector('.t ha-icon') || { getAttribute: () => null }).getAttribute('icon')), [null, 'mdi:tune-variant', null]);
    assert.match(segs[1].title, /Confort · Ventilateur 3 · Volets Oscillation$/);
    assert.equal(segs[1].getAttribute('aria-label'), segs[1].title);
    assert.equal(segs[0].title, 'Atelier · 00:00 → 14:00 · Éco');
  });

  test('the legend lists the presets; Arrêt and Ventilation only when a shown week has such a slot', () => {
    assert.match(text($(cardOf(setup(), { show: ['climate.salon'] }), '.legend')), /^Hors-gel.*Éco.*Confort.*Boost.*Arrêt/);
    assert.doesNotMatch(text($(cardOf(setup(), { show: ['climate.atelier'] }), '.legend')), /Arrêt|Ventilation|Clim/);
    const summer = cardOf(setup({ atelier: SUMMER }), { show: ['climate.atelier'] });
    assert.match(text($(summer, '.legend')), /Boost.*Arrêt.*Ventilation/);
    assert.ok($(summer, '.legend .legend-fan i.fan'));
  });

  test('the legend shows each preset\'s cool color next to its heat color when a shown thermostat cools', () => {
    const heater = cardOf(setup(), { show: ['climate.salon'] });
    assert.equal($$(heater, '.legend i.cool').length, 0);
    const ac = cardOf(setup(), { show: ['climate.atelier'] });
    assert.deepEqual($$(ac, '.legend i.cool').map((i) => i.style.background),
      ['frost', 'eco', 'comfort', 'boost'].map((id) => rgb(derivedCoolColor(PRESET_COLORS[id]))));
  });

  test('a thermostat\'s page (week_only) keeps Arrêt in its legend', () => {
    assert.equal(text($(cardOf(setup(), { show: ['climate.salon'], week_only: true }), '.legend')), 'Arrêt');
    assert.equal($(cardOf(setup(), { show: ['climate.atelier'], week_only: true }), '.legend'), null);
  });

  test('on an off slot, "Arrêt" wins over the time; too narrow for both, the icon alone, larger', () => {
    // A 2 h off slot and a 30 min off slot
    const short = ['00:00 eco', '06:30 comfort', ['08:30', null, OFF], '10:30 comfort', ['17:30', null, OFF], '18:00 comfort'];
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

describe('the slot popover', () => {
  const hvac = (card) => $$(card, '.editor .hvac-row button').map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`);

  test('a heater: one row of chips, Arrêt first; no Ventilation, no HVAC mode', () => {
    const card = cardOf(setup(), { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 1); // 06:30 comfort
    assert.deepEqual(chips(card, '.editor'), ['Arrêt', 'Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
    assert.equal($(card, '.editor .hvac-row'), null);
    assert.equal($(card, '.editor select'), null, 'no fan on a heater');
    assert.equal($(card, '.editor [data-act="capture"]'), null);
    assert.doesNotMatch(text($(card, '.editor')), /Marche|Fonctionnement|Au rallumage|Copier depuis|Clim|Ventilation/);
  });

  test('an air conditioner: Arrêt, Ventilation, then the presets; under them, Chauffage and Clim', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1); // 14:00 comfort
    assert.deepEqual(chips(card, '.editor'), ['Arrêt', 'Ventilation', 'Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
    assert.deepEqual(hvac(card), ['Chauffage', 'Clim'], 'none chosen: the thermostat keeps the HVAC mode it has');
    assert.equal($(card, '.editor .hvac-row').getAttribute('aria-label'), 'Mode HVAC');
    assert.deepEqual($$(card, '.editor .hvac-row ha-icon').map((i) => i.getAttribute('icon')), ['mdi:fire', 'mdi:snowflake']);
  });

  test('Clim makes the slot cool, and the chips take their cool colors; tapped again, the slot chooses no HVAC mode', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1);
    click(card, '.editor [data-act="slot-hvac"][data-mode="cool"]');
    assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 comfort {"hvac_mode":"cool","fan_mode":"3","swing_mode":"swing"}');
    assert.ok(card._dirty);
    assert.deepEqual(hvac(card), ['Chauffage', 'Clim ✓']);
    assert.equal($(card, '.editor [data-act="preset"][data-preset="comfort"]').style.background, rgb(derivedCoolColor(PRESET_COLORS.comfort)));
    click(card, '.editor [data-act="preset"][data-preset="eco"]'); // another preset keeps the HVAC mode
    assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 eco {"hvac_mode":"cool","fan_mode":"3","swing_mode":"swing"}');
    click(card, '.editor [data-act="slot-hvac"][data-mode="heat"]');
    assert.deepEqual(hvac(card), ['Chauffage ✓', 'Clim']);
    click(card, '.editor [data-act="slot-hvac"][data-mode="heat"]');
    assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 eco {"fan_mode":"3","swing_mode":"swing"}');
    assert.equal($(card, '.editor [data-act="preset"][data-preset="comfort"]').style.background, rgb(PRESET_COLORS.comfort));
  });

  test('Ventilation: no preset, no HVAC mode row, no setpoint; the fan and the vanes stay under "Plus de réglages"', () => {
    const card = cardOf(setup(), { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1);
    click(card, '.editor [data-act="slot-fan"]');
    assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 - {"hvac_mode":"fan_only","fan_mode":"3","swing_mode":"swing"}');
    assert.deepEqual(chips(card, '.editor'), ['Arrêt', 'Ventilation ✓', 'Hors-gel', 'Éco', 'Confort', 'Boost']);
    assert.equal($(card, '.editor .hvac-row'), null);
    assert.equal($(card, '.editor .slot-setpoint'), null);
    assert.equal(text($(card, '.editor details.more summary')), 'Ventilateur 3 · Volets Oscillation');
    change($(card, '.editor [data-slot-setting="fan_mode"]'), '1');
    assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 - {"hvac_mode":"fan_only","fan_mode":"1","swing_mode":"swing"}');
    // A preset tapped: the slot is on that preset, and keeps its fan and its vanes
    click(card, '.editor [data-act="preset"][data-preset="eco"]');
    assert.equal(day(card, 'climate.atelier', 0)[1], '14:00 eco {"fan_mode":"1","swing_mode":"swing"}');
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
    assert.equal($(card, '.editor .hvac-row'), null);
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

  test('a cooling-only air conditioner with a fan: the row offers Clim alone; one without a fan has no row', () => {
    const hass = setup();
    hass.states['climate.atelier'].attributes.hvac_modes = ['off', 'cool', 'fan_only'];
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1);
    assert.deepEqual(hvac(card), ['Clim']);
    hass.states['climate.atelier'].attributes.hvac_modes = ['off', 'cool'];
    select(card, 'climate.atelier', 0, 1);
    assert.equal($(card, '.editor .hvac-row'), null);
    assert.equal($(card, '.editor [data-act="slot-fan"]'), null);
  });

  test('a thermostat that lists no off has no Arrêt; an off slot, a fan-only slot or a cool slot it has stays, marked', () => {
    const hass = setup({ weeks: { 'climate.salon': { Normal: Array(7).fill(SUMMER) }, 'climate.atelier': { Normal: Array(7).fill(FAN_DAY) } } });
    hass.states['climate.salon'].attributes.hvac_modes = ['auto', 'heat'];
    const card = cardOf(hass, { show: ['climate.salon'] });
    select(card, 'climate.salon', 0, 0);
    assert.equal($(card, '.editor [data-act="slot-off"]'), null);
    assert.equal($(card, '.editor [data-act="slot-fan"]'), null);
    select(card, 'climate.salon', 0, 1); // comfort, cool
    assert.deepEqual(hvac(card), ['Clim (indisponible) ✓']);
    select(card, 'climate.salon', 0, 2);
    assert.equal(text($(card, '.editor [data-act="slot-fan"]')), 'Ventilation (indisponible)');
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
    select(card, 'climate.atelier', 0, 1); // its own preset, whose temperature is not known yet
    assert.equal(setpoint(card), 'Consigne : son préréglage Confort');
  });

  test('on a slot that cools: the cooling temperature, else its own preset, else "unchanged when cooling"', () => {
    const setpoint = (card) => text($(card, '.editor .slot-setpoint'));
    const hass = setup({ atelier: SUMMER });
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1); // comfort in cool: its own preset, which the device reads in cool
    assert.equal(setpoint(card), 'Consigne : son préréglage Confort');
    click(card, '.editor [data-act="preset"][data-preset="frost"]'); // a temperature: a heating value, never sent in cool
    assert.equal(setpoint(card), 'Consigne inchangée en clim');
    hass.data.targets['climate.atelier'].frost = { temperature: 16, cool_temperature: 25.5 };
    hass.push({ ...hass.data });
    card._render();
    assert.equal(setpoint(card), 'Consigne : 25,5 °C');
  });

  test('a slot without an HVAC mode: what the air conditioner does now decides', () => {
    const hass = setup();
    hass.states['climate.atelier'].state = 'cool';
    hass.data.targets['climate.atelier'].comfort = { temperature: 20 };
    const card = cardOf(hass, { show: ['climate.atelier'] });
    select(card, 'climate.atelier', 0, 1);
    assert.equal(text($(card, '.editor .slot-setpoint')), 'Consigne inchangée en clim');
    click(card, '.editor [data-act="slot-hvac"][data-mode="heat"]'); // the slot says heat: the heating value
    assert.equal(text($(card, '.editor .slot-setpoint')), 'Consigne : 20 °C');
  });
});

describe('a schedule has no HVAC mode', () => {
  test('no choice in its menu, no icon on its tab, nothing sent with it', async () => {
    const hass = setup();
    hass.data.schedules[0].hvac_mode = 'cool'; // what a development version stored
    const card = cardOf(hass);
    assert.equal($(card, '.tab .tab-hvac'), null);
    click(card, '.tab-tool[data-act="schedule-menu"]');
    assert.equal($(card, '.sched-menu [data-act="schedule-hvac"]'), null);
    assert.doesNotMatch(text($(card, '.sched-menu')), /Clims|Ne pas changer/);
    await card._action('schedule-move', { dir: '1' });
    assert.deepEqual(lastCall(hass).schedules, [{ id: 'away' }, { id: 'normal' }, { id: 'holiday' }]);
  });
});

describe('texts that name a slot', () => {
  const loc = makeLocale(null, 'fr');
  const name = (id) => ({ eco: 'Éco', comfort: 'Confort' })[id] || id;

  test('"Follows the schedule" says Arrêt for an off slot, Ventilation for a fan-only slot, also for the next slot', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T23:00:00+02:00') });
    try {
      assert.equal(planText({ preset: null, hvac_mode: 'off', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
        'Arrêt jusqu\'à 06:30 (demain), puis Confort');
      assert.equal(planText({ preset: 'comfort', hvac_mode: 'cool', next_preset: null, next_hvac_mode: 'off', next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
        'Confort jusqu\'à 06:30 (demain), puis Arrêt');
      assert.equal(planText({ preset: null, hvac_mode: 'fan_only', next_preset: null, next_hvac_mode: 'off', next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
        'Ventilation jusqu\'à 06:30 (demain), puis Arrêt');
      assert.equal(planText({ preset: null, hvac_mode: null }, name, loc), '');
    } finally { mock.timers.reset(); }
  });

  test('an override\'s label: Arrêt, or the HVAC mode it was switched to by hand', () => {
    assert.equal(overrideLabel({ target: OFF }, loc), 'Arrêt');
    assert.equal(overrideLabel({ target: { hvac_mode: 'cool' } }, loc), 'Climatisation');
    assert.equal(overrideLabel({ target: FAN }, loc), 'Ventilation');
    assert.equal(overrideLabel({ target: { hvac_mode: 'cool', temperature: 24 } }, loc), '24 °C');
  });
});

describe('the override block: off, fan only, a preset, a temperature and its end', () => {
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

  test('one row of chips, Arrêt first, Ventilation on a thermostat that has it: no Marche, no HVAC mode', () => {
    const hass = setup({ overrides: { 'climate.atelier': boost, 'climate.salon': boost } });
    const card = cardOf(hass, { show: ['climate.atelier', 'climate.salon'] });
    click(card, '.override[data-climate="climate.atelier"]');
    assert.deepEqual(chips(card, '.override-ed'), ['Arrêt', 'Ventilation', 'Hors-gel', 'Éco', 'Confort', 'Boost ✓']);
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
    assert.deepEqual(lastCall(hass).override, offOverride);
  });

  test('Ventilation sets the override to fan only, without setpoint; a preset tapped then heats or cools again', () => {
    const hass = setup({ overrides: { 'climate.atelier': boost } });
    const card = cardOf(hass, { show: ['climate.atelier'] });
    click(card, '.override[data-climate="climate.atelier"]');
    click(card, '.override-ed [data-act="override-fan"]');
    assert.deepEqual(lastCall(hass).override, { target: FAN, ...span });
    hass.push({ ...hass.data, overrides: { 'climate.atelier': { target: FAN, ...span } } });
    assert.deepEqual(chips(card, '.override-ed'), ['Arrêt', 'Ventilation ✓', 'Hors-gel', 'Éco', 'Confort', 'Boost']);
    click(card, '.override-ed [data-act="override-preset"][data-preset="eco"]');
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'eco' });
    change($(card, '.override-ed [data-override-temperature]'), '24');
    assert.deepEqual(lastCall(hass).override.target, { temperature: 24 });
  });

  test('Ventilation during a fan-only slot resumes the schedule', () => {
    const hass = setup({ overrides: { 'climate.atelier': boost }, planned: { 'climate.atelier': { preset: null, hvac_mode: 'fan_only' } } });
    const card = cardOf(hass, { show: ['climate.atelier'] });
    click(card, '.override[data-climate="climate.atelier"]');
    click(card, '.override-ed [data-act="override-fan"]');
    assert.equal(lastCall(hass).override, null);
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
    assert.deepEqual(lastCall(hass).override.target, { preset_mode: 'eco', hvac_mode: 'cool' });
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
    assert.match(text($(off, '.status')), /puis Arrêt \(planning\)/);
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

describe('the thermostat card chip and the row chip', () => {
  test('a VTherm heating at the frost setpoint for its open window says so, without setpoint', () => {
    const hass = setup({ thermostats: { 'climate.salon': { paused: false, revision: 7, cause: 'window' } } });
    hass.states['climate.salon'].attributes.temperature = 7;
    hass.states['climate.salon'].attributes.requested_state = { hvac_mode: 'heat', preset: 'eco', target_temperature: 17 };
    assert.equal(text($(thermostatCard(hass), '.tc-state')), 'Fenêtre ouverte · Éco');
    const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
    assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'fenêtre ouverte');
  });

  test('an off slot reads Arrêt, grey, without setpoint; a fan-only slot reads Ventilation', () => {
    const hass = setup({ planned: { 'climate.salon': { preset: null, hvac_mode: 'off', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' },
      'climate.atelier': { preset: null, hvac_mode: 'fan_only', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' } } });
    hass.states['climate.salon'].state = 'off';
    hass.states['climate.salon'].attributes.temperature = 17;
    const tc = thermostatCard(hass);
    assert.equal(text($(tc, '.tc-state')), 'Arrêt');
    assert.ok(!$(tc, '.tc-state').classList.contains('override'));
    hass.states['climate.atelier'].state = 'fan_only';
    assert.equal(text($(thermostatCard(hass, 'climate.atelier'), '.tc-state')), 'Ventilation');
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
  const choose = (card, value) => { const radio = $(card, `.cell-ed input[name="cell-choice"][value="${value}"]`); radio.checked = true; radio.dispatchEvent(new window.Event('change', { bubbles: true })); };
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

  test('a preset has a cool color, derived from its color; the user can change it', async () => {
    const hass = setup();
    const card = open(hass);
    click(card, '[data-kind="preset"][data-preset="eco"]');
    const cool = () => $(card, '.cell-ed [data-cell-cool-color]');
    assert.equal(text(cool().closest('.pv-fields')).includes('Couleur en clim'), true);
    assert.equal(cool().value, derivedCoolColor('#43a047'));
    // The color changed: the cool color follows, and nothing more is stored
    change($(card, '.cell-ed [data-cell-color]'), '#ff0000');
    assert.equal(cool().value, derivedCoolColor('#ff0000'));
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).presets.find((p) => p.id === 'eco'), { id: 'eco', name: 'Éco', color: '#ff0000', temperature: 17 });
    // A cool color of the user's own is stored, and no longer follows the color
    click(card, '[data-kind="preset"][data-preset="eco"]');
    change(cool(), '#004488');
    change($(card, '.cell-ed [data-cell-color]'), '#00ff00');
    assert.equal(cool().value, '#004488');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).presets.find((p) => p.id === 'eco'), { id: 'eco', name: 'Éco', color: '#00ff00', temperature: 17, cool_color: '#004488' });
  });

  test('a stored cool color shows in the popover and stays when another preset is saved; set back to the derived one, it is dropped', async () => {
    const hass = setup();
    hass.data.presets = hass.data.presets.map((p) => (p.id === 'eco' ? { ...p, cool_color: '#004488' } : p));
    const card = open(hass);
    click(card, '[data-kind="preset"][data-preset="comfort"]');
    await card._action('cell-apply', {});
    assert.equal(lastCall(hass).presets.find((p) => p.id === 'eco').cool_color, '#004488');
    click(card, '[data-kind="preset"][data-preset="eco"]');
    assert.equal($(card, '.cell-ed [data-cell-cool-color]').value, '#004488');
    change($(card, '.cell-ed [data-cell-cool-color]'), derivedCoolColor('#43a047'));
    await card._action('cell-apply', {});
    assert.equal('cool_color' in lastCall(hass).presets.find((p) => p.id === 'eco'), false);
  });

  test('without a thermostat that cools, a preset shows no cool color', () => {
    const card = createCard(setup(), { thermostats: ['climate.salon'], view: 'presets' });
    click(card, '[data-kind="preset"][data-preset="eco"]');
    assert.equal($(card, '.cell-ed [data-cell-cool-color]'), null);
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
    // A cooling temperature with the default when heating
    type(card, '[data-cell-cool]', '25,5');
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { cool_temperature: 25.5 } });
    // And with a temperature when heating
    cell(card, 'comfort', 'climate.atelier').click();
    type(card, '[data-cell-temp]', '20');
    click(card, '.cell-ed .pv-cool [data-act="cell-step"][data-delta="0.5"]'); // from the heating temperature
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { comfort: { temperature: 20, cool_temperature: 20.5 } });
  });

  test('"Consigne inchangée en clim" only when nothing is sent when cooling: a temperature when heating, and no cooling temperature', () => {
    const card = open(setup());
    const note = () => $(card, '.cell-ed .pv-coolnote');
    cell(card, 'comfort', 'climate.atelier').click(); // the default is its own preset: sent when cooling too
    assert.equal(note().hidden, true);
    type(card, '[data-cell-temp]', '20'); // a temperature when heating
    assert.equal(note().hidden, false);
    assert.equal(text(note()), 'Consigne inchangée en clim');
    type(card, '[data-cell-cool]', '25');
    assert.equal(note().hidden, true);
    type(card, '[data-cell-cool]', '');
    choose(card, 'own');
    assert.equal(note().hidden, true);
    cell(card, 'frost', 'climate.atelier').click(); // the default is a temperature
    assert.equal(note().hidden, false);
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
