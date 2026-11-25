import { esc, isAdmin } from './common.ts';

// ---------- links to what a card mentions (#39) ----------
// A thermostat, a schedule or a setting a card names opens in Home Assistant: an entity in its
// more-info dialog (`data-more-info`), a device in its page (`data-device`, admins only: it is a
// settings page). The cards handle the clicks (openMoreInfo, openDevice).

// A text with a link in place of one of its values: the text escaped, then the link put in
export const LINK_TOKEN = '\u{E000}';
export function withHtml(text, html) {
  return esc(text).replace(LINK_TOKEN, html);
}

export function entityLinkHtml(entity, label, title = '') {
  return `<span class="mi-link" role="link" tabindex="0" data-more-info="${esc(entity)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</span>`;
}

// The device of an entity, as HA's frontend knows it (its entity registry); null without one
export function deviceOf(hass, entity) {
  const e = hass && hass.entities && hass.entities[entity];
  return (e && e.device_id) || null;
}

export function deviceLinkHtml(hass, id, label) {
  if (!id || !isAdmin(hass)) return '';
  return `<span class="mi-link" role="link" tabindex="0" data-device="${esc(id)}">${esc(label)}</span>`;
}

// A device named by itself: "Bureau (Thermostat programmé)"
export function deviceLabel(hass, id) {
  const d = id && hass && hass.devices && hass.devices[id];
  const name = d ? d.name_by_user || d.name || id : id;
  return d && d.model ? `${name} (${d.model})` : name;
}

// A link to a device, named by the device itself (admins)
export function deviceNamedLinkHtml(hass, id) {
  return deviceLinkHtml(hass, id, deviceLabel(hass, id));
}

// A row of the panel's lists, as the rows of the integration's page: an icon, a name and a line
// under it, a chevron, then its actions after a divider. The whole row is one link, except its
// actions
export function thRow(rowAttrs, linkAttrs, icon, title, sub, actions) {
  return `<div ${rowAttrs} role="link" tabindex="0" ${linkAttrs}>
    <div class="th-main">
      <ha-icon class="th-icon" icon="${esc(icon)}"></ha-icon>
      <div class="th-text"><div class="th-title">${title}</div>${sub}</div>
      <ha-icon class="th-chevron" icon="mdi:chevron-right" aria-hidden="true"></ha-icon>
    </div>
    ${actions ? `<span class="th-divider"></span><div class="th-actions">${actions}</div>` : ''}
  </div>`;
}

// A click on the actions at the end of a row of the panel's lists: not a click on the row's link
export const inRowActions = (e) => !!e.target.closest('.th-actions');

// A thermostat's devices: its own, then the scheduled thermostat's (Chauffage), once each
export function thermostatDevices(hass, src, climate) {
  return [deviceOf(hass, climate), deviceOf(hass, src.thermostatEntity(climate, 'control'))]
    .filter((id, i, list) => id && list.indexOf(id) === i);
}

// A link of the block opens a page: closes Home Assistant's more-info dialog first, then opens
// the page. The dialog lives in the address (?more-info-entity-id=) and closes by going back in
// the history: the page opens once that is done, else going back would undo it. Returns a function
// that cancels the page not opened yet.
export function leaveMoreInfo(el, open) {
  const ha = document.querySelector('home-assistant');
  const dialog: any = ha && ha.shadowRoot && ha.shadowRoot.querySelector('ha-more-info-dialog');
  const inAddress = () => window.location.search.includes('more-info-entity-id');
  if (!inAddress()) {
    openMoreInfo(el, null);
    open();
    return () => {};
  }
  if (dialog && typeof dialog.closeDialog === 'function') dialog.closeDialog();
  else openMoreInfo(el, null);
  // Home Assistant may leave the address without telling the window: the address is checked often
  const start = Date.now();
  let timer;
  const wait = () => {
    timer = !inAddress() || Date.now() - start > 1500 ? open() : setTimeout(wait, 30);
  };
  wait();
  return () => clearTimeout(timer);
}

