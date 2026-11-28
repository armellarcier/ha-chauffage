import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { live } from 'lit/directives/live.js';
import { NOTICE_RELOAD, noticeTemplate, sourceNotice } from './notices.ts';
import { dataSource, renamedTo } from './client/snapshot.ts';
import { commands } from './client/commands.ts';
import { SnapshotController } from './controllers/snapshot-controller.ts';
import { errorText } from './common.ts';
import { groupPreference, historyPreference, saveGroupPreference, saveHistoryPreference } from './state/preferences.ts';
import { linksByKeyboard, roundDurationText } from './fields.ts';
import { hvacIconTemplate, slotModesOf } from './hvac.ts';
import { makeLocale } from './i18n/locale.ts';
import { deviceNamedLink, navigate, openDevice, openMoreInfo, openPanel, panelName, panelPath, placements, placesTemplate, thermostatDevices } from './links.ts';
import { DOC_OFF_BY_HAND, LS_NEW_ACCESS, LS_NEW_OFF, LS_NEW_SETTING, openSettings, seenNewOff, seenNewSetting } from './settings-dialog.ts';
import { BADGE_STYLE, LINK_STYLE } from './styles.ts';
import { VERSION } from './version.ts';

// =====================================================================
//  The Chauffage panel (frontend.py): where an admin, or a user with Set up, configures Chauffage. Lists, then sheets,
//  as Home Assistant's settings:
//  - a list has the panel's tabs: the schedules (and the activation rules), the thermostats,
//    the presets;
//  - a sheet is about one schedule or one thermostat: a breadcrumb to its list, no tabs.
//    /chauffage/schedules/<id>          every thermostat's week in this schedule
//    /chauffage/thermostats/<climate>   this thermostat's week in every schedule, its presets
//  A thermostat is named by its climate entity id, the key of a scheduled thermostat.
//  The settings are a dialog, not a page: the ⚙ of the lists' toolbar opens it on top.
//  Dashboards keep the cards, for everyday use.
// =====================================================================
// Thermostats first: everything starts from a scheduled thermostat, and a new user starts there
const PANEL_TABS = [['thermostats', 'viewThermostats'], ['schedules', 'pageSchedules'], ['presets', 'viewPresets']];
// The next steps after the welcome: 'pending' once the first thermostats are scheduled from it,
// 'closed' once the user closed them (this browser)
const LS_NEXT_STEPS = 'chauffage-panel:next-steps';

// What a panel address shows: { list } or { sheet, id, list }, else { redirect } (and { settings }
// to open the settings dialog on top)
export function panelRoute(path, src, hass) {
  const [page = '', id = null] = (path || '').split('/').filter(Boolean).map(decodeURIComponent);
  // The address of a thermostat before the pages (/chauffage/<climate>)
  if (page.includes('.')) return { redirect: `thermostats/${page}` };
  // The former Settings tab (#83): its links still open the settings, on top of the first tab
  if (page === 'settings') return { redirect: PANEL_TABS[0][0], settings: true };
  if (page === 'thermostats' && id) {
    const to = renamedTo(hass, src, id);
    return to ? { redirect: `thermostats/${to}` } : { sheet: 'thermostat', id, list: 'thermostats' };
  }
  if (page === 'schedules' && id) {
    // A schedule deleted from its sheet: back to the list
    if (src.ready && !src.schedules().includes(id)) return { redirect: 'schedules' };
    return { sheet: 'schedule', id, list: 'schedules' };
  }
  if (PANEL_TABS.some(([p]) => p === page)) return { list: page };
  // The rules live with the schedules; anything else opens the first tab
  return { redirect: page === 'rules' ? 'schedules' : PANEL_TABS[0][0] };
}


