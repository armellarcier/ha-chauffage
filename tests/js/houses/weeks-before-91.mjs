// Weeks stored before #91, whose slots say no HVAC mode: the salon, a heater, the atelier, which
// heats and cools, and the combles, which only cool. The card shows the atelier.
import { createCard, fakeHass, integrationData } from '../helpers.mjs';
import { openSlot } from '../driver.mjs';
import { $, $$, text, week } from './dom.mjs';

export const OFF = { hvac_mode: 'off' };
export const COOL = { hvac_mode: 'cool' };
export const HEAT = { hvac_mode: 'heat' };
export const FAN = { hvac_mode: 'fan_only' };

export const SALON = 'climate.salon'; // a heater
export const ATELIER = 'climate.atelier'; // heats and cools
export const COMBLES = 'climate.combles'; // only cools
// A week stored before #91: its slots say no HVAC mode
export const OLD = ['00:00 eco', '14:00 comfort', '20:00 eco'];
// One of the thermostat's own presets, when heating and when cooling
export const OWN = (id) => ({ preset_mode: id, cool_preset_mode: id });

export function setup({ atelier = OLD, combles = OLD, salon = OLD, overrides, planned, targets } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon) }, [ATELIER]: { Normal: week(atelier) }, [COMBLES]: { Normal: week(combles) } },
    overrides, planned,
  });
  // What each preset means, as the integration says it for each HVAC mode (engine.value_on)
  const heats = { comfort: { preset_mode: 'comfort' }, eco: { preset_mode: 'eco' }, boost: { preset_mode: 'boost' }, frost: { temperature: 7 } };
  const own = { comfort: OWN('comfort'), eco: OWN('eco'), boost: OWN('boost'), frost: { temperature: 7 } };
  data.targets = targets || { [SALON]: heats, [ATELIER]: own, [COMBLES]: { comfort: { temperature: 20, cool_temperature: 25 },
    eco: { temperature: 17, cool_temperature: 27 }, boost: { temperature: 21, cool_temperature: 23 }, frost: { temperature: 7 } } };
  data.preset_temperatures = { [SALON]: { comfort: 20, eco: 17, boost: 21 }, [ATELIER]: { comfort: 20, eco: 17, boost: 21 } };
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[ATELIER] = { state: 'heat', attributes: { friendly_name: 'Atelier', temperature: 20, preset_mode: 'comfort',
    preset_modes: ['eco', 'comfort', 'away', 'boost'], hvac_modes: ['off', 'heat', 'cool', 'fan_only'], fan_modes: ['auto', '1', '2', '3'] }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[ATELIER] = { entity_id: ATELIER };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
export const cardOf = (hass, config = {}) => createCard(hass, { thermostats: [SALON, ATELIER, COMBLES], show: [ATELIER], group_days: false, ...config });
export const select = (card, climate, idx, d = 0) => openSlot(card, climate, idx, d);
export const hvacRow = (card) => $$(card, '.editor .mode-row [data-mode="heat"], .editor .mode-row [data-mode="cool"]').map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`);
export const seg = (card, climate, idx, d = 0) => $(card, `.bar[data-climate="${climate}"][data-day="${d}"] .seg[data-idx="${idx}"]`);
