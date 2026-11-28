// The setting Control the HVAC mode (#159): on by default. Off, for the house or a thermostat, the
// card offers no HVAC mode for its slots and its overrides. Turning it off shows the slots that
// change first, and the user turns it off or cancels.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKEND, cleanup, createCard, fakeDialogManager, fakeHass, integrationData } from './helpers.mjs';
import { $, $$, click, day, rgb, text } from './houses/dom.mjs';
import * as heaterAndAtelier from './houses/heater-and-atelier.mjs';

afterEach(() => cleanup());

const { AC_MODES, OWN, PRESET_COLORS, SUMMER, cardOf, chips, lastCall, select, setup } = heaterAndAtelier;
// The calls of the setting, without the panel's other calls (its dashboards)
const hvacCalls = (hass) => hass.events.filter((m) => m.type === 'chauffage/hvac_mode_control/set');
const ATELIER = 'climate.atelier';
const SALON = 'climate.salon';
// The thermostats whose HVAC mode Chauffage does not control
const without = (...climates) => Object.fromEntries(climates.map((c) => [c, { paused: false, revision: 7, hvac_mode_control: false }]));

describe('without control of the HVAC mode, the card offers none', () => {
  test('the slot popover of an air conditioner has no row of HVAC modes, and no Éteint', () => {
    const card = cardOf(setup({ thermostats: without(ATELIER) }), { show: [ATELIER] });
    select(card, ATELIER, 0, 1); // 14:00 comfort
    assert.equal($(card, '.editor .mode-row'), null);
    assert.deepEqual(chips(card, '.editor'), ['Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
  });

  test('the slot popover of a heater has no Éteint', () => {
    const card = cardOf(setup({ thermostats: without(SALON) }), { show: [SALON] });
    select(card, SALON, 0, 1); // 06:30 comfort
    assert.deepEqual(chips(card, '.editor'), ['Hors-gel', 'Éco', 'Confort ✓', 'Boost']);
  });

  test('a thermostat that says on keeps its HVAC modes when the house says off', () => {
    const hass = setup({ thermostats: { [ATELIER]: { paused: false, revision: 7, hvac_mode_control: true } } });
    hass.data.hvac_mode_control = false;
    const card = cardOf(hass, { show: [ATELIER, SALON] });
    select(card, ATELIER, 0, 1); // 14:00 comfort
    assert.ok($(card, '.editor .mode-row'));
    select(card, SALON, 0, 1); // follows the house
    assert.ok(!chips(card, '.editor').includes('Éteint'));
  });

  test('a preset tapped in the slot popover sets no HVAC mode, even on a slot that had one', () => {
    const card = cardOf(setup({ thermostats: without(ATELIER), atelier: SUMMER }), { show: [ATELIER] });
    select(card, ATELIER, 0, 1); // 14:00 comfort, in cool
    click(card, '.editor [data-act="preset"][data-preset="eco"]');
    assert.equal(day(card, ATELIER, 0)[1], '14:00 eco');
  });

  describe('the override block', () => {
    beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
    afterEach(() => mock.timers.reset());

    test('has no row of HVAC modes and no Éteint, and an override says no HVAC mode', () => {
      const hass = setup({ thermostats: without(ATELIER), planned: { [ATELIER]: { preset: 'comfort', hvac_mode: null } } });
      const card = cardOf(hass);
      card._action('override-new', { climate: ATELIER });
      assert.equal($(card, '.override-ed .mode-row'), null);
      assert.ok(!chips(card, '.override-ed').includes('Éteint'));
      click(card, '.override-ed [data-act="override-preset"][data-preset="boost"]');
      assert.deepEqual(lastCall(hass).override.target, OWN('boost'));
    });

    test('switched to cool by hand, its presets keep their color: no slot cools', () => {
      const hass = setup({ thermostats: without(ATELIER), planned: { [ATELIER]: { preset: 'comfort', hvac_mode: null } } });
      hass.states[ATELIER].state = 'cool';
      const card = cardOf(hass);
      card._action('override-new', { climate: ATELIER });
      const comfort = $(card, '.override-ed [data-act="override-preset"][data-preset="comfort"]');
      assert.equal(comfort.style.background, rgb(PRESET_COLORS.comfort));
    });

    test('a new override does not say when Éteint would end: there is no Éteint', () => {
      const hass = setup({ thermostats: without(SALON), planned: { [SALON]: { preset: 'eco', hvac_mode: null, next_slot_end: '2026-10-12T17:30:00+02:00' } } });
      const card = cardOf(hass);
      card._action('override-new', { climate: SALON });
      assert.doesNotMatch(text($(card, '.override-ed .end-new')), /Éteint/);
    });

    test('offers the presets of the HVAC mode the thermostat shows: in cool, not Hors-gel', () => {
      const hass = setup({ thermostats: without(ATELIER) });
      hass.states[ATELIER].state = 'cool';
      const card = cardOf(hass);
      card._action('override-new', { climate: ATELIER });
      assert.deepEqual(chips(card, '.override-ed'), ['Éco', 'Confort', 'Boost']);
    });
  });

  test('a day pasted loses its off slot and its HVAC modes, as an edited slot does', () => {
    const card = cardOf(setup({ thermostats: without(ATELIER),
      weeks: { [SALON]: { Normal: Array(7).fill(['00:00 eco', ['06:30', 'comfort', { hvac_mode: 'heat' }], ['21:00', null, { hvac_mode: 'off' }]]) },
        [ATELIER]: { Normal: Array(5).fill(['00:00 eco']).concat([WEEKEND, WEEKEND]) } } }));
    card._copyToClipboard(SALON, 0);
    card._pasteFromClipboard(ATELIER, 0);
    assert.deepEqual(day(card, ATELIER, 0), ['00:00 eco', '06:30 comfort']);
    assert.match(card._msg, /Éteint/);
  });

  test('the week menu has no All heat and All cool', () => {
    const card = cardOf(setup({ thermostats: without(ATELIER) }), { show: [ATELIER] });
    card._openMenu(ATELIER, 0, 0, 0, 0);
    assert.doesNotMatch(text($(card, '.menu')), /Tout en chauffe|Tout en clim/);
  });

  test('the legend shows no cool color: no slot cools', () => {
    const card = cardOf(setup({ thermostats: without(ATELIER) }), { show: [ATELIER] });
    assert.equal($$(card, '.legend i.cool').length, 0);
  });
});

// The owner's decision (2026-11-28): a preset keeps both temperatures, as an air conditioner
// switched to cool by hand gets the cooling one. Only what cooling slots use is hidden
describe('without control of the HVAC mode, a preset hides what only cooling slots use', () => {
  const presetsOf = (hass) => createCard(hass, { thermostats: [SALON, ATELIER], view: 'presets' });

  test('its temperature when cooling stays, its color when cooling goes', () => {
    const card = presetsOf(setup({ thermostats: without(ATELIER) }));
    click(card, '[data-kind="preset"][data-preset="eco"]');
    assert.ok($(card, '.cell-ed [data-cell-cool]'), 'the temperature when cooling');
    assert.equal($(card, '.cell-ed [data-cell-cool-color]'), null);
    assert.doesNotMatch(text($(card, '.cell-ed .pv-fields')), /Couleur en chauffe|Couleur en clim/);
    assert.ok($(card, '.cell-ed .pv-name [data-cell-color]'), 'one color, beside its name');
  });

  test('a temperature when cooling can be cleared: no slot cools', async () => {
    const hass = setup({ thermostats: without(ATELIER), atelier: ['00:00 eco', '14:00 comfort'] });
    hass.data.presets = hass.data.presets.map((p) => (p.id === 'comfort' ? { ...p, cool_temperature: 25 } : p));
    hass.data.targets[ATELIER] = {};
    const card = presetsOf(hass);
    click(card, '[data-kind="preset"][data-preset="comfort"]');
    const cool = $(card, '.cell-ed [data-cell-cool]');
    cool.value = '';
    cool.dispatchEvent(new window.Event('input', { bubbles: true }));
    await card._action('cell-apply', {});
    assert.equal(card._cellError || null, null);
    assert.equal('cool_temperature' in lastCall(hass).presets.find((p) => p.id === 'comfort'), false);
  });

  test('an air conditioner with control keeps the color when cooling', () => {
    const card = presetsOf(setup({ thermostats: without(SALON) }));
    click(card, '[data-kind="preset"][data-preset="eco"]');
    assert.ok($(card, '.cell-ed [data-cell-cool-color]'));
  });
});

describe('the setting in the settings dialog, for the house', () => {
  const settings = (hass) => {
    const el = document.createElement('chauffage-settings-dialog');
    document.body.appendChild(el);
    el.hass = hass;
    el.showDialog({});
    return el;
  };
  const CHANGES = [
    { entity_id: ATELIER, schedule: 'normal', day: 0, start: '23:00', preset: null, hvac_mode: 'off', change: 'removed' },
    { entity_id: ATELIER, schedule: 'normal', day: 1, start: '23:00', preset: null, hvac_mode: 'off', change: 'removed' },
    { entity_id: ATELIER, schedule: 'normal', day: 0, start: '14:00', preset: 'comfort', hvac_mode: 'cool', change: 'hvac_mode_removed' },
  ];
  const answering = (changes) => (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? (msg.preview ? { changes } : { changes }) : null);
  const choose = (el, value) => {
    const radio = $$(el, '[data-hvac-control]').find((r) => r.value === value);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const house = (reply) => {
    const data = setup().data;
    const hass = fakeHass({ data, reply });
    hass.states[ATELIER] = { state: 'heat', attributes: { friendly_name: 'Atelier', hvac_modes: AC_MODES }, last_updated: '1' };
    return hass;
  };

  test('the setting comes first, before the other settings', () => {
    const el = settings(house());
    assert.ok($(el, '.body > section').classList.contains('hvac-settings'));
  });

  test('a heading, two choices, on by default, and one line that says what off means', () => {
    const el = settings(house());
    assert.equal(text($(el, '.hvac-settings h3')), 'Contrôler le mode HVAC');
    assert.deepEqual($$(el, '.hvac-settings .choice').map(text), ['Activé (par défaut)', 'Désactivé']);
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'on');
    assert.equal(text($(el, '.hvac-settings .note')),
      "Désactivé : Chauffage n'allume ni n'éteint jamais un thermostat, et ne le fait jamais passer du chauffage à la clim.");
  });

  test('turning it off lists the slots that change first, and Désactiver saves it', async () => {
    const hass = house(answering(CHANGES));
    const el = settings(hass);
    choose(el, 'off');
    await tick();
    assert.deepEqual(hass.events.map((m) => [m.value, !!m.preview]), [[false, true]], 'nothing changed yet');
    assert.equal(text($(el, '.hvac-ask-title')), 'Ces créneaux changent :');
    assert.deepEqual($$(el, '.hvac-changes > li').map((li) => text(li.querySelector('strong'))), ['Atelier']);
    assert.deepEqual($$(el, '.hvac-changes li li').map(text), [
      'Lun · 14:00 · Confort, Clim → Confort',
      'Lun, Mar · 23:00 · Éteint → supprimé',
    ]);
    assert.ok($$(el, '[data-hvac-control]').every((r) => r.disabled), 'the choice waits for the answer');
    click(el, '[data-hvac-confirm]');
    await tick();
    assert.deepEqual(hass.events.at(-1), { type: 'chauffage/hvac_mode_control/set', value: false });
    assert.equal($(el, '.hvac-ask'), null);
  });

  test('Annuler changes nothing', async () => {
    const hass = house(answering(CHANGES));
    const el = settings(hass);
    choose(el, 'off');
    await tick();
    click(el, '[data-hvac-cancel]');
    await tick();
    assert.equal(hass.events.length, 1);
    assert.equal($(el, '.hvac-ask'), null);
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'on');
  });

  test('with no slot to change, the choice is saved at once', async () => {
    const hass = house(answering([]));
    const el = settings(hass);
    choose(el, 'off');
    await tick();
    await tick();
    assert.deepEqual(hass.events.map((m) => [m.value, !!m.preview]), [[false, true], [false, false]]);
    assert.equal($(el, '.hvac-ask'), null);
  });

  test('turned off, the house says it', () => {
    const data = { ...integrationData(), hvac_mode_control: false };
    const el = settings(fakeHass({ data }));
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'off');
  });
});

