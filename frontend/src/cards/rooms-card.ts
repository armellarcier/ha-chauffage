import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { sourceNotice } from '../notices.ts';
import { dataSource, filterActive } from '../client/snapshot.ts';
import { commands } from '../client/commands.ts';
import { client } from '../client/chauffage-client.ts';
import { presetColorIn } from '../colors.ts';
import { DAY_MIN, MANUAL_PRESETS, minutesOf, NO_PRESET_MODES, parseDate, SETPOINT_MODES, thermostatName } from '../common.ts';
import { causeText, linksByKeyboard } from '../fields.ts';
import { OFF_COLOR, OVERRIDE_STRIPES, hasModeRow, hvacColor, hvacIconTemplate, modeName } from '../hvac.ts';
import { capitalize, makeLocale } from '../i18n/locale.ts';
import { openMoreInfo } from '../links.ts';
import { whenText } from '../override-edit.ts';
import { overrideLabel, targetKind } from '../override.ts';
import { fitTemperature, presetOf, presetsOf, stepOf } from '../presets.ts';

// =====================================================================
//  Rooms card (custom:chauffage-rooms-card): one dense row per scheduled thermostat, for one's own
//  dashboard or a pop-up, drawn like Home Assistant's Tile card. A row says what the thermostat
//  does now and what comes next. Its controls are Home Assistant's own commands (setpoint, HVAC
//  mode), as from the thermostat: Chauffage makes them an override. The row opens the thermostat.
// =====================================================================

// How long the − and + wait for another tap before they set the setpoint, in milliseconds
const ROOMS_SEND_DELAY = 1500;
// How long a row waits for the thermostat to answer a setpoint before it shows its own again
const ROOMS_ANSWER_DELAY = 10000;
// The color of an HVAC mode, as Home Assistant's Tile card draws it
export const tileColor = (mode) => (mode === 'off'
  ? 'var(--state-climate-off-color, var(--state-inactive-color))'
  : `var(--state-climate-${mode === 'heat_cool' ? 'heat-cool' : mode}-color, var(--state-active-color))`);
// What a thermostat does, as the HVAC mode whose color HA's Tile card gives it: a thermostat that
// reached its setpoint (idle) is grey, as off; one that does not say is in the color of its mode
const ACTION_MODES = { heating: 'heat', preheating: 'heat', defrosting: 'heat', cooling: 'cool', drying: 'dry', fan: 'fan_only', idle: 'off', off: 'off' };
const activityMode = (st) => ACTION_MODES[st.attributes.hvac_action] || st.state;
// An instant to come, in a row: its time alone within a day ("→ Comfort 06:30" in the evening is
// tomorrow), else its day too
const soonText = (at, loc) => (at - Date.now() < DAY_MIN * 60000 ? loc.time(minutesOf(at)) : whenText(at, loc));

// What the rooms card and the summary card draw alike, as HA's Tile card does (`p`: the class
// prefix of the card): the icon, a 36px pill in its color (--tile-color), its background at 20 %;
// the name; the state; the popover menu under a button, its item checked in its color
export const tileCss = (p) => `
  .${p}-badge { position:relative; flex:none; width:36px; height:36px; padding:0; border:0; overflow:hidden; background:none;
    border-radius:var(--ha-tile-icon-border-radius, 18px); display:flex; align-items:center; justify-content:center;
    color:var(--tile-color, var(--state-inactive-color)); font:inherit; --mdc-icon-size:24px; }
  .${p}-badge::before { content:''; position:absolute; inset:0; background:var(--tile-color, var(--state-inactive-color)); opacity:.2;
    transition:opacity .18s ease-in-out; }
  .${p}-badge > * { position:relative; }
  .${p}-name { display:block; font-size:var(--ha-font-size-m, 14px); font-weight:var(--ha-font-weight-medium, 500); line-height:20px;
    letter-spacing:.1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .${p}-state { font-size:var(--ha-font-size-s, 12px); line-height:16px; letter-spacing:.4px; color:var(--primary-text-color);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .${p}-menu { position:absolute; top:calc(100% + 4px); right:0; z-index:5; display:flex; flex-direction:column; min-width:170px;
    padding:4px 0; border-radius:var(--ha-card-border-radius, 12px); background:var(--card-background-color, #fff);
    box-shadow:0 4px 16px rgba(0,0,0,.25); }
  .${p}-menu.up { top:auto; bottom:calc(100% + 4px); }
  .${p}-menu button { position:relative; display:flex; align-items:center; gap:12px; height:44px; padding:0 16px; border:0;
    background:none; color:var(--primary-text-color); cursor:pointer; font:inherit; font-size:var(--ha-font-size-m, 14px);
    text-align:start; white-space:nowrap; --mdc-icon-size:20px; }
  .${p}-menu button:hover { background:var(--secondary-background-color); }
  .${p}-menu button > * { position:relative; }
  .${p}-menu button ha-icon { color:var(--tile-color); }
  .${p}-menu button[aria-checked="true"] { font-weight:var(--ha-font-weight-medium, 500); }
  .${p}-menu button[aria-checked="true"]::before { content:''; position:absolute; inset:0; background:var(--tile-color); opacity:.15; }
`;

