/*
 * chauffage-programme-card
 * Lovelace card: visual editor for the weekly heating schedules
 * (Versatile Thermostat). 7 days, each with one row per displayed thermostat.
 *
 * Installed in <config>/www/chauffage/ (served under /local/chauffage/)
 * and loaded on every page by chauffage-loader.js — see README.md.
 */

// Release version (same as package.json and CHANGELOG.md)
const VERSION = '0.1.0';

// Preset colors (labels are translated, see I18N)
const PRESETS = {
  comfort: { color: '#f57c00' },
  eco: { color: '#43a047' },
  boost: { color: '#e53935' },
  frost: { color: '#29b6f6' },
};
const DAY_MIN = 1440;

// ---------- i18n ----------
// UI texts in English and French. The language follows the user's Home Assistant language
// (French for any "fr*" language, English otherwise) unless the card sets `language`.
// Mode names (Normal / Absent / Vacances) are data (input_select options): not translated here.
const I18N = {
  en: {
    presets: { comfort: 'Comfort', eco: 'Eco', boost: 'Boost', frost: 'Frost protection' },
    thermostatsRequired: 'The "thermostats" option is required (list of climate.* entities)',
    error: 'Error: {message}',
    saved: 'Saved ✓',
    off: 'off',
    manual: 'manual',
    hint: 'Drag a handle to move a time · Click a slot to edit it · Double-click to add a cut',
    open: 'Open {name}',
    openThermostat: 'Open the thermostat',
    copyPaste: 'Copy / paste…',
    copyDay: 'Copy the day',
    paste: 'Paste',
    copyToWeekdays: 'Copy to Mon–Fri',
    copyToWeekend: 'Copy to Sat–Sun',
    copyToAll: 'Copy to every day',
    copyToOthers: 'Copy to the other thermostats',
    from: 'from',
    to: 'to',
    close: 'Close (Esc)',
    insertSlot: '+ Insert a slot',
    delete: 'Delete',
    temporarySetpoint: 'temporary setpoint',
    temporarySetpointTitle: 'Temporary setpoint: {label}',
    dragToChangeEnd: 'Drag to change the end',
    until: 'until',
    today: 'today',
    remaining: '{duration} left',
    duration: '{h}h {mm}',
    deleteAndResume: 'Delete · resume the schedule',
    resume: 'Resume the schedule',
    activeMode: 'Active mode',
    activeModeBar: 'Active mode: <strong>{mode}</strong>',
    noActiveMode: 'No active mode',
    activate: 'Activate “{mode}”',
    modeActivated: '“{mode}” mode activated',
    multiple: 'Multiple',
    multipleTitle: 'Turn on to show several thermostats (shortcut: Ctrl+click a thermostat)',
    all: 'All',
    allTitle: 'Show every thermostat',
    copyWeekTo: 'Copy {name}’s week to…',
    cancel: 'Cancel',
    save: 'Save',
    unsaved: 'Unsaved changes',
    destinations: { weekdays: 'Mon–Fri', weekend: 'Sat–Sun', all: 'every day', others: 'the other thermostats' },
    dayCopiedTo: '{name} · {day} copied to {destination}',
    weekCopiedTo: '{source}’s week copied to {target} · {mode}',
    copied: 'Copied: {label}',
    pastedOn: 'Pasted on {name} · {day}',
    schedule: 'Schedule',
    followsSchedule: 'Follows the schedule:',
    untilThen: '{current} until {time}, then {next}',
    untilMidnight: '{current} until midnight',
    todayTitle: 'Today',
    week: 'Week',
    newerData: 'These schedules were saved by a newer version of ha-chauffage (data version {version}). Update the card to view and edit them.',
  },
  fr: {
    presets: { comfort: 'Confort', eco: 'Éco', boost: 'Boost', frost: 'Hors-gel' },
    thermostatsRequired: 'Le paramètre "thermostats" est requis (liste d\'entités climate.*)',
    error: 'Erreur : {message}',
    saved: 'Enregistré ✓',
    off: 'arrêt',
    manual: 'manuel',
    hint: 'Glisser une poignée pour déplacer un horaire · Clic sur une plage pour la modifier · Double-clic pour ajouter une coupure',
    open: 'Ouvrir {name}',
    openThermostat: 'Ouvrir le thermostat',
    copyPaste: 'Copier / coller…',
    copyDay: 'Copier la journée',
    paste: 'Coller',
    copyToWeekdays: 'Copier vers Lun–Ven',
    copyToWeekend: 'Copier vers Sam–Dim',
    copyToAll: 'Copier vers tous les jours',
    copyToOthers: 'Copier vers les autres vannes',
    from: 'de',
    to: 'à',
    close: 'Fermer (Échap)',
    insertSlot: '+ Insérer une plage',
    delete: 'Supprimer',
    temporarySetpoint: 'consigne temporaire',
    temporarySetpointTitle: 'Consigne temporaire : {label}',
    dragToChangeEnd: 'Glisser pour changer la fin',
    until: 'jusqu\'à',
    today: 'aujourd\'hui',
    remaining: 'encore {duration}',
    duration: '{h} h {mm}',
    deleteAndResume: 'Supprimer · reprendre le programme',
    resume: 'Reprendre le programme',
    activeMode: 'Mode actif',
    activeModeBar: 'Mode actif : <strong>{mode}</strong>',
    noActiveMode: 'Aucun mode actif',
    activate: 'Activer « {mode} »',
    modeActivated: 'Mode « {mode} » activé',
    multiple: 'Plusieurs',
    multipleTitle: 'Activer pour afficher plusieurs vannes (raccourci : Ctrl+clic sur une vanne)',
    all: 'Toutes',
    allTitle: 'Afficher toutes les vannes',
    copyWeekTo: 'Copier la semaine de {name} vers…',
    cancel: 'Annuler',
    save: 'Enregistrer',
    unsaved: 'Modifications non enregistrées',
    destinations: { weekdays: 'Lun–Ven', weekend: 'Sam–Dim', all: 'tous les jours', others: 'les autres vannes' },
    dayCopiedTo: '{name} · {day} copié vers {destination}',
    weekCopiedTo: 'Semaine de {source} copiée vers {target} · {mode}',
    copied: 'Copié : {label}',
    pastedOn: 'Collé sur {name} · {day}',
    schedule: 'Programme',
    followsSchedule: 'Suit le programme :',
    untilThen: '{current} jusqu\'à {time}, puis {next}',
    untilMidnight: '{current} jusqu\'à minuit',
    todayTitle: 'Aujourd\'hui',
    week: 'Semaine',
    newerData: 'Ces plannings ont été enregistrés par une version plus récente de ha-chauffage (données en version {version}). Mettez la carte à jour pour les afficher et les modifier.',
  },
};

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
    const loc = new Intl.Locale(setting === 'system' ? Intl.DateTimeFormat().resolvedOptions().locale : intlLocale);
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    if (info && info.firstDay) return (info.firstDay + 6) % 7; // Intl: 1 = Monday … 7 = Sunday
  } catch (e) { /* older browsers */ }
  return 0;
}

const capitalize = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const REFERENCE_MONDAY = new Date(2024, 0, 1); // Monday, January 1, 2024

// Everything the UI needs to speak the user's language, following hass.locale
function makeLocale(hass, configured) {
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
  const at = (minutes) => {
    const d = new Date(REFERENCE_MONDAY);
    d.setMinutes(minutes % DAY_MIN);
    return d;
  };
  return {
    lang, intlLocale, hour12, unit, t,
    // Changes when any language / format preference changes (triggers a redraw)
    signature: JSON.stringify([lang, intlLocale, unit, configured || null, prefs]),
    days: dayName('long'),
    daysShort: dayName('short'),
    // Display order of the days (indexes in the Monday-based schedule data)
    dayOrder: [0, 1, 2, 3, 4, 5, 6].map((i) => (first + i) % 7),
    preset: (key) => strings.presets[key] || key,
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
const LS_KEY = 'chauffage-programme-card:shown';
const LS_CLIP = 'chauffage-programme-card:clip';
const ICON_COPY = '<svg viewBox="0 0 24 24"><path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 24 24"><path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24"><path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/></svg>';
const ICON_PASTE ='<svg viewBox="0 0 24 24"><path d="M19,20H5V4H7V7H17V4H19M12,2A1,1 0 0,1 13,3A1,1 0 0,1 12,4A1,1 0 0,1 11,3A1,1 0 0,1 12,2M19,2H14.82C14.4,0.84 13.3,0 12,0C10.7,0 9.6,0.84 9.18,2H5A2,2 0 0,0 3,4V20A2,2 0 0,0 5,22H19A2,2 0 0,0 21,20V4A2,2 0 0,0 19,2Z"/></svg>';

const toMin = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const pct = (m) => ((m / DAY_MIN) * 100).toFixed(3);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));
// HA dates: microseconds truncated to milliseconds (Safari rejects more than 3 decimals)
const parseDate = (s) => new Date(String(s).replace(/(\.\d{3})\d+/, '$1'));
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const todayIdx = () => (new Date().getDay() + 6) % 7;
const altPreset = (p) => (p === 'comfort' ? 'eco' : 'comfort');

// Merges consecutive identical slots and removes duplicate start times
function normalize(segs) {
  const sorted = segs.slice().sort((a, b) => a.start - b.start);
  const dedup = [];
  for (const s of sorted) {
    if (dedup.length && dedup[dedup.length - 1].start === s.start) dedup[dedup.length - 1] = { ...s };
    else dedup.push({ ...s });
  }
  const out = [];
  for (const s of dedup) {
    if (out.length && out[out.length - 1].preset === s.preset) continue;
    out.push(s);
  }
  if (out.length) out[0].start = 0;
  return out.length ? out : [{ start: 0, preset: 'eco' }];
}

function parseDay(list) {
  if (!Array.isArray(list)) return [{ start: 0, preset: 'eco' }];
  const segs = list
    .map((s) => {
      const [t, p] = String(s).trim().split(/\s+/);
      return { start: toMin(t), preset: p };
    })
    .filter((s) => !isNaN(s.start) && s.preset);
  return normalize(segs);
}

const serializeDay = (segs) => segs.map((s) => `${toHM(s.start)} ${s.preset}`);

// ---------- stored data versions ----------
// The schedules carry a schema version (attribute "version" of sensor.programmes_chauffage;
// missing = 1, the format used before the first release). A release that changes the format
// bumps DATA_VERSION and adds MIGRATIONS[n], which upgrades version n to n + 1 (see
// CONTRIBUTING.md, "Data versions and migrations").
const DATA_VERSION = 1;
const MIGRATIONS = {};

class DataVersionError extends Error {
  constructor(version) {
    super(`Schedules saved by a newer version of ha-chauffage (data version ${version})`);
    this.version = version;
  }
}

