import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { noticeTemplate, reloadPage, sourceNotice } from '../notices.ts';
import { dataSource, renamedTo } from '../client/snapshot.ts';
import { commands } from '../client/commands.ts';
import { client } from '../client/chauffage-client.ts';
import { groupPreference, historyPreference, saveGroupPreference, saveHistoryPreference, saveShownPreference, shownPreference } from '../state/preferences.ts';
import { WeekDraft } from '../state/week-draft.ts';
import { HistoryStore } from '../state/history-store.ts';
import { OverrideDraft } from '../state/override-draft.ts';
import { airSettings, clone, DAY_MIN, errorText, hasNoPreset, HVAC_ORDER, ICON_COPY, ICON_OPEN, ICON_PASTE, ICON_ZOOM, NO_PRESET_MODES, noPresetSlot, nowMin, pct, pieceSettings, sameSlot, SETTING_ATTRS, slotMode, slotOf, slotSettings, thermostatName, todayIdx, withSettings } from '../common.ts';
import { causeText, endMovedBy, endOfField, linksByKeyboard, listenTimeFields, timeFieldDone } from '../fields.ts';
import { SETPOINT_MARGIN, curveValue, rowsOfStates } from '../history.ts';
import { MODE_LABELS, SETTING_LABELS, dayOn, hvacIconTemplate, hvacModesOf, parseDecimal, presetModes, rowsOfDays, settingOptionsOf, slotModeOn, slotModesOf, slotOn } from '../hvac.ts';
import { makeLocale } from '../i18n/locale.ts';
import { LINK_TOKEN, deviceOf, inRowActions, navigate, openDevice, openMoreInfo, panelPath, panelTitle, withLink } from '../links.ts';
import { RESUME, coolPresetTemperatureOf, focusedField, nextOverride, overrideWithTemperature, presetTemperatureOf, slotName, stepOverrideTemperature, targetOf, withoutAir } from '../override-edit.ts';
import { overrideLabel, overridePieces, tagSide } from '../override.ts';
import { presetOf, sortedPresets } from '../presets.ts';
import { fromSettings, openSettings } from '../settings-dialog.ts';
import { copyOfDay, joinAt, joined, normalize, serializeDay } from '../slots.ts';
import { activateSchedule, scheduleMenu, scheduleMenuAction } from '../components/shared/schedule-menu.ts';
import type { ScheduleMenuHost } from '../components/shared/schedule-menu.ts';
import { entityLink } from '../components/shared/entity-link.ts';
import { noPresetModes, weekLegend } from '../components/week/legend.ts';
import { weekGrid } from '../components/week/week-grid.ts';
import { OverrideEndDrag } from '../controllers/override-end-drag.ts';
import { SlotDrag } from '../controllers/slot-drag.ts';
import { STYLE } from '../styles.ts';
import { VERSION } from '../version.ts';

// The views of the panel's pages (`view`), each its own element; the weeks are the card's own
const VIEWS = {
  presets: 'chauffage-presets-view',
  schedules: 'chauffage-schedules-view',
  thermostats: 'chauffage-thermostats-view',
  rules: 'chauffage-rules-view',
};
// The card's options that only the Chauffage panel sets, for its pages: a page shows one view, a
// thermostat's sheet stacks its weeks without their chips, tabs or foot, and saves them together
const PANEL_OPTIONS = ['panel', 'view', 'schedule', 'schedule_tabs', 'week_only', 'flat', 'preset_definitions', 'history'];

// The width of a slot's handle, in pixels (see the style of .handle)
const HANDLE_WIDTH = 18;

export class ChauffageProgrammeCard extends LitElement {
  static styles = unsafeCSS(STYLE);

  // The fields of the element, untyped until the rewrite of the card gives them a type
  declare _accessStamp: any;
  declare _answers: number;
  declare _asideKey: any;
  declare _available: any;
  declare _liveKey: string;
  declare _tabsLeft: number;
  declare _config: any;
  declare _configured: any;
  declare _copyWeekMenu: any;
  declare _dirtyTold: any;
  declare _draft: WeekDraft;
  // The gestures on the week: a slot or a handle moved, the end of an override moved
  _slotDrag = new SlotDrag(this);
  _overrideEnd = new OverrideEndDrag(this);
  declare _downAt: any;
  declare _focus: any;
  declare _groupPref: any;
  declare _hass: any;
  declare _history: HistoryStore;
  declare _lastClick: any;
  declare _linksStamp: any;
  declare _loc: any;
  declare _menu: any;
  declare _moreOpen: any;
  declare _moreTapped: any;
  declare _msg: any;
  declare _multiFresh: any;
  declare _multiSel: any;
  declare _noticeKey: any;
  declare _onDocDown: any;
  declare _onKey: any;
  declare _overrideDraft: OverrideDraft;
  declare _overrideSel: any;
  declare _overrideStamp: any;
  declare _previewed: any;
  declare _readTouch: any;
  declare _redrawLater: any;
  declare _renderedDay: any;
  declare _rows: any;
  declare _schedEd: any;
  declare _schedErr: any;
  declare _schedule: any;
  declare _scheduleState: any;
  declare _shown: any;
  declare _shownForPreview: any;
  declare _stamp: any;
  declare _tabsShown: any;
  declare _tabsWait: any;
  declare _thermostats: any;
  declare _thermostatsStamp: any;
  declare _timer: any;
  declare _trial: any;
  declare _unlisten: any;
  declare _view: any;
  declare _viewEl: any;
  declare _wantSchedule: any;
  declare _zoom: any;

  // Tells the panel which version of the card the page defined first (cards before 0.8.1: none)
  static get version() {
    return VERSION;
  }

  constructor() {
    super();
    this._draft = new WeekDraft(); // the weeks edited, until saved
    this._focus = null; // last thermostat used (source of "Copier la semaine")
    this._stamp = undefined;
    this._msg = '';
    this._lastClick = null;
    this._renderedDay = null;
    this._menu = null; // { climate, day, top, right } open row menu
    this._multiSel = false; // "Plusieurs" mode: clicking a thermostat adds / removes it
    // Overrides (temporary setpoints): sent to HA right away, without "Enregistrer"
    this._overrideSel = null; // { climate, day } override whose popover is open
    this._overrideDraft = new OverrideDraft(); // changes sent, waiting for the integration's update
    this._overrideStamp = undefined;
    // Measured temperature of the last 7 days, drawn over the bars: rows loaded (until a time), days drawn
    this._zoom = null; // { climate, day } shown larger (with the history)
    this._readTouch = false; // a finger reads the values along the bar shown larger
    this._history = new HistoryStore();
    // Identical days shown on one row (the user's choice on this device, else the card's option)
    this._groupPref = null;
    this._rows = null; // rows of days drawn last, each edited as a whole
    this._history.shown = historyPreference();
    this._groupPref = groupPreference();
  }

  createRenderRoot() {
    const root = super.createRenderRoot();
    linksByKeyboard(root);
    this._bindEvents(root);
    return root;
  }

  static getConfigElement() {
    return document.createElement('chauffage-programme-card-editor');
  }

  // A new card (Add card dialog): the thermostats that already have a schedule in Chauffage,
  // otherwise every thermostat, all shown at first (existing cards keep their choice)
  static async getStubConfig(hass) {
    const climates = Object.keys(hass.states).filter((e) => e.startsWith('climate.'));
    let src = dataSource(hass);
    if (src.available && !src.ready) {
      await new Promise<void>((resolve) => {
        const stop = client.listen(() => { stop(); resolve(); });
        setTimeout(() => { stop(); resolve(); }, 2000);
      });
      src = dataSource(hass);
    }
    const scheduled = Object.keys(src.weeks()).filter((e) => hass.states[e]);
    return { thermostats: scheduled.length ? scheduled : climates, show: 'all' };
  }

  // A dashboard's configuration: the options the Chauffage panel sets for its own pages are not
  // options of a dashboard card (PANEL_OPTIONS), and are ignored there
  setConfig(config) {
    const own = { ...config };
    for (const key of PANEL_OPTIONS) delete own[key];
    this._setPanelConfig(own);
  }

