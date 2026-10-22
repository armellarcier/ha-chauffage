/*
 * chauffage-programme-card
 * Lovelace card: visual editor for the weekly heating schedules
 * 7 days, each with one row per displayed thermostat.
 *
 * Served by the Chauffage integration (custom_components/chauffage) and loaded on every page;
 * reads and writes through its websocket API.
 */

// Release version (same as package.json and CHANGELOG.md)
const VERSION = '0.6.0-beta.2';

const DAY_MIN = 1440;

// ---------- i18n ----------
// UI texts in English and French. The language follows the user's Home Assistant language
// (French for any "fr*" language, English otherwise) unless the card sets `language`.
// Schedule and preset names are data (set by the user): not translated here.
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
    thenSchedule: 'then {preset} (schedule)',
    newOverride: 'Temporary setpoint…',
    resume: 'Resume the schedule',
    activeSchedule: 'Active schedule',
    activeScheduleBar: 'Active schedule: <strong>{schedule}</strong>',
    noActiveSchedule: 'No active schedule',
    activate: 'Activate “{schedule}”',
    scheduleActivated: '“{schedule}” activated',
    newSchedule: 'New schedule',
    scheduleMenu: 'Rename, move or delete this schedule',
    scheduleName: 'Name',
    emptySchedule: 'Empty (Eco all week)',
    copyOfName: 'Copy of “{name}”',
    renameMenu: 'Rename…',
    deleteMenu: 'Delete…',
    create: 'Create',
    rename: 'Rename',
    scheduleId: 'Id: {id}',
    moveLeft: '◀ Move left',
    moveRight: 'Move right ▶',
    deleteSchedule: 'Delete',
    confirmDelete: 'Delete “{name}” and its weeks?',
    cannotDeleteActive: 'The active schedule cannot be deleted.',
    cannotDeleteLast: 'The last schedule cannot be deleted.',
    cannotDeleteInRules: 'Used by the activation rules (Rules view): it cannot be deleted.',
    nameRequired: 'Give the schedule a name.',
    nameTaken: 'This name is already used.',
    multiple: 'Multiple',
    multipleTitle: 'Turn on to show several thermostats (shortcut: Ctrl+click a thermostat)',
    all: 'All',
    allTitle: 'Show every thermostat',
    history: 'History',
    historyTitle: 'Show the measured temperature of the last 7 days (dashed: the setpoint applied)',
    historyUnavailable: 'History unavailable: {message}',
    measured: 'measured {range}°',
    setpoint: 'setpoint {range}°',
    showLarger: 'Show the day larger',
    showSmaller: 'Show the day smaller',
    readout: '{time} · {measured} · setpoint {setpoint}',
    copyWeekTo: 'Copy {name}’s week to…',
    cancel: 'Cancel',
    save: 'Save',
    unsaved: 'Unsaved changes',
    destinations: { weekdays: 'Mon–Fri', weekend: 'Sat–Sun', all: 'every day', others: 'the other thermostats' },
    dayCopiedTo: '{name} · {day} copied to {destination}',
    weekCopiedTo: '{source}’s week copied to {target} · {schedule}',
    copied: 'Copied: {label}',
    pastedOn: 'Pasted on {name} · {day}',
    schedule: 'Schedule',
    followsSchedule: 'Follows the schedule:',
    untilThen: '{current} until {time}, then {next}',
    untilMidnight: '{current} until midnight',
    todayTitle: 'Today',
    week: 'Week',
    stale: 'These schedules were changed elsewhere in the meantime: cancel to reload them, then redo your changes.',
    presetHint: '(its preset)',
    presetFor: '{preset} · {name}',
    ownPreset: 'Thermostat preset',
    presetTemperature: 'Temperature',
    presetAuto: 'Automatic ({value})',
    presetAutoShort: 'Auto ({value})',
    apply: 'OK',
    viewSchedule: 'Schedule',
    viewPresets: 'Presets',
    presetDefaults: 'Default',
    defaultFor: '{preset} · default',
    defaultHelp: 'Used by thermostats set to automatic that have no preset of their own named like this one.',
    keyPreset: 'follows a thermostat preset',
    keyCustom: 'set for this thermostat',
    keyDefault: 'preset default',
    addPreset: 'Add a preset',
    newPreset: 'New preset',
    presetName: 'Name',
    presetColor: 'Color',
    deletePreset: 'Delete this preset',
    replaceWith: 'replaced by',
    viewRules: 'Rules',
    rulesIntro: 'Schedules activated by themselves: the first rule that applies wins (its template is true, or gives the name or id of a schedule). A schedule chosen by hand stays until the rules give another one.',
    rulesEmpty: 'No rules: the active schedule is chosen by hand (card, select entity, automations).',
    rulesTry: 'Try a template',
    ruleActivates: 'activates',
    ruleTrue: 'true',
    ruleFalse: 'false',
    ruleError: 'template error',
    ruleUnsaved: 'not saved',
    ruleNoSchedule: 'no schedule',
    ruleTemplateGives: 'the schedule the template gives',
    ruleText: 'gives “{text}”',
    ruleNotBoolean: 'neither true nor false: counts as false',
    ruleNamesNone: 'no schedule with this name or id',
    ruleChooseSchedule: 'true or false: choose the schedule it activates',
    ruleAdd: '+ Add a rule',
    ruleUp: 'Move up',
    ruleDown: 'Move down',
    rulesOtherwise: 'Otherwise',
    rulesKeep: 'keep the active schedule',
    rulesOutcome: 'The rules give {schedule}.',
    rulesNoOutcome: 'No rule is true: the active schedule stays.',
    rulesByHand: '{schedule} was chosen by hand: it stays until the rules change.',
    integrationMissing: 'The Chauffage integration is not set up: add it in Settings → Devices & services.',
    restartNeeded: 'Chauffage was updated: restart Home Assistant to finish the update.',
    // The card in HA's "Add card" dialog
    cardName: 'Heating schedules',
    cardDescription: 'Weekly heating schedules, several thermostats per day',
    // Visual editor of the card
    editorThermostats: 'Thermostats (required)',
    editorThermostat: 'Thermostat',
    editorEdit: 'Edit',
    editorRemove: 'Remove',
    editorBack: 'Back',
    editorShownAs: 'Shown as “{name}”',
    editorName: 'Name (optional)',
    editorNameDefault: 'Leave empty to use “{name}”',
    editorShowAll: 'Show every thermostat at first',
    editorStep: 'Time step (minutes)',
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
    deleteAndResume: 'Supprimer · reprendre le planning',
    thenSchedule: 'puis {preset} (planning)',
    newOverride: 'Consigne temporaire…',
    resume: 'Reprendre le planning',
    activeSchedule: 'Planning actif',
    activeScheduleBar: 'Planning actif : <strong>{schedule}</strong>',
    noActiveSchedule: 'Aucun planning actif',
    activate: 'Activer « {schedule} »',
    scheduleActivated: 'Planning « {schedule} » activé',
    newSchedule: 'Nouveau planning',
    scheduleMenu: 'Renommer, déplacer ou supprimer ce planning',
    scheduleName: 'Nom',
    emptySchedule: 'Vide (Éco toute la semaine)',
    copyOfName: 'Copie de « {name} »',
    renameMenu: 'Renommer…',
    deleteMenu: 'Supprimer…',
    create: 'Créer',
    rename: 'Renommer',
    scheduleId: 'Identifiant : {id}',
    moveLeft: '◀ Déplacer à gauche',
    moveRight: 'Déplacer à droite ▶',
    deleteSchedule: 'Supprimer',
    confirmDelete: 'Supprimer « {name} » et ses semaines ?',
    cannotDeleteActive: 'Le planning actif ne peut pas être supprimé.',
    cannotDeleteLast: 'Le dernier planning ne peut pas être supprimé.',
    cannotDeleteInRules: 'Utilisé par les règles d’activation (vue Règles) : il ne peut pas être supprimé.',
    nameRequired: 'Donnez un nom au planning.',
    nameTaken: 'Ce nom est déjà utilisé.',
    multiple: 'Plusieurs',
    multipleTitle: 'Activer pour afficher plusieurs vannes (raccourci : Ctrl+clic sur une vanne)',
    all: 'Toutes',
    allTitle: 'Afficher toutes les vannes',
    history: 'Historique',
    historyTitle: 'Afficher la température mesurée des 7 derniers jours (pointillés : la consigne appliquée)',
    historyUnavailable: 'Historique indisponible : {message}',
    measured: 'mesuré {range}°',
    setpoint: 'consigne {range}°',
    showLarger: 'Voir la journée en grand',
    showSmaller: 'Réduire la journée',
    readout: '{time} · {measured} · consigne {setpoint}',
    copyWeekTo: 'Copier la semaine de {name} vers…',
    cancel: 'Annuler',
    save: 'Enregistrer',
    unsaved: 'Modifications non enregistrées',
    destinations: { weekdays: 'Lun–Ven', weekend: 'Sam–Dim', all: 'tous les jours', others: 'les autres vannes' },
    dayCopiedTo: '{name} · {day} copié vers {destination}',
    weekCopiedTo: 'Semaine de {source} copiée vers {target} · {schedule}',
    copied: 'Copié : {label}',
    pastedOn: 'Collé sur {name} · {day}',
    schedule: 'Planning',
    followsSchedule: 'Suit le planning :',
    untilThen: '{current} jusqu\'à {time}, puis {next}',
    untilMidnight: '{current} jusqu\'à minuit',
    todayTitle: 'Aujourd\'hui',
    week: 'Semaine',
    stale: 'Ces plannings ont été modifiés ailleurs entre-temps : annulez pour les recharger, puis refaites vos modifications.',
    presetHint: '(son préréglage)',
    presetFor: '{preset} · {name}',
    ownPreset: 'Préréglage du thermostat',
    presetTemperature: 'Température',
    presetAuto: 'Automatique ({value})',
    presetAutoShort: 'Auto ({value})',
    apply: 'OK',
    viewSchedule: 'Planning',
    viewPresets: 'Préréglages',
    presetDefaults: 'Par défaut',
    defaultFor: '{preset} · par défaut',
    defaultHelp: 'Utilisée par les thermostats en automatique qui n\'ont pas de préréglage du même nom.',
    keyPreset: 'suit un préréglage de la vanne',
    keyCustom: 'réglé pour cette vanne',
    keyDefault: 'défaut du préréglage',
    addPreset: 'Ajouter un préréglage',
    newPreset: 'Nouveau préréglage',
    presetName: 'Nom',
    presetColor: 'Couleur',
    deletePreset: 'Supprimer ce préréglage',
    replaceWith: 'remplacé par',
    viewRules: 'Règles',
    rulesIntro: 'Les plannings s’activent tout seuls : la première règle qui s’applique l’emporte (son template est vrai, ou donne le nom ou l’identifiant d’un planning). Un planning choisi à la main reste jusqu’à ce que les règles en donnent un autre.',
    rulesEmpty: 'Aucune règle : le planning actif est choisi à la main (carte, entité select, automatisations).',
    rulesTry: 'Essayer un template',
    ruleActivates: 'active',
    ruleTrue: 'vrai',
    ruleFalse: 'faux',
    ruleError: 'erreur du template',
    ruleUnsaved: 'non enregistrée',
    ruleNoSchedule: 'aucun planning',
    ruleTemplateGives: 'le planning donné par le template',
    ruleText: 'rend « {text} »',
    ruleNotBoolean: 'ni vrai ni faux : compte comme faux',
    ruleNamesNone: 'aucun planning de ce nom ou identifiant',
    ruleChooseSchedule: 'vrai ou faux : choisissez le planning qu’il active',
    ruleAdd: '+ Ajouter une règle',
    ruleUp: 'Monter',
    ruleDown: 'Descendre',
    rulesOtherwise: 'Sinon',
    rulesKeep: 'garder le planning actif',
    rulesOutcome: 'Les règles donnent {schedule}.',
    rulesNoOutcome: 'Aucune règle n’est vraie : le planning actif reste.',
    rulesByHand: '{schedule} a été choisi à la main : il reste jusqu’à ce que les règles changent.',
    integrationMissing: 'L’intégration Chauffage n’est pas configurée : ajoutez-la dans Paramètres → Appareils et services.',
    restartNeeded: 'Chauffage a été mis à jour : redémarrez Home Assistant pour terminer la mise à jour.',
    // The card in HA's "Add card" dialog
    cardName: 'Plannings de chauffe',
    cardDescription: 'Plannings de chauffe hebdomadaires, plusieurs thermostats par journée',
    // Visual editor of the card
    editorThermostats: 'Thermostats (obligatoire)',
    editorThermostat: 'Thermostat',
    editorEdit: 'Modifier',
    editorRemove: 'Retirer',
    editorBack: 'Retour',
    editorShownAs: 'Affiché « {name} »',
    editorName: 'Nom (facultatif)',
    editorNameDefault: 'Laisser vide pour « {name} »',
    editorShowAll: 'Afficher tous les thermostats au départ',
    editorStep: 'Pas des horaires (minutes)',
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
const LS_HISTORY = 'chauffage-programme-card:history';
const ICON_COPY = '<svg viewBox="0 0 24 24"><path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 24 24"><path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24"><path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/></svg>';
const ICON_ZOOM = '<svg viewBox="0 0 24 24"><path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5M7,9H12V10H7V9M9,7H10V12H9V7Z"/></svg>';
const ICON_PASTE ='<svg viewBox="0 0 24 24"><path d="M19,20H5V4H7V7H17V4H19M12,2A1,1 0 0,1 13,3A1,1 0 0,1 12,4A1,1 0 0,1 11,3A1,1 0 0,1 12,2M19,2H14.82C14.4,0.84 13.3,0 12,0C10.7,0 9.6,0.84 9.18,2H5A2,2 0 0,0 3,4V20A2,2 0 0,0 5,22H19A2,2 0 0,0 21,20V4A2,2 0 0,0 19,2Z"/></svg>';

const toMin = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const pct = (m) => ((m / DAY_MIN) * 100).toFixed(3);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));
// An activation rule as the integration reads it (no schedule: the template gives it)
const plainRule = (r) => ({ template: r.template, schedule: r.schedule || null });
// HA dates: microseconds truncated to milliseconds (Safari rejects more than 3 decimals)
const parseDate = (s) => new Date(String(s).replace(/(\.\d{3})\d+/, '$1'));
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const todayIdx = () => (new Date().getDay() + 6) % 7;

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

// ---------- overrides (shared by the card and the more-info block) ----------

// Splits an override into one piece per day (today + 6 days)
function overridePieces(d) {
  if (!d) return [];
  const startsAt = parseDate(d.start);
  const endsAt = parseDate(d.end);
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
  if (d.kind === 'temperature') return `${locale.number(d.value)} ${locale.unit}`;
  return locale.preset(d.value);
}

const hmOf = (date) => toHM(date.getHours() * 60 + date.getMinutes());
const minutesOf = (date) => date.getHours() * 60 + date.getMinutes();

function durationText(min, locale = DEFAULT_LOCALE) {
  return min >= 60
    ? locale.t('duration', { h: Math.floor(min / 60), mm: String(min % 60).padStart(2, '0') })
    : `${min} min`;
}

// ---------- data sources ----------
// The card reads and writes through the Chauffage integration's websocket API. The source gives
// the data in the format the card works with: schedules by id, "HH:MM preset" slots,
// overrides as { kind: temperature|preset, value, start, end }.

// ---------- history of the measured temperature ----------
const HISTORY_DAYS = 7;
const HISTORY_MAX_AGE = 5 * 60000; // reloaded every 5 minutes while shown
const RECORDER_DELAY = 60000; // the last minute is loaded again (not written by the recorder yet)
const SETPOINT_MARGIN = 3; // °: a setpoint this close to the measured temperatures widens the scale
const MEASURE_RAMP = 15; // minutes: a measured change after a steady time is drawn as a slope over this
const temperatureOf = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Value of a curve ([minute, value] points, each value held until the next point) at a minute, if covered
function curveValue(line, m) {
  if (!line.length || m < line[0][0] || m > line[line.length - 1][0]) return null;
  return line.filter(([at]) => at <= m).pop()[1];
}

/**
 * Home Assistant's own history (compressed format of `history/history_during_period`: `s` state,
 * `a` attributes, `lu` time in seconds, `lc` when different) → the rows of `chauffage/history`:
 * [time (s), measured, target], null while the thermostat is unavailable.
 */
