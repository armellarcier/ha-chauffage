// The "Now" view: what each thermostat of the card does now, why and until when, with a
// temporary setpoint and pausing at hand (#39); then the thermostats the integration schedules
// that this card does not show: pause, resume, forget (docs/decisions.md, "Scheduled
// thermostats", #27).
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
// The card shows the salon and the bureau; the cuisine is scheduled, shown by no card (or another one)
const WEEKS = { 'climate.salon': { Normal: WEEK }, 'climate.bureau': { Normal: WEEK }, 'climate.cuisine': { Normal: WEEK } };
// Monday 10:00: the salon is on its 08:30 eco slot, comfort comes at 17:30
const PLANNED = {
  'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' },
  'climate.bureau': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' },
};
const lastCall = (hass) => hass.events.at(-1);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const $ = (card, selector) => card.shadowRoot.querySelector(selector);

function setup(more = {}) {
  const hass = fakeHass({ weeks: WEEKS, paused: ['climate.cuisine'], planned: PLANNED, ...more });
  hass.states['climate.cuisine'] = { state: 'heat', attributes: { friendly_name: 'Cuisine', current_temperature: 18 }, last_updated: '1' };
  hass.states['climate.salon'].attributes.temperature = 17;
  return hass;
}

function open(hass, config) {
  const card = createCard(hass, config);
  $(card, '[data-act="view"][data-view="now"]').click();
  return card;
}
const line = (card, climate) => $(card, `.now-row[data-climate="${climate}"]`);
const other = (card, climate) => $(card, `.th-row[data-climate="${climate}"]`);
const click = (row, act) => row.querySelector(`[data-act="${act}"]`).click();

