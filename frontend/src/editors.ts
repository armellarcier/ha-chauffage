import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { haAtLeast, thermostatName } from './common.ts';
import { dataSource, renamedTo } from './client/snapshot.ts';
import { makeLocale } from './i18n/locale.ts';

// =====================================================================
//  Visual editor of the card (dashboard → edit card), laid out like Home Assistant's own card
//  editors (Entities, Tile…): one row per thermostat (drag handle, picker, remove, edit); the
//  edit button opens the thermostat's page, with its optional name. Built on HA's elements
//  (<ha-entity-picker>, <ha-sortable>, <ha-form>…), already loaded in the card editor dialog.
//  Options it does not show (written in YAML, like `language`) are kept as they are.
// =====================================================================

const EDITOR_STEPS = [5, 10, 15, 30];
export const MDI = {
  drag: 'M21,11H3V9H21V11M21,13H3V15H21V13Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  pencil: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
};
const EDITOR_CSS = `
  .removed-note, .renamed-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 0; padding: 8px 12px;
    border-radius: 8px; background: rgba(var(--rgb-warning-color, 255, 166, 0), .15); }
  .renamed-note { margin: 4px 0 0; }
  .renamed-note span { flex: 1 1 200px; }
  .renamed-note button { font: inherit; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--divider-color);
    background: var(--card-background-color); color: var(--primary-text-color); cursor: pointer; }
  h3 { margin: 0 0 8px; font-size: 1em; font-weight: 500; }
  .thermostat { display: flex; align-items: center; gap: 4px; }
  .thermostat + .thermostat { margin-top: 8px; }
  .handle { cursor: move; padding: 8px 4px; color: var(--secondary-text-color); display: flex; }
  .picker { flex: 1; min-width: 0; }
  .picker ha-entity-picker { display: block; }
  .custom-name { font-size: .85em; color: var(--secondary-text-color); padding: 2px 0 0 12px; }
  .add { display: block; margin: 12px 0 24px; }
  .header { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; font-size: 1.1em; }
`;

const EDITOR_STEP_OPTIONS = EDITOR_STEPS.map((s) => ({ value: String(s), label: String(s) }));

export class ChauffageProgrammeCardEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _editing: { state: true },
  };

  static styles = unsafeCSS(EDITOR_CSS);

  declare hass: any;
  declare _config: any;
  // The index of the thermostat whose page is open, else null
  declare _editing: number | null;
  // The thermostats when the editor opened (HA gives each change back through setConfig)
  _initial: string[] | null = null;
  // A row dragged by its handle: the list is drawn anew, as the drag moved its rows
  _moves = 0;

  constructor() {
    super();
    this._editing = null;
  }

  setConfig(config) {
    this._config = config;
    if (!this._initial) this._initial = this._thermostats().map((t) => t.entity);
  }

  _thermostats() {
    return ((this._config && this._config.thermostats) || []).map((t) => (typeof t === 'string' ? { entity: t } : { ...t }));
  }

  _defaultName(entity) {
    return entity ? thermostatName(this.hass, entity) : '';
  }

  // Name shown under a row: only a name of the card's config that changes the thermostat's own
  _shownName(t) {
    const shown = t.name ? thermostatName(this.hass, t.entity, t.name) : null;
    return shown !== this._defaultName(t.entity) ? shown : null;
  }

  // HA's own name field (entity_name selector, from 2025.11): text, or pieces such as the area
  _haNameField() {
    return haAtLeast(this.hass, 2025, 11);
  }

  willUpdate() {
    if (this._editing !== null && !this._thermostats()[this._editing]) this._editing = null;
  }

  render() {
    if (!this._config) return nothing;
    const thermostats = this._thermostats();
    const editing = this._editing;
    const loc = makeLocale(this.hass);
    return editing !== null ? this._page(loc, thermostats[editing]) : this._list(loc, thermostats);
  }

  // What a thermostat's page shows: its entity and its optional name
  _pageData(t) {
    return this._haNameField()
      ? { entity: t.entity, ...(t.name !== undefined ? { name: t.name } : {}) }
      : { entity: t.entity, name: typeof t.name === 'string' ? t.name : '' };
  }

  _pageSchema(): any[] {
    return [
      { name: 'entity', required: true, selector: { entity: { domain: 'climate' } } },
      this._haNameField()
        ? { name: 'name', selector: { entity_name: {} }, context: { entity: 'entity' } }
        : { name: 'name', selector: { text: {} } },
    ];
  }

  _listTitle(loc) {
    return loc.t('editorThermostats');
  }

  // A note under the list, if any
  _listNote(_loc?, _thermostats?): unknown {
    return nothing;
  }

  // The card's options under the list: whether every thermostat shows at first, the time step
  _options(loc): unknown {
    const c = this._config;
    return html`<ha-form class="options" .hass=${this.hass}
      .schema=${[
        { name: 'show_all', selector: { boolean: {} } },
        { name: 'step', required: true, selector: { select: { mode: 'dropdown', options: EDITOR_STEP_OPTIONS } } },
      ]}
      .computeLabel=${(s) => loc.t({ show_all: 'editorShowAll', step: 'editorStep' }[s.name])}
      .data=${{ show_all: c.show === 'all', step: String(c.step || 15) }}
      @value-changed=${this._optionsChanged}></ha-form>`;
  }

  _optionsChanged(e) {
    e.stopPropagation();
    const config = { ...this._config };
    if (e.detail.value.show_all) config.show = 'all';
    else if (config.show === 'all') delete config.show;
    const step = Number(e.detail.value.step);
    if (step && step !== 15) config.step = step;
    else delete config.step;
    this._emit(config);
  }

  _renamedTo(entity) {
    return this.hass ? renamedTo(this.hass, dataSource(this.hass), entity) : null;
  }

  // Thermostats removed from the card while it is edited that Chauffage schedules: removing one
  // from a card does not stop its schedule (docs/decisions.md, "Scheduled thermostats")
  _removedScheduled() {
    if (!this.hass) return [];
    const now = this._thermostats().map((t) => t.entity);
    const scheduled = dataSource(this.hass).scheduled();
    return this._initial.filter((e) => !now.includes(e) && scheduled.includes(e));
  }

  // Changes the list of thermostats: `change(list)` edits a copy of it
  _edit(change) {
    const list = this._thermostats();
    change(list);
    this._setThermostats(list);
  }

  _list(loc, thermostats) {
    const t = loc.t;
    const row = (th, i) => {
      const shown = this._shownName(th);
      const to = this._renamedTo(th.entity);
      return html`<div class="thermostat">
        <div class="handle"><ha-svg-icon .path=${MDI.drag}></ha-svg-icon></div>
        <div class="picker">
          <ha-entity-picker .hass=${this.hass} .includeDomains=${['climate']} .value=${th.entity} .hideClearIcon=${true}
            @value-changed=${(e) => {
              e.stopPropagation();
              const entity = e.detail.value;
              this._edit((list) => (entity ? (list[i].entity = entity) : list.splice(i, 1)));
            }}></ha-entity-picker>
          ${shown ? html`<div class="custom-name">${t('editorShownAs', { name: shown })}</div>` : nothing}
          ${to ? html`<div class="renamed-note"><span>${t('editorRenamed', { entity: to })}</span>
            <button @click=${() => this._edit((list) => { list[i].entity = to; })}>${t('editorUseNewId')}</button></div>` : nothing}
        </div>
        <ha-icon-button class="remove" .label=${t('editorRemove')} .path=${MDI.close}
          @click=${() => this._edit((list) => list.splice(i, 1))}></ha-icon-button>
        <ha-icon-button class="edit" .label=${t('editorEdit')} .path=${MDI.pencil}
          @click=${() => { this._editing = i; }}></ha-icon-button>
      </div>`;
    };
    return html`<h3>${this._listTitle(loc)}</h3>
      <ha-sortable handle-selector=".handle" @item-moved=${this._moved}>
        ${keyed(this._moves, html`<div>${thermostats.map(row)}</div>`)}
      </ha-sortable>
      ${this._listNote(loc, thermostats)}
      ${this._removedScheduled().map((entity) => html`<div class="removed-note">${t('editorRemovedScheduled', { name: this._defaultName(entity) })}</div>`)}
      <ha-entity-picker class="add" add-button .hass=${this.hass} .includeDomains=${['climate']}
        @value-changed=${(e) => {
          e.stopPropagation();
          const entity = e.detail.value;
          if (!entity) return;
          e.target.value = '';
          this._setThermostats([...this._thermostats(), { entity }]);
        }}></ha-entity-picker>
      ${this._options(loc)}`;
  }

  _moved(e) {
    e.stopPropagation();
    this._moves += 1;
    this._edit((list) => list.splice(e.detail.newIndex, 0, list.splice(e.detail.oldIndex, 1)[0]));
  }

  _page(loc, th) {
    const haName = this._haNameField();
    return html`<div class="header">
        <ha-icon-button-prev .label=${loc.t('editorBack')} @click=${() => { this._editing = null; }}></ha-icon-button-prev>
        <span>${loc.t('editorThermostat')}</span>
      </div>
      <ha-form .hass=${this.hass} .schema=${this._pageSchema()} .data=${this._pageData(th)}
        .computeLabel=${(s) => loc.t({ name: 'editorName', icon: 'editorIcon' }[s.name] || 'editorThermostat')}
        .computeHelper=${(s) => (s.name === 'name' && !haName ? loc.t('editorNameDefault', { name: this._defaultName(th.entity) }) : undefined)}
        @value-changed=${this._pageChanged}></ha-form>`;
  }

  _pageChanged(e) {
    e.stopPropagation();
    this._edit((list) => {
      const t = list[this._editing];
      if (e.detail.value.entity) t.entity = e.detail.value.entity;
      // An option emptied is left out: the thermostat's own name or icon
      for (const { name: key } of this._pageSchema().filter((s) => s.name !== 'entity')) {
        const v = e.detail.value[key];
        if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete t[key];
        else t[key] = v;
      }
    });
  }

  // A thermostat without a name nor other option is written as its entity id alone
  _setThermostats(list) {
    this._emit({ ...this._config, thermostats: list.map((t) => (Object.keys(t).length === 1 ? t.entity : t)) });
  }

  _emit(config) {
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }
}

