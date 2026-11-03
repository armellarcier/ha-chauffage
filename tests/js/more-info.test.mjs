// "Schedule" block injected into a thermostat's more-info dialog.
import { fakeHass, cleanup, integrationData, createCard } from './helpers.mjs';
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
const planned = (preset, next, start) => ({ preset, next_preset: next, next_start: start });
const override = { kind: 'temperature', value: 21.5, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };

describe('more-info block', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') })); // Monday
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('without override: until when the preset lasts, and what comes next', () => {
    const el = block(fakeHass({ planned: { 'climate.salon': planned('eco', 'comfort', '2026-10-12T17:30:00+02:00') } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco jusqu'à 17:30, puis Confort/);
  });

  test('the preset goes on the next day: until when it really lasts, not until midnight', () => {
    mock.timers.setTime(new Date('2026-10-12T23:00:00+02:00').getTime());
    const el = block(fakeHass({ planned: { 'climate.salon': planned('eco', 'comfort', '2026-10-13T06:30:00+02:00') } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco jusqu'à 06:30 \(demain\), puis Confort/);
    assert.doesNotMatch(text(el), /minuit/);
  });

  test('a weekend on one preset: the day it ends is named', () => {
    mock.timers.setTime(new Date('2026-10-16T23:00:00+02:00').getTime()); // Friday
    const el = block(fakeHass({ planned: { 'climate.salon': planned('eco', 'comfort', '2026-10-19T06:30:00+02:00') } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco jusqu'à 06:30 \(lundi\), puis Confort/);
  });

  test('the same preset all week', () => {
    const el = block(fakeHass({ planned: { 'climate.salon': planned('eco', null, null) } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco toute la semaine/);
  });

  test('the title shows the name of the active schedule, not its id', () => {
    const el = block(fakeHass({ schedule: 'Vacances', weeks: { 'climate.salon': { Vacances: Array(7).fill(['00:00 eco']) } } }), 'climate.salon');
    assert.match(text(el), /Planning · Vacances/);
    assert.doesNotMatch(text(el), /holiday/);
  });

  test('the active schedule\'s name opens its page in the panel for an admin, and is plain text for others', () => {
    const vacances = () => fakeHass({ schedule: 'Vacances', weeks: { 'climate.salon': { Vacances: Array(7).fill(['00:00 eco']) } } });
    const el = block(vacances(), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('.title [data-more-info]'), null, 'not its switch');
    el.shadowRoot.querySelector('.title [data-navigate="/chauffage/schedules/holiday"]').click();
    assert.equal(window.location.pathname, '/chauffage/schedules/holiday');
    const hass = vacances();
    hass.user = { is_admin: false };
    assert.equal(block(hass, 'climate.salon').shadowRoot.querySelector('.title [data-navigate^="/chauffage"], .title [data-more-info]'), null);
  });

  test('thermostat without a schedule: block hidden', () => {
    const el = block(fakeHass(), 'climate.bureau');
    assert.equal(el.style.display, 'none');
  });

  test('with an override: setpoint, end time and remaining time', () => {
    const el = block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.match(text(el), /21,5 °C/); // French decimal comma
    assert.match(text(el), /encore 1 h 30/);
    assert.equal(el.shadowRoot.querySelector('input.time[data-end]').value, '11:30');
  });

  test('an override from a change by hand says why it ends then, as part of its end: the next slot, or the duration', () => {
    const slot = block(fakeHass({ overrides: { 'climate.salon': { ...override, ends_at: 'next_slot' } } }), 'climate.salon');
    assert.match(text(slot), /aujourd'hui, au prochain créneau ⚙ · encore 1 h 30 · puis Éco \(planning\)/);
    cleanup();
    const duration = block(fakeHass({ overrides: { 'climate.salon': { ...override, ends_at: 'duration' } } }), 'climate.salon');
    assert.match(text(duration), /aujourd'hui, 2 h après le changement ⚙ · encore 1 h 30 · puis Éco \(planning\)/);
  });

  test('an override kept a week, with no slot ahead, says so and counts in days', () => {
    const week = { ...override, start: '2026-10-12T10:00:00+02:00', end: '2026-10-19T10:00:00+02:00', ends_at: 'no_next_slot' };
    const el = block(fakeHass({ overrides: { 'climate.salon': week } }), 'climate.salon');
    assert.match(text(el), /lundi, dans une semaine, aucun créneau prévu ⚙ · encore 7 j/);
  });

  test('an override with an end chosen on the card gives no reason for its end', () => {
    const el = block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.doesNotMatch(text(el), /, au prochain créneau|après le changement/);
    assert.match(text(el), /aujourd'hui · encore 1 h 30 · puis Éco \(planning\)/);
  });

  test('for an admin, the reason of the end opens the settings of changes by hand, with a cog; plain text for others', () => {
    const el = block(fakeHass({ overrides: { 'climate.salon': { ...override, ends_at: 'next_slot' } } }), 'climate.salon');
    const link = el.shadowRoot.querySelector('.derogation [data-navigate="/chauffage/settings"]');
    assert.equal(link.textContent, 'au prochain créneau ⚙');
    assert.equal(link.getAttribute('title'), 'Choisir comment se termine un changement à la main');
    link.click();
    assert.equal(window.location.pathname, '/chauffage/settings');
    cleanup();
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, ends_at: 'next_slot' } } });
    hass.user = { is_admin: false };
    const plain = block(hass, 'climate.salon');
    assert.equal(plain.shadowRoot.querySelector('.derogation [data-navigate]'), null);
    assert.match(text(plain), /aujourd'hui, au prochain créneau · encore/);
  });

  test('the button sets the end of the override to the next slot, and shows its time', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } }); // Monday 10:00, comfort at 17:30
    const el = block(hass, 'climate.salon');
    const button = el.shadowRoot.querySelector('[data-next-slot]');
    assert.equal(button.textContent, "Jusqu'à 17:30 (prochain créneau)");
    button.click();
    const sent = hass.events.at(-1).override;
    assert.equal(new Date(sent.end).toISOString(), '2026-10-12T15:30:00.000Z');
    assert.equal(sent.ends_at, 'next_slot');
  });

  test('a next slot on another day names the day', () => {
    mock.timers.setTime(new Date('2026-10-12T23:00:00+02:00').getTime()); // comfort at 06:30 on Tuesday
    const el = block(fakeHass({ overrides: { 'climate.salon': { ...override, end: '2026-10-13T01:00:00+02:00' } } }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('[data-next-slot]').textContent, "Jusqu'à mardi 06:30 (prochain créneau)");
  });

  test('an override that already ends at the next slot has no button, whatever the way its end is written', () => {
    // The integration's end, in another offset and with seconds, against the card's Date
    for (const end of ['2026-10-12T17:30:00+02:00', '2026-10-12T15:30:00+00:00', '2026-10-12T17:30:20+02:00']) {
      const el = block(fakeHass({ overrides: { 'climate.salon': { ...override, end } } }), 'climate.salon');
      assert.equal(el.shadowRoot.querySelector('[data-next-slot]'), null, end);
      cleanup();
    }
    const said = block(fakeHass({ overrides: { 'climate.salon': { ...override, ends_at: 'next_slot' } } }), 'climate.salon');
    assert.equal(said.shadowRoot.querySelector('[data-next-slot]'), null, 'ends_at next_slot');
  });

  test('with no slot ahead, there is no button to the next slot', () => {
    const weeks = { 'climate.salon': { Normal: Array(7).fill(['00:00 eco']) } };
    const el = block(fakeHass({ weeks, overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('[data-next-slot]'), null);
  });

  test('the next slot is the first one that changes the setpoint, at least 15 minutes away', () => {
    mock.timers.setTime(new Date('2026-10-12T17:20:00+02:00').getTime()); // comfort at 17:30: too close
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, end: '2026-10-12T19:00:00+02:00' } } });
    block(hass, 'climate.salon').shadowRoot.querySelector('[data-next-slot]').click();
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T20:30:00.000Z'); // eco at 22:30
  });

  test('a moved end no longer says it is the next slot', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, ends_at: 'next_slot' } } });
    block(hass, 'climate.salon').shadowRoot.querySelector('button[data-min="30"]').click();
    assert.equal(hass.events.at(-1).override.ends_at, undefined);
  });

  test("the card's override popover offers the button to the next slot, and the reason opens the settings", () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, ends_at: 'duration' } } });
    const card = createCard(hass, { show: ['climate.salon'] });
    card.shadowRoot.querySelector('.override[data-climate="climate.salon"]').click();
    const editor = card.shadowRoot.querySelector('.override-ed');
    assert.match(editor.textContent.replace(/\s+/g, ' '), /aujourd'hui, 2 h après le changement ⚙ · encore 1 h 30/);
    assert.ok(editor.querySelector('[data-navigate="/chauffage/settings"]'));
    const button = editor.querySelector('[data-act="override-next-slot"]');
    assert.equal(button.textContent, "Jusqu'à 17:30 (prochain créneau)");
    button.click();
    const sent = hass.events.at(-1).override;
    assert.equal(new Date(sent.end).toISOString(), '2026-10-12T15:30:00.000Z');
    assert.equal(sent.ends_at, 'next_slot');
  });

  test('a user who is not an admin sets, extends and ends an override too, as with the thermostat\'s knob', () => {
    const hass = withTargets({});
    hass.user = { is_admin: false };
    const el = block(hass, 'climate.salon');
    el.shadowRoot.querySelector('[data-new-override]').click();
    el.shadowRoot.querySelector('.presets [data-preset="comfort"]').click();
    assert.equal(hass.events.at(-1).type, 'chauffage/override/set');
    hass.push(integrationData({ overrides: { 'climate.salon': override } }));
    el.shadowRoot.querySelector('button[data-min="30"]').click();
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T10:00:00.000Z');
    el.shadowRoot.querySelector('[data-del]').click();
    assert.deepEqual(hass.events.at(-1), { type: 'chauffage/override/set', entity_id: 'climate.salon', override: null });
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

describe('the foot of the block, in the more-info dialog and the thermostat card (#39)', () => {
  let opened;
  const intercept = (e) => { opened.push(e.detail.entityId); e.stopPropagation(); };
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') });
    opened = [];
    document.addEventListener('hass-more-info', intercept);
  });
  afterEach(() => {
    document.removeEventListener('hass-more-info', intercept);
    mock.timers.reset();
    cleanup();
  });
  const foot = (el) => el.shadowRoot.querySelector('.foot');

  test('holds Edit its week and Pause only: the device\'s page lists the thermostat\'s entities', () => {
    const el = block(fakeHass(), 'climate.salon');
    assert.deepEqual([...foot(el).querySelectorAll('.mi-link, button')].map((e) => e.textContent),
      ['Modifier sa semaine', 'Mettre en pause']);
    assert.equal(foot(el).querySelector('[data-more-info], [data-device]'), null);
  });

  test('Edit its week opens the thermostat\'s page on its week in the active schedule, closing the dialog', () => {
    const el = block(fakeHass({ schedule: 'Vacances', weeks: { 'climate.salon': { Vacances: Array(7).fill(['00:00 eco']) } } }), 'climate.salon');
    foot(el).querySelector('[data-navigate^="/chauffage/thermostats/climate.salon"]').click();
    assert.deepEqual(opened, [null]); // the more-info dialog is closed
    assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    assert.equal(window.location.search, '?week=holiday');
  });

  test('the week shown in the block opens it too, for an admin', () => {
    const el = block(fakeHass(), 'climate.salon');
    const week = el.shadowRoot.querySelector('.week');
    assert.equal(week.getAttribute('role'), 'link');
    week.querySelector('.row').click();
    assert.equal(`${window.location.pathname}${window.location.search}`, '/chauffage/thermostats/climate.salon?week=normal');
    const hass = fakeHass();
    hass.user = { is_admin: false };
    assert.equal(block(hass, 'climate.salon').shadowRoot.querySelector('.week[role="link"]'), null);
  });

  test('a user who is not an admin gets Pause, as with the Control switch, but not Edit its week (the panel is for admins)', () => {
    const hass = fakeHass();
    hass.user = { is_admin: false };
    const el = block(hass, 'climate.salon');
    assert.deepEqual([...foot(el).querySelectorAll('.mi-link, button')].map((e) => e.textContent), ['Mettre en pause']);
  });
});

