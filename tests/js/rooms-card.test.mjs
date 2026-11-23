// The rooms card (custom:chauffage-rooms-card): one dense row per scheduled thermostat, to place
// in one's own dashboard or in a pop-up. Each row says what the thermostat does now and what comes
// next, and changes its setpoint with − and +, as an override.
import { fakeHass, integrationData, hassWithoutIntegration, cleanup, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
const WEEKS = { 'climate.salon': { Normal: WEEK }, 'climate.bureau': { Normal: WEEK } };
// Monday 10:00: both thermostats are on their 08:30 eco slot, comfort comes at 17:30
const PLANNED = {
  'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' },
  'climate.bureau': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' },
};
const TYPE = 'custom:chauffage-rooms-card';
const ENGLISH = { language: 'en-US', time_format: 'language', number_format: 'language', first_weekday: 'language' };
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const lastCall = (hass) => hass.events.at(-1);
const overridesSent = (hass) => hass.events.filter((m) => m.type === 'chauffage/override/set');
const servicesCalled = (hass) => hass.events.filter((m) => m.service);

function setup(more = {}) {
  const data = integrationData({ weeks: WEEKS, planned: PLANNED, ...more, language: more.locale ? more.locale.language : 'fr' });
  const hass = fakeHass({ data, ...(more.locale ? { locale: more.locale } : {}) });
  Object.assign(hass.states['climate.salon'].attributes, { temperature: 17, current_temperature: 20.1 });
  Object.assign(hass.states['climate.bureau'].attributes, { temperature: 17, current_temperature: 19 });
  // A heater: heat or off
  hass.states['climate.salon'].attributes.hvac_modes = ['heat', 'off'];
  hass.states['climate.bureau'].attributes.hvac_modes = ['heat', 'off'];
  // The services of Home Assistant, recorded with the websocket messages
  hass.callService = async (domain, service, data) => { hass.events.push({ domain, service, data }); };
  return hass;
}

function cardFor(hass, config = {}) {
  const card = document.createElement('chauffage-rooms-card');
  card.setConfig({ type: TYPE, ...config });
  document.body.appendChild(card);
  card.hass = hass;
  return card;
}
const $ = (card, selector) => card.shadowRoot.querySelector(selector);
const rows = (card) => [...card.shadowRoot.querySelectorAll('.rc-row')];
const row = (card, entity) => $(card, `.rc-row[data-entity="${entity}"]`);

