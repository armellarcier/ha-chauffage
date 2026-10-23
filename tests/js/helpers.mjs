// Fake hass (with the Chauffage integration) and card factory for the tests.
import './setup.mjs';
import { ChauffageProgrammeCard, ChauffageMoreInfo, INTEGRATION } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

export const WEEKDAY = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', '22:30 eco'];
export const WEEKEND = ['00:00 eco', '08:00 comfort', '23:00 eco'];

// Default user: French, 24 h clock, formats following the language (most existing tests are in French)
export const FRENCH = { language: 'fr', time_format: 'language', number_format: 'language', first_weekday: 'language' };

// Schedules and presets of an installation (presets are created in the HA language)
const SCHEDULES = () => [{ id: 'normal', name: 'Normal' }, { id: 'away', name: 'Absent' }, { id: 'holiday', name: 'Vacances' }];
const PRESET_NAMES = {
  en: { comfort: 'Comfort', eco: 'Eco', boost: 'Boost', frost: 'Frost protection' },
  fr: { comfort: 'Confort', eco: 'Éco', boost: 'Boost', frost: 'Hors-gel' },
};
export const PRESETS = (language = 'fr') => [
  ['comfort', '#f57c00', 20], ['eco', '#43a047', 17], ['boost', '#e53935', 21], ['frost', '#29b6f6', 7],
].map(([id, color, temperature]) => ({ id, name: PRESET_NAMES[language.startsWith('fr') ? 'fr' : 'en'][id], color, temperature }));

const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const PAIRS = (list) => list.map((s) => s.split(' '));
const SALON = { 'climate.salon': { Normal: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } };

/**
 * The data pushed by the integration (`chauffage/subscribe`). Shortcuts: `weeks` by schedule
 * name with "HH:MM preset" slots, `schedule` = name of the active schedule.
 */
export function integrationData({ weeks = SALON, overrides = {}, schedule = 'Normal', language = 'fr', paused = [] } = {}) {
  const schedules = SCHEDULES();
  const idOf = (name) => schedules.find((s) => s.name === name).id;
  const out = {};
  for (const [climate, byName] of Object.entries(weeks)) {
    out[climate] = {};
    for (const [name, week] of Object.entries(byName)) out[climate][idOf(name)] = week.map(PAIRS);
  }
  return {
    schedules,
    active_schedule: idOf(schedule),
    presets: PRESETS(language),
    // The scheduled thermostats; `paused`: the ones paused
    thermostats: Object.fromEntries(Object.keys(out).map((climate) => [climate, { paused: paused.includes(climate) }])),
    mappings: {},
    targets: {},
    weeks: out,
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
export function fakeHass({ data, weeks, overrides, schedule, paused, locale = FRENCH, reply } = {}) {
  INTEGRATION.connection = null; // one subscription per page: reset between tests
  INTEGRATION.data = null;
  INTEGRATION.listeners.clear();
  if (data === undefined) data = integrationData({ weeks, overrides, schedule, paused, language: locale.language });
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
    // Rules being tried (chauffage/rules/preview): { msg, send(event), closed }
    previews: [],
    connection: {
      subscribeMessage: (cb, msg) => {
        if (msg.type === 'chauffage/rules/preview') {
          const preview = { msg, send: cb, closed: false };
          hass.previews.push(preview);
          return Promise.resolve(() => { preview.closed = true; });
        }
        hass.subscriptions.push(msg);
        listener = cb;
        if (data) cb(data);
        return Promise.resolve(() => {});
      },
    },
    callWS: async (msg) => {
      events.push(msg);
      if (reply) return reply(msg);
      if (msg.type === 'chauffage/weeks/save') return { revision: msg.revision + 1 };
      if (msg.type === 'chauffage/schedules/set') {
        // Like the integration: kept ids keep their names, new schedules get an id from their name
        const names = Object.fromEntries((data || integrationData()).schedules.map((s) => [s.id, s.name]));
        const schedules = msg.schedules.map((s) => ({ id: s.id || slug(s.name), name: s.name || names[s.id] }));
        return { schedules, revision: msg.revision + 1 };
      }
      return null;
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
