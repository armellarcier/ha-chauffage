// The card on the Chauffage integration (v0.2+): websocket API instead of the package's
// sensors and events. The card's behavior is the same; only the data source changes.
import { fakeIntegrationHass, INTEGRATION_DATA, createCard, cleanup, WEEKDAY } from './helpers.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const day = (card, climate, d, mode) => serializeDay(card._week(climate, mode)[d]);
const lastCall = (hass) => hass.events.at(-1);

afterEach(() => cleanup());

describe('loading from the integration', () => {
  test('the card subscribes once and shows the schedules with the mode names', () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    assert.deepEqual(hass.subscriptions, [{ type: 'chauffage/subscribe' }]);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    const tabs = [...card.shadowRoot.querySelectorAll('.tab')].map((t) => t.dataset.mode);
    assert.deepEqual(tabs, ['Normal', 'Absent', 'Vacances']);
    assert.equal(card._mode, 'Normal');
  });

  test('a placeholder is shown until the first data arrives', () => {
    const hass = fakeIntegrationHass({ data: null });
    const card = createCard(hass);
    assert.ok(card.shadowRoot.querySelector('.loading'));
    hass.push(INTEGRATION_DATA());
    assert.equal(card.shadowRoot.querySelector('.loading'), null);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
  });

  test('changes pushed by the integration are shown (mode changed elsewhere)', () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    hass.push({ ...INTEGRATION_DATA(), active_mode: 'away' });
    const active = card.shadowRoot.querySelector('.tab[data-mode="Absent"] .dot');
    assert.ok(active, 'active-mode marker on "Absent"');
  });
});

describe('writing to the integration', () => {
  test('Save sends mode ids, [start, preset] slots and the revision it edited', async () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await card._save();
    const msg = lastCall(hass);
    assert.equal(msg.type, 'chauffage/schedules/save');
    assert.equal(msg.revision, 4);
    assert.deepEqual(msg.schedules['climate.bureau'].normal[0], [['00:00', 'eco'], ['12:00', 'comfort']]);
    assert.deepEqual(msg.schedules['climate.salon'].normal[0], WEEKDAY.map((s) => s.split(' ')));
    assert.equal(card._dirty, false);
  });

  test('a save refused because the schedules changed elsewhere says so', async () => {
    const hass = fakeIntegrationHass({
      reply: (msg) => { if (msg.type === 'chauffage/schedules/save') throw { code: 'stale', message: 'stale' }; },
    });
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await card._save();
    assert.equal(card._dirty, true);
    assert.match(card.shadowRoot.querySelector('.msg').textContent, /modifiés ailleurs/);
  });

  test('activating a mode sends its id', async () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    card.shadowRoot.querySelector('.tab[data-mode="Vacances"]').click();
    await card._action('activate-mode', {});
    assert.deepEqual(lastCall(hass), { type: 'chauffage/mode/set', mode: 'holiday' });
  });
});

describe('overrides with the integration', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());

  const withOverride = () => ({
    ...INTEGRATION_DATA(),
    overrides: { 'climate.salon': { kind: 'temperature', value: 21.5, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' } },
  });

  test('the override is shown and can be extended (English keys sent)', () => {
    const hass = fakeIntegrationHass({ data: withOverride() });
    const card = createCard(hass);
    assert.ok(card.shadowRoot.querySelector('.override[data-climate="climate.salon"]'));
    card._setOverrideEnd('climate.salon', new Date('2026-10-12T12:00:00+02:00'));
    const msg = lastCall(hass);
    assert.equal(msg.type, 'chauffage/override/set');
    assert.equal(msg.entity_id, 'climate.salon');
    assert.deepEqual({ ...msg.override, end: new Date(msg.override.end).toISOString() }, {
      kind: 'temperature', value: 21.5, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T10:00:00.000Z',
    });
  });

  test('"Reprendre le programme" removes the override', () => {
    const hass = fakeIntegrationHass({ data: withOverride() });
    const card = createCard(hass);
    card._overrideSel = { climate: 'climate.salon', day: 0 };
    card._action('override-del', {});
    assert.deepEqual(lastCall(hass), { type: 'chauffage/override/set', entity_id: 'climate.salon', override: null });
  });

  test('the more-info block reads the integration too', () => {
    const hass = fakeIntegrationHass({ data: withOverride() });
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    const text = el.shadowRoot.textContent.replace(/\s+/g, ' ');
    assert.match(text, /21,5 °C/);
    el.shadowRoot.querySelector('button[data-del]').click();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/override/set', entity_id: 'climate.salon', override: null });
  });
});

