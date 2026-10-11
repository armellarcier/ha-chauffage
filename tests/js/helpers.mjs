// Fake hass (with the Chauffage integration) and card factory for the tests.
import './setup.mjs';
import { ChauffageProgrammeCard, ChauffageMoreInfo, INTEGRATION } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

export const WEEKDAY = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', '22:30 eco'];
export const WEEKEND = ['00:00 eco', '08:00 comfort', '23:00 eco'];

// Default user: French, 24 h clock, formats following the language (most existing tests are in French)
export const FRENCH = { language: 'fr', time_format: 'language', number_format: 'language', first_weekday: 'language' };

// The integration's default modes and levels (created in the HA language)
const MODES = [{ id: 'normal', name: 'Normal' }, { id: 'away', name: 'Absent' }, { id: 'holiday', name: 'Vacances' }];
const LEVEL_NAMES = {
  en: { comfort: 'Comfort', eco: 'Eco', boost: 'Boost', frost: 'Frost protection' },
  fr: { comfort: 'Confort', eco: 'Éco', boost: 'Boost', frost: 'Hors-gel' },
};
export const LEVELS = (language = 'fr') => [
  ['comfort', '#f57c00', 20], ['eco', '#43a047', 17], ['boost', '#e53935', 21], ['frost', '#29b6f6', 7],
].map(([id, color, temperature]) => ({ id, name: LEVEL_NAMES[language.startsWith('fr') ? 'fr' : 'en'][id], color, temperature }));

const PAIRS = (list) => list.map((s) => s.split(' '));
const SALON = { 'climate.salon': { Normal: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } };

/**
 * The data pushed by the integration (`chauffage/subscribe`). Shortcuts: `schedules` by mode
 * name with "HH:MM level" slots, `mode` = name of the active mode.
 */
export function integrationData({ schedules = SALON, overrides = {}, mode = 'Normal', language = 'fr' } = {}) {
  const idOf = (name) => MODES.find((m) => m.name === name).id;
  const out = {};
  for (const [climate, byMode] of Object.entries(schedules)) {
    out[climate] = {};
    for (const [name, week] of Object.entries(byMode)) out[climate][idOf(name)] = week.map(PAIRS);
  }
  return {
    modes: MODES,
    active_mode: idOf(mode),
    levels: LEVELS(language),
    mappings: {},
    targets: {},
    schedules: out,
    overrides,
    revision: 4,
    override_duration: 120,
    use_presets: true,
  };
}
export const INTEGRATION_DATA = () => integrationData();

/**
 * Home Assistant with the integration set up: two thermostats, and the integration's data.
 * `hass.events` records the websocket commands; `hass.push(data)` sends an update to the card;
 * `reply(msg)` answers (or throws for) a command.
 */
export function fakeHass({ data, schedules, overrides, mode, locale = FRENCH, reply } = {}) {
  INTEGRATION.connection = null; // one subscription per page: reset between tests
  INTEGRATION.data = null;
  INTEGRATION.listeners.clear();
  if (data === undefined) data = integrationData({ schedules, overrides, mode, language: locale.language });
  const events = [];
  let listener = null;
  const hass = {
    states: {
      'climate.salon': { state: 'heat', attributes: { friendly_name: 'Salon', current_temperature: 20, preset_mode: 'eco' }, last_updated: '1' },
      'climate.bureau': { state: 'heat', attributes: { friendly_name: 'Bureau', current_temperature: 19, preset_mode: 'comfort' }, last_updated: '1' },
    },
    events,
    services: { chauffage: { set_override: {}, clear_override: {} } },
    locale,
    language: locale.language,
    config: { unit_system: { temperature: '°C' } },
    subscriptions: [],
    connection: {
      subscribeMessage: (cb, msg) => {
        hass.subscriptions.push(msg);
        listener = cb;
        if (data) cb(data);
        return Promise.resolve(() => {});
      },
    },
    callWS: async (msg) => {
      events.push(msg);
      if (reply) return reply(msg);
      return msg.type === 'chauffage/schedules/save' ? { revision: msg.revision + 1 } : null;
    },
    push: (d) => listener(d),
  };
  return hass;
}
export const fakeIntegrationHass = fakeHass;

/** Home Assistant without the integration (the card was added, the integration was not). */
export function hassWithoutIntegration({ locale = FRENCH } = {}) {
  const hass = fakeHass({ locale, data: null });
  delete hass.services.chauffage;
  delete hass.connection;
  return hass;
}

/** Configured card fed with hass; detach it at the end of the test (stops its timer). */
export function createCard(hass, config = {}) {
  const card = document.createElement('chauffage-programme-card');
  card.setConfig({ thermostats: ['climate.salon', 'climate.bureau'], show: 'all', ...config });
  document.body.appendChild(card);
  card.hass = hass;
  return card;
}

export function cleanup() {
  document.body.innerHTML = '';
  try { localStorage.clear(); } catch (e) { /* ignore */ }
}

export { ChauffageProgrammeCard, ChauffageMoreInfo };
