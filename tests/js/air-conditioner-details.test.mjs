// The smaller things of an air conditioner in the card (#91): colors that can be told apart, a
// legend that says heat and cool, the presets table on a phone, the names of a device's own
// values, what a paste left out, and choosing several rooms.
import { fakeHass, createCard, cleanup, integrationData, PRESETS } from './helpers.mjs';
import { serializeDay, coolColor } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const OFF = { hvac_mode: 'off' };
const COOL = { hvac_mode: 'cool' };
const FAN = { hvac_mode: 'fan_only' };
const $ = (el, selector) => el.shadowRoot.querySelector(selector);
const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const click = (el, selector) => $(el, selector).click();
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const day = (card, climate, d = 0) => serializeDay(card._week(climate)[d]);
const icons = (el) => [...el.querySelectorAll('ha-icon')].map((i) => i.getAttribute('icon'));

const SALON = 'climate.salon'; // a heater
const ATELIER = 'climate.atelier'; // heats and cools
const COMBLES = 'climate.combles'; // only cools
const PLAIN = ['00:00 eco', '14:00 comfort', '20:00 eco'];
const week = (d) => Array(7).fill(d);

function setup({ atelier = PLAIN, combles = PLAIN, salon = PLAIN } = {}) {
  const data = integrationData({ weeks: { [SALON]: { Normal: week(salon) }, [ATELIER]: { Normal: week(atelier) }, [COMBLES]: { Normal: week(combles) } } });
  const own = { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } };
  data.targets = { [SALON]: own, [ATELIER]: { ...own, comfort: { preset_mode: 'comfort', cool_temperature: 24 } },
    [COMBLES]: { comfort: { temperature: 20, cool_temperature: 26 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } } };
  data.mappings = { [ATELIER]: { comfort: { cool_temperature: 24 } }, [COMBLES]: { comfort: { cool_temperature: 26 } } };
  data.preset_temperatures = { [SALON]: { comfort: 20, eco: 17, boost: 21 }, [ATELIER]: { comfort: 20, eco: 17, boost: 21, away: 15 } };
  data.cool_preset_temperatures = { [ATELIER]: { eco: 27, comfort: 25 } };
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SALON].attributes.preset_modes = ['none', 'frost', 'eco', 'comfort', 'boost'];
  hass.states[ATELIER] = { state: 'heat', attributes: { friendly_name: 'Atelier', temperature: 20, preset_mode: 'comfort',
    preset_modes: ['eco', 'comfort', 'away', 'boost'], hvac_modes: ['off', 'heat', 'cool', 'fan_only'], fan_modes: ['auto', 'low', 'high'], fan_mode: 'auto' }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[ATELIER] = { entity_id: ATELIER };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
const ALL = [SALON, ATELIER, COMBLES];
const cardOf = (hass, config = {}) => createCard(hass, { thermostats: ALL, show: [ATELIER], group_days: false, ...config });
const presetsTab = (hass) => createCard(hass, { thermostats: ALL, view: 'presets' });
const cell = (card, preset, climate) => $(card, `[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="${climate}"]`);
const select = (card, climate, idx, d = 0) => { card._sel = { climate, day: d, idx }; card._render(); };

// Hue (degrees) and lightness (0 to 1) of a "#rrggbb" color
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, l: (max + min) / 2 };
}
const apart = (a, b) => { const hue = Math.abs(hsl(a).h - hsl(b).h); return Math.min(hue, 360 - hue) >= 20 || Math.abs(hsl(a).l - hsl(b).l) >= 0.08; };

afterEach(() => cleanup());