  // The panel's pages set the card with their own options too (see ChauffagePanel)
  _setPanelConfig(config) {
    if (!config.thermostats || !config.thermostats.length) {
      const lang = config.language || (typeof navigator !== 'undefined' && navigator.language);
      throw new Error(makeLocale(null, lang).t('thermostatsRequired'));
    }
    this._config = {
      step: 15,
      ...config,
    };
    // A thermostat listed twice is shown once (its first entry)
    this._configured = config.thermostats.map((t) => (typeof t === 'string' ? { entity: t } : { ...t }))
      .filter((t, i, list) => list.findIndex((o) => o.entity === t.entity) === i);
    // Without the thermostats renamed in Home Assistant (see _setAside)
    this._thermostats = this._configured;
    this._asideKey = '';
    this._shown = this._initialShown();
    this._schedule = null;
    // The schedule shown first (the Chauffage panel's ?schedule=), else the active schedule
    this._wantSchedule = config.schedule || null;
    // The view shown (a page of the Chauffage panel), else the weeks
    this._view = config.view || 'schedule';
    // In the panel, a thermostat's sheet shows the history or not for all its weeks (`history`)
    if (config.history != null) this._history.shown = !!config.history;
    if (this._hass) {
      this._setAside(this._source());
      this._render();
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    let need = first;
    // Language / time format / unit may change in the user's profile
    const loc = makeLocale(hass, this._config.language);
    if (!this._loc || loc.signature !== this._loc.signature) {
      this._loc = loc;
      need = true;
    }
    const src = this._source();
    if (src.available && !this._unlisten) {
      // Data pushed by the integration: same checks as a hass update
      this._unlisten = client.listen(() => { if (this._hass) this.hass = this._hass; });
    }
    if (src.available !== this._available) {
      this._available = src.available; // the integration deleted or disabled, or back
      need = true;
    }
    if (this._setAside(src)) need = true;
    // What the card says instead of the weeks: "…", then "restart Home Assistant" when the
    // data that comes is an older integration's
    const notice = sourceNotice(src);
    const noticeKey = notice ? notice.text || 'loading' : '';
    if (noticeKey !== this._noticeKey) {
      this._noticeKey = noticeKey;
      need = true;
    }
    const stamp = src.stamps.weeks;
    if ((stamp !== this._stamp) && !this._draft.dirty && !this._slotDrag.active) {
      this._load();
      this._stamp = stamp;
      need = true;
    }
    const dstamp = src.stamps.overrides;
    if (dstamp !== this._overrideStamp && !this._overrideEnd.active && !this._slotDrag.active) {
      this._overrideStamp = dstamp;
      this._overrideDraft.updated();
      need = true;
    }
    // Active schedule changed (from the card, another dashboard or an automation), or the icon of a
    // schedule chosen in Home Assistant: redraw the active-schedule marker, the tabs and the
    // "activate" bar
    const scheduleStamp = src.stamps.schedule;
    if (scheduleStamp !== this._scheduleState && !this._slotDrag.active && !this._overrideEnd.active) {
      this._scheduleState = scheduleStamp;
      need = true;
    }
    // A thermostat paused or resumed (switch, another card): redraw its notice and rows
    if (src.stamps.thermostats !== this._thermostatsStamp && !this._slotDrag.active && !this._overrideEnd.active) {
      this._thermostatsStamp = src.stamps.thermostats;
      need = true;
    }
    // An entity the card opens renamed, or a thermostat given another device: redraw its links
    const links = `${src.stamps.entities} ${this._thermostats.map((t) => deviceOf(hass, t.entity)).join(' ')}`;
    if (links !== this._linksStamp && !this._slotDrag.active && !this._overrideEnd.active) {
      this._linksStamp = links;
      need = true;
    }
    // The integration answered what a preset is worth on a thermostat it does not schedule yet
    // (targetOf): the popovers and the legend say it
    if (client.previewed !== this._answers && !this._slotDrag.active && !this._overrideEnd.active) {
      this._answers = client.previewed;
      need = true;
    }
    // The access level changed (#99): the tools appear or go at once. Without Plan, what was being
    // edited closes; the weeks not saved yet stay until Cancel
    if (src.stamps.access !== this._accessStamp) {
      this._accessStamp = src.stamps.access;
      if (this._slotDrag.active && !this._mayEdit(this._slotDrag.drag.climate)) this._slotDrag.cancel();
      if (this._draft.selection && !this._mayEdit(this._draft.selection.climate)) this._draft.selection = null;
      if (!src.plannable) {
        this._schedEd = null;
        this._copyWeekMenu = null;
      }
      need = true;
    }
    if (src.ready && this._wantSchedule && this._schedules().includes(this._wantSchedule)) {
      this._schedule = this._wantSchedule; // created from this card, or asked by its config
      this._wantSchedule = null;
      need = true;
    } else if (src.ready && (!this._schedule || !this._schedules().includes(this._schedule))) {
      const active = this._activeSchedule();
      this._schedule = this._schedules().includes(active) ? active : this._schedules()[0];
      need = true;
    }
    if (need) this._render();
    else if (!this._slotDrag.active && !this._overrideEnd.active) this._updateLive();
    this._refreshHistory();
  }

  // A thermostat renamed in Home Assistant: the configuration still holds its former id. Like
  // HA's own cards, the card does not change it by itself: it sets it aside with a notice, and
  // its editor offers the new id
  _setAside(src) {
    const aside = this._configured.filter((t) => renamedTo(this._hass, src, t.entity)).map((t) => t.entity);
    const key = aside.join(' ');
    if (key === this._asideKey) return false;
    // Set aside before, not any more: an entity has that id again, shown again
    const back = this._asideKey.split(' ').filter((e) => e && !aside.includes(e));
    this._asideKey = key;
    this._thermostats = this._configured.filter((t) => !aside.includes(t.entity));
    this._shown = this._thermostats.map((t) => t.entity)
      .filter((e) => (this._shown.includes(e) || back.includes(e)) && !aside.includes(e));
    if (!this._shown.length) this._shown = this._initialShown();
    return true;
  }

  // Thermostats shown at first: those chosen last on this device, else the config's `show`.
  // A preview (Add card dialog, card editor) shows what its config says.
  _initialShown() {
    const all = this._thermostats.map((t) => t.entity);
    if (!all.length) return []; // all renamed (see _setAside)
    const show = this._config.show;
    let saved = null;
    this._shownForPreview = this._isPreview();
    if (!this._shownForPreview) {
      saved = shownPreference();
    }
    const fromSaved = Array.isArray(saved) ? all.filter((e) => saved.includes(e)) : [];
    // In the "By card" list, a small preview: the first thermostat, even for a new card's `show: all`
    const fromConfig = show === 'all' && !this._inCardPicker() ? all
      : Array.isArray(show) ? all.filter((e) => show.includes(e)) : [all[0]];
    return fromSaved.length ? fromSaved : fromConfig.length ? fromConfig : [all[0]];
  }

  // HA sets `preview` on the cards it previews (suggestions, card editor), after their config;
  // the cards of the "By card" list are not marked, but shown in its <hui-card-picker>
  _isPreview() {
    return !!this._previewed || this._inCardPicker();
  }

  _inCardPicker() {
    const root: any = this.getRootNode && this.getRootNode();
    return !!(root && root.host && root.host.localName === 'hui-card-picker');
  }

  get preview() { return !!this._previewed; }

  set preview(value) {
    this._previewed = !!value;
    this._previewChanged();
  }

  _previewChanged() {
    if (!this._config || this._isPreview() === this._shownForPreview) return;
    this._shown = this._initialShown();
    if (this._hass) this._render();
  }

  connectedCallback() {
    super.connectedCallback();
    this._previewChanged();
    this._timer = setInterval(() => {
      if (this._slotDrag.active || this._overrideEnd.active) return;
      this._refreshHistory();
      // Full redraw on a new day or during an override (it moves with the time)
      if (this._renderedDay !== todayIdx() || Object.keys(this._overrides()).length) this._render();
      else this._updateLive();
    }, 30000);
    // Closes the row menu / popovers on a click outside the card or the Escape key
    const closePopups = () => {
      if (!this._menu && !this._draft.selection && !this._overrideSel && !this._schedEd && !this._copyWeekMenu) return;
      this._menu = null;
      this._copyWeekMenu = null;
      this._schedEd = null;
      this._draft.selection = null;
      this._overrideSel = null;
      this._render();
    };
    // A press outside the card closes its menus; not the ⋮ of the panel's page, which opens and
    // closes the menu of a schedule's page itself. The settings dialog opens on top of a popover:
    // a press or Escape in the dialog leaves the popover open under it
    this._onDocDown = (e) => {
      const path = e.composedPath();
      if (fromSettings(e)) return;
      if (!path.includes(this) && !path.some((n) => n.matches && n.matches('[data-page-menu]'))) closePopups();
    };
    this._onKey = (e) => {
      if (e.key === 'Escape' && !fromSettings(e)) closePopups();
    };
    document.addEventListener('pointerdown', this._onDocDown, true);
    document.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer);
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
    document.removeEventListener('pointerdown', this._onDocDown, true);
    document.removeEventListener('keydown', this._onKey);
  }

  getCardSize() {
    return 4 + 7 * this._shown.length;
  }

  // Sections view: as wide as the section by default; narrower than half of it, the bars
  // of the week can no longer be read (#10)
  getGridOptions() {
    return { columns: 'full', min_columns: 6 };
  }

  // ---------- data ----------

  _source() {
    return dataSource(this._hass);
  }

  _commands() {
    return commands(this._hass);
  }

  _reloadPage() {
    reloadPage();
  }

  // Presets as shown (columns, legend, slot popover): from the coldest to the warmest default
  // temperature; the integration keeps them in their own order
  _presets() {
    return sortedPresets(this._source(), this._loc);
  }

  _preset(id) {
    return presetOf(this._presets(), id, this._loc);
  }

  _schedules() {
    return this._source().schedules();
  }

  _activeSchedule() {
    return this._source().activeSchedule();
  }

  _scheduleName(id) {
    return this._source().scheduleName(id);
  }

  _load() {
    this._draft.load(this._source());
    this._trial = null;
  }

  // A thermostat's week in a schedule, the schedule shown by default (see WeekDraft.week)
  _week(climate, schedule = this._schedule) {
    return this._draft.week(climate, schedule);
  }

  // Identical days on one row (the user's choice on this device, else the card's option); not
  // with the history, which differs from day to day
  _grouped() {
    if (this._history.shown) return false;
    if (this._config.panel && this._config.group_days != null) return this._config.group_days;
    return this._groupPref ?? this._config.group_days !== false;
  }

  // Rows of days, in display order: one per day, or the days identical for every thermostat
  // shown on one row. What points at a day (selected slot, open menu, copied day) follows the
  // first day of its row, which draws it.
  _layoutRows() {
    const order = this._loc.dayOrder;
    this._rows = this._grouped()
      ? rowsOfDays(order, (d) => this._shown.map((c) => serializeDay(dayOn(this._hass, c, this._week(c)[d])).join(',')).join('|'))
      : order.map((d) => [d]);
    for (const ref of [this._draft.selection, this._menu]) if (ref) ref.day = this._rowOf(ref.day)[0];
  }

  // The days of the row a day is drawn in (the day alone before the first drawing)
  _rowOf(day) {
    return (this._rows && this._rows.find((r) => r.includes(day))) || [day];
  }

  _rowLabel(day, style) {
    return this._loc.daysLabel(this._rowOf(day), style);
  }

  // An edit of a row's day goes to every day of the row
  _spread(climate, day) {
    const week = this._week(climate);
    for (const d of this._rowOf(day)) if (d !== day) week[d] = clone(week[day]);
  }

  _name(entity) {
    const t = this._thermostats.find((x) => x.entity === entity);
    return thermostatName(this._hass, entity, t && t.name);
  }

  _focusClimate() {
    return this._shown.includes(this._focus) ? this._focus : this._shown[0];
  }

  _snap(m) {
    const step = this._config.step;
    return Math.round(m / step) * step;
  }

  // A piece the card cut (a double tap, Insert a slot) starts like the slot it is cut from, with
  // its popover open: the user says what it is. The piece is marked (`cut`). Left as it was cut,
  // the piece joins its slot again when the popover closes, when another slot is opened, when
  // another schedule is shown or when the weeks are saved (`force`), on every day of its row.
  // A slot the user set to the same as its neighbor is not a piece of the card's: it stays
  // (docs/decisions.md, "Card"). The preset a slot had before an HVAC mode without one
  // (`_trial`) is forgotten then too
  _settle(force = false) {
    const sel = this._draft.selection;
    const at = sel && (this._week(sel.climate)[sel.day] || [])[sel.idx];
    const trial = this._trial;
    if (trial && (force || !at || this._schedule !== trial.schedule || sel.climate !== trial.climate || sel.day !== trial.day || at.start !== trial.start)) this._trial = null;
    // The pieces of the row whose piece is selected wait
    const open = !force && at && at.cut ? this._rowOf(sel.day).map((d) => this._week(sel.climate)[d]) : [];
    const days = Object.values(this._draft.weeks).flatMap((weeks) => Object.values(weeks).flat())
      .filter((segs) => !open.includes(segs) && segs.some((slot) => slot.cut));
    if (!days.length) return;
    for (const segs of days) {
      // In place: an edit under way holds the day's slots
      segs.splice(0, segs.length, ...segs.filter((slot, i) => !(i > 0 && slot.cut && sameSlot(segs[i - 1], slot))));
      segs.forEach((slot) => { delete slot.cut; });
    }
    if (at) this._week(sel.climate)[sel.day].forEach((slot, i) => { if (slot.start <= at.start) sel.idx = i; });
    // Nothing left to save when the piece was the only edit
    this._draft.forgetUndoneEdits();
  }

