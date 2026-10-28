// Identical days shown on one row, edited as a whole (#11).
import { fakeHass, createCard, cleanup, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { serializeDay, makeLocale, MORE_INFO_CFG } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const day = (card, climate, d) => serializeDay(card._week(climate)[d]);
const $ = (card, sel) => card.shadowRoot.querySelector(sel);
const labels = (card) => [...card.shadowRoot.querySelectorAll('.dgroup .day')].map((el) => el.textContent);
const RETIRED = { 'climate.salon': { Normal: Array(7).fill(WEEKEND) } };
const OTHER = ['00:00 eco', '10:00 comfort', '12:00 eco'];
const user = (prefs) => ({ locale: { time_format: 'language', number_format: 'language', ...prefs } });

// Monday 12 October 2026, 10:00
beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
// The more-info block takes the options of the last card configured
afterEach(() => { mock.timers.reset(); cleanup(); MORE_INFO_CFG.group_days = undefined; });

describe('rows of identical days', () => {
  test('the days with the same slots share a row, named after its days', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    assert.deepEqual(labels(card), ['Lun–Ven', 'Sam, Dim']);
    assert.equal(card.shadowRoot.querySelectorAll('.bar').length, 2);
  });

  test('the same day all week is one row, named from the first day to the last one', () => {
    const card = createCard(fakeHass({ weeks: RETIRED }), { show: ['climate.salon'] });
    assert.deepEqual(labels(card), ['Lun–Dim']);
    // The menus have the room to say it in words
    $(card, '[data-act="menu"][data-day="0"]').click();
    assert.match($(card, '.menu .mh').textContent, /Tous les jours/);
  });

  test('a day that differs gets its own row; days apart are named one by one', () => {
    const week = [WEEKDAY, WEEKDAY, OTHER, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
    const card = createCard(fakeHass({ weeks: { 'climate.salon': { Normal: week } } }), { show: ['climate.salon'] });
    assert.deepEqual(labels(card), ['Lun, Mar, Jeu, Ven', 'Mer', 'Sam, Dim']);
    const alternate = [WEEKDAY, OTHER, WEEKDAY, OTHER, WEEKDAY, OTHER, OTHER];
    const other = createCard(fakeHass({ weeks: { 'climate.salon': { Normal: alternate } } }), { show: ['climate.salon'] });
    assert.deepEqual(labels(other), ['Lun, Mer, Ven', 'Mar, Jeu, Sam, Dim']);
  });

  test('the days of a row follow the first day of the week, across its end', () => {
    const loc = makeLocale(user({ language: 'en', first_weekday: 'sunday' }));
    assert.equal(loc.daysLabel([6, 5]), 'Sat, Sun');
    assert.equal(loc.daysLabel([4, 5, 6]), 'Fri–Sun');
    assert.equal(loc.daysLabel([6, 0, 1, 2]), 'Sun–Wed');
    assert.equal(loc.daysLabel([3]), 'Thu');
    assert.equal(loc.daysLabel([3], 'long'), 'Thursday');
    const monday = makeLocale(user({ language: 'en', first_weekday: 'monday' }));
    assert.equal(monday.daysLabel([6, 0, 1]), 'Mon, Tue, Sun'); // a week starting on Monday keeps its order
    assert.equal(monday.daysLabel([0, 1, 3, 4, 5, 6]), 'Mon, Tue, Thu–Sun');
    assert.equal(monday.daysLabel([0, 1, 2, 3, 4, 5, 6]), 'Mon–Sun');
    assert.equal(loc.daysLabel([0, 1, 2, 3, 4, 5, 6]), 'Sun–Sat');
    assert.equal(monday.daysLabel([0, 1, 2, 3, 4, 5, 6], 'long'), 'Every day');
  });

  test('with several thermostats, a row holds the days identical for each of them', () => {
    const weeks = {
      'climate.salon': { Normal: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] },
      'climate.bureau': { Normal: [WEEKDAY, WEEKDAY, OTHER, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] },
    };
    const card = createCard(fakeHass({ weeks }));
    assert.deepEqual(labels(card), ['Lun, Mar, Jeu, Ven', 'Mer', 'Sam, Dim']);
    assert.equal($(card, '.dgroup').querySelectorAll('.bar').length, 2);
  });

  test('the column of the days is as wide as the longest name of a row', () => {
    const short = createCard(fakeHass({ weeks: { 'climate.salon': { Normal: [WEEKDAY, OTHER, WEEKDAY, OTHER, WEEKDAY, OTHER, WEEKEND] } } }), { show: ['climate.salon'] });
    const long = createCard(fakeHass(), { show: ['climate.salon'] });
    const width = (card) => Number($(card, '.days').style.getPropertyValue('--day-w').replace('px', ''));
    assert.ok(width(short) > width(long));
  });
});

