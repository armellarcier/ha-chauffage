// The Settings page with Home Assistant's own fields: once <ha-form> is defined, the duration of a
// change by hand is Home Assistant's dropdown. A file of its own: a custom element cannot be
// undefined, and the other panel tests check the native select used without Home Assistant.
import { fakeHass, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
const HOLIDAY = Array(7).fill(['00:00 frost']);
const WEEKS = { 'climate.salon': { Normal: WEEK, Vacances: HOLIDAY, Absent: HOLIDAY }, 'climate.bureau': { Normal: WEEK, Vacances: HOLIDAY, Absent: HOLIDAY } };
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (root, selector) => root.shadowRoot.querySelector(selector);

function setup(settings = {}, more = {}) {
  const data = { ...integrationData({ weeks: WEEKS, language: 'fr' }), ...settings };
  const hass = fakeHass({ data, ...more });
  hass.panels = { chauffage: { url_path: 'chauffage', title: 'Chauffage' } };
  return hass;
}

function panel(hass) {
  window.history.replaceState(null, '', '/chauffage/settings');
  const el = document.createElement('chauffage-panel');
  document.body.appendChild(el);
  el.hass = hass;
  el.panel = hass.panels.chauffage;
  el.route = { prefix: '/chauffage', path: '/settings' };
  return el;
}

// What <ha-form> does when its field changes: it may hold the new data already (as Home Assistant's
// own does), then sends the whole data, with that field changed
const formChange = (form, value) => (form.data = value) && form.dispatchEvent(new CustomEvent('value-changed', { detail: { value }, bubbles: true, composed: true }));

describe('the Settings page with Home Assistant\'s fields', () => {
  afterEach(() => cleanup());

  // First: the tests below need <ha-form> defined
  test('a page drawn before Home Assistant\'s fields are loaded gets them once they are', async () => {
    const el = panel(setup());
    assert.ok($(el, '.override-settings select[data-override-duration]'), 'the native select meanwhile');
    customElements.define('ha-form', class extends HTMLElement {});
    await tick();
    assert.ok($(el, '.override-settings .duration-row ha-form'));
    assert.equal($(el, '.override-settings select'), null);
  });

  test('the duration is Home Assistant\'s dropdown, labelled with the setting, on the current value', () => {
    const hass = setup({ override_duration: 90 });
    const el = panel(hass);
    const form = $(el, '.override-settings .duration-row ha-form');
    assert.ok(form);
    assert.equal($(el, '.override-settings select'), null);
    assert.equal(form.hass, hass);
    assert.deepEqual(form.data, { override_duration: '90' });
    assert.equal(form.schema.length, 1);
    const [field] = form.schema;
    assert.equal(field.name, 'override_duration');
    assert.equal(field.required, true);
    assert.equal(field.selector.select.mode, 'dropdown');
    const options = field.selector.select.options;
    assert.deepEqual(options.slice(0, 6), [
      { value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '45', label: '45 min' },
      { value: '60', label: '1 h' }, { value: '90', label: '1 h 30' }, { value: '120', label: '2 h' }]);
    assert.equal(options.length, 28);
    assert.deepEqual(options.at(-1), { value: '1440', label: '24 h' });
    assert.equal(form.computeLabel(field), "Durée d'un changement à la main");
    assert.equal(form.disabled, false);
  });

  test('a duration picked is sent at once; the field waits for the answer', async () => {
    const hass = setup();
    const el = panel(hass);
    const form = $(el, '.override-settings ha-form');
    formChange(form, { override_duration: '240' });
    assert.equal(form.disabled, true, 'disabled while it is sent');
    assert.deepEqual(form.data, { override_duration: '240' });
    await tick();
    assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', override_duration: 240 });
    assert.equal(form.disabled, false);
    assert.match($(el, '.override-settings .duration-row').textContent, /Enregistré ✓/);
  });

  test('the same field stays across updates: an open dropdown stays open', async () => {
    const hass = setup();
    const el = panel(hass);
    const form = $(el, '.override-settings ha-form');
    const schema = form.schema;
    hass.push({ ...integrationData({ weeks: WEEKS }), manual_override_end: 'next_slot', override_duration: 60 });
    assert.equal($(el, '.override-settings ha-form'), form);
    assert.deepEqual(form.data, { override_duration: '60' });
    assert.equal(form.schema, schema, 'the same options: the field is not drawn again');
    formChange(form, { override_duration: '30' });
    await tick();
    assert.equal($(el, '.override-settings ha-form'), form);
  });

  test('a duration refused by the integration says why, and the field shows the duration kept', async () => {
    const hass = setup({}, { reply: () => { throw { code: 'unauthorized', message: 'Unauthorized' }; } });
    const el = panel(hass);
    const form = $(el, '.override-settings ha-form');
    formChange(form, { override_duration: '240' });
    await tick();
    assert.match($(el, '.override-settings .error').textContent, /Unauthorized/);
    assert.deepEqual(form.data, { override_duration: '120' });
  });

  test('read-only for a user who is not an admin', () => {
    const hass = setup();
    hass.user = { is_admin: false };
    const form = $(panel(hass), '.override-settings ha-form');
    assert.equal(form.disabled, true);
  });
});
