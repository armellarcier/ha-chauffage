export const DAY_MIN = 1440;
// The duration of a change by hand, in minutes: the range of the integration; its arrows move it by
// 15 minutes, a step that is not a rule
export const OVERRIDE_DURATION_MIN = 15, OVERRIDE_DURATION_MAX = 1440, OVERRIDE_DURATION_STEP = 15;

export const LS_KEY = 'chauffage-programme-card:shown';
export const LS_CLIP = 'chauffage-programme-card:clip';
export const LS_HISTORY = 'chauffage-programme-card:history';
export const LS_GROUP = 'chauffage-programme-card:group-days';
export const ICON_COPY = '<svg viewBox="0 0 24 24"><path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>';
export const ICON_OPEN = '<svg viewBox="0 0 24 24"><path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"/></svg>';
export const ICON_MORE = '<svg viewBox="0 0 24 24"><path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/></svg>';
export const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M7,15L12,10L17,15H7Z"/></svg>';
export const ICON_DOWN = '<svg viewBox="0 0 24 24"><path d="M7,10L12,15L17,10H7Z"/></svg>';
export const ICON_ZOOM = '<svg viewBox="0 0 24 24"><path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5M7,9H12V10H7V9M9,7H10V12H9V7Z"/></svg>';
export const ICON_PASTE ='<svg viewBox="0 0 24 24"><path d="M19,20H5V4H7V7H17V4H19M12,2A1,1 0 0,1 13,3A1,1 0 0,1 12,4A1,1 0 0,1 11,3A1,1 0 0,1 12,2M19,2H14.82C14.4,0.84 13.3,0 12,0C10.7,0 9.6,0.84 9.18,2H5A2,2 0 0,0 3,4V20A2,2 0 0,0 5,22H19A2,2 0 0,0 21,20V4A2,2 0 0,0 19,2Z"/></svg>';

export const toMin = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};
export const toHM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const pct = (m) => ((m / DAY_MIN) * 100).toFixed(3);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clone = (x) => JSON.parse(JSON.stringify(x));
// Writes an element's HTML only when it changes: an update of Home Assistant then keeps the
// keyboard focus, and what is being clicked, in the parts that did not change
const HTML_OF = new WeakMap();
export const setHtml = (el, html) => {
  if (HTML_OF.get(el) === html) return;
  HTML_OF.set(el, html);
  el.innerHTML = html;
};
// An admin of Home Assistant (a hass without a user, as in the tests, is an admin)
export const isAdmin = (hass) => !(hass && hass.user && !hass.user.is_admin);
// What a user who is not an admin may change, as an admin chose for every such user (#99). Each
// access level includes the ones before it. An admin may always do everything.
const ACCESS_LEVELS = ['use', 'plan', 'set_up'];
export const accessLevelOf = (data) => (data && ACCESS_LEVELS.includes(data.access_level) ? data.access_level : 'use');
export const accessAllows = (hass, data, level) => isAdmin(hass)
  || ACCESS_LEVELS.indexOf(accessLevelOf(data)) >= ACCESS_LEVELS.indexOf(level);
// A write refused by the integration, in words: the access level, or the integration's message
export function errorText(t, e) {
  if (e && e.code === 'unauthorized') return t('unauthorized');
  return t('error', { message: (e && (e.message || e.code)) || e });
}
// The day of a new schedule's week: eco all day
export const NEW_DAY = [{ start: 0, preset: 'eco' }];
// An activation rule as the integration reads it (no schedule: the template gives it)
export const plainRule = (r) => ({ template: r.template, schedule: r.schedule || null });
// HA dates: microseconds truncated to milliseconds (Safari rejects more than 3 decimals)
export const parseDate = (s) => new Date(String(s).replace(/(\.\d{3})\d+/, '$1'));
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const todayIdx = () => (new Date().getDay() + 6) % 7;

