import { DAY_MIN } from '../common.ts';
import { I18N } from './index.ts';

// UI language: "fr*" → French, anything else → English (the only two translations so far)
function resolveLanguage(hass, configured) {
  const lang = String(configured || (hass && ((hass.locale && hass.locale.language) || hass.language)) || 'en').toLowerCase();
  return lang.startsWith('fr') ? 'fr' : 'en';
}

// Locale used by Intl for formats: the user's own (e.g. "en-GB", "fr-CA"), unless the card forces
// a language. Falls back to the UI language when Intl does not know it.
function resolveIntlLocale(hass, configured, lang) {
  const candidate = configured || (hass && ((hass.locale && hass.locale.language) || hass.language)) || lang;
  try {
    return Intl.getCanonicalLocales(candidate)[0] || lang;
  } catch (e) {
    return lang;
  }
}

// HA profile "Number format" → locale whose decimal separator matches (as HA's frontend does)
function numberLocale(setting, intlLocale) {
  switch (setting) {
    case 'comma_decimal': return 'en-US'; // 1,234.5
    case 'decimal_comma': return 'de'; // 1.234,5
    case 'space_comma': return 'fr'; // 1 234,5
    case 'quote_decimal': return 'de-CH'; // 1'234.5
    case 'system': return undefined; // browser default
    default: return intlLocale; // "language"
  }
}

// HA profile "Time format" → Intl hourCycle (undefined = the locale's default)
function hourCycle(setting) {
  if (setting === '12') return 'h12';
  if (setting === '24') return 'h23';
  return undefined;
}

const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// HA profile "First day of the week" → 0 (Monday) … 6 (Sunday)
function firstWeekday(setting, intlLocale) {
  const i = WEEKDAY_KEYS.indexOf(setting);
  if (i >= 0) return i;
  try {
    const loc: any = new Intl.Locale(setting === 'system' ? Intl.DateTimeFormat().resolvedOptions().locale : intlLocale);
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    if (info && info.firstDay) return (info.firstDay + 6) % 7; // Intl: 1 = Monday … 7 = Sunday
  } catch (e) { /* older browsers */ }
  return 0;
}

export const capitalize = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const REFERENCE_MONDAY = new Date(2024, 0, 1); // Monday, January 1, 2024

// Everything the UI needs to speak the user's language, following hass.locale
export function makeLocale(hass, configured?) {
  const prefs = (hass && hass.locale) || {};
  const lang = resolveLanguage(hass, configured);
  const strings = I18N[lang];
  const intlLocale = resolveIntlLocale(hass, configured, lang);
  const cycle = configured ? undefined : hourCycle(prefs.time_format);
  const hour12 = new Intl.DateTimeFormat(intlLocale, { hour: 'numeric', hourCycle: cycle }).resolvedOptions().hour12 === true;
  // Like HA's frontend: "06:30" on a 24 h clock, "6:30 AM" on a 12 h clock
  const timeFormat = new Intl.DateTimeFormat(intlLocale, { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hourCycle: cycle });
  const hourFormat = new Intl.DateTimeFormat(intlLocale, { hour: 'numeric', hourCycle: cycle });
  const numberFormat = prefs.number_format === 'none' ? null
    : new Intl.NumberFormat(numberLocale(configured ? 'language' : prefs.number_format, intlLocale), { maximumFractionDigits: 2 });
  // Day names in the UI language (so that they match the rest of the card)
  const dayName = (style) => [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = new Date(REFERENCE_MONDAY);
    d.setDate(d.getDate() + i);
    return capitalize(new Intl.DateTimeFormat(lang, { weekday: style }).format(d).replace(/\.$/, ''));
  });
  const first = firstWeekday(configured ? 'language' : prefs.first_weekday, intlLocale);
  const unit = (hass && hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || '°C';
  const t = (key, vars = {}) => String(strings[key] ?? I18N.en[key] ?? key)
    .replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  const long = dayName('long');
  const short = dayName('short');
  // Display order of the days (indexes in the Monday-based schedule data)
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (first + i) % 7);
  const at = (minutes) => {
    const d = new Date(REFERENCE_MONDAY);
    d.setMinutes(minutes % DAY_MIN);
    return d;
  };
  return {
    lang, intlLocale, hour12, unit, t,
    // The words for AM and PM in the user's language, typed in the time fields ("p. m." in Spanish).
    // Read when a time field is left, not on every update of hass.
    get periods() {
      const format = new Intl.DateTimeFormat(intlLocale, { hour: 'numeric', hourCycle: 'h12' });
      return [60, 13 * 60].map((m) => (format.formatToParts(at(m)).find((p) => p.type === 'dayPeriod') || {}).value || '');
    },
    // Changes when any language / format preference changes (triggers a redraw)
    signature: JSON.stringify([lang, intlLocale, unit, configured || null, prefs]),
    days: long,
    daysShort: short,
    dayOrder: order,
    // A date in the UI language, without its year: "19 octobre", "October 19"
    date: (d) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(d),
    // The day of a date in a few letters, in a label: "sam.", "Sat"; a week away or more, its
    // date in figures: "19/10"
    dayShort: (d) => new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(d),
    dateShort: (d) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'numeric' }).format(d),
    // Days of a row → "Mon–Fri", "Sat, Sun", "Mon, Wed–Fri", "Mon–Sun" (one day: its name; the
    // whole week in the long style: "Every day")
    daysLabel: (days, style = 'short') => {
      if (days.length === 7 && style === 'long') return t('everyDay');
      if (days.length === 1) return (style === 'short' ? short : long)[days[0]];
      const pos = days.map((d) => order.indexOf(d)).sort((a, b) => a - b);
      const runs = [];
      pos.forEach((p) => { const r = runs[runs.length - 1]; if (r && r[1] === p - 1) r[1] = p; else runs.push([p, p]); });
      // A week starting on the weekend keeps it together: "Sat, Sun" in a Sunday-first week
      if (runs.length > 1 && order[0] >= 5 && runs[0][0] === 0 && runs[0][1] === 0 && runs[runs.length - 1][1] === 6) {
        const [a] = runs.pop();
        runs[0] = [a, runs[0][1] + 7];
      }
      const name = (p) => short[order[p % 7]];
      return runs.map(([a, b]) => (b - a >= 2 ? `${name(a)}–${name(b)}` : b > a ? `${name(a)}, ${name(b)}` : name(a))).join(', ');
    },
    preset: (key) => strings.presets[key] || key,
    // An HVAC mode, in the card's words
    hvacMode: (mode) => strings.hvacModes[mode] || String(mode),
    // A word of a fan or vane value ("up", "swing") in the user's language, else as it is
    settingWord: (word) => strings.settingWords[String(word).toLowerCase()] ?? word,
    destination: (key) => strings.destinations[key] || key,
    // Minutes since midnight → "06:30" / "6:30 AM"; 1440 (end of day) → "24:00" in 24 h clocks
    time: (minutes) => (minutes === DAY_MIN && !hour12 ? '24:00' : timeFormat.format(at(minutes))),
    tick: (hour) => (hour12 ? hourFormat.format(at(hour * 60)) : `${hour}h`),
    number: (value) => {
      const n = Number(value);
      return numberFormat && Number.isFinite(n) ? numberFormat.format(n) : String(value);
    },
  };
}
export const DEFAULT_LOCALE = makeLocale(null, 'en');
