// Fake hass (with the Chauffage integration) and card factory for the tests.
import './setup.mjs';
import { ChauffageProgrammeCard, ChauffageMoreInfo, ChauffageThermostatCard, resetClient } from '../../frontend/src/index.ts';

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
// Each with its temperature when heating, and when cooling: frost protection has none (#91)
export const PRESETS = (language = 'fr') => [
  ['comfort', '#f57c00', 20, 25], ['eco', '#43a047', 17, 27], ['boost', '#e53935', 21, 23], ['frost', '#29b6f6', 7],
].map(([id, color, temperature, cool]) => ({ id, name: PRESET_NAMES[language.startsWith('fr') ? 'fr' : 'en'][id], color, temperature,
  ...(cool ? { cool_temperature: cool } : {}) }));

const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
// A slot as the integration sends it: [start, preset] or [start, preset, settings]
const PAIRS = (list) => list.map((s) => (Array.isArray(s) ? s : s.split(' ')));
const SALON = { 'climate.salon': { Normal: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND] } };

/**
 * The data pushed by the integration (`chauffage/subscribe`). Shortcuts: `weeks` by schedule
 * name with "HH:MM preset" slots, `schedule` = name of the active schedule.
 */
export function integrationData({ weeks = SALON, overrides = {}, schedule = 'Normal', language = 'fr', paused = [], planned = {} } = {}) {
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
    // The scheduled thermostats; `paused`: the ones paused; each saved against its revision
    thermostats: Object.fromEntries(Object.keys(out).map((climate) => [climate, { paused: paused.includes(climate), revision: 7 }])),
    mappings: {},
    targets: {},
    weeks: out,
    overrides,
    revision: 4,
    override_duration: 120,
    manual_override_end: 'duration',
    off_override_end: 'next_slot',
    use_presets: true,
    // What each thermostat follows now and the next different preset (computed by the integration)
    planned,
    // The entities and the device the cards open (#39)
    schedule_entities: Object.fromEntries(schedules.map((s) => [s.id, `switch.chauffage_schedule_${s.id}`])),
    thermostat_entities: Object.fromEntries(Object.keys(out).map((climate) => {
      const name = climate.split('.')[1];
      return [climate, { control: `switch.${name}_control`, override: `binary_sensor.${name}_override`, planned_preset: `sensor.${name}_planned_preset` }];
    })),
    schedule_select: 'select.chauffage_schedule',
    device_id: 'chauffage-device',
  };
}
export const INTEGRATION_DATA = () => integrationData();

/**
 * What a preset is worth on a thermostat, as the fake integration answers
 * `chauffage/preset/preview`: the integration's rule (domain.Preset.value_on), as the card
 * computed it before it asked the integration. When heating: preset_mode or temperature. When
 * cooling, on a thermostat that cools: cool_preset_mode or cool_temperature. In heat/cool, on a
 * thermostat that takes a range: target_temp_low and target_temp_high. `cell`: the value set by
 * hand on the thermostat.
 */
export function valueOn(preset, cell, hass, climate, usePresets = true) {
  const set = cell || {};
  const st = hass.states[climate];
  const attributes = (st && st.attributes) || {};
  const listed = Array.isArray(attributes.hvac_modes) ? attributes.hvac_modes.map(String) : [];
  const own = usePresets && st && (attributes.preset_modes || []).map(String).includes(preset.id) ? preset.id : null;
  const heat = preset.temperature ?? null;
  const cool = preset.cool_temperature ?? null;
  const out = {};
  if ('preset_mode' in set) out.preset_mode = set.preset_mode;
  else if ('temperature' in set) out.temperature = set.temperature;
  else if (heat != null) Object.assign(out, own ? { preset_mode: own } : { temperature: heat });
  if (listed.includes('cool')) {
    if ('cool_temperature' in set) out.cool_temperature = set.cool_temperature;
    else if ('preset_mode' in set) out.cool_preset_mode = set.preset_mode;
    else if (cool != null) Object.assign(out, own ? { cool_preset_mode: own } : { cool_temperature: cool });
  }
  const low = 'temperature' in set ? set.temperature : heat;
  const high = 'cool_temperature' in set ? set.cool_temperature : cool;
  const range = listed.includes('heat_cool') && (Number(attributes.supported_features) & 2) !== 0;
  if (range && low != null && high != null && low < high) {
    out.target_temp_low = low;
    out.target_temp_high = high;
  }
  for (const attr of ['fan_mode', 'swing_mode', 'swing_horizontal_mode']) if (attr in set) out[attr] = set[attr];
  return out;
}

// The answer of the fake integration to `chauffage/preset/preview`: the value, and the HVAC
// modes the preset can be used in
function presetPreview(hass, data, { entity_id: climate, preset, value }) {
  const worth = valueOn(preset, value, hass, climate, !data || data.use_presets !== false);
  const modes = [];
  if ('preset_mode' in worth || 'temperature' in worth) modes.push('heat');
  if ('cool_preset_mode' in worth || 'cool_temperature' in worth) modes.push('cool');
  if ('target_temp_low' in worth && 'target_temp_high' in worth) modes.push('heat_cool');
  return { value: worth, modes };
}

/**
 * Home Assistant with the integration set up: two thermostats, and the integration's data.
 * `hass.events` records the websocket commands; `hass.push(data)` sends an update to the card;
 * `reply(msg)` answers (or throws for) a command.
 */
