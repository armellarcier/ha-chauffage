import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { client } from './client/chauffage-client.ts';
import { dataSource } from './client/snapshot.ts';
import { commands } from './client/commands.ts';
import { SnapshotController } from './controllers/snapshot-controller.ts';
import { slotColor } from './colors.ts';
import { DAY_MIN, errorText, hasNoPreset, isFan, isOff, nowMin, pct, slotMode, todayIdx } from './common.ts';
import { atMinutes, endMovedBy, endOfField, linksByKeyboard, listenTimeFields, timeFieldDone } from './fields.ts';
import { COLS3_STYLE, FAN_STYLE, FIELD_BOX, OFF_COLOR, dayOn, fullNames, hasModeRow, hvacIconTemplate, hvacSlotStyle, parseDecimal, rowsOfDays } from './hvac.ts';
import { makeLocale } from './i18n/locale.ts';
import { leaveMoreInfo, navigate, openMoreInfo, panelPath, placements, weeksPath } from './links.ts';
import { RESUME, activeWeek, focusedField, nextOverride, overrideBody, overrideSummary, overrideUntilText, overrideWithTemperature, planText, slotName, stepOverrideTemperature, withoutAir } from './override-edit.ts';
import { overridePieces, rowPiece } from './override.ts';
import { presetOf, presetsOf } from './presets.ts';
import { OverrideDraft } from './state/override-draft.ts';
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

export class ChauffageMoreInfo extends LitElement {
  static properties = {
    hass: { attribute: false },
    entity: { attribute: false },
  };

  static styles = unsafeCSS(MORE_INFO_STYLE);

  declare hass: any;
  declare entity: string;
  _loc: any = null;
  // The override sent, shown until the integration's update (see OverrideDraft)
  _overrides = new OverrideDraft();
  _creating = false;
  _changeOpen = false;
  _weekOpen = false;
  _error: string | null = null;
  _drag: any = null;
  _pieces: any[] = [];
  _placements: any = undefined;
  // What the block was drawn from last (see shouldUpdate)
  _key: any[] | null = null;
  // A redraw asked by the block itself: always drawn
  _force = false;
  // A redraw skipped while the end of an override is typed: drawn once the field is left
  _redrawLater = false;
  // Data pushed by the integration: drawn again if it changes the block, as a new hass
  _snapshot = new SnapshotController(this, () => this.requestUpdate('hass', undefined));

  createRenderRoot() {
    const root = super.createRenderRoot();
    linksByKeyboard(root);
    // The end field of an override left: the end typed is applied
    listenTimeFields(this, (el) => timeFieldDone(this, el, (minutes) => this._setEnd(endOfField(el, minutes))));
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('change', (e) => this._onChange(e));
    root.addEventListener('pointerdown', (e) => this._onDown(e));
    root.addEventListener('pointermove', (e) => this._onMove(e));
    root.addEventListener('pointerup', () => this._onUp());
    root.addEventListener('pointercancel', () => this._onUp());
    return root;
  }

  // Draws the block again now, whatever changed (a tap in the block, a field left)
  _render() {
    this._force = true;
    this.requestUpdate();
  }

  // Drawn again only when relevant data changed, or every new minute; not while the end of an
  // override is dragged or typed
  shouldUpdate(changed) {
    if (changed.has('entity')) { this._key = null; this._overrides.updated(); }
    if (!this.hass || !this.entity) return false;
    this._loc = makeLocale(this.hass);
    const src = dataSource(this.hass);
    // A new push of the integration: it holds the override sent, and a pause or a resume error is over
    if (this._key && client.data !== this._key[1]) {
      this._overrides.updated();
      this._error = null;
    }
    if (this._force) {
      this._force = false;
      return true;
    }
    // (the access level gives the links; the registry gives the device)
    const key = [this.hass.states[this.entity], client.data, Math.floor(Date.now() / 60000), this._loc.signature,
      src.accessLevel(), src.admin, this.hass.entities && this.hass.entities[this.entity]];
    if (this._key && key.every((v, i) => v === this._key[i])) return false;
    if (this._drag) return false; // no redraw while dragging
    if (focusedField(this.renderRoot, 'input.time')) { this._redrawLater = true; return false; } // nor while the end is typed
    this._key = key;
    return true;
  }

