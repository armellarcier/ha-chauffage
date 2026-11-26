// "Schedule" block injected into a thermostat's more-info dialog.
import { fakeHass, cleanup, integrationData, createCard } from './helpers.mjs';
import { settle } from './driver.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

async function block(hass, entity) {
  const el = document.createElement('chauffage-moreinfo');
  document.body.appendChild(el);
  el.entity = entity;
  el.hass = hass;
  await settle();
  return el;
}
const text = (el) => el.shadowRoot.textContent.replace(/\s+/g, ' ');
const planned = (preset, next, start) => ({ preset, next_preset: next, next_start: start });
const override = { target: { temperature: 21.5 }, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
// The next slot a change made now would end at, as the integration publishes it (#83)
const nextSlot = (end) => ({ planned: { 'climate.salon': { ...planned('eco', 'comfort', '2026-10-12T17:30:00+02:00'), next_slot_end: end } } });

describe('more-info block', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') })); // Monday
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('without override: until when the preset lasts, and what comes next', async () => {
    const el = await block(fakeHass({ planned: { 'climate.salon': planned('eco', 'comfort', '2026-10-12T17:30:00+02:00') } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco jusqu'à 17:30, puis Confort/);
  });

  test('the preset goes on the next day: until when it really lasts, not until midnight', async () => {
    mock.timers.setTime(new Date('2026-10-12T23:00:00+02:00').getTime()); await settle();
    const el = await block(fakeHass({ planned: { 'climate.salon': planned('eco', 'comfort', '2026-10-13T06:30:00+02:00') } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco jusqu'à 06:30 \(demain\), puis Confort/);
    assert.doesNotMatch(text(el), /minuit/);
  });

  test('a weekend on one preset: the day it ends is named', async () => {
    mock.timers.setTime(new Date('2026-10-16T23:00:00+02:00').getTime()); await settle(); // Friday
    const el = await block(fakeHass({ planned: { 'climate.salon': planned('eco', 'comfort', '2026-10-19T06:30:00+02:00') } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco jusqu'à 06:30 \(lundi\), puis Confort/);
  });

  test('a preset that changes next week, on the same day: its date, not the day name of today', async () => {
    const el = await block(fakeHass({ planned: { 'climate.salon': planned('eco', 'comfort', '2026-10-19T06:30:00+02:00') } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco jusqu'à 06:30 \(19 octobre\), puis Confort/);
  });

  test('the same preset all week', async () => {
    const el = await block(fakeHass({ planned: { 'climate.salon': planned('eco', null, null) } }), 'climate.salon');
    assert.match(text(el), /Suit le planning : Éco toute la semaine/);
  });

  test('the title shows the name of the active schedule, not its id', async () => {
    const el = await block(fakeHass({ schedule: 'Vacances', weeks: { 'climate.salon': { Vacances: Array(7).fill(['00:00 eco']) } } }), 'climate.salon');
    assert.match(text(el), /Planning · Vacances/);
    assert.doesNotMatch(text(el), /holiday/);
  });

  test('the active schedule\'s name opens its page in the panel for an admin, and is plain text for others', async () => {
    const vacances = () => fakeHass({ schedule: 'Vacances', weeks: { 'climate.salon': { Vacances: Array(7).fill(['00:00 eco']) } } });
    const el = await block(vacances(), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('.title [data-more-info]'), null, 'not its switch');
    el.shadowRoot.querySelector('.title [data-navigate="/chauffage/schedules/holiday"]').click(); await settle();
    assert.equal(window.location.pathname, '/chauffage/schedules/holiday');
    const hass = vacances();
    hass.user = { is_admin: false };
    assert.equal((await block(hass, 'climate.salon')).shadowRoot.querySelector('.title [data-navigate^="/chauffage"], .title [data-more-info]'), null);
  });

  test('thermostat without a schedule: block hidden', async () => {
    const el = await block(fakeHass(), 'climate.bureau');
    assert.equal(el.style.display, 'none');
  });

  test('with an override: setpoint, end time and remaining time', async () => {
    const el = await block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.match(text(el), /21,5 °C/); // French decimal comma
    assert.match(text(el), /encore 1 h 30/);
    assert.equal(el.shadowRoot.querySelector('input.time[data-override-end]').value, '11:30');
  });

  test('an override from a change by hand says why it ends then, as part of its end: the next slot, or the duration', async () => {
    const slot = await block(fakeHass({ overrides: { 'climate.salon': { ...override, end_rule: 'next_slot' } } }), 'climate.salon');
    assert.match(text(slot), /aujourd'hui, au prochain créneau ⚙ · encore 1 h 30 · puis Éco \(planning\)/);
    cleanup();
    const duration = await block(fakeHass({ overrides: { 'climate.salon': { ...override, end_rule: 'duration' } } }), 'climate.salon');
    assert.match(text(duration), /aujourd'hui, 2 h après le changement ⚙ · encore 1 h 30 · puis Éco \(planning\)/);
  });

  test('an override kept a week, with no slot ahead, says so and counts in days', async () => {
    const week = { ...override, start: '2026-10-12T10:00:00+02:00', end: '2026-10-19T10:00:00+02:00', end_rule: 'no_next_slot' };
    const el = await block(fakeHass({ overrides: { 'climate.salon': week } }), 'climate.salon');
    assert.match(text(el), /19 octobre, dans une semaine, aucun créneau prévu ⚙ · encore 7 j/);
  });

  test('an end 7 days away or more says its date, not a day name that would read as today', async () => {
    const at = (end) => ({ ...override, start: '2026-10-12T10:00:00+02:00', end, end_rule: 'no_next_slot' });
    const english = { language: 'en', time_format: '24', number_format: 'language', first_weekday: 'monday' };
    const inAWeek = await block(fakeHass({ locale: english, overrides: { 'climate.salon': at('2026-10-19T10:00:00+02:00') } }), 'climate.salon');
    assert.match(text(inAWeek), /October 19, in a week, no slot ahead/);
    cleanup();
    const inSixDays = await block(fakeHass({ overrides: { 'climate.salon': at('2026-10-18T10:00:00+02:00') } }), 'climate.salon');
    assert.match(text(inSixDays), /dimanche, dans une semaine/);
  });

  test('a time left over a day counts whole days, then the hours left: 1 day 12 h is not 2 days', async () => {
    const long = { ...override, end: '2026-10-13T22:30:00+02:00' }; // 36 h 30 from Monday 10:00
    assert.match(text(await block(fakeHass({ overrides: { 'climate.salon': long } }), 'climate.salon')), /encore 1 j 12 h/);
    cleanup();
    const english = { language: 'en', time_format: '24', number_format: 'language', first_weekday: 'monday' };
    assert.match(text(await block(fakeHass({ locale: english, overrides: { 'climate.salon': long } }), 'climate.salon')), /1 d 12 h left/);
  });

  test('an override with an end chosen on the card gives no reason for its end', async () => {
    const el = await block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.doesNotMatch(text(el), /, au prochain créneau|après le changement/);
    assert.match(text(el), /aujourd'hui · encore 1 h 30 · puis Éco \(planning\)/);
  });

  test('for an admin, the reason of the end opens the settings of changes by hand, with a cog; plain text for others', async () => {
    const el = await block(fakeHass({ overrides: { 'climate.salon': { ...override, end_rule: 'next_slot' } } }), 'climate.salon');
    const link = el.shadowRoot.querySelector('.derogation [data-open-settings]');
    assert.equal(link.textContent, 'au prochain créneau ⚙');
    assert.equal(link.getAttribute('title'), 'Choisir la durée des dérogations');
    cleanup();
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, end_rule: 'next_slot' } } });
    hass.user = { is_admin: false };
    const plain = await block(hass, 'climate.salon');
    assert.equal(plain.shadowRoot.querySelector('.derogation [data-open-settings]'), null);
    assert.match(text(plain), /aujourd'hui, au prochain créneau · encore/);
  });

  test('the button sets the end of the override to the next slot, and shows its time', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override }, ...nextSlot('2026-10-12T17:30:00+02:00') }); // Monday 10:00
    const el = await block(hass, 'climate.salon');
    const button = el.shadowRoot.querySelector('[data-act="override-next-slot"]');
    assert.equal(button.textContent, "Jusqu'à 17:30 (prochain créneau)");
    assert.equal(button.dataset.at, '2026-10-12T17:30:00+02:00');
    button.click(); await settle();
    const sent = hass.events.at(-1).override;
    assert.equal(new Date(sent.end).toISOString(), '2026-10-12T15:30:00.000Z');
    assert.equal(sent.end_rule, 'next_slot');
  });

  test('a next slot on another day names the day', async () => {
    mock.timers.setTime(new Date('2026-10-12T23:00:00+02:00').getTime()); await settle(); // comfort at 06:30 on Tuesday
    const el = await block(fakeHass({ overrides: { 'climate.salon': { ...override, end: '2026-10-13T01:00:00+02:00' } },
      ...nextSlot('2026-10-13T06:30:00+02:00') }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('[data-act="override-next-slot"]').textContent, "Jusqu'à mardi 06:30 (prochain créneau)");
  });

  test('a next slot a week away names its date', async () => {
    const el = await block(fakeHass({ overrides: { 'climate.salon': override }, ...nextSlot('2026-10-19T06:30:00+02:00') }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('[data-act="override-next-slot"]').textContent, "Jusqu'à 19 octobre 06:30 (prochain créneau)");
  });

  test('an override that already ends at the next slot has no button, whatever the way its end is written', async () => {
    // The integration's end, in another offset and with seconds, against the card's Date
    for (const end of ['2026-10-12T17:30:00+02:00', '2026-10-12T15:30:00+00:00', '2026-10-12T17:30:20+02:00']) {
      const el = await block(fakeHass({ overrides: { 'climate.salon': { ...override, end } }, ...nextSlot('2026-10-12T17:30:00+02:00') }), 'climate.salon');
      assert.equal(el.shadowRoot.querySelector('[data-act="override-next-slot"]'), null, end);
      cleanup();
    }
    const said = await block(fakeHass({ overrides: { 'climate.salon': { ...override, end_rule: 'next_slot' } }, ...nextSlot('2026-10-12T17:30:00+02:00') }), 'climate.salon');
    assert.equal(said.shadowRoot.querySelector('[data-act="override-next-slot"]'), null, 'end_rule next_slot');
  });

  test('with no slot ahead, there is no button to the next slot', async () => {
    const el = await block(fakeHass({ overrides: { 'climate.salon': override }, ...nextSlot(null) }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('[data-act="override-next-slot"]'), null);
    cleanup();
    // An older integration publishes no next slot: no button rather than a guess
    const older = await block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.equal(older.shadowRoot.querySelector('[data-act="override-next-slot"]'), null);
  });

  test('the button shows and sends the next slot the integration computed, in its own time zone', async () => {
    // 18:15 is no slot of this week: the integration's answer wins over any computation in the browser
    const hass = fakeHass({ overrides: { 'climate.salon': override }, ...nextSlot('2026-10-12T18:15:00+02:00') });
    const button = (await block(hass, 'climate.salon')).shadowRoot.querySelector('[data-act="override-next-slot"]');
    assert.equal(button.textContent, "Jusqu'à 18:15 (prochain créneau)");
    mock.timers.setTime(new Date('2026-10-12T10:20:00+02:00').getTime()); await settle(); // the click sends what the label shows
    button.click(); await settle();
    assert.equal(hass.events.at(-1).override.end, '2026-10-12T18:15:00+02:00');
  });

  test('a moved end no longer says it is the next slot', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, end_rule: 'next_slot' } } });
    (await block(hass, 'climate.salon')).shadowRoot.querySelector('button[data-min="30"]').click(); await settle();
    assert.equal(hass.events.at(-1).override.end_rule, undefined);
  });

  test("the card's override popover offers the button to the next slot, and the reason opens the settings", async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': { ...override, end_rule: 'duration' } }, ...nextSlot('2026-10-12T17:30:00+02:00') });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    card.shadowRoot.querySelector('.override[data-climate="climate.salon"]').click(); await settle();
    const editor = card.shadowRoot.querySelector('.override-ed');
    assert.match(editor.textContent.replace(/\s+/g, ' '), /aujourd'hui, 2 h après le changement ⚙ · encore 1 h 30/);
    assert.ok(editor.querySelector('[data-open-settings]'));
    const button = editor.querySelector('[data-act="override-next-slot"]');
    assert.equal(button.textContent, "Jusqu'à 17:30 (prochain créneau)");
    button.click(); await settle();
    const sent = hass.events.at(-1).override;
    assert.equal(new Date(sent.end).toISOString(), '2026-10-12T15:30:00.000Z');
    assert.equal(sent.end_rule, 'next_slot');
  });

  test('a user who is not an admin sets, extends and ends an override too, as with the thermostat\'s knob', async () => {
    const hass = withTargets({});
    hass.user = { is_admin: false };
    const el = await block(hass, 'climate.salon');
    el.shadowRoot.querySelector('[data-new-override]').click(); await settle();
    el.shadowRoot.querySelector('.presets [data-preset="comfort"]').click(); await settle();
    assert.equal(hass.events.at(-1).type, 'chauffage/override/set');
    hass.push(integrationData({ overrides: { 'climate.salon': override } })); await settle();
    el.shadowRoot.querySelector('button[data-min="30"]').click(); await settle();
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T10:00:00.000Z');
    el.shadowRoot.querySelector('[data-act="override-del"]').click(); await settle();
    assert.deepEqual(hass.events.at(-1), { type: 'chauffage/override/set', entity_id: 'climate.salon', override: null });
  });

  test('+30 min extends the override', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const el = await block(hass, 'climate.salon');
    el.shadowRoot.querySelector('button[data-min="30"]').click(); await settle();
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

  test('a preset picked in the block becomes the override, until the same end', async () => {
    const hass = withTargets();
    const el = await block(hass, 'climate.salon');
    el.shadowRoot.querySelector('.presets [data-preset="comfort"]').click(); await settle();
    const msg = hass.events.at(-1);
    assert.equal(msg.type, 'chauffage/override/set');
    assert.deepEqual(msg.override, { ...override, target: { temperature: 20 }, preset: 'comfort' });
  });

  test('an override set to a preset shows that preset, on a thermostat without presets', async () => {
    const el = await block(withTargets({ 'climate.salon': { ...override, target: { temperature: 20 }, preset: 'comfort' } }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('.override-value').textContent, '⏱ Confort 20°');
    assert.ok(el.shadowRoot.querySelector('.presets [data-preset="comfort"]').classList.contains('on'));
  });

  test('an override set to a preset deleted since shows the thermostat\'s own preset', async () => {
    const data = integrationData({ overrides: { 'climate.salon': { ...override, target: { preset_mode: 'eco' }, preset: 'nuit' } } });
    data.targets = { 'climate.salon': { comfort: { temperature: 20 }, eco: { preset_mode: 'eco' } } };
    const el = await block(fakeHass({ data }), 'climate.salon');
    assert.ok(el.shadowRoot.querySelector('.presets [data-preset="eco"]').classList.contains('on'));
  });

  test('an override at a preset\'s temperature does not show that preset', async () => {
    const el = await block(withTargets({ 'climate.salon': { ...override, target: { temperature: 20 } } }), 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('.override-value').textContent, '⏱ 20 °C');
    assert.equal(el.shadowRoot.querySelector('.presets .on'), null);
  });

  test('a temperature typed in the block becomes the override', async () => {
    const hass = withTargets();
    const el = await block(hass, 'climate.salon');
    const input = el.shadowRoot.querySelector('input[data-override-temperature]');
    assert.equal(input.value, '21,5'); // the user's number format
    input.value = '22';
    input.dispatchEvent(new Event('change', { bubbles: true })); await settle();
    assert.deepEqual(hass.events.at(-1).override, { ...override, target: { temperature: 22 } });
  });

  test('a temperature being typed survives an update of the thermostat', async () => {
    const hass = withTargets();
    const el = await block(hass, 'climate.salon');
    const input = el.shadowRoot.querySelector('input[data-override-temperature]');
    input.focus();
    input.value = '2';
    const salon = hass.states['climate.salon'];
    el.hass = { ...hass, states: { ...hass.states, 'climate.salon': { ...salon, attributes: { ...salon.attributes, current_temperature: 20.1 } } } }; await settle();
    const after = el.shadowRoot.querySelector('input[data-override-temperature]');
    assert.equal(after.value, '2');
    assert.equal(el.shadowRoot.activeElement, after);
  });

  test('with an override: what the thermostat goes back to at its end', async () => {
    const el = await block(fakeHass({ overrides: { 'climate.salon': override } }), 'climate.salon');
    assert.match(text(el), /puis Éco \(planning\)/); // 11:30: the 08:30 eco slot
  });

  test('without an override, "Temporary setpoint…" then a preset creates one, for the override duration', async () => {
    const hass = withTargets({});
    const el = await block(hass, 'climate.salon');
    assert.equal(el.shadowRoot.querySelector('.presets'), null); // folded until asked
    el.shadowRoot.querySelector('[data-new-override]').click(); await settle();
    el.shadowRoot.querySelector('.presets [data-preset="comfort"]').click(); await settle();
    const msg = hass.events.at(-1);
    assert.equal(msg.type, 'chauffage/override/set');
    assert.deepEqual(msg.override, { target: { temperature: 20 }, preset: 'comfort', start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('without an override, a temperature typed creates one', async () => {
    const hass = withTargets({});
    const el = await block(hass, 'climate.salon');
    el.shadowRoot.querySelector('[data-new-override]').click(); await settle();
    const input = el.shadowRoot.querySelector('input[data-override-temperature]');
    input.value = '22';
    input.dispatchEvent(new Event('change', { bubbles: true })); await settle();
    assert.deepEqual(hass.events.at(-1).override, { target: { temperature: 22 }, start: '2026-10-12T08:00:00.000Z', end: '2026-10-12T10:00:00.000Z' });
  });

  test('an override ended elsewhere is no longer shown, even while a field has the focus', async () => {
    const hass = withTargets();
    const el = await block(hass, 'climate.salon');
    el.shadowRoot.querySelector('input[data-override-temperature]').focus();
    hass.push(integrationData({ overrides: {} })); await settle();
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

  test('holds Edit its week and Pause only: the device\'s page lists the thermostat\'s entities', async () => {
    const el = await block(fakeHass(), 'climate.salon');
    assert.deepEqual([...foot(el).querySelectorAll('.mi-link, button')].map((e) => e.textContent),
      ['Modifier sa semaine', 'Suspendre le pilotage']);
    assert.equal(foot(el).querySelector('[data-more-info], [data-device]'), null);
  });

  test('Edit its week opens the thermostat\'s page on its week in the active schedule, closing the dialog', async () => {
    const el = await block(fakeHass({ schedule: 'Vacances', weeks: { 'climate.salon': { Vacances: Array(7).fill(['00:00 eco']) } } }), 'climate.salon');
    foot(el).querySelector('[data-navigate^="/chauffage/thermostats/climate.salon"]').click(); await settle();
    assert.deepEqual(opened, [null]); // the more-info dialog is closed
    assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    assert.equal(window.location.search, '?week=holiday');
  });

  test('the week shown in the block opens it too, for an admin (not with Use)', async () => {
    const el = await block(fakeHass(), 'climate.salon');
    const week = el.shadowRoot.querySelector('.week');
    assert.equal(week.getAttribute('role'), 'link');
    week.querySelector('.row').click(); await settle();
    assert.equal(`${window.location.pathname}${window.location.search}`, '/chauffage/thermostats/climate.salon?week=normal');
    const hass = fakeHass();
    hass.user = { is_admin: false };
    assert.equal((await block(hass, 'climate.salon')).shadowRoot.querySelector('.week[role="link"]'), null);
  });

  test('a user with the access level Use gets Pause, as with the Control switch, but not Edit its week (#99)', async () => {
    const hass = fakeHass();
    hass.user = { is_admin: false };
    const el = await block(hass, 'climate.salon');
    assert.deepEqual([...foot(el).querySelectorAll('.mi-link, button')].map((e) => e.textContent), ['Suspendre le pilotage']);
  });
});

describe('the more-info block between two updates', () => {
  const ending = { target: { temperature: 21.5 }, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('an end typed that is not a time shows the end again once the field is left', async () => {
    const el = await block(fakeHass({ overrides: { 'climate.salon': ending } }), 'climate.salon');
    const field = el.shadowRoot.querySelector('input.time[data-override-end]');
    assert.equal(field.value, '11:30');
    field.focus();
    field.value = 'abc';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    field.blur();
    await settle();
    assert.equal(el.shadowRoot.querySelector('input.time[data-override-end]').value, '11:30');
  });

  test('the integration\'s update that comes with a tap replaces the override sent', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': ending } });
    const el = await block(hass, 'climate.salon');
    el.shadowRoot.querySelector('[data-act="override-del"]').click();
    hass.push(integrationData({ overrides: { 'climate.salon': { ...ending, target: { temperature: 23 } } } }));
    await settle();
    assert.match(text(el), /23 °C/);
  });
});

describe('the more-info block and a push that changes something else', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });
  const override = { target: { temperature: 21.5 }, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };

  test('an override removed stays removed through a push that does not touch the overrides', async () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    hass.callWS = async (msg) => { hass.events.push(msg); return null; };
    const el = await block(hass, 'climate.salon');
    el.shadowRoot.querySelector('[data-act="override-del"]').click(); await settle();
    assert.doesNotMatch(el.shadowRoot.textContent, /21,5/);
    hass.push(integrationData({ paused: ['climate.bureau'], overrides: { 'climate.salon': override } })); await settle();
    assert.doesNotMatch(el.shadowRoot.textContent, /21,5/);
  });

  test('a pause error stays through a push that does not pause or resume', async () => {
    const planned = { 'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' } };
    const hass = fakeHass({ planned, reply: () => { throw { code: 'invalid_format', message: 'boom' }; } });
    const el = await block(hass, 'climate.salon');
    el.shadowRoot.querySelector('[data-pause]').click(); await settle();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(el.shadowRoot.textContent, /Erreur : boom/);
    hass.push(integrationData({ planned, overrides: { 'climate.bureau': override } })); await settle();
    el.hass = hass; await settle();
    assert.match(el.shadowRoot.textContent, /Erreur : boom/);
  });
});
