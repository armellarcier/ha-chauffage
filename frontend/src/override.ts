import { DAY_MIN, SETPOINT_MODES, minutesOf, parseDate, rangeText, todayIdx } from './common.ts';
import { modeName } from './hvac.ts';
import { DEFAULT_LOCALE } from './i18n/locale.ts';

// ---------- overrides (shared by the card and the more-info block) ----------

// The piece of an override drawn on a row of days: today's, or the last one (where it ends, with
// its handle), or the first of the row (the pieces start today: none is past)
export function rowPiece(pieces, days) {
  const inRow = pieces.filter((p) => days.includes(p.day));
  return inRow.find((p) => p.day === todayIdx()) || inRow.find((p) => p.isLast) || inRow[0];
}

// Splits an override into one piece per day (today + 6 days), in minutes of the time of day like
// the slots: on the days the clocks change, the time elapsed since midnight is an hour off (#43)
export function overridePieces(d) {
  if (!d) return [];
  const startsAt = parseDate(d.start);
  const endsAt = parseDate(d.end);
  const day0 = new Date();
  day0.setHours(0, 0, 0, 0);
  const pieces = [];
  for (let i = 0; i < 7; i++) {
    const d0 = new Date(day0);
    d0.setDate(d0.getDate() + i);
    const d1 = new Date(d0);
    d1.setDate(d1.getDate() + 1);
    const s = startsAt > d0 ? startsAt : d0;
    const e = endsAt < d1 ? endsAt : d1;
    if (e > s) {
      const start = minutesOf(s);
      let end = e < d1 ? minutesOf(e) : DAY_MIN;
      // Ending in the hour played twice when the clocks go back, before its start by the clock:
      // drawn from its start for its length
      if (end <= start) end = Math.min(DAY_MIN, start + Math.round((e - s) / 60000));
      pieces.push({
        day: (d0.getDay() + 6) % 7,
        start,
        end,
        d0,
        isLast: endsAt <= d1,
      });
    }
  }
  return pieces;
}


// A target is a partial state of the thermostat, as a scene holds it (#91): { preset_mode } or
// { temperature }, as the integration stores what a preset means on a thermostat and what an
// override sets. Its kind, "preset" or "temperature".
export const targetKind = (target) => (target && 'temperature' in target ? 'temperature' : 'preset');

// The override's value: Off when it turns the thermostat off (whatever preset it restarts on),
// else the preset picked (`d.preset`, among `presets`), its temperature or the thermostat's own
// preset, else the HVAC mode it turns the thermostat on in
export function overrideLabel(d, locale = DEFAULT_LOCALE, presets = []) {
  if (!d) return '';
  const target = d.target || {};
  if (target.hvac_mode === 'off') return modeName(locale, 'off');
  const picked = d.preset && presets.find((p) => p.id === d.preset);
  if (picked) return picked.name;
  // Heat/cool with a range set by hand: "19–24.5 °C"
  if ('target_temp_low' in target && 'target_temp_high' in target && !('temperature' in target) && !('preset_mode' in target)) {
    return rangeText(target.target_temp_low, target.target_temp_high, locale);
  }
  if ('temperature' in target) return `${locale.number(target.temperature)} ${locale.unit}`;
  if ('preset_mode' in target) return locale.preset(target.preset_mode);
  return target.hvac_mode ? modeName(locale, target.hvac_mode) : '';
}
// An override that turns the thermostat off
export const isOffOverride = (d) => !!d && !!d.target && d.target.hvac_mode === 'off';
// The HVAC mode an override turns the thermostat on in, when it sets one
export const overrideHvac = (d) => (d && d.target && d.target.hvac_mode && d.target.hvac_mode !== 'off' ? d.target.hvac_mode : null);
// The same, when it takes a setpoint: heat, cool or heat/cool
export const setpointHvac = (d) => (SETPOINT_MODES.includes(overrideHvac(d)) ? overrideHvac(d) : null);


// Where the tag of an override goes on its bar, from what was measured (left and right edges,
// in pixels): `tag` (its width), the override's block, the bar, and the labels the slots show.
// After the block ('') when it covers no label and stays in the bar; else before it; else
// above the bar, from the block's left edge, or from its right edge when it would leave the bar
// The gaps of the stylesheet (.override-tag), counted from the block's border
const TAG_AFTER = 10; // past the handle of the override's end
const TAG_BEFORE = 2;
const TAG_MARGIN = 3; // between the tag and a label
export function tagSide(tag, block, bar, labels) {
  const free = (left) => left >= bar.left && left + tag.width <= bar.right
    && !labels.some((l) => l.left < left + tag.width + TAG_MARGIN && l.right > left - TAG_MARGIN);
  if (free(block.right + TAG_AFTER)) return '';
  if (free(block.left - TAG_BEFORE - tag.width)) return 'before';
  return block.left + tag.width <= bar.right ? 'above' : 'above end';
}