const PANEL_CSS = `
  :host { display:block; min-height:100vh; background:var(--primary-background-color); color:var(--primary-text-color); }
  .toolbar { position:relative; display:flex; align-items:center; gap:8px; height:56px; padding:0 12px;
    background:var(--app-header-background-color, var(--primary-color)); color:var(--app-header-text-color, #fff); }
  .title { flex:1; font-size:20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tabs { display:flex; overflow-x:auto; scrollbar-width:none; padding:0 8px;
    background:var(--app-header-background-color, var(--primary-color)); }
  .tab { flex:0 0 auto; padding:12px 14px; color:var(--app-header-text-color, #fff); opacity:.75;
    text-decoration:none; font-size:14px; border-bottom:2px solid transparent; white-space:nowrap; }
  .tab.on { opacity:1; border-bottom-color:currentColor; font-weight:500; }
  .content { max-width:1100px; margin:0 auto; padding:8px 8px 24px; }
  .missing, .content > .loading { color:var(--secondary-text-color); padding:16px; }
  .missing .btn { margin-top:12px; }
  h2 { margin:20px 8px 8px; font-size:16px; font-weight:500; }
  h3 { margin:16px 8px 6px; font-size:14px; font-weight:500; color:var(--secondary-text-color); }
  /* The week a link led to ("Edit its week"): under the toolbar once scrolled to */
  h3[data-fill-schedule] { scroll-margin-top:72px; }
  h3 [role="link"] { cursor:pointer; }
  h3 [role="link"]:hover { color:var(--primary-color); text-decoration:underline; }
  .box { padding:8px 16px; border-radius:var(--ha-card-border-radius, 12px); background:var(--card-background-color);
    border:1px solid var(--divider-color); }
  .grow { flex:1; }
  ${BADGE_STYLE}
  ${LINK_STYLE}
  .control .badge { font-size:13px; padding:3px 10px; }
  .btn { border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color);
    padding:6px 12px; border-radius:8px; cursor:pointer; font:inherit; font-size:14px; min-height:36px; }
  .btn.primary { background:var(--primary-color); border-color:var(--primary-color); color:var(--text-primary-color, #fff); }
  .error { padding:6px 0; color:var(--error-color, #db4437); }
  .welcome { padding:16px 20px; margin-top:8px; }
  .welcome h2 { margin:4px 0 8px; font-size:20px; }
  .welcome h3 { margin:20px 0 8px; font-size:15px; font-weight:500; color:var(--primary-text-color); }
  .welcome p { margin:6px 0; line-height:1.5; }
  .picks { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:6px 16px; }
  .pick { display:flex; align-items:center; gap:8px; min-height:40px; cursor:pointer; }
  .pick input { flex:none; width:18px; height:18px; margin:0; }
  .pick-name { display:flex; flex-direction:column; min-width:0; }
  .pick-name small { font-size:12px; color:var(--secondary-text-color); overflow:hidden; text-overflow:ellipsis; }
  .welcome .note { font-size:14px; color:var(--secondary-text-color); }
  .welcome [data-start], .welcome [data-navigate] { margin-top:8px; }
  .btn[disabled] { opacity:.5; cursor:default; }
  .notice { margin:8px 0 0; padding:10px 14px; border-radius:var(--ha-card-border-radius, 12px);
    background:var(--secondary-background-color); font-size:14px; }
  .notice a { color:var(--primary-color); margin-left:6px; }
  .next-steps { margin:8px 0 12px; padding:8px 16px 12px; }
  .next-head { display:flex; align-items:center; gap:8px; }
  .next-head h2 { flex:1; margin:8px 0; }
  .next-steps ul { margin:4px 0; padding-left:20px; line-height:1.6; }
  .notice.new-off { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; }
  .notice.new-off > span:first-child { flex:1 1 200px; }
  .notice-btns { display:flex; flex-wrap:wrap; gap:8px; margin-left:auto; }
  .next-steps li > div { margin:4px 0 8px; }
  .crumbs { display:flex; align-items:baseline; gap:8px; min-width:0; }
  .crumbs a { flex:0 1000 auto; min-width:1.5em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:inherit; opacity:.8; text-decoration:none; }
  .crumbs a:hover { opacity:1; text-decoration:underline; }
  .crumbs span:last-child { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .crumbs .sep { flex-shrink:0; }
  .sep { opacity:.6; }
  /* The header, aligned with the surface below: the tile top right, the rest on the left; on
     a phone, the tile first */
  .head { display:grid; grid-template-columns:minmax(0, 1fr); gap:12px; margin:8px 0 16px; }
  .head .tile { order:-1; min-width:0; }
  .control { display:flex; align-items:center; gap:8px; margin-top:8px; }
  .about { font-size:14px; color:var(--secondary-text-color); }
  .about > div { padding:2px 0; }
  @media (min-width:600px) {
    .head { grid-template-columns:minmax(0, 1fr) minmax(240px, 320px); align-items:start; }
    .head .tile { order:0; grid-column:2; grid-row:1; }
    .head [data-fill] { grid-column:1; grid-row:1; }
  }
  .sheet { padding:4px 16px 16px; }
  .sheet h2 { margin:16px 0 8px; }
  .sheet h3 { position:relative; display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:20px 0 6px;
    padding-top:12px; border-top:1px solid var(--divider-color); }
  .sheet .h2-row { margin:24px 0 0; padding-top:16px; border-top:1px solid var(--divider-color); }
  .sheet .h2-row h2 { margin:0; }
  .sheet .hint { margin:4px 0 0; }
  /* One save bar for the sheet, at the bottom of the window while the sheet has edits not saved yet */
  [data-fill="savebar"] { position:sticky; bottom:0; z-index:8; }
  .sheet-savebar { display:flex; flex-wrap:wrap; align-items:center; gap:8px;
    margin:12px 0 0; padding:10px 16px; border-radius:var(--ha-card-border-radius, 12px);
    background:var(--card-background-color); box-shadow:0 -4px 12px rgba(0,0,0,.2); }
  .sheet-savebar .dirty { margin-right:auto; font-size:14px; }
  .sheet-savebar .btns { display:flex; gap:8px; margin-left:auto; }
  .sheet-savebar.leaving { outline:2px solid var(--warning-color, #ffa600); }
  .sheet-savebar .error { flex-basis:100%; order:-1; font-size:13px; color:var(--error-color, #db4437); }
  .page-more { min-width:40px; min-height:40px; border:0; border-radius:50%; background:transparent; color:inherit;
    font-size:20px; cursor:pointer; }
  .page-menu { top:52px; right:8px; color:var(--primary-text-color); }
  .mi.danger { color:var(--error-color, #db4437); }
  .menu-btns { display:flex; gap:8px; padding:6px 14px 8px; }
  .menu .sep { height:1px; margin:5px 0; background:var(--divider-color); }
  .menu { position:absolute; top:100%; right:0; z-index:12; min-width:200px; padding:6px 0; border-radius:10px;
    background:var(--card-background-color); border:1px solid var(--divider-color); box-shadow:0 6px 20px rgba(0,0,0,.25); }
  .mh { padding:4px 14px 6px; font-size:12px; color:var(--secondary-text-color); }
  .mi { display:block; width:100%; padding:8px 14px; border:0; background:transparent; text-align:left; cursor:pointer;
    font:inherit; font-size:14px; font-weight:normal; color:var(--primary-text-color); }
  .mi:hover { background:var(--secondary-background-color); }
  .btn.icon { min-width:32px; padding:4px 8px; }
  .btn.icon.on { border-color:var(--primary-color); color:var(--primary-color); }
  .h2-row { display:flex; align-items:center; gap:12px; margin-right:8px; }
  .h2-row h2 { flex:1; }
  .chip { border:1px solid var(--divider-color); border-radius:16px; padding:4px 12px; background:transparent;
    color:var(--secondary-text-color); font:inherit; font-size:13px; cursor:pointer; }
  .chip.on { border-color:var(--primary-color); color:var(--primary-color); }
  .hint { margin:0 8px; font-size:12px; color:var(--secondary-text-color); }
  .hint .touch { display:none; }
  @media (hover:none), (pointer:coarse) { .hint .mouse { display:none; } .hint .touch { display:inline; } }
`;

