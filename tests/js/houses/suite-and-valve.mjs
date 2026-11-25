// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and a valve that lists heat and auto. The card shows the suite. It is Monday, 10:00.
import { afterEach, beforeEach, mock } from 'node:test';
import { PRESETS, createCard, fakeHass, integrationData } from '../helpers.mjs';
import { openSlot, settle } from '../driver.mjs';
import { $$, click, text, week } from './dom.mjs';

export const SALON = 'climate.salon'; // a heater
export const SUITE = 'climate.suite'; // a reversible unit that lists every HVAC mode, and takes a range
export const VANNE = 'climate.vanne'; // a valve that lists heat and auto
export const ALL = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'auto', 'fan_only'];
export const DAY = ['00:00 eco', '14:00 comfort', '20:00 frost'];
export const both = (heat, cool) => ({ temperature: heat, cool_temperature: cool, target_temp_low: heat, target_temp_high: cool });
export const HEATS = { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } };
export const TARGETS = {
  [SALON]: HEATS, [VANNE]: HEATS,
  [SUITE]: { comfort: both(20, 25), eco: both(17, 27), boost: both(21, 23), frost: { temperature: 7 } },
};
// Monday 10:00
export const NOW = '2026-10-12T10:00:00+02:00';
export const at = (hhmm) => `2026-10-12T${hhmm}:00+02:00`;

export function setup({ suite = DAY, salon = DAY, vanne = DAY, overrides, planned, targets = TARGETS, step } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon) }, [SUITE]: { Normal: week(suite) }, [VANNE]: { Normal: week(vanne) } },
    overrides, planned,
  });
  data.presets = PRESETS('fr');
  data.targets = targets;
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SALON].attributes.temperature = 17;
  hass.states[SUITE] = { state: 'heat', attributes: { friendly_name: 'Suite', temperature: 20, hvac_modes: ALL, supported_features: 3,
    fan_modes: ['auto', 'low', 'high'], swing_modes: ['off', 'vertical'], ...(step ? { target_temp_step: step } : {}) }, last_updated: '1' };
  hass.states[VANNE] = { state: 'auto', attributes: { friendly_name: 'Vanne', temperature: 19, hvac_modes: ['off', 'heat', 'auto'] }, last_updated: '1' };
  hass.entities[SUITE] = { entity_id: SUITE };
  hass.entities[VANNE] = { entity_id: VANNE };
  return hass;
}
export const cardOf = (hass, config = {}) => createCard(hass, { thermostats: [SALON, SUITE, VANNE], show: [SUITE], group_days: false, ...config });
export const select = (card, climate, idx, d = 0) => openSlot(card, climate, idx, d);
export const mode = (card, m, scope = '.editor') => click(card, `${scope} .mode-row [data-mode="${m}"]`);
export const modeRow = (card, scope = '.editor') => $$(card, `${scope} .mode-row button`)
  .map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}${b.classList.contains('default') ? ' (default)' : ''}`);
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
// The classes of the parts of a block, in the order they are drawn
export const order = (root, selectors) => {
  const all = [...root.querySelectorAll(selectors.join(','))];
  return selectors.map((s) => all.indexOf(root.querySelector(s)));
};
export const ascending = (list) => list.every((v, i) => v >= 0 && (i === 0 || v > list[i - 1]));

// Every test of this house runs on Monday at 10:00: call it first in each describe
export function onMondayAtTen() {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date(NOW) }));
  afterEach(() => mock.timers.reset());
}
