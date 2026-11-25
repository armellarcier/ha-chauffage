import { dataSource } from './client.ts';
import { DARK_TEXT } from './colors.ts';
import { HVAC_ORDER, MANUAL_PRESETS, NO_PRESET_MODES, SETPOINT_MODES, SETTING_ATTRS, airSettings, esc, slotMode, slotSettings, withSettings } from './common.ts';

// ---------- the HVAC mode (#91) ----------
// The slot chooses the HVAC mode: heat, cool or heat/cool with a preset; off, fan only, dry or
// auto without one. The preset says how warm, for each thermostat and for that HVAC mode.
// Home Assistant's icons of the HVAC modes
const HVAC_ICONS = { off: 'mdi:power', heat: 'mdi:fire', cool: 'mdi:snowflake', heat_cool: 'mdi:sun-snowflake-variant',
  auto: 'mdi:thermostat-auto', dry: 'mdi:water-percent', fan_only: 'mdi:fan' };
// Home Assistant's color of each HVAC mode (its state color), with the color it is by default.
// Off is grey, as an off slot
export const OFF_COLOR = '#616161';
// The stripes of an override, everywhere Chauffage draws one (the schedule card, the thermostat
// card's chip, a row of the rooms card), with a white text
export const OVERRIDE_STRIPES = 'repeating-linear-gradient(135deg, #7b1fa2 0 6px, #9c4dcc 6px 12px)';
const HVAC_COLORS = {
  off: OFF_COLOR,
  heat: 'var(--state-climate-heat-color, #ff5722)',
  cool: 'var(--state-climate-cool-color, #2196f3)',
  heat_cool: 'var(--state-climate-heat-cool-color, #ffc107)',
  dry: 'var(--state-climate-dry-color, #ff9800)',
  auto: 'var(--state-climate-auto-color, #4caf50)',
  fan_only: 'var(--state-climate-fan_only-color, rgb(0, 188, 212))',
};
const FAN_COLOR = HVAC_COLORS.fan_only;
export const hvacColor = (mode) => HVAC_COLORS[mode] || OFF_COLOR;
// White is not legible on the light ones: dark text
const HVAC_LIGHT = ['heat_cool', 'dry', 'fan_only'];
export const hvacStyle = (mode) => `background:${hvacColor(mode)};color:${HVAC_LIGHT.includes(mode) ? DARK_TEXT : '#fff'}`;
// A dry slot and an auto slot in a week and in a legend: Home Assistant's orange and green are
// close to the default colors of Comfort and Eco. So the slot is hatched in the color of its HVAC
// mode on a neutral base, never filled with it: it cannot be taken for a slot on a preset
const HVAC_HATCHED = ['dry', 'auto'];
export const hvacSlotStyle = (mode) => (HVAC_HATCHED.includes(mode)
  ? `background:repeating-linear-gradient(135deg, color-mix(in srgb, ${hvacColor(mode)} 60%, transparent) 0 4px, transparent 4px 9px), var(--secondary-background-color, #e5e5e5);color:var(--primary-text-color)`
  : hvacStyle(mode));
