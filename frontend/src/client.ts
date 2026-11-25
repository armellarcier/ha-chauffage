import { accessAllows, accessLevelOf, esc, isAdmin, parseDate } from './common.ts';
import { parseSlot, slotToArray } from './slots.ts';
import { VERSION } from './version.ts';

// Home Assistant from a given release on ("2025.11.0b3" and "2025.12.0.dev…" count as their
// release); false when the version is unknown
export function haAtLeast(hass, year, month) {
  const m = /^(\d+)\.(\d+)/.exec((hass && hass.config && hass.config.version) || '');
  return !!m && (Number(m[1]) > year || (Number(m[1]) === year && Number(m[2]) >= month));
}

// Compares two versions of ha-chauffage ("0.6.0", "0.6.0-beta.4"): < 0, 0 or > 0; a beta
// comes before its release
export function compareVersions(a, b) {
  const parse = (v) => {
    const [release, pre] = String(v).split('-');
    return [release.split('.').map(Number), pre ? pre.split('.') : null];
  };
  const [ra, pa] = parse(a);
  const [rb, pb] = parse(b);
  for (let i = 0; i < 3; i++) if ((ra[i] || 0) !== (rb[i] || 0)) return (ra[i] || 0) - (rb[i] || 0);
  if (!pa || !pb) return (pa ? -1 : 0) - (pb ? -1 : 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined || pb[i] === undefined) return pa[i] === undefined ? -1 : 1;
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const diff = Number.isNaN(na) || Number.isNaN(nb) ? pa[i].localeCompare(pb[i]) : na - nb;
    if (diff) return diff;
  }
  return 0;
}

// Name shown for a thermostat: the `name` of the card's config (text, or pieces such as the
// area and the entity, as in HA's own cards) made by HA (from 2025.10); before, a text name or
// the thermostat's own name
export function thermostatName(hass, entity, name) {
  const st = hass && hass.states[entity];
  if (st && hass.formatEntityName) return hass.formatEntityName(st, name === '' ? undefined : name) || entity;
  return (typeof name === 'string' && name) || (st && st.attributes.friendly_name) || entity;
}

export const integrationAvailable = (hass) => !!(hass && hass.services && hass.services.chauffage);
export const filterActive = (raw) => {
  const out = {};
  const now = new Date();
  for (const [c, d] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (d && parseDate(d.end) > now) out[c] = d;
  }
  return out;
};

// The subscription tried again: first after 5 s, then twice as long each time, up to a minute
const SUBSCRIBE_RETRY_MS = 5000;
const SUBSCRIBE_RETRY_MAX_MS = 60000;
const SUBSCRIBE_NO_DATA_MS = 10000;