  // An edit of a day's slots: spread to the days of its row, then drawn. Two slots that are the
  // same stay two slots. The slots the user did not touch stay as they are stored: a slot
  // without an HVAC mode is not given the one it runs in (docs/decisions.md, "Card")
  _commit(climate, day, keepMin) {
    const week = this._week(climate);
    week[day] = normalize(week[day]);
    this._spread(climate, day);
    if (keepMin != null) {
      let idx = 0;
      week[day].forEach((s, i) => { if (s.start <= keepMin) idx = i; });
      this._draft.selection = { climate, day, idx };
    }
    this._focus = climate;
    this._draft.dirty = true;
    this._msg = '';
    this._render();
  }

  // ---------- overrides ----------

  _overrides() {
    return this._overrideDraft.overrides(this._hass ? this._source() : null);
  }

  _overridePieces(climate) {
    return overridePieces(this._overrides()[climate]);
  }

  _overrideLabel(d) {
    return overrideLabel(d, this._loc, this._presets());
  }

  async _sendOverride(climate, override) {
    override = withoutAir(override);
    this._overrideDraft.sent(climate, override);
    if (!override) this._overrideSel = null;
    this._render();
    try {
      await this._commands().setOverride(climate, override, this._changeSource());
    } catch (e) {
      this._overrideDraft.failed(climate);
      this._msg = errorText(this._loc.t, e);
      this._render();
    }
  }

  // A time field left: its time is applied, for the slot or the thermostat it was typed for (a tap
  // outside the card may have closed the popover meanwhile). `next` is the field Tab goes to.
  _timeFieldDone(el, next?) {
    // Tab to another time field: applied once that field has the focus, so that the redraw waits
    // until the time fields are left, instead of replacing the field being typed in
    if (next && next.matches && next.matches('input.time')) {
      setTimeout(() => this._timeFieldDone(el));
      return;
    }
    timeFieldDone(this, el, (minutes) => {
      if (el.dataset.edge) this._setEdge(el.dataset.edge, minutes, JSON.parse(el.dataset.slot));
      else this._setOverrideEnd(el.dataset.overrideEnd, endOfField(el, minutes));
    });
  }

  // New end (Date): at least one step after now
  _setOverrideEnd(climate, endsAt) {
    const d = this._overrides()[climate];
    if (!d) return;
    const min = new Date(Date.now() + this._config.step * 60000);
    const f = endsAt < min ? min : endsAt;
    const { ends_at: _reason, ...chosen } = d; // an end the user chooses: no longer the next slot
    this._sendOverride(climate, { ...chosen, end: f.toISOString() });
  }

  async _save() {
    const src = this._source();
    if (!src.plannable || !this._maySave()) {
      this._msg = this._loc.t('unauthorized');
      this._render();
      return false;
    }
    this._settle(true);
    const request = this._draft.saveRequest();
    try {
      // Edits undone: nothing to send (a save would realign every thermostat)
      const result = Object.keys(request.weeks).length ? await this._commands().saveWeeks(request.weeks, request.revisions) : null;
      this._draft.recordRevisions(result);
      this._draft.saved(request.serialized);
      this._msg = this._loc.t('saved');
      this._render();
      return true;
    } catch (e) {
      // Integration: edited elsewhere since this copy was loaded
      this._msg = e && e.code === 'stale' ? this._loc.t('stale') : errorText(this._loc.t, e);
      this._render();
      return false;
    }
  }

  // ---------- rendering ----------

  // A chip only names its thermostat, with a mark when it is missing, off, paused or on a
  // temporary setpoint: short, so that the chips do not move
  _chipMark(climate) {
    const st = this._hass.states[climate];
    if (!st) return '?';
    if (this._source().paused(climate)) return this._loc.t('paused');
    if (this._overrides()[climate]) return '⏱';
    // Why it protects itself, when the integration knows (a VTherm's window, auto start/stop)
    const cause = causeText(this._source(), climate, this._loc);
    if (cause) return cause.short;
    return st.state !== 'off' ? '' : this._loc.t('off');
  }

  // What changes with Home Assistant's states between two drawings of the weeks: the marks of the
  // chips, the current time, and the setpoint the override popover shows while it follows the
  // thermostat. Drawn again only when one of them changes
  _updateLive() {
    const sel = this._overrideSel;
    const st = sel && this._hass.states[sel.climate];
    const key = JSON.stringify([this._thermostats.map((t) => this._chipMark(t.entity)), nowMin(), st ? st.attributes.temperature : null]);
    if (key === this._liveKey) return;
    this._liveKey = key;
    this.requestUpdate();
  }

  // ---------- history of the measured temperature ----------

  // Loads the last 7 days from the recorder while the history is shown (see HistoryStore.due)
  _refreshHistory(force = false) {
    const h = this._history;
    if (!this._hass || !this._config || !h.due(force)) return;
    const loading = h.refresh((since, now) => this._fetchHistory(since, now));
    if (!h.days) this._render(); // the button shows the loading
    return loading
      .catch((e) => { this._msg = this._loc.t('historyUnavailable', { message: (e && e.message) || e }); })
      .then(() => {
        if (h.shown && !this._slotDrag.active && !this._overrideEnd.active) this._render();
      });
  }

  // Rows of every thermostat of the card from the integration, which only sends the two
  // temperatures; an integration updated but not restarted yet does not know the command:
  // Home Assistant's own history then (every attribute: much bigger)
  _fetchHistory(since, now) {
    const msg = { entity_ids: this._thermostats.map((t) => t.entity), start_time: since.toISOString(), end_time: now.toISOString() };
    return Promise.resolve()
      .then(() => this._hass.callWS({ type: 'chauffage/history', ...msg }))
      .catch((e) => {
        if (!e || e.code !== 'unknown_command') throw e;
        return this._hass.callWS({ type: 'history/history_during_period', ...msg, minimal_response: false, no_attributes: false, significant_changes_only: false })
          .then(rowsOfStates);
      });
  }

  // Cancel: the weeks go back as they were saved (the card's bar, or the panel's for a page)
  _discard() {
    this._draft.dirty = false;
    this._draft.selection = null;
    this._msg = '';
    this._load();
    this._render();
  }

  // A thermostat's page in the panel: its switches group the days and show the history of every
  // week, in place, keeping the edits not saved yet
  _setWeekView(groupDays, history) {
    this._config.group_days = groupDays;
    this._history.shown = history;
    if (!history) this._zoom = null;
    this._render();
    if (history) this._refreshHistory(true);
  }

  _toggleHistory() {
    const h = this._history;
    h.shown = !h.shown;
    if (!h.shown) this._zoom = null;
    saveHistoryPreference(h.shown);
    this._render();
    if (h.shown) this._refreshHistory(true);
  }

  _toggleZoom(climate, day) {
    this._zoom = this._isZoomed(climate, day) ? null : { climate, day };
    this._render();
  }

  _historyOf(climate, day) {
    return this._history.of(climate, day);
  }

  _isZoomed(climate, day) {
    const z = this._zoom;
    return !!z && z.climate === climate && z.day === day && !!this._historyOf(climate, day);
  }

