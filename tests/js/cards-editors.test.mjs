// The visual editors of the rooms card and of the summary card (dashboard → edit card). HA's
// elements (<ha-entity-picker>, <ha-form>…) are not loaded in the tests: the tests send the
// events they send.
import { fakeHass, integrationData } from './helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function editorFor(tag, config, { version = '2025.1.0', locale } = {}) {
  const editor = customElements.get(tag).getConfigElement();
  const hass = fakeHass({ ...(locale ? { locale } : {}), data: integrationData({ weeks: { 'climate.salon': { Normal: [] }, 'climate.bureau': { Normal: [] } } }) });
  hass.config.version = version;
  editor.hass = hass;
  editor.setConfig(config);
  const changes = [];
  editor.addEventListener('config-changed', (e) => {
    changes.push(e.detail.config);
    editor.setConfig(e.detail.config);
  });
  const $ = (sel) => editor.shadowRoot.querySelector(sel);
  const $$ = (sel) => [...editor.shadowRoot.querySelectorAll(sel)];
  const value = (el, v) => el.dispatchEvent(new CustomEvent('value-changed', { detail: { value: v } }));
  const formChange = (form, patch) => value(form, { ...form.data, ...patch });
  return { editor, hass, changes, $, $$, value, formChange, last: () => changes.at(-1) };
}

describe('the rooms card\'s visual editor', () => {
  const TYPE = 'custom:chauffage-rooms-card';
  const tag = 'chauffage-rooms-card';

  test('the card offers a visual editor, and starts with every scheduled thermostat', async () => {
    const card = customElements.get(tag);
    assert.equal(card.getConfigElement().localName, 'chauffage-rooms-card-editor');
    assert.deepEqual(await card.getStubConfig(fakeHass()), {});
  });

  test('one row per thermostat; adding one puts it last', () => {
    const { $, $$, value, last } = editorFor(tag, { type: TYPE, thermostats: ['climate.salon'] });
    assert.equal($$('.thermostat').length, 1);
    value($('.add'), 'climate.bureau');
    assert.deepEqual(last(), { type: TYPE, thermostats: ['climate.salon', 'climate.bureau'] });
  });

  test('without a list, it says every scheduled thermostat is shown', () => {
    const { $, $$ } = editorFor(tag, { type: TYPE });
    assert.equal($$('.thermostat').length, 0);
    assert.match($('.all-note').textContent, /Tous les thermostats programmés/);
  });

  test('a thermostat\'s page sets its name and its icon, emptied they are removed', () => {
    const { $, $$, formChange, last } = editorFor(tag, { type: TYPE, thermostats: ['climate.salon'] });
    $$('.thermostat')[0].querySelector('.edit').click();
    const form = $('ha-form');
    assert.deepEqual(form.schema.map((s) => s.name), ['entity', 'name', 'icon']);
    formChange(form, { name: 'Séjour', icon: 'mdi:sofa' });
    assert.deepEqual(last(), { type: TYPE, thermostats: [{ entity: 'climate.salon', name: 'Séjour', icon: 'mdi:sofa' }] });
    formChange(form, { name: '', icon: '' });
    assert.deepEqual(last(), { type: TYPE, thermostats: ['climate.salon'] });
  });

  test('no option of the schedule card: neither the time step nor showing every thermostat', () => {
    const { $ } = editorFor(tag, { type: TYPE, thermostats: ['climate.salon'] });
    assert.equal($('ha-form.options'), null);
  });
});

describe('the summary card\'s visual editor', () => {
  const TYPE = 'custom:chauffage-summary-card';
  const tag = 'chauffage-summary-card';

  test('the card offers a visual editor', async () => {
    const card = customElements.get(tag);
    assert.equal(card.getConfigElement().localName, 'chauffage-summary-card-editor');
    assert.deepEqual(await card.getStubConfig(fakeHass()), {});
  });

  test('its form: the name, the icon, the sensors, the thermostats and the tap action', () => {
    const { $ } = editorFor(tag, { type: TYPE });
    const form = $('ha-form');
    assert.deepEqual(form.schema.map((s) => s.name), ['name', 'icon', 'temperature', 'humidity', 'thermostats', 'tap_action']);
    assert.deepEqual(form.schema.find((s) => s.name === 'temperature').selector, { entity: { domain: 'sensor', device_class: 'temperature' } });
    assert.deepEqual(form.schema.find((s) => s.name === 'thermostats').selector, { entity: { domain: 'climate', multiple: true } });
    // Without an action, the card does nothing: HA's field says so
    assert.deepEqual(form.schema.find((s) => s.name === 'tap_action').selector, { ui_action: { default_action: 'none' } });
  });

  test('what is set is written, what is emptied is left out', () => {
    const { $, formChange, last } = editorFor(tag, { type: TYPE, language: 'en' });
    const form = $('ha-form');
    formChange(form, { name: 'Étage', temperature: 'sensor.sonde', thermostats: ['climate.salon'], tap_action: { action: 'navigate', navigation_path: '#heats' } });
    assert.deepEqual(last(), { type: TYPE, language: 'en', name: 'Étage', temperature: 'sensor.sonde', thermostats: ['climate.salon'], tap_action: { action: 'navigate', navigation_path: '#heats' } });
    formChange(form, { name: '', thermostats: [], tap_action: undefined });
    assert.deepEqual(last(), { type: TYPE, language: 'en', temperature: 'sensor.sonde' });
  });

  test('its labels in the user\'s language', () => {
    const { $ } = editorFor(tag, { type: TYPE });
    const form = $('ha-form');
    assert.equal(form.computeLabel({ name: 'temperature' }), 'Sonde de température (facultatif)');
    assert.equal(form.computeLabel({ name: 'tap_action' }), 'Action au tap (facultatif)');
  });
});
