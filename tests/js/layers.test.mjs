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

// ---------- editing a row of a schedule with layers ----------

const $ = (card, selector) => card.shadowRoot.querySelector(selector);
// One pixel per minute: clientX is a time of day in minutes
const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
const mouse = (el, type, clientX = 0) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
const salonBar = (card) => $(card, '.bar[data-climate="climate.salon"][data-day="0"]');
const layerBar = (card, layer) => $(card, `.lbar[data-climate="climate.salon"][data-day="0"][data-layer="${layer}"]`);
const saved = (hass) => hass.events.filter((m) => m.type === 'chauffage/weeks/save');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function editing(data = withLayers()) {
  const hass = fakeHass({ data });
  const card = createCard(hass, { show: ['climate.salon'] });
  salonBar(card).querySelector('.seg').click();
  return { hass, card };
}

describe('a row of a schedule with layers is shown, and edited once tapped', () => {
  test('a row is only shown: its slots cannot be dragged', () => {
    const card = createCard(fakeHass({ data: withLayers() }), { show: ['climate.salon'] });
    const bar = geometry(salonBar(card));
    assert.ok(bar.classList.contains('locked'));
    const handle = bar.querySelector('.handle');
    mouse(handle, 'pointerdown', 6 * 60 + 30);
    mouse(handle, 'pointermove', 7 * 60);
    mouse(handle, 'pointerup', 7 * 60);
    assert.equal(card._dirty, false);
  });

  test('tapping a row opens it: the schedule on its own row, then one row per layer', () => {
    const { card } = editing();
    assert.ok(!salonBar(card).classList.contains('locked'));
    assert.deepEqual($$(card, '.layer-sub .lname').map((el) => el.textContent.trim()), ['Soleil', 'Salon occupé']);
    assert.ok(layerBar(card, 'occupied'));
    assert.equal(salonBar(card).querySelectorAll('.layer-block').length, 0); // the schedule's own row shows only the schedule
  });

  test('a layer that does not apply now is grey, a disabled one struck', () => {
    const data = withLayers({ applying: ['occupied'] });
    data.schedules[0].layers = [{ ...SUN, enabled: false }, OCCUPIED];
    const { card } = editing(data);
    const names = $$(card, '.layer-sub .lname');
    assert.ok(names[0].classList.contains('off'));
    assert.ok(!names[1].classList.contains('off') && !names[1].classList.contains('idle'));
  });

  test('the row menu opens the row too, and Done closes it', () => {
    const card = createCard(fakeHass({ data: withLayers() }), { show: ['climate.salon'] });
    $(card, '[data-act="menu"][data-day="0"]').click();
    $(card, '[data-act="edit-row"]').click();
    assert.ok(layerBar(card, 'occupied'));
    $(card, '[data-act="close-row"]').click();
    assert.equal(layerBar(card, 'occupied'), null);
    assert.ok(salonBar(card).classList.contains('locked'));
  });

  test('a schedule without layers is edited as before, without opening its rows', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    assert.ok(!salonBar(card).classList.contains('locked'));
  });
});

describe('editing a layer: blocks, and nothing where none is drawn', () => {
  test('a double click where the layer has nothing adds an hour of a block', async () => {
    const { hass, card } = editing();
    const bar = geometry(layerBar(card, 'occupied'));
    mouse(bar, 'dblclick', 19 * 60);
    assert.equal(card._dirty, true);
    $(card, '[data-act="save"]').click();
    await flush();
    const [msg] = saved(hass);
    assert.deepEqual(msg.layer_weeks['climate.salon'].occupied[0],
      [['00:00', null], ['09:00', 'comfort'], ['17:00', null], ['19:00', 'comfort'], ['20:00', null]]);
  });

  test('a new block stops at the next block', () => {
    const { card } = editing();
    mouse(geometry(layerBar(card, 'occupied')), 'dblclick', 8 * 60 + 30);
    assert.deepEqual(card._layerBlocks('climate.salon', 'occupied', 0).map((b) => [b.start, b.end]), [[510, 540], [540, 1020]]);
  });

  test('deleting a block leaves nothing there: the blocks around it do not grow', async () => {
    const { hass, card } = editing();
    mouse(geometry(layerBar(card, 'occupied')), 'dblclick', 19 * 60);
    layerBar(card, 'occupied').querySelector('.lblock[data-idx="0"]').click();
    $(card, '.editor [data-act="layer-delete"]').click();
    assert.deepEqual(card._layerBlocks('climate.salon', 'occupied', 0).map((b) => [b.start, b.end]), [[1140, 1200]]);
  });

  test('a block\'s preset is chosen in its popover', () => {
    const { card } = editing();
    layerBar(card, 'occupied').querySelector('.lblock').click();
    $(card, '.editor [data-act="layer-preset"][data-preset="boost"]').click();
    assert.equal(card._layerBlocks('climate.salon', 'occupied', 0)[0].preset, 'boost');
  });

  test('dragging a block\'s end stops at the next block, it never pushes it', () => {
    const { card } = editing();
    mouse(geometry(layerBar(card, 'occupied')), 'dblclick', 19 * 60);
    const bar = geometry(layerBar(card, 'occupied'));
    const end = bar.querySelector('.lhandle[data-idx="0"][data-edge="end"]');
    mouse(end, 'pointerdown', 17 * 60);
    mouse(end, 'pointermove', 21 * 60);
    mouse(end, 'pointerup', 21 * 60);
    assert.deepEqual(card._layerBlocks('climate.salon', 'occupied', 0).map((b) => [b.start, b.end]), [[540, 1140], [1140, 1200]]);
  });

  test('a layer the thermostat has no week in starts empty, and its first block adds it', async () => {
    const data = withLayers();
    delete data.layer_weeks['climate.salon'].sun;
    const { hass, card } = editing(data);
    mouse(geometry(layerBar(card, 'sun')), 'dblclick', 0);
    $(card, '[data-act="save"]').click();
    await flush();
    const week = saved(hass)[0].layer_weeks['climate.salon'].sun;
    assert.deepEqual(week[0], [['00:00', 'comfort'], ['01:00', null]]);
    assert.deepEqual(week[5], [['00:00', null]]);
  });
});

describe('grouped days with layers', () => {
  test('days whose layers differ are not on one row', () => {
    const data = withLayers();
    data.layer_weeks['climate.salon'].occupied[2] = [['00:00', null]];
    const card = createCard(fakeHass({ data }), { show: ['climate.salon'] });
    assert.ok($(card, '.bar[data-climate="climate.salon"][data-day="2"]'));
  });
});
