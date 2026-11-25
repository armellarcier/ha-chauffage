// The thermostat card (custom:chauffage-thermostat-card, #39): one scheduled thermostat, to place
// in one's own dashboard. What it does now, why and until when, today; a temporary setpoint,
// pause and resume; everything it names opens in Home Assistant.
import { fakeHass, integrationData, hassWithoutIntegration, cleanup, WEEKDAY, WEEKEND, ChauffageThermostatCard } from './helpers.mjs';
import { settle } from './driver.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
const WEEKS = { 'climate.salon': { Normal: WEEK }, 'climate.bureau': { Normal: WEEK } };
// Monday 10:00: the salon is on its 08:30 eco slot, comfort comes at 17:30
const PLANNED = { 'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' } };
const TYPE = 'custom:chauffage-thermostat-card';
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const lastCall = (hass) => hass.events.at(-1);

function setup(more = {}) {
  // Presets are created in the language of Home Assistant
  const data = integrationData({ weeks: WEEKS, planned: PLANNED, ...more, language: more.locale ? more.locale.language : 'fr' });
  data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } } };
  const hass = fakeHass({ data, ...(more.locale ? { locale: more.locale } : {}) });
  hass.states['climate.salon'].attributes.temperature = 17;
  hass.states['climate.salon'].attributes.current_temperature = 20.1;
  return hass;
}

async function cardFor(hass, config = {}) {
  const card = document.createElement('chauffage-thermostat-card');
  card.setConfig({ type: TYPE, entity: 'climate.salon', ...config });
  document.body.appendChild(card);
  card.hass = hass;
  await settle();
  return card;
}
const $ = (card, selector) => card.shadowRoot.querySelector(selector);
// The block it shares with the more-info dialog
const block = (card) => $(card, 'chauffage-moreinfo').shadowRoot;

