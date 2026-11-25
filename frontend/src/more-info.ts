import { INTEGRATION, dataSource, filterActive } from './client.ts';
import { slotColor } from './colors.ts';
import { DAY_MIN, errorText, esc, hasNoPreset, isFan, isOff, nowMin, pct, slotMode, todayIdx } from './common.ts';
import { atMinutes, endMovedBy, endOfField, linksByKeyboard, listenTimeFields, timeFieldDone } from './fields.ts';
import { COLS3_STYLE, FAN_STYLE, FIELD_BOX, OFF_COLOR, dayOn, fullNames, hasModeRow, hvacIcon, hvacSlotStyle, parseDecimal, rowsOfDays } from './hvac.ts';
import { makeLocale } from './i18n/locale.ts';
import { leaveMoreInfo, navigate, openMoreInfo, panelPath, placements, weeksPath } from './links.ts';
import { OVERRIDE_TEMPERATURE, RESUME, activeWeek, focusedField, nextOverride, overrideBodyHtml, overrideSummary, overrideUntilText, overrideWithTemperature, planText, restoreTyped, slotName, stepOverrideTemperature, withoutAir } from './override-edit.ts';
import { overridePieces, rowPiece } from './override.ts';
import { presetOf, presetsOf } from './presets.ts';
import { openSettings } from './settings-dialog.ts';
import { serializeDay } from './slots.ts';
import { LINK_STYLE, TIME_FIELD_STYLE } from './styles.ts';

// =====================================================================
//  Block added to the more-info dialog of a scheduled thermostat: current day,
//  week of the active schedule, editable temporary override.
//  HA offers no official extension point: the block is inserted into its internal
//  structure. If an HA update changes it, the block no longer shows up, with no
//  other consequence.
// =====================================================================

// The block uses its defaults: the language of the Home Assistant profile, identical days grouped,
// and this step for the end of an override, in minutes
const MORE_INFO_STEP = 15;

