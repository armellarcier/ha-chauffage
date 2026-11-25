import { sourceNotice } from '../notices.ts';
import { dataSource, filterActive } from '../client/snapshot.ts';
import { client } from '../client/chauffage-client.ts';
import { tileColor, tileCss } from './rooms-card.ts';
import { esc } from '../common.ts';
import { makeLocale } from '../i18n/locale.ts';
import { fillCard } from '../override-edit.ts';

// =====================================================================
//  Summary card (custom:chauffage-summary-card): a floor or the house in one row, drawn like
//  Home Assistant's Tile card. Its temperature, how many thermostats heat, the overrides and the
//  thermostats paused; the schedules, activated through the select of the active schedule. A tap
//  elsewhere does the card's action (`tap_action`), a pop-up of the rooms for example.
// =====================================================================

const SUMMARY_CARD_STYLE = `${tileCss('sc')}
  :host { display:block; }
  ha-card { display:flex; align-items:center; gap:8px; padding:10px 12px; }
  .sc-main { flex:1 1 0; display:grid; grid-template-columns:36px minmax(0,1fr); align-items:center; gap:0 10px;
    min-width:0; -webkit-tap-highlight-color:transparent; }
  .sc-main.action { cursor:pointer; }
  .sc-text { min-width:0; }
  /* One button with the active schedule, outlined like the HVAC mode button of the rooms card */
  .sc-pick { position:relative; flex:none; max-width:45%; margin-left:auto; }
  .sc-pick > button { display:flex; align-items:center; gap:4px; max-width:100%; height:34px; padding:0 4px 0 10px;
    border:1px solid var(--divider-color); border-radius:18px; background:none; color:var(--primary-text-color); cursor:pointer;
    font:inherit; font-size:var(--ha-font-size-s, 12px); --mdc-icon-size:18px; }
  .sc-pick > button:hover, .sc-pick > button[aria-expanded="true"] { background:var(--secondary-background-color); }
  .sc-pick > button > * { flex:none; }
  .sc-pick > button > span { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sc-menu { --tile-color:var(--primary-color); }
  /* What its thermostats measure, at its right end: the temperatures as a name, the humidity as a state */
  .sc-measures { flex:none; display:flex; flex-direction:column; align-items:flex-end; font-variant-numeric:tabular-nums; }
  .sc-measures > div { display:flex; align-items:center; gap:2px; }
  .sc-measures ha-icon { color:var(--secondary-text-color); --mdc-icon-size:16px; }
  .sc-humidity { color:var(--secondary-text-color); }
  .msg { color:var(--secondary-text-color); font-size:.92em; }
`;

export class ChauffageSummaryCard extends HTMLElement {
  // The fields of the element, untyped until the rewrite of the card gives them a type
  declare _config: any;
  declare _hass: any;
  declare _html: any;
  declare _menuOpen: any;
  declare _outside: any;
  declare _unlisten: any;

  static getConfigElement() {
    return document.createElement('chauffage-summary-card-editor');
  }

  // A new card: the whole house, every scheduled thermostat
  static async getStubConfig() {
    return {};
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
    this.shadowRoot.addEventListener('keydown', (e) => this._onKey(e));
    // A tap outside the card closes the menu of the schedules
    this._outside = (e) => {
      if (this._menuOpen && !e.composedPath().includes(this)) { this._menuOpen = false; this._render(); }
    };
  }

