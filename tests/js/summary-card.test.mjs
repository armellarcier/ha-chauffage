// The summary card (custom:chauffage-summary-card): a floor or the house in one row, to place in
// one's own dashboard. What the room feels like, how many thermostats heat, the overrides, and
// the schedules, one tap away; a tap elsewhere does the card's action, a pop-up of the rooms for
// example.
import { fakeHass, integrationData, hassWithoutIntegration, cleanup, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
const WEEKS = { 'climate.salon': { Normal: WEEK }, 'climate.bureau': { Normal: WEEK } };
const TYPE = 'custom:chauffage-summary-card';
const ENGLISH = { language: 'en-US', time_format: 'language', number_format: 'language', first_weekday: 'language' };
const OVERRIDE = { target: { temperature: 21 }, start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const lastCall = (hass) => hass.events.at(-1);

function setup(more = {}) {
  const data = integrationData({ weeks: WEEKS, ...more, language: more.locale ? more.locale.language : 'fr' });
  const hass = fakeHass({ data, ...(more.locale ? { locale: more.locale } : {}) });
  Object.assign(hass.states['climate.salon'].attributes, { current_temperature: 20.1, hvac_action: 'heating' });
  Object.assign(hass.states['climate.bureau'].attributes, { current_temperature: 19, hvac_action: 'idle' });
  hass.states['sensor.sonde_temperature'] = { state: '20.44', attributes: { unit_of_measurement: '°C' } };
  hass.states['sensor.sonde_humidite'] = { state: '60.6', attributes: { unit_of_measurement: '%' } };
  hass.callService = async (domain, service, data) => { hass.events.push({ domain, service, data }); };
  return hass;
}

function cardFor(hass, config = {}) {
  const card = document.createElement('chauffage-summary-card');
  card.setConfig({ type: TYPE, ...config });
  document.body.appendChild(card);
  card.hass = hass;
  return card;
}
const $ = (card, selector) => card.shadowRoot.querySelector(selector);

describe('the summary card', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => {
    mock.timers.reset();
    cleanup();
  });

  test('its name, and the temperature and humidity of its sensors', () => {
    const card = cardFor(setup(), { name: 'Étage', temperature: 'sensor.sonde_temperature', humidity: 'sensor.sonde_humidite' });
    assert.equal(text($(card, '.sc-name')), 'Étage');
    assert.equal(text($(card, '.sc-climate')), '20,4° · 61 %');
  });

  test('without a sensor, the range of the temperatures measured by its thermostats', () => {
    const card = cardFor(setup());
    assert.equal(text($(card, '.sc-name')), 'Chauffage');
    assert.equal(text($(card, '.sc-climate')), '19–20,1°');
  });

  test('how many thermostats heat, and the overrides', () => {
    const card = cardFor(setup({ overrides: { 'climate.bureau': OVERRIDE } }));
    assert.equal(text($(card, '.sc-status')), '1 chauffe · 1 dérogation');
  });

  test('several, or none, and the paused thermostats', () => {
    const hass = setup({ paused: ['climate.bureau'] });
    hass.states['climate.salon'].attributes.hvac_action = 'idle';
    assert.equal(text($(cardFor(hass), '.sc-status')), 'Rien ne chauffe · 1 en pause');
    cleanup();
    const both = setup({ overrides: { 'climate.salon': OVERRIDE, 'climate.bureau': OVERRIDE } });
    both.states['climate.bureau'].attributes.hvac_action = 'heating';
    assert.equal(text($(cardFor(both), '.sc-status')), '2 chauffent · 2 dérogations');
  });

  test('only the thermostats listed in the card', () => {
    const card = cardFor(setup({ overrides: { 'climate.bureau': OVERRIDE } }), { thermostats: ['climate.bureau'] });
    assert.equal(text($(card, '.sc-status')), 'Rien ne chauffe · 1 dérogation');
    assert.equal(text($(card, '.sc-climate')), '19°');
  });

  test('its icon is in color while a thermostat heats, grey otherwise', () => {
    const hass = setup();
    const color = (card) => $(card, '.sc-badge').style.getPropertyValue('--tile-color');
    assert.match(color(cardFor(hass)), /--state-climate-heat-color/);
    cleanup();
    hass.states['climate.salon'].attributes.hvac_action = 'idle';
    assert.match(color(cardFor(hass)), /--state-climate-off-color/);
  });

  test('one button shows the active schedule and opens a menu of the schedules; a tap activates one through its select', () => {
    const hass = setup();
    hass.entities['switch.chauffage_schedule_normal'] = { entity_id: 'switch.chauffage_schedule_normal', icon: 'mdi:home' };
    const card = cardFor(hass);
    const button = () => $(card, '[data-schedules-button]');
    assert.equal(text(button()), 'Normal');
    assert.equal(button().querySelector('ha-icon').getAttribute('icon'), 'mdi:home');
    assert.equal(button().getAttribute('aria-expanded'), 'false');
    assert.equal($(card, '.sc-menu'), null, 'closed at first');
    button().click();
    assert.equal(button().getAttribute('aria-expanded'), 'true');
    const items = [...card.shadowRoot.querySelectorAll('.sc-menu [data-schedule]')];
    assert.deepEqual(items.map((b) => text(b)), ['Normal', 'Absent', 'Vacances']);
    assert.equal($(card, '.sc-menu [data-schedule="normal"]').getAttribute('aria-checked'), 'true');
    $(card, '.sc-menu [data-schedule="away"]').click();
    assert.deepEqual(lastCall(hass), { domain: 'select', service: 'select_option', data: { entity_id: 'select.chauffage_schedule', option: 'Absent' } });
    assert.equal($(card, '.sc-menu'), null, 'closed once a schedule is chosen');
  });

  test('a schedule with an icon shows it in the menu', () => {
    const hass = setup();
    hass.entities['switch.chauffage_schedule_away'] = { entity_id: 'switch.chauffage_schedule_away', icon: 'mdi:airplane' };
    const card = cardFor(hass);
    $(card, '[data-schedules-button]').click();
    assert.equal($(card, '.sc-menu [data-schedule="away"] ha-icon').getAttribute('icon'), 'mdi:airplane');
  });

  test('without the menu of the schedules (show_schedules: false), no button', () => {
    const card = cardFor(setup(), { show_schedules: false });
    assert.equal($(card, '[data-schedules-button]'), null);
    assert.equal($(card, '[data-schedule]'), null);
  });

  test('the menu of the schedules closes on a second tap of its button or a tap outside, without the card\'s action', () => {
    const card = cardFor(setup(), { tap_action: { action: 'navigate', navigation_path: '#heats' } });
    const actions = [];
    card.addEventListener('hass-action', (e) => actions.push(e.detail));
    $(card, '[data-schedules-button]').click();
    $(card, '[data-schedules-button]').click();
    assert.equal($(card, '.sc-menu'), null, 'a second tap closes it');
    $(card, '[data-schedules-button]').click();
    document.body.click();
    assert.equal($(card, '.sc-menu'), null, 'a tap outside closes it');
    assert.equal(actions.length, 0, 'the button does not do the card\'s action');
  });

  test('a tap does the card\'s action, a pop-up of the rooms for example', () => {
    const card = cardFor(setup(), { tap_action: { action: 'navigate', navigation_path: '#heats' } });
    const actions = [];
    card.addEventListener('hass-action', (e) => actions.push(e.detail));
    $(card, '.sc-main').click();
    assert.deepEqual(actions, [{ config: { tap_action: { action: 'navigate', navigation_path: '#heats' } }, action: 'tap' }]);
    $(card, '[data-schedules-button]').click();
    $(card, '.sc-menu [data-schedule="away"]').click();
    assert.equal(actions.length, 1, 'a schedule tapped does not do the card\'s action');
  });

  test('Enter or Space does the card\'s action too', () => {
    const card = cardFor(setup(), { tap_action: { action: 'navigate', navigation_path: '#heats' } });
    const actions = [];
    card.addEventListener('hass-action', (e) => actions.push(e.detail));
    for (const key of ['Enter', ' ']) $(card, '.sc-main').dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
    assert.equal(actions.length, 2);
  });

  test('thermostats that cool are counted, and color its icon', () => {
    const hass = setup();
    hass.states['climate.salon'].attributes.hvac_action = 'idle';
    hass.states['climate.bureau'] = { ...hass.states['climate.bureau'], state: 'cool' };
    hass.states['climate.bureau'].attributes.hvac_action = 'cooling';
    const card = cardFor(hass);
    assert.equal(text($(card, '.sc-status')), '1 refroidit');
    assert.match($(card, '.sc-badge').style.getPropertyValue('--tile-color'), /--state-climate-cool-color/);
    cleanup();
    hass.states['climate.salon'].attributes.hvac_action = 'heating';
    assert.equal(text($(cardFor(hass), '.sc-status')), '1 chauffe · 1 refroidit');
  });

  test('without an action, a tap does nothing', () => {
    const card = cardFor(setup());
    const actions = [];
    card.addEventListener('hass-action', (e) => actions.push(e.detail));
    $(card, '.sc-main').click();
    assert.equal(actions.length, 0);
  });

  test('without the integration, says so', () => {
    const card = cardFor(hassWithoutIntegration());
    assert.match(text($(card, 'ha-card')), /L’intégration Chauffage n’est pas configurée/);
  });

  test('in English', () => {
    const card = cardFor(setup({ locale: ENGLISH, overrides: { 'climate.bureau': OVERRIDE } }));
    assert.equal(text($(card, '.sc-status')), '1 heating · 1 override');
  });
});

describe('the summary card in Home Assistant', () => {
  afterEach(() => cleanup());

  test('it is in the "Add card" dialog, with a preview', () => {
    document.documentElement.lang = 'fr';
    const entry = window.customCards.find((c) => c.type === 'chauffage-summary-card');
    assert.equal(entry.name, 'Résumé du chauffage');
    assert.equal(entry.preview, true);
    document.documentElement.lang = '';
  });
});
