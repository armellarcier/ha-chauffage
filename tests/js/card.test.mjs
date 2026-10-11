// Behavior of the custom:chauffage-programme-card card.
import { fakeHass, integrationData, createCard, cleanup, ChauffageProgrammeCard, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const day = (card, climate, d, schedule) => serializeDay(card._week(climate, schedule)[d]);

afterEach(() => cleanup());

describe('configuration and loading', () => {
  test('the thermostat list is required', () => {
    const card = new ChauffageProgrammeCard();
    assert.throws(() => card.setConfig({}), /thermostats/);
  });

  test('schedules saved in HA are loaded', () => {
    const card = createCard(fakeHass());
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
  });

  test('a thermostat without a schedule starts in eco all week', () => {
    const card = createCard(fakeHass());
    assert.deepEqual(day(card, 'climate.bureau', 3), ['00:00 eco']);
  });

  test('the tab opened by default is the active schedule', () => {
    const card = createCard(fakeHass({ schedule: 'Absent' }));
    assert.equal(card._schedule, 'away');
  });
});

describe('activating a schedule', () => {
  const bar = (card) => card.shadowRoot.querySelector('.schedule-bar');
  const tab = (card, schedule) => card.shadowRoot.querySelector(`.tab[data-schedule="${schedule}"]`);

  test('no activate button while viewing the active schedule', () => {
    const card = createCard(fakeHass({ schedule: 'Normal' }));
    assert.equal(bar(card), null);
  });

  test('viewing another schedule offers to activate it', () => {
    const card = createCard(fakeHass({ schedule: 'Normal' }));
    tab(card, 'away').click();
    assert.match(bar(card).textContent, /Planning actif : Normal/);
    assert.match(bar(card).textContent, /Activer « Absent »/);
  });

  test('the button activates the schedule in the integration', async () => {
    const hass = fakeHass({ schedule: 'Normal' });
    const card = createCard(hass);
    tab(card, 'holiday').click();
    await card._action('activate-schedule', {});
    assert.deepEqual(hass.events, [{ type: 'chauffage/schedule/activate', schedule: 'holiday' }]);
  });

  test('once the integration reports the new active schedule, the button disappears', () => {
    const hass = fakeHass({ schedule: 'Normal' });
    const card = createCard(hass);
    tab(card, 'away').click();
    hass.push(integrationData({ schedule: 'Absent' }));
    assert.equal(bar(card), null);
  });

  test('the active-schedule marker follows a schedule activated elsewhere (automation…)', () => {
    const hass = fakeHass({ schedule: 'Normal' });
    const card = createCard(hass);
    hass.push(integrationData({ schedule: 'Vacances' }));
    assert.ok(tab(card, 'holiday').querySelector('.dot'));
    assert.equal(tab(card, 'normal').querySelector('.dot'), null);
  });
});

describe('editing a day', () => {
  test('adding a cut creates a slot with the other preset', () => {
    const card = createCard(fakeHass());
    card._split('climate.bureau', 0, 12 * 60);
    assert.deepEqual(day(card, 'climate.bureau', 0), ['00:00 eco', '12:00 comfort']);
    assert.equal(card._dirty, true);
  });

  test('a cut too close to an existing slot is refused', () => {
    const card = createCard(fakeHass());
    card._split('climate.salon', 0, 6 * 60 + 35); // 5 min after 06:30
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
  });

  test('moving a time cannot overlap the neighboring slot', () => {
    const card = createCard(fakeHass());
    card._sel = { climate: 'climate.salon', day: 0, idx: 1 }; // 06:30 → 08:30 comfort
    card._setEdge('start', '09:00');
    assert.deepEqual(day(card, 'climate.salon', 0).slice(0, 3), ['00:00 eco', '08:15 comfort', '08:30 eco']);
  });

  test('changing a slot preset merges it with identical neighbors', () => {
    const card = createCard(fakeHass());
    card._sel = { climate: 'climate.salon', day: 0, idx: 1 };
    card._action('preset', { preset: 'eco' });
    assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 eco', '17:30 comfort', '22:30 eco']);
  });
});

describe('copy / paste', () => {
  test('copying to Mon–Fri leaves the weekend untouched', () => {
    const card = createCard(fakeHass());
    card._split('climate.salon', 0, 12 * 60); // modified Monday: 12:00 comfort
    const monday = day(card, 'climate.salon', 0);
    card._copyDay('climate.salon', 0, 'weekdays');
    for (let d = 1; d < 5; d++) assert.deepEqual(day(card, 'climate.salon', d), monday);
    assert.deepEqual(day(card, 'climate.salon', 5), WEEKEND);
    assert.deepEqual(day(card, 'climate.salon', 6), WEEKEND);
  });

  test('copying to the other displayed thermostats (same day)', () => {
    const card = createCard(fakeHass());
    card._copyDay('climate.salon', 2, 'others');
    assert.deepEqual(day(card, 'climate.bureau', 2), WEEKDAY);
    assert.deepEqual(day(card, 'climate.bureau', 3), ['00:00 eco']);
  });

  test('pasting a copied day into another schedule and another thermostat', () => {
    const card = createCard(fakeHass());
    card._copyToClipboard('climate.salon', 0);
    card._schedule = 'away';
    card._pasteFromClipboard('climate.bureau', 1);
    assert.deepEqual(day(card, 'climate.bureau', 1, 'away'), WEEKDAY);
  });

  test('the clipboard survives a page reload', () => {
    const card = createCard(fakeHass());
    card._copyToClipboard('climate.salon', 0);
    cleanup();
    localStorage.setItem('chauffage-programme-card:clip', JSON.stringify(card._clip));
    const other = createCard(fakeHass());
    assert.equal(other._clip.label, 'Salon · Lundi (Normal)');
  });
});

describe('saving', () => {
  test('Save sends every schedule to HA and clears the "modified" state', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await card._save();

    const [msg] = hass.events;
    assert.equal(msg.type, 'chauffage/weeks/save');
    assert.deepEqual(msg.weeks['climate.bureau'].normal[0], [['00:00', 'eco'], ['12:00', 'comfort']]);
    assert.deepEqual(msg.weeks['climate.salon'].normal[0], WEEKDAY.map((s) => s.split(' ')));
    assert.equal(card._dirty, false);
  });

  test('Cancel goes back to the saved schedules', () => {
    const card = createCard(fakeHass());
    card._split('climate.salon', 0, 12 * 60);
    card._action('cancel', {});
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
  });
});