  _preset(id) {
    return presetOf(presetsOf(dataSource(this.hass), this._loc), id, this._loc);
  }

  _currentOverride() {
    return this._overrides.overrides(dataSource(this.hass))[this.entity] || null;
  }

  _send(override) {
    override = withoutAir(override);
    // Set from this block: the block stays unfolded on a thermostat card, for the next tap
    if (override && this._creating) this._changeOpen = true;
    this._overrides.sent(this.entity, override);
    this._render();
    commands(this.hass).setOverride(this.entity, override)
      .catch(() => { this._overrides.failed(this.entity); this._render(); });
  }

  // New end: at least one step after now
  _setEnd(endsAt) {
    const d = this._currentOverride();
    if (!d) return;
    const min = new Date(Date.now() + MORE_INFO_STEP * 60000);
    const { end_rule: _reason, ...chosen } = d; // an end the user chooses: no longer the next slot
    this._send({ ...chosen, end: (endsAt < min ? min : endsAt).toISOString() });
  }

  _bar(stored, piece, showNow, big) {
    const loc = this._loc;
    const presets = presetsOf(dataSource(this.hass), loc);
    const segs = dayOn(this.hass, this.entity, stored); // an air conditioner's slots heat or cool
    const seg = (s, i) => {
      const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
      // An off slot is grey, a fan-only slot has Home Assistant's color of fan only, a cooling
      // slot its preset's cool color; each with the icon of its HVAC mode (#91)
      const off = isOff(s);
      const fan = isFan(s);
      const time = big && end - s.start >= (loc.hour12 ? 120 : 90) ? loc.time(s.start) : '';
      const background = off ? `background:${OFF_COLOR}` : fan ? '' : hasNoPreset(s) ? hvacSlotStyle(slotMode(s)) : `background:${slotColor(this._preset(s.preset), s)}`;
      return html`<div class="seg${off ? ' off' : ''}${fan ? ' fan' : ''}" style="left:${pct(s.start)}%;width:${pct(end - s.start)}%;${background}" title=${`${loc.time(s.start)} → ${loc.time(end)} · ${slotName(s, presets, loc)}`}>${big ? html`<span>${time}${hvacIconTemplate(slotMode(s))}</span>` : nothing}</div>`;
    };
    let override: any = nothing;
    if (piece) {
      // End handle only on the large bar of the day the override ends
      const handle = big && piece.isLast
        ? html`<div class="override-handle" data-day=${piece.day} title=${loc.t('dragToChangeEnd')}><span class="tip">${loc.time(piece.end)}</span></div>`
        : nothing;
      override = html`<div class="override" style="left:${pct(piece.start)}%;width:${pct(piece.end - piece.start)}%">${handle}</div>`;
    }
    const now = showNow ? html`<div class="now" style="left:${pct(nowMin())}%"></div>` : nothing;
    return html`<div class="bar${big ? ' big' : ''}">${segs.map(seg)}${override}${now}</div>`;
  }