describe('the rooms card', () => {
  let opened;
  const intercept = (e) => { opened.push(e.detail.entityId); e.stopPropagation(); };
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-10-12T10:00:00+02:00') });
    opened = [];
    document.addEventListener('hass-more-info', intercept);
  });
  afterEach(() => {
    document.removeEventListener('hass-more-info', intercept);
    mock.timers.reset();
    cleanup();
  });

  test('without a list, shows every thermostat Chauffage schedules', () => {
    const card = cardFor(setup());
    assert.deepEqual(rows(card).map((r) => r.dataset.entity), ['climate.salon', 'climate.bureau']);
  });

  test('a list given in the card, in its order, with a name and an icon', () => {
    const card = cardFor(setup(), { thermostats: ['climate.bureau', { entity: 'climate.salon', name: 'Séjour', icon: 'mdi:sofa' }] });
    assert.deepEqual(rows(card).map((r) => r.dataset.entity), ['climate.bureau', 'climate.salon']);
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-name')), 'Séjour');
    assert.equal(row(card, 'climate.salon').querySelector('.rc-icon').getAttribute('icon'), 'mdi:sofa');
  });

  test('a row: the name, the measured temperature, the preset now and what comes next', () => {
    const card = cardFor(setup());
    const r = row(card, 'climate.salon');
    assert.equal(text(r.querySelector('.rc-name')), 'Salon');
    assert.equal(text(r.querySelector('.rc-temp')), '20,1°');
    assert.equal(text(r.querySelector('.rc-state')), 'Éco → Confort 17:30');
    assert.ok(r.querySelector('.rc-state i[style*="background"]'), 'the color of the preset');
    assert.equal(text(r.querySelector('.rc-value')), '17°');
  });

  test('what comes next within a day says only its time, later its day too', () => {
    const at = (next_start) => ({ 'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start } });
    const tomorrow = cardFor(setup({ planned: at('2026-10-13T06:30:00+02:00') }));
    assert.equal(text(row(tomorrow, 'climate.salon').querySelector('.rc-state')), 'Éco → Confort 06:30');
    cleanup();
    const later = cardFor(setup({ planned: at('2026-10-14T06:30:00+02:00') }));
    assert.equal(text(row(later, 'climate.salon').querySelector('.rc-state')), 'Éco → Confort mercredi 06:30');
  });

  test('a thermostat that protects itself says why, starting with a capital', () => {
    const data = integrationData({ weeks: WEEKS, planned: PLANNED });
    data.thermostats['climate.salon'].cause = 'window';
    const hass = fakeHass({ data });
    const card = cardFor(hass);
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-state')), 'Fenêtre ouverte');
    hass.states['climate.salon'] = { ...hass.states['climate.salon'], state: 'off' };
    card.hass = { ...hass, states: { ...hass.states } };
    assert.equal(row(card, 'climate.salon').querySelector('[data-mode-button]'), null, 'turned off by its window: no mode button');
  });

  test('the icon opens the thermostat, as the rest of the row', () => {
    const hass = setup();
    const card = cardFor(hass);
    row(card, 'climate.salon').querySelector('.rc-badge').click();
    assert.deepEqual(opened, ['climate.salon']);
    assert.equal(servicesCalled(hass).length, 0);
  });

  test('the mode button opens a popover of the HVAC modes, a tap sets one and closes it', () => {
    const hass = setup();
    hass.states['climate.salon'].attributes.hvac_modes = ['off', 'heat', 'cool', 'fan_only'];
    const card = cardFor(hass);
    const r = () => row(card, 'climate.salon');
    assert.equal(r().querySelector('.rc-modes'), null, 'closed at first');
    r().querySelector('[data-mode-button]').click();
    assert.deepEqual([...r().querySelectorAll('.rc-modes [data-hvac-mode]')].map((b) => b.dataset.hvacMode), ['off', 'heat', 'cool', 'fan_only']);
    assert.ok(r().querySelector('[data-hvac-mode="heat"]').classList.contains('on'), 'the current mode');
    assert.equal(servicesCalled(hass).length, 0, 'nothing sent before a mode is tapped');
    assert.equal(opened.length, 0, 'the mode button does not open the thermostat');
    r().querySelector('[data-hvac-mode="cool"]').click();
    assert.deepEqual(lastCall(hass), { domain: 'climate', service: 'set_hvac_mode', data: { entity_id: 'climate.salon', hvac_mode: 'cool' } });
    assert.equal(r().querySelector('.rc-modes'), null, 'closed again');
  });

  test('a tap elsewhere closes the popover, and a second popover closes the first', () => {
    const card = cardFor(setup());
    row(card, 'climate.salon').querySelector('[data-mode-button]').click();
    row(card, 'climate.bureau').querySelector('[data-mode-button]').click();
    assert.equal(row(card, 'climate.salon').querySelector('.rc-modes'), null);
    assert.ok(row(card, 'climate.bureau').querySelector('.rc-modes'));
    document.body.click();
    assert.equal(card.shadowRoot.querySelector('.rc-modes'), null);
  });

  test('the mode button shows the icon of the current mode', () => {
    const hass = setup();
    hass.states['climate.bureau'] = { ...hass.states['climate.bureau'], state: 'off' };
    const card = cardFor(hass);
    assert.equal(row(card, 'climate.salon').querySelector('[data-mode-button] ha-icon').getAttribute('icon'), 'mdi:fire');
    assert.equal(row(card, 'climate.bureau').querySelector('[data-mode-button] ha-icon').getAttribute('icon'), 'mdi:power');
  });

  test('a thermostat turned off has no − and +, and turns on from its popover', () => {
    const hass = setup();
    hass.states['climate.salon'] = { ...hass.states['climate.salon'], state: 'off' };
    const card = cardFor(hass);
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-state')), 'Éteint');
    assert.equal(row(card, 'climate.salon').querySelector('[data-delta]'), null);
    row(card, 'climate.salon').querySelector('[data-mode-button]').click();
    row(card, 'climate.salon').querySelector('[data-hvac-mode="heat"]').click();
    assert.deepEqual(lastCall(hass), { domain: 'climate', service: 'set_hvac_mode', data: { entity_id: 'climate.salon', hvac_mode: 'heat' } });
  });

  test('a thermostat with a single mode has no mode button', () => {
    const hass = setup();
    hass.states['climate.salon'].attributes.hvac_modes = ['heat'];
    assert.equal(row(cardFor(hass), 'climate.salon').querySelector('[data-mode-button]'), null);
  });

  test('on a thermostat with several modes, the mode is said once when it does not change', () => {
    const planned = { 'climate.salon': { hvac_mode: 'heat', preset: 'eco', next_hvac_mode: 'heat', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' } };
    const hass = setup({ planned });
    hass.states['climate.salon'].attributes.hvac_modes = ['heat', 'cool', 'off'];
    const card = cardFor(hass);
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-state')), 'Chauffe · Éco → Confort 17:30');
  });

  test('the mode button is filled while the thermostat heats, not once it reaches its setpoint', () => {
    const hass = setup();
    hass.states['climate.salon'].attributes.hvac_action = 'heating';
    hass.states['climate.bureau'].attributes.hvac_action = 'idle';
    const card = cardFor(hass);
    const mode = (entity) => row(card, entity).querySelector('[data-mode-button]');
    assert.ok(mode('climate.salon').classList.contains('active'));
    assert.ok(!mode('climate.bureau').classList.contains('active'));
    assert.match(mode('climate.bureau').style.getPropertyValue('--tile-color'), /--state-climate-heat-color/, 'in the color of its mode');
    delete hass.states['climate.bureau'].attributes.hvac_action; // a thermostat that does not say: not filled
    card.hass = { ...hass, states: { ...hass.states } };
    assert.ok(!mode('climate.bureau').classList.contains('active'));
  });

  test('the room\'s icon is in the color of its mode, at its setpoint too, and never grey', () => {
    const hass = setup();
    hass.states['climate.salon'].attributes.hvac_action = 'idle';
    hass.states['climate.bureau'] = { ...hass.states['climate.bureau'], state: 'off' };
    hass.states['climate.bureau'].attributes.hvac_action = 'off';
    const card = cardFor(hass);
    const color = (entity) => row(card, entity).querySelector('.rc-badge').style.getPropertyValue('--tile-color');
    assert.match(color('climate.salon'), /--state-climate-heat-color/);
    assert.equal(color('climate.bureau'), '', 'off: Home Assistant\'s icon color, not grey');
  });

  test('the color of heat/cool is Home Assistant\'s', () => {
    const hass = setup();
    hass.states['climate.salon'] = { ...hass.states['climate.salon'], state: 'heat_cool' };
    hass.states['climate.salon'].attributes.hvac_modes = ['off', 'heat_cool'];
    const card = cardFor(hass);
    assert.match(row(card, 'climate.salon').querySelector('[data-mode-button]').style.getPropertyValue('--tile-color'), /--state-climate-heat-cool-color/);
  });

  test('tapping a row opens the thermostat', () => {
    const card = cardFor(setup());
    row(card, 'climate.salon').querySelector('.rc-main').click();
    assert.deepEqual(opened, ['climate.salon']);
  });

  test('+ and − change the setpoint shown at once, and set it on the thermostat when the taps stop', () => {
    const hass = setup();
    const card = cardFor(hass);
    const plus = row(card, 'climate.salon').querySelector('[data-delta="1"]');
    plus.click();
    plus.click();
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-value')), '18°');
    assert.equal(servicesCalled(hass).length, 0, 'nothing sent while tapping');
    mock.timers.tick(1500);
    // As a change by hand: Chauffage makes it an override
    assert.deepEqual(servicesCalled(hass), [{ domain: 'climate', service: 'set_temperature', data: { entity_id: 'climate.salon', temperature: 18 } }]);
    assert.equal(overridesSent(hass).length, 0, 'no override sent by the card');
    assert.equal(opened.length, 0, 'a tap on + does not open the thermostat');
  });

  test('the setpoint tapped stays shown until the thermostat reports it', () => {
    const hass = setup();
    const card = cardFor(hass);
    row(card, 'climate.salon').querySelector('[data-delta="1"]').click();
    mock.timers.tick(1500);
    const salon = hass.states['climate.salon'];
    const report = (temperature, current) => ({ ...hass, states: { ...hass.states, 'climate.salon': { ...salon, attributes: { ...salon.attributes, temperature, current_temperature: current } } } });
    card.hass = report(17, 20.2); // a report before the change
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-value')), '17,5°');
    card.hass = report(17.5, 20.2);
    card.hass = report(18, 20.3); // changed elsewhere after that
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-value')), '18°');
  });

  test('− and + follow the thermostat\'s step and limits', () => {
    const hass = setup();
    Object.assign(hass.states['climate.salon'].attributes, { target_temp_step: 1, min_temp: 16 });
    const card = cardFor(hass);
    const minus = row(card, 'climate.salon').querySelector('[data-delta="-1"]');
    minus.click();
    minus.click();
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-value')), '16°');
  });

  test('an override says until when, and its cross resumes the schedule', () => {
    const override = { target: { temperature: 21 }, preset: 'boost', start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const hass = setup({ overrides: { 'climate.salon': override } });
    hass.states['climate.salon'].attributes.temperature = 21;
    const card = cardFor(hass);
    const r = row(card, 'climate.salon');
    assert.ok(r.classList.contains('override'));
    assert.equal(text(r.querySelector('.rc-state')), '⏱ Boost jusqu\'à 11:30');
    r.querySelector('[data-resume-schedule]').click();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/override/set', entity_id: 'climate.salon', override: null });
  });

  test('an override that ends after midnight, within a day, says only its time', () => {
    const override = { target: { temperature: 21 }, start: '2026-10-12T09:00:00+02:00', end: '2026-10-13T00:30:00+02:00' };
    const card = cardFor(setup({ overrides: { 'climate.salon': override } }));
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-state')), '⏱ jusqu\'à 00:30');
  });

  test('+ on an override starts from its setpoint', () => {
    const override = { target: { temperature: 21 }, start: '2026-10-12T09:00:00+02:00', end: '2026-10-12T11:30:00+02:00' };
    const hass = setup({ overrides: { 'climate.salon': override } });
    hass.states['climate.salon'].attributes.temperature = 21;
    const card = cardFor(hass);
    row(card, 'climate.salon').querySelector('[data-delta="1"]').click();
    mock.timers.tick(1500);
    assert.deepEqual(lastCall(hass).data, { entity_id: 'climate.salon', temperature: 21.5 });
  });

  test('a paused thermostat says so, keeps − and +, and resumes control from its row', () => {
    const hass = setup({ paused: ['climate.salon'] });
    const card = cardFor(hass);
    const r = row(card, 'climate.salon');
    assert.equal(text(r.querySelector('.rc-state')), 'Pilotage suspendu');
    assert.ok(r.querySelector('[data-delta]'), 'its own setpoint, which Chauffage leaves alone');
    r.querySelector('[data-resume-control]').click();
    assert.deepEqual(lastCall(hass), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: false });
  });

  test('a thermostat in fan-only or dry mode has no − and +', () => {
    for (const mode of ['fan_only', 'dry']) {
      const hass = setup();
      hass.states['climate.salon'] = { ...hass.states['climate.salon'], state: mode };
      hass.states['climate.salon'].attributes.hvac_modes = ['off', 'heat', mode];
      const card = cardFor(hass);
      assert.equal(row(card, 'climate.salon').querySelector('[data-delta]'), null, mode);
      assert.ok(row(card, 'climate.salon').querySelector('[data-mode-button]'), `${mode}: the mode can still change`);
      cleanup();
    }
  });

  test('a thermostat without a setpoint has no − and +', () => {
    const hass = setup();
    hass.states['climate.salon'] = { ...hass.states['climate.salon'], state: 'off', attributes: { friendly_name: 'Salon', current_temperature: 20.1 } };
    const card = cardFor(hass);
    assert.equal(row(card, 'climate.salon').querySelector('[data-delta]'), null);
  });

  test('a thermostat that does not exist says so', () => {
    const card = cardFor(setup(), { thermostats: ['climate.cave'] });
    assert.match(text(row(card, 'climate.cave')), /climate\.cave/);
  });

  test('without the integration, says so', () => {
    const card = cardFor(hassWithoutIntegration());
    assert.match(text($(card, 'ha-card')), /L’intégration Chauffage n’est pas configurée/);
  });

  test('in English', () => {
    const card = cardFor(setup({ locale: ENGLISH }));
    assert.equal(text(row(card, 'climate.salon').querySelector('.rc-state')), 'Eco → Comfort 5:30 PM');
  });
});

describe('the rooms card in Home Assistant', () => {
  afterEach(() => cleanup());
  const entry = () => window.customCards.find((c) => c.type === 'chauffage-rooms-card');

  test('it is in the "Add card" dialog, with a preview', () => {
    document.documentElement.lang = 'fr';
    assert.equal(entry().name, 'Pièces');
    assert.equal(entry().preview, true);
    document.documentElement.lang = '';
  });
});
