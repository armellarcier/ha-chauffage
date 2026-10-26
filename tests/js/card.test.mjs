// Behavior of the custom:chauffage-programme-card card.
import { fakeHass, integrationData, createCard, cleanup, ChauffageProgrammeCard, PRESETS, WEEKDAY, WEEKEND } from './helpers.mjs';
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

  test('a redraw keeps the same ha-card: a new one has no height until it renders, and the page scrolled back to the top', () => {
    const card = createCard(fakeHass());
    const haCard = card.shadowRoot.querySelector('ha-card');
    card._openMenu('climate.salon', 1, 0, 0); // a redraw, as most clicks
    card.shadowRoot.querySelector('[data-act="view"][data-view="presets"]').click(); // another view
    assert.equal(card.shadowRoot.querySelector('ha-card'), haCard);
    assert.equal(card.shadowRoot.querySelectorAll('ha-card').length, 1);
  });

  test('a thermostat listed twice is shown once (#39)', () => {
    const card = createCard(fakeHass(), { thermostats: ['climate.salon', 'climate.bureau', { entity: 'climate.salon', name: 'Séjour' }] });
    assert.deepEqual(card._thermostats.map((t) => t.entity), ['climate.salon', 'climate.bureau']);
    assert.equal(card.shadowRoot.querySelectorAll('.chip[data-climate="climate.salon"]').length, 1);
  });
});

