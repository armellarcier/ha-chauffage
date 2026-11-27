import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { sourceNotice } from '../notices.ts';
import { dataSource, filterActive } from '../client/snapshot.ts';
import { SnapshotController } from '../controllers/snapshot-controller.ts';
import { presetColorIn } from '../colors.ts';
import { haAtLeast, MANUAL_PRESETS, NO_PRESET_MODES, SETPOINT_MODES, thermostatName } from '../common.ts';
import { causeText, linksByKeyboard } from '../fields.ts';
import { OFF_COLOR, OVERRIDE_STRIPES, hasModeRow, hvacColor, hvacIconTemplate, modeName } from '../hvac.ts';
import { makeLocale } from '../i18n/locale.ts';
import { navigate, openMoreInfo, panelPath } from '../links.ts';
import { overrideSummary } from '../override-edit.ts';
import { isOffOverride, overrideHvac, overrideLabel, targetKind } from '../override.ts';
import { presetOf, presetsOf } from '../presets.ts';
import { LINK_STYLE } from '../styles.ts';

// =====================================================================
//  Thermostat card (custom:chauffage-thermostat-card, #39): one scheduled thermostat, to place in
//  one's own dashboard, like HA's Tile or Thermostat cards. Its header says what the thermostat
//  does now; under it, the block of the more-info dialog (why and until when, today, a temporary
//  setpoint, the week), so that both stay the same. What it names opens in Home Assistant.
// =====================================================================

const THERMOSTAT_CARD_STYLE = `
  :host { display:block; }
  ha-card { display:block; padding:14px 16px 12px; }
  .tc-head { display:grid; grid-template-columns:1fr auto; align-items:center; gap:2px 12px; margin-bottom:12px; }
  .tc-name { font-size:1.1em; font-weight:500; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tc-temp { grid-row:span 2; font-size:2em; font-weight:300; font-variant-numeric:tabular-nums; }
  .tc-state { justify-self:start; display:inline-flex; align-items:center; gap:5px; padding:1px 8px; border-radius:10px;
    font-size:.88em; font-weight:500; white-space:nowrap; background:var(--secondary-background-color); }
  .tc-state i { width:10px; height:10px; border-radius:3px; flex:none; }
  .tc-state .m ha-icon { --mdc-icon-size:12px; width:12px; height:12px; }
  .tc-state.override { color:#fff; background:${OVERRIDE_STRIPES}; }
  ${LINK_STYLE}
  .msg { color:var(--secondary-text-color); font-size:.92em; }
`;