const storedVersion = (st) => {
  const v = Number(st && st.attributes.version);
  return Number.isInteger(v) && v >= 1 ? v : 1;
};

// Upgrades schedules from `version` to `target`, one step at a time, without modifying
// the input. Throws DataVersionError for data newer than `target` (downgrades not supported).
function migrateSchedules(programmes, version, { target = DATA_VERSION, migrations = MIGRATIONS } = {}) {
  if (version > target) throw new DataVersionError(version);
  let data = clone(programmes && typeof programmes === 'object' ? programmes : {});
  for (let v = version; v < target; v++) {
    if (typeof migrations[v] !== 'function') throw new Error(`No migration from data version ${v}`);
    data = migrations[v](data);
  }
  return data;
}

// Stored schedules, migrated to the current version (throws DataVersionError, see above)
const readSchedules = (st) => migrateSchedules(st && st.attributes.programmes, storedVersion(st));

// Saves migrated schedules back to HA, keeping the data as it was before the migration in the
// sensor's "previous" attribute, so that the automation reads the current format even if
// nobody edits the schedules. Admins only (firing events requires it). Returns true if saved.
async function saveMigratedSchedules(hass, { sensor, event }, options = {}) {
  const st = hass && hass.states[sensor];
  const version = storedVersion(st);
  const target = options.target || DATA_VERSION;
  if (!st || version >= target || (hass.user && !hass.user.is_admin)) return false;
  const programmes = migrateSchedules(st.attributes.programmes, version, { ...options, target });
  await hass.callWS({
    type: 'fire_event',
    event_type: event,
    event_data: { programmes, version: target, previous: { version, programmes: st.attributes.programmes } },
  });
  return true;
}

// Runs the migration at most once per page: from the card, or from any Home Assistant page
// (this file is loaded on every page by chauffage-loader.js)
let migrationRun = null;
function migrateOnce(hass, cfg) {
  if (!migrationRun) {
    migrationRun = saveMigratedSchedules(hass, cfg).catch((e) => {
      console.error('ha-chauffage: schedule migration failed', e);
      return false;
    });
  }
  return migrationRun;
}

// ---------- overrides (shared by the card and the more-info block) ----------

// Splits an override into one piece per day (today + 6 days)
function overridePieces(d) {
  if (!d) return [];
  const startsAt = parseDate(d.debut);
  const endsAt = parseDate(d.fin);
  const day0 = new Date();
  day0.setHours(0, 0, 0, 0);
  const pieces = [];
  for (let i = 0; i < 7; i++) {
    const d0 = new Date(day0);
    d0.setDate(d0.getDate() + i);
    const d1 = new Date(d0);
    d1.setDate(d1.getDate() + 1);
    const s = startsAt > d0 ? startsAt : d0;
    const e = endsAt < d1 ? endsAt : d1;
    if (e > s) {
      pieces.push({
        day: (d0.getDay() + 6) % 7,
        start: Math.round((s - d0) / 60000),
        end: Math.min(DAY_MIN, Math.round((e - d0) / 60000)),
        d0,
        isLast: endsAt <= d1,
      });
    }
  }
  return pieces;
}

const DEFAULT_LOCALE = makeLocale(null, 'en');

function overrideLabel(d, locale = DEFAULT_LOCALE) {
  if (!d) return '';
  if (d.type === 'temp') return `${locale.number(d.valeur)} ${locale.unit}`;
  return locale.preset(d.valeur);
}

const hmOf = (date) => toHM(date.getHours() * 60 + date.getMinutes());
const minutesOf = (date) => date.getHours() * 60 + date.getMinutes();

function durationText(min, locale = DEFAULT_LOCALE) {
  return min >= 60
    ? locale.t('duration', { h: Math.floor(min / 60), mm: String(min % 60).padStart(2, '0') })
    : `${min} min`;
}

// Active (not ended) overrides read from the sensor
function activeOverrides(hass, sensor) {
  const st = hass && hass.states[sensor];
  const raw = st && st.attributes.derogations;
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const now = new Date();
  for (const [c, d] of Object.entries(raw)) {
    if (d && parseDate(d.fin) > now) out[c] = d;
  }
  return out;
}

class ChauffageProgrammeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = {};
    this._dirty = false;
    this._sel = null; // { climate, day, idx }
    this._focus = null; // last thermostat used (source of "Copier la semaine")
    this._drag = null;
    this._stamp = undefined;
    this._msg = '';
    this._lastClick = null;
    this._renderedDay = null;
    // Internal clipboard: { segs, label }, shared between cards through localStorage
    this._clip = null;
    this._clipSrc = null; // { climate, mode, day } of the copied row (highlight)
    this._menu = null; // { climate, day, top, right } open row menu
    this._multiSel = false; // "Plusieurs" mode: clicking a thermostat adds / removes it
    // Overrides (temporary setpoints): sent to HA right away, without "Enregistrer"
    this._overrideSel = null; // { climate, day } override whose popover is open
    this._overrideDrag = null;
    this._overridePending = {}; // changes sent, waiting for the sensor update
    this._overrideStamp = undefined;
    try {
      const c = JSON.parse(localStorage.getItem(LS_CLIP));
      if (c && Array.isArray(c.segs) && c.segs.length) this._clip = c;
    } catch (e) { /* ignore */ }
    this._bindEvents();
  }

  static getStubConfig(hass) {
    return { thermostats: Object.keys(hass.states).filter((e) => e.startsWith('climate.')).slice(0, 3) };
  }

  setConfig(config) {
    if (!config.thermostats || !config.thermostats.length) {
      const lang = config.language || (typeof navigator !== 'undefined' && navigator.language);
      throw new Error(makeLocale(null, lang).t('thermostatsRequired'));
    }
    this._config = {
      sensor: 'sensor.programmes_chauffage',
      mode_entity: 'input_select.mode_chauffage',
      event: 'chauffage_programmes_set',
      derog_sensor: 'sensor.derogations_chauffage',
      derog_event: 'chauffage_derogation_set',
      step: 15,
      ...config,
    };
    this._thermostats = config.thermostats.map((t) => (typeof t === 'string' ? { entity: t } : t));
    // The more-info block uses the same entities as the card
    for (const k of Object.keys(MORE_INFO_CFG)) MORE_INFO_CFG[k] = this._config[k];
    const all = this._thermostats.map((t) => t.entity);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { /* ignore */ }
    const fromSaved = Array.isArray(saved) ? all.filter((e) => saved.includes(e)) : [];
    const fromConfig = config.show === 'all' ? all : Array.isArray(config.show) ? all.filter((e) => config.show.includes(e)) : [all[0]];
    this._shown = fromSaved.length ? fromSaved : fromConfig.length ? fromConfig : [all[0]];
    this._mode = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    let need = first;
    // Language / time format / unit may change in the user's profile
    const loc = makeLocale(hass, this._config.language);
    if (!this._loc || loc.signature !== this._loc.signature) {
      this._loc = loc;
      need = true;
    }
    const st = hass.states[this._config.sensor];
    const stamp = st ? st.last_updated : null;
    if (stamp !== this._stamp && !this._dirty && !this._drag) {
      this._load();
      this._stamp = stamp;
      need = true;
    }
    const dst = hass.states[this._config.derog_sensor];
    const dstamp = dst ? dst.last_updated : null;
    if (dstamp !== this._overrideStamp && !this._overrideDrag && !this._drag) {
      this._overrideStamp = dstamp;
      this._overridePending = {};
      need = true;
    }
    // Active mode changed (from the card, another dashboard or an automation): redraw the
    // active-mode marker and the "activate" bar
    const modeState = hass.states[this._config.mode_entity];
    if (modeState !== this._modeState && !this._drag && !this._overrideDrag) {
      this._modeState = modeState;
      need = true;
    }
    if (!this._mode) {
      const active = this._activeMode();
      this._mode = this._modes().includes(active) ? active : this._modes()[0];
      need = true;
    }
    if (need) this._render();
    else this._updateLive();
  }

  connectedCallback() {
    this._timer = setInterval(() => {
      if (this._drag || this._overrideDrag) return;
      // Full redraw on a new day or during an override (it moves with the time)
      if (this._renderedDay !== todayIdx() || Object.keys(this._overrides()).length) this._render();
      else this._updateLive();
    }, 30000);
    // Closes the row menu / popovers on a click outside the card or the Escape key
    const closePopups = () => {
      if (!this._menu && !this._sel && !this._overrideSel) return;
      this._menu = null;
      this._sel = null;
      this._overrideSel = null;
      this._render();
    };
    this._onDocDown = (e) => {
      if (!e.composedPath().includes(this)) closePopups();
    };
    this._onKey = (e) => {
      if (e.key === 'Escape') closePopups();
    };
    document.addEventListener('pointerdown', this._onDocDown, true);
    document.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    document.removeEventListener('pointerdown', this._onDocDown, true);
    document.removeEventListener('keydown', this._onKey);
  }

  getCardSize() {
    return 4 + 7 * this._shown.length;
  }

  // ---------- data ----------

  _modes() {
    const s = this._hass && this._hass.states[this._config.mode_entity];
    return (s && s.attributes.options) || ['Normal', 'Absent', 'Vacances'];
  }

  _activeMode() {
    const s = this._hass && this._hass.states[this._config.mode_entity];
    return s ? s.state : null;
  }

  _load() {
    const st = this._hass.states[this._config.sensor];
    this._data = {};
    this._newerData = null;
    let raw;
    try {
      raw = readSchedules(st);
    } catch (e) {
      if (!(e instanceof DataVersionError)) throw e;
      this._newerData = e.version; // read-only: saving would lose data
      return;
    }
    if (st && storedVersion(st) < DATA_VERSION) migrateOnce(this._hass, this._config);
    for (const [climate, modes] of Object.entries(raw)) {
      if (!modes || typeof modes !== 'object') continue;
      this._data[climate] = {};
      for (const [mode, week] of Object.entries(modes)) {
        if (!Array.isArray(week)) continue;
        this._data[climate][mode] = [0, 1, 2, 3, 4, 5, 6].map((i) => parseDay(week[i]));
      }
    }
  }

  _week(climate, mode = this._mode) {
    if (!this._data[climate]) this._data[climate] = {};
    if (!this._data[climate][mode]) {
      this._data[climate][mode] = [0, 1, 2, 3, 4, 5, 6].map(() => [{ start: 0, preset: 'eco' }]);
    }
    return this._data[climate][mode];
  }

  _name(entity) {
    const t = this._thermostats.find((x) => x.entity === entity);
    const st = this._hass.states[entity];
    return (t && t.name) || (st && st.attributes.friendly_name) || entity;
  }

  _focusClimate() {
    return this._shown.includes(this._focus) ? this._focus : this._shown[0];
  }

  _snap(m) {
    const step = this._config.step;
    return Math.round(m / step) * step;
  }

  _commit(climate, day, keepMin) {
    const week = this._week(climate);
    week[day] = normalize(week[day]);
    if (keepMin != null) {
      let idx = 0;
      week[day].forEach((s, i) => { if (s.start <= keepMin) idx = i; });
      this._sel = { climate, day, idx };
    }
    this._focus = climate;
    this._dirty = true;
    this._msg = '';
    this._render();
  }

  // ---------- overrides ----------

  _overrides() {
    const st = this._hass && this._hass.states[this._config.derog_sensor];
    const raw = (st && st.attributes.derogations) || {};
    const out = typeof raw === 'object' ? { ...raw } : {};
    for (const [c, d] of Object.entries(this._overridePending)) {
      if (d) out[c] = d;
      else delete out[c];
    }
    const now = new Date();
    for (const [c, d] of Object.entries(out)) {
      if (!d || !(parseDate(d.fin) > now)) delete out[c];
    }
    return out;
  }

  _overridePieces(climate) {
    return overridePieces(this._overrides()[climate]);
  }

  _overrideLabel(d) {
    return overrideLabel(d, this._loc);
  }

  async _sendOverride(climate, override) {
    this._overridePending[climate] = override;
    if (!override) this._overrideSel = null;
    this._render();
    try {
      await this._hass.callWS({
        type: 'fire_event',
        event_type: this._config.derog_event,
        event_data: { climate, derogation: override },
      });
    } catch (e) {
      delete this._overridePending[climate];
      this._msg = this._loc.t('error', { message: e.message || e.code || e });
      this._render();
    }
  }

  // New end (Date): at least one step after now
  _setOverrideEnd(climate, endsAt) {
    const d = this._overrides()[climate];
    if (!d) return;
    const min = new Date(Date.now() + this._config.step * 60000);
    const f = endsAt < min ? min : endsAt;
    this._sendOverride(climate, { ...d, fin: f.toISOString() });
  }

  async _save() {
    if (this._newerData) return;
    const out = {};
    for (const [climate, modes] of Object.entries(this._data)) {
      out[climate] = {};
      for (const [mode, week] of Object.entries(modes)) out[climate][mode] = week.map(serializeDay);
    }
    try {
      await this._hass.callWS({ type: 'fire_event', event_type: this._config.event, event_data: { programmes: out, version: DATA_VERSION } });
      this._dirty = false;
      this._msg = this._loc.t('saved');
    } catch (e) {
      this._msg = this._loc.t('error', { message: e.message || e.code || e });
    }
    this._render();
  }

  // ---------- rendering ----------

  _liveText(climate) {
    const st = this._hass.states[climate];
    if (!st) return '?';
    const a = st.attributes;
    if (st.state === 'off') return this._loc.t('off');
    const parts = [];
    if (a.current_temperature != null) parts.push(`${this._loc.number(a.current_temperature)}°`);
    const d = this._overrides()[climate];
    if (d) parts.push(`⏱ ${this._overrideLabel(d)} → ${this._loc.time(minutesOf(parseDate(d.fin)))}`);
    else if (['none', 'manual', 'manuel'].includes(String(a.preset_mode).toLowerCase())) parts.push(this._loc.t('manual'));
    else if (a.preset_mode) parts.push(this._loc.preset(a.preset_mode));
    return parts.join(' · ');
  }

  _updateLive() {
    const root = this.shadowRoot;
    root.querySelectorAll('.chip[data-climate] .live').forEach((el) => {
      el.textContent = this._liveText(el.parentElement.dataset.climate);
    });
    root.querySelectorAll('.now').forEach((el) => { el.style.left = `${pct(nowMin())}%`; });
  }

  _segInner(start, end, preset) {
    const dur = end - start;
    const compact = this._shown.length > 1;
    const wide = this._loc.hour12 ? 25 : 0; // "6:30 AM" needs more room than "06:30"
    const t = dur >= (compact ? 60 : 75) + wide ? this._loc.time(start) : '';
    const l = dur >= (compact ? 180 : 150) + wide ? esc(this._loc.preset(preset)) : '';
    return `<span class="t">${t}</span><span class="l">${l}</span>`;
  }

  _barHtml(climate, segs, d, showNow) {
    const segHtml = segs
      .map((s, i) => {
        const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
        const p = PRESETS[s.preset] || { color: '#9e9e9e' };
        const sel = this._sel && this._sel.climate === climate && this._sel.day === d && this._sel.idx === i;
        const cls = ['seg', sel ? 'sel' : '', i === 0 ? 'first' : '', i === segs.length - 1 ? 'last' : ''].join(' ');
        return `<div class="${cls}" data-idx="${i}" style="left:${pct(s.start)}%;width:${pct(end - s.start)}%;background:${p.color}" title="${esc(this._name(climate))} · ${this._loc.time(s.start)} → ${this._loc.time(end)} · ${esc(this._loc.preset(s.preset))}">${this._segInner(s.start, end, s.preset)}</div>`;
      })
      .join('');
    const handles = segs
      .slice(1)
      .map((s, j) => `<div class="handle" data-idx="${j + 1}" style="left:${pct(s.start)}%"><span class="tip">${this._loc.time(s.start)}</span></div>`)
      .join('');
    const now = showNow ? `<div class="now" style="left:${pct(nowMin())}%"></div>` : '';
    const cs = this._clipSrc;
    const isSrc = cs && cs.climate === climate && cs.mode === this._mode && cs.day === d;
    return `<div class="bar${isSrc ? ' clipsrc' : ''}" data-climate="${esc(climate)}" data-day="${d}">${segHtml}${handles}${this._overrideHtml(climate, d)}${now}</div>`;
  }

  // Override drawn over the schedule (only in the active mode's tab)
  _overrideHtml(climate, day) {
    if (this._mode !== this._activeMode()) return '';
    const d = this._overrides()[climate];
    const piece = this._overridePieces(climate).find((p) => p.day === day);
    if (!d || !piece) return '';
    const endHM = this._loc.time(minutesOf(parseDate(d.fin)));
    const label = `${this._overrideLabel(d)} → ${endHM}`;
    const sel = this._overrideSel && this._overrideSel.climate === climate && this._overrideSel.day === day;
    return `<div class="override${sel ? ' sel' : ''}${piece.isLast ? ' last' : ''}" data-climate="${esc(climate)}" data-day="${day}"
        style="left:${pct(piece.start)}%;width:${pct(piece.end - piece.start)}%" title="${esc(this._loc.t('temporarySetpointTitle', { label }))}">
      <span class="override-label">${piece.end - piece.start >= (this._shown.length > 1 ? 180 : 120) ? `⏱ ${esc(label)}` : '⏱'}</span>
      ${piece.isLast ? `<div class="override-handle" title="${esc(this._loc.t('dragToChangeEnd'))}"><span class="tip">${endHM}</span></div>` : ''}
    </div>`;
  }

  _dayHtml(d, showNow) {
    const multi = this._shown.length > 1;
    const subs = this._shown
      .map((climate) => {
        const segs = this._week(climate)[d];
        const m = this._menu;
        const open = m && m.climate === climate && m.day === d;
        return `<div class="sub">
          ${multi ? `<div class="name" title="${esc(this._loc.t('open', { name: this._name(climate) }))}">${this._moreInfoLink(climate)}</div>` : ''}
          ${this._barHtml(climate, segs, d, showNow)}
          <button class="ibtn${open ? ' open' : ''}" data-act="menu" data-climate="${esc(climate)}" data-day="${d}" title="${esc(this._loc.t('copyPaste'))}">${ICON_MORE}</button>
        </div>`;
      })
      .join('');
    return `<div class="dgroup${d === todayIdx() ? ' today' : ''}">
      <div class="day">${this._loc.daysShort[d]}</div>
      <div class="subs">${subs}</div>
    </div>`;
  }

  _menuHtml() {
    const m = this._menu;
    if (!m) return '';
    const ref = `data-climate="${esc(m.climate)}" data-day="${m.day}"`;
    const item = (act, label, icon = '', disabled = false) =>
      `<button class="mi" data-act="${act}" ${ref} ${disabled ? 'disabled' : ''}>${icon}<span>${label}</span></button>`;
    const t = this._loc.t;
    const paste = this._clip ? `${esc(t('paste'))} <small>${esc(this._clip.label)}</small>` : esc(t('paste'));
    return `<div class="menu" style="top:${m.top}px;right:${m.right}px">
      <div class="mh">${esc(this._name(m.climate))} · ${this._loc.days[m.day]}</div>
      ${item('copy-day', esc(t('copyDay')), ICON_COPY)}
      ${item('paste-day', paste, ICON_PASTE, !this._clip)}
      <div class="sep"></div>
      ${item('fill-weekdays', esc(t('copyToWeekdays')))}
      ${item('fill-weekend', esc(t('copyToWeekend')))}
      ${item('fill-all', esc(t('copyToAll')))}
      ${this._shown.length > 1 ? item('fill-others', esc(t('copyToOthers'))) : ''}
    </div>`;
  }

  _openMenu(climate, day, top, right) {
    const m = this._menu;
    this._menu = m && m.climate === climate && m.day === day ? null : { climate, day, top, right };
    this._render();
  }

  _editorHtml() {
    const t = this._loc.t;
    const hint = `<div class="hint">${esc(t('hint'))}</div>`;
    if (this._overrideSel) return hint + this._overrideEditorHtml();
    if (!this._sel || !this._shown.includes(this._sel.climate)) { this._sel = null; return hint; }
    const { climate, day, idx } = this._sel;
    const segs = this._week(climate)[day];
    const s = segs && segs[idx];
    if (!s) { this._sel = null; return hint; }
    // Popover, placed under the slot by _placeEditor() after rendering
    const last = idx === segs.length - 1;
    const end = last ? DAY_MIN : segs[idx + 1].start;
    const stepSec = this._config.step * 60;
    const from = idx === 0 ? `<span class="fixed">${this._loc.time(0)}</span>` : `<input type="time" data-edge="start" step="${stepSec}" value="${toHM(s.start)}">`;
    const to = last ? `<span class="fixed">${this._loc.time(DAY_MIN)}</span>` : `<input type="time" data-edge="end" step="${stepSec}" value="${toHM(end)}">`;
    const presets = Object.entries(PRESETS)
      .map(([k, p]) => `<button data-act="preset" data-preset="${k}" class="${s.preset === k ? 'on' : ''}" style="background:${p.color}">${esc(this._loc.preset(k))}</button>`)
      .join('');
    return `${hint}<div class="editor">
      <div class="ed-head">
        <strong>${this._moreInfoLink(climate)} · ${this._loc.days[day]}</strong>
        <label>${esc(t('from'))} ${from}</label><label>${esc(t('to'))} ${to}</label>
        <button class="btn icon close" data-act="close" title="${esc(t('close'))}">✕</button>
      </div>
      <div class="presets">${presets}</div>
      <div class="ed-actions">
        <button class="btn" data-act="insert" ${end - s.start < 3 * this._config.step ? 'disabled' : ''}>${esc(t('insertSlot'))}</button>
        <button class="btn" data-act="delete" ${segs.length === 1 ? 'disabled' : ''}>${esc(t('delete'))}</button>
      </div>
    </div>`;
  }

  _overrideEditorHtml() {
    const { climate } = this._overrideSel;
    const d = this._overrides()[climate];
    if (!d || !this._shown.includes(climate)) { this._overrideSel = null; return ''; }
    const t = this._loc.t;
    const endsAt = parseDate(d.fin);
    const today = new Date();
    const dayLabel = endsAt.toDateString() === today.toDateString() ? t('today')
      : this._loc.days[(endsAt.getDay() + 6) % 7].toLowerCase();
    const remaining = Math.max(0, Math.round((endsAt - today) / 60000));
    const addButton = (m, label) => `<button class="btn" data-act="override-add" data-min="${m}">${label}</button>`;
    return `<div class="editor override-ed">
      <div class="ed-head">
        <strong>${this._moreInfoLink(climate)} · ${esc(t('temporarySetpoint'))}</strong>
        <span class="override-value">${esc(this._overrideLabel(d))}</span>
        <button class="btn icon close" data-act="override-close" title="${esc(t('close'))}">✕</button>
      </div>
      <div class="ed-head">
        <label>${esc(t('until'))} <input type="time" data-override-end step="${this._config.step * 60}" value="${hmOf(endsAt)}"></label>
        <span class="muted">${esc(dayLabel)} · ${esc(t('remaining', { duration: durationText(remaining, this._loc) }))}</span>
      </div>
      <div class="ed-actions start">
        ${addButton(-30, '−30 min')}${addButton(30, '+30 min')}${addButton(60, '+1 h')}${addButton(120, '+2 h')}
      </div>
      <div class="ed-actions">
        <button class="btn danger" data-act="override-del">${esc(t('deleteAndResume'))}</button>
      </div>
    </div>`;
  }

  // ha-card (a Lit component) renders asynchronously: until its <slot> is rendered, its
  // content has no position. Wait for its rendering to complete before measuring.
  _schedulePlaceEditor() {
    const card = this.shadowRoot.querySelector('ha-card');
    if (!card || !this.shadowRoot.querySelector('.editor')) return;
    const token = (this._placeToken = (this._placeToken || 0) + 1);
    const ready = card.updateComplete instanceof Promise ? card.updateComplete : Promise.resolve();
    ready.then(() => {
      let tries = 0;
      const attempt = () => {
        if (token !== this._placeToken) return; // a more recent render took over
        if (this._placeEditor() || ++tries > 10) return;
        requestAnimationFrame(attempt);
      };
      requestAnimationFrame(attempt);
    });
  }

  // Places the popover under the selected slot / override (or above it when there is no room).
  // Returns false if the layout is not ready yet.
  _placeEditor() {
    const root = this.shadowRoot;
    const ed = root.querySelector('.editor');
    const seg = root.querySelector('.override.sel, .seg.sel');
    if (!ed || !seg) return true;
    const card = root.querySelector('ha-card').getBoundingClientRect();
    const bar = seg.parentElement.getBoundingClientRect();
    if (!card.width || !bar.width) return false;
    const sr = seg.getBoundingClientRect();
    const w = ed.offsetWidth;
    const h = ed.offsetHeight;
    const cx = (Math.max(sr.left, bar.left) + Math.min(sr.right, bar.right)) / 2 - card.left;
    const left = Math.max(8, Math.min(card.width - w - 8, cx - w / 2));
    let top = bar.bottom - card.top + 9;
    let above = false;
    if (bar.bottom + 9 + h > window.innerHeight && bar.top - 9 - h > 0) {
      top = bar.top - card.top - h - 9;
      above = true;
    }
    ed.style.left = `${left}px`;
    ed.style.top = `${top}px`;
    ed.style.setProperty('--caret', `${Math.max(14, Math.min(w - 14, cx - left))}px`);
    ed.classList.toggle('above', above);
    ed.classList.add('placed');
    return true;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const tr = this._loc.t;
    if (this._newerData) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style>
        <ha-card><div class="newer-data">${esc(tr('newerData', { version: this._newerData }))}</div></ha-card>`;
      return;
    }
    const modes = this._modes();
    const active = this._activeMode();
    const today = todayIdx();
    this._renderedDay = today;
    const multi = this._shown.length > 1;
    const allShown = this._shown.length === this._thermostats.length;

    const chips = this._thermostats
      .map((t) => {
        const on = this._shown.includes(t.entity);
        return `<button class="chip${on ? ' on' : ''}" data-climate="${esc(t.entity)}">${esc(this._name(t.entity))} <span class="live">${esc(this._liveText(t.entity))}</span><span class="chip-open" data-more-info="${esc(t.entity)}" title="${esc(tr('openThermostat'))}">${ICON_OPEN}</span></button>`;
      })
      .join('');
    const tabs = modes
      .map((m) => `<button class="tab${m === this._mode ? ' on' : ''}" data-mode="${esc(m)}">${m === active ? `<span class="dot" title="${esc(tr('activeMode'))}"></span>` : ''}${esc(m)}</button>`)
      .join('');
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<span style="left:${(h / 24) * 100}%">${this._loc.tick(h)}</span>`).join('');
    // Days in the order of the user's first weekday (data stays Monday-based)
    const days = this._loc.dayOrder.map((d) => this._dayHtml(d, d === today && this._mode === active)).join('');

    const focus = this._focusClimate();
    const st = this._hass.states[focus];
    const legend = Object.entries(PRESETS)
      .map(([k, p]) => {
        const t = !multi && st && st.attributes[`${k}_temp`];
        return `<span><i style="background:${p.color}"></i>${esc(this._loc.preset(k))}${t != null && t !== false ? ` ${this._loc.number(t)}°` : ''}</span>`;
      })
      .join('');
    const copyWeek = this._thermostats
      .map((t) => {
        const opts = modes
          .filter((m) => !(t.entity === focus && m === this._mode))
          .map((m) => `<option value="${esc(t.entity)}|${esc(m)}">${esc(this._name(t.entity))} · ${esc(m)}</option>`)
          .join('');
        return `<optgroup label="${esc(this._name(t.entity))}">${opts}</optgroup>`;
      })
      .join('');

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card class="${multi ? 'multi' : 'single'} h${Math.min(this._shown.length, 3)}">
        <div class="chips">
          ${chips}
          <span class="chip-sep"></span>
          <button class="chip tool${this._multiSel ? ' on' : ''}" data-act="multi-sel" title="${esc(tr('multipleTitle'))}">${esc(tr('multiple'))}</button>
          <button class="chip tool${allShown ? ' on' : ''}" data-act="show-all" title="${esc(tr('allTitle'))}">${esc(tr('all'))}</button>
        </div>
        <div class="tabs">${tabs}</div>
        ${this._modeBarHtml(active)}
        <div class="scale"><div></div>${multi ? '<div></div>' : ''}<div class="ticks">${ticks}</div><div></div></div>
        ${days}
        ${this._menuHtml()}
        ${this._editorHtml()}
        <div class="foot">
          <div class="legend">${legend}</div>
          <div class="actions">
            <select class="copyweek" title="${esc(tr('copyWeekTo', { name: this._name(focus) }))}">
              <option value="">${esc(tr('copyWeekTo', { name: this._name(focus) }))}</option>${copyWeek}
            </select>
            <button class="btn" data-act="cancel" ${this._dirty ? '' : 'disabled'}>${esc(tr('cancel'))}</button>
            <button class="btn primary" data-act="save" ${this._dirty ? '' : 'disabled'}>${esc(tr('save'))}</button>
          </div>
        </div>
        <div class="msg">${esc(this._msg)}${this._msg && this._dirty ? ' · ' : ''}${this._dirty ? `<span class="dirty">${esc(tr('unsaved'))}</span>` : ''}</div>
      </ha-card>`;
    this._schedulePlaceEditor();
  }

  // Visual update of a row while dragging (without recreating the captured handle)
  _layoutBar(bar, segs) {
    bar.querySelectorAll('.seg').forEach((el, i) => {
      const s = segs[i];
      const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
      el.style.left = `${pct(s.start)}%`;
      el.style.width = `${pct(end - s.start)}%`;
      el.innerHTML = this._segInner(s.start, end, s.preset);
    });
    bar.querySelectorAll('.handle').forEach((el) => {
      const s = segs[Number(el.dataset.idx)];
      el.style.left = `${pct(s.start)}%`;
      el.querySelector('.tip').textContent = this._loc.time(s.start);
    });
  }

  _minuteAt(bar, clientX) {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(DAY_MIN, ((clientX - r.left) / r.width) * DAY_MIN));
  }

  _saveShown() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this._shown)); } catch (e) { /* ignore */ }
  }

  // ---------- events ----------

  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('pointerdown', (e) => {
      // End handle of an override
      const dh = e.target.closest('.override-handle');
      if (dh) {
        e.preventDefault();
        e.stopPropagation();
        dh.setPointerCapture(e.pointerId);
        dh.classList.add('drag');
        const el = dh.parentElement;
        const climate = el.dataset.climate;
        const piece = this._overridePieces(climate).find((p) => p.isLast);
        if (!piece) return;
        this._overrideDrag = { climate, piece, el, handle: dh, bar: el.parentElement, end: piece.end, moved: false };
        return;
      }
      const h = e.target.closest('.handle');
      if (!h) return;
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      h.classList.add('drag');
      const bar = h.parentElement;
      this._drag = { climate: bar.dataset.climate, day: Number(bar.dataset.day), idx: Number(h.dataset.idx), bar, el: h, moved: false };
    });

    root.addEventListener('pointermove', (e) => {
      const dd = this._overrideDrag;
      if (dd) {
        const step = this._config.step;
        const p = dd.piece;
        const isToday = p.d0.toDateString() === new Date().toDateString();
        const min = Math.max(p.start + step, isToday ? Math.ceil((nowMin() + 1) / step) * step : 0);
        const m = Math.max(min, Math.min(DAY_MIN, this._snap(this._minuteAt(dd.bar, e.clientX))));
        if (m !== dd.end) {
          dd.end = m;
          dd.moved = true;
          dd.el.style.width = `${pct(m - p.start)}%`;
          dd.handle.querySelector('.tip').textContent = this._loc.time(m);
          const label = dd.el.querySelector('.override-label');
          if (label) label.textContent = '⏱';
        }
        return;
      }
      const d = this._drag;
      if (!d) return;
      const step = this._config.step;
      const segs = this._week(d.climate)[d.day];
      const min = segs[d.idx - 1].start + step;
      const max = (d.idx + 1 < segs.length ? segs[d.idx + 1].start : DAY_MIN) - step;
      const m = Math.max(min, Math.min(max, this._snap(this._minuteAt(d.bar, e.clientX))));
      if (m !== segs[d.idx].start) {
        segs[d.idx].start = m;
        d.moved = true;
        this._layoutBar(d.bar, segs);
      }
    });

    const endDrag = () => {
      const dd = this._overrideDrag;
      if (dd) {
        this._overrideDrag = null;
        this._overrideDragEnded = Date.now(); // prevents the following "click" from opening the popover
        if (dd.moved) this._setOverrideEnd(dd.climate, new Date(dd.piece.d0.getTime() + dd.end * 60000));
        else dd.handle.classList.remove('drag');
        return;
      }
      const d = this._drag;
      if (!d) return;
      this._drag = null;
      if (d.moved) this._commit(d.climate, d.day, null);
      else d.el.classList.remove('drag');
    };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);

    // Right click (or long press on Android) on a row: opens the menu at the pointer
    root.addEventListener('contextmenu', (e) => {
      const bar = e.target.closest('.bar');
      if (!bar) return;
      e.preventDefault();
      const card = root.querySelector('ha-card').getBoundingClientRect();
      this._menu = null;
      this._openMenu(bar.dataset.climate, Number(bar.dataset.day), e.clientY - card.top + 4, Math.max(8, card.right - e.clientX - 8));
    });

    root.addEventListener('click', (e) => {
      // Menu open: a click elsewhere only closes it
      if (this._menu && !e.target.closest('.menu, [data-act="menu"]')) {
        this._menu = null;
        this._render();
        return;
      }
      // Link to the thermostat's more-info dialog (chip, row name, popover header)
      const mi = e.target.closest('[data-more-info]');
      if (mi) {
        e.stopPropagation();
        this._sel = null;
        this._overrideSel = null;
        this._render();
        this._openMoreInfo(mi.dataset.moreInfo);
        return;
      }
      // Popover open: a click outside the popover / slot closes it
      if ((this._sel || this._overrideSel) && !e.target.closest('.editor, .seg, .handle, .override')) {
        this._sel = null;
        this._overrideSel = null;
        if (!e.target.closest('[data-act], .tab, .chip')) { this._render(); return; }
      }
      const tab = e.target.closest('.tab');
      if (tab) {
        this._mode = tab.dataset.mode;
        this._sel = null;
        this._overrideSel = null;
        this._render();
        return;
      }
      // Click on an override: opens its popover
      const override = e.target.closest('.override');
      if (override) {
        if (e.target.closest('.override-handle') || Date.now() - (this._overrideDragEnded || 0) < 300) return;
        this._sel = null;
        this._overrideSel = { climate: override.dataset.climate, day: Number(override.dataset.day) };
        this._render();
        return;
      }
      const chip = e.target.closest('.chip[data-climate]');
      if (chip) {
        this._toggleShown(chip.dataset.climate, this._multiSel || e.ctrlKey || e.metaKey || e.shiftKey);
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act) { if (!act.disabled) this._action(act.dataset.act, act.dataset, act); return; }

      const seg = e.target.closest('.seg');
      if (!seg) return;
      const bar = seg.parentElement;
      const climate = bar.dataset.climate;
      const day = Number(bar.dataset.day);
      const idx = Number(seg.dataset.idx);
      const t = Date.now();
      const lc = this._lastClick;
      this._lastClick = { climate, day, t, x: e.clientX };
      if (lc && lc.climate === climate && lc.day === day && t - lc.t < 400 && Math.abs(lc.x - e.clientX) < 10) {
        this._lastClick = null;
        this._split(climate, day, this._snap(this._minuteAt(bar, e.clientX)));
        return;
      }
      const sel = this._sel;
      if (!sel || sel.climate !== climate || sel.day !== day || sel.idx !== idx) {
        this._overrideSel = null;
        this._sel = { climate, day, idx };
        this._focus = climate;
        this._render();
      }
    });

    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.classList.contains('copyweek')) {
        this._copyWeek(el.value);
      } else if (el.dataset.edge) {
        this._setEdge(el.dataset.edge, el.value);
      } else if (el.hasAttribute('data-override-end') && el.value && this._overrideSel) {
        // Next occurrence of this time (today, otherwise tomorrow)
        const endsAt = new Date();
        endsAt.setHours(0, 0, 0, 0);
        endsAt.setMinutes(this._snap(toMin(el.value)));
        if (endsAt <= new Date()) endsAt.setDate(endsAt.getDate() + 1);
        this._setOverrideEnd(this._overrideSel.climate, endsAt);
      }
    });
  }

  // Shown when the viewed tab is not the active mode: switch the heating mode from the card,
  // without a separate input_select card.
  _modeBarHtml(active) {
    if (!this._mode || this._mode === active) return '';
    const t = this._loc.t;
    const current = active ? t('activeModeBar', { mode: esc(active) }) : esc(t('noActiveMode'));
    return `<div class="mode-bar">
      <span>${current}</span>
      <button class="btn small" data-act="activate-mode">${esc(t('activate', { mode: this._mode }))}</button>
    </div>`;
  }

  async _activateMode(mode) {
    try {
      await this._hass.callService('input_select', 'select_option', {
        entity_id: this._config.mode_entity, option: mode,
      });
      this._msg = this._loc.t('modeActivated', { mode });
    } catch (e) {
      this._msg = this._loc.t('error', { message: e.message || e.code || e });
    }
    this._render();
  }

  // Opens HA's standard more-info dialog (same mechanism as the built-in tiles)
  _openMoreInfo(entityId) {
    this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId } }));
  }

  _moreInfoLink(climate) {
    return `<span class="mi-link" data-more-info="${esc(climate)}" title="${esc(this._loc.t('openThermostat'))}">${esc(this._name(climate))}</span>`;
  }

  // Plain click: shows only this thermostat. "Plusieurs" mode or Ctrl/Shift+click: adds / removes it.
  _toggleShown(climate, additive) {
    const order = this._thermostats.map((t) => t.entity);
    if (!additive) {
      this._shown = [climate];
      this._focus = climate;
    } else if (this._shown.includes(climate)) {
      if (this._shown.length === 1) return;
      this._shown = this._shown.filter((c) => c !== climate);
    } else {
      this._shown = order.filter((c) => c === climate || this._shown.includes(c));
      this._focus = climate;
    }
    this._saveShown();
    this._render();
  }

  _split(climate, day, m) {
    const segs = this._week(climate)[day];
    const step = this._config.step;
    let idx = 0;
    segs.forEach((s, i) => { if (s.start <= m) idx = i; });
    const s = segs[idx];
    const end = idx < segs.length - 1 ? segs[idx + 1].start : DAY_MIN;
    if (m < s.start + step || m > end - step) return;
    segs.splice(idx + 1, 0, { start: m, preset: altPreset(s.preset) });
    this._commit(climate, day, m);
  }

  _setEdge(edge, value) {
    if (!this._sel || !value) return;
    const { climate, day, idx } = this._sel;
    const segs = this._week(climate)[day];
    const step = this._config.step;
    const v = this._snap(toMin(value));
    if (edge === 'start' && idx > 0) {
      const end = idx < segs.length - 1 ? segs[idx + 1].start : DAY_MIN;
      segs[idx].start = Math.max(segs[idx - 1].start + step, Math.min(end - step, v));
      this._commit(climate, day, segs[idx].start);
    } else if (edge === 'end' && idx < segs.length - 1) {
      const nextEnd = idx + 2 < segs.length ? segs[idx + 2].start : DAY_MIN;
      segs[idx + 1].start = Math.max(segs[idx].start + step, Math.min(nextEnd - step, v));
      this._commit(climate, day, segs[idx].start);
    }
  }

  _copyDay(climate, day, target) {
    const src = this._week(climate)[day];
    if (target === 'others') {
      this._shown.filter((c) => c !== climate).forEach((c) => { this._week(c)[day] = clone(src); });
    } else {
      const targets = { weekdays: [0, 1, 2, 3, 4], weekend: [5, 6], all: [0, 1, 2, 3, 4, 5, 6] }[target];
      if (!targets) return;
      const week = this._week(climate);
      targets.filter((t) => t !== day).forEach((t) => { week[t] = clone(src); });
    }
    const destination = this._loc.destination(target);
    this._focus = climate;
    this._dirty = true;
    this._msg = this._loc.t('dayCopiedTo', { name: this._name(climate), day: this._loc.days[day], destination });
    this._render();
  }

  _copyWeek(value) {
    if (!value) return;
    const [climate, mode] = value.split('|');
    const source = this._focusClimate();
    const week = clone(this._week(source));
    if (!this._data[climate]) this._data[climate] = {};
    this._data[climate][mode] = week;
    this._dirty = true;
    this._msg = this._loc.t('weekCopiedTo', { source: this._name(source), target: this._name(climate), mode });
    this._render();
  }

  _copyToClipboard(climate, day) {
    const segs = clone(this._week(climate)[day]);
    const label = `${this._name(climate)} · ${this._loc.days[day]} (${this._mode})`;
    this._clip = { segs, label };
    this._clipSrc = { climate, mode: this._mode, day };
    try { localStorage.setItem(LS_CLIP, JSON.stringify(this._clip)); } catch (e) { /* ignore */ }
    // Also copies as text to the system clipboard (when the browser allows it)
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(`${label} : ${serializeDay(segs).join(', ')}`).catch(() => {});
    } catch (e) { /* ignore */ }
    this._msg = this._loc.t('copied', { label });
    this._render();
  }

  _pasteFromClipboard(climate, day) {
    if (!this._clip) return;
    this._week(climate)[day] = normalize(clone(this._clip.segs));
    if (this._sel && this._sel.climate === climate && this._sel.day === day) this._sel = null;
    this._focus = climate;
    this._dirty = true;
    this._msg = this._loc.t('pastedOn', { name: this._name(climate), day: this._loc.days[day] });
    this._render();
  }

  _action(act, ds, el) {
    if (act === 'menu') {
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return this._openMenu(ds.climate, Number(ds.day), b.bottom - card.top + 4, card.right - b.right);
    }
    this._menu = null;
    if (act.startsWith('fill-')) return this._copyDay(ds.climate, Number(ds.day), act.slice(5));
    if (act.startsWith('override-')) {
      const c = this._overrideSel && this._overrideSel.climate;
      const d = c && this._overrides()[c];
      if (act === 'override-close' || !d) { this._overrideSel = null; return this._render(); }
      if (act === 'override-del') return this._sendOverride(c, null);
      if (act === 'override-add') return this._setOverrideEnd(c, new Date(parseDate(d.fin).getTime() + Number(ds.min) * 60000));
    }
    if (act === 'save') return this._save();
    if (act === 'cancel') {
      this._dirty = false;
      this._sel = null;
      this._msg = '';
      this._load();
      return this._render();
    }
    if (act === 'copy-day') return this._copyToClipboard(ds.climate, Number(ds.day));
    if (act === 'paste-day') return this._pasteFromClipboard(ds.climate, Number(ds.day));
    if (act === 'activate-mode') return this._activateMode(this._mode);
    if (act === 'multi-sel') {
      this._multiSel = !this._multiSel;
      return this._render();
    }
    if (act === 'show-all') {
      this._shown = this._thermostats.map((t) => t.entity);
      this._saveShown();
      return this._render();
    }
    if (!this._sel) return;
    const { climate, day, idx } = this._sel;
    const segs = this._week(climate)[day];
    const s = segs[idx];
    const step = this._config.step;
    if (act === 'close') {
      this._sel = null;
      this._render();
    } else if (act === 'preset') {
      s.preset = ds.preset;
      this._commit(climate, day, s.start);
    } else if (act === 'insert') {
      const end = idx < segs.length - 1 ? segs[idx + 1].start : DAY_MIN;
      const m1 = this._snap(s.start + (end - s.start) / 3);
      const m2 = this._snap(s.start + (2 * (end - s.start)) / 3);
      if (m1 <= s.start || m2 >= end || m2 <= m1 || m1 - s.start < step) return;
      segs.splice(idx + 1, 0, { start: m1, preset: altPreset(s.preset) }, { start: m2, preset: s.preset });
      this._commit(climate, day, m1);
    } else if (act === 'delete') {
      if (segs.length === 1) return;
      if (idx > 0) segs.splice(idx, 1);
      else { segs.splice(0, 1); segs[0].start = 0; }
      this._sel = null;
      this._commit(climate, day, null);
    }
  }
}

const STYLE = `
  :host { display:block; }
  ha-card { display:block; position:relative; padding:16px; overflow:visible; }
  select, input, button { font:inherit; color:var(--primary-text-color); }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { border:1px solid var(--divider-color); background:var(--card-background-color); border-radius:16px;
    padding:4px 10px; cursor:pointer; font-size:.88em; }
  .chip .live { color:var(--secondary-text-color); font-size:.9em; margin-left:2px; }
  .chip.on { background:var(--primary-color); border-color:var(--primary-color); color:var(--text-primary-color,#fff); }
  .chip.on .live { color:inherit; opacity:.85; }
  .chip-sep { width:1px; align-self:stretch; margin:2px 2px; background:var(--divider-color); }
  .chip.tool { border-style:dashed; color:var(--secondary-text-color); background:transparent; }
  .chip.tool.on { border-style:solid; border-color:var(--primary-color); color:var(--primary-color); }
  .tabs { display:flex; gap:4px; margin:12px 0 10px; padding:3px; border-radius:10px;
    background:var(--secondary-background-color); }
  .tab { flex:1; border:0; background:transparent; padding:7px 8px; border-radius:8px; cursor:pointer; }
  .tab.on { background:var(--card-background-color); box-shadow:0 1px 3px rgba(0,0,0,.25); font-weight:600; }
  .mode-bar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px 12px;
    margin:-4px 0 10px; padding:6px 10px; border-radius:8px; font-size:.88em;
    background:var(--secondary-background-color); color:var(--secondary-text-color); }
  .mode-bar strong { color:var(--primary-text-color); }
  .btn.small { padding:4px 10px; font-size:.95em; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px;
    background:var(--success-color,#43a047); vertical-align:middle; }

  /* Grid: day | (name) | bar | tools */
  .scale { display:grid; grid-template-columns:36px 1fr 28px; gap:8px; align-items:center; }
  .multi .scale { grid-template-columns:36px 100px 1fr 28px; }
  .dgroup { display:grid; grid-template-columns:36px 1fr; gap:8px; align-items:center; margin:7px 0; }
  .multi .dgroup { padding-top:7px; border-top:1px solid var(--divider-color); }
  .subs { display:flex; flex-direction:column; gap:5px; }
  .sub { display:grid; grid-template-columns:1fr 28px; gap:8px; align-items:center; }
  .multi .sub { grid-template-columns:100px 1fr 28px; }
  .name { font-size:.78em; color:var(--secondary-text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mi-link { cursor:pointer; }
  .mi-link:hover { color:var(--primary-color); text-decoration:underline; }
  .chip-open { display:inline-flex; vertical-align:-2px; margin-left:4px; padding:1px; border-radius:4px; opacity:.6; cursor:pointer; }
  .chip-open:hover { opacity:1; background:rgba(127,127,127,.25); }
  .chip-open svg { width:13px; height:13px; fill:currentColor; }

  .ticks { position:relative; height:16px; font-size:11px; color:var(--secondary-text-color); }
  .ticks span { position:absolute; transform:translateX(-50%); }
  .ticks span:first-child { transform:none; }
  .ticks span:last-child { transform:translateX(-100%); }
  .day { font-size:.9em; color:var(--secondary-text-color); }
  .dgroup.today .day { color:var(--primary-color); font-weight:700; }
  .bar { position:relative; height:38px; border-radius:6px; background:var(--secondary-background-color);
    user-select:none; -webkit-user-select:none; }
  .h2 .bar { height:28px; }
  .h3 .bar { height:24px; }
  .seg { position:absolute; top:0; bottom:0; box-sizing:border-box; overflow:hidden; padding:2px 5px;
    color:#fff; font-size:11px; line-height:1.2; white-space:nowrap; cursor:pointer;
    display:flex; flex-direction:column; justify-content:center; text-shadow:0 1px 1px rgba(0,0,0,.25); }
  .multi .seg { flex-direction:row; align-items:center; justify-content:flex-start; gap:5px; font-size:10.5px; }
  .seg.first { border-radius:6px 0 0 6px; }
  .seg.last { border-radius:0 6px 6px 0; }
  .seg.first.last { border-radius:6px; }
  .seg .t { font-weight:600; }
  .seg.sel { box-shadow:inset 0 0 0 3px var(--primary-text-color); z-index:1; }
  .handle { position:absolute; top:-3px; bottom:-3px; width:18px; margin-left:-9px; z-index:2;
    cursor:ew-resize; touch-action:none; }
  .handle::after { content:''; position:absolute; left:7px; top:3px; bottom:3px; width:4px; border-radius:2px;
    background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.4); }
  .tip { display:none; position:absolute; bottom:100%; left:50%; transform:translate(-50%,-2px); z-index:4;
    padding:2px 6px; border-radius:4px; font-size:11px; white-space:nowrap;
    background:var(--primary-text-color); color:var(--card-background-color); }
  .handle:hover .tip, .handle.drag .tip { display:block; }
  .now { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; z-index:5; pointer-events:none;
    background:var(--primary-text-color); }
  .ibtn { width:28px; height:28px; padding:0; display:inline-flex; align-items:center; justify-content:center;
    border:1px solid var(--divider-color); border-radius:6px; background:var(--card-background-color);
    color:var(--secondary-text-color); cursor:pointer; }
  .ibtn svg { width:16px; height:16px; fill:currentColor; }
  .ibtn:hover:not(:disabled) { color:var(--primary-color); border-color:var(--primary-color); }
  .ibtn.open { color:var(--primary-color); border-color:var(--primary-color); }
  .ibtn:disabled { opacity:.35; cursor:default; }
  .bar.clipsrc { outline:2px dashed var(--primary-color); outline-offset:2px; }
  .menu { position:absolute; z-index:10; min-width:230px; padding:6px 0; border-radius:10px;
    background:var(--card-background-color); border:1px solid var(--divider-color);
    box-shadow:0 6px 20px rgba(0,0,0,.25); }
  .mh { padding:4px 14px 6px; font-size:.78em; color:var(--secondary-text-color); }
  .mi { display:flex; align-items:center; gap:10px; width:100%; padding:8px 14px; border:0; background:transparent;
    text-align:left; cursor:pointer; font-size:.92em; }
  .mi:hover:not(:disabled) { background:var(--secondary-background-color); }
  .mi:disabled { opacity:.4; cursor:default; }
  .mi svg { width:16px; height:16px; fill:currentColor; flex:none; }
  .mi:not(:has(svg)) span { padding-left:26px; }
  .mi small { display:block; font-size:.8em; color:var(--secondary-text-color); }
  .sep { height:1px; margin:5px 0; background:var(--divider-color); }
  .hint { margin-top:10px; font-size:.8em; color:var(--secondary-text-color); }
  .editor { position:absolute; z-index:9; visibility:hidden; box-sizing:border-box; width:max-content; max-width:min(460px, calc(100% - 16px));
    padding:10px 12px; border-radius:10px; background:var(--card-background-color);
    border:1px solid var(--divider-color); box-shadow:0 6px 20px rgba(0,0,0,.25);
    display:flex; flex-direction:column; gap:10px; }
  .editor.placed { visibility:visible; }
  .editor::before { content:''; position:absolute; top:-7px; left:var(--caret,50%); width:12px; height:12px;
    margin-left:-6px; transform:rotate(45deg); background:var(--card-background-color);
    border-left:1px solid var(--divider-color); border-top:1px solid var(--divider-color); }
  .editor.above::before { top:auto; bottom:-7px; border:0;
    border-right:1px solid var(--divider-color); border-bottom:1px solid var(--divider-color); }
  /* Override (temporary setpoint) drawn over the schedule */
  .override { position:absolute; top:3px; bottom:3px; z-index:3; box-sizing:border-box; overflow:visible;
    border-radius:4px; cursor:pointer; color:#fff; font-size:10.5px; font-weight:600; white-space:nowrap;
    display:flex; align-items:center; padding:0 6px; border:2px solid #fff;
    background:repeating-linear-gradient(135deg, #7b1fa2 0 6px, #9c4dcc 6px 12px);
    box-shadow:0 1px 4px rgba(0,0,0,.35); text-shadow:0 1px 1px rgba(0,0,0,.4); }
  .override .override-label { overflow:hidden; text-overflow:ellipsis; }
  .override.sel { outline:2px solid var(--primary-text-color); outline-offset:1px; }
  .override-handle { position:absolute; top:-6px; bottom:-6px; right:-10px; width:18px; cursor:ew-resize; touch-action:none; }
  .override-handle::after { content:''; position:absolute; left:6px; top:3px; bottom:3px; width:6px; border-radius:3px;
    background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.45); }
  .override-handle:hover .tip, .override-handle.drag .tip { display:block; }
  .override-value { padding:2px 8px; border-radius:6px; color:#fff; font-weight:600;
    background:repeating-linear-gradient(135deg, #7b1fa2 0 6px, #9c4dcc 6px 12px); }
  .muted { font-size:.85em; color:var(--secondary-text-color); }
  .ed-actions.start { margin-left:0; flex-wrap:wrap; }
  .btn.danger { color:var(--error-color,#db4437); border-color:var(--error-color,#db4437); }
  .ed-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; }
  .ed-head .close { margin-left:auto; }
  .editor input { padding:4px 6px; border-radius:6px; border:1px solid var(--divider-color);
    background:var(--secondary-background-color); }
  .fixed { font-variant-numeric:tabular-nums; padding:0 4px; }
  .presets { display:flex; flex-wrap:wrap; gap:6px; }
  .presets button { border:0; color:#fff; padding:6px 10px; border-radius:6px; cursor:pointer; opacity:.5; }
  .presets button.on { opacity:1; box-shadow:0 0 0 2px var(--primary-text-color); }
  .ed-actions { display:flex; gap:6px; margin-left:auto; }
  .btn { border:1px solid var(--divider-color); background:var(--card-background-color); padding:6px 12px;
    border-radius:8px; cursor:pointer; }
  .btn.icon { padding:6px 10px; }
  .btn.primary { background:var(--primary-color); color:var(--text-primary-color,#fff); border-color:transparent; }
  .btn:disabled { opacity:.4; cursor:default; }
  .foot { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-top:14px; }
  .legend { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:.85em; color:var(--secondary-text-color); }
  .legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:5px; vertical-align:-1px; }
  .actions { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .copyweek { padding:6px 8px; border-radius:8px; border:1px solid var(--divider-color);
    background:var(--card-background-color); max-width:260px; }
  .msg { min-height:1.2em; margin-top:6px; font-size:.85em; color:var(--secondary-text-color); text-align:right; }
  .msg .dirty { color:var(--warning-color,#ff9800); }
  .newer-data { color:var(--error-color,#db4437); }
  @media (max-width:500px) {
    .multi .scale { grid-template-columns:30px 60px 1fr 28px; }
    .dgroup { grid-template-columns:30px 1fr; }
    .multi .sub { grid-template-columns:60px 1fr 28px; }
    .sub { grid-template-columns:1fr 28px; }
    .scale { grid-template-columns:30px 1fr 28px; }
  }
`;

// Guards: the file may be loaded twice (dashboard resource + frontend.extra_module_url
// with a different URL); define things only once.
if (!customElements.get('chauffage-programme-card')) customElements.define('chauffage-programme-card', ChauffageProgrammeCard);

// =====================================================================
//  Block added to the more-info dialog of a scheduled thermostat: current day,
//  week of the active mode, editable temporary override.
//  HA offers no official extension point: the block is inserted into its internal
//  structure. If an HA update changes it, the block no longer shows up, with no
//  other consequence.
// =====================================================================

// Entities used by the block (updated by the last configured card)
const MORE_INFO_CFG = {
  language: undefined, // card option: forces the UI language
  sensor: 'sensor.programmes_chauffage',
  event: 'chauffage_programmes_set',
  mode_entity: 'input_select.mode_chauffage',
  derog_sensor: 'sensor.derogations_chauffage',
  derog_event: 'chauffage_derogation_set',
  step: 15,
};

class ChauffageMoreInfo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._pending = undefined; // override sent, waiting for the sensor update
    this._drag = null;
    const root = this.shadowRoot;
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('change', (e) => this._onChange(e));
    root.addEventListener('pointerdown', (e) => this._onDown(e));
    root.addEventListener('pointermove', (e) => this._onMove(e));
    root.addEventListener('pointerup', () => this._onUp());
    root.addEventListener('pointercancel', () => this._onUp());
  }

  set entity(id) {
    if (id !== this._entity) { this._entity = id; this._key = null; this._pending = undefined; }
  }

  get entity() { return this._entity; }

  set hass(hass) {
    this._hass = hass;
    const c = MORE_INFO_CFG;
    const s = hass.states;
    this._loc = makeLocale(hass, c.language);
    if (this._key && s[c.derog_sensor] !== this._key[2]) this._pending = undefined;
    // Redraw only when relevant data changed (or every new minute)
    const key = [s[this._entity], s[c.sensor], s[c.derog_sensor], s[c.mode_entity], Math.floor(Date.now() / 60000), this._loc.signature];
    if (this._key && key.every((v, i) => v === this._key[i])) return;
    if (this._drag) return; // no redraw while dragging
    this._key = key;
    this._render();
  }

  _currentOverride() {
    if (this._pending !== undefined) return this._pending;
    return activeOverrides(this._hass, MORE_INFO_CFG.derog_sensor)[this._entity] || null;
  }

  _send(override) {
    const c = MORE_INFO_CFG;
    this._pending = override;
    this._render();
    this._hass.callWS({ type: 'fire_event', event_type: c.derog_event, event_data: { climate: this._entity, derogation: override } })
      .catch(() => { this._pending = undefined; this._render(); });
  }

  // New end: at least one step after now
  _setEnd(endsAt) {
    const d = this._currentOverride();
    if (!d) return;
    const min = new Date(Date.now() + MORE_INFO_CFG.step * 60000);
    this._send({ ...d, fin: (endsAt < min ? min : endsAt).toISOString() });
  }

  _week() {
    const c = MORE_INFO_CFG;
    let progs;
    try {
      progs = readSchedules(this._hass.states[c.sensor]);
    } catch (e) {
      progs = {}; // saved by a newer version: block hidden
    }
    const mode =this._hass.states[c.mode_entity] ? this._hass.states[c.mode_entity].state : null;
    const week = progs[this._entity] && progs[this._entity][mode];
    return { mode, week: Array.isArray(week) ? [0, 1, 2, 3, 4, 5, 6].map((i) => parseDay(week[i])) : null };
  }

  _bar(segs, piece, showNow, big) {
    const segHtml = segs.map((s, i) => {
      const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
      const p = PRESETS[s.preset] || { color: '#9e9e9e' };
      const txt = big && end - s.start >= (this._loc.hour12 ? 120 : 90) ? `<span>${this._loc.time(s.start)}</span>` : '';
      return `<div class="seg" style="left:${pct(s.start)}%;width:${pct(end - s.start)}%;background:${p.color}" title="${this._loc.time(s.start)} → ${this._loc.time(end)} · ${esc(this._loc.preset(s.preset))}">${txt}</div>`;
    }).join('');
    let override = '';
    if (piece) {
      // End handle only on the large bar of the day the override ends
      const handle = big && piece.isLast
        ? `<div class="override-handle" data-day="${piece.day}" title="${esc(this._loc.t('dragToChangeEnd'))}"><span class="tip">${this._loc.time(piece.end)}</span></div>`
        : '';
      override = `<div class="override" style="left:${pct(piece.start)}%;width:${pct(piece.end - piece.start)}%">${handle}</div>`;
    }
    const now = showNow ? `<div class="now" style="left:${pct(nowMin())}%"></div>` : '';
    return `<div class="bar${big ? ' big' : ''}">${segHtml}${override}${now}</div>`;
  }

  _render() {
    const t = this._loc.t;
    const { mode, week } = this._week();
    if (!week) { this.shadowRoot.innerHTML = ''; this.style.display = 'none'; return; }
    this.style.display = '';
    const today = todayIdx();
    const d = this._currentOverride();
    const pieces = overridePieces(d);
    this._pieces = pieces;
    const pieceFor = (day) => pieces.find((p) => p.day === day);

    // Current / next slot
    const segs = week[today];
    const now = nowMin();
    let idx = 0;
    segs.forEach((s, i) => { if (s.start <= now) idx = i; });
    const current = this._loc.preset(segs[idx].preset);
    const next = segs[idx + 1];
    const followText = next
      ? t('untilThen', { current, time: this._loc.time(next.start), next: this._loc.preset(next.preset) })
      : t('untilMidnight', { current });

    let status;
    let endDay = '';
    if (d) {
      const endsAt = parseDate(d.fin);
      const remaining = Math.max(0, Math.round((endsAt - new Date()) / 60000));
      const lastPiece = pieces.find((p) => p.isLast);
      const dayLabel = endsAt.toDateString() === new Date().toDateString()
        ? t('today') : this._loc.days[(endsAt.getDay() + 6) % 7].toLowerCase();
      const addButton = (m, label) => `<button data-min="${m}">${label}</button>`;
      status = `<div class="status derogation">
        <div class="line">
          <span class="override-value">⏱ ${esc(overrideLabel(d, this._loc))}</span>
          <label>${esc(t('until'))} <input type="time" data-end step="${MORE_INFO_CFG.step * 60}" value="${hmOf(endsAt)}"></label>
          <span class="muted">${esc(dayLabel)} · ${esc(t('remaining', { duration: durationText(remaining, this._loc) }))}</span>
        </div>
        <div class="btns">
          ${addButton(-30, '−30 min')}${addButton(30, '+30 min')}${addButton(60, '+1 h')}${addButton(120, '+2 h')}
          <button class="danger" data-del>${esc(t('resume'))}</button>
        </div>
      </div>`;
      // Ends on another day: also show that day's large bar (with the handle)
      if (lastPiece && lastPiece.day !== today) {
        endDay = `<div class="today-lbl">${this._loc.days[lastPiece.day]}</div>
          ${this._bar(week[lastPiece.day], lastPiece, false, true)}`;
      }
    } else {
      status = `<div class="status"><span class="muted">${esc(t('followsSchedule'))}</span> ${esc(followText)}</div>`;
    }

    const rows = this._loc.dayOrder.map((day) => `<div class="row${day === today ? ' today' : ''}">
        <span>${this._loc.daysShort[day]}</span>${this._bar(week[day], pieceFor(day), false, false)}</div>`).join('');
    const ticks = [0, 6, 12, 18, 24].map((h) => `<span>${this._loc.tick(h)}</span>`).join('');

    this.shadowRoot.innerHTML = `<style>${MORE_INFO_STYLE}</style>
      <div class="wrap">
        <div class="title">${esc(t('schedule'))} <span class="muted">· ${esc(mode)}</span></div>
        ${status}
        <div class="today-lbl">${esc(t('todayTitle'))}</div>
        ${this._bar(segs, pieceFor(today), true, true)}
        ${endDay}
        <div class="ticks">${ticks}</div>
        <details><summary>${esc(t('week'))}</summary><div class="week">${rows}</div></details>
      </div>`;
    // Keeps the "week" section open / closed across redraws
    const det = this.shadowRoot.querySelector('details');
    det.open = !!this._weekOpen;
    det.addEventListener('toggle', () => { this._weekOpen = det.open; });
  }

  _onClick(e) {
    const b = e.target.closest('button');
    if (!b || !this._hass) return;
    const d = this._currentOverride();
    if (!d) return;
    if (b.hasAttribute('data-del')) return this._send(null);
    this._setEnd(new Date(parseDate(d.fin).getTime() + Number(b.dataset.min) * 60000));
  }

  _onChange(e) {
    const el = e.target;
    if (!el.hasAttribute('data-end') || !el.value) return;
    // Next occurrence of this time (today, otherwise tomorrow)
    const endsAt = new Date();
    endsAt.setHours(0, 0, 0, 0);
    endsAt.setMinutes(Math.round(toMin(el.value) / MORE_INFO_CFG.step) * MORE_INFO_CFG.step);
    if (endsAt <= new Date()) endsAt.setDate(endsAt.getDate() + 1);
    this._setEnd(endsAt);
  }

  // ----- dragging the override's end -----

  _onDown(e) {
    const h = e.target.closest('.override-handle');
    if (!h) return;
    const piece = (this._pieces || []).find((p) => p.isLast);
    if (!piece) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    h.classList.add('drag');
    this._drag = { piece, handle: h, el: h.parentElement, bar: h.closest('.bar'), end: piece.end, moved: false };
  }

  _onMove(e) {
    const dr = this._drag;
    if (!dr) return;
    const step = MORE_INFO_CFG.step;
    const p = dr.piece;
    const r = dr.bar.getBoundingClientRect();
    const raw = Math.max(0, Math.min(DAY_MIN, ((e.clientX - r.left) / r.width) * DAY_MIN));
    const isToday = p.d0.toDateString() === new Date().toDateString();
    const min = Math.max(p.start + step, isToday ? Math.ceil((nowMin() + 1) / step) * step : 0);
    const m = Math.max(min, Math.min(DAY_MIN, Math.round(raw / step) * step));
    if (m === dr.end) return;
    dr.end = m;
    dr.moved = true;
    dr.el.style.width = `${pct(m - p.start)}%`;
    dr.handle.querySelector('.tip').textContent = this._loc.time(m);
  }

  _onUp() {
    const dr = this._drag;
    if (!dr) return;
    this._drag = null;
    if (dr.moved) this._setEnd(new Date(dr.piece.d0.getTime() + dr.end * 60000));
    else dr.handle.classList.remove('drag');
  }
}

const MORE_INFO_STYLE = `
  :host { display:block; margin:16px 0 8px; }
  .wrap { padding:14px 12px 4px 16px; border-top:1px solid var(--divider-color); }
  .title { font-weight:600; margin-bottom:8px; }
  .muted { color:var(--secondary-text-color); font-weight:normal; font-size:.9em; }
  .status { font-size:.92em; margin-bottom:10px; }
  .status.derogation { display:flex; flex-direction:column; gap:8px; }
  .override-value { padding:2px 8px; border-radius:6px; color:#fff; font-weight:600;
    background:repeating-linear-gradient(135deg, #7b1fa2 0 6px, #9c4dcc 6px 12px); }
  .btns { display:flex; flex-wrap:wrap; gap:6px; }
  button { font:inherit; font-size:.85em; padding:5px 10px; border-radius:8px; cursor:pointer;
    border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color); }
  button.danger { color:var(--error-color,#db4437); border-color:var(--error-color,#db4437); }
  .today-lbl { font-size:.8em; color:var(--secondary-text-color); margin-bottom:4px; }
  .bar { position:relative; height:12px; border-radius:4px; overflow:hidden; background:var(--divider-color); flex:1; }
  .bar.big { height:30px; border-radius:6px; overflow:visible; }
  .seg { position:absolute; top:0; bottom:0; color:#fff; font-size:10.5px; font-weight:600; overflow:hidden;
    display:flex; align-items:center; padding-left:4px; box-sizing:border-box; white-space:nowrap; }
  .bar.big .seg:first-child { border-radius:6px 0 0 6px; }
  .bar.big .seg:nth-last-child(1 of .seg) { border-radius:0 6px 6px 0; }
  .override { position:absolute; top:2px; bottom:2px; border:2px solid #fff; border-radius:3px; box-sizing:border-box;
    background:repeating-linear-gradient(135deg, #7b1fa2 0 5px, #9c4dcc 5px 10px); }
  .bar:not(.big) .override { top:0; bottom:0; border-width:1px; }
  .bar.big .override { z-index:2; box-shadow:0 1px 4px rgba(0,0,0,.35); }
  .override-handle { position:absolute; top:-6px; bottom:-6px; right:-10px; width:18px; cursor:ew-resize; touch-action:none; }
  .override-handle::after { content:''; position:absolute; left:6px; top:3px; bottom:3px; width:6px; border-radius:3px;
    background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.45); }
  .tip { display:none; position:absolute; bottom:100%; left:50%; transform:translate(-50%,-2px); z-index:4;
    padding:2px 6px; border-radius:4px; font-size:11px; white-space:nowrap;
    background:var(--primary-text-color); color:var(--card-background-color); }
  .override-handle:hover .tip, .override-handle.drag .tip { display:block; }
  .line { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
  input[type=time] { font:inherit; padding:3px 6px; border-radius:6px; border:1px solid var(--divider-color);
    background:var(--card-background-color); color:var(--primary-text-color); }
  .bar.big + .today-lbl { margin-top:8px; }
  .now { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; z-index:3; pointer-events:none;
    background:var(--primary-text-color); }
  .ticks { display:flex; justify-content:space-between; font-size:10px; color:var(--secondary-text-color); margin-top:3px; }
  details { margin-top:10px; }
  summary { cursor:pointer; font-size:.88em; color:var(--secondary-text-color); }
  .week { display:flex; flex-direction:column; gap:4px; margin-top:8px; }
  .row { display:flex; align-items:center; gap:8px; font-size:.8em; color:var(--secondary-text-color); }
  .row span { width:28px; }
  .row.today span { color:var(--primary-color); font-weight:700; }
`;

if (!customElements.get('chauffage-moreinfo')) customElements.define('chauffage-moreinfo', ChauffageMoreInfo);

// DOM search through shadow roots
function deepQuery(root, selector, depth = 0) {
  if (!root || depth > 12) return null;
  const found = root.querySelector(selector);
  if (found) return found;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const r = deepQuery(el.shadowRoot, selector, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

// Watches the more-info dialog while it is open and (re)inserts the block
function watchMoreInfo(entityId) {
  clearInterval(window.__chauffageMoreInfoTimer);
  let tries = 0;
  let injected = false;
  const tick = () => {
    tries += 1;
    const ha = document.querySelector('home-assistant');
    const hass = ha && ha.hass;
    const dialog = ha && ha.shadowRoot && ha.shadowRoot.querySelector('ha-more-info-dialog');
    // Displayed entity: the dialog's internal property when available, otherwise the event's
    const current = dialog && ('_entityId' in dialog ? dialog._entityId : entityId);
    if (!hass || !dialog || !current) {
      if (injected || tries > 25) clearInterval(window.__chauffageMoreInfoTimer);
      return;
    }
    const progs = hass.states[MORE_INFO_CFG.sensor] && hass.states[MORE_INFO_CFG.sensor].attributes.programmes;
    // Location: end of the dialog's "info" view; otherwise right after the thermostat controls
    const info = deepQuery(dialog.shadowRoot, 'ha-more-info-info');
    const content = info ? null : deepQuery(dialog.shadowRoot, 'more-info-content');
    const host = info ? info.shadowRoot || info : content && content.parentNode;
    if (!host) return; // another dialog tab (history, settings…)
    let block = host.querySelector('chauffage-moreinfo');
    if (!current.startsWith('climate.') || !progs || typeof progs !== 'object' || !progs[current]) {
      if (block) block.remove();
      return;
    }
    if (!block) {
      block = document.createElement('chauffage-moreinfo');
      if (info) host.appendChild(block);
      else content.after(block);
    }
    injected = true;
    block.entity = current;
    block.hass = hass;
  };
  // Immediate update (avoids briefly showing the previous thermostat's block), then on the
  // next frame (dialog rendering), then continuously while the dialog is open
  tick();
  requestAnimationFrame(tick);
  window.__chauffageMoreInfoTimer = setInterval(tick, 400);
}

// Migrates the stored schedules as soon as an admin opens any Home Assistant page, so that the
// automation never waits for someone to open the card
if (!window.__chauffageMigrationWatch && document.querySelector('home-assistant')) {
  window.__chauffageMigrationWatch = true;
  let tries = 0;
  const timer = setInterval(() => {
    const ha = document.querySelector('home-assistant');
    const hass = ha && ha.hass;
    if (hass && hass.states && hass.states[MORE_INFO_CFG.sensor]) {
      clearInterval(timer);
      migrateOnce(hass, MORE_INFO_CFG);
    } else if (++tries > 60) clearInterval(timer);
  }, 1000);
}

if (!window.__chauffageMoreInfoListener) {
  window.__chauffageMoreInfoListener = true;
  window.addEventListener('hass-more-info', (e) => {
    const id = e.detail && e.detail.entityId;
    if (id) watchMoreInfo(id);
  });
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'chauffage-programme-card')) window.customCards.push({
  type: 'chauffage-programme-card',
  name: resolveLanguage(null, typeof navigator !== 'undefined' && navigator.language) === 'fr' ? 'Programme de chauffe' : 'Heating schedule',
  description: resolveLanguage(null, typeof navigator !== 'undefined' && navigator.language) === 'fr'
    ? 'Plannings de chauffe hebdomadaires, plusieurs thermostats par journée'
    : 'Weekly heating schedules, several thermostats per day',
});

console.info(`%c ha-chauffage %c ${VERSION} `, 'background:#f57c00;color:#fff;border-radius:3px 0 0 3px', 'background:#555;color:#fff;border-radius:0 3px 3px 0');

// Exports for the tests (tests/js); no effect on Home Assistant, which loads this file as a module.
export {
  VERSION, DATA_VERSION, MIGRATIONS, DataVersionError, migrateSchedules, readSchedules, saveMigratedSchedules,
  PRESETS, I18N, makeLocale, toMin, toHM, parseDate, normalize, parseDay, serializeDay,
  overridePieces, overrideLabel, activeOverrides, MORE_INFO_CFG,
  ChauffageProgrammeCard, ChauffageMoreInfo,
};
