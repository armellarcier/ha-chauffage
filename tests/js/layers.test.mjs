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

  test('each layer that applies draws its own blocks, the top one last, in front', () => {
    const card = createCard(fakeHass({ data: withLayers({ applying: ['sun', 'occupied'] }) }));
    assert.deepEqual(blocks(card), [
      ['37.5%', '33.333%', 'comfort', 'occupied'],
      ['50%', '8.333%', 'eco', 'sun'],
    ]);
  });

  const lanes = (card) => $$(card, '.bar[data-climate="climate.salon"][data-day="0"] .layer-block').map((el) => [el.dataset.layer, el.dataset.lane]);
  const depth = (card) => card.shadowRoot.querySelector('.bar[data-climate="climate.salon"][data-day="0"]').style.getPropertyValue('--count');

  test('blocks that collide take separate lanes, the one that wins at the bottom', () => {
    const card = createCard(fakeHass({ data: withLayers({ applying: ['sun', 'occupied'] }) }));
    assert.deepEqual(lanes(card), [['occupied', '1'], ['sun', '0']]);
    assert.equal(depth(card), '2');
  });

  test('blocks that do not collide share a lane, so the day stays slim', () => {
    const data = withLayers({ applying: ['sun', 'occupied'] });
    data.layer_weeks['climate.salon'].occupied = Array(7).fill([['00:00', null], ['15:00', 'comfort'], ['17:00', null]]);
    const card = createCard(fakeHass({ data }));
    assert.deepEqual(lanes(card), [['occupied', '0'], ['sun', '0']]);
    assert.equal(depth(card), '1');
  });

  test('every block sits on the bottom of its day, those that lose a collision taller behind the winner', () => {
    const card = createCard(fakeHass({ data: withLayers() }));
    const css = card.shadowRoot.querySelector('style').textContent;
    assert.match(css, /\.bar \{ min-height:calc\(var\(--count, 0\) \* 5px \+ 17px\)/);
    assert.match(css, /\.layer-block \{[^}]*bottom:0;[^}]*height:calc\(14px \+ var\(--lane\) \* 5px\)/);
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
    // The lowest row wins: each row overrides the rows above it
    assert.deepEqual($$(card, '.layer-sub .lname').map((el) => el.firstChild.textContent.trim()), ['Salon occupé', 'Soleil']);
    assert.ok(layerBar(card, 'occupied'));
    assert.equal(salonBar(card).querySelectorAll('.layer-block').length, 0); // the schedule's own row shows only the schedule
  });

  test('a layer that does not apply now is grey, a disabled one struck', () => {
    const data = withLayers({ applying: ['occupied'] });
    data.schedules[0].layers = [{ ...SUN, enabled: false }, OCCUPIED];
    const { card } = editing(data);
    const names = $$(card, '.layer-sub .lname');
    assert.ok(names[1].classList.contains('off'));
    assert.ok(!names[0].classList.contains('off') && !names[0].classList.contains('idle'));
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

describe('a layer\'s blocks behave as the slots of the schedule', () => {
  const popover = (card) => $(card, '.editor');
  const select = (card) => layerBar(card, 'occupied').querySelector('.lblock').click();

  test('its handles follow the pointer while it is dragged', () => {
    const { card } = editing();
    const bar = geometry(layerBar(card, 'occupied'));
    const end = bar.querySelector('.lhandle[data-idx="0"][data-edge="end"]');
    mouse(end, 'pointerdown', 17 * 60);
    mouse(end, 'pointermove', 18 * 60);
    assert.equal(end.style.left, '75%');
    assert.equal(end.querySelector('.tip').textContent, '18:00');
    assert.equal(bar.querySelector('.lblock').style.width, '37.5%');
    mouse(end, 'pointerup', 18 * 60);
  });

  test('new data while a handle is dragged leaves the handle and the edit alone', () => {
    const data = withLayers();
    const hass = fakeHass({ data });
    const card = createCard(hass, { show: ['climate.salon'] });
    salonBar(card).querySelector('.seg').click();
    const end = geometry(layerBar(card, 'occupied')).querySelector('.lhandle[data-idx="0"][data-edge="end"]');
    mouse(end, 'pointerdown', 17 * 60);
    mouse(end, 'pointermove', 18 * 60);
    hass.push({ ...withLayers(), revision: 9 });
    assert.ok(end.isConnected);
    mouse(end, 'pointerup', 18 * 60);
    assert.equal(card._layerBlocks('climate.salon', 'occupied', 0)[0].end, 18 * 60);
  });

  describe('the line of the current time', () => {
    // The row of today (the only one drawing the line), opened
    const openToday = (hass) => {
      const card = createCard(hass, { show: ['climate.salon'] });
      const today = $(card, '.bar[data-climate="climate.salon"] .now').parentElement;
      today.querySelector('.seg').click();
      return card;
    };

    test('goes through the layers of an open row', () => {
      const card = openToday(fakeHass({ data: withLayers() }));
      assert.equal(card.shadowRoot.querySelectorAll('.lbar').length, 2);
      assert.equal(card.shadowRoot.querySelectorAll('.lbar .now').length, 2);
    });

    test('is not drawn for a paused thermostat', () => {
      const data = withLayers();
      data.thermostats['climate.salon'].paused = true;
      const card = createCard(fakeHass({ data }), { show: ['climate.salon'] });
      card.shadowRoot.querySelector('.bar[data-climate="climate.salon"] .seg').click();
      assert.equal(card.shadowRoot.querySelectorAll('.lbar .now').length, 0);
    });

    test('runs from the first row to the last, its ends only at the ends of the whole day', () => {
      const css = openToday(fakeHass({ data: withLayers() })).shadowRoot.querySelector('style').textContent;
      assert.match(css, /\.opened > \.sub \.now \{ top:-10px; bottom:-10px; \}/);
      assert.match(css, /\.subs > \.opened > \.sub \.now::before, \.subs > \.opened > \.sub \.now::after \{ content:none; \}/);
      assert.match(css, /\.subs > \.opened:first-child > \.sub:first-child \.now \{ top:-3px; \}/);
      assert.match(css, /\.subs > \.opened:last-child > \.sub:last-child \.now \{ bottom:-3px; \}/);
    });
  });

  test('a click elsewhere closes its popover', () => {
    const { card } = editing();
    select(card);
    assert.ok(popover(card));
    $(card, '.day').click();
    assert.equal(popover(card), null);
  });

  test('Escape and a press outside the card close its popover', () => {
    const { card } = editing();
    select(card);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(popover(card), null);
    select(card);
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, composed: true }));
    assert.equal(popover(card), null);
  });

  test('a click on a slot of the schedule shows that slot instead, and the other way round', () => {
    const { card } = editing();
    select(card);
    salonBar(card).querySelector('.seg[data-idx="1"]').click();
    assert.ok(popover(card).querySelector('[data-act="insert"]'));
    select(card);
    assert.ok(popover(card).querySelector('[data-act="layer-delete"]'));
  });

  test('its tooltip names its layer, in an open row and over the day', () => {
    const { card } = editing();
    assert.match(layerBar(card, 'occupied').querySelector('.lblock').title, /Salon occupé/);
    const css = card.shadowRoot.querySelector('style').textContent;
    assert.doesNotMatch(css.match(/\.layer-block \{[^}]*\}/)[0], /pointer-events:none/);
  });

  test('the title of a layer in an open row shows its condition in its tooltip', () => {
    const { card } = editing();
    const names = $$(card, '.layer-sub .lname');
    assert.match(names[0].title, /is_state/);
    assert.equal(names[1].title, 'Soleil'); // no condition
  });

  test('an override stays above the layer blocks, however many are stacked', () => {
    const card = createCard(fakeHass({ data: withLayers() }));
    const css = card.shadowRoot.querySelector('style').textContent;
    assert.doesNotMatch(css.match(/\.layer-block \{[^}]*\}/)[0], /z-index/);
  });

  test('a click on a layer block over the day opens the row', () => {
    const card = createCard(fakeHass({ data: withLayers() }), { show: ['climate.salon'] });
    salonBar(card).querySelector('.layer-block').click();
    assert.ok(layerBar(card, 'occupied'));
  });

  test('edits not saved yet show once the row is closed', () => {
    const { card } = editing();
    mouse(geometry(layerBar(card, 'occupied')), 'dblclick', 19 * 60);
    $(card, '[data-act="toggle-row"][data-day="0"]').click();
    assert.deepEqual(blocks(card).at(-1), ['79.167%', '4.167%', 'comfort', 'occupied']);
  });
});