describe('today', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-16T10:00:00+02:00') })); // a Friday
  afterEach(() => mock.timers.reset());

  test('today stands out among the days and thermostats: its whole row is tinted, with a border on each side, thicker on the left', () => {
    const card = createCard(fakeHass());
    const today = card.shadowRoot.querySelectorAll('.dgroup.today');
    assert.equal(today.length, 1);
    assert.equal(today[0].querySelector('.day').textContent, 'Lun–Ven'); // Friday, in the row of its days
    assert.equal(today[0].querySelectorAll('.bar').length, 2); // every thermostat of the day
    const row = card.shadowRoot.querySelector('style').textContent.match(/\.dgroup\.today \{([^}]*)\}/);
    assert.ok(row);
    assert.match(row[1], /border:1px solid var\(--primary-color\)/);
    assert.match(row[1], /border-left-width:4px/);
    assert.match(row[1], /border-top-width:0/);
    assert.match(row[1], /border-bottom-width:0/);
    assert.match(row[1], /background:color-mix\(in srgb, var\(--primary-color\)/);
  });

  test('the current time is one line across all the thermostats of today, whatever their number', () => {
    const card = createCard(fakeHass());
    const today = card.shadowRoot.querySelector('.dgroup.today');
    assert.equal(today.querySelectorAll('.bar .now').length, 2);
    assert.equal(card.shadowRoot.querySelectorAll('.now').length, 2); // today only
    // Each line reaches the next bar, even when the bars are thinner than their row (3 thermostats
    // or more: 24 px bars in 28 px rows, 5 px apart)
    const css = card.shadowRoot.querySelector('style').textContent;
    const reach = (side, edge) => Number(css.match(new RegExp(`\\.sub:not\\(:${side}-child\\) \\.now \\{[^}]*${edge}:-(\\d+)px`))[1]);
    assert.ok(reach('first', 'top') + 3 >= 2 + 5 + 2);
    assert.ok(reach('last', 'bottom') + 3 >= 2 + 5 + 2);
  });

  test('the names of the days and of the thermostats are aligned against their bars', () => {
    const card = createCard(fakeHass());
    const css = card.shadowRoot.querySelector('style').textContent;
    assert.match(css, /\.day \{[^}]*text-align:right/);
    assert.match(css, /\.name \{[^}]*text-align:right/);
  });

  test('the column of the thermostat names is as wide as the longest name shown, up to a maximum', () => {
    const card = createCard(fakeHass());
    // Every cell of the column (and the scale above it) holds the names shown, invisible: each row
    // sizes its column on the longest one, so all rows have the same column
    const cells = [...card.shadowRoot.querySelectorAll('.scale .name, .sub .name')];
    assert.equal(cells.length, 1 + 2 * 2); // Mon–Fri and Sat–Sun
    for (const cell of cells) {
      const sizer = cell.querySelector('.sizer');
      assert.equal(sizer.getAttribute('aria-hidden'), 'true');
      assert.deepEqual([...sizer.children].map((s) => s.textContent), ['Salon', 'Bureau']);
    }
    const css = card.shadowRoot.querySelector('style').textContent;
    assert.match(css, /\.multi \.sub \{ grid-template-columns:fit-content\(100px\) 1fr 28px; \}/);
    assert.match(css, /\.multi \.scale \{ grid-template-columns:var\(--day-w\) fit-content\(100px\) 1fr 28px; \}/);
  });

  test('the current time line has a triangle at each end, like a playhead, in the text color with a light shadow', () => {
    const card = createCard(fakeHass());
    const css = card.shadowRoot.querySelector('style').textContent;
    const line = css.match(/\n {2}\.now \{([^}]*)\}/)[1];
    // Not the accent color: orange by default, like the default Confort preset
    assert.match(line, /color:var\(--primary-text-color\)/);
    assert.match(line, /filter:drop-shadow\(/);
    assert.match(css, /\.sub:first-child \.now::before \{[^}]*border-top:\d+px solid/); // pointing down
    assert.match(css, /\.sub:last-child \.now::after \{[^}]*border-bottom:\d+px solid/); // pointing up
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

  test('the active schedule\'s name opens the select of the active schedule (#39)', () => {
    let received = null;
    const intercept = (e) => { received = e.detail.entityId; e.stopPropagation(); };
    document.addEventListener('hass-more-info', intercept);
    try {
      const card = createCard(fakeHass({ schedule: 'Normal' }));
      tab(card, 'away').click();
      bar(card).querySelector('[data-more-info="select.chauffage_schedule"]').click();
      assert.equal(received, 'select.chauffage_schedule');
    } finally {
      document.removeEventListener('hass-more-info', intercept);
    }
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

  test('a cut never moves the next slot: its preset differs from both neighbors', () => {
    const card = createCard(fakeHass());
    card._split('climate.salon', 0, 12 * 60); // in 08:30 eco, before 17:30 comfort
    assert.deepEqual(day(card, 'climate.salon', 0),
      ['00:00 eco', '06:30 comfort', '08:30 eco', '12:00 boost', '17:30 comfort', '22:30 eco']);
  });

  test('with two presets, a cut adds a slot of the other one, then goes back to the slot\'s preset', () => {
    const card = createCard(fakeHass({ data: { ...integrationData(), presets: PRESETS().slice(0, 2) } }));
    card._split('climate.salon', 0, 12 * 60); // 08:30 eco until 17:30 comfort
    assert.deepEqual(day(card, 'climate.salon', 0),
      ['00:00 eco', '06:30 comfort', '08:30 eco', '12:00 comfort', '14:45 eco', '17:30 comfort', '22:30 eco']);
  });

  test('with two presets, a cut without room to go back to the slot\'s preset is refused', () => {
    const card = createCard(fakeHass({ data: { ...integrationData(), presets: PRESETS().slice(0, 2) } }));
    card._split('climate.salon', 0, 17 * 60 + 15); // 15 min before 17:30 comfort
    assert.deepEqual(day(card, 'climate.salon', 0), WEEKDAY);
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
    const card = createCard(fakeHass(), { group_days: false });
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
    assert.equal(other._clip.label, 'Salon · Lun–Ven (Normal)'); // the days of its row
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
    assert.equal(msg.weeks['climate.salon'], undefined, 'not changed: not sent');
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

  test('a chip only names its thermostat, with a mark when it has a temporary setpoint (#39)', () => {
    const override = { kind: 'preset', value: 'boost', preset: 'boost', start: new Date(Date.now() - 600000).toISOString(), end: new Date(Date.now() + 3600000).toISOString() };
    const card = createCard(fakeHass({ overrides: { 'climate.bureau': override } }));
    const text = (id) => chip(card, id).textContent.replace(/\s+/g, ' ').trim();
    assert.equal(text('climate.salon'), 'Salon'); // no temperature nor preset: the "Now" view says it
    assert.equal(text('climate.bureau'), 'Bureau ⏱');
  });
});

describe('names of the thermostats', () => {
  const chip = (card, climate) => card.shadowRoot.querySelector(`.chip[data-climate="${climate}"]`).firstChild.textContent.trim();
  // Like HA from 2025.10: the name of the card's config (text, or pieces such as the area) made
  // into the name shown, as the Tile card does
  const withNames = (hass) => Object.assign(hass, {
    formatEntityName: (st, name) => {
      if (typeof name === 'string') return name;
      if (Array.isArray(name)) return name.map((p) => (p.type === 'area' ? 'Rez-de-chaussée' : st.attributes.friendly_name)).join(' ');
      return st.attributes.friendly_name;
    },
  });

  test('a thermostat is shown with its own name, or the name given in the card', () => {
    const card = createCard(fakeHass(), { thermostats: [{ entity: 'climate.salon', name: 'Séjour' }, 'climate.bureau'] });
    assert.equal(chip(card, 'climate.salon'), 'Séjour');
    assert.equal(chip(card, 'climate.bureau'), 'Bureau');
  });

  test('a name made of pieces (area, device, entity) is shown as Home Assistant makes it', () => {
    const card = createCard(withNames(fakeHass()), { thermostats: [{ entity: 'climate.salon', name: [{ type: 'area' }, { type: 'entity' }] }, 'climate.bureau'] });
    assert.equal(chip(card, 'climate.salon'), 'Rez-de-chaussée Salon');
    assert.equal(chip(card, 'climate.bureau'), 'Bureau');
  });

  test('before Home Assistant 2025.10, a name made of pieces shows the thermostat\'s own name', () => {
    const card = createCard(fakeHass(), { thermostats: [{ entity: 'climate.salon', name: [{ type: 'area' }, { type: 'entity' }] }] });
    assert.equal(chip(card, 'climate.salon'), 'Salon');
  });
});

describe('thermostat more-info dialog', () => {
  let received;
  const intercept = (e) => { received = e.detail.entityId; e.stopPropagation(); };
  beforeEach(() => { received = null; document.addEventListener('hass-more-info', intercept); });
  afterEach(() => document.removeEventListener('hass-more-info', intercept));

  test('the chip\'s button opens the thermostat without changing the selection', () => {
    const card = createCard(fakeHass());
    card.shadowRoot.querySelector('.chip[data-climate="climate.bureau"] .chip-open').click();
    assert.equal(received, 'climate.bureau');
    assert.deepEqual(card._shown, ['climate.salon', 'climate.bureau']);
  });

  test('the name in a paused notice opens the thermostat (#39)', () => {
    const card = createCard(fakeHass({ paused: ['climate.salon'] }));
    card.shadowRoot.querySelector('.paused-note [data-more-info="climate.salon"]').click();
    assert.equal(received, 'climate.salon');
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
