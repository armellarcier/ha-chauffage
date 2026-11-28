// The setting Control the HVAC mode (#159): on by default. Off, for the house or a thermostat, the
// card offers no HVAC mode for its slots and its overrides. Turning it off shows the slots that
// change first, and the user turns it off or cancels.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKEND, cleanup, createView, fakeDialogManager, fakeHass, integrationData } from './helpers.mjs';
import { $, $$, act, applyCell, click, control, copyDay, day, drawn, openMenu, openOverride, pasteDay, rgb, settle, text } from './driver.mjs';
import * as heaterAndAtelier from './houses/heater-and-atelier.mjs';

afterEach(() => cleanup());

const { AC_MODES, OWN, SUMMER, cardOf, chips, lastCall, select, setup } = heaterAndAtelier;
// The calls of the setting, without the panel's other calls (its dashboards)
const hvacCalls = (hass) => hass.events.filter((m) => m.type === 'chauffage/hvac_mode_control/set');
const ATELIER = 'climate.atelier';
const SALON = 'climate.salon';
// The thermostats whose HVAC mode Chauffage does not control
const without = (...climates) => Object.fromEntries(climates.map((c) => [c, { paused: false, revision: 7, hvac_mode_control: false }]));

describe('without control of the HVAC mode, the card offers none', () => {
  test('the slot popover of an air conditioner has no row of HVAC modes, and no Éteint', async () => {
    const card = await cardOf(setup({ thermostats: without(ATELIER) }), { show: [ATELIER] });
    await select(card, ATELIER, 0, 1); // 14:00 comfort
    assert.equal($(card, '.editor .mode-row'), null);
    assert.deepEqual(chips(card, '.editor'), ['Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
  });

  test('the slot popover of a heater has no Éteint', async () => {
    const card = await cardOf(setup({ thermostats: without(SALON) }), { show: [SALON] });
    await select(card, SALON, 0, 1); // 06:30 comfort
    assert.deepEqual(chips(card, '.editor'), ['Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
  });

  test('a thermostat that says on keeps its HVAC modes when the house says off', async () => {
    const hass = setup({ thermostats: { [ATELIER]: { paused: false, revision: 7, hvac_mode_control: true } } });
    hass.data.hvac_mode_control = false;
    const card = await cardOf(hass, { show: [ATELIER, SALON] });
    await select(card, ATELIER, 0, 1); // 14:00 comfort
    assert.ok($(card, '.editor .mode-row'));
    await select(card, SALON, 0, 1); // follows the house
    assert.ok(!chips(card, '.editor').includes('Éteint'));
  });

  test('a preset tapped in the slot popover sets no HVAC mode, even on a slot that had one', async () => {
    const card = await cardOf(setup({ thermostats: without(ATELIER), atelier: SUMMER }), { show: [ATELIER] });
    await select(card, ATELIER, 0, 1); // 14:00 comfort, in cool
    click(card, '.editor [data-act="preset"][data-preset="eco"]');
    await settle();
    assert.equal(day(card, ATELIER, 0)[1], '14:00 eco');
  });

  describe('the override block', () => {
    beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
    afterEach(() => mock.timers.reset());

    test('has no row of HVAC modes and no Éteint, and an override says no HVAC mode', async () => {
      const hass = setup({ thermostats: without(ATELIER), planned: { [ATELIER]: { preset: 'comfort', hvac_mode: null } } });
      const card = await cardOf(hass);
      await openOverride(card, ATELIER);
      assert.equal($(card, '.override-ed .mode-row'), null);
      assert.ok(!chips(card, '.override-ed').includes('Éteint'));
      click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]');
      await settle();
      assert.deepEqual(lastCall(hass).override.target, OWN('boost'));
    });

    test('a new override does not say when Éteint would end: there is no Éteint', async () => {
      const hass = setup({ thermostats: without(SALON), planned: { [SALON]: { preset: 'eco', hvac_mode: null, next_slot_end: '2026-10-12T17:30:00+02:00' } } });
      const card = await cardOf(hass);
      await openOverride(card, SALON);
      assert.doesNotMatch(text($(card, '.override-ed .end-new')), /Éteint/);
    });

    test('offers the presets of the HVAC mode the thermostat shows: in cool, not Hors-gel', async () => {
      const hass = setup({ thermostats: without(ATELIER) });
      hass.states[ATELIER].state = 'cool';
      const card = await cardOf(hass);
      await openOverride(card, ATELIER);
      assert.deepEqual(chips(card, '.override-ed'), ['Éco', 'Confort', 'Boost']);
    });
  });

  test('a day pasted loses its off slot and its HVAC modes, as an edited slot does', async () => {
    const card = await cardOf(setup({ thermostats: without(ATELIER),
      weeks: { [SALON]: { Normal: Array(7).fill(['00:00 eco', ['06:30', 'comfort', { hvac_mode: 'heat' }], ['21:00', null, { hvac_mode: 'off' }]]) },
        [ATELIER]: { Normal: Array(5).fill(['00:00 eco']).concat([WEEKEND, WEEKEND]) } } }));
    await copyDay(card, SALON, 0);
    await pasteDay(card, ATELIER, 0);
    assert.deepEqual(day(card, ATELIER, 0), ['00:00 eco', '06:30 comfort']);
    assert.match(text($(card, '.msg')), /Éteint/);
  });

  test('the week menu has no All heat and All cool', async () => {
    const card = await cardOf(setup({ thermostats: without(ATELIER) }), { show: [ATELIER] });
    openMenu(card, ATELIER, 0);
    await settle();
    assert.equal(control(card, 'week-hvac', { climate: ATELIER, mode: 'heat' }), null);
    assert.equal(control(card, 'week-hvac', { climate: ATELIER, mode: 'cool' }), null);
  });
});

describe('the setting in the settings dialog, for the house', () => {
  const settings = async (hass) => {
    const el = document.createElement('chauffage-settings-dialog');
    document.body.appendChild(el);
    el.hass = hass;
    el.showDialog({});
    await settle();
    return el;
  };
  const CHANGES = [
    { entity_id: ATELIER, schedule: 'normal', day: 0, start: '23:00', preset: null, hvac_mode: 'off', change: 'removed' },
    { entity_id: ATELIER, schedule: 'normal', day: 1, start: '23:00', preset: null, hvac_mode: 'off', change: 'removed' },
    { entity_id: ATELIER, schedule: 'normal', day: 0, start: '14:00', preset: 'comfort', hvac_mode: 'cool', change: 'hvac_mode_removed' },
  ];
  const answering = (changes) => (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? { changes } : null);
  const choose = async (el, value) => {
    const radio = $$(el, '[data-hvac-control]').find((r) => r.value === value);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await settle();
  };
  const house = (reply) => {
    const data = integrationData();
    const hass = fakeHass({ data, reply });
    hass.states[ATELIER] = { state: 'heat', attributes: { friendly_name: 'Atelier', hvac_modes: AC_MODES }, last_updated: '1' };
    return hass;
  };

  test('a heading, two choices, on by default, and one line that says what off means', async () => {
    const el = await settings(house());
    assert.equal(text($(el, '.hvac-settings h3')), 'Contrôler le mode HVAC');
    assert.deepEqual($$(el, '.hvac-settings .choice').map(text), ['Activé (par défaut)', 'Désactivé']);
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'on');
    assert.equal(text($(el, '.hvac-settings .note')),
      "Désactivé : Chauffage n'allume ni n'éteint jamais un thermostat, et ne le fait jamais passer du chauffage à la clim.");
  });

  test('turning it off lists the slots that change first, and Désactiver saves it', async () => {
    const hass = house(answering(CHANGES));
    const el = await settings(hass);
    await choose(el, 'off');
    assert.deepEqual(hvacCalls(hass).map((m) => [m.value, !!m.preview]), [[false, true]], 'nothing changed yet');
    assert.equal(text($(el, '.hvac-ask-title')), 'Ces créneaux changent :');
    assert.deepEqual($$(el, '.hvac-changes > li').map((li) => text(li.querySelector('strong'))), ['Atelier']);
    assert.deepEqual($$(el, '.hvac-changes li li').map(text), [
      'Lun · 14:00 · Confort, Clim → Confort',
      'Lun, Mar · 23:00 · Éteint → supprimé',
    ]);
    assert.ok($$(el, '[data-hvac-control]').every((r) => r.disabled), 'the choice waits for the answer');
    click(el, '[data-hvac-confirm]');
    await settle();
    await settle();
    assert.deepEqual(hvacCalls(hass).at(-1), { type: 'chauffage/hvac_mode_control/set', value: false });
    assert.equal($(el, '.hvac-ask'), null);
  });

  test('Annuler changes nothing', async () => {
    const hass = house(answering(CHANGES));
    const el = await settings(hass);
    await choose(el, 'off');
    click(el, '[data-hvac-cancel]');
    await settle();
    assert.equal(hvacCalls(hass).length, 1);
    assert.equal($(el, '.hvac-ask'), null);
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'on');
  });

  test('with no slot to change, the choice is saved at once', async () => {
    const hass = house(answering([]));
    const el = await settings(hass);
    await choose(el, 'off');
    assert.deepEqual(hvacCalls(hass).map((m) => [m.value, !!m.preview]), [[false, true], [false, false]]);
    assert.equal($(el, '.hvac-ask'), null);
  });

  test('turned off, the house says it', async () => {
    const data = { ...integrationData(), hvac_mode_control: false };
    const el = await settings(fakeHass({ data }));
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'off');
  });
});