function rowsOfStates(raw) {
  const out = {};
  for (const [entity, states] of Object.entries(raw || {})) {
    out[entity] = (Array.isArray(states) ? states : []).map((st) => {
      const off = ['unavailable', 'unknown'].includes(st.s);
      const a = st.a || {};
      return [st.lu ?? st.lc, off ? null : temperatureOf(a.current_temperature), off ? null : temperatureOf(a.temperature)];
    });
  }
  return out;
}

/**
 * Rows of `chauffage/history` → per thermostat, per weekday (Monday = 0), its last occurrence
 * (today until now): `current` (measured) and `target` (setpoint applied) temperature as lines of
 * [minute, value] points (each value held until the next point), broken while the thermostat
 * reported no value.
 */
function historyDays(rows, now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = (now.getDay() + 6) % 7;
  const out = {};
  for (const [entity, list] of Object.entries(rows || {})) {
    const points = (Array.isArray(list) ? list : [])
      .map(([t, current, target]) => ({ t: t * 1000, current: temperatureOf(current), target: temperatureOf(target) }))
      .filter((p) => Number.isFinite(p.t))
      .sort((p, q) => p.t - q.t);
    // One day, from `start` (midnight) to `stop` (the next midnight, or now), `end` minutes long
    const lines = (key, start, stop, end) => {
      const done = [];
      let line = null;
      const add = (m, v) => {
        const last = line && line[line.length - 1];
        if (v == null) {
          if (line) done.push([...line, [Math.max(m, last[0]), last[1]]]);
          line = null;
        } else if (!line) {
          line = [[m, v]];
        } else if (v !== last[1]) {
          // Wall-clock minutes (the slots' ones) never go back, even in the repeated hour of winter time
          const at = Math.max(m, last[0]);
          if (at === last[0]) line.pop();
          if (!line.length || line[line.length - 1][1] !== v) line.push([at, v]);
        }
      };
      const before = points.filter((p) => p.t <= start.getTime()).pop();
      if (before) add(0, before[key]);
      for (const p of points) {
        if (p.t > start.getTime() && p.t < stop.getTime()) add(minutesOf(new Date(p.t)), p[key]);
      }
      if (line) {
        const last = line[line.length - 1];
        if (end > last[0]) line.push([end, last[1]]);
        done.push(line);
      }
      return done;
    };
    out[entity] = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const start = new Date(midnight);
      start.setDate(start.getDate() - ((today - d + 7) % 7));
      const next = new Date(start);
      next.setDate(next.getDate() + 1);
      const [stop, end] = d === today ? [now, minutesOf(now)] : [next, DAY_MIN];
      return { current: lines('current', start, stop, end), target: lines('target', start, stop, end) };
    });
  }
  return out;
}

// Rows already loaded + rows loaded from `since` (s), only from the start of the period (the row
// before it kept: the value at its start)
function mergeRows(old, fresh, since, start) {
  const out = {};
  for (const entity of new Set([...Object.keys(old || {}), ...Object.keys(fresh || {})])) {
    const rows = [...((old && old[entity]) || []).filter(([t]) => t < since), ...((fresh && fresh[entity]) || [])];
    const before = rows.filter(([t]) => t <= start).length;
    out[entity] = rows.slice(Math.max(0, before - 1));
  }
  return out;
}

// Home Assistant from a given release on ("2025.11.0b3" and "2025.12.0.dev…" count as their
// release); false when the version is unknown
function haAtLeast(hass, year, month) {
  const m = /^(\d+)\.(\d+)/.exec((hass && hass.config && hass.config.version) || '');
  return !!m && (Number(m[1]) > year || (Number(m[1]) === year && Number(m[2]) >= month));
}

// Name shown for a thermostat: the `name` of the card's config (text, or pieces such as the
// area and the entity, as in HA's own cards) made by HA (from 2025.10); before, a text name or
// the thermostat's own name
function thermostatName(hass, entity, name) {
  const st = hass && hass.states[entity];
  if (st && hass.formatEntityName) return hass.formatEntityName(st, name === '' ? undefined : name) || entity;
  return (typeof name === 'string' && name) || (st && st.attributes.friendly_name) || entity;
}

const integrationAvailable = (hass) => !!(hass && hass.services && hass.services.chauffage);
const filterActive = (raw) => {
  const out = {};
  const now = new Date();
  for (const [c, d] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (d && parseDate(d.end) > now) out[c] = d;
  }
  return out;
};