describe('heating levels from the integration (v0.3)', () => {
  const withLevels = () => ({
    ...INTEGRATION_DATA(),
    levels: [
      { id: 'comfort', name: 'Confort', color: '#f57c00', temperature: 20 },
      { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17 },
      { id: 'nuit', name: 'Nuit', color: '#3f51b5', temperature: 18 },
    ],
    targets: { 'climate.salon': { comfort: { temperature: 20.5 }, eco: { preset: 'eco' }, nuit: { temperature: 18 } } },
  });

  test('the legend shows the levels and what they mean for the thermostat', () => {
    const hass = fakeIntegrationHass({ data: withLevels() });
    hass.states['climate.salon'].attributes.eco_temp = 16; // VTherm preset temperature
    const card = createCard(hass, { show: ['climate.salon'] });
    const legend = card.shadowRoot.querySelector('.legend').textContent.replace(/\s+/g, ' ');
    assert.match(legend, /Confort 20,5°/);
    assert.match(legend, /Éco 16°/);
    assert.match(legend, /Nuit 18°/);
  });

  test('the slot editor offers the levels, with their colors', () => {
    const card = createCard(fakeIntegrationHass({ data: withLevels() }), { show: ['climate.salon'] });
    card._sel = { climate: 'climate.salon', day: 0, idx: 1 };
    card._render();
    const buttons = [...card.shadowRoot.querySelectorAll('.editor [data-act="preset"]')];
    assert.deepEqual(buttons.map((b) => b.textContent), ['Confort', 'Éco', 'Nuit']);
    assert.equal(buttons[2].style.background, 'rgb(63, 81, 181)');
  });

  test('a new slot in a custom level gets another level', () => {
    const data = withLevels();
    data.schedules['climate.salon'].normal[0] = [['00:00', 'nuit']];
    const card = createCard(fakeIntegrationHass({ data }), { show: ['climate.salon'] });
    card._split('climate.salon', 0, 12 * 60);
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 nuit', '12:00 comfort']);
  });
});

describe('setting levels from the card (v0.3)', () => {
  const data = () => ({
    ...INTEGRATION_DATA(),
    levels: [
      { id: 'comfort', name: 'Confort', color: '#f57c00', temperature: 20 },
      { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17 },
      { id: 'frost', name: 'Hors-gel', color: '#29b6f6', temperature: 7 },
    ],
    mappings: { 'climate.salon': { frost: { temperature: 8 } } },
    targets: { 'climate.salon': { comfort: { preset: 'comfort' }, eco: { preset: 'eco' }, frost: { temperature: 8 } } },
    preset_temperatures: { 'climate.salon': { comfort: 20.5 } },
  });
  const salon = (hass) => {
    hass.states['climate.salon'].attributes.preset_modes = ['eco', 'comfort', 'away', 'boost'];
    return createCard(hass, { show: ['climate.salon'] });
  };
  const click = (card, selector) => card.shadowRoot.querySelector(selector).click();

  test('the legend shows learned preset temperatures, or "(preset)" while unknown', () => {
    const card = salon(fakeIntegrationHass({ data: data() }));
    const legend = card.shadowRoot.querySelector('.legend').textContent.replace(/\s+/g, ' ');
    assert.match(legend, /Confort 20,5°/); // learned
    assert.match(legend, /Éco \(preset\)/); // never seen yet
    assert.match(legend, /Hors-gel 8°/); // temperature
  });

  test('a level set to a temperature for the displayed thermostat', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = salon(hass);
    click(card, '[data-act="level-edit"][data-level="comfort"]');
    const panel = card.shadowRoot.querySelector('[data-panel="level"]');
    assert.match(panel.textContent, /Confort · Salon/);
    click(card, '[data-act="level-step"][data-delta="0.5"]'); // 20.5 → 21, and "Temperature" is chosen
    await card._action('level-apply', {});
    assert.deepEqual(lastCall(hass), {
      type: 'chauffage/mapping/set', entity_id: 'climate.salon',
      mapping: { frost: { temperature: 8 }, comfort: { temperature: 21 } },
    });
    assert.equal(card.shadowRoot.querySelector('[data-panel="level"]'), null);
  });

  test('a level set to another preset of the thermostat', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = salon(hass);
    click(card, '[data-act="level-edit"][data-level="eco"]');
    card.shadowRoot.querySelector('[data-lv-preset]').value = 'away';
    await card._action('level-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 8 }, eco: { preset: 'away' } });
  });

  test('back to the default for a level set by hand', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = salon(hass);
    click(card, '[data-act="level-edit"][data-level="frost"]');
    await card._action('level-default', {});
    assert.deepEqual(lastCall(hass).mapping, {});
  });

  test('the levels panel: rename, add, remove a used level with its replacement', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = salon(hass);
    click(card, '[data-act="levels-open"]');
    card.shadowRoot.querySelector('[data-lv-name="1"]').value = 'Économique';
    await card._action('levels-add', {});
    card.shadowRoot.querySelector('[data-lv-name="3"]').value = 'Nuit';
    await card._action('levels-del', { i: '0' }); // comfort is used in the schedules
    card.shadowRoot.querySelector('[data-lv-repl="0"]').value = 'eco';
    await card._action('levels-save', {});
    assert.deepEqual(lastCall(hass), {
      type: 'chauffage/levels/set',
      levels: [
        { id: 'eco', name: 'Économique', color: '#43a047', temperature: 17 },
        { id: 'frost', name: 'Hors-gel', color: '#29b6f6', temperature: 7 },
        { name: 'Nuit', color: '#9e9e9e', temperature: 19 },
      ],
      replacements: { comfort: 'eco' },
    });
  });

  test('only admins can change levels', () => {
    const hass = fakeIntegrationHass({ data: data() });
    hass.user = { is_admin: false };
    const card = salon(hass);
    assert.equal(card.shadowRoot.querySelector('[data-act="level-edit"]'), null);
    assert.equal(card.shadowRoot.querySelector('[data-act="levels-open"]'), null);
  });
});
