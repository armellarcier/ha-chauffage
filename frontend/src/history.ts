import { DAY_MIN, minutesOf } from './common.ts';

// ---------- data sources ----------
// The card reads and writes through the Chauffage integration's websocket API. The source gives
// the data in the format the card works with: schedules by id, "HH:MM preset" slots,
// overrides as { target: { preset_mode } | { temperature }, start, end }.

// ---------- history of the measured temperature ----------
export const HISTORY_DAYS = 7;
export const HISTORY_MAX_AGE = 5 * 60000; // reloaded every 5 minutes while shown
export const RECORDER_DELAY = 60000; // the last minute is loaded again (not written by the recorder yet)
export const SETPOINT_MARGIN = 3; // °: a setpoint this close to the measured temperatures widens the scale
export const MEASURE_RAMP = 15; // minutes: a measured change after a steady time is drawn as a slope over this
export const temperatureOf = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Value of a curve ([minute, value] points, each value held until the next point) at a minute, if covered
export function curveValue(line, m) {
  if (!line.length || m < line[0][0] || m > line[line.length - 1][0]) return null;
  return line.filter(([at]) => at <= m).pop()[1];
}

/**
 * Home Assistant's own history (compressed format of `history/history_during_period`: `s` state,
 * `a` attributes, `lu` time in seconds, `lc` when different) → the rows of `chauffage/history`:
 * [time (s), measured, target], null while the thermostat is unavailable.
 */
export function rowsOfStates(raw) {
  const out = {};
  for (const [entity, states] of Object.entries(raw || {})) {
    out[entity] = (Array.isArray(states) ? states : []).map((st) => {
      const off = ['unavailable', 'unknown'].includes(st.s);
      const a = st.a || {};
      return [st.lu ?? st.lc, off ? null : temperatureOf(a.current_temperature), off ? null : temperatureOf(a.temperature)];
    });
  }
  return out;
}

/**
 * Rows of `chauffage/history` → per thermostat, per weekday (Monday = 0), its last occurrence
 * (today until now): `current` (measured) and `target` (setpoint applied) temperature as lines of
 * [minute, value] points (each value held until the next point), broken while the thermostat
 * reported no value.
 */
export function historyDays(rows, now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = (now.getDay() + 6) % 7;
  const out = {};
  for (const [entity, list] of Object.entries(rows || {})) {
    const points = (Array.isArray(list) ? list : [])
      .map(([t, current, target]) => ({ t: t * 1000, current: temperatureOf(current), target: temperatureOf(target) }))
      .filter((p) => Number.isFinite(p.t))
      .sort((p, q) => p.t - q.t);
    // One day, from `start` (midnight) to `stop` (the next midnight, or now), `end` minutes long
    const lines = (key, start, stop, end) => {
      const done = [];
      let line = null;
      const add = (m, v) => {
        const last = line && line[line.length - 1];
        if (v == null) {
          if (line) done.push([...line, [Math.max(m, last[0]), last[1]]]);
          line = null;
        } else if (!line) {
          line = [[m, v]];
        } else if (v !== last[1]) {
          // Wall-clock minutes (the slots' ones) never go back, even in the repeated hour of winter time
          const at = Math.max(m, last[0]);
          if (at === last[0]) line.pop();
          if (!line.length || line[line.length - 1][1] !== v) line.push([at, v]);
        }
      };
      const before = points.filter((p) => p.t <= start.getTime()).pop();
      if (before) add(0, before[key]);
      for (const p of points) {
        if (p.t > start.getTime() && p.t < stop.getTime()) add(minutesOf(new Date(p.t)), p[key]);
      }
      if (line) {
        const last = line[line.length - 1];
        if (end > last[0]) line.push([end, last[1]]);
        done.push(line);
      }
      return done;
    };
    out[entity] = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const start = new Date(midnight);
      start.setDate(start.getDate() - ((today - d + 7) % 7));
      const next = new Date(start);
      next.setDate(next.getDate() + 1);
      const [stop, end] = d === today ? [now, minutesOf(now)] : [next, DAY_MIN];
      return { current: lines('current', start, stop, end), target: lines('target', start, stop, end) };
    });
  }
  return out;
}

// Rows already loaded + rows loaded from `since` (s), only from the start of the period (the row
// before it kept: the value at its start)
export function mergeRows(old, fresh, since, start) {
  const out = {};
  for (const entity of new Set([...Object.keys(old || {}), ...Object.keys(fresh || {})])) {
    const rows = [...((old && old[entity]) || []).filter(([t]) => t < since), ...((fresh && fresh[entity]) || [])];
    const before = rows.filter(([t]) => t <= start).length;
    out[entity] = rows.slice(Math.max(0, before - 1));
  }
  return out;
}
