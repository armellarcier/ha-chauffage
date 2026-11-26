import { LitElement, html, nothing } from 'lit';
import { todayIdx } from '../../common.ts';
import { dayRow, nameSizer } from './day-row.ts';
import type { WeekCard } from './week-card.ts';

// The week of the thermostats shown: the scale of the hours, then a row per day, or per group of
// identical days. It draws in the card's light DOM, with the card's stylesheet, and is drawn again
// with the card.
export class ChauffageWeekGrid extends LitElement {
  static properties = {
    // The card, drawn again: so is the week
    card: { attribute: false, hasChanged: () => true },
  };

  declare card: WeekCard;

  createRenderRoot() {
    return this;
  }

  render() {
    const card = this.card;
    if (!card) return nothing;
    const loc = card._loc;
    const multi = card._shown.length > 1;
    const today = todayIdx();
    const active = card._schedule === card._activeSchedule();
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => html`<span class=${h % 6 ? 'minor' : nothing} style=${`left:${(h / 24) * 100}%`}>${loc.tick(h)}</span>`);
    // The column of the days fits the longest label (on two lines at most)
    const rows = card._rows;
    const dayWidth = Math.min(72, Math.max(36, ...rows.map((r) => loc.daysLabel(r).length * 8 + 4)));
    return html`<div class="days" style=${`--day-w:${dayWidth}px`}>
      <div class="scale"><div></div>${multi ? html`<div class="name">${nameSizer(card)}</div>` : nothing}<div class="ticks">${ticks}</div><div></div></div>
      ${rows.map((r) => dayRow(card, r, r.includes(today) && active))}
    </div>`;
  }
}