  render() {
    const t = this._loc.t;
    const src = dataSource(this.hass);
    const week = activeWeek(src, this.entity);
    this.style.display = week ? '' : 'none';
    if (!week) return nothing;
    const schedule = src.activeSchedule();
    const scheduleName = schedule ? src.scheduleName(schedule) : '';
    // The active schedule's name opens its page in the panel with Set up (canSetUp)
    const scheduleLink = schedule && src.editable
      ? html`<span class="mi-link" role="link" tabindex="0" data-navigate=${panelPath(`schedules/${schedule}`)}>${scheduleName}</span>` : scheduleName;
    const today = todayIdx();
    const d = this._currentOverride();
    const pieces = overridePieces(d);
    this._pieces = pieces;
    // Next to Home Assistant's own dialog: the HVAC modes in full, as it names them
    const names = fullNames(this._loc, this.hass, this.entity);
    const followText = planText(src.planned(this.entity), (id) => this._preset(id).name, names,
      hasModeRow(this.hass, this.entity));
    const embedded = this.hasAttribute('embedded');

    let status;
    let endDay: any = nothing;
    // What changes an override, or sets one: the same controls as in the card's popover
    const body = (override) => overrideBody(override, src, this.entity, this.hass, this._loc,
      { step: MORE_INFO_STEP, line: 'line', actions: 'btns', endLoc: names });
    if (d) {
      this._creating = false;
      const lastPiece = pieces.find((p) => p.isLast);
      const resume = html`<button class="danger" data-act="override-del">${t('resume')}</button>`;
      // What the override is, until when, and what comes next: "Cool · Comfort 25° until 23:00,
      // then Heat · Eco". On a thermostat card, the rest is folded under "Change". In the
      // more-info dialog, everything shows
      status = html`<div class="status derogation">
        <div class="line">${embedded
    // A thermostat card names the override in its header: here, until when. The more-info
    // dialog says the end in the block of its end
    ? html`<span class="override-until">⏱ ${overrideUntilText(d, src, this.entity, names, this.hass)}</span>`
    : html`<span class="override-value">⏱ ${overrideSummary(d, src, this.entity, this._loc, this.hass)}</span>`}
        </div>
        ${embedded
    ? html`<div class="btns">${resume}</div><details class="change" .open=${this._changeOpen} @toggle=${(e) => { this._changeOpen = e.target.open; }}><summary>${t('change')}</summary><div class="change-body">${body(d)}</div></details>`
    : html`${body(d)}<div class="btns">${resume}</div>`}
      </div>`;
      // Ends on another day: also show that day's large bar (with the handle)
      if (lastPiece && lastPiece.day !== today) {
        endDay = html`<div class="today-lbl">${this._loc.days[lastPiece.day]}</div>
          ${this._bar(week[lastPiece.day], lastPiece, false, true)}`;
      }
    } else if (src.paused(this.entity)) {
      this._creating = false;
      // Resume is at the foot, in place of Pause
      status = html`<div class="status"><div class="line"><span class="muted">${t('pausedInfo')}</span></div></div>`;
    } else {
      if (!this._creating) this._changeOpen = false; // the next override starts folded
      // "Temporary setpoint…" unfolds the same controls, to set one
      status = html`<div class="status${this._creating ? ' derogation' : ''}">
        <div class="line"><span><span class="muted">${t('followsSchedule')}</span> ${followText}</span>
          <button data-new-override>${t('newOverride')}</button></div>
        ${this._creating ? body(null) : nothing}
      </div>`;
    }

    // Identical days on one row, like the schedule card
    const rows = rowsOfDays(this._loc.dayOrder, (day) => serializeDay(dayOn(this.hass, this.entity, week[day])).join(','))
      .map((days) => html`<div class="row${days.includes(today) ? ' today' : ''}">
        <span>${this._loc.daysLabel(days)}</span>${this._bar(week[days[0]], rowPiece(pieces, days), false, false)}</div>`);
    const ticks = [0, 6, 12, 18, 24].map((h) => html`<span>${this._loc.tick(h)}</span>`);
    const weekPath = this._weekPath();

    return html`<div class="wrap">
        <div class="title">${t('schedule')} <span class="muted">· ${scheduleLink}</span></div>
        ${status}
        ${this._error ? html`<div class="msg">${this._error}</div>` : nothing}
        <div class="today-lbl">${t('todayTitle')}</div>
        ${this._bar(week[today], rowPiece(pieces, [today]), true, true)}
        ${endDay}
        <div class="ticks">${ticks}</div>
        <details class="week-fold" .open=${this._weekOpen} @toggle=${(e) => { this._weekOpen = e.target.open; }}><summary>${t('week')}</summary>${weekPath
          ? html`<div class="week" role="link" tabindex="0" title=${t('editWeek')} data-navigate=${weekPath}>${rows}</div>`
          : html`<div class="week">${rows}</div>`}</details>
        ${this._foot(weekPath)}
      </div>`;
  }