export class ChauffageMoreInfo extends HTMLElement {
  // The fields of the element, untyped until the rewrite of the card gives them a type
  declare _changeOpen: any;
  declare _creating: any;
  declare _drag: any;
  declare _entity: any;
  declare _error: any;
  declare _hass: any;
  declare _key: any;
  declare _loc: any;
  declare _pending: any;
  declare _pieces: any;
  declare _placements: any;
  declare _redrawLater: any;
  declare _unlisten: any;
  declare _weekOpen: any;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    linksByKeyboard(this.shadowRoot);
    this._pending = undefined; // override sent, waiting for the integration's update
    this._drag = null;
    const root = this.shadowRoot;
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('change', (e) => this._onChange(e));
    root.addEventListener('pointerdown', (e) => this._onDown(e));
    root.addEventListener('pointermove', (e) => this._onMove(e));
    root.addEventListener('pointerup', () => this._onUp());
    root.addEventListener('pointercancel', () => this._onUp());
    // The end field of an override left: the end typed is applied
    listenTimeFields(this, (el) => timeFieldDone(this, el, (minutes) => this._setEnd(endOfField(el, minutes))));
  }

  set entity(id) {
    if (id !== this._entity) { this._entity = id; this._key = null; this._pending = undefined; }
  }

  get entity() { return this._entity; }

  set hass(hass) {
    this._hass = hass;
    const s = hass.states;
    this._loc = makeLocale(hass);
    const src = dataSource(hass);
    if (src.available && !this._unlisten) {
      this._unlisten = INTEGRATION.listen(() => { if (this._hass) this.hass = this._hass; });
    }
    const { weeks, overrides, schedule, thermostats } = src.stamps;
    if (this._key && overrides !== this._key[2]) this._pending = undefined;
    if (this._key && thermostats !== this._key[4]) this._error = null; // paused or resumed: a resume error is over
    // Redraw only when relevant data changed (or every new minute)
    // (the access level gives the links; the registry gives the device)
    const key = [s[this._entity], weeks, overrides, schedule, thermostats, Math.floor(Date.now() / 60000), this._loc.signature,
      src.stamps.access, hass.entities && hass.entities[this._entity]];
    if (this._key && key.every((v, i) => v === this._key[i])) return;
    if (this._drag) return; // no redraw while dragging
    if (focusedField(this.shadowRoot, 'input.time')) { this._redrawLater = true; return; } // nor while the end is typed
    this._key = key;
    this._render();
  }

  _preset(id) {
    return presetOf(presetsOf(dataSource(this._hass), this._loc), id, this._loc);
  }

  _currentOverride() {
    if (this._pending !== undefined) return this._pending;
    return filterActive(dataSource(this._hass).overrides())[this._entity] || null;
  }

  disconnectedCallback() {
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
  }

  _send(override) {
    override = withoutAir(override);
    // Set from this block: the block stays unfolded on a thermostat card, for the next tap
    if (override && this._creating) this._changeOpen = true;
    this._pending = override;
    this._render();
    dataSource(this._hass).setOverride(this._entity, override)
      .catch(() => { this._pending = undefined; this._render(); });
  }

  // New end: at least one step after now
  _setEnd(endsAt) {
    const d = this._currentOverride();
    if (!d) return;
    const min = new Date(Date.now() + MORE_INFO_STEP * 60000);
    const { ends_at: _reason, ...chosen } = d; // an end the user chooses: no longer the next slot
    this._send({ ...chosen, end: (endsAt < min ? min : endsAt).toISOString() });
  }

  // The active schedule's name, opening its page in the panel with Set up (canSetUp), and the
  // thermostat's week in it
  _week() {
    const src = dataSource(this._hass);
    const schedule = src.activeSchedule();
    const name = schedule ? src.scheduleName(schedule) : '';
    const link = schedule && src.editable
      ? `<span class="mi-link" role="link" tabindex="0" data-navigate="${panelPath(`schedules/${esc(schedule)}`)}">${esc(name)}</span>` : esc(name);
    return { schedule: link, week: activeWeek(src, this._entity) };
  }

  _bar(stored, piece, showNow, big) {
    const segs = dayOn(this._hass, this._entity, stored); // an air conditioner's slots heat or cool
    const segHtml = segs.map((s, i) => {
      const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
      // An off slot is grey, a fan-only slot has Home Assistant's color of fan only, a cooling
      // slot its preset's cool color; each with the icon of its HVAC mode (#91)
      const off = isOff(s);
      const fan = isFan(s);
      const time = big && end - s.start >= (this._loc.hour12 ? 120 : 90) ? this._loc.time(s.start) : '';
      const txt = big ? `<span>${time}${hvacIcon(slotMode(s))}</span>` : '';
      const what = slotName(s, presetsOf(dataSource(this._hass), this._loc), this._loc);
      const background = off ? `background:${OFF_COLOR}` : fan ? '' : hasNoPreset(s) ? hvacSlotStyle(slotMode(s)) : `background:${slotColor(this._preset(s.preset), s)}`;
      return `<div class="seg${off ? ' off' : ''}${fan ? ' fan' : ''}" style="left:${pct(s.start)}%;width:${pct(end - s.start)}%;${background}" title="${this._loc.time(s.start)} → ${this._loc.time(end)} · ${esc(what)}">${txt}</div>`;
    }).join('');
    let override = '';
    if (piece) {
      // End handle only on the large bar of the day the override ends
      const handle = big && piece.isLast
        ? `<div class="override-handle" data-day="${piece.day}" title="${esc(this._loc.t('dragToChangeEnd'))}"><span class="tip">${this._loc.time(piece.end)}</span></div>`
        : '';
      override = `<div class="override" style="left:${pct(piece.start)}%;width:${pct(piece.end - piece.start)}%">${handle}</div>`;
    }
    const now = showNow ? `<div class="now" style="left:${pct(nowMin())}%"></div>` : '';
    return `<div class="bar${big ? ' big' : ''}">${segHtml}${override}${now}</div>`;
  }

  _render() {
    const t = this._loc.t;
    const { schedule, week } = this._week();
    if (!week) { this.shadowRoot.innerHTML = ''; this.style.display = 'none'; return; }
    // A temperature being typed survives the redraw (a new state of the thermostat, every minute)
    const focused = focusedField(this.shadowRoot, OVERRIDE_TEMPERATURE);
    const typed = focused ? focused.value : null;
    this.style.display = '';
    const today = todayIdx();
    const d = this._currentOverride();
    const pieces = overridePieces(d);
    this._pieces = pieces;

    const segs = week[today];
    // Next to Home Assistant's own dialog: the HVAC modes in full, as it names them
    const names = fullNames(this._loc, this._hass, this._entity);
    const followText = planText(dataSource(this._hass).planned(this._entity), (id) => this._preset(id).name, names,
      hasModeRow(this._hass, this._entity));

    let status;
    let endDay = '';
    const src = dataSource(this._hass);
    // What changes an override, or sets one: the same controls as in the card's popover
    const body = (override) => overrideBodyHtml(override, src, this._entity, this._hass, this._loc,
      { step: MORE_INFO_STEP, line: 'line', actions: 'btns', endLoc: names });
    if (d) {
      this._creating = false;
      const lastPiece = pieces.find((p) => p.isLast);
      const change = body(d);
      const resume = `<button class="danger" data-act="override-del">${esc(t('resume'))}</button>`;
      // What the override is, until when, and what comes next: "Cool · Comfort 25° until 23:00,
      // then Heat · Eco". On a thermostat card, the rest is folded under "Change". In the
      // more-info dialog, everything shows
      status = `<div class="status derogation">
        <div class="line">${this.hasAttribute('embedded')
    // A thermostat card names the override in its header: here, until when. The more-info
    // dialog says the end in the block of its end
    ? `<span class="override-until">⏱ ${esc(overrideUntilText(d, src, this._entity, names, this._hass))}</span>`
    : `<span class="override-value">⏱ ${esc(overrideSummary(d, src, this._entity, this._loc, this._hass))}</span>`}
        </div>
        ${this.hasAttribute('embedded')
    ? `<div class="btns">${resume}</div><details class="change"${this._changeOpen ? ' open' : ''}><summary>${esc(t('change'))}</summary><div class="change-body">${change}</div></details>`
    : `${change}<div class="btns">${resume}</div>`}
      </div>`;
      // Ends on another day: also show that day's large bar (with the handle)
      if (lastPiece && lastPiece.day !== today) {
        endDay = `<div class="today-lbl">${this._loc.days[lastPiece.day]}</div>
          ${this._bar(week[lastPiece.day], lastPiece, false, true)}`;
      }
    } else if (dataSource(this._hass).paused(this._entity)) {
      this._creating = false;
      // Resume is at the foot, in place of Pause
      status = `<div class="status"><div class="line"><span class="muted">${esc(t('pausedInfo'))}</span></div></div>`;
    } else {
      if (!this._creating) this._changeOpen = false; // the next override starts folded
      // "Temporary setpoint…" unfolds the same controls, to set one
      status = `<div class="status${this._creating ? ' derogation' : ''}">
        <div class="line"><span><span class="muted">${esc(t('followsSchedule'))}</span> ${esc(followText)}</span>
          <button data-new-override>${esc(t('newOverride'))}</button></div>
        ${this._creating ? body(null) : ''}
      </div>`;
    }

    // Identical days on one row, like the schedule card
    const order = this._loc.dayOrder;
    const rows = rowsOfDays(order, (d) => serializeDay(dayOn(this._hass, this._entity, week[d])).join(','))
      .map((days) => `<div class="row${days.includes(today) ? ' today' : ''}">
        <span>${esc(this._loc.daysLabel(days))}</span>${this._bar(week[days[0]], rowPiece(pieces, days), false, false)}</div>`).join('');
    const ticks = [0, 6, 12, 18, 24].map((h) => `<span>${this._loc.tick(h)}</span>`).join('');
    const weekLink = this._weekLink();

    this.shadowRoot.innerHTML = `<style>${MORE_INFO_STYLE}</style>
      <div class="wrap">
        <div class="title">${esc(t('schedule'))} <span class="muted">· ${schedule}</span></div>
        ${status}
        ${this._error ? `<div class="msg">${esc(this._error)}</div>` : ''}
        <div class="today-lbl">${esc(t('todayTitle'))}</div>
        ${this._bar(segs, rowPiece(pieces, [today]), true, true)}
        ${endDay}
        <div class="ticks">${ticks}</div>
        <details class="week-fold"><summary>${esc(t('week'))}</summary>${weekLink
          ? `<div class="week" role="link" tabindex="0" title="${esc(t('editWeek'))}" ${weekLink}>${rows}</div>`
          : `<div class="week">${rows}</div>`}</details>
        ${this._footHtml()}
      </div>`;
    // Keeps the "week" section open / closed across redraws
    const det: any = this.shadowRoot.querySelector('details.week-fold');
    det.open = !!this._weekOpen;
    det.addEventListener('toggle', () => { this._weekOpen = det.open; });
    // And "Change", on a thermostat card
    const change: any = this.shadowRoot.querySelector('details.change');
    if (change) change.addEventListener('toggle', () => { this._changeOpen = change.open; });
    if (typed !== null) restoreTyped(this.shadowRoot, OVERRIDE_TEMPERATURE, typed);
  }

  // Where "Edit its week" leads (#99). With Set up (canSetUp): the thermostat's page in the panel,
  // scrolled to its week in the active schedule. With Plan (canPlan): the first dashboard view
  // with a schedule card of this thermostat, the thermostat cards can't edit a week. Else nowhere.
  _weekPath() {
    const src = dataSource(this._hass);
    if (src.editable) return weeksPath(this._entity, src.activeSchedule());
    if (!src.plannable) return null;
    if (this._placements === undefined) {
      this._placements = null;
      placements(this._hass).then((p) => {
        this._placements = p;
        if (this._hass && this.isConnected) this._render();
      });
    }
    const place = ((this._placements || {})[this._entity] || []).find((p) => p.programme);
    return place ? place.path : null;
  }

  _weekLink() {
    const path = this._weekPath();
    return path ? `data-navigate="${esc(path)}"` : '';
  }

  // The foot: Edit its week (canPlan), and Pause, or Control in its place (anyone who may control
  // the thermostat). Its entities and its devices are on the device's page and on the panel's page
  _footHtml() {
    const t = this._loc.t;
    const src = dataSource(this._hass);
    const weekLink = this._weekLink();
    const links = weekLink
      ? `<span class="mi-link" role="link" tabindex="0" ${weekLink}>${esc(t('editWeek'))}</span>`
      : '';
    const paused = src.paused(this._entity);
    // Pause and Control: anyone who may control the thermostat, as with its Control switch
    const button = paused ? `<button data-resume>${esc(t('resumeShort'))}</button>` : `<button data-pause>${esc(t('pauseShort'))}</button>`;
    return `<div class="foot"><span class="links">${links}</span>${button}</div>`;
  }

  _onClick(e) {
    const link = e.target.closest('[data-more-info]');
    if (link) {
      e.stopPropagation();
      openMoreInfo(this, link.dataset.moreInfo);
      return;
    }
    // The settings, on top of the more-info dialog, which stays open under them
    if (e.target.closest('[data-open-settings]')) {
      openSettings(this, this._hass);
      return;
    }
    const to = e.target.closest('[data-navigate]');
    if (to) {
      // In the more-info dialog: closed first, the page under it otherwise. A link to the view
      // already shown only closes the dialog
      const path = to.dataset.navigate;
      leaveMoreInfo(this, () => { if (path !== window.location.pathname) navigate(path); });
      return;
    }
    const b = e.target.closest('button:not(.time-step)'); // the small arrows: listenTimeFields()
    if (!b || !this._hass) return;
    if (b.hasAttribute('data-new-override')) { this._creating = !this._creating; return this._render(); }
    this._error = null;
    if (b.hasAttribute('data-resume') || b.hasAttribute('data-pause')) {
      return dataSource(this._hass).setPaused(this._entity, b.hasAttribute('data-pause')).catch((err) => {
        this._error = errorText(this._loc.t, err);
        this._render();
      });
    }
    const d = this._currentOverride();
    const act = b.dataset.act;
    if (act === 'override-step') return stepOverrideTemperature(b, this._hass, this._entity, this._loc);
    if (act === 'override-add') return d && this._setEnd(endMovedBy(d.end, Number(b.dataset.min)));
    const changed = nextOverride(act, b.dataset, d, dataSource(this._hass), this._entity, this._hass);
    return changed && this._send(changed === RESUME ? null : changed);
  }

  _onChange(e) {
    const el = e.target;
    if (el.hasAttribute('data-override-temperature') && Number.isFinite(parseDecimal(el.value))) {
      this._send(overrideWithTemperature(this._currentOverride(), dataSource(this._hass), this._entity, parseDecimal(el.value), this._hass));
    }
  }

  // ----- dragging the override's end -----

  _onDown(e) {
    const h = e.target.closest('.override-handle');
    if (!h) return;
    const piece = (this._pieces || []).find((p) => p.isLast);
    if (!piece) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    h.classList.add('drag');
    this._drag = { piece, handle: h, el: h.parentElement, bar: h.closest('.bar'), end: piece.end, moved: false };
  }

  _onMove(e) {
    const dr = this._drag;
    if (!dr) return;
    const step = MORE_INFO_STEP;
    const p = dr.piece;
    const r = dr.bar.getBoundingClientRect();
    const raw = Math.max(0, Math.min(DAY_MIN, ((e.clientX - r.left) / r.width) * DAY_MIN));
    const isToday = p.d0.toDateString() === new Date().toDateString();
    const min = Math.max(p.start + step, isToday ? Math.ceil((nowMin() + 1) / step) * step : 0);
    const m = Math.max(min, Math.min(DAY_MIN, Math.round(raw / step) * step));
    if (m === dr.end) return;
    dr.end = m;
    dr.moved = true;
    dr.el.style.width = `${pct(m - p.start)}%`;
    dr.handle.querySelector('.tip').textContent = this._loc.time(m);
  }

  _onUp() {
    const dr = this._drag;
    if (!dr) return;
    this._drag = null;
    if (dr.moved) this._setEnd(atMinutes(dr.piece.d0, dr.end, new Date()));
    else dr.handle.classList.remove('drag');
  }
}

