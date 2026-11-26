import { html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { coolColor, derivedCoolColor } from '../../colors.ts';
import { MANUAL_PRESETS, SETTING_ATTRS, errorText, hasNoPreset } from '../../common.ts';
import { DismissController } from '../../controllers/dismiss-controller.ts';
import { captureButton, captureState, coolsOnly, hvacIconTemplate, isReversible, listsMode, moreSettings, ownPresetName, parseDecimal, presetModes, slotModeOn } from '../../hvac.ts';
import { deviceLink, deviceOf } from '../../links.ts';
import { coolPresetTemperatureOf, presetTemperatureOf, presetValue, presetValueAnswered, targetOf } from '../../override-edit.ts';
import { fitTemperature, presetsOf, sortedPresets, stepOf, stepper } from '../../presets.ts';
import { parseSlot } from '../../slots.ts';
import { placePopover, placeWhenDrawn } from '../shared/popover.ts';
import { ChauffageView } from './view.ts';

// The cell whose popover is open: a preset's own (`preset`), what it does on a thermostat
// (`thermostat`), or a new preset (`new`); `deleting` while its deletion asks for a confirmation
type Cell = { kind: string; preset: string; climate?: string; deleting?: boolean };

// The mark of an HVAC mode before a value, "🔥 20°"
const mark = (mode) => html`<span class="m">${hvacIconTemplate(mode)}</span>`;
// Templates joined with a separator
const joined = (parts, sep) => parts.map((part, i) => html`${i ? sep : nothing}${part}`);

// The presets view: one column per preset (its header: the preset, then its default temperature),
// one row per thermostat; each cell says what that thermostat does with that preset. A cell opens
// a popover that sets it. On a thermostat's sheet in the panel (`definitions` false), the presets
// themselves are not set (they are every thermostat's): a list, one item per preset
export class ChauffagePresetsView extends ChauffageView {
  static properties = {
    ...ChauffageView.properties,
    definitions: { attribute: false },
  };

  declare definitions: boolean;
  _cell: Cell | null = null;
  _cellError: string | null = null;
  // What the empty cooling field gives follows the row chosen (_cellCoolNote): the value that row
  // sets by hand. Undefined: no row chosen yet, the stored value
  _coolFrom: any = undefined;
  // The thermostat whose row a slot's setpoint link asked for, brought into view once
  _targetShown: string | null = null;
  // The newest placing of the popover: an older one stops
  _placeToken = 0;
  // More settings opened by a tap: what it holds comes into sight
  _moreTapped = false;
  // The cell whose popover just took the thermostat's state: its button says so for 2 s
  _captured: Cell | null = null;
  _dismiss = new DismissController(this, () => {
    if (!this._cell) return false;
    this._cell = null;
    return true;
  });

  constructor() {
    super();
    // Typing a temperature for a thermostat's preset means "use a temperature"
    this.addEventListener('input', (e: any) => {
      if (e.target.hasAttribute('data-cell-temp')) this._cellChoose('temperature');
      if (e.target.hasAttribute('data-cell-cool')) this._cellChooseField(true);
    });
    this.addEventListener('change', (e: any) => {
      const el = e.target;
      if (el.hasAttribute('data-cell-preset')) this._cellChoose('own'); // picking one of the thermostat's presets means "use it"
      else if (el.matches('.cell-ed input[name="cell-choice"]')) this._cellCoolNote();
      else if (el.hasAttribute('data-cell-color')) this._cellCoolColor();
      else if (el.hasAttribute('data-cell-cool-color')) el.setAttribute('data-chosen', ''); // the user's own cool color: it no longer follows the color
    });
    // The table scrolled sideways: its cues follow
    this.addEventListener('scroll', (e: any) => {
      if (e.target.matches && e.target.matches('.table-wrap')) this._tableCue();
    }, true);
    // More settings opened or closed: the popover is taller or shorter, and may no longer fit
    // where it is. Opened by the user (a redraw opens it again too): what it holds comes into sight
    this.addEventListener('toggle', (e: any) => {
      if (!e.target.matches || !e.target.matches('.editor details.more')) return;
      this._place();
      const tapped = this._moreTapped;
      this._moreTapped = false;
      const body = e.target.closest('.ed-body');
      if (!tapped || !e.target.open || !body) return;
      const below = e.target.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
      if (below > 0) body.scrollTop += Math.min(below, e.target.getBoundingClientRect().top - body.getBoundingClientRect().top);
    }, true);
    this.addEventListener('click', (e: any) => {
      if (e.target.closest && e.target.closest('.editor details.more > summary')) this._moreTapped = true;
    }, true);
  }

  // Presets as shown: from the coldest to the warmest default temperature
  _presets() {
    return sortedPresets(this._source(), this._loc);
  }

  _targetOf(climate, preset) {
    return targetOf(this._source(), this.hass, climate, preset);
  }

  updated() {
    this._tableCue();
    // Again once ha-card (a Lit component, drawn asynchronously) shows its content: before that,
    // the table has no width to scroll
    const frame: any = this._frame();
    if (frame.updateComplete instanceof Promise) frame.updateComplete.then(() => this._tableCue());
    this._showTargetRow();
    this._cellCoolNote(); // what the default gives when cooling, in a cell popover just opened
    if (this._cell) {
      const token = ++this._placeToken;
      placeWhenDrawn(frame, () => token === this._placeToken, () => this._place());
    }
  }

  // Places the popover under its cell, or under the button adding a preset
  _place() {
    const ed: HTMLElement = this.querySelector('.editor');
    const target = this.querySelector('.cell.on, .pv-add.on');
    if (!ed || !target) return true;
    return placePopover(this, this._frame(), ed, target, target.closest('.table-wrap') || target.parentElement, true);
  }

  // The cues of the table: a fade on the side with more columns to see
  _tableCue() {
    const wrap = this.querySelector('.table-wrap');
    if (!wrap) return;
    const more = wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft;
    wrap.parentElement.classList.toggle('more-left', wrap.scrollLeft > 4);
    wrap.parentElement.classList.toggle('more-right', more > 4);
  }

  // The presets tab opened on a thermostat (a slot's setpoint link): its row is brought into
  // view, once
  _showTargetRow() {
    const row: HTMLElement = this.querySelector('.pv-table tr.target');
    if (!row || this._targetShown === row.dataset.climate) return;
    this._targetShown = row.dataset.climate;
    if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
  }

  render() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const presets = this._presets();
    const thermostats = this.thermostats || [];
    const sel = this._cell;
    const isSel = (kind, preset, climate) => sel && sel.kind === kind && sel.preset === preset && (sel.climate || null) === (climate || null);
    const cell = (kind, preset, climate, inner, cls) => (editable
      ? html`<button class="cell ${cls}${isSel(kind, preset, climate) ? ' on' : ''}" data-act="cell" data-kind=${kind} data-preset=${preset || ''} data-climate=${climate || nothing} @click=${() => this._toggleCell(kind, preset || '', climate || undefined)}>${inner}</button>`
      : html`<span class="cell ${cls}">${inner}</span>`);
    const definitions = this.definitions !== false;
    // Its temperature when heating, then when cooling with an air conditioner: "20° by default
    // · ❄ 25°". Either can be empty
    const anyCools = thermostats.some((entity) => listsMode(this.hass, entity, 'cool'));
    const headDefaults = (l) => joined([l.temperature != null ? t('defaultTemperature', { value: this._loc.number(l.temperature) }) : null,
      anyCools && l.cool_temperature != null ? html`${mark('cool')}${`${this._loc.number(l.cool_temperature)}°`}` : null].filter(Boolean), ' · ');
    const headInner = (l) => html`<span class="pv-pname"><i style="background:${l.color}"></i>${l.name}</span>
       <span class="pv-default">${headDefaults(l)}</span>`;
    const head = presets.map((l) => html`<th>${definitions ? cell('preset', l.id, null, headInner(l), 'head')
      : html`<span class="cell head">${headInner(l)}</span>`}</th>`);
    let unknown = false;
    // What a preset does on a thermostat: its value, then what it is (the thermostat's own preset,
    // set here, or the default)
    const what = (entity, l) => {
      const explicit = src.mapping(entity);
      // Not known while the integration has not said: no value shown
      const answered = this._targetOf(entity, l);
      const target = answered || {};
      // An air conditioner that only cools has no heating value; one that cools has a cooling
      // value: its cooling temperature, else what its own preset gives when cooling
      const coolOnly = coolsOnly(this.hass, entity);
      const usable = presetModes(target);
      const heats = !coolOnly && usable.includes('heat');
      const temp = heats ? presetTemperatureOf(src, entity, target) : null;
      const coolTemp = listsMode(this.hass, entity, 'cool') ? coolPresetTemperatureOf(src, entity, target) : null;
      let how;
      let cls;
      // On an air conditioner that heats and cools, which of the two values is set here
      const set = explicit[l.id] || {};
      const heatHere = 'temperature' in set || 'preset_mode' in set;
      const setHere = !isReversible(this.hass, entity) || heatHere === ('cool_temperature' in set) ? t('cellSetHere')
        : t(heatHere ? 'cellHeatSetHere' : 'cellCoolSetHere');
      if ('preset_mode' in target) {
        how = t('cellOwnPreset', { preset: ownPresetName(this.hass, entity, target.preset_mode, this._loc) });
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
      const tuned = SETTING_ATTRS.some((attr) => attr in target) ? html`<span class="m tuned"><ha-icon icon="mdi:tune-variant"></ha-icon></span>` : nothing;
      const cool = coolTemp != null ? html`${mark('cool')}${this._loc.number(coolTemp)}°` : null;
      // A heating setpoint known: "20°", with its icon next to a cooling one ("🔥 20° · ❄ 25°");
      // unknown: "?", unless the cooling one is the value. Only cooling, without a cooling
      // value: "—", the setpoint is left alone
      const heat = !heats ? null : temp != null ? html`${cool ? mark('heat') : nothing}${this._loc.number(temp)}°` : cool ? null : '?';
      // Nothing to show: "—" when the preset has no value here, "?" when the temperature of
      // the thermostat's own preset when cooling is not known yet
      const coolUnknown = !heats && usable.includes('cool');
      if (coolUnknown && !cool) unknown = true;
      const setpoint = cool ? html`${heat ? html`${heat} · ` : nothing}${cool}` : heat || (coolUnknown ? '?' : answered ? '—' : nothing);
      return { value: html`${setpoint}${tuned}`, how, cls };
    };
    let body;
    const wanted = new URLSearchParams(window.location.search).get('thermostat');
    if (definitions) {
      const rows = thermostats.map((entity) => {
        const cells = presets.map((l) => {
          const w = what(entity, l);
          return html`<td>${cell('thermostat', l.id, entity, html`<span class="pv-val">${w.value}</span> <span class="pv-how">${w.how}</span>`, w.cls)}</td>`;
        });
        // The row a slot's setpoint link asks for (?thermostat=…) stands out
        return html`<tr data-climate=${entity} class=${wanted === entity ? 'target' : nothing}><th class="name">${this._moreInfoLink(entity)}</th>${cells}</tr>`;
      });
      body = html`<div class="table-outer"><div class="table-wrap"><table class="pv-table">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
    } else {
      // One thermostat (its sheet in the panel): a list, one item per preset, not a table of one
      // row; an item opens the same editor as a cell of the table
      const entity = thermostats[0];
      const items = presets.map((l) => {
        const w = what(entity, l);
        return cell('thermostat', l.id, entity, html`<span class="pv-pname"><i style="background:${l.color}"></i>${l.name}</span>
          <span class="pv-val">${w.value}</span> <span class="pv-how">${w.how}</span>`, `pv-item ${w.cls}`);
      });
      body = html`<div class="pv-list">${items}</div>`;
    }
    return html`<div class="presets-view">
      ${definitions ? html`<div class="pv-intro muted">${t('presetsIntro')}</div>` : nothing}
      ${body}
      ${unknown ? html`<div class="pv-note muted">${t('presetsUnknown')}</div>` : nothing}
      ${editable && definitions ? html`<button class="btn pv-add${sel && sel.kind === 'new' ? ' on' : ''}" data-act="cell" data-kind="new" data-preset="" @click=${() => this._toggleCell('new', '', undefined)}>${t('addPresetButton')}</button>` : nothing}
      ${sel ? keyed(JSON.stringify([sel.kind, sel.preset, sel.climate]), this._cellPanel()) : nothing}
    </div>${this._msgTemplate()}`;
  }

  // The popover editing the selected cell
  _cellPanel() {
    const sel = this._cell;
    const t = this._loc.t;
    const src = this._source();
    const presets = this._presets();
    const preset = presets.find((l) => l.id === sel.preset) || { id: '', name: '', color: '#9e9e9e', temperature: 19, cool_temperature: undefined, cool_color: undefined };
    const apply = html`<button class="btn primary" data-act="cell-apply" @click=${() => this._applyCell()}>${t('apply')}</button>`;
    // A temperature field, in the user's number format, read with either decimal separator;
    // `attr`: data-cell-temp (heating) or data-cell-cool (cooling, empty without a value), with
    // its aria-label. Its − and its + move it by the thermostat's step (half a degree for a
    // preset's default)
    const tempInput = (value, attrs: any = { 'data-cell-temp': true }, label = t('presetTemperature')) => stepper(this._loc, attrs, value, 'cell-step', (button) => this._stepCell(button),
      sel.kind === 'thermostat' ? stepOf(this.hass, sel.climate) : 0.5, label);
    if (sel.kind === 'thermostat') {
      const explicit = src.mapping(sel.climate)[preset.id] || {};
      const st = this.hass.states[sel.climate];
      // The thermostat's presets, the one named like this preset (what "default" uses) first
      const own = ((st && st.attributes.preset_modes) || []).map(String)
        .filter((p) => !MANUAL_PRESETS.includes(p.toLowerCase()))
        .sort((a, b) => +(b === preset.id) - +(a === preset.id));
      // What "default" gives: the thermostat's own preset of the same name (when the "use the
      // thermostats' presets" option allows it), else the preset's default temperature. Not known
      // while the integration has not said: "Default", with nothing more
      const answered: any = this._cellDefaults(sel.climate, preset);
      const defaults: any = answered || {};
      const degrees = (value) => `${this._loc.number(value)}°`;
      // An air conditioner that only cools: no heating value. Its own preset, or a cooling
      // temperature
      const coolOnly = coolsOnly(this.hass, sel.climate);
      const ownName = (p) => ownPresetName(this.hass, sel.climate, p, this._loc);
      // What the default gives: when cooling on a unit that only cools, else when heating
      const defaultTemperature = coolOnly ? coolPresetTemperatureOf(src, sel.climate, defaults) : presetTemperatureOf(src, sel.climate, defaults);
      const defaultOwn = coolOnly ? defaults.cool_preset_mode : defaults.preset_mode;
      const defaultText = defaultOwn
        ? `${t('cellOwnPreset', { preset: ownName(defaultOwn) })}${defaultTemperature != null ? `, ${degrees(defaultTemperature)}` : ''}`
        : defaultTemperature != null ? degrees(defaultTemperature) : t(coolOnly ? 'notWhenCooling' : 'notWhenHeating');
      // One question, three answers: the default, one of the thermostat's own presets, or a
      // temperature. The cell opens on what is stored; using a row's field chooses the row
      const choice = 'preset_mode' in explicit ? 'own' : 'temperature' in explicit ? 'temperature' : 'default';
      const temp = 'temperature' in explicit ? explicit.temperature
        : presetTemperatureOf(src, sel.climate, this._targetOf(sel.climate, preset) || {}) ?? preset.temperature ?? 19;
      const radio = (name, checked) => (value, label, field = null, cls = '') => html`<label class="pv-row${cls}"><input type="radio" name=${name} value=${value} ?checked=${checked === value}>
          <span class=${cls === ' pv-cooldefault-row' ? 'pv-cooldefault' : nothing}>${label}</span>${field ? html`<span class="pv-field">${field}</span>` : nothing}</label>`;
      const picked = own.includes(explicit.preset_mode) ? explicit.preset_mode : own[0];
      const options = own.map((p) => html`<option value=${p} ?selected=${picked === p}>${ownName(p)}</option>`);
      const reversible = isReversible(this.hass, sel.climate);
      const cool = explicit.cool_temperature;
      // The cooling field opens on what the thermostat gets: its own value, else the default
      const coolDefault = coolPresetTemperatureOf(src, sel.climate, defaults);
      // Empty (its own preset's temperature is not known): the preset's cooling temperature, as a hint
      const coolHint = preset.cool_temperature != null ? this._loc.number(preset.cool_temperature) : null;
      const coolField = tempInput(cool ?? coolDefault, { 'data-cell-cool': true, placeholder: coolHint }, t('temperatureCoolAria'));
      // Only cooling: one question, the default, one of its own presets, or a temperature
      const heatChoice = coolOnly && cool != null ? 'cool' : choice;
      const row = radio('cell-choice', heatChoice);
      const rows = html`${row('default', answered ? t('presetAuto', { value: defaultText }) : t('presetDefault'))}${
        own.length ? row('own', t('cellOwn'), html`<select data-cell-preset aria-label=${t('ownPreset')}>${options}</select>`) : nothing}${
        coolOnly ? row('cool', t('presetTemperature'), coolField, ' pv-cool')
          : row('temperature', t('presetTemperature'), tempInput(temp, { 'data-cell-temp': true }, reversible ? t('temperatureHeatAria') : t('presetTemperature')))}`;
      // An air conditioner that heats and cools: the same question when cooling, with the same
      // rows. The default says what the thermostat then gets: "Default (25°)", "Default (its
      // Eco preset, 27°)" or "Not used when cooling"; again when the row chosen changes
      const fallback = this._coolFallbackText(sel.climate, preset, this._coolFrom !== undefined ? this._coolFrom
        : 'preset_mode' in explicit ? { preset_mode: explicit.preset_mode } : null);
      const coolRow = radio('cell-cool-choice', cool != null ? 'temperature' : 'default');
      const cooling = !reversible ? nothing : html`<div class="pv-when">${hvacIconTemplate('cool')}${t('whenCooling')}</div>
        <div class="pv-choices" role="radiogroup">${coolRow('default', fallback, null, ' pv-cooldefault-row')}${coolRow('temperature', t('presetTemperature'), coolField, ' pv-cool')}</div>`;
      // The fan and the vanes, folded (lot 3)
      const more = moreSettings(this.hass, sel.climate, this._loc, explicit, null, false, 'data-cell-setting');
      // Its own presets are set on its device (their temperatures, on a Versatile Thermostat)
      const device = own.length ? deviceLink(this.hass, deviceOf(this.hass, sel.climate), t('ownPresetsOnDevice')) : null;
      const when = reversible ? html`<div class="pv-when">${hvacIconTemplate('heat')}${t('whenHeating')}</div>`
        : coolOnly ? html`<div class="pv-when">${hvacIconTemplate('cool')}${t('whenCooling')}</div>` : nothing;
      const body = html`${when}
        <div class="pv-choices" role="radiogroup">${rows}</div>
        ${cooling}
        ${more}
        <div class="capture-row">${captureButton(this.hass, sel.climate, this._loc, this._captured === sel, () => this._capture())}</div>
        ${device ? html`<div class="pv-device">${device}</div>` : nothing}`;
      return this._cellPopover(preset, body, apply, html`${preset.name} · ${this._moreInfoLink(sel.climate)}`);
    }
    const isNew = sel.kind === 'new';
    const title = isNew ? t('newPreset') : preset.name;
    if (!isNew && sel.deleting) {
      // Deleting: what replaces it where it is used (schedules, overrides)
      const used = src.usedPresets().includes(preset.id);
      const others = presets.filter((l) => l.id !== preset.id);
      const body = html`<div class="pv-delete">${t('confirmDeletePreset', { name: preset.name })}
        ${used ? html`<label class="pv-replace">${t('replaceWith')} <select data-cell-replacement>${others.map((l) => html`<option value=${l.id}>${l.name}</option>`)}</select></label>` : nothing}</div>`;
      return this._cellPopover(preset, body, html`<button class="btn" data-act="cell-delete-cancel" @click=${() => this._askDelete(false)}>${t('cancel')}</button>
        <button class="btn danger" data-act="cell-delete-confirm" @click=${() => this._applyCell(true)}>${t('deletePreset')}</button>`, title);
    }
    // With an air conditioner: its color when heating and its color when cooling, each on a
    // row with its label. Without one: its color, beside its name
    const cools = (this.thermostats || []).some((entity) => listsMode(this.hass, entity, 'cool'));
    const color = html`<input type="color" data-cell-color value=${isNew ? '#9e9e9e' : preset.color} title=${t(cools ? 'presetHeatColor' : 'presetColor')}>`;
    const body = html`<div class="pv-fields">
        <span>${t('presetName')}</span>
        <span class="pv-name">${cools ? nothing : color}
          <input type="text" data-cell-name value=${isNew ? '' : preset.name} placeholder=${t('presetName')}></span>
        <span>${t(cools ? 'whenHeating' : 'presetDefaultTemperature')}</span>${tempInput(isNew ? 19 : preset.temperature, { 'data-cell-temp': true }, t(cools ? 'temperatureHeatAria' : 'presetTemperature'))}
        ${cools ? html`<span>${t('whenCooling')}</span>${tempInput(isNew ? null : preset.cool_temperature, { 'data-cell-cool': true }, t('temperatureCoolAria'))}
        <span>${t('presetHeatColor')}</span><span class="pv-name">${color}</span>
        <span>${t('presetCoolColor')}</span>
        <span class="pv-name"><input type="color" data-cell-cool-color ?data-chosen=${!!preset.cool_color} value=${coolColor(isNew ? { color: '#9e9e9e' } : preset)} title=${t('presetCoolColor')}></span>` : nothing}
      </div>
      <div class="muted">${t('defaultHelp')}</div>`;
    if (!isNew && presets.length > 1) {
      return this._cellPopover(preset, body, html`<button class="btn danger pv-del" data-act="cell-delete" @click=${() => this._askDelete(true)}>${t('deleteMenu')}</button>
        ${apply}`, title);
    }
    return this._cellPopover(isNew ? null : preset, body, apply, title);
  }

  // The popover of a cell, placed under it once drawn (_place); a thermostat's title opens it
  _cellPopover(preset, body, buttons, heading) {
    const t = this._loc.t;
    const dot = preset ? html`<i class="pv-dot" style="background:${preset.color}"></i>` : nothing;
    return html`<div class="editor cell-ed" data-panel="cell">
      <div class="ed-head"><strong>${dot}${heading}</strong>
        <button class="btn icon close" data-act="cell-close" @click=${() => this._closeCell()} title=${t('close')}>✕</button></div>
      <div class="ed-body">${body}
        ${this._cellError ? html`<div class="pv-error">${this._cellError}</div>` : nothing}</div>
      <div class="ed-actions pv-foot">${buttons}</div>
    </div>`;
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
          const on = slotModeOn(this.hass, climate, slot) || 'heat';
          // A heat/cool slot sends two numbers: one of the thermostat's own presets gives none
          if (on === 'heat_cool' ? !number : on === mode && !number && !('preset_mode' in own)) return true;
        }
      }
    }
    return false;
  }

  // What a preset gives a thermostat by default, in each HVAC mode (without a value set by hand): its own preset of the same name when the option allows it, else the preset's
  // temperature, for the HVAC modes the preset has a temperature for. Null while the integration
  // has not said
  _cellDefaults(climate, preset) {
    return presetValue(this.hass, climate, preset, null);
  }

  // The cell popover takes the thermostat's current state (#91, lot 3): its setpoint, as the
  // temperature (the cooling one while an air conditioner that also heats cools), its fan and
  // its vanes. Never its preset: the preset is what the user is defining. The user taps OK to save.
  _captureCell(climate) {
    const state = captureState(this.hass, climate);
    if (!state) return;
    const field = (selector) => this.querySelector(`.cell-ed ${selector}`);
    if (state.temperature != null) {
      const cooling = (state.hvac === 'cool' || !field('[data-cell-temp]')) && field('[data-cell-cool]');
      (field(cooling ? '[data-cell-cool]' : '[data-cell-temp]') as HTMLInputElement).value = this._loc.number(state.temperature);
      this._cellChooseField(!!cooling);
    }
    for (const attr of SETTING_ATTRS) {
      const select: any = field(`[data-cell-setting="${attr}"]`);
      if (!select || !(attr in state.settings)) continue;
      select.value = state.settings[attr];
      select.closest('details').open = true;
    }
    const cell = this._cell;
    this._captured = cell;
    this.requestUpdate();
    setTimeout(() => {
      if (this._captured !== cell) return;
      this._captured = null;
      this.requestUpdate();
    }, 2000);
  }

  // A temperature field of the cell popover used: its row is chosen. The cooling field is a row
  // of the heating question on an air conditioner that only cools
  _cellChooseField(cooling) {
    if (!cooling) return this._cellChoose('temperature');
    const own: HTMLInputElement = this.querySelector('.cell-ed input[name="cell-cool-choice"][value="temperature"]');
    if (own) own.checked = true;
    else this._cellChoose('cool');
    return undefined;
  }

  // Chooses a row of the cell popover: using a row's field means "use it"
  _cellChoose(choice) {
    const radio: HTMLInputElement = this.querySelector(`.cell-ed input[name="cell-choice"][value="${choice}"]`);
    if (radio) radio.checked = true;
    this._cellCoolNote();
  }

  // What an empty cooling field gives, in words: "Default (25°)", "Default (its Comfort preset,
  // 25°)", or "Not used when cooling" when the preset has no value there; "Default" while the
  // integration has not said. `cell`: the value
  // being set by hand, without a cooling temperature
  _coolFallbackText(climate, preset, cell) {
    const t = this._loc.t;
    const value = presetValue(this.hass, climate, preset, cell);
    if (!value) return t('presetDefault'); // not known yet: nothing said about it
    if ('cool_temperature' in value) return t('presetAuto', { value: `${this._loc.number(value.cool_temperature)}°` });
    if (!('cool_preset_mode' in value)) return t('notWhenCooling');
    const temperature = this._source().coolPresetTemperature(climate, value.cool_preset_mode);
    const name = t('cellOwnPreset', { preset: ownPresetName(this.hass, climate, value.cool_preset_mode, this._loc) });
    return t('presetAuto', { value: typeof temperature === 'number' ? `${name}, ${this._loc.number(temperature)}°` : name });
  }

  // The default when cooling, in the cell popover: what the thermostat then gets, from the row
  // chosen when heating (one of the thermostat's own presets is sent when cooling too)
  _cellCoolNote() {
    const sel = this._cell;
    if (!this.querySelector('.cell-ed .pv-cooldefault') || !sel || !sel.climate) return;
    const choice = ((this.querySelector('.cell-ed input[name="cell-choice"]:checked') || {}) as any).value;
    const own = ((this.querySelector('.cell-ed [data-cell-preset]') || {}) as any).value;
    const preset = this._presets().find((l) => l.id === sel.preset);
    if (!preset) return;
    const from = choice === 'own' && own ? { preset_mode: own } : null;
    if (this._coolFrom !== undefined && JSON.stringify(from) === JSON.stringify(this._coolFrom)) return;
    this._coolFrom = from;
    this.requestUpdate();
  }

  // The cool color of the preset popover follows the color while the user has not chosen one
  _cellCoolColor() {
    const cool: HTMLInputElement = this.querySelector('.cell-ed [data-cell-cool-color]');
    if (cool && !cool.hasAttribute('data-chosen')) cool.value = derivedCoolColor((this.querySelector('.cell-ed [data-cell-color]') as HTMLInputElement).value);
  }

  // A preset cell popover open: a press outside the popover and the cells closes it; on a control
  // of the view, the control does its action too
  _clickElsewhere(e) {
    if (!this._cell || e.target.closest('.editor, [data-act="cell"]')) return;
    this._openCell(null);
    if (e.target.closest('button')) return;
    e.stopPropagation();
    this.requestUpdate();
  }

  _leaving(kind) {
    if (kind === 'device') this._cell = null;
  }

  _openCell(cell: Cell | null) {
    this._cell = cell;
    this._coolFrom = undefined;
  }

  // A cell: opens its popover, or closes it when it is open
  _toggleCell(kind, preset, climate) {
    const same = this._cell && this._cell.kind === kind && this._cell.preset === preset && (this._cell.climate || '') === (climate || '');
    this._openCell(same ? null : { kind, preset, climate });
    this._cellError = null;
    this.requestUpdate();
  }

  // The controls of the popover: an error said before is over
  _closeCell() {
    this._cellError = null;
    this._openCell(null);
    this.requestUpdate();
  }

  // Delete, then Cancel: the popover asks what replaces the preset, or goes back
  _askDelete(deleting) {
    this._cellError = null;
    this._cell.deleting = deleting;
    this.requestUpdate();
  }

  // The − and the + of a field of the popover: the field of the row of the button tapped, heating
  // or cooling
  _stepCell(button) {
    this._cellError = null;
    const sel = this._cell;
    const input: HTMLInputElement = this.querySelector('[data-cell-temp]');
    const cool: HTMLInputElement = this.querySelector('[data-cell-cool]');
    const field: HTMLInputElement = (button.closest('.pv-temp') || this).querySelector('input') || input;
    // An empty field starts from a usual temperature for its HVAC mode: 25° when cooling,
    // 19° when heating. Never from the other field: a tap on − gave a cooling setpoint of 19,5°
    const typed = parseDecimal(field.value);
    const from = Number.isFinite(typed) ? typed : field === cool ? 25 : 19;
    const next = Math.round((from + Number(button.dataset.delta)) * 100) / 100;
    field.value = this._loc.number(sel.kind === 'thermostat' ? fitTemperature(this.hass, sel.climate, next) : next);
    this._cellChooseField(field === cool);
  }

  // The thermostat's current state fills the fields; OK saves (lot 3)
  _capture() {
    this._cellError = null;
    this._captureCell(this._cell.climate);
  }

  // OK: the value of a thermostat's cell, or the preset, is saved. `deleting`: the preset is
  // deleted
  async _applyCell(deleting = false) {
    this._cellError = null;
    const sel = this._cell;
    const input: HTMLInputElement = this.querySelector('[data-cell-temp]');
    const cool: HTMLInputElement = this.querySelector('[data-cell-cool]');
    const src = this._source();
    // `cooling`: its cooling temperature and its cool color, when it has them (presetsOf)
    const presets = presetsOf(src, this._loc).map(({ id, name, color, temperature, ...cooling }) => (
      { id, name, color, temperature: temperature === undefined ? 19 : temperature, ...cooling }));
    const value = (selector) => { const found: any = this.querySelector(selector); return found ? found.value : ''; };
    // The cool color is stored only when the user chose one that is not the derived one: a
    // preset without one keeps following its color
    // Either temperature can be empty: the preset is then not used in that HVAC mode. Without
    // an air conditioner, the popover has no cooling field: the cooling temperature stays
    const edited = (l) => {
      const { cool_color: _, cool_temperature: kept, ...rest } = l;
      const color = value('[data-cell-color]');
      const coolField: HTMLInputElement = this.querySelector('[data-cell-cool-color]');
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
          target.temperature = fitTemperature(this.hass, sel.climate, parseDecimal(input.value));
        }
        if (cool && (choice === 'cool' || coolChoice === 'temperature')) {
          if (!Number.isFinite(parseDecimal(cool.value))) return undefined;
          target.cool_temperature = fitTemperature(this.hass, sel.climate, parseDecimal(cool.value));
        }
        for (const attr of SETTING_ATTRS) if (value(`[data-cell-setting="${attr}"]`)) target[attr] = value(`[data-cell-setting="${attr}"]`);
        // Its own preset of the same name, chosen by hand: the default, so nothing more is stored
        // (once the integration has said what the default is)
        const preset = presets.find((l) => l.id === sel.preset);
        const defaults: any = target.preset_mode ? await presetValueAnswered(this.hass, sel.climate, preset, null) : null;
        if (target.preset_mode && defaults && target.preset_mode === defaults.preset_mode) delete target.preset_mode;
        const mapping = { ...src.mapping(sel.climate) };
        if (Object.keys(target).length) mapping[sel.preset] = target; else delete mapping[sel.preset];
        // The same as what is stored (the default kept): nothing to send
        if (JSON.stringify(mapping) !== JSON.stringify(src.mapping(sel.climate))) await this._commands().setMapping(sel.climate, mapping);
      } else if (sel.kind === 'new') {
        await this._commands().setPresets([...presets, edited({})], {});
      } else if (deleting) {
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
          return this.requestUpdate();
        }
        await this._commands().setPresets(presets.map((l) => (l.id === sel.preset ? next : l)), {});
      }
      this._openCell(null);
      this._msg = this._loc.t('saved');
    } catch (err) {
      this._msg = errorText(this._loc.t, err);
    }
    return this.requestUpdate();
  }
}
