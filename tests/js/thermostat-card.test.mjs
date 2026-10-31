// The thermostat card (custom:chauffage-thermostat-card, #39): one scheduled thermostat, to place
// in one's own dashboard. What it does now, why and until when, today; a temporary setpoint,
// pause and resume; everything it names opens in Home Assistant.
import { fakeHass, integrationData, hassWithoutIntegration, cleanup, WEEKDAY, WEEKEND, ChauffageThermostatCard } from './helpers.mjs';
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

function cardFor(hass, config = {}) {
  const card = document.createElement('chauffage-thermostat-card');
  card.setConfig({ type: TYPE, entity: 'climate.salon', ...config });
  document.body.appendChild(card);
  card.hass = hass;
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

  test('needs a thermostat', () => {
    assert.throws(() => new ChauffageThermostatCard().setConfig({ type: TYPE }), /entity/);
  });

  test('its name, the measured temperature, what it does now', () => {
    const card = cardFor(setup());
    assert.equal(text($(card, '.tc-name')), 'Salon');
    assert.equal(text($(card, '.tc-temp')), '20,1°');
    assert.equal(text($(card, '.tc-state')), 'Éco · 17°');
  });

  test('why and until when, today\'s bar with the current time, in the block of the more-info dialog', () => {
    const card = cardFor(setup());
    assert.match(text(block(card)), /Suit le planning : Éco jusqu'à 17:30, puis Confort/);
    assert.ok(block(card).querySelector('.bar.big .now'));
  });

  test('a redraw keeps the same ha-card (a new one would make the page scroll back to the top)', () => {
    const hass = setup();
    hass.states['climate.cuisine'] = { state: 'heat', attributes: { friendly_name: 'Cuisine', current_temperature: 18 }, last_updated: '1' };
    const card = cardFor(hass, { entity: 'climate.cuisine' }); // not scheduled yet: a message
    const haCard = $(card, 'ha-card');
    hass.push(integrationData({ weeks: { ...WEEKS, 'climate.cuisine': { Normal: WEEK } }, planned: PLANNED })); // scheduled: the block
    assert.ok($(card, 'chauffage-moreinfo'));
    assert.equal($(card, 'ha-card'), haCard);
  });

  test('a name given in the card', () => {
    const card = cardFor(setup(), { name: 'Séjour' });
    assert.equal(text($(card, '.tc-name')), 'Séjour');
  });

  test('its name opens the thermostat, the schedule its switch (#39)', () => {
    const card = cardFor(setup());
    $(card, '.tc-name [data-more-info="climate.salon"]').click();
    block(card).querySelector('[data-more-info="switch.chauffage_schedule_normal"]').click();
    assert.deepEqual(opened, ['climate.salon', 'switch.chauffage_schedule_normal']);
  });

  test('its Control switch and its device open from the foot of its block (the device for admins)', () => {
    const card = cardFor(setup());
    block(card).querySelector('.foot [data-more-info="switch.salon_control"]').click();
    assert.deepEqual(opened, ['switch.salon_control']);
    block(card).querySelector('.foot [data-device="salon-device"]').click();
    assert.equal(window.location.pathname, '/config/devices/device/salon-device');
    const hass = setup();
    hass.user = { is_admin: false };
    assert.equal(block(cardFor(hass)).querySelector('[data-device]'), null);
  });

  test('a temporary setpoint, for the override duration', () => {
    const hass = setup();
    const card = cardFor(hass);
    block(card).querySelector('[data-new-override]').click();
    block(card).querySelector('.presets [data-preset="comfort"]').click();
    const sent = lastCall(hass);
    assert.equal(sent.type, 'chauffage/override/set');
    assert.deepEqual(sent.override, { kind: 'temperature', value: 20, preset: 'comfort', start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('a temporary setpoint shows in its state, with its end and the way back to the schedule', () => {
    const override = { kind: 'temperature', value: 21, preset: 'boost', start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const card = cardFor(setup({ overrides: { 'climate.salon': override } }));
    assert.match(text($(card, '.tc-state')), /⏱ Boost/);
    assert.match(text(block(card)), /Reprendre le planning/);
  });

  test('the end of a temporary setpoint being typed keeps its field while the thermostat reports', () => {
    const override = { kind: 'temperature', value: 21, start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const hass = setup({ overrides: { 'climate.salon': override } });
    const card = cardFor(hass);
    const field = block(card).querySelector('input.time[data-end]');
    field.focus();
    field.value = '12:00';
    const salon = hass.states['climate.salon'];
    card.hass = { ...hass, states: { ...hass.states, 'climate.salon': { ...salon, attributes: { ...salon.attributes, current_temperature: 20.4 } } } };
    assert.equal(text($(card, '.tc-temp')), '20,4°'); // the header follows
    assert.ok(field.isConnected, 'the field is kept');
    assert.equal(hass.events.filter((m) => m.type === 'chauffage/override/set').length, 0, 'nothing sent while typing');
    field.blur();
    assert.equal(new Date(lastCall(hass).override.end).toISOString(), '2026-10-12T10:00:00.000Z');
  });

  test('a temporary setpoint at a temperature shows it once, not "17,5 °C · 17,5°"', () => {
    const override = { kind: 'temperature', value: 17.5, start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const hass = setup({ overrides: { 'climate.salon': override } });
    hass.states['climate.salon'].attributes.temperature = 17.5;
    assert.equal(text($(cardFor(hass), '.tc-state')), '⏱ 17,5°');
  });

  test('pauses it, then Resume in place of Pause (admins); a paused thermostat says so', () => {
    const hass = setup();
    const card = cardFor(hass);
    block(card).querySelector('.foot [data-pause]').click();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: true });
    hass.push({ ...integrationData({ weeks: WEEKS, planned: PLANNED, paused: ['climate.salon'] }) });
    assert.match(text(block(card)), /En pause : Chauffage ne le pilote pas/);
    assert.equal(block(card).querySelector('[data-pause]'), null);
    block(card).querySelector('.foot [data-resume]').click();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: false });
    const other = setup();
    other.user = { is_admin: false };
    assert.equal(block(cardFor(other)).querySelector('[data-pause]'), null);
  });

  test('a thermostat Chauffage does not schedule yet says how to schedule it', () => {
    const hass = setup();
    hass.states['climate.cuisine'] = { state: 'heat', attributes: { friendly_name: 'Cuisine', current_temperature: 18 }, last_updated: '1' };
    const card = cardFor(hass, { entity: 'climate.cuisine' });
    assert.match(text($(card, 'ha-card')), /Chauffage ne programme pas ce thermostat. Un administrateur peut le programmer dans le panneau Chauffage, sur la page Thermostats/);
  });

  test('without the integration, says so', () => {
    const card = cardFor(hassWithoutIntegration());
    assert.match(text($(card, 'ha-card')), /L’intégration Chauffage n’est pas configurée/);
  });

  test('in English', () => {
    const card = cardFor(setup({ locale: { language: 'en-US', time_format: 'language', number_format: 'language', first_weekday: 'language' } }));
    assert.equal(text($(card, '.tc-state')), 'Eco · 17°');
    assert.match(text(block(card).querySelector('.foot')), /Control/);
  });
});

describe('the thermostat card in Home Assistant', () => {
  afterEach(() => cleanup());
  const entry = () => window.customCards.find((c) => c.type === 'chauffage-thermostat-card');

  test('it is in the "Add card" dialog, with a preview, suggested for a thermostat', () => {
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

  test('its visual editor sets the thermostat and its name', () => {
    const editor = ChauffageThermostatCard.getConfigElement();
    const hass = fakeHass();
    hass.config.version = '2025.1.0';
    editor.hass = hass;
    editor.setConfig({ type: TYPE, entity: 'climate.salon' });
    const changes = [];
    editor.addEventListener('config-changed', (e) => { changes.push(e.detail.config); editor.setConfig(e.detail.config); });
    const form = editor.shadowRoot.querySelector('ha-form');
    assert.deepEqual(form.data, { entity: 'climate.salon', name: '' });
    form.dispatchEvent(new CustomEvent('value-changed', { detail: { value: { entity: 'climate.bureau', name: 'Bureau 1' } } }));
    assert.deepEqual(changes.at(-1), { type: TYPE, entity: 'climate.bureau', name: 'Bureau 1' });
    form.dispatchEvent(new CustomEvent('value-changed', { detail: { value: { entity: 'climate.bureau', name: '' } } }));
    assert.deepEqual(changes.at(-1), { type: TYPE, entity: 'climate.bureau' });
  });
});
