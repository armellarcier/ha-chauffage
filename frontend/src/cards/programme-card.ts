import { bindReload, noticeHtml, reloadPage, sourceNotice } from '../notices.ts';
import { dataSource, renamedTo } from '../client/snapshot.ts';
import { commands } from '../client/commands.ts';
import { client } from '../client/chauffage-client.ts';
import { groupPreference, historyPreference, saveGroupPreference, saveHistoryPreference, saveShownPreference, shownPreference } from '../state/preferences.ts';
import { WeekDraft } from '../state/week-draft.ts';
import { chipStyle, coolColor, derivedCoolColor, presetColorIn, slotColor } from '../colors.ts';
import { airSettings, clone, DAY_MIN, errorText, esc, hasNoPreset, HVAC_ORDER, ICON_COPY, ICON_MORE, ICON_OPEN, ICON_PASTE, ICON_ZOOM, isAdmin, isFan, isOff, MANUAL_PRESETS, minutesOf, NEW_DAY, NO_PRESET_MODES, noPresetSlot, nowMin, parseDate, pct, pieceSettings, plainRule, sameSlot, SETPOINT_MODES, SETTING_ATTRS, slotMode, slotOf, slotSettings, thermostatName, todayIdx, withSettings } from '../common.ts';
import { atMinutes, causeText, endMovedBy, endOfField, linksByKeyboard, listenTimeFields, timeField, timeFieldDone } from '../fields.ts';
import { HISTORY_DAYS, HISTORY_MAX_AGE, MEASURE_RAMP, RECORDER_DELAY, SETPOINT_MARGIN, curveValue, historyDays, mergeRows, rowsOfStates } from '../history.ts';
import { MODE_LABELS, OFF_COLOR, SETTING_LABELS, captureButtonHtml, captureState, coolsOnly, dayOn, defaultSetpointMode, fullNames, hasModeRow, hvacIcon, hvacIconHtml, hvacModesOf, hvacSlotStyle, isReversible, listsMode, modeName, moreSettingsHtml, ownPresetName, parseDecimal, presetModes, rowsOfDays, settingOptionsOf, settingsText, slotModeOn, slotModesOf, slotOn, stateOf, valueOn } from '../hvac.ts';
import { makeLocale } from '../i18n/locale.ts';
import { LINK_TOKEN, deviceLabel, deviceLinkHtml, deviceOf, entityLinkHtml, inRowActions, navigate, openDevice, openMoreInfo, openPanel, panelPath, panelTitle, placements, placesHtml, thRow, thermostatDevices, weeksPath, withHtml } from '../links.ts';
import { OVERRIDE_TEMPERATURE, RESUME, coolPresetTemperatureOf, fillCard, focusedField, nextOverride, overrideBodyHtml, overrideNamedMode, overrideSummary, overrideUntilText, overrideWithTemperature, presetTemperatureOf, restoreTyped, setpointLineHtml, slotName, slotSetpointText, stepOverrideTemperature, withoutAir } from '../override-edit.ts';
import { overrideLabel, overridePieces, rowPiece, tagSide } from '../override.ts';
import { fitTemperature, modeChipHtml, modeRowHtml, offChipHtml, presetOf, presetsOf, sortedPresets, stepOf, stepperHtml } from '../presets.ts';
import { INTEGRATION_PAGE, fromSettings, openSettings } from '../settings-dialog.ts';
import { copyOfDay, joinAt, joined, normalize, parseDay, parseSlot, serializeDay } from '../slots.ts';
import { STYLE } from '../styles.ts';
import { VERSION } from '../version.ts';

// What Home Assistant reads as true or false in a template's text (any other text is false)
const BOOLEAN_WORDS = ['true', 'false', 'on', 'off', 'yes', 'no', '1', '0', 'enable', 'disable'];
// The card's options that only the Chauffage panel sets, for its pages: a page shows one view, a
// thermostat's sheet stacks its weeks without their chips, tabs or foot, and saves them together
const PANEL_OPTIONS = ['panel', 'view', 'schedule', 'schedule_tabs', 'week_only', 'flat', 'preset_definitions', 'history'];

// The width of a slot's handle, in pixels (see the style of .handle)
const HANDLE_WIDTH = 18;
// How far a finger moves sideways before it moves a time or a slot (#67), in pixels
const TOUCH_SLOP = 8;

export class ChauffageProgrammeCard extends HTMLElement {
  // The fields of the element, untyped until the rewrite of the card gives them a type
  declare _accessStamp: any;
  declare _asideKey: any;
  declare _available: any;
  declare _bodyScroll: any;
  declare _cell: any;
  declare _cellError: any;
  declare _config: any;
  declare _configured: any;
  declare _copyWeekMenu: any;
  declare _dirtyTold: any;
  declare _draft: WeekDraft;
  declare _downAt: any;
  declare _drag: any;
  declare _focus: any;
  declare _forgetAsk: any;
  declare _groupPref: any;
  declare _handleMoved: any;
  declare _hass: any;
  declare _history: any;
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
  declare _overrideDrag: any;
  declare _overrideDragEnded: any;
  declare _overridePending: any;
  declare _overrideSel: any;
  declare _overrideStamp: any;
  declare _placeToken: any;
  declare _placedKey: any;
  declare _placements: any;
  declare _preview: any;
  declare _previewDelay: any;
  declare _previewKey: any;
  declare _previewSub: any;
  declare _previewTimer: any;
  declare _previewed: any;
  declare _readTouch: any;
  declare _redrawLater: any;
  declare _renderedDay: any;
  declare _rows: any;
  declare _rulesDraft: any;
  declare _rulesStamp: any;
  declare _schedEd: any;
  declare _schedErr: any;
  declare _schedule: any;
  declare _scheduleState: any;
  declare _sel: any;
  declare _shown: any;
  declare _shownForPreview: any;
  declare _slotMoved: any;
  declare _stamp: any;
  declare _tableLeft: any;
  declare _tabsShown: any;
  declare _tabsWait: any;
  declare _targetShown: any;
  declare _thMore: any;
  declare _thermostats: any;
  declare _thermostatsStamp: any;
  declare _timer: any;
  declare _trial: any;
  declare _unlisten: any;
  declare _view: any;
  declare _wantSchedule: any;
  declare _zoom: any;