// jsdom does not lay out: these tests read the rules of the stylesheet
describe('the width of the card', () => {
  const css = () => $(createCard(fakeHass(), { show: ['climate.salon'] }), 'style').textContent;
  // The block of rules that starts with `at`
  const block = (at) => {
    const text = css();
    const start = text.indexOf(`${at} {`);
    assert.ok(start >= 0, `no ${at}`);
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i++) {
      if (text[i] === '{') depth++;
      if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
    }
    return '';
  };

  test('the layout follows the width of the card, not of the screen', () => {
    assert.match(css(), /\.days \{[^}]*container-type:inline-size/);
    assert.doesNotMatch(css(), /@media \([a-z-]*width/);
  });

  test('a narrow card keeps the column of the days to 56 px, so that the bars keep the width', () => {
    assert.match(block('@container (max-width:499px)'), /\.dgroup \{ grid-template-columns:min\(var\(--day-w\), 56px\) 1fr; \}/);
  });

  test('with several thermostats, the days are named above their rows, beside them only on a wide card', () => {
    const header = block('@container (max-width:699px)');
    assert.match(header, /\.multi \.dgroup \{ grid-template-columns:1fr;/);
    assert.match(header, /\.multi \.scale > div:first-child \{ display:none; \}/);
  });
});

describe('editing a row', () => {
  test('editing a row edits each of its days', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    card._split('climate.salon', 0, 12 * 60);
    const monday = day(card, 'climate.salon', 0);
    assert.notDeepEqual(monday, WEEKDAY);
    for (const d of [1, 2, 3, 4]) assert.deepEqual(day(card, 'climate.salon', d), monday);
    assert.deepEqual(day(card, 'climate.salon', 5), WEEKEND);
    assert.deepEqual(labels(card), ['Lun–Ven', 'Sam, Dim']);
  });

  test('a slot\'s popover edits the whole row, and names it', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    card._sel = { climate: 'climate.salon', day: 5, idx: 1 };
    card._render();
    assert.match($(card, '.editor .ed-head strong').textContent, /Sam, Dim/);
    $(card, '.editor [data-preset="boost"]').click();
    assert.deepEqual(day(card, 'climate.salon', 6), ['00:00 eco', '08:00 boost', '23:00 eco']);
  });

  test('a slot edited until its row joins another one stays selected, its popover open', () => {
    const boosted = ['00:00 eco', '06:30 boost', '08:30 eco', '17:30 comfort', '22:30 eco'];
    const week = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, boosted, boosted];
    const card = createCard(fakeHass({ weeks: { 'climate.salon': { Normal: week } } }), { show: ['climate.salon'] });
    card._sel = { climate: 'climate.salon', day: 5, idx: 1 };
    card._render();
    $(card, '.editor [data-preset="comfort"]').click(); // the weekend is now the weekdays
    assert.deepEqual(labels(card), ['Lun–Dim']);
    assert.ok($(card, '.seg.sel'));
    assert.ok($(card, '.editor'));
  });

  test('pasting on a row pastes on each of its days', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    card._copyToClipboard('climate.salon', 5);
    card._pasteFromClipboard('climate.salon', 0);
    for (let d = 0; d < 7; d++) assert.deepEqual(day(card, 'climate.salon', d), WEEKEND);
    assert.deepEqual(labels(card), ['Lun–Dim']);
  });

  test('copying a row to the other thermostats copies each of its days', () => {
    const card = createCard(fakeHass());
    card._copyDay('climate.salon', 0, 'others');
    for (const d of [0, 1, 2, 3, 4]) assert.deepEqual(day(card, 'climate.bureau', d), WEEKDAY);
    assert.deepEqual(day(card, 'climate.bureau', 5), ['00:00 eco']);
  });

  test('copying a day onto other days joins their rows', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    $(card, '[data-act="menu"][data-day="0"]').click();
    assert.match($(card, '.menu .mh').textContent, /Lun–Ven/);
    $(card, '.menu [data-act="fill-all"]').click();
    assert.deepEqual(labels(card), ['Lun–Dim']);
  });
});

