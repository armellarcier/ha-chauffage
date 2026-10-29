/*
 * chauffage-programme-card
 * Lovelace card: visual editor for the weekly heating schedules
 * 7 days, each with one row per displayed thermostat.
 *
 * Served by the Chauffage integration (custom_components/chauffage) and loaded on every page;
 * reads and writes through its websocket API.
 */

// Release version (same as package.json and CHANGELOG.md)
const VERSION = '0.8.0-alpha.2';

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
    hintTouch: 'Drag a handle to move a time · Tap a slot to edit it · Double-tap to add a cut',
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
    tomorrow: 'tomorrow',
    remaining: '{duration} left',
    duration: '{h}h {mm}',
    deleteAndResume: 'Delete · resume the schedule',
    thenSchedule: 'then {preset} (schedule)',
    newOverride: 'Temporary setpoint…',
    resume: 'Resume the schedule',
    paused: 'Paused',
    pausedNote: '{name} is paused: Chauffage does not control it.',
    renamedNote: '{former} was renamed {entity} in Home Assistant: edit the card to use its new id.',
    pausedInfo: 'Paused: Chauffage does not control it.',
    resumeShort: 'Resume',
    viewThermostats: 'Thermostats',
    controlEntity: 'Control',
    device: 'Device',
    chauffageDevice: 'Chauffage device: the switches of the schedules, the active schedule',
    scheduleDetails: 'Details and history…',
    allThermostats: 'All thermostats',
    weeksTitle: 'Weeks',
    openInPanel: 'Open in {panel}',
    scheduleThermostat: 'Schedule',
    inCards: 'Shown in',
    inNoCard: 'Shown in no card',
    moreActions: 'More actions',
    addThermostat: 'Schedule another thermostat',
    pageSchedules: 'Schedules',
    rulesHeading: 'Activation rules',
    panelActive: 'Active',
    panelActivate: 'Activate',
    panelEdit: 'Edit',
    panelNewName: 'Name of the new schedule',
    panelCreate: 'Create',
    panelDevices: 'Devices:',
    welcomeTitle: 'Welcome to Chauffage',
    welcomeIntro: 'Chauffage gives your thermostats weekly schedules. Three steps to start:',
    welcomeStep1: 'Choose the thermostats that Chauffage controls.',
    welcomeStep2: 'Set their weeks, from each thermostat’s page.',
    welcomeStep3: 'Add the Heating schedules card to a dashboard, for every day.',
    welcomePick: 'Which thermostats should Chauffage control?',
    welcomeNote: 'Chauffage controls them at once: until you set their weeks, they follow the week of a new schedule ({preset} all week).',
    welcomeStartNone: 'Schedule',
    welcomeStartOne: 'Schedule 1 thermostat',
    welcomeStartMany: 'Schedule {count} thermostats',
    welcomeNoClimate: 'Home Assistant has no thermostat yet (a climate entity). Add one, then come back here.',
    welcomeAddDevice: 'Add a thermostat',
    nextTitle: 'Next steps',
    nextWeeks: 'Open a thermostat to set its weeks and its presets.',
    nextCard: 'Add the card to a dashboard: Add card → Heating schedules.',
    nextClose: 'Close',
    noThermostatYet: 'No thermostat is scheduled yet.',
    scheduleThermostats: 'Schedule thermostats',
    overrideEntity: 'Override',
    plannedEntity: 'Planned preset',
    entityRequired: 'The "entity" option is required (a climate.* thermostat)',
    entityMissing: '{entity} does not exist in Home Assistant',
    notScheduled: 'Chauffage does not schedule this thermostat. An admin can schedule it in the Chauffage panel, on the Thermostats page.',
    thermostatCardName: 'Scheduled thermostat',
    thermostatCardDescription: 'One thermostat scheduled by Chauffage: what it does now, why and until when, a temporary setpoint',
    thermostatsHint: 'Chauffage controls the scheduled thermostats. A paused thermostat stays scheduled: it keeps its weeks, but Chauffage does not control it.',
    controlled: 'Controlled',
    pauseShort: 'Pause',
    forget: 'Forget…',
    forgetText: '{name} will no longer be scheduled. Its weeks and settings will be deleted.',
    forgetConfirm: 'Forget it',
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
    groupDays: 'Group days',
    groupDaysTitle: 'Show identical days on one row: editing the row edits each of its days',
    everyDay: 'Every day',
    historyTitle: 'Show the measured temperature of the last 7 days (dashed: the setpoint applied)',
    historyUnavailable: 'History unavailable: {message}',
    measured: 'measured {range}°',
    setpoint: 'setpoint {range}°',
    showLarger: 'Show the day larger',
    showSmaller: 'Show the day smaller',
    readout: '{time} · {measured} · setpoint {setpoint}',
    copyWeekTo: 'Copy {name}’s week to…',
    copyTo: 'Copy to…',
    cancel: 'Cancel',
    save: 'Save',
    unsaved: 'Unsaved changes',
    destinations: { weekdays: 'Mon–Fri', weekend: 'Sat–Sun', all: 'every day', others: 'the other thermostats' },
    dayCopiedTo: '{name} · {day} copied to {destination}',
    weekCopiedTo: '{source}’s week copied to {target} · {schedule}',
    weekCopiedFrom: 'The {schedule} week copied here',
    copied: 'Copied: {label}',
    pastedOn: 'Pasted on {name} · {day}',
    schedule: 'Schedule',
    followsSchedule: 'Follows the schedule:',
    untilThen: '{current} until {time}, then {next}',
    untilDayThen: '{current} until {time} ({day}), then {next}',
    allWeek: '{current} all week',
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
    defaultHelp: 'Used by thermostats set to automatic that have no preset of their own named like this one.',
    presetsIntro: 'A preset is an intent (Comfort, Eco…): each thermostat turns it into one of its own presets, or a temperature. Choose a preset or a cell to change it.',
    presetsUnknown: '? : the temperature of a thermostat’s own preset is known once it has been used.',
    defaultTemperature: '{value}° by default',
    presetDefaultTemperature: 'Default temperature',
    cellOwnPreset: 'its {preset} preset',
    cellSetHere: 'set here',
    cellDefault: 'default',
    addPresetButton: '+ Add a preset',
    ownPresetsOnDevice: 'Set its own presets on its device',
    confirmDeletePreset: 'Delete “{name}”?',
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
    reloadNeeded: 'Chauffage was updated: reload the page to finish the update.',
    reloadPage: 'Reload',
    // The card in HA's "Add card" dialog
    cardName: 'Heating schedules',
    cardDescription: 'Weekly heating schedules, several thermostats per day',
    // Visual editor of the card
    editorThermostats: 'Thermostats (required)',
    editorRemovedScheduled: '{name} is still scheduled: Chauffage keeps controlling it. Pause or forget it from the Thermostats view of the card.',
    editorRenamed: 'Renamed {entity} in Home Assistant.',
    editorUseNewId: 'Use the new id',
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
    hintTouch: 'Glisser une poignée pour déplacer un horaire · Toucher une plage pour la modifier · Toucher deux fois pour ajouter une coupure',
    open: 'Ouvrir {name}',
    openThermostat: 'Ouvrir le thermostat',
    copyPaste: 'Copier / coller…',
    copyDay: 'Copier la journée',
    paste: 'Coller',
    copyToWeekdays: 'Copier vers Lun–Ven',
    copyToWeekend: 'Copier vers Sam–Dim',
    copyToAll: 'Copier vers tous les jours',
    copyToOthers: 'Copier vers les autres thermostats',
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
    tomorrow: 'demain',
    remaining: 'encore {duration}',
    duration: '{h} h {mm}',
    deleteAndResume: 'Supprimer · reprendre le planning',
    thenSchedule: 'puis {preset} (planning)',
    newOverride: 'Consigne temporaire…',
    resume: 'Reprendre le planning',
    paused: 'En pause',
    pausedNote: '{name} est en pause : Chauffage ne le pilote pas.',
    renamedNote: '{former} a été renommé {entity} dans Home Assistant : modifiez la carte pour utiliser son nouvel identifiant.',
    pausedInfo: 'En pause : Chauffage ne le pilote pas.',
    resumeShort: 'Reprendre',
    viewThermostats: 'Thermostats',
    controlEntity: 'Pilotage',
    device: 'Appareil',
    chauffageDevice: 'Appareil Chauffage : interrupteurs des plannings, planning actif',
    scheduleDetails: 'Détails et historique…',
    allThermostats: 'Tous les thermostats',
    weeksTitle: 'Semaines',
    openInPanel: 'Ouvrir dans {panel}',
    scheduleThermostat: 'Programmer',
    inCards: 'Affiché dans',
    inNoCard: 'Affiché dans aucune carte',
    moreActions: "Plus d'actions",
    addThermostat: 'Programmer un autre thermostat',
    pageSchedules: 'Plannings',
    rulesHeading: "Règles d'activation",
    panelActive: 'Actif',
    panelActivate: 'Activer',
    panelEdit: 'Modifier',
    panelNewName: 'Nom du nouveau planning',
    panelCreate: 'Créer',
    panelDevices: 'Appareils :',
    welcomeTitle: 'Bienvenue dans Chauffage',
    welcomeIntro: 'Chauffage donne à vos thermostats des plannings de la semaine. Trois étapes pour commencer :',
    welcomeStep1: 'Choisissez les thermostats que Chauffage pilote.',
    welcomeStep2: "Réglez leurs semaines, depuis la page de chaque thermostat.",
    welcomeStep3: 'Ajoutez la carte Plannings de chauffe à un tableau de bord, pour le quotidien.',
    welcomePick: 'Quels thermostats Chauffage doit-il piloter ?',
    welcomeNote: "Chauffage les pilote tout de suite : tant que vous n'avez pas réglé leurs semaines, ils suivent la semaine d'un nouveau planning ({preset} toute la semaine).",
    welcomeStartNone: 'Programmer',
    welcomeStartOne: 'Programmer 1 thermostat',
    welcomeStartMany: 'Programmer {count} thermostats',
    welcomeNoClimate: "Home Assistant n'a encore aucun thermostat (une entité climate). Ajoutez-en un, puis revenez ici.",
    welcomeAddDevice: 'Ajouter un thermostat',
    nextTitle: 'Et maintenant',
    nextWeeks: 'Ouvrez un thermostat pour régler ses semaines et ses préréglages.',
    nextCard: 'Ajoutez la carte à un tableau de bord : Ajouter une carte → Plannings de chauffe.',
    nextClose: 'Fermer',
    noThermostatYet: "Aucun thermostat n'est encore programmé.",
    scheduleThermostats: 'Programmer des thermostats',
    overrideEntity: 'Dérogation',
    plannedEntity: 'Préréglage prévu',
    entityRequired: 'Le paramètre "entity" est requis (un thermostat climate.*)',
    entityMissing: '{entity} n’existe pas dans Home Assistant',
    notScheduled: "Chauffage ne programme pas ce thermostat. Un administrateur peut le programmer dans le panneau Chauffage, sur la page Thermostats.",
    thermostatCardName: 'Thermostat programmé',
    thermostatCardDescription: 'Un thermostat programmé par Chauffage : ce qu’il fait, pourquoi et jusqu’à quand, une consigne temporaire',
    thermostatsHint: "Chauffage pilote les thermostats programmés. Un thermostat en pause reste programmé : il garde ses semaines, mais Chauffage ne le pilote pas.",
    controlled: 'Piloté',
    pauseShort: 'Mettre en pause',
    forget: 'Oublier…',
    forgetText: '{name} ne sera plus programmé. Ses semaines et ses réglages seront supprimés.',
    forgetConfirm: "L'oublier",
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
    multipleTitle: 'Activer pour afficher plusieurs thermostats (raccourci : Ctrl+clic sur un thermostat)',
    all: 'Tous',
    allTitle: 'Afficher tous les thermostats',
    history: 'Historique',
    groupDays: 'Grouper les jours',
    groupDaysTitle: 'Afficher les jours identiques sur une ligne : modifier la ligne modifie chacun de ses jours',
    everyDay: 'Tous les jours',
    historyTitle: 'Afficher la température mesurée des 7 derniers jours (pointillés : la consigne appliquée)',
    historyUnavailable: 'Historique indisponible : {message}',
    measured: 'mesuré {range}°',
    setpoint: 'consigne {range}°',
    showLarger: 'Voir la journée en grand',
    showSmaller: 'Réduire la journée',
    readout: '{time} · {measured} · consigne {setpoint}',
    copyWeekTo: 'Copier la semaine de {name} vers…',
    copyTo: 'Copier vers…',
    cancel: 'Annuler',
    save: 'Enregistrer',
    unsaved: 'Modifications non enregistrées',
    destinations: { weekdays: 'Lun–Ven', weekend: 'Sam–Dim', all: 'tous les jours', others: 'les autres thermostats' },
    dayCopiedTo: '{name} · {day} copié vers {destination}',
    weekCopiedTo: 'Semaine de {source} copiée vers {target} · {schedule}',
    weekCopiedFrom: 'Semaine {schedule} copiée ici',
    copied: 'Copié : {label}',
    pastedOn: 'Collé sur {name} · {day}',
    schedule: 'Planning',
    followsSchedule: 'Suit le planning :',
    untilThen: '{current} jusqu\'à {time}, puis {next}',
    untilDayThen: '{current} jusqu\'à {time} ({day}), puis {next}',
    allWeek: '{current} toute la semaine',
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
    defaultHelp: 'Utilisée par les thermostats en automatique qui n\'ont pas de préréglage du même nom.',
    presetsIntro: 'Un préréglage est une intention (Confort, Éco…) : chaque thermostat la traduit en un de ses propres préréglages, ou en une température. Choisissez un préréglage ou une case pour le modifier.',
    presetsUnknown: '? : la température d’un préréglage du thermostat est connue une fois qu’il a servi.',
    defaultTemperature: '{value}° par défaut',
    presetDefaultTemperature: 'Température par défaut',
    cellOwnPreset: 'son préréglage {preset}',
    cellSetHere: 'réglé ici',
    cellDefault: 'par défaut',
    addPresetButton: '+ Ajouter un préréglage',
    ownPresetsOnDevice: 'Régler ses propres préréglages sur son appareil',
    confirmDeletePreset: 'Supprimer « {name} » ?',
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
    reloadNeeded: 'Chauffage a été mis à jour : rechargez la page pour terminer la mise à jour.',
    reloadPage: 'Recharger',
    // The card in HA's "Add card" dialog
    cardName: 'Plannings de chauffe',
    cardDescription: 'Plannings de chauffe hebdomadaires, plusieurs thermostats par journée',
    // Visual editor of the card
    editorThermostats: 'Thermostats (obligatoire)',
    editorRemovedScheduled: '{name} est toujours programmé : Chauffage continue de le piloter. Mettez-le en pause ou oubliez-le depuis la vue Thermostats de la carte.',
    editorRenamed: 'Renommé {entity} dans Home Assistant.',
    editorUseNewId: 'Utiliser le nouvel identifiant',
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
    // Changes when any language / format preference changes (triggers a redraw)
    signature: JSON.stringify([lang, intlLocale, unit, configured || null, prefs]),
    days: long,
    daysShort: short,
    dayOrder: order,
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
const LS_GROUP = 'chauffage-programme-card:group-days';
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

// Days in display order, the days of the same key on one row: [[0, 1, 2, 3, 4], [5, 6]]
function rowsOfDays(order, keyOf) {
  const rows = new Map();
  for (const d of order) {
    const key = keyOf(d);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(d);
  }
  return [...rows.values()];
}

// ---------- overrides (shared by the card and the more-info block) ----------

// The piece of an override drawn on a row of days: today's, or the last one (where it ends, with
// its handle), or the first of the row (the pieces start today: none is past)
function rowPiece(pieces, days) {
  const inRow = pieces.filter((p) => days.includes(p.day));
  return inRow.find((p) => p.day === todayIdx()) || inRow.find((p) => p.isLast) || inRow[0];
}

// Splits an override into one piece per day (today + 6 days), in minutes of the time of day like
// the slots: on the days the clocks change, the time elapsed since midnight is an hour off (#43)
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
      const start = minutesOf(s);
      let end = e < d1 ? minutesOf(e) : DAY_MIN;
      // Ending in the hour played twice when the clocks go back, before its start by the clock:
      // drawn from its start for its length
      if (end <= start) end = Math.min(DAY_MIN, start + Math.round((e - s) / 60000));
      pieces.push({
        day: (d0.getDay() + 6) % 7,
        start,
        end,
        d0,
        isLast: endsAt <= d1,
      });
    }
  }
  return pieces;
}

const DEFAULT_LOCALE = makeLocale(null, 'en');

// The override's value: the preset picked (`d.preset`, among `presets`), else its temperature or
// the thermostat's own preset
function overrideLabel(d, locale = DEFAULT_LOCALE, presets = []) {
  if (!d) return '';
  const picked = d.preset && presets.find((p) => p.id === d.preset);
  if (picked) return picked.name;
  if (d.kind === 'temperature') return `${locale.number(d.value)} ${locale.unit}`;
  return locale.preset(d.value);
}

