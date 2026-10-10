// Fake hass and card factory for the tests.
import './setup.mjs';
import { ChauffageProgrammeCard, ChauffageMoreInfo, INTEGRATION } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

export const WEEKDAY = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', '22:30 eco'];
export const WEEKEND = ['00:00 eco', '08:00 comfort', '23:00 eco'];

/** Minimal HA states: mode, two thermostats, schedules, overrides. */
// Default user: French, 24 h clock, formats following the language (most existing tests are in French)
export const FRENCH = { language: 'fr', time_format: 'language', number_format: 'language', first_weekday: 'language' };

export function fakeHass({ schedules, overrides = {}, mode = 'Normal', locale = FRENCH } = {}) {
  const events = [];
  const states = {
    'input_select.mode_chauffage': { state: mode, attributes: { options: ['Normal', 'Absent', 'Vacances'] }, last_updated: '1' },
    'climate.salon': { state: 'heat', attributes: { friendly_name: 'Salon', current_temperature: 20, preset_mode: 'eco' }, last_updated: '1' },
    'climate.bureau': { state: 'heat', attributes: { friendly_name: 'Bureau', current_temperature: 19, preset_mode: 'comfort' }, last_updated: '1' },
    'sensor.programmes_chauffage': {
      state: 'x', last_updated: '1',
      attributes: { programmes: schedules ?? { 'climate.salon': { Normal: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } } },
    },
    'sensor.derogations_chauffage': { state: 'x', last_updated: '1', attributes: { derogations: overrides } },
  };
  const services = [];
  return {
    states,
    events,
    services,
    locale,
    language: locale.language,
    config: { unit_system: { temperature: '°C' } },
    callWS: async (msg) => { events.push(msg); },
    callService: async (domain, service, data) => { services.push({ domain, service, data }); },
  };
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

// ----- the Chauffage integration (v0.2+): websocket API instead of sensors and events -----

const PAIRS = (list) => list.map((s) => s.split(' '));
export const INTEGRATION_DATA = () => ({
  modes: [{ id: 'normal', name: 'Normal' }, { id: 'away', name: 'Absent' }, { id: 'holiday', name: 'Vacances' }],
  active_mode: 'normal',
  schedules: { 'climate.salon': { normal: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND].map(PAIRS) } },
  overrides: {},
  revision: 4,
  override_duration: 120,
});

/** hass with the integration set up: `push(data)` sends a websocket update to the card. */
export function fakeIntegrationHass({ data = INTEGRATION_DATA(), locale = FRENCH, reply } = {}) {
  INTEGRATION.connection = null; // one subscription per page: reset between tests
  INTEGRATION.data = null;
  INTEGRATION.listeners.clear();
  const hass = fakeHass({ locale });
  delete hass.states['sensor.programmes_chauffage'];
  delete hass.states['sensor.derogations_chauffage'];
  delete hass.states['input_select.mode_chauffage'];
  hass.services = { chauffage: { set_override: {}, clear_override: {} } };
  let listener = null;
  hass.subscriptions = [];
  hass.connection = {
    subscribeMessage: (cb, msg) => {
      hass.subscriptions.push(msg);
      listener = cb;
      if (data) cb(data);
      return Promise.resolve(() => {});
    },
  };
  hass.callWS = async (msg) => {
    hass.events.push(msg);
    if (reply) return reply(msg);
    return msg.type === 'chauffage/schedules/save' ? { revision: msg.revision + 1 } : null;
  };
  hass.push = (d) => listener(d);
  return hass;
}