describe('the "Now" view', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('comes first in the views switch', () => {
    const card = createCard(setup());
    const views = [...card.shadowRoot.querySelectorAll('.views [data-view]')].map((b) => b.dataset.view);
    assert.deepEqual(views, ['now', 'schedule', 'presets', 'rules']);
    assert.equal(text($(card, '.views [data-view="now"]')), 'Maintenant');
  });

  test('says the active schedule', () => {
    const card = open(setup());
    assert.match(text($(card, '.now-view')), /Planning actif : Normal/);
  });

  test('one line per thermostat of the card: measured temperature, what it does now, until when and then', () => {
    const card = open(setup());
    const rows = [...card.shadowRoot.querySelectorAll('.now-row')].map((r) => r.dataset.climate);
    assert.deepEqual(rows, ['climate.salon', 'climate.bureau']);
    const salon = text(line(card, 'climate.salon'));
    assert.match(salon, /Salon/);
    assert.match(salon, /20°/); // measured
    assert.match(salon, /Éco · 17°/); // preset of the schedule, setpoint
    assert.match(salon, /Normal · Éco jusqu'à 17:30, puis Confort/);
  });

  test('its line shows today with the current time', () => {
    const card = open(setup());
    const bar = line(card, 'climate.salon').querySelector('.now-bar');
    assert.equal(bar.querySelectorAll('.now-seg').length, WEEKDAY.length);
    assert.ok(bar.querySelector('.now'));
  });

  test('the name opens the thermostat\'s more-info dialog', () => {
    let received = null;
    const intercept = (e) => { received = e.detail.entityId; e.stopPropagation(); };
    document.addEventListener('hass-more-info', intercept);
    try {
      const card = open(setup());
      line(card, 'climate.bureau').querySelector('[data-more-info="climate.bureau"]').click();
      assert.equal(received, 'climate.bureau');
    } finally {
      document.removeEventListener('hass-more-info', intercept);
    }
  });

  test('a temporary setpoint is set from the line, for the override duration', () => {
    const data = integrationData({ weeks: WEEKS, paused: ['climate.cuisine'], planned: PLANNED });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { temperature: 17 } } };
    const hass = setup({ data });
    const card = open(hass);
    click(line(card, 'climate.salon'), 'override-new');
    assert.ok(line(card, 'climate.salon').classList.contains('sel'));
    $(card, '.override-ed .presets [data-preset="comfort"]').click();
    const sent = lastCall(hass);
    assert.equal(sent.type, 'chauffage/override/set');
    assert.deepEqual(sent.override, { kind: 'temperature', value: 20, preset: 'comfort', start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('an override says until when, and what comes back after it; its popover opens from the line', () => {
    const override = { kind: 'preset', value: 'boost', preset: 'boost', start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const card = open(setup({ overrides: { 'climate.salon': override } }));
    const salon = line(card, 'climate.salon');
    assert.match(text(salon), /Consigne temporaire jusqu'à 11:30, puis Éco \(planning\)/);
    assert.ok(salon.querySelector('.now-bar .override-piece'));
    click(salon, 'override-new');
    assert.match(text($(card, '.override-ed')), /Supprimer · reprendre le planning/);
  });

  test('pauses and resumes a thermostat of the card (admins)', () => {
    const hass = setup();
    const card = open(hass);
    click(line(card, 'climate.bureau'), 'pause');
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.bureau', paused: true });
    hass.push(integrationData({ weeks: WEEKS, paused: ['climate.cuisine', 'climate.bureau'], planned: PLANNED }));
    const bureau = line(card, 'climate.bureau');
    assert.match(text(bureau), /En pause : Chauffage ne le pilote pas\./);
    assert.equal(bureau.querySelector('[data-act="override-new"]'), null);
    click(bureau, 'resume');
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.bureau', paused: false });
  });

  test('lists the scheduled thermostats not in this card, whether they are paused', () => {
    const hass = setup();
    const card = open(hass);
    const rows = [...card.shadowRoot.querySelectorAll('.th-row')].map((r) => r.dataset.climate);
    assert.deepEqual(rows, ['climate.cuisine']);
    assert.match(text(other(card, 'climate.cuisine')), /Cuisine.*En pause.*Pas dans cette carte/);
    click(other(card, 'climate.cuisine'), 'resume');
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.cuisine', paused: false });
  });

  test('forgets a thermostat no longer in this card, after a confirmation', () => {
    const hass = setup();
    const card = open(hass);
    click(other(card, 'climate.cuisine'), 'thermostat-forget');
    assert.equal(hass.events.filter((m) => m.type === 'chauffage/thermostat/forget').length, 0);
    assert.match(text(other(card, 'climate.cuisine')), /Ses semaines et ses réglages seront supprimés/);
    click(other(card, 'climate.cuisine'), 'thermostat-forget-confirm');
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/forget', entity_id: 'climate.cuisine' });
  });

  test('the confirmation can be cancelled', () => {
    const hass = setup();
    const card = open(hass);
    click(other(card, 'climate.cuisine'), 'thermostat-forget');
    click(other(card, 'climate.cuisine'), 'thermostat-forget-cancel');
    assert.equal(other(card, 'climate.cuisine').querySelector('[data-act="thermostat-forget-confirm"]'), null);
    assert.equal(hass.events.filter((m) => m.type === 'chauffage/thermostat/forget').length, 0);
  });

  test('a thermostat in this card cannot be forgotten from it (saving the card would schedule it again)', () => {
    const card = open(setup());
    assert.equal(line(card, 'climate.salon').querySelector('[data-act="thermostat-forget"]'), null);
  });

  test('read only for a user who is not an admin: no pause, no forget; a temporary setpoint still', () => {
    const hass = setup();
    hass.user = { is_admin: false };
    const card = open(hass);
    assert.equal(card.shadowRoot.querySelectorAll('.now-row').length, 2);
    assert.equal(card.shadowRoot.querySelector('[data-act="pause"], [data-act="resume"], [data-act="thermostat-forget"]'), null);
    assert.ok(line(card, 'climate.salon').querySelector('[data-act="override-new"]'));
  });

  test('the view chosen is kept for the next visit on this device', () => {
    const hass = setup();
    open(hass);
    document.body.innerHTML = '';
    const again = createCard(hass);
    assert.ok($(again, '.now-view'));
    $(again, '[data-act="view"][data-view="schedule"]').click();
    document.body.innerHTML = '';
    assert.equal($(createCard(hass), '.now-view'), null);
  });

  test('in English', () => {
    const card = open(setup({ locale: { language: 'en-US', time_format: 'language', number_format: 'language', first_weekday: 'language' } }));
    assert.equal(text($(card, '.views [data-view="now"]')), 'Now');
    assert.match(text(line(card, 'climate.salon')), /Normal · Eco until 5:30\s?PM, then Comfort/);
    assert.match(text(other(card, 'climate.cuisine')), /Cuisine.*Paused.*Not in this card/);
  });
});
