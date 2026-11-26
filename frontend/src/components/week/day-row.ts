import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ICON_MORE, todayIdx } from '../../common.ts';
import { slotBar } from './slot-bar.ts';
import type { ChauffageProgrammeCard } from '../../cards/programme-card.ts';

// The names shown, invisible, in every cell of the names column: each row sizes the column on
// the longest one, so that all rows (separate grids) have the same column
export const nameSizer = (card: ChauffageProgrammeCard) => html`<span class="sizer" aria-hidden="true">${card._shown.map((c) => html`<span>${card._name(c)}</span>`)}</span>`;

// A row of days (in display order), drawn and edited through its first day: a bar per thermostat
// shown, each with its ⋮
export function dayRow(card: ChauffageProgrammeCard, days: number[], showNow: boolean) {
  const d = days[0];
  const loc = card._loc;
  const multi = card._shown.length > 1;
  const subs = card._shown.map((climate) => {
    const segs = card.week(climate)[d];
    const m = card._menu;
    const open = m && m.climate === climate && m.day === d;
    return html`<div class="sub">
      ${multi ? html`<div class="name" title=${loc.t('open', { name: card._name(climate) })}>${card._moreInfoLink(climate)}${nameSizer(card)}</div>` : nothing}
      ${slotBar(card, climate, segs, days, showNow)}
      ${card._hasMenu(climate, d)
    ? html`<button class=${`ibtn${open ? ' open' : ''}`} data-act="menu" data-climate=${climate} data-day=${d} title=${loc.t('copyPaste')}>${unsafeHTML(ICON_MORE)}</button>`
    : html`<button class="ibtn none" data-act="menu" data-climate=${climate} data-day=${d} disabled aria-hidden="true" tabindex="-1">${unsafeHTML(ICON_MORE)}</button>`}
    </div>`;
  });
  // Today stands out, except in a week of an inactive schedule stacked under the active one's
  // (a thermostat's page, sheet 'thermostat'): the active week marks it already
  const today = days.includes(todayIdx()) && (card.sheet !== 'thermostat' || card._schedule === card._source().activeSchedule());
  return html`<div class=${`dgroup${today ? ' today' : ''}`}>
    <div class="day" data-day=${d}>${loc.daysLabel(days)}</div>
    <div class="subs">${subs}</div>
  </div>`;
}
