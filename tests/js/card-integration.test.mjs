// The card's exchanges with the Chauffage integration (websocket API): subscription, saves,
// overrides, schedules, presets; and the card without the integration.
import { fakeIntegrationHass, hassWithoutIntegration, INTEGRATION_DATA, integrationData, createCard, cleanup, WEEKDAY } from './helpers.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const day = (card, climate, d, schedule) => serializeDay(card._week(climate, schedule)[d]);
const lastCall = (hass) => hass.events.at(-1);

afterEach(() => cleanup());

describe('loading from the integration', () => {
  test('the card subscribes once and shows the schedules with their names', () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    assert.deepEqual(hass.subscriptions, [{ type: 'chauffage/subscribe' }]);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
    const tabs = [...card.shadowRoot.querySelectorAll('.tab')].map((t) => t.textContent.trim());
    assert.deepEqual(tabs, ['Normal', 'Absent', 'Vacances']);
    assert.equal(card._schedule, 'normal');
  });

  test('a placeholder is shown until the first data arrives', () => {
    const hass = fakeIntegrationHass({ data: null });
    const card = createCard(hass);
    assert.ok(card.shadowRoot.querySelector('.loading'));
    hass.push(INTEGRATION_DATA());
    assert.equal(card.shadowRoot.querySelector('.loading'), null);
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
  });

  test('changes pushed by the integration are shown (schedule activated elsewhere)', () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    hass.push({ ...INTEGRATION_DATA(), active_schedule: 'away' });
    const active = card.shadowRoot.querySelector('.tab[data-schedule="away"] .dot');
    assert.ok(active, 'active-schedule marker on "Absent"');
  });
});

