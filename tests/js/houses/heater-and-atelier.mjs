// The salon, a heater (off and heat), and the atelier, a reversible air conditioner with a fan. The
// salon is off at night, and the atelier has a slot that sets the fan and the vanes.
import { WEEKEND, createCard, fakeHass, integrationData } from '../helpers.mjs';
import { openSlot, settle } from '../driver.mjs';
import { $$, text } from './dom.mjs';

export const OFF = { hvac_mode: 'off' };
export const COOL = { hvac_mode: 'cool' };
export const FAN = { hvac_mode: 'fan_only' };
export const OFF_SLOT = ' - {"hvac_mode":"off"}'; // an off slot has no preset
export const NIGHT = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', ['21:00', null, OFF]];
export const FAN_DAY = ['00:00 eco', ['14:00', 'comfort', { fan_mode: '3', swing_mode: 'swing' }], '20:00 eco'];
// Comfort in cool in the afternoon, then fan only in the evening
export const SUMMER = ['00:00 eco', ['14:00', 'comfort', COOL], ['20:00', null, { hvac_mode: 'fan_only', fan_mode: '3' }], ['23:00', null, OFF]];
export const AC_MODES = ['off', 'heat', 'cool', 'fan_only'];
// One of the thermostat's own presets, when heating and when cooling (engine.value_on)
export const OWN = (id) => ({ preset_mode: id, cool_preset_mode: id });
export const lastCall = (hass) => hass.events.at(-1);
// The first row of a slot popover or of an override block: the HVAC modes, the chosen one marked
export const pressed = (b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`;
export const modes = (card) => $$(card, '.editor .mode-row button').map(pressed);
export const chips = (root, scope) => $$(root, `${scope} .presets button`).map((b) => `${text(b)}${b.classList.contains('on') ? ' ✓' : ''}`);
// A color as the browser writes it in a style: "rgb(25, 118, 210)"
export const PRESET_COLORS = { comfort: '#f57c00', eco: '#43a047', boost: '#e53935', frost: '#29b6f6' };

// The salon, a heater (heat / off), and the workshop, a reversible air conditioner (#61)
export function setup({ weeks, targets, overrides, planned, thermostats, atelier } = {}) {
  const data = integrationData({
    weeks: weeks || { 'climate.salon': { Normal: [NIGHT, NIGHT, NIGHT, NIGHT, NIGHT, WEEKEND, WEEKEND] },
      'climate.atelier': { Normal: Array(5).fill(atelier || FAN_DAY).concat([WEEKEND, WEEKEND]) } },
    overrides, planned,
  });
  data.targets = targets || {
    'climate.salon': { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } },
    'climate.atelier': { comfort: OWN('comfort'), eco: OWN('eco'), boost: OWN('boost'), frost: { temperature: 16 } },
  };
  data.preset_temperatures = { 'climate.salon': { comfort: 20, eco: 17, boost: 21 } };
  if (thermostats) Object.assign(data.thermostats, thermostats);
  const hass = fakeHass({ data });
  hass.data = data; // to push a change: hass.push({ ...hass.data, … })
  hass.states['climate.salon'].attributes.hvac_modes = ['off', 'heat'];
  hass.states['climate.salon'].attributes.preset_modes = ['none', 'frost', 'eco', 'comfort', 'boost'];
  hass.states['climate.atelier'] = { state: 'heat', attributes: { friendly_name: 'Atelier', current_temperature: 24, temperature: 20, preset_mode: 'comfort',
    preset_modes: ['eco', 'comfort', 'away', 'boost'], hvac_modes: AC_MODES, fan_modes: ['auto', '1', '2', '3'], swing_modes: ['auto', 'swing'] }, last_updated: '1' };
  hass.entities['climate.atelier'] = { entity_id: 'climate.atelier' };
  return hass;
}
export const cardOf = (hass, config = {}) => createCard(hass, { thermostats: ['climate.salon', 'climate.atelier'], show: 'all', ...config });
export const select = (card, climate, d, idx) => openSlot(card, climate, idx, d);
// A thermostat card, once drawn
export const thermostatCard = async (hass, entity = 'climate.salon') => {
  const tc = document.createElement('chauffage-thermostat-card');
  tc.setConfig({ type: 'custom:chauffage-thermostat-card', entity });
  document.body.appendChild(tc);
  tc.hass = hass;
  await settle();
  return tc;
};
// A more-info block, once drawn
export const moreInfo = async (hass, entity = 'climate.salon') => {
  const el = document.createElement('chauffage-moreinfo');
  document.body.appendChild(el);
  el.entity = entity;
  el.hass = hass;
  await settle();
  return el;
};