// The owner's decision (2026-11-28): a thermostat's setting is set almost once. A gear on its page
// of the panel opens a small dialog, as the panel's gear opens the settings of the house
describe('the setting of one thermostat, behind the gear of its page in the panel', () => {
  beforeEach(() => {
    window.loadCardHelpers = async () => ({ createCardElement: (config) => Object.assign(document.createElement('div'), { config }) });
  });
  afterEach(() => { delete window.loadCardHelpers; window.history.replaceState(null, '', '/'); });
  const panel = (hass, path) => {
    hass.panels = { chauffage: { url_path: 'chauffage', title: 'Chauffage' } };
    window.history.replaceState(null, '', `/chauffage${path}`);
    const el = document.createElement('chauffage-panel');
    document.body.appendChild(el);
    el.hass = hass;
    el.panel = hass.panels.chauffage;
    el.route = { prefix: '/chauffage', path };
    return el;
  };
  // The dialog of one thermostat, as the gear opens it
  const dialog = (hass, climate = SALON) => {
    const el = document.createElement('chauffage-settings-dialog');
    document.body.appendChild(el);
    el.hass = hass;
    el.showDialog({ climate });
    return el;
  };
  const choose = (el, value) => {
    const radio = $$(el, '[data-hvac-control]').find((r) => r.value === value);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const OFF_SLOT_REMOVED = [{ entity_id: SALON, schedule: 'normal', day: 0, start: '22:30', preset: null, hvac_mode: 'off', change: 'removed' }];

  test('the thermostat\'s page has no list of the setting, and a gear that opens its dialog', async () => {
    const hass = fakeHass();
    const manager = fakeDialogManager(hass);
    const el = panel(hass, '/thermostats/climate.salon');
    assert.equal($(el, '.content [data-hvac-control]'), null);
    const gear = $(el, '.toolbar [data-open-settings][data-climate="climate.salon"]');
    assert.equal(gear.getAttribute('aria-label'), 'Réglages');
    gear.click();
    await tick();
    assert.deepEqual(manager.shown.map((d) => [d.dialogTag, d.dialogParams.climate]), [['chauffage-settings-dialog', SALON]]);
  });

  test('the dialog holds this setting only: as the house, on or off; as the house by default', () => {
    const el = dialog(fakeHass());
    assert.equal(text($(el, '.hvac-settings h3')), 'Contrôler le mode HVAC');
    assert.deepEqual($$(el, '.hvac-settings .choice').map(text), ['Comme la maison (activé)', 'Activé', 'Désactivé']);
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'house');
    assert.equal($(el, '.override-settings'), null);
    assert.equal($(el, '.access-settings'), null);
  });

  test('a thermostat that says off, in a house that says on', () => {
    const data = integrationData();
    data.thermostats[SALON].hvac_mode_control = false;
    data.hvac_mode_control = true;
    const el = dialog(fakeHass({ data }));
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'off');
  });

  test('a question left unanswered is gone when the dialog opens again', async () => {
    const hass = fakeHass({ reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? { changes: OFF_SLOT_REMOVED } : null) });
    const el = dialog(hass);
    choose(el, 'off');
    await tick();
    el.closeDialog();
    el.showDialog({ climate: SALON });
    assert.equal($(el, '.hvac-ask'), null);
    assert.equal($$(el, '[data-hvac-control]').find((r) => r.checked).value, 'house');
  });

  test('a late answer for a thermostat does not reach the dialog opened again for the house', async () => {
    let answer;
    const hass = fakeHass({ reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set'
      ? new Promise((resolve) => { answer = () => resolve({ changes: OFF_SLOT_REMOVED }); }) : null) });
    const el = dialog(hass);
    choose(el, 'off');
    el.closeDialog();
    el.showDialog({});
    answer();
    await tick();
    await tick();
    assert.equal($(el, '.hvac-ask'), null);
    assert.ok($$(el, '[data-hvac-control]').every((r) => !r.disabled));
  });

  test('turning it off for the thermostat asks first, for this thermostat only', async () => {
    const changes = OFF_SLOT_REMOVED;
    const hass = fakeHass({ reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? { changes } : null) });
    const el = dialog(hass);
    choose(el, 'off');
    await tick();
    assert.deepEqual(hvacCalls(hass).at(-1), { type: 'chauffage/hvac_mode_control/set', value: false, entity_id: SALON, preview: true });
    assert.deepEqual($$(el, '.hvac-changes li li').map(text), ['Lun · 22:30 · Éteint → supprimé']);
    click(el, '[data-hvac-confirm]');
    await tick();
    assert.deepEqual(hvacCalls(hass).at(-1), { type: 'chauffage/hvac_mode_control/set', value: false, entity_id: SALON });
  });

  test('back to the house sends null', async () => {
    const data = integrationData();
    data.thermostats[SALON].hvac_mode_control = true;
    const hass = fakeHass({ data, reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? { changes: [] } : null) });
    const el = dialog(hass);
    choose(el, 'house');
    await tick();
    await tick();
    assert.deepEqual(hvacCalls(hass).map((m) => [m.value, !!m.preview]), [[null, true], [null, false]]);
  });
});
