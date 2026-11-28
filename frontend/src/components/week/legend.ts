import { html, nothing } from 'lit';
import { coolColor, presetColorIn } from '../../colors.ts';
import { NO_PRESET_MODES, slotMode } from '../../common.ts';
import { controlsHvac, coolsOnly, hvacIconTemplate, hvacSlotStyle, listsMode, modeName, presetModes, slotModeOn } from '../../hvac.ts';
import { panelPath } from '../../links.ts';
import { coolPresetTemperatureOf, presetTemperatureOf } from '../../override-edit.ts';
import type { ChauffageProgrammeCard } from '../../cards/programme-card.ts';

// The legend under the week: each preset a shown thermostat can use, with its colors, and its
// values on the thermostat shown alone; then the HVAC modes without a preset that a week shown
// has, and the link to set the presets.
export function weekLegend(card: ChauffageProgrammeCard) {
  const loc = card._loc;
  const tr = loc.t;
  const hass = card._hass;
  const multi = card._shown.length > 1;
  const focus = card._focusClimate();
  const st = hass.states[focus];
  // Its heat color, then its cool color when a shown thermostat has cooling slots: one that cools
  // and whose HVAC mode Chauffage controls (#159). Each swatch then has
  // its mark, a flame or a snowflake. No heat color when every thermostat shown only cools.
  // Then its values on the thermostat shown alone: "Comfort 20° · ❄ 24°"
  const showsCool = card._shown.some((climate) => listsMode(hass, climate, 'cool') && controlsHvac(hass, climate));
  const showsHeat = card._shown.some((c) => !coolsOnly(hass, c));
  const single = !multi && !!st;
  const presets = card._presets().map((l) => {
    // Only what the thermostats shown can use: a preset with no value on any of them is
    // left out, and each of its colors shows only if a week shown can have it
    const usable = usableModes(card, l);
    if (!usable.size) return nothing;
    const target = card._targetOf(focus, l) || {}; // not known yet: no values
    const t = single && !coolsOnly(hass, focus) ? presetTemperatureOf(card._source(), focus, target) : null;
    const c = single && listsMode(hass, focus, 'cool') ? coolPresetTemperatureOf(card._source(), focus, target) : null;
    const hint = !multi && ('preset_mode' in target || 'cool_preset_mode' in target) && t == null && c == null && !coolsOnly(hass, focus) ? ` ${tr('presetHint')}` : '';
    const heat = showsHeat && usable.has('heat') ? html`<i class=${`heat${showsCool ? ' mk' : ''}`} style=${`background:${l.color}`} title=${showsCool ? tr('slotHeat') : nothing}>${showsCool ? hvacIconTemplate('heat') : nothing}</i>` : null;
    const cool = showsCool && usable.has('cool') ? html`<i class="cool mk" style=${`background:${coolColor(l)}`} title=${tr('slotCool')}>${hvacIconTemplate('cool')}</i>` : null;
    if (!heat && !cool) return nothing;
    const heatValue = t != null ? `${loc.number(t)}°` : null;
    const coolValue = c != null ? html`${t != null ? html`<span class="cv">${hvacIconTemplate('cool')}</span>` : nothing}${loc.number(c)}°` : null;
    const values = [heatValue, coolValue].filter((v) => v != null);
    const shown = values.length ? html` ${values.map((v, i) => html`${i ? ' · ' : ''}${v}`)}` : hint;
    return html`<span>${heat || nothing}${cool || nothing}${l.name}${shown}</span>`;
  });
  return html`<div class="legend">${presets}${heatCool(card)}${noPresetModes(card)}${settingsLink(card)}</div>`;
}

// The HVAC modes a shown thermostat can use a preset in: the legend lists a preset only with
// the colors it can have in the weeks shown
function usableModes(card: ChauffageProgrammeCard, preset) {
  const modes = new Set();
  for (const climate of card._shown) for (const mode of presetModes(card._targetOf(climate, preset))) modes.add(mode);
  return modes;
}

// Heat/cool, when a week shown has such a slot: the two colors of its preset, split as in the week
function heatCool(card: ChauffageProgrammeCard) {
  for (const climate of card._shown) {
    const slot = card.week(climate).flat().find((s) => slotModeOn(card._hass, climate, s) === 'heat_cool');
    if (slot) {
      return html`<span class="legend-mode legend-heat-cool"><i style=${`background:${presetColorIn(card._preset(slot.preset), 'heat_cool')}`}></i>${hvacIconTemplate('heat_cool')}${modeName(card._loc, 'heat_cool')}</span>`;
    }
  }
  return nothing;
}

// The HVAC modes without a preset, after the presets ("Off", "Fan only", "Dry", "Auto"): each
// only when a shown week has such a slot. Alone, they are the legend of a week of a thermostat's
// page
export function noPresetModes(card: ChauffageProgrammeCard) {
  const has = (mode) => card._shown.some((climate) => card.week(climate).some((segs) => segs.some((s) => slotMode(s) === mode)));
  return NO_PRESET_MODES.filter(has).map((mode) => {
    const swatch = mode === 'fan_only' ? html`<i class="fan"></i>` : html`<i style=${hvacSlotStyle(mode)}></i>`;
    return html`<span class=${`legend-off${mode === 'fan_only' ? ' legend-fan' : ''}`}>${swatch}${hvacIconTemplate(mode)}${mode === 'off' ? card._loc.t('legendOff') : modeName(card._loc, mode)}</span>`;
  });
}

// On a dashboard, the legend of the presets ends with the link to set them (canSetUp, as the
// panel). In the panel, no link to the panel
function settingsLink(card: ChauffageProgrammeCard) {
  if (card.sheet || !card._source().editable) return nothing;
  return html`<span class="mi-link settings-link" role="link" tabindex="0" data-navigate=${panelPath('presets')}>${card._loc.t('setPresets')}</span>`;
}
