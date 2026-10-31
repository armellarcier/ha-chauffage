// A paused thermostat in the card and its more-info block: shown as paused, Chauffage does not
// drive it, its weeks stay editable (docs/decisions.md, "Scheduled thermostats").
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
const WEEKS = { 'climate.salon': { Normal: WEEK }, 'climate.bureau': { Normal: WEEK } };
const pausedSalon = (more = {}) => fakeHass({ weeks: WEEKS, paused: ['climate.salon'], ...more });
const lastCall = (hass) => hass.events.at(-1);
const text = (root) => root.textContent.replace(/\s+/g, ' ');
const q = (card, selector) => card.shadowRoot.querySelector(selector);

function openMenu(card, climate, day) {
  q(card, `.ibtn[data-act="menu"][data-climate="${climate}"][data-day="${day}"]`).click();
  return q(card, '.menu');
}

describe('a paused thermostat in the card', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') })); // Monday
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('its chip says it is paused, instead of what it does now', () => {
    const card = createCard(pausedSalon());
    const chip = q(card, '.chip[data-climate="climate.salon"]');
    assert.ok(chip.classList.contains('paused'));
    assert.match(chip.querySelector('.live').textContent, /En pause/);
    assert.doesNotMatch(q(card, '.chip[data-climate="climate.bureau"] .live').textContent, /pause/);
  });

  test('a notice says Chauffage does not control it, with a button to resume it', () => {
    const hass = pausedSalon();
    const card = createCard(hass);
    const notes = [...card.shadowRoot.querySelectorAll('.paused-note')];
    assert.equal(notes.length, 1);
    assert.match(text(notes[0]), /Salon est en pause : Chauffage ne le pilote pas\./);
    notes[0].querySelector('[data-act="resume"]').click();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: false });
  });

  test('once resumed elsewhere (switch, another card), the notice and the paused rows go away', () => {
    const hass = pausedSalon();
    const card = createCard(hass);
    hass.push(integrationData({ weeks: WEEKS }));
    assert.equal(q(card, '.paused-note'), null);
    assert.ok(!q(card, '.bar[data-climate="climate.salon"]').classList.contains('paused'));
  });

  test('its rows are marked paused, without the current time', () => {
    const card = createCard(pausedSalon());
    const salon = q(card, '.dgroup.today .bar[data-climate="climate.salon"]');
    const bureau = q(card, '.dgroup.today .bar[data-climate="climate.bureau"]');
    assert.ok(salon.classList.contains('paused'));
    assert.equal(salon.querySelector('.now'), null);
    assert.ok(!bureau.classList.contains('paused'));
    assert.ok(bureau.querySelector('.now'));
  });

  test('today\'s row menu offers no temporary setpoint on it, and no pausing on any (#39)', () => {
    const card = createCard(pausedSalon());
    const salon = openMenu(card, 'climate.salon', 0);
    assert.equal(salon.querySelector('[data-act="override-new"], [data-act="pause"], [data-act="resume"]'), null);
    openMenu(card, 'climate.salon', 0); // closes it
    const bureau = openMenu(card, 'climate.bureau', 0);
    assert.ok(bureau.querySelector('[data-act="override-new"]'));
    assert.equal(bureau.querySelector('[data-act="pause"]'), null); // in the "Thermostats" view
  });

  test('its weeks can still be edited and saved, which does not resume it', async () => {
    const hass = pausedSalon();
    const card = createCard(hass);
    card._split('climate.salon', 0, 12 * 60);
    await card._save();
    const msg = lastCall(hass);
    assert.equal(msg.type, 'chauffage/weeks/save');
    assert.deepEqual(msg.weeks['climate.salon'].normal[0].at(-1), ['22:30', 'eco']);
    assert.equal(hass.events.filter((m) => m.type === 'chauffage/thermostat/set').length, 0);
  });

  test('for a user who is not an admin: the notice, but no button to pause or resume', () => {
    const hass = pausedSalon();
    hass.user = { is_admin: false };
    const card = createCard(hass);
    assert.ok(q(card, '.paused-note'));
    assert.equal(q(card, '[data-act="resume"]'), null);
    const page = createCard(hass, { view: 'thermostats' }); // the panel's Thermostats page
    assert.equal(q(page, '[data-act="pause"], [data-act="resume"]'), null);
  });

  test('in English', () => {
    const card = createCard(pausedSalon({ locale: { language: 'en' } }));
    assert.match(q(card, '.chip[data-climate="climate.salon"] .live').textContent, /Paused/);
    assert.match(text(q(card, '.paused-note')), /Salon is paused: Chauffage does not control it\. Resume/);
  });
});

describe('the more-info block of a paused thermostat', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });

  function block(hass, entity) {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = entity;
    el.hass = hass;
    return el;
  }

  test('says it is paused, offers to resume it, and no temporary setpoint', () => {
    const hass = pausedSalon();
    const el = block(hass, 'climate.salon');
    assert.match(text(el.shadowRoot), /En pause : Chauffage ne le pilote pas\./);
    assert.equal(el.shadowRoot.querySelector('[data-new-override]'), null);
    // At the foot, in place of "Pause" (#39)
    assert.equal(el.shadowRoot.querySelector('[data-pause]'), null);
    assert.equal(el.shadowRoot.querySelector('.status [data-resume]'), null);
    assert.equal(text(el.shadowRoot.querySelector('.foot [data-resume]')), 'Piloter'); // the name of the Control switch, not a second "Resume"
    el.shadowRoot.querySelector('[data-resume]').click();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: false });
  });

  test('an active thermostat is paused from the foot of the block (admins)', () => {
    const hass = pausedSalon();
    const el = block(hass, 'climate.bureau');
    assert.equal(text(el.shadowRoot.querySelector('.foot [data-pause]')), 'Mettre en pause');
    el.shadowRoot.querySelector('[data-pause]').click();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.bureau', paused: true });
    hass.user = { is_admin: false };
    el.hass = { ...hass }; // a user who is not an admin: no pause, no resume
    assert.equal(el.shadowRoot.querySelector('[data-pause], [data-resume]'), null);
  });

  test('a resume refused by the integration says why', async () => {
    const hass = pausedSalon({ reply: () => { throw { code: 'invalid_format', message: 'boom' }; } });
    const el = block(hass, 'climate.salon');
    el.shadowRoot.querySelector('[data-resume]').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(text(el.shadowRoot), /Erreur : boom/);
    assert.ok(el.shadowRoot.querySelector('[data-resume]'), 'still paused: it can be tried again');
    hass.push(integrationData({ weeks: WEEKS })); // resumed elsewhere (its switch)
    el.hass = hass;
    assert.match(text(el.shadowRoot), /Suit le planning/);
    assert.doesNotMatch(text(el.shadowRoot), /Erreur/);
  });

  test('once resumed elsewhere, it follows its schedule again', () => {
    const hass = pausedSalon();
    const el = block(hass, 'climate.salon');
    hass.push(integrationData({ weeks: WEEKS }));
    el.hass = hass;
    assert.match(text(el.shadowRoot), /Suit le planning/);
  });

  test('an active thermostat still follows its schedule', () => {
    const el = block(pausedSalon(), 'climate.bureau');
    assert.match(text(el.shadowRoot), /Suit le planning/);
    assert.equal(el.shadowRoot.querySelector('[data-resume]'), null);
  });
});