describe('grouping the days or not', () => {
  const chip = (card) => $(card, '[data-act="group-days"]');

  test('"Group days" shows each day on its own row, remembered on the device', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    assert.ok(chip(card).classList.contains('on'));
    chip(card).click();
    assert.equal(labels(card).length, 7);
    assert.ok(!chip(card).classList.contains('on'));
    const again = createCard(fakeHass(), { show: ['climate.salon'] });
    assert.equal(labels(again).length, 7);
  });

  test('a day edited on its own keeps its own row once the days are grouped again', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    chip(card).click();
    card._split('climate.salon', 2, 12 * 60); // Wednesday only
    assert.deepEqual(day(card, 'climate.salon', 1), WEEKDAY);
    chip(card).click();
    assert.deepEqual(labels(card), ['Lun, Mar, Jeu, Ven', 'Mer', 'Sam, Dim']);
  });

  test('the card option `group_days: false` shows each day, until the user groups them', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'], group_days: false });
    assert.equal(labels(card).length, 7);
    chip(card).click();
    assert.deepEqual(labels(card), ['Lun–Ven', 'Sam, Dim']);
  });

  test('the history shows each day: the days are no longer grouped, and grouping them hides it', () => {
    const hass = fakeHass({ reply: (msg) => (msg.type === 'chauffage/history' ? {} : null) });
    const card = createCard(hass, { show: ['climate.salon'] });
    $(card, '[data-act="history"]').click();
    assert.equal(labels(card).length, 7);
    assert.ok(!chip(card).classList.contains('on'));
    chip(card).click();
    assert.ok(!card._history.shown);
    assert.ok(!$(card, '[data-act="history"]').classList.contains('on'));
    assert.deepEqual(labels(card), ['Lun–Ven', 'Sam, Dim']);
    $(card, '[data-act="history"]').click();
    $(card, '[data-act="history"]').click(); // hidden again: the days are grouped again
    assert.deepEqual(labels(card), ['Lun–Ven', 'Sam, Dim']);
  });
});

