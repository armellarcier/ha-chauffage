import { LitElement, html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { todayIdx } from '../../common.ts';
import { fullNames } from '../../hvac.ts';
import { overrideBody, overrideSummary } from '../../override-edit.ts';
import { PopoverPlacement } from '../../controllers/popover-placement.ts';
import type { ChauffageProgrammeCard } from '../../cards/programme-card.ts';

// The popover of an override (the card's `_overrideSel`), under it: in the order of the more-info
// block, what it is, then what changes it (overrideBody), and Resume the schedule. Opened from
// today's row menu without an override, it sets one, under "now" on the thermostat's row today.
// It draws in the card's light DOM, and is drawn again with the card.
export class ChauffageOverridePopover extends LitElement {
  static properties = {
    card: { attribute: false, hasChanged: () => true },
  };

  declare card: ChauffageProgrammeCard;
  placement = new PopoverPlacement(this, {
    card: () => this.card,
    frame: () => this.card && this.card.renderRoot.querySelector('ha-card'),
    target: () => this._target(),
    key: () => JSON.stringify(this.card && this.card._overrideSel && this.card._overrideSel.climate),
  });

  createRenderRoot() {
    return this;
  }

  // What the popover is placed under: the override, or "now" on the thermostat's row today for a
  // new one
  _target() {
    const card = this.card;
    const sel = card && card._overrideSel;
    if (!sel) return null;
    const root = card.renderRoot;
    return root.querySelector('.override.sel')
      || (sel.create && root.querySelector(`.bar[data-climate="${sel.climate}"][data-day="${card._rowOf(todayIdx())[0]}"] .now`));
  }

  render() {
    const card = this.card;
    const sel = card && card._overrideSel;
    if (!sel) return nothing;
    const { climate } = sel;
    const d = card._overrides()[climate];
    const src = card._source();
    const hass = card._hass;
    const loc = card._loc;
    const t = loc.t;
    return keyed(climate, html`<div class="editor override-ed">
      <div class="ed-head">
        <strong>${card._moreInfoLink(climate)} · ${t('temporarySetpoint')}</strong>
        ${d ? html`<span class="override-value">${overrideSummary(d, src, climate, loc, hass)}</span>` : nothing}
        <button class="btn icon close" data-act="override-close" title=${t('close')}>✕</button>
      </div>
      <div class="ed-body">${overrideBody(d, src, climate, hass, loc, { step: card._config.step, line: 'ed-head', actions: 'ed-actions start', endLoc: fullNames(loc, hass, climate) })}</div>
      ${d ? html`<div class="ed-actions"><button class="btn danger" data-act="override-del">${t('resume')}</button></div>` : nothing}
    </div>`);
  }
}
