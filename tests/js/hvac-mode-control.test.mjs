// The setting Control the HVAC mode (#159): on by default. Off, for the house or a thermostat, the
// card offers no HVAC mode for its slots and its overrides. Turning it off shows the slots that
// change first, and the user turns it off or cancels.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKEND, cleanup, fakeHass, integrationData } from './helpers.mjs';
import { $, $$, click, day, text } from './houses/dom.mjs';
import * as heaterAndAtelier from './houses/heater-and-atelier.mjs';

afterEach(() => cleanup());

const { AC_MODES, OWN, SUMMER, cardOf, chips, lastCall, select, setup } = heaterAndAtelier;
// The calls of the setting, without the panel's other calls (its dashboards)
const hvacCalls = (hass) => hass.events.filter((m) => m.type === 'chauffage/hvac_mode_control/set');
const ATELIER = 'climate.atelier';
const SALON = 'climate.salon';
// The thermostats whose HVAC mode Chauffage does not control
const without = (...climates) => Object.fromEntries(climates.map((c) => [c, { paused: false, revision: 7, controls_hvac_mode: false }]));

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

describe('the setting in a thermostat\'s sheet of the panel', () => {
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
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('as the house, on or off; as the house by default', () => {
    const el = panel(fakeHass(), '/thermostats/climate.salon');
    const select = $(el, '[data-hvac-control]');
    assert.equal(text($(el, '.hvac-control span')), 'Contrôler le mode HVAC');
    assert.deepEqual([...select.options].map((o) => o.textContent), ['Comme la maison (activé)', 'Activé', 'Désactivé']);
    assert.equal(select.value, 'house');
  });

  test('a thermostat that says off, in a house that says on', () => {
    const data = integrationData();
    data.thermostats[SALON].hvac_mode_control = false;
    data.hvac_mode_control = true;
    const el = panel(fakeHass({ data }), '/thermostats/climate.salon');
    assert.equal($(el, '[data-hvac-control]').value, 'off');
  });

  test('turning it off for the thermostat asks first, for this thermostat only', async () => {
    const changes = [{ entity_id: SALON, schedule: 'normal', day: 0, start: '22:30', preset: null, hvac_mode: 'off', change: 'removed' }];
    const hass = fakeHass({ reply: (msg) => (msg.type === 'chauffage/hvac_mode_control/set' ? { changes } : null) });
    const el = panel(hass, '/thermostats/climate.salon');
    const select = $(el, '[data-hvac-control]');
    select.value = 'off';
    select.dispatchEvent(new Event('change', { bubbles: true }));
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
    const el = panel(hass, '/thermostats/climate.salon');
    const select = $(el, '[data-hvac-control]');
    select.value = 'house';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    await tick();
    assert.deepEqual(hvacCalls(hass).map((m) => [m.value, !!m.preview]), [[null, true], [null, false]]);
  });
});