// One subscription per page, shared by every card and more-info block
const INTEGRATION = {
  data: null,
  seq: 0,
  listeners: new Set(),
  connection: null,
  connect(hass) {
    if (!hass.connection || this.connection === hass.connection) return;
    this.connection = hass.connection;
    hass.connection.subscribeMessage((data) => {
      this.data = data;
      this.seq += 1;
      for (const listener of [...this.listeners]) listener();
    }, { type: 'chauffage/subscribe' }).catch((e) => {
      console.error('ha-chauffage: cannot subscribe to the integration', e);
      this.connection = null;
    });
  },
  listen(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
};

function dataSource(hass) {
  const available = integrationAvailable(hass);
  if (available) INTEGRATION.connect(hass);
  const raw = available ? INTEGRATION.data : null;
  // Data in a format this card does not know: the running integration is older (updated from
  // HACS, Home Assistant not restarted yet)
  const outdated = !!raw && !(Array.isArray(raw.schedules) && raw.weeks && typeof raw.weeks === 'object');
  const d = outdated ? null : raw;
  const schedules = d ? d.schedules : [];
  const ids = new Set(schedules.map((s) => s.id));
  return {
    available, // false: the integration is not set up
    outdated, // true: Home Assistant must be restarted to finish an update
    ready: !!d,
    revision: d ? d.revision : null,
    stamps: d ? { weeks: `r${d.revision}`, overrides: JSON.stringify(d.overrides), schedule: d.active_schedule,
      rules: JSON.stringify([d.rules, d.default_schedule, d.rule_results]) } : {},
    schedules: () => schedules.map((s) => s.id),
    scheduleName: (id) => (schedules.find((s) => s.id === id) || { name: id }).name,
    activeSchedule: () => (d ? d.active_schedule : null),
    // Weeks by thermostat and schedule id, with "HH:MM preset" slots
    weeks: () => {
      const out = {};
      for (const [climate, bySchedule] of Object.entries(d ? d.weeks : {})) {
        out[climate] = {};
        for (const [id, week] of Object.entries(bySchedule)) {
          if (ids.has(id)) out[climate][id] = week.map((day) => day.map(([start, preset]) => `${start} ${preset}`));
        }
      }
      return out;
    },
    overrides: () => ({ ...(d ? d.overrides : {}) }),
    saveWeeks: (weeks, revision) => {
      const out = {};
      for (const [climate, bySchedule] of Object.entries(weeks)) {
        out[climate] = {};
        for (const [id, week] of Object.entries(bySchedule)) {
          if (ids.has(id)) out[climate][id] = week.map((day) => day.map((s) => s.split(' ')));
        }
      }
      return hass.callWS({ type: 'chauffage/weeks/save', weeks: out, ...(revision != null ? { revision } : {}) });
    },
    setOverride: (climate, override) => hass.callWS({ type: 'chauffage/override/set', entity_id: climate, override }),
    overrideDuration: () => (d && d.override_duration) || 120, // minutes, an option of the integration
    activateSchedule: (id) => hass.callWS({ type: 'chauffage/schedule/activate', schedule: id }),
    // Create, rename, move, delete schedules: [{ id, name? } | { name, copy_of? }]
    setSchedules: (list, revision) => hass.callWS({ type: 'chauffage/schedules/set', schedules: list, ...(revision != null ? { revision } : {}) }),
    presets: () => (d && d.presets) || [],
    targets: (climate) => (d && d.targets && d.targets[climate]) || {},
    // Presets and mappings are set from the card by admins (the integration refuses the others)
    editable: !!d && (!hass.user || !!hass.user.is_admin),
    mapping: (climate) => (d && d.mappings && d.mappings[climate]) || {},
    usePresets: () => !d || d.use_presets !== false,
    learned: (climate, preset) => ((d && d.preset_temperatures && d.preset_temperatures[climate]) || {})[preset],
    usedPresets: () => {
      const used = new Set();
      for (const bySchedule of Object.values(d ? d.weeks : {})) {
        for (const week of Object.values(bySchedule)) for (const day of week) for (const [, preset] of day) used.add(preset);
      }
      return [...used];
    },
    setMapping: (climate, mapping) => hass.callWS({ type: 'chauffage/mapping/set', entity_id: climate, mapping }),
    setPresets: (presets, replacements) => hass.callWS({ type: 'chauffage/presets/set', presets, replacements }),
    // Activation rules [{ template, schedule }], the schedule when none is true (null: no change),
    // and each rule now (true, false, null: its template failed)
    rules: () => (d && d.rules) || [],
    defaultSchedule: () => (d && d.default_schedule) || null,
    ruleResults: () => (d && d.rule_results) || [],
    setRules: (rules, defaultSchedule) => hass.callWS({ type: 'chauffage/rules/set', rules, default_schedule: defaultSchedule }),
  };
}

// Presets [{ id, name, color, temperature }]
function presetsOf(src, loc) {
  return src.presets().map((l) => ({ id: l.id, color: l.color || '#9e9e9e', name: l.name || loc.preset(l.id), temperature: l.temperature }));
}
const presetOf = (presets, id, loc) => presets.find((p) => p.id === id) || { id, color: '#9e9e9e', name: loc.preset(id) };
// From the coldest to the warmest
const sortedPresets = (src, loc) => presetsOf(src, loc).sort((a, b) => (a.temperature ?? 19) - (b.temperature ?? 19));

// The value of an override, in the card's popover and the more-info block: one of the presets
// (what it means on this thermostat, as the integration says: `targets`), or a temperature (the
// thermostat's setpoint while the override is a preset). Returns { presets, temperature } HTML.
function overrideValueHtml(d, src, climate, attrs, loc) {
  const targets = src.targets(climate);
  const presets = sortedPresets(src, loc).filter((l) => targets[l.id]).map((l) => {
    const [[kind, value]] = Object.entries(targets[l.id]);
    const on = !!d && d.kind === kind && d.value === value;
    return `<button data-act="override-preset" data-preset="${esc(l.id)}" class="${on ? 'on' : ''}" style="background:${l.color}">${esc(l.name)}</button>`;
  }).join('');
  const value = d && d.kind === 'temperature' ? d.value : attrs.temperature;
  const temperature = `<label>${esc(loc.t('presetTemperature'))} <input type="number" data-override-temperature
    step="${attrs.target_temp_step || 0.5}" min="${attrs.min_temp ?? 5}" max="${attrs.max_temp ?? 30}" value="${value ?? ''}"> ${esc(loc.unit)}</label>`;
  return { presets: `<div class="presets">${presets}</div>`, temperature };
}

// "then Eco (schedule)": what the thermostat goes back to at the override's end
function thenText(src, climate, d, loc) {
  const preset = presetAt(activeWeek(src, climate), parseDate(d.end));
  return preset ? loc.t('thenSchedule', { preset: presetOf(presetsOf(src, loc), preset, loc).name }) : '';
}

const OVERRIDE_TEMPERATURE = 'input[data-override-temperature]';

// A field being typed in, again after a redraw: its text (if any) and the focus, again once
// ha-card (a Lit component rendered asynchronously) shows its content; before that, the field
// cannot take the focus
function restoreTyped(root, selector, value) {
  const input = root.querySelector(selector);
  if (!input) return;
  if (value != null) input.value = value;
  input.focus();
  const card = root.querySelector('ha-card');
  if (card && card.updateComplete instanceof Promise) {
    card.updateComplete.then(() => { if (input.isConnected) input.focus(); });
  }
}

// A new override from now, for the override duration (an option of the integration)
function newOverride(src, kind, value) {
  const start = new Date();
  return { kind, value, start: start.toISOString(), end: new Date(start.getTime() + src.overrideDuration() * 60000).toISOString() };
}

// The saved week of a thermostat in the active schedule, as parsed days (null without one)
function activeWeek(src, climate) {
  const week = (src.weeks()[climate] || {})[src.activeSchedule()];
  return Array.isArray(week) ? [0, 1, 2, 3, 4, 5, 6].map((i) => parseDay(week[i])) : null;
}

// The preset of the slot running at `date`, in a week of parsed days
function presetAt(week, date) {
  const segs = (week && week[(date.getDay() + 6) % 7]) || [];
  const minute = date.getHours() * 60 + date.getMinutes();
  let preset = segs.length ? segs[0].preset : null;
  for (const s of segs) if (s.start <= minute) preset = s.preset;
  return preset;
}

// The override `d` set to a preset (what it means on this thermostat), until the same end; a new
// override without `d`
function overrideWithPreset(d, src, climate, preset) {
  const target = src.targets(climate)[preset];
  if (!target) return null;
  const [[kind, value]] = Object.entries(target);
  return d ? { ...d, kind, value } : newOverride(src, kind, value);
}

// The override `d` set to a temperature, until the same end; a new override without `d`
function overrideWithTemperature(d, src, value) {
  return d ? { ...d, kind: 'temperature', value } : newOverride(src, 'temperature', value);
}
// What Home Assistant reads as true or false in a template's text (any other text is false)
const BOOLEAN_WORDS = ['true', 'false', 'on', 'off', 'yes', 'no', '1', '0', 'enable', 'disable'];
// Another preset for a new slot: comfort ↔ eco when they exist, otherwise the next preset
function otherPreset(presets, id) {
  const ids = presets.map((p) => p.id);
  if (id === 'comfort' && ids.includes('eco')) return 'eco';
  if (id !== 'comfort' && ids.includes('comfort')) return 'comfort';
  return ids[(ids.indexOf(id) + 1) % ids.length] || id;
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
    this._rulesDraft = null; // activation rules being edited ({ rules, def })
    this._previewDelay = 400; // ms of pause in the typing before a rule is tried
    this._preview = null; // last try of the rules shown ({ rules, data })
    this._lastClick = null;
    this._renderedDay = null;
    // Internal clipboard: { segs, label }, shared between cards through localStorage
    this._clip = null;
    this._clipSrc = null; // { climate, schedule, day } of the copied row (highlight)
    this._menu = null; // { climate, day, top, right } open row menu
    this._multiSel = false; // "Plusieurs" mode: clicking a thermostat adds / removes it
    // Overrides (temporary setpoints): sent to HA right away, without "Enregistrer"
    this._overrideSel = null; // { climate, day } override whose popover is open
    this._overrideDrag = null;
    this._overridePending = {}; // changes sent, waiting for the integration's update
    this._overrideStamp = undefined;
    // Measured temperature of the last 7 days, drawn over the bars: rows loaded (until a time), days drawn
    this._zoom = null; // { climate, day } shown larger (with the history)
    this._readTouch = false; // a finger reads the values along the bar shown larger
    this._history = { shown: false, rows: null, until: 0, days: null, loadedAt: 0, day: null, loading: false };
    try {
      const c = JSON.parse(localStorage.getItem(LS_CLIP));
      if (c && Array.isArray(c.segs) && c.segs.length) this._clip = c;
      this._history.shown = localStorage.getItem(LS_HISTORY) === '1';
    } catch (e) { /* ignore */ }
    this._bindEvents();
  }

  static getConfigElement() {
    return document.createElement('chauffage-programme-card-editor');
  }

  // A new card (Add card dialog): the thermostats that already have a schedule in Chauffage,
  // otherwise every thermostat
  static async getStubConfig(hass) {
    const climates = Object.keys(hass.states).filter((e) => e.startsWith('climate.'));
    let src = dataSource(hass);
    if (src.available && !src.ready) {
      await new Promise((resolve) => {
        const stop = INTEGRATION.listen(() => { stop(); resolve(); });
        setTimeout(() => { stop(); resolve(); }, 2000);
      });
      src = dataSource(hass);
    }
    const scheduled = Object.keys(src.weeks()).filter((e) => hass.states[e]);
    return { thermostats: scheduled.length ? scheduled : climates };
  }

  setConfig(config) {
    if (!config.thermostats || !config.thermostats.length) {
      const lang = config.language || (typeof navigator !== 'undefined' && navigator.language);
      throw new Error(makeLocale(null, lang).t('thermostatsRequired'));
    }
    this._config = {
      step: 15,
      ...config,
    };
    this._thermostats = config.thermostats.map((t) => (typeof t === 'string' ? { entity: t } : t));
    // The more-info block uses the same entities as the card
    for (const k of Object.keys(MORE_INFO_CFG)) MORE_INFO_CFG[k] = this._config[k];
    this._shown = this._initialShown();
    this._schedule = null;
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
    const src = this._source();
    if (src.available && !this._unlisten) {
      // Data pushed by the integration: same checks as a hass update
      this._unlisten = INTEGRATION.listen(() => { if (this._hass) this.hass = this._hass; });
    }
    const stamp = src.stamps.weeks;
    if ((stamp !== this._stamp || !this._data) && !this._dirty && !this._drag) {
      this._load();
      this._stamp = stamp;
      need = true;
    }
    const dstamp = src.stamps.overrides;
    if (dstamp !== this._overrideStamp && !this._overrideDrag && !this._drag) {
      this._overrideStamp = dstamp;
      this._overridePending = {};
      need = true;
    }
    // Active schedule changed (from the card, another dashboard or an automation): redraw the
    // active-schedule marker and the "activate" bar
    const scheduleStamp = src.stamps.schedule;
    if (scheduleStamp !== this._scheduleState && !this._drag && !this._overrideDrag) {
      this._scheduleState = scheduleStamp;
      need = true;
    }
    // Activation rules changed, or one became true or false: redraw the "Rules" view
    if (src.stamps.rules !== this._rulesStamp) {
      this._rulesStamp = src.stamps.rules;
      if (this._view === 'rules') need = true;
    }
    if (src.ready && this._wantSchedule && this._schedules().includes(this._wantSchedule)) {
      this._schedule = this._wantSchedule; // created from this card
      this._wantSchedule = null;
      need = true;
    } else if (src.ready && (!this._schedule || !this._schedules().includes(this._schedule))) {
      const active = this._activeSchedule();
      this._schedule = this._schedules().includes(active) ? active : this._schedules()[0];
      need = true;
    }
    if (need) this._render();
    else this._updateLive();
    this._refreshHistory();
  }

  // Thermostats shown at first: those chosen last on this device, else the config's `show`.
  // A preview (Add card dialog, card editor) shows what its config says.
  _initialShown() {
    const all = this._thermostats.map((t) => t.entity);
    const show = this._config.show;
    let saved = null;
    this._shownForPreview = this._isPreview();
    if (!this._shownForPreview) {
      try { saved = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { /* ignore */ }
    }
    const fromSaved = Array.isArray(saved) ? all.filter((e) => saved.includes(e)) : [];
    const fromConfig = show === 'all' ? all : Array.isArray(show) ? all.filter((e) => show.includes(e)) : [all[0]];
    return fromSaved.length ? fromSaved : fromConfig.length ? fromConfig : [all[0]];
  }

  // HA sets `preview` on the cards it previews (suggestions, card editor), after their config;
  // the cards of the "By card" list are not marked, but shown in its <hui-card-picker>
  _isPreview() {
    const root = this.getRootNode && this.getRootNode();
    return !!this._previewed || !!(root && root.host && root.host.localName === 'hui-card-picker');
  }

  get preview() { return !!this._previewed; }

  set preview(value) {
    this._previewed = !!value;
    this._previewChanged();
  }

  _previewChanged() {
    if (!this._config || this._isPreview() === this._shownForPreview) return;
    this._shown = this._initialShown();
    if (this._hass) this._render();
  }

  connectedCallback() {
    this._previewChanged();
    this._timer = setInterval(() => {
      if (this._drag || this._overrideDrag) return;
      this._refreshHistory();
      // Full redraw on a new day or during an override (it moves with the time)
      if (this._renderedDay !== todayIdx() || Object.keys(this._overrides()).length) this._render();
      else this._updateLive();
    }, 30000);
    // Closes the row menu / popovers on a click outside the card or the Escape key
    const closePopups = () => {
      if (!this._menu && !this._sel && !this._overrideSel && !this._schedEd && !this._cell) return;
      this._menu = null;
      this._cell = null;
      this._schedEd = null;
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
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
    clearTimeout(this._previewTimer);
    this._closePreview();
    this._previewKey = null;
    document.removeEventListener('pointerdown', this._onDocDown, true);
    document.removeEventListener('keydown', this._onKey);
  }

  getCardSize() {
    return 4 + 7 * this._shown.length;
  }

  // Sections view: as wide as the section by default; narrower than half of it, the bars
  // of the week can no longer be read (#10)
  getGridOptions() {
    return { columns: 'full', min_columns: 6 };
  }

  // ---------- data ----------

  _source() {
    return dataSource(this._hass);
  }

  // Presets as shown (columns, legend, slot popover): from the coldest to the warmest default
  // temperature; the integration keeps them in their own order
  _presets() {
    return sortedPresets(this._source(), this._loc);
  }

  _preset(id) {
    return presetOf(this._presets(), id, this._loc);
  }

  _schedules() {
    return this._source().schedules();
  }

  _activeSchedule() {
    return this._source().activeSchedule();
  }

  _scheduleName(id) {
    return this._source().scheduleName(id);
  }

  _load() {
    const src = this._source();
    this._data = {};
    this._revision = src.revision;
    for (const [climate, bySchedule] of Object.entries(src.weeks())) {
      if (!bySchedule || typeof bySchedule !== 'object') continue;
      this._data[climate] = {};
      for (const [schedule, week] of Object.entries(bySchedule)) {
        if (!Array.isArray(week)) continue;
        this._data[climate][schedule] = [0, 1, 2, 3, 4, 5, 6].map((i) => parseDay(week[i]));
      }
    }
  }

  _week(climate, schedule = this._schedule) {
    if (!this._data[climate]) this._data[climate] = {};
    if (!this._data[climate][schedule]) {
      this._data[climate][schedule] = [0, 1, 2, 3, 4, 5, 6].map(() => [{ start: 0, preset: 'eco' }]);
    }
    return this._data[climate][schedule];
  }

  _name(entity) {
    const t = this._thermostats.find((x) => x.entity === entity);
    return thermostatName(this._hass, entity, t && t.name);
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
    const raw = this._hass ? this._source().overrides() : {};
    const out = raw && typeof raw === 'object' ? { ...raw } : {};
    for (const [c, d] of Object.entries(this._overridePending)) {
      if (d) out[c] = d;
      else delete out[c];
    }
    const now = new Date();
    for (const [c, d] of Object.entries(out)) {
      if (!d || !(parseDate(d.end) > now)) delete out[c];
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
      await this._source().setOverride(climate, override);
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
    this._sendOverride(climate, { ...d, end: f.toISOString() });
  }

  async _save() {
    const out = {};
    for (const [climate, bySchedule] of Object.entries(this._data)) {
      out[climate] = {};
      for (const [schedule, week] of Object.entries(bySchedule)) out[climate][schedule] = week.map(serializeDay);
    }
    try {
      const result = await this._source().saveWeeks(out, this._revision);
      if (result && result.revision != null) this._revision = result.revision;
      this._dirty = false;
      this._msg = this._loc.t('saved');
      this._render();
      return true;
    } catch (e) {
      // Integration: edited elsewhere since this copy was loaded
      this._msg = e && e.code === 'stale' ? this._loc.t('stale') : this._loc.t('error', { message: e.message || e.code || e });
      this._render();
      return false;
    }
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
    if (d) parts.push(`⏱ ${this._overrideLabel(d)} → ${this._loc.time(minutesOf(parseDate(d.end)))}`);
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
    // Override to a preset: the temperature field shows the thermostat's setpoint (not while typed in)
    const input = root.querySelector('.override-ed input[data-override-temperature]');
    const sel = this._overrideSel && this._overrides()[this._overrideSel.climate];
    if (input && sel && sel.kind !== 'temperature' && root.activeElement !== input) {
      const st = this._hass.states[this._overrideSel.climate];
      const temperature = st && st.attributes.temperature;
      input.value = temperature ?? '';
    }
  }

  // ---------- history of the measured temperature ----------

  // Loads the last 7 days from the recorder while the history is shown: at once when asked
  // (`force`), on a new day, otherwise once it is older than 5 minutes
  _refreshHistory(force = false) {
    const h = this._history;
    if (!h.shown || h.loading || !this._hass || !this._config) return;
    if (!force && h.day === todayIdx() && Date.now() - h.loadedAt < HISTORY_MAX_AGE) return;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (HISTORY_DAYS - 1));
    // Once loaded, only what is new (from a minute before the last load)
    const since = h.rows ? new Date(Math.max(start.getTime(), h.until - RECORDER_DELAY)) : start;
    h.loading = true;
    h.loadedAt = Date.now();
    h.day = todayIdx();
    if (!h.days) this._render(); // the button shows the loading
    return this._fetchHistory(since, now)
      .then((rows) => {
        h.rows = mergeRows(h.rows, rows, since.getTime() / 1000, start.getTime() / 1000);
        h.until = now.getTime();
        h.days = historyDays(h.rows, now);
      })
      .catch((e) => { this._msg = this._loc.t('historyUnavailable', { message: (e && e.message) || e }); })
      .then(() => {
        h.loading = false;
        if (h.shown && !this._drag && !this._overrideDrag) this._render();
      });
  }

  // Rows of every thermostat of the card from the integration, which only sends the two
  // temperatures; an integration updated but not restarted yet does not know the command:
  // Home Assistant's own history then (every attribute: much bigger)
  _fetchHistory(since, now) {
    const msg = { entity_ids: this._thermostats.map((t) => t.entity), start_time: since.toISOString(), end_time: now.toISOString() };
    return Promise.resolve()
      .then(() => this._hass.callWS({ type: 'chauffage/history', ...msg }))
      .catch((e) => {
        if (!e || e.code !== 'unknown_command') throw e;
        return this._hass.callWS({ type: 'history/history_during_period', ...msg, minimal_response: false, no_attributes: false, significant_changes_only: false })
          .then(rowsOfStates);
      });
  }

  _toggleHistory() {
    const h = this._history;
    h.shown = !h.shown;
    if (!h.shown) this._zoom = null;
    try { localStorage.setItem(LS_HISTORY, h.shown ? '1' : '0'); } catch (e) { /* ignore */ }
    this._render();
    if (h.shown) this._refreshHistory(true);
  }

  _toggleZoom(climate, day) {
    this._zoom = this._isZoomed(climate, day) ? null : { climate, day };
    this._render();
  }

  _historyOf(climate, day) {
    const h = this._history;
    return h.shown && h.days && h.days[climate] ? h.days[climate][day] : null;
  }

  _isZoomed(climate, day) {
    const z = this._zoom;
    return !!z && z.climate === climate && z.day === day && !!this._historyOf(climate, day);
  }

  // Scale of a bar: the measured temperatures and the setpoints close to them, of the thermostat's
  // 7 days (comparable days), or of the day alone when it is shown larger (its details)
  _historyScale(climate, day) {
    const days = this._isZoomed(climate, day) ? [this._history.days[climate][day]] : this._history.days[climate];
    const values = days.flatMap((x) => x.current.flat().map(([, v]) => v));
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    for (const v of days.flatMap((x) => x.target.flat().map(([, t]) => t))) {
      if (v >= lo - SETPOINT_MARGIN && v <= hi + SETPOINT_MARGIN) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (hi - lo < 2) { lo = (lo + hi) / 2 - 1; hi = lo + 2; }
    // Position (% of the bar's height, from the top) of a temperature; out of the scale: on the edge
    return { lo, hi, y: (v) => Math.max(3, Math.min(97, 90 - ((v - lo) / (hi - lo)) * 80)) };
  }

  // Measured temperature and setpoint applied (over it); a setpoint far from the measured
  // temperatures (frost protection at night…) stays on the edge of the bar
  _historyHtml(climate, day) {
    const hd = this._historyOf(climate, day);
    if (!hd || !hd.current.length) return '';
    const scale = this._historyScale(climate, day);
    const y = (v) => scale.y(v).toFixed(1);
    const steps = (lines) => lines.map((l) => l.map(([m, v], i) => {
      if (!i) return `M${m} ${y(v)}`;
      return y(v) === y(l[i - 1][1]) ? `H${m}` : `H${m} V${y(v)}`;
    }).join(' ')).join(' ');
    // Measured: straight lines between the values, held flat until MEASURE_RAMP minutes before a
    // change (the rows only come when the value changes: no slope over hours)
    const measured = hd.current.map((l) => l.flatMap(([m, v], i) => {
      if (!i) return [`M${m} ${y(v)}`];
      const [m0, v0] = l[i - 1];
      const hold = v !== v0 && m - m0 > MEASURE_RAMP ? [`L${m - MEASURE_RAMP} ${y(v0)}`] : [];
      return [...hold, `L${m} ${y(v)}`];
    }).join(' ')).join(' ');
    const target = steps(hd.target);
    // Two layers: only the setpoint has a shadow
    const layer = (cls, path) => `<svg class="history${cls}" viewBox="0 0 ${DAY_MIN} 100" preserveAspectRatio="none" aria-hidden="true">${path}</svg>`;
    return layer('', `<path class="measured" d="${measured}"/>`)
      + (target ? layer(' setpoint', `<path class="target" d="${target}"/>`) : '')
      + (this._isZoomed(climate, day) ? this._zoomHtml(scale) : '');
  }

  // A day shown larger: a scale in degrees (a line every 1, 2 or 5°), and the readout of the values
  // under the mouse or the finger
  _zoomHtml({ lo, hi, y }) {
    const step = hi - lo <= 6 ? 1 : hi - lo <= 12 ? 2 : 5;
    const marks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) marks.push(v);
    const axis = marks.map((v) => `<i style="top:${y(v).toFixed(1)}%"></i><span style="top:${y(v).toFixed(1)}%">${this._loc.number(v)}°</span>`).join('');
    return `<div class="yaxis">${axis}</div><div class="cross" hidden></div><div class="readout" hidden></div>`;
  }

  // "07:00 · 18.2° · setpoint 20°": the values at a minute of a day shown with its history
  _readoutText(climate, day, m) {
    const hd = this._historyOf(climate, day);
    const at = (lines) => {
      const v = lines.map((l) => curveValue(l, m)).find((x) => x != null);
      return v == null ? '–' : `${this._loc.number(Math.round(v * 10) / 10)}°`;
    };
    return this._loc.t('readout', { time: this._loc.time(m), measured: at(hd.current), setpoint: at(hd.target) });
  }

  _showReadout(bar, clientX) {
    const climate = bar.dataset.climate;
    const day = Number(bar.dataset.day);
    if (!this._historyOf(climate, day)) return;
    const m = Math.min(DAY_MIN - 1, Math.round(this._minuteAt(bar, clientX)));
    const cross = bar.querySelector('.cross');
    const readout = bar.querySelector('.readout');
    cross.hidden = false;
    readout.hidden = false;
    cross.style.left = `${pct(m)}%`;
    readout.style.left = `${pct(m)}%`;
    readout.classList.toggle('left', m > DAY_MIN / 2); // stays inside the bar
    readout.textContent = this._readoutText(climate, day, m);
  }

  _hideReadout(bar) {
    bar.querySelectorAll('.cross, .readout').forEach((el) => { el.hidden = true; });
  }

  // " · measured 18.2–19.6° · setpoint 20°" for a slot of a day shown with its history
  _measuredText(climate, day, start, end) {
    const hd = this._historyOf(climate, day);
    if (!hd) return '';
    const fmt = (v) => this._loc.number(Math.round(v * 10) / 10);
    const range = (lines, key) => {
      const values = lines.flatMap((l) => [
        curveValue(l, start), ...l.filter(([m]) => m > start && m < end).map(([, v]) => v),
      ]).filter((v) => v != null);
      if (!values.length) return '';
      const [min, max] = [Math.min(...values), Math.max(...values)].map(fmt);
      return ` · ${this._loc.t(key, { range: min === max ? min : `${min}–${max}` })}`;
    };
    return range(hd.current, 'measured') + range(hd.target, 'setpoint');
  }

  _segInner(start, end, preset) {
    const dur = end - start;
    const compact = this._shown.length > 1;
    const wide = this._loc.hour12 ? 25 : 0; // "6:30 AM" needs more room than "06:30"
    const t = dur >= (compact ? 60 : 75) + wide ? this._loc.time(start) : '';
    const l = dur >= (compact ? 180 : 150) + wide ? esc(this._preset(preset).name) : '';
    return `<span class="t">${t}</span><span class="l">${l}</span>`;
  }

  _barHtml(climate, segs, d, showNow) {
    const segHtml = segs
      .map((s, i) => {
        const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
        const p = this._preset(s.preset);
        const sel = this._sel && this._sel.climate === climate && this._sel.day === d && this._sel.idx === i;
        const cls = ['seg', sel ? 'sel' : '', i === 0 ? 'first' : '', i === segs.length - 1 ? 'last' : '',
          i > 0 && i < segs.length - 1 ? 'movable' : ''].join(' ');
        return `<div class="${cls}" data-idx="${i}" style="left:${pct(s.start)}%;width:${pct(end - s.start)}%;background:${p.color}" title="${esc(this._name(climate))} · ${this._loc.time(s.start)} → ${this._loc.time(end)} · ${esc(p.name)}${esc(this._measuredText(climate, d, s.start, end))}">${this._segInner(s.start, end, s.preset)}</div>`;
      })
      .join('');
    const handles = segs
      .slice(1)
      .map((s, j) => `<div class="handle" data-idx="${j + 1}" style="left:${pct(s.start)}%"><span class="tip">${this._loc.time(s.start)}</span></div>`)
      .join('');
    const now = showNow ? `<div class="now" style="left:${pct(nowMin())}%"></div>` : '';
    const cs = this._clipSrc;
    const isSrc = cs && cs.climate === climate && cs.schedule === this._schedule && cs.day === d;
    const history = this._historyHtml(climate, d);
    const zoom = this._isZoomed(climate, d) ? ' zoom' : '';
    return `<div class="bar${isSrc ? ' clipsrc' : ''}${zoom}" data-climate="${esc(climate)}" data-day="${d}">${segHtml}${handles}${history}${this._overrideHtml(climate, d)}${now}</div>`;
  }

  // Override drawn over the schedule (only in the active schedule's tab)
  _overrideHtml(climate, day) {
    if (this._schedule !== this._activeSchedule()) return '';
    const d = this._overrides()[climate];
    const piece = this._overridePieces(climate).find((p) => p.day === day);
    if (!d || !piece) return '';
    const endHM = this._loc.time(minutesOf(parseDate(d.end)));
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
          ${multi ? `<div class="name" title="${esc(this._loc.t('open', { name: this._name(climate) }))}">${this._moreInfoLink(climate)}${this._nameSizer()}</div>` : ''}
          ${this._barHtml(climate, segs, d, showNow)}
          <button class="ibtn${open ? ' open' : ''}" data-act="menu" data-climate="${esc(climate)}" data-day="${d}" title="${esc(this._loc.t('copyPaste'))}">${ICON_MORE}</button>
        </div>`;
      })
      .join('');
    return `<div class="dgroup${d === todayIdx() ? ' today' : ''}">
      <div class="day" data-day="${d}">${this._loc.daysShort[d]}</div>
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
      ${this._historyOf(m.climate, m.day) ? `<div class="sep"></div>${item('zoom', esc(t(this._isZoomed(m.climate, m.day) ? 'showSmaller' : 'showLarger')), ICON_ZOOM)}` : ''}
      ${m.day === todayIdx() ? `<div class="sep"></div>${item('override-new', esc(t('newOverride')))}` : ''}
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
    const presets = this._presets()
      .map((l) => `<button data-act="preset" data-preset="${esc(l.id)}" class="${s.preset === l.id ? 'on' : ''}" style="background:${l.color}">${esc(l.name)}</button>`)
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
    const { climate, create } = this._overrideSel;
    const d = this._overrides()[climate];
    // Without an override: closed (it ended), unless opened to set one (today's row menu)
    if ((!d && !create) || !this._shown.includes(climate)) { this._overrideSel = null; return ''; }
    const t = this._loc.t;
    const attrs = (this._hass.states[climate] || {}).attributes || {};
    const value = overrideValueHtml(d, this._source(), climate, attrs, this._loc);
    const head = `<div class="ed-head">
        <strong>${this._moreInfoLink(climate)} · ${esc(t('temporarySetpoint'))}</strong>
        ${d ? `<span class="override-value">${esc(this._overrideLabel(d))}</span>` : ''}
        <button class="btn icon close" data-act="override-close" title="${esc(t('close'))}">✕</button>
      </div>
      ${value.presets}
      <div class="ed-head">${value.temperature}</div>`;
    if (!d) return `<div class="editor override-ed">${head}</div>`;
    const endsAt = parseDate(d.end);
    const today = new Date();
    const dayLabel = endsAt.toDateString() === today.toDateString() ? t('today')
      : this._loc.days[(endsAt.getDay() + 6) % 7].toLowerCase();
    const remaining = Math.max(0, Math.round((endsAt - today) / 60000));
    const addButton = (m, label) => `<button class="btn" data-act="override-add" data-min="${m}">${label}</button>`;
    const then = thenText(this._source(), climate, d, this._loc);
    return `<div class="editor override-ed">
      ${head}
      <div class="ed-head">
        <label>${esc(t('until'))} <input type="time" data-override-end step="${this._config.step * 60}" value="${hmOf(endsAt)}"></label>
        <span class="muted">${esc(dayLabel)} · ${esc(t('remaining', { duration: durationText(remaining, this._loc) }))}${then ? ` · ${esc(then)}` : ''}</span>
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

  // Places the popover under the selected slot / override / preset cell (or above it when there
  // is no room). Returns false if the layout is not ready yet.
  _placeEditor() {
    const root = this.shadowRoot;
    const ed = root.querySelector('.editor');
    // A temporary setpoint being set (no override yet): under "now" on the thermostat's row today
    const sel = this._overrideSel;
    const now = sel && sel.create && root.querySelector(`.bar[data-climate="${sel.climate}"][data-day="${todayIdx()}"] .now`);
    const seg = root.querySelector('.override.sel, .seg.sel, .cell.on') || now;
    if (!ed || !seg) return true;
    const card = root.querySelector('ha-card').getBoundingClientRect();
    // A slot is clipped to its row (the popover goes under the row); a cell to the table, which
    // may scroll sideways (the popover goes under the cell)
    const isCell = seg.classList.contains('cell');
    const bar = (isCell ? seg.closest('.table-wrap') : seg.parentElement).getBoundingClientRect();
    if (!card.width || !bar.width) return false;
    const sr = seg.getBoundingClientRect();
    const row = isCell ? sr : bar;
    const w = ed.offsetWidth;
    const h = ed.offsetHeight;
    const cx = (Math.max(sr.left, bar.left) + Math.min(sr.right, bar.right)) / 2 - card.left;
    const left = Math.max(8, Math.min(card.width - w - 8, cx - w / 2));
    let top = row.bottom - card.top + 9;
    let above = false;
    if (row.bottom + 9 + h > window.innerHeight && row.top - 9 - h > 0) {
      top = row.top - card.top - h - 9;
      above = true;
    }
    ed.style.left = `${left}px`;
    ed.style.top = `${top}px`;
    ed.style.setProperty('--caret', `${Math.max(14, Math.min(w - 14, cx - left))}px`);
    ed.classList.toggle('above', above);
    ed.classList.add('placed');
    return true;
  }

  // Redraws the card, keeping a schedule name being typed in a menu, and the caret of a rule's
  // template being typed (the card is redrawn every 30 s during an override, or when Home
  // Assistant sends new data)
  _render() {
    const input = this.shadowRoot.querySelector('.sched-menu input[data-sched-name]');
    const typing = input && { value: input.value, focused: this.shadowRoot.activeElement === input };
    const area = this.shadowRoot.activeElement;
    const rule = area && area.hasAttribute && area.hasAttribute('data-rule-template')
      && { idx: area.dataset.ruleTemplate, start: area.selectionStart, end: area.selectionEnd };
    const temperature = area && area.matches && area.matches(OVERRIDE_TEMPERATURE) ? area.value : null;
    this._draw();
    if (typing) this._restoreSchedName(typing.value, typing.focused);
    if (rule) this._restoreRuleCaret(rule);
    if (temperature !== null) restoreTyped(this.shadowRoot, `.override-ed ${OVERRIDE_TEMPERATURE}`, temperature);
    this._syncPreview();
  }

  // Focus and caret of a rule's template, again once ha-card (a Lit component, rendered
  // asynchronously) shows its content, as for the schedule names below
  _restoreRuleCaret({ idx, start, end }) {
    const focus = () => {
      const area = this.shadowRoot.querySelector(`textarea[data-rule-template="${idx}"]`);
      if (!area) return;
      area.focus();
      area.setSelectionRange(start, end);
    };
    focus();
    const card = this.shadowRoot.querySelector('ha-card');
    if (card && card.updateComplete instanceof Promise) {
      card.updateComplete.then(() => { if (card.isConnected) focus(); });
    }
  }

  // The name field of the schedule menus: its text, and the focus
  _restoreSchedName(value, focus) {
    const selector = '.sched-menu input[data-sched-name]';
    if (focus) return restoreTyped(this.shadowRoot, selector, value);
    const input = this.shadowRoot.querySelector(selector);
    if (input && value != null) input.value = value;
  }

  _draw() {
    if (!this._hass || !this._config) return;
    const tr = this._loc.t;
    if (!this._source().available || this._source().outdated) {
      const text = this._source().outdated ? tr('restartNeeded') : tr('integrationMissing');
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="missing">${esc(text)}</div></ha-card>`;
      return;
    }
    if (this._view === 'presets' && this._source().ready) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style>
        <ha-card>${this._viewsHtml()}${this._presetsViewHtml()}<div class="msg">${esc(this._msg)}</div></ha-card>`;
      this._schedulePlaceEditor();
      return;
    }
    if (this._view === 'rules' && this._source().ready) {
      const msg = this._msg || (this._rulesDraft ? tr('unsaved') : '');
      this.shadowRoot.innerHTML = `<style>${STYLE}</style>
        <ha-card>${this._viewsHtml()}${this._rulesViewHtml()}<div class="msg">${esc(msg)}</div></ha-card>`;
      return;
    }
    if (!this._source().ready) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="loading">…</div></ha-card>`;
      return;
    }
    const src = this._source();
    const schedules = this._schedules();
    const active = this._activeSchedule();
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
    const editable = src.editable;
    const tabs = schedules
      .map((m) => `<button class="tab${m === this._schedule ? ' on' : ''}" data-schedule="${esc(m)}">${m === active ? `<span class="dot" title="${esc(tr('activeSchedule'))}"></span>` : ''}${esc(this._scheduleName(m))}</button>${
        editable && m === this._schedule ? `<button class="tab-tool" data-act="schedule-menu" title="${esc(tr('scheduleMenu'))}">⋮</button>` : ''}`)
      .join('') + (editable ? `<button class="tab-tool" data-act="schedule-new" title="${esc(tr('newSchedule'))}">+</button>` : '');
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<span style="left:${(h / 24) * 100}%">${this._loc.tick(h)}</span>`).join('');
    // Days in the order of the user's first weekday (data stays Monday-based)
    const days = this._loc.dayOrder.map((d) => this._dayHtml(d, d === today && this._schedule === active)).join('');

    const focus = this._focusClimate();
    const st = this._hass.states[focus];
    // What each preset means for the focused thermostat (see _presetTemperature); presets are
    // set in the "Presets" view
    const legend = this._presets()
      .map((l) => {
        const target = this._targetOf(focus, l);
        const t = multi || !st ? null : this._presetTemperature(focus, target);
        const hint = !multi && 'preset' in target ? ` ${tr('presetHint')}` : '';
        return `<span><i style="background:${l.color}"></i>${esc(l.name)}${t != null ? ` ${this._loc.number(t)}°` : esc(hint)}</span>`;
      })
      .join('');
    const copyWeek = this._thermostats
      .map((t) => {
        const opts = schedules
          .filter((m) => !(t.entity === focus && m === this._schedule))
          .map((m) => `<option value="${esc(t.entity)}|${esc(m)}">${esc(this._name(t.entity))} · ${esc(this._scheduleName(m))}</option>`)
          .join('');
        return `<optgroup label="${esc(this._name(t.entity))}">${opts}</optgroup>`;
      })
      .join('');

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card class="${multi ? 'multi' : 'single'} h${Math.min(this._shown.length, 3)}">
        ${this._viewsHtml()}
        <div class="chips">
          ${chips}
          <span class="chip-sep"></span>
          <button class="chip tool${this._multiSel ? ' on' : ''}" data-act="multi-sel" title="${esc(tr('multipleTitle'))}">${esc(tr('multiple'))}</button>
          <button class="chip tool${allShown ? ' on' : ''}" data-act="show-all" title="${esc(tr('allTitle'))}">${esc(tr('all'))}</button>
          <button class="chip tool${this._history.shown ? ' on' : ''}${this._history.loading ? ' loading' : ''}" data-act="history" title="${esc(tr('historyTitle'))}">${esc(tr('history'))}</button>
        </div>
        <div class="tabs">${tabs}</div>
        ${this._schedMenuHtml()}
        ${this._scheduleBarHtml(active)}
        <div class="scale"><div></div>${multi ? `<div class="name">${this._nameSizer()}</div>` : ''}<div class="ticks">${ticks}</div><div></div></div>
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
    if (this._isPreview()) return; // trying it in a preview does not change the dashboards
    try { localStorage.setItem(LS_KEY, JSON.stringify(this._shown)); } catch (e) { /* ignore */ }
  }

  // ---------- events ----------

  _bindEvents() {
    const root = this.shadowRoot;

    // Readout of a day shown larger: under the mouse, or along a finger sliding on the bar
    root.addEventListener('pointerdown', (e) => {
      const bar = e.target.closest('.bar.zoom');
      if (bar && e.pointerType === 'touch' && !e.target.closest('.handle, .override-handle')) this._readTouch = true;
    }, true);
    root.addEventListener('pointermove', (e) => {
      const bar = e.target.closest('.bar.zoom');
      if (!bar || this._drag || this._overrideDrag) return;
      if (e.pointerType === 'touch' && !this._readTouch) return;
      this._showReadout(bar, e.clientX);
    }, true);
    const stopTouch = () => { this._readTouch = false; };
    root.addEventListener('pointerup', stopTouch, true);
    root.addEventListener('pointercancel', stopTouch, true);
    root.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch' && e.target.matches && e.target.matches('.bar.zoom')) this._hideReadout(e.target);
    }, true);

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
      // A whole slot (not the first nor the last of the day): by mouse any slot, by touch only
      // the selected one, so that a finger sliding over the week moves nothing
      const seg = e.target.closest('.bar > .seg');
      if (seg) {
        const bar = seg.parentElement;
        const climate = bar.dataset.climate;
        const day = Number(bar.dataset.day);
        const idx = Number(seg.dataset.idx);
        const segs = this._week(climate)[day];
        if (idx < 1 || idx >= segs.length - 1) return;
        const sel = this._sel;
        const selected = sel && sel.climate === climate && sel.day === day && sel.idx === idx;
        if (e.pointerType === 'touch' && !selected) return;
        e.preventDefault();
        seg.setPointerCapture(e.pointerId);
        this._drag = {
          move: true, climate, day, idx, bar, el: seg, x0: e.clientX, selected,
          start: segs[idx].start, length: segs[idx + 1].start - segs[idx].start, moved: false,
        };
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
      if (d.move) {
        // A few pixels are still a click (opens the popover)
        if (!d.moved && Math.abs(e.clientX - d.x0) < 5) return;
        if (!d.moved) {
          d.moved = true;
          d.bar.querySelectorAll(`.handle[data-idx="${d.idx}"], .handle[data-idx="${d.idx + 1}"]`)
            .forEach((el) => el.classList.add('drag'));
        }
        const min = segs[d.idx - 1].start + step;
        const max = (d.idx + 2 < segs.length ? segs[d.idx + 2].start : DAY_MIN) - step - d.length;
        const delta = this._snap(this._minuteAt(d.bar, e.clientX) - this._minuteAt(d.bar, d.x0));
        const m = Math.max(min, Math.min(max, d.start + delta));
        if (m !== segs[d.idx].start) {
          segs[d.idx].start = m;
          segs[d.idx + 1].start = m + d.length;
          this._layoutBar(d.bar, segs);
        }
        return;
      }
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
      if (d.move) {
        if (!d.moved) return;
        this._lastClick = null; // the click that follows is neither a selection nor half a double click
        this._slotMoved = Date.now();
        // A selected slot stays selected (by touch, it can slide again); otherwise no popover
        if (!d.selected) this._sel = null;
        this._commit(d.climate, d.day, d.selected ? this._week(d.climate)[d.day][d.idx].start : null);
        return;
      }
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
      // Schedule menu open: a click elsewhere only closes it
      if (this._schedEd && !e.target.closest('.sched-menu, [data-act="schedule-new"], [data-act="schedule-menu"]')) {
        this._schedEd = null;
        this._render();
        return;
      }
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
      // Preset cell popover open: a click outside the popover / cells closes it
      if (this._cell && !e.target.closest('.editor, [data-act="cell"]')) {
        this._cell = null;
        if (!e.target.closest('[data-act]')) { this._render(); return; }
      }
      // Popover open: a click outside the popover / slot closes it
      if ((this._sel || this._overrideSel) && !e.target.closest('.editor, .seg, .handle, .override')) {
        this._sel = null;
        this._overrideSel = null;
        if (!e.target.closest('[data-act], .tab, .chip')) { this._render(); return; }
      }
      const dayName = e.target.closest('.day[data-day]');
      if (dayName && this._shown.length === 1 && this._historyOf(this._shown[0], Number(dayName.dataset.day))) {
        this._toggleZoom(this._shown[0], Number(dayName.dataset.day));
        return;
      }
      const tab = e.target.closest('.tab');
      if (tab) {
        this._schedule = tab.dataset.schedule;
        this._schedEd = null;
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
      if (!seg || Date.now() - (this._slotMoved || 0) < 300) return;
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

    // Enter in a schedule's name field confirms (Create / Rename)
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.hasAttribute('data-sched-name')) return;
      const ok = root.querySelector('.sched-menu .btn.primary');
      if (ok) ok.click();
    });

    // Typing a temperature for a thermostat's preset means "use a temperature"
    root.addEventListener('input', (e) => {
      if (e.target.hasAttribute('data-rule-template')) {
        const before = !!this._rulesDraft;
        this._editRules((d) => { d.rules[Number(e.target.dataset.ruleTemplate)].template = e.target.value; });
        // Shows or hides Cancel, Save and "unsaved"; the text and the caret are kept
        if (before !== !!this._rulesDraft) this._render();
        this._syncPreview();
        return;
      }
      if (!e.target.hasAttribute('data-cell-temp')) return;
      const radio = root.querySelector('input[name="cell-kind"][value="temperature"]');
      if (radio) radio.checked = true;
    });

    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.hasAttribute('data-rule-schedule')) {
        this._editRules((d) => { d.rules[Number(el.dataset.ruleSchedule)].schedule = el.value || null; });
        this._render();
      } else if (el.hasAttribute('data-rules-default')) {
        this._editRules((d) => { d.def = el.value || null; });
        this._render();
      } else if (el.hasAttribute('data-cell-preset')) {
        // Picking one of the thermostat's presets means "use a thermostat preset"
        const radio = root.querySelector('input[name="cell-kind"][value="preset"]');
        if (radio) radio.checked = true;
      } else if (el.classList.contains('copyweek')) {
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
      } else if (el.hasAttribute('data-override-temperature') && el.value !== '' && this._overrideSel) {
        const c = this._overrideSel.climate;
        this._sendOverride(c, overrideWithTemperature(this._overrides()[c], this._source(), Number(el.value)));
      }
    });
  }

  // Shown when the viewed tab is not the active schedule: activate it from the card,
  // without a separate input_select card.
  _scheduleBarHtml(active) {
    if (!this._schedule || this._schedule === active) return '';
    const t = this._loc.t;
    const current = active ? t('activeScheduleBar', { schedule: esc(this._scheduleName(active)) }) : esc(t('noActiveSchedule'));
    return `<div class="schedule-bar">
      <span>${current}</span>
      <button class="btn small" data-act="activate-schedule">${esc(t('activate', { schedule: this._scheduleName(this._schedule) }))}</button>
    </div>`;
  }

  // Drop-down menus of the schedule tabs: "+" (new schedule: empty or a copy, then its name)
  // and "⋮" (the open schedule: rename, move, delete). Positioned under the clicked button.
  _schedMenuHtml() {
    const ed = this._schedEd;
    if (!ed) return '';
    const t = this._loc.t;
    const schedules = this._schedules();
    const item = (act, label, extra = '', disabled = false, cls = 'mi') =>
      `<button class="${cls}" data-act="${act}" ${extra} ${disabled ? 'disabled' : ''}><span>${label}</span></button>`;
    const err = this._schedErr ? `<div class="sched-err">${esc(this._schedErr)}</div>` : '';
    const cancel = `<button class="btn small" data-act="schedule-close">${esc(t('cancel'))}</button>`;
    const nameForm = (value, act, label) => `<div class="sched-form">
        <input data-sched-name value="${esc(value)}" placeholder="${esc(t('scheduleName'))}">
        ${err}
        <div class="sched-btns"><button class="btn small primary" data-act="${act}">${esc(label)}</button>${cancel}</div>
      </div>`;
    let body;
    if (ed.kind === 'new') {
      if (ed.step === 'name') {
        const from = ed.copy ? t('copyOfName', { name: this._scheduleName(ed.copy) }) : t('emptySchedule');
        body = `<div class="mh">${esc(t('newSchedule'))} · ${esc(from)}</div>${nameForm('', 'schedule-create', t('create'))}`;
      } else {
        body = `<div class="mh">${esc(t('newSchedule'))}</div>
          ${item('schedule-pick', esc(t('emptySchedule')), 'data-copy=""')}
          <div class="sep"></div>
          ${schedules.map((m) => item('schedule-pick', esc(t('copyOfName', { name: this._scheduleName(m) })), `data-copy="${esc(m)}"`)).join('')}`;
      }
    } else {
      const id = ed.id;
      const name = this._scheduleName(id);
      if (ed.step === 'rename') {
        // The id does not change: automations use it
        body = `<div class="mh">${esc(t('scheduleId', { id }))}</div>${nameForm(name, 'schedule-rename', t('rename'))}`;
      } else if (ed.step === 'delete') {
        body = `<div class="sched-form">${esc(t('confirmDelete', { name }))}
          <div class="sched-btns"><button class="btn small danger" data-act="schedule-delete-confirm">${esc(t('deleteSchedule'))}</button>${cancel}</div></div>`;
      } else {
        const i = schedules.indexOf(id);
        const src = this._source();
        const inRules = src.rules().some((r) => r.schedule === id) || src.defaultSchedule() === id;
        const reason = id === this._activeSchedule() ? t('cannotDeleteActive') : schedules.length < 2 ? t('cannotDeleteLast')
          : inRules ? t('cannotDeleteInRules') : '';
        body = `${item('schedule-rename-open', esc(t('renameMenu')))}
          ${item('schedule-move', esc(t('moveLeft')), 'data-dir="-1"', i <= 0)}
          ${item('schedule-move', esc(t('moveRight')), 'data-dir="1"', i >= schedules.length - 1)}
          <div class="sep"></div>
          ${item('schedule-delete', `${esc(t('deleteMenu'))}${reason ? `<small>${esc(reason)}</small>` : ''}`, '', !!reason, 'mi danger')}`;
      }
    }
    return `<div class="menu sched-menu" style="top:${ed.top || 0}px;left:${ed.left || 0}px">${body}</div>`;
  }

  // Schedule actions (admins): unsaved edits of the weeks are saved first
  async _scheduleAction(act, ds, el) {
    const t = this._loc.t;
    const ed = this._schedEd;
    this._schedErr = '';
    if (act === 'schedule-new' || act === 'schedule-menu') {
      const kind = act === 'schedule-new' ? 'new' : 'menu';
      if (ed && ed.kind === kind) { this._schedEd = null; return this._render(); }
      // Under the button, inside the card
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const b = el ? el.getBoundingClientRect() : { bottom: 0, left: 0 };
      const left = Math.max(8, Math.min(b.left - card.left, card.width - 280));
      this._schedEd = { kind, id: this._schedule, step: kind === 'new' ? 'pick' : 'list', top: b.bottom - card.top + 4, left };
      return this._render();
    }
    if (act === 'schedule-close' || !ed) { this._schedEd = null; return this._render(); }
    if (act === 'schedule-pick') { ed.copy = ds.copy || null; ed.step = 'name'; return this._renderSchedMenu(); }
    if (act === 'schedule-rename-open') { ed.step = 'rename'; return this._renderSchedMenu(); }
    if (act === 'schedule-delete') { ed.step = 'delete'; return this._render(); }
    const keep = this._schedules().map((id) => ({ id }));
    const nameInput = this.shadowRoot.querySelector('input[data-sched-name]');
    const checkName = (except) => {
      const name = nameInput ? nameInput.value.trim() : '';
      const taken = this._schedules().some((m) => m !== except && this._scheduleName(m).trim().toLowerCase() === name.toLowerCase());
      this._schedErr = !name ? t('nameRequired') : taken ? t('nameTaken') : '';
      if (this._schedErr) this._renderSchedMenu(name);
      return this._schedErr ? null : name;
    };
    let list;
    let created = false;
    if (act === 'schedule-create') {
      const name = checkName(null);
      if (!name) return;
      list = [...keep, ed.copy ? { name, copy_of: ed.copy } : { name }];
      created = true;
    } else if (act === 'schedule-rename') {
      const name = checkName(ed.id);
      if (!name) return;
      list = keep.map((m) => (m.id === ed.id ? { id: m.id, name } : m));
    } else if (act === 'schedule-move') {
      const i = keep.findIndex((m) => m.id === ed.id);
      const j = i + Number(ds.dir);
      if (i < 0 || j < 0 || j >= keep.length) return;
      [keep[i], keep[j]] = [keep[j], keep[i]];
      list = keep;
    } else if (act === 'schedule-delete-confirm') {
      list = keep.filter((m) => m.id !== ed.id);
    } else return;
    this._schedEd = null;
    if (this._dirty && !(await this._save())) return;
    try {
      const result = await this._source().setSchedules(list, this._revision);
      if (result && result.revision != null) this._revision = result.revision;
      if (created && result && result.schedules) this._wantSchedule = result.schedules[result.schedules.length - 1].id;
    } catch (e) {
      this._msg = e && e.code === 'stale' ? t('stale') : t('error', { message: e.message || e.code || e });
    }
    this._render();
  }

  // Redraws with the schedule menu's name field focused (keeping what was typed)
  _renderSchedMenu(typed) {
    this._draw();
    this._restoreSchedName(typed, true);
  }

  async _activateSchedule(schedule) {
    try {
      await this._source().activateSchedule(schedule);
      this._msg = this._loc.t('scheduleActivated', { schedule: this._scheduleName(schedule) });
    } catch (e) {
      this._msg = this._loc.t('error', { message: e.message || e.code || e });
    }
    this._render();
  }

  // Temperature a preset gives a thermostat: its own for a temperature; for a preset, the one
  // Versatile Thermostat shows (comfort_temp… attributes: a deliberate extra for VTherm users),
  // otherwise the one last seen while that preset was active (learned by the integration)
  _presetTemperature(climate, target) {
    if ('temperature' in target) return target.temperature;
    const st = this._hass.states[climate];
    // VTherm 10+: preset_temperatures: {comfort_temp: …}; older versions: comfort_temp attributes
    const attrs = (st && st.attributes) || {};
    const key = `${target.preset}_temp`;
    const vtherm = attrs.preset_temperatures && typeof attrs.preset_temperatures === 'object'
      ? attrs.preset_temperatures[key] : attrs[key];
    if (typeof vtherm === 'number') return vtherm;
    const learned = this._source().learned(climate, target.preset);
    return typeof learned === 'number' ? learned : null;
  }

  // What a preset means for a thermostat: its mapping (as computed by the integration), else
  // the default for a thermostat the integration does not know yet
  _targetOf(climate, preset) {
    const src = this._source();
    const known = src.targets(climate)[preset.id];
    if (known) return known;
    const st = this._hass.states[climate];
    const own = (st && st.attributes.preset_modes) || []; // the thermostat's own presets
    if (src.usePresets() && own.includes(preset.id)) return { preset: preset.id };
    return { temperature: preset.temperature ?? 19 };
  }

  // "Schedule | Presets | Rules" switch
  _viewsHtml() {
    const t = this._loc.t;
    const view = ['presets', 'rules'].includes(this._view) ? this._view : 'schedule';
    const button = (v, label) => `<button class="view${view === v ? ' on' : ''}" data-act="view" data-view="${v}">${esc(t(label))}</button>`;
    return `<div class="views">${button('schedule', 'viewSchedule')}${button('presets', 'viewPresets')}${button('rules', 'viewRules')}</div>`;
  }

  // Activation rules being edited ({ rules, def }), or the integration's when nothing is edited
  _rulesShown() {
    const src = this._source();
    return this._rulesDraft || { rules: src.rules().map((r) => ({ ...r })), def: src.defaultSchedule() };
  }

  // The "Rules" view: one row per rule (template, the schedule it activates or "given by the
  // template", what it gives now), then the schedule when no rule applies. Rules shown are tried
  // by the integration as they are typed (_syncPreview); otherwise its results for the saved ones.
  _rulesViewHtml() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const { rules, def } = this._rulesShown();
    const saved = src.rules();
    const results = src.ruleResults();
    const schedules = this._schedules();
    const options = (selected) => schedules
      .map((id) => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(this._scheduleName(id))}</option>`).join('');
    const ro = editable ? '' : ' disabled';
    const live = this._preview && this._preview.data;
    // What a rule gives now: tried while typed, or the integration's result for the same saved rule
    const stateOf = (rule, i) => {
      const tried = live && this._preview.rules[i];
      if (tried && tried.template === rule.template && tried.schedule === (rule.schedule || null)) {
        return { result: live.results[i], text: live.texts[i], error: live.errors[i], live: true };
      }
      const s = saved[i];
      const same = s && s.template === rule.template.trim() && (s.schedule || null) === (rule.schedule || null);
      return same ? { result: results[i] } : null;
    };
    const rows = rules.map((rule, i) => {
      const st = rule.template.trim() ? stateOf(rule, i) : null;
      let cls = 'unsaved';
      let label = t('ruleUnsaved');
      if (st && st.result == null) [cls, label] = ['error', t('ruleError')];
      else if (st && !rule.schedule) [cls, label] = st.result ? ['true', `→ ${this._scheduleName(st.result)}`] : ['false', t('ruleNoSchedule')];
      else if (st) [cls, label] = st.result ? ['true', t('ruleTrue')] : ['false', t('ruleFalse')];
      let detail = '';
      if (st && st.live && st.error) detail = st.error;
      else if (st && st.live && st.text != null) {
        detail = t('ruleText', { text: st.text });
        const boolean = BOOLEAN_WORDS.includes(st.text.trim().toLowerCase());
        if (rule.schedule && !boolean) detail += ` · ${t('ruleNotBoolean')}`;
        if (!rule.schedule && !st.result) detail += ` · ${t(boolean ? 'ruleChooseSchedule' : 'ruleNamesNone')}`;
      }
      const tools = editable ? `<span class="rule-tools">
          <button class="btn icon" data-act="rule-up" data-idx="${i}" title="${esc(t('ruleUp'))}"${i ? '' : ' disabled'}>↑</button>
          <button class="btn icon" data-act="rule-down" data-idx="${i}" title="${esc(t('ruleDown'))}"${i < rules.length - 1 ? '' : ' disabled'}>↓</button>
          <button class="btn icon" data-act="rule-delete" data-idx="${i}" title="${esc(t('delete'))}">✕</button></span>` : '';
      return `<div class="rule">
        <div class="rule-head"><span class="rule-num">${i + 1}</span><span class="rule-state ${cls}">${esc(label)}</span>${tools}</div>
        <textarea data-rule-template="${i}" rows="2" spellcheck="false" placeholder="{{ is_state('sensor.edf_tempo_color', 'red') }}"${editable ? '' : ' readonly'}>${esc(rule.template)}</textarea>
        ${detail ? `<div class="rule-result${st.error ? ' error' : ''}">${esc(detail)}</div>` : ''}
        <label class="rule-then">${esc(t('ruleActivates'))} <select data-rule-schedule="${i}"${ro}>
          <option value=""${rule.schedule ? '' : ' selected'}>${esc(t('ruleTemplateGives'))}</option>${options(rule.schedule)}</select></label>
      </div>`;
    }).join('');
    // What the integration's rules give now, and a schedule chosen by hand meanwhile
    let outcome = '';
    if (saved.length) {
      const first = saved.findIndex((_, i) => results[i]);
      const given = first >= 0 ? saved[first].schedule || results[first] : src.defaultSchedule();
      const active = this._activeSchedule();
      outcome = !given ? t('rulesNoOutcome') : t('rulesOutcome', { schedule: this._scheduleName(given) });
      if (given && active && given !== active) outcome += ` ${t('rulesByHand', { schedule: this._scheduleName(active) })}`;
    }
    const actions = editable ? `<div class="ed-actions start">
        <button class="btn" data-act="rule-add">${esc(t('ruleAdd'))}</button>
        ${this._rulesDraft ? `<button class="btn" data-act="rules-cancel">${esc(t('cancel'))}</button>` : ''}
        <button class="btn primary" data-act="rules-save"${this._rulesDraft ? '' : ' disabled'}>${esc(t('save'))}</button></div>` : '';
    return `<div class="rules-view">
      <div class="muted">${esc(t('rulesIntro'))} <a class="rules-try" href="/developer-tools/template" target="_top">${esc(t('rulesTry'))}</a></div>
      ${rules.length ? rows : `<div class="rules-empty muted">${esc(t('rulesEmpty'))}</div>`}
      ${rules.length ? `<label class="rule-then rules-default">${esc(t('rulesOtherwise'))} <select data-rules-default${ro}>
        <option value=""${def ? '' : ' selected'}>${esc(t('rulesKeep'))}</option>${options(def)}</select></label>` : ''}
      ${outcome ? `<div class="rules-outcome">${esc(outcome)}</div>` : ''}
      ${actions}
    </div>`;
  }

  // The rules shown are tried by the integration (chauffage/rules/preview, admins only: a template
  // can read any entity), again whenever their entities change; a new try once they are edited
  // (after a short pause in the typing), none outside the "Rules" view
  _syncPreview() {
    if (!this._hass) return;
    const src = this._source();
    const rules = this._view === 'rules' && src.ready && src.editable && this._hass.connection
      ? this._rulesShown().rules.map(plainRule) : [];
    const key = JSON.stringify(rules);
    if (key === this._previewKey) return;
    this._previewKey = key;
    clearTimeout(this._previewTimer);
    this._closePreview();
    if (!rules.length) return;
    this._previewTimer = setTimeout(() => {
      const sub = { rules, data: null };
      this._previewSub = sub;
      sub.unsub = this._hass.connection.subscribeMessage((data) => {
        if (this._previewSub !== sub) return;
        sub.data = data;
        this._preview = sub; // kept while the next try starts: rules unchanged still show it
        this._render();
      }, { type: 'chauffage/rules/preview', rules });
      sub.unsub.catch(() => {});
    }, this._previewDelay);
  }

  _closePreview() {
    if (!this._previewSub) return;
    this._previewSub.unsub.then((unsub) => unsub()).catch(() => {});
    this._previewSub = null;
  }

  // Edits the draft of the rules (created from the integration's on the first change; dropped
  // when the edits are undone, so that nothing is left to save)
  _editRules(change) {
    const draft = this._rulesShown();
    change(draft);
    const src = this._source();
    const state = (rules, def) => JSON.stringify([rules.map(plainRule), def || null]);
    this._rulesDraft = state(draft.rules, draft.def) !== state(src.rules(), src.defaultSchedule()) ? draft : null;
    this._msg = '';
  }

  async _rulesAction(act, ds) {
    const i = Number(ds.idx);
    if (act === 'rule-add') {
      this._editRules((d) => d.rules.push({ template: '', schedule: this._schedules()[0] }));
    } else if (act === 'rule-up' || act === 'rule-down') {
      const j = act === 'rule-up' ? i - 1 : i + 1;
      this._editRules((d) => { [d.rules[i], d.rules[j]] = [d.rules[j], d.rules[i]]; });
    } else if (act === 'rule-delete') {
      this._editRules((d) => d.rules.splice(i, 1));
    } else if (act === 'rules-cancel') {
      this._rulesDraft = null;
      this._msg = '';
    } else if (act === 'rules-save') {
      const { rules, def } = this._rulesShown();
      try {
        await this._source().setRules(
          rules.filter((r) => r.template.trim()).map((r) => plainRule({ ...r, template: r.template.trim() })), def || null);
        this._rulesDraft = null;
        this._msg = this._loc.t('saved');
      } catch (err) {
        this._msg = this._loc.t('error', { message: err.message || err.code || err });
      }
    }
    return this._render();
  }

  // Table: one column per preset (header: the preset, then its default temperature), one row per
  // thermostat; each cell says what that thermostat does with that preset
  _presetsViewHtml() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const presets = this._presets();
    const sel = this._cell;
    const isSel = (kind, preset, climate) => sel && sel.kind === kind && sel.preset === preset && (sel.climate || null) === (climate || null);
    const cell = (kind, preset, climate, inner, cls) => {
      const on = isSel(kind, preset, climate) ? ' on' : '';
      const attrs = `data-act="cell" data-kind="${kind}" data-preset="${esc(preset || '')}"${climate ? ` data-climate="${esc(climate)}"` : ''}`;
      return editable ? `<button class="cell ${cls}${on}" ${attrs}>${inner}</button>` : `<span class="cell ${cls}">${inner}</span>`;
    };
    const head = presets.map((l) => `<th>${cell('preset', l.id, null, `<i style="background:${l.color}"></i>${esc(l.name)}`, 'head')}</th>`).join('')
      + (editable ? `<th>${cell('new', '', null, '+', 'add')}</th>` : '');
    const defaults = presets.map((l) => `<td>${cell('default', l.id, null, `${this._loc.number(l.temperature ?? 19)}°`, 'default')}</td>`).join('');
    const rows = this._thermostats.map(({ entity }) => {
      const explicit = src.mapping(entity);
      const cells = presets.map((l) => {
        const target = this._targetOf(entity, l);
        const temp = this._presetTemperature(entity, target);
        const value = temp != null ? `${this._loc.number(temp)}°` : '';
        let inner;
        let cls;
        if ('preset' in target) {
          const other = target.preset !== l.id ? `${esc(this._loc.preset(target.preset))} ` : '';
          inner = `⟲ ${other}${value || esc(t('presetHint'))}`;
          cls = 'preset';
        } else {
          inner = value;
          cls = 'default';
        }
        if (l.id in explicit) { inner += ' ●'; cls = `${cls} custom`; }
        return `<td>${cell('thermostat', l.id, entity, inner, cls)}</td>`;
      }).join('');
      return `<tr><th class="name">${esc(this._name(entity))}</th>${cells}${editable ? '<td></td>' : ''}</tr>`;
    }).join('');
    return `<div class="presets-view">
      <div class="table-wrap"><table class="pv-table">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody><tr class="defaults"><th>${esc(t('presetDefaults'))}</th>${defaults}${editable ? '<td></td>' : ''}</tr>${rows}</tbody>
      </table></div>
      <div class="pv-key">⟲ ${esc(t('keyPreset'))} · ● ${esc(t('keyCustom'))} · <span class="default">${esc(t('keyDefault'))}</span></div>
      ${this._cellPanelHtml()}
    </div>`;
  }

  // Popover editing the selected cell
  _cellPanelHtml() {
    const sel = this._cell;
    if (!sel) return '';
    const t = this._loc.t;
    const src = this._source();
    const presets = this._presets();
    const preset = presets.find((l) => l.id === sel.preset) || { id: '', name: '', color: '#9e9e9e', temperature: 19 };
    const tempInput = (value) => `<div class="pv-temp">
        <button class="btn icon" data-act="cell-step" data-delta="-0.5">−</button>
        <input type="number" data-cell-temp step="0.5" min="5" max="30" value="${value}"> °C
        <button class="btn icon" data-act="cell-step" data-delta="0.5">+</button></div>`;
    let title;
    let body;
    if (sel.kind === 'thermostat') {
      title = t('presetFor', { preset: preset.name, name: this._name(sel.climate) });
      const explicit = src.mapping(sel.climate)[preset.id];
      const st = this._hass.states[sel.climate];
      // The thermostat's presets, the one named like this preset (what "automatic" uses) first
      const own = ((st && st.attributes.preset_modes) || []).map(String)
        .filter((p) => !['', 'none', 'manual', 'manuel'].includes(p.toLowerCase()))
        .sort((a, b) => (b === preset.id) - (a === preset.id));
      // What "automatic" gives: the thermostat's own preset of the same name, then it is the first
      // choice of the thermostat's presets (not the same as picking that preset: automatic follows
      // the "use the thermostats' presets" option and the presets the thermostat has); otherwise
      // the preset's default temperature, a choice of its own
      const autoPreset = src.usePresets() && own.includes(preset.id);
      const choice = !explicit ? (autoPreset ? 'preset' : 'auto') : 'preset' in explicit ? 'preset' : 'temperature';
      const current = this._targetOf(sel.climate, preset);
      const temp = explicit && 'temperature' in explicit ? explicit.temperature : this._presetTemperature(sel.climate, current) ?? preset.temperature ?? 19;
      // One line per choice: its radio, its label, its field (the field of a choice not picked is
      // dimmed; using it picks the choice)
      const choiceRow = (value, label, field = '') => `<label class="pv-choice">
          <input type="radio" name="cell-kind" value="${value}" ${choice === value ? 'checked' : ''}>
          <span>${esc(label)}</span><span class="pv-field">${field}</span></label>`;
      const picked = explicit && 'preset' in explicit ? explicit.preset : autoPreset ? '' : preset.id;
      const option = (value, label) => `<option value="${esc(value)}" ${picked === value ? 'selected' : ''}>${esc(label)}</option>`;
      const options = (autoPreset ? option('', t('presetAutoShort', { value: this._loc.preset(preset.id) })) : '')
        + own.map((p) => option(p, this._loc.preset(p))).join('');
      body = `<div class="pv-choices">${
        (autoPreset ? '' : choiceRow('auto', t('presetAuto', { value: `${this._loc.number(preset.temperature ?? 19)} °C` })))
        + (own.length ? choiceRow('preset', t('ownPreset'), `<select data-cell-preset>${options}</select>`) : '')
        + choiceRow('temperature', t('presetTemperature'), tempInput(temp))}</div>`;
    } else if (sel.kind === 'default') {
      title = t('defaultFor', { preset: preset.name });
      body = `<div class="pv-fields"><span>${esc(t('presetTemperature'))}</span>${tempInput(preset.temperature ?? 19)}</div>
        <div class="muted">${esc(t('defaultHelp'))}</div>`;
    } else {
      const isNew = sel.kind === 'new';
      title = isNew ? t('newPreset') : preset.name;
      const used = !isNew && src.usedPresets().includes(preset.id);
      const others = presets.filter((l) => l.id !== preset.id);
      body = `<div class="pv-fields">
          <span>${esc(t('presetName'))}</span>
          <span class="pv-name"><input type="color" data-cell-color value="${esc(isNew ? '#9e9e9e' : preset.color)}" title="${esc(t('presetColor'))}">
            <input type="text" data-cell-name value="${esc(isNew ? '' : preset.name)}" placeholder="${esc(t('presetName'))}"></span>
          ${isNew ? `<span>${esc(t('presetTemperature'))}</span>${tempInput(19)}` : ''}
        </div>`
        + (!isNew && presets.length > 1 ? `<div class="pv-delete">
          <label class="pv-check"><input type="checkbox" data-cell-delete> ${esc(t('deletePreset'))}</label>
          ${used ? `<label class="pv-replace">${esc(t('replaceWith'))} <select data-cell-replacement>${others.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label>` : ''}
        </div>` : '');
    }
    const dot = sel.kind === 'new' ? '' : `<i class="pv-dot" style="background:${preset.color}"></i>`;
    // Popover, placed under the cell by _placeEditor() after rendering
    return `<div class="editor cell-ed" data-panel="cell">
      <div class="ed-head"><strong>${dot}${esc(title)}</strong>
        <button class="btn icon close" data-act="cell-close" title="${esc(t('close'))}">✕</button></div>
      ${body}
      <div class="ed-actions pv-foot"><button class="btn primary" data-act="cell-apply">${esc(t('apply'))}</button></div>
    </div>`;
  }

  async _cellAction(act, ds) {
    const root = this.shadowRoot;
    if (act === 'cell') {
      const same = this._cell && this._cell.kind === ds.kind && this._cell.preset === ds.preset && (this._cell.climate || '') === (ds.climate || '');
      this._cell = same ? null : { kind: ds.kind, preset: ds.preset, climate: ds.climate };
      return this._render();
    }
    const sel = this._cell;
    if (act === 'cell-close' || !sel) { this._cell = null; return this._render(); }
    const input = root.querySelector('[data-cell-temp]');
    if (act === 'cell-step') {
      input.value = String(Math.round((Number(input.value) + Number(ds.delta)) * 10) / 10);
      const radio = root.querySelector('input[name="cell-kind"][value="temperature"]');
      if (radio) radio.checked = true;
      return undefined;
    }
    const src = this._source();
    const presets = presetsOf(src, this._loc).map((l) => ({ id: l.id, name: l.name, color: l.color, temperature: l.temperature ?? 19 }));
    const value = (sel2) => { const el = root.querySelector(sel2); return el ? el.value : ''; };
    try {
      if (sel.kind === 'thermostat') {
        const mapping = { ...src.mapping(sel.climate) };
        const kind = (root.querySelector('input[name="cell-kind"]:checked') || {}).value || 'auto';
        const picked = value('[data-cell-preset]');
        if (kind === 'auto' || (kind === 'preset' && !picked)) delete mapping[sel.preset];
        else if (kind === 'preset') mapping[sel.preset] = { preset: picked };
        else mapping[sel.preset] = { temperature: Number(input.value) };
        await src.setMapping(sel.climate, mapping);
      } else if (sel.kind === 'default') {
        await src.setPresets(presets.map((l) => (l.id === sel.preset ? { ...l, temperature: Number(input.value) } : l)), {});
      } else if (sel.kind === 'new') {
        await src.setPresets([...presets, { name: value('[data-cell-name]').trim(), color: value('[data-cell-color]'), temperature: Number(input.value) }], {});
      } else if (root.querySelector('[data-cell-delete]') && root.querySelector('[data-cell-delete]').checked) {
        const replacement = value('[data-cell-replacement]');
        await src.setPresets(presets.filter((l) => l.id !== sel.preset), replacement ? { [sel.preset]: replacement } : {});
      } else {
        await src.setPresets(presets.map((l) => (l.id === sel.preset
          ? { ...l, name: value('[data-cell-name]').trim(), color: value('[data-cell-color]') } : l)), {});
      }
      this._cell = null;
      this._msg = this._loc.t('saved');
    } catch (err) {
      this._msg = this._loc.t('error', { message: err.message || err.code || err });
    }
    return this._render();
  }

  // Opens HA's standard more-info dialog (same mechanism as the built-in tiles)
  _openMoreInfo(entityId) {
    this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId } }));
  }

  _moreInfoLink(climate) {
    return `<span class="mi-link" data-more-info="${esc(climate)}" title="${esc(this._loc.t('openThermostat'))}">${esc(this._name(climate))}</span>`;
  }

  // The names shown, invisible, in every cell of the names column: each row sizes the column on
  // the longest one, so that all rows (separate grids) have the same column
  _nameSizer() {
    return `<span class="sizer" aria-hidden="true">${this._shown.map((c) => `<span>${esc(this._name(c))}</span>`).join('')}</span>`;
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
    segs.splice(idx + 1, 0, { start: m, preset: otherPreset(this._presets(), s.preset) });
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
    const [climate, schedule] = value.split('|');
    const source = this._focusClimate();
    const week = clone(this._week(source));
    if (!this._data[climate]) this._data[climate] = {};
    this._data[climate][schedule] = week;
    this._dirty = true;
    this._msg = this._loc.t('weekCopiedTo', { source: this._name(source), target: this._name(climate), schedule: this._scheduleName(schedule) });
    this._render();
  }

  _copyToClipboard(climate, day) {
    const segs = clone(this._week(climate)[day]);
    const label = `${this._name(climate)} · ${this._loc.days[day]} (${this._scheduleName(this._schedule)})`;
    this._clip = { segs, label };
    this._clipSrc = { climate, schedule: this._schedule, day };
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
    if (act.startsWith('schedule-')) return this._scheduleAction(act, ds, el);
    if (act.startsWith('fill-')) return this._copyDay(ds.climate, Number(ds.day), act.slice(5));
    if (act === 'override-new') { // today's row menu: set a temporary setpoint
      this._sel = null;
      this._overrideSel = { climate: ds.climate, create: true };
      return this._render();
    }
    if (act.startsWith('override-')) {
      const c = this._overrideSel && this._overrideSel.climate;
      const d = c && this._overrides()[c];
      if (act === 'override-preset' && c) {
        const changed = overrideWithPreset(d, this._source(), c, ds.preset);
        return changed && this._sendOverride(c, changed);
      }
      if (act === 'override-close' || !d) { this._overrideSel = null; return this._render(); }
      if (act === 'override-del') return this._sendOverride(c, null);
      if (act === 'override-add') return this._setOverrideEnd(c, new Date(parseDate(d.end).getTime() + Number(ds.min) * 60000));
    }
    if (act === 'view') {
      this._view = ds.view;
      this._cell = null;
      this._msg = '';
      return this._render();
    }
    if (act === 'cell' || act.startsWith('cell-')) return this._cellAction(act, ds);
    if (act.startsWith('rule-') || act.startsWith('rules-')) return this._rulesAction(act, ds);
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
    if (act === 'activate-schedule') return this._activateSchedule(this._schedule);
    if (act === 'multi-sel') {
      this._multiSel = !this._multiSel;
      return this._render();
    }
    if (act === 'history') return this._toggleHistory();
    if (act === 'zoom') return this._toggleZoom(ds.climate, Number(ds.day));
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
      segs.splice(idx + 1, 0, { start: m1, preset: otherPreset(this._presets(), s.preset) }, { start: m2, preset: s.preset });
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
  .tab-tool { flex:0 0 auto; border:0; background:transparent; padding:7px 9px; border-radius:8px; cursor:pointer;
    color:var(--secondary-text-color); font-weight:600; }
  .tab-tool:hover { background:var(--card-background-color); }
  .sched-menu { min-width:200px; max-width:260px; }
  .sched-menu .mi small { display:block; font-size:.85em; color:var(--secondary-text-color); }
  .sched-menu .mi.danger:not(:disabled) { color:var(--error-color,#db4437); }
  .sched-menu .mi:disabled { opacity:1; color:var(--secondary-text-color); }
  .sched-form { display:flex; flex-direction:column; gap:8px; padding:4px 14px 8px; font-size:.92em; }
  .sched-form input { padding:6px 8px; border-radius:6px; border:1px solid var(--divider-color);
    background:var(--card-background-color); }
  .sched-btns { display:flex; gap:6px; justify-content:flex-end; }
  .sched-err { color:var(--error-color,#db4437); font-size:.9em; }
  .schedule-bar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px 12px;
    margin:-4px 0 10px; padding:6px 10px; border-radius:8px; font-size:.88em;
    background:var(--secondary-background-color); color:var(--secondary-text-color); }
  .schedule-bar strong { color:var(--primary-text-color); }
  .btn.small { padding:4px 10px; font-size:.95em; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px;
    background:var(--success-color,#43a047); vertical-align:middle; }

  /* Grid: day | (name) | bar | tools */
  .scale { display:grid; grid-template-columns:36px 1fr 28px; gap:8px; align-items:center; }
  .multi .scale { grid-template-columns:36px fit-content(100px) 1fr 28px; }
  .dgroup { display:grid; grid-template-columns:36px 1fr; gap:8px; align-items:center; margin:7px 0; }
  .multi .dgroup { padding-top:7px; border-top:1px solid var(--divider-color); }
  /* Today stands out among the days and thermostats: its whole row is tinted, with a border on
     each side, thicker on the left. Wider than the row (negative margin, padding minus the
     border) so that its content stays aligned with the other days */
  .dgroup.today { margin-left:-8px; margin-right:-8px; padding:5px 7px 5px 4px; border-radius:6px;
    border:1px solid var(--primary-color); border-left-width:4px; border-top-width:0; border-bottom-width:0;
    background:rgba(3,169,244,.12); background:color-mix(in srgb, var(--primary-color) 12%, transparent); }
  .multi .dgroup.today { padding-top:7px; padding-bottom:7px; }
  .multi .dgroup.today + .dgroup { border-top-color:transparent; }
  .subs { display:flex; flex-direction:column; gap:5px; }
  .sub { display:grid; grid-template-columns:1fr 28px; gap:8px; align-items:center; }
  .multi .sub { grid-template-columns:fit-content(100px) 1fr 28px; }
  .name { font-size:.78em; color:var(--secondary-text-color); overflow:hidden; white-space:nowrap; text-align:right; }
  .name .mi-link { display:block; overflow:hidden; text-overflow:ellipsis; }
  .sizer, .sizer span { display:block; height:0; visibility:hidden; }
  .mi-link { cursor:pointer; }
  .mi-link:hover { color:var(--primary-color); text-decoration:underline; }
  .chip-open { display:inline-flex; vertical-align:-2px; margin-left:4px; padding:1px; border-radius:4px; opacity:.6; cursor:pointer; }
  .chip-open:hover { opacity:1; background:rgba(127,127,127,.25); }
  .chip-open svg { width:13px; height:13px; fill:currentColor; }

  .ticks { position:relative; height:16px; font-size:11px; color:var(--secondary-text-color); }
  .ticks span { position:absolute; transform:translateX(-50%); }
  .ticks span:first-child { transform:none; }
  .ticks span:last-child { transform:translateX(-100%); }
  .day { font-size:.9em; color:var(--secondary-text-color); text-align:right; }
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
  .seg.movable { cursor:grab; }
  .seg.movable:active { cursor:grabbing; }
  .seg.movable.sel { touch-action:pan-y; } /* by touch, the selected slot slides sideways */
  .handle { position:absolute; top:-3px; bottom:-3px; width:18px; margin-left:-9px; z-index:2;
    cursor:ew-resize; touch-action:none; }
  .handle::after { content:''; position:absolute; left:7px; top:3px; bottom:3px; width:4px; border-radius:2px;
    background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.4); }
  .tip { display:none; position:absolute; bottom:100%; left:50%; transform:translate(-50%,-2px); z-index:4;
    padding:2px 6px; border-radius:4px; font-size:11px; white-space:nowrap;
    background:var(--primary-text-color); color:var(--card-background-color); }
  .handle:hover .tip, .handle.drag .tip { display:block; }
  .chip.tool.loading { animation:chauffage-pulse 1s ease-in-out infinite; }
  @keyframes chauffage-pulse { 50% { opacity:.4; } }
  /* Measured temperature (white) and setpoint applied (yellow, with a shadow, over it and the
     handles) of the last 7 days */
  .history { position:absolute; left:0; top:0; width:100%; height:100%; z-index:2; pointer-events:none; overflow:hidden; }
  .history path { fill:none; vector-effect:non-scaling-stroke; }
  .history .measured { stroke:#fff; stroke-width:1.5; stroke-linejoin:round; stroke-linecap:round; shape-rendering:geometricPrecision; }
  .history.setpoint { filter:drop-shadow(0 1px 1px rgba(0,0,0,.7)); }
  /* A day shown larger: its scale in degrees, the readout under the mouse or the finger (the bar
     slides with the finger instead of scrolling the page sideways) */
  ha-card .bar.zoom { height:180px; touch-action:pan-y; }
  .bar.zoom .seg { justify-content:flex-start; align-items:flex-start; padding-top:4px; }
  .bar.zoom .yaxis { position:absolute; inset:0; z-index:1; pointer-events:none; }
  .bar.zoom .yaxis i { position:absolute; left:0; right:0; border-top:1px dashed rgba(255,255,255,.35); }
  .bar.zoom .yaxis span { position:absolute; right:4px; transform:translateY(-100%); font-size:11px; color:#fff;
    text-shadow:0 1px 2px rgba(0,0,0,.8); }
  .bar.zoom .cross { position:absolute; top:0; bottom:0; width:1px; z-index:4; background:rgba(255,255,255,.8); pointer-events:none; }
  .bar.zoom .readout { position:absolute; bottom:4px; z-index:4; margin-left:6px; padding:2px 6px; border-radius:4px;
    font-size:12px; white-space:nowrap; pointer-events:none; background:rgba(0,0,0,.75); color:#fff; }
  .bar.zoom .readout.left { transform:translateX(-100%); margin-left:-6px; }
  .bar.zoom [hidden] { display:none; }
  .single .day[data-day] { cursor:pointer; }
  .history .target { stroke:#ffe14d; stroke-width:1; }
  /* The current time: one line across the thermostats of the day, each bar's line reaching the
     next bar (up to 9 px away: 24 px bars in 28 px rows, 5 px apart), with a triangle at each
     end, like a playhead */
  .now { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; z-index:5; pointer-events:none;
    color:var(--primary-text-color); background:currentColor; filter:drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
  .sub:not(:first-child) .now { top:-10px; }
  .sub:not(:last-child) .now { bottom:-10px; }
  .sub:first-child .now::before, .sub:last-child .now::after { content:''; position:absolute; left:50%; margin-left:-5px;
    border-left:5px solid transparent; border-right:5px solid transparent; }
  .sub:first-child .now::before { top:0; border-top:6px solid; }
  .sub:last-child .now::after { bottom:0; border-bottom:6px solid; }
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
  .loading { color:var(--secondary-text-color); }
  .views { display:flex; justify-content:flex-end; gap:2px; margin:-6px 0 8px; }
  .view { border:1px solid var(--divider-color); background:transparent; padding:3px 10px; cursor:pointer;
    font-size:.82em; color:var(--secondary-text-color); }
  .view:first-child { border-radius:12px 0 0 12px; }
  .view:last-child { border-radius:0 12px 12px 0; }
  .view.on { background:var(--primary-color); border-color:var(--primary-color); color:var(--text-primary-color,#fff); }
  .table-wrap { overflow-x:auto; }
  .pv-table { border-collapse:collapse; width:100%; font-size:.9em; }
  .pv-table th, .pv-table td { padding:2px; text-align:center; white-space:nowrap; }
  .pv-table th.name, .pv-table tr.defaults th { text-align:left; font-weight:normal; color:var(--secondary-text-color); padding-right:8px; }
  .pv-table tr.defaults td, .pv-table tr.defaults th { border-bottom:1px solid var(--divider-color); padding-bottom:6px; }
  .cell { display:inline-flex; align-items:center; justify-content:center; gap:5px; width:100%; min-width:64px;
    padding:5px 6px; border:1px solid transparent; border-radius:6px; background:transparent; font:inherit; color:inherit; }
  button.cell { cursor:pointer; }
  button.cell:hover, .cell.on { border-color:var(--divider-color); background:var(--secondary-background-color); }
  .cell.on { border-color:var(--primary-color); }
  .cell.head { font-weight:600; }
  .cell.head i { display:inline-block; width:10px; height:10px; border-radius:3px; }
  .cell.default { color:var(--secondary-text-color); }
  .cell.custom { font-weight:600; color:var(--primary-text-color); }
  .cell.add { color:var(--primary-color); font-weight:600; }
  .pv-key { margin-top:6px; font-size:.78em; color:var(--secondary-text-color); }
  .pv-key .default { opacity:.8; }
  .rules-view { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
  .rules-try { color:var(--primary-color); white-space:nowrap; }
  .rule { padding:8px 10px; border-radius:10px; border:1px solid var(--divider-color); display:flex; flex-direction:column; gap:6px; }
  .rule-head { display:flex; align-items:center; gap:8px; }
  .rule-num { font-weight:500; }
  .rule-state { font-size:.78em; padding:1px 8px; border-radius:10px; background:var(--secondary-background-color); color:var(--secondary-text-color); }
  .rule-state.true { background:var(--success-color,#43a047); color:#fff; }
  .rule-state.error { background:var(--error-color,#db4437); color:#fff; }
  .rule-tools { margin-left:auto; display:flex; gap:4px; }
  .rule textarea { width:100%; box-sizing:border-box; font-family:var(--code-font-family,monospace); font-size:.85em;
    padding:6px; border-radius:6px; border:1px solid var(--divider-color); background:var(--card-background-color);
    color:var(--primary-text-color); resize:vertical; }
  .rule-then { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:.9em; }
  .rule-then select { padding:4px 6px; border-radius:6px; border:1px solid var(--divider-color); max-width:100%;
    background:var(--card-background-color); color:var(--primary-text-color); }
  .rule-result { font-size:.8em; color:var(--secondary-text-color); overflow-wrap:anywhere; }
  .rule-result.error { color:var(--error-color,#db4437); }
  .rules-outcome { font-size:.9em; }
  /* Popover of a preset cell: a grid of lines (label, then its field on the right), OK at the foot */
  .cell-ed { gap:12px; width:min(380px, calc(100% - 16px)); }
  .cell-ed .ed-head strong { display:flex; align-items:center; gap:8px; }
  .cell-ed select { padding:4px 6px; border-radius:6px; border:1px solid var(--divider-color);
    background:var(--secondary-background-color); color:var(--primary-text-color); max-width:100%; }
  .cell-ed input[type=color] { width:36px; height:30px; padding:0 2px; flex:none; }
  .cell-ed input[type=radio], .cell-ed input[type=checkbox] { padding:0; margin:0; }
  .pv-dot { width:12px; height:12px; border-radius:3px; flex:none; }
  /* A choice's label stays on one line; its field takes the rest (a list too long ends in "…") */
  .pv-choices { display:flex; flex-direction:column; gap:10px; }
  .pv-choice { display:flex; align-items:center; gap:8px; min-height:30px; cursor:pointer; }
  .pv-choice > span:not(.pv-field) { flex:none; white-space:nowrap; }
  .pv-field { margin-left:auto; min-width:0; display:flex; justify-content:flex-end; }
  .pv-field select { min-width:0; text-overflow:ellipsis; }
  .pv-choice:not(:has(input:checked)) .pv-field { opacity:.5; }
  .pv-fields { display:grid; grid-template-columns:auto 1fr; align-items:center; gap:10px 12px; }
  .pv-fields > .pv-temp { justify-self:end; }
  .pv-name { display:flex; align-items:center; gap:6px; }
  .pv-name input[type=text] { flex:1; min-width:0; }
  .pv-temp { display:flex; align-items:center; gap:4px; }
  .pv-temp .btn.icon { padding:4px 10px; }
  .pv-temp input { width:56px; text-align:center; }
  .pv-delete { display:flex; flex-direction:column; gap:8px; }
  .pv-check, .pv-replace { display:flex; align-items:center; gap:8px; }
  .pv-replace { padding-left:21px; color:var(--secondary-text-color); }
  .pv-delete:not(:has(input:checked)) .pv-replace { opacity:.5; }
  .pv-foot { margin-left:0; justify-content:flex-end; padding-top:10px; border-top:1px solid var(--divider-color); }
  .missing { color:var(--secondary-text-color); padding:16px; }
  @media (max-width:500px) {
    .multi .scale { grid-template-columns:30px fit-content(60px) 1fr 28px; }
    .dgroup { grid-template-columns:30px 1fr; }
    .multi .sub { grid-template-columns:fit-content(60px) 1fr 28px; }
    .sub { grid-template-columns:1fr 28px; }
    .scale { grid-template-columns:30px 1fr 28px; }
  }
`;


// =====================================================================
//  Block added to the more-info dialog of a scheduled thermostat: current day,
//  week of the active schedule, editable temporary override.
//  HA offers no official extension point: the block is inserted into its internal
//  structure. If an HA update changes it, the block no longer shows up, with no
//  other consequence.
// =====================================================================

// Options of the block (updated by the last configured card)
const MORE_INFO_CFG = {
  language: undefined, // card option: forces the UI language
  step: 15,
};

class ChauffageMoreInfo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._pending = undefined; // override sent, waiting for the integration's update
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
    const src = dataSource(hass);
    if (src.available && !this._unlisten) {
      this._unlisten = INTEGRATION.listen(() => { if (this._hass) this.hass = this._hass; });
    }
    const { weeks, overrides, schedule } = src.stamps;
    if (this._key && overrides !== this._key[2]) this._pending = undefined;
    // Redraw only when relevant data changed (or every new minute)
    const key = [s[this._entity], weeks, overrides, schedule, Math.floor(Date.now() / 60000), this._loc.signature];
    if (this._key && key.every((v, i) => v === this._key[i])) return;
    if (this._drag) return; // no redraw while dragging
    this._key = key;
    this._render();
  }

  _preset(id) {
    return presetOf(presetsOf(dataSource(this._hass), this._loc), id, this._loc);
  }

  _currentOverride() {
    if (this._pending !== undefined) return this._pending;
    return filterActive(dataSource(this._hass).overrides())[this._entity] || null;
  }

  disconnectedCallback() {
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
  }

  _send(override) {
    this._pending = override;
    this._render();
    dataSource(this._hass).setOverride(this._entity, override)
      .catch(() => { this._pending = undefined; this._render(); });
  }

  // New end: at least one step after now
  _setEnd(endsAt) {
    const d = this._currentOverride();
    if (!d) return;
    const min = new Date(Date.now() + MORE_INFO_CFG.step * 60000);
    this._send({ ...d, end: (endsAt < min ? min : endsAt).toISOString() });
  }

  _week() {
    const src = dataSource(this._hass);
    const schedule = src.activeSchedule();
    return { schedule: schedule && src.scheduleName(schedule), week: activeWeek(src, this._entity) };
  }

  _bar(segs, piece, showNow, big) {
    const segHtml = segs.map((s, i) => {
      const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
      const p = this._preset(s.preset);
      const txt = big && end - s.start >= (this._loc.hour12 ? 120 : 90) ? `<span>${this._loc.time(s.start)}</span>` : '';
      return `<div class="seg" style="left:${pct(s.start)}%;width:${pct(end - s.start)}%;background:${p.color}" title="${this._loc.time(s.start)} → ${this._loc.time(end)} · ${esc(p.name)}">${txt}</div>`;
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
    const { schedule, week } = this._week();
    if (!week) { this.shadowRoot.innerHTML = ''; this.style.display = 'none'; return; }
    // A temperature being typed survives the redraw (a new state of the thermostat, every minute)
    const focused = this.shadowRoot.activeElement;
    const typed = focused && focused.matches(OVERRIDE_TEMPERATURE) ? focused.value : null;
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
    const current = this._preset(segs[idx].preset).name;
    const next = segs[idx + 1];
    const followText = next
      ? t('untilThen', { current, time: this._loc.time(next.start), next: this._preset(next.preset).name })
      : t('untilMidnight', { current });

    let status;
    let endDay = '';
    const attrs = (this._hass.states[this._entity] || {}).attributes || {};
    if (d) {
      this._creating = false;
      const value = overrideValueHtml(d, dataSource(this._hass), this._entity, attrs, this._loc);
      const endsAt = parseDate(d.end);
      const remaining = Math.max(0, Math.round((endsAt - new Date()) / 60000));
      const lastPiece = pieces.find((p) => p.isLast);
      const dayLabel = endsAt.toDateString() === new Date().toDateString()
        ? t('today') : this._loc.days[(endsAt.getDay() + 6) % 7].toLowerCase();
      const addButton = (m, label) => `<button data-min="${m}">${label}</button>`;
      const then = thenText(dataSource(this._hass), this._entity, d, this._loc);
      status = `<div class="status derogation">
        <div class="line">
          <span class="override-value">⏱ ${esc(overrideLabel(d, this._loc))}</span>
          <label>${esc(t('until'))} <input type="time" data-end step="${MORE_INFO_CFG.step * 60}" value="${hmOf(endsAt)}"></label>
          <span class="muted">${esc(dayLabel)} · ${esc(t('remaining', { duration: durationText(remaining, this._loc) }))}${then ? ` · ${esc(then)}` : ''}</span>
        </div>
        ${value.presets}
        <div class="line">${value.temperature}</div>
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
      // "Temporary setpoint…" unfolds the same controls, to set one
      const value = this._creating ? overrideValueHtml(null, dataSource(this._hass), this._entity, attrs, this._loc) : null;
      status = `<div class="status${value ? ' derogation' : ''}">
        <div class="line"><span><span class="muted">${esc(t('followsSchedule'))}</span> ${esc(followText)}</span>
          <button data-new-override>${esc(t('newOverride'))}</button></div>
        ${value ? `${value.presets}<div class="line">${value.temperature}</div>` : ''}
      </div>`;
    }

    const rows = this._loc.dayOrder.map((day) => `<div class="row${day === today ? ' today' : ''}">
        <span>${this._loc.daysShort[day]}</span>${this._bar(week[day], pieceFor(day), false, false)}</div>`).join('');
    const ticks = [0, 6, 12, 18, 24].map((h) => `<span>${this._loc.tick(h)}</span>`).join('');

    this.shadowRoot.innerHTML = `<style>${MORE_INFO_STYLE}</style>
      <div class="wrap">
        <div class="title">${esc(t('schedule'))} <span class="muted">· ${esc(schedule)}</span></div>
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
    if (typed !== null) restoreTyped(this.shadowRoot, OVERRIDE_TEMPERATURE, typed);
  }

  _onClick(e) {
    const b = e.target.closest('button');
    if (!b || !this._hass) return;
    if (b.hasAttribute('data-new-override')) { this._creating = !this._creating; return this._render(); }
    const d = this._currentOverride();
    if (b.dataset.act === 'override-preset') {
      const changed = overrideWithPreset(d, dataSource(this._hass), this._entity, b.dataset.preset);
      return changed && this._send(changed);
    }
    if (!d) return;
    if (b.hasAttribute('data-del')) return this._send(null);
    this._setEnd(new Date(parseDate(d.end).getTime() + Number(b.dataset.min) * 60000));
  }

  _onChange(e) {
    const el = e.target;
    if (el.hasAttribute('data-override-temperature') && el.value !== '') {
      this._send(overrideWithTemperature(this._currentOverride(), dataSource(this._hass), Number(el.value)));
      return;
    }
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
  input[type=time], input[type=number] { font:inherit; padding:3px 6px; border-radius:6px; border:1px solid var(--divider-color);
    background:var(--card-background-color); color:var(--primary-text-color); }
  input[type=number] { width:5em; }
  .presets { display:flex; flex-wrap:wrap; gap:6px; }
  .presets button { border:0; color:#fff; padding:6px 10px; opacity:.5; }
  .presets button.on { opacity:1; box-shadow:0 0 0 2px var(--primary-text-color); }
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

// =====================================================================
//  Visual editor of the card (dashboard → edit card), laid out like Home Assistant's own card
//  editors (Entities, Tile…): one row per thermostat (drag handle, picker, remove, edit); the
//  edit button opens the thermostat's page, with its optional name. Built on HA's elements
//  (<ha-entity-picker>, <ha-sortable>, <ha-form>…), already loaded in the card editor dialog.
//  Options it does not show (written in YAML, like `language`) are kept as they are.
// =====================================================================

const EDITOR_STEPS = [5, 10, 15, 30];
const MDI = {
  drag: 'M21,11H3V9H21V11M21,13H3V15H21V13Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  pencil: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
};
const EDITOR_CSS = `
  h3 { margin: 0 0 8px; font-size: 1em; font-weight: 500; }
  .thermostat { display: flex; align-items: center; gap: 4px; }
  .thermostat + .thermostat { margin-top: 8px; }
  .handle { cursor: move; padding: 8px 4px; color: var(--secondary-text-color); display: flex; }
  .picker { flex: 1; min-width: 0; }
  .picker ha-entity-picker { display: block; }
  .custom-name { font-size: .85em; color: var(--secondary-text-color); padding: 2px 0 0 12px; }
  .add { display: block; margin: 12px 0 24px; }
  .header { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; font-size: 1.1em; }
`;

class ChauffageProgrammeCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._editing = null; // index of the thermostat whose page is open
    this._built = null; // what the DOM shows: rebuilt only when it changes (keeps the focus)
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  _thermostats() {
    return ((this._config && this._config.thermostats) || []).map((t) => (typeof t === 'string' ? { entity: t } : { ...t }));
  }

  _defaultName(entity) {
    return entity ? thermostatName(this._hass, entity) : '';
  }

  // Name shown under a row: only a name of the card's config that changes the thermostat's own
  _shownName(t) {
    const shown = t.name ? thermostatName(this._hass, t.entity, t.name) : null;
    return shown !== this._defaultName(t.entity) ? shown : null;
  }

  // HA's own name field (entity_name selector, from 2025.11): text, or pieces such as the area
  _haNameField() {
    return haAtLeast(this._hass, 2025, 11);
  }

  _render() {
    if (!this._config) return;
    const thermostats = this._thermostats();
    if (this._editing !== null && !thermostats[this._editing]) this._editing = null;
    const loc = makeLocale(this._hass);
    // The thermostat's page keeps its form while its fields change; the list is rebuilt
    const shape = JSON.stringify(this._editing !== null
      ? ['page', this._editing, loc.signature, this._haNameField()]
      : ['list', thermostats, thermostats.map((t) => this._shownName(t)), loc.signature]);
    if (shape !== this._built) {
      this._built = shape;
      this.shadowRoot.replaceChildren();
      const style = document.createElement('style');
      style.textContent = EDITOR_CSS;
      this.shadowRoot.appendChild(style);
      if (this._editing !== null) this._buildPage(loc);
      else this._buildList(loc, thermostats);
    }
    for (const el of this.shadowRoot.querySelectorAll('ha-entity-picker, ha-form')) el.hass = this._hass;
    if (this._editing !== null) {
      const t = thermostats[this._editing];
      this._page.data = this._haNameField()
        ? { entity: t.entity, ...(t.name !== undefined ? { name: t.name } : {}) }
        : { entity: t.entity, name: typeof t.name === 'string' ? t.name : '' };
    } else {
      const c = this._config;
      this._options.data = { show_all: c.show === 'all', step: String(c.step || 15) };
    }
  }

  _button(cls, label, path, onClick) {
    const b = document.createElement('ha-icon-button');
    b.className = cls;
    b.label = label;
    b.path = path;
    b.addEventListener('click', onClick);
    return b;
  }

  _picker(cls, onChange) {
    const p = document.createElement('ha-entity-picker');
    p.className = cls;
    p.includeDomains = ['climate'];
    p.addEventListener('value-changed', (e) => {
      e.stopPropagation();
      onChange(e.detail.value);
    });
    return p;
  }

  _buildList(loc, thermostats) {
    const title = document.createElement('h3');
    title.textContent = loc.t('editorThermostats');
    const sortable = document.createElement('ha-sortable');
    sortable.setAttribute('handle-selector', '.handle');
    sortable.addEventListener('item-moved', (e) => {
      e.stopPropagation();
      const list = this._thermostats();
      list.splice(e.detail.newIndex, 0, list.splice(e.detail.oldIndex, 1)[0]);
      this._setThermostats(list);
    });
    const container = document.createElement('div');
    thermostats.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'thermostat';
      const handle = document.createElement('div');
      handle.className = 'handle';
      const icon = document.createElement('ha-svg-icon');
      icon.path = MDI.drag;
      handle.appendChild(icon);
      const cell = document.createElement('div');
      cell.className = 'picker';
      const picker = this._picker('', (entity) => {
        const list = this._thermostats();
        if (entity) list[i].entity = entity;
        else list.splice(i, 1);
        this._setThermostats(list);
      });
      picker.value = t.entity;
      picker.hideClearIcon = true;
      cell.appendChild(picker);
      const shown = this._shownName(t);
      if (shown) {
        const name = document.createElement('div');
        name.className = 'custom-name';
        name.textContent = loc.t('editorShownAs', { name: shown });
        cell.appendChild(name);
      }
      row.append(handle, cell,
        this._button('remove', loc.t('editorRemove'), MDI.close, () => {
          const list = this._thermostats();
          list.splice(i, 1);
          this._setThermostats(list);
        }),
        this._button('edit', loc.t('editorEdit'), MDI.pencil, () => {
          this._editing = i;
          this._render();
        }));
      container.appendChild(row);
    });
    sortable.appendChild(container);
    const add = this._picker('add', (entity) => {
      if (!entity) return;
      add.value = '';
      this._setThermostats([...this._thermostats(), { entity }]);
    });
    add.setAttribute('add-button', '');
    const options = document.createElement('ha-form');
    options.className = 'options';
    options.schema = [
      { name: 'show_all', selector: { boolean: {} } },
      { name: 'step', required: true, selector: { select: { mode: 'dropdown', options: EDITOR_STEPS.map((s) => ({ value: String(s), label: String(s) })) } } },
    ];
    options.computeLabel = (s) => loc.t({ show_all: 'editorShowAll', step: 'editorStep' }[s.name]);
    options.addEventListener('value-changed', (e) => {
      e.stopPropagation();
      const config = { ...this._config };
      if (e.detail.value.show_all) config.show = 'all';
      else if (config.show === 'all') delete config.show;
      const step = Number(e.detail.value.step);
      if (step && step !== 15) config.step = step;
      else delete config.step;
      this._emit(config);
    });
    this._options = options;
    this.shadowRoot.append(title, sortable, add, options);
  }

  _buildPage(loc) {
    const header = document.createElement('div');
    header.className = 'header';
    const back = document.createElement('ha-icon-button-prev');
    back.label = loc.t('editorBack');
    back.addEventListener('click', () => {
      this._editing = null;
      this._render();
    });
    const title = document.createElement('span');
    title.textContent = loc.t('editorThermostat');
    header.append(back, title);
    const form = document.createElement('ha-form');
    form.schema = [
      { name: 'entity', required: true, selector: { entity: { domain: 'climate' } } },
      this._haNameField()
        ? { name: 'name', selector: { entity_name: {} }, context: { entity: 'entity' } }
        : { name: 'name', selector: { text: {} } },
    ];
    form.computeLabel = (s) => loc.t(s.name === 'name' ? 'editorName' : 'editorThermostat');
    form.computeHelper = (s) => (s.name === 'name' && !this._haNameField() ? loc.t('editorNameDefault', { name: this._defaultName(form.data && form.data.entity) }) : undefined);
    form.addEventListener('value-changed', (e) => {
      e.stopPropagation();
      const list = this._thermostats();
      const t = list[this._editing];
      if (e.detail.value.entity) t.entity = e.detail.value.entity;
      const name = e.detail.value.name;
      if (name === undefined || name === '' || (Array.isArray(name) && !name.length)) delete t.name;
      else t.name = name;
      this._setThermostats(list);
    });
    this._page = form;
    this.shadowRoot.append(header, form);
  }

  // A thermostat without a name nor other option is written as its entity id alone
  _setThermostats(list) {
    this._emit({ ...this._config, thermostats: list.map((t) => (Object.keys(t).length === 1 ? t.entity : t)) });
  }

  _emit(config) {
    this._config = config;
    this._render();
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }
}

// Guards: the file may be loaded twice (the integration, and a copy left in www/ by the v0.1
// package or a dashboard resource); define things only once.
function defineElements() {
  if (!customElements.get('chauffage-programme-card')) customElements.define('chauffage-programme-card', ChauffageProgrammeCard);
  if (!customElements.get('chauffage-moreinfo')) customElements.define('chauffage-moreinfo', ChauffageMoreInfo);
  if (!customElements.get('chauffage-programme-card-editor')) customElements.define('chauffage-programme-card-editor', ChauffageProgrammeCardEditor);
}
defineElements();
// The integration's module is loaded in parallel with HA's frontend, which replaces
// `customElements` with a scoped registry polyfill that ignores elements defined before
// (issue #2). The polyfill defines <home-assistant> in the registry it replaced: define the
// elements again, in the registry in place then.
customElements.whenDefined('home-assistant').then(defineElements);

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
    const weeks = dataSource(hass).weeks();
    // Location: end of the dialog's "info" view; otherwise right after the thermostat controls
    const info = deepQuery(dialog.shadowRoot, 'ha-more-info-info');
    const content = info ? null : deepQuery(dialog.shadowRoot, 'more-info-content');
    const host = info ? info.shadowRoot || info : content && content.parentNode;
    if (!host) return; // another dialog tab (history, settings…)
    let block = host.querySelector('chauffage-moreinfo');
    if (!current.startsWith('climate.') || !weeks[current]) {
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

if (!window.__chauffageMoreInfoListener) {
  window.__chauffageMoreInfoListener = true;
  window.addEventListener('hass-more-info', (e) => {
    const id = e.detail && e.detail.entityId;
    if (id) watchMoreInfo(id);
  });
}

function pickerLocale() {
  const lang = (typeof document !== 'undefined' && document.documentElement.lang) || (typeof navigator !== 'undefined' && navigator.language);
  return makeLocale(null, lang);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'chauffage-programme-card')) window.customCards.push({
  type: 'chauffage-programme-card',
  // Read when the dialog opens: in the language of HA's interface (the lang of the page)
  get name() { return pickerLocale().t('cardName'); },
  get description() { return pickerLocale().t('cardDescription'); },
  preview: true,
  documentationURL: 'https://github.com/armellarcier/ha-chauffage#readme',
  // "By entity" tab (HA 2026.6+): the card for the thermostat chosen
  getEntitySuggestion: (hass, entityId) => (entityId.startsWith('climate.')
    ? { config: { type: 'custom:chauffage-programme-card', thermostats: [entityId] } }
    : null),
});

console.info(`%c ha-chauffage %c ${VERSION} `, 'background:#f57c00;color:#fff;border-radius:3px 0 0 3px', 'background:#555;color:#fff;border-radius:0 3px 3px 0');

// Exports for the tests (tests/js); no effect on Home Assistant, which loads this file as a module.
export {
  VERSION, I18N, makeLocale, toMin, toHM, parseDate, normalize, parseDay, serializeDay,
  overridePieces, overrideLabel, historyDays, rowsOfStates, MORE_INFO_CFG, INTEGRATION, dataSource,
  ChauffageProgrammeCard, ChauffageMoreInfo, ChauffageProgrammeCardEditor,
};