describe('the setting of one thermostat, behind the ⚙ of its page in the panel', () => {
  beforeEach(() => {
    window.loadCardHelpers = async () => ({ createCardElement: (config) => Object.assign(document.createElement('div'), { config }) });
  });
  afterEach(() => { delete window.loadCardHelpers; window.history.replaceState(null, '', '/'); });
  const panel = async (hass, path) => {
    hass.panels = { chauffage: { url_path: 'chauffage', title: 'Chauffage' } };
    window.history.replaceState(null, '', `/chauffage${path}`);
    const el = document.createElement('chauffage-panel');
    document.body.appendChild(el);
    el.hass = hass;
    el.panel = hass.panels.chauffage;
    el.route = { prefix: '/chauffage', path };
    await drawn(el);
    await settle();
    return el;
  };
  // The dialog, opened as the ⚙ of the thermostat's page opens it
  const dialog = async (hass, climate = SALON) => {
    const el = document.createElement('chauffage-settings-dialog');
    document.body.appendChild(el);
    el.hass = hass;
    el.showDialog({ thermostat: climate });
    await settle();
    return el;
  };
  const choose = async (el, value) => {
    const radio = $$(el, '[data-hvac-control]').find((r) => r.value === value);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await settle();
  };
  const checked = (el) => $$(el, '[data-hvac-control]').find((r) => r.checked).value;

  test('the page has no menu of its own: a ⚙ in its toolbar opens the thermostat\'s settings', async () => {
    const hass = fakeHass();
    const manager = fakeDialogManager(hass);
    const el = await panel(hass, '/thermostats/climate.salon');
    assert.equal($(el, '.head [data-hvac-control]'), null);
    const gear = $(el, '.toolbar [data-thermostat-settings]');
    assert.equal(gear.getAttribute('aria-label'), 'Réglages');
    gear.click();
    await settle();
    assert.deepEqual(manager.shown.map((d) => [d.dialogTag, d.dialogParams.thermostat]), [['chauffage-settings-dialog', SALON]]);
  });

  test('the dialog holds this thermostat\'s setting alone: as the house, on or off; as the house by default', async () => {
    const el = await dialog(fakeHass());
    assert.equal($(el, '.override-settings'), null);
    assert.equal(text($(el, '.hvac-settings h3')), 'Contrôler le mode HVAC');
    assert.deepEqual($$(el, '.hvac-settings .choice').map(text), ['Comme la maison (activé)', 'Activé', 'Désactivé']);
    assert.equal(checked(el), 'house');
  });

  test('a thermostat that says off, in a house that says on', async () => {
    const data = integrationData();
    data.thermostats[SALON].hvac_mode_control = false;
    data.hvac_mode_control = true;
    assert.equal(checked(await dialog(fakeHass({ data }))), 'off');
  });

  const OFF_SLOT_REMOVED = [{ entity_id: SALON, schedule: 'normal', day: 0, start: '22:30', preset: null, hvac_mode: 'off', change: 'removed' }];

  test('a question left unanswered is gone when the dialog opens again', async () => {
    const hass = fakeHass({ reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? { changes: OFF_SLOT_REMOVED } : null) });
    const el = await dialog(hass);
    await choose(el, 'off');
    el.closeDialog();
    el.showDialog({ thermostat: SALON });
    await settle();
    assert.equal($(el, '.hvac-ask'), null);
    assert.equal(checked(el), 'house');
  });

  test('a late answer for a thermostat does not reach the dialog opened again for the house', async () => {
    let answer;
    const hass = fakeHass({ reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set'
      ? new Promise((resolve) => { answer = () => resolve({ changes: OFF_SLOT_REMOVED }); }) : null) });
    const el = await dialog(hass);
    const radio = $$(el, '[data-hvac-control]').find((r) => r.value === 'off');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    el.closeDialog();
    el.showDialog({});
    await settle();
    answer();
    await settle();
    await settle();
    assert.equal($(el, '.hvac-ask'), null);
    assert.ok($$(el, '[data-hvac-control]').every((r) => !r.disabled));
  });

  test('turning it off for the thermostat asks first, for this thermostat only', async () => {
    const changes = [{ entity_id: SALON, schedule: 'normal', day: 0, start: '22:30', preset: null, hvac_mode: 'off', change: 'removed' }];
    const hass = fakeHass({ reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? { changes } : null) });
    const el = await dialog(hass);
    await choose(el, 'off');
    assert.deepEqual(hvacCalls(hass).at(-1), { type: 'chauffage/hvac_mode_control/set', value: false, entity_id: SALON, preview: true });
    assert.deepEqual($$(el, '.hvac-changes li li').map(text), ['Lun · 22:30 · Éteint → supprimé']);
    click(el, '[data-hvac-confirm]');
    await settle();
    assert.deepEqual(hvacCalls(hass).at(-1), { type: 'chauffage/hvac_mode_control/set', value: false, entity_id: SALON });
  });

  test('back to the house sends null', async () => {
    const data = integrationData();
    data.thermostats[SALON].hvac_mode_control = true;
    const hass = fakeHass({ data, reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? { changes: [] } : null) });
    await choose(await dialog(hass), 'house');
    assert.deepEqual(hvacCalls(hass).map((m) => [m.value, !!m.preview]), [[null, true], [null, false]]);
  });
});