export const MORE_INFO_STYLE = `
  .off-note { margin:6px 0; padding:6px 10px; border-radius:8px; font-size:.9em;
    background:rgba(255,152,0,.15); color:var(--primary-text-color); }
  :host { display:block; margin:16px 0 8px; }
  .wrap { padding:14px 16px 4px; border-top:1px solid var(--divider-color); }
  /* In the thermostat card: under its header */
  :host([embedded]) { margin:0; }
  :host([embedded]) .wrap { padding:0; border-top:0; }
  ${LINK_STYLE}
  .foot { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-top:12px; padding-top:10px;
    border-top:1px solid var(--divider-color); }
  .foot .links { display:flex; flex-wrap:wrap; gap:4px 12px; flex:1 1 auto; font-size:.88em; color:var(--secondary-text-color); }
  .title { font-weight:600; margin-bottom:8px; }
  .muted { color:var(--secondary-text-color); font-weight:normal; font-size:.9em; }
  .status { font-size:.92em; margin-bottom:10px; }
  .msg { font-size:.85em; color:var(--error-color,#db4437); margin-bottom:10px; }
  .status.derogation { display:flex; flex-direction:column; gap:var(--chauffage-row-gap); }
  .override-value { padding:2px 8px; border-radius:6px; color:#fff; font-weight:600;
    background:repeating-linear-gradient(135deg, #7b1fa2 0 6px, #9c4dcc 6px 12px); }
  .btns { display:flex; flex-wrap:wrap; gap:6px; }
  button { box-sizing:border-box; height:var(--chauffage-chip-h); font:inherit; font-size:13px; line-height:1; padding:0 10px;
    border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
    border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color); }
  button.danger { color:var(--error-color,#db4437); border-color:var(--error-color,#db4437); }
  .today-lbl { font-size:.8em; color:var(--secondary-text-color); margin-bottom:4px; }
  .bar { position:relative; height:12px; border-radius:4px; overflow:hidden; background:var(--divider-color); flex:1; }
  .bar.big { height:30px; border-radius:6px; overflow:visible; }
  .seg { position:absolute; top:0; bottom:0; color:#fff; font-size:10.5px; font-weight:600; overflow:hidden;
    display:flex; align-items:center; padding-left:4px; box-sizing:border-box; white-space:nowrap; }
  /* A time that does not fit is hidden, never cut ("07:0") */
  .bar.big .seg { container-type:inline-size; }
  @container (max-width:38px) { .seg span { visibility:hidden; font-size:0; } }
  .seg span ha-icon { --mdc-icon-size:12px; width:12px; height:12px; vertical-align:-2px; visibility:visible; }
  .seg span:not(:empty) ha-icon { margin-left:3px; }
  .bar.big .seg:first-child { border-radius:6px 0 0 6px; }
  .bar.big .seg:nth-last-child(1 of .seg) { border-radius:0 6px 6px 0; }
  .override { position:absolute; top:2px; bottom:2px; border:2px solid #fff; border-radius:3px; box-sizing:border-box;
    background:repeating-linear-gradient(135deg, #7b1fa2 0 5px, #9c4dcc 5px 10px); }
  .bar:not(.big) .override { top:0; bottom:0; border-width:1px; }
  .bar.big .override { z-index:2; box-shadow:0 1px 4px rgba(0,0,0,.35); }
  .override-handle { position:absolute; top:-6px; bottom:-6px; right:-10px; width:18px; cursor:ew-resize; touch-action:none; }
  .override-handle::after { content:''; position:absolute; left:6px; top:3px; bottom:3px; width:6px; border-radius:3px;
    background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.45); }
  .tip { display:none; position:absolute; bottom:100%; left:50%; transform:translate(-50%,-2px); z-index:4;
    padding:2px 6px; border-radius:4px; font-size:11px; white-space:nowrap;
    background:var(--primary-text-color); color:var(--card-background-color); }
  .override-handle:hover .tip, .override-handle.drag .tip { display:block; }
  .line { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
  input.time, input[type=number] { ${FIELD_BOX} }
  input[type=number] { width:5em; }
  ${TIME_FIELD_STYLE}
  ${FAN_STYLE}
  .wrap { container-type:inline-size; }
  @container (max-width:419px) {${COLS3_STYLE('')}}
  .override-until { font-size:.92em; }
  /* "Change", on a thermostat card: what changes the override is folded under it */
  details.change > summary { margin-bottom:var(--chauffage-row-gap); }
  .change-body { display:flex; flex-direction:column; gap:var(--chauffage-row-gap); }
  .bar.big + .today-lbl { margin-top:8px; }
  .now { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; z-index:3; pointer-events:none;
    background:var(--primary-text-color); }
  .ticks { display:flex; justify-content:space-between; font-size:10px; color:var(--secondary-text-color); margin-top:3px; }
  details { margin-top:10px; }
  summary { cursor:pointer; font-size:.88em; color:var(--secondary-text-color); }
  /* One grid for the rows: the column of the days is as wide as the longest name of a row */
  .week { display:grid; grid-template-columns:fit-content(56px) 1fr; gap:4px 8px; align-items:center; margin-top:8px;
    font-size:.8em; color:var(--secondary-text-color); }
  .row { display:contents; }
  .row span { line-height:1.2; }
  .row.today span { color:var(--primary-color); font-weight:700; }
`;