describe('writing to the integration', () => {
  test('Save sends the weeks of the thermostats changed, by schedule id, with the revision of each', async () => {
    const both = { 'climate.salon': { Normal: Array(7).fill(WEEKDAY) }, 'climate.bureau': { Normal: Array(7).fill(WEEKDAY) } };
    const hass = fakeIntegrationHass({ weeks: both });
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await card._save();
    const msg = lastCall(hass);
    assert.equal(msg.type, 'chauffage/weeks/save');
    assert.deepEqual(Object.keys(msg.weeks), ['climate.bureau'], 'the salon was not changed');
    assert.ok(msg.weeks['climate.bureau'].normal[0].some(([start]) => start === '12:00'));
    assert.deepEqual(msg.revisions, { 'climate.bureau': 7 });
    assert.equal(msg.revision, undefined);
    assert.equal(card._dirty, false);
  });

  test('a thermostat added to the card is scheduled with the default week (docs/decisions.md)', async () => {
    const hass = fakeIntegrationHass(); // only the salon is scheduled
    const card = createCard(hass);
    card._split('climate.salon', 0, 12 * 60);
    await card._save();
    const msg = lastCall(hass);
    assert.deepEqual(Object.keys(msg.weeks).sort(), ['climate.bureau', 'climate.salon']);
    assert.deepEqual(msg.revisions['climate.bureau'], null);
  });

  test('the next save uses the revision the integration gave back', async () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    card._split('climate.salon', 0, 12 * 60);
    await card._save();
    card._split('climate.salon', 0, 13 * 60);
    await card._save();
    assert.deepEqual(lastCall(hass).revisions, { 'climate.salon': 8 });
  });

  test('an edit undone before saving sends nothing', async () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60); // the bureau gets its default week, so is changed
    await card._save();
    const sent = hass.events.length;
    const before = structuredClone(card._week('climate.salon'));
    card._split('climate.salon', 0, 12 * 60);
    card._data['climate.salon'][card._schedule] = before;
    await card._save();
    assert.equal(hass.events.length, sent);
    assert.equal(card._dirty, false);
  });

  test('a thermostat new to the integration is sent with no revision', async () => {
    const hass = fakeIntegrationHass(); // only the salon is scheduled
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await card._save();
    assert.deepEqual(lastCall(hass).revisions, { 'climate.bureau': null });
  });

  test('an integration without revisions per thermostat gets every week and the global revision', async () => {
    const data = INTEGRATION_DATA();
    delete data.thermostats;
    const hass = fakeIntegrationHass({ data });
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await card._save();
    const msg = lastCall(hass);
    assert.equal(msg.revision, 4);
    assert.equal(msg.revisions, undefined);
    assert.deepEqual(Object.keys(msg.weeks).sort(), ['climate.bureau', 'climate.salon']);
  });

  test('a save refused because the schedules changed elsewhere says so', async () => {
    const hass = fakeIntegrationHass({
      reply: (msg) => { if (msg.type === 'chauffage/weeks/save') throw { code: 'stale', message: 'stale' }; },
    });
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await card._save();
    assert.equal(card._dirty, true);
    assert.match(card.shadowRoot.querySelector('.msg').textContent, /modifiés ailleurs/);
  });

  test('activating a schedule sends its id', async () => {
    const hass = fakeIntegrationHass();
    const card = createCard(hass);
    card.shadowRoot.querySelector('.tab[data-schedule="holiday"]').click();
    await card._action('activate-schedule', {});
    assert.deepEqual(lastCall(hass), { type: 'chauffage/schedule/activate', schedule: 'holiday' });
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

  test('"Reprendre le planning" removes the override', () => {
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

describe('presets from the integration', () => {
  const withPresets = () => ({
    ...INTEGRATION_DATA(),
    presets: [
      { id: 'comfort', name: 'Confort', color: '#f57c00', temperature: 20 },
      { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17 },
      { id: 'nuit', name: 'Nuit', color: '#3f51b5', temperature: 18 },
    ],
    targets: { 'climate.salon': { comfort: { temperature: 20.5 }, eco: { preset: 'eco' }, nuit: { temperature: 18 } } },
  });

  test('the legend shows the presets and what they mean for the thermostat', () => {
    const hass = fakeIntegrationHass({ data: withPresets() });
    hass.states['climate.salon'].attributes.eco_temp = 16; // VTherm preset temperature
    const card = createCard(hass, { show: ['climate.salon'] });
    const legend = card.shadowRoot.querySelector('.legend').textContent.replace(/\s+/g, ' ');
    assert.match(legend, /Confort 20,5°/);
    assert.match(legend, /Éco 16°/);
    assert.match(legend, /Nuit 18°/);
  });

  test('the slot editor offers the presets, with their colors', () => {
    const card = createCard(fakeIntegrationHass({ data: withPresets() }), { show: ['climate.salon'] });
    card._sel = { climate: 'climate.salon', day: 0, idx: 1 };
    card._render();
    const buttons = [...card.shadowRoot.querySelectorAll('.editor [data-act="preset"]')];
    assert.deepEqual(buttons.map((b) => b.textContent), ['Éco', 'Nuit', 'Confort']); // from the coldest to the warmest
    assert.equal(buttons[1].style.background, 'rgb(63, 81, 181)');
  });

  test('a new slot in a custom preset gets another preset', () => {
    const data = withPresets();
    data.weeks['climate.salon'].normal[0] = [['00:00', 'nuit']];
    const card = createCard(fakeIntegrationHass({ data }), { show: ['climate.salon'] });
    card._split('climate.salon', 0, 12 * 60);
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 nuit', '12:00 comfort']);
  });
});

describe('the "Presets" view', () => {
  const data = () => ({
    ...INTEGRATION_DATA(),
    presets: [
      { id: 'comfort', name: 'Confort', color: '#f57c00', temperature: 20 },
      { id: 'eco', name: 'Éco', color: '#43a047', temperature: 17 },
      { id: 'frost', name: 'Hors-gel', color: '#29b6f6', temperature: 7 },
    ],
    mappings: { 'climate.salon': { frost: { temperature: 8 } } },
    targets: { 'climate.salon': { comfort: { preset: 'comfort' }, eco: { preset: 'eco' }, frost: { temperature: 8 } } },
    preset_temperatures: { 'climate.salon': { comfort: 20.5 } },
    use_presets: true,
  });
  const open = (hass) => {
    hass.states['climate.salon'].attributes.preset_modes = ['eco', 'comfort', 'away', 'boost'];
    const card = createCard(hass); // salon and bureau (bureau: no schedule, no presets)
    card.shadowRoot.querySelector('[data-act="view"][data-view="presets"]').click();
    return card;
  };
  const cellText = (card, preset, climate) => card.shadowRoot
    .querySelector(`[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="${climate}"]`).textContent.trim();
  const click = (card, selector) => card.shadowRoot.querySelector(selector).click();

  test('a table of what each thermostat does with each preset', () => {
    const card = open(fakeIntegrationHass({ data: data() }));
    const heads = [...card.shadowRoot.querySelectorAll('[data-kind="preset"]')].map((b) => b.textContent.trim());
    assert.deepEqual(heads, ['Hors-gel', 'Éco', 'Confort']); // from the coldest to the warmest
    assert.deepEqual([...card.shadowRoot.querySelectorAll('[data-kind="default"]')].map((b) => b.textContent.trim()), ['7°', '17°', '20°']);
    assert.equal(cellText(card, 'comfort', 'climate.salon'), '⟲ 20,5°'); // preset, learned temperature
    assert.equal(cellText(card, 'eco', 'climate.salon'), '⟲ (son préréglage)'); // preset never seen active
    assert.equal(cellText(card, 'frost', 'climate.salon'), '8° ●'); // set for this thermostat
    assert.equal(cellText(card, 'comfort', 'climate.bureau'), '20°'); // no presets of its own: the preset's default
    assert.equal(card.shadowRoot.querySelector('.chips'), null); // no thermostat selection here
  });

  test('a cell is edited in a popover, closed by a click elsewhere or Escape', () => {
    const card = open(fakeIntegrationHass({ data: data() }));
    click(card, '[data-kind="thermostat"][data-preset="comfort"][data-climate="climate.salon"]');
    assert.ok(card.shadowRoot.querySelector('.editor[data-panel="cell"]'), 'a popover, like the slots\' one');
    click(card, '.pv-key');
    assert.equal(card.shadowRoot.querySelector('[data-panel="cell"]'), null);
    click(card, '[data-kind="default"][data-preset="eco"]');
    assert.ok(card.shadowRoot.querySelector('[data-panel="cell"]'));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(card.shadowRoot.querySelector('[data-panel="cell"]'), null);
  });

  const presetOptions = (card) => [...card.shadowRoot.querySelectorAll('[data-cell-preset] option')]
    .map((o) => `${o.value}:${o.textContent}${o.selected ? ' ✓' : ''}`);

  test('automatic is the first choice of the thermostat\'s presets when it is one of them', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = open(hass);
    click(card, '[data-kind="thermostat"][data-preset="comfort"][data-climate="climate.salon"]');
    assert.equal(card.shadowRoot.querySelector('input[name="cell-kind"][value="auto"]'), null, 'no separate "automatic"');
    assert.ok(card.shadowRoot.querySelector('input[name="cell-kind"][value="preset"]').checked);
    assert.deepEqual(presetOptions(card), [':Auto (Confort) ✓', 'comfort:Confort', 'eco:Éco', 'away:away', 'boost:Boost']);

    card.shadowRoot.querySelector('[data-cell-preset]').value = 'comfort'; // pinned, unlike automatic
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 8 }, comfort: { preset: 'comfort' } });
  });

  test('each choice of a thermostat cell holds its own field; using the field picks the choice', () => {
    const card = open(fakeIntegrationHass({ data: data() }));
    click(card, '[data-kind="thermostat"][data-preset="frost"][data-climate="climate.salon"]'); // set to 8°
    const row = (value) => card.shadowRoot.querySelector(`input[name="cell-kind"][value="${value}"]`).closest('.pv-choice');
    assert.ok(row('temperature').querySelector('[data-cell-temp]'), 'the temperature next to "Temperature"');
    assert.ok(row('preset').querySelector('[data-cell-preset]'), 'the list next to "Thermostat preset"');
    assert.ok(row('temperature').querySelector('input').checked);
    const select = card.shadowRoot.querySelector('[data-cell-preset]');
    select.value = 'eco';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.ok(row('preset').querySelector('input').checked);
  });

  test('automatic stays a choice of its own when it gives a temperature', () => {
    const card = open(fakeIntegrationHass({ data: data() }));
    click(card, '[data-kind="thermostat"][data-preset="frost"][data-climate="climate.salon"]'); // no frost preset of its own
    assert.match(card.shadowRoot.querySelector('input[name="cell-kind"][value="auto"]').parentElement.textContent, /Automatique \(7 °C\)/);
    assert.deepEqual(presetOptions(card).map((o) => o.split(':')[0]), ['eco', 'comfort', 'away', 'boost']); // its own order
  });

  test('a thermostat set to a temperature for one preset', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = open(hass);
    click(card, '[data-kind="thermostat"][data-preset="comfort"][data-climate="climate.salon"]');
    assert.match(card.shadowRoot.querySelector('[data-panel="cell"]').textContent, /Confort · Salon/);
    click(card, '[data-act="cell-step"][data-delta="0.5"]'); // 20.5 → 21, "Temperature" chosen
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass), {
      type: 'chauffage/mapping/set', entity_id: 'climate.salon',
      mapping: { frost: { temperature: 8 }, comfort: { temperature: 21 } },
    });
  });

  test('a thermostat set to another of its presets, or back to automatic', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = open(hass);
    click(card, '[data-kind="thermostat"][data-preset="eco"][data-climate="climate.salon"]');
    card.shadowRoot.querySelector('input[name="cell-kind"][value="preset"]').checked = true;
    card.shadowRoot.querySelector('[data-cell-preset]').value = 'away';
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 8 }, eco: { preset: 'away' } });

    click(card, '[data-kind="thermostat"][data-preset="eco"][data-climate="climate.salon"]');
    card.shadowRoot.querySelector('[data-cell-preset]').value = ''; // automatic
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, { frost: { temperature: 8 } });

    click(card, '[data-kind="thermostat"][data-preset="frost"][data-climate="climate.salon"]');
    card.shadowRoot.querySelector('input[name="cell-kind"][value="auto"]').checked = true;
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).mapping, {});
  });

  test('a preset\'s default temperature', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = open(hass);
    click(card, '[data-kind="default"][data-preset="eco"]');
    card.shadowRoot.querySelector('[data-cell-temp]').value = '16.5';
    await card._action('cell-apply', {});
    assert.equal(lastCall(hass).type, 'chauffage/presets/set');
    assert.deepEqual(lastCall(hass).presets[1], { id: 'eco', name: 'Éco', color: '#43a047', temperature: 16.5 });
  });

  test('renaming, adding and removing presets', async () => {
    const hass = fakeIntegrationHass({ data: data() });
    const card = open(hass);
    click(card, '[data-kind="preset"][data-preset="eco"]');
    card.shadowRoot.querySelector('[data-cell-name]').value = 'Économique';
    await card._action('cell-apply', {});
    assert.equal(lastCall(hass).presets[1].name, 'Économique');

    click(card, '[data-kind="new"]');
    card.shadowRoot.querySelector('[data-cell-name]').value = 'Nuit';
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).presets.at(-1), { name: 'Nuit', color: '#9e9e9e', temperature: 19 });

    click(card, '[data-kind="preset"][data-preset="comfort"]'); // used in the schedules
    card.shadowRoot.querySelector('[data-cell-delete]').checked = true;
    card.shadowRoot.querySelector('[data-cell-replacement]').value = 'eco';
    await card._action('cell-apply', {});
    assert.deepEqual(lastCall(hass).presets.map((l) => l.id), ['eco', 'frost']);
    assert.deepEqual(lastCall(hass).replacements, { comfort: 'eco' });
  });

  test('Versatile Thermostat preset temperatures are read from its attributes (VTherm 10+)', () => {
    const hass = fakeIntegrationHass({ data: data() });
    hass.states['climate.salon'].attributes.preset_temperatures = { eco_temp: 16.5, comfort_temp: 19 };
    const card = open(hass);
    assert.equal(cellText(card, 'eco', 'climate.salon'), '⟲ 16,5°');
    assert.equal(cellText(card, 'comfort', 'climate.salon'), '⟲ 19°');
  });

  test('back to the schedule view', () => {
    const card = open(fakeIntegrationHass({ data: data() }));
    click(card, '[data-act="view"][data-view="schedule"]');
    assert.ok(card.shadowRoot.querySelector('.chips'));
  });

  test('read only for non-admins', () => {
    const hass = fakeIntegrationHass({ data: data() });
    hass.user = { is_admin: false };
    const card = open(hass);
    assert.equal(card.shadowRoot.querySelector('[data-act="cell"]'), null);
    assert.ok(card.shadowRoot.querySelector('.pv-table'));
  });
});