// The page the panel built for an address: the cards it is made of, kept while it shows. Built
// again when what it is made of changes (willUpdate)
type PanelPage = {
  key: string;
  route: any;
  notice: any;
  schedules: string[];
  // How many thermostats are scheduled
  scheduled: number;
  // Every element of the page given hass on each update: the programme cards, the views, the tile
  cards: any[];
  // What the page shows, by its place: a list's views (in their frames), a sheet's presets, a
  // schedule's sheet's card
  views: any[];
  // A thermostat's sheet: its card of each schedule
  weekCards: Record<string, any>;
  // A thermostat's sheet: Home Assistant's tile, once loaded
  tile: any;
};

export class ChauffagePanel extends LitElement {
  static properties = {
    hass: { attribute: false },
    panel: { attribute: false },
    route: { attribute: false },
    narrow: { attribute: false },
  };

  static styles = unsafeCSS(PANEL_CSS);

  // Set by Home Assistant: hass, the panel (its title), the route (the page), narrow
  declare hass: any;
  declare panel: any;
  declare route: any;
  declare narrow: any;
  // Drawn again when the integration pushes new data
  _snapshot = new SnapshotController(this);
  _page: PanelPage | null = null;
  _copyMenu: string | null = null;
  _pageMenu = false;
  _pageForget = false;
  _error: string | null = null;
  _saveError: string | null = null;
  // The save bar asks before leaving a sheet with weeks not saved yet: what leaving does then
  _leave: (() => void) | null = null;
  _placements: any = undefined;
  _settingsFor: any;
  // A thermostat's sheet: identical days on one row for every schedule, as chosen on this device…
  _groupDays = groupPreference() !== false;
  // …and the history of the measured temperature, as chosen on this device (as the cards)
  _historyOn = historyPreference();
  _picked = new Set<string>(); // the welcome: the thermostats ticked

  // Closing or reloading the browser's page with weeks not saved yet: the browser asks
  _onUnload = (e) => {
    if (!this._dirtyWeeks().length) return;
    e.preventDefault();
    e.returnValue = '';
  };

