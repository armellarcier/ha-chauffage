import { parseSlot, slotToArray } from '../slots.ts';
import { dataSource } from './snapshot.ts';

// What the cards change in the integration, through its websocket commands. Each command returns
// the promise of Home Assistant's answer.
export function commands(hass) {
  const call = (msg) => hass.callWS(msg);
  return {
    // Saves against the revision of each thermostat sent. The weeks of a schedule the
    // integration doesn't have are left out.
    saveWeeks: (weeks, revisions) => {
      const src = dataSource(hass);
      const out = {};
      for (const [climate, bySchedule] of Object.entries(weeks)) {
        out[climate] = {};
        for (const [id, week] of Object.entries(bySchedule)) {
          if (src.hasSchedule(id)) out[climate][id] = (week as any[]).map((day) => day.map((s) => slotToArray(parseSlot(s))));
        }
      }
      return call({ type: 'chauffage/weeks/save', weeks: out, revisions });
    },
    // `source`: 'panel' from the panel, told in the logbook; none from a card
    setOverride: (climate, override, source?) => call({ type: 'chauffage/override/set', entity_id: climate, override, ...(source ? { source } : {}) }),
    setPaused: (climate, paused) => call({ type: 'chauffage/thermostat/set', entity_id: climate, paused }),
    forget: (climate) => call({ type: 'chauffage/thermostat/forget', entity_id: climate }),
    // The settings of overrides, in the integration's options: { manual_override_end?, override_duration? }
    setSettings: (settings) => call({ type: 'chauffage/settings/set', ...settings }),
    activateSchedule: (id, source?) => call({ type: 'chauffage/schedule/activate', schedule: id, ...(source ? { source } : {}) }),
    // Create, rename, move, delete schedules: [{ id, name? } | { name, copy_of? }]
    setSchedules: (list, revision) => call({ type: 'chauffage/schedules/set', schedules: list, ...(revision != null ? { revision } : {}) }),
    setMapping: (climate, mapping) => call({ type: 'chauffage/mapping/set', entity_id: climate, mapping }),
    setPresets: (presets, replacements) => call({ type: 'chauffage/presets/set', presets, replacements }),
    setRules: (rules, defaultSchedule) => call({ type: 'chauffage/rules/set', rules, default_schedule: defaultSchedule }),
  };
}

export type Commands = ReturnType<typeof commands>;