describe('today in a row of days', () => {
  // From Sunday 20:00 to Tuesday 01:00: a piece on Sunday (past), all Monday, and Tuesday morning
  const overrides = { 'climate.salon': { kind: 'temperature', value: 21.5, start: '2026-10-11T20:00:00+02:00', end: '2026-10-13T01:00:00+02:00' } };
  const weeks = { 'climate.salon': { Normal: [WEEKDAY, WEEKEND, WEEKEND, WEEKEND, WEEKEND, WEEKEND, WEEKEND] } };

  test('the row holding today stands out, with the current time', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    const today = card.shadowRoot.querySelectorAll('.dgroup.today');
    assert.equal(today.length, 1);
    assert.equal(today[0].querySelector('.day').textContent, 'Lun–Ven');
    assert.equal(card.shadowRoot.querySelectorAll('.now').length, 1);
  });

  test('an override on a day in the middle of its row opens its popover', () => {
    mock.timers.setTime(new Date('2026-10-14T10:00:00+02:00').getTime()); // Wednesday, in Mon–Fri
    const midday = { 'climate.salon': { kind: 'temperature', value: 21.5, start: '2026-10-14T09:00:00+02:00', end: '2026-10-14T18:00:00+02:00' } };
    const card = createCard(fakeHass({ overrides: midday }), { show: ['climate.salon'] });
    $(card, '.override').click();
    assert.ok($(card, '.override.sel'));
    assert.ok($(card, '.editor.override-ed'));
  });

  test('its menu sets a temporary setpoint', () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] });
    card._openMenu('climate.salon', 0, 0, 0);
    assert.ok($(card, '.menu [data-act="override-new"]'));
    card._openMenu('climate.salon', 0, 0, 0); // closes it
    card._openMenu('climate.salon', 5, 0, 0);
    assert.equal($(card, '.menu [data-act="override-new"]'), null);
  });

  test('an override shows today, and on another row where it ends', () => {
    const card = createCard(fakeHass({ weeks, overrides }), { show: ['climate.salon'] });
    assert.deepEqual(labels(card), ['Lun', 'Mar–Dim']);
    const pieces = [...card.shadowRoot.querySelectorAll('.override')];
    assert.deepEqual(pieces.map((p) => p.dataset.day), ['0', '1']);
    assert.ok(pieces[1].querySelector('.override-handle'));
  });

  test('an override for the week also shows on a row of the days it covers', () => {
    const week = { 'climate.salon': { kind: 'temperature', value: 19, start: '2026-10-12T08:00:00+02:00', end: '2026-10-18T01:00:00+02:00' } };
    const three = { 'climate.salon': { Normal: [WEEKDAY, OTHER, OTHER, OTHER, OTHER, WEEKEND, WEEKEND] } };
    const card = createCard(fakeHass({ weeks: three, overrides: week }), { show: ['climate.salon'] });
    assert.deepEqual(labels(card), ['Lun', 'Mar–Ven', 'Sam, Dim']);
    const pieces = [...card.shadowRoot.querySelectorAll('.override')];
    assert.deepEqual(pieces.map((p) => p.dataset.day), ['0', '1', '6']); // Sunday: where it ends
    assert.equal(pieces[1].style.width, '100%');
    assert.ok(pieces[2].querySelector('.override-handle'));
  });
});

describe('the week in the more-info block', () => {
  const block = (hass) => {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    return el;
  };
  const rows = (el) => [...el.shadowRoot.querySelectorAll('.row span')].map((s) => s.textContent);

  test('identical days share a row, like in the schedule card', () => {
    assert.deepEqual(rows(block(fakeHass())), ['Lun–Ven', 'Sam, Dim']);
    assert.deepEqual(rows(block(fakeHass({ weeks: RETIRED }))), ['Lun–Dim']);
  });

  test('an override shows today, and on another row where it ends', () => {
    const overrides = { 'climate.salon': { kind: 'temperature', value: 21.5, start: '2026-10-11T20:00:00+02:00', end: '2026-10-13T01:00:00+02:00' } };
    const weeks = { 'climate.salon': { Normal: [WEEKDAY, WEEKEND, WEEKEND, WEEKEND, WEEKEND, WEEKEND, WEEKEND] } };
    const el = block(fakeHass({ weeks, overrides }));
    assert.deepEqual(rows(el), ['Lun', 'Mar–Dim']);
    const widths = [...el.shadowRoot.querySelectorAll('.row')].map((r) => r.querySelector('.override').style.width);
    assert.deepEqual(widths, ['100%', '4.167%']); // all Monday, Tuesday until 01:00
  });

  test('`group_days: false` shows each day', () => {
    MORE_INFO_CFG.group_days = false;
    assert.equal(rows(block(fakeHass())).length, 7);
  });
});