export class ChauffageThermostatCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  static styles = unsafeCSS(THERMOSTAT_CARD_STYLE);

  declare hass: any;
  declare _config: any;
  // Drawn again when the integration pushes new data
  _snapshot = new SnapshotController(this);

  static getConfigElement() {
    return document.createElement('chauffage-thermostat-card-editor');
  }

  // A new card: a thermostat Chauffage schedules, otherwise the first thermostat
  static async getStubConfig(hass) {
    const scheduled = dataSource(hass).scheduled().filter((e) => hass.states[e]);
    const climates = Object.keys(hass.states).filter((e) => e.startsWith('climate.'));
    return { entity: scheduled[0] || climates[0] || '' };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      const lang = (config && config.language) || (typeof navigator !== 'undefined' && navigator.language);
      throw new Error(makeLocale(null, lang).t('entityRequired'));
    }
    this._config = config;
  }

  createRenderRoot() {
    const root = super.createRenderRoot();
    linksByKeyboard(root);
    return root;
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    return html`<ha-card @click=${this._onClick}>${this._content()}</ha-card>`;
  }

  _content() {
    const hass = this.hass;
    const loc = makeLocale(hass, this._config.language);
    const t = loc.t;
    const entity = this._config.entity;
    const src = dataSource(hass);
    // Without the data yet, the thermostat card already shows the thermostat: no "…"
    const notice: any = sourceNotice(src);
    if (notice && !notice.loading) return html`<div class="msg">${t(notice.text)}</div>`;
    const st = hass.states[entity];
    const name = st ? thermostatName(hass, entity, this._config.name) : entity;
    const a = (st && st.attributes) || {};
    const measured = a.current_temperature != null ? `${loc.number(a.current_temperature)}°` : '';
    const head = html`<div class="tc-head">
        <div class="tc-name">${st
          ? html`<span class="mi-link" role="link" tabindex="0" data-more-info=${entity} title=${t('openThermostat')}>${name}</span>`
          : name}</div>
        <div class="tc-temp">${measured}</div>
        ${st ? this._state(loc, src, st) : html`<span class="msg">${t('entityMissing', { entity })}</span>`}
      </div>`;
    if (!src.ready || !st) return head;
    if (!src.scheduled().includes(entity)) {
      // Scheduling it is setting up (canSetUp): from the panel's Thermostats tab
      const scheduleIt = src.editable
        ? html` <span class="mi-link" role="link" tabindex="0" data-navigate=${panelPath('thermostats')}>${t('scheduleIt')}</span>` : nothing;
      return html`${head}<div class="msg">${t('notScheduled')}${scheduleIt}</div>`;
    }
    // The block of the more-info dialog, with its foot: Pause or Resume. Lit keeps it from one
    // drawing to the next: a field being typed in keeps its focus while the thermostat reports
    return html`${head}<chauffage-moreinfo embedded .entity=${entity} .hass=${hass}></chauffage-moreinfo>`;
  }

  // What it does now: its temporary setpoint, or the preset of its schedule (the thermostat's
  // own when paused), with its setpoint
  _state(loc, src, st) {
    const t = loc.t;
    const entity = this._config.entity;
    const a = st.attributes;
    const setpoint = a.temperature != null ? `${loc.number(a.temperature)}°` : '';
    const text = (label) => [label, setpoint].filter(Boolean).join(' · ');
    const presets = presetsOf(src, loc);
    const paused = src.paused(entity);
    const d = !paused && filterActive(src.overrides())[entity];
    const override = (content) => html`<span class="tc-state override">⏱ ${content}</span>`;
    const icon = (mode) => (mode ? html`<span class="m">${hvacIconTemplate(mode)}</span>` : nothing);
    const dot = (color) => html`<i style="background:${color}"></i>`;
    // An off override: "⏱ Off", no setpoint (#91)
    if (isOffOverride(d)) return override(modeName(loc, 'off'));
    // On a thermostat that lists more than one "on" HVAC mode: "⏱ Cool · Comfort 25°"
    if (d && hasModeRow(this.hass, entity)) return override(overrideSummary(d, src, entity, loc, this.hass));
    // An override at a temperature (not a preset) is that temperature: said once, not "17,5 °C · 17,5°"
    if (d && targetKind(d.target) === 'temperature' && !presets.some((p) => p.id === d.preset)) {
      return override(html`${icon(overrideHvac(d))}${`${loc.number(d.target.temperature)}°`}`);
    }
    if (d) return override(html`${icon(overrideHvac(d))}${text(overrideLabel(d, loc, presets))}`);
    const plan = paused ? null : src.planned(entity);
    // A thermostat that protects itself (a VTherm's window, auto start/stop) says why, and the
    // preset it restarts on, without setpoint, also while its window keeps it heating at the
    // frost setpoint; an off slot, or a thermostat off, reads "Off" without setpoint
    const requested = a.requested_state && a.requested_state.preset;
    const cause = causeText(src, entity, loc, requested ? presetOf(presets, String(requested), loc).name : null);
    if (cause) return html`<span class="tc-state">${dot(OFF_COLOR)}${cause.long}</span>`;
    if (st.state === 'off' || (plan && plan.hvac_mode === 'off')) return html`<span class="tc-state">${dot(OFF_COLOR)}${modeName(loc, 'off')}</span>`;
    // A fan-only, a dry or an auto slot: its HVAC mode, in Home Assistant's color, without setpoint
    if (plan && NO_PRESET_MODES.includes(plan.hvac_mode)) return html`<span class="tc-state">${dot(hvacColor(plan.hvac_mode))}${modeName(loc, plan.hvac_mode)}</span>`;
    let label;
    let color = null;
    if (plan && plan.preset) {
      ({ name: label, color } = presetOf(presets, plan.preset, loc));
      // The HVAC mode of the slot, where the thermostat lists more than one: "Cool · Comfort"
      if (hasModeRow(this.hass, entity) && SETPOINT_MODES.includes(plan.hvac_mode)) {
        label = `${modeName(loc, plan.hvac_mode)} · ${label}`;
        color = presetColorIn(presetOf(presets, plan.preset, loc), plan.hvac_mode);
      }
    }
    else if (a.preset_mode && MANUAL_PRESETS.includes(String(a.preset_mode).toLowerCase())) label = t('manual');
    else label = a.preset_mode ? loc.preset(a.preset_mode) : '';
    return html`<span class="tc-state">${color ? dot(color) : nothing}${text(label)}</span>`;
  }

  _onClick(e) {
    const link = e.target.closest('[data-more-info]');
    if (link) openMoreInfo(this, link.dataset.moreInfo);
    const to = e.target.closest('[data-navigate]');
    if (to && this.renderRoot.contains(to)) navigate(to.dataset.navigate);
  }
}

// Its visual editor: the thermostat, and its name (HA's name field from 2025.11, text before)
export class ChauffageThermostatCardEditor extends HTMLElement {
  // The fields of the element, untyped until the rewrite of the card gives them a type
  declare _config: any;
  declare _form: any;
  declare _hass: any;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass) return;
    const loc = makeLocale(this._hass);
    const haName = haAtLeast(this._hass, 2025, 11);
    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.addEventListener('value-changed', (e) => {
        e.stopPropagation();
        const { entity, name } = e.detail.value;
        const config = { ...this._config, entity: entity || this._config.entity };
        if (name === undefined || name === '' || (Array.isArray(name) && !name.length)) delete config.name;
        else config.name = name;
        this._config = config;
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
      });
      this.shadowRoot.appendChild(this._form);
    }
    const form = this._form;
    form.hass = this._hass;
    form.schema = [
      { name: 'entity', required: true, selector: { entity: { domain: 'climate' } } },
      haName ? { name: 'name', selector: { entity_name: {} }, context: { entity: 'entity' } } : { name: 'name', selector: { text: {} } },
    ];
    form.computeLabel = (s) => loc.t(s.name === 'name' ? 'editorName' : 'editorThermostat');
    const c = this._config;
    form.data = haName ? { entity: c.entity, ...(c.name !== undefined ? { name: c.name } : {}) }
      : { entity: c.entity, name: typeof c.name === 'string' ? c.name : '' };
  }
}