describe('a thermostat renamed in Home Assistant', () => {
  // climate.salon renamed climate.sejour: the card's configuration still holds the former id;
  // like HA's own cards, the card does not change it by itself
  const renamed = () => {
    const data = integrationData({ weeks: { 'climate.sejour': { Normal: Array(7).fill(WEEKDAY) } } });
    return { ...data, renamed: { 'climate.salon': 'climate.sejour' } };
  };
  const hassOf = () => {
    const hass = fakeIntegrationHass({ data: renamed() });
    hass.states['climate.sejour'] = hass.states['climate.salon'];
    delete hass.states['climate.salon'];
    return hass;
  };

  const chips = (card) => [...card.shadowRoot.querySelectorAll('.chip[data-climate]')].map((c) => c.dataset.climate);

  test('is set aside, with a notice giving its new id and asking to edit the card', () => {
    const card = createCard(hassOf());
    assert.deepEqual(chips(card), ['climate.bureau']);
    const note = card.shadowRoot.querySelector('.renamed-note').textContent;
    assert.match(note, /climate\.salon/);
    assert.match(note, /climate\.sejour/);
    assert.match(note, /modifiez la carte/);
  });

  test('a card holding only renamed thermostats shows the notice alone', () => {
    const card = createCard(hassOf(), { thermostats: ['climate.salon'] });
    assert.ok(card.shadowRoot.querySelector('.renamed-note'));
    assert.deepEqual(chips(card), []);
  });

  test('nothing is saved under the former id', async () => {
    const hass = hassOf();
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await card._save();
    assert.deepEqual(Object.keys(lastCall(hass).weeks), ['climate.bureau']);
  });

  test('an id given again to another thermostat is that thermostat, not the renamed one', () => {
    const hass = hassOf();
    hass.states['climate.salon'] = { state: 'heat', attributes: { friendly_name: 'Chambre' }, last_updated: '1' };
    const card = createCard(hass);
    assert.deepEqual(chips(card), ['climate.salon', 'climate.bureau']);
    assert.equal(card.shadowRoot.querySelector('.renamed-note'), null);
  });

  test('shown again once an entity has its former id again', () => {
    const hass = hassOf();
    const card = createCard(hass);
    const bars = () => [...new Set([...card.shadowRoot.querySelectorAll('.bar[data-climate]')].map((b) => b.dataset.climate))];
    assert.deepEqual(bars(), ['climate.bureau']);
    card.hass = { ...hass, states: { ...hass.states, 'climate.salon': { state: 'heat', attributes: { friendly_name: 'Chambre' }, last_updated: '2' } } };
    assert.deepEqual(chips(card), ['climate.salon', 'climate.bureau']);
    assert.deepEqual(bars(), ['climate.salon', 'climate.bureau']);
  });

  test('the notice goes once the card is edited with the new id', () => {
    const hass = hassOf();
    const card = createCard(hass);
    card.setConfig({ thermostats: ['climate.sejour', 'climate.bureau'], show: 'all' });
    card.hass = hass;
    assert.deepEqual(chips(card), ['climate.sejour', 'climate.bureau']);
    assert.deepEqual(day(card, 'climate.sejour', 0), WEEKDAY);
    assert.equal(card.shadowRoot.querySelector('.renamed-note'), null);
  });
});