describe('colors that can be told apart', () => {
  const FAN_CYAN = '#00bcd4'; // Home Assistant's color of fan only
  const OFF_GREY = '#616161'; // an off slot
  const STRIPES = ['#7b1fa2', '#9c4dcc']; // the purple stripes of an override
  const hueFrom = (a, b) => { const d = Math.abs(hsl(a).h - hsl(b).h); return Math.min(d, 360 - d); };
  // The presets of a new installation, in the integration's own colors
  const defaults = [{ id: 'comfort', color: '#f57c00' }, { id: 'eco', color: '#43a047' }, { id: 'boost', color: '#e53935' }, { id: 'frost', color: '#78909c' }];

  test('the cool colors of the default presets differ from each other, from fan only and from every heat color', () => {
    const cool = defaults.map(coolColor);
    for (let i = 0; i < cool.length; i += 1) {
      for (let j = i + 1; j < cool.length; j += 1) assert.ok(apart(cool[i], cool[j]), `${defaults[i].id} ${cool[i]} and ${defaults[j].id} ${cool[j]}`);
      assert.ok(apart(cool[i], FAN_CYAN), `${defaults[i].id} ${cool[i]} and fan only`);
      for (const preset of defaults) assert.ok(apart(cool[i], preset.color), `${defaults[i].id} ${cool[i]} and the heat color of ${preset.id}`);
    }
  });

  test('no cool color is a purple: an override is drawn in purple stripes', () => {
    for (const preset of [...defaults, { id: 'former frost', color: '#29b6f6' }]) {
      for (const stripe of STRIPES) assert.ok(hueFrom(coolColor(preset), stripe) >= 40, `${preset.id} ${coolColor(preset)} and ${stripe}`);
    }
    // Any other color: its derived cool color stays in the blues too
    for (const color of ['#ff0000', '#ffeb3b', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#9e9e9e']) {
      for (const stripe of STRIPES) assert.ok(hueFrom(coolColor({ color }), stripe) >= 25, `${color} gives ${coolColor({ color })}`);
      assert.ok(hueFrom(coolColor({ color }), FAN_CYAN) >= 12, `${color} gives ${coolColor({ color })}, too close to fan only`);
    }
  });

  test('frost protection of a new installation is not the grey of an off slot', () => {
    assert.ok(Math.abs(hsl('#78909c').l - hsl(OFF_GREY).l) >= 0.15);
  });

  test('the cool color of an installation\'s frost protection (light blue) is still apart from the others', () => {
    const cool = [...defaults.slice(0, 3), { id: 'frost', color: '#29b6f6' }].map(coolColor);
    for (let i = 0; i < 3; i += 1) assert.ok(apart(cool[i], cool[3]), `${cool[i]} and ${cool[3]}`);
  });

  test('frost protection of a new installation does not look like fan only', () => {
    assert.ok(apart('#78909c', FAN_CYAN));
  });

  test('a cool color stays dark enough for white text, whatever the color', () => {
    for (const color of ['#ffeb3b', '#ffffff', '#000000', '#f57c00', '#9e9e9e', '#80deea']) {
      const { l } = hsl(coolColor({ color }));
      assert.ok(l >= 0.28 && l <= 0.5, `${color} gives ${coolColor({ color })}`);
    }
  });
});

describe('the legend says heat and cool', () => {
  test('each preset has a heat swatch and a cool swatch, each with its mark, when a shown thermostat cools', () => {
    const card = cardOf(setup());
    const comfort = $$(card, '.legend > span').find((s) => /Confort/.test(s.textContent));
    assert.deepEqual(icons(comfort).slice(0, 2), ['mdi:fire', 'mdi:snowflake']);
    assert.equal(comfort.querySelectorAll('i').length, 2);
  });

  test('a heater alone has plain swatches', () => {
    const card = cardOf(setup(), { show: [SALON] });
    const comfort = $$(card, '.legend > span').find((s) => /Confort/.test(s.textContent));
    assert.deepEqual(icons(comfort), []);
    assert.equal(text(comfort), 'Confort 20°');
  });

  test('the cool value follows the heat value: the cooling temperature, else what its own preset gives when cooling', () => {
    const card = cardOf(setup());
    const legend = (name) => text($$(card, '.legend > span').find((s) => s.textContent.includes(name)));
    assert.equal(legend('Confort'), 'Confort 20° · 24°');
    assert.equal(legend('Éco'), 'Éco 17° · 27°');
    assert.equal(legend('Hors-gel'), 'Hors-gel 7°');
    const comfort = $$(card, '.legend > span').find((s) => /Confort/.test(s.textContent));
    assert.equal(icons(comfort).at(-1), 'mdi:snowflake', 'the cool value has its mark');
  });

  test('a unit that only cools shows its cool values alone', () => {
    const card = cardOf(setup(), { show: [COMBLES] });
    const legend = (name) => text($$(card, '.legend > span').find((s) => s.textContent.includes(name)));
    assert.equal(legend('Confort'), 'Confort 26°');
    assert.equal(legend('Hors-gel'), 'Hors-gel');
    const comfort = $$(card, '.legend > span').find((s) => /Confort/.test(s.textContent));
    assert.equal(comfort.querySelectorAll('i').length, 1, 'no heat swatch');
  });
});

describe('the presets table', () => {
  test('a cell of a unit that only cools shows its cooling value, never a heating temperature', () => {
    const card = presetsTab(setup());
    assert.equal(text(cell(card, 'comfort', COMBLES).querySelector('.pv-val')), '26°');
    assert.equal(text(cell(card, 'frost', COMBLES).querySelector('.pv-val')), '—');
    assert.deepEqual(icons(cell(card, 'comfort', COMBLES)), ['mdi:snowflake']);
  });

  test('a cell of a unit that heats and cools shows what its own preset gives when cooling', () => {
    const card = presetsTab(setup());
    assert.equal(text(cell(card, 'eco', ATELIER).querySelector('.pv-val')), '17° · 27°');
    assert.equal(text(cell(card, 'comfort', ATELIER).querySelector('.pv-val')), '20° · 24°');
  });

  test('the popover of a unit that only cools asks for the cooling temperature alone', () => {
    const card = presetsTab(setup());
    cell(card, 'frost', COMBLES).click();
    assert.equal($(card, '.cell-ed [data-cell-temp]'), null);
    assert.equal($(card, '.cell-ed .pv-choices'), null);
    assert.ok($(card, '.cell-ed [data-cell-cool]'));
    assert.match(text($(card, '.cell-ed')), /Consigne inchangée/);
    assert.doesNotMatch(text($(card, '.cell-ed')), /En chauffe/);
  });

  test('its cooling temperature is saved without a heating value', async () => {
    const hass = setup();
    const card = presetsTab(hass);
    cell(card, 'frost', COMBLES).click();
    const field = $(card, '.cell-ed [data-cell-cool]');
    field.value = '28';
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal($(card, '.cell-ed .pv-coolnote').hidden, true);
    await card._action('cell-apply', {});
    assert.deepEqual(hass.events.at(-1).mapping, { comfort: { cool_temperature: 26 }, frost: { cool_temperature: 28 } });
  });

  test('an empty cooling field says the default: what the thermostat\'s own preset gives when cooling', () => {
    const card = presetsTab(setup());
    cell(card, 'eco', ATELIER).click();
    assert.equal(text($(card, '.cell-ed .pv-cooldefault')), 'Par défaut (son préréglage Éco, 27°)');
    assert.equal($(card, '.cell-ed .pv-cooldefault').hidden, false);
    const field = $(card, '.cell-ed [data-cell-cool]');
    field.value = '26';
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal($(card, '.cell-ed .pv-cooldefault').hidden, true);
  });

  test('tapping a cell keeps the table where it was scrolled', () => {
    const card = presetsTab(setup());
    $(card, '.table-wrap').scrollLeft = 120;
    cell(card, 'boost', ATELIER).click();
    assert.equal($(card, '.table-wrap').scrollLeft, 120);
    click(card, '.cell-ed [data-act="cell-close"]');
    assert.equal($(card, '.table-wrap').scrollLeft, 120);
  });

  test('a table wider than the screen says there is more to the side', () => {
    const card = presetsTab(setup());
    const wrap = $(card, '.table-wrap');
    Object.defineProperty(wrap, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(wrap, 'clientWidth', { value: 340, configurable: true });
    card._tableCue();
    assert.ok(wrap.parentElement.classList.contains('more-right') && !wrap.parentElement.classList.contains('more-left'));
    wrap.scrollLeft = 260;
    wrap.dispatchEvent(new window.Event('scroll'));
    assert.ok(wrap.parentElement.classList.contains('more-left') && !wrap.parentElement.classList.contains('more-right'));
  });

  test('a preset\'s color is its color when heating, next to its color when cooling', () => {
    const card = presetsTab(setup());
    click(card, '[data-kind="preset"][data-preset="eco"]');
    assert.match(text($(card, '.cell-ed .pv-fields')), /Couleur en chauffe.*Couleur en clim/);
    cleanup();
    const hass = setup();
    delete hass.states[ATELIER];
    delete hass.states[COMBLES];
    const heaters = createCard(hass, { thermostats: [SALON], view: 'presets' });
    click(heaters, '[data-kind="preset"][data-preset="eco"]');
    assert.doesNotMatch(text($(heaters, '.cell-ed .pv-fields')), /Couleur en chauffe|Couleur en clim/);
  });
});

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

describe('a day pasted to a thermostat that cannot follow every slot', () => {
  const SUMMER = ['00:00 eco', ['12:00', 'comfort', { hvac_mode: 'cool', fan_mode: 'low' }], ['18:00', null, FAN], ['22:00', null, OFF]];

  test('the message names what was left out', () => {
    const card = cardOf(setup({ atelier: SUMMER }), { show: [ATELIER, SALON] });
    card._action('copy-day', { climate: ATELIER, day: '0' });
    card._action('paste-day', { climate: SALON, day: '0' });
    assert.deepEqual(day(card, SALON), ['00:00 eco', '12:00 comfort', '22:00 - {"hvac_mode":"off"}']);
    assert.match(text($(card, '.msg')), / · non repris : Clim, Ventilation, Ventilateur$/);
  });

  test('a heating slot pasted to a unit that only cools cools, and the message says so', () => {
    const card = cardOf(setup({ atelier: ['00:00 eco', ['12:00', 'comfort', { hvac_mode: 'heat' }]] }), { show: [ATELIER, COMBLES] });
    card._copyDay(ATELIER, 0, 'others');
    assert.deepEqual(day(card, COMBLES), ['00:00 eco {"hvac_mode":"cool"}', '12:00 comfort {"hvac_mode":"cool"}']);
    assert.match(text($(card, '.msg')), / · non repris : Chauffe$/);
  });

  test('nothing left out: nothing said', () => {
    const card = cardOf(setup(), { show: [ATELIER, SALON] });
    card._copyDay(SALON, 0, 'others');
    assert.doesNotMatch(text($(card, '.msg')), /non repris/);
  });
});

describe('choosing several rooms', () => {
  const shown = (card) => $$(card, '.chip.on[data-climate]').map((c) => c.dataset.climate);

  test('Plusieurs pressed while every room is shown starts from the room tapped, then adds rooms', () => {
    const card = cardOf(setup(), { show: 'all' });
    assert.deepEqual(shown(card), ALL);
    click(card, '[data-act="multi-sel"]');
    click(card, `.chip[data-climate="${ATELIER}"]`);
    assert.deepEqual(shown(card), [ATELIER], 'the room tapped, not every room but it');
    click(card, `.chip[data-climate="${COMBLES}"]`);
    assert.deepEqual(shown(card), [ATELIER, COMBLES]);
    click(card, `.chip[data-climate="${ATELIER}"]`); // tapped again: removed, as before
    assert.deepEqual(shown(card), [COMBLES]);
  });

  test('Plusieurs pressed with some rooms shown adds to them, as before', () => {
    const card = cardOf(setup(), { show: [SALON] });
    click(card, '[data-act="multi-sel"]');
    click(card, `.chip[data-climate="${ATELIER}"]`);
    assert.deepEqual(shown(card), [SALON, ATELIER]);
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