  // Tells the panel which version of the card the page defined first (cards before 0.8.1: none)
  static get version() {
    return VERSION;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    linksByKeyboard(this.shadowRoot);
    this._draft = new WeekDraft(); // the weeks edited, until saved
    this._sel = null; // { climate, day, idx }
    this._focus = null; // last thermostat used (source of "Copier la semaine")
    this._drag = null;
    this._stamp = undefined;
    this._msg = '';
    this._rulesDraft = null; // activation rules being edited ({ rules, def })
    this._previewDelay = 400; // ms of pause in the typing before a rule is tried
    this._preview = null; // last try of the rules shown ({ rules, data })
    this._lastClick = null;
    this._renderedDay = null;
    this._menu = null; // { climate, day, top, right } open row menu
    this._multiSel = false; // "Plusieurs" mode: clicking a thermostat adds / removes it
    // Overrides (temporary setpoints): sent to HA right away, without "Enregistrer"
    this._overrideSel = null; // { climate, day } override whose popover is open
    this._overrideDrag = null;
    this._overridePending = {}; // changes sent, waiting for the integration's update
    this._overrideStamp = undefined;
    // Measured temperature of the last 7 days, drawn over the bars: rows loaded (until a time), days drawn
    this._zoom = null; // { climate, day } shown larger (with the history)
    this._readTouch = false; // a finger reads the values along the bar shown larger
    this._history = { shown: false, rows: null, until: 0, days: null, loadedAt: 0, day: null, loading: false };
    // Identical days shown on one row (the user's choice on this device, else the card's option)
    this._groupPref = null;
    this._rows = null; // rows of days drawn last, each edited as a whole
    this._history.shown = historyPreference();
    this._groupPref = groupPreference();
    this._bindEvents();
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
    if ((stamp !== this._stamp) && !this._draft.dirty && !this._drag) {
      this._load();
      this._stamp = stamp;
      need = true;
    }
    const dstamp = src.stamps.overrides;
    if (dstamp !== this._overrideStamp && !this._overrideDrag && !this._drag) {
      this._overrideStamp = dstamp;
      this._overridePending = {};
      need = true;
    }
    // Active schedule changed (from the card, another dashboard or an automation), or the icon of a
    // schedule chosen in Home Assistant: redraw the active-schedule marker, the tabs and the
    // "activate" bar
    const scheduleStamp = src.stamps.schedule;
    if (scheduleStamp !== this._scheduleState && !this._drag && !this._overrideDrag) {
      this._scheduleState = scheduleStamp;
      need = true;
    }
    // A thermostat paused or resumed (switch, another card): redraw its notice and rows
    if (src.stamps.thermostats !== this._thermostatsStamp && !this._drag && !this._overrideDrag) {
      this._thermostatsStamp = src.stamps.thermostats;
      need = true;
    }
    // An entity the card opens renamed, or a thermostat given another device: redraw its links
    const links = `${src.stamps.entities} ${this._thermostats.map((t) => deviceOf(hass, t.entity)).join(' ')}`;
    if (links !== this._linksStamp && !this._drag && !this._overrideDrag) {
      this._linksStamp = links;
      need = true;
    }
    // The access level changed (#99): the tools appear or go at once. Without Plan, what was being
    // edited closes; the weeks not saved yet stay until Cancel
    if (src.stamps.access !== this._accessStamp) {
      this._accessStamp = src.stamps.access;
      if (this._drag && !this._mayEdit(this._drag.climate)) this._cancelDrag();
      if (this._sel && !this._mayEdit(this._sel.climate)) this._sel = null;
      if (!src.plannable) {
        this._schedEd = null;
        this._copyWeekMenu = null;
      }
      need = true;
    }
    // Activation rules changed, or one became true or false: redraw the "Rules" view
    if (src.stamps.rules !== this._rulesStamp) {
      this._rulesStamp = src.stamps.rules;
      if (this._view === 'rules') need = true;
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
    else this._updateLive();
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
    this._previewChanged();
    this._timer = setInterval(() => {
      if (this._drag || this._overrideDrag) return;
      this._refreshHistory();
      // Full redraw on a new day or during an override (it moves with the time)
      if (this._renderedDay !== todayIdx() || Object.keys(this._overrides()).length) this._render();
      else this._updateLive();
    }, 30000);
    // Closes the row menu / popovers on a click outside the card or the Escape key
    const closePopups = () => {
      if (!this._menu && !this._sel && !this._overrideSel && !this._schedEd && !this._cell && !this._thMore && !this._copyWeekMenu) return;
      this._menu = null;
      this._copyWeekMenu = null;
      this._thMore = null;
      this._forgetAsk = null;
      this._cell = null;
      this._schedEd = null;
      this._sel = null;
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
    clearInterval(this._timer);
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
    clearTimeout(this._previewTimer);
    this._closePreview();
    this._previewKey = null;
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
    for (const ref of [this._sel, this._menu]) if (ref) ref.day = this._rowOf(ref.day)[0];
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
    const sel = this._sel;
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
      this._sel = { climate, day, idx };
    }
    this._focus = climate;
    this._draft.dirty = true;
    this._msg = '';
    this._render();
  }

  // ---------- overrides ----------

  _overrides() {
    const raw = this._hass ? this._source().overrides() : {};
    const out = raw && typeof raw === 'object' ? { ...raw } : {};
    for (const [c, d] of Object.entries(this._overridePending)) {
      if (d) out[c] = d;
      else delete out[c];
    }
    const now = new Date();
    for (const [c, d] of Object.entries(out)) {
      if (!d || !(parseDate((d as any).end) > now)) delete out[c];
    }
    return out;
  }

  _overridePieces(climate) {
    return overridePieces(this._overrides()[climate]);
  }

  _overrideLabel(d) {
    return overrideLabel(d, this._loc, this._presets());
  }

  async _sendOverride(climate, override) {
    override = withoutAir(override);
    this._overridePending[climate] = override;
    if (!override) this._overrideSel = null;
    this._render();
    try {
      await this._commands().setOverride(climate, override, this._changeSource());
    } catch (e) {
      delete this._overridePending[climate];
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

  // A drag abandoned (a scroll, #67): its slots go back to where they were, nothing to save
  _cancelDrag() {
    const d = this._drag;
    if (!d) return;
    this._drag = null;
    const segs = this._week(d.climate)[d.day];
    d.orig.forEach((start, i) => { if (segs[i]) segs[i].start = start; });
    this._layoutBar(d.bar, segs);
    d.bar.querySelectorAll('.handle.drag').forEach((el) => el.classList.remove('drag'));
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

  _updateLive() {
    const root = this.shadowRoot;
    root.querySelectorAll('.chip[data-climate] .live').forEach((el) => {
      el.textContent = this._chipMark(el.parentElement.dataset.climate);
    });
    root.querySelectorAll('.now').forEach((el: any) => { el.style.left = `${pct(nowMin())}%`; });
    // The override field that shows the thermostat's setpoint follows it (not while typed in)
    const input: any = root.querySelector('.override-ed input[data-live]');
    if (input && root.activeElement !== input) {
      const st = this._hass.states[this._overrideSel.climate];
      const temperature = st && st.attributes.temperature;
      input.value = temperature != null ? this._loc.number(temperature) : '';
    }
  }

  // ---------- history of the measured temperature ----------

  // Loads the last 7 days from the recorder while the history is shown: at once when asked
  // (`force`), on a new day, otherwise once it is older than 5 minutes
  _refreshHistory(force = false) {
    const h = this._history;
    if (!h.shown || h.loading || !this._hass || !this._config) return;
    if (!force && h.day === todayIdx() && Date.now() - h.loadedAt < HISTORY_MAX_AGE) return;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (HISTORY_DAYS - 1));
    // Once loaded, only what is new (from a minute before the last load)
    const since = h.rows ? new Date(Math.max(start.getTime(), h.until - RECORDER_DELAY)) : start;
    h.loading = true;
    h.loadedAt = Date.now();
    h.day = todayIdx();
    if (!h.days) this._render(); // the button shows the loading
    return this._fetchHistory(since, now)
      .then((rows) => {
        h.rows = mergeRows(h.rows, rows, since.getTime() / 1000, start.getTime() / 1000);
        h.until = now.getTime();
        h.days = historyDays(h.rows, now);
      })
      .catch((e) => { this._msg = this._loc.t('historyUnavailable', { message: (e && e.message) || e }); })
      .then(() => {
        h.loading = false;
        if (h.shown && !this._drag && !this._overrideDrag) this._render();
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
    this._sel = null;
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
    const h = this._history;
    return h.shown && h.days && h.days[climate] ? h.days[climate][day] : null;
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

  // Measured temperature and setpoint applied (over it); a setpoint far from the measured
  // temperatures (frost protection at night…) stays on the edge of the bar
  _historyHtml(climate, day) {
    const hd = this._historyOf(climate, day);
    if (!hd || !hd.current.length) return '';
    const scale = this._historyScale(climate, day);
    const y = (v) => scale.y(v).toFixed(1);
    const steps = (lines) => lines.map((l) => l.map(([m, v], i) => {
      if (!i) return `M${m} ${y(v)}`;
      return y(v) === y(l[i - 1][1]) ? `H${m}` : `H${m} V${y(v)}`;
    }).join(' ')).join(' ');
    // Measured: straight lines between the values, held flat until MEASURE_RAMP minutes before a
    // change (the rows only come when the value changes: no slope over hours)
    const measured = hd.current.map((l) => l.flatMap(([m, v], i) => {
      if (!i) return [`M${m} ${y(v)}`];
      const [m0, v0] = l[i - 1];
      const hold = v !== v0 && m - m0 > MEASURE_RAMP ? [`L${m - MEASURE_RAMP} ${y(v0)}`] : [];
      return [...hold, `L${m} ${y(v)}`];
    }).join(' ')).join(' ');
    const target = steps(hd.target);
    // Two layers: only the setpoint has a shadow
    const layer = (cls, path) => `<svg class="history${cls}" viewBox="0 0 ${DAY_MIN} 100" preserveAspectRatio="none" aria-hidden="true">${path}</svg>`;
    return layer('', `<path class="measured" d="${measured}"/>`)
      + (target ? layer(' setpoint', `<path class="target" d="${target}"/>`) : '')
      + (this._isZoomed(climate, day) ? this._zoomHtml(scale) : '');
  }

  // A day shown larger: a scale in degrees (a line every 1, 2 or 5°), and the readout of the values
  // under the mouse or the finger
  _zoomHtml({ lo, hi, y }) {
    const step = hi - lo <= 6 ? 1 : hi - lo <= 12 ? 2 : 5;
    const marks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) marks.push(v);
    const axis = marks.map((v) => `<i style="top:${y(v).toFixed(1)}%"></i><span style="top:${y(v).toFixed(1)}%">${this._loc.number(v)}°</span>`).join('');
    return `<div class="yaxis">${axis}</div><div class="cross" hidden></div><div class="readout" hidden></div>`;
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

  // The HVAC modes without a preset in the legend, after the presets ("Off", "Fan only", "Dry",
  // "Auto"): each only when a shown week has such a slot
  _legendOffHtml() {
    const has = (mode) => this._shown.some((climate) => this._week(climate).some((segs) => segs.some((s) => slotMode(s) === mode)));
    return NO_PRESET_MODES.filter(has).map((mode) => {
      const swatch = mode === 'fan_only' ? '<i class="fan"></i>' : `<i style="${hvacSlotStyle(mode)}"></i>`;
      return `<span class="legend-off${mode === 'fan_only' ? ' legend-fan' : ''}">${swatch}${hvacIcon(mode)}${esc(mode === 'off' ? this._loc.t('legendOff') : modeName(this._loc, mode))}</span>`;
    }).join('');
  }

  // Heat/cool in the legend, when a week shown has such a slot: the two colors of its preset,
  // split as in the week
  _legendHeatCoolHtml() {
    for (const climate of this._shown) {
      const slot = this._week(climate).flat().find((s) => slotModeOn(this._hass, climate, s) === 'heat_cool');
      if (slot) {
        return `<span class="legend-mode legend-heat-cool"><i style="background:${presetColorIn(this._preset(slot.preset), 'heat_cool')}"></i>${hvacIcon('heat_cool')}${esc(modeName(this._loc, 'heat_cool'))}</span>`;
      }
    }
    return '';
  }

  // The HVAC modes a shown thermostat can use a preset in: the legend lists a preset only with
  // the colors it can have in the weeks shown
  _legendModes(preset) {
    const modes = new Set();
    for (const climate of this._shown) for (const mode of presetModes(this._targetOf(climate, preset))) modes.add(mode);
    return modes;
  }

  // Whether a shown thermostat cools: the legend then shows each preset's cool color too
  _showsCool() {
    return this._shown.some((climate) => listsMode(this._hass, climate, 'cool'));
  }

  _segInner(start, end, s) {
    const dur = end - start;
    const compact = this._shown.length > 1;
    const wide = this._loc.hour12 ? 25 : 0; // "6:30 AM" needs more room than "06:30"
    const forTime = (compact ? 60 : 75) + wide;
    const forLabel = (compact ? 180 : 150) + wide;
    // On an off slot and a fan-only slot, the word wins over the time: a phone has no tooltip
    // to say what the color means. Too narrow for the word, the icon alone, larger
    // A heat/cool slot too: its two colors are no preset's color, so its name says which one
    const off = hasNoPreset(s) || slotMode(s) === 'heat_cool';
    const t = dur >= (off ? forLabel : forTime) ? this._loc.time(start) : '';
    const l = dur >= (off ? forTime : forLabel) ? esc(this._slotLabel(s)) : '';
    // Markers on the time's line, kept even in a narrow segment, so a slot's settings are never
    // invisible: the icon of the slot's HVAC mode ("00:00 ⏻", a fan, a snowflake, a flame), then
    // a mark when the slot sets the fan or the vanes; the name goes on the next line in a tall bar
    const tuned = Object.keys(airSettings(s)).length ? '<ha-icon class="air" icon="mdi:tune-variant"></ha-icon>' : '';
    const marker = `${hvacIcon(slotMode(s))}${tuned}`;
    return `<span class="t${marker && !t && !l ? ' alone' : ''}">${t}${marker}</span><span class="l">${l}</span>`;
  }

  _barHtml(climate, stored, days, showNow) {
    const d = days[0];
    const segs = dayOn(this._hass, climate, stored); // an air conditioner's slots heat or cool
    const editable = this._mayEdit(climate); // read-only: no handle, no slot to move
    const segHtml = segs
      .map((s, i) => {
        const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
        const off = isOff(s);
        const fan = isFan(s);
        const none = hasNoPreset(s);
        const sel = this._sel && this._sel.climate === climate && this._sel.day === d && this._sel.idx === i;
        const cls = ['seg', sel ? 'sel' : '', i === 0 ? 'first' : '', i === segs.length - 1 ? 'last' : '',
          editable && i > 0 && i < segs.length - 1 ? 'movable' : '', off ? 'off' : '', fan ? 'fan' : '',
          s.settings ? 'marked' : '', none || slotMode(s) === 'heat_cool' ? 'word' : ''].join(' ');
        // An off slot is grey; a fan-only, a dry and an auto slot have Home Assistant's color of
        // their HVAC mode; a cooling slot its preset's cool color, a heat/cool slot both colors.
        // The title names the slot, its HVAC mode, and the fan and the vanes it sets
        const background = off ? `background:${OFF_COLOR}` : fan ? '' : none ? hvacSlotStyle(slotMode(s)) : `background:${slotColor(this._preset(s.preset), s)}`;
        const mode = none || !slotMode(s) ? '' : modeName(this._loc, slotMode(s));
        const air = settingsText(this._hass, climate, this._loc, s.settings);
        const what = [this._slotLabel(s), mode, air].filter(Boolean).join(' · ');
        const label = `${this._name(climate)} · ${this._loc.time(s.start)} → ${this._loc.time(end)} · ${what}`;
        return `<div class="${cls}" data-idx="${i}" style="left:${pct(s.start)}%;width:${pct(end - s.start)}%;${background}" title="${esc(label)}${esc(this._measuredText(climate, d, s.start, end))}" aria-label="${esc(label)}">${this._segInner(s.start, end, s)}</div>`;
      })
      .join('');
    const handles = !editable ? '' : segs
      .slice(1)
      .map((s, j) => `<div class="handle${sameSlot(segs[j], s) ? ' same' : ''}" data-idx="${j + 1}" style="left:${pct(s.start)}%"><span class="tip">${this._loc.time(s.start)}</span></div>`)
      .join('');
    const unscheduled = this._unscheduled(climate) ? ' unscheduled' : '';
    const paused = this._source().paused(climate);
    const now = showNow && !paused ? `<div class="now" style="left:${pct(nowMin())}%"></div>` : '';
    // The day copied last stands out, in whatever card it was copied (the copy is shared)
    const clip = this._draft.clip;
    const cs = clip && clip.src;
    const isSrc = cs && cs.climate === climate && cs.schedule === this._schedule && days.includes(cs.day);
    const history = this._historyHtml(climate, d);
    const zoom = this._isZoomed(climate, d) ? ' zoom' : '';
    return `<div class="bar${isSrc ? ' clipsrc' : ''}${editable ? '' : ' ro'}${zoom}${paused ? ' paused' : ''}${unscheduled}" data-climate="${esc(climate)}" data-day="${d}">${segHtml}${handles}${history}${this._overrideHtml(climate, days)}${now}</div>`;
  }

  // Override drawn over the schedule (only in the active schedule's tab), on a row of days
  _overrideHtml(climate, days) {
    if (this._schedule !== this._activeSchedule()) return '';
    const d = this._overrides()[climate];
    const piece = rowPiece(this._overridePieces(climate), days);
    if (!d || !piece) return '';
    const end = parseDate(d.end);
    const endHM = this._loc.time(minutesOf(end));
    const src = this._source();
    // One format, inside the block or next to it: the icon of its HVAC mode, an arrow, its end
    // ("⏱ ⏻ → 17:00"), with the day when the end is not today ("→ sat. 08:00"). The tooltip is
    // a sentence: "Cool · Comfort 25° until 23:00, then Heat · Eco"
    const now = new Date();
    const away = Math.round((+new Date(end.getFullYear(), end.getMonth(), end.getDate()) - +new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const dated = away !== 0;
    const day = !dated ? '' : `${away >= 7 || away < 0 ? this._loc.dateShort(end) : this._loc.dayShort(end)} `;
    const mode = (d.target || {}).hvac_mode || overrideNamedMode(d, src, climate, this._hass);
    const what = `${hvacIcon(mode)} → ${esc(day)}${endHM}`;
    const sentence = `${overrideSummary(d, src, climate, this._loc, this._hass)} ${overrideUntilText(d, src, climate, this._loc, this._hass)}`;
    const sel = this._overrideSel && this._overrideSel.climate === climate && this._overrideSel.day === piece.day;
    // The label inside the block. A block narrower than its label (the stylesheet measures it)
    // keeps "⏱" alone; where the override ends, the label goes next to the block instead, as a
    // tag, on the side with room (_placeTags). A phone has no tooltip
    return `<div class="override${sel ? ' sel' : ''}${piece.isLast ? ' last' : ''}${dated ? ' dated' : ''}" data-climate="${esc(climate)}" data-day="${piece.day}"
        style="left:${pct(piece.start)}%;width:${pct(piece.end - piece.start)}%" title="${esc(this._loc.t('temporarySetpointTitle', { label: sentence }))}">
      <span class="override-label">⏱<span class="rest">${what}</span></span>
      ${piece.isLast ? `<span class="override-tag${piece.end > DAY_MIN * 0.6 ? ' before' : ''}">⏱${what}</span>` : ''}
      ${piece.isLast ? `<div class="override-handle" title="${esc(this._loc.t('dragToChangeEnd'))}"><span class="tip">${endHM}</span></div>` : ''}
    </div>`;
  }

  // A row of days (in display order), drawn and edited through its first day
  _dayHtml(days, showNow) {
    const d = days[0];
    const multi = this._shown.length > 1;
    const subs = this._shown
      .map((climate) => {
        const segs = this._week(climate)[d];
        const m = this._menu;
        const open = m && m.climate === climate && m.day === d;
        return `<div class="sub">
          ${multi ? `<div class="name" title="${esc(this._loc.t('open', { name: this._name(climate) }))}">${this._moreInfoLink(climate)}${this._nameSizer()}</div>` : ''}
          ${this._barHtml(climate, segs, days, showNow)}
          ${this._hasMenu(climate, d)
    ? `<button class="ibtn${open ? ' open' : ''}" data-act="menu" data-climate="${esc(climate)}" data-day="${d}" title="${esc(this._loc.t('copyPaste'))}">${ICON_MORE}</button>`
    : `<button class="ibtn none" data-act="menu" data-climate="${esc(climate)}" data-day="${d}" disabled aria-hidden="true" tabindex="-1">${ICON_MORE}</button>`}
        </div>`;
      })
      .join('');
    // Today stands out, except in a week of an inactive schedule stacked under the active one's
    // (a thermostat's page, `week_only`): the active week marks it already
    const today = days.includes(todayIdx()) && (!this._config.week_only || this._schedule === this._activeSchedule());
    return `<div class="dgroup${today ? ' today' : ''}">
      <div class="day" data-day="${d}">${esc(this._loc.daysLabel(days))}</div>
      <div class="subs">${subs}</div>
    </div>`;
  }

  // A notice per thermostat of the configuration renamed in Home Assistant
  _renamedNotesHtml() {
    const src = this._source();
    return this._configured.map((t) => [t.entity, renamedTo(this._hass, src, t.entity)]).filter(([, to]) => to)
      .map(([former, entity]) => `<div class="paused-note renamed-note"><span>${esc(this._loc.t('renamedNote', { former, entity }))}</span></div>`)
      .join('');
  }

  // A notice per paused thermostat shown, with a button to resume it (anyone who may control the
  // thermostat, as with its Control switch)
  _pausedNotesHtml() {
    const src = this._source();
    return this._shown.filter((climate) => src.paused(climate)).map((climate) => `<div class="paused-note">
        <span>${withHtml(this._loc.t('pausedNote', { name: LINK_TOKEN }), this._moreInfoLink(climate))}</span>
        <button class="btn" data-act="resume" data-climate="${esc(climate)}">${esc(this._loc.t('resumeShort'))}</button>
      </div>`).join('');
  }

  // A thermostat of the card that Chauffage does not schedule: the card draws a new schedule's
  // week for it, and editing that week schedules it
  _unscheduledNotesHtml() {
    const src = this._source();
    if (!src.ready) return '';
    // Scheduling a thermostat is setting up (canSetUp): with Plan, its week stays read-only
    const key = src.editable ? 'unscheduledNote' : 'unscheduledNoteReadOnly';
    return this._shown.filter((climate) => this._unscheduled(climate)).map((climate) => `<div class="paused-note unscheduled-note">
        <span>${withHtml(this._loc.t(key, { name: LINK_TOKEN }), this._moreInfoLink(climate))}</span></div>`).join('');
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

  _menuHtml() {
    const m = this._menu;
    if (!m) return '';
    const ref = `data-climate="${esc(m.climate)}" data-day="${m.day}"`;
    const item = (act, label, icon = '', disabled = false) =>
      `<button class="mi" data-act="${act}" ${ref} ${disabled ? 'disabled' : ''}>${icon}<span>${label}</span></button>`;
    const t = this._loc.t;
    const paste = this._draft.clip ? `${esc(t('paste'))} <small>${esc(this._draft.clip.label)}</small>` : esc(t('paste'));
    // What can be done with this day, and a temporary setpoint on today; pausing is in the
    // "Thermostats" view. The thermostat's name opens it.
    // Copying and pasting edit the weeks: canPlan (U9)
    const groups = this._mayEdit(m.climate) ? [
      item('copy-day', esc(t('copyDay')), ICON_COPY) + item('paste-day', paste, ICON_PASTE, !this._draft.clip),
      item('fill-weekdays', esc(t('copyToWeekdays'))) + item('fill-weekend', esc(t('copyToWeekend')))
        + item('fill-all', esc(t('copyToAll'))) + (this._shown.length > 1 ? item('fill-others', esc(t('copyToOthers'))) : ''),
    ] : [];
    // The whole week of this thermostat, in the schedule shown: every slot to heat, or to cool
    if (groups.length && slotModesOf(this._hass, m.climate).length) {
      const all = (mode, key) => `<button class="mi" data-act="week-hvac" data-climate="${esc(m.climate)}" data-mode="${mode}">${hvacIcon(mode)}<span>${esc(t(key))}</span></button>`;
      groups.push(all('heat', 'weekAllHeat') + all('cool', 'weekAllCool'));
    }
    if (this._historyOf(m.climate, m.day)) groups.push(item('zoom', esc(t(this._isZoomed(m.climate, m.day) ? 'showSmaller' : 'showLarger')), ICON_ZOOM));
    if (this._mayOverride(m.climate, m.day)) groups.push(item('override-new', esc(t('newOverride'))));
    return `<div class="menu" style="top:${m.top}px;right:${m.right}px">
      <div class="mh">${this._moreInfoLink(m.climate)} · ${esc(this._rowLabel(m.day, 'long'))}</div>
      ${groups.join('<div class="sep"></div>')}
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
    this._menu = m && m.climate === climate && m.day === day ? null : { climate, day, top, right };
    this._render();
    const menu = this._menu;
    if (!menu || above == null) return;
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

  _editorHtml() {
    const t = this._loc.t;
    // In the words of a mouse, or of a finger on a touch screen (CSS)
    // A thermostat's page stacks one card per schedule: it shows the hint once (`week_only`)
    // Not with read-only weeks (the access level): there is nothing to drag
    const hint = this._config.week_only || !this._shown.some((c) => this._mayEdit(c)) ? ''
      : `<div class="hint"><span class="mouse">${esc(t('hint'))}</span><span class="touch">${esc(t('hintTouch'))}</span></div>`;
    if (this._overrideSel) return hint + this._overrideEditorHtml();
    if (!this._sel || !this._shown.includes(this._sel.climate)) { this._sel = null; return hint; }
    const { climate, day, idx } = this._sel;
    const segs = this._week(climate)[day];
    const s = segs && segs[idx] && slotOn(this._hass, climate, segs[idx]);
    if (!s) { this._sel = null; return hint; }
    // Popover, placed under the slot by _placeEditor() after rendering
    const last = idx === segs.length - 1;
    const end = last ? DAY_MIN : segs[idx + 1].start;
    const slot = `data-slot="${esc(JSON.stringify({ climate, day, idx }))}"`;
    const from = idx === 0 ? `<span class="fixed">${this._loc.time(0)}</span>`
      : timeField(`data-edge="start" ${slot}`, s.start, this._loc, this._config.step);
    const to = last ? `<span class="fixed">${this._loc.time(DAY_MIN)}</span>`
      : timeField(`data-edge="end" data-day-end ${slot}`, end, this._loc, this._config.step);
    // On a thermostat with more than one "on" HVAC mode, two rows (#91). First what the device
    // does: its HVAC modes. Then how warm: the presets that have a value for the HVAC mode
    // chosen, in its color; none for off, fan only, dry and auto. A heater has one row: Off,
    // then the presets
    const none = hasNoPreset(s);
    const target = none ? null : this._targetOf(climate, this._preset(s.preset));
    const off = isOff(s);
    const rows = hasModeRow(this._hass, climate);
    const mode = slotMode(s);
    const inMode = none || !mode ? defaultSetpointMode(this._hass, climate) : mode;
    const chips = rows && none ? '' : this._presets()
      .filter((l) => (!none && s.preset === l.id) || this._presetsIn(climate, inMode).includes(l.id))
      .map((l) => {
        const missing = !this._presetsIn(climate, inMode).includes(l.id);
        return `<button data-act="preset" data-preset="${esc(l.id)}" class="${!none && s.preset === l.id ? 'on' : ''}${missing ? ' unsupported' : ''}"${missing ? ` title="${esc(t('noPresetInMode'))}"` : ''} style="${chipStyle(l, none ? null : mode)}">${esc(l.name)}</button>`;
      }).join('');
    const disabled = SETPOINT_MODES.filter((m) => !this._presetsIn(climate, m).length);
    const modeRow = rows ? modeRowHtml(this._hass, climate, this._loc, none ? mode : inMode, 'slot-mode', disabled) : '';
    // One row: Off first; a fan-only, a dry or an auto slot pasted on this thermostat stays, marked
    const single = rows ? '' : `${offChipHtml(this._hass, climate, this._loc, 'slot-off', off)}${none && !off ? modeChipHtml(this._hass, climate, this._loc, mode, 'slot-mode', true) : ''}`;
    const presets = `${single}${chips}`;
    // The setpoint the slot will apply, with its number, as the preset's value gives it for the
    // slot's HVAC mode: a link to the presets page for an admin
    const setpoint = slotSetpointText(this._hass, climate, s, target, this._loc, {
      temperatureOf: (value) => this._presetTemperature(climate, value),
      coolTemperatureOf: (value) => this._coolPresetTemperature(climate, value),
    });
    // The link opens the presets tab on this thermostat's row
    const setpointLine = setpointLineHtml(setpoint, this._loc, isAdmin(this._hass) && !none ? `${panelPath('presets')}?thermostat=${encodeURIComponent(climate)}` : null);
    // With the history shown, what the slot measured: the slot's tooltip says it too, but a phone
    // shows no tooltip
    const measured = this._measuredText(climate, day, s.start, end).replace(/^ · /, '');
    // The fan and the vanes of an air conditioner, folded (lot 3): not on an off slot
    // In fan only and in dry, the fan speed is what there is to set: in sight, not folded
    const more = off ? '' : moreSettingsHtml(this._hass, climate, this._loc, s.settings, target, this._moreOpen, 'data-slot-setting',
      ['fan_only', 'dry'].includes(mode) ? ['fan_mode'] : []);
    return `${hint}<div class="editor">
      <div class="ed-head">
        <strong>${this._moreInfoLink(climate)} · ${esc(this._rowLabel(day, 'long'))}</strong>
        <span class="ed-times"><label>${esc(t('from'))} ${from}</label><label>${esc(t('to'))} ${to}</label></span>
        <button class="btn icon close" data-act="close" title="${esc(t('close'))}">✕</button>
      </div>
      <div class="ed-body">
        ${measured ? `<div class="ed-measured">${esc(measured)}</div>` : ''}
        ${modeRow}
        ${rows && !presets ? '' : `<div class="presets">${presets}</div>`}
        ${setpointLine}
        ${more}
      </div>
      <div class="ed-actions">
        <button class="btn" data-act="insert" ${end - s.start < 2 * this._config.step ? 'disabled' : ''}>${esc(t('insertSlot'))}</button>
        <button class="btn" data-act="delete" ${segs.length === 1 ? 'disabled' : ''}>${esc(t('delete'))}</button>
      </div>
    </div>`;
  }

  _overrideEditorHtml() {
    const { climate, create } = this._overrideSel;
    const d = this._overrides()[climate];
    // Without an override: closed (it ended), unless opened to set one (today's row menu)
    if ((!d && !create) || !this._shown.includes(climate)) { this._overrideSel = null; return ''; }
    const t = this._loc.t;
    // In the order of the more-info block: what it is, then what changes it (overrideBodyHtml),
    // and Resume the schedule
    return `<div class="editor override-ed">
      <div class="ed-head">
        <strong>${this._moreInfoLink(climate)} · ${esc(t('temporarySetpoint'))}</strong>
        ${d ? `<span class="override-value">${esc(overrideSummary(d, this._source(), climate, this._loc, this._hass))}</span>` : ''}
        <button class="btn icon close" data-act="override-close" title="${esc(t('close'))}">✕</button>
      </div>
      <div class="ed-body">${overrideBodyHtml(d, this._source(), climate, this._hass, this._loc, { step: this._config.step, line: 'ed-head', actions: 'ed-actions start', endLoc: fullNames(this._loc, this._hass, climate) })}</div>
      ${d ? `<div class="ed-actions"><button class="btn danger" data-act="override-del">${esc(t('resume'))}</button></div>` : ''}
    </div>`;
  }

  // ha-card (a Lit component) renders asynchronously: until its <slot> is rendered, its
  // content has no position. Wait for its rendering to complete before measuring.
  _schedulePlaceEditor() {
    const card: any = this.shadowRoot.querySelector('ha-card');
    if (!card || !this.shadowRoot.querySelector('.editor')) return;
    const token = (this._placeToken = (this._placeToken || 0) + 1);
    const ready = card.updateComplete instanceof Promise ? card.updateComplete : Promise.resolve();
    ready.then(() => {
      let tries = 0;
      const attempt = () => {
        if (token !== this._placeToken) return; // a more recent render took over
        if (this._placeEditor() || ++tries > 10) return;
        requestAnimationFrame(attempt);
      };
      requestAnimationFrame(attempt);
    });
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

  // The presets table scrolled back to where it was before a redraw, and its cues: a fade on the
  // side with more columns to see. Again once ha-card (a Lit component, rendered asynchronously)
  // shows its content: before that, the table has no width to scroll
  _keepTable() {
    const set = () => {
      const wrap = this.shadowRoot.querySelector('.table-wrap');
      if (!wrap) return;
      if (this._tableLeft) wrap.scrollLeft = this._tableLeft;
      this._tableCue();
    };
    set();
    const card: any = this.shadowRoot.querySelector('ha-card');
    if (card && card.updateComplete instanceof Promise) card.updateComplete.then(set);
  }

  _tableCue() {
    const wrap = this.shadowRoot.querySelector('.table-wrap');
    if (!wrap) return;
    const more = wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft;
    wrap.parentElement.classList.toggle('more-left', wrap.scrollLeft > 4);
    wrap.parentElement.classList.toggle('more-right', more > 4);
  }

  // Places the popover under the selected slot / override / preset cell (or above it when there
  // is no room). Returns false if the layout is not ready yet.
  _placeEditor() {
    const root = this.shadowRoot;
    // The table first: the popover points at the cell where the table is scrolled
    const table = root.querySelector('.table-wrap');
    if (table && this._tableLeft) table.scrollLeft = this._tableLeft;
    const ed: any = root.querySelector('.editor');
    // A temporary setpoint being set (no override yet): under "now" on the thermostat's row today
    const sel = this._overrideSel;
    const now = sel && sel.create && root.querySelector(`.bar[data-climate="${sel.climate}"][data-day="${this._rowOf(todayIdx())[0]}"] .now`);
    const seg = root.querySelector('.override.sel, .seg.sel, .cell.on, .pv-add.on') || now;
    if (!ed || !seg) return true;
    const card = root.querySelector('ha-card').getBoundingClientRect();
    // A slot is clipped to its row (the popover goes under the row); a cell to the table, which
    // may scroll sideways (the popover goes under the cell); the button adding a preset: under it
    const isCell = seg.classList.contains('cell') || seg.classList.contains('pv-add');
    const bar = (isCell ? seg.closest('.table-wrap') || seg.parentElement : seg.parentElement).getBoundingClientRect();
    if (!card.width || !bar.width) return false;
    const sr = seg.getBoundingClientRect();
    const row = isCell ? sr : bar;
    // On a narrow card (a phone), the popover takes the card's width: centred, whatever it holds
    ed.style.width = card.width <= 516 ? `${card.width - 16}px` : '';
    ed.classList.toggle('narrow', card.width <= 516); // its HVAC modes in three columns
    ed.style.maxHeight = ''; // its whole height first
    const w = ed.offsetWidth;
    const h = ed.offsetHeight;
    // The popover is placed from inside the card's border: centred between its two borders
    const border = root.querySelector('ha-card').clientLeft || 0;
    const cx = (Math.max(sr.left, bar.left) + Math.min(sr.right, bar.right)) / 2 - card.left;
    const left = Math.max(8, Math.min(card.width - w - 8, cx - w / 2)) - border;
    let top = row.bottom - card.top + 9;
    let above = false;
    // The popover goes over the save bar, but stays in the window, under Home Assistant's top bar
    const topBar = parseFloat(getComputedStyle(this).getPropertyValue('--header-height')) || 0;
    let max = 0;
    if (row.bottom + 9 + h > window.innerHeight) {
      const roomBelow = window.innerHeight - row.bottom - 9 - 8;
      const roomAbove = row.top - 9 - 8 - topBar;
      // No room on either side: it takes the larger one, and its body scrolls
      if (row.top - 9 - h <= topBar) max = Math.max(roomBelow, roomAbove);
      if (max !== roomBelow) {
        top = row.top - card.top - (max || h) - 9;
        above = true;
      }
    }
    ed.style.maxHeight = max ? `${max}px` : '';
    // A redraw (a preset tapped, Home Assistant's new data) keeps where the body was scrolled
    const kept = this._bodyScroll;
    this._bodyScroll = null;
    this._placedKey = this._editorKey();
    const body = ed.querySelector('.ed-body');
    if (kept && body && kept.key === this._placedKey) body.scrollTop = kept.top;
    ed.style.left = `${left}px`;
    ed.style.top = `${top}px`;
    ed.style.setProperty('--caret', `${Math.max(14, Math.min(w - 14, cx - left))}px`);
    ed.classList.toggle('above', above);
    ed.classList.add('placed');
    return true;
  }

  // Which popover is open: a slot, an override or a preset's value
  _editorKey() {
    const cell = this._cell && [this._cell.kind, this._cell.preset, this._cell.climate];
    return JSON.stringify([this._sel, this._overrideSel && this._overrideSel.climate, cell]);
  }

  // Redraws the card, keeping a schedule name being typed in a menu, and the caret of a rule's
  // template being typed (the card is redrawn every 30 s during an override, or when Home
  // Assistant sends new data)
  _render() {
    // Not while a time is typed: the redraw would take its field away
    if (focusedField(this.shadowRoot, 'input.time')) { this._redrawLater = true; return; }
    const input: any = this.shadowRoot.querySelector('.sched-menu input[data-sched-name]');
    const typing = input && { value: input.value, focused: this.shadowRoot.activeElement === input };
    const area = focusedField(this.shadowRoot, '[data-rule-template]');
    const rule = area && { idx: area.dataset.ruleTemplate, start: area.selectionStart, end: area.selectionEnd };
    const field = focusedField(this.shadowRoot, OVERRIDE_TEMPERATURE);
    const temperature = field ? field.value : null;
    const tabs = this.shadowRoot.querySelector('.tabs-scroll');
    const tabsLeft = tabs ? tabs.scrollLeft : 0;
    // The presets table keeps where it was scrolled sideways: a tap on a cell redraws it
    const table = this.shadowRoot.querySelector('.table-wrap');
    if (table) this._tableLeft = table.scrollLeft;
    // A popover's body scrolled: put back by _placeEditor(), if the same popover is still open
    const body = this.shadowRoot.querySelector('.editor .ed-body');
    this._bodyScroll = body && body.scrollTop ? { key: this._placedKey, top: body.scrollTop } : null;
    this._draw();
    this._keepTable();
    this._showTargetRow();
    this._cellCoolNote(); // what the default gives when cooling, in a cell popover just opened
    this._tabsWait = false;
    this._placeTabs(tabsLeft);
    if (typing) this._restoreSchedName(typing.value, typing.focused);
    if (rule) this._restoreRuleCaret(rule);
    if (temperature !== null) restoreTyped(this.shadowRoot, `.override-ed ${OVERRIDE_TEMPERATURE}`, temperature);
    this._syncPreview();
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

  // Focus and caret of a rule's template, again once ha-card (a Lit component, rendered
  // asynchronously) shows its content, as for the schedule names below
  _restoreRuleCaret({ idx, start, end }) {
    const focus = () => {
      const area: any = this.shadowRoot.querySelector(`textarea[data-rule-template="${idx}"]`);
      if (!area) return;
      area.focus();
      area.setSelectionRange(start, end);
    };
    focus();
    const card: any = this.shadowRoot.querySelector('ha-card');
    if (card && card.updateComplete instanceof Promise) {
      card.updateComplete.then(() => { if (card.isConnected) focus(); });
    }
  }

  // The name field of the schedule menus: its text, and the focus
  _restoreSchedName(value, focus) {
    const selector = '.sched-menu input[data-sched-name]';
    if (focus) return restoreTyped(this.shadowRoot, selector, value);
    const input: any = this.shadowRoot.querySelector(selector);
    if (input && value != null) input.value = value;
  }

  _draw() {
    this._settle();
    if (!this._hass || !this._config) return;
    const tr = this._loc.t;
    const fill = (html, cls?) => fillCard(this.shadowRoot, STYLE, html, `${cls || ''}${this._config.flat ? ' flat' : ''}`);
    const notice = sourceNotice(this._source());
    if (notice) {
      fill(noticeHtml(notice, tr));
      bindReload(this.shadowRoot, () => this._reloadPage());
      return;
    }
    if (this._view === 'presets' && this._source().ready) {
      fill(`${this._presetsViewHtml()}<div class="msg">${esc(this._msg)}</div>`);
      this._schedulePlaceEditor();
      return;
    }
    if (this._view === 'schedules' && this._source().ready) {
      fill(`${this._schedulesViewHtml()}<div class="msg">${esc(this._msg)}</div>`);
      return;
    }
    if (this._view === 'thermostats' && this._source().ready) {
      fill(`${this._thermostatsViewHtml()}<div class="msg">${esc(this._msg)}</div>`);
      return;
    }
    if (this._view === 'rules' && this._source().ready) {
      const msg = this._msg || (this._rulesDraft ? tr('unsaved') : '');
      fill(`${this._rulesViewHtml()}<div class="msg">${esc(msg)}</div>`);
      return;
    }
    if (!this._thermostats.length) {
      fill(this._renamedNotesHtml());
      return;
    }
    const src = this._source();
    const schedules = this._schedules();
    const active = this._activeSchedule();
    const today = todayIdx();
    this._renderedDay = today;
    const multi = this._shown.length > 1;
    const allShown = this._shown.length === this._thermostats.length;

    const chips = this._thermostats
      .map((t) => {
        const on = this._shown.includes(t.entity);
        const paused = src.paused(t.entity) ? ' paused' : '';
        return `<button class="chip${on ? ' on' : ''}${paused}" data-climate="${esc(t.entity)}">${esc(this._name(t.entity))} <span class="live">${esc(this._chipMark(t.entity))}</span><span class="chip-open" data-more-info="${esc(t.entity)}" title="${esc(tr('openThermostat'))}">${ICON_OPEN}</span></button>`;
      })
      .join('');
    // The schedules' ⋮ and + edit the schedules: canPlan
    const plannable = src.plannable;
    // On a schedule's sheet (schedule_tabs: 'one'): its tab alone, with its menu, and no new schedule
    const one = this._config.schedule_tabs === 'one';
    // A week of a thermostat's page: the week alone (`week_only`)
    const weekOnly = !!this._config.week_only;
    const tabs = (one ? schedules.filter((m) => m === this._schedule) : schedules)
      .map((m) => { const icon = src.scheduleIcon(m); return `<button class="tab${m === this._schedule ? ' on' : ''}" data-schedule="${esc(m)}">${m === active ? `<span class="dot" title="${esc(tr('activeSchedule'))}"></span>` : ''}${icon ? `<ha-icon class="tab-icon" icon="${esc(icon)}"></ha-icon>` : ''}<span class="tab-name">${esc(this._scheduleName(m))}</span></button>${
        plannable && m === this._schedule ? `<button class="tab-tool" data-act="schedule-menu" title="${esc(tr('scheduleMenu'))}">⋮</button>` : ''}`; })
      .join('');
    // Arrows on the sides of the tabs, shown when schedules are hidden on that side (_tabArrows)
    const tabsArrow = (side) => `<button class="tab-arrow" data-tabs-scroll="${side}"
      title="${esc(tr(side === 'left' ? 'tabsLeft' : 'tabsRight'))}" aria-label="${esc(tr(side === 'left' ? 'tabsLeft' : 'tabsRight'))}"><ha-icon icon="mdi:chevron-${side}"></ha-icon></button>`;
    // Out of the tabs' scrolling area: the "+" stays in place however many schedules there are
    const newTab = plannable && !one ? `<button class="tab-tool" data-act="schedule-new" title="${esc(tr('newSchedule'))}">+</button>` : '';
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<span${h % 6 ? ' class="minor"' : ''} style="left:${(h / 24) * 100}%">${this._loc.tick(h)}</span>`).join('');
    // Days in the order of the user's first weekday (data stays Monday-based)
    this._layoutRows();
    const days = this._rows.map((r) => this._dayHtml(r, r.includes(today) && this._schedule === active)).join('');
    // The column of the days fits the longest label (on two lines at most)
    const dayWidth = Math.min(72, Math.max(36, ...this._rows.map((r) => this._loc.daysLabel(r).length * 8 + 4)));

    const focus = this._focusClimate();
    const st = this._hass.states[focus];
    // What each preset means for the focused thermostat (see _presetTemperature), then where to
    // set the presets
    const panelOpen = this._panelOpenHtml();
    // Its heat color, then its cool color when a shown thermostat cools: each swatch then has
    // its mark, a flame or a snowflake. No heat color when every thermostat shown only cools.
    // Then its values on the thermostat shown alone: "Comfort 20° · ❄ 24°"
    const showsCool = this._showsCool();
    const showsHeat = this._shown.some((c) => !coolsOnly(this._hass, c));
    const single = !multi && !!st;
    const legendOff = this._legendOffHtml();
    const legend = this._presets()
      .map((l) => {
        // Only what the thermostats shown can use: a preset with no value on any of them is
        // left out, and each of its colors shows only if a week shown can have it
        const usable = this._legendModes(l);
        if (!usable.size) return '';
        const target = this._targetOf(focus, l);
        const t = single && !coolsOnly(this._hass, focus) ? this._presetTemperature(focus, target) : null;
        const c = single && listsMode(this._hass, focus, 'cool') ? this._coolPresetTemperature(focus, target) : null;
        const hint = !multi && ('preset_mode' in target || 'cool_preset_mode' in target) && t == null && c == null && !coolsOnly(this._hass, focus) ? ` ${tr('presetHint')}` : '';
        const heat = showsHeat && usable.has('heat') ? `<i class="heat${showsCool ? ' mk' : ''}" style="background:${l.color}"${showsCool ? ` title="${esc(tr('slotHeat'))}"` : ''}>${showsCool ? hvacIcon('heat') : ''}</i>` : '';
        const cool = showsCool && usable.has('cool') ? `<i class="cool mk" style="background:${coolColor(l)}" title="${esc(tr('slotCool'))}">${hvacIcon('cool')}</i>` : '';
        if (!heat && !cool) return '';
        const values = [t != null ? `${this._loc.number(t)}°` : '', c != null ? `${t != null ? `<span class="cv">${hvacIcon('cool')}</span>` : ''}${this._loc.number(c)}°` : '']
          .filter(Boolean).join(' · ');
        return `<span>${heat}${cool}${esc(l.name)}${values ? ` ${values}` : esc(hint)}</span>`;
      })
      .join('') + this._legendHeatCoolHtml() + legendOff + this._settingsLinkHtml();
    // Copying the week of the thermostat shown to another thermostat or schedule: a menu, as the
    // day's ⋮, opening upwards from the foot of the card
    // Weeks edited, then the access level dropped (U31): kept until Cancel, but not saved
    const maySave = !this._draft.dirty || (plannable && this._maySave());
    const cw = this._copyWeekMenu;
    const copyWeekMenu = !cw ? '' : `<div class="menu copyweek-menu" style="${cw.top != null ? `top:${cw.top}px` : `bottom:${cw.bottom}px`};right:${cw.right}px;max-height:${Math.max(120, cw.maxHeight)}px">${
      this._thermostats.filter((t) => this._mayEdit(t.entity)).map((t) => {
        const items = schedules
          .filter((m) => !(t.entity === focus && m === this._schedule))
          .map((m) => `<button class="mi" data-act="copy-week" data-climate="${esc(t.entity)}" data-schedule="${esc(m)}"><span>${esc(this._scheduleName(m))}</span></button>`)
          .join('');
        return items ? `<div class="mh">${esc(this._name(t.entity))}</div>${items}` : '';
      }).join('')}</div>`;

    fill(`
        
        ${weekOnly ? '' : `<div class="chips${panelOpen ? ' with-open' : ''}">
          ${panelOpen}
          ${chips}
          <span class="chip-sep"></span>
          <button class="chip tool${this._multiSel ? ' on' : ''}" data-act="multi-sel" title="${esc(tr('multipleTitle'))}">${esc(tr('multiple'))}</button>
          <button class="chip tool${allShown ? ' on' : ''}" data-act="show-all" title="${esc(tr('allTitle'))}">${esc(tr('all'))}</button>
          <button class="chip tool${this._grouped() ? ' on' : ''}" data-act="group-days" title="${esc(tr('groupDaysTitle'))}">${esc(tr('groupDays'))}</button>
          <button class="chip tool${this._history.shown ? ' on' : ''}${this._history.loading ? ' loading' : ''}" data-act="history" title="${esc(tr('historyTitle'))}">${esc(tr('history'))}</button>
        </div>`}
        ${this._renamedNotesHtml()}
        ${weekOnly ? '' : this._pausedNotesHtml()}
        ${this._unscheduledNotesHtml()}
        ${weekOnly ? '' : `${one ? '<div class="no-tabs"></div>' : `<div class="tabs"><div class="tabs-wrap"><div class="tabs-scroll">${tabs}</div>${tabsArrow('left')}${tabsArrow('right')}</div>${newTab}</div>`}
        ${this._schedMenuHtml()}
        ${this._scheduleBarHtml(active)}`}
        <div class="days" style="--day-w:${dayWidth}px">
          <div class="scale"><div></div>${multi ? `<div class="name">${this._nameSizer()}</div>` : ''}<div class="ticks">${ticks}</div><div></div></div>
          ${days}
        </div>
        ${this._menuHtml()}
        ${this._editorHtml()}
        ${weekOnly ? (legendOff ? `<div class="foot"><div class="legend">${legendOff}</div></div>` : '') : `<div class="foot">
          <div class="legend">${legend}</div>
          <div class="actions">
            ${plannable ? `<button class="btn copyweek${cw ? ' on' : ''}" data-act="copyweek-menu">${esc(tr('copyWeekTo', { name: this._name(focus) }))}</button>` : ''}
            ${copyWeekMenu}
          </div>
        </div>`}
        <div class="msg">${esc(maySave ? this._msg : tr('unauthorized'))}</div>
        ${this._draft.dirty && !weekOnly ? `<div class="savebar">
          <span class="dirty">${esc(tr('unsaved'))}</span>
          <button class="btn" data-act="cancel">${esc(tr('cancel'))}</button>
          ${maySave ? `<button class="btn primary" data-act="save">${esc(tr('save'))}</button>` : ''}
        </div>` : ''}`,
      `${multi ? 'multi' : 'single'} h${Math.min(this._shown.length, 3)}${this._loc.hour12 ? ' h12' : ''}`);
    this._schedulePlaceEditor();
    this._schedulePlaceTags();
    // A week of a thermostat's page (`week_only`): the page's own bar saves it, so the
    // sheet hears when it has edits to save
    if (this._config.week_only && this._draft.dirty !== this._dirtyTold) {
      this._dirtyTold = this._draft.dirty;
      this.dispatchEvent(new CustomEvent('chauffage-dirty', { bubbles: true, composed: true }));
    }
  }

  // Visual update of a row while dragging (without recreating the captured handle)
  _layoutBar(bar, stored) {
    const segs = dayOn(this._hass, bar.dataset.climate, stored); // as they run on the thermostat
    bar.querySelectorAll('.seg').forEach((el, i) => {
      const s = segs[i];
      const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
      el.style.left = `${pct(s.start)}%`;
      el.style.width = `${pct(end - s.start)}%`;
      el.innerHTML = this._segInner(s.start, end, s);
    });
    bar.querySelectorAll('.handle').forEach((el) => {
      const s = segs[Number(el.dataset.idx)];
      el.style.left = `${pct(s.start)}%`;
      el.querySelector('.tip').textContent = this._loc.time(s.start);
    });
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

  _bindEvents() {
    const root = this.shadowRoot;

    // The schedule tabs scroll natively (a finger, a trackpad, Shift + wheel): their fades and arrows
    // follow. An arrow scrolls by most of a width (the tab cut at the edge then shows whole), with
    // the browser's smooth scrolling, which stops when the user scrolls
    root.addEventListener('scroll', (e: any) => {
      if (!e.target.matches) return;
      if (e.target.matches('.tabs-scroll')) this._tabArrows();
      // The presets table scrolled sideways: kept across redraws, and its cues follow
      if (e.target.matches('.table-wrap')) { this._tableLeft = e.target.scrollLeft; this._tableCue(); }
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
      if (!bar || this._drag || this._overrideDrag) return;
      if (e.pointerType === 'touch' && !this._readTouch) return;
      this._showReadout(bar, e.clientX);
    }, true);
    const stopTouch = () => { this._readTouch = false; };
    root.addEventListener('pointerup', stopTouch, true);
    root.addEventListener('pointercancel', stopTouch, true);
    root.addEventListener('pointerleave', (e: any) => {
      if (e.pointerType !== 'touch' && e.target.matches && e.target.matches('.bar.zoom')) this._hideReadout(e.target);
    }, true);

    root.addEventListener('pointerdown', (e: any) => {
      // Where the finger went down on a row: a tap on a handle opens the slot there. On a touch
      // screen the browser may move the click that follows to the centre of the handle
      if (e.target.closest('.bar')) this._downAt = { x: e.clientX, t: Date.now() };
      // End handle of an override
      const dh = e.target.closest('.override-handle');
      if (dh) {
        e.preventDefault();
        e.stopPropagation();
        dh.setPointerCapture(e.pointerId);
        dh.classList.add('drag');
        const el = dh.parentElement;
        const climate = el.dataset.climate;
        const piece = this._overridePieces(climate).find((p) => p.isLast);
        if (!piece) return;
        this._overrideDrag = { climate, piece, el, handle: dh, bar: el.parentElement, end: piece.end, moved: false };
        return;
      }
      // A whole slot (not the first nor the last of the day): by mouse any slot, by touch only
      // the selected one, so that a finger sliding over the week moves nothing
      const seg = e.target.closest('.bar > .seg');
      if (seg) {
        const bar = seg.parentElement;
        const climate = bar.dataset.climate;
        const day = Number(bar.dataset.day);
        if (!this._mayEdit(climate)) return; // read-only weeks: nothing moves
        const idx = Number(seg.dataset.idx);
        const segs = this._week(climate)[day];
        if (idx < 1 || idx >= segs.length - 1) return;
        const sel = this._sel;
        const selected = sel && sel.climate === climate && sel.day === day && sel.idx === idx;
        if (e.pointerType === 'touch' && !selected) return;
        e.preventDefault();
        seg.setPointerCapture(e.pointerId);
        this._drag = {
          move: true, climate, day, idx, bar, el: seg, x0: e.clientX, y0: e.clientY, selected,
          touch: e.pointerType === 'touch', orig: segs.map((s) => s.start),
          start: segs[idx].start, length: segs[idx + 1].start - segs[idx].start, moved: false,
        };
        return;
      }
      const h = e.target.closest('.handle');
      if (!h || !this._mayEdit(h.parentElement.dataset.climate)) return;
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      h.classList.add('drag');
      const bar = h.parentElement;
      const climate = bar.dataset.climate;
      const day = Number(bar.dataset.day);
      this._drag = {
        climate, day, idx: Number(h.dataset.idx), bar, el: h, moved: false, x0: e.clientX, y0: e.clientY,
        touch: e.pointerType === 'touch', orig: this._week(climate)[day].map((s) => s.start),
      };
    });

    root.addEventListener('pointermove', (e: any) => {
      const dd = this._overrideDrag;
      if (dd) {
        const step = this._config.step;
        const p = dd.piece;
        const isToday = p.d0.toDateString() === new Date().toDateString();
        const min = Math.max(p.start + step, isToday ? Math.ceil((nowMin() + 1) / step) * step : 0);
        const m = Math.max(min, Math.min(DAY_MIN, this._snap(this._minuteAt(dd.bar, e.clientX))));
        if (m !== dd.end) {
          dd.end = m;
          dd.moved = true;
          dd.el.style.width = `${pct(m - p.start)}%`;
          dd.handle.querySelector('.tip').textContent = this._loc.time(m);
          const label = dd.el.querySelector('.override-label');
          if (label) label.textContent = '⏱';
        }
        return;
      }
      const d = this._drag;
      if (!d) return;
      // A finger (#67): a mostly vertical swipe is a scroll, and moves nothing; a move needs a few
      // pixels sideways first, as a finger is not steady
      if (d.touch && !d.started) {
        const dx = Math.abs(e.clientX - d.x0);
        const dy = Math.abs((e.clientY || 0) - (d.y0 || 0));
        if (dy > dx && dy >= TOUCH_SLOP) { this._cancelDrag(); return; }
        if (dx < TOUCH_SLOP) return;
        d.started = true;
      }
      const step = this._config.step;
      const segs = this._week(d.climate)[d.day];
      if (d.move) {
        // A few pixels are still a click (opens the popover)
        if (!d.moved && Math.abs(e.clientX - d.x0) < 5) return;
        if (!d.moved) {
          d.moved = true;
          d.bar.querySelectorAll(`.handle[data-idx="${d.idx}"], .handle[data-idx="${d.idx + 1}"]`)
            .forEach((el) => el.classList.add('drag'));
        }
        const min = segs[d.idx - 1].start + step;
        const max = (d.idx + 2 < segs.length ? segs[d.idx + 2].start : DAY_MIN) - step - d.length;
        const delta = this._snap(this._minuteAt(d.bar, e.clientX) - this._minuteAt(d.bar, d.x0));
        const m = Math.max(min, Math.min(max, d.start + delta));
        if (m !== segs[d.idx].start) {
          segs[d.idx].start = m;
          segs[d.idx + 1].start = m + d.length;
          this._layoutBar(d.bar, segs);
        }
        return;
      }
      const min = segs[d.idx - 1].start + step;
      const max = (d.idx + 1 < segs.length ? segs[d.idx + 1].start : DAY_MIN) - step;
      const m = Math.max(min, Math.min(max, this._snap(this._minuteAt(d.bar, e.clientX))));
      if (m !== segs[d.idx].start) {
        segs[d.idx].start = m;
        d.moved = true;
        this._layoutBar(d.bar, segs);
      }
    });

    const endDrag = () => {
      const dd = this._overrideDrag;
      if (dd) {
        this._overrideDrag = null;
        this._overrideDragEnded = Date.now(); // prevents the following "click" from opening the popover
        if (dd.moved) this._setOverrideEnd(dd.climate, atMinutes(dd.piece.d0, dd.end, new Date()));
        else dd.handle.classList.remove('drag');
        return;
      }
      const d = this._drag;
      if (!d) return;
      this._drag = null;
      if (d.move) {
        if (!d.moved) return;
        this._lastClick = null; // the click that follows is neither a selection nor half a double click
        this._slotMoved = Date.now();
        // A selected slot stays selected (by touch, it can slide again); otherwise no popover
        if (!d.selected) this._sel = null;
        this._commit(d.climate, d.day, d.selected ? this._week(d.climate)[d.day][d.idx].start : null);
        return;
      }
      if (d.moved) {
        this._handleMoved = Date.now(); // the click that follows opens no slot
        this._commit(d.climate, d.day, null);
      } else d.el.classList.remove('drag');
    };
    root.addEventListener('pointerup', endDrag);
    // The browser took the gesture over (a scroll): the slots go back as they were (#67)
    root.addEventListener('pointercancel', () => {
      if (this._drag) this._cancelDrag();
      else endDrag();
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
      // A thermostat's menu open (Thermostats page): a click elsewhere only closes it
      if (this._thMore && !e.target.closest('.th-menu, [data-act="thermostat-more"]')) {
        this._thMore = null;
        this._forgetAsk = null;
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
        this._sel = null;
        this._overrideSel = null;
        this._menu = null;
        this._schedEd = null;
        this._thMore = null;
        this._render();
        this._openMoreInfo(mi.dataset.moreInfo);
        return;
      }
      const device = e.target.closest('[data-device]');
      if (device) {
        this._sel = null;
        this._overrideSel = null;
        this._cell = null;
        this._thMore = null;
        openDevice(device.dataset.device);
        return;
      }
      // A page of the panel, or a dashboard's view: its address (not from a row's actions)
      const to = !inRowActions(e) && e.target.closest('[data-navigate]');
      if (to) {
        navigate(to.dataset.navigate);
        return;
      }
      // Preset cell popover open: a click outside the popover / cells closes it
      if (this._cell && !e.target.closest('.editor, [data-act="cell"]')) {
        this._cell = null;
        if (!e.target.closest('[data-act]')) { this._render(); return; }
      }
      // Popover open: a click outside the popover / slot closes it
      if ((this._sel || this._overrideSel) && !e.target.closest('.editor, .seg, .handle, .override')) {
        this._sel = null;
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
        this._sel = null;
        this._overrideSel = null;
        this._render();
        return;
      }
      // Click on an override: opens its popover
      const override = e.target.closest('.override');
      if (override) {
        if (e.target.closest('.override-handle') || Date.now() - (this._overrideDragEnded || 0) < 300) return;
        this._sel = null;
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
      if ((!seg && !handle) || Date.now() - (this._slotMoved || 0) < 300 || Date.now() - (this._handleMoved || 0) < 300) return;
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
        own = !!this._sel && this._sel.climate === climate && this._sel.day === day && (this._sel.idx === edge || this._sel.idx === edge - 1);
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
      const sel = this._sel;
      if (!sel || sel.climate !== climate || sel.day !== day || sel.idx !== idx) {
        this._overrideSel = null;
        this._sel = { climate, day, idx };
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

    // Typing a temperature for a thermostat's preset means "use a temperature"
    root.addEventListener('input', (e: any) => {
      if (e.target.hasAttribute('data-rule-template')) {
        const before = !!this._rulesDraft;
        this._editRules((d) => { d.rules[Number(e.target.dataset.ruleTemplate)].template = e.target.value; });
        // Shows or hides Cancel, Save and "unsaved"; the text and the caret are kept
        if (before !== !!this._rulesDraft) this._render();
        this._syncPreview();
        return;
      }
      if (e.target.hasAttribute('data-cell-temp')) this._cellChoose('temperature');
      if (e.target.hasAttribute('data-cell-cool')) this._cellChooseField(true);
    });

    root.addEventListener('change', (e) => {
      const el: any = e.target;
      if (el.hasAttribute('data-rule-schedule')) {
        this._editRules((d) => { d.rules[Number(el.dataset.ruleSchedule)].schedule = el.value || null; });
        this._render();
      } else if (el.hasAttribute('data-rules-default')) {
        this._editRules((d) => { d.def = el.value || null; });
        this._render();
      } else if (el.hasAttribute('data-cell-preset')) {
        this._cellChoose('own'); // picking one of the thermostat's presets means "use it"
      } else if (el.matches('.cell-ed input[name="cell-choice"]')) {
        this._cellCoolNote();
      } else if (el.hasAttribute('data-cell-color')) {
        this._cellCoolColor();
      } else if (el.hasAttribute('data-cell-cool-color')) {
        el.setAttribute('data-chosen', ''); // the user's own cool color: it no longer follows the color
      } else if (el.hasAttribute('data-override-temperature') && Number.isFinite(parseDecimal(el.value)) && this._overrideSel) {
        const c = this._overrideSel.climate;
        this._sendOverride(c, overrideWithTemperature(this._overrides()[c], this._source(), c, parseDecimal(el.value), this._hass));
      } else if (el.hasAttribute('data-slot-setting') && this._sel) {
        const { climate, day, idx } = this._sel;
        this._moreOpen = true;
        this._setSlotSetting(climate, day, idx, el.dataset.slotSetting, el.value || null);
      }
    });
    // "More settings" of a slot stays open or closed across redraws (toggle does not bubble)
    root.addEventListener('toggle', (e: any) => {
      if (!e.target.matches || !e.target.matches('.editor details.more')) return;
      if (!e.target.matches('.cell-ed details.more')) this._moreOpen = e.target.open;
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
      if (e.target.closest && e.target.closest('.editor details.more > summary')) this._moreTapped = true;
    }, true);
  }

  // Shown when the viewed tab is not the active schedule: activate it from the card,
  // without a separate input_select card.
  _scheduleBarHtml(active) {
    if (!this._schedule || this._schedule === active) return '';
    const t = this._loc.t;
    // The active schedule's name leads to it: its tab on a dashboard, its page in the panel
    const name = this._config.panel
      ? `<span class="mi-link" role="link" tabindex="0" data-navigate="${panelPath(`schedules/${esc(active)}`)}">${esc(this._scheduleName(active))}</span>`
      : `<span class="mi-link" role="link" tabindex="0" data-show-schedule="${esc(active)}">${esc(this._scheduleName(active))}</span>`;
    const current = active ? t('activeScheduleBar', { schedule: name }) : esc(t('noActiveSchedule'));
    return `<div class="schedule-bar">
      <span>${current}</span>
      <button class="btn small" data-act="activate-schedule">${esc(t('activate', { schedule: this._scheduleName(this._schedule) }))}</button>
    </div>`;
  }

  // Drop-down menus of the schedule tabs: "+" (new schedule: empty or a copy, then its name)
  // and "⋮" (the open schedule: rename, move, delete). Positioned under the clicked button.
  _schedMenuHtml() {
    const ed = this._schedEd;
    if (!ed) return '';
    const t = this._loc.t;
    const schedules = this._schedules();
    const item = (act, label, extra = '', disabled = false, cls = 'mi') =>
      `<button class="${cls}" data-act="${act}" ${extra} ${disabled ? 'disabled' : ''}><span>${label}</span></button>`;
    const err = this._schedErr ? `<div class="sched-err">${esc(this._schedErr)}</div>` : '';
    const cancel = `<button class="btn small" data-act="schedule-close">${esc(t('cancel'))}</button>`;
    const nameForm = (value, act, label) => `<div class="sched-form">
        <input data-sched-name value="${esc(value)}" placeholder="${esc(t('scheduleName'))}">
        ${err}
        <div class="sched-btns"><button class="btn small primary" data-act="${act}">${esc(label)}</button>${cancel}</div>
      </div>`;
    let body;
    if (ed.kind === 'new') {
      if (ed.step === 'name') {
        const from = ed.copy ? t('copyOfName', { name: this._scheduleName(ed.copy) }) : t('emptySchedule');
        body = `<div class="mh">${esc(t('newSchedule'))} · ${esc(from)}</div>${nameForm('', 'schedule-create', t('create'))}`;
      } else {
        body = `<div class="mh">${esc(t('newSchedule'))}</div>
          ${item('schedule-pick', esc(t('emptySchedule')), 'data-copy=""')}
          <div class="sep"></div>
          ${schedules.map((m) => item('schedule-pick', esc(t('copyOfName', { name: this._scheduleName(m) })), `data-copy="${esc(m)}"`)).join('')}`;
      }
    } else {
      const id = ed.id;
      const name = this._scheduleName(id);
      if (ed.step === 'rename') {
        // The id does not change: automations use it
        body = `<div class="mh">${esc(t('scheduleId', { id }))}</div>${nameForm(name, 'schedule-rename', t('rename'))}`;
      } else if (ed.step === 'delete') {
        body = `<div class="sched-form">${esc(t('confirmDelete', { name }))}
          <div class="sched-btns"><button class="btn small danger" data-act="schedule-delete-confirm">${esc(t('deleteSchedule'))}</button>${cancel}</div></div>`;
      } else {
        const i = schedules.indexOf(id);
        const src = this._source();
        const inRules = src.rules().some((r) => r.schedule === id) || src.defaultSchedule() === id;
        const reason = id === this._activeSchedule() ? t('cannotDeleteActive') : schedules.length < 2 ? t('cannotDeleteLast')
          : inRules ? t('cannotDeleteInRules') : '';
        // On a dashboard, the schedule's page in the panel, for whoever may open the panel (Set
        // up); in the panel, the page is a row or the page itself
        const open = this._config.panel || !src.editable ? ''
          : `<button class="mi" data-navigate="${panelPath(`schedules/${esc(id)}`)}"><span>${esc(t('openInPanel', { panel: panelTitle(this._hass) }))}</span></button><div class="sep"></div>`;
        // A schedule's sheet shows one tab (`schedule_tabs: 'one'`): no tab to move it next to; the
        // list moves it up or down
        const list = this._view === 'schedules';
        const moves = this._config.schedule_tabs === 'one' ? ''
          : `${item('schedule-move', esc(t(list ? 'moveUp' : 'moveLeft')), 'data-dir="-1"', i <= 0)}
          ${item('schedule-move', esc(t(list ? 'moveDown' : 'moveRight')), 'data-dir="1"', i >= schedules.length - 1)}`;
        // The list's rows have no Activate button: it broke their layout
        const activate = list && id !== this._activeSchedule()
          ? `${item('activate-schedule', esc(t('panelActivate')), `data-schedule="${esc(id)}"`)}<div class="sep"></div>` : '';
        // The icon is the schedule switch's: set where Home Assistant sets every entity's icon, which
        // Home Assistant keeps for admins
        const icon = src.scheduleEntity(id) && src.admin ? item('schedule-icon', esc(t('changeIcon'))) : '';
        body = `${activate}${open}${item('schedule-rename-open', esc(t('renameMenu')))}
          ${icon}
          ${moves}
          <div class="sep"></div>
          ${item('schedule-delete', `${esc(t('deleteMenu'))}${reason ? `<small>${esc(reason)}</small>` : ''}`, '', !!reason, 'mi danger')}`;
      }
    }
    const side = ed.right != null ? `right:${ed.right}px` : `left:${ed.left || 0}px`;
    return `<div class="menu sched-menu" style="top:${ed.top || 0}px;${side}">${body}</div>`;
  }

  // Schedule actions (canPlan): unsaved edits of the weeks are saved first
  async _scheduleAction(act, ds, el) {
    const t = this._loc.t;
    const ed = this._schedEd;
    this._schedErr = '';
    if (act === 'schedule-new' || act === 'schedule-menu') {
      const kind = act === 'schedule-new' ? 'new' : 'menu';
      const id = (el && el.dataset.schedule) || this._schedule;
      if (ed && ed.kind === kind && (kind === 'new' || ed.id === id)) { this._schedEd = null; return this._render(); }
      // Under the button: from its left edge, or from its right edge for a button on the right
      // (the page's ⋮, above the card), so the menu stays in the window
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const b = el ? el.getBoundingClientRect() : { bottom: 0, left: 0, right: 0 };
      const onRight = b.left - card.left > card.width / 2;
      const left = Math.max(8, Math.min(b.left - card.left, card.width - 280));
      this._schedEd = { kind, id, step: kind === 'new' ? 'pick' : 'list', top: b.bottom - card.top + 4,
        ...(onRight ? { right: Math.max(0, card.right - b.right) } : { left }) };
      return this._render();
    }
    if (act === 'schedule-close' || !ed) { this._schedEd = null; return this._render(); }
    if (act === 'schedule-pick') { ed.copy = ds.copy || null; ed.step = 'name'; return this._renderSchedMenu(); }
    if (act === 'schedule-rename-open') { ed.step = 'rename'; return this._renderSchedMenu(); }
    if (act === 'schedule-icon') {
      this._schedEd = null;
      this._render();
      return openMoreInfo(this, this._source().scheduleEntity(ed.id), 'settings');
    }
    if (act === 'schedule-delete') { ed.step = 'delete'; return this._render(); }
    const keep = this._schedules().map((id) => ({ id }));
    const nameInput: any = this.shadowRoot.querySelector('input[data-sched-name]');
    const checkName = (except) => {
      const name = nameInput ? nameInput.value.trim() : '';
      const taken = this._schedules().some((m) => m !== except && this._scheduleName(m).trim().toLowerCase() === name.toLowerCase());
      this._schedErr = !name ? t('nameRequired') : taken ? t('nameTaken') : '';
      if (this._schedErr) this._renderSchedMenu(name);
      return this._schedErr ? null : name;
    };
    let list;
    let created = false;
    if (act === 'schedule-create') {
      const name = checkName(null);
      if (!name) return;
      list = [...keep, ed.copy ? { name, copy_of: ed.copy } : { name }];
      created = true;
    } else if (act === 'schedule-rename') {
      const name = checkName(ed.id);
      if (!name) return;
      list = keep.map((m) => (m.id === ed.id ? { id: m.id, name } : m));
    } else if (act === 'schedule-move') {
      const i = keep.findIndex((m) => m.id === ed.id);
      const j = i + Number(ds.dir);
      if (i < 0 || j < 0 || j >= keep.length) return;
      [keep[i], keep[j]] = [keep[j], keep[i]];
      list = keep;
    } else if (act === 'schedule-delete-confirm') {
      list = keep.filter((m) => m.id !== ed.id);
    } else return;
    this._schedEd = null;
    this._render(); // the menu closes at once, not when the integration answers
    if (this._draft.dirty && !(await this._save())) return;
    try {
      const result = await this._commands().setSchedules(list, this._draft.revision);
      if (result && result.revision != null) this._draft.revision = result.revision;
      if (created && result && result.schedules) {
        this._wantSchedule = result.schedules[result.schedules.length - 1].id;
        // The panel's list: the new schedule's sheet, to set its weeks
        if (this._view === 'schedules') openPanel(`schedules/${this._wantSchedule}`);
      }
    } catch (e) {
      this._msg = e && e.code === 'stale' ? t('stale') : errorText(t, e);
    }
    this._render();
  }

  // Redraws with the schedule menu's name field focused (keeping what was typed)
  _renderSchedMenu(typed?) {
    this._draw();
    this._restoreSchedName(typed, true);
  }

  // Where a change comes from, for the logbook: the panel, or a card (none: older integrations)
  _changeSource() {
    return this._config.panel ? 'panel' : undefined;
  }

  async _activateSchedule(schedule) {
    try {
      await this._commands().activateSchedule(schedule, this._changeSource());
      this._msg = this._loc.t('scheduleActivated', { schedule: this._scheduleName(schedule) });
    } catch (e) {
      this._msg = errorText(this._loc.t, e);
    }
    this._render();
  }

  // The presets tab opened on a thermostat (a slot's setpoint link): its row is brought into
  // view, once
  _showTargetRow() {
    const row: any = this.shadowRoot.querySelector('.pv-table tr.target');
    if (!row || this._targetShown === row.dataset.climate) return;
    this._targetShown = row.dataset.climate;
    if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
  }

  // Whether a week uses a preset in an HVAC mode, heat or cool (a heat/cool slot uses both), on
  // a thermostat that has no value of its own for it there: the preset's temperature for that
  // HVAC mode is what its slot sends. In a heat/cool slot, only a temperature of its own counts
  _usedIn(id, mode) {
    const src = this._source();
    for (const [climate, bySchedule] of Object.entries(src.weeks())) {
      const own = src.mapping(climate)[id] || {};
      const number = (mode === 'cool' ? 'cool_temperature' : 'temperature') in own;
      for (const week of Object.values(bySchedule)) {
        for (const slot of week.flat().map(parseSlot)) {
          if (slot.preset !== id || hasNoPreset(slot)) continue;
          const on = slotModeOn(this._hass, climate, slot) || 'heat';
          // A heat/cool slot sends two numbers: one of the thermostat's own presets gives none
          if (on === 'heat_cool' ? !number : on === mode && !number && !('preset_mode' in own)) return true;
        }
      }
    }
    return false;
  }

  // What a preset gives a thermostat by default, in each HVAC mode (valueOn without a value set
  // by hand): its own preset of the same name when the option allows it, else the preset's
  // temperature, for the HVAC modes the preset has a temperature for
  _cellDefaults(climate, preset) {
    return valueOn(preset, null, this._hass, climate, this._source().usePresets());
  }

  // The cell popover takes the thermostat's current state (#91, lot 3): its setpoint, as the
  // temperature (the cooling one while an air conditioner that also heats cools), its fan and
  // its vanes. Never its preset: the preset is what the user is defining. The user taps OK to save.
  _captureCell(climate) {
    const root = this.shadowRoot;
    const state = captureState(this._hass, climate);
    if (!state) return;
    const field = (selector) => root.querySelector(`.cell-ed ${selector}`);
    if (state.temperature != null) {
      const cooling = (state.hvac === 'cool' || !field('[data-cell-temp]')) && field('[data-cell-cool]');
      (field(cooling ? '[data-cell-cool]' : '[data-cell-temp]') as any).value = this._loc.number(state.temperature);
      this._cellChooseField(!!cooling);
    }
    for (const attr of SETTING_ATTRS) {
      const select: any = field(`[data-cell-setting="${attr}"]`);
      if (!select || !(attr in state.settings)) continue;
      select.value = state.settings[attr];
      select.closest('details').open = true;
    }
    const button = field('[data-act="capture"]');
    if (button) {
      button.innerHTML = `<ha-icon icon="mdi:eyedropper-variant"></ha-icon> ${esc(this._loc.t('captured'))}`;
      setTimeout(() => { if (button.isConnected) button.innerHTML = `<ha-icon icon="mdi:eyedropper-variant"></ha-icon> ${esc(this._loc.t('capture'))}`; }, 2000);
    }
  }

  // A temperature field of the cell popover used: its row is chosen. The cooling field is a row
  // of the heating question on an air conditioner that only cools
  _cellChooseField(cooling) {
    const root = this.shadowRoot;
    if (!cooling) return this._cellChoose('temperature');
    const own: any = root.querySelector('.cell-ed input[name="cell-cool-choice"][value="temperature"]');
    if (own) own.checked = true;
    else this._cellChoose('cool');
    return undefined;
  }

  // Chooses a row of the cell popover: using a row's field means "use it"
  _cellChoose(choice) {
    const radio: any = this.shadowRoot.querySelector(`.cell-ed input[name="cell-choice"][value="${choice}"]`);
    if (radio) radio.checked = true;
    this._cellCoolNote();
  }

  // What an empty cooling field gives, in words: "Default (25°)", "Default (its Comfort preset,
  // 25°)", or "Not used when cooling" when the preset has no value there. `cell`: the value
  // being set by hand, without a cooling temperature
  _coolFallbackText(climate, preset, cell) {
    const t = this._loc.t;
    const value = valueOn(preset, cell, this._hass, climate, this._source().usePresets());
    if ('cool_temperature' in value) return t('presetAuto', { value: `${this._loc.number(value.cool_temperature)}°` });
    if (!('cool_preset_mode' in value)) return t('notWhenCooling');
    const temperature = this._source().coolPresetTemperature(climate, value.cool_preset_mode);
    const name = t('cellOwnPreset', { preset: ownPresetName(this._hass, climate, value.cool_preset_mode, this._loc) });
    return t('presetAuto', { value: typeof temperature === 'number' ? `${name}, ${this._loc.number(temperature)}°` : name });
  }

  // The default when cooling, in the cell popover: what the thermostat then gets, from the row
  // chosen when heating (one of the thermostat's own presets is sent when cooling too)
  _cellCoolNote() {
    const root = this.shadowRoot;
    const note = root.querySelector('.cell-ed .pv-cooldefault');
    const sel = this._cell;
    if (!note || !sel || !sel.climate) return;
    const choice = ((root.querySelector('.cell-ed input[name="cell-choice"]:checked') || {}) as any).value;
    const own = ((root.querySelector('.cell-ed [data-cell-preset]') || {}) as any).value;
    const preset = this._presets().find((l) => l.id === sel.preset);
    if (preset) note.textContent = this._coolFallbackText(sel.climate, preset, choice === 'own' && own ? { preset_mode: own } : null);
  }

  // The cool color of the preset popover follows the color while the user has not chosen one
  _cellCoolColor() {
    const root = this.shadowRoot;
    const cool: any = root.querySelector('.cell-ed [data-cell-cool-color]');
    if (cool && !cool.hasAttribute('data-chosen')) cool.value = derivedCoolColor((root.querySelector('.cell-ed [data-cell-color]') as any).value);
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
    const known = this._source().targets(climate)[preset.id];
    if (known) return known;
    return valueOn(preset, this._source().mapping(climate)[preset.id], this._hass, climate, this._source().usePresets());
  }

  // On a dashboard, the card shows the weeks; the presets, the rules and the thermostats are set
  // in the Chauffage panel (canSetUp, as the panel). The legend of the presets ends with the
  // link to set them; the panel's tabs lead to the rest. In the panel, no link to the panel.
  // The card's top right: the Chauffage panel, for users who may set up (canSetUp), as the
  // dashboards' own panels
  _panelOpenHtml() {
    if (this._config.panel) return '';
    const hass = this._hass;
    if (!this._source().editable) return '';
    const label = this._loc.t('openInPanel', { panel: panelTitle(hass) });
    return `<button class="panel-open" data-navigate="${panelPath('')}" title="${esc(label)}" aria-label="${esc(label)}"><ha-icon icon="chauffage:logo"></ha-icon></button>`;
  }

  _settingsLinkHtml() {
    if (this._config.panel || !this._source().editable) return '';
    return `<span class="mi-link settings-link" role="link" tabindex="0" data-navigate="${panelPath('presets')}">${esc(this._loc.t('setPresets'))}</span>`;
  }

  // Activation rules being edited ({ rules, def }), or the integration's when nothing is edited
  _rulesShown() {
    const src = this._source();
    return this._rulesDraft || { rules: src.rules().map((r) => ({ ...r })), def: src.defaultSchedule() };
  }

  // The "Rules" view: one row per rule (template, the schedule it activates or "given by the
  // template", what it gives now), then the schedule when no rule applies. Rules shown are tried
  // by the integration as they are typed (_syncPreview); otherwise its results for the saved ones.
  _rulesViewHtml() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const { rules, def } = this._rulesShown();
    const saved = src.rules();
    const results = src.ruleResults();
    const schedules = this._schedules();
    const options = (selected) => schedules
      .map((id) => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(this._scheduleName(id))}</option>`).join('');
    const ro = editable ? '' : ' disabled';
    const live = this._preview && this._preview.data;
    // What a rule gives now: tried while typed, or the integration's result for the same saved rule
    const stateOf = (rule, i) => {
      const tried = live && this._preview.rules[i];
      if (tried && tried.template === rule.template && tried.schedule === (rule.schedule || null)) {
        return { result: live.results[i], text: live.texts[i], error: live.errors[i], live: true };
      }
      const s = saved[i];
      const same = s && s.template === rule.template.trim() && (s.schedule || null) === (rule.schedule || null);
      return same ? { result: results[i] } : null;
    };
    const rows = rules.map((rule, i) => {
      const st = rule.template.trim() ? stateOf(rule, i) : null;
      let cls = 'unsaved';
      let label = t('ruleUnsaved');
      if (st && st.result == null) [cls, label] = ['error', t('ruleError')];
      else if (st && !rule.schedule) [cls, label] = st.result ? ['true', `→ ${this._scheduleName(st.result)}`] : ['false', t('ruleNoSchedule')];
      else if (st) [cls, label] = st.result ? ['true', t('ruleTrue')] : ['false', t('ruleFalse')];
      let detail = '';
      if (st && st.live && st.error) detail = st.error;
      else if (st && st.live && st.text != null) {
        detail = t('ruleText', { text: st.text });
        const boolean = BOOLEAN_WORDS.includes(st.text.trim().toLowerCase());
        if (rule.schedule && !boolean) detail += ` · ${t('ruleNotBoolean')}`;
        if (!rule.schedule && !st.result) detail += ` · ${t(boolean ? 'ruleChooseSchedule' : 'ruleNamesNone')}`;
      }
      const tools = editable ? `<span class="rule-tools">
          <button class="btn icon" data-act="rule-up" data-idx="${i}" title="${esc(t('ruleUp'))}"${i ? '' : ' disabled'}>↑</button>
          <button class="btn icon" data-act="rule-down" data-idx="${i}" title="${esc(t('ruleDown'))}"${i < rules.length - 1 ? '' : ' disabled'}>↓</button>
          <button class="btn icon" data-act="rule-delete" data-idx="${i}" title="${esc(t('delete'))}">✕</button></span>` : '';
      return `<div class="rule">
        <div class="rule-head"><span class="rule-num">${i + 1}</span><span class="rule-state ${cls}">${esc(label)}</span>${tools}</div>
        <textarea data-rule-template="${i}" rows="2" spellcheck="false" placeholder="{{ is_state('sensor.edf_tempo_color', 'red') }}"${editable ? '' : ' readonly'}>${esc(rule.template)}</textarea>
        ${detail ? `<div class="rule-result${st.error ? ' error' : ''}">${esc(detail)}</div>` : ''}
        <label class="rule-then">${esc(t('ruleActivates'))} <select data-rule-schedule="${i}"${ro}>
          <option value=""${rule.schedule ? '' : ' selected'}>${esc(t('ruleTemplateGives'))}</option>${options(rule.schedule)}</select></label>
      </div>`;
    }).join('');
    // What the integration's rules give now, and a schedule chosen by hand meanwhile
    let outcome = '';
    if (saved.length) {
      const first = saved.findIndex((_, i) => results[i]);
      const given = first >= 0 ? saved[first].schedule || results[first] : src.defaultSchedule();
      const active = this._activeSchedule();
      outcome = !given ? t('rulesNoOutcome') : t('rulesOutcome', { schedule: this._scheduleName(given) });
      if (given && active && given !== active) outcome += ` ${t('rulesByHand', { schedule: this._scheduleName(active) })}`;
    }
    const actions = editable ? `<div class="ed-actions start">
        <button class="btn" data-act="rule-add">${esc(t('ruleAdd'))}</button>
        ${this._rulesDraft ? `<button class="btn" data-act="rules-cancel">${esc(t('cancel'))}</button>` : ''}
        <button class="btn primary" data-act="rules-save"${this._rulesDraft ? '' : ' disabled'}>${esc(t('save'))}</button></div>` : '';
    return `<div class="rules-view">
      <div class="muted">${esc(t('rulesIntro'))} <a class="rules-try" href="/developer-tools/template" target="_top">${esc(t('rulesTry'))}</a></div>
      ${rules.length ? rows : `<div class="rules-empty muted">${esc(t('rulesEmpty'))}</div>`}
      ${rules.length ? `<label class="rule-then rules-default">${esc(t('rulesOtherwise'))} <select data-rules-default${ro}>
        <option value=""${def ? '' : ' selected'}>${esc(t('rulesKeep'))}</option>${options(def)}</select></label>` : ''}
      ${outcome ? `<div class="rules-outcome">${esc(outcome)}</div>` : ''}
      ${actions}
    </div>`;
  }

  // The rules shown are tried by the integration (chauffage/rules/preview, canSetUp: a template
  // can read any entity), again whenever their entities change; a new try once they are edited
  // (after a short pause in the typing), none outside the "Rules" view
  _syncPreview() {
    if (!this._hass) return;
    const src = this._source();
    const rules = this._view === 'rules' && src.ready && src.editable && this._hass.connection
      ? this._rulesShown().rules.map(plainRule) : [];
    const key = JSON.stringify(rules);
    if (key === this._previewKey) return;
    this._previewKey = key;
    clearTimeout(this._previewTimer);
    this._closePreview();
    if (!rules.length) return;
    this._previewTimer = setTimeout(() => {
      const sub: any = { rules, data: null };
      this._previewSub = sub;
      sub.unsub = this._hass.connection.subscribeMessage((data) => {
        if (this._previewSub !== sub) return;
        sub.data = data;
        this._preview = sub; // kept while the next try starts: rules unchanged still show it
        this._render();
      }, { type: 'chauffage/rules/preview', rules });
      sub.unsub.catch(() => {});
    }, this._previewDelay);
  }

  _closePreview() {
    if (!this._previewSub) return;
    this._previewSub.unsub.then((unsub) => unsub()).catch(() => {});
    this._previewSub = null;
  }

  // Edits the draft of the rules (created from the integration's on the first change; dropped
  // when the edits are undone, so that nothing is left to save)
  _editRules(change) {
    const draft = this._rulesShown();
    change(draft);
    const src = this._source();
    const state = (rules, def) => JSON.stringify([rules.map(plainRule), def || null]);
    this._rulesDraft = state(draft.rules, draft.def) !== state(src.rules(), src.defaultSchedule()) ? draft : null;
    this._msg = '';
  }

  async _rulesAction(act, ds) {
    const i = Number(ds.idx);
    if (act === 'rule-add') {
      this._editRules((d) => d.rules.push({ template: '', schedule: this._schedules()[0] }));
    } else if (act === 'rule-up' || act === 'rule-down') {
      const j = act === 'rule-up' ? i - 1 : i + 1;
      this._editRules((d) => { [d.rules[i], d.rules[j]] = [d.rules[j], d.rules[i]]; });
    } else if (act === 'rule-delete') {
      this._editRules((d) => d.rules.splice(i, 1));
    } else if (act === 'rules-cancel') {
      this._rulesDraft = null;
      this._msg = '';
    } else if (act === 'rules-save') {
      const { rules, def } = this._rulesShown();
      try {
        await this._commands().setRules(
          rules.filter((r) => r.template.trim()).map((r) => plainRule({ ...r, template: r.template.trim() })), def || null);
        this._rulesDraft = null;
        this._msg = this._loc.t('saved');
      } catch (err) {
        this._msg = errorText(this._loc.t, err);
      }
    }
    return this._render();
  }

  // The panel's Thermostats page: every scheduled thermostat, by name. A row says what matters
  // first: the thermostat (it opens its page), whether Chauffage controls it, the cards that show
  // it. Pause is at hand; the rarer actions (open it, its devices, forget it) wait behind ⋮.
  _thermostatsViewHtml() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const scheduled = [...src.scheduled()].sort((a, b) => this._name(a).localeCompare(this._name(b)));
    // The cards that show each thermostat, read from the dashboards once
    if (this._placements === undefined) {
      this._placements = null;
      placements(this._hass).then((p) => { this._placements = p; this._render(); });
    }
    const placesLine = (climate) => (this._placements
      ? `<div class="th-cards">${placesHtml(t, this._placements[climate] || [])}</div>` : '');
    // A row opens the thermostat's sheet; only a paused thermostat has a badge, the exception. Its
    // actions wait in its ⋮ menu (canSetUp)
    const rows = scheduled.map((climate) => {
      const paused = src.paused(climate);
      const open = this._thMore && this._thMore.climate === climate;
      const more = !editable ? ''
        : `<button class="icon-btn${open ? ' on' : ''}" data-act="thermostat-more" data-climate="${esc(climate)}" title="${esc(t('moreActions'))}" aria-label="${esc(t('moreActions'))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></button>`;
      const icon = (this._hass.states[climate] || { attributes: {} }).attributes.icon || 'mdi:thermostat';
      return thRow(`class="th-row${paused ? ' paused' : ''}" data-climate="${esc(climate)}"`, `data-navigate="${esc(weeksPath(climate))}"`, icon,
        `${esc(this._name(climate))}${paused ? ` <span class="badge paused">${esc(t('paused'))}</span>` : ''}`,
        placesLine(climate), more);
    }).join('');
    // Schedule another thermostat: one of the climates Chauffage does not schedule yet
    const climates = Object.keys(this._hass.states).filter((e) => e.startsWith('climate.') && !scheduled.includes(e))
      .sort((a, b) => this._name(a).localeCompare(this._name(b)));
    const add = editable && climates.length ? `<div class="th-add"><div class="th-add-title">${esc(t('addThermostat'))}</div>
        <div class="th-add-row"><select data-add-climate>${climates.map((c) => `<option value="${esc(c)}">${esc(this._name(c))}</option>`).join('')}</select>
        <button class="btn primary" data-act="thermostat-add">${esc(t('scheduleThermostat'))}</button></div></div>` : '';
    // The integration's page: its options, its logs and its diagnostics. Home Assistant keeps it
    // for admins
    const integration = src.admin
      ? `<span class="mi-link" role="link" tabindex="0" data-navigate="${INTEGRATION_PAGE}">${esc(t('integrationPage'))}</span>` : '';
    return `<div class="thermostats-view"><div class="th-hint">${esc(t('thermostatsHint'))}</div><div class="th-list">${rows}</div>${add}
      ${integration ? `<div class="th-foot">${integration}</div>` : ''}</div>${this._thermostatMenuHtml()}`;
  }

  // A thermostat's ⋮ menu on the Thermostats page, floating as every ⋮ menu of the card: Pause or
  // Control, the thermostat and its devices, Forget (then its confirmation, in the menu)
  _thermostatMenuHtml() {
    const m = this._thMore;
    if (!m || !this._source().scheduled().includes(m.climate)) return '';
    const t = this._loc.t;
    const src = this._source();
    const ref = `data-climate="${esc(m.climate)}"`;
    const item = (attrs, label, cls = 'mi') => `<button class="${cls}" ${attrs}><span>${label}</span></button>`;
    const body = this._forgetAsk === m.climate
      ? `<div class="mh">${esc(t('forgetText', { name: this._name(m.climate) }))}</div>
        <div class="sched-btns"><button class="btn small danger" data-act="thermostat-forget-confirm" ${ref}>${esc(t('forgetConfirm'))}</button>
        <button class="btn small" data-act="thermostat-forget-cancel" ${ref}>${esc(t('cancel'))}</button></div>`
      : [
        src.paused(m.climate) ? item(`data-act="resume" ${ref}`, esc(t('resumeShort'))) : item(`data-act="pause" ${ref}`, esc(t('pauseShort'))),
        '<div class="sep"></div>',
        item(`data-more-info="${esc(m.climate)}"`, esc(t('openThermostat'))),
        // The devices' pages: Home Assistant keeps them for admins
        ...(src.admin ? thermostatDevices(this._hass, src, m.climate) : []).map((id) => item(`data-device="${esc(id)}"`, esc(deviceLabel(this._hass, id)))),
        '<div class="sep"></div>',
        item(`data-act="thermostat-forget" ${ref}`, esc(t('forget')), 'mi danger'),
      ].join('');
    return `<div class="menu th-menu" style="top:${m.top}px;right:${m.right}px">${body}</div>`;
  }

  // The panel's Schedules page: one row per schedule, as the Thermostats page, the active one
  // marked; a row opens the schedule's sheet; Activate; its ⋮ renames, moves, deletes (canSetUp, as the panel);
  // + New schedule creates an empty one or a copy, as the card's +
  _schedulesViewHtml() {
    const t = this._loc.t;
    const src = this._source();
    const active = this._activeSchedule();
    const rows = this._schedules().map((id) => {
      const open = this._schedEd && this._schedEd.kind === 'menu' && this._schedEd.id === id;
      const more = !src.editable ? ''
        : `<button class="icon-btn${open ? ' on' : ''}" data-act="schedule-menu" data-schedule="${esc(id)}" title="${esc(t('scheduleMenu'))}" aria-label="${esc(t('scheduleMenu'))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></button>`;
      return thRow(`class="th-row" data-schedule="${esc(id)}"`, `data-navigate="${panelPath(`schedules/${esc(id)}`)}"`,
        src.scheduleIcon(id) || 'mdi:calendar-clock',
        `${esc(this._scheduleName(id))}${id === active ? ` <span class="badge on">${esc(t('panelActive'))}</span>` : ''}`,
        '', more);
    }).join('');
    const add = src.editable ? `<div class="th-add"><button class="btn" data-act="schedule-new">+ ${esc(t('newSchedule'))}</button></div>` : '';
    return `<div class="thermostats-view schedules-view"><div class="th-list">${rows}</div>${add}</div>${this._schedMenuHtml()}`;
  }

  _forget(climate) {
    this._forgetAsk = null;
    return this._call((cmd) => cmd.forget(climate));
  }

  // Table: one column per preset (header: the preset, then its default temperature), one row per
  // thermostat; each cell says what that thermostat does with that preset
  _presetsViewHtml() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const presets = this._presets();
    const sel = this._cell;
    const isSel = (kind, preset, climate) => sel && sel.kind === kind && sel.preset === preset && (sel.climate || null) === (climate || null);
    const cell = (kind, preset, climate, inner, cls) => {
      const on = isSel(kind, preset, climate) ? ' on' : '';
      const attrs = `data-act="cell" data-kind="${kind}" data-preset="${esc(preset || '')}"${climate ? ` data-climate="${esc(climate)}"` : ''}`;
      return editable ? `<button class="cell ${cls}${on}" ${attrs}>${inner}</button>` : `<span class="cell ${cls}">${inner}</span>`;
    };
    // A preset's header holds all of it: its color, name and default temperature
    // On a thermostat's sheet, the presets themselves are not set (they are every thermostat's)
    const definitions = this._config.preset_definitions !== false;
    // Its temperature when heating, then when cooling with an air conditioner: "20° by default
    // · ❄ 25°". Either can be empty
    const anyCools = this._thermostats.some(({ entity }) => listsMode(this._hass, entity, 'cool'));
    const headDefaults = (l) => [l.temperature != null ? esc(t('defaultTemperature', { value: this._loc.number(l.temperature) })) : '',
      anyCools && l.cool_temperature != null ? `${hvacIconHtml('cool')}${esc(`${this._loc.number(l.cool_temperature)}°`)}` : ''].filter(Boolean).join(' · ');
    const headInner = (l) => `<span class="pv-pname"><i style="background:${l.color}"></i>${esc(l.name)}</span>
       <span class="pv-default">${headDefaults(l)}</span>`;
    const head = presets.map((l) => `<th>${definitions ? cell('preset', l.id, null, headInner(l), 'head')
      : `<span class="cell head">${headInner(l)}</span>`}</th>`).join('');
    let unknown = false;
    // What a preset does on a thermostat: its value, then what it is (the thermostat's own preset,
    // set here, or the default)
    const what = (entity, l) => {
      const explicit = src.mapping(entity);
      const target = this._targetOf(entity, l);
      // An air conditioner that only cools has no heating value; one that cools has a cooling
      // value: its cooling temperature, else what its own preset gives when cooling
      const coolOnly = coolsOnly(this._hass, entity);
      const usable = presetModes(target);
      const heats = !coolOnly && usable.includes('heat');
      const temp = heats ? this._presetTemperature(entity, target) : null;
      const coolTemp = listsMode(this._hass, entity, 'cool') ? this._coolPresetTemperature(entity, target) : null;
      let how;
      let cls;
      // On an air conditioner that heats and cools, which of the two values is set here
      const set = explicit[l.id] || {};
      const heatHere = 'temperature' in set || 'preset_mode' in set;
      const setHere = !isReversible(this._hass, entity) || heatHere === ('cool_temperature' in set) ? t('cellSetHere')
        : t(heatHere ? 'cellHeatSetHere' : 'cellCoolSetHere');
      if ('preset_mode' in target) {
        how = t('cellOwnPreset', { preset: ownPresetName(this._hass, entity, target.preset_mode, this._loc) });
        cls = 'preset';
        if (l.id in explicit) how += ` · ${setHere}`;
      } else if (l.id in explicit) {
        how = setHere;
        cls = 'custom';
      } else {
        how = t('cellDefault');
        cls = 'default';
      }
      if (temp == null && heats) unknown = true;
      // A fan or swing setting: one icon whatever their number (the popover details); a cooling
      // setpoint after the heating one, "🔥 20° · ❄ 25°"
      const tuned = SETTING_ATTRS.some((attr) => attr in target) ? '<span class="m tuned"><ha-icon icon="mdi:tune-variant"></ha-icon></span>' : '';
      const cool = coolTemp != null ? `${hvacIconHtml('cool')}${this._loc.number(coolTemp)}°` : '';
      // A heating setpoint known: "20°", with its icon next to a cooling one ("🔥 20° · ❄ 25°");
      // unknown: "?", unless the cooling one is the value. Only cooling, without a cooling
      // value: "—", the setpoint is left alone
      const heat = !heats ? '' : temp != null ? `${cool ? hvacIconHtml('heat') : ''}${this._loc.number(temp)}°` : cool ? '' : '?';
      // Nothing to show: "—" when the preset has no value here, "?" when the temperature of
      // the thermostat's own preset when cooling is not known yet
      const coolUnknown = !heats && usable.includes('cool');
      if (coolUnknown && !cool) unknown = true;
      const setpoint = cool ? `${heat ? `${heat} · ` : ''}${cool}` : heat || (coolUnknown ? '?' : '—');
      return { value: `${setpoint}${tuned}`, how, cls };
    };
    let body;
    const wanted = new URLSearchParams(window.location.search).get('thermostat');
    if (definitions) {
      const rows = this._thermostats.map(({ entity }) => {
        const cells = presets.map((l) => {
          const w = what(entity, l);
          return `<td>${cell('thermostat', l.id, entity, `<span class="pv-val">${w.value}</span> <span class="pv-how">${esc(w.how)}</span>`, w.cls)}</td>`;
        }).join('');
        // The row a slot's setpoint link asks for (?thermostat=…) stands out
        return `<tr data-climate="${esc(entity)}"${wanted === entity ? ' class="target"' : ''}><th class="name">${this._moreInfoLink(entity)}</th>${cells}</tr>`;
      }).join('');
      body = `<div class="table-outer"><div class="table-wrap"><table class="pv-table">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
    } else {
      // One thermostat (its sheet in the panel): a list, one item per preset, not a table of one
      // row; an item opens the same editor as a cell of the table
      const entity = this._thermostats[0].entity;
      const items = presets.map((l) => {
        const w = what(entity, l);
        return cell('thermostat', l.id, entity, `<span class="pv-pname"><i style="background:${l.color}"></i>${esc(l.name)}</span>
          <span class="pv-val">${w.value}</span> <span class="pv-how">${esc(w.how)}</span>`, `pv-item ${w.cls}`);
      }).join('');
      body = `<div class="pv-list">${items}</div>`;
    }
    return `<div class="presets-view">
      ${definitions ? `<div class="pv-intro muted">${esc(t('presetsIntro'))}</div>` : ''}
      ${body}
      ${unknown ? `<div class="pv-note muted">${esc(t('presetsUnknown'))}</div>` : ''}
      ${editable && definitions ? `<button class="btn pv-add${sel && sel.kind === 'new' ? ' on' : ''}" data-act="cell" data-kind="new" data-preset="">${esc(t('addPresetButton'))}</button>` : ''}
      ${this._cellPanelHtml()}
    </div>`;
  }

  // Popover editing the selected cell
  _cellPanelHtml() {
    const sel = this._cell;
    if (!sel) return '';
    const t = this._loc.t;
    const src = this._source();
    const presets = this._presets();
    const preset = presets.find((l) => l.id === sel.preset) || { id: '', name: '', color: '#9e9e9e', temperature: 19 };
    // A temperature field, in the user's number format, read with either decimal separator;
    // `attr`: data-cell-temp (heating) or data-cell-cool (cooling, empty without a value), with
    // its aria-label
    // Its − and its + move it by the thermostat's step (half a degree for a preset's default)
    const tempInput = (value, attr = 'data-cell-temp', label = t('presetTemperature')) => stepperHtml(this._loc, attr, value, 'cell-step',
      sel.kind === 'thermostat' ? stepOf(this._hass, sel.climate) : 0.5, label);
    let title;
    let body;
    if (sel.kind === 'thermostat') {
      title = t('presetFor', { preset: preset.name, name: this._name(sel.climate) });
      const explicit = src.mapping(sel.climate)[preset.id] || {};
      const st = this._hass.states[sel.climate];
      // The thermostat's presets, the one named like this preset (what "default" uses) first
      const own = ((st && st.attributes.preset_modes) || []).map(String)
        .filter((p) => !MANUAL_PRESETS.includes(p.toLowerCase()))
        .sort((a, b) => +(b === preset.id) - +(a === preset.id));
      // What "default" gives: the thermostat's own preset of the same name (when the "use the
      // thermostats' presets" option allows it), else the preset's default temperature
      const defaults: any = this._cellDefaults(sel.climate, preset);
      const degrees = (value) => `${this._loc.number(value)}°`;
      // An air conditioner that only cools: no heating value. Its own preset, or a cooling
      // temperature
      const coolOnly = coolsOnly(this._hass, sel.climate);
      const ownName = (p) => ownPresetName(this._hass, sel.climate, p, this._loc);
      // What the default gives: when cooling on a unit that only cools, else when heating
      const defaultTemperature = coolOnly ? this._coolPresetTemperature(sel.climate, defaults) : this._presetTemperature(sel.climate, defaults);
      const defaultOwn = coolOnly ? defaults.cool_preset_mode : defaults.preset_mode;
      const defaultText = defaultOwn
        ? `${t('cellOwnPreset', { preset: ownName(defaultOwn) })}${defaultTemperature != null ? `, ${degrees(defaultTemperature)}` : ''}`
        : defaultTemperature != null ? degrees(defaultTemperature) : t(coolOnly ? 'notWhenCooling' : 'notWhenHeating');
      // One question, three answers: the default, one of the thermostat's own presets, or a
      // temperature. The cell opens on what is stored; using a row's field chooses the row
      const choice = 'preset_mode' in explicit ? 'own' : 'temperature' in explicit ? 'temperature' : 'default';
      const temp = 'temperature' in explicit ? explicit.temperature
        : this._presetTemperature(sel.climate, this._targetOf(sel.climate, preset)) ?? preset.temperature ?? 19;
      const radio = (name, checked) => (value, label, field = '', cls = '') => `<label class="pv-row${cls}"><input type="radio" name="${name}" value="${value}"${checked === value ? ' checked' : ''}>
          <span${cls === ' pv-cooldefault-row' ? ' class="pv-cooldefault"' : ''}>${esc(label)}</span>${field ? `<span class="pv-field">${field}</span>` : ''}</label>`;
      const picked = own.includes(explicit.preset_mode) ? explicit.preset_mode : own[0];
      const options = own.map((p) => `<option value="${esc(p)}"${picked === p ? ' selected' : ''}>${esc(ownName(p))}</option>`).join('');
      const reversible = isReversible(this._hass, sel.climate);
      const cool = explicit.cool_temperature;
      // The cooling field opens on what the thermostat gets: its own value, else the default
      const coolDefault = this._coolPresetTemperature(sel.climate, defaults);
      // Empty (its own preset's temperature is not known): the preset's cooling temperature, as a hint
      const coolHint = preset.cool_temperature != null ? ` placeholder="${esc(this._loc.number(preset.cool_temperature))}"` : '';
      const coolField = tempInput(cool ?? coolDefault, `data-cell-cool${coolHint}`, t('temperatureCoolAria'));
      // Only cooling: one question, the default, one of its own presets, or a temperature
      const heatChoice = coolOnly && cool != null ? 'cool' : choice;
      const row = radio('cell-choice', heatChoice);
      const rows = row('default', t('presetAuto', { value: defaultText }))
        + (own.length ? row('own', t('cellOwn'), `<select data-cell-preset aria-label="${esc(t('ownPreset'))}">${options}</select>`) : '')
        + (coolOnly ? row('cool', t('presetTemperature'), coolField, ' pv-cool')
          : row('temperature', t('presetTemperature'), tempInput(temp, 'data-cell-temp', reversible ? t('temperatureHeatAria') : t('presetTemperature'))));
      // An air conditioner that heats and cools: the same question when cooling, with the same
      // rows. The default says what the thermostat then gets: "Default (25°)", "Default (its
      // Eco preset, 27°)" or "Not used when cooling"
      const fallback = this._coolFallbackText(sel.climate, preset, 'preset_mode' in explicit ? { preset_mode: explicit.preset_mode } : null);
      const coolRow = radio('cell-cool-choice', cool != null ? 'temperature' : 'default');
      const cooling = !reversible ? '' : `<div class="pv-when">${hvacIcon('cool')}${esc(t('whenCooling'))}</div>
        <div class="pv-choices" role="radiogroup">${coolRow('default', fallback, '', ' pv-cooldefault-row')}${coolRow('temperature', t('presetTemperature'), coolField, ' pv-cool')}</div>`;
      // The fan and the vanes, folded (lot 3)
      const more = moreSettingsHtml(this._hass, sel.climate, this._loc, explicit, null, false, 'data-cell-setting');
      // Its own presets are set on its device (their temperatures, on a Versatile Thermostat)
      const device = own.length ? this._deviceLink(this._deviceOf(sel.climate), t('ownPresetsOnDevice')) : '';
      body = `${reversible ? `<div class="pv-when">${hvacIcon('heat')}${esc(t('whenHeating'))}</div>` : coolOnly ? `<div class="pv-when">${hvacIcon('cool')}${esc(t('whenCooling'))}</div>` : ''}
        <div class="pv-choices" role="radiogroup">${rows}</div>
        ${cooling}
        ${more}
        <div class="capture-row">${captureButtonHtml(this._hass, sel.climate, this._loc)}</div>
        ${device ? `<div class="pv-device">${device}</div>` : ''}`;
      return this._cellPopover(preset, title, body, `<button class="btn primary" data-act="cell-apply">${esc(t('apply'))}</button>`, sel.climate);
    } else {
      const isNew = sel.kind === 'new';
      title = isNew ? t('newPreset') : preset.name;
      if (!isNew && sel.deleting) {
        // Deleting: what replaces it where it is used (schedules, overrides)
        const used = src.usedPresets().includes(preset.id);
        const others = presets.filter((l) => l.id !== preset.id);
        body = `<div class="pv-delete">${esc(t('confirmDeletePreset', { name: preset.name }))}
          ${used ? `<label class="pv-replace">${esc(t('replaceWith'))} <select data-cell-replacement>${others.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label>` : ''}</div>`;
        return this._cellPopover(preset, title, body, `<button class="btn" data-act="cell-delete-cancel">${esc(t('cancel'))}</button>
          <button class="btn danger" data-act="cell-delete-confirm">${esc(t('deletePreset'))}</button>`);
      }
      // With an air conditioner: its color when heating and its color when cooling, each on a
      // row with its label. Without one: its color, beside its name
      const cools = this._thermostats.some(({ entity }) => listsMode(this._hass, entity, 'cool'));
      const color = `<input type="color" data-cell-color value="${esc(isNew ? '#9e9e9e' : preset.color)}" title="${esc(t(cools ? 'presetHeatColor' : 'presetColor'))}">`;
      body = `<div class="pv-fields">
          <span>${esc(t('presetName'))}</span>
          <span class="pv-name">${cools ? '' : color}
            <input type="text" data-cell-name value="${esc(isNew ? '' : preset.name)}" placeholder="${esc(t('presetName'))}"></span>
          <span>${esc(t(cools ? 'whenHeating' : 'presetDefaultTemperature'))}</span>${tempInput(isNew ? 19 : preset.temperature, 'data-cell-temp', t(cools ? 'temperatureHeatAria' : 'presetTemperature'))}
          ${cools ? `<span>${esc(t('whenCooling'))}</span>${tempInput(isNew ? null : preset.cool_temperature, 'data-cell-cool', t('temperatureCoolAria'))}
          <span>${esc(t('presetHeatColor'))}</span><span class="pv-name">${color}</span>
          <span>${esc(t('presetCoolColor'))}</span>
          <span class="pv-name"><input type="color" data-cell-cool-color${preset.cool_color ? ' data-chosen' : ''} value="${esc(coolColor(isNew ? { color: '#9e9e9e' } : preset))}" title="${esc(t('presetCoolColor'))}"></span>` : ''}
        </div>
        <div class="muted">${esc(t('defaultHelp'))}</div>`;
      if (!isNew && presets.length > 1) {
        return this._cellPopover(preset, title, body, `<button class="btn danger pv-del" data-act="cell-delete">${esc(t('deleteMenu'))}</button>
          <button class="btn primary" data-act="cell-apply">${esc(t('apply'))}</button>`);
      }
    }
    return this._cellPopover(sel.kind === 'new' ? null : preset, title, body,
      `<button class="btn primary" data-act="cell-apply">${esc(t('apply'))}</button>`, sel.kind === 'thermostat' ? sel.climate : null);
  }

  // Popover of a cell, placed under it by _placeEditor() after rendering; a thermostat's title
  // opens it
  _cellPopover(preset, title, body, buttons, climate = null) {
    const t = this._loc.t;
    const dot = preset ? `<i class="pv-dot" style="background:${preset.color}"></i>` : '';
    const heading = climate ? `${esc(preset.name)} · ${this._moreInfoLink(climate)}` : esc(title);
    return `<div class="editor cell-ed" data-panel="cell">
      <div class="ed-head"><strong>${dot}${heading}</strong>
        <button class="btn icon close" data-act="cell-close" title="${esc(t('close'))}">✕</button></div>
      <div class="ed-body">${body}
        ${this._cellError ? `<div class="pv-error">${esc(this._cellError)}</div>` : ''}</div>
      <div class="ed-actions pv-foot">${buttons}</div>
    </div>`;
  }

  async _cellAction(act, ds, el) {
    const root = this.shadowRoot;
    if (act === 'cell') {
      const same = this._cell && this._cell.kind === ds.kind && this._cell.preset === ds.preset && (this._cell.climate || '') === (ds.climate || '');
      this._cell = same ? null : { kind: ds.kind, preset: ds.preset, climate: ds.climate };
      this._cellError = null;
      return this._render();
    }
    this._cellError = null;
    const sel = this._cell;
    if (act === 'cell-close' || !sel) { this._cell = null; return this._render(); }
    if (act === 'cell-delete' || act === 'cell-delete-cancel') {
      sel.deleting = act === 'cell-delete';
      return this._render();
    }
    const input: any = root.querySelector('[data-cell-temp]');
    const cool: any = root.querySelector('[data-cell-cool]');
    if (act === 'cell-step') { // the field of the row of the button tapped: heating or cooling
      const field = (el && el.closest('.pv-temp') || root).querySelector('input') || input;
      // An empty field starts from a usual temperature for its HVAC mode: 25° when cooling,
      // 19° when heating. Never from the other field: a tap on − gave a cooling setpoint of 19,5°
      const typed = parseDecimal(field.value);
      const from = Number.isFinite(typed) ? typed : field === cool ? 25 : 19;
      const next = Math.round((from + Number(ds.delta)) * 100) / 100;
      field.value = this._loc.number(sel.kind === 'thermostat' ? fitTemperature(this._hass, sel.climate, next) : next);
      this._cellChooseField(field === cool);
      return undefined;
    }
    if (act === 'capture') { // the thermostat's current state fills the fields; OK saves (lot 3)
      this._captureCell(sel.climate);
      return undefined;
    }
    const src = this._source();
    // `cooling`: its cooling temperature and its cool color, when it has them (presetsOf)
    const presets = presetsOf(src, this._loc).map(({ id, name, color, temperature, ...cooling }) => (
      { id, name, color, temperature: temperature === undefined ? 19 : temperature, ...cooling }));
    const value = (sel2) => { const el = root.querySelector(sel2); return el ? el.value : ''; };
    // The cool color is stored only when the user chose one that is not the derived one: a
    // preset without one keeps following its color
    // Either temperature can be empty: the preset is then not used in that HVAC mode. Without
    // an air conditioner, the popover has no cooling field: the cooling temperature stays
    const edited = (l) => {
      const { cool_color: _, cool_temperature: kept, ...rest } = l;
      const color = value('[data-cell-color]');
      const coolField: any = root.querySelector('[data-cell-cool-color]');
      const coolColorChosen = coolField ? (coolField.hasAttribute('data-chosen') && coolField.value !== derivedCoolColor(color) ? coolField.value : null) : l.cool_color;
      const number = (field) => (Number.isFinite(parseDecimal(field.value)) ? parseDecimal(field.value) : null);
      const coolTemperature = cool ? number(cool) : kept ?? null;
      return { ...rest, name: value('[data-cell-name]').trim(), color, temperature: number(input),
        ...(coolTemperature != null ? { cool_temperature: coolTemperature } : {}), ...(coolColorChosen ? { cool_color: coolColorChosen } : {}) };
    };
    try {
      if (sel.kind === 'thermostat') {
        // The row chosen: the default (nothing stored), one of its own presets, or a temperature;
        // then a cooling setpoint, a fan and vanes when they are set
        // A temperature is stored as the thermostat takes it, on its step: the cell shows what
        // is stored
        const choice = value('.cell-ed input[name="cell-choice"]:checked');
        const coolChoice = value('.cell-ed input[name="cell-cool-choice"]:checked');
        const target: any = {};
        if (choice === 'own') target.preset_mode = value('[data-cell-preset]');
        else if (choice === 'temperature') {
          if (!Number.isFinite(parseDecimal(input.value))) return undefined;
          target.temperature = fitTemperature(this._hass, sel.climate, parseDecimal(input.value));
        }
        if (cool && (choice === 'cool' || coolChoice === 'temperature')) {
          if (!Number.isFinite(parseDecimal(cool.value))) return undefined;
          target.cool_temperature = fitTemperature(this._hass, sel.climate, parseDecimal(cool.value));
        }
        for (const attr of SETTING_ATTRS) if (value(`[data-cell-setting="${attr}"]`)) target[attr] = value(`[data-cell-setting="${attr}"]`);
        // Its own preset of the same name, chosen by hand: the default, so nothing more is stored
        const preset = presets.find((l) => l.id === sel.preset);
        const defaults: any = this._cellDefaults(sel.climate, preset);
        if (target.preset_mode && target.preset_mode === defaults.preset_mode) delete target.preset_mode;
        const mapping = { ...src.mapping(sel.climate) };
        if (Object.keys(target).length) mapping[sel.preset] = target; else delete mapping[sel.preset];
        // The same as what is stored (the default kept): nothing to send
        if (JSON.stringify(mapping) !== JSON.stringify(src.mapping(sel.climate))) await this._commands().setMapping(sel.climate, mapping);
      } else if (sel.kind === 'new') {
        await this._commands().setPresets([...presets, edited({})], {});
      } else if (act === 'cell-delete-confirm') {
        const replacement = value('[data-cell-replacement]');
        await this._commands().setPresets(presets.filter((l) => l.id !== sel.preset), replacement ? { [sel.preset]: replacement } : {});
      } else {
        // A temperature that the weeks use stays: its slots would have nothing to send
        const old = presets.find((l) => l.id === sel.preset);
        const next = edited(old);
        const lost = [['heat', 'temperature'], ['cool', 'cool_temperature']]
          .find(([mode, key]) => old[key] != null && next[key] == null && this._usedIn(old.id, mode));
        if (lost) {
          this._cellError = this._loc.t(lost[0] === 'cool' ? 'presetUsedCooling' : 'presetUsedHeating');
          return this._render();
        }
        await this._commands().setPresets(presets.map((l) => (l.id === sel.preset ? next : l)), {});
      }
      this._cell = null;
      this._msg = this._loc.t('saved');
    } catch (err) {
      this._msg = errorText(this._loc.t, err);
    }
    return this._render();
  }

  // Opens HA's standard more-info dialog (same mechanism as the built-in tiles)
  _openMoreInfo(entityId) {
    openMoreInfo(this, entityId);
  }

  _moreInfoLink(climate) {
    return entityLinkHtml(climate, this._name(climate), this._loc.t('openThermostat'));
  }

  _deviceLink(id, label = this._loc.t('device')) {
    return deviceLinkHtml(this._hass, id, label);
  }

  _deviceOf(entity) {
    return deviceOf(this._hass, entity);
  }

  // The names shown, invisible, in every cell of the names column: each row sizes the column on
  // the longest one, so that all rows (separate grids) have the same column
  _nameSizer() {
    return `<span class="sizer" aria-hidden="true">${this._shown.map((c) => `<span>${esc(this._name(c))}</span>`).join('')}</span>`;
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

  // The HVAC mode a new slot on a preset takes in an off slot or in a fan-only slot: the one of
  // the slot on a preset before it in the day. Null without one: the thermostat's default (heat)
  _modeBefore(climate, segs, idx) {
    for (let i = idx - 1; i >= 0; i -= 1) if (!hasNoPreset(segs[i])) return slotModeOn(this._hass, climate, segs[i]);
    return null;
  }

  // The settings a piece cut out of a slot keeps: all of them, its heat or cool too. Out of an
  // off slot or of a fan-only slot, the piece is on a preset: it keeps the fan and the vanes of
  // a fan-only slot, and takes the HVAC mode of the slot on a preset before it
  _pieceSettings(climate, segs, idx) {
    const s = segs[idx];
    if (!hasNoPreset(s)) return s.settings;
    const mode = this._modeBefore(climate, segs, idx);
    return { ...pieceSettings(s), ...(mode ? { hvac_mode: mode } : {}) };
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
    this._sel = null;
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
    if (this._sel && this._sel.climate === climate && this._sel.day === day) this._sel = null;
    this._focus = climate;
    this._draft.dirty = true;
    this._msg = this._loc.t('pastedOn', { name: this._name(climate), day: this._rowLabel(day, 'long') }) + this._droppedText(fit.dropped);
    this._render();
  }

  _action(act, ds, el) {
    // What edits the weeks or the schedules needs Plan (canPlan), on a thermostat the user may edit
    const editsWeeks = ['copyweek-menu', 'copy-week', 'copy-day', 'paste-day', 'preset', 'slot-off', 'slot-mode', 'week-hvac', 'insert', 'delete'].includes(act)
      || act.startsWith('fill-') || (act.startsWith('schedule-') && act !== 'schedule-close' && !this._config.view);
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
    if (act === 'pause' || act === 'resume') {
      this._thMore = null;
      return this._setPaused(ds.climate, act === 'pause');
    }
    if (act === 'thermostat-more') {
      // Under its button, as the row menu
      const card = this.shadowRoot.querySelector('ha-card').getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const m = this._thMore;
      this._thMore = m && m.climate === ds.climate ? null
        : { climate: ds.climate, top: b.bottom - card.top + 4, right: card.right - b.right };
      this._forgetAsk = null;
      return this._render();
    }
    if (act === 'thermostat-forget' || act === 'thermostat-forget-cancel') {
      this._forgetAsk = act === 'thermostat-forget' ? ds.climate : null;
      return this._render();
    }
    if (act === 'thermostat-forget-confirm') {
      this._thMore = null;
      return this._forget(ds.climate);
    }
    if (act === 'thermostat-add') {
      // Scheduled with the week of a new schedule in every schedule (as a thermostat added to a card)
      const climate = (this.shadowRoot.querySelector('[data-add-climate]') as any).value;
      return this._call((cmd) => cmd.saveWeeks({ [climate]: {} }, { [climate]: null }));
    }
    if (act === 'override-new') { // today's row menu: set a temporary setpoint
      this._sel = null;
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
    if (act === 'cell' || act.startsWith('cell-') || (act === 'capture' && this._cell)) return this._cellAction(act, ds, el);
    if (act.startsWith('rule-') || act.startsWith('rules-')) return this._rulesAction(act, ds);
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
      this._sel = null;
      return this._history.shown ? this._toggleHistory() : this._render();
    }
    if (act === 'zoom') return this._toggleZoom(ds.climate, Number(ds.day));
    if (act === 'show-all') {
      this._shown = this._thermostats.map((t) => t.entity);
      this._saveShown();
      return this._render();
    }
    if (!this._sel) return;
    const { climate, day, idx } = this._sel;
    const segs = this._week(climate)[day];
    const s = segs[idx];
    const step = this._config.step;
    if (act === 'close') {
      this._sel = null;
      this._render();
    } else if (act === 'preset') {
      // A preset: the slot keeps its fan and vanes, and its heat or cool. An off slot or a
      // fan-only slot takes the HVAC mode of the slot on a preset before it
      this._changeSlot(climate, day, idx, (slot) => slotOf(slot.start, ds.preset, this._pieceSettings(climate, segs, idx)));
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
      this._sel = null;
      this._commit(climate, day, null);
    }
  }
}