// The color of an HVAC mode in the first row of a slot or of an override: off follows the theme
export const modeColor = (mode) => (mode === 'off' ? 'var(--secondary-text-color, #727272)' : hvacColor(mode));
// The name of an HVAC mode, short, for a button: "Heat", "Cool", "Dry"
export const MODE_LABELS = { off: 'hvacOff', heat: 'slotHeat', cool: 'slotCool', heat_cool: 'hvacHeatCool', dry: 'hvacDry', auto: 'hvacAuto', fan_only: 'hvacFan' };
export const modeName = (loc, mode) => (loc.modeName ? loc.modeName(mode) : MODE_LABELS[mode] ? loc.t(MODE_LABELS[mode]) : loc.hvacMode(mode));
// A thermostat's state in Home Assistant, when Home Assistant has one
export const stateOf = (hass, climate) => hass && hass.states && hass.states[climate];
// The words of the sentences of a thermostat's own blocks, the more-info block, a thermostat
// card and the end of an override on the schedule card: an HVAC mode is named in full, as Home Assistant names it next to them ("Chauffage",
// "Éteint"), else in the card's own full words. Labels keep the short names, as the buttons
export function fullNames(loc, hass, climate) {
  const st = stateOf(hass, climate);
  const name = (mode) => {
    if (st && typeof hass.formatEntityState === 'function') {
      try {
        const known = hass.formatEntityState(st, mode);
        if (typeof known === 'string' && known && known !== mode) return known;
      } catch (e) { /* the card's own words */ }
    }
    return loc.hvacMode(mode);
  };
  return Object.assign(Object.create(loc), { modeName: name });
}
// Fan only, in a week, a legend and a chip: Home Assistant's color, with dark text (white is
// not legible on its cyan). The first row of a slot or of an override: one button per HVAC
// mode, the icon and the label centered in a box of one height
// One height and one radius for the HVAC mode buttons, the preset chips and the − and + of a
// temperature, in every block (the slot popover, the override block of the card, of a
// thermostat card and of the more-info dialog). The chosen HVAC mode is tinted with its color,
// as Home Assistant's own control does: a filled chip is a preset
// One box for every field of the cards: a text, a time, a temperature, a list. As high as a chip,
// with its radius
export const FIELD_BOX = 'box-sizing:border-box; height:var(--chauffage-chip-h, 34px); font:inherit; font-size:13px; padding:0 8px; border-radius:8px;'
  + ' border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color);';