  setConfig(config) {
    this._config = config || {};
    this._html = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._unlisten && dataSource(hass).available) {
      this._unlisten = client.listen(() => { if (this._hass) this.hass = this._hass; });
    }
    if (this._config) this._render();
  }

  connectedCallback() {
    document.addEventListener('click', this._outside);
    if (this._hass && !this._unlisten && dataSource(this._hass).available) this.hass = this._hass;
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._outside);
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 'auto' };
  }

  // Its thermostats: the ones listed in the card, else every one Chauffage schedules
  _thermostats() {
    const listed = this._config.thermostats || [];
    const entities = listed.length ? listed.map((t) => (typeof t === 'string' ? t : t.entity)) : dataSource(this._hass).scheduled();
    return entities.filter((e) => this._hass.states[e]);
  }

  _render() {
    const hass = this._hass;
    const loc = makeLocale(hass, this._config.language);
    const t = loc.t;
    const src = dataSource(hass);
    const notice: any = sourceNotice(src);
    let html;
    if (notice) html = notice.loading ? '' : `<div class="msg">${esc(t(notice.text))}</div>`;
    else {
      const thermostats = this._thermostats();
      const overrides = filterActive(src.overrides());
      const doing = (action) => thermostats.filter((e) => hass.states[e].attributes.hvac_action === action).length;
      const heating = doing('heating');
      const cooling = doing('cooling');
      const overridden = thermostats.filter((e) => overrides[e] && !src.paused(e)).length;
      const paused = thermostats.filter((e) => src.paused(e)).length;
      const count = (n, one, many) => (n === 1 ? t(one) : t(many, { n }));
      const status = [heating ? count(heating, 'heatingOne', 'heatingMany') : cooling ? '' : t('heatingNone'),
        cooling ? count(cooling, 'coolingOne', 'coolingMany') : '',
        overridden ? count(overridden, 'overridesOne', 'overridesMany') : '',
        paused ? count(paused, 'pausedOne', 'pausedMany') : ''].filter(Boolean).join(' · ');
      const action = this._config.tap_action && this._config.tap_action.action !== 'none';
      const select = src.scheduleSelect();
      const active = src.activeSchedule();
      const label = (id) => {
        const icon = src.scheduleIcon(id);
        return `${icon ? `<ha-icon icon="${esc(icon)}"></ha-icon>` : ''}<span>${esc(src.scheduleName(id))}</span>`;
      };
      // One button with the active schedule opens a menu of them: the card keeps one line on a
      // phone. The admin may hide it (`show_schedules: false`)
      const ids = select && this._config.show_schedules !== false ? src.schedules() : [];
      const menu = this._menuOpen
        ? `<div class="sc-menu" role="menu">${ids.map((id) => `<button type="button" role="menuitemradio" data-schedule="${esc(id)}" aria-checked="${id === active}">${label(id)}</button>`).join('')}</div>`
        : '';
      const pick = ids.length
        ? `<div class="sc-pick"><button type="button" data-schedules-button aria-haspopup="menu" aria-expanded="${!!this._menuOpen}" aria-label="${esc(t('activeSchedule'))}" title="${esc(t('activeSchedule'))}">${active ? label(active) : ''}<ha-icon icon="mdi:menu-down"></ha-icon></button>${menu}</div>`
        : '';
      html = `<div class="sc-main${action ? ' action' : ''}"${action ? ' role="button" tabindex="0"' : ''}>
          <span class="sc-badge" style="--tile-color:${tileColor(heating ? 'heat' : cooling ? 'cool' : 'off')}"><ha-icon icon="${esc(this._config.icon || 'mdi:home-thermometer')}"></ha-icon></span>
          <div class="sc-text">
            <div class="sc-line"><span class="sc-name">${esc(this._config.name || t('summaryDefaultName'))}</span></div>
            <div class="sc-state">${esc(status)}</div>
          </div>
        </div>
        ${pick}${this._measuresHtml(loc, thermostats)}`;
    }
    if (html === this._html && this.shadowRoot.querySelector('ha-card')) return;
    this._html = html;
    fillCard(this.shadowRoot, SUMMARY_CARD_STYLE, html);
    // The menu opens upward when the screen has no room for it below
    const popover = this.shadowRoot.querySelector('.sc-menu');
    if (popover) {
      const r = popover.getBoundingClientRect();
      if (r.bottom > window.innerHeight && r.top - r.height - 48 > 0) popover.classList.add('up');
    }
  }

  // What its thermostats measure: the range of their temperatures ("19–20,1°"), and under it the
  // range of their humidity when they report it ("56–61 %"), each with its icon
  _measuresHtml(loc, thermostats) {
    const range = (attribute, round, unit) => {
      const measured = thermostats.map((e) => this._hass.states[e].attributes[attribute])
        .filter((v) => v != null && v !== '').map(Number).filter(Number.isFinite).map(round);
      if (!measured.length) return '';
      const low = Math.min(...measured);
      const high = Math.max(...measured);
      return low === high ? `${loc.number(low)}${unit}` : `${loc.number(low)}–${loc.number(high)}${unit}`;
    };
    const line = (cls, icon, value) => (value ? `<div class="${cls}"><ha-icon icon="${icon}"></ha-icon>${esc(value)}</div>` : '');
    const html = line('sc-temperature sc-name', 'mdi:thermometer', range('current_temperature', (v) => Math.round(v * 10) / 10, '°'))
      + line('sc-humidity sc-state', 'mdi:water-percent', range('current_humidity', Math.round, ' %'));
    return html ? `<div class="sc-measures">${html}</div>` : '';
  }

  _onClick(e) {
    const hass = this._hass;
    if (!hass) return;
    if (e.target.closest('[data-schedules-button]')) {
      this._menuOpen = !this._menuOpen;
      return this._render();
    }
    const chip = e.target.closest('[data-schedule]');
    if (this._menuOpen) { this._menuOpen = false; this._render(); }
    if (chip) {
      const src = dataSource(hass);
      hass.callService('select', 'select_option', { entity_id: src.scheduleSelect(), option: src.scheduleName(chip.dataset.schedule) });
      return;
    }
    if (e.target.closest('.sc-main')) this._tap();
  }

  // Enter or Space on the card does its action, as a tap
  _onKey(e) {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.closest || !e.target.closest('.sc-main')) return;
    e.preventDefault();
    this._tap();
  }

  // The card's action (`tap_action`), through Home Assistant's own handler of card actions
  _tap() {
    const tap = this._config.tap_action;
    if (!tap || tap.action === 'none') return;
    this.dispatchEvent(new CustomEvent('hass-action', { detail: { config: { tap_action: tap }, action: 'tap' }, bubbles: true, composed: true }));
  }
}