describe('an override on a thermostat turned off', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });
  const off = (hass) => { hass.states['climate.salon'] = { ...hass.states['climate.salon'], state: 'off' }; return hass; };
  const note = (root) => root.querySelector('.off-note');
  const override = { kind: 'temperature', value: 21.5, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };

  test('the block warns that Chauffage applies it once the thermostat is on again, with no button', () => {
    const el = block(off(fakeHass({ overrides: { 'climate.salon': override } })), 'climate.salon');
    assert.match(note(el.shadowRoot).textContent, /Salon est éteint : Chauffage lui appliquera la dérogation quand il sera rallumé\./);
    assert.equal(note(el.shadowRoot).getAttribute('role'), 'status');
    assert.equal(note(el.shadowRoot).querySelector('button'), null);
  });

  test('the block warns too while an override is being set', () => {
    const el = block(off(fakeHass()), 'climate.salon');
    assert.equal(note(el.shadowRoot), null);
    el.shadowRoot.querySelector('[data-new-override]').click();
    assert.ok(note(el.shadowRoot));
  });

  test('the card\'s override editor warns', () => {
    const card = createCard(off(fakeHass({ overrides: { 'climate.salon': override } })));
    card._overrideSel = { climate: 'climate.salon' };
    card._render();
    assert.match(note(card.shadowRoot).textContent, /Salon est éteint/);
  });

  test('no warning on a thermostat that heats', () => {
    const el = block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.equal(note(el.shadowRoot), null);
  });

  test('no warning on a VTherm turned off: Chauffage sends it the override at once, and VTherm keeps it (#74)', () => {
    const hass = off(fakeHass({ overrides: { 'climate.salon': override } }));
    hass.entities['climate.salon'] = { ...hass.entities['climate.salon'], platform: 'versatile_thermostat' };
    const el = block(hass, 'climate.salon');
    assert.equal(note(el.shadowRoot), null);
  });

  test('a VTherm is recognized by its integration, not by its attributes', () => {
    const hass = off(fakeHass({ overrides: { 'climate.salon': override } }));
    const st = hass.states['climate.salon'];
    hass.states['climate.salon'] = { ...st, attributes: { ...st.attributes, hvac_off_reason: 'hvac_off_manual' } };
    const el = block(hass, 'climate.salon');
    assert.ok(note(el.shadowRoot));
  });
});
