// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The card shows the salon. It is Monday, 10:00.
import { afterEach, beforeEach, mock } from 'node:test';
import { PRESETS, createCard, fakeHass, integrationData } from '../helpers.mjs';
import { openOverride as openOverrideOf, openSlot, settle } from '../driver.mjs';
import { $, week } from './dom.mjs';

export const SALON = 'climate.salon'; // a heater
export const SUITE = 'climate.suite'; // a reversible unit that lists every HVAC mode, and takes a range
export const COMBLES = 'climate.combles'; // an air conditioner that only cools
export const ALL = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'auto', 'fan_only'];
export const DAY = ['00:00 eco', '14:00 comfort', '20:00 frost'];
export const both = (heat, cool) => ({ temperature: heat, cool_temperature: cool, target_temp_low: heat, target_temp_high: cool });
export const HEATS = { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } };
export const TARGETS = {
  [SALON]: HEATS,
  [SUITE]: { comfort: both(20, 25), eco: both(17, 27), boost: both(21, 23), frost: { temperature: 7 } },
  [COMBLES]: { comfort: { cool_temperature: 25 }, eco: { cool_temperature: 27 }, boost: { cool_temperature: 23 } },
};
// Monday 10:00
export const NOW = '2026-10-12T10:00:00+02:00';
export const at = (hhmm) => `2026-10-12T${hhmm}:00+02:00`;

export function setup({ suite = DAY, salon = DAY, combles = ['00:00 eco'], overrides, planned, targets = TARGETS, mappings = {} } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon), Absent: week(salon) }, [SUITE]: { Normal: week(suite) }, [COMBLES]: { Normal: week(combles) } },
    overrides, planned,
  });
  data.presets = PRESETS('fr');
  data.targets = targets;
  data.mappings = mappings;
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SALON].attributes.temperature = 17;
  hass.states[SUITE] = { state: 'heat', attributes: { friendly_name: 'Suite', temperature: 20, hvac_modes: ALL, supported_features: 3,
    fan_modes: ['auto', 'low', 'high'], swing_modes: ['off', 'vertical'] }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[SUITE] = { entity_id: SUITE };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
export const cardOf = async (hass, config = {}) => { const card = createCard(hass, { thermostats: [SALON, SUITE, COMBLES], show: [SALON], group_days: false, ...config }); await settle(); return card; };
export const select = async (card, climate, idx, d = 0) => openSlot(card, climate, idx, d);
export const sent = (hass) => hass.events.at(-1).override;
export const override = (target, more = {}) => ({ target, start: at('09:30'), end: at('11:30'), ...more });
export const moreInfo = async (hass, entity, embedded = false) => {
  const el = document.createElement('chauffage-moreinfo');
  if (embedded) el.setAttribute('embedded', '');
  document.body.appendChild(el);
  el.entity = entity;
  el.hass = hass;
  await settle();
  return el;
};
// One pixel per minute: clientX is a time of day in minutes
export const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
export const mouse = (el, type, clientX) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
export const bar = (card, climate, d = 0) => geometry($(card, `.bar[data-climate="${climate}"][data-day="${d}"]`));

export const thermostatCard = async (hass, entity) => {
  const card = document.createElement('chauffage-thermostat-card');
  card.setConfig({ entity });
  document.body.appendChild(card);
  card.hass = hass;
  await settle();
  return card;
};
export const block = (card) => card.shadowRoot.querySelector('chauffage-moreinfo').shadowRoot;
export const openOverride = async (hass, climate, config = {}) => {
  const card = await cardOf(hass, { show: [climate], ...config });
  await openOverrideOf(card, climate);
  return card;
};

// Every test of this house runs on Monday at 10:00: call it first in each describe
export function onMondayAtTen() {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(NOW) }));
  afterEach(() => mock.timers.reset());
}
