import { accessAllows, accessLevelOf, isAdmin, parseDate } from '../common.ts';
import { VERSION } from '../version.ts';
import { client } from './chauffage-client.ts';

// Compares two versions of ha-chauffage ("0.6.0", "0.6.0-beta.4"): < 0, 0 or > 0; a beta
// comes before its release
export function compareVersions(a, b) {
  const parse = (v) => {
    const [release, pre] = String(v).split('-');
    return [release.split('.').map(Number), pre ? pre.split('.') : null];
  };
  const [ra, pa] = parse(a);
  const [rb, pb] = parse(b);
  for (let i = 0; i < 3; i++) if ((ra[i] || 0) !== (rb[i] || 0)) return +(ra[i] || 0) - +(rb[i] || 0);
  if (!pa || !pb) return (pa ? -1 : 0) - (pb ? -1 : 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined || pb[i] === undefined) return pa[i] === undefined ? -1 : 1;
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const diff = Number.isNaN(na) || Number.isNaN(nb) ? (pa[i] as any).localeCompare(pb[i]) : na - nb;
    if (diff) return diff;
  }
  return 0;
}

export const integrationAvailable = (hass) => !!(hass && hass.services && hass.services.chauffage);

// The overrides that have not ended yet
export const filterActive = (raw) => {
  const out = {};
  const now = new Date();
  for (const [c, d] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (d && parseDate((d as any).end) > now) out[c] = d;
  }
  return out;
};

// The same hass and data give the same snapshot: a render asks for it once per bar or chip
let last: any = { hass: null, data: null, snapshot: null };

// What the cards read from the integration, for this hass: the page's client subscribes on the
// first call
export function dataSource(hass): Snapshot {
  if (integrationAvailable(hass)) client.connect(hass);
  const available = integrationAvailable(hass) && !client.missing;
  if (last.snapshot && last.hass === hass && last.data === client.data
    && last.available === available) return last.snapshot;
  const snapshot = makeSnapshot(hass, available ? client.data : null, available);
  last = { hass, data: client.data, available, snapshot };
  return snapshot;
}

export type Snapshot = ReturnType<typeof makeSnapshot>;