describe('many layers stacked', () => {
  const stacked = (n) => {
    const data = withLayers();
    const ids = Array.from({ length: n }, (_, i) => `l${i}`);
    data.schedules[0].layers = ids.map((id) => ({ id, name: id, enabled: true, condition: null }));
    data.layer_weeks['climate.salon'] = Object.fromEntries(ids.map((id) => [id, Array(7).fill(OCCUPIED_DAY)]));
    data.layers_applying = ids;
    return data;
  };
  const bar = (n) => salonBar(createCard(fakeHass({ data: stacked(n) }), { show: ['climate.salon'] }));

  test('the day knows how many it holds, to make room for them', () => assert.equal(bar(6).style.getPropertyValue('--count'), '6'));
  test('they do not move the next row by themselves', () => assert.equal(bar(6).closest('.sub').style.paddingBottom, ''));
  test('a day with none is left as it is', () => assert.equal(bar(0).getAttribute('style'), null));
});

describe('showing the active layers or all of them, on the stacked rows', () => {
  const allChip = (card) => $(card, '[data-act="layers-all"]');
  const shown = (card) => $$(card, '.bar[data-climate="climate.salon"][data-day="0"] .layer-block')
    .map((el) => [el.dataset.layer, el.className.replace('layer-block', '').trim()]);
  const open = (data = withLayers()) => createCard(fakeHass({ data }), { show: ['climate.salon'] });

  test('only the layers that apply now, at first', () => {
    const card = open();
    assert.ok(!allChip(card).classList.contains('on'));
    assert.deepEqual(shown(card), [['occupied', '']]);
  });

  test('all of them once asked, those that do not apply dimmed', () => {
    const card = open();
    allChip(card).click();
    assert.ok(allChip(card).classList.contains('on'));
    assert.deepEqual(shown(card), [['occupied', ''], ['sun', 'idle']]);
  });

  test('disabled layers are among all of them, marked', () => {
    const data = withLayers();
    data.schedules[0].layers = [{ ...SUN, enabled: false }, OCCUPIED];
    const card = open(data);
    allChip(card).click();
    assert.deepEqual(shown(card), [['occupied', ''], ['sun', 'off']]);
  });

  test('in the tab of a schedule that is not active, all of them are dimmed', () => {
    const card = open(withLayers({ schedule: 'Absent' }));
    card.shadowRoot.querySelector('.tab[data-schedule="normal"]').click();
    assert.deepEqual(shown(card), []);
    allChip(card).click();
    assert.deepEqual(shown(card), [['occupied', 'idle'], ['sun', 'idle']]);
  });

  test('an open row lists every layer, whatever is chosen', () => {
    const { card } = editing();
    const names = () => $$(card, '.layer-sub .lname').map((el) => el.firstChild.textContent.trim());
    assert.deepEqual(names(), ['Salon occupé', 'Soleil']);
    allChip(card).click();
    assert.deepEqual(names(), ['Salon occupé', 'Soleil']);
  });

  test('the choice shows for a schedule with layers, and is kept on this device', () => {
    assert.equal(allChip(createCard(fakeHass(), { show: ['climate.salon'] })), null);
    const card = open();
    allChip(card).click();
    assert.ok(allChip(open()).classList.contains('on'));
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

  test('lists a schedule\'s layers under it, the one that wins last, and says which apply now', () => {
    const { card } = page();
    assert.deepEqual($$(card, '.layer-row[data-schedule="normal"] .layer-name').map((el) => el.textContent), ['Salon occupé', 'Soleil']);
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
      at(grip(card, 'sun'), 'pointerdown', 60);
      at(grip(card, 'sun'), 'pointermove', 10);
      assert.equal(sent(hass).length, 0);
      at(grip(card, 'sun'), 'pointerup', 10);
      await flush();
      assert.deepEqual(sent(hass)[0].layers, [SENT_OCCUPIED, SENT_SUN]);
    });

    test('dropped where it was, nothing is sent', async () => {
      const { hass, card } = page();
      place(card);
      at(grip(card, 'sun'), 'pointerdown', 60);
      at(grip(card, 'sun'), 'pointermove', 65);
      at(grip(card, 'sun'), 'pointerup', 65);
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
      grip(card, 'sun').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
      await flush();
      assert.deepEqual(sent(hass)[0].layers, [SENT_OCCUPIED, SENT_SUN]);
    });

    test('the last row does not move further down', async () => {
      const { hass, card } = page();
      grip(card, 'sun').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));
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
    assert.match($(card, '.layer-form .rule-result.error').textContent, /invalid template/);
    assert.ok($(card, 'input[data-layer-name]'));
  });

  test('a name another layer of the schedule has is refused in the form, before saving', () => {
    const { card } = page();
    act(card, 'layerlist-add');
    type(card, 'input[data-layer-name]', ' soleil ');
    assert.ok($(card, '.layer-form .rule-result.error'));
    assert.ok($(card, '[data-act="layerlist-save"]').disabled);
    type(card, 'input[data-layer-name]', 'Soleil du soir');
    assert.equal($(card, '.layer-form .rule-result.error'), null);
    assert.ok(!$(card, '[data-act="layerlist-save"]').disabled);
  });

  test('a layer keeps its own name when edited, and another schedule may use the name', () => {
    const { card } = page();
    act(card, 'layerlist-edit', 'sun');
    assert.equal($(card, '.layer-form .rule-result.error'), null);
    act(card, 'layerlist-cancel');
    $(card, '[data-act="layerlist-add"][data-schedule="away"]').click();
    type(card, 'input[data-layer-name]', 'Soleil');
    assert.equal($(card, '.layer-form .rule-result.error'), null);
  });

  test('users who are not admins only read the layers', () => {
    const hass = fakeHass({ data: withLayers() });
    hass.user = { is_admin: false };
    const card = createCard(hass, { view: 'schedules' });
    assert.ok(row(card, 'sun'));
    assert.equal($(card, '[data-act^="layerlist-"]'), null);
  });
});
