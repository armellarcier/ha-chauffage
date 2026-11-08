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
    assert.deepEqual($$(card, '.layer-sub .lname').map((el) => el.firstChild.textContent.trim()), ['Soleil', 'Salon occupé']);
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

  test('the chevron opens and closes the row, and so does the row menu', () => {
    const card = createCard(fakeHass({ data: withLayers() }), { show: ['climate.salon'] });
    const chevron = () => $(card, '[data-act="toggle-row"][data-climate="climate.salon"][data-day="0"]');
    assert.equal(chevron().getAttribute('aria-expanded'), 'false');
    chevron().click();
    assert.ok(layerBar(card, 'occupied'));
    assert.equal(chevron().getAttribute('aria-expanded'), 'true');
    chevron().click();
    assert.equal(layerBar(card, 'occupied'), null);
    assert.ok(salonBar(card).classList.contains('locked'));
    $(card, '[data-act="menu"][data-day="0"]').click();
    $(card, '[data-act="edit-row"]').click();
    assert.ok(layerBar(card, 'occupied'));
  });

  test('edits of an open row wait for Save, as every edit of the card', () => {
    const { hass, card } = editing();
    mouse(geometry(layerBar(card, 'occupied')), 'dblclick', 19 * 60);
    $(card, '[data-act="toggle-row"][data-day="0"]').click();
    assert.equal(saved(hass).length, 0);
    assert.ok($(card, '.savebar'));
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

describe('which layers an open row shows', () => {
  const allChip = (card) => $(card, '[data-act="layers-all"]');
  const names = (card) => $$(card, '.layer-sub .lname').map((el) => el.firstChild.textContent.trim());

  test('all of them at first, and only those that apply now once "All layers" is off', () => {
    const { card } = editing();
    assert.deepEqual(names(card), ['Soleil', 'Salon occupé']);
    assert.ok(allChip(card).classList.contains('on'));
    allChip(card).click();
    assert.deepEqual(names(card), ['Salon occupé']);
    allChip(card).click();
    assert.deepEqual(names(card), ['Soleil', 'Salon occupé']);
  });

  test('disabled layers are among all of them', () => {
    const data = withLayers();
    data.schedules[0].layers = [{ ...SUN, enabled: false }, OCCUPIED];
    const { card } = editing(data);
    assert.deepEqual(names(card), ['Soleil', 'Salon occupé']);
    allChip(card).click();
    assert.deepEqual(names(card), ['Salon occupé']);
  });

  test('the choice only shows while a row is open', () => {
    const card = createCard(fakeHass({ data: withLayers() }), { show: ['climate.salon'] });
    assert.equal(allChip(card), null);
    salonBar(card).querySelector('.seg').click();
    assert.ok(allChip(card));
  });

  test('the choice is kept on this device', () => {
    const { card } = editing();
    allChip(card).click();
    const { card: again } = editing();
    assert.deepEqual(names(again), ['Salon occupé']);
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

// ---------- managing the layers, under each schedule of the panel's Schedules page ----------

describe('the layers of each schedule, on the Schedules page', () => {
  const page = (data = withLayers()) => {
    const hass = fakeHass({ data });
    return { hass, card: createCard(hass, { view: 'schedules' }) };
  };
  const row = (card, layer) => $(card, `.layer-row[data-layer="${layer}"]`);
  const act = (card, name, layer) => $(card, `[data-act="${name}"]${layer ? `[data-layer="${layer}"]` : ''}`).click();
  const sent = (hass) => hass.events.filter((m) => m.type === 'chauffage/layers/set');
  const type = (card, selector, value) => {
    const field = $(card, selector);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  };
  const SENT_SUN = { id: 'sun', name: 'Soleil', enabled: true, condition: null };
  const SENT_OCCUPIED = { id: 'occupied', name: 'Salon occupé', enabled: true, condition: OCCUPIED.condition };

  test('lists a schedule\'s layers under it, top first, and says which apply now', () => {
    const { card } = page();
    assert.deepEqual($$(card, '.layer-row[data-schedule="normal"] .layer-name').map((el) => el.textContent), ['Soleil', 'Salon occupé']);
    assert.ok(row(card, 'occupied').querySelector('.rule-state.true'));
    assert.ok(!row(card, 'sun').querySelector('.rule-state.true'));
  });

  test('a disabled layer is struck, and a layer of another schedule says nothing about now', () => {
    const data = withLayers({ schedule: 'Absent' });
    data.schedules[0].layers = [{ ...SUN, enabled: false }, OCCUPIED];
    const { card } = page(data);
    assert.ok(row(card, 'sun').classList.contains('off'));
    assert.equal(row(card, 'occupied').querySelector('.rule-state'), null);
  });

  test('adds a layer to a schedule, on top, with a name and a condition', async () => {
    const { hass, card } = page();
    $(card, '[data-act="layerlist-add"][data-schedule="normal"]').click();
    type(card, 'input[data-layer-name]', ' Invités ');
    type(card, 'textarea[data-layer-condition]', "{{ is_state('input_boolean.guests', 'on') }}");
    act(card, 'layerlist-save');
    await flush();
    assert.deepEqual(sent(hass), [{ type: 'chauffage/layers/set', schedule: 'normal', layers: [
      { name: 'Invités', enabled: true, condition: "{{ is_state('input_boolean.guests', 'on') }}" }, SENT_SUN, SENT_OCCUPIED] }]);
  });

  test('a layer needs a name, and without a condition it applies while enabled', async () => {
    const { hass, card } = page();
    act(card, 'layerlist-add');
    assert.ok($(card, '[data-act="layerlist-save"]').disabled);
    type(card, 'input[data-layer-name]', 'Invités');
    assert.ok(!$(card, '[data-act="layerlist-save"]').disabled);
    act(card, 'layerlist-save');
    await flush();
    assert.equal(sent(hass)[0].layers[0].condition, null);
  });

  test('edits a layer\'s name and condition', async () => {
    const { hass, card } = page();
    act(card, 'layerlist-edit', 'sun');
    assert.equal($(card, 'input[data-layer-name]').value, 'Soleil');
    type(card, 'input[data-layer-name]', 'Plein soleil');
    act(card, 'layerlist-save');
    await flush();
    assert.deepEqual(sent(hass)[0].layers, [{ ...SENT_SUN, name: 'Plein soleil' }, SENT_OCCUPIED]);
    assert.equal($(card, 'input[data-layer-name]'), null);
  });

  test('a switch enables and disables a layer at once, and says which it is', async () => {
    const { hass, card } = page();
    assert.equal($(card, '[data-act="layerlist-toggle"][data-layer="sun"]').getAttribute('aria-checked'), 'true');
    act(card, 'layerlist-toggle', 'sun');
    await flush();
    assert.deepEqual(sent(hass)[0].layers, [{ ...SENT_SUN, enabled: false }, SENT_OCCUPIED]);
  });

  test('a tap on a layer opens it', () => {
    const { card } = page();
    row(card, 'sun').querySelector('.layer-text').click();
    assert.equal($(card, 'input[data-layer-name]').value, 'Soleil');
  });

  describe('its order', () => {
    // Each row 40 px high, the first from y = 0
    const place = (card) => $$(card, '.layer-row[data-schedule="normal"]').forEach((el, i) => {
      el.getBoundingClientRect = () => ({ top: i * 40, bottom: (i + 1) * 40, height: 40, left: 0, right: 500, width: 500 });
    });
    const at = (el, type, clientY) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientY }));
    const grip = (card, layer) => row(card, layer).querySelector('.layer-grip');

    test('dragging a layer by its handle moves it, once dropped', async () => {
      const { hass, card } = page();
      place(card);
      at(grip(card, 'sun'), 'pointerdown', 20);
      at(grip(card, 'sun'), 'pointermove', 70);
      assert.equal(sent(hass).length, 0);
      at(grip(card, 'sun'), 'pointerup', 70);
      await flush();
      assert.deepEqual(sent(hass)[0].layers, [SENT_OCCUPIED, SENT_SUN]);
    });

    test('dropped where it was, nothing is sent', async () => {
      const { hass, card } = page();
      place(card);
      at(grip(card, 'sun'), 'pointerdown', 20);
      at(grip(card, 'sun'), 'pointermove', 25);
      at(grip(card, 'sun'), 'pointerup', 25);
      await flush();
      assert.equal(sent(hass).length, 0);
    });

    test('new data while dragging does not take the row away', () => {
      const data = withLayers();
      const hass = fakeHass({ data });
      const card = createCard(hass, { view: 'schedules' });
      place(card);
      const dragged = grip(card, 'sun');
      at(dragged, 'pointerdown', 20);
      hass.push({ ...withLayers({ applying: [] }), revision: 9 });
      assert.ok(dragged.isConnected);
      at(dragged, 'pointerup', 20);
      assert.ok(!row(card, 'occupied').querySelector('.rule-state.true'));
    });

    test('the arrow keys move a layer too', async () => {
      const { hass, card } = page();
      grip(card, 'sun').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));
      await flush();
      assert.deepEqual(sent(hass)[0].layers, [SENT_OCCUPIED, SENT_SUN]);
    });

    test('the top layer does not move further up', async () => {
      const { hass, card } = page();
      grip(card, 'sun').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
      await flush();
      assert.equal(sent(hass).length, 0);
    });
  });

  test('deleting a layer asks first, as its blocks go with it', async () => {
    const { hass, card } = page();
    act(card, 'layerlist-edit', 'sun');
    act(card, 'layerlist-remove');
    assert.equal(sent(hass).length, 0);
    act(card, 'layerlist-remove-confirm');
    await flush();
    assert.deepEqual(sent(hass)[0].layers, [SENT_OCCUPIED]);
  });

  test('a condition is tried while it is typed', async () => {
    const { hass, card } = page();
    card._previewDelay = 0;
    act(card, 'layerlist-edit', 'sun');
    type(card, 'textarea[data-layer-condition]', '{{ true }}');
    await flush();
    const preview = hass.previews.at(-1);
    assert.deepEqual(preview.msg.rules, [{ template: '{{ true }}', schedule: 'normal' }]);
    preview.send({ results: [true], texts: ['True'], errors: [null] });
    assert.ok($(card, '.layer-form .rule-state.true'));
    assert.equal($(card, 'textarea[data-layer-condition]').value, '{{ true }}');
  });

  test('a refused layer says why, and stays open', async () => {
    const hass = fakeHass({ data: withLayers(), reply: (msg) => {
      if (msg.type === 'chauffage/layers/set') throw new Error('invalid template');
      return null;
    } });
    const card = createCard(hass, { view: 'schedules' });
    act(card, 'layerlist-edit', 'sun');
    act(card, 'layerlist-save');
    await flush();
    assert.match($(card, '.msg').textContent, /invalid template/);
    assert.ok($(card, 'input[data-layer-name]'));
  });

  test('users who are not admins only read the layers', () => {
    const hass = fakeHass({ data: withLayers() });
    hass.user = { is_admin: false };
    const card = createCard(hass, { view: 'schedules' });
    assert.ok(row(card, 'sun'));
    assert.equal($(card, '[data-act^="layerlist-"]'), null);
  });
});
