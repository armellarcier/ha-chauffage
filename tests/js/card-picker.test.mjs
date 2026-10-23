// The card in Home Assistant's "Add card" dialog: the list of cards (by card) and the
// suggestions for an entity (by entity, from Home Assistant 2026.6).
import { fakeHass, hassWithoutIntegration, integrationData, cleanup, ChauffageProgrammeCard, WEEKDAY } from './helpers.mjs';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const entry = () => window.customCards.find((c) => c.type === 'chauffage-programme-card');

afterEach(() => {
  document.documentElement.lang = '';
  cleanup(); // cards detached (their timers stopped), saved selection cleared
});

describe('the card in the "Add card" dialog', () => {
  test('it is listed once, with a live preview and a link to its documentation', () => {
    assert.equal(window.customCards.filter((c) => c.type === 'chauffage-programme-card').length, 1);
    assert.equal(entry().preview, true);
    assert.equal(entry().documentationURL, 'https://github.com/armellarcier/ha-chauffage#readme');
  });

  test('its name and description are in the language of Home Assistant\'s interface', () => {
    document.documentElement.lang = 'en';
    assert.equal(entry().name, 'Heating schedules');
    assert.match(entry().description, /Weekly heating schedules/);
    document.documentElement.lang = 'fr';
    assert.equal(entry().name, 'Plannings de chauffe');
    assert.match(entry().description, /Plannings de chauffe hebdomadaires/);
  });

  test('a new card starts with the thermostats that already have a schedule in Chauffage', async () => {
    const hass = fakeHass({ data: integrationData({ weeks: {
      'climate.bureau': { Normal: Array(7).fill(WEEKDAY) },
      'climate.salon': { Normal: Array(7).fill(WEEKDAY) },
      'climate.removed': { Normal: Array(7).fill(WEEKDAY) }, // no longer in Home Assistant
    } }) });
    const { card_id: _, ...stub } = await ChauffageProgrammeCard.getStubConfig(hass);
    assert.deepEqual(stub, { thermostats: ['climate.bureau', 'climate.salon'] });
  });

  test('a new card gets its own hidden id, for the integration to know which thermostats it shows', async () => {
    const first = await ChauffageProgrammeCard.getStubConfig(fakeHass());
    const second = await ChauffageProgrammeCard.getStubConfig(fakeHass());
    assert.match(first.card_id, /^[a-z0-9]{8,}$/);
    assert.notEqual(first.card_id, second.card_id);
  });

  test('without schedules yet, or without the integration, a new card starts with every thermostat', async () => {
    const extra = (hass) => Object.assign(hass.states, { 'light.salon': { state: 'on', attributes: {} }, 'climate.cuisine': { state: 'heat', attributes: {} } }) && hass;
    const expected = ['climate.salon', 'climate.bureau', 'climate.cuisine'];
    assert.deepEqual((await ChauffageProgrammeCard.getStubConfig(extra(fakeHass({ weeks: {} })))).thermostats, expected);
    assert.deepEqual((await ChauffageProgrammeCard.getStubConfig(extra(hassWithoutIntegration()))).thermostats, expected);
  });

  // The selection saved on this device by a card of a dashboard: every thermostat
  const allChosenOnThisDevice = () => localStorage.setItem('chauffage-programme-card:shown', JSON.stringify(['climate.salon', 'climate.bureau']));
  const shown = (card) => [...card.shadowRoot.querySelectorAll('.chip.on[data-climate]')].map((c) => c.dataset.climate);
  const chips = (card) => card.shadowRoot.querySelectorAll('.chip[data-climate]').length;

  test('in the "By card" list, the preview has every thermostat but shows only the first one, whatever was chosen on this device', async () => {
    allChosenOnThisDevice();
    if (!customElements.get('hui-card-picker')) customElements.define('hui-card-picker', class extends HTMLElement {});
    const picker = document.createElement('hui-card-picker');
    picker.attachShadow({ mode: 'open' });
    document.body.appendChild(picker);
    const hass = fakeHass({ weeks: {} });
    // As HA does: the card made from the default config, given hass, then put in the list
    const card = document.createElement('chauffage-programme-card');
    card.setConfig({ type: 'custom:chauffage-programme-card', ...(await ChauffageProgrammeCard.getStubConfig(hass)) });
    card.hass = hass;
    picker.shadowRoot.appendChild(card);
    assert.equal(chips(card), 2);
    assert.deepEqual(shown(card), ['climate.salon']);
  });

  test('a card previewed by HA (suggestions, card editor) shows what its config says, not the selection of this device', () => {
    allChosenOnThisDevice();
    const hass = fakeHass();
    const card = document.createElement('chauffage-programme-card');
    card.setConfig({ type: 'custom:chauffage-programme-card', thermostats: ['climate.salon', 'climate.bureau'] });
    card.preview = true; // set by HA's hui-card after the config
    document.body.appendChild(card);
    card.hass = hass;
    assert.deepEqual(shown(card), ['climate.salon']);
    // The card editor: "show every thermostat at first" is seen in the preview
    card.setConfig({ type: 'custom:chauffage-programme-card', thermostats: ['climate.salon', 'climate.bureau'], show: 'all' });
    assert.deepEqual(shown(card), ['climate.salon', 'climate.bureau']);
  });

  test('thermostats chosen in a preview are not kept for the cards of the dashboards', () => {
    allChosenOnThisDevice();
    const card = document.createElement('chauffage-programme-card');
    card.setConfig({ type: 'custom:chauffage-programme-card', thermostats: ['climate.salon', 'climate.bureau'] });
    card.preview = true;
    document.body.appendChild(card);
    card.hass = fakeHass();
    card.shadowRoot.querySelector('.chip[data-climate="climate.bureau"]').click();
    assert.deepEqual(shown(card), ['climate.bureau']);
    assert.deepEqual(JSON.parse(localStorage.getItem('chauffage-programme-card:shown')), ['climate.salon', 'climate.bureau']);
  });

  test('a thermostat chosen in the "By entity" tab suggests the card with that thermostat; other entities do not', () => {
    const hass = fakeHass();
    assert.deepEqual(entry().getEntitySuggestion(hass, 'climate.salon'), {
      config: { type: 'custom:chauffage-programme-card', thermostats: ['climate.salon'] },
    });
    assert.equal(entry().getEntitySuggestion(hass, 'light.salon'), null);
  });
});