// Runs `then` once the history entry is taken back (`gone()` holds after a popstate), at the
// latest after 1.5 s. Returns a function that cancels the wait.
export function afterHistoryBack(gone, then) {
  if (gone()) {
    then();
    return () => {};
  }
  const stop = () => {
    window.removeEventListener('popstate', check);
    clearTimeout(timer);
  };
  const done = () => {
    stop();
    then();
  };
  const check = () => {
    if (gone()) done();
  };
  window.addEventListener('popstate', check);
  const timer = setTimeout(done, 1500);
  return stop;
}

// view: 'settings' opens the entity's settings (its name, its icon), as Home Assistant's own pages do
export function openMoreInfo(el, entityId, view?) {
  const detail = view ? { entityId, view } : { entityId };
  el.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail }));
}

// Like HA's navigate(): the frontend follows the address
export function navigate(path) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
}

export function openDevice(id) {
  navigate(`/config/devices/device/${id}`);
}

// The Chauffage panel (frontend.py): a page, for example `presets`, or the overview
// The address of a page of the Chauffage panel ("" for the panel itself)
export const panelPath = (page) => (page ? `/chauffage/${page}` : '/chauffage');
// A thermostat's page, scrolled to its week in a schedule (see ChauffagePanel._scrollToWeek)
export const weeksPath = (climate, week?) => panelPath(`thermostats/${climate}${week ? `?week=${encodeURIComponent(week)}` : ''}`);

export function openPanel(page) {
  navigate(panelPath(page));
}

// The Chauffage panel's name: from its config, which keeps it out of the sidebar too (#104),
// else its title in the sidebar (an older integration)
export function panelTitle(hass) {
  const panel = hass && hass.panels && hass.panels.chauffage;
  return panelName(panel);
}
export function panelName(panel) {
  return (panel && ((panel.config && panel.config.title) || panel.title)) || 'Chauffage';
}
// Where the dashboards show each thermostat, in a Chauffage card:
// { climate: [{ dashboard, view, path, programme }] }, `programme` when a schedule card of the view
// shows it, where its weeks are edited (#99).
// The placements, read once per connection (a page load): the card's list and the panel share them
const PLACEMENTS = new WeakMap();
export function placements(hass) {
  const key = hass.connection || hass;
  if (!PLACEMENTS.has(key)) PLACEMENTS.set(key, cardPlacements(hass).catch(() => ({})));
  return PLACEMENTS.get(key);
}

// "Shown in dashboard › view, …", each a link; "…" while the dashboards are read (null)
export function placesHtml(t, places) {
  if (!places) return `${esc(t('inCards'))} …`;
  if (!places.length) return esc(t('inNoCard'));
  return `${esc(t('inCards'))} ${places.map((p) => `<span class="mi-link" role="link" tabindex="0" data-navigate="${esc(p.path)}">${esc(`${p.dashboard} › ${p.view}`)}</span>`).join(', ')}`;
}

export async function cardPlacements(hass) {
  const out = {};
  const add = (climate, place, programme) => {
    const list = out[climate] || (out[climate] = []);
    const same = list.find((p) => p.path === place.path);
    if (same) same.programme = same.programme || programme;
    else list.push({ ...place, programme });
  };
  // Every Chauffage card in a part of a config, nested in stacks, sections or conditions
  const walk = (node, place) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, place));
    if (!node || typeof node !== 'object') return;
    if (node.type === 'custom:chauffage-programme-card') {
      for (const t of node.thermostats || []) add(typeof t === 'string' ? t : t.entity, place, true);
    } else if (node.type === 'custom:chauffage-thermostat-card' && node.entity) {
      add(node.entity, place, false);
    }
    Object.values(node).forEach((v) => walk(v, place));
  };
  const dashboards = (await hass.callWS({ type: 'lovelace/dashboards/list' }).catch(() => null)) || [];
  const all = [{ url_path: null, title: hass.localize ? hass.localize('panel.states') : 'Overview' }, ...dashboards];
  await Promise.all(all.map(async (d) => {
    // A dashboard generated by Home Assistant has no config, so no card of ours
    const config = await hass.callWS({ type: 'lovelace/config', url_path: d.url_path }).catch(() => null);
    if (!config || !Array.isArray(config.views)) return;
    config.views.forEach((v, i) => walk(v, {
      dashboard: d.title || d.url_path,
      view: v.title || String(i + 1),
      path: `/${d.url_path || 'lovelace'}/${v.path || i}`,
    }));
  }));
  return out;
}
