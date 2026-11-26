import { html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { HVAC_ORDER } from './common.ts';
import { attributes, followed } from './components/shared/attributes.ts';
import { hvacIconTemplate, hvacModesOf, hvacStyle, modeColor, modeName, rowModesOf, stateOf } from './hvac.ts';

// Presets [{ id, name, color, temperature, cool_temperature?, cool_color? }]: its temperature
// when heating (null: none) and when cooling (absent: none)
export function presetsOf(src, loc) {
  return src.presets().map((l) => ({ id: l.id, color: l.color || '#9e9e9e', name: l.name || loc.preset(l.id), temperature: l.temperature,
    ...(l.cool_temperature != null ? { cool_temperature: l.cool_temperature } : {}),
    ...(l.cool_color ? { cool_color: l.cool_color } : {}) }));
}
export const presetOf = (presets, id, loc) => presets.find((p) => p.id === id) || { id, color: '#9e9e9e', name: loc.preset(id) };
// From the coldest to the warmest
const presetWarmth = (p) => p.temperature ?? p.cool_temperature ?? 19;
export const sortedPresets = (src, loc) => presetsOf(src, loc).sort((a, b) => presetWarmth(a) - presetWarmth(b));

// A chip of an HVAC mode without a preset, in the single row of a thermostat with one "on" HVAC
// mode (#91): Off, first, on a thermostat that lists it; another one only when it is set on a
// thermostat that does not list it: it stays, marked
export function modeChip(hass, climate, loc, mode, act, on) {
  const { modes } = hvacModesOf(hass, climate);
  const listed = !!modes && modes.includes(mode);
  if (!listed && !on) return nothing;
  const name = modeName(loc, mode);
  const label = modes && !listed ? loc.t('unsupported', { value: name }) : name;
  const style = mode === 'off' || mode === 'fan_only' ? nothing : hvacStyle(mode);
  return html`<button data-act=${act} data-mode=${mode} class=${`${mode === 'off' ? 'off-chip' : 'fan-chip'}${on ? ' on' : ''}${modes && !listed ? ' unsupported' : ''}`} style=${style} aria-pressed=${on ? 'true' : 'false'}>${hvacIconTemplate(mode)}${label}</button>`;
}
export const offChip = (hass, climate, loc, act, on) => modeChip(hass, climate, loc, 'off', act, on);
// The first row of a slot or of an override (#91): what the device does. One button per HVAC
// mode the thermostat lists, in a fixed order, with Home Assistant's icon; the chosen one in
// Home Assistant's color. A chosen one the thermostat does not list stays, marked. `disabled`:
// the HVAC modes no preset has a value for
export function modeRow(hass, climate, loc, chosen, act, disabled = [], asDefault = false) {
  const listed = rowModesOf(hass, climate);
  const modes = HVAC_ORDER.filter((m) => listed.includes(m) || m === chosen);
  const buttons = modes.map((m) => {
    // `asDefault`: nothing is chosen yet (a new override). The HVAC mode it would take has a
    // neutral outline, without the color of a chosen HVAC mode: it does not read as active
    const on = m === chosen && !asDefault;
    const preselected = m === chosen && asDefault;
    const name = modeName(loc, m);
    const missing = !listed.includes(m);
    const off = disabled.includes(m) && !on;
    return html`<button class=${`mode${on ? ' on' : ''}${preselected ? ' default' : ''}${missing ? ' unsupported' : ''}`} data-act=${m === 'off' ? act.replace('-mode', '-off') : act} data-mode=${m} aria-pressed=${on ? 'true' : 'false'} style=${on ? `--mode-color:${modeColor(m)}` : nothing} ?disabled=${off} title=${off ? loc.t('noPresetInMode') : nothing}>${hvacIconTemplate(m)}<span>${missing ? loc.t('unsupported', { value: name }) : name}</span></button>`;
  });
  // Five or six HVAC modes: rows of three, instead of three, two, then one
  return html`<div class=${`mode-row${[5, 6].includes(modes.length) ? ' cols3' : ''}`} role="group" aria-label=${loc.t('slotHvac')}>${buttons}</div>`;
}

// The step of a thermostat's setpoint (its target_temp_step, else half a degree), and a
// temperature it accepts: on its step, within its limits (engine.fit_temperature)
export function stepOf(hass, climate) {
  const st = stateOf(hass, climate);
  const step = st ? Number(st.attributes.target_temp_step) : NaN;
  return Number.isFinite(step) && step > 0 ? step : 0.5;
}
export function fitTemperature(hass, climate, value) {
  const st = stateOf(hass, climate);
  const step = stepOf(hass, climate);
  let out = Math.round(Math.round(value / step) * step * 100) / 100;
  const limit = (key) => (st && Number.isFinite(Number(st.attributes[key])) && st.attributes[key] != null ? Number(st.attributes[key]) : null);
  if (limit('min_temp') != null) out = Math.max(out, limit('min_temp'));
  if (limit('max_temp') != null) out = Math.min(out, limit('max_temp'));
  return out;
}
// A temperature field with its − and its +, in the user's number format (the cell popover of
// the presets tab, the temperature of an override). `attrs`: the attributes of its input;
// `act`: what its buttons do; `step`: how far a tap moves it. A new value is a new field: a
// field keeps what is typed in it while its value stays the same. With `follow`, the field
// stays, and follows the value except while it is typed in (the setpoint of a thermostat)
export function stepper(loc, attrs, value, act, step, label, follow = false) {
  const button = (dir, sign) => html`<button type="button" class="btn icon" data-act=${act} data-dir=${dir} data-delta=${dir * step} aria-label=${sign}>${sign}</button>`;
  const text = value != null ? loc.number(value) : '';
  const field = follow
    ? html`<input type="text" inputmode="decimal" ${attributes(attrs)} aria-label=${label} .value=${followed(text)}>`
    : keyed(text, html`<input type="text" inputmode="decimal" ${attributes(attrs)} aria-label=${label} value=${text}>`);
  return html`<div class="pv-temp">${button(-1, '−')}
        ${field} ${loc.unit}
        ${button(1, '+')}</div>`;
}