// One subscription per page, shared by every card and more-info block
export const INTEGRATION = {
  data: null,
  // true: Home Assistant has the integration's services but no loaded entry (deleted or disabled;
  // its services stay until a restart)
  missing: false,
  seq: 0,
  listeners: new Set(),
  connection: null,
  hass: null, // the latest, for the panels of a "not_loaded"
  attempt: 0, // the subscription of the moment: the answers of a former one are ignored
  subscribed: null, // its unsubscribe function, once Home Assistant has answered
  retryIn: SUBSCRIBE_RETRY_MS,
  timer: null,
  connect(hass) {
    this.hass = hass;
    // Set up again (its panel is back): subscribed again, with no page reload
    if (this.missing && hass.panels && hass.panels.chauffage && hass.panels !== this.missingPanels) this.connection = null;
    if (!hass.connection || this.connection === hass.connection) return;
    this.subscribe(hass.connection);
  },
  subscribe(connection) {
    this.connection = connection;
    this.watchReconnections(connection);
    clearTimeout(this.timer);
    this.timer = null;
    if (this.subscribed) this.subscribed.then((unsubscribe) => unsubscribe && unsubscribe()).catch(() => {});
    const attempt = ++this.attempt;
    let received = false;
    // Not replayed by Home Assistant's library after a reconnection: it tries once, often before
    // Chauffage is set up, and never again. The card subscribes again itself (watchReconnections).
    const subscribed = connection.subscribeMessage((data) => {
      if (attempt !== this.attempt) return;
      received = true;
      clearTimeout(this.timer);
      this.timer = null;
      this.retryIn = SUBSCRIBE_RETRY_MS;
      this.missing = false;
      this.data = data;
      this.seq += 1;
      this.notify();
    }, { type: 'chauffage/subscribe' }, { resubscribe: false });
    this.subscribed = subscribed.catch(() => null);
    subscribed.then(() => {
      // The integration sends its data at once: a subscription that brings nothing is made again
      if (attempt === this.attempt && !received) this.retry(SUBSCRIBE_NO_DATA_MS);
    }, (e) => {
      if (attempt !== this.attempt) return;
      const code = e && e.code;
      if (code === 'not_loaded') {
        this.missing = true;
        this.missingPanels = this.hass && this.hass.panels; // a new set holding Chauffage's panel means it is back
        this.notify();
      }
      // Not set up yet (Home Assistant is starting), or deleted: tried again, less and less often
      if (code === 'not_loaded' || code === 'unknown_command') {
        this.retry(this.retryIn);
        this.retryIn = Math.min(this.retryIn * 2, SUBSCRIBE_RETRY_MAX_MS);
        return;
      }
      console.error('ha-chauffage: cannot subscribe to the integration', e);
      this.connection = null;
    });
  },
  // Subscribes again later, while a card, a block or the panel is on the page
  retry(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.listeners.size && this.connection) this.subscribe(this.connection);
    }, ms);
  },
  // Home Assistant restarted, or the page woke up: the connection is ready again
  watchReconnections(connection) {
    if (this.watched === connection || !connection.addEventListener) return;
    this.watched = connection;
    connection.addEventListener('ready', () => {
      if (this.connection !== connection) return;
      // The server dropped the former subscription with the former socket. Its id now belongs to
      // another message of the new socket: unsubscribing it would close someone else's.
      this.subscribed = null;
      this.retryIn = SUBSCRIBE_RETRY_MS;
      this.subscribe(connection);
    });
  },
  notify() {
    for (const listener of [...this.listeners]) listener();
  },
  listen(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.timer) {
        // No more tries: the next card subscribes again
        clearTimeout(this.timer);
        this.timer = null;
        this.connection = null;
      }
    };
  },
};

// The new id of a thermostat renamed from `entity` (the integration follows it), unless an
// entity has that id again
export function renamedTo(hass, src, entity) {
  const to = src.renamed()[entity];
  return to && !(hass && hass.states[entity]) ? to : null;
}

// Reloads the page to finish an update. Home Assistant's service worker serves the page from its
// cache, then updates it: its caches are emptied first, or the first reload gets the former page
// again (the companion app has no hard reload).
export async function reloadPage(win = window) {
  try {
    if (win.caches) await Promise.all((await win.caches.keys()).map((key) => win.caches.delete(key)));
  } catch (e) { /* reloaded all the same */ }
  win.location.reload();
}

// What a card or the panel shows instead of its content while the integration's data can't be
// used: a text, with a Reload button when reloading the page finishes an update, or "…" while
// the data is on its way. null once the data is ready.
export const NOTICE_RELOAD = { text: 'reloadNeeded', reload: true };
export function sourceNotice(src) {
  if (src.stale) return NOTICE_RELOAD;
  if (!src.available) return { text: 'integrationMissing' };
  if (src.outdated) return { text: 'restartNeeded' };
  if (!src.ready) return { loading: true };
  return null;
}

// The notice's HTML. Its Reload button carries data-act="reload-page": bind it with bindReload.
export function noticeHtml(notice, t) {
  if (notice.loading) return '<div class="loading">…</div>';
  const button = notice.reload
    ? `<div><button class="btn primary" data-act="reload-page">${esc(t('reloadPage'))}</button></div>` : '';
  return `<div class="missing" role="status">${esc(t(notice.text))}${button}</div>`;
}

export function bindReload(root, onClick) {
  const button = root.querySelector('[data-act="reload-page"]');
  if (button) button.addEventListener('click', onClick);
}

// The same hass and data give the same source: a render asks for it once per bar or chip
let lastSource = { hass: null, data: null, src: null };

