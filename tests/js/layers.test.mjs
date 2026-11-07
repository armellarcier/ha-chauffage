// Schedule layers in the card: the layers of the active schedule that apply now are drawn over each
// thermostat's day, raised, the top layer over the others. A schedule without layers looks as before.
import { fakeHass, integrationData, createCard, cleanup } from './helpers.mjs';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const $$ = (card, selector) => [...card.shadowRoot.querySelectorAll(selector)];

const OCCUPIED = { id: 'occupied', name: 'Salon occupé', enabled: true, condition: "{{ is_state('binary_sensor.salon', 'on') }}" };
const SUN = { id: 'sun', name: 'Soleil', enabled: true, condition: null };
// Comfort from 09:00 to 17:00, nothing drawn outside
const OCCUPIED_DAY = [['00:00', null], ['09:00', 'comfort'], ['17:00', null]];
// Eco from 12:00 to 14:00
const SUN_DAY = [['00:00', null], ['12:00', 'eco'], ['14:00', null]];

function withLayers({ applying = ['occupied'], schedule = 'Normal' } = {}) {
  const data = integrationData({ schedule });
  data.schedules = data.schedules.map((s) => ({ ...s, layers: s.id === 'normal' ? [SUN, OCCUPIED] : [] }));
  data.layer_weeks = { 'climate.salon': { occupied: Array(7).fill(OCCUPIED_DAY), sun: Array(7).fill(SUN_DAY) } };
  data.layers_applying = applying;
  return data;
}

// The layer blocks drawn on the salon's Monday: [left %, width %, preset, layer]
function blocks(card) {
  return $$(card, '.bar[data-climate="climate.salon"][data-day="0"] .layer-block')
    .map((el) => [el.style.left, el.style.width, el.dataset.preset, el.dataset.layer]);
}

afterEach(() => cleanup());

describe('the layers that apply now, over the schedule', () => {
  test('a layer that applies draws its blocks over the day, and nothing where it has none', () => {
    const card = createCard(fakeHass({ data: withLayers() }));
    assert.deepEqual(blocks(card), [['37.5%', '33.333%', 'comfort', 'occupied']]);
  });

  test('where layers overlap, the top one is drawn', () => {
    const card = createCard(fakeHass({ data: withLayers({ applying: ['sun', 'occupied'] }) }));
    assert.deepEqual(blocks(card), [
      ['37.5%', '12.5%', 'comfort', 'occupied'],
      ['50%', '8.333%', 'eco', 'sun'],
      ['58.333%', '12.5%', 'comfort', 'occupied'],
    ]);
  });

  test('a layer that does not apply now is not drawn', () => {
    const card = createCard(fakeHass({ data: withLayers({ applying: [] }) }));
    assert.deepEqual(blocks(card), []);
  });

  test('nothing is drawn in the tab of a schedule that is not active', () => {
    const card = createCard(fakeHass({ data: withLayers({ schedule: 'Absent' }) }));
    card.shadowRoot.querySelector('.tab[data-schedule="normal"]').click();
    assert.deepEqual(blocks(card), []);
  });

  test('a layer block names its layer and what it gives', () => {
    const card = createCard(fakeHass({ data: withLayers() }));
    const [block] = $$(card, '.bar[data-climate="climate.salon"][data-day="0"] .layer-block');
    assert.match(block.title, /Salon occupé/);
    assert.match(block.title, /Confort/);
  });

  test('a schedule without layers draws no layer block', () => {
    const card = createCard(fakeHass());
    assert.deepEqual($$(card, '.layer-block'), []);
  });

  test('a change of the layers that apply is drawn at once', () => {
    const hass = fakeHass({ data: withLayers({ applying: [] }) });
    const card = createCard(hass);
    hass.push(withLayers({ applying: ['occupied'] }));
    assert.equal(blocks(card).length, 1);
  });
});