// Five or six HVAC modes on a narrow block (a phone, a thermostat card): three columns, each as
// wide as its widest button, instead of rows of three, two, then one. Tight enough for
// "Chauffe/Clim" at 360 px. `scope`: what says the block is narrow
export const COLS3_STYLE = (scope) => `
  ${scope}.mode-row.cols3 { display:grid; grid-template-columns:repeat(3, minmax(0, max-content)); column-gap:4px; }
  ${scope}.mode-row.cols3 .mode { padding:0 5px; gap:4px; min-width:0; }
  ${scope}.mode-row.cols3 .mode span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
`;
export const CHIP_STYLE = `
  :host { --chauffage-chip-h:34px; --chauffage-row-gap:10px; }
  .mode-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:0; }
  .mode-row .mode, .presets button { box-sizing:border-box; height:var(--chauffage-chip-h); min-height:0; display:inline-flex;
    align-items:center; justify-content:center; gap:5px; margin:0; padding:0 10px; border-radius:8px; font:inherit; font-size:13px;
    line-height:1; white-space:nowrap; cursor:pointer; }
  .mode-row .mode { border:1px solid var(--divider-color); background:none; color:var(--primary-text-color); }
  .mode-row .mode ha-icon { --mdc-icon-size:16px; width:16px; height:16px; display:flex; flex:none; }
  .mode-row .mode.on { border-color:var(--mode-color); -webkit-text-stroke:.4px currentColor; background:var(--secondary-background-color);
    background:color-mix(in srgb, var(--mode-color) 20%, transparent);
    color:color-mix(in srgb, var(--mode-color) 45%, var(--primary-text-color)); }
  /* The HVAC mode a new override would take: a dashed outline, no fill. A filled button reads
     as chosen */
  .mode-row .mode.default { border:1px dashed var(--secondary-text-color); background:none; }
  .mode-row .mode[disabled] { opacity:.45; cursor:default; }
  .presets { display:flex; flex-wrap:wrap; gap:6px; }
  /* Every chip in its full color: a faded chip reads as disabled. The chosen one has a ring */
  .presets button { border:0; color:#fff; }
  .presets button.on { box-shadow:0 0 0 2px var(--card-background-color), 0 0 0 4px var(--primary-text-color); font-weight:600; }
  .presets .off-chip { background:${OFF_COLOR}; }
  .presets .off-chip ha-icon, .presets .fan-chip ha-icon { --mdc-icon-size:14px; width:14px; height:14px; display:flex; flex:none; }
  .presets button.unsupported { outline:2px dashed var(--secondary-text-color); outline-offset:1px; }
  .unsupported, .btn.unsupported { border-style:dashed; }
  .pv-temp { display:inline-flex; align-items:center; gap:4px; }
  .pv-temp button[data-dir] { box-sizing:border-box; width:var(--chauffage-chip-h); height:var(--chauffage-chip-h); padding:0;
    display:inline-flex; align-items:center; justify-content:center; font:inherit; font-size:16px; line-height:1;
    border:1px solid var(--divider-color); border-radius:8px; background:var(--card-background-color);
    color:var(--primary-text-color); cursor:pointer; }
  .pv-temp input[type=text] { ${FIELD_BOX} width:56px; padding:0 6px; text-align:center; }
  .end-block { display:flex; flex-direction:column; gap:var(--chauffage-row-gap); padding-top:var(--chauffage-row-gap);
    border-top:1px solid var(--divider-color); }
  /* The line of a setpoint, the same in every block: its words, then a button to the presets */
  .setpoint-line { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; font-size:13px; }
  .setpoint-edit { box-sizing:border-box; height:var(--chauffage-chip-h); display:inline-flex; align-items:center; gap:5px;
    line-height:1; padding:0 10px; border:1px solid var(--divider-color); border-radius:8px; color:var(--primary-color); cursor:pointer; }
  .setpoint-edit ha-icon { --mdc-icon-size:16px; width:16px; height:16px; display:flex; flex:none; }
  .end-new, .off-end { font-size:.85em; }
  /* "until", before the field of an end: on the line of the field */
  .end-block label { height:var(--chauffage-chip-h); display:inline-flex; align-items:center; gap:6px; line-height:1; }
  .more-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
  .more-row select { ${FIELD_BOX} margin-left:auto; min-width:0; max-width:100%; }
`;
export const FAN_STYLE = `
  .seg.fan, .presets button.fan-chip, .legend i.fan { background:${FAN_COLOR}; }
  .seg.fan, .presets button.fan-chip { color:${DARK_TEXT}; }
  ${CHIP_STYLE}
`;
export const hvacIcon = (mode) => (mode ? `<ha-icon icon="${esc(HVAC_ICONS[mode] || 'mdi:thermostat')}"></ha-icon>` : '');
export const hvacIconHtml = (mode) => (mode ? `<span class="m">${hvacIcon(mode)}</span>` : '');
// A number typed by hand, with either decimal separator ("20,5" or "20.5"); NaN for anything else
export const parseDecimal = (text) => (String(text).trim() === '' ? NaN : Number(String(text).trim().replace(',', '.')));
// The HVAC modes a thermostat lists, and the ones that turn it on
export const hvacModesOf = (hass, climate) => {
  const st = stateOf(hass, climate);
  const modes = st && Array.isArray(st.attributes.hvac_modes) ? st.attributes.hvac_modes.map(String) : null;
  return { modes, on: (modes || []).filter((m) => m !== 'off') };
};
// A thermostat that heats and cools: a preset's value on it has a cooling setpoint
export const isReversible = (hass, climate) => {
  const { on } = hvacModesOf(hass, climate);
  return on.includes('heat') && on.includes('cool');
};
// An air conditioner that only cools: no heating value means anything on it
export const coolsOnly = (hass, climate) => {
  const { on } = hvacModesOf(hass, climate);
  return on.includes('cool') && !on.includes('heat');
};
// The whole week to heat or to cool (the week's menu): on a thermostat that lists both
export const slotModesOf = (hass, climate) => (isReversible(hass, climate) ? ['heat', 'cool'] : []);
export const listsMode = (hass, climate, mode) => hvacModesOf(hass, climate).on.includes(mode);
// Whether a thermostat takes a range of temperatures (Home Assistant's TARGET_TEMPERATURE_RANGE):
// heat/cool needs it
const supportsRange = (hass, climate) => {
  const st = stateOf(hass, climate);
  return !!st && (Number(st.attributes.supported_features) & 2) !== 0;
};
// The HVAC modes a slot on a preset may choose on a thermostat: heat, cool and heat/cool, the
// ones it lists (engine.setpoint_modes)
export const setpointModesOf = (hass, climate) => {
  const { modes } = hvacModesOf(hass, climate);
  return SETPOINT_MODES.filter((m) => (modes || []).includes(m) && (m !== 'heat_cool' || supportsRange(hass, climate)));
};
// The HVAC modes of the first row of a slot or of an override, in order: the ones the
// thermostat lists
export const rowModesOf = (hass, climate) => {
  const { modes } = hvacModesOf(hass, climate);
  const set = setpointModesOf(hass, climate);
  return HVAC_ORDER.filter((m) => (modes || []).includes(m) && (!SETPOINT_MODES.includes(m) || set.includes(m)));
};
// Two rows, the HVAC mode then the presets, on a thermostat that lists more than one "on" HVAC
// mode. A heater keeps one row: Off, then the presets
export const hasModeRow = (hass, climate) => rowModesOf(hass, climate).filter((m) => m !== 'off').length > 1;
// The HVAC mode of a slot on a thermostat, as the integration reads it (engine.slot_hvac_mode).
// Off, fan only, dry and auto are the slot's own. A slot on a preset keeps its HVAC mode when
// the thermostat can follow it. Otherwise, on a thermostat that cools, the slot heats, or cools
// when the thermostat does not heat. A thermostat that only heats carries no HVAC mode, unless
// the slot says heat and the thermostat lists another "on" HVAC mode. A thermostat whose HVAC
// modes are not known (unavailable): as stored
export function slotModeOn(hass, climate, seg) {
  const mode = slotMode(seg);
  if (NO_PRESET_MODES.includes(mode)) return mode;
  const { modes, on } = hvacModesOf(hass, climate);
  if (!modes || !modes.length) return mode;
  const choices = setpointModesOf(hass, climate);
  if (choices.includes(mode)) return on.length > 1 || mode !== 'heat' ? mode : null;
  if (!choices.length || (choices.length === 1 && choices[0] === 'heat')) return null;
  return choices.includes('heat') ? 'heat' : choices[0];
}
// A slot as it runs on a thermostat: with that HVAC mode. What the card draws, and what an edit
// writes
export function slotOn(hass, climate, seg) {
  const mode = slotModeOn(hass, climate, seg);
  if (mode === slotMode(seg)) return seg;
  return withSettings(seg, slotSettings({ ...airSettings(seg), ...(mode ? { hvac_mode: mode } : {}) }));
}
export const dayOn = (hass, climate, segs) => segs.map((seg) => slotOn(hass, climate, seg));
// What a preset means on a thermostat, for each HVAC mode: the integration's rule
// (engine.value_on), for a thermostat the integration does not know yet and for what a popover
// is about to save. When heating: preset_mode or temperature. When cooling, on a thermostat
// that cools: cool_preset_mode or cool_temperature. In heat/cool, on a thermostat that takes a
// range: target_temp_low and target_temp_high. `cell`: the value set by hand on the thermostat
export function valueOn(preset, cell, hass, climate, usePresets = true) {
  const set = cell || {};
  const st = stateOf(hass, climate);
  const own = usePresets && st && (st.attributes.preset_modes || []).map(String).includes(preset.id) ? preset.id : null;
  const heat = preset.temperature ?? null;
  const cool = preset.cool_temperature ?? null;
  const out: any = {};
  if ('preset_mode' in set) out.preset_mode = set.preset_mode;
  else if ('temperature' in set) out.temperature = set.temperature;
  else if (heat != null) Object.assign(out, own ? { preset_mode: own } : { temperature: heat });
  if (listsMode(hass, climate, 'cool')) {
    if ('cool_temperature' in set) out.cool_temperature = set.cool_temperature;
    else if ('preset_mode' in set) out.cool_preset_mode = set.preset_mode;
    else if (cool != null) Object.assign(out, own ? { cool_preset_mode: own } : { cool_temperature: cool });
  }
  const low = 'temperature' in set ? set.temperature : heat;
  const high = 'cool_temperature' in set ? set.cool_temperature : cool;
  if (setpointModesOf(hass, climate).includes('heat_cool') && low != null && high != null && low < high) {
    out.target_temp_low = low;
    out.target_temp_high = high;
  }
  for (const attr of SETTING_ATTRS) if (attr in set) out[attr] = set[attr];
  return out;
}
// The HVAC modes a preset can be used in, from its value on a thermostat (engine.offered_modes):
// those it has a value for. The one place of the card that says so
export function presetModes(value) {
  const v = value || {};
  const modes = [];
  if ('preset_mode' in v || 'temperature' in v) modes.push('heat');
  if ('cool_preset_mode' in v || 'cool_temperature' in v) modes.push('cool');
  if ('target_temp_low' in v && 'target_temp_high' in v) modes.push('heat_cool');
  return modes;
}
// The HVAC mode whose presets a thermostat is offered when a slot or an override says none: heat
// on a heater, cool on an air conditioner that only cools
export const defaultSetpointMode = (hass, climate) => setpointModesOf(hass, climate)[0] || 'heat';
// The names of the fan and the vanes (SETTING_ATTRS), and the values the thermostat lists for
// each
export const SETTING_LABELS = { fan_mode: 'fanMode', swing_mode: 'swingMode', swing_horizontal_mode: 'swingHorizontalMode' };
export function settingOptionsOf(hass, climate) {
  const st = stateOf(hass, climate);
  const out = {};
  for (const attr of SETTING_ATTRS) {
    const list = st && st.attributes[`${attr}s`];
    if (Array.isArray(list) && list.length) out[attr] = list.map(String);
  }
  return out;
}
// An attribute's name: the card's own, short ("Fan", "Vanes"). Home Assistant's names are too
// long for a popover
const attributeName = (attr, loc) => loc.t(SETTING_LABELS[attr]);
// The name Home Assistant gives a value of a climate attribute (a preset, a fan or a vane value),
// as its own dialogs show it: the entity's own translation, else the climate domain's; null
// without one
function haValueName(hass, climate, attr, value) {
  const st = stateOf(hass, climate);
  if (st && typeof hass.formatEntityAttributeValue === 'function') {
    try {
      const name = hass.formatEntityAttributeValue(st, attr, value);
      if (typeof name === 'string' && name && name !== String(value)) return name;
    } catch (e) { /* the next source */ }
  }
  if (hass && typeof hass.localize === 'function') {
    try {
      const name = hass.localize(`component.climate.entity_component._.state_attributes.${attr}.state.${value}`);
      if (typeof name === 'string' && name) return name;
    } catch (e) { /* the raw value */ }
  }
  return null;
}
// One of a thermostat's own presets, named as Home Assistant names it, else in the card's words
export const ownPresetName = (hass, climate, value, loc) => haValueName(hass, climate, 'preset_mode', value) || loc.preset(value);
// A value's name: Home Assistant's own (since HA 2023.9), else the raw value made readable:
// "1_up" reads "1 up"
function attributeValue(hass, climate, attr, value, loc) {
  const known = haValueName(hass, climate, attr, value);
  if (known) return known;
  // "1_up" reads "1 up", and the common words of a vane value in the user's language ("1 haut")
  const text = String(value).replace(/_/g, ' ').split(' ').map((word) => loc.settingWord(word)).join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
// The thermostat's current state, to capture into a preset's value (#91, lot 3): the
// intent on a Versatile Thermostat (requested_state), not its protection. Null while unavailable.
export function captureState(hass, climate) {
  const st = stateOf(hass, climate);
  if (!st || ['unavailable', 'unknown'].includes(st.state)) return null;
  const a = st.attributes;
  const requested = isVtherm(hass, climate) && a.requested_state && typeof a.requested_state === 'object' ? a.requested_state : null;
  const hvac = requested && requested.hvac_mode ? String(requested.hvac_mode) : st.state;
  const preset = requested && requested.preset != null ? String(requested.preset) : a.preset_mode != null ? String(a.preset_mode) : null;
  const manual = !preset || MANUAL_PRESETS.includes(preset.toLowerCase());
  const temperature = requested && manual && requested.target_temperature != null ? Number(requested.target_temperature) : a.temperature;
  const settings = {};
  const options = settingOptionsOf(hass, climate);
  for (const attr of SETTING_ATTRS) if (attr in options && a[attr] != null) settings[attr] = String(a[attr]);
  return { hvac, preset: manual ? null : preset, temperature: temperature != null ? Number(temperature) : null, settings };
}

// The fan and the vanes a slot or a preset's value sets, in words: "Fan 3 · Vanes Swing"
export function settingsText(hass, climate, loc, settings) {
  return SETTING_ATTRS.filter((attr) => settings && attr in settings)
    .map((attr) => `${attributeName(attr, loc)} ${attributeValue(hass, climate, attr, settings[attr], loc)}`).join(' · ');
}

// The "More settings" of a slot's popover and of a preset's value (#91, lot 3), on an air
// conditioner: one select per fan or swing attribute the thermostat lists, folded; the summary
// lists the values set. `defaults`: the values the preset's value gives a slot; `field`: the
// attribute of the selects
// The choice that sets no fan or no vanes: the thermostat gets its own back. In brackets, the
// value it gets back when it is known: the one Chauffage keeps for it, else the one it shows
function ownSettingText(hass, climate, attr, loc) {
  const kept = dataSource(hass).ownSettings(climate)[attr];
  const st = stateOf(hass, climate);
  const value = kept ?? (st && st.attributes ? st.attributes[attr] : null);
  return value == null || value === '' ? loc.t('keep') : loc.t('keepValue', { value: attributeValue(hass, climate, attr, value, loc) });
}

export function moreSettingsHtml(hass, climate, loc, settings, defaults, open, field = 'data-slot-setting', direct = []) {
  const t = loc.t;
  const options = settingOptionsOf(hass, climate);
  const attrs = SETTING_ATTRS.filter((attr) => attr in options || (settings && attr in settings));
  if (!attrs.length) return '';
  const row = (attr) => {
    const value = settings && settings[attr];
    const listed = options[attr] || [];
    const unsupported = value && !listed.includes(value);
    // Nothing set: the preset's value, else the thermostat gets its own back
    const fallback = defaults && defaults[attr] ? t('fromPreset', { value: attributeValue(hass, climate, attr, defaults[attr], loc) }) : ownSettingText(hass, climate, attr, loc);
    const items = [`<option value=""${!value ? ' selected' : ''}>${esc(fallback)}</option>`]
      .concat(unsupported ? [`<option value="${esc(value)}" class="unsupported" selected>${esc(t('unsupported', { value: attributeValue(hass, climate, attr, value, loc) }))}</option>`] : [])
      .concat(listed.map((v) => `<option value="${esc(v)}"${value === v ? ' selected' : ''}>${esc(attributeValue(hass, climate, attr, v, loc))}</option>`));
    return `<label class="more-row"><span>${esc(attributeName(attr, loc))}</span>
      <select ${field}="${attr}"${listed.length ? '' : ' disabled'}>${items.join('')}</select></label>`;
  };
  // `direct`: the settings shown at once, not folded (the fan speed of a fan-only or dry slot)
  const shown = attrs.filter((attr) => direct.includes(attr));
  const folded = attrs.filter((attr) => !direct.includes(attr));
  const sight = shown.length ? `<div class="more-rows direct">${shown.map(row).join('')}</div>` : '';
  if (!folded.length) return sight;
  const foldedSettings = Object.fromEntries(Object.entries(settings || {}).filter(([attr]) => folded.includes(attr)));
  const set = folded.filter((attr) => attr in foldedSettings);
  const summary = settingsText(hass, climate, loc, foldedSettings) || t('moreSettings');
  // The summary is a button: it unfolds the rows, and says so with a chevron
  return `${sight}<details class="more"${open || set.length ? ' open' : ''}><summary><span>${esc(summary)}</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="more-rows">${folded.map(row).join('')}</div></details>`;
}

// The capture button (#91, lot 3): fills the popover of a preset's value from the thermostat's
// current state
export function captureButtonHtml(hass, climate, loc) {
  const t = loc.t;
  const unavailable = !captureState(hass, climate);
  const label = unavailable ? t('unsupported', { value: t('capture') }) : t('capture');
  return `<button class="btn capture" data-act="capture"${unavailable ? ' disabled' : ''}><ha-icon icon="mdi:eyedropper-variant"></ha-icon> ${esc(label)}</button>`;
}

// Days in display order, the days of the same key on one row: [[0, 1, 2, 3, 4], [5, 6]]
export function rowsOfDays(order, keyOf) {
  const rows = new Map();
  for (const d of order) {
    const key = keyOf(d);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(d);
  }
  return [...rows.values()];
}

// A Versatile Thermostat, recognized by its integration as the integration's Runtime.current does
const isVtherm = (hass, climate) => ((hass.entities || {})[climate] || {}).platform === 'versatile_thermostat';
