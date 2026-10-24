// "Schedule" block injected into a thermostat's more-info dialog.
import { fakeHass, cleanup, integrationData } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

function block(hass, entity) {
  const el = document.createElement('chauffage-moreinfo');
  document.body.appendChild(el);
  el.entity = entity;
  el.hass = hass;
  return el;
}
const text = (el) => el.shadowRoot.textContent.replace(/\s+/g, ' ');
const override = { kind: 'temperature', value: 21.5, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };

describe('more-info block', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') })); // Monday
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('without override: current and next slot', () => {
    const el = block(fakeHass(), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco jusqu'à 17:30, puis Confort/);
  });

  test('the title shows the name of the active schedule, not its id', () => {
    const el = block(fakeHass({ schedule: 'Vacances', weeks: { 'climate.salon': { Vacances: Array(7).fill(['00:00 eco']) } } }), 'climate.salon');
    assert.match(text(el), /Planning · Vacances/);
    assert.doesNotMatch(text(el), /holiday/);
  });

  test('thermostat without a schedule: block hidden', () => {
    const el = block(fakeHass(), 'climate.bureau');
    assert.equal(el.style.display, 'none');
  });

  test('with an override: setpoint, end time and remaining time', () => {
    const el = block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.match(text(el), /21,5 °C/); // French decimal comma
    assert.match(text(el), /encore 1 h 30/);
    assert.equal(el.shadowRoot.querySelector('input[data-end]').value, '11:30');
  });

  test('+30 min extends the override', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = block(hass, 'climate.salon');
    el.shadowRoot.querySelector('button[data-min="30"]').click();
    const msg = hass.events.at(-1);
    assert.equal(msg.type, 'chauffage/override/set');
    assert.equal(new Date(msg.override.end).toISOString(), '2026-10-12T10:00:00.000Z');
  });

  // What the integration says each preset means on this thermostat (here: no climate presets)
  const withTargets = (overrides = { 'climate.salon': override }) => {
    const data = integrationData({ overrides });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { temperature: 17 } } };
    return fakeHass({ data });
  };

  test('a preset picked in the block becomes the override, until the same end', () => {
    const hass = withTargets();
    const el = block(hass, 'climate.salon');
    el.shadowRoot.querySelector('.presets [data-preset="comfort"]').click();
    const msg = hass.events.at(-1);
    assert.equal(msg.type, 'chauffage/override/set');
    assert.deepEqual(msg.override, { ...override, kind: 'temperature', value: 20, preset: 'comfort' });
  });

  test('an override set to a preset shows that preset, on a thermostat without presets', () => {
    const el = block(withTargets({ 'climate.salon': { ...override, value: 20, preset: 'comfort' } }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('.override-value').textContent, '⏱ Confort');
    assert.ok(el.shadowRoot.querySelector('.presets [data-preset="comfort"]').classList.contains('on'));
  });

  test('an override set to a preset deleted since shows the thermostat\'s own preset', () => {
    const data = integrationData({ overrides: { 'climate.salon': { ...override, kind: 'preset', value: 'eco', preset: 'nuit' } } });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { preset: 'eco' } } };
    const el = block(fakeHass({ data }), 'climate.salon');
    assert.ok(el.shadowRoot.querySelector('.presets [data-preset="eco"]').classList.contains('on'));
  });

  test('an override at a preset\'s temperature does not show that preset', () => {
    const el = block(withTargets({ 'climate.salon': { ...override, value: 20 } }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('.override-value').textContent, '⏱ 20 °C');
    assert.equal(el.shadowRoot.querySelector('.presets .on'), null);
  });

  test('a temperature typed in the block becomes the override', () => {
    const hass = withTargets();
    const el = block(hass, 'climate.salon');
    const input = el.shadowRoot.querySelector('input[data-override-temperature]');
    assert.equal(input.value, '21.5');
    input.value = '22';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(hass.events.at(-1).override, { ...override, kind: 'temperature', value: 22 });
  });

  test('a temperature being typed survives an update of the thermostat', () => {
    const hass = withTargets();
    const el = block(hass, 'climate.salon');
    const input = el.shadowRoot.querySelector('input[data-override-temperature]');
    input.focus();
    input.value = '2';
    const salon = hass.states['climate.salon'];
    el.hass = { ...hass, states: { ...hass.states, 'climate.salon': { ...salon, attributes: { ...salon.attributes, current_temperature: 20.1 } } } };
    const after = el.shadowRoot.querySelector('input[data-override-temperature]');
    assert.equal(after.value, '2');
    assert.equal(el.shadowRoot.activeElement, after);
  });

  test('with an override: what the thermostat goes back to at its end', () => {
    const el = block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.match(text(el), /puis Éco \(planning\)/); // 11:30: the 08:30 eco slot
  });

  test('without an override, "Temporary setpoint…" then a preset creates one, for the override duration', () => {
    const hass = withTargets({});
    const el = block(hass, 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('.presets'), null); // folded until asked
    el.shadowRoot.querySelector('[data-new-override]').click();
    el.shadowRoot.querySelector('.presets [data-preset="comfort"]').click();
    const msg = hass.events.at(-1);
    assert.equal(msg.type, 'chauffage/override/set');
    assert.deepEqual(msg.override, { kind: 'temperature', value: 20, preset: 'comfort', start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('without an override, a temperature typed creates one', () => {
    const hass = withTargets({});
    const el = block(hass, 'climate.salon');
    el.shadowRoot.querySelector('[data-new-override]').click();
    const input = el.shadowRoot.querySelector('input[data-override-temperature]');
    input.value = '22';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(hass.events.at(-1).override, { kind: 'temperature', value: 22, start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('an override ended elsewhere is no longer shown, even while a field has the focus', () => {
    const hass = withTargets();
    const el = block(hass, 'climate.salon');
    el.shadowRoot.querySelector('input[data-override-temperature]').focus();
    hass.push(integrationData({ overrides: {} }));
    assert.match(text(el), /Suit le planning/);
  });
});
