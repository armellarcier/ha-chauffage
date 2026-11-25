// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The presets have a cooling temperature. The card shows the
// suite.
import { PRESETS, createCard, fakeHass, integrationData } from '../helpers.mjs';
import { openSlot } from '../driver.mjs';
import { $, $$, click, text, week } from './dom.mjs';

export const SALON = 'climate.salon'; // a heater
export const SUITE = 'climate.suite'; // a reversible unit that lists every HVAC mode, and takes a range
export const COMBLES = 'climate.combles'; // only cools
export const ALL = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'auto', 'fan_only'];
export const DAY = ['00:00 eco', '14:00 comfort', '20:00 frost'];
// The presets as the integration stores them: a temperature when heating and one when cooling
export const COOLING = { comfort: 25, eco: 27, boost: 23 };
export const presets = () => PRESETS('fr').map((p) => ({ ...p, ...(p.id in COOLING ? { cool_temperature: COOLING[p.id] } : {}) }));
// What each preset means on each thermostat, as the integration says it (engine.value_on)
export const both = (heat, cool) => ({ temperature: heat, cool_temperature: cool, target_temp_low: heat, target_temp_high: cool });
export const TARGETS = {
  [SALON]: { comfort: { temperature: 20 }, eco: { temperature: 17 }, boost: { temperature: 21 }, frost: { temperature: 7 } },
  [SUITE]: { comfort: both(20, 25), eco: both(17, 27), boost: both(21, 23), frost: { temperature: 7 } },
  [COMBLES]: { comfort: { temperature: 20, cool_temperature: 25 }, eco: { temperature: 17, cool_temperature: 27 },
    boost: { temperature: 21, cool_temperature: 23 }, frost: { temperature: 7 } },
};

export function setup({ suite = DAY, combles = DAY, salon = DAY, overrides, planned, targets = TARGETS, modes = ALL, features = 3 } = {}) {
  const data = integrationData({
    weeks: { [SALON]: { Normal: week(salon) }, [SUITE]: { Normal: week(suite) }, [COMBLES]: { Normal: week(combles) } },
    overrides, planned,
  });
  data.presets = presets();
  data.targets = targets;
  const hass = fakeHass({ data });
  hass.data = data;
  hass.states[SALON].attributes.hvac_modes = ['off', 'heat'];
  hass.states[SUITE] = { state: 'heat', attributes: { friendly_name: 'Suite', temperature: 20, hvac_modes: modes, supported_features: features,
    fan_modes: ['auto', 'low', 'high'] }, last_updated: '1' };
  hass.states[COMBLES] = { state: 'cool', attributes: { friendly_name: 'Combles', temperature: 26, hvac_modes: ['off', 'cool', 'fan_only'] }, last_updated: '1' };
  hass.entities[SUITE] = { entity_id: SUITE };
  hass.entities[COMBLES] = { entity_id: COMBLES };
  return hass;
}
export const cardOf = (hass, config = {}) => createCard(hass, { thermostats: [SALON, SUITE, COMBLES], show: [SUITE], group_days: false, ...config });
export const select = (card, climate, idx, d = 0) => openSlot(card, climate, idx, d);
export const modeRow = (card, scope = '.editor') => $$(card, `${scope} .mode-row button`).map((b) => `${text(b)}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`);
export const presetRow = (card, scope = '.editor') => $$(card, `${scope} .presets button`).map((b) => `${text(b)}${b.classList.contains('on') ? ' ✓' : ''}`);
export const mode = (card, m, scope = '.editor') => click(card, `${scope} .mode-row [data-mode="${m}"]`);
export const seg = (card, climate, idx, d = 0) => $(card, `.bar[data-climate="${climate}"][data-day="${d}"] .seg[data-idx="${idx}"]`);