  // Where "Edit its week" leads (#99). With Set up (canSetUp): the thermostat's page in the panel,
  // scrolled to its week in the active schedule. With Plan (canPlan): the first dashboard view
  // with a schedule card of this thermostat, the thermostat cards can't edit a week. Else nowhere.
  _weekPath() {
    const src = dataSource(this.hass);
    if (src.editable) return weeksPath(this.entity, src.activeSchedule());
    if (!src.plannable) return null;
    if (this._placements === undefined) {
      this._placements = null;
      placements(this.hass).then((p) => {
        this._placements = p;
        if (this.hass && this.isConnected) this._render();
      });
    }
    const place = ((this._placements || {})[this.entity] || []).find((p) => p.programme);
    return place ? place.path : null;
  }

  // The foot: Edit its week (canPlan), and Pause, or Control in its place (anyone who may control
  // the thermostat). Its entities and its devices are on the device's page and on the panel's page
  _foot(weekPath) {
    const t = this._loc.t;
    const link = weekPath ? html`<span class="mi-link" role="link" tabindex="0" data-navigate=${weekPath}>${t('editWeek')}</span>` : nothing;
    // Pause and Control: anyone who may control the thermostat, as with its Control switch
    const button = dataSource(this.hass).paused(this.entity)
      ? html`<button data-resume>${t('resumeShort')}</button>` : html`<button data-pause>${t('pauseShort')}</button>`;
    return html`<div class="foot"><span class="links">${link}</span>${button}</div>`;
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
      openSettings(this, this.hass);
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
    if (!b || !this.hass) return;
    if (b.hasAttribute('data-new-override')) { this._creating = !this._creating; return this._render(); }
    this._error = null;
    if (b.hasAttribute('data-resume') || b.hasAttribute('data-pause')) {
      return commands(this.hass).setPaused(this.entity, b.hasAttribute('data-pause')).catch((err) => {
        this._error = errorText(this._loc.t, err);
        this._render();
      });
    }
    const d = this._currentOverride();
    const act = b.dataset.act;
    if (act === 'override-step') return stepOverrideTemperature(b, this.hass, this.entity, this._loc);
    if (act === 'override-add') return d && this._setEnd(endMovedBy(d.end, Number(b.dataset.min)));
    const changed = nextOverride(act, b.dataset, d, dataSource(this.hass), this.entity, this.hass);
    return changed && this._send(changed === RESUME ? null : changed);
  }

  _onChange(e) {
    const el = e.target;
    if (el.hasAttribute('data-override-temperature') && Number.isFinite(parseDecimal(el.value))) {
      this._send(overrideWithTemperature(this._currentOverride(), dataSource(this.hass), this.entity, parseDecimal(el.value), this.hass));
    }
  }

  // ----- dragging the override's end -----
  // The gesture changes the width of the override and the time of its tip in place, as Lit drew
  // them; the release puts them back before the end is sent, so that Lit draws the new end.

  _onDown(e) {
    const h = e.target.closest('.override-handle');
    if (!h) return;
    const piece = (this._pieces || []).find((p) => p.isLast);
    if (!piece) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    h.classList.add('drag');
    const el = h.parentElement;
    const time = [...h.querySelector('.tip').childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    this._drag = { piece, handle: h, el, time, width: el.style.width, tip: time.data, bar: h.closest('.bar'), end: piece.end, moved: false };
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
    dr.time.data = this._loc.time(m);
  }

  _onUp() {
    const dr = this._drag;
    if (!dr) return;
    this._drag = null;
    dr.handle.classList.remove('drag');
    dr.el.style.width = dr.width;
    dr.time.data = dr.tip;
    if (dr.moved) this._setEnd(atMinutes(dr.piece.d0, dr.end, new Date()));
  }
}
