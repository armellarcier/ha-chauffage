import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { sourceNotice } from '../notices.ts';
import { dataSource, filterActive } from '../client/snapshot.ts';
import { client } from '../client/chauffage-client.ts';
import { tileColor, tileCss } from './rooms-card.ts';
import { makeLocale } from '../i18n/locale.ts';

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

export class ChauffageSummaryCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _menuOpen: { state: true },
  };

  static styles = unsafeCSS(SUMMARY_CARD_STYLE);

  declare hass: any;
  declare _config: any;
  declare _menuOpen: boolean;
  private _unlisten: (() => void) | null = null;
  // A tap outside the card closes the menu of the schedules
  private _outside = (e) => {
    if (this._menuOpen && !e.composedPath().includes(this)) this._menuOpen = false;
  };

  static getConfigElement() {
    return document.createElement('chauffage-summary-card-editor');
  }

  // A new card: the whole house, every scheduled thermostat
  static async getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = config || {};
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
    return 1;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 'auto' };
  }

  // Its thermostats: the ones listed in the card, else every one Chauffage schedules
  _thermostats() {
    const listed = this._config.thermostats || [];
    const entities = listed.length ? listed.map((t) => (typeof t === 'string' ? t : t.entity)) : dataSource(this.hass).scheduled();
    return entities.filter((e) => this.hass.states[e]);
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    return html`<ha-card @click=${this._onClick} @keydown=${this._onKey}>${this._content()}</ha-card>`;
  }

  _content() {
    const hass = this.hass;
    const loc = makeLocale(hass, this._config.language);
    const t = loc.t;
    const src = dataSource(hass);
    const notice: any = sourceNotice(src);
    if (notice) return notice.loading ? nothing : html`<div class="msg">${t(notice.text)}</div>`;
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
      return html`${icon ? html`<ha-icon icon=${icon}></ha-icon>` : nothing}<span>${src.scheduleName(id)}</span>`;
    };
    // One button with the active schedule opens a menu of them: the card keeps one line on a
    // phone. The admin may hide it (`show_schedules: false`)
    const ids = select && this._config.show_schedules !== false ? src.schedules() : [];
    const menu = this._menuOpen
      ? html`<div class="sc-menu" role="menu">${ids.map((id) => html`<button type="button" role="menuitemradio" data-schedule=${id} aria-checked=${String(id === active)}>${label(id)}</button>`)}</div>`
      : nothing;
    const pick = ids.length
      ? html`<div class="sc-pick"><button type="button" data-schedules-button aria-haspopup="menu" aria-expanded=${String(!!this._menuOpen)} aria-label=${t('activeSchedule')} title=${t('activeSchedule')}>${active ? label(active) : nothing}<ha-icon icon="mdi:menu-down"></ha-icon></button>${menu}</div>`
      : nothing;
    return html`<div class="sc-main${action ? ' action' : ''}" role=${action ? 'button' : nothing} tabindex=${action ? '0' : nothing}>
        <span class="sc-badge" style="--tile-color:${tileColor(heating ? 'heat' : cooling ? 'cool' : 'off')}"><ha-icon icon=${this._config.icon || 'mdi:home-thermometer'}></ha-icon></span>
        <div class="sc-text">
          <div class="sc-line"><span class="sc-name">${this._config.name || t('summaryDefaultName')}</span></div>
          <div class="sc-state">${status}</div>
        </div>
      </div>
      ${pick}${this._measures(loc, thermostats)}`;
  }

  // The menu opens upward when the screen has no room for it below
  updated() {
    const popover = this.renderRoot.querySelector('.sc-menu');
    if (popover) {
      const r = popover.getBoundingClientRect();
      if (r.bottom > window.innerHeight && r.top - r.height - 48 > 0) popover.classList.add('up');
    }
  }

  // What its thermostats measure: the range of their temperatures ("19–20,1°"), and under it the
  // range of their humidity when they report it ("56–61 %"), each with its icon
  _measures(loc, thermostats) {
    const range = (attribute, round, unit) => {
      const measured = thermostats.map((e) => this.hass.states[e].attributes[attribute])
        .filter((v) => v != null && v !== '').map(Number).filter(Number.isFinite).map(round);
      if (!measured.length) return '';
      const low = Math.min(...measured);
      const high = Math.max(...measured);
      return low === high ? `${loc.number(low)}${unit}` : `${loc.number(low)}–${loc.number(high)}${unit}`;
    };
    const line = (cls, icon, value) => (value ? html`<div class=${cls}><ha-icon icon=${icon}></ha-icon>${value}</div>` : nothing);
    const temperature = range('current_temperature', (v) => Math.round(v * 10) / 10, '°');
    const humidity = range('current_humidity', Math.round, ' %');
    if (!temperature && !humidity) return nothing;
    return html`<div class="sc-measures">${line('sc-temperature sc-name', 'mdi:thermometer', temperature)}${line('sc-humidity sc-state', 'mdi:water-percent', humidity)}</div>`;
  }

  _onClick(e) {
    if (e.target.closest('[data-schedules-button]')) {
      this._menuOpen = !this._menuOpen;
      return;
    }
    const chip = e.target.closest('[data-schedule]');
    this._menuOpen = false;
    if (chip) {
      const src = dataSource(this.hass);
      this.hass.callService('select', 'select_option', { entity_id: src.scheduleSelect(), option: src.scheduleName(chip.dataset.schedule) });
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