// The read model of the integration's data. `raw` is the data of `chauffage/subscribe`, null
// before it comes.
export function makeSnapshot(hass, raw, available: boolean) {
  // The running integration is older than the card (updated from HACS, Home Assistant not
  // restarted yet): an older version, or data in a format this card does not know
  const compared = raw && raw.version ? compareVersions(VERSION, raw.version) : 0;
  const outdated = !!raw && (compared > 0 || !(Array.isArray(raw.schedules) && raw.weeks && typeof raw.weeks === 'object'));
  // A card older than the integration: the page stayed open during an update (HA's frontend
  // reconnects without reloading it), or an older copy of the card was loaded first (#36)
  const stale = compared < 0;
  const d = outdated || stale ? null : raw;
  const schedules = d ? d.schedules : [];
  const ids = new Set(schedules.map((s) => s.id));
  // The icon chosen in Home Assistant for a schedule's switch, if any (none by default: the same
  // icon on every tab would only take room)
  const scheduleIcon = (id) => {
    const entity = d && d.schedule_entities && d.schedule_entities[id];
    return (entity && hass.entities && hass.entities[entity] && hass.entities[entity].icon) || null;
  };
  return {
    available, // false: the integration is not set up
    outdated, // true: Home Assistant must be restarted to finish an update
    stale, // true: the page must be reloaded to finish an update
    ready: !!d,
    revision: d ? d.revision : null,
    schedules: (): string[] => schedules.map((s) => s.id),
    hasSchedule: (id) => ids.has(id),
    scheduleName: (id) => (schedules.find((s) => s.id === id) || { name: id }).name,
    activeSchedule: () => (d ? d.active_schedule : null),
    // Weeks by thermostat and schedule id, with [start, preset, settings?] slots as the
    // integration stores them (#91)
    weeks: () => {
      const out = {};
      for (const [climate, bySchedule] of Object.entries(d ? d.weeks : {})) {
        out[climate] = {};
        for (const [id, week] of Object.entries(bySchedule)) {
          if (ids.has(id)) out[climate][id] = week;
        }
      }
      return out;
    },
    overrides: () => ({ ...(d ? d.overrides : {}) }),
    // A paused thermostat is kept but not driven (docs/decisions.md, "Scheduled thermostats")
    paused: (climate) => !!(d && d.thermostats && d.thermostats[climate] && d.thermostats[climate].paused),
    // Why a thermostat protects itself, when the integration knows: 'window', 'auto_start_stop' or null
    cause: (climate) => (d && d.thermostats && d.thermostats[climate] && d.thermostats[climate].cause) || null,
    // The fan and the vanes the thermostat gets back from a slot or an override that sets none
    ownSettings: (climate) => (d && d.thermostats && d.thermostats[climate] && d.thermostats[climate].own_settings) || {},
    scheduled: () => Object.keys((d && d.thermostats) || {}),
    renamed: () => (d && d.renamed) || {},
    // Saves against the revision of each thermostat sent (null: not scheduled when loaded)
    revisionOf: (climate) => (d && d.thermostats && d.thermostats[climate] ? d.thermostats[climate].revision : null),
    overrideDuration: () => (d && d.override_duration) || 120, // minutes, an option of the integration
    // How a change by hand ends (#83): 'duration' (the default), 'next_slot_within_duration' or
    // 'next_slot'
    manualOverrideEnd: () => (d && d.manual_override_end) || 'duration',
    // How an off override ends (#91): the same choices, 'next_slot' by default. An integration
    // older than the setting ends it after the override duration
    offOverrideEnd: () => (d ? d.off_override_end || 'duration' : 'next_slot'),
    presets: () => (d && d.presets) || [],
    targets: (climate) => (d && d.targets && d.targets[climate]) || {},
    scheduleIcon,
    // The entities and the device the cards open (#39): a thermostat's own ones (control,
    // override, planned_preset, override_end), a schedule's switch, the active-schedule select
    thermostatEntity: (climate, name) => (d && d.thermostat_entities && d.thermostat_entities[climate] && d.thermostat_entities[climate][name]) || null,
    scheduleEntity: (id) => (d && d.schedule_entities && d.schedule_entities[id]) || null,
    scheduleSelect: () => (d && d.schedule_select) || null,
    deviceId: () => (d && d.device_id) || null,
    // What a thermostat follows now and the next different slot: { preset, hvac_mode (off, the
    // schedule's, or null), target, next_preset, next_hvac_mode, next_start, next_slot_end }
    planned: (climate) => (d && d.planned && d.planned[climate]) || null,
    // What the user may change (#99), as the integration checks it: `plannable` the weeks and the
    // schedules (canPlan), `editable` the rest of the setup, the panel (canSetUp), `admin` the
    // access level and Home Assistant's own pages
    accessLevel: () => accessLevelOf(d),
    plannable: !!d && accessAllows(hass, d, 'plan'),
    editable: !!d && accessAllows(hass, d, 'set_up'),
    admin: isAdmin(hass),
    mapping: (climate) => (d && d.mappings && d.mappings[climate]) || {},
    usePresets: () => !d || d.use_presets !== false,
    presetTemperature: (climate, preset) => ((d && d.preset_temperatures && d.preset_temperatures[climate]) || {})[preset],
    // What a thermostat's own preset gives when it cools (an air conditioner), when known
    coolPresetTemperature: (climate, preset) => ((d && d.cool_preset_temperatures && d.cool_preset_temperatures[climate]) || {})[preset],
    usedPresets: () => {
      const used = new Set();
      for (const bySchedule of Object.values(d ? d.weeks : {})) {
        for (const week of Object.values(bySchedule)) for (const day of week) for (const [, preset] of day) used.add(preset);
      }
      return [...used];
    },
    // Activation rules [{ template, schedule }], the schedule when none is true (null: no change),
    // and each rule now (true, false, null: its template failed)
    rules: () => (d && d.rules) || [],
    defaultSchedule: () => (d && d.default_schedule) || null,
    ruleResults: () => (d && d.rule_results) || [],
  };
}

// The new id of a thermostat renamed from `entity` (the integration follows it), unless an
// entity has that id again
export function renamedTo(hass, src: Snapshot, entity) {
  const to = src.renamed()[entity];
  return to && !(hass && hass.states[entity]) ? to : null;
}