export function fakeHass({ data, weeks, overrides, schedule, paused, planned, locale = FRENCH, reply } = {}) {
  resetClient(); // one subscription per page: a new one for each test
  if (data === undefined) data = integrationData({ weeks, overrides, schedule, paused, planned, language: locale.language });
  const events = [];
  const held = []; // the questions about presets not answered yet (presetPreviewAnswers 'hold')
  let globalRevision = data ? data.revision : 4;
  let listener = null;
  const hass = {
    states: {
      'climate.salon': { state: 'heat', attributes: { friendly_name: 'Salon', current_temperature: 20, preset_mode: 'eco' }, last_updated: '1' },
      'climate.bureau': { state: 'heat', attributes: { friendly_name: 'Bureau', current_temperature: 19, preset_mode: 'comfort' }, last_updated: '1' },
    },
    // Entity registry as HA's frontend has it: the salon has a device, the bureau none
    entities: { 'climate.salon': { entity_id: 'climate.salon', device_id: 'salon-device' }, 'climate.bureau': { entity_id: 'climate.bureau' } },
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
    // What the cards asked about presets (chauffage/preset/preview): a question, not a change, kept
    // out of `events`
    presetPreviews: [],
    // How the fake integration answers these questions: 'answer' at once, 'hold' until
    // `hass.answerPresetPreviews()`, or 'fail'
    presetPreviewAnswers: 'answer',
    answerPresetPreviews: () => { for (const answer of held.splice(0)) answer(); },
    callWS: async (msg) => {
      if (msg.type === 'chauffage/preset/preview') {
        hass.presetPreviews.push(msg);
        if (hass.presetPreviewAnswers === 'fail') throw { code: 'unknown_error', message: 'No answer' };
        if (hass.presetPreviewAnswers === 'hold') await new Promise((resolve) => { held.push(resolve); });
        return presetPreview(hass, data, msg);
      }
      events.push(msg);
      if (reply) return reply(msg);
      if (msg.type === 'chauffage/weeks/save') {
        // Like the integration: a new revision for each thermostat saved, and the global one
        globalRevision += 1;
        const revisions = Object.fromEntries(Object.keys(msg.weeks).map((c) => [c, ((msg.revisions || {})[c] ?? 0) + 1]));
        return { revision: globalRevision, revisions };
      }
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
  // As the panel does for a sheet: `sheet` and `schedule` are the card's properties, not options
  const { sheet = null, schedule, ...options } = config;
  const card = document.createElement('chauffage-programme-card');
  card.setConfig({ thermostats: ['climate.salon', 'climate.bureau'], show: 'all', ...options });
  card.sheet = sheet;
  if (schedule) card.schedule = schedule;
  document.body.appendChild(card);
  card.hass = hass;
  return card;
}

/**
 * A view of the panel (`view`: presets, schedules, thermostats or rules), in its frame, as the
 * panel shows it. Read it through the frame, as a card: `$(frame, …)`. To draw the view again,
 * `frame.view.requestUpdate()`.
 */
export function createView(hass, view, { thermostats = ['climate.salon', 'climate.bureau'] } = {}) {
  const el = document.createElement(`chauffage-${view}-view`);
  el.thermostats = thermostats;
  const frame = document.createElement('chauffage-view-frame');
  frame.view = el;
  document.body.appendChild(frame);
  el.hass = hass;
  return frame;
}


/** Types a time in one of the cards' time fields, then leaves the field: the time is applied then. */
export function typeTime(field, value) {
  field.focus();
  field.value = value;
  field.blur();
}

/** Presses a key in a field, for example an arrow key or Enter in a time field. */
export function pressKey(field, key) {
  field.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/**
 * Home Assistant's dialog manager, as its frontend has it (make-dialog-manager.ts): the
 * `<home-assistant>` element takes `show-dialog`, creates the dialog once, gives it hass, puts it
 * on top and calls its showDialog(). Each dialog opened gets a history entry: `back()` is the
 * browser's Back, which closes the dialog on top with its closeDialog().
 * `shown` records the events; `dialog(tag)` is the dialog element; `open` the dialogs open.
 */
export function fakeDialogManager(hass) {
  const ha = document.createElement('home-assistant');
  ha.attachShadow({ mode: 'open' });
  document.body.appendChild(ha);
  const loaded = {};
  const manager = {
    shown: [],
    open: [],
    dialog: (tag) => loaded[tag],
    back: () => {
      const tag = manager.open.pop();
      if (tag) loaded[tag].closeDialog();
    },
  };
  // The cards and the panel are not inside <home-assistant> here: the event reaches the window
  const listener = async (e) => {
    const { dialogTag, dialogImport, dialogParams } = e.detail;
    manager.shown.push(e.detail);
    if (!loaded[dialogTag]) {
      await dialogImport();
      const el = document.createElement(dialogTag);
      el.addEventListener('dialog-closed', (ev) => {
        manager.open = manager.open.filter((t) => t !== ev.detail.dialog);
      });
      loaded[dialogTag] = el;
    }
    manager.open.push(dialogTag);
    const el = loaded[dialogTag];
    el.hass = hass;
    ha.shadowRoot.appendChild(el);
    el.showDialog(dialogParams);
  };
  window.addEventListener('show-dialog', listener);
  (window.__dialogManagers = window.__dialogManagers || []).push(listener);
  return manager;
}

export function cleanup() {
  for (const listener of window.__dialogManagers || []) window.removeEventListener('show-dialog', listener);
  window.__dialogManagers = [];
  document.body.innerHTML = '';
  try { localStorage.clear(); } catch (e) { /* ignore */ }
}

export { ChauffageProgrammeCard, ChauffageMoreInfo, ChauffageThermostatCard };
