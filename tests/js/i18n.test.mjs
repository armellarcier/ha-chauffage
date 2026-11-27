// Internationalization: translations, language choice and locale-aware formats (hass.locale).
import { fakeHass, createCard, cleanup, typeTime, pressKey } from './helpers.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { day, settle } from './driver.mjs';
import { I18N, makeLocale } from '../../frontend/src/index.ts';

const user = (locale, extra = {}) => ({ locale: { time_format: 'language', number_format: 'language', first_weekday: 'language', ...locale }, ...extra });

// Every key path of a translation object ("presets.eco", "destinations.all"…)
const keyPaths = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? keyPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('translations', () => {
  test('English and French have exactly the same keys', async () => {
    assert.deepEqual(keyPaths(I18N.fr).sort(), keyPaths(I18N.en).sort());
  });

  test('placeholders are the same in both languages', async () => {
    const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
    for (const key of keyPaths(I18N.en)) {
      const get = (lang) => key.split('.').reduce((o, k) => o[k], I18N[lang]);
      assert.deepEqual(placeholders(get('fr')), placeholders(get('en')), key);
    }
  });
});

describe('language', () => {
  test('any French variant gives French, anything else English', async () => {
    assert.equal(makeLocale(user({ language: 'fr-CA' })).lang, 'fr');
    assert.equal(makeLocale(user({ language: 'en-GB' })).lang, 'en');
    assert.equal(makeLocale(user({ language: 'de' })).lang, 'en');
    assert.equal(makeLocale(null).lang, 'en');
  });

  test('the card can force a language', async () => {
    assert.equal(makeLocale(user({ language: 'en' }), 'fr').lang, 'fr');
  });

  test('day names come from Intl, in the UI language', async () => {
    const fr = makeLocale(user({ language: 'fr' }));
    assert.equal(fr.days[0], 'Lundi');
    assert.equal(fr.daysShort[0], 'Lun');
    const en = makeLocale(user({ language: 'en' }));
    assert.equal(en.days[6], 'Sunday');
    assert.equal(en.daysShort[6], 'Sun');
  });
});

describe('time format (profile → "Time format")', () => {
  test('French follows the language: 24 h, two-digit hours', async () => {
    const fr = makeLocale(user({ language: 'fr' }));
    assert.equal(fr.time(6 * 60 + 30), '06:30');
    assert.equal(fr.time(1440), '24:00');
  });

  test('US English follows the language: 12 h', async () => {
    const en = makeLocale(user({ language: 'en-US' }));
    assert.equal(en.hour12, true);
    assert.match(en.time(17 * 60 + 30), /^5:30\s?PM$/);
  });

  test('the profile setting wins over the language', async () => {
    assert.equal(makeLocale(user({ language: 'en-US', time_format: '24' })).time(6 * 60 + 30), '06:30');
    assert.equal(makeLocale(user({ language: 'fr', time_format: '12' })).hour12, true);
  });
});

describe('number format (profile → "Number format")', () => {
  test('follows the language by default', async () => {
    assert.equal(makeLocale(user({ language: 'fr' })).number(21.5), '21,5');
    assert.equal(makeLocale(user({ language: 'en' })).number(21.5), '21.5');
  });

  test('the profile setting wins over the language', async () => {
    assert.equal(makeLocale(user({ language: 'fr', number_format: 'comma_decimal' })).number(21.5), '21.5');
    assert.equal(makeLocale(user({ language: 'en', number_format: 'decimal_comma' })).number(21.5), '21,5');
  });
});

describe('first day of the week (profile → "First day of the week")', () => {
  test('explicit setting', async () => {
    assert.deepEqual(makeLocale(user({ language: 'fr', first_weekday: 'sunday' })).dayOrder, [6, 0, 1, 2, 3, 4, 5]);
    assert.deepEqual(makeLocale(user({ language: 'en-US', first_weekday: 'monday' })).dayOrder, [0, 1, 2, 3, 4, 5, 6]);
  });

  test('follows the language when Intl knows it', async (t) => {
    const loc = new Intl.Locale('en-US');
    if (typeof loc.getWeekInfo !== 'function' && !loc.weekInfo) return t.skip('Intl week info not available');
    assert.equal(makeLocale(user({ language: 'en-US' })).dayOrder[0], 6); // Sunday
    assert.equal(makeLocale(user({ language: 'fr' })).dayOrder[0], 0); // Monday
  });
});

