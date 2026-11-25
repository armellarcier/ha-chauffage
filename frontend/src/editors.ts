import { dataSource, haAtLeast, renamedTo, thermostatName } from './client.ts';
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

export class ChauffageProgrammeCardEditor extends HTMLElement {
  // The fields of the element, untyped until the rewrite of the card gives them a type
  declare _built: any;
  declare _config: any;
  declare _editing: any;
  declare _hass: any;
  declare _initial: any;
  declare _options: any;
  declare _page: any;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._editing = null; // index of the thermostat whose page is open
    this._built = null; // what the DOM shows: rebuilt only when it changes (keeps the focus)
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = config;
    // The thermostats when the editor opened (HA gives each change back through setConfig)
    if (!this._initial) this._initial = this._thermostats().map((t) => t.entity);
    this._render();
  }

  _thermostats() {
    return ((this._config && this._config.thermostats) || []).map((t) => (typeof t === 'string' ? { entity: t } : { ...t }));
  }

  _defaultName(entity) {
    return entity ? thermostatName(this._hass, entity) : '';
  }

  // Name shown under a row: only a name of the card's config that changes the thermostat's own
  _shownName(t) {
    const shown = t.name ? thermostatName(this._hass, t.entity, t.name) : null;
    return shown !== this._defaultName(t.entity) ? shown : null;
  }

  // HA's own name field (entity_name selector, from 2025.11): text, or pieces such as the area
  _haNameField() {
    return haAtLeast(this._hass, 2025, 11);
  }

  _render() {
    if (!this._config) return;
    const thermostats = this._thermostats();
    if (this._editing !== null && !thermostats[this._editing]) this._editing = null;
    const loc = makeLocale(this._hass);
    // The thermostat's page keeps its form while its fields change; the list is rebuilt
    const shape = JSON.stringify(this._editing !== null
      ? ['page', this._editing, loc.signature, this._haNameField()]
      : ['list', thermostats, thermostats.map((t) => [this._shownName(t), this._renamedTo(t.entity)]), loc.signature, this._removedScheduled()]);
    if (shape !== this._built) {
      this._built = shape;
      this.shadowRoot.replaceChildren();
      const style = document.createElement('style');
      style.textContent = EDITOR_CSS;
      this.shadowRoot.appendChild(style);
      if (this._editing !== null) this._buildPage(loc);
      else this._buildList(loc, thermostats);
    }
    for (const el of this.shadowRoot.querySelectorAll('ha-entity-picker, ha-form')) (el as any).hass = this._hass;
    if (this._editing !== null) this._page.data = this._pageData(thermostats[this._editing]);
    else if (this._options) {
      const c = this._config;
      this._options.data = { show_all: c.show === 'all', step: String(c.step || 15) };
    }
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
  _listNote(_loc?, _thermostats?): HTMLElement | null {
    return null;
  }

  // The card's options under the list: whether every thermostat shows at first, the time step
  _buildOptions(loc) {
    const options: any = document.createElement('ha-form');
    options.className = 'options';
    options.schema = [
      { name: 'show_all', selector: { boolean: {} } },
      { name: 'step', required: true, selector: { select: { mode: 'dropdown', options: EDITOR_STEPS.map((s) => ({ value: String(s), label: String(s) })) } } },
    ];
    options.computeLabel = (s) => loc.t({ show_all: 'editorShowAll', step: 'editorStep' }[s.name]);
    options.addEventListener('value-changed', (e: any) => {
      e.stopPropagation();
      const config = { ...this._config };
      if (e.detail.value.show_all) config.show = 'all';
      else if (config.show === 'all') delete config.show;
      const step = Number(e.detail.value.step);
      if (step && step !== 15) config.step = step;
      else delete config.step;
      this._emit(config);
    });
    return options;
  }

  _button(cls, label, path, onClick) {
    const b: any = document.createElement('ha-icon-button');
    b.className = cls;
    b.label = label;
    b.path = path;
    b.addEventListener('click', onClick);
    return b;
  }

  _picker(cls, onChange) {
    const p: any = document.createElement('ha-entity-picker');
    p.className = cls;
    p.includeDomains = ['climate'];
    p.addEventListener('value-changed', (e: any) => {
      e.stopPropagation();
      onChange(e.detail.value);
    });
    return p;
  }

  _renamedTo(entity) {
    return this._hass ? renamedTo(this._hass, dataSource(this._hass), entity) : null;
  }

  // Thermostats removed from the card while it is edited that Chauffage schedules: removing one
  // from a card does not stop its schedule (docs/decisions.md, "Scheduled thermostats")
  _removedScheduled() {
    if (!this._hass) return [];
    const now = this._thermostats().map((t) => t.entity);
    const scheduled = dataSource(this._hass).scheduled();
    return this._initial.filter((e) => !now.includes(e) && scheduled.includes(e));
  }

  _buildList(loc, thermostats) {
    const title = document.createElement('h3');
    title.textContent = this._listTitle(loc);
    const sortable = document.createElement('ha-sortable');
    sortable.setAttribute('handle-selector', '.handle');
    sortable.addEventListener('item-moved', (e: any) => {
      e.stopPropagation();
      const list = this._thermostats();
      list.splice(e.detail.newIndex, 0, list.splice(e.detail.oldIndex, 1)[0]);
      this._setThermostats(list);
    });
    const container = document.createElement('div');
    thermostats.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'thermostat';
      const handle = document.createElement('div');
      handle.className = 'handle';
      const icon: any = document.createElement('ha-svg-icon');
      icon.path = MDI.drag;
      handle.appendChild(icon);
      const cell = document.createElement('div');
      cell.className = 'picker';
      const picker: any = this._picker('', (entity) => {
        const list = this._thermostats();
        if (entity) list[i].entity = entity;
        else list.splice(i, 1);
        this._setThermostats(list);
      });
      picker.value = t.entity;
      picker.hideClearIcon = true;
      cell.appendChild(picker);
      const shown = this._shownName(t);
      if (shown) {
        const name = document.createElement('div');
        name.className = 'custom-name';
        name.textContent = loc.t('editorShownAs', { name: shown });
        cell.appendChild(name);
      }
      const to = this._renamedTo(t.entity);
      if (to) {
        const note = document.createElement('div');
        note.className = 'renamed-note';
        const text = document.createElement('span');
        text.textContent = loc.t('editorRenamed', { entity: to });
        const button = document.createElement('button');
        button.textContent = loc.t('editorUseNewId');
        button.addEventListener('click', () => {
          const list = this._thermostats();
          list[i].entity = to;
          this._setThermostats(list);
        });
        note.append(text, button);
        cell.appendChild(note);
      }
      row.append(handle, cell,
        this._button('remove', loc.t('editorRemove'), MDI.close, () => {
          const list = this._thermostats();
          list.splice(i, 1);
          this._setThermostats(list);
        }),
        this._button('edit', loc.t('editorEdit'), MDI.pencil, () => {
          this._editing = i;
          this._render();
        }));
      container.appendChild(row);
    });
    sortable.appendChild(container);
    const removed = this._removedScheduled().map((entity) => {
      const note = document.createElement('div');
      note.className = 'removed-note';
      note.textContent = loc.t('editorRemovedScheduled', { name: this._defaultName(entity) });
      return note;
    });
    const add: any = this._picker('add', (entity) => {
      if (!entity) return;
      add.value = '';
      this._setThermostats([...this._thermostats(), { entity }]);
    });
    add.setAttribute('add-button', '');
    this._options = this._buildOptions(loc);
    const note = this._listNote(loc, thermostats);
    this.shadowRoot.append(title, sortable, ...(note ? [note] : []), ...removed, add, ...(this._options ? [this._options] : []));
  }

  _buildPage(loc) {
    const header = document.createElement('div');
    header.className = 'header';
    const back: any = document.createElement('ha-icon-button-prev');
    back.label = loc.t('editorBack');
    back.addEventListener('click', () => {
      this._editing = null;
      this._render();
    });
    const title = document.createElement('span');
    title.textContent = loc.t('editorThermostat');
    header.append(back, title);
    const form: any = document.createElement('ha-form');
    form.schema = this._pageSchema();
    form.computeLabel = (s) => loc.t({ name: 'editorName', icon: 'editorIcon' }[s.name] || 'editorThermostat');
    form.computeHelper = (s) => (s.name === 'name' && !this._haNameField() ? loc.t('editorNameDefault', { name: this._defaultName(form.data && form.data.entity) }) : undefined);
    form.addEventListener('value-changed', (e: any) => {
      e.stopPropagation();
      const list = this._thermostats();
      const t = list[this._editing];
      if (e.detail.value.entity) t.entity = e.detail.value.entity;
      // An option emptied is left out: the thermostat's own name or icon
      for (const { name: key } of form.schema.filter((s) => s.name !== 'entity')) {
        const v = e.detail.value[key];
        if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete t[key];
        else t[key] = v;
      }
      this._setThermostats(list);
    });
    this._page = form;
    this.shadowRoot.append(header, form);
  }

  // A thermostat without a name nor other option is written as its entity id alone
  _setThermostats(list) {
    this._emit({ ...this._config, thermostats: list.map((t) => (Object.keys(t).length === 1 ? t.entity : t)) });
  }

  _emit(config) {
    this._config = config;
    this._render();
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
    if (thermostats.length) return null;
    const note = document.createElement('div');
    note.className = 'all-note custom-name';
    note.textContent = loc.t('editorAllScheduled');
    return note;
  }

  _buildOptions() {
    return null;
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
export class ChauffageSummaryCardEditor extends HTMLElement {
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
    if (!this._config) return;
    const loc = makeLocale(this._hass);
    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.addEventListener('value-changed', (e) => {
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
      });
      this.shadowRoot.appendChild(this._form);
    }
    const form = this._form;
    form.hass = this._hass;
    form.schema = [
      { name: 'name', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
      { name: 'thermostats', selector: { entity: { domain: 'climate', multiple: true } } },
      { name: 'show_schedules', selector: { boolean: {} } },
      { name: 'tap_action', selector: { ui_action: { default_action: 'none' } } },
    ];
    const labels = { name: 'editorName', icon: 'editorIcon', thermostats: 'editorThermostatsOptional', show_schedules: 'editorShowSchedules', tap_action: 'editorTapAction' };
    form.computeLabel = (s) => loc.t(labels[s.name]);
    form.computeHelper = (s) => (s.name === 'thermostats' && !(this._config.thermostats || []).length ? loc.t('editorAllScheduled') : undefined);
    // The thermostats as entity ids: a name given in YAML is not used by this card
    const c = this._config;
    form.data = { ...Object.fromEntries(SUMMARY_FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])),
      ...(c.thermostats ? { thermostats: c.thermostats.map((t) => (typeof t === 'string' ? t : t.entity)) } : {}),
      show_schedules: c.show_schedules !== false };
  }
}