describe('choosing the displayed thermostats', () => {
  const click = (el, options = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, ...options }));
  const chip = (card, id) => card.shadowRoot.querySelector(`.chip[data-climate="${id}"]`);

  test('a click shows only that thermostat', () => {
    const card = createCard(fakeHass());
    click(chip(card, 'climate.bureau'));
    assert.deepEqual(card._shown, ['climate.bureau']);
  });

  test('Ctrl+click adds a thermostat', () => {
    const card = createCard(fakeHass(), { show: undefined });
    click(chip(card, 'climate.bureau'), { ctrlKey: true });
    assert.deepEqual(card._shown, ['climate.salon', 'climate.bureau']);
  });
});

describe('thermostat more-info dialog', () => {
  let received;
  const intercept = (e) => { received = e.detail.entityId; e.stopPropagation(); };
  beforeEach(() => { received = null; document.addEventListener('hass-more-info', intercept); });
  afterEach(() => document.removeEventListener('hass-more-info', intercept));

  test('the chip icon opens the thermostat without changing the selection', () => {
    const card = createCard(fakeHass());
    card.shadowRoot.querySelector('.chip[data-climate="climate.bureau"] .chip-open').click();
    assert.equal(received, 'climate.bureau');
    assert.deepEqual(card._shown, ['climate.salon', 'climate.bureau']);
  });

  test('the row name opens the thermostat', () => {
    const card = createCard(fakeHass());
    card.shadowRoot.querySelector('.name [data-more-info="climate.salon"]').click();
    assert.equal(received, 'climate.salon');
  });
});

describe('overrides from the card', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => mock.timers.reset());

  const override = { kind: 'temperature', value: 21.5, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };

  test('the override is shown on today’s row, in the active schedule tab', () => {
    const card = createCard(fakeHass({ overrides: { 'climate.salon': override } }));
    const zone = card.shadowRoot.querySelector('.override[data-climate="climate.salon"]');
    assert.ok(zone);
    assert.equal(zone.dataset.day, '0');
  });

  test('an override that has ended is no longer shown, before the integration removes it', () => {
    const ended = { ...override, end: '2026-10-12T09:59:00+02:00' };
    const card = createCard(fakeHass({ overrides: { 'climate.salon': ended } }));
    assert.equal(card.shadowRoot.querySelector('.override'), null);
  });

  test('shortening before now is clamped to now + 15 min', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass);
    card._setOverrideEnd('climate.salon', new Date('2026-10-12T09:00:00+02:00'));
    assert.equal(new Date(hass.events.at(-1).override.end).toISOString(), '2026-10-12T08:15:00.000Z');
  });

  test('"Reprendre le planning" removes the override', () => {
    const hass = fakeHass({ overrides: { 'climate.salon': override } });
    const card = createCard(hass);
    card._overrideSel = { climate: 'climate.salon', day: 0 };
    card._action('override-del', {});
    assert.deepEqual(hass.events.at(-1), { type: 'chauffage/override/set', entity_id: 'climate.salon', override: null });
  });
});