describe('the card in English', () => {
  afterEach(() => cleanup());
  const english = { language: 'en', time_format: '12', number_format: 'language', first_weekday: 'sunday' };

  test('texts, presets and Sunday-first rows', async () => {
    const card = createCard(fakeHass({ locale: english }), { show: undefined }); await settle();
    const root = card.shadowRoot;
    assert.equal(root.querySelector('[data-act="multi-sel"]').textContent, 'Multiple');
    assert.match(root.querySelector('.legend').textContent, /Frost protection.*Eco.*Comfort.*Boost/);
    assert.equal(root.querySelector('.dgroup .day').textContent, 'Sat, Sun'); // Sunday's row first
    assert.match(root.querySelector('.bar[data-day="0"] .seg[data-idx="1"]').title, /6:30\s?AM/); // Monday
  });

  test('the "activate schedule" bar', async () => {
    const card = createCard(fakeHass({ locale: english })); await settle();
    card.shadowRoot.querySelector('.tab[data-schedule="away"]').click(); await settle();
    assert.match(card.shadowRoot.querySelector('.schedule-bar').textContent, /Active schedule: Normal/);
    assert.match(card.shadowRoot.querySelector('.schedule-bar').textContent, /Activate “Absent”/);
  });

  test('switching the HA language redraws the card in the new language', async () => {
    const hass = fakeHass({ locale: english });
    const card = createCard(hass); await settle();
    card.hass = { ...hass, locale: { ...english, language: 'fr' }, language: 'fr' }; await settle();
    assert.equal(card.shadowRoot.querySelector('[data-act="multi-sel"]').textContent, 'Plusieurs');
  });
});

describe('the more-info block in English', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('current and next slot, 12 h clock', async () => {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon'; await settle();
    el.hass = fakeHass({ locale: { language: 'en-US', time_format: 'language', number_format: 'language', first_weekday: 'language' },
      planned: { 'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' } } }); await settle();
    assert.match(el.shadowRoot.textContent.replace(/\s+/g, ' '), /Follows the schedule: Eco until 5:30\s?PM, then Comfort/);
  });

  test('a next preset on another day, and none all week', async () => {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon'; await settle();
    const english = { language: 'en-GB', time_format: 'language', number_format: 'language', first_weekday: 'language' };
    el.hass = fakeHass({ locale: english, planned: { 'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-13T06:30:00+02:00' } } }); await settle();
    assert.match(el.shadowRoot.textContent.replace(/\s+/g, ' '), /Follows the schedule: Eco until 06:30 \(tomorrow\), then Comfort/);
    el.hass = fakeHass({ locale: english, planned: { 'climate.salon': { preset: 'eco', next_preset: null, next_start: null } } }); await settle();
    assert.match(el.shadowRoot.textContent.replace(/\s+/g, ' '), /Follows the schedule: Eco all week/);
  });
});