describe('the presets tab without a thermostat whose HVAC mode Chauffage controls and that cools', () => {
  const open = async (hass) => { const view = createView(hass, 'presets', { thermostats: [SALON, ATELIER] }); await settle(); return view; };

  test('a preset keeps its two temperatures, and has one color: no color when cooling', async () => {
    const view = await open(setup({ thermostats: without(ATELIER) }));
    click(view, '[data-kind="preset"][data-preset="eco"]'); await settle();
    const fields = text($(view, '.cell-ed .pv-fields'));
    assert.match(fields, /En chauffe.*En clim/);
    assert.equal($(view, '.cell-ed [data-cell-cool-color]'), null);
    assert.doesNotMatch(fields, /Couleur en chauffe|Couleur en clim/);
    assert.ok($(view, '.cell-ed .pv-name [data-cell-color]'), 'its color, beside its name');
  });

  test('a temperature when cooling can be cleared: no slot cools', async () => {
    const hass = setup({ thermostats: without(ATELIER), atelier: ['00:00 eco', '14:00 comfort'] });
    hass.data.presets = hass.data.presets.map((p) => (p.id === 'comfort' ? { ...p, cool_temperature: 25 } : p));
    hass.data.targets[ATELIER] = {};
    const view = await open(hass);
    click(view, '[data-kind="preset"][data-preset="comfort"]'); await settle();
    const cool = $(view, '.cell-ed [data-cell-cool]');
    cool.value = '';
    cool.dispatchEvent(new window.Event('input', { bubbles: true }));
    await applyCell(view);
    assert.equal($(view, '.cell-ed .pv-error'), null);
    assert.equal('cool_temperature' in lastCall(hass).presets.find((p) => p.id === 'comfort'), false);
  });

  test('the legend of the week shows no color when cooling: no slot cools', async () => {
    const card = await cardOf(setup({ thermostats: without(ATELIER) }), { show: [ATELIER] });
    assert.equal($$(card, '.legend i.cool').length, 0);
  });

  test('the override block of an air conditioner switched to cool by hand shows the presets in their own color', async () => {
    const hass = setup({ thermostats: without(ATELIER) });
    hass.states[ATELIER].state = 'cool';
    const card = await cardOf(hass);
    await openOverride(card, ATELIER);
    assert.equal(control(card, 'override-preset', { preset: 'eco' }).style.background, rgb('#43a047'));
  });

  test('an air conditioner whose HVAC mode Chauffage controls keeps the color when cooling', async () => {
    const view = await open(setup({ thermostats: without(SALON) }));
    click(view, '[data-kind="preset"][data-preset="eco"]'); await settle();
    assert.ok($(view, '.cell-ed [data-cell-cool-color]'));
  });
});
