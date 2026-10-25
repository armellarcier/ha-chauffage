// The "Thermostats" view: every thermostat the integration schedules, the cards only show them;
// pause, resume, forget (docs/decisions.md, "Scheduled thermostats", #27).
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
// The card shows the salon and the bureau; the cuisine is scheduled, shown by no card (or another one)
const WEEKS = { 'climate.salon': { Normal: WEEK }, 'climate.bureau': { Normal: WEEK }, 'climate.cuisine': { Normal: WEEK } };
const lastCall = (hass) => hass.events.at(-1);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

function setup(more = {}) {
  const hass = fakeHass({ weeks: WEEKS, paused: ['climate.cuisine'], ...more });
  hass.states['climate.cuisine'] = { state: 'heat', attributes: { friendly_name: 'Cuisine', current_temperature: 18 }, last_updated: '1' };
  return hass;
}

function open(hass) {
  const card = createCard(hass);
  card.shadowRoot.querySelector('[data-act="view"][data-view="thermostats"]').click();
  return card;
}
const row = (card, climate) => card.shadowRoot.querySelector(`.th-row[data-climate="${climate}"]`);
const click = (card, climate, act) => row(card, climate).querySelector(`[data-act="${act}"]`).click();

describe('the "Thermostats" view', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('lists every scheduled thermostat, whether it is paused, and the ones not in this card', () => {
    const card = open(setup());
    const rows = [...card.shadowRoot.querySelectorAll('.th-row')].map((r) => r.dataset.climate);
    assert.deepEqual(rows, ['climate.salon', 'climate.bureau', 'climate.cuisine']);
    assert.match(text(row(card, 'climate.salon')), /Salon.*Piloté/);
    assert.doesNotMatch(text(row(card, 'climate.salon')), /Pas dans cette carte/);
    assert.match(text(row(card, 'climate.cuisine')), /Cuisine.*En pause.*Pas dans cette carte/);
  });

  test('pauses an active thermostat and resumes a paused one', () => {
    const hass = setup();
    const card = open(hass);
    click(card, 'climate.bureau', 'pause');
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.bureau', paused: true });
    click(card, 'climate.cuisine', 'resume');
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.cuisine', paused: false });
  });

  test('forgets a thermostat no longer in this card, after a confirmation', () => {
    const hass = setup();
    const card = open(hass);
    click(card, 'climate.cuisine', 'thermostat-forget');
    assert.equal(hass.events.filter((m) => m.type === 'chauffage/thermostat/forget').length, 0);
    assert.match(text(row(card, 'climate.cuisine')), /Ses semaines et ses réglages seront supprimés/);
    click(card, 'climate.cuisine', 'thermostat-forget-confirm');
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/forget', entity_id: 'climate.cuisine' });
  });

  test('the confirmation can be cancelled', () => {
    const hass = setup();
    const card = open(hass);
    click(card, 'climate.cuisine', 'thermostat-forget');
    click(card, 'climate.cuisine', 'thermostat-forget-cancel');
    assert.equal(row(card, 'climate.cuisine').querySelector('[data-act="thermostat-forget-confirm"]'), null);
    assert.equal(hass.events.filter((m) => m.type === 'chauffage/thermostat/forget').length, 0);
  });

  test('a thermostat in this card cannot be forgotten from it (saving the card would schedule it again)', () => {
    const card = open(setup());
    assert.equal(row(card, 'climate.salon').querySelector('[data-act="thermostat-forget"]'), null);
  });

  test('read only for a user who is not an admin', () => {
    const hass = setup();
    hass.user = { is_admin: false };
    const card = open(hass);
    assert.equal(card.shadowRoot.querySelectorAll('.th-row').length, 3);
    assert.equal(card.shadowRoot.querySelector('.th-row button'), null);
  });

  test('a thermostat\'s name, its Control switch and its device open them (#39)', () => {
    const opened = [];
    const intercept = (e) => { opened.push(e.detail.entityId); e.stopPropagation(); };
    document.addEventListener('hass-more-info', intercept);
    try {
      const card = open(setup());
      row(card, 'climate.salon').querySelector('[data-more-info="climate.salon"]').click();
      row(card, 'climate.salon').querySelector('[data-more-info="switch.salon_control"]').click();
      assert.deepEqual(opened, ['climate.salon', 'switch.salon_control']);
      assert.match(text(row(card, 'climate.salon').querySelector('[data-more-info="switch.salon_control"]')), /Pilotage/);
      row(card, 'climate.salon').querySelector('[data-device="salon-device"]').click();
      assert.equal(window.location.pathname, '/config/devices/device/salon-device');
      assert.equal(row(card, 'climate.bureau').querySelector('[data-device]'), null); // no device
    } finally {
      document.removeEventListener('hass-more-info', intercept);
    }
  });

  test('an entity renamed in Home Assistant: its link follows at once', () => {
    const hass = setup();
    const card = open(hass);
    const data = integrationData({ weeks: WEEKS, paused: ['climate.cuisine'] });
    data.thermostat_entities['climate.salon'].control = 'switch.salon_pilotage';
    hass.push(data); // the integration tells the cards (ENTITIES), nothing else changed
    assert.ok(row(card, 'climate.salon').querySelector('[data-more-info="switch.salon_pilotage"]'));
  });

  test('the Chauffage device, with the switches of the schedules and the select, opens from it (admins)', () => {
    const card = open(setup());
    card.shadowRoot.querySelector('.thermostats-view [data-device="chauffage-device"]').click();
    assert.equal(window.location.pathname, '/config/devices/device/chauffage-device');
    const hass = setup();
    hass.user = { is_admin: false };
    assert.equal(open(hass).shadowRoot.querySelector('[data-device]'), null); // no settings pages
  });

  test('in English', () => {
    const card = open(setup({ locale: { language: 'en' } }));
    assert.match(text(row(card, 'climate.cuisine')), /Cuisine.*Paused.*Not in this card/);
    assert.match(text(row(card, 'climate.salon')), /Controlled/);
  });
});
