import { INTEGRATION, NOTICE_RELOAD, bindReload, dataSource, integrationAvailable, noticeHtml, reloadPage, renamedTo, sourceNotice } from './client.ts';
import { LS_GROUP, LS_HISTORY, errorText, esc, setHtml } from './common.ts';
import { linksByKeyboard, roundDurationText } from './fields.ts';
import { hvacIcon, isReversible } from './hvac.ts';
import { makeLocale } from './i18n/locale.ts';
import { deviceNamedLinkHtml, navigate, openDevice, openMoreInfo, openPanel, panelName, panelPath, placements, placesHtml, thermostatDevices } from './links.ts';
import { DOC_OFF_BY_HAND, LS_NEW_ACCESS, LS_NEW_OFF, LS_NEW_SETTING, openSettings, seenNewOff, seenNewSetting } from './settings-dialog.ts';
import { serializeDay } from './slots.ts';
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

export class ChauffagePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    linksByKeyboard(this.shadowRoot);
    this._unlisten = null;
    this._key = null;
    this._cards = [];
    this._placements = undefined;
    // A thermostat's sheet: identical days on one row for every schedule, as chosen on this device
    this._groupDays = true;
    // …and the history of the measured temperature, as chosen on this device (as the cards)
    this._historyOn = false;
    try {
      this._groupDays = localStorage.getItem(LS_GROUP) !== '0';
      this._historyOn = localStorage.getItem(LS_HISTORY) === '1';
    } catch (e) { /* ignore */ }
    this._picked = new Set(); // the welcome: the thermostats ticked
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
    this.shadowRoot.addEventListener('chauffage-dirty', () => this._fillSavebar());
    this.shadowRoot.addEventListener('change', (e) => {
      const box = e.target.closest('[data-pick]');
      if (!box) return;
      if (box.checked) this._picked.add(box.dataset.pick);
      else this._picked.delete(box.dataset.pick);
      this._update();
    });
    // Closing or reloading the browser's page with weeks not saved yet: the browser asks
    this._onUnload = (e) => {
      if (!this._dirtyWeeks().length) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // Escape closes the panel's menus, as the card's menus
    this._onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (this._copyMenu) {
        this._copyMenu = null;
        this._update();
      }
      if (this._pageMenu) {
        this._pageMenu = false;
        this._fillPageMenu();
      }
    };
  }

  // Set by Home Assistant: hass, the panel (its title), the route (the page), narrow
  set hass(hass) {
    this._hass = hass;
    if (!this._unlisten && integrationAvailable(hass)) {
      INTEGRATION.connect(hass);
      this._unlisten = INTEGRATION.listen(() => this._update());
    }
    this._update();
  }

  set panel(panel) {
    this._panel = panel;
    this._update();
  }

  set route(route) {
    this._route = route;
    this._update();
  }

  set narrow(narrow) {
    this._narrow = narrow;
    this._update();
  }

  // Home Assistant may set the properties before it adds the panel to the page
  connectedCallback() {
    if (!this._unlisten && this._hass && integrationAvailable(this._hass)) {
      INTEGRATION.connect(this._hass);
      this._unlisten = INTEGRATION.listen(() => this._update());
    }
    document.addEventListener('keydown', this._onKey);
    window.addEventListener('beforeunload', this._onUnload);
    this._update();
  }

  disconnectedCallback() {
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
    document.removeEventListener('keydown', this._onKey);
    window.removeEventListener('beforeunload', this._onUnload);
  }

  get _t() {
    return makeLocale(this._hass).t;
  }

  _reloadPage() {
    reloadPage();
  }

  _update() {
    const hass = this._hass;
    // Home Assistant sets the route after hass: no redirect before the address is known. A panel
    // no longer on the page (left, or an answer arriving late) draws nothing.
    if (!hass || !this._route || !this.isConnected) return;
    const src = dataSource(hass);
    // Under its tabs, the panel shows what the cards show while the data can't be used. Also when
    // the page loaded a former card first: the panel's cards would not work, so the panel asks to
    // reload the page. A second copy of the same version works: compared by version, not by class.
    const card = customElements.get('chauffage-programme-card');
    const notice = card && card.version !== VERSION ? NOTICE_RELOAD : sourceNotice(src);
    const route = panelRoute(this._route && this._route.path, src, hass);
    if (route.redirect) {
      window.history.replaceState(null, '', `/chauffage/${route.redirect}`);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: true } }));
      // The settings open once for this address, after the redirect: their history entry comes
      // after it. Home Assistant gives the new route a moment later.
      // Not under a notice: without the integration's data, the dialog would show the defaults
      if (route.settings && this._settingsFor !== this._route && !notice) {
        this._settingsFor = this._route;
        openSettings(this, hass);
      }
      return;
    }
    // The page is built again when what it is made of changes; its live parts are filled each time
    // Not while weeks are not saved: rebuilding would drop them (built again once saved or discarded)
    const key = JSON.stringify([route, notice, src.schedules(), Object.keys(src.weeks()).sort()]);
    if (key !== this._key && !this._dirtyWeeks().length) {
      this._key = key;
      this._build(route, src, notice);
    }
    const menu = this.shadowRoot.querySelector('ha-menu-button');
    if (menu) {
      menu.hass = hass;
      menu.narrow = this._narrow;
    }
    if (this._notice) return;
    this._fill(route, src);
    if (route.sheet === 'thermostat') this._scrollToWeek();
    for (const card of this._cards) card.hass = hass;
  }

  // A thermostat's page reached for one week ("Edit its week", ?week=<schedule>): scrolled to that
  // week. Once: the address loses ?week, so a reload or going back stays put
  _scrollToWeek() {
    const week = new URLSearchParams(window.location.search).get('week');
    const heading = week && [...this.shadowRoot.querySelectorAll('h3[data-fill-schedule]')]
      .find((h) => h.dataset.fillSchedule === week);
    if (!heading) return;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    heading.scrollIntoView({ block: 'start' });
    // The parts above it (the tile, the presets, the weeks) draw a moment later and push it down:
    // scrolled to it again while they do, until the user scrolls or 3 s have passed
    const content = this.shadowRoot.querySelector('.content');
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
    return scheduled.length ? scheduled : Object.keys(this._hass.states).filter((e) => e.startsWith('climate.'));
  }

  _build(route, src, notice) {
    const t = this._t;
    const title = panelName(this._panel);
    let head;
    if (route.sheet) {
      const list = PANEL_TABS.find(([page]) => page === route.list);
      head = `<div class="toolbar"><ha-menu-button></ha-menu-button>
          <nav class="title crumbs"><a href="/chauffage/${route.list}" data-navigate="/chauffage/${route.list}">${esc(t(list[1]))}</a>
            <span class="sep">›</span><span data-fill="crumb"></span></nav>
          ${src.editable && !notice ? `<button class="page-more" data-page-menu title="${esc(t('moreActions'))}" aria-label="${esc(t('moreActions'))}">⋮</button>` : ''}
          <div data-fill="page-menu"></div>
        </div>`;
    } else {
      const tabs = PANEL_TABS.map(([page, label]) =>
        `<a href="/chauffage/${page}" class="tab${page === route.list ? ' on' : ''}" data-navigate="/chauffage/${page}">${esc(t(label))}</a>`).join('');
      // The settings: a dialog on top of the tab, from the ⚙ at the end of the toolbar (canSetUp:
      // the panel). Not under a notice, like the sheet's ⋮
      const cog = src.editable && !notice
        ? `<button class="page-more" data-open-settings title="${esc(t('settingsTitle'))}" aria-label="${esc(t('settingsTitle'))}"><ha-icon icon="mdi:cog"></ha-icon></button>`
        : '';
      head = `<div class="toolbar"><ha-menu-button></ha-menu-button><div class="title">${esc(title)}</div>${cog}</div>
        <nav class="tabs">${tabs}</nav>`;
    }
    this.shadowRoot.innerHTML = `<style>${PANEL_CSS}</style>${head}<div class="content"></div>`;
    this._cards = [];
    const content = this.shadowRoot.querySelector('.content');
    this._notice = notice;
    if (notice) {
      content.innerHTML = noticeHtml(notice, t);
      bindReload(content, () => this._reloadPage());
      return;
    }
    const html = (s) => content.insertAdjacentHTML('beforeend', s);
    this._weekCards = {}; // a thermostat's sheet: its card of each schedule
    const scheduled = Object.keys(src.weeks()).length;
    const card = (config, parent = content) => {
      const el = document.createElement('chauffage-programme-card');
      el._setPanelConfig({ thermostats: this._thermostats(src), panel: true, ...config });
      parent.appendChild(el);
      this._cards.push(el);
      return el;
    };
    if (route.sheet === 'schedule') {
      card({ schedule: route.id, schedule_tabs: 'one' });
    } else if (route.sheet === 'thermostat') {
      html('<div class="head"><div data-fill="thermostat"></div><div class="tile"></div></div>');
      this._tile(route.id, content.querySelector('.tile'));
      html('<div class="box sheet"></div>');
      const box = content.querySelector('.sheet');
      const part = (s) => box.insertAdjacentHTML('beforeend', s);
      // Its presets first: what each one means for this thermostat is the legend of its weeks
      part(`<h2>${esc(t('viewPresets'))}</h2>`);
      card({ thermostats: [route.id], view: 'presets', preset_definitions: false, flat: true }, box);
      // As on the card: the history shows each day, so grouping the days hides it
      const grouped = this._groupDays && !this._historyOn;
      part(`<div class="h2-row"><h2>${esc(t('weeksTitle'))}</h2>
        <button class="chip${grouped ? ' on' : ''}" data-group-days aria-pressed="${grouped}">${esc(t('groupDays'))}</button>
        <button class="chip${this._historyOn ? ' on' : ''}" data-history aria-pressed="${this._historyOn}" title="${esc(t('historyTitle'))}">${esc(t('history'))}</button></div>
        <div class="hint"><span class="mouse">${esc(t('hint'))}</span><span class="touch">${esc(t('hintTouch'))}</span></div>`);
      for (const id of src.schedules()) {
        part(`<h3 data-fill-schedule="${esc(id)}"></h3>`);
        // One week alone: no chips, tabs, hint, paused note, legend or save bar (the page has its own),
        // today marked in the active schedule only
        this._weekCards[id] = card({ thermostats: [route.id], schedule: id, week_only: true,
          group_days: this._groupDays, history: this._historyOn, flat: true }, box);
      }
      html('<div data-fill="savebar"></div>');
    } else if (route.list === 'thermostats' && !scheduled) {
      html('<div class="box welcome" data-fill="welcome"></div>'); // a new user: no empty page
    } else if (route.list === 'thermostats') {
      html('<div data-fill="next"></div>');
      card({ view: 'thermostats', flat: true }); // its list is a card of its own
    } else {
      // A user may create schedules or presets first: the page stays, and says where to start
      if (!scheduled) {
        html(`<div class="notice">${esc(t('noThermostatYet'))}
          <a href="/chauffage/thermostats" data-navigate="/chauffage/thermostats">${esc(t('scheduleThermostats'))}</a></div>`);
      }
      if (route.list === 'schedules') {
        html(`<h2>${esc(t('pageSchedules'))}</h2>`);
        card({ view: 'schedules', flat: true });
        html(`<h2>${esc(t('rulesHeading'))}</h2>`);
        card({ view: 'rules' });
      } else {
        card({ view: 'presets' });
      }
    }
  }

  // The live parts: the list of schedules, a thermostat's control, the schedules' headings
  _fill(route, src) {
    const t = this._t;
    const crumb = this.shadowRoot.querySelector('[data-fill="crumb"]');
    if (crumb) crumb.textContent = route.sheet === 'schedule' ? src.scheduleName(route.id) : this._name(route.id);
    const active = src.activeSchedule();
    this._fillSavebar();
    const sheet = this.shadowRoot.querySelector('[data-fill="thermostat"]');
    if (sheet) setHtml(sheet, this._controlHtml(route.id, src));
    const welcome = this.shadowRoot.querySelector('[data-fill="welcome"]');
    if (welcome) setHtml(welcome, this._welcomeHtml(src));
    const next = this.shadowRoot.querySelector('[data-fill="next"]');
    if (next) {
      let shown = false;
      let notice = false;
      let setting = false;
      try {
        shown = localStorage.getItem(LS_NEXT_STEPS) === 'pending';
        notice = localStorage.getItem(LS_NEW_OFF) !== 'seen';
        // Admins are told of the access level (#99), in place of the settings of overrides
        setting = localStorage.getItem(src.admin ? LS_NEW_ACCESS : LS_NEW_SETTING) !== 'seen';
      } catch (e) { /* ignore */ }
      setHtml(next, shown ? `<div class="box next-steps">
          <div class="next-head"><h2>${esc(t('nextTitle'))}</h2><button class="btn" data-close-next>${esc(t('nextClose'))}</button></div>
          <ul><li>${esc(t('nextWeeks'))}</li><li>${esc(t('nextCard'))}</li><li>${esc(this._nextOverrideText(src))}
            <div><button class="btn" data-open-settings>${esc(t('endsChoose'))}</button></div></li></ul></div>`
        // An existing user never sees the next steps: the new off behavior (#91) and the new
        // setting (#83, the access level for an admin, #99) are told once each
        : (notice ? `<div class="notice new-off"><span>${esc(t('newOffNotice'))}
            <a href="${DOC_OFF_BY_HAND[makeLocale(this._hass).lang] || DOC_OFF_BY_HAND.en}" target="_blank" rel="noopener">${esc(t('readMore'))}</a></span>
            <button class="btn" data-close-notice>${esc(t('nextClose'))}</button></div>` : '')
          + (setting ? `<div class="notice new-setting"><span>${esc(t(src.admin ? 'newAccessNotice' : 'newSettingNotice'))}
            <a href="${panelPath('settings')}" data-open-settings${src.admin ? '="access"' : ''}>${esc(t('pageSettings'))}</a></span>
            <button class="btn" data-close-new-setting>${esc(t('nextClose'))}</button></div>` : ''));
    }
    // A week's heading: its schedule (a link to its sheet), and its ⋮ menu: to copy it to another
    // schedule, as the card's menus, and on an air conditioner that heats and cools, to set
    // every slot of the week to heat or to cool
    const reversible = route.sheet === 'thermostat' && isReversible(this._hass, route.id) && src.plannable;
    for (const h of this.shadowRoot.querySelectorAll('[data-fill-schedule]')) {
      const id = h.dataset.fillSchedule;
      const others = src.schedules().filter((m) => m !== id);
      const all = (mode, key) => `<button class="mi" data-week-hvac="${mode}">${hvacIcon(mode)}<span>${esc(t(key))}</span></button>`;
      const items = [
        others.length ? `<div class="mh">${esc(t('copyTo'))}</div>${others.map((m) => `<button class="mi" data-copy-to="${esc(m)}"><span>${esc(src.scheduleName(m))}</span></button>`).join('')}` : '',
        reversible ? all('heat', 'weekAllHeat') + all('cool', 'weekAllCool') : '',
      ].filter(Boolean);
      const menu = this._copyMenu === id ? `<div class="menu copy-menu">${items.join('<div class="sep"></div>')}</div>` : '';
      const label = t(others.length ? 'copyTo' : 'weekMenu');
      const copy = items.length ? `<button class="btn icon${menu ? ' on' : ''}" data-copy-menu="${esc(id)}" title="${esc(label)}" aria-label="${esc(label)}">⋮</button>${menu}` : '';
      setHtml(h, `<span role="link" tabindex="0" data-navigate="${panelPath(`schedules/${esc(id)}`)}">${esc(src.scheduleName(id))}</span>${
        id === active ? ` <span class="badge on">${esc(t('panelActive'))}</span>` : ''}<span class="grow"></span>${copy}`);
    }
  }

  // The ⋮ menu of a thermostat's sheet, under the button of the toolbar
  _fillPageMenu() {
    const slot = this.shadowRoot.querySelector('[data-fill="page-menu"]');
    if (!slot) return;
    const route = panelRoute(this._route && this._route.path, dataSource(this._hass), this._hass);
    if (!this._pageMenu || route.sheet !== 'thermostat') { setHtml(slot, ''); return; }
    const t = this._t;
    const climate = route.id;
    setHtml(slot, `<div class="menu page-menu">${this._pageForget
      ? `<div class="mh">${esc(t('forgetText', { name: this._name(climate) }))}</div>
        <div class="menu-btns"><button class="btn danger" data-forget-confirm>${esc(t('forgetConfirm'))}</button>
        <button class="btn" data-forget-cancel>${esc(t('cancel'))}</button></div>`
      : `<button class="mi" data-more-info="${esc(climate)}">${esc(t('openThermostat'))}</button>
        <div class="sep"></div>
        <button class="mi danger" data-forget>${esc(t('forget'))}</button>`}</div>`);
  }

  // The weeks of a thermostat's sheet with edits not saved yet: [[schedule, its card]], in the
  // order of the schedules
  _dirtyWeeks() {
    return Object.entries(this._weekCards || {}).filter(([, card]) => card._dirty);
  }

  // A thermostat's sheet has one save bar for all its weeks: on a phone, a bar under a week further
  // up the page went unseen. It names the weeks not saved yet.
  _fillSavebar() {
    const slot = this.shadowRoot.querySelector('[data-fill="savebar"]');
    if (!slot) return;
    const t = this._t;
    const dirty = this._dirtyWeeks();
    if (!dirty.length) { setHtml(slot, ''); this._saveError = null; this._leave = null; return; }
    const names = dirty.map(([, card]) => card._scheduleName(card._schedule)).join(', ');
    if (this._leave) {
      setHtml(slot, `<div class="sheet-savebar leaving">
        <span class="dirty">${esc(t('leaveUnsaved', { schedules: names }))}</span>
        <span class="btns"><button class="btn" data-leave-stay>${esc(t('leaveStay'))}</button>
        <button class="btn" data-leave-discard>${esc(t('leaveDiscard'))}</button>
        <button class="btn primary" data-leave-save>${esc(t('leaveSave'))}</button></span>
      </div>`);
      return;
    }
    setHtml(slot, `<div class="sheet-savebar">
        <span class="dirty">${esc(t('unsavedWeeks', { schedules: names }))}</span>
        ${this._saveError ? `<span class="error">${esc(this._saveError)}</span>` : ''}
        <span class="btns"><button class="btn" data-sheet-cancel>${esc(t('cancel'))}</button>
        <button class="btn primary" data-sheet-save>${esc(t('save'))}</button></span>
      </div>`);
  }

  // Cancel: every week goes back as it was saved
  _discardSheet() {
    for (const card of this._dirtyWeeks().map(([, c]) => c)) {
      card._discard();
    }
    this._saveError = null;
    this._fillSavebar();
  }

  // Saves the weeks not saved yet in one call: each card sends its own schedule's week, against
  // the thermostat's revision. The integration keeps the weeks of the schedules not sent.
  async _saveSheet(climate) {
    const t = this._t;
    const src = dataSource(this._hass);
    for (const card of Object.values(this._weekCards)) card._settle(true);
    const dirty = this._dirtyWeeks();
    if (!dirty.length) return;
    const first = dirty[0][1];
    const weeks = { [climate]: Object.fromEntries(dirty.map(([id, card]) => [id, card._week(climate).map(serializeDay)])) };
    const revisions = { [climate]: first._revisions[climate] ?? null };
    try {
      const result = await src.saveWeeks(weeks, revisions);
      for (const card of Object.values(this._weekCards)) {
        if (result && result.revisions) Object.assign(card._revisions, result.revisions);
        if (result && result.revision != null) card._revision = result.revision;
      }
      for (const [, card] of dirty) {
        card._loadedWeeks = card._serialized();
        card._dirty = false;
        card._msg = card._loc.t('saved');
        card._render();
      }
      this._saveError = null;
    } catch (err) {
      this._saveError = err && err.code === 'stale' ? t('stale') : errorText(t, err);
    }
    this._fillSavebar();
  }

  // A thermostat's sheet, first: whether Chauffage controls it, where it is shown, its devices
  _controlHtml(climate, src) {
    const t = this._t;
    const hass = this._hass;
    if (this._placements === undefined) {
      this._placements = null;
      placements(hass).then((p) => { this._placements = p; this._update(); });
    }
    const paused = src.paused(climate);
    const places = this._placements ? this._placements[climate] || [] : null;
    // While the dashboards are read, the line already holds its place: the page does not move
    // under a finger about to tap
    const shown = placesHtml(t, places);
    // Its devices, by their names: the thermostat's, then the scheduled thermostat's (Chauffage)
    const devices = thermostatDevices(hass, src, climate).map((id) => deviceNamedLinkHtml(hass, id)).filter(Boolean);
    return `<div class="about">
        <div class="shown">${shown}</div>
        ${devices.length ? `<div>${esc(t('panelDevices'))} ${devices.join(', ')}</div>` : ''}
      </div>
      <div class="control">
        <button class="btn${paused ? ' primary' : ''}" data-pause="${paused ? '0' : '1'}">${esc(t(paused ? 'resumeShort' : 'pauseShort'))}</button>
        ${paused ? `<span class="badge paused">${esc(t('paused'))}</span>` : ''}
      </div>
      ${this._error ? `<div class="error">${esc(this._error)}</div>` : ''}`;
  }

  // How long a setpoint changed by hand lasts, as the settings of overrides say (#83)
  _nextOverrideText(src) {
    const loc = makeLocale(this._hass);
    const duration = roundDurationText(src.overrideDuration(), loc);
    const key = { duration: 'nextOverrideDuration', next_slot: 'nextOverrideNextSlot' }[src.manualOverrideEnd()] || 'nextOverride';
    return loc.t(key, { duration });
  }

  // The Thermostats page of a new user, before the first thermostat: what Chauffage does, and
  // every climate of Home Assistant to tick (none at first: Chauffage controls it at once)
  _welcomeHtml(src) {
    const t = this._t;
    const climates = Object.keys(this._hass.states).filter((e) => e.startsWith('climate.'))
      .sort((a, b) => this._name(a).localeCompare(this._name(b)));
    // What Chauffage does, in a sentence: the next steps come once, after the first thermostat
    const head = `<h2>${esc(t('welcomeTitle'))}</h2><p>${esc(t('welcomeIntro'))}</p>`;
    if (!climates.length) {
      return `${head}<p class="none">${esc(t('welcomeNoClimate'))}</p>
        ${src.admin ? `<button class="btn primary" data-navigate="/config/integrations/dashboard">${esc(t('welcomeAddDevice'))}</button>` : ''}`;
    }
    const picked = climates.filter((c) => this._picked.has(c));
    const picks = climates.map((c) => `<label class="pick"><input type="checkbox" data-pick="${esc(c)}"${this._picked.has(c) ? ' checked' : ''}>
        <span class="pick-name">${esc(this._name(c))}<small>${esc(c)}</small></span></label>`).join('');
    const eco = src.presets().find((l) => l.id === 'eco') || src.presets()[0];
    const preset = eco ? eco.name || makeLocale(this._hass).preset(eco.id) : '';
    const label = picked.length === 0 ? t('welcomeStartNone')
      : picked.length === 1 ? t('welcomeStartOne') : t('welcomeStartMany', { count: picked.length });
    return `${head}<h3>${esc(t('welcomePick'))}</h3><div class="picks">${picks}</div>
      <p class="note">${esc(t('welcomeNote', { preset }))}</p>
      <button class="btn primary" data-start${picked.length ? '' : ' disabled'}>${esc(label)}</button>
      ${this._error ? `<div class="error">${esc(this._error)}</div>` : ''}`;
  }

  async _tile(climate, host) {
    const helpers = await cardHelpers();
    if (!helpers || !host.isConnected) return;
    const tile = helpers.createCardElement({ type: 'tile', entity: climate, state_content: ['current_temperature', 'hvac_action'] });
    tile.hass = this._hass;
    host.appendChild(tile);
    this._cards.push(tile);
  }

  _name(climate) {
    const state = this._hass.states[climate];
    return (state && state.attributes.friendly_name) || climate;
  }

  async _onClick(e) {
    // The page's menu open: a click elsewhere only closes it
    if (this._pageMenu && !e.target.closest('.page-menu, [data-page-menu]')) {
      this._pageMenu = false;
      this._fillPageMenu();
      if (!e.target.closest('[data-more-info]')) return;
    }
    // The menu to copy a week open: a click elsewhere only closes it
    if (this._copyMenu && !e.target.closest('.copy-menu, [data-copy-menu]')) {
      this._copyMenu = null;
      this._update();
      return;
    }
    const el = e.target.closest('[data-page-menu], [data-forget], [data-forget-confirm], [data-forget-cancel], [data-leave-stay], [data-leave-discard], [data-leave-save], [data-sheet-save], [data-sheet-cancel], [data-copy-menu], [data-copy-to], [data-week-hvac], [data-more-info], [data-navigate], [data-device], [data-pause], [data-group-days], [data-history], [data-start], [data-close-next], [data-close-notice], [data-close-new-setting], [data-open-settings]');
    if (!el || !this.shadowRoot.contains(el)) return;
    e.preventDefault();
    const ds = el.dataset;
    const src = dataSource(this._hass);
    const route = panelRoute(this._route && this._route.path, src, this._hass);
    this._error = null;
    try {
      // The page's ⋮: a schedule's sheet opens its card's menu (rename, delete); a thermostat's
      // sheet opens the thermostat, or forgets it after a confirmation
      if ('pageMenu' in ds) {
        if (route.sheet === 'schedule') return this._cards[0] && this._cards[0]._scheduleAction('schedule-menu', {}, el);
        this._pageMenu = !this._pageMenu;
        this._pageForget = false;
        return this._fillPageMenu();
      }
      if ('forget' in ds || 'forgetCancel' in ds) {
        this._pageForget = 'forget' in ds;
        return this._fillPageMenu();
      }
      if ('forgetConfirm' in ds) {
        this._pageMenu = false;
        this._fillPageMenu();
        await src.forget(route.id);
        return openPanel('thermostats');
      }
      if ('sheetSave' in ds) return this._saveSheet(route.id);
      if ('sheetCancel' in ds) return this._discardSheet();
      // Leaving the sheet with weeks not saved yet: the save bar asks first
      if ('leaveStay' in ds) {
        this._leave = null;
        return this._fillSavebar();
      }
      if ('leaveDiscard' in ds || 'leaveSave' in ds) {
        const leave = this._leave;
        this._leave = null;
        if ('leaveSave' in ds) await this._saveSheet(route.id);
        else this._discardSheet();
        if (!this._dirtyWeeks().length && leave) leave();
        return;
      }
      if ((ds.navigate || ds.device) && this._dirtyWeeks().length) {
        this._leave = () => (ds.navigate ? navigate(ds.navigate) : openDevice(ds.device));
        return this._fillSavebar();
      }
      if (ds.copyMenu) {
        this._copyMenu = this._copyMenu === ds.copyMenu ? null : ds.copyMenu;
        return this._update();
      }
      if (ds.weekHvac) {
        // Every slot of the week whose menu is open, to heat or to cool: its card asks to save it
        const card = this._weekCards && this._weekCards[this._copyMenu];
        this._copyMenu = null;
        if (card) card._setWeekHvac(route.id, ds.weekHvac);
        return this._update();
      }
      if (ds.copyTo) {
        // Its week in schedule A copied to schedule B lands in B's card, which asks to save B. A is
        // not touched, even with edits not saved yet (they are copied as shown)
        const from = this._weekCards && this._weekCards[this._copyMenu];
        const to = this._weekCards && this._weekCards[ds.copyTo];
        this._copyMenu = null;
        if (from && to) to._receiveWeek(route.id, from._week(route.id), from._scheduleName(from._schedule));
        return this._update();
      }
      // The settings, on top of the panel: the notice of the new setting is then told
      if ('openSettings' in ds) {
        openSettings(this, this._hass, ds.openSettings || null);
        return this._update();
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
        try {
          localStorage.setItem(LS_GROUP, this._groupDays ? '1' : '0');
          localStorage.setItem(LS_HISTORY, this._historyOn ? '1' : '0');
        } catch (err) { /* ignore */ }
        // In place: the weeks keep their edits not saved yet
        const grouped = this._groupDays && !this._historyOn;
        for (const [chip, on] of [['[data-group-days]', grouped], ['[data-history]', this._historyOn]]) {
          const button = this.shadowRoot.querySelector(chip);
          button.classList.toggle('on', on);
          button.setAttribute('aria-pressed', String(on));
        }
        for (const card of Object.values(this._weekCards)) card._setWeekView(this._groupDays, this._historyOn);
        return this._update();
      }
      if ('closeNotice' in ds) {
        seenNewOff();
        return this._update();
      }
      if ('closeNewSetting' in ds) {
        seenNewSetting(this._hass);
        return this._update();
      }
      if ('closeNext' in ds) {
        try { localStorage.setItem(LS_NEXT_STEPS, 'closed'); } catch (err) { /* ignore */ }
        return this._update();
      }
      if ('start' in ds) {
        // Scheduled with no week of their own: the integration gives them the week of a new
        // schedule in each schedule, as a thermostat added to a card
        const climates = [...this._picked].sort();
        if (!climates.length) return undefined;
        try { localStorage.setItem(LS_NEXT_STEPS, 'pending'); } catch (err) { /* ignore */ }
        seenNewOff(); // a new user has nothing to upgrade from
        seenNewSetting(this._hass); // the next steps say it
        await src.saveWeeks(Object.fromEntries(climates.map((c) => [c, {}])),
          Object.fromEntries(climates.map((c) => [c, null])));
        this._picked.clear();
        return this._update();
      }
      if (ds.pause != null) return await src.setPaused(route.id, ds.pause === '1');
    } catch (err) {
      this._error = errorText(this._t, err);
      this._update();
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
    const resolver = document.createElement('partial-panel-resolver');
    resolver.hass = { panels: [{ url_path: 'tmp', component_name: 'lovelace' }] };
    resolver._updateRoutes();
    await resolver.routerOptions.routes.tmp.load();
    return window.loadCardHelpers ? window.loadCardHelpers() : null;
  } catch (e) {
    return null;
  }
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
  .notice.new-off > span { flex:1 1 200px; }
  .next-steps li > div { margin:4px 0 8px; }
  .crumbs { display:flex; align-items:baseline; gap:8px; min-width:0; }
  .crumbs a { color:inherit; opacity:.8; text-decoration:none; }
  .crumbs a:hover { opacity:1; text-decoration:underline; }
  .crumbs span:last-child { overflow:hidden; text-overflow:ellipsis; }
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
