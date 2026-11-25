// The salon, a heater, the atelier, which heats and cools, and the combles, which only cool, with
// values of their own when cooling. The card shows the atelier.
import { createCard, fakeHass, integrationData } from '../helpers.mjs';
import { openSlot } from '../driver.mjs';
import { $, week } from './dom.mjs';

export const OFF = { hvac_mode: 'off' };
export const COOL = { hvac_mode: 'cool' };
export const FAN = { hvac_mode: 'fan_only' };

export const SALON = 'climate.salon'; // a heater
export const ATELIER = 'climate.atelier'; // heats and cools
export const COMBLES = 'climate.combles'; // only cools
export const PLAIN = ['00:00 eco', '14:00 comfort', '20:00 eco'];

export function setup({ atelier = PLAIN, combles = PLAIN, salon = PLAIN } = {}) {
  const data = integrationData({ weeks: { [SALON]: { Normal: week(salon) }, [ATELIER]: { Normal: week(atelier) }, [COMBLES]: { Normal: week(combles) } } });
  // What each preset means, as the integration says it for each HVAC mode (engine.value_on)
  const heats = { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } };
  const own = { eco: { preset_mode: 'eco', cool_preset_mode: 'eco' }, boost: { preset_mode: 'boost', cool_preset_mode: 'boost' }, frost: { temperature: 7 } };
  data.targets = { [SALON]: heats, [ATELIER]: { ...own, comfort: { preset_mode: 'comfort', cool_temperature: 24 } },
    [COMBLES]: { comfort: { temperature: 20, cool_temperature: 26 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } } };
  data.mappings = { [ATELIER]: { comfort: { cool_temperature: 24 } }, [COMBLES]: { comfort: { cool_temperature: 26 } } };
  data.preset_temperatures = { [SALON]: { comfort: 20, eco: 17, boost: 21 }, [ATELIER]: { comfort: 20, eco: 17, boost: 21, away: 15 } };
  data.cool_preset_temperatures = { [ATELIER]: { eco: 27, comfort: 25 } };
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SALON].attributes.preset_modes = ['none', 'frost', 'eco', 'comfort', 'boost'];
  hass.states[ATELIER] = { state: 'heat', attributes: { friendly_name: 'Atelier', temperature: 20, preset_mode: 'comfort',
    preset_modes: ['eco', 'comfort', 'away', 'boost'], hvac_modes: ['off', 'heat', 'cool', 'fan_only'], fan_modes: ['auto', 'low', 'high'], fan_mode: 'auto' }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[ATELIER] = { entity_id: ATELIER };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
export const ALL = [SALON, ATELIER, COMBLES];
export const cardOf = (hass, config = {}) => createCard(hass, { thermostats: ALL, show: [ATELIER], group_days: false, ...config });
export const presetsTab = (hass) => createCard(hass, { thermostats: ALL, view: 'presets' });
export const cell = (card, preset, climate) => $(card, `[data-act="cell"][data-kind="thermostat"][data-preset="${preset}"][data-climate="${climate}"]`);
export const select = (card, climate, idx, d = 0) => openSlot(card, climate, idx, d);

// Hue (degrees) and lightness (0 to 1) of a "#rrggbb" color
export function hsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, l: (max + min) / 2 };
}
export const apart = (a, b) => { const hue = Math.abs(hsl(a).h - hsl(b).h); return Math.min(hue, 360 - hue) >= 20 || Math.abs(hsl(a).l - hsl(b).l) >= 0.08; };