// A slot is { start (minutes), preset, settings? } (#91). `settings` is what the slot sets besides
// its preset, only when it sets something: its HVAC mode, and the fan and the vanes of an air
// conditioner. The slot chooses the HVAC mode: heat, cool or heat/cool with a preset; off, fan
// only, dry or auto without one (preset null). The integration stores a slot as [start, preset] or
// [start, preset, settings]; the card's text form, in the clipboard and the tests, is
// "HH:MM preset", 'HH:MM preset {"hvac_mode":"cool"}' or 'HH:MM - {"hvac_mode":"off"}'.
// The HVAC modes, in the order of the first row of a slot: what the device does
export const HVAC_ORDER = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'auto', 'fan_only'];
// Those of a slot on a preset: the preset says how warm, for each of them
export const SETPOINT_MODES = ['heat', 'cool', 'heat_cool'];
// Those of a slot without a preset: no setpoint
export const NO_PRESET_MODES = ['off', 'fan_only', 'dry', 'auto'];
// The preset_mode values that mean a setpoint set by hand (Versatile Thermostat: "none")
export const MANUAL_PRESETS = ['', 'none', 'manual', 'manuel'];
// A range of temperatures, as text: "19–24.5 °C"; "19–24.5°" with `unit` "°"
export const rangeText = (low, high, loc, unit = ` ${loc.unit}`) => `${loc.number(low)}–${loc.number(high)}${unit}`;
export const slotMode = (seg) => (seg && seg.settings && seg.settings.hvac_mode) || null;
export const isOff = (seg) => slotMode(seg) === 'off';
export const isFan = (seg) => slotMode(seg) === 'fan_only';
// An off, a fan-only, a dry and an auto slot have no preset
export const hasNoPreset = (seg) => NO_PRESET_MODES.includes(slotMode(seg));
export const sameSlot = (a, b) => (a.preset ?? null) === (b.preset ?? null)
  && JSON.stringify(a.settings || null) === JSON.stringify(b.settings || null);
export const withSettings = (seg, settings) => (settings && Object.keys(settings).length ? { ...seg, settings } : (({ settings: _, ...rest }) => rest)(seg));
// The HVAC modes a slot may choose, and its settings as the integration accepts them, always in
// the same order (two slots are compared as text). An off slot sets nothing else
const SLOT_HVAC_MODES = HVAC_ORDER;
// The fan and the vanes of an air conditioner (#91, lot 3): the attributes a slot or a preset's
// value may set
export const SETTING_ATTRS = ['fan_mode', 'swing_mode', 'swing_horizontal_mode'];
export function slotSettings(settings) {
  if (!settings || typeof settings !== 'object') return null;
  if (settings.hvac_mode === 'off') return { hvac_mode: 'off' };
  const out: any = {};
  if (SLOT_HVAC_MODES.includes(settings.hvac_mode)) out.hvac_mode = settings.hvac_mode;
  for (const attr of SETTING_ATTRS) if (settings[attr] != null) out[attr] = settings[attr];
  return out;
}
// The fan and the vanes of a slot, without its HVAC mode
export const airSettings = (seg) => { const { hvac_mode: _, ...air } = (seg && seg.settings) || {}; return air; };
// A slot with a preset: { start, preset, settings }, the settings in order, none left empty
export const slotOf = (start, preset, settings) => withSettings({ start, preset }, slotSettings(settings));
// The slot turned off: off, and nothing else
const offSlot = (seg) => slotOf(seg.start, null, { hvac_mode: 'off' });
// The slot set to an HVAC mode without a preset: off, and nothing else; fan only, dry or auto,
// and it keeps its fan and its vanes
export const noPresetSlot = (seg, mode) => (mode === 'off' ? offSlot(seg) : slotOf(seg.start, null, { ...airSettings(seg), hvac_mode: mode }));
// The settings a piece cut out of a slot keeps: none out of an off slot, the fan and the vanes
// out of another slot without a preset (the piece is on a preset), else all of them
export const pieceSettings = (seg) => (isOff(seg) ? null : hasNoPreset(seg) ? airSettings(seg) : seg.settings);

export const minutesOf = (date) => date.getHours() * 60 + date.getMinutes();