export function dataSource(hass) {
  if (integrationAvailable(hass)) INTEGRATION.connect(hass);
  const available = integrationAvailable(hass) && !INTEGRATION.missing;
  if (lastSource.src && lastSource.hass === hass && lastSource.data === INTEGRATION.data
    && lastSource.available === available) return lastSource.src;
  const src = makeDataSource(hass, available);
  lastSource = { hass, data: INTEGRATION.data, available, src };
  return src;
}

function makeDataSource(hass, available) {
  const raw = available ? INTEGRATION.data : null;
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
    stamps: d ? { weeks: `r${d.revision}`, overrides: JSON.stringify(d.overrides),
      schedule: JSON.stringify([d.active_schedule, schedules.map((s) => scheduleIcon(s.id))]),
      rules: JSON.stringify([d.rules, d.default_schedule, d.rule_results]), thermostats: JSON.stringify(d.thermostats),
      // The ids of what the cards open (an entity renamed in HA)
      entities: JSON.stringify([d.thermostat_entities, d.schedule_entities, d.schedule_select, d.device_id]),
      // What the user may change: the access level, and whether the user is an admin
      access: `${accessLevelOf(d)} ${isAdmin(hass)}` } : {},
    schedules: () => schedules.map((s) => s.id),
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
    setPaused: (climate, paused) => hass.callWS({ type: 'chauffage/thermostat/set', entity_id: climate, paused }),
    scheduled: () => Object.keys((d && d.thermostats) || {}),
    forget: (climate) => hass.callWS({ type: 'chauffage/thermostat/forget', entity_id: climate }),
    renamed: () => (d && d.renamed) || {},
    // Saves against the revision of each thermostat sent (null: not scheduled when loaded)
    revisionOf: (climate) => (d && d.thermostats && d.thermostats[climate] ? d.thermostats[climate].revision : null),
    saveWeeks: (weeks, revisions) => {
      const out = {};
      for (const [climate, bySchedule] of Object.entries(weeks)) {
        out[climate] = {};
        for (const [id, week] of Object.entries(bySchedule)) {
          if (ids.has(id)) out[climate][id] = week.map((day) => day.map((s) => slotToArray(parseSlot(s))));
        }
      }
      return hass.callWS({ type: 'chauffage/weeks/save', weeks: out, revisions });
    },
    // `source`: 'panel' from the panel, told in the logbook; none from a card (older integrations)
    setOverride: (climate, override, source) => hass.callWS({ type: 'chauffage/override/set', entity_id: climate, override, ...(source ? { source } : {}) }),
    overrideDuration: () => (d && d.override_duration) || 120, // minutes, an option of the integration
    // How a change by hand ends (#83): 'duration' (the default), 'next_slot_within_duration' or
    // 'next_slot'
    manualOverrideEnd: () => (d && d.manual_override_end) || 'duration',
    // How an off override ends (#91): the same choices, 'next_slot' by default. An integration
    // older than the setting ends it after the override duration
    offOverrideEnd: () => (d ? d.off_override_end || 'duration' : 'next_slot'),
    // The settings of overrides, in the integration's options: { manual_override_end?, override_duration? }
    setSettings: (settings) => hass.callWS({ type: 'chauffage/settings/set', ...settings }),
    activateSchedule: (id, source) => hass.callWS({ type: 'chauffage/schedule/activate', schedule: id, ...(source ? { source } : {}) }),
    // Create, rename, move, delete schedules: [{ id, name? } | { name, copy_of? }]
    setSchedules: (list, revision) => hass.callWS({ type: 'chauffage/schedules/set', schedules: list, ...(revision != null ? { revision } : {}) }),
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
    setMapping: (climate, mapping) => hass.callWS({ type: 'chauffage/mapping/set', entity_id: climate, mapping }),
    setPresets: (presets, replacements) => hass.callWS({ type: 'chauffage/presets/set', presets, replacements }),
    // Activation rules [{ template, schedule }], the schedule when none is true (null: no change),
    // and each rule now (true, false, null: its template failed)
    rules: () => (d && d.rules) || [],
    defaultSchedule: () => (d && d.default_schedule) || null,
    ruleResults: () => (d && d.rule_results) || [],
    setRules: (rules, defaultSchedule) => hass.callWS({ type: 'chauffage/rules/set', rules, default_schedule: defaultSchedule }),
  };
}
