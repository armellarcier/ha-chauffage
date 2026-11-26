import { LitElement, html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { chipStyle } from '../../colors.ts';
import { DAY_MIN, SETPOINT_MODES, hasNoPreset, isAdmin, isOff, slotMode } from '../../common.ts';
import { timeField } from '../../fields.ts';
import { defaultSetpointMode, hasModeRow, moreSettings, slotOn } from '../../hvac.ts';
import { panelPath } from '../../links.ts';
import { setpointLine, slotSetpointText } from '../../override-edit.ts';
import { modeChip, modeRow, offChip } from '../../presets.ts';
import { PopoverPlacement } from '../../controllers/popover-placement.ts';
import type { ChauffageProgrammeCard } from '../../cards/programme-card.ts';

// The popover of the slot selected (the draft's `selection`), under the slot: its times, its HVAC
// mode and its preset, the setpoint it applies, the fan and the vanes, then Insert a slot and
// Delete.
// It draws in the card's light DOM, and is drawn again with the card.
export class ChauffageSlotPopover extends LitElement {
  static properties = {
    card: { attribute: false, hasChanged: () => true },
  };

  declare card: ChauffageProgrammeCard;
  placement = new PopoverPlacement(this, {
    card: () => this.card,
    frame: () => this.card && this.card.renderRoot.querySelector('ha-card'),
    target: () => this.card && this.card.renderRoot.querySelector('.seg.sel'),
    key: () => JSON.stringify(this.card && this.card._draft.selection),
  });

  createRenderRoot() {
    return this;
  }

  render() {
    const card = this.card;
    const sel = card && card._draft.selection;
    if (!sel) return nothing;
    const { climate, day, idx } = sel;
    const hass = card._hass;
    const loc = card._loc;
    const t = loc.t;
    const step = card._config.step;
    const segs = card._week(climate)[day];
    const s = slotOn(hass, climate, segs[idx]);
    const last = idx === segs.length - 1;
    const end = last ? DAY_MIN : segs[idx + 1].start;
    const slot = JSON.stringify({ climate, day, idx });
    const from = idx === 0 ? html`<span class="fixed">${loc.time(0)}</span>`
      : timeField({ 'data-edge': 'start', 'data-slot': slot }, s.start, loc, step);
    const to = last ? html`<span class="fixed">${loc.time(DAY_MIN)}</span>`
      : timeField({ 'data-edge': 'end', 'data-day-end': true, 'data-slot': slot }, end, loc, step);
    // On a thermostat with more than one "on" HVAC mode, two rows (#91). First what the device
    // does: its HVAC modes. Then how warm: the presets that have a value for the HVAC mode
    // chosen, in its color; none for off, fan only, dry and auto. A heater has one row: Off,
    // then the presets
    const none = hasNoPreset(s);
    const target = none ? null : card._targetOf(climate, card._preset(s.preset));
    const off = isOff(s);
    const rows = hasModeRow(hass, climate);
    const mode = slotMode(s);
    const inMode = none || !mode ? defaultSetpointMode(hass, climate) : mode;
    const offered = card._presetsIn(climate, inMode);
    const chips = rows && none ? [] : card._presets()
      .filter((l) => (!none && s.preset === l.id) || offered.includes(l.id))
      .map((l) => {
        const missing = !offered.includes(l.id);
        return html`<button data-act="preset" data-preset=${l.id} class=${`${!none && s.preset === l.id ? 'on' : ''}${missing ? ' unsupported' : ''}`} title=${missing ? t('noPresetInMode') : nothing} style=${chipStyle(l, none ? null : mode)}>${l.name}</button>`;
      });
    // An HVAC mode no preset has a value for cannot be chosen; while the integration has not
    // said what each preset is worth here, every one can
    const known = card._presets().every((l) => card._targetOf(climate, l));
    const disabled = known ? SETPOINT_MODES.filter((m) => !card._presetsIn(climate, m).length) : [];
    const modes = rows ? modeRow(hass, climate, loc, none ? mode : inMode, 'slot-mode', disabled) : nothing;
    // One row: Off first; a fan-only, a dry or an auto slot pasted on this thermostat stays, marked
    const single = rows ? nothing : html`${offChip(hass, climate, loc, 'slot-off', off)}${none && !off ? modeChip(hass, climate, loc, mode, 'slot-mode', true) : nothing}`;
    const presets = rows && !chips.length ? nothing : html`<div class="presets">${single}${chips}</div>`;
    // The setpoint the slot will apply, with its number, as the preset's value gives it for the
    // slot's HVAC mode: a link to the presets page for an admin
    const setpoint = slotSetpointText(hass, climate, s, target, loc, {
      temperatureOf: (value) => card._presetTemperature(climate, value),
      coolTemperatureOf: (value) => card._coolPresetTemperature(climate, value),
    });
    // The link opens the presets tab on this thermostat's row
    const line = setpointLine(setpoint, loc, isAdmin(hass) && !none ? `${panelPath('presets')}?thermostat=${encodeURIComponent(climate)}` : null);
    // With the history shown, what the slot measured: the slot's tooltip says it too, but a phone
    // shows no tooltip
    const measured = card._measuredText(climate, day, s.start, end).replace(/^ · /, '');
    // The fan and the vanes of an air conditioner, folded (lot 3): not on an off slot
    // In fan only and in dry, the fan speed is what there is to set: in sight, not folded
    const more = off ? nothing : moreSettings(hass, climate, loc, s.settings, target, card._moreOpen, 'data-slot-setting',
      ['fan_only', 'dry'].includes(mode) ? ['fan_mode'] : []);
    // A popover of its own for each slot: placed again, its body at its top
    return keyed(slot, html`<div class="editor">
      <div class="ed-head">
        <strong>${card._moreInfoLink(climate)} · ${card._rowLabel(day, 'long')}</strong>
        <span class="ed-times"><label>${t('from')} ${from}</label><label>${t('to')} ${to}</label></span>
        <button class="btn icon close" data-act="close" title=${t('close')}>✕</button>
      </div>
      <div class="ed-body">
        ${measured ? html`<div class="ed-measured">${measured}</div>` : nothing}
        ${modes}
        ${presets}
        ${line}
        ${more}
      </div>
      <div class="ed-actions">
        <button class="btn" data-act="insert" ?disabled=${end - s.start < 2 * step}>${t('insertSlot')}</button>
        <button class="btn" data-act="delete" ?disabled=${segs.length === 1}>${t('delete')}</button>
      </div>
    </div>`);
  }
}