describe('an integration older than the card', () => {
  // Right after an update from HACS, before Home Assistant restarts: the new card's file is
  // served, but the running integration still sends the former format
  const former = () => ({ modes: [{ id: 'normal', name: 'Normal' }], active_mode: 'normal', levels: [],
    schedules: { 'climate.salon': { normal: Array(7).fill([['00:00', 'eco']]) } }, overrides: {}, revision: 1 });

  test('the card asks to restart Home Assistant instead of breaking', () => {
    const card = createCard(fakeIntegrationHass({ data: former() }));
    assert.match(card.shadowRoot.querySelector('.missing').textContent, /redémarrez Home Assistant/);
  });

  test('the more-info block stays hidden', () => {
    const hass = fakeIntegrationHass({ data: former() });
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    assert.equal(el.style.display, 'none');
  });
});

describe('without the integration', () => {
  test('the card says the Chauffage integration must be added', () => {
    const card = createCard(hassWithoutIntegration());
    const text = card.shadowRoot.querySelector('.missing').textContent;
    assert.match(text, /intégration Chauffage/);
    assert.equal(card.shadowRoot.querySelector('.chips'), null);
  });

  test('in English too', () => {
    const card = createCard(hassWithoutIntegration({ locale: { language: 'en' } }));
    assert.match(card.shadowRoot.querySelector('.missing').textContent, /Chauffage integration/);
  });
});