// The rooms card's editor: the schedule card's list of thermostats, a thermostat's page with its
// icon too, and no option of the schedule card. An empty list shows every scheduled thermostat
export class ChauffageRoomsCardEditor extends ChauffageProgrammeCardEditor {
  _listTitle(loc) {
    return loc.t('editorThermostatsOptional');
  }

  _listNote(loc, thermostats) {
    return thermostats.length ? nothing : html`<div class="all-note custom-name">${loc.t('editorAllScheduled')}</div>`;
  }

  _options() {
    return nothing;
  }

  _removedScheduled() {
    return [];
  }

  _pageSchema() {
    return [...super._pageSchema(), { name: 'icon', selector: { icon: {} } }];
  }

  _pageData(t) {
    return { ...super._pageData(t), icon: t.icon || '' };
  }
}

// The summary card's editor: one form, as Home Assistant's own card editors. Options written in
// YAML that it does not show (`language`) are kept; an option emptied is left out
const SUMMARY_FIELDS = ['name', 'icon', 'thermostats', 'show_schedules', 'tap_action'];
const SUMMARY_SCHEMA = [
  { name: 'name', selector: { text: {} } },
  { name: 'icon', selector: { icon: {} } },
  { name: 'thermostats', selector: { entity: { domain: 'climate', multiple: true } } },
  { name: 'show_schedules', selector: { boolean: {} } },
  { name: 'tap_action', selector: { ui_action: { default_action: 'none' } } },
];
const SUMMARY_LABELS = { name: 'editorName', icon: 'editorIcon', thermostats: 'editorThermostatsOptional', show_schedules: 'editorShowSchedules', tap_action: 'editorTapAction' };

export class ChauffageSummaryCardEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  declare hass: any;
  declare _config: any;

  setConfig(config) {
    this._config = config;
  }

  render() {
    if (!this._config) return nothing;
    const loc = makeLocale(this.hass);
    // The thermostats as entity ids: a name given in YAML is not used by this card
    const c = this._config;
    const data = { ...Object.fromEntries(SUMMARY_FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])),
      ...(c.thermostats ? { thermostats: c.thermostats.map((t) => (typeof t === 'string' ? t : t.entity)) } : {}),
      show_schedules: c.show_schedules !== false };
    return html`<ha-form .hass=${this.hass} .schema=${SUMMARY_SCHEMA} .data=${data}
      .computeLabel=${(s) => loc.t(SUMMARY_LABELS[s.name])}
      .computeHelper=${(s) => (s.name === 'thermostats' && !(c.thermostats || []).length ? loc.t('editorAllScheduled') : undefined)}
      @value-changed=${this._changed}></ha-form>`;
  }

  _changed(e) {
    e.stopPropagation();
    const config = { ...this._config };
    for (const key of SUMMARY_FIELDS) {
      const v = e.detail.value[key];
      // The menu of the schedules is shown by default: written only when hidden
      if (v === undefined || v === '' || v === null || (Array.isArray(v) && !v.length) || (key === 'show_schedules' && v === true)) delete config[key];
      else config[key] = v;
    }
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }
}