describe('the thermostat card', () => {
  let opened;
  const intercept = (e) => { opened.push(e.detail.entityId); e.stopPropagation(); };
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') });
    opened = [];
    document.addEventListener('hass-more-info', intercept);
  });
  afterEach(() => {
    document.removeEventListener('hass-more-info', intercept);
    mock.timers.reset();
    cleanup();
  });

  test('needs a thermostat', async () => {
    assert.throws(() => new ChauffageThermostatCard().setConfig({ type: TYPE }), /entity/); await settle();
  });

  test('its name, the measured temperature, what it does now', async () => {
    const card = await cardFor(setup());
    assert.equal(text($(card, '.tc-name')), 'Salon');
    assert.equal(text($(card, '.tc-temp')), '20,1°');
    assert.equal(text($(card, '.tc-state')), 'Éco · 17°');
  });

  test('why and until when, today\'s bar with the current time, in the block of the more-info dialog', async () => {
    const card = await cardFor(setup());
    assert.match(text(block(card)), /Suit le planning : Éco jusqu'à 17:30, puis Confort/);
    assert.ok(block(card).querySelector('.bar.big .now'));
  });

  test('a redraw keeps the same ha-card (a new one would make the page scroll back to the top)', async () => {
    const hass = setup();
    hass.states['climate.cuisine'] = { state: 'heat', attributes: { friendly_name: 'Cuisine', current_temperature: 18 }, last_updated: '1' };
    const card = await cardFor(hass, { entity: 'climate.cuisine' }); // not scheduled yet: a message
    const haCard = $(card, 'ha-card');
    hass.push(integrationData({ weeks: { ...WEEKS, 'climate.cuisine': { Normal: WEEK } }, planned: PLANNED })); await settle(); // scheduled: the block
    assert.ok($(card, 'chauffage-moreinfo'));
    assert.equal($(card, 'ha-card'), haCard);
  });

  test('a name given in the card', async () => {
    const card = await cardFor(setup(), { name: 'Séjour' });
    assert.equal(text($(card, '.tc-name')), 'Séjour');
  });

  test('its name opens the thermostat, the active schedule\'s name its page in the panel (admins)', async () => {
    const card = await cardFor(setup());
    $(card, '.tc-name [data-more-info="climate.salon"]').click(); await settle();
    assert.deepEqual(opened, ['climate.salon']);
    block(card).querySelector('[data-navigate="/chauffage/schedules/normal"]').click(); await settle();
    assert.equal(window.location.pathname, '/chauffage/schedules/normal');
  });

  test('its page in the panel opens from the foot of its block (admins)', async () => {
    const card = await cardFor(setup());
    block(card).querySelector('.foot [data-navigate^="/chauffage/thermostats/climate.salon"]').click(); await settle();
    assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    const hass = setup();
    hass.user = { is_admin: false };
    assert.equal(block(await cardFor(hass)).querySelector('.foot [data-navigate^="/chauffage/thermostats/"]'), null);
  });

  test('a temporary setpoint, for the override duration', async () => {
    const hass = setup();
    const card = await cardFor(hass);
    block(card).querySelector('[data-new-override]').click(); await settle();
    block(card).querySelector('.presets [data-preset="comfort"]').click(); await settle();
    const sent = lastCall(hass);
    assert.equal(sent.type, 'chauffage/override/set');
    assert.deepEqual(sent.override, { target: { temperature: 20 }, preset: 'comfort', start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('a temporary setpoint shows in its state, with its end and the way back to the schedule', async () => {
    const override = { target: { temperature: 21 }, preset: 'boost', start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const card = await cardFor(setup({ overrides: { 'climate.salon': override } }));
    assert.match(text($(card, '.tc-state')), /⏱ Boost/);
    assert.match(text(block(card)), /Reprendre le planning/);
  });

  test('the end of a temporary setpoint being typed keeps its field while the thermostat reports', async () => {
    const override = { target: { temperature: 21 }, start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const hass = setup({ overrides: { 'climate.salon': override } });
    const card = await cardFor(hass);
    const field = block(card).querySelector('input.time[data-override-end]');
    field.focus();
    field.value = '12:00';
    const salon = hass.states['climate.salon'];
    card.hass = { ...hass, states: { ...hass.states, 'climate.salon': { ...salon, attributes: { ...salon.attributes, current_temperature: 20.4 } } } }; await settle();
    assert.equal(text($(card, '.tc-temp')), '20,4°'); // the header follows
    assert.ok(field.isConnected, 'the field is kept');
    assert.equal(hass.events.filter((m) => m.type === 'chauffage/override/set').length, 0, 'nothing sent while typing');
    field.blur();
    assert.equal(new Date(lastCall(hass).override.end).toISOString(), '2026-10-12T10:00:00.000Z');
  });

  test('a temporary setpoint at a temperature shows it once, not "17,5 °C · 17,5°"', async () => {
    const override = { target: { temperature: 17.5 }, start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const hass = setup({ overrides: { 'climate.salon': override } });
    hass.states['climate.salon'].attributes.temperature = 17.5;
    assert.equal(text($(await cardFor(hass), '.tc-state')), '⏱ 17,5°');
  });

  test('pauses it, then Resume in place of Pause (admins); a paused thermostat says so', async () => {
    const hass = setup();
    const card = await cardFor(hass);
    block(card).querySelector('.foot [data-pause]').click(); await settle();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: true });
    hass.push({ ...integrationData({ weeks: WEEKS, planned: PLANNED, paused: ['climate.salon'] }) }); await settle();
    assert.match(text(block(card)), /Pilotage suspendu. Chauffage n'y touche plus/);
    assert.equal(block(card).querySelector('[data-pause]'), null);
    block(card).querySelector('.foot [data-resume]').click(); await settle();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: false });
    const other = setup();
    other.user = { is_admin: false };
    assert.ok(block(await cardFor(other)).querySelector('.foot [data-pause]'), 'not only an admin');
  });

  test('a thermostat Chauffage does not schedule yet says how to schedule it', async () => {
    const hass = setup();
    hass.states['climate.cuisine'] = { state: 'heat', attributes: { friendly_name: 'Cuisine', current_temperature: 18 }, last_updated: '1' };
    const card = await cardFor(hass, { entity: 'climate.cuisine' });
    assert.match(text($(card, 'ha-card')), /Chauffage ne programme pas ce thermostat\. Le programmer$/);
    assert.ok($(card, '.msg [data-navigate="/chauffage/thermostats"]'), 'an admin schedules it from the panel');
  });

  test('without the integration, says so', async () => {
    const card = await cardFor(hassWithoutIntegration());
    assert.match(text($(card, 'ha-card')), /L’intégration Chauffage n’est pas configurée/);
  });

  test('in English', async () => {
    const card = await cardFor(setup({ locale: { language: 'en-US', time_format: 'language', number_format: 'language', first_weekday: 'language' } }));
    assert.equal(text($(card, '.tc-state')), 'Eco · 17°');
    assert.equal(text(block(card).querySelector('.foot [data-navigate^="/chauffage/thermostats/"]')), 'Edit its week');
  });
});

describe('the thermostat card in Home Assistant', () => {
  afterEach(() => cleanup());
  const entry = () => window.customCards.find((c) => c.type === 'chauffage-thermostat-card');

  test('it is in the "Add card" dialog, with a preview, suggested for a thermostat', async () => {
    document.documentElement.lang = 'fr';
    assert.equal(entry().name, 'Thermostat programmé');
    assert.equal(entry().preview, true);
    assert.deepEqual(entry().getEntitySuggestion(null, 'climate.salon'), { config: { type: TYPE, entity: 'climate.salon' } });
    assert.equal(entry().getEntitySuggestion(null, 'light.salon'), null);
    document.documentElement.lang = '';
  });

  test('a new card starts with a thermostat Chauffage schedules', async () => {
    const hass = fakeHass({ data: integrationData({ weeks: { 'climate.bureau': { Normal: WEEK } } }) });
    assert.deepEqual(await ChauffageThermostatCard.getStubConfig(hass), { entity: 'climate.bureau' });
  });

  test('its visual editor sets the thermostat and its name', async () => {
    const editor = ChauffageThermostatCard.getConfigElement();
    const hass = fakeHass();
    hass.config.version = '2025.1.0';
    editor.hass = hass; await settle();
    editor.setConfig({ type: TYPE, entity: 'climate.salon' }); await settle();
    const changes = [];
    editor.addEventListener('config-changed', (e) => { changes.push(e.detail.config); editor.setConfig(e.detail.config); }); await settle();
    const form = editor.shadowRoot.querySelector('ha-form');
    assert.deepEqual(form.data, { entity: 'climate.salon', name: '' });
    form.dispatchEvent(new CustomEvent('value-changed', { detail: { value: { entity: 'climate.bureau', name: 'Bureau 1' } } })); await settle();
    assert.deepEqual(changes.at(-1), { type: TYPE, entity: 'climate.bureau', name: 'Bureau 1' });
    form.dispatchEvent(new CustomEvent('value-changed', { detail: { value: { entity: 'climate.bureau', name: '' } } })); await settle();
    assert.deepEqual(changes.at(-1), { type: TYPE, entity: 'climate.bureau' });
  });
});