const hmOf = (date) => toHM(date.getHours() * 60 + date.getMinutes());
const minutesOf = (date) => date.getHours() * 60 + date.getMinutes();
// The moment at `minutes` (time of day) of the day starting at `day0`; DAY_MIN is the next midnight.
// On the days the clocks change: a time played twice is its first occurrence, or the second one if
// the first is before `notBefore`; a time skipped is the moment the clocks went forward.
function atMinutes(day0, minutes, notBefore = null) {
  const at = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate(), 0, minutes);
  if (minutes >= DAY_MIN) return at;
  if (minutesOf(at) !== minutes) {
    let t = at.getTime();
    while (minutesOf(new Date(t - 60000)) > minutes) t -= 60000;
    return new Date(t);
  }
  const nextDay = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + 1);
  const again = new Date(at.getTime() + (nextDay.getTimezoneOffset() - at.getTimezoneOffset()) * 60000);
  return notBefore && at < notBefore && again > at && minutesOf(again) === minutes ? again : at;
}

// The next occurrence of `minutes` (time of day) after now: today, otherwise tomorrow
function nextAtMinutes(minutes) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = atMinutes(today, minutes, now);
  return at > now ? at : atMinutes(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), minutes, now);
}

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

// Compares two versions of ha-chauffage ("0.6.0", "0.6.0-beta.4"): < 0, 0 or > 0; a beta
// comes before its release
function compareVersions(a, b) {
  const parse = (v) => {
    const [release, pre] = String(v).split('-');
    return [release.split('.').map(Number), pre ? pre.split('.') : null];
  };
  const [ra, pa] = parse(a);
  const [rb, pb] = parse(b);
  for (let i = 0; i < 3; i++) if ((ra[i] || 0) !== (rb[i] || 0)) return (ra[i] || 0) - (rb[i] || 0);
  if (!pa || !pb) return (pa ? -1 : 0) - (pb ? -1 : 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined || pb[i] === undefined) return pa[i] === undefined ? -1 : 1;
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const diff = Number.isNaN(na) || Number.isNaN(nb) ? pa[i].localeCompare(pb[i]) : na - nb;
    if (diff) return diff;
  }
  return 0;
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

// The new id of a thermostat renamed from `entity` (the integration follows it), unless an
// entity has that id again
function renamedTo(hass, src, entity) {
  const to = src.renamed()[entity];
  return to && !(hass && hass.states[entity]) ? to : null;
}

// The same hass and data give the same source: a render asks for it once per bar or chip
let lastSource = { hass: null, data: null, src: null };

function dataSource(hass) {
  const available = integrationAvailable(hass);
  if (available) INTEGRATION.connect(hass);
  if (lastSource.src && lastSource.hass === hass && lastSource.data === INTEGRATION.data) return lastSource.src;
  const src = makeDataSource(hass, available);
  lastSource = { hass, data: INTEGRATION.data, src };
  return src;
}

function makeDataSource(hass, available) {
  const raw = available ? INTEGRATION.data : null;
  // The running integration is older than the card (updated from HACS, Home Assistant not
  // restarted yet): an older version, or data in a format this card does not know
  const compared = raw && raw.version ? compareVersions(VERSION, raw.version) : 0;
  const outdated = !!raw && (compared > 0 || !(Array.isArray(raw.schedules) && raw.weeks && typeof raw.weeks === 'object'));
  // A card older than the integration: the page stayed open during an update (HA's frontend
  // reconnects without reloading it), or an older copy of the card was loaded first (#36)
  const stale = compared < 0;
  const d = outdated || stale ? null : raw;
  const schedules = d ? d.schedules : [];
  const ids = new Set(schedules.map((s) => s.id));
  // The icon chosen in Home Assistant for a schedule's switch, if any (none by default: the same
  // icon on every tab would only take room)
  const scheduleIcon = (id) => {
    const entity = d && d.schedule_entities && d.schedule_entities[id];
    return (entity && hass.entities && hass.entities[entity] && hass.entities[entity].icon) || null;
  };
  return {
    available, // false: the integration is not set up
    outdated, // true: Home Assistant must be restarted to finish an update
    stale, // true: the page must be reloaded to finish an update
    ready: !!d,
    revision: d ? d.revision : null,
    stamps: d ? { weeks: `r${d.revision}`, overrides: JSON.stringify(d.overrides),
      schedule: JSON.stringify([d.active_schedule, schedules.map((s) => scheduleIcon(s.id))]),
      rules: JSON.stringify([d.rules, d.default_schedule, d.rule_results]), thermostats: JSON.stringify(d.thermostats),
      // The ids of what the cards open (an entity renamed in HA)
      entities: JSON.stringify([d.thermostat_entities, d.schedule_entities, d.schedule_select, d.device_id]) } : {},
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
    // A paused thermostat is kept but not driven (docs/decisions.md, "Scheduled thermostats")
    paused: (climate) => !!(d && d.thermostats && d.thermostats[climate] && d.thermostats[climate].paused),
    setPaused: (climate, paused) => hass.callWS({ type: 'chauffage/thermostat/set', entity_id: climate, paused }),
    scheduled: () => Object.keys((d && d.thermostats) || {}),
    forget: (climate) => hass.callWS({ type: 'chauffage/thermostat/forget', entity_id: climate }),
    renamed: () => (d && d.renamed) || {},
    // Saves against the revision of each thermostat sent (null: not scheduled when loaded);
    // an older integration only has the global one
    perThermostat: !!(d && d.thermostats),
    revisionOf: (climate) => (d && d.thermostats && d.thermostats[climate] ? d.thermostats[climate].revision : null),
    saveWeeks: (weeks, revision, revisions) => {
      const out = {};
      for (const [climate, bySchedule] of Object.entries(weeks)) {
        out[climate] = {};
        for (const [id, week] of Object.entries(bySchedule)) {
          if (ids.has(id)) out[climate][id] = week.map((day) => day.map((s) => s.split(' ')));
        }
      }
      const against = revisions ? { revisions } : (revision != null ? { revision } : {});
      return hass.callWS({ type: 'chauffage/weeks/save', weeks: out, ...against });
    },
    setOverride: (climate, override) => hass.callWS({ type: 'chauffage/override/set', entity_id: climate, override }),
    overrideDuration: () => (d && d.override_duration) || 120, // minutes, an option of the integration
    activateSchedule: (id) => hass.callWS({ type: 'chauffage/schedule/activate', schedule: id }),
    // Create, rename, move, delete schedules: [{ id, name? } | { name, copy_of? }]
    setSchedules: (list, revision) => hass.callWS({ type: 'chauffage/schedules/set', schedules: list, ...(revision != null ? { revision } : {}) }),
    presets: () => (d && d.presets) || [],
    targets: (climate) => (d && d.targets && d.targets[climate]) || {},
    scheduleIcon,
    // The entities and the device the cards open (#39): a thermostat's own ones (control,
    // override, planned_preset, override_end), a schedule's switch, the active-schedule select
    thermostatEntity: (climate, name) => (d && d.thermostat_entities && d.thermostat_entities[climate] && d.thermostat_entities[climate][name]) || null,
    scheduleEntity: (id) => (d && d.schedule_entities && d.schedule_entities[id]) || null,
    scheduleSelect: () => (d && d.schedule_select) || null,
    deviceId: () => (d && d.device_id) || null,
    // What a thermostat follows now and the next different preset: { preset, next_preset, next_start }
    planned: (climate) => (d && d.planned && d.planned[climate]) || null,
    // Presets and mappings are set from the card by admins (the integration refuses the others)
    editable: !!d && (!hass.user || !!hass.user.is_admin),
    mapping: (climate) => (d && d.mappings && d.mappings[climate]) || {},
    usePresets: () => !d || d.use_presets !== false,
    presetTemperature: (climate, preset) => ((d && d.preset_temperatures && d.preset_temperatures[climate]) || {})[preset],
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

// ---------- links to what a card mentions (#39) ----------
// A thermostat, a schedule or a setting a card names opens in Home Assistant: an entity in its
// more-info dialog (`data-more-info`), a device in its page (`data-device`, admins only: it is a
// settings page). The cards handle the clicks (openMoreInfo, openDevice).

// A text with a link in place of one of its values: the text escaped, then the link put in
const LINK_TOKEN = '\u{E000}';
function withHtml(text, html) {
  return esc(text).replace(LINK_TOKEN, html);
}

function entityLinkHtml(entity, label, title = '') {
  return `<span class="mi-link" role="link" tabindex="0" data-more-info="${esc(entity)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</span>`;
}

// The device of an entity, as HA's frontend knows it (its entity registry); null without one
function deviceOf(hass, entity) {
  const e = hass && hass.entities && hass.entities[entity];
  return (e && e.device_id) || null;
}

function deviceLinkHtml(hass, id, label) {
  if (!id || (hass && hass.user && !hass.user.is_admin)) return '';
  return `<span class="mi-link" role="link" tabindex="0" data-device="${esc(id)}">${esc(label)}</span>`;
}

// A link to a device, named by the device itself: "Bureau (Thermostat programmé)" (admins)
function deviceNamedLinkHtml(hass, id) {
  const d = id && hass && hass.devices && hass.devices[id];
  const name = d ? d.name_by_user || d.name || id : id;
  return deviceLinkHtml(hass, id, d && d.model ? `${name} (${d.model})` : name);
}

// A thermostat's devices: its own, then the scheduled thermostat's (Chauffage), once each
function thermostatDevices(hass, src, climate) {
  return [deviceOf(hass, climate), deviceOf(hass, src.thermostatEntity(climate, 'control'))]
    .filter((id, i, list) => id && list.indexOf(id) === i);
}

// A link of the block opens a page: closes Home Assistant's more-info dialog first, then opens
// the page. The dialog lives in the address (?more-info-entity-id=) and closes by going back in
// the history: the page opens once that is done, else going back would undo it.
function leaveMoreInfo(el, open) {
  const ha = document.querySelector('home-assistant');
  const dialog = ha && ha.shadowRoot && ha.shadowRoot.querySelector('ha-more-info-dialog');
  const inAddress = () => window.location.search.includes('more-info-entity-id');
  if (!inAddress()) {
    openMoreInfo(el, null);
    open();
    return;
  }
  if (dialog && typeof dialog.closeDialog === 'function') dialog.closeDialog();
  else openMoreInfo(el, null);
  const start = Date.now();
  const wait = () => (!inAddress() || Date.now() - start > 1500 ? open() : setTimeout(wait, 30));
  wait();
}

function openMoreInfo(el, entityId) {
  el.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId } }));
}

// Like HA's navigate(): the frontend follows the address
function navigate(path) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
}

function openDevice(id) {
  navigate(`/config/devices/device/${id}`);
}

// The Chauffage panel (frontend.py): a page, for example `presets`, or the overview
function openPanel(page) {
  navigate(page ? `/chauffage/${page}` : '/chauffage');
}

// The Chauffage panel's title, as Home Assistant shows it in the sidebar
function panelTitle(hass) {
  const panel = hass && hass.panels && hass.panels.chauffage;
  return (panel && panel.title) || 'Chauffage';
}
// The weeks of one thermostat, in the Chauffage panel
function openWeeks(climate) {
  openPanel(`thermostats/${climate}`);
}

