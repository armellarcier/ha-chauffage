import { NO_PRESET_MODES, clone, hasNoPreset, sameSlot, slotSettings, toHM, toMin, withSettings } from './common.ts';

// A day's slots in order, the first one at 00:00, one slot per start time. Two slots in a row
// that are the same stay two slots: the user cut them (docs/decisions.md, "Card")
export function normalize(segs) {
  const sorted = segs.slice().sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of sorted) {
    if (out.length && out[out.length - 1].start === s.start) out[out.length - 1] = withSettings(s, s.settings);
    else out.push(withSettings(s, s.settings));
  }
  if (out.length) out[0].start = 0;
  return out.length ? out : [{ start: 0, preset: 'eco' }];
}
// The slots the card made the same join: a day copied to a thermostat that cannot follow every
// slot, a whole week set to heat or to cool
export const joined = (segs) => normalize(segs).filter((s, i, all) => i === 0 || !sameSlot(all[i - 1], s));
// A day's slots copied elsewhere: without the mark of a piece the card cut (see _settle)
export const copyOfDay = (segs) => clone(segs).map(({ cut: _, ...slot }) => slot);
// The slot at `idx` joins the slot before it when they are the same: the user removed what was
// between them
export function joinAt(segs, idx) {
  if (idx > 0 && idx < segs.length && sameSlot(segs[idx - 1], segs[idx])) segs.splice(idx, 1);
}

// A slot from the integration ([start, preset, settings?]) or from its text form
export function parseSlot(raw) {
  // An off slot and a fan-only slot have no preset, whatever was written with them
  const slot = (start, preset, settings) => {
    const set = slotSettings(settings);
    const none = set && NO_PRESET_MODES.includes(set.hvac_mode);
    return withSettings({ start, preset: none ? null : preset }, set);
  };
  if (Array.isArray(raw)) return slot(toMin(raw[0]), raw[1] == null ? '' : String(raw[1]), raw[2]);
  const m = String(raw).trim().match(/^(\S+)\s+(\S+)(?:\s+(\{.*\}))?$/);
  if (!m) return { start: NaN, preset: '' };
  let settings = null;
  try { settings = m[3] ? JSON.parse(m[3]) : null; } catch (e) { settings = null; }
  return slot(toMin(m[1]), m[2] === '-' ? '' : m[2], settings);
}

export function parseDay(list) {
  if (!Array.isArray(list)) return [{ start: 0, preset: 'eco' }];
  return normalize(list.map(parseSlot).filter((s) => !isNaN(s.start) && (s.preset || hasNoPreset(s))));
}

const serializeSlot = (s) => `${toHM(s.start)} ${s.preset ?? '-'}${s.settings ? ` ${JSON.stringify(s.settings)}` : ''}`;
export const serializeDay = (segs) => segs.map(serializeSlot);
// A slot as the integration stores it
export const slotToArray = (s) => (s.settings ? [toHM(s.start), s.preset ?? null, s.settings] : [toHM(s.start), s.preset]);