  // Escape closes the panel's menus, as the card's menus
  _onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (this._copyMenu || this._pageMenu) {
      this._copyMenu = null;
      this._pageMenu = false;
      this.requestUpdate();
    }
  };

  createRenderRoot() {
    const root = super.createRenderRoot();
    linksByKeyboard(root);
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('chauffage-dirty', () => this.requestUpdate());
    root.addEventListener('change', (e: any) => {
      const box = e.target.closest('[data-pick]');
      if (!box) return;
      if (box.checked) this._picked.add(box.dataset.pick);
      else this._picked.delete(box.dataset.pick);
      this.requestUpdate();
    });
    return root;
  }

  connectedCallback() {
    super.connectedCallback();
    this.requestUpdate(); // What the integration pushed while it was off the page
    document.addEventListener('keydown', this._onKey);
    window.addEventListener('beforeunload', this._onUnload);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKey);
    window.removeEventListener('beforeunload', this._onUnload);
  }

  get _t() {
    return makeLocale(this.hass).t;
  }

  // Under its tabs, the panel shows what the cards show while the data can't be used. Also when
  // the page loaded a former card first: the panel's cards would not work, so the panel asks to
  // reload the page. A second copy of the same version works: compared by version, not by class.
  _notice(src) {
    const card: any = customElements.get('chauffage-programme-card');
    return card && card.version !== VERSION ? NOTICE_RELOAD : sourceNotice(src);
  }

  _route(src) {
    return panelRoute(this.route && this.route.path, src, this.hass);
  }

  // Home Assistant sets the route after hass: no redirect before the address is known. A panel
  // no longer on the page (left, or an answer arriving late) draws nothing. An address that
  // redirects draws nothing either: Home Assistant gives the new route a moment later.
  shouldUpdate() {
    if (!this.hass || !this.route || !this.isConnected) return false;
    const src = dataSource(this.hass);
    const route = this._route(src);
    if (!route.redirect) return true;
    window.history.replaceState(null, '', `/chauffage/${route.redirect}`);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: true } }));
    // The settings open once for this address, after the redirect: their history entry comes
    // after it. Not under a notice: without the integration's data, the dialog would show the
    // defaults
    if (route.settings && this._settingsFor !== this.route && !this._notice(src)) {
      this._settingsFor = this.route;
      openSettings(this, this.hass);
    }
    return false;
  }

  // The page is built again when what it is made of changes. Not while weeks are not saved:
  // rebuilding would drop them (built again once saved or discarded)
  willUpdate() {
    const src = dataSource(this.hass);
    const notice = this._notice(src);
    const route = this._route(src);
    const key = JSON.stringify([route, notice, src.schedules(), Object.keys(src.weeks()).sort()]);
    if ((!this._page || key !== this._page.key) && !this._dirtyWeeks().length) this._build(key, route, src, notice);
    // No week left to save: nothing to leave, no error to tell
    if (!this._dirtyWeeks().length) {
      this._saveError = null;
      this._leave = null;
    }
    // A thermostat's sheet says where it is shown: the dashboards are read once
    if (!notice && route.sheet === 'thermostat' && this._placements === undefined) {
      this._placements = null;
      placements(this.hass).then((p) => { this._placements = p; this.requestUpdate(); });
    }
  }

  updated() {
    if (this._page.notice) return;
    if (this._route(dataSource(this.hass)).sheet === 'thermostat') this._scrollToWeek();
    for (const card of this._page.cards) card.hass = this.hass;
  }

  // A thermostat's page reached for one week ("Edit its week", ?week=<schedule>): scrolled to that
  // week. Once: the address loses ?week, so a reload or going back stays put
  _scrollToWeek() {
    const week = new URLSearchParams(window.location.search).get('week');
    const heading = week && [...this.renderRoot.querySelectorAll('h3[data-fill-schedule]')]
      .find((h: any) => h.dataset.fillSchedule === week);
    if (!heading) return;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    heading.scrollIntoView({ block: 'start' });
    // The parts above it (the tile, the presets, the weeks) draw a moment later and push it down:
    // scrolled to it again while they do, until the user scrolls or 3 s have passed
    const content = this.renderRoot.querySelector('.content');
    if (typeof ResizeObserver !== 'function' || !content) return;
    const follow = new ResizeObserver(() => heading.isConnected && heading.scrollIntoView({ block: 'start' }));
    const stop = () => {
      follow.disconnect();
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.removeEventListener(type, stop, true);
    };
    follow.observe(content);
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.addEventListener(type, stop, true);
    setTimeout(stop, 3000);
  }

  // Every scheduled thermostat, or every climate before the first one is scheduled
  _thermostats(src) {
    const scheduled = Object.keys(src.weeks());
    return scheduled.length ? scheduled : Object.keys(this.hass.states).filter((e) => e.startsWith('climate.'));
  }

  // The cards the page is made of, created once for the page: they keep their drafts while it
  // shows. Its menus do not follow to another page
  _build(key, route, src, notice) {
    const page: PanelPage = { key, route, notice, schedules: src.schedules(), scheduled: Object.keys(src.weeks()).length,
      cards: [], views: [], weekCards: {}, tile: null };
    this._page = page;
    this._copyMenu = null;
    this._pageMenu = false;
    if (notice) return;
    // A programme card of a sheet: the weeks of its thermostats in one schedule
    const card = (sheet, schedule, climates = this._thermostats(src)) => {
      const el: any = document.createElement('chauffage-programme-card');
      el.setConfig({ thermostats: climates });
      el.sheet = sheet;
      el.schedule = schedule;
      page.cards.push(el);
      return el;
    };
    // A view of the page, in its frame. Not the thermostats renamed in Home Assistant: the
    // integration follows them, and the page is built again then
    const thermostats = this._thermostats(src).filter((e) => !renamedTo(this.hass, src, e));
    const view = (tag, props = {}, flat = false) => {
      const el: any = Object.assign(document.createElement(tag), { hass: this.hass, thermostats }, props);
      page.cards.push(el);
      const frame: any = document.createElement('chauffage-view-frame');
      frame.view = el;
      frame.flat = flat;
      return frame;
    };
    if (route.sheet === 'schedule') {
      page.views.push(card('schedule', route.id));
    } else if (route.sheet === 'thermostat') {
      this._loadTile(page, route.id);
      // Its presets first: what each one means for this thermostat is the legend of its weeks
      page.views.push(view('chauffage-presets-view', { thermostats: [route.id], definitions: false }, true));
      for (const id of page.schedules) {
        // One week alone: no chips, tabs, hint, paused note, legend or save bar (the page has its own),
        // today marked in the active schedule only
        page.weekCards[id] = card('thermostat', id, [route.id]);
        page.weekCards[id].setWeekView(this._groupDays, this._historyOn);
      }
    } else if (route.list === 'thermostats') {
      if (page.scheduled) page.views.push(view('chauffage-thermostats-view', {}, true)); // its list is a card of its own
    } else if (route.list === 'schedules') {
      page.views.push(view('chauffage-schedules-view', {}, true), view('chauffage-rules-view'));
    } else {
      page.views.push(view('chauffage-presets-view'));
    }
  }

  async _loadTile(page, climate) {
    const helpers = await cardHelpers();
    if (!helpers || page !== this._page || !this.isConnected) return;
    const tile = helpers.createCardElement({ type: 'tile', entity: climate, state_content: ['current_temperature', 'hvac_action'] });
    tile.hass = this.hass;
    page.tile = tile;
    page.cards.push(tile);
    this.requestUpdate();
  }

  render() {
    const page = this._page;
    const src = dataSource(this.hass);
    // The live parts follow the address; the page keeps what it was built with
    const route = this._route(src);
    return keyed(page, html`${this._toolbar(page, route, src)}<div class="content">${
      page.notice ? noticeTemplate(page.notice, this._t) : this._content(page, route, src)}</div>`);
  }

  // A list: the panel's title and its tabs. A sheet: a breadcrumb to its list, no tabs
  _toolbar(page, route, src) {
    const t = this._t;
    const menu = html`<ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>`;
    const built = page.route;
    if (built.sheet) {
      const list = PANEL_TABS.find(([p]) => p === built.list);
      return html`<div class="toolbar">${menu}
          <nav class="title crumbs"><a href="/chauffage/${built.list}" data-navigate="/chauffage/${built.list}">${t(list[1])}</a>
            <span class="sep">›</span><span data-fill="crumb">${page.notice ? nothing : route.sheet === 'schedule' ? src.scheduleName(route.id) : this._name(route.id)}</span></nav>
          ${src.editable && !page.notice ? html`${route.sheet === 'thermostat' ? html`<button class="page-more" data-thermostat-settings title=${t('pageSettings')} aria-label=${t('pageSettings')}><ha-icon icon="mdi:cog"></ha-icon></button>` : nothing}<button class="page-more" data-page-menu title=${t('moreActions')} aria-label=${t('moreActions')}>⋮</button>` : nothing}
          <div data-fill="page-menu">${this._pageMenuTemplate(route)}</div>
        </div>`;
    }
    // The settings: a dialog on top of the tab, from the ⚙ at the end of the toolbar (canSetUp:
    // the panel). Not under a notice, like the sheet's ⋮
    return html`<div class="toolbar">${menu}<div class="title">${panelName(this.panel)}</div>${src.editable && !page.notice
        ? html`<button class="page-more" data-open-settings title=${t('settingsTitle')} aria-label=${t('settingsTitle')}><ha-icon icon="mdi:cog"></ha-icon></button>`
        : nothing}</div>
      <nav class="tabs">${PANEL_TABS.map(([p, label]) =>
        html`<a href="/chauffage/${p}" class="tab${p === built.list ? ' on' : ''}" data-navigate="/chauffage/${p}">${t(label)}</a>`)}</nav>`;
  }

  // The ⋮ menu of a thermostat's sheet, under the button of the toolbar
  _pageMenuTemplate(route) {
    if (!this._pageMenu || route.sheet !== 'thermostat') return nothing;
    const t = this._t;
    const climate = route.id;
    return html`<div class="menu page-menu">${this._pageForget
      ? html`<div class="mh">${t('forgetText', { name: this._name(climate) })}</div>
        <div class="menu-btns"><button class="btn danger" data-forget-confirm>${t('forgetConfirm')}</button>
        <button class="btn" data-forget-cancel>${t('cancel')}</button></div>`
      : html`<button class="mi" data-more-info=${climate}>${t('openThermostat')}</button>
        <div class="sep"></div>
        <button class="mi danger" data-forget>${t('forget')}</button>`}</div>`;
  }

  _content(page, route, src) {
    const t = this._t;
    const built = page.route;
    if (built.sheet === 'schedule') return page.views[0];
    if (built.sheet === 'thermostat') {
      // As on the card: the history shows each day, so grouping the days hides it
      const grouped = this._groupDays && !this._historyOn;
      return html`<div class="head"><div data-fill="thermostat">${this._control(route.id, src)}</div><div class="tile">${page.tile || nothing}</div></div>
        <div class="box sheet"><h2>${t('viewPresets')}</h2>${page.views[0]}
          <div class="h2-row"><h2>${t('weeksTitle')}</h2>
            <button class="chip${grouped ? ' on' : ''}" data-group-days aria-pressed=${String(grouped)}>${t('groupDays')}</button>
            <button class="chip${this._historyOn ? ' on' : ''}" data-history aria-pressed=${String(this._historyOn)} title=${t('historyTitle')}>${t('history')}</button></div>
          <div class="hint"><span class="mouse">${t('hint')}</span><span class="touch">${t('hintTouch')}</span></div>
          ${page.schedules.map((id) => html`<h3 data-fill-schedule=${id}>${this._weekHeading(id, route, src)}</h3>${page.weekCards[id]}`)}
        </div>
        <div data-fill="savebar">${this._savebar()}</div>`;
    }
    if (built.list === 'thermostats' && !page.scheduled) {
      // A new user: no empty page
      return html`<div class="box welcome" data-fill="welcome">${this._welcome(src)}</div>`;
    }
    if (built.list === 'thermostats') return html`<div data-fill="next">${this._next(src)}</div>${page.views[0]}`;
    // A user may create schedules or presets first: the page stays, and says where to start
    const noThermostat = page.scheduled ? nothing : html`<div class="notice">${t('noThermostatYet')}
      <a href="/chauffage/thermostats" data-navigate="/chauffage/thermostats">${t('scheduleThermostats')}</a></div>`;
    if (built.list === 'schedules') {
      return html`${noThermostat}<h2>${t('pageSchedules')}</h2>${page.views[0]}<h2>${t('rulesHeading')}</h2>${page.views[1]}`;
    }
    return html`${noThermostat}${page.views[0]}`;
  }

  // The Thermostats tab after the welcome: the next steps once, else what is new, told once each
  _next(src) {
    const t = this._t;
    let shown = false;
    let notice = false;
    let setting = false;
    try {
      shown = localStorage.getItem(LS_NEXT_STEPS) === 'pending';
      notice = localStorage.getItem(LS_NEW_OFF) !== 'seen';
      // Admins are told of the access level (#99), in place of the settings of overrides
      setting = localStorage.getItem(src.admin ? LS_NEW_ACCESS : LS_NEW_SETTING) !== 'seen';
    } catch (e) { /* ignore */ }
    if (shown) {
      return html`<div class="box next-steps">
          <div class="next-head"><h2>${t('nextTitle')}</h2><button class="btn" data-close-next>${t('nextClose')}</button></div>
          <ul><li>${t('nextWeeks')}</li><li>${t('nextCard')}</li><li>${this._nextOverrideText(src)}
            <div><button class="btn" data-open-settings>${t('endsChoose')}</button></div></li></ul></div>`;
    }
    // An existing user never sees the next steps: the new off behavior (#91) and the new
    // setting (#83, the access level for an admin, #99) are told once each
    // The new off notice names the setting that keeps a thermostat off (#159), and opens it for who
    // may change the settings
    const [before, after] = t('newOffNotice', { setting: '\u0001' }).split('\u0001');
    return html`${notice ? html`<div class="notice new-off"><span>${before}<em>${t('hvacControlTitle')}</em>${after}
            <a href=${DOC_OFF_BY_HAND[makeLocale(this.hass).lang] || DOC_OFF_BY_HAND.en} target="_blank" rel="noopener">${t('readMore')}</a></span>
            <span class="notice-btns">${src.editable ? html`<button class="btn" data-open-settings="hvac">${t('pageSettings')}</button>` : nothing}
            <button class="btn" data-close-notice>${t('nextClose')}</button></span></div>` : nothing}${
      setting ? html`<div class="notice new-setting"><span>${t(src.admin ? 'newAccessNotice' : 'newSettingNotice')}
            <a href=${panelPath('settings')} data-open-settings=${src.admin ? 'access' : ''}>${t('pageSettings')}</a></span>
            <button class="btn" data-close-new-setting>${t('nextClose')}</button></div>` : nothing}`;
  }

  // A week's heading: its schedule (a link to its sheet), and its ⋮ menu: to copy it to another
  // schedule, as the card's menus, and on an air conditioner that heats and cools, to set
  // every slot of the week to heat or to cool
  _weekHeading(id, route, src) {
    const t = this._t;
    const reversible = route.sheet === 'thermostat' && slotModesOf(this.hass, route.id).length > 0 && src.plannable;
    const others = src.schedules().filter((m) => m !== id);
    const all = (mode, key) => html`<button class="mi" data-week-hvac=${mode}>${hvacIconTemplate(mode)}<span>${t(key)}</span></button>`;
    const items = [
      others.length ? html`<div class="mh">${t('copyTo')}</div>${others.map((m) => html`<button class="mi" data-copy-to=${m}><span>${src.scheduleName(m)}</span></button>`)}` : null,
      reversible ? html`${all('heat', 'weekAllHeat')}${all('cool', 'weekAllCool')}` : null,
    ].filter(Boolean);
    const open = this._copyMenu === id;
    const label = t(others.length ? 'copyTo' : 'weekMenu');
    return html`<span role="link" tabindex="0" data-navigate=${panelPath(`schedules/${id}`)}>${src.scheduleName(id)}</span>${
      id === src.activeSchedule() ? html` <span class="badge on">${t('panelActive')}</span>` : nothing}<span class="grow"></span>${
      items.length ? html`<button class="btn icon${open ? ' on' : ''}" data-copy-menu=${id} title=${label} aria-label=${label}>⋮</button>${
        open ? html`<div class="menu copy-menu">${items.map((item, i) => html`${i ? html`<div class="sep"></div>` : nothing}${item}`)}</div>` : nothing}` : nothing}`;
  }

  // The weeks of a thermostat's sheet with edits not saved yet: [[schedule, its card]], in the
  // order of the schedules
  _dirtyWeeks(): [string, any][] {
    return Object.entries(this._page ? this._page.weekCards : {}).filter(([, card]) => card.dirty);
  }

  // A thermostat's sheet has one save bar for all its weeks: on a phone, a bar under a week further
  // up the page went unseen. It names the weeks not saved yet.
  _savebar() {
    const t = this._t;
    const dirty = this._dirtyWeeks();
    if (!dirty.length) return nothing;
    const src = dataSource(this.hass);
    const names = dirty.map(([id]) => src.scheduleName(id)).join(', ');
    if (this._leave) {
      return html`<div class="sheet-savebar leaving">
        <span class="dirty">${t('leaveUnsaved', { schedules: names })}</span>
        <span class="btns"><button class="btn" data-leave-stay>${t('leaveStay')}</button>
        <button class="btn" data-leave-discard>${t('leaveDiscard')}</button>
        <button class="btn primary" data-leave-save>${t('leaveSave')}</button></span>
      </div>`;
    }
    return html`<div class="sheet-savebar">
        <span class="dirty">${t('unsavedWeeks', { schedules: names })}</span>
        ${this._saveError ? html`<span class="error">${this._saveError}</span>` : nothing}
        <span class="btns"><button class="btn" data-sheet-cancel>${t('cancel')}</button>
        <button class="btn primary" data-sheet-save>${t('save')}</button></span>
      </div>`;
  }

  // Cancel: every week goes back as it was saved
  _discardSheet() {
    for (const [, card] of this._dirtyWeeks()) card.discard();
    this._saveError = null;
    this.requestUpdate();
  }

  // Saves the weeks not saved yet in one call: each card sends its own schedule's week, against
  // the thermostat's revision. The integration keeps the weeks of the schedules not sent.
  async _saveSheet(climate) {
    const t = this._t;
    const weekCards: any[] = Object.values(this._page.weekCards);
    const sent = Object.entries(this._page.weekCards).map(([id, card]) => [id, card, card.toSave(climate)])
      .filter(([, , week]) => week);
    if (!sent.length) return;
    const weeks = { [climate]: Object.fromEntries(sent.map(([id, , week]) => [id, week.week])) };
    const revisions = { [climate]: sent[0][2].revision };
    try {
      const result = await commands(this.hass).saveWeeks(weeks, revisions);
      for (const card of weekCards) card.recordRevisions(result);
      for (const [, card] of sent) card.saved();
      this._saveError = null;
    } catch (err) {
      this._saveError = err && err.code === 'stale' ? t('stale') : errorText(t, err);
    }
    this.requestUpdate();
  }

  // A thermostat's sheet, first: whether Chauffage controls it, where it is shown, its devices
  _control(climate, src) {
    const t = this._t;
    const hass = this.hass;
    const paused = src.paused(climate);
    const places = this._placements ? this._placements[climate] || [] : null;
    // Its devices, by their names: the thermostat's, then the scheduled thermostat's (Chauffage)
    const devices = thermostatDevices(hass, src, climate).map((id) => deviceNamedLink(hass, id)).filter(Boolean);
    // While the dashboards are read, the line already holds its place: the page does not move
    // under a finger about to tap
    return html`<div class="about">
        <div class="shown">${placesTemplate(t, places)}</div>
        ${devices.length ? html`<div>${t('panelDevices')} ${devices.map((link, i) => html`${i ? ', ' : ''}${link}`)}</div>` : nothing}
      </div>
      <div class="control">
        <button class="btn${paused ? ' primary' : ''}" data-pause=${paused ? '0' : '1'}>${t(paused ? 'resumeShort' : 'pauseShort')}</button>
        ${paused ? html`<span class="badge paused">${t('paused')}</span>` : nothing}
      </div>
      ${this._error ? html`<div class="error">${this._error}</div>` : nothing}`;
  }

  // How long a setpoint changed by hand lasts, as the settings of overrides say (#83)
  _nextOverrideText(src) {
    const loc = makeLocale(this.hass);
    const duration = roundDurationText(src.overrideDuration(), loc);
    const key = { duration: 'nextOverrideDuration', next_slot: 'nextOverrideNextSlot' }[src.manualOverrideEnd()] || 'nextOverride';
    return loc.t(key, { duration });
  }

  // The Thermostats page of a new user, before the first thermostat: what Chauffage does, and
  // every climate of Home Assistant to tick (none at first: Chauffage controls it at once)
  _welcome(src) {
    const t = this._t;
    const climates = Object.keys(this.hass.states).filter((e) => e.startsWith('climate.'))
      .sort((a, b) => this._name(a).localeCompare(this._name(b)));
    // What Chauffage does, in a sentence: the next steps come once, after the first thermostat
    const head = html`<h2>${t('welcomeTitle')}</h2><p>${t('welcomeIntro')}</p>`;
    if (!climates.length) {
      return html`${head}<p class="none">${t('welcomeNoClimate')}</p>
        ${src.admin ? html`<button class="btn primary" data-navigate="/config/integrations/dashboard">${t('welcomeAddDevice')}</button>` : nothing}`;
    }
    const picked = climates.filter((c) => this._picked.has(c));
    const eco = src.presets().find((l) => l.id === 'eco') || src.presets()[0];
    const preset = eco ? eco.name || makeLocale(this.hass).preset(eco.id) : '';
    const label = picked.length === 0 ? t('welcomeStartNone')
      : picked.length === 1 ? t('welcomeStartOne') : t('welcomeStartMany', { count: picked.length });
    return html`${head}<h3>${t('welcomePick')}</h3><div class="picks">${climates.map((c) => html`<label class="pick"><input type="checkbox" data-pick=${c} .checked=${live(this._picked.has(c))}>
        <span class="pick-name">${this._name(c)}<small>${c}</small></span></label>`)}</div>
      <p class="note">${t('welcomeNote', { preset })}</p>
      <button class="btn primary" data-start ?disabled=${!picked.length}>${label}</button>
      ${this._error ? html`<div class="error">${this._error}</div>` : nothing}`;
  }

  _name(climate) {
    const state = this.hass.states[climate];
    return (state && state.attributes.friendly_name) || climate;
  }

  async _onClick(e) {
    // The page's menu open: a click elsewhere only closes it
    if (this._pageMenu && !e.target.closest('.page-menu, [data-page-menu]')) {
      this._pageMenu = false;
      this.requestUpdate();
      if (!e.target.closest('[data-more-info]')) return undefined;
    }
    // The menu to copy a week open: a click elsewhere only closes it
    if (this._copyMenu && !e.target.closest('.copy-menu, [data-copy-menu]')) {
      this._copyMenu = null;
      this.requestUpdate();
      return undefined;
    }
    const el = e.target.closest('[data-page-menu], [data-forget], [data-forget-confirm], [data-forget-cancel], [data-leave-stay], [data-leave-discard], [data-leave-save], [data-sheet-save], [data-sheet-cancel], [data-copy-menu], [data-copy-to], [data-week-hvac], [data-more-info], [data-navigate], [data-device], [data-pause], [data-group-days], [data-history], [data-start], [data-close-next], [data-close-notice], [data-close-new-setting], [data-open-settings], [data-thermostat-settings]');
    if (!el || !this.renderRoot.contains(el)) return undefined;
    e.preventDefault();
    const ds = el.dataset;
    const src = dataSource(this.hass);
    const route = this._route(src);
    const weekCards = this._page.weekCards;
    this._error = null;
    this.requestUpdate();
    try {
      // The page's ⋮: a schedule's sheet opens its card's menu (rename, delete); a thermostat's
      // sheet opens the thermostat, or forgets it after a confirmation
      if ('pageMenu' in ds) {
        if (route.sheet === 'schedule') return this._page.views[0] && this._page.views[0].openScheduleMenu(el);
        this._pageMenu = !this._pageMenu;
        this._pageForget = false;
        return undefined;
      }
      if ('forget' in ds || 'forgetCancel' in ds) {
        this._pageForget = 'forget' in ds;
        return undefined;
      }
      if ('forgetConfirm' in ds) {
        this._pageMenu = false;
        await commands(this.hass).forget(route.id);
        return openPanel('thermostats');
      }
      if ('sheetSave' in ds) return await this._saveSheet(route.id);
      if ('sheetCancel' in ds) return this._discardSheet();
      // Leaving the sheet with weeks not saved yet: the save bar asks first
      if ('leaveStay' in ds) {
        this._leave = null;
        return undefined;
      }
      if ('leaveDiscard' in ds || 'leaveSave' in ds) {
        const leave = this._leave;
        this._leave = null;
        if ('leaveSave' in ds) await this._saveSheet(route.id);
        else this._discardSheet();
        if (!this._dirtyWeeks().length && leave) leave();
        return undefined;
      }
      if ((ds.navigate || ds.device) && this._dirtyWeeks().length) {
        this._leave = () => (ds.navigate ? navigate(ds.navigate) : openDevice(ds.device));
        return undefined;
      }
      if (ds.copyMenu) {
        this._copyMenu = this._copyMenu === ds.copyMenu ? null : ds.copyMenu;
        return undefined;
      }
      if (ds.weekHvac) {
        // Every slot of the week whose menu is open, to heat or to cool: its card asks to save it
        const card = weekCards[this._copyMenu];
        this._copyMenu = null;
        if (card) card.setWeekHvac(route.id, ds.weekHvac);
        return undefined;
      }
      if (ds.copyTo) {
        // Its week in schedule A copied to schedule B lands in B's card, which asks to save B. A is
        // not touched, even with edits not saved yet (they are copied as shown)
        const fromId = this._copyMenu;
        const from = weekCards[fromId];
        const to = weekCards[ds.copyTo];
        this._copyMenu = null;
        if (from && to) to.receiveWeek(route.id, from.week(route.id), src.scheduleName(fromId));
        return undefined;
      }
      // A thermostat's settings (#159), from the ⚙ of its page
      if ('thermostatSettings' in ds) {
        openSettings(this, this.hass, null, route.id);
        return undefined;
      }
      // The settings, on top of the panel: the notice of the new setting is then told
      if ('openSettings' in ds) {
        openSettings(this, this.hass, ds.openSettings || null);
        return undefined;
      }
      if (ds.moreInfo) return openMoreInfo(this, ds.moreInfo);
      if (ds.navigate) return navigate(ds.navigate);
      if (ds.device) return openDevice(ds.device);
      if ('groupDays' in ds || 'history' in ds) {
        if ('history' in ds) {
          this._historyOn = !this._historyOn;
        } else {
          // As on the card: grouping the days hides the history, which shows each day
          this._groupDays = !(this._groupDays && !this._historyOn);
          this._historyOn = false;
        }
        saveGroupPreference(this._groupDays);
        saveHistoryPreference(this._historyOn);
        // In place: the weeks keep their edits not saved yet
        for (const card of Object.values(weekCards)) card.setWeekView(this._groupDays, this._historyOn);
        return undefined;
      }
      if ('closeNotice' in ds) {
        seenNewOff();
        return undefined;
      }
      if ('closeNewSetting' in ds) {
        seenNewSetting(this.hass);
        return undefined;
      }
      if ('closeNext' in ds) {
        try { localStorage.setItem(LS_NEXT_STEPS, 'closed'); } catch (err) { /* ignore */ }
        return undefined;
      }
      if ('start' in ds) {
        // Scheduled with no week of their own: the integration gives them the week of a new
        // schedule in each schedule, as a thermostat added to a card
        const climates = [...this._picked].sort();
        if (!climates.length) return undefined;
        try { localStorage.setItem(LS_NEXT_STEPS, 'pending'); } catch (err) { /* ignore */ }
        seenNewOff(); // a new user has nothing to upgrade from
        seenNewSetting(this.hass); // the next steps say it
        await commands(this.hass).saveWeeks(Object.fromEntries(climates.map((c) => [c, {}])),
          Object.fromEntries(climates.map((c) => [c, null])));
        this._picked.clear();
        this.requestUpdate();
        return undefined;
      }
      if (ds.pause != null) return await commands(this.hass).setPaused(route.id, ds.pause === '1');
    } catch (err) {
      this._error = errorText(this._t, err);
      this.requestUpdate();
    }
    return undefined;
  }
}

// Home Assistant's card helpers (its own cards, for example a tile). They exist once a dashboard
// was loaded: outside one, the panel loads the dashboards' code first, as custom panels do.
// Prototype: an internal of Home Assistant's frontend, null if it changes.
async function cardHelpers() {
  if (window.loadCardHelpers) return window.loadCardHelpers();
  try {
    await customElements.whenDefined('partial-panel-resolver');
    const resolver: any = document.createElement('partial-panel-resolver');
    resolver.hass = { panels: [{ url_path: 'tmp', component_name: 'lovelace' }] };
    resolver._updateRoutes();
    await resolver.routerOptions.routes.tmp.load();
    return window.loadCardHelpers ? window.loadCardHelpers() : null;
  } catch (e) {
    return null;
  }
}

