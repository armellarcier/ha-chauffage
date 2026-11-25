import { slotMode } from './common.ts';

// ---------- colors (#91) ----------
// Each preset has a heat color (its color) and a cool color, for its cooling slots: the one the
// user chose (cool_color), else a cool shade derived from its color. The hue moves into the blues and the indigos
// (200° to 250°, away from the cyan of fan only and from the purple of an override), in the order of the hues from
// red: the warm hues, where the presets' colors usually are, get the widest share. The shade
// stays dark enough for white text. The default presets' colors have cool colors of their own
// A hex color as [red, green, blue], each from 0 to 1; a grey for anything else
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const n = m ? parseInt(m[1], 16) : 0x9e9e9e;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}
function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
// The cool colors of the default presets' colors, chosen by hand so that they can be told apart
// from each other, from the heat colors, from the cyan of fan only and from the purple stripes of
// an override: a blue for comfort, a dark teal for eco, a navy for boost (its former lighter red too), a light indigo
// for frost protection (its former light blue too). Hue and lightness both differ
const DEFAULT_COOL_COLORS = { '#f57c00': '#1976d2', '#43a047': '#00796b', '#d32f2f': '#1a237e', '#e53935': '#1a237e', '#78909c': '#5c6bc0', '#29b6f6': '#5c6bc0' };
export function derivedCoolColor(color) {
  const known = DEFAULT_COOL_COLORS[String(color || '').toLowerCase()];
  if (known) return known;
  const [h, s, l] = hexToHsl(color);
  const from = (h + 30) % 360; // the reds on both sides of 0° together
  const hue = from <= 90 ? 200 + (from / 90) * 30 : from <= 210 ? 230 + ((from - 90) / 120) * 12 : 242 + ((from - 210) / 150) * 8;
  return hslToHex(hue, Math.max(0.45, Math.min(0.8, s)), Math.max(0.3, Math.min(0.46, l)));
}
export const coolColor = (preset) => (preset && preset.cool_color) || derivedCoolColor(preset && preset.color);
// The color of a preset in an HVAC mode: its cool color in cool, both in heat/cool
export const presetColorIn = (preset, mode) => (mode === 'cool' ? coolColor(preset)
  : mode === 'heat_cool' ? `linear-gradient(135deg, ${preset.color} 50%, ${coolColor(preset)} 50%)` : preset.color);
// The color of a slot of a preset
export const slotColor = (preset, seg) => presetColorIn(preset, slotMode(seg));
// The text of a chip filled with `colors` (hex; two for a heat/cool chip): white where it reads
// with a contrast of 4.5 at least on each of them (WCAG AA). Otherwise white or dark, the one
// that reads best on the color it reads worst on
export const DARK_TEXT = 'rgba(0,0,0,.87)';
function luminance(hex) {
  return hexToRgb(hex)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function chipTextColor(colors) {
  const worst = (text) => Math.min(...colors.map((c) => { const [hi, lo] = [luminance(c), text].sort((a, b) => b - a); return (hi + 0.05) / (lo + 0.05); }));
  const white = worst(1);
  // Dark text is black at 87 %: on a color, close to #212121
  return white >= 4.5 || white >= worst(luminance('#212121')) ? '#fff' : DARK_TEXT;
}
// The style of a preset's chip in an HVAC mode: its color, and a text that reads on it
export const chipStyle = (preset, mode) => `background:${presetColorIn(preset, mode)};color:${chipTextColor(
  mode === 'cool' ? [coolColor(preset)] : mode === 'heat_cool' ? [preset.color, coolColor(preset)] : [preset.color])}`;
