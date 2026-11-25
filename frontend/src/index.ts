/*
 * chauffage-programme-card
 * Lovelace card: visual editor for the weekly heating schedules
 * 7 days, each with one row per displayed thermostat.
 *
 * Served by the Chauffage integration (custom_components/chauffage) and loaded on every page;
 * reads and writes through its websocket API.
 */
import { ChauffageProgrammeCard } from './cards/programme-card.ts';
import { ChauffageRoomsCard } from './cards/rooms-card.ts';
import { ChauffageSummaryCard } from './cards/summary-card.ts';
import { ChauffageThermostatCard, ChauffageThermostatCardEditor } from './cards/thermostat-card.ts';
import { dataSource } from './client/snapshot.ts';
import { ChauffageProgrammeCardEditor, ChauffageRoomsCardEditor, ChauffageSummaryCardEditor } from './editors.ts';
import { makeLocale } from './i18n/locale.ts';
import { ChauffageMoreInfo } from './more-info.ts';
import { ChauffagePanel } from './panel.ts';
import { ChauffageSettingsDialog, SETTINGS_DIALOG } from './settings-dialog.ts';
import { VERSION } from './version.ts';

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
  if (!customElements.get('chauffage-rooms-card')) customElements.define('chauffage-rooms-card', ChauffageRoomsCard);
  if (!customElements.get('chauffage-summary-card')) customElements.define('chauffage-summary-card', ChauffageSummaryCard);
  if (!customElements.get('chauffage-rooms-card-editor')) customElements.define('chauffage-rooms-card-editor', ChauffageRoomsCardEditor);
  if (!customElements.get('chauffage-summary-card-editor')) customElements.define('chauffage-summary-card-editor', ChauffageSummaryCardEditor);
  if (!customElements.get('chauffage-panel')) customElements.define('chauffage-panel', ChauffagePanel);
  if (!customElements.get(SETTINGS_DIALOG)) customElements.define(SETTINGS_DIALOG, ChauffageSettingsDialog);
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
    const ha: any = document.querySelector('home-assistant');
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
  window.addEventListener('hass-more-info', (e: any) => {
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

if (!window.customCards.some((c) => c.type === 'chauffage-rooms-card')) window.customCards.push({
  type: 'chauffage-rooms-card',
  get name() { return pickerLocale().t('roomsCardName'); },
  get description() { return pickerLocale().t('roomsCardDescription'); },
  preview: true,
  documentationURL: 'https://github.com/armellarcier/ha-chauffage#readme',
});

if (!window.customCards.some((c) => c.type === 'chauffage-summary-card')) window.customCards.push({
  type: 'chauffage-summary-card',
  get name() { return pickerLocale().t('summaryCardName'); },
  get description() { return pickerLocale().t('summaryCardDescription'); },
  preview: true,
  documentationURL: 'https://github.com/armellarcier/ha-chauffage#readme',
});

console.info(`%c ha-chauffage %c ${VERSION} `, 'background:#f57c00;color:#fff;border-radius:3px 0 0 3px', 'background:#555;color:#fff;border-radius:0 3px 3px 0');

// Exports for the tests (tests/js); no effect on Home Assistant, which loads the bundle as a module.
export { ChauffageProgrammeCard } from './cards/programme-card.ts';
export { ChauffageThermostatCard } from './cards/thermostat-card.ts';
export { ChauffageClient, client, resetClient } from './client/chauffage-client.ts';
export { commands } from './client/commands.ts';
export { compareVersions, dataSource } from './client/snapshot.ts';
export { reloadPage } from './notices.ts';
export { chipTextColor, coolColor, derivedCoolColor } from './colors.ts';
export { toMin, toHM, parseDate } from './common.ts';
export { ChauffageProgrammeCardEditor } from './editors.ts';
export { parseTime } from './fields.ts';
export { historyDays, rowsOfStates } from './history.ts';
export { CHIP_STYLE, FIELD_BOX, valueOn, presetModes, slotModeOn } from './hvac.ts';
export { I18N } from './i18n/index.ts';
export { makeLocale } from './i18n/locale.ts';
export { ICONS };
export { cardPlacements, leaveMoreInfo } from './links.ts';
export { MORE_INFO_STYLE, ChauffageMoreInfo } from './more-info.ts';
export { planText } from './override-edit.ts';
export { tagSide, overridePieces, overrideLabel } from './override.ts';
export { ChauffagePanel, panelRoute } from './panel.ts';
export { fitTemperature } from './presets.ts';
export { normalize, joined, parseDay, serializeDay, slotToArray } from './slots.ts';
export { STYLE } from './styles.ts';
export { VERSION } from './version.ts';