// A browser shows <input type="time"> in the format of its own language, whatever the profile
// says (#63): the card's time fields follow the profile's format
describe('the time fields follow the profile\'s time format', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });

  const override = { target: { temperature: 21.5 }, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00' };
  const english = (time_format) => ({ language: 'en-US', time_format, number_format: 'language', first_weekday: 'language' });
  const slotEnd = async (card) => {
    await settle();
    card.shadowRoot.querySelector('.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click(); await settle(); // 06:30 → 08:30
    return card.shadowRoot.querySelector('.editor input.time[data-edge="end"]');
  };

  // The times are written by Intl: a narrow space before AM / PM in recent browsers
  const time12 = (text) => new RegExp(`^${text.replace(' ', '\\s')}$`);

  test('a slot\'s times: 24 h in English when the profile says so, 12 h otherwise', async () => {
    assert.equal((await slotEnd(createCard(fakeHass({ locale: english('24') }), { show: ['climate.salon'] }))).value, '08:30'); await settle();
    cleanup();
    assert.match((await slotEnd(createCard(fakeHass({ locale: english('language') }), { show: ['climate.salon'] }))).value, time12('8:30 AM')); await settle();
  });

  test('a time typed on a 12 h clock, in the afternoon', async () => {
    const card = createCard(fakeHass({ locale: english('12') }), { show: ['climate.salon'] }); await settle();
    typeTime(await slotEnd(card), '515p'); await settle();
    assert.deepEqual(day(card, 'climate.salon', 0).slice(1, 3), ['06:30 comfort', '17:15 eco']);
  });

  test('on a 12 h clock, a time typed without AM / PM keeps the period of the field', async () => {
    const card = createCard(fakeHass({ locale: english('12') }), { show: ['climate.salon'] }); await settle();
    card.shadowRoot.querySelector('.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="3"]').click(); await settle(); // 17:30 → 22:30
    const end = card.shadowRoot.querySelector('.editor input.time[data-edge="end"]');
    assert.match(end.value, time12('10:30 PM'));
    typeTime(end, '1100'); await settle();
    assert.equal(day(card, 'climate.salon', 0)[4], '23:00 eco');
  });

  test('on a 12 h clock, a time typed past 12 is read on 24 h', async () => {
    const card = createCard(fakeHass({ locale: english('12') }), { show: ['climate.salon'] }); await settle();
    const end = await slotEnd(card);
    typeTime(end, '1715'); await settle();
    assert.equal(day(card, 'climate.salon', 0)[2], '17:15 eco');
  });

  test('a time is shown again in the profile\'s format once applied', async () => {
    const card = createCard(fakeHass(), { show: ['climate.salon'] }); await settle(); // French, 24 h
    typeTime(await slotEnd(card), '9h'); await settle();
    assert.equal(card.shadowRoot.querySelector('.editor input.time[data-edge="end"]').value, '09:00');
  });

  test('on a 12 h clock, ↑ on AM / PM switches the period', async () => {
    const card = createCard(fakeHass({ locale: english('12') }), { show: ['climate.salon'] }); await settle();
    const end = await slotEnd(card); // 8:30 AM
    end.focus();
    end.setSelectionRange(6, 6);
    pressKey(end, 'ArrowUp'); await settle();
    assert.match(end.value, time12('8:30 PM'));
  });

  test('on a 12 h clock, 12 typed without AM / PM is noon', async () => {
    const card = createCard(fakeHass({ locale: english('12') }), { show: ['climate.salon'] }); await settle();
    typeTime(await slotEnd(card), '1230'); await settle(); // in an 8:30 AM field
    assert.equal(day(card, 'climate.salon', 0)[2], '12:30 eco');
  });

  test('in a language that writes 08.30, ↑ on the hours moves an hour', async () => {
    const card = createCard(fakeHass({ locale: { ...english('24'), language: 'fi' } }), { show: ['climate.salon'] }); await settle();
    const end = await slotEnd(card);
    assert.equal(end.value, '08.30');
    end.focus();
    end.setSelectionRange(1, 1);
    pressKey(end, 'ArrowUp'); await settle();
    assert.equal(end.value, '09.30');
  });

  test('a time field is as wide as the times of the profile\'s format', async () => {
    const width = async (language) => Number(/(\d+)ch/.exec((await slotEnd(createCard(fakeHass({ locale: { ...english('12'), language } }), { show: ['climate.salon'] }))).style.width)[1]);
    assert.ok(await width('es-US') > await width('en-US'), '"10:45 p. m." is longer than "10:45 PM"');
  });

  test('on a 12 h clock, the field opens the number keypad too', async () => {
    const card = createCard(fakeHass({ locale: english('12') }), { show: ['climate.salon'] }); await settle();
    assert.equal((await slotEnd(card)).inputMode, 'numeric');
  });

  test('the end of an override, in the card\'s popover and in the more-info block', async () => {
    const hass = fakeHass({ locale: english('24'), overrides: { 'climate.salon': override } });
    const card = createCard(hass, { show: ['climate.salon'] }); await settle();
    card.shadowRoot.querySelector('.override[data-climate="climate.salon"]').click(); await settle();
    assert.equal(card.shadowRoot.querySelector('.override-ed input.time[data-override-end]').value, '11:30');
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon'; await settle();
    el.hass = fakeHass({ locale: english('12'), overrides: { 'climate.salon': override } }); await settle();
    assert.match(el.shadowRoot.querySelector('input.time[data-override-end]').value, time12('11:30 AM'));
  });

  test("why an override from a change by hand ends then, in the card's popover", async () => {
    const slot = createCard(fakeHass({ locale: english('24'), overrides: { 'climate.salon': { ...override, ends_at: 'next_slot' } } }), { show: ['climate.salon'] }); await settle();
    slot.shadowRoot.querySelector('.override[data-climate="climate.salon"]').click(); await settle();
    assert.match(slot.shadowRoot.querySelector('.override-ed').textContent, /today, at the next slot ⚙ · 1 h 30 left · then Eco \(schedule\)/);
    const duration = createCard(fakeHass({ locale: english('24'), overrides: { 'climate.salon': { ...override, ends_at: 'duration' } } }), { show: ['climate.salon'] }); await settle();
    duration.shadowRoot.querySelector('.override[data-climate="climate.salon"]').click(); await settle();
    assert.match(duration.shadowRoot.querySelector('.override-ed').textContent, /today, 2 h after the change ⚙ · 1 h 30 left/);
  });
});