// Where the dashboards show each thermostat, in a Chauffage card:
// { climate: [{ dashboard, view, path }] }. Admins only (the dashboards' configs).
async function cardPlacements(hass) {
  const out = {};
  const add = (climate, place) => {
    const list = out[climate] || (out[climate] = []);
    if (!list.some((p) => p.path === place.path)) list.push(place);
  };
  // Every Chauffage card in a part of a config, nested in stacks, sections or conditions
  const walk = (node, place) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, place));
    if (!node || typeof node !== 'object') return;
    if (node.type === 'custom:chauffage-programme-card') {
      for (const t of node.thermostats || []) add(typeof t === 'string' ? t : t.entity, place);
    } else if (node.type === 'custom:chauffage-thermostat-card' && node.entity) {
      add(node.entity, place);
    }
    Object.values(node).forEach((v) => walk(v, place));
  };
  const dashboards = (await hass.callWS({ type: 'lovelace/dashboards/list' }).catch(() => null)) || [];
  const all = [{ url_path: null, title: hass.localize ? hass.localize('panel.states') : 'Overview' }, ...dashboards];
  await Promise.all(all.map(async (d) => {
    // A dashboard generated by Home Assistant has no config, so no card of ours
    const config = await hass.callWS({ type: 'lovelace/config', url_path: d.url_path }).catch(() => null);
    if (!config || !Array.isArray(config.views)) return;
    config.views.forEach((v, i) => walk(v, {
      dashboard: d.title || d.url_path,
      view: v.title || String(i + 1),
      path: `/${d.url_path || 'lovelace'}/${v.path || i}`,
    }));
  }));
  return out;
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
// thermostat's setpoint while the override is a preset). The preset picked is highlighted (one at
// the same temperature is not); without one, the preset whose climate preset the thermostat is
// on. Returns { presets, temperature } HTML.
function overrideValueHtml(d, src, climate, attrs, loc) {
  const targets = src.targets(climate);
  const picked = d && d.preset && targets[d.preset] ? d.preset : null; // not a preset deleted since
  const presets = sortedPresets(src, loc).filter((l) => targets[l.id]).map((l) => {
    const [[kind, value]] = Object.entries(targets[l.id]);
    const on = !!d && (picked ? picked === l.id : d.kind === 'preset' && kind === 'preset' && d.value === value);
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

// What the schedule does now, until when, and what comes next: "Eco until 17:30, then Comfort"
// (`plan` computed by the integration, like the schedule sensor: the next different preset, maybe
// on another day); '' without one
function planText(plan, presetName, loc) {
  if (!plan || !plan.preset) return '';
  const current = presetName(plan.preset);
  const start = plan.next_start ? parseDate(plan.next_start) : null;
  if (!start) return loc.t('allWeek', { current });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = start.toDateString() === tomorrow.toDateString() ? loc.t('tomorrow') : loc.days[(start.getDay() + 6) % 7].toLowerCase();
  const values = { current, time: loc.time(minutesOf(start)), next: presetName(plan.next_preset) };
  return start.toDateString() === new Date().toDateString() ? loc.t('untilThen', values) : loc.t('untilDayThen', { ...values, day });
}

const OVERRIDE_TEMPERATURE = 'input[data-override-temperature]';

// Draws a card's content into its <ha-card>, kept from one redraw to the next: a new one (a Lit
// component, rendered asynchronously) has no height until it renders, so the page got shorter for
// a moment and scrolled back to the top
function fillCard(root, style, html, cls = '') {
  let card = root.querySelector('ha-card');
  if (!card) {
    root.innerHTML = `<style>${style}</style><ha-card></ha-card>`;
    card = root.querySelector('ha-card');
  }
  card.className = cls;
  card.innerHTML = html;
  return card;
}

// The field focused in a shadow root if it matches `selector`, else null
function focusedField(root, selector) {
  const el = root.activeElement;
  return el && el.matches && el.matches(selector) ? el : null;
}

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

// The override `d` set to a preset (what it means on this thermostat, and which preset it is),
// until the same end; a new override without `d`
function overrideWithPreset(d, src, climate, preset) {
  const target = src.targets(climate)[preset];
  if (!target) return null;
  const [[kind, value]] = Object.entries(target);
  return { ...(d || newOverride(src, kind, value)), kind, value, preset };
}

// The override `d` set to a temperature (no longer a preset), until the same end; a new override
// without `d`
function overrideWithTemperature(d, src, value) {
  if (!d) return newOverride(src, 'temperature', value);
  const { preset, ...rest } = d;
  return { ...rest, kind: 'temperature', value };
}
// What Home Assistant reads as true or false in a template's text (any other text is false)
const BOOLEAN_WORDS = ['true', 'false', 'on', 'off', 'yes', 'no', '1', '0', 'enable', 'disable'];
// Another preset for a new slot, unlike `id` and `next` (the preset after it): comfort ↔ eco when
// they exist, otherwise the next preset in the list; undefined when there is none
function otherPreset(presets, id, next) {
  const ids = presets.map((p) => p.id);
  const free = (c) => c !== id && c !== next;
  const pair = id === 'comfort' ? 'eco' : 'comfort';
  if (ids.includes(pair) && free(pair)) return pair;
  const i = ids.indexOf(id);
  return [...ids.slice(i + 1), ...ids.slice(0, i + 1)].find(free);
}

class ChauffageProgrammeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = {};
    this._revisions = {};
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
    // Identical days shown on one row (the user's choice on this device, else the card's option)
    this._groupPref = null;
    this._rows = null; // rows of days drawn last, each edited as a whole
    try {
      this._history.shown = localStorage.getItem(LS_HISTORY) === '1';
      const g = localStorage.getItem(LS_GROUP);
      if (g === '1' || g === '0') this._groupPref = g === '1';
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
    // A thermostat listed twice is shown once (its first entry)
    this._configured = config.thermostats.map((t) => (typeof t === 'string' ? { entity: t } : { ...t }))
      .filter((t, i, list) => list.findIndex((o) => o.entity === t.entity) === i);
    // Without the thermostats renamed in Home Assistant (see _setAside)
    this._thermostats = this._configured;
    this._asideKey = '';
    // The more-info block uses the same entities as the card
    for (const k of Object.keys(MORE_INFO_CFG)) MORE_INFO_CFG[k] = this._config[k];
    this._shown = this._initialShown();
    this._schedule = null;
    // The schedule shown first (the Chauffage panel's ?schedule=), else the active schedule
    this._wantSchedule = config.schedule || null;
    // The view shown (a page of the Chauffage panel), else the weeks
    this._view = config.view || 'schedule';
    // In the panel, a thermostat's sheet shows the history or not for all its weeks (`history`)
    if (config.panel && config.history != null) this._history.shown = !!config.history;
    if (this._hass) {
      this._setAside(this._source());
      this._render();
    }
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
    if (this._setAside(src)) need = true;
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
    // Active schedule changed (from the card, another dashboard or an automation), or the icon of a
    // schedule chosen in Home Assistant: redraw the active-schedule marker, the tabs and the
    // "activate" bar
    const scheduleStamp = src.stamps.schedule;
    if (scheduleStamp !== this._scheduleState && !this._drag && !this._overrideDrag) {
      this._scheduleState = scheduleStamp;
      need = true;
    }
    // A thermostat paused or resumed (switch, another card): redraw its notice and rows
    if (src.stamps.thermostats !== this._thermostatsStamp && !this._drag && !this._overrideDrag) {
      this._thermostatsStamp = src.stamps.thermostats;
      need = true;
    }
    // An entity the card opens renamed, or a thermostat given another device: redraw its links
    const links = `${src.stamps.entities} ${this._thermostats.map((t) => deviceOf(hass, t.entity)).join(' ')}`;
    if (links !== this._linksStamp && !this._drag && !this._overrideDrag) {
      this._linksStamp = links;
      need = true;
    }
    // Activation rules changed, or one became true or false: redraw the "Rules" view
    if (src.stamps.rules !== this._rulesStamp) {
      this._rulesStamp = src.stamps.rules;
      if (this._view === 'rules') need = true;
    }
    if (src.ready && this._wantSchedule && this._schedules().includes(this._wantSchedule)) {
      this._schedule = this._wantSchedule; // created from this card, or asked by its config
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

  // A thermostat renamed in Home Assistant: the configuration still holds its former id. Like
  // HA's own cards, the card does not change it by itself: it sets it aside with a notice, and
  // its editor offers the new id
  _setAside(src) {
    const aside = this._configured.filter((t) => renamedTo(this._hass, src, t.entity)).map((t) => t.entity);
    const key = aside.join(' ');
    if (key === this._asideKey) return false;
    // Set aside before, not any more: an entity has that id again, shown again
    const back = this._asideKey.split(' ').filter((e) => e && !aside.includes(e));
    this._asideKey = key;
    this._thermostats = this._configured.filter((t) => !aside.includes(t.entity));
    this._shown = this._thermostats.map((t) => t.entity)
      .filter((e) => (this._shown.includes(e) || back.includes(e)) && !aside.includes(e));
    if (!this._shown.length) this._shown = this._initialShown();
    return true;
  }

  // Thermostats shown at first: those chosen last on this device, else the config's `show`.
  // A preview (Add card dialog, card editor) shows what its config says.
  _initialShown() {
    const all = this._thermostats.map((t) => t.entity);
    if (!all.length) return []; // all renamed (see _setAside)
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

  _reloadPage() {
    window.location.reload();
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
    this._revisions = {};
    for (const [climate, bySchedule] of Object.entries(src.weeks())) {
      if (!bySchedule || typeof bySchedule !== 'object') continue;
      this._data[climate] = {};
      for (const [schedule, week] of Object.entries(bySchedule)) {
        if (!Array.isArray(week)) continue;
        this._data[climate][schedule] = [0, 1, 2, 3, 4, 5, 6].map((i) => parseDay(week[i]));
      }
      this._revisions[climate] = src.revisionOf(climate);
    }
    this._loadedWeeks = this._serialized();
  }

  // {climate: JSON of its weeks by schedule}, to send only the thermostats changed
  _serialized() {
    const out = {};
    for (const [climate, bySchedule] of Object.entries(this._data)) {
      out[climate] = JSON.stringify(Object.fromEntries(Object.keys(bySchedule).sort()
        .map((schedule) => [schedule, bySchedule[schedule].map(serializeDay)])));
    }
    return out;
  }

  _week(climate, schedule = this._schedule) {
    if (!this._data[climate]) this._data[climate] = {};
    if (!this._data[climate][schedule]) {
      this._data[climate][schedule] = [0, 1, 2, 3, 4, 5, 6].map(() => [{ start: 0, preset: 'eco' }]);
    }
    return this._data[climate][schedule];
  }

  // Identical days on one row (the user's choice on this device, else the card's option); not
  // with the history, which differs from day to day
  _grouped() {
    if (this._history.shown) return false;
    if (this._config.panel && this._config.group_days != null) return this._config.group_days;
    return this._groupPref ?? this._config.group_days !== false;
  }

  // Rows of days, in display order: one per day, or the days identical for every thermostat
  // shown on one row. What points at a day (selected slot, open menu, copied day) follows the
  // first day of its row, which draws it.
  _layoutRows() {
    const order = this._loc.dayOrder;
    this._rows = this._grouped()
      ? rowsOfDays(order, (d) => this._shown.map((c) => serializeDay(this._week(c)[d]).join(',')).join('|'))
      : order.map((d) => [d]);
    for (const ref of [this._sel, this._menu, this._clipSrc]) if (ref) ref.day = this._rowOf(ref.day)[0];
  }

  // The days of the row a day is drawn in (the day alone before the first drawing)
  _rowOf(day) {
    return (this._rows && this._rows.find((r) => r.includes(day))) || [day];
  }

  _rowLabel(day, style) {
    return this._loc.daysLabel(this._rowOf(day), style);
  }

  // An edit of a row's day goes to every day of the row
  _spread(climate, day) {
    const week = this._week(climate);
    for (const d of this._rowOf(day)) if (d !== day) week[d] = clone(week[day]);
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
    this._spread(climate, day);
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
    return overrideLabel(d, this._loc, this._presets());
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

  // A time typed in the popover's end field, for that thermostat: its next occurrence
  _sendOverrideEnd(climate, value) {
    this._endTyped = null;
    this._setOverrideEnd(climate, nextAtMinutes(this._snap(toMin(value))));
  }

  // The end field left (or Enter): the time typed is sent (for the thermostat it was typed for,
  // even if a tap outside the card closed the popover meanwhile), then the redraws held back are
  // done (the popover closed, an override ended elsewhere…)
  _overrideEndDone() {
    const typed = this._endTyped;
    const later = this._redrawLater;
    this._redrawLater = false;
    this._endTyped = null; // before blur(), which comes back here
    if (typed) {
      // Sent from the field still focused (Enter): the redraw that follows must happen
      const active = this.shadowRoot.activeElement;
      if (active && active.blur) active.blur();
      this._sendOverrideEnd(typed.climate, typed.value);
    }
    if (later) this._render();
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
    const src = this._source();
    const now = this._serialized();
    // Only the thermostats changed, each against its revision (another card may edit the others)
    const loaded = this._loadedWeeks || {};
    const changed = Object.keys(now).filter((c) => !src.perThermostat || now[c] !== loaded[c]);
    const out = Object.fromEntries(changed.map((c) => [c, JSON.parse(now[c])]));
    const revisions = src.perThermostat ? Object.fromEntries(changed.map((c) => [c, this._revisions[c] ?? null])) : null;
    try {
      // Edits undone: nothing to send (a save would realign every thermostat)
      const result = changed.length ? await src.saveWeeks(out, this._revision, revisions) : null;
      if (result && result.revision != null) this._revision = result.revision;
      if (result && result.revisions) Object.assign(this._revisions, result.revisions);
      this._loadedWeeks = now;
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

  // A chip only names its thermostat, with a mark when it is missing, off, paused or on a
  // temporary setpoint: short, so that the chips do not move
  _chipMark(climate) {
    const st = this._hass.states[climate];
    if (!st) return '?';
    if (this._source().paused(climate)) return this._loc.t('paused');
    if (this._overrides()[climate]) return '⏱';
    return st.state === 'off' ? this._loc.t('off') : '';
  }

  _updateLive() {
    const root = this.shadowRoot;
    root.querySelectorAll('.chip[data-climate] .live').forEach((el) => {
      el.textContent = this._chipMark(el.parentElement.dataset.climate);
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

  _barHtml(climate, segs, days, showNow) {
    const d = days[0];
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
    const paused = this._source().paused(climate);
    const now = showNow && !paused ? `<div class="now" style="left:${pct(nowMin())}%"></div>` : '';
    const cs = this._clipSrc;
    const isSrc = cs && cs.climate === climate && cs.schedule === this._schedule && cs.day === d;
    const history = this._historyHtml(climate, d);
    const zoom = this._isZoomed(climate, d) ? ' zoom' : '';
    return `<div class="bar${isSrc ? ' clipsrc' : ''}${zoom}${paused ? ' paused' : ''}" data-climate="${esc(climate)}" data-day="${d}">${segHtml}${handles}${history}${this._overrideHtml(climate, days)}${now}</div>`;
  }

  // Override drawn over the schedule (only in the active schedule's tab), on a row of days
  _overrideHtml(climate, days) {
    if (this._schedule !== this._activeSchedule()) return '';
    const d = this._overrides()[climate];
    const piece = rowPiece(this._overridePieces(climate), days);
    if (!d || !piece) return '';
    const endHM = this._loc.time(minutesOf(parseDate(d.end)));
    const label = `${this._overrideLabel(d)} → ${endHM}`;
    const sel = this._overrideSel && this._overrideSel.climate === climate && this._overrideSel.day === piece.day;
    return `<div class="override${sel ? ' sel' : ''}${piece.isLast ? ' last' : ''}" data-climate="${esc(climate)}" data-day="${piece.day}"
        style="left:${pct(piece.start)}%;width:${pct(piece.end - piece.start)}%" title="${esc(this._loc.t('temporarySetpointTitle', { label }))}">
      <span class="override-label">${piece.end - piece.start >= (this._shown.length > 1 ? 180 : 120) ? `⏱ ${esc(label)}` : '⏱'}</span>
      ${piece.isLast ? `<div class="override-handle" title="${esc(this._loc.t('dragToChangeEnd'))}"><span class="tip">${endHM}</span></div>` : ''}
    </div>`;
  }

  // A row of days (in display order), drawn and edited through its first day
  _dayHtml(days, showNow) {
    const d = days[0];
    const multi = this._shown.length > 1;
    const subs = this._shown
      .map((climate) => {
        const segs = this._week(climate)[d];
        const m = this._menu;
        const open = m && m.climate === climate && m.day === d;
        return `<div class="sub">
          ${multi ? `<div class="name" title="${esc(this._loc.t('open', { name: this._name(climate) }))}">${this._moreInfoLink(climate)}${this._nameSizer()}</div>` : ''}
          ${this._barHtml(climate, segs, days, showNow)}
          <button class="ibtn${open ? ' open' : ''}" data-act="menu" data-climate="${esc(climate)}" data-day="${d}" title="${esc(this._loc.t('copyPaste'))}">${ICON_MORE}</button>
        </div>`;
      })
      .join('');
    // Today stands out, except in a week of an inactive schedule stacked under the active one's
    // (a thermostat's sheet, `today: 'active'`): the active week marks it already
    const today = days.includes(todayIdx()) && (this._config.today !== 'active' || this._schedule === this._activeSchedule());
    return `<div class="dgroup${today ? ' today' : ''}">
      <div class="day" data-day="${d}">${esc(this._loc.daysLabel(days))}</div>
      <div class="subs">${subs}</div>
    </div>`;
  }

  // A notice per thermostat of the configuration renamed in Home Assistant
  _renamedNotesHtml() {
    const src = this._source();
    return this._configured.map((t) => [t.entity, renamedTo(this._hass, src, t.entity)]).filter(([, to]) => to)
      .map(([former, entity]) => `<div class="paused-note renamed-note"><span>${esc(this._loc.t('renamedNote', { former, entity }))}</span></div>`)
      .join('');
  }

  // A notice per paused thermostat shown, with a button to resume it (admins)
  _pausedNotesHtml() {
    const src = this._source();
    return this._shown.filter((climate) => src.paused(climate)).map((climate) => `<div class="paused-note">
        <span>${withHtml(this._loc.t('pausedNote', { name: LINK_TOKEN }), this._moreInfoLink(climate))}</span>
        ${src.editable ? `<button class="btn" data-act="resume" data-climate="${esc(climate)}">${esc(this._loc.t('resumeShort'))}</button>` : ''}
      </div>`).join('');
  }

  // Renders, then runs a change of the integration; its error, if any, is shown
  async _call(change) {
    this._render();
    try {
      await change(this._source());
    } catch (e) {
      this._msg = this._loc.t('error', { message: e.message || e.code || e });
      this._render();
    }
  }

  _setPaused(climate, paused) {
    return this._call((src) => src.setPaused(climate, paused));
  }

  _menuHtml() {
    const m = this._menu;
    if (!m) return '';
    const ref = `data-climate="${esc(m.climate)}" data-day="${m.day}"`;
    const item = (act, label, icon = '', disabled = false) =>
      `<button class="mi" data-act="${act}" ${ref} ${disabled ? 'disabled' : ''}>${icon}<span>${label}</span></button>`;
    const t = this._loc.t;
    const paste = this._clip ? `${esc(t('paste'))} <small>${esc(this._clip.label)}</small>` : esc(t('paste'));
    // What can be done with this day, and a temporary setpoint on today; pausing is in the
    // "Thermostats" view. The thermostat's name opens it.
    const paused = this._source().paused(m.climate);
    return `<div class="menu" style="top:${m.top}px;right:${m.right}px">
      <div class="mh">${this._moreInfoLink(m.climate)} · ${esc(this._rowLabel(m.day, 'long'))}</div>
      ${item('copy-day', esc(t('copyDay')), ICON_COPY)}
      ${item('paste-day', paste, ICON_PASTE, !this._clip)}
      <div class="sep"></div>
      ${item('fill-weekdays', esc(t('copyToWeekdays')))}
      ${item('fill-weekend', esc(t('copyToWeekend')))}
      ${item('fill-all', esc(t('copyToAll')))}
      ${this._shown.length > 1 ? item('fill-others', esc(t('copyToOthers'))) : ''}
      ${this._historyOf(m.climate, m.day) ? `<div class="sep"></div>${item('zoom', esc(t(this._isZoomed(m.climate, m.day) ? 'showSmaller' : 'showLarger')), ICON_ZOOM)}` : ''}
      ${this._rowOf(m.day).includes(todayIdx()) && !paused ? `<div class="sep"></div>${item('override-new', esc(t('newOverride')))}` : ''}
    </div>`;
  }

  // `top`: under the button or the pointer; `above` (optional): where the menu ends when it opens
  // upwards, because there is no room for it below in the window
  _openMenu(climate, day, top, right, above) {
    const m = this._menu;
    this._menu = m && m.climate === climate && m.day === day ? null : { climate, day, top, right };
    this._render();
    const menu = this._menu;
    if (!menu || above == null) return;
    // Measured once ha-card (a Lit component, rendered asynchronously) shows its content
    const place = () => {
      const el = this._menu === menu && this.shadowRoot.querySelector('.menu');
      if (!el || !el.offsetHeight) return false;
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const h = el.offsetHeight;
      if (card.top + top + h > window.innerHeight && card.top + above - h >= 0) {
        menu.top = above - h;
        el.style.top = `${menu.top}px`;
      }
      return true;
    };
    if (place()) return;
    const card = this.shadowRoot.querySelector('ha-card');
    const ready = card && card.updateComplete instanceof Promise ? card.updateComplete : Promise.resolve();
    ready.then(() => requestAnimationFrame(place));
  }

  _editorHtml() {
    const t = this._loc.t;
    // In the words of a mouse, or of a finger on a touch screen (CSS)
    // A thermostat's sheet stacks one card per schedule: it shows the hint once (`hint: false`)
    const hint = this._config.hint === false ? ''
      : `<div class="hint"><span class="mouse">${esc(t('hint'))}</span><span class="touch">${esc(t('hintTouch'))}</span></div>`;
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
        <strong>${this._moreInfoLink(climate)} · ${esc(this._rowLabel(day, 'long'))}</strong>
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
    const now = sel && sel.create && root.querySelector(`.bar[data-climate="${sel.climate}"][data-day="${this._rowOf(todayIdx())[0]}"] .now`);
    const seg = root.querySelector('.override.sel, .seg.sel, .cell.on, .pv-add.on') || now;
    if (!ed || !seg) return true;
    const card = root.querySelector('ha-card').getBoundingClientRect();
    // A slot is clipped to its row (the popover goes under the row); a cell to the table, which
    // may scroll sideways (the popover goes under the cell); the button adding a preset: under it
    const isCell = seg.classList.contains('cell') || seg.classList.contains('pv-add');
    const bar = (isCell ? seg.closest('.table-wrap') || seg.parentElement : seg.parentElement).getBoundingClientRect();
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
    // Not while the end of an override is typed: the redraw would take its field away
    if (focusedField(this.shadowRoot, '[data-override-end]')) { this._redrawLater = true; return; }
    const input = this.shadowRoot.querySelector('.sched-menu input[data-sched-name]');
    const typing = input && { value: input.value, focused: this.shadowRoot.activeElement === input };
    const area = focusedField(this.shadowRoot, '[data-rule-template]');
    const rule = area && { idx: area.dataset.ruleTemplate, start: area.selectionStart, end: area.selectionEnd };
    const field = focusedField(this.shadowRoot, OVERRIDE_TEMPERATURE);
    const temperature = field ? field.value : null;
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
    const fill = (html, cls) => fillCard(this.shadowRoot, STYLE, html, `${cls || ''}${this._config.flat ? ' flat' : ''}`);
    if (this._source().stale) {
      fill(`<div class="missing">${esc(tr('reloadNeeded'))}
        <div><button class="btn primary" data-act="reload-page">${esc(tr('reloadPage'))}</button></div></div>`);
      this.shadowRoot.querySelector('[data-act="reload-page"]').addEventListener('click', () => this._reloadPage());
      return;
    }
    if (!this._source().available || this._source().outdated) {
      const text = this._source().outdated ? tr('restartNeeded') : tr('integrationMissing');
      fill(`<div class="missing">${esc(text)}</div>`);
      return;
    }
    if (this._view === 'presets' && this._source().ready) {
      fill(`${this._viewsHtml()}${this._presetsViewHtml()}<div class="msg">${esc(this._msg)}</div>`);
      this._schedulePlaceEditor();
      return;
    }
    if (this._view === 'thermostats' && this._source().ready) {
      fill(`${this._viewsHtml()}${this._thermostatsViewHtml()}<div class="msg">${esc(this._msg)}</div>`);
      return;
    }
    if (this._view === 'rules' && this._source().ready) {
      const msg = this._msg || (this._rulesDraft ? tr('unsaved') : '');
      fill(`${this._viewsHtml()}${this._rulesViewHtml()}<div class="msg">${esc(msg)}</div>`);
      return;
    }
    if (!this._source().ready) {
      fill('<div class="loading">…</div>');
      return;
    }
    if (!this._thermostats.length) {
      fill(this._renamedNotesHtml());
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
        const paused = src.paused(t.entity) ? ' paused' : '';
        return `<button class="chip${on ? ' on' : ''}${paused}" data-climate="${esc(t.entity)}">${esc(this._name(t.entity))} <span class="live">${esc(this._chipMark(t.entity))}</span><span class="chip-open" data-more-info="${esc(t.entity)}" title="${esc(tr('openThermostat'))}">${ICON_OPEN}</span></button>`;
      })
      .join('');
    const editable = src.editable;
    // On a schedule's sheet (schedule_tabs: 'one'): its tab alone, with its menu, and no new schedule
    const one = this._config.schedule_tabs === 'one';
    const tabs = (one ? schedules.filter((m) => m === this._schedule) : schedules)
      .map((m) => { const icon = src.scheduleIcon(m); return `<button class="tab${m === this._schedule ? ' on' : ''}${icon ? ' with-icon' : ''}" data-schedule="${esc(m)}">${m === active ? `<span class="dot" title="${esc(tr('activeSchedule'))}"></span>` : ''}${icon ? `<ha-icon class="tab-icon" icon="${esc(icon)}"></ha-icon>` : ''}${esc(this._scheduleName(m))}</button>${
        editable && m === this._schedule ? `<button class="tab-tool" data-act="schedule-menu" title="${esc(tr('scheduleMenu'))}">⋮</button>` : ''}`; })
      .join('') + (editable && !one ? `<button class="tab-tool" data-act="schedule-new" title="${esc(tr('newSchedule'))}">+</button>` : '');
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<span${h % 6 ? ' class="minor"' : ''} style="left:${(h / 24) * 100}%">${this._loc.tick(h)}</span>`).join('');
    // Days in the order of the user's first weekday (data stays Monday-based)
    this._layoutRows();
    const days = this._rows.map((r) => this._dayHtml(r, r.includes(today) && this._schedule === active)).join('');
    // The column of the days fits the longest label (on two lines at most)
    const dayWidth = Math.min(72, Math.max(36, ...this._rows.map((r) => this._loc.daysLabel(r).length * 8 + 4)));

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

    fill(`
        ${this._viewsHtml()}
        ${this._config.chips === false ? '' : `<div class="chips">
          ${chips}
          <span class="chip-sep"></span>
          <button class="chip tool${this._multiSel ? ' on' : ''}" data-act="multi-sel" title="${esc(tr('multipleTitle'))}">${esc(tr('multiple'))}</button>
          <button class="chip tool${allShown ? ' on' : ''}" data-act="show-all" title="${esc(tr('allTitle'))}">${esc(tr('all'))}</button>
          <button class="chip tool${this._grouped() ? ' on' : ''}" data-act="group-days" title="${esc(tr('groupDaysTitle'))}">${esc(tr('groupDays'))}</button>
          <button class="chip tool${this._history.shown ? ' on' : ''}${this._history.loading ? ' loading' : ''}" data-act="history" title="${esc(tr('historyTitle'))}">${esc(tr('history'))}</button>
        </div>`}
        ${this._renamedNotesHtml()}
        ${this._config.paused_note === false ? '' : this._pausedNotesHtml()}
        ${this._config.schedule_tabs === false ? '' : `<div class="tabs">${tabs}</div>
        ${this._schedMenuHtml()}
        ${this._scheduleBarHtml(active)}`}
        <div class="days" style="--day-w:${dayWidth}px">
          <div class="scale"><div></div>${multi ? `<div class="name">${this._nameSizer()}</div>` : ''}<div class="ticks">${ticks}</div><div></div></div>
          ${days}
        </div>
        ${this._menuHtml()}
        ${this._editorHtml()}
        <div class="foot"${this._config.legend === false && this._config.copy_week === false ? ' style="display:none"' : ''}>
          <div class="legend">${this._config.legend === false ? '' : legend}</div>
          <div class="actions"${this._config.copy_week === false ? ' style="display:none"' : ''}>
            <select class="copyweek" title="${esc(tr('copyWeekTo', { name: this._name(focus) }))}">
              <option value="">${esc(tr('copyWeekTo', { name: this._name(focus) }))}</option>${copyWeek}
            </select>
          </div>
        </div>
        <div class="msg">${esc(this._msg)}</div>
        ${this._dirty ? `<div class="savebar">
          <span class="dirty">${esc(tr('unsaved'))}</span>
          <button class="btn" data-act="cancel">${esc(tr('cancel'))}</button>
          <button class="btn primary" data-act="save">${esc(tr('save'))}</button>
        </div>` : ''}`,
      `${multi ? 'multi' : 'single'} h${Math.min(this._shown.length, 3)}${this._loc.hour12 ? ' h12' : ''}`);
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
        if (dd.moved) this._setOverrideEnd(dd.climate, atMinutes(dd.piece.d0, dd.end, new Date()));
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
      this._openMenu(bar.dataset.climate, Number(bar.dataset.day), e.clientY - card.top + 4, Math.max(8, card.right - e.clientX - 8), e.clientY - card.top - 4);
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
      // Link to an entity's more-info dialog (thermostat, schedule's switch, select…)
      const mi = e.target.closest('[data-more-info]');
      if (mi) {
        e.stopPropagation();
        this._sel = null;
        this._overrideSel = null;
        this._menu = null;
        this._schedEd = null;
        this._render();
        this._openMoreInfo(mi.dataset.moreInfo);
        return;
      }
      const device = e.target.closest('[data-device]');
      if (device) {
        this._sel = null;
        this._overrideSel = null;
        this._cell = null;
        openDevice(device.dataset.device);
        return;
      }
      // A page of the Chauffage panel (presets, rules, thermostats)
      const page = e.target.closest('[data-panel-page]');
      if (page) {
        openPanel(page.dataset.panelPage);
        return;
      }
      // A dashboard's view that shows a thermostat (the panel's Thermostats page)
      const to = e.target.closest('[data-navigate]');
      if (to) {
        navigate(to.dataset.navigate);
        return;
      }
      // A thermostat's page in the panel (its name, on the Thermostats page)
      const weeks = e.target.closest('[data-weeks]');
      if (weeks) {
        openWeeks(weeks.dataset.weeks);
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
      if (e.key === 'Enter' && e.target.hasAttribute('data-override-end')) { this._overrideEndDone(); return; }
      if (e.key !== 'Enter' || !e.target.hasAttribute('data-sched-name')) return;
      const ok = root.querySelector('.sched-menu .btn.primary');
      if (ok) ok.click();
    });

    // The end of an override being typed: sent on leaving its field (the card, not redrawn while it
    // is typed, is drawn again then)
    root.addEventListener('focusout', (e) => {
      if (e.target.hasAttribute && e.target.hasAttribute('data-override-end')) this._overrideEndDone();
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
        // Typed (the field changes at each digit): sent on leaving the field or with Enter
        if (root.activeElement === el) this._endTyped = { climate: this._overrideSel.climate, value: el.value };
        else this._sendOverrideEnd(this._overrideSel.climate, el.value);
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
    // The active schedule's name opens the select that shows (and changes) it
    const select = this._source().scheduleSelect();
    const name = select ? entityLinkHtml(select, this._scheduleName(active)) : esc(this._scheduleName(active));
    const current = active ? t('activeScheduleBar', { schedule: name }) : esc(t('noActiveSchedule'));
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
        // Its switch in Home Assistant (its more-info dialog): history, icon, settings
        const entity = this._source().scheduleEntity(id);
        const open = entity ? `<button class="mi" data-more-info="${esc(entity)}"><span>${esc(t('scheduleDetails'))}</span></button><div class="sep"></div>` : '';
        body = `${open}${item('schedule-rename-open', esc(t('renameMenu')))}
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

  // Temperature a preset gives a thermostat: its own for a temperature; for a preset, the one the
  // integration computes (published by Versatile Thermostat, else learned), the same it compares
  // a manual setpoint with
  _presetTemperature(climate, target) {
    if ('temperature' in target) return target.temperature;
    const temperature = this._source().presetTemperature(climate, target.preset);
    return typeof temperature === 'number' ? temperature : null;
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

  // On a dashboard, the card shows the weeks; the presets, the rules and the thermostats are set
  // in the Chauffage panel (admins only, as the panel). In the panel, a page shows one view
  // (`view`), and the panel's own tabs switch pages.
  _viewsHtml() {
    if (this._config.view || this._config.panel) return '';
    const hass = this._hass;
    if (hass && hass.user && !hass.user.is_admin) return '';
    const t = this._loc.t;
    const link = (page, label) => `<span class="mi-link" role="link" tabindex="0" data-panel-page="${page}">${esc(t(label))}</span>`;
    return `<div class="config-links">${link('presets', 'viewPresets')}${link('rules', 'viewRules')}${link('thermostats', 'viewThermostats')}</div>`;
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

  // The panel's Thermostats page: every scheduled thermostat, by name. A row says what matters
  // first: the thermostat (it opens its page), whether Chauffage controls it, the cards that show
  // it. Pause is at hand; the rarer actions (open it, its devices, forget it) wait behind ⋮.
  _thermostatsViewHtml() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const scheduled = [...src.scheduled()].sort((a, b) => this._name(a).localeCompare(this._name(b)));
    // The cards that show each thermostat, read from the dashboards once
    if (this._placements === undefined) {
      this._placements = null;
      cardPlacements(this._hass).then((p) => { this._placements = p; this._render(); }, () => { this._placements = {}; });
    }
    const placesHtml = (climate) => {
      if (!this._placements) return '';
      const places = this._placements[climate] || [];
      if (!places.length) return `<div class="th-cards">${esc(t('inNoCard'))}</div>`;
      const links = places.map((p) => `<span class="mi-link" role="link" tabindex="0" data-navigate="${esc(p.path)}">${esc(`${p.dashboard} › ${p.view}`)}</span>`);
      return `<div class="th-cards">${esc(t('inCards'))} ${links.join(', ')}</div>`;
    };
    const rows = scheduled.map((climate) => {
      const paused = src.paused(climate);
      const open = this._thMore === climate;
      const asking = this._forgetAsk === climate;
      const btn = (act, label, cls = '') => `<button class="btn${cls}" data-act="${act}" data-climate="${esc(climate)}">${esc(t(label))}</button>`;
      const actions = !editable ? '' : `${paused ? btn('resume', 'resumeShort', ' primary') : btn('pause', 'pauseShort')}
        <button class="btn icon${open ? ' on' : ''}" data-act="thermostat-more" data-climate="${esc(climate)}" title="${esc(t('moreActions'))}" aria-label="${esc(t('moreActions'))}">⋮</button>`;
      const more = !open ? '' : asking
        ? `<div class="th-more"><span class="th-ask">${esc(t('forgetText', { name: this._name(climate) }))}</span>
            ${btn('thermostat-forget-cancel', 'cancel')}${btn('thermostat-forget-confirm', 'forgetConfirm', ' danger')}</div>`
        : `<div class="th-more">${[
          `<span class="mi-link" role="link" tabindex="0" data-more-info="${esc(climate)}">${esc(t('openThermostat'))}</span>`,
          ...thermostatDevices(this._hass, src, climate).map((id) => deviceNamedLinkHtml(this._hass, id)),
        ].filter(Boolean).join('')}${btn('thermostat-forget', 'forget', ' danger')}</div>`;
      return `<div class="th-row${paused ? ' paused' : ''}" data-climate="${esc(climate)}">
        <div class="th-name">
          <span class="th-title" role="link" tabindex="0" data-weeks="${esc(climate)}">${esc(this._name(climate))}</span>
          <span class="th-badge${paused ? ' paused' : ''}">${esc(t(paused ? 'paused' : 'controlled'))}</span>
          ${placesHtml(climate)}
        </div>
        <div class="th-btns">${actions}</div>
        ${more}
      </div>`;
    }).join('');
    // Schedule another thermostat: one of the climates Chauffage does not schedule yet
    const climates = Object.keys(this._hass.states).filter((e) => e.startsWith('climate.') && !scheduled.includes(e))
      .sort((a, b) => this._name(a).localeCompare(this._name(b)));
    const add = editable && climates.length ? `<div class="th-add"><div class="th-add-title">${esc(t('addThermostat'))}</div>
        <div class="th-add-row"><select data-add-climate>${climates.map((c) => `<option value="${esc(c)}">${esc(this._name(c))}</option>`).join('')}</select>
        <button class="btn primary" data-act="thermostat-add">${esc(t('scheduleThermostat'))}</button></div></div>` : '';
    const device = this._deviceLink(src.deviceId(), t('chauffageDevice'));
    return `<div class="thermostats-view"><div class="th-hint">${esc(t('thermostatsHint'))}</div>${rows}${add}
      ${device ? `<div class="th-foot">${device}</div>` : ''}</div>`;
  }

  _forget(climate) {
    this._forgetAsk = null;
    return this._call((src) => src.forget(climate));
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
    // A preset's header holds all of it: its color, name and default temperature
    // On a thermostat's sheet, the presets themselves are not set (they are every thermostat's)
    const definitions = this._config.preset_definitions !== false;
    const headInner = (l) => `<span class="pv-pname"><i style="background:${l.color}"></i>${esc(l.name)}</span>
       <span class="pv-default">${esc(t('defaultTemperature', { value: this._loc.number(l.temperature ?? 19) }))}</span>`;
    const head = presets.map((l) => `<th>${definitions ? cell('preset', l.id, null, headInner(l), 'head')
      : `<span class="cell head">${headInner(l)}</span>`}</th>`).join('');
    let unknown = false;
    // What a preset does on a thermostat: its value, then what it is (the thermostat's own preset,
    // set here, or the default)
    const what = (entity, l) => {
      const explicit = src.mapping(entity);
      const target = this._targetOf(entity, l);
      const temp = this._presetTemperature(entity, target);
      let how;
      let cls;
      if ('preset' in target) {
        how = t('cellOwnPreset', { preset: this._loc.preset(target.preset) });
        cls = 'preset';
        if (l.id in explicit) how += ` · ${t('cellSetHere')}`;
      } else if (l.id in explicit) {
        how = t('cellSetHere');
        cls = 'custom';
      } else {
        how = t('cellDefault');
        cls = 'default';
      }
      if (temp == null) unknown = true;
      return { value: temp != null ? `${this._loc.number(temp)}°` : '?', how, cls };
    };
    let body;
    if (definitions) {
      const rows = this._thermostats.map(({ entity }) => {
        const cells = presets.map((l) => {
          const w = what(entity, l);
          return `<td>${cell('thermostat', l.id, entity, `<span class="pv-val">${w.value}</span> <span class="pv-how">${esc(w.how)}</span>`, w.cls)}</td>`;
        }).join('');
        return `<tr><th class="name">${this._moreInfoLink(entity)}</th>${cells}</tr>`;
      }).join('');
      body = `<div class="table-wrap"><table class="pv-table">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    } else {
      // One thermostat (its sheet in the panel): a list, one item per preset, not a table of one
      // row; an item opens the same editor as a cell of the table
      const entity = this._thermostats[0].entity;
      const items = presets.map((l) => {
        const w = what(entity, l);
        return cell('thermostat', l.id, entity, `<span class="pv-pname"><i style="background:${l.color}"></i>${esc(l.name)}</span>
          <span class="pv-val">${w.value}</span> <span class="pv-how">${esc(w.how)}</span>`, `pv-item ${w.cls}`);
      }).join('');
      body = `<div class="pv-list">${items}</div>`;
    }
    return `<div class="presets-view">
      ${definitions ? `<div class="pv-intro muted">${esc(t('presetsIntro'))}</div>` : ''}
      ${body}
      ${unknown ? `<div class="pv-note muted">${esc(t('presetsUnknown'))}</div>` : ''}
      ${editable && definitions ? `<button class="btn pv-add${sel && sel.kind === 'new' ? ' on' : ''}" data-act="cell" data-kind="new" data-preset="">${esc(t('addPresetButton'))}</button>` : ''}
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
      // Its own presets are set on its device (their temperatures, on a Versatile Thermostat)
      const device = own.length ? this._deviceLink(this._deviceOf(sel.climate), t('ownPresetsOnDevice')) : '';
      body = `<div class="pv-choices">${
        (autoPreset ? '' : choiceRow('auto', t('presetAuto', { value: `${this._loc.number(preset.temperature ?? 19)} °C` })))
        + (own.length ? choiceRow('preset', t('ownPreset'), `<select data-cell-preset>${options}</select>`) : '')
        + choiceRow('temperature', t('presetTemperature'), tempInput(temp))}</div>
        ${device ? `<div class="pv-device">${device}</div>` : ''}`;
    } else {
      const isNew = sel.kind === 'new';
      title = isNew ? t('newPreset') : preset.name;
      if (!isNew && sel.deleting) {
        // Deleting: what replaces it where it is used (schedules, overrides)
        const used = src.usedPresets().includes(preset.id);
        const others = presets.filter((l) => l.id !== preset.id);
        body = `<div class="pv-delete">${esc(t('confirmDeletePreset', { name: preset.name }))}
          ${used ? `<label class="pv-replace">${esc(t('replaceWith'))} <select data-cell-replacement>${others.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label>` : ''}</div>`;
        return this._cellPopover(preset, title, body, `<button class="btn" data-act="cell-delete-cancel">${esc(t('cancel'))}</button>
          <button class="btn danger" data-act="cell-delete-confirm">${esc(t('deletePreset'))}</button>`);
      }
      body = `<div class="pv-fields">
          <span>${esc(t('presetName'))}</span>
          <span class="pv-name"><input type="color" data-cell-color value="${esc(isNew ? '#9e9e9e' : preset.color)}" title="${esc(t('presetColor'))}">
            <input type="text" data-cell-name value="${esc(isNew ? '' : preset.name)}" placeholder="${esc(t('presetName'))}"></span>
          <span>${esc(t('presetDefaultTemperature'))}</span>${tempInput(isNew ? 19 : preset.temperature ?? 19)}
        </div>
        <div class="muted">${esc(t('defaultHelp'))}</div>`;
      if (!isNew && presets.length > 1) {
        return this._cellPopover(preset, title, body, `<button class="btn danger pv-del" data-act="cell-delete">${esc(t('deleteMenu'))}</button>
          <button class="btn primary" data-act="cell-apply">${esc(t('apply'))}</button>`);
      }
    }
    return this._cellPopover(sel.kind === 'new' ? null : preset, title, body,
      `<button class="btn primary" data-act="cell-apply">${esc(t('apply'))}</button>`, sel.kind === 'thermostat' ? sel.climate : null);
  }

  // Popover of a cell, placed under it by _placeEditor() after rendering; a thermostat's title
  // opens it
  _cellPopover(preset, title, body, buttons, climate = null) {
    const t = this._loc.t;
    const dot = preset ? `<i class="pv-dot" style="background:${preset.color}"></i>` : '';
    const heading = climate ? `${esc(preset.name)} · ${this._moreInfoLink(climate)}` : esc(title);
    return `<div class="editor cell-ed" data-panel="cell">
      <div class="ed-head"><strong>${dot}${heading}</strong>
        <button class="btn icon close" data-act="cell-close" title="${esc(t('close'))}">✕</button></div>
      ${body}
      <div class="ed-actions pv-foot">${buttons}</div>
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
    if (act === 'cell-delete' || act === 'cell-delete-cancel') {
      sel.deleting = act === 'cell-delete';
      return this._render();
    }
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
      } else if (sel.kind === 'new') {
        await src.setPresets([...presets, { name: value('[data-cell-name]').trim(), color: value('[data-cell-color]'), temperature: Number(input.value) }], {});
      } else if (act === 'cell-delete-confirm') {
        const replacement = value('[data-cell-replacement]');
        await src.setPresets(presets.filter((l) => l.id !== sel.preset), replacement ? { [sel.preset]: replacement } : {});
      } else {
        await src.setPresets(presets.map((l) => (l.id === sel.preset
          ? { ...l, name: value('[data-cell-name]').trim(), color: value('[data-cell-color]'), temperature: Number(input.value) } : l)), {});
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
    openMoreInfo(this, entityId);
  }

  _moreInfoLink(climate) {
    return entityLinkHtml(climate, this._name(climate), this._loc.t('openThermostat'));
  }

  _deviceLink(id, label = this._loc.t('device')) {
    return deviceLinkHtml(this._hass, id, label);
  }

  _deviceOf(entity) {
    return deviceOf(this._hass, entity);
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
    const next = segs[idx + 1]?.preset;
    const preset = otherPreset(this._presets(), s.preset, next);
    if (preset) segs.splice(idx + 1, 0, { start: m, preset });
    else {
      // Only the next slot's preset is left: like "Insert a slot", go back to this slot's preset
      // halfway, so that the new slot does not merge with the next one
      const back = this._snap((m + end) / 2);
      if (!next || back - m < step || end - back < step) return;
      segs.splice(idx + 1, 0, { start: m, preset: next }, { start: back, preset: s.preset });
    }
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
      this._shown.filter((c) => c !== climate).forEach((c) => { this._week(c)[day] = clone(src); this._spread(c, day); });
    } else {
      const targets = { weekdays: [0, 1, 2, 3, 4], weekend: [5, 6], all: [0, 1, 2, 3, 4, 5, 6] }[target];
      if (!targets) return;
      const week = this._week(climate);
      targets.filter((t) => t !== day).forEach((t) => { week[t] = clone(src); });
    }
    const destination = this._loc.destination(target);
    this._focus = climate;
    this._dirty = true;
    this._msg = this._loc.t('dayCopiedTo', { name: this._name(climate), day: this._rowLabel(day, 'long'), destination });
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

  // A week copied from another card (a thermostat's sheet in the panel): this card's schedule
  // gets it, unsaved, and this card's save bar asks to save it
  _receiveWeek(climate, week, sourceName) {
    if (!this._data[climate]) this._data[climate] = {};
    this._data[climate][this._schedule] = clone(week);
    this._dirty = true;
    this._msg = this._loc.t('weekCopiedFrom', { schedule: sourceName });
    this._render();
  }

  // The day copied, shared by every card of the page and kept across reloads (this browser): read
  // when used, so that a card drawn before the copy, such as another week of a thermostat's sheet
  // in the panel, can paste it. Without the browser's storage, this card's own copy.
  get _clip() {
    try {
      const c = JSON.parse(localStorage.getItem(LS_CLIP));
      if (c && Array.isArray(c.segs) && c.segs.length) return c;
    } catch (e) { /* ignore */ }
    return this._ownClip || null;
  }

  set _clip(clip) {
    this._ownClip = clip;
  }

  _copyToClipboard(climate, day) {
    const segs = clone(this._week(climate)[day]);
    const label = `${this._name(climate)} · ${this._rowLabel(day, 'long')} (${this._scheduleName(this._schedule)})`;
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
    this._spread(climate, day);
    if (this._sel && this._sel.climate === climate && this._sel.day === day) this._sel = null;
    this._focus = climate;
    this._dirty = true;
    this._msg = this._loc.t('pastedOn', { name: this._name(climate), day: this._rowLabel(day, 'long') });
    this._render();
  }

  _action(act, ds, el) {
    if (act === 'menu') {
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return this._openMenu(ds.climate, Number(ds.day), b.bottom - card.top + 4, card.right - b.right, b.top - card.top - 4);
    }
    this._menu = null;
    if (act.startsWith('schedule-')) return this._scheduleAction(act, ds, el);
    if (act.startsWith('fill-')) return this._copyDay(ds.climate, Number(ds.day), act.slice(5));
    if (act === 'pause' || act === 'resume') return this._setPaused(ds.climate, act === 'pause');
    if (act === 'thermostat-more') {
      this._thMore = this._thMore === ds.climate ? null : ds.climate;
      this._forgetAsk = null;
      return this._render();
    }
    if (act === 'thermostat-forget' || act === 'thermostat-forget-cancel') {
      this._forgetAsk = act === 'thermostat-forget' ? ds.climate : null;
      return this._render();
    }
    if (act === 'thermostat-forget-confirm') return this._forget(ds.climate);
    if (act === 'thermostat-add') {
      // Scheduled with the week of a new schedule in every schedule (as a thermostat added to a card)
      const climate = this.shadowRoot.querySelector('[data-add-climate]').value;
      return this._call((src) => src.saveWeeks({ [climate]: {} }, null, { [climate]: null }));
    }
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
      this._sel = null;
      this._overrideSel = null;
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
    if (act === 'group-days') {
      // The history shows each day: grouping the days hides it
      this._groupPref = !this._grouped();
      try { localStorage.setItem(LS_GROUP, this._groupPref ? '1' : '0'); } catch (e) { /* ignore */ }
      this._sel = null;
      return this._history.shown ? this._toggleHistory() : this._render();
    }
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
      segs.splice(idx + 1, 0, { start: m1, preset: otherPreset(this._presets(), s.preset) ?? s.preset }, { start: m2, preset: s.preset });
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

// What opens in Home Assistant looks like a link, even without a mouse to hover it (every card)
const LINK_STYLE = `
  .mi-link { cursor:pointer; text-decoration:underline dotted; text-underline-offset:3px;
    text-decoration-color:rgba(127,127,127,.6); }
  .mi-link:hover, .mi-link:focus-visible { color:var(--primary-color); text-decoration:underline; }
`;

const STYLE = `
  :host { display:block; }
  ha-card { display:block; position:relative; padding:16px; overflow:visible; }
  ha-card.flat { padding:0; background:none; border:none; box-shadow:none; --ha-card-border-width:0; }
  select, input, button { font:inherit; color:var(--primary-text-color); }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { border:1px solid var(--divider-color); background:var(--card-background-color); border-radius:16px;
    padding:6px 12px; cursor:pointer; font-size:.88em; }
  .chip .live { color:var(--secondary-text-color); font-size:.9em; margin-left:2px; }
  .chip.on { background:var(--primary-color); border-color:var(--primary-color); color:var(--text-primary-color,#fff); }
  .chip.on .live { color:inherit; opacity:.85; }
  .chip.paused .live { font-style:italic; }
  .paused-note { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-top:8px; padding:6px 10px;
    border-radius:8px; background:rgba(127,127,127,.12); color:var(--secondary-text-color); font-size:.9em; }
  .paused-note span { flex:1 1 180px; }
  .bar.paused .seg { opacity:.45; }
  .th-hint { color:var(--secondary-text-color); font-size:.9em; margin-bottom:8px; }
  .th-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:12px 0; border-top:1px solid var(--divider-color); }
  .th-name { flex:1 1 160px; min-width:0; }
  .th-title { font-size:1.05em; font-weight:500; cursor:pointer; color:var(--primary-text-color); }
  .th-title:hover, .th-title:focus-visible { color:var(--primary-color); text-decoration:underline; }
  .th-badge { display:inline-block; margin-left:8px; padding:1px 8px; border-radius:10px; font-size:.75em; vertical-align:2px;
    background:rgba(67,160,71,.18); color:var(--success-color, #43a047); }
  .th-badge.paused { background:rgba(127,127,127,.18); color:var(--secondary-text-color); }
  .th-cards { margin-top:4px; font-size:.85em; color:var(--secondary-text-color); }
  .th-cards .mi-link { color:inherit; }
  .th-btns { display:flex; flex-wrap:wrap; gap:6px; }
  .btn.icon { min-width:36px; padding:6px 8px; }
  .btn.icon.on { border-color:var(--primary-color); color:var(--primary-color); }
  .th-more { flex-basis:100%; display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; padding:8px 10px;
    border-radius:8px; background:var(--secondary-background-color); font-size:.9em; }
  .th-more .btn.danger { margin-left:auto; }
  .th-ask { flex:1 1 100%; color:var(--secondary-text-color); }
  .chip-sep { width:1px; align-self:stretch; margin:2px 2px; background:var(--divider-color); }
  .chip.tool { border-style:dashed; color:var(--secondary-text-color); background:transparent; }
  .chip.tool.on { border-style:solid; border-color:var(--primary-color); color:var(--primary-color); }
  .tabs { display:flex; gap:4px; margin:12px 0 10px; padding:3px; border-radius:10px;
    background:var(--secondary-background-color); }
  .tab { flex:1; border:0; background:transparent; padding:7px 8px; border-radius:8px; cursor:pointer; }
  .tab.on { background:var(--card-background-color); box-shadow:0 1px 3px rgba(0,0,0,.25); font-weight:600; }
  /* An icon chosen in HA stays on the line of the name, even on a narrow screen */
  .tab.with-icon { display:flex; align-items:center; justify-content:center; }
  .tab-icon { --mdc-icon-size:18px; flex:0 0 auto; margin-inline-end:4px; }
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

  /* Grid: day | (name) | bar | tools. Its layout follows the width of the card (a card in a
     column of a dashboard is narrow on a wide screen too) */
  .days { container-type:inline-size; }
  .scale { display:grid; grid-template-columns:var(--day-w) 1fr 28px; gap:8px; align-items:center; }
  .multi .scale { grid-template-columns:var(--day-w) fit-content(100px) 1fr 28px; }
  .dgroup { display:grid; grid-template-columns:var(--day-w) 1fr; gap:8px; align-items:center; margin:7px 0; }
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
  ${LINK_STYLE}
  .chip-open { display:inline-flex; align-items:center; justify-content:center; vertical-align:middle;
    width:24px; height:24px; margin:-4px -8px -4px 2px; border-radius:50%; opacity:.7; cursor:pointer; }
  .chip-open:hover { opacity:1; background:rgba(127,127,127,.25); }
  .chip-open svg { width:15px; height:15px; fill:currentColor; }
  .links { display:flex; flex-wrap:wrap; gap:4px 12px; margin-top:2px; font-size:.85em; color:var(--secondary-text-color); }
  .th-foot { padding-top:10px; border-top:1px solid var(--divider-color); font-size:.9em; }
  .th-add { padding:14px 0 10px; border-top:1px solid var(--divider-color); }
  .th-add-title { font-weight:500; margin-bottom:8px; }
  .th-add-row { display:flex; gap:8px; align-items:center; }
  .th-add select { flex:1; min-width:0; min-height:36px; }

  .ticks { position:relative; height:16px; font-size:11px; color:var(--secondary-text-color); }
  .ticks span { position:absolute; transform:translateX(-50%); }
  .ticks span:first-child { transform:none; }
  .ticks span:last-child { transform:translateX(-100%); }
  .day { font-size:.9em; color:var(--secondary-text-color); text-align:right; line-height:1.2; }
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
  /* A label that does not fit is hidden (a time) or ends in "…" (a name), never cut into
     meaningless pieces such as "06:" */
  .seg { container-type:inline-size; }
  .seg .l { min-width:0; overflow:hidden; text-overflow:ellipsis; }
  @container (max-width:38px) { .seg .t { visibility:hidden; } }
  @container (max-width:44px) { .seg .l { visibility:hidden; } }
  .h12 .seg .t { white-space:nowrap; }
  @container (max-width:56px) { .h12 .seg .t { visibility:hidden; } }
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
  ha-card.flat .msg:empty { min-height:0; margin:0; }
  .dirty { color:var(--warning-color,#ff9800); }
  /* Unsaved edits of the weeks: a bar at the foot of the card, kept at the bottom of the window
     while the card scrolls */
  .savebar { position:sticky; bottom:0; z-index:8; display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end;
    gap:8px; margin:10px -16px -16px; padding:10px 16px; border-top:1px solid var(--divider-color);
    background:var(--ha-card-background, var(--card-background-color)); box-shadow:0 -4px 12px rgba(0,0,0,.15);
    border-radius:0 0 var(--ha-card-border-radius,12px) var(--ha-card-border-radius,12px); }
  .savebar .dirty { margin-right:auto; font-size:.9em; }
  .loading { color:var(--secondary-text-color); }
  /* Views: tabs across the top of the card, unlike the schedules' segmented switch */
  .config-links { display:flex; justify-content:flex-end; gap:12px; margin:-4px 0 8px; font-size:.85em; }
  .views { display:flex; margin:-12px -16px 12px; padding:0 8px; box-shadow:inset 0 -1px var(--divider-color);
    overflow-x:auto; scrollbar-width:none; }
  .view { flex:1 1 auto; min-height:40px; padding:8px; border:0; border-bottom:2px solid transparent;
    background:transparent; cursor:pointer; font-size:.9em; white-space:nowrap; color:var(--secondary-text-color); }
  .view:hover { color:var(--primary-text-color); }
  .view.on { color:var(--primary-color); border-bottom-color:var(--primary-color); font-weight:500; }
  .table-wrap { overflow-x:auto; }
  .pv-list { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:8px; }
  .pv-list .cell { align-items:flex-start; min-width:0; box-sizing:border-box; padding:8px 10px; gap:2px;
    border-color:var(--divider-color); text-align:left; }
  .pv-list .pv-val { font-size:1.2em; }
  .pv-intro { margin:0 0 10px; }
  .pv-table { border-collapse:separate; border-spacing:0; width:100%; font-size:.9em; }
  .pv-table th, .pv-table td { padding:2px; text-align:center; white-space:nowrap; }
  .pv-table thead th { border-bottom:1px solid var(--divider-color); padding-bottom:6px; }
  /* The names stay in place while the table scrolls sideways (narrow screens) */
  .pv-table th.name { position:sticky; left:0; z-index:1; text-align:left; font-weight:500; padding-right:10px;
    font-size:1em; color:var(--primary-text-color); overflow:visible;
    background:var(--ha-card-background, var(--card-background-color)); }
  .pv-table thead th:first-child { position:sticky; left:0; z-index:1; background:var(--ha-card-background, var(--card-background-color)); }
  .cell { display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; width:100%; min-width:76px;
    padding:5px 6px; border:1px solid transparent; border-radius:6px; background:transparent; font:inherit; color:inherit; }
  button.cell { cursor:pointer; }
  button.cell:hover, .cell.on { border-color:var(--divider-color); background:var(--secondary-background-color); }
  .cell.on { border-color:var(--primary-color); }
  .pv-pname { display:inline-flex; align-items:center; gap:5px; font-weight:600; }
  .pv-pname i { display:inline-block; width:10px; height:10px; border-radius:3px; }
  .pv-default, .pv-how { font-size:.8em; color:var(--secondary-text-color); font-weight:normal; }
  .pv-val { font-weight:600; font-variant-numeric:tabular-nums; }
  .cell.default .pv-val { font-weight:normal; color:var(--secondary-text-color); }
  .pv-note { margin-top:6px; }
  .pv-add { margin-top:10px; }
  .pv-device { font-size:.9em; }
  .pv-foot .pv-del { margin-right:auto; }
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
  .pv-replace { display:flex; align-items:center; gap:8px; color:var(--secondary-text-color); }
  .pv-foot { margin-left:0; justify-content:flex-end; padding-top:10px; border-top:1px solid var(--divider-color); }
  .missing { color:var(--secondary-text-color); padding:16px; }
  .missing .btn { margin-top:12px; }
  /* Several thermostats: the day's name above its rows, so that the bars get the width; beside
     them only on a wide card */
  @container (max-width:699px) {
    .multi .scale { grid-template-columns:fit-content(100px) 1fr 28px; }
    .multi .scale > div:first-child { display:none; }
    .multi .dgroup { grid-template-columns:1fr; gap:4px; }
    .multi .day { text-align:left; font-weight:500; }
  }
  @container (max-width:499px) {
    .multi .scale { grid-template-columns:fit-content(60px) 1fr 28px; }
    .dgroup { grid-template-columns:min(var(--day-w), 56px) 1fr; }
    .multi .sub { grid-template-columns:fit-content(60px) 1fr 28px; }
    .sub { grid-template-columns:1fr 28px; }
    .scale { grid-template-columns:min(var(--day-w), 56px) 1fr 28px; }
    .ticks .minor { display:none; }
  }
  /* On a touch screen, the hint speaks of a finger */
  .hint .touch { display:none; }
  @media (hover:none) {
    .hint .mouse { display:none; }
    .hint .touch { display:inline; }
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
  group_days: undefined, // card option: false shows every day on its own row
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
    root.addEventListener('focusout', (e) => this._onEndDone(e));
    root.addEventListener('keydown', (e) => this._onEndDone(e));
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
    const { weeks, overrides, schedule, thermostats } = src.stamps;
    if (this._key && overrides !== this._key[2]) this._pending = undefined;
    if (this._key && thermostats !== this._key[4]) this._error = null; // paused or resumed: a resume error is over
    // Redraw only when relevant data changed (or every new minute)
    // (an admin pauses and opens devices; the registry gives the device)
    const key = [s[this._entity], weeks, overrides, schedule, thermostats, Math.floor(Date.now() / 60000), this._loc.signature,
      !hass.user || !!hass.user.is_admin, hass.entities && hass.entities[this._entity]];
    if (this._key && key.every((v, i) => v === this._key[i])) return;
    if (this._drag) return; // no redraw while dragging
    if (focusedField(this.shadowRoot, 'input[data-end]')) { this._redrawLater = true; return; } // nor while the end is typed
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

  // The active schedule's name, opening its switch (#39), and the thermostat's week in it
  _week() {
    const src = dataSource(this._hass);
    const schedule = src.activeSchedule();
    const name = schedule ? src.scheduleName(schedule) : '';
    const entity = schedule && src.scheduleEntity(schedule);
    return { schedule: entity ? entityLinkHtml(entity, name) : esc(name), week: activeWeek(src, this._entity) };
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
    const focused = focusedField(this.shadowRoot, OVERRIDE_TEMPERATURE);
    const typed = focused ? focused.value : null;
    this.style.display = '';
    const today = todayIdx();
    const d = this._currentOverride();
    const pieces = overridePieces(d);
    this._pieces = pieces;

    const segs = week[today];
    const followText = planText(dataSource(this._hass).planned(this._entity), (id) => this._preset(id).name, this._loc);

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
          <span class="override-value">⏱ ${esc(overrideLabel(d, this._loc, presetsOf(dataSource(this._hass), this._loc)))}</span>
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
    } else if (dataSource(this._hass).paused(this._entity)) {
      this._creating = false;
      // Resume is at the foot, in place of Pause
      status = `<div class="status"><div class="line"><span class="muted">${esc(t('pausedInfo'))}</span></div></div>`;
    } else {
      // "Temporary setpoint…" unfolds the same controls, to set one
      const value = this._creating ? overrideValueHtml(null, dataSource(this._hass), this._entity, attrs, this._loc) : null;
      status = `<div class="status${value ? ' derogation' : ''}">
        <div class="line"><span><span class="muted">${esc(t('followsSchedule'))}</span> ${esc(followText)}</span>
          <button data-new-override>${esc(t('newOverride'))}</button></div>
        ${value ? `${value.presets}<div class="line">${value.temperature}</div>` : ''}
      </div>`;
    }

    // Identical days on one row (card option `group_days`), like the schedule card
    const order = this._loc.dayOrder;
    const rows = (MORE_INFO_CFG.group_days === false ? order.map((d) => [d]) : rowsOfDays(order, (d) => serializeDay(week[d]).join(',')))
      .map((days) => `<div class="row${days.includes(today) ? ' today' : ''}">
        <span>${esc(this._loc.daysLabel(days))}</span>${this._bar(week[days[0]], rowPiece(pieces, days), false, false)}</div>`).join('');
    const ticks = [0, 6, 12, 18, 24].map((h) => `<span>${this._loc.tick(h)}</span>`).join('');

    this.shadowRoot.innerHTML = `<style>${MORE_INFO_STYLE}</style>
      <div class="wrap">
        <div class="title">${esc(t('schedule'))} <span class="muted">· ${schedule}</span></div>
        ${status}
        ${this._error ? `<div class="msg">${esc(this._error)}</div>` : ''}
        <div class="today-lbl">${esc(t('todayTitle'))}</div>
        ${this._bar(segs, rowPiece(pieces, [today]), true, true)}
        ${endDay}
        <div class="ticks">${ticks}</div>
        <details><summary>${esc(t('week'))}</summary><div class="week">${rows}</div></details>
        ${this._footHtml()}
      </div>`;
    // Keeps the "week" section open / closed across redraws
    const det = this.shadowRoot.querySelector('details');
    det.open = !!this._weekOpen;
    det.addEventListener('toggle', () => { this._weekOpen = det.open; });
    if (typed !== null) restoreTyped(this.shadowRoot, OVERRIDE_TEMPERATURE, typed);
  }

  // The foot: the thermostat's own entities (its control, i.e. the pause; its override; what it
  // plans) and its device open in Home Assistant; Pause, or Resume in its place (admins) (#39)
  _footHtml() {
    const t = this._loc.t;
    const src = dataSource(this._hass);
    const links = [['control', 'controlEntity'], ['override', 'overrideEntity'], ['planned_preset', 'plannedEntity']]
      .map(([key, label]) => {
        const entity = src.thermostatEntity(this._entity, key);
        return entity && entityLinkHtml(entity, t(label));
      })
      .concat(`<span class="mi-link" role="link" tabindex="0" data-weeks="${esc(this._entity)}">${esc(t('openInPanel', { panel: panelTitle(this._hass) }))}</span>`)
      // Its scheduled thermostat's device (prototype), else the thermostat's
      .concat(deviceLinkHtml(this._hass, deviceOf(this._hass, src.thermostatEntity(this._entity, 'control'))
        || deviceOf(this._hass, this._entity), t('device')))
      .filter(Boolean)
      .join(' ');
    const paused = src.paused(this._entity);
    const button = !src.editable ? ''
      : paused ? `<button data-resume>${esc(t('resumeShort'))}</button>` : `<button data-pause>${esc(t('pauseShort'))}</button>`;
    return links || button ? `<div class="foot"><span class="links">${links}</span>${button}</div>` : '';
  }

  _onClick(e) {
    const link = e.target.closest('[data-more-info]');
    if (link) {
      e.stopPropagation();
      openMoreInfo(this, link.dataset.moreInfo);
      return;
    }
    const device = e.target.closest('[data-device]');
    if (device) {
      // In the more-info dialog: closed first, the device page under it otherwise
      leaveMoreInfo(this, () => openDevice(device.dataset.device));
      return;
    }
    const weeks = e.target.closest('[data-weeks]');
    if (weeks) {
      leaveMoreInfo(this, () => openWeeks(weeks.dataset.weeks));
      return;
    }
    const b = e.target.closest('button');
    if (!b || !this._hass) return;
    if (b.hasAttribute('data-new-override')) { this._creating = !this._creating; return this._render(); }
    this._error = null;
    if (b.hasAttribute('data-resume') || b.hasAttribute('data-pause')) {
      return dataSource(this._hass).setPaused(this._entity, b.hasAttribute('data-pause')).catch((err) => {
        this._error = this._loc.t('error', { message: err.message || err.code || err });
        this._render();
      });
    }
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
    // Typed (the field changes at each digit): sent on leaving the field or with Enter
    if (this.shadowRoot.activeElement === el) { this._endTyped = el.value; return; }
    this._sendEnd(el.value);
  }

  _sendEnd(value) {
    this._endTyped = null;
    this._setEnd(nextAtMinutes(Math.round(toMin(value) / MORE_INFO_CFG.step) * MORE_INFO_CFG.step));
  }

  // The end being typed: sent on leaving its field or with Enter; the block, not redrawn while it
  // is typed, is drawn again then
  _onEndDone(e) {
    if (!e.target.matches || !e.target.matches('input[data-end]')) return;
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    if (this._endTyped) this._sendEnd(this._endTyped);
    else if (this._redrawLater) this._render();
    this._redrawLater = false;
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
    if (dr.moved) this._setEnd(atMinutes(dr.piece.d0, dr.end, new Date()));
    else dr.handle.classList.remove('drag');
  }
}

const MORE_INFO_STYLE = `
  :host { display:block; margin:16px 0 8px; }
  .wrap { padding:14px 12px 4px 16px; border-top:1px solid var(--divider-color); }
  /* In the thermostat card: under its header */
  :host([embedded]) { margin:0; }
  :host([embedded]) .wrap { padding:0; border-top:0; }
  ${LINK_STYLE}
  .foot { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-top:12px; padding-top:10px;
    border-top:1px solid var(--divider-color); }
  .foot .links { display:flex; flex-wrap:wrap; gap:4px 12px; flex:1 1 auto; font-size:.88em; color:var(--secondary-text-color); }
  .title { font-weight:600; margin-bottom:8px; }
  .muted { color:var(--secondary-text-color); font-weight:normal; font-size:.9em; }
  .status { font-size:.92em; margin-bottom:10px; }
  .msg { font-size:.85em; color:var(--error-color,#db4437); margin-bottom:10px; }
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
  /* A time that does not fit is hidden, never cut ("07:0") */
  .bar.big .seg { container-type:inline-size; }
  @container (max-width:38px) { .seg span { visibility:hidden; } }
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
  /* One grid for the rows: the column of the days is as wide as the longest name of a row */
  .week { display:grid; grid-template-columns:fit-content(56px) 1fr; gap:4px 8px; align-items:center; margin-top:8px;
    font-size:.8em; color:var(--secondary-text-color); }
  .row { display:contents; }
  .row span { line-height:1.2; }
  .row.today span { color:var(--primary-color); font-weight:700; }
`;

// =====================================================================
//  Thermostat card (custom:chauffage-thermostat-card, #39): one scheduled thermostat, to place in
//  one's own dashboard, like HA's Tile or Thermostat cards. Its header says what the thermostat
//  does now; under it, the block of the more-info dialog (why and until when, today, a temporary
//  setpoint, the week), so that both stay the same. What it names opens in Home Assistant.
// =====================================================================

const THERMOSTAT_CARD_STYLE = `
  :host { display:block; }
  ha-card { display:block; padding:14px 16px 12px; }
  .tc-head { display:grid; grid-template-columns:1fr auto; align-items:center; gap:2px 12px; margin-bottom:12px; }
  .tc-name { font-size:1.1em; font-weight:500; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tc-temp { grid-row:span 2; font-size:2em; font-weight:300; font-variant-numeric:tabular-nums; }
  .tc-state { justify-self:start; display:inline-flex; align-items:center; gap:5px; padding:1px 8px; border-radius:10px;
    font-size:.88em; font-weight:500; white-space:nowrap; background:var(--secondary-background-color); }
  .tc-state i { width:10px; height:10px; border-radius:3px; flex:none; }
  .tc-state.override { color:#fff; background:repeating-linear-gradient(135deg, #7b1fa2 0 6px, #9c4dcc 6px 12px); }
  ${LINK_STYLE}
  .msg { color:var(--secondary-text-color); font-size:.92em; }
`;

class ChauffageThermostatCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
  }

  static getConfigElement() {
    return document.createElement('chauffage-thermostat-card-editor');
  }

  // A new card: a thermostat Chauffage schedules, otherwise the first thermostat
  static async getStubConfig(hass) {
    const scheduled = dataSource(hass).scheduled().filter((e) => hass.states[e]);
    const climates = Object.keys(hass.states).filter((e) => e.startsWith('climate.'));
    return { entity: scheduled[0] || climates[0] || '' };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      const lang = (config && config.language) || (typeof navigator !== 'undefined' && navigator.language);
      throw new Error(makeLocale(null, lang).t('entityRequired'));
    }
    this._config = config;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._unlisten && dataSource(hass).available) {
      this._unlisten = INTEGRATION.listen(() => { if (this._hass) this.hass = this._hass; });
    }
    if (!this._config) return;
    const src = dataSource(hass);
    // Redrawn when the thermostat or the integration's data change; the block follows by itself
    const key = [hass.states[this._config.entity], src.stamps.weeks, src.stamps.overrides, src.stamps.schedule,
      src.stamps.thermostats, JSON.stringify(src.planned(this._config.entity)), makeLocale(hass, this._config.language).signature,
      hass.user && hass.user.is_admin, src.ready, src.stale, src.outdated, this._config];
    if (!this._key || key.some((v, i) => v !== this._key[i])) {
      this._key = key;
      this._render();
    }
    const block = this.shadowRoot.querySelector('chauffage-moreinfo');
    if (block) block.hass = hass;
  }

  connectedCallback() {
    if (this._hass && !this._unlisten && dataSource(this._hass).available) this.hass = this._hass;
  }

  disconnectedCallback() {
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  _render() {
    const hass = this._hass;
    const loc = makeLocale(hass, this._config.language);
    const t = loc.t;
    const entity = this._config.entity;
    const src = dataSource(hass);
    const card = (body) => fillCard(this.shadowRoot, THERMOSTAT_CARD_STYLE, body);
    if (src.stale || !src.available || src.outdated) {
      const message = src.stale ? 'reloadNeeded' : src.outdated ? 'restartNeeded' : 'integrationMissing';
      card(`<div class="msg">${esc(t(message))}</div>`);
      return;
    }
    const st = hass.states[entity];
    const name = st ? thermostatName(hass, entity, this._config.name) : entity;
    const a = (st && st.attributes) || {};
    const measured = a.current_temperature != null ? `${loc.number(a.current_temperature)}°` : '';
    const head = `<div class="tc-head">
        <div class="tc-name">${st ? entityLinkHtml(entity, name, t('openThermostat')) : esc(name)}</div>
        <div class="tc-temp">${measured}</div>
        ${st ? this._stateHtml(loc, src, st) : `<span class="msg">${esc(t('entityMissing', { entity }))}</span>`}
      </div>`;
    if (!src.ready || !st) {
      card(head);
      return;
    }
    if (!src.scheduled().includes(entity)) {
      card(`${head}<div class="msg">${esc(t('notScheduled'))}</div>`);
      return;
    }
    // The block of the more-info dialog, with its foot: the thermostat's own entities, its device,
    // Pause or Resume. Kept when it is there: only the header is drawn again (a field being typed
    // in the block keeps its focus while the thermostat reports)
    let block = this.shadowRoot.querySelector('chauffage-moreinfo');
    const header = this.shadowRoot.querySelector('.tc-head');
    if (block && header && block.entity === entity) {
      header.outerHTML = head;
    } else {
      card(`${head}<chauffage-moreinfo embedded></chauffage-moreinfo>`);
      block = this.shadowRoot.querySelector('chauffage-moreinfo');
    }
    block.entity = entity;
    block.hass = hass;
  }

  // What it does now: its temporary setpoint, or the preset of its schedule (the thermostat's
  // own when paused), with its setpoint
  _stateHtml(loc, src, st) {
    const t = loc.t;
    const a = st.attributes;
    const setpoint = a.temperature != null ? `${loc.number(a.temperature)}°` : '';
    const text = (label) => esc([label, setpoint].filter(Boolean).join(' · '));
    const presets = presetsOf(src, loc);
    const paused = src.paused(this._config.entity);
    const d = !paused && filterActive(src.overrides())[this._config.entity];
    // An override at a temperature (not a preset) is that temperature: said once, not "17,5 °C · 17,5°"
    if (d && d.kind === 'temperature' && !presets.some((p) => p.id === d.preset)) {
      return `<span class="tc-state override">⏱ ${esc(`${loc.number(d.value)}°`)}</span>`;
    }
    if (d) return `<span class="tc-state override">⏱ ${text(overrideLabel(d, loc, presets))}</span>`;
    const plan = paused ? null : src.planned(this._config.entity);
    let label;
    let color = null;
    if (st.state === 'off') label = t('off');
    else if (plan && plan.preset) ({ name: label, color } = presetOf(presets, plan.preset, loc));
    else if (['none', 'manual', 'manuel'].includes(String(a.preset_mode).toLowerCase())) label = t('manual');
    else label = a.preset_mode ? loc.preset(a.preset_mode) : '';
    return `<span class="tc-state">${color ? `<i style="background:${color}"></i>` : ''}${text(label)}</span>`;
  }

  _onClick(e) {
    const link = e.target.closest('[data-more-info]');
    if (link) openMoreInfo(this, link.dataset.moreInfo);
  }
}

// Its visual editor: the thermostat, and its name (HA's name field from 2025.11, text before)
class ChauffageThermostatCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass) return;
    const loc = makeLocale(this._hass);
    const haName = haAtLeast(this._hass, 2025, 11);
    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.addEventListener('value-changed', (e) => {
        e.stopPropagation();
        const { entity, name } = e.detail.value;
        const config = { ...this._config, entity: entity || this._config.entity };
        if (name === undefined || name === '' || (Array.isArray(name) && !name.length)) delete config.name;
        else config.name = name;
        this._config = config;
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
      });
      this.shadowRoot.appendChild(this._form);
    }
    const form = this._form;
    form.hass = this._hass;
    form.schema = [
      { name: 'entity', required: true, selector: { entity: { domain: 'climate' } } },
      haName ? { name: 'name', selector: { entity_name: {} }, context: { entity: 'entity' } } : { name: 'name', selector: { text: {} } },
    ];
    form.computeLabel = (s) => loc.t(s.name === 'name' ? 'editorName' : 'editorThermostat');
    const c = this._config;
    form.data = haName ? { entity: c.entity, ...(c.name !== undefined ? { name: c.name } : {}) }
      : { entity: c.entity, name: typeof c.name === 'string' ? c.name : '' };
  }
}

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
  .removed-note, .renamed-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 0; padding: 8px 12px;
    border-radius: 8px; background: rgba(var(--rgb-warning-color, 255, 166, 0), .15); }
  .renamed-note { margin: 4px 0 0; }
  .renamed-note span { flex: 1 1 200px; }
  .renamed-note button { font: inherit; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--divider-color);
    background: var(--card-background-color); color: var(--primary-text-color); cursor: pointer; }
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
    // The thermostats when the editor opened (HA gives each change back through setConfig)
    if (!this._initial) this._initial = this._thermostats().map((t) => t.entity);
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
      : ['list', thermostats, thermostats.map((t) => [this._shownName(t), this._renamedTo(t.entity)]), loc.signature, this._removedScheduled()]);
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

  _renamedTo(entity) {
    return this._hass ? renamedTo(this._hass, dataSource(this._hass), entity) : null;
  }

  // Thermostats removed from the card while it is edited that Chauffage schedules: removing one
  // from a card does not stop its schedule (docs/decisions.md, "Scheduled thermostats")
  _removedScheduled() {
    if (!this._hass) return [];
    const now = this._thermostats().map((t) => t.entity);
    const scheduled = dataSource(this._hass).scheduled();
    return this._initial.filter((e) => !now.includes(e) && scheduled.includes(e));
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
      const to = this._renamedTo(t.entity);
      if (to) {
        const note = document.createElement('div');
        note.className = 'renamed-note';
        const text = document.createElement('span');
        text.textContent = loc.t('editorRenamed', { entity: to });
        const button = document.createElement('button');
        button.textContent = loc.t('editorUseNewId');
        button.addEventListener('click', () => {
          const list = this._thermostats();
          list[i].entity = to;
          this._setThermostats(list);
        });
        note.append(text, button);
        cell.appendChild(note);
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
    const removed = this._removedScheduled().map((entity) => {
      const note = document.createElement('div');
      note.className = 'removed-note';
      note.textContent = loc.t('editorRemovedScheduled', { name: this._defaultName(entity) });
      return note;
    });
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
    this.shadowRoot.append(title, sortable, ...removed, add, options);
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

// =====================================================================
//  The Chauffage panel (frontend.py): where an admin configures Chauffage. Lists, then sheets,
//  as Home Assistant's settings:
//  - a list has the panel's tabs: the schedules (and the activation rules), the thermostats,
//    the presets;
//  - a sheet is about one schedule or one thermostat: a breadcrumb to its list, no tabs.
//    /chauffage/schedules/<id>          every thermostat's week in this schedule
//    /chauffage/thermostats/<climate>   this thermostat's week in every schedule, its presets
//  A thermostat is named by its climate entity id, the key of a scheduled thermostat.
//  Dashboards keep the cards, for everyday use.
// =====================================================================
// Thermostats first: everything starts from a scheduled thermostat, and a new user starts there
const PANEL_TABS = [['thermostats', 'viewThermostats'], ['schedules', 'pageSchedules'], ['presets', 'viewPresets']];
// The next steps after the welcome: 'pending' once the first thermostats are scheduled from it,
// 'closed' once the user closed them (this browser)
const LS_NEXT_STEPS = 'chauffage-panel:next-steps';

// What a panel address shows: { list } or { sheet, id, list }, else { redirect }
function panelRoute(path, src, hass) {
  const [page = '', id = null] = (path || '').split('/').filter(Boolean).map(decodeURIComponent);
  // The address of a thermostat before the pages (/chauffage/<climate>)
  if (page.includes('.')) return { redirect: `thermostats/${page}` };
  if (page === 'thermostats' && id) {
    const to = renamedTo(hass, src, id);
    return to ? { redirect: `thermostats/${to}` } : { sheet: 'thermostat', id, list: 'thermostats' };
  }
  if (page === 'schedules' && id) {
    // A schedule deleted from its sheet: back to the list
    if (src.ready && !src.schedules().includes(id)) return { redirect: 'schedules' };
    return { sheet: 'schedule', id, list: 'schedules' };
  }
  if (PANEL_TABS.some(([p]) => p === page)) return { list: page };
  // The rules live with the schedules; anything else opens the first tab
  return { redirect: page === 'rules' ? 'schedules' : PANEL_TABS[0][0] };
}

class ChauffagePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unlisten = null;
    this._key = null;
    this._cards = [];
    this._placements = undefined;
    this._creating = false;
    // A thermostat's sheet: identical days on one row for every schedule, as chosen on this device
    this._groupDays = true;
    // …and the history of the measured temperature, as chosen on this device (as the cards)
    this._historyOn = false;
    try {
      this._groupDays = localStorage.getItem(LS_GROUP) !== '0';
      this._historyOn = localStorage.getItem(LS_HISTORY) === '1';
    } catch (e) { /* ignore */ }
    this._picked = new Set(); // the welcome: the thermostats ticked
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
    // A thermostat's sheet: its week in schedule A copied to schedule B lands in B's card, which
    // asks to save B. A is not touched, even with edits not saved yet (they are copied as shown).
    this.shadowRoot.addEventListener('change', (e) => {
      const box = e.target.closest('[data-pick]');
      if (box) {
        if (box.checked) this._picked.add(box.dataset.pick);
        else this._picked.delete(box.dataset.pick);
        this._update();
        return;
      }
      const select = e.target.closest('[data-copy-from]');
      if (!select || !select.value) return;
      const route = panelRoute(this._route && this._route.path, dataSource(this._hass), this._hass);
      const from = this._weekCards && this._weekCards[select.dataset.copyFrom];
      const to = this._weekCards && this._weekCards[select.value];
      if (from && to) to._receiveWeek(route.id, from._week(route.id), from._scheduleName(from._schedule));
      select.value = '';
    });
  }

  // Set by Home Assistant: hass, the panel (its title), the route (the page), narrow
  set hass(hass) {
    this._hass = hass;
    if (!this._unlisten && integrationAvailable(hass)) {
      INTEGRATION.connect(hass);
      this._unlisten = INTEGRATION.listen(() => this._update());
    }
    this._update();
  }

  set panel(panel) {
    this._panel = panel;
    this._update();
  }

  set route(route) {
    this._route = route;
    this._update();
  }

  set narrow(narrow) {
    this._narrow = narrow;
    this._update();
  }

  // Home Assistant may set the properties before it adds the panel to the page
  connectedCallback() {
    if (!this._unlisten && this._hass && integrationAvailable(this._hass)) {
      INTEGRATION.connect(this._hass);
      this._unlisten = INTEGRATION.listen(() => this._update());
    }
    this._update();
  }

  disconnectedCallback() {
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
  }

  get _t() {
    return makeLocale(this._hass).t;
  }

  _update() {
    const hass = this._hass;
    // Home Assistant sets the route after hass: no redirect before the address is known. A panel
    // no longer on the page (left, or an answer arriving late) draws nothing.
    if (!hass || !this._route || !this.isConnected) return;
    const src = dataSource(hass);
    const route = panelRoute(this._route && this._route.path, src, hass);
    if (route.redirect) {
      window.history.replaceState(null, '', `/chauffage/${route.redirect}`);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: true } }));
      return;
    }
    // The page is built again when what it is made of changes; its live parts are filled each time
    const key = JSON.stringify([route, src.ready, src.schedules(), Object.keys(src.weeks()).sort(), this._groupDays,
      this._historyOn]);
    if (key !== this._key) {
      this._key = key;
      this._build(route, src);
    }
    this._fill(route, src);
    const menu = this.shadowRoot.querySelector('ha-menu-button');
    if (menu) {
      menu.hass = hass;
      menu.narrow = this._narrow;
    }
    for (const card of this._cards) card.hass = hass;
  }

  // Every scheduled thermostat, or every climate before the first one is scheduled
  _thermostats(src) {
    const scheduled = Object.keys(src.weeks());
    return scheduled.length ? scheduled : Object.keys(this._hass.states).filter((e) => e.startsWith('climate.'));
  }

  _build(route, src) {
    const t = this._t;
    const title = (this._panel && this._panel.title) || 'Chauffage';
    let head;
    if (route.sheet) {
      const name = route.sheet === 'schedule' ? src.scheduleName(route.id) : this._name(route.id);
      const list = PANEL_TABS.find(([page]) => page === route.list);
      head = `<div class="toolbar"><ha-menu-button></ha-menu-button>
          <nav class="title crumbs"><a href="/chauffage/${route.list}" data-page="${route.list}">${esc(t(list[1]))}</a>
            <span class="sep">›</span><span>${esc(name)}</span></nav>
        </div>`;
    } else {
      const tabs = PANEL_TABS.map(([page, label]) =>
        `<a href="/chauffage/${page}" class="tab${page === route.list ? ' on' : ''}" data-page="${page}">${esc(t(label))}</a>`).join('');
      head = `<div class="toolbar"><ha-menu-button></ha-menu-button><div class="title">${esc(title)}</div></div>
        <nav class="tabs">${tabs}</nav>`;
    }
    this.shadowRoot.innerHTML = `<style>${PANEL_CSS}</style>${head}<div class="content"></div>`;
    this._cards = [];
    if (!src.ready) return;
    const content = this.shadowRoot.querySelector('.content');
    const html = (s) => content.insertAdjacentHTML('beforeend', s);
    this._weekCards = {}; // a thermostat's sheet: its card of each schedule
    const scheduled = Object.keys(src.weeks()).length;
    const card = (config, parent = content) => {
      const el = document.createElement('chauffage-programme-card');
      el.setConfig({ thermostats: this._thermostats(src), panel: true, ...config });
      parent.appendChild(el);
      this._cards.push(el);
      return el;
    };
    if (route.sheet === 'schedule') {
      card({ schedule: route.id, schedule_tabs: 'one' });
    } else if (route.sheet === 'thermostat') {
      html('<div class="head"><div data-fill="thermostat"></div><div class="tile"></div></div>');
      this._tile(route.id, content.querySelector('.tile'));
      html('<div class="box sheet"></div>');
      const box = content.querySelector('.sheet');
      const part = (s) => box.insertAdjacentHTML('beforeend', s);
      // Its presets first: what each one means for this thermostat is the legend of its weeks
      part(`<h2>${esc(t('viewPresets'))}</h2>`);
      card({ thermostats: [route.id], view: 'presets', preset_definitions: false, flat: true }, box);
      // As on the card: the history shows each day, so grouping the days hides it
      const grouped = this._groupDays && !this._historyOn;
      part(`<div class="h2-row"><h2>${esc(t('weeksTitle'))}</h2>
        <button class="chip${grouped ? ' on' : ''}" data-group-days aria-pressed="${grouped}">${esc(t('groupDays'))}</button>
        <button class="chip${this._historyOn ? ' on' : ''}" data-history aria-pressed="${this._historyOn}" title="${esc(t('historyTitle'))}">${esc(t('history'))}</button></div>
        <div class="hint"><span class="mouse">${esc(t('hint'))}</span><span class="touch">${esc(t('hintTouch'))}</span></div>`);
      for (const id of src.schedules()) {
        part(`<h3 data-fill-schedule="${esc(id)}"></h3>`);
        this._weekCards[id] = card({ thermostats: [route.id], schedule: id, schedule_tabs: false, chips: false,
          legend: false, hint: false, group_days: this._groupDays, history: this._historyOn, flat: true,
          copy_week: false, today: 'active', paused_note: false }, box);
      }
    } else if (route.list === 'thermostats' && !scheduled) {
      html('<div class="box welcome" data-fill="welcome"></div>'); // a new user: no empty page
    } else if (route.list === 'thermostats') {
      html('<div data-fill="next"></div>');
      card({ view: 'thermostats' });
    } else {
      // A user may create schedules or presets first: the page stays, and says where to start
      if (!scheduled) {
        html(`<div class="notice">${esc(t('noThermostatYet'))}
          <a href="/chauffage/thermostats" data-page="thermostats">${esc(t('scheduleThermostats'))}</a></div>`);
      }
      if (route.list === 'schedules') {
        html(`<h2>${esc(t('pageSchedules'))}</h2><div class="box" data-fill="schedules"></div>`);
        html(`<h2>${esc(t('rulesHeading'))}</h2>`);
        card({ view: 'rules' });
      } else {
        card({ view: 'presets' });
      }
    }
  }

  // The live parts: the list of schedules, a thermostat's control, the schedules' headings
  _fill(route, src) {
    const t = this._t;
    const active = src.activeSchedule();
    const box = this.shadowRoot.querySelector('[data-fill="schedules"]');
    if (box) {
      const rows = src.schedules().map((id) => `<div class="row">
          <span class="name" role="link" tabindex="0" data-page="schedules/${esc(id)}">${esc(src.scheduleName(id))}</span>
          ${id === active ? `<span class="badge on">${esc(t('panelActive'))}</span>` : ''}
          <span class="grow"></span>
          ${id === active ? '' : `<button class="btn" data-activate="${esc(id)}">${esc(t('panelActivate'))}</button>`}
          <button class="btn" data-page="schedules/${esc(id)}">${esc(t('panelEdit'))}</button>
        </div>`).join('');
      const create = this._creating
        ? `<div class="row"><input data-new-name placeholder="${esc(t('panelNewName'))}">
            <button class="btn primary" data-create>${esc(t('panelCreate'))}</button>
            <button class="btn" data-create-cancel>${esc(t('cancel'))}</button></div>`
        : `<div class="row"><button class="btn" data-create-open>+ ${esc(t('newSchedule'))}</button></div>`;
      const typed = box.querySelector('[data-new-name]');
      const value = typed ? typed.value : '';
      box.innerHTML = rows + create + (this._error ? `<div class="error">${esc(this._error)}</div>` : '');
      const input = box.querySelector('[data-new-name]');
      if (input) {
        input.value = value;
        if (this._focusNew) input.focus();
        this._focusNew = false;
      }
    }
    const sheet = this.shadowRoot.querySelector('[data-fill="thermostat"]');
    if (sheet) sheet.innerHTML = this._controlHtml(route.id, src);
    const welcome = this.shadowRoot.querySelector('[data-fill="welcome"]');
    if (welcome) welcome.innerHTML = this._welcomeHtml(src);
    const next = this.shadowRoot.querySelector('[data-fill="next"]');
    if (next) {
      let shown = false;
      try { shown = localStorage.getItem(LS_NEXT_STEPS) === 'pending'; } catch (e) { /* ignore */ }
      next.innerHTML = shown ? `<div class="box next-steps">
          <div class="next-head"><h2>${esc(t('nextTitle'))}</h2><button class="btn" data-close-next>${esc(t('nextClose'))}</button></div>
          <ul><li>${esc(t('nextWeeks'))}</li><li>${esc(t('nextCard'))}</li></ul></div>` : '';
    }
    // A week's heading: its schedule (a link to its sheet), and copying it to another schedule
    for (const h of this.shadowRoot.querySelectorAll('[data-fill-schedule]')) {
      const id = h.dataset.fillSchedule;
      const others = src.schedules().filter((m) => m !== id);
      const copy = others.length ? `<select class="copy" data-copy-from="${esc(id)}" aria-label="${esc(t('copyTo'))}">
          <option value="">${esc(t('copyTo'))}</option>
          ${others.map((m) => `<option value="${esc(m)}">${esc(src.scheduleName(m))}</option>`).join('')}
        </select>` : '';
      h.innerHTML = `<span role="link" tabindex="0" data-page="schedules/${esc(id)}">${esc(src.scheduleName(id))}</span>${
        id === active ? ` <span class="badge on">${esc(t('panelActive'))}</span>` : ''}<span class="grow"></span>${copy}`;
    }
  }

  // A thermostat's sheet, first: whether Chauffage controls it, where it is shown, its devices
  _controlHtml(climate, src) {
    const t = this._t;
    const hass = this._hass;
    if (this._placements === undefined) {
      this._placements = null;
      cardPlacements(hass).then((p) => { this._placements = p; this._update(); }, () => { this._placements = {}; });
    }
    const paused = src.paused(climate);
    const places = this._placements ? this._placements[climate] || [] : null;
    const shown = places == null ? '' : places.length
      ? `${esc(t('inCards'))} ${places.map((p) => `<span class="link" role="link" tabindex="0" data-navigate="${esc(p.path)}">${esc(`${p.dashboard} › ${p.view}`)}</span>`).join(', ')}`
      : esc(t('inNoCard'));
    // Its devices, by their names: the thermostat's, then the scheduled thermostat's (Chauffage)
    const devices = thermostatDevices(hass, src, climate).map((id) => deviceNamedLinkHtml(hass, id)).filter(Boolean);
    return `<div class="about">
        ${shown ? `<div>${shown}</div>` : ''}
        ${devices.length ? `<div>${esc(t('panelDevices'))} ${devices.join(', ')}</div>` : ''}
      </div>
      <div class="control">
        <button class="btn${paused ? ' primary' : ''}" data-pause="${paused ? '0' : '1'}">${esc(t(paused ? 'resumeShort' : 'pauseShort'))}</button>
        <span class="badge ${paused ? 'paused' : 'on'}">${esc(t(paused ? 'paused' : 'controlled'))}</span>
      </div>`;
  }

  // The Thermostats page of a new user, before the first thermostat: what Chauffage does, and
  // every climate of Home Assistant to tick (none at first: Chauffage controls it at once)
  _welcomeHtml(src) {
    const t = this._t;
    const climates = Object.keys(this._hass.states).filter((e) => e.startsWith('climate.'))
      .sort((a, b) => this._name(a).localeCompare(this._name(b)));
    const steps = ['welcomeStep1', 'welcomeStep2', 'welcomeStep3'].map((k) => `<li>${esc(t(k))}</li>`).join('');
    const head = `<h2>${esc(t('welcomeTitle'))}</h2><p>${esc(t('welcomeIntro'))}</p><ol class="steps">${steps}</ol>`;
    if (!climates.length) {
      return `${head}<p class="none">${esc(t('welcomeNoClimate'))}</p>
        <button class="btn primary" data-navigate="/config/integrations/dashboard">${esc(t('welcomeAddDevice'))}</button>`;
    }
    const picked = climates.filter((c) => this._picked.has(c));
    const picks = climates.map((c) => `<label class="pick"><input type="checkbox" data-pick="${esc(c)}"${this._picked.has(c) ? ' checked' : ''}>
        <span class="pick-name">${esc(this._name(c))}<small>${esc(c)}</small></span></label>`).join('');
    const eco = src.presets().find((l) => l.id === 'eco') || src.presets()[0];
    const preset = eco ? eco.name || makeLocale(this._hass).preset(eco.id) : '';
    const label = picked.length === 0 ? t('welcomeStartNone')
      : picked.length === 1 ? t('welcomeStartOne') : t('welcomeStartMany', { count: picked.length });
    return `${head}<h3>${esc(t('welcomePick'))}</h3><div class="picks">${picks}</div>
      <p class="note">${esc(t('welcomeNote', { preset }))}</p>
      <button class="btn primary" data-start${picked.length ? '' : ' disabled'}>${esc(label)}</button>
      ${this._error ? `<div class="error">${esc(this._error)}</div>` : ''}`;
  }

  async _tile(climate, host) {
    const helpers = await cardHelpers();
    if (!helpers || !host.isConnected) return;
    const tile = helpers.createCardElement({ type: 'tile', entity: climate, state_content: ['current_temperature', 'hvac_action'] });
    tile.hass = this._hass;
    host.appendChild(tile);
    this._cards.push(tile);
  }

  _name(climate) {
    const state = this._hass.states[climate];
    return (state && state.attributes.friendly_name) || climate;
  }

  async _onClick(e) {
    const el = e.target.closest('[data-page], [data-more-info], [data-navigate], [data-device], [data-activate], [data-pause], [data-create-open], [data-create], [data-create-cancel], [data-group-days], [data-history], [data-start], [data-close-next]');
    if (!el || !this.shadowRoot.contains(el)) return;
    e.preventDefault();
    const ds = el.dataset;
    const src = dataSource(this._hass);
    const route = panelRoute(this._route && this._route.path, src, this._hass);
    this._error = null;
    try {
      if (ds.page != null) return openPanel(ds.page);
      if (ds.moreInfo) return openMoreInfo(this, ds.moreInfo);
      if (ds.navigate) return navigate(ds.navigate);
      if (ds.device) return openDevice(ds.device);
      if ('groupDays' in ds || 'history' in ds) {
        if ('history' in ds) {
          this._historyOn = !this._historyOn;
        } else {
          // As on the card: grouping the days hides the history, which shows each day
          this._groupDays = !(this._groupDays && !this._historyOn);
          this._historyOn = false;
        }
        try {
          localStorage.setItem(LS_GROUP, this._groupDays ? '1' : '0');
          localStorage.setItem(LS_HISTORY, this._historyOn ? '1' : '0');
        } catch (err) { /* ignore */ }
        return this._update();
      }
      if ('closeNext' in ds) {
        try { localStorage.setItem(LS_NEXT_STEPS, 'closed'); } catch (err) { /* ignore */ }
        return this._update();
      }
      if ('start' in ds) {
        // Scheduled with no week of their own: the integration gives them the week of a new
        // schedule in each schedule, as a thermostat added to a card
        const climates = [...this._picked].sort();
        if (!climates.length) return undefined;
        try { localStorage.setItem(LS_NEXT_STEPS, 'pending'); } catch (err) { /* ignore */ }
        await src.saveWeeks(Object.fromEntries(climates.map((c) => [c, {}])), null,
          Object.fromEntries(climates.map((c) => [c, null])));
        this._picked.clear();
        return this._update();
      }
      if (ds.activate) return await src.activateSchedule(ds.activate);
      if (ds.pause != null) return await src.setPaused(route.id, ds.pause === '1');
      if ('createOpen' in ds || 'createCancel' in ds) {
        this._creating = 'createOpen' in ds;
        this._focusNew = this._creating;
        return this._update();
      }
      if ('create' in ds) {
        const name = this.shadowRoot.querySelector('[data-new-name]').value.trim();
        if (!name) return undefined;
        await src.setSchedules([...src.schedules().map((id) => ({ id })), { name }], src.revision);
        this._creating = false;
        return this._update();
      }
    } catch (err) {
      this._error = this._t('error', { message: err.message || err.code || err });
      this._update();
    }
    return undefined;
  }
}

// Home Assistant's card helpers (its own cards, for example a tile). They exist once a dashboard
// was loaded: outside one, the panel loads the dashboards' code first, as custom panels do.
// Prototype: an internal of Home Assistant's frontend, null if it changes.
async function cardHelpers() {
  if (window.loadCardHelpers) return window.loadCardHelpers();
  try {
    await customElements.whenDefined('partial-panel-resolver');
    const resolver = document.createElement('partial-panel-resolver');
    resolver.hass = { panels: [{ url_path: 'tmp', component_name: 'lovelace' }] };
    resolver._updateRoutes();
    await resolver.routerOptions.routes.tmp.load();
    return window.loadCardHelpers ? window.loadCardHelpers() : null;
  } catch (e) {
    return null;
  }
}


const PANEL_CSS = `
  :host { display:block; min-height:100vh; background:var(--primary-background-color); color:var(--primary-text-color); }
  .toolbar { display:flex; align-items:center; gap:8px; height:56px; padding:0 12px;
    background:var(--app-header-background-color, var(--primary-color)); color:var(--app-header-text-color, #fff); }
  .title { flex:1; font-size:20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tabs { display:flex; overflow-x:auto; scrollbar-width:none; padding:0 8px;
    background:var(--app-header-background-color, var(--primary-color)); }
  .tab { flex:0 0 auto; padding:12px 14px; color:var(--app-header-text-color, #fff); opacity:.75;
    text-decoration:none; font-size:14px; border-bottom:2px solid transparent; white-space:nowrap; }
  .tab.on { opacity:1; border-bottom-color:currentColor; font-weight:500; }
  .content { max-width:1100px; margin:0 auto; padding:8px 8px 24px; }
  h2 { margin:20px 8px 8px; font-size:16px; font-weight:500; }
  h3 { margin:16px 8px 6px; font-size:14px; font-weight:500; color:var(--secondary-text-color); }
  h3 [role="link"], .name, .link { cursor:pointer; }
  h3 [role="link"]:hover, .name:hover, .link:hover { color:var(--primary-color); text-decoration:underline; }
  .box { padding:8px 16px; border-radius:var(--ha-card-border-radius, 12px); background:var(--card-background-color);
    border:1px solid var(--divider-color); }
  .row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:8px 0; }
  .box .row + .row { border-top:1px solid var(--divider-color); }
  .name { font-weight:500; }
  .grow { flex:1; }
  .badge { padding:1px 8px; border-radius:10px; font-size:12px; background:rgba(127,127,127,.18); color:var(--secondary-text-color); }
  .badge.on { background:rgba(67,160,71,.18); color:var(--success-color, #43a047); }
  /* Paused: Chauffage sends nothing, the thermostat runs by hand; it must be seen at a glance */
  .badge.paused { background:var(--warning-color, #ffa600); color:#000; font-weight:500; }
  .control .badge { font-size:13px; padding:3px 10px; }
  .btn { border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color);
    padding:6px 12px; border-radius:8px; cursor:pointer; font:inherit; font-size:14px; min-height:36px; }
  .btn.primary { background:var(--primary-color); border-color:var(--primary-color); color:var(--text-primary-color, #fff); }
  input[data-new-name] { flex:1 1 160px; min-height:36px; padding:0 10px; border:1px solid var(--divider-color); border-radius:8px;
    background:var(--card-background-color); color:var(--primary-text-color); font:inherit; }
  .muted { padding:4px 0; font-size:14px; color:var(--secondary-text-color); }
  .links { display:flex; flex-wrap:wrap; gap:6px 16px; padding:6px 0 8px; font-size:14px; }
  .links [data-device], .links .link { color:var(--primary-color); cursor:pointer; }
  .error { padding:6px 0; color:var(--error-color, #db4437); }
  .welcome { padding:16px 20px; margin-top:8px; }
  .welcome h2 { margin:4px 0 8px; font-size:20px; }
  .welcome h3 { margin:20px 0 8px; font-size:15px; font-weight:500; color:var(--primary-text-color); }
  .welcome p, .welcome ol { margin:6px 0; line-height:1.5; }
  .welcome ol { padding-left:22px; }
  .picks { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:6px 16px; }
  .pick { display:flex; align-items:center; gap:8px; min-height:40px; cursor:pointer; }
  .pick input { flex:none; width:18px; height:18px; margin:0; }
  .pick-name { display:flex; flex-direction:column; min-width:0; }
  .pick-name small { font-size:12px; color:var(--secondary-text-color); overflow:hidden; text-overflow:ellipsis; }
  .welcome .note { font-size:14px; color:var(--secondary-text-color); }
  .welcome [data-start], .welcome [data-navigate] { margin-top:8px; }
  .btn[disabled] { opacity:.5; cursor:default; }
  .notice { margin:8px 0 0; padding:10px 14px; border-radius:var(--ha-card-border-radius, 12px);
    background:var(--secondary-background-color); font-size:14px; }
  .notice a { color:var(--primary-color); margin-left:6px; }
  .next-steps { margin:8px 0 12px; padding:8px 16px 12px; }
  .next-head { display:flex; align-items:center; gap:8px; }
  .next-head h2 { flex:1; margin:8px 0; }
  .next-steps ul { margin:4px 0; padding-left:20px; line-height:1.6; }
  .crumbs { display:flex; align-items:baseline; gap:8px; min-width:0; }
  .crumbs a { color:inherit; opacity:.8; text-decoration:none; }
  .crumbs a:hover { opacity:1; text-decoration:underline; }
  .crumbs span:last-child { overflow:hidden; text-overflow:ellipsis; }
  .sep { opacity:.6; }
  /* The header, aligned with the surface below: the tile top right, the rest on the left; on
     a phone, the tile first */
  .head { display:grid; grid-template-columns:minmax(0, 1fr); gap:12px; margin:8px 0 16px; }
  .head .tile { order:-1; min-width:0; }
  .control { display:flex; align-items:center; gap:8px; margin-top:8px; }
  .about { font-size:14px; color:var(--secondary-text-color); }
  .about > div { padding:2px 0; }
  @media (min-width:600px) {
    .head { grid-template-columns:minmax(0, 1fr) minmax(240px, 320px); align-items:start; }
    .head .tile { order:0; grid-column:2; grid-row:1; }
    .head [data-fill] { grid-column:1; grid-row:1; }
  }
  .sheet { padding:4px 16px 16px; }
  .sheet h2 { margin:16px 0 8px; }
  .sheet h3 { margin:20px 0 6px; padding-top:12px; border-top:1px solid var(--divider-color); }
  .sheet .h2-row { margin:24px 0 0; padding-top:16px; border-top:1px solid var(--divider-color); }
  .sheet .h2-row h2 { margin:0; }
  .sheet .hint { margin:4px 0 0; }
  .sheet h3 { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .copy { min-height:30px; padding:2px 8px; border:1px solid var(--divider-color); border-radius:8px; font:inherit;
    font-size:13px; font-weight:normal; background:var(--card-background-color); color:var(--primary-text-color); }
  .h2-row { display:flex; align-items:center; gap:12px; margin-right:8px; }
  .h2-row h2 { flex:1; }
  .chip { border:1px solid var(--divider-color); border-radius:16px; padding:4px 12px; background:transparent;
    color:var(--secondary-text-color); font:inherit; font-size:13px; cursor:pointer; }
  .chip.on { border-color:var(--primary-color); color:var(--primary-color); }
  .hint { margin:0 8px; font-size:12px; color:var(--secondary-text-color); }
  .hint .touch { display:none; }
  @media (hover:none) { .hint .mouse { display:none; } .hint .touch { display:inline; } }
  [data-device] { color:var(--primary-color); cursor:pointer; }
`;

// The integration's own icons (`chauffage:<name>`), as HA's custom icon sets: the sidebar shows
// the panel's icon, drawn from the brand icon (weeks of slots and a clock)
const ICONS = {
  logo: 'M3.5 3h6v3h-6a1.5 1.5 0 0 1 0-3zM11 3h4v3h-4zM16 3h4.5a1.5 1.5 0 0 1 0 3H16z'
    + 'M3.5 8h4v3h-4a1.5 1.5 0 0 1 0-3zM9 8h5v3H9zM15 8h5.5a1.5 1.5 0 0 1 0 3H15z'
    + 'M3.5 13h6.5v3H3.5a1.5 1.5 0 0 1 0-3zM3.5 18h2.5v3H3.5a1.5 1.5 0 0 1 0-3zM7 18h3v3H7z'
    + 'M17 11.5a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM17 13a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z'
    + 'M16.25 14.5h1.5v3.1l2 1.2-.75 1.3-2.75-1.6z',
};
window.customIcons = window.customIcons || {};
window.customIcons.chauffage = {
  getIcon: async (name) => ({ path: ICONS[name] || ICONS.logo }),
  getIconList: async () => Object.keys(ICONS).map((name) => ({ name })),
};

// Guards: the file may be loaded twice (the integration, and a copy left in www/ by the v0.1
// package or a dashboard resource); define things only once.
function defineElements() {
  if (!customElements.get('chauffage-programme-card')) customElements.define('chauffage-programme-card', ChauffageProgrammeCard);
  if (!customElements.get('chauffage-moreinfo')) customElements.define('chauffage-moreinfo', ChauffageMoreInfo);
  if (!customElements.get('chauffage-programme-card-editor')) customElements.define('chauffage-programme-card-editor', ChauffageProgrammeCardEditor);
  if (!customElements.get('chauffage-thermostat-card')) customElements.define('chauffage-thermostat-card', ChauffageThermostatCard);
  if (!customElements.get('chauffage-thermostat-card-editor')) customElements.define('chauffage-thermostat-card-editor', ChauffageThermostatCardEditor);
  if (!customElements.get('chauffage-panel')) customElements.define('chauffage-panel', ChauffagePanel);
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

if (!window.customCards.some((c) => c.type === 'chauffage-thermostat-card')) window.customCards.push({
  type: 'chauffage-thermostat-card',
  get name() { return pickerLocale().t('thermostatCardName'); },
  get description() { return pickerLocale().t('thermostatCardDescription'); },
  preview: true,
  documentationURL: 'https://github.com/armellarcier/ha-chauffage#readme',
  // "By entity" tab (HA 2026.6+): this thermostat's card
  getEntitySuggestion: (hass, entityId) => (entityId.startsWith('climate.')
    ? { config: { type: 'custom:chauffage-thermostat-card', entity: entityId } }
    : null),
});

console.info(`%c ha-chauffage %c ${VERSION} `, 'background:#f57c00;color:#fff;border-radius:3px 0 0 3px', 'background:#555;color:#fff;border-radius:0 3px 3px 0');

// Exports for the tests (tests/js); no effect on Home Assistant, which loads this file as a module.
export {
  VERSION, I18N, compareVersions, makeLocale, toMin, toHM, parseDate, normalize, parseDay, serializeDay,
  overridePieces, overrideLabel, historyDays, rowsOfStates, MORE_INFO_CFG, INTEGRATION, dataSource,
  ChauffageProgrammeCard, ChauffageMoreInfo, ChauffageProgrammeCardEditor, ChauffageThermostatCard,
  ChauffagePanel, panelRoute, cardPlacements, leaveMoreInfo, ICONS,
};