const ROOMS_CARD_STYLE = `${tileCss('rc')}
  :host { display:block; }
  ha-card { display:block; padding:4px 10px; }
  .rc-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px; padding:6px 0; }
  .rc-ctrl { display:flex; align-items:center; gap:4px; }
  .rc-row + .rc-row { border-top:1px solid var(--divider-color); }
  .rc-main { display:grid; grid-template-columns:36px minmax(0,1fr); align-items:center; gap:0 10px; cursor:pointer;
    min-width:0; -webkit-tap-highlight-color:transparent; }
  .rc-main:hover .rc-badge::before { opacity:.35; }
  .rc-text { min-width:0; }
  .rc-line { display:flex; align-items:baseline; gap:6px; min-width:0; }
  .rc-temp { font-size:var(--ha-font-size-m, 14px); color:var(--secondary-text-color); font-variant-numeric:tabular-nums; white-space:nowrap; }
  /* One height for every row: the cross of an override must not make its row taller */
  .rc-sub { display:flex; align-items:center; gap:4px; min-width:0; height:20px; }
  /* The HVAC mode: a round button in the color of the mode, its popover under it */
  .rc-mode-wrap { position:relative; }
  .rc-mode { position:relative; width:34px; height:34px; padding:0; border:1px solid var(--divider-color); border-radius:18px;
    background:none; color:var(--tile-color); cursor:pointer; display:flex; align-items:center; justify-content:center;
    --mdc-icon-size:20px; }
  .rc-mode:hover, .rc-mode[aria-expanded="true"] { background:var(--secondary-background-color); }
  /* Heating or cooling: the button filled with the color of its mode, its icon white */
  .rc-mode.active { background:var(--tile-color); border-color:var(--tile-color); color:var(--text-primary-color, #fff); }
  .rc-mode.active:hover, .rc-mode.active[aria-expanded="true"] { background:var(--tile-color); filter:brightness(1.1); }
  /* At rest, the room's icon is in the color of the text: HA's icon color is a bluish grey */
  .rc-badge:not([style]) { color:var(--primary-text-color); }
  .rc-badge:not([style])::before { background:var(--primary-text-color); opacity:.08; }
  .rc-state i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; vertical-align:0; }
  .rc-override { display:inline-block; max-width:100%; box-sizing:border-box; padding:0 6px; border-radius:8px;
    color:#fff; font-weight:var(--ha-font-weight-medium, 500); overflow:hidden; text-overflow:ellipsis; vertical-align:middle;
    background:${OVERRIDE_STRIPES}; }
  .rc-row.paused .rc-name, .rc-row.paused .rc-temp { color:var(--disabled-text-color, var(--secondary-text-color)); }
  /* 20px drawn, 36px to tap: the rest of its target overflows the line */
  .rc-x { position:relative; flex:none; width:20px; height:20px; padding:0; border:0; border-radius:50%; background:none;
    color:var(--secondary-text-color); cursor:pointer; font:inherit; font-size:13px; line-height:20px; }
  .rc-x::after { content:''; position:absolute; inset:-8px; }
  .rc-x:hover { background:var(--secondary-background-color); }
  .rc-step { display:flex; align-items:center; border:1px solid var(--divider-color); border-radius:18px; }
  .rc-step button { width:32px; height:34px; padding:0; border:0; border-radius:50%; background:none; cursor:pointer;
    color:var(--primary-text-color); font:inherit; font-size:18px; line-height:34px; }
  .rc-step button:hover { background:var(--secondary-background-color); }
  .rc-value { min-width:2.5em; text-align:center; font-variant-numeric:tabular-nums; font-weight:500; }
  .msg { color:var(--secondary-text-color); font-size:.92em; padding:8px 0; }
`;
export class ChauffageRoomsCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _modesOpen: { state: true },
  };

  static styles = unsafeCSS(ROOMS_CARD_STYLE);

  declare hass: any;
  declare _config: any;
  declare _modesOpen: string | null;
  // entity → the setpoint tapped, shown until the thermostat answers
  _pending: Record<string, number> = {};
  // entity → the thermostat's setpoint when the one tapped was sent
  _sentFrom: Record<string, any> = {};
  _timers: Record<string, any> = {};
  _iconsAwaited = false;
  _unlisten: (() => void) | null = null;
  // A tap outside the card closes the popover of the HVAC modes
  _outside = (e) => {
    if (this._modesOpen && !e.composedPath().includes(this)) this._modesOpen = null;
  };

  static getConfigElement() {
    return document.createElement('chauffage-rooms-card-editor');
  }

  // A new card: every scheduled thermostat
  static async getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = config || {};
  }

  createRenderRoot() {
    const root = super.createRenderRoot();
    linksByKeyboard(root);
    return root;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._outside);
    this._listen();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._outside);
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
  }

  willUpdate(changed) {
    if (changed.has('hass')) this._listen();
  }

  // Data pushed by the integration: drawn again
  _listen() {
    if (this.hass && this.isConnected && !this._unlisten && dataSource(this.hass).available) {
      this._unlisten = client.listen(() => this.requestUpdate());
    }
  }

  getCardSize() {
    return 1 + this._entries().length;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  // The thermostats of its rows: the ones listed in the card, else every one Chauffage schedules
  _entries() {
    const listed = (this._config && this._config.thermostats) || [];
    if (listed.length) return listed.map((t) => (typeof t === 'string' ? { entity: t } : { ...t }));
    return this.hass ? dataSource(this.hass).scheduled().map((entity) => ({ entity })) : [];
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    const loc = makeLocale(this.hass, this._config.language);
    const src = dataSource(this.hass);
    const notice: any = sourceNotice(src);
    const content = notice
      ? (notice.loading ? nothing : html`<div class="msg">${loc.t(notice.text)}</div>`)
      : this._entries().map((e) => this._row(e, loc, src));
    return html`<ha-card @click=${this._onClick}>${content}</ha-card>`;
  }

  updated() {
    this._fillIcons();
    // The popover of the HVAC modes opens upward when the screen has no room for it below
    const popover = this.renderRoot.querySelector('.rc-menu');
    if (!popover) return;
    const r = popover.getBoundingClientRect();
    if (r.bottom > window.innerHeight && r.top - r.height - 48 > 0) popover.classList.add('up');
  }

  // The icon of a thermostat: the one given in the card, else Home Assistant's for its state
  _fillIcons() {
    // Before Home Assistant defines ha-state-icon, a property set on it would hide its own: drawn
    // again once it is defined
    if (!customElements.get('ha-state-icon')) {
      if (!this._iconsAwaited) {
        this._iconsAwaited = true;
        customElements.whenDefined('ha-state-icon').then(() => this.requestUpdate());
      }
      return;
    }
    this.renderRoot.querySelectorAll('ha-state-icon.rc-icon:not([icon])').forEach((el: any) => {
      el.hass = this.hass;
      el.stateObj = this.hass.states[(el.closest('.rc-row') as any).dataset.entity];
    });
  }

  _row(entry, loc, src) {
    const hass = this.hass;
    const t = loc.t;
    const entity = entry.entity;
    const st = hass.states[entity];
    const icon = html`<ha-state-icon class="rc-icon" icon=${entry.icon || nothing}></ha-state-icon>`;
    if (!st) {
      return html`<div class="rc-row" data-entity=${entity}><div class="rc-main"><span class="rc-badge">${icon}</span><div class="rc-text">
        <div class="rc-name">${entry.name || entity}</div>
        <div class="rc-state">${t('entityMissing', { entity })}</div></div></div></div>`;
    }
    const a = st.attributes;
    const paused = src.paused(entity);
    const d = !paused ? filterActive(src.overrides())[entity] : null;
    // The setpoint tapped is shown until the thermostat answers: with that setpoint, or with
    // another one (rounded, or set back), which it then shows
    if (entity in this._sentFrom && (a.temperature === this._pending[entity] || a.temperature !== this._sentFrom[entity])) {
      delete this._pending[entity];
      delete this._sentFrom[entity];
    }
    const off = st.state === 'off';
    const measured = a.current_temperature != null ? `${loc.number(a.current_temperature)}°` : '';
    const { html: state, action } = this._stateOf(entity, st, d, paused, loc, src);
    const setpoint = this._pending[entity] ?? a.temperature;
    // No − and + in fan-only or dry mode: the setpoint does nothing there
    const stepper = !off && !['fan_only', 'dry'].includes(st.state) && typeof a.temperature === 'number'
      ? html`<div class="rc-step">
          <button type="button" data-delta="-1" aria-label="−">−</button>
          <span class="rc-value">${loc.number(setpoint)}°</span>
          <button type="button" data-delta="1" aria-label="+">+</button>
        </div>` : nothing;
    // The HVAC mode, in a popover under its button, on a thermostat that has more than one. Not on
    // a thermostat off to protect itself (its window, its auto start/stop): turned on by hand, it
    // would stop protecting itself
    const modes = (a.hvac_modes || []).map(String);
    let mode: any = nothing;
    if (modes.length > 1 && !(off && src.cause(entity))) {
      // Filled while the thermostat heats or cools, as it says (hvac_action); empty at its setpoint
      const doing = activityMode(st);
      const active = !!a.hvac_action && doing !== 'off';
      const open = this._modesOpen === entity;
      const popover = open
        ? html`<div class="rc-menu" role="menu">${modes.map((m) => html`<button type="button" role="menuitemradio" aria-checked=${String(m === st.state)} data-hvac-mode=${m} style="--tile-color:${tileColor(m)}">${hvacIconTemplate(m)}${modeName(loc, m)}</button>`)}</div>`
        : nothing;
      mode = html`<div class="rc-mode-wrap"><button type="button" class="rc-mode${active ? ' active' : ''}" data-mode-button aria-haspopup="menu" aria-expanded=${String(open)} aria-label=${t('hvacModeLabel')} title=${`${t('hvacModeLabel')} · ${modeName(loc, st.state)}`} style="--tile-color:${tileColor(st.state)}">${hvacIconTemplate(st.state)}</button>${popover}</div>`;
    }
    // The room's icon is in color while the thermostat heats or cools, else in the color of the
    // text, never grey
    const doingNow = activityMode(st);
    const badge = a.hvac_action && doingNow !== 'off'
      ? html`<span class="rc-badge" style="--tile-color:${tileColor(doingNow)}">${icon}</span>`
      : html`<span class="rc-badge">${icon}</span>`;
    const cls = ['rc-row', d ? 'override' : '', paused ? 'paused' : ''].filter(Boolean).join(' ');
    return html`<div class=${cls} data-entity=${entity}>
      <div class="rc-main" role="link" tabindex="0" title=${t('openThermostat')}>${badge}<div class="rc-text">
        <div class="rc-line"><span class="rc-name">${thermostatName(hass, entity, entry.name)}</span>
          <span class="rc-temp">${measured}</span></div>
        <div class="rc-sub"><span class="rc-state">${state}</span>${action}</div>
      </div></div>
      <div class="rc-ctrl">${mode}${stepper}</div>
    </div>`;
  }

  // What the thermostat does now, in a few words, and the button that ends it, if any: an override
  // until its end, a pause, a protection (a window), else the preset of its schedule and what comes
  // next
  _stateOf(entity, st, d, paused, loc, src): { html: any, action: any } {
    const t = loc.t;
    const hass = this.hass;
    const dot = (color) => (color ? html`<i style="background:${color}"></i>` : nothing);
    if (paused) {
      return { html: t('paused'), action: html`<button type="button" class="rc-x" data-resume-control aria-label=${t('resumeShort')} title=${t('resumeShort')}>▶</button>` };
    }
    const presets = presetsOf(src, loc);
    if (d) {
      const isTemperature = d.target && targetKind(d.target) === 'temperature' && !presets.some((p) => p.id === d.preset);
      const label = isTemperature ? '' : overrideLabel(d, loc, presets);
      const until = `${t('until')} ${soonText(parseDate(d.end), loc)}`;
      return {
        html: html`<span class="rc-override">${`⏱ ${label ? `${label} ` : ''}${until}`}</span>`,
        action: html`<button type="button" class="rc-x" data-resume-schedule aria-label=${t('resume')} title=${t('resume')}>✕</button>`,
      };
    }
    const cause = causeText(src, entity, loc, null);
    if (cause) return { html: html`${dot(OFF_COLOR)}${capitalize(cause.short)}`, action: nothing };
    const plan = src.planned(entity);
    if (st.state === 'off' || (plan && plan.hvac_mode === 'off')) return { html: html`${dot(OFF_COLOR)}${modeName(loc, 'off')}`, action: nothing };
    if (!plan || (!plan.preset && !NO_PRESET_MODES.includes(plan.hvac_mode))) {
      const a = st.attributes;
      const label = a.preset_mode && !MANUAL_PRESETS.includes(String(a.preset_mode).toLowerCase()) ? loc.preset(a.preset_mode) : '';
      return { html: label, action: nothing };
    }
    const named = hasModeRow(hass, entity);
    const name = (mode, preset) => (NO_PRESET_MODES.includes(mode) ? modeName(loc, mode)
      : preset ? `${named && SETPOINT_MODES.includes(mode) ? `${modeName(loc, mode)} · ` : ''}${presetOf(presets, preset, loc).name}` : '');
    const color = NO_PRESET_MODES.includes(plan.hvac_mode) ? hvacColor(plan.hvac_mode)
      : named && SETPOINT_MODES.includes(plan.hvac_mode) ? presetColorIn(presetOf(presets, plan.preset, loc), plan.hvac_mode)
        : presetOf(presets, plan.preset, loc).color;
    const current = name(plan.hvac_mode, plan.preset);
    const start = plan.next_start ? parseDate(plan.next_start) : null;
    // The mode is said once when it does not change: "Heat · Eco → Comfort 17:30"
    const next = !start ? '' : plan.next_hvac_mode === plan.hvac_mode && plan.next_preset
      ? presetOf(presets, plan.next_preset, loc).name : name(plan.next_hvac_mode, plan.next_preset);
    const text = next ? t('thenAt', { current, next, time: soonText(start, loc) }) : current;
    return { html: html`${dot(color)}${text}`, action: nothing };
  }

  _onClick(e) {
    const hass = this.hass;
    const rowEl = e.target.closest('.rc-row');
    if (!rowEl || !hass) return;
    const entity = rowEl.dataset.entity;
    const st = hass.states[entity];
    const redraw = () => this.requestUpdate();
    const failed = () => { delete this._pending[entity]; redraw(); };
    const setMode = (mode) => hass.callService('climate', 'set_hvac_mode', { entity_id: entity, hvac_mode: mode }).catch(redraw);
    const step = e.target.closest('[data-delta]');
    if (step) {
      const shown = this._pending[entity] ?? st.attributes.temperature;
      this._pending[entity] = fitTemperature(hass, entity, shown + Number(step.dataset.delta) * stepOf(hass, entity));
      delete this._sentFrom[entity]; // a new value, not sent yet
      redraw();
      clearTimeout(this._timers[entity]);
      this._timers[entity] = setTimeout(() => this._sendSetpoint(entity), ROOMS_SEND_DELAY);
      return;
    }
    const chip = e.target.closest('[data-hvac-mode]');
    if (chip) {
      this._modesOpen = null;
      return setMode(chip.dataset.hvacMode);
    }
    if (e.target.closest('[data-mode-button]')) {
      // Opens its popover, closes it on a second tap; one popover at a time
      this._modesOpen = this._modesOpen === entity ? null : entity;
      return;
    }
    // Any other tap closes the popover, then does what it does
    this._modesOpen = null;
    if (e.target.closest('[data-resume-schedule]')) return commands(hass).setOverride(entity, null).catch(failed);
    if (e.target.closest('[data-resume-control]')) return commands(hass).setPaused(entity, false).catch(failed);
    if (e.target.closest('.rc-main')) openMoreInfo(this, entity);
  }

  // The setpoint tapped, set on the thermostat as a change by hand: Chauffage makes it an
  // override, as from the thermostat's own dial
  _sendSetpoint(entity) {
    const hass = this.hass;
    const value = this._pending[entity];
    if (!hass || value === undefined) return;
    const forget = () => {
      delete this._pending[entity];
      delete this._sentFrom[entity];
      this.requestUpdate();
    };
    const st = hass.states[entity];
    this._sentFrom[entity] = st ? st.attributes.temperature : undefined;
    hass.callService('climate', 'set_temperature', { entity_id: entity, temperature: value }).catch(forget);
    // A thermostat that never answers: its own setpoint again after a while
    this._timers[entity] = setTimeout(() => { if (this._pending[entity] === value && entity in this._sentFrom) forget(); }, ROOMS_ANSWER_DELAY);
  }
}
