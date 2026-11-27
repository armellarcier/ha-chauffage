import { html, nothing } from 'lit';
import { DismissController } from '../../controllers/dismiss-controller.ts';
import { deviceLabel, placements, placesTemplate, thermostatDevices, weeksPath } from '../../links.ts';
import { INTEGRATION_PAGE } from '../../settings-dialog.ts';
import { listRow } from '../shared/list-row.ts';
import { ChauffageView } from './view.ts';

// The ⋮ menu of a thermostat open, under its button
type ThermostatMenu = { climate: string; top: number; right: number };

// The panel's Thermostats page: every scheduled thermostat, by name. A row says what matters
// first: the thermostat (it opens its page), whether Chauffage controls it, the cards that show
// it. Pause is at hand; the rarer actions (open it, its devices, forget it) wait behind ⋮.
export class ChauffageThermostatsView extends ChauffageView {
  _menu: ThermostatMenu | null = null;
  // The thermostat whose Forget asks for a confirmation, in its menu
  _forgetAsk: string | null = null;
  // The cards that show each thermostat, read from the dashboards once: null while they are read
  _placements: any = undefined;
  _dismiss = new DismissController(this, () => {
    if (!this._menu) return false;
    this._menu = null;
    this._forgetAsk = null;
    return true;
  });

  willUpdate() {
    if (this._placements === undefined && this.hass) {
      this._placements = null;
      placements(this.hass).then((p) => { this._placements = p; this.requestUpdate(); });
    }
  }

  render() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const scheduled = [...src.scheduled()].sort((a, b) => this._name(a).localeCompare(this._name(b)));
    const placesLine = (climate) => (this._placements
      ? html`<div class="th-cards">${placesTemplate(t, this._placements[climate] || [])}</div>` : nothing);
    // A row opens the thermostat's sheet; only a paused thermostat has a badge, the exception. Its
    // actions wait in its ⋮ menu (canSetUp)
    const rows = scheduled.map((climate) => {
      const paused = src.paused(climate);
      const open = this._menu && this._menu.climate === climate;
      const more = !editable ? null
        : html`<button class="icon-btn${open ? ' on' : ''}" data-act="thermostat-more" data-climate=${climate} @click=${(e) => this._toggleMenu(climate, e.currentTarget)} title=${t('moreActions')} aria-label=${t('moreActions')}><ha-icon icon="mdi:dots-vertical"></ha-icon></button>`;
      const icon = (this.hass.states[climate] || { attributes: {} }).attributes.icon || 'mdi:thermostat';
      return listRow({ cls: `th-row${paused ? ' paused' : ''}`, climate, to: weeksPath(climate), icon,
        title: html`${this._name(climate)}${paused ? html` <span class="badge paused">${t('paused')}</span>` : nothing}`,
        sub: placesLine(climate), actions: more });
    });
    // Schedule another thermostat: one of the climates Chauffage does not schedule yet
    const climates = Object.keys(this.hass.states).filter((e) => e.startsWith('climate.') && !scheduled.includes(e))
      .sort((a, b) => this._name(a).localeCompare(this._name(b)));
    const add = editable && climates.length ? html`<div class="th-add"><div class="th-add-title">${t('addThermostat')}</div>
        <div class="th-add-row"><select data-add-climate>${climates.map((c) => html`<option value=${c}>${this._name(c)}</option>`)}</select>
        <button class="btn primary" data-act="thermostat-add" @click=${() => this._scheduleThermostat()}>${t('scheduleThermostat')}</button></div></div>` : nothing;
    // The integration's page: its options, its logs and its diagnostics. Home Assistant keeps it
    // for admins
    const integration = src.admin
      ? html`<div class="th-foot"><span class="mi-link" role="link" tabindex="0" data-navigate=${INTEGRATION_PAGE}>${t('integrationPage')}</span></div>` : nothing;
    return html`<div class="thermostats-view"><div class="th-hint">${t('thermostatsHint')}</div><div class="th-list">${rows}</div>${add}
      ${integration}</div>${this._menuTemplate()}${this._msgTemplate()}`;
  }

  // A thermostat's ⋮ menu, floating as every ⋮ menu of the card: Pause or Control, the thermostat
  // and its devices, Forget (then its confirmation, in the menu)
  _menuTemplate() {
    const m = this._menu;
    const src = this._source();
    if (!m || !src.scheduled().includes(m.climate)) return nothing;
    const t = this._loc.t;
    const action = (act, label, run, cls = 'mi') => html`<button class=${cls} data-act=${act} data-climate=${m.climate} @click=${run}><span>${label}</span></button>`;
    const ask = (climate) => () => { this._forgetAsk = climate; this.requestUpdate(); };
    const body = this._forgetAsk === m.climate
      ? html`<div class="mh">${t('forgetText', { name: this._name(m.climate) })}</div>
        <div class="sched-btns">${action('thermostat-forget-confirm', t('forgetConfirm'), () => this._forget(m.climate), 'btn small danger')}
        ${action('thermostat-forget-cancel', t('cancel'), ask(null), 'btn small')}</div>`
      : html`${src.paused(m.climate) ? action('resume', t('resumeShort'), () => this._setPaused(m.climate, false)) : action('pause', t('pauseShort'), () => this._setPaused(m.climate, true))}
        <div class="sep"></div>
        <button class="mi" data-more-info=${m.climate}><span>${t('openThermostat')}</span></button>
        ${(src.admin ? thermostatDevices(this.hass, src, m.climate) : [])
          .map((id) => html`<button class="mi" data-device=${id}><span>${deviceLabel(this.hass, id)}</span></button>`)}
        <div class="sep"></div>
        ${action('thermostat-forget', t('forget'), ask(m.climate), 'mi danger')}`;
    return html`<div class="menu th-menu" style="top:${m.top}px;right:${m.right}px">${body}</div>`;
  }

  // A thermostat's menu open: a click elsewhere only closes it
  _clickCloses(e) {
    if (!this._menu || e.target.closest('.th-menu, [data-act="thermostat-more"]')) return false;
    this._menu = null;
    this._forgetAsk = null;
    return true;
  }

  _leaving() {
    this._menu = null;
  }

  _setPaused(climate, paused) {
    this._menu = null;
    return this._call((cmd) => cmd.setPaused(climate, paused));
  }

  // A thermostat's ⋮: its menu, under its button, as the row menu
  _toggleMenu(climate, el) {
    const card = this._frame().getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const m = this._menu;
    this._menu = m && m.climate === climate ? null : { climate, top: b.bottom - card.top + 4, right: card.right - b.right };
    this._forgetAsk = null;
    this.requestUpdate();
  }

  _forget(climate) {
    this._menu = null;
    this._forgetAsk = null;
    return this._call((cmd) => cmd.forget(climate));
  }

  // Schedules the thermostat picked, with the week of a new schedule in every schedule (as a
  // thermostat added to a card)
  _scheduleThermostat() {
    const climate = (this.querySelector('[data-add-climate]') as HTMLSelectElement).value;
    return this._call((cmd) => cmd.saveWeeks({ [climate]: {} }, { [climate]: null }));
  }
}