  // Scale of a bar: the measured temperatures and the setpoints close to them, of the thermostat's
  // 7 days (comparable days), or of the day alone when it is shown larger (its details)
  _historyScale(climate, day) {
    const days = this._isZoomed(climate, day) ? [this._history.days[climate][day]] : this._history.days[climate];
    const values = days.flatMap((x) => x.current.flat().map(([, v]) => v));
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    for (const v of days.flatMap((x) => x.target.flat().map(([, t]) => t))) {
      if (v >= lo - SETPOINT_MARGIN && v <= hi + SETPOINT_MARGIN) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (hi - lo < 2) { lo = (lo + hi) / 2 - 1; hi = lo + 2; }
    // Position (% of the bar's height, from the top) of a temperature; out of the scale: on the edge
    return { lo, hi, y: (v) => Math.max(3, Math.min(97, 90 - ((v - lo) / (hi - lo)) * 80)) };
  }

  // "07:00 · 18.2° · setpoint 20°": the values at a minute of a day shown with its history
  _readoutText(climate, day, m) {
    const hd = this._historyOf(climate, day);
    const at = (lines) => {
      const v = lines.map((l) => curveValue(l, m)).find((x) => x != null);
      return v == null ? '–' : `${this._loc.number(Math.round(v * 10) / 10)}°`;
    };
    return this._loc.t('readout', { time: this._loc.time(m), measured: at(hd.current), setpoint: at(hd.target) });
  }

  _showReadout(bar, clientX) {
    const climate = bar.dataset.climate;
    const day = Number(bar.dataset.day);
    if (!this._historyOf(climate, day)) return;
    const m = Math.min(DAY_MIN - 1, Math.round(this._minuteAt(bar, clientX)));
    const cross = bar.querySelector('.cross');
    const readout = bar.querySelector('.readout');
    cross.hidden = false;
    readout.hidden = false;
    cross.style.left = `${pct(m)}%`;
    readout.style.left = `${pct(m)}%`;
    readout.classList.toggle('left', m > DAY_MIN / 2); // stays inside the bar
    readout.textContent = this._readoutText(climate, day, m);
  }

  _hideReadout(bar) {
    bar.querySelectorAll('.cross, .readout').forEach((el) => { el.hidden = true; });
  }

  // " · measured 18.2–19.6° · setpoint 20°" for a slot of a day shown with its history
  _measuredText(climate, day, start, end) {
    const hd = this._historyOf(climate, day);
    if (!hd) return '';
    const fmt = (v) => this._loc.number(Math.round(v * 10) / 10);
    const range = (lines, key) => {
      const values = lines.flatMap((l) => [
        curveValue(l, start), ...l.filter(([m]) => m > start && m < end).map(([, v]) => v),
      ]).filter((v) => v != null);
      if (!values.length) return '';
      const [min, max] = [Math.min(...values), Math.max(...values)].map(fmt);
      return ` · ${this._loc.t(key, { range: min === max ? min : `${min}–${max}` })}`;
    };
    return range(hd.current, 'measured') + range(hd.target, 'setpoint');
  }

  // A slot's name: "Off" for an off slot, "Fan only" for a fan-only slot, else its preset's
  _slotLabel(s) {
    return slotName(s, this._presets(), this._loc);
  }

  // A notice per thermostat of the configuration renamed in Home Assistant
  _renamedNotes() {
    const src = this._source();
    return this._configured.map((t) => [t.entity, renamedTo(this._hass, src, t.entity)]).filter(([, to]) => to)
      .map(([former, entity]) => html`<div class="paused-note renamed-note"><span>${this._loc.t('renamedNote', { former, entity })}</span></div>`);
  }

  // A notice per paused thermostat shown, with a button to resume it (anyone who may control the
  // thermostat, as with its Control switch)
  _pausedNotes() {
    const src = this._source();
    return this._shown.filter((climate) => src.paused(climate)).map((climate) => html`<div class="paused-note">
        <span>${withLink(this._loc.t('pausedNote', { name: LINK_TOKEN }), this._moreInfoLink(climate))}</span>
        <button class="btn" data-act="resume" data-climate=${climate}>${this._loc.t('resumeShort')}</button>
      </div>`);
  }

  // A thermostat of the card that Chauffage does not schedule: the card draws a new schedule's
  // week for it, and editing that week schedules it
  _unscheduledNotes() {
    const src = this._source();
    if (!src.ready) return nothing;
    // Scheduling a thermostat is setting up (canSetUp): with Plan, its week stays read-only
    const key = src.editable ? 'unscheduledNote' : 'unscheduledNoteReadOnly';
    return this._shown.filter((climate) => this._unscheduled(climate)).map((climate) => html`<div class="paused-note unscheduled-note">
        <span>${withLink(this._loc.t(key, { name: LINK_TOKEN }), this._moreInfoLink(climate))}</span></div>`);
  }

  _unscheduled(climate) {
    const src = this._source();
    return src.ready && !!this._hass.states[climate] && !src.scheduled().includes(climate);
  }

  // The user may edit this thermostat's weeks (#99): Plan (canPlan), and Set up (canSetUp) for a
  // thermostat Chauffage does not schedule yet, which its first save schedules
  _mayEdit(climate) {
    const src = this._source();
    return src.plannable && (src.editable || !this._unscheduled(climate));
  }

  // The weeks edited can be saved: the access level may have dropped since (U31)
  _maySave() {
    return this._draft.changed().every((c) => this._mayEdit(c));
  }

  // Renders, then runs a change of the integration; its error, if any, is shown
  async _call(change) {
    this._render();
    try {
      await change(this._commands());
    } catch (e) {
      this._msg = errorText(this._loc.t, e);
      this._render();
    }
  }

  _setPaused(climate, paused) {
    return this._call((cmd) => cmd.setPaused(climate, paused));
  }

  _menuTemplate() {
    const m = this._menu;
    if (!m) return nothing;
    const item = (act, label, icon = null, disabled = false) =>
      html`<button class="mi" data-act=${act} data-climate=${m.climate} data-day=${m.day} ?disabled=${disabled}>${icon ? unsafeHTML(icon) : nothing}<span>${label}</span></button>`;
    const t = this._loc.t;
    const paste = this._draft.clip ? html`${t('paste')} <small>${this._draft.clip.label}</small>` : t('paste');
    // What can be done with this day, and a temporary setpoint on today; pausing is in the
    // "Thermostats" view. The thermostat's name opens it.
    // Copying and pasting edit the weeks: canPlan (U9)
    const groups = this._mayEdit(m.climate) ? [
      html`${item('copy-day', t('copyDay'), ICON_COPY)}${item('paste-day', paste, ICON_PASTE, !this._draft.clip)}`,
      html`${item('fill-weekdays', t('copyToWeekdays'))}${item('fill-weekend', t('copyToWeekend'))}${
        item('fill-all', t('copyToAll'))}${this._shown.length > 1 ? item('fill-others', t('copyToOthers')) : nothing}`,
    ] : [];
    // The whole week of this thermostat, in the schedule shown: every slot to heat, or to cool
    if (groups.length && slotModesOf(this._hass, m.climate).length) {
      const all = (mode, key) => html`<button class="mi" data-act="week-hvac" data-climate=${m.climate} data-mode=${mode}>${hvacIconTemplate(mode)}<span>${t(key)}</span></button>`;
      groups.push(html`${all('heat', 'weekAllHeat')}${all('cool', 'weekAllCool')}`);
    }
    if (this._historyOf(m.climate, m.day)) groups.push(item('zoom', t(this._isZoomed(m.climate, m.day) ? 'showSmaller' : 'showLarger'), ICON_ZOOM));
    if (this._mayOverride(m.climate, m.day)) groups.push(item('override-new', t('newOverride')));
    return html`<div class="menu" style=${`top:${m.top}px;right:${m.right}px`}>
      <div class="mh">${this._moreInfoLink(m.climate)} · ${this._rowLabel(m.day, 'long')}</div>
      ${groups.map((g, i) => html`${i ? html`<div class="sep"></div>` : nothing}${g}`)}
    </div>`;
  }

  // A new override is set from today's row, on a thermostat that is not paused
  _mayOverride(climate, day) {
    return this._rowOf(day).includes(todayIdx()) && !this._source().paused(climate);
  }

  // A day's ⋮ has something to offer: with read-only weeks, the history or a new override only
  _hasMenu(climate, day) {
    return this._mayEdit(climate) || !!this._historyOf(climate, day) || this._mayOverride(climate, day);
  }

  // `top`: under the button or the pointer; `above` (optional): where the menu ends when it opens
  // upwards, because there is no room for it below in the window
  _openMenu(climate, day, top, right, above) {
    const m = this._menu;
    this._menu = m && m.climate === climate && m.day === day ? null : { climate, day, top, right, above };
    this._render();
  }

  // The row menu just drawn, placed upwards when there is no room for it below in the window
  _placeMenu() {
    const menu = this._menu;
    if (!menu || menu.above == null) return;
    const { top, above } = menu;
    menu.above = null; // placed once
    // Measured once ha-card (a Lit component, rendered asynchronously) shows its content
    const place = () => {
      const el: any = this._menu === menu && this.shadowRoot.querySelector('.menu');
      if (!el || !el.offsetHeight) return false;
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const h = el.offsetHeight;
      if (card.top + top + h > window.innerHeight && card.top + above - h >= 0) {
        menu.top = above - h;
        el.style.top = `${menu.top}px`;
      }
      return true;
    };
    if (place()) return;
    const card: any = this.shadowRoot.querySelector('ha-card');
    const ready = card && card.updateComplete instanceof Promise ? card.updateComplete : Promise.resolve();
    ready.then(() => requestAnimationFrame(place));
  }

  // The tag of each short override, on the side where it covers no slot's label (tagSide). Once
  // ha-card shows its content: before that, nothing has a width
  _placeTags() {
    // Every tag is measured before any is moved: the browser lays the card out once
    const sides = [];
    for (const tag of this.shadowRoot.querySelectorAll('.override-tag')) {
      const bar = tag.closest('.bar');
      const width = tag.getBoundingClientRect().width;
      if (!bar || !width) continue; // not shown: its label fits in the block
      const labels = [...bar.querySelectorAll('.seg .t, .seg .l')]
        .filter((el) => el.textContent && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
      sides.push([tag, tagSide({ width }, tag.parentElement.getBoundingClientRect(), bar.getBoundingClientRect(), labels)]);
    }
    for (const [tag, side] of sides) tag.className = `override-tag${side ? ` ${side}` : ''}`;
  }

  _schedulePlaceTags() {
    const card: any = this.shadowRoot.querySelector('ha-card');
    if (!card || !this.shadowRoot.querySelector('.override-tag')) return;
    const ready = card.updateComplete instanceof Promise ? card.updateComplete : Promise.resolve();
    ready.then(() => requestAnimationFrame(() => this._placeTags()));
  }

  // In the words of a mouse, or of a finger on a touch screen (CSS). A thermostat's page stacks
  // one card per schedule: it shows the hint once (`week_only`). Not with read-only weeks (the
  // access level): there is nothing to drag
  _hint() {
    if (this._config.week_only || !this._shown.some((c) => this._mayEdit(c))) return nothing;
    const t = this._loc.t;
    return html`<div class="hint"><span class="mouse">${t('hint')}</span><span class="touch">${t('hintTouch')}</span></div>`;
  }

  // Places the popover open under its slot or its override (or above it when there is no room),
  // now. Returns false if the layout is not ready yet.
  _placeEditor() {
    const popover: any = this.renderRoot.querySelector('chauffage-override-popover .editor, chauffage-slot-popover .editor');
    return popover ? popover.closest('chauffage-override-popover, chauffage-slot-popover').placement.place() : true;
  }

  // The popover open, if what it edits is still there: a slot of a thermostat shown, an override
  // that has not ended, unless opened to set one (today's row menu)
  _checkPopovers() {
    const o = this._overrideSel;
    if (o && ((!this._overrides()[o.climate] && !o.create) || !this._shown.includes(o.climate))) this._overrideSel = null;
    const s = this._draft.selection;
    const segs = s && this._shown.includes(s.climate) && this._week(s.climate)[s.day];
    if (s && !(segs && segs[s.idx])) this._draft.selection = null;
  }

  // Redraws the card, keeping a schedule name being typed in a menu (the card is redrawn every
  // 30 s during an override, or when Home Assistant sends new data)
  _render() {
    this.requestUpdate();
  }

  // Not while a time is typed: the redraw would take its field away
  shouldUpdate() {
    if (!this._hass || !this._config) return false;
    if (focusedField(this.renderRoot, 'input.time')) { this._redrawLater = true; return false; }
    return true;
  }

  willUpdate() {
    const root = this.renderRoot;
    const tabs = root.querySelector('.tabs-scroll');
    this._tabsLeft = tabs ? tabs.scrollLeft : 0;
  }

  updated() {
    this._tabsWait = false;
    this._placeTabs(this._tabsLeft);
    this._placeMenu();
    this._schedulePlaceTags();
    // A week of a thermostat's page (`week_only`): the page's own bar saves it, so the
    // sheet hears when it has edits to save
    if (this._config.week_only && this._draft.dirty !== this._dirtyTold) {
      this._dirtyTold = this._draft.dirty;
      this.dispatchEvent(new CustomEvent('chauffage-dirty', { bubbles: true, composed: true }));
    }
  }

  // Many schedules: the tabs scroll sideways. A redraw keeps where they were scrolled; another
  // schedule shown is scrolled into view
  _placeTabs(left) {
    const tabs: any = this.shadowRoot.querySelector('.tabs-scroll');
    if (!tabs) return;
    // ha-card (a Lit component) shows its content asynchronously: measured once more after it is
    // drawn, once per render (a hidden card has no width: no measuring on every frame)
    const card: any = this.shadowRoot.querySelector('ha-card');
    if (!tabs.clientWidth && card && card.updateComplete instanceof Promise && !this._tabsWait) {
      this._tabsWait = true;
      card.updateComplete.then(() => requestAnimationFrame(() => { if (this.isConnected) this._placeTabs(left); }));
      return;
    }
    tabs.scrollLeft = left;
    this._tabArrows();
    const on: any = tabs.querySelector('.tab.on');
    if (!on || this._tabsShown === this._schedule) return;
    this._tabsShown = this._schedule;
    const tool: any = on.nextElementSibling && on.nextElementSibling.matches('.tab-tool') ? on.nextElementSibling : on;
    const start = on.offsetLeft - tabs.offsetLeft;
    const end = tool.offsetLeft - tabs.offsetLeft + tool.offsetWidth;
    // Clear of the fades (32 px, and the arrow's room with a mouse), so its ⋮ is not dimmed
    const margin = 32 + (parseFloat(getComputedStyle(tabs.parentElement).getPropertyValue('--clear')) || 0);
    if (start - margin < tabs.scrollLeft) tabs.scrollLeft = Math.max(0, start - margin);
    else if (end + margin > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = end + margin - tabs.clientWidth;
    this._tabArrows();
  }

  // A fade and an arrow on each side where schedules are hidden
  _tabArrows() {
    const tabs = this.shadowRoot.querySelector('.tabs-scroll');
    if (!tabs) return;
    // Classes only: the arrows lie over the tabs, so showing them moves nothing
    tabs.parentElement.classList.toggle('more-left', tabs.scrollLeft > 1);
    tabs.parentElement.classList.toggle('more-right', tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1);
  }

  // The element of the view shown (`view`), created once
  _viewElement() {
    const tag = VIEWS[this._view];
    if (!this._viewEl || this._viewEl.localName !== tag) this._viewEl = document.createElement(tag);
    return this._viewEl;
  }

  render() {
    this._settle();
    const tr = this._loc.t;
    const flat = this._config.flat ? ' flat' : '';
    const fill = (content, cls?) => html`<ha-card class=${`${cls || ''}${flat}`}>${content}</ha-card>`;
    const notice = sourceNotice(this._source());
    if (notice) return fill(noticeTemplate(notice, tr));
    // A view of the panel (`view`): its own element, kept while the card shows it
    if (VIEWS[this._view] && this._source().ready) {
      const view = this._viewElement();
      view.hass = this._hass;
      view.loc = this._loc;
      view.thermostats = this._thermostats;
      view.panel = !!this._config.panel;
      if (this._view === 'presets') view.definitions = this._config.preset_definitions !== false;
      return fill(view);
    }
    if (!this._thermostats.length) return fill(this._renamedNotes());
    const src = this._source();
    const schedules = this._schedules();
    const active = this._activeSchedule();
    this._renderedDay = todayIdx();
    const multi = this._shown.length > 1;
    const allShown = this._shown.length === this._thermostats.length;

    const chips = this._thermostats.map((t) => {
      const on = this._shown.includes(t.entity);
      const paused = src.paused(t.entity) ? ' paused' : '';
      return html`<button class=${`chip${on ? ' on' : ''}${paused}`} data-climate=${t.entity}><span class="chip-name">${this._name(t.entity)}</span> <span class="live">${this._chipMark(t.entity)}</span><span class="chip-open" data-more-info=${t.entity} title=${tr('openThermostat')}>${unsafeHTML(ICON_OPEN)}</span></button>`;
    });
    // The schedules' ⋮ and + edit the schedules: canPlan
    const plannable = src.plannable;
    // On a schedule's sheet (schedule_tabs: 'one'): its tab alone, with its menu, and no new schedule
    const one = this._config.schedule_tabs === 'one';
    // A week of a thermostat's page: the week alone (`week_only`)
    const weekOnly = !!this._config.week_only;
    const tabs = (one ? schedules.filter((m) => m === this._schedule) : schedules).map((m) => {
      const icon = src.scheduleIcon(m);
      return html`<button class=${`tab${m === this._schedule ? ' on' : ''}`} data-schedule=${m}>${m === active ? html`<span class="dot" title=${tr('activeSchedule')}></span>` : nothing}${icon ? html`<ha-icon class="tab-icon" icon=${icon}></ha-icon>` : nothing}<span class="tab-name">${this._scheduleName(m)}</span></button>${
        plannable && m === this._schedule ? html`<button class="tab-tool" data-act="schedule-menu" title=${tr('scheduleMenu')}>⋮</button>` : nothing}`;
    });
    // Arrows on the sides of the tabs, shown when schedules are hidden on that side (_tabArrows)
    const tabsArrow = (side) => html`<button class="tab-arrow" data-tabs-scroll=${side}
      title=${tr(side === 'left' ? 'tabsLeft' : 'tabsRight')} aria-label=${tr(side === 'left' ? 'tabsLeft' : 'tabsRight')}><ha-icon icon=${`mdi:chevron-${side}`}></ha-icon></button>`;
    // Out of the tabs' scrolling area: the "+" stays in place however many schedules there are
    const newTab = plannable && !one ? html`<button class="tab-tool" data-act="schedule-new" title=${tr('newSchedule')}>+</button>` : nothing;
    // Days in the order of the user's first weekday (data stays Monday-based)
    this._layoutRows();
    this._checkPopovers();
    const focus = this._focusClimate();
    // The weeks edited, then the access level dropped (U31): kept until Cancel, but not saved
    const maySave = !this._draft.dirty || (plannable && this._maySave());
    const panelOpen = this._panelOpen();
    const cw = this._copyWeekMenu;
    // A week of a thermostat's page: the HVAC modes without a preset alone
    const modes = weekOnly ? noPresetModes(this) : [];
    const foot = weekOnly
      ? (modes.length ? html`<div class="foot"><div class="legend">${modes}</div></div>` : nothing)
      : html`<div class="foot">
          ${weekLegend(this)}
          <div class="actions">
            ${plannable ? html`<button class=${`btn copyweek${cw ? ' on' : ''}`} data-act="copyweek-menu">${tr('copyWeekTo', { name: this._name(focus) })}</button>` : nothing}
            ${this._copyWeekMenuTemplate()}
          </div>
        </div>`;

    return fill(html`
        ${weekOnly ? nothing : html`<div class=${`chips${panelOpen !== nothing ? ' with-open' : ''}`}>
          ${panelOpen}
          ${chips}
          <span class="chip-sep"></span>
          <button class=${`chip tool${this._multiSel ? ' on' : ''}`} data-act="multi-sel" title=${tr('multipleTitle')}>${tr('multiple')}</button>
          <button class=${`chip tool${allShown ? ' on' : ''}`} data-act="show-all" title=${tr('allTitle')}>${tr('all')}</button>
          <button class=${`chip tool${this._grouped() ? ' on' : ''}`} data-act="group-days" title=${tr('groupDaysTitle')}>${tr('groupDays')}</button>
          <button class=${`chip tool${this._history.shown ? ' on' : ''}${this._history.loading ? ' loading' : ''}`} data-act="history" title=${tr('historyTitle')}>${tr('history')}</button>
        </div>`}
        ${this._renamedNotes()}
        ${weekOnly ? nothing : this._pausedNotes()}
        ${this._unscheduledNotes()}
        ${weekOnly ? nothing : html`${one ? html`<div class="no-tabs"></div>` : html`<div class="tabs"><div class="tabs-wrap"><div class="tabs-scroll">${tabs}</div>${tabsArrow('left')}${tabsArrow('right')}</div>${newTab}</div>`}
        ${scheduleMenu(this._scheduleMenuHost())}
        ${this._scheduleBar(active)}`}
        ${weekGrid(this)}
        ${this._menuTemplate()}
        ${this._hint()}
        ${this._overrideSel ? html`<chauffage-override-popover .card=${this}></chauffage-override-popover>` : html`<chauffage-slot-popover .card=${this}></chauffage-slot-popover>`}
        ${foot}
        <div class="msg">${maySave ? this._msg : tr('unauthorized')}</div>
        ${this._draft.dirty && !weekOnly ? html`<div class="savebar">
          <span class="dirty">${tr('unsaved')}</span>
          <button class="btn" data-act="cancel">${tr('cancel')}</button>
          ${maySave ? html`<button class="btn primary" data-act="save">${tr('save')}</button>` : nothing}
        </div>` : nothing}`,
    `${multi ? 'multi' : 'single'} h${Math.min(this._shown.length, 3)}${this._loc.hour12 ? ' h12' : ''}`);
  }

  // Copying the week of the thermostat shown to another thermostat or schedule: a menu, as the
  // day's ⋮, opening upwards from the foot of the card
  _copyWeekMenuTemplate() {
    const cw = this._copyWeekMenu;
    if (!cw) return nothing;
    const focus = this._focusClimate();
    const groups = this._thermostats.filter((t) => this._mayEdit(t.entity)).map((t) => {
      const items = this._schedules()
        .filter((m) => !(t.entity === focus && m === this._schedule))
        .map((m) => html`<button class="mi" data-act="copy-week" data-climate=${t.entity} data-schedule=${m}><span>${this._scheduleName(m)}</span></button>`);
      return items.length ? html`<div class="mh">${this._name(t.entity)}</div>${items}` : nothing;
    });
    return html`<div class="menu copyweek-menu" style=${`${cw.top != null ? `top:${cw.top}px` : `bottom:${cw.bottom}px`};right:${cw.right}px;max-height:${Math.max(120, cw.maxHeight)}px`}>${groups}</div>`;
  }

  _minuteAt(bar, clientX) {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(DAY_MIN, ((clientX - r.left) / r.width) * DAY_MIN));
  }

  _saveShown() {
    if (this._isPreview()) return; // trying it in a preview does not change the dashboards
    saveShownPreference(this._shown);
  }

  // ---------- events ----------

  _bindEvents(root) {

    // The schedule tabs scroll natively (a finger, a trackpad, Shift + wheel): their fades and arrows
    // follow. An arrow scrolls by most of a width (the tab cut at the edge then shows whole), with
    // the browser's smooth scrolling, which stops when the user scrolls
    root.addEventListener('scroll', (e: any) => {
      if (!e.target.matches) return;
      if (e.target.matches('.tabs-scroll')) this._tabArrows();
    }, true);
    root.addEventListener('click', (e: any) => {
      const arrow = e.target.closest('[data-tabs-scroll]');
      const tabs = arrow && root.querySelector('.tabs-scroll');
      if (!tabs) return;
      e.stopPropagation();
      const left = (arrow.dataset.tabsScroll === 'left' ? -1 : 1) * Math.round(tabs.clientWidth * 0.8);
      if (typeof tabs.scrollBy === 'function') tabs.scrollBy({ left, behavior: 'smooth' });
      else tabs.scrollLeft += left; // no smooth scrolling (tests)
      this._tabArrows();
    }, true);

    // Readout of a day shown larger: under the mouse, or along a finger sliding on the bar
    root.addEventListener('pointerdown', (e: any) => {
      const bar = e.target.closest('.bar.zoom');
      if (bar && e.pointerType === 'touch' && !e.target.closest('.handle, .override-handle')) this._readTouch = true;
    }, true);
    root.addEventListener('pointermove', (e: any) => {
      const bar = e.target.closest('.bar.zoom');
      if (!bar || this._slotDrag.active || this._overrideEnd.active) return;
      if (e.pointerType === 'touch' && !this._readTouch) return;
      this._showReadout(bar, e.clientX);
    }, true);
    const stopTouch = () => { this._readTouch = false; };
    root.addEventListener('pointerup', stopTouch, true);
    root.addEventListener('pointercancel', stopTouch, true);
    root.addEventListener('pointerleave', (e: any) => {
      if (e.pointerType !== 'touch' && e.target.matches && e.target.matches('.bar.zoom')) this._hideReadout(e.target);
    }, true);

    // Dragging: the end of an override (OverrideEndDrag), a slot or a handle (SlotDrag)
    root.addEventListener('pointerdown', (e: any) => {
      // Where the finger went down on a row: a tap on a handle opens the slot there. On a touch
      // screen the browser may move the click that follows to the centre of the handle
      if (e.target.closest('.bar')) this._downAt = { x: e.clientX, t: Date.now() };
      if (!this._overrideEnd.down(e)) this._slotDrag.down(e);
    });
    root.addEventListener('pointermove', (e: any) => {
      if (!this._overrideEnd.move(e)) this._slotDrag.move(e);
    });
    root.addEventListener('pointerup', () => {
      if (!this._overrideEnd.up()) this._slotDrag.up();
    });
    // The browser took the gesture over (a scroll): the slots go back as they were (#67)
    root.addEventListener('pointercancel', () => {
      if (this._slotDrag.active) this._slotDrag.cancel();
      else this._overrideEnd.up();
    });

    // Right click (or long press on Android) on a row: opens the menu at the pointer
    root.addEventListener('contextmenu', (e: any) => {
      const bar = e.target.closest('.bar');
      if (!bar) return;
      e.preventDefault();
      if (!this._hasMenu(bar.dataset.climate, Number(bar.dataset.day))) return;
      const card = root.querySelector('ha-card').getBoundingClientRect();
      this._menu = null;
      this._openMenu(bar.dataset.climate, Number(bar.dataset.day), e.clientY - card.top + 4, Math.max(8, card.right - e.clientX - 8), e.clientY - card.top - 4);
    });

    root.addEventListener('click', (e: any) => {
      // Schedule menu open: a click elsewhere only closes it
      if (this._schedEd && !e.target.closest('.sched-menu, [data-act="schedule-new"], [data-act="schedule-menu"]')) {
        this._schedEd = null;
        this._render();
        return;
      }
      // The menu to copy the week open: a click elsewhere only closes it
      if (this._copyWeekMenu && !e.target.closest('.copyweek-menu, [data-act="copyweek-menu"]')) {
        this._copyWeekMenu = null;
        this._render();
        return;
      }
      // Menu open: a click elsewhere only closes it
      if (this._menu && !e.target.closest('.menu, [data-act="menu"]')) {
        this._menu = null;
        this._render();
        return;
      }
      // The settings, on top of the card: its popover stays open under them
      if (e.target.closest('[data-open-settings]')) {
        openSettings(this, this._hass);
        return;
      }
      // Link to an entity's more-info dialog (thermostat, schedule's switch, select…)
      const mi = e.target.closest('[data-more-info]');
      if (mi) {
        e.stopPropagation();
        this._draft.selection = null;
        this._overrideSel = null;
        this._menu = null;
        this._schedEd = null;
        this._render();
        this._openMoreInfo(mi.dataset.moreInfo);
        return;
      }
      const device = e.target.closest('[data-device]');
      if (device) {
        this._draft.selection = null;
        this._overrideSel = null;
        openDevice(device.dataset.device);
        return;
      }
      // A page of the panel, or a dashboard's view: its address (not from a row's actions)
      const to = !inRowActions(e) && e.target.closest('[data-navigate]');
      if (to) {
        navigate(to.dataset.navigate);
        return;
      }
      // Popover open: a click outside the popover / slot closes it
      if ((this._draft.selection || this._overrideSel) && !e.target.closest('.editor, .seg, .handle, .override')) {
        this._draft.selection = null;
        this._overrideSel = null;
        if (!e.target.closest('[data-act], .tab, .chip')) { this._render(); return; }
      }
      const dayName = e.target.closest('.day[data-day]');
      if (dayName && this._shown.length === 1 && this._historyOf(this._shown[0], Number(dayName.dataset.day))) {
        this._toggleZoom(this._shown[0], Number(dayName.dataset.day));
        return;
      }
      // A schedule's tab, or the active schedule's name in the bar: shows that schedule's weeks
      const tab = e.target.closest('.tab, [data-show-schedule]');
      if (tab) {
        this._schedule = tab.dataset.schedule || tab.dataset.showSchedule;
        this._schedEd = null;
        this._draft.selection = null;
        this._overrideSel = null;
        this._render();
        return;
      }
      // Click on an override: opens its popover
      const override = e.target.closest('.override');
      if (override) {
        if (e.target.closest('.override-handle') || Date.now() - this._overrideEnd.endedAt < 300) return;
        this._draft.selection = null;
        this._overrideSel = { climate: override.dataset.climate, day: Number(override.dataset.day) };
        this._render();
        return;
      }
      const chip = e.target.closest('.chip[data-climate]');
      if (chip) {
        const fresh = this._multiSel && this._multiFresh;
        this._multiFresh = false;
        this._toggleShown(chip.dataset.climate, !fresh && (this._multiSel || e.ctrlKey || e.metaKey || e.shiftKey));
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act) { if (!act.disabled) this._action(act.dataset.act, act.dataset, act); return; }

      // A tap on a slot, or on a handle: the handles are wider than a short slot (a quarter of
      // an hour, or two hours on a phone), so a tap that lands on one opens the slot under it
      const handle = e.target.closest('.handle');
      const seg = handle ? null : e.target.closest('.seg');
      if ((!seg && !handle) || Date.now() - this._slotDrag.slotMovedAt < 300 || Date.now() - this._slotDrag.handleMovedAt < 300) return;
      const bar = (seg || handle).parentElement;
      const climate = bar.dataset.climate;
      if (!this._mayEdit(climate)) return; // read-only weeks: a tap opens nothing
      const day = Number(bar.dataset.day);
      let idx = seg ? Number(seg.dataset.idx) : 0;
      let own = false;
      let minute = this._minuteAt(bar, e.clientX);
      if (handle) {
        const down = this._downAt;
        this._downAt = null;
        minute = this._minuteAt(bar, down && Date.now() - down.t < 1000 ? down.x : e.clientX);
        this._week(climate)[day].forEach((s, i) => { if (s.start <= minute) idx = i; });
        // A handle of the selected slot: the slot stays selected
        const edge = Number(handle.dataset.idx);
        own = !!this._draft.selection && this._draft.selection.climate === climate && this._draft.selection.day === day && (this._draft.selection.idx === edge || this._draft.selection.idx === edge - 1);
      }
      const t = Date.now();
      const lc = this._lastClick;
      this._lastClick = { climate, day, t, x: e.clientX };
      if (lc && lc.climate === climate && lc.day === day && t - lc.t < 400 && Math.abs(lc.x - e.clientX) < 10) {
        this._lastClick = null;
        // On a slot narrower than its two handles, the first tap selects the slot, and the
        // second one lands on a handle of the slot selected: it still cuts the slot. On a
        // wider slot, a double tap on its own handle does nothing, as before
        const segs = this._week(climate)[day];
        const width = ((idx < segs.length - 1 ? segs[idx + 1].start : DAY_MIN) - segs[idx].start) * (bar.getBoundingClientRect().width / DAY_MIN);
        const short = width > 0 && width <= 2 * HANDLE_WIDTH;
        if (!handle || !own || short) this._split(climate, day, minute, short);
        return;
      }
      if (own) return;
      const sel = this._draft.selection;
      if (!sel || sel.climate !== climate || sel.day !== day || sel.idx !== idx) {
        this._overrideSel = null;
        this._draft.selection = { climate, day, idx };
        this._focus = climate;
        this._render();
      }
    });

    // Enter in a schedule's name field confirms (Create / Rename)
    root.addEventListener('keydown', (e: any) => {
      if (e.key !== 'Enter' || !e.target.hasAttribute('data-sched-name')) return;
      const ok: any = root.querySelector('.sched-menu .btn.primary');
      if (ok) ok.click();
    });

    listenTimeFields(this, (el, next) => this._timeFieldDone(el, next));

    root.addEventListener('change', (e) => {
      const el: any = e.target;
      if (el.hasAttribute('data-override-temperature') && Number.isFinite(parseDecimal(el.value)) && this._overrideSel) {
        const c = this._overrideSel.climate;
        this._sendOverride(c, overrideWithTemperature(this._overrides()[c], this._source(), c, parseDecimal(el.value), this._hass));
      } else if (el.hasAttribute('data-slot-setting') && this._draft.selection) {
        const { climate, day, idx } = this._draft.selection;
        this._moreOpen = true;
        this._setSlotSetting(climate, day, idx, el.dataset.slotSetting, el.value || null);
      }
    });
    // "More settings" of a slot stays open or closed across redraws (toggle does not bubble). Not
    // the popover of a preset's value: the presets view places its own
    root.addEventListener('toggle', (e: any) => {
      if (!e.target.matches || !e.target.matches('.editor details.more') || e.target.closest('.cell-ed')) return;
      this._moreOpen = e.target.open;
      this._placeEditor(); // taller or shorter: it may no longer fit where it is
      // Opened by the user (a redraw opens it again too): what it holds comes into sight
      const tapped = this._moreTapped;
      this._moreTapped = false;
      const body = e.target.closest('.ed-body');
      if (!tapped || !e.target.open || !body) return;
      const below = e.target.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
      if (below > 0) body.scrollTop += Math.min(below, e.target.getBoundingClientRect().top - body.getBoundingClientRect().top);
    }, true);
    root.addEventListener('click', (e: any) => {
      if (e.target.closest && e.target.closest('.editor details.more > summary') && !e.target.closest('.cell-ed')) this._moreTapped = true;
    }, true);
  }

  // Shown when the viewed tab is not the active schedule: activate it from the card,
  // without a separate input_select card.
  _scheduleBar(active) {
    if (!this._schedule || this._schedule === active) return nothing;
    const t = this._loc.t;
    // The active schedule's name leads to it: its tab on a dashboard, its page in the panel
    const name = this._config.panel
      ? html`<span class="mi-link" role="link" tabindex="0" data-navigate=${panelPath(`schedules/${active}`)}>${this._scheduleName(active)}</span>`
      : html`<span class="mi-link" role="link" tabindex="0" data-show-schedule=${active}>${this._scheduleName(active)}</span>`;
    const current = active ? withLink(t('activeScheduleBar', { schedule: LINK_TOKEN }), html`<strong>${name}</strong>`) : t('noActiveSchedule');
    return html`<div class="schedule-bar">
      <span>${current}</span>
      <button class="btn small" data-act="activate-schedule">${t('activate', { schedule: this._scheduleName(this._schedule) })}</button>
    </div>`;
  }

  // The menus of the schedules' tabs: "+" and "⋮" (see schedule-menu.ts)
  _scheduleMenuHost(): ScheduleMenuHost {
    const card = this;
    return {
      hass: this._hass,
      loc: this._loc,
      src: this._source(),
      panel: !!this._config.panel,
      list: false,
      oneTab: this._config.schedule_tabs === 'one',
      get menu() { return card._schedEd; },
      set menu(menu) { card._schedEd = menu; },
      get error() { return card._schedErr; },
      set error(error) { card._schedErr = error; },
      get revision() { return card._draft.revision; },
      set revision(revision) { card._draft.revision = revision; },
      frame: () => this.shadowRoot.querySelector('ha-card'),
      draw: () => this._render(),
      save: async () => !this._draft.dirty || this._save(),
      created: (id) => { this._wantSchedule = id; },
      message: (text) => { this._msg = text; },
    };
  }

  // Schedule actions (canPlan): unsaved edits of the weeks are saved first
  _scheduleAction(act, ds, el) {
    return scheduleMenuAction(this._scheduleMenuHost(), act, ds, el, this._schedule);
  }

  _activateSchedule(schedule) {
    return activateSchedule(this._scheduleMenuHost(), schedule);
  }

  // Where a change comes from, for the logbook: the panel, or a card (none: older integrations)
  _changeSource() {
    return this._config.panel ? 'panel' : undefined;
  }

  // Temperature a preset gives a thermostat (presetTemperatureOf)
  _presetTemperature(climate, target) {
    return presetTemperatureOf(this._source(), climate, target);
  }

  // Temperature a preset gives a thermostat when it cools (coolPresetTemperatureOf)
  _coolPresetTemperature(climate, target) {
    return coolPresetTemperatureOf(this._source(), climate, target);
  }

  // What a preset means for a thermostat: its mapping (as computed by the integration), else
  // the default for a thermostat the integration does not know yet
  _targetOf(climate, preset) {
    return targetOf(this._source(), this._hass, climate, preset);
  }

  // On a dashboard, the card shows the weeks; the presets, the rules and the thermostats are set
  // in the Chauffage panel (canSetUp, as the panel). The legend of the presets ends with the
  // link to set them; the panel's tabs lead to the rest. In the panel, no link to the panel.
  // The card's top right: the Chauffage panel, for users who may set up (canSetUp), as the
  // dashboards' own panels
  _panelOpen() {
    if (this._config.panel) return nothing;
    const hass = this._hass;
    if (!this._source().editable) return nothing;
    const label = this._loc.t('openInPanel', { panel: panelTitle(hass) });
    return html`<button class="panel-open" data-navigate=${panelPath('')} title=${label} aria-label=${label}><ha-icon icon="chauffage:logo"></ha-icon></button>`;
  }

  // Opens HA's standard more-info dialog (same mechanism as the built-in tiles)
  _openMoreInfo(entityId) {
    openMoreInfo(this, entityId);
  }

  _moreInfoLink(climate) {
    return entityLink(climate, this._name(climate), this._loc.t('openThermostat'));
  }

  // Plain click: shows only this thermostat. "Plusieurs" mode or Ctrl/Shift+click: adds / removes it.
  _toggleShown(climate, additive) {
    const order = this._thermostats.map((t) => t.entity);
    if (!additive) {
      this._shown = [climate];
      this._focus = climate;
    } else if (this._shown.includes(climate)) {
      if (this._shown.length === 1) return;
      this._shown = this._shown.filter((c) => c !== climate);
    } else {
      this._shown = order.filter((c) => c === climate || this._shown.includes(c));
      this._focus = climate;
    }
    this._saveShown();
    this._render();
  }

  // Cuts the slot at a time of day: the piece from there to the slot's end is selected. `fit`: the cut is moved a step away from both ends of the
  // slot under the pointer, so a tap on a short slot, which a finger cannot aim within, cuts it
  // too. Otherwise a cut less than a step away from a slot's end is refused
  _split(climate, day, m, fit = false) {
    const segs = this._week(climate)[day];
    const step = this._config.step;
    if (!fit) m = this._snap(m);
    let idx = 0;
    segs.forEach((s, i) => { if (s.start <= m) idx = i; });
    const s = segs[idx];
    const end = idx < segs.length - 1 ? segs[idx + 1].start : DAY_MIN;
    // A slot of one step is not cut
    if (!Number.isFinite(m) || end - s.start < 2 * step) return;
    if (fit) m = Math.max(s.start + step, Math.min(end - step, this._snap(m)));
    if (m < s.start + step || m > end - step) return;
    // The piece is like the slot it is cut from: its preset, its HVAC mode, its fan and its
    // vanes. Its popover opens, and the user says what the piece is (see _settle)
    segs.splice(idx + 1, 0, { ...clone(s), start: m, cut: true });
    this._commit(climate, day, m);
  }

  // Every heating or cooling slot of a thermostat's week, in the schedule shown, set to heat or
  // to cool (the week's menu): an edit like the others, saved with Save. The other slots stay
  // as they are: heat/cool, dry, auto, fan only and off
  _setWeekHvac(climate, mode) {
    if (!slotModesOf(this._hass, climate).includes(mode)) return;
    const week = this._week(climate);
    const switched = (slot) => !hasNoPreset(slot) && slotModeOn(this._hass, climate, slot) !== 'heat_cool';
    for (let d = 0; d < 7; d += 1) {
      week[d] = joined(week[d].map((slot) => (switched(slot) ? slotOf(slot.start, slot.preset, { ...airSettings(slot), hvac_mode: mode }) : slot)));
    }
    this._draft.selection = null;
    this._focus = climate;
    this._draft.dirty = true;
    this._msg = this._loc.t('weekAllDone', { name: this._name(climate), mode: this._loc.t(mode === 'cool' ? 'slotCool' : 'slotHeat') });
    this._render();
  }

  // The selected slot changed (#91) into what `change` makes of it: off, fan only, a preset, an
  // HVAC mode. Each slot is independent: no other slot changes
  _changeSlot(climate, day, idx, change) {
    const segs = this._week(climate)[day];
    const s = segs && segs[idx];
    if (!s) return;
    const changed = change(s);
    // An HVAC mode the thermostat cannot follow is not kept on the slot the user changes
    segs[idx] = slotMode(changed) ? slotOn(this._hass, climate, changed) : changed;
    if (s.cut) segs[idx].cut = true; // still the piece the card cut
    // The preset the slot had before an HVAC mode without one: given back if the user comes
    // back to heat or cool while the popover is open
    this._trial = { climate, day, schedule: this._schedule, start: s.start, preset: s.preset || this._triedPreset(climate, day, s) };
    this._commit(climate, day, s.start);
  }

  _triedPreset(climate, day, slot) {
    const trial = this._trial;
    return trial && trial.climate === climate && trial.day === day && trial.schedule === this._schedule && trial.start === slot.start ? trial.preset : null;
  }

  // The presets a thermostat can use in an HVAC mode: those with a value for it there
  _presetsIn(climate, mode) {
    return this._presets().filter((l) => presetModes(this._targetOf(climate, l)).includes(mode)).map((l) => l.id);
  }

  // The selected slot set to an HVAC mode (the first row). Off, fan only, dry and auto have no
  // preset. Heat, cool and heat/cool keep the slot's preset when it has a value for that HVAC
  // mode. Else a preset that has one: the preset of the nearest slot on a preset, else eco,
  // else the first one, and rather one that keeps the slot apart from its neighbors. The HVAC
  // mode the slot already runs in on this thermostat changes nothing
  _setSlotMode(climate, day, idx, mode) {
    const segs = this._week(climate)[day];
    const s = segs && segs[idx];
    if (!s || !HVAC_ORDER.includes(mode)) return;
    if (NO_PRESET_MODES.includes(mode)) {
      if (slotMode(s) !== mode) this._changeSlot(climate, day, idx, (slot) => noPresetSlot(slot, mode));
      return;
    }
    if (!hasNoPreset(s) && slotModeOn(this._hass, climate, s) === mode) return;
    const offered = this._presetsIn(climate, mode);
    const made = (preset) => slotOf(s.start, preset, { ...airSettings(s), hvac_mode: mode });
    let preset = !hasNoPreset(s) && offered.includes(s.preset) ? s.preset : null;
    // The preset the slot had before the user tried an HVAC mode without one
    const tried = this._triedPreset(climate, day, s);
    if (!preset && offered.includes(tried)) preset = tried;
    if (!preset) {
      const near = [...segs.slice(0, idx).reverse(), ...segs.slice(idx + 1)].find((slot) => !hasNoPreset(slot));
      const candidates = [near && near.preset, 'eco', ...offered].filter((id) => offered.includes(id));
      const merges = (id) => [segs[idx - 1], segs[idx + 1]].some((n) => n && sameSlot(slotOn(this._hass, climate, n), made(id)));
      preset = candidates.find((id) => !merges(id)) || candidates[0];
    }
    if (!preset) return;
    this._changeSlot(climate, day, idx, () => made(preset));
  }

  // A fan or swing setting of the selected slot (#91, lot 3): a value, or null (the default)
  _setSlotSetting(climate, day, idx, attr, value) {
    const slot = (this._week(climate)[day] || [])[idx];
    // The value it already has: nothing to save
    if (!slot || ((slot.settings || {})[attr] || null) === (value || null)) return;
    this._changeSlot(climate, day, idx, (s) => {
      const next = { ...(s.settings || {}) };
      if (value) next[attr] = value; else delete next[attr];
      return withSettings(s, slotSettings(next));
    });
  }

  // A day's slots for another thermostat (#91): each slot as it runs there, without the fan and
  // the vanes it does not list. A slot without a preset whose HVAC mode it does not list (off,
  // fan only) is left out: the slot before it goes on. `dropped` names what was left out, in a
  // fixed order: "Cool", "Fan only", "Fan". An HVAC mode only added (a heater's day on an air
  // conditioner) is not something left out
  _adapted(segs, climate) {
    const { modes } = hvacModesOf(this._hass, climate);
    const options = settingOptionsOf(this._hass, climate);
    const left = new Set();
    const out = [];
    for (const { cut: _, ...s } of segs) {
      const mode = slotMode(s);
      if (hasNoPreset(s) && modes && !modes.includes(mode)) { left.add(MODE_LABELS[mode]); continue; }
      const settings = { ...(s.settings || {}) };
      for (const attr of SETTING_ATTRS) {
        if (attr in settings && !(options[attr] || []).includes(settings[attr])) { delete settings[attr]; left.add(SETTING_LABELS[attr]); }
      }
      const slot = slotOn(this._hass, climate, withSettings(s, slotSettings(settings)));
      if (mode && !hasNoPreset(s) && slotMode(slot) !== mode) left.add(MODE_LABELS[mode]);
      out.push(slot);
    }
    const order = ['slotHeat', 'slotCool', 'hvacHeatCool', 'hvacOff', 'hvacFan', 'hvacDry', 'hvacAuto', ...SETTING_ATTRS.map((attr) => SETTING_LABELS[attr])];
    return { segs: joined(out), dropped: order.filter((key) => left.has(key)) };
  }

  // A time typed in the slot editor (minutes), for the slot it was typed for (a tap outside the
  // card may have closed the editor meanwhile)
  _setEdge(edge, minutes, { climate, day, idx }) {
    const segs = this._week(climate)[day];
    if (!segs || !segs[idx]) return;
    const step = this._config.step;
    const endOf = (i) => (i < segs.length - 1 ? segs[i + 1].start : DAY_MIN);
    if (edge === 'start' && idx > 0) {
      const v = Math.min(endOf(idx) - step, this._snap(minutes));
      // A start typed onto the start of a slot before it, or earlier: that slot is removed,
      // instead of being left a step long. At 00:00, the slot is the first one of the day.
      // A time only rounded onto that start removes nothing: the slot starts a step later, as
      // far as a handle can be dragged
      let first = idx;
      while (first > 0 && segs[first - 1].start >= minutes) first -= 1;
      segs.splice(first, idx - first);
      segs[first].start = first === 0 ? 0 : Math.max(segs[first - 1].start + step, v);
      const start = segs[first].start;
      if (first < idx) joinAt(segs, first);
      this._commit(climate, day, start);
    } else if (edge === 'end' && idx < segs.length - 1) {
      // 24:00, or 00:00, is the end of the day
      const typed = minutes === 0 ? DAY_MIN : minutes;
      const v = Math.max(segs[idx].start + step, minutes === 0 ? DAY_MIN : this._snap(minutes));
      // An end typed onto the end of a slot after it, or later: that slot is removed. Not by
      // a time only rounded onto that end: the slot after it keeps a step
      const count = segs.length;
      while (idx + 1 < segs.length && endOf(idx + 1) <= typed) segs.splice(idx + 1, 1);
      if (idx + 1 < segs.length) segs[idx + 1].start = Math.min(v, endOf(idx + 1) - step);
      if (segs.length < count) joinAt(segs, idx + 1);
      this._commit(climate, day, segs[idx].start);
    }
  }

  _copyDay(climate, day, target) {
    const src = this._week(climate)[day];
    const dropped = [];
    if (target === 'others') {
      // Not to a thermostat whose week the user may not edit (a thermostat not scheduled, with Plan)
      this._shown.filter((c) => c !== climate && this._mayEdit(c)).forEach((c) => {
        const fit = this._adapted(clone(src), c);
        dropped.push(...fit.dropped);
        this._week(c)[day] = fit.segs;
        this._spread(c, day);
      });
    } else {
      const targets = { weekdays: [0, 1, 2, 3, 4], weekend: [5, 6], all: [0, 1, 2, 3, 4, 5, 6] }[target];
      if (!targets) return;
      const week = this._week(climate);
      targets.filter((t) => t !== day).forEach((t) => { week[t] = copyOfDay(src); });
    }
    const destination = this._loc.destination(target);
    this._focus = climate;
    this._draft.dirty = true;
    this._msg = this._loc.t('dayCopiedTo', { name: this._name(climate), day: this._rowLabel(day, 'long'), destination }) + this._droppedText(dropped);
    this._render();
  }

  // " · left out: Cool, Fan only", after a copy to a thermostat that cannot follow every slot
  // (#91): what `_adapted` left out, each named once
  _droppedText(dropped) {
    const names = [...new Set(dropped)].map((key) => this._loc.t(key));
    return names.length ? ` · ${this._loc.t('slotsLeftOut', { list: names.join(', ') })}` : '';
  }

  _copyWeek(value) {
    if (!value) return;
    const [climate, schedule] = value.split('|');
    const source = this._focusClimate();
    const dropped = [];
    const week = clone(this._week(source)).map((segs) => {
      const fit = this._adapted(segs, climate);
      dropped.push(...fit.dropped);
      return fit.segs;
    });
    this._draft.setWeek(climate, schedule, week);
    this._msg = this._loc.t('weekCopiedTo', { source: this._name(source), target: this._name(climate), schedule: this._scheduleName(schedule) })
      + this._droppedText(dropped);
    this._render();
  }

  // A week copied from another card (a thermostat's sheet in the panel): this card's schedule
  // gets it, unsaved, and this card's save bar asks to save it
  _receiveWeek(climate, week, sourceName) {
    const dropped = [];
    this._draft.setWeek(climate, this._schedule, clone(week).map((segs) => {
      const fit = this._adapted(segs, climate);
      dropped.push(...fit.dropped);
      return fit.segs;
    }));
    this._msg = this._loc.t('weekCopiedFrom', { schedule: sourceName }) + this._droppedText(dropped);
    this._render();
  }

  _copyToClipboard(climate, day) {
    const segs = copyOfDay(this._week(climate)[day]);
    const label = `${this._name(climate)} · ${this._rowLabel(day, 'long')} (${this._scheduleName(this._schedule)})`;
    const clip = { segs, label, src: { climate, schedule: this._schedule, day } };
    this._draft.copy(clip);
    // Also copies as text to the system clipboard (when the browser allows it)
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(`${label} : ${serializeDay(segs).join(', ')}`).catch(() => {});
    } catch (e) { /* ignore */ }
    this._msg = this._loc.t('copied', { label });
    this._render();
  }

  _pasteFromClipboard(climate, day) {
    if (!this._draft.clip) return;
    const fit = this._adapted(clone(this._draft.clip.segs), climate);
    this._week(climate)[day] = fit.segs;
    this._spread(climate, day);
    if (this._draft.selection && this._draft.selection.climate === climate && this._draft.selection.day === day) this._draft.selection = null;
    this._focus = climate;
    this._draft.dirty = true;
    this._msg = this._loc.t('pastedOn', { name: this._name(climate), day: this._rowLabel(day, 'long') }) + this._droppedText(fit.dropped);
    this._render();
  }

  _action(act, ds, el) {
    // What edits the weeks or the schedules needs Plan (canPlan), on a thermostat the user may edit
    const editsWeeks = ['copyweek-menu', 'copy-week', 'copy-day', 'paste-day', 'preset', 'slot-off', 'slot-mode', 'week-hvac', 'insert', 'delete'].includes(act)
      || act.startsWith('fill-') || (act.startsWith('schedule-') && act !== 'schedule-close');
    if (editsWeeks && !(this._source().plannable && (!ds.climate || this._mayEdit(ds.climate)))) return undefined;
    if (act === 'copyweek-menu') {
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      // On the side of the button with more room in the window, no taller than that room
      const below = window.innerHeight - b.bottom;
      const right = card.right - b.right;
      this._copyWeekMenu = this._copyWeekMenu ? null : below > b.top
        ? { top: b.bottom - card.top + 4, right, maxHeight: below - 16 }
        : { bottom: card.bottom - b.top + 4, right, maxHeight: b.top - 16 };
      return this._render();
    }
    if (act === 'copy-week') {
      this._copyWeekMenu = null;
      return this._copyWeek(`${ds.climate}|${ds.schedule}`);
    }
    if (act === 'menu') {
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return this._openMenu(ds.climate, Number(ds.day), b.bottom - card.top + 4, card.right - b.right, b.top - card.top - 4);
    }
    this._menu = null;
    if (act.startsWith('schedule-')) return this._scheduleAction(act, ds, el);
    if (act.startsWith('fill-')) return this._copyDay(ds.climate, Number(ds.day), act.slice(5));
    if (act === 'week-hvac') return this._setWeekHvac(ds.climate, ds.mode);
    if (act === 'resume') return this._setPaused(ds.climate, false);
    if (act === 'override-new') { // today's row menu: set a temporary setpoint
      this._draft.selection = null;
      this._overrideSel = { climate: ds.climate, create: true };
      return this._render();
    }
    if (act.startsWith('override-')) {
      const c = this._overrideSel && this._overrideSel.climate;
      const d = c && this._overrides()[c];
      if (act === 'override-step' && c) return stepOverrideTemperature(el, this._hass, c, this._loc);
      // Without an override, a preset or an HVAC mode sets one: the rest closes the popover
      const sets = ['override-preset', 'override-off', 'override-mode'].includes(act);
      if (act === 'override-close' || !c || (!d && !sets)) { this._overrideSel = null; return this._render(); }
      if (act === 'override-add') return this._setOverrideEnd(c, endMovedBy(d.end, Number(ds.min)));
      const changed = nextOverride(act, ds, d, this._source(), c, this._hass);
      return changed && this._sendOverride(c, changed === RESUME ? null : changed);
    }
    if (act === 'reload-page') return this._reloadPage();
    if (act === 'save') return this._save();
    if (act === 'cancel') return this._discard();
    if (act === 'copy-day') return this._copyToClipboard(ds.climate, Number(ds.day));
    if (act === 'paste-day') return this._pasteFromClipboard(ds.climate, Number(ds.day));
    if (act === 'activate-schedule') {
      if (this._schedEd) {
        this._schedEd = null; // from a schedule's ⋮ menu: closed at once, as after every action
        this._render();
      }
      return this._activateSchedule(ds.schedule || this._schedule);
    }
    if (act === 'multi-sel') {
      this._multiSel = !this._multiSel;
      // Turned on while every room is shown: the first room tapped starts the choice, the next
      // ones add to it. Removing rooms one by one from all of them is not what "several" asks
      this._multiFresh = this._multiSel && this._shown.length === this._thermostats.length && this._thermostats.length > 1;
      return this._render();
    }
    if (act === 'history') return this._toggleHistory();
    if (act === 'group-days') {
      // The history shows each day: grouping the days hides it
      this._groupPref = !this._grouped();
      saveGroupPreference(this._groupPref);
      this._draft.selection = null;
      return this._history.shown ? this._toggleHistory() : this._render();
    }
    if (act === 'zoom') return this._toggleZoom(ds.climate, Number(ds.day));
    if (act === 'show-all') {
      this._shown = this._thermostats.map((t) => t.entity);
      this._saveShown();
      return this._render();
    }
    if (!this._draft.selection) return;
    const { climate, day, idx } = this._draft.selection;
    const segs = this._week(climate)[day];
    const s = segs[idx];
    const step = this._config.step;
    if (act === 'close') {
      this._draft.selection = null;
      this._render();
    } else if (act === 'preset') {
      // A preset: the slot keeps its fan and vanes, and its heat or cool. The popover of an
      // air conditioner's off or fan-only slot offers no preset: such a slot never has one
      this._changeSlot(climate, day, idx, (slot) => slotOf(slot.start, ds.preset, pieceSettings(slot)));
    } else if (act === 'slot-off' || act === 'slot-mode') {
      this._setSlotMode(climate, day, idx, act === 'slot-off' ? 'off' : ds.mode);
    } else if (act === 'insert') {
      const end = idx < segs.length - 1 ? segs[idx + 1].start : DAY_MIN;
      // A slot too short for a slot in its middle is cut in two
      if (end - s.start < 3 * step) return this._split(climate, day, s.start + (end - s.start) / 2, true);
      const m1 = this._snap(s.start + (end - s.start) / 3);
      const m2 = this._snap(s.start + (2 * (end - s.start)) / 3);
      if (m1 <= s.start || m2 >= end || m2 <= m1 || m1 - s.start < step) return;
      // The piece in the middle is like the slot, selected: the user says what it is
      segs.splice(idx + 1, 0, { ...clone(s), start: m1, cut: true }, { ...clone(s), start: m2, cut: true });
      this._commit(climate, day, m1);
    } else if (act === 'delete') {
      if (segs.length === 1) return;
      if (idx > 0) { segs.splice(idx, 1); joinAt(segs, idx); }
      else { segs.splice(0, 1); segs[0].start = 0; }
      this._draft.selection = null;
      this._commit(climate, day, null);
    }
  }
}
