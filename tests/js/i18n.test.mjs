// Internationalization: translations, language choice and locale-aware formats (hass.locale).
import { fakeHass, createCard, cleanup } from './helpers.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { I18N, makeLocale } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const user = (locale, extra = {}) => ({ locale: { time_format: 'language', number_format: 'language', first_weekday: 'language', ...locale }, ...extra });

// Every key path of a translation object ("presets.eco", "destinations.all"…)
const keyPaths = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? keyPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('translations', () => {
  test('English and French have exactly the same keys', () => {
    assert.deepEqual(keyPaths(I18N.fr).sort(), keyPaths(I18N.en).sort());
  });

  test('placeholders are the same in both languages', () => {
    const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
    for (const key of keyPaths(I18N.en)) {
      const get = (lang) => key.split('.').reduce((o, k) => o[k], I18N[lang]);
      assert.deepEqual(placeholders(get('fr')), placeholders(get('en')), key);
    }
  });
});

describe('language', () => {
  test('any French variant gives French, anything else English', () => {
    assert.equal(makeLocale(user({ language: 'fr-CA' })).lang, 'fr');
    assert.equal(makeLocale(user({ language: 'en-GB' })).lang, 'en');
    assert.equal(makeLocale(user({ language: 'de' })).lang, 'en');
    assert.equal(makeLocale(null).lang, 'en');
  });

  test('the card can force a language', () => {
    assert.equal(makeLocale(user({ language: 'en' }), 'fr').lang, 'fr');
  });

  test('day names come from Intl, in the UI language', () => {
    const fr = makeLocale(user({ language: 'fr' }));
    assert.equal(fr.days[0], 'Lundi');
    assert.equal(fr.daysShort[0], 'Lun');
    const en = makeLocale(user({ language: 'en' }));
    assert.equal(en.days[6], 'Sunday');
    assert.equal(en.daysShort[6], 'Sun');
  });
});

describe('time format (profile → "Time format")', () => {
  test('French follows the language: 24 h, two-digit hours', () => {
    const fr = makeLocale(user({ language: 'fr' }));
    assert.equal(fr.time(6 * 60 + 30), '06:30');
    assert.equal(fr.time(1440), '24:00');
  });

  test('US English follows the language: 12 h', () => {
    const en = makeLocale(user({ language: 'en-US' }));
    assert.equal(en.hour12, true);
    assert.match(en.time(17 * 60 + 30), /^5:30\s?PM$/);
  });

  test('the profile setting wins over the language', () => {
    assert.equal(makeLocale(user({ language: 'en-US', time_format: '24' })).time(6 * 60 + 30), '06:30');
    assert.equal(makeLocale(user({ language: 'fr', time_format: '12' })).hour12, true);
  });
});

describe('number format (profile → "Number format")', () => {
  test('follows the language by default', () => {
    assert.equal(makeLocale(user({ language: 'fr' })).number(21.5), '21,5');
    assert.equal(makeLocale(user({ language: 'en' })).number(21.5), '21.5');
  });

  test('the profile setting wins over the language', () => {
    assert.equal(makeLocale(user({ language: 'fr', number_format: 'comma_decimal' })).number(21.5), '21.5');
    assert.equal(makeLocale(user({ language: 'en', number_format: 'decimal_comma' })).number(21.5), '21,5');
  });
});

describe('first day of the week (profile → "First day of the week")', () => {
  test('explicit setting', () => {
    assert.deepEqual(makeLocale(user({ language: 'fr', first_weekday: 'sunday' })).dayOrder, [6, 0, 1, 2, 3, 4, 5]);
    assert.deepEqual(makeLocale(user({ language: 'en-US', first_weekday: 'monday' })).dayOrder, [0, 1, 2, 3, 4, 5, 6]);
  });

  test('follows the language when Intl knows it', (t) => {
    const loc = new Intl.Locale('en-US');
    if (typeof loc.getWeekInfo !== 'function' && !loc.weekInfo) return t.skip('Intl week info not available');
    assert.equal(makeLocale(user({ language: 'en-US' })).dayOrder[0], 6); // Sunday
    assert.equal(makeLocale(user({ language: 'fr' })).dayOrder[0], 0); // Monday
  });
});

describe('the card in English', () => {
  afterEach(() => cleanup());
  const english = { language: 'en', time_format: '12', number_format: 'language', first_weekday: 'sunday' };

  test('texts, presets and Sunday-first rows', () => {
    const card = createCard(fakeHass({ locale: english }), { show: undefined });
    const root = card.shadowRoot;
    assert.equal(root.querySelector('[data-act="multi-sel"]').textContent, 'Multiple');
    assert.match(root.querySelector('.legend').textContent, /Frost protection.*Eco.*Comfort.*Boost/);
    assert.equal(root.querySelector('.dgroup .day').textContent, 'Sun');
    assert.match(root.querySelector('.bar[data-day="0"] .seg[data-idx="1"]').title, /6:30\s?AM/); // Monday
  });

  test('the "activate schedule" bar', () => {
    const card = createCard(fakeHass({ locale: english }));
    card.shadowRoot.querySelector('.tab[data-schedule="away"]').click();
    assert.match(card.shadowRoot.querySelector('.schedule-bar').textContent, /Active schedule: Normal/);
    assert.match(card.shadowRoot.querySelector('.schedule-bar').textContent, /Activate “Absent”/);
  });

  test('switching the HA language redraws the card in the new language', () => {
    const hass = fakeHass({ locale: english });
    const card = createCard(hass);
    card.hass = { ...hass, locale: { ...english, language: 'fr' }, language: 'fr' };
    assert.equal(card.shadowRoot.querySelector('[data-act="multi-sel"]').textContent, 'Plusieurs');
  });
});

describe('the more-info block in English', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('current and next slot, 12 h clock', () => {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = fakeHass({ locale: { language: 'en-US', time_format: 'language', number_format: 'language', first_weekday: 'language' },
      planned: { 'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-12T17:30:00+02:00' } } });
    assert.match(el.shadowRoot.textContent.replace(/\s+/g, ' '), /Follows the schedule: Eco until 5:30\s?PM, then Comfort/);
  });

  test('a next preset on another day, and none all week', () => {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    const english = { language: 'en-GB', time_format: 'language', number_format: 'language', first_weekday: 'language' };
    el.hass = fakeHass({ locale: english, planned: { 'climate.salon': { preset: 'eco', next_preset: 'comfort', next_start: '2026-10-13T06:30:00+02:00' } } });
    assert.match(el.shadowRoot.textContent.replace(/\s+/g, ' '), /Follows the schedule: Eco until 06:30 \(tomorrow\), then Comfort/);
    el.hass = fakeHass({ locale: english, planned: { 'climate.salon': { preset: 'eco', next_preset: null, next_start: null } } });
    assert.match(el.shadowRoot.textContent.replace(/\s+/g, ' '), /Follows the schedule: Eco all week/);
  });
});
