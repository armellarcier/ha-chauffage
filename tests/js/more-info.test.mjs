// "Programme" block injected into a thermostat's more-info dialog.
import { fakeHass, cleanup } from './helpers.mjs';
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
const override = { type: 'temp', valeur: 21.5, debut: '2026-10-12T09:30:00+02:00', fin: '2026-10-12T11:30:00+02:00' };

describe('more-info block', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') })); // Monday
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('without override: current and next slot', () => {
    const el = block(fakeHass(), 'climate.salon');
    assert.match(text(el), /Suit le programme : Éco jusqu'à 17:30, puis Confort/);
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
    const { event_type, event_data } = hass.events.at(-1);
    assert.equal(event_type, 'chauffage_derogation_set');
    assert.equal(new Date(event_data.derogation.fin).toISOString(), '2026-10-12T10:00:00.000Z');
  });
});
