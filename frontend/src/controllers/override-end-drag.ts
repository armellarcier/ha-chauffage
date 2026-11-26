import type { ReactiveController } from 'lit';
import { DAY_MIN, nowMin, pct } from '../common.ts';
import { atMinutes } from '../fields.ts';
import type { WeekCard } from '../components/week/week-card.ts';

// Dragging the end of an override, by its handle, on the row of the day it ends. The gesture
// changes the width of the override, the time of its tip and its label in place, as Lit drew
// them; the release puts them back before the new end is sent, so that Lit draws the new end.
export class OverrideEndDrag implements ReactiveController {
  card: WeekCard;
  drag: any = null;
  // When a drag ended last: the click that follows does not open the popover
  endedAt = 0;

  constructor(card: WeekCard) {
    this.card = card;
    card.addController(this);
  }

  hostDisconnected() {
    if (this.drag) this.restore(this.drag);
    this.drag = null;
  }

  get active() {
    return !!this.drag;
  }

  // A press on the end handle of an override starts a drag: true
  down(e): boolean {
    const handle = e.target.closest('.override-handle');
    if (!handle) return false;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const el = handle.parentElement;
    const climate = el.dataset.climate;
    const piece = this.card._overridePieces(climate).find((p) => p.isLast);
    if (!piece) return true;
    const tip = [...handle.querySelector('.tip').childNodes].find((n) => n.nodeType === 3) as Text;
    const rest = el.querySelector('.override-label .rest');
    this.drag = {
      climate, piece, el, handle, bar: el.parentElement, end: piece.end, moved: false,
      kept: { style: el.getAttribute('style'), handleClass: handle.getAttribute('class'), tip, time: tip && tip.data, rest },
    };
    handle.classList.add('drag');
    return true;
  }

  move(e): boolean {
    const dd = this.drag;
    if (!dd) return false;
    const card = this.card;
    const step = card._config.step;
    const p = dd.piece;
    const isToday = p.d0.toDateString() === new Date().toDateString();
    const min = Math.max(p.start + step, isToday ? Math.ceil((nowMin() + 1) / step) * step : 0);
    const m = Math.max(min, Math.min(DAY_MIN, card._snap(card._minuteAt(dd.bar, e.clientX))));
    if (m !== dd.end) {
      dd.end = m;
      dd.moved = true;
      dd.el.style.width = `${pct(m - p.start)}%`;
      if (dd.kept.tip) dd.kept.tip.data = card._loc.time(m);
      // The label keeps "⏱" alone: its end is on the tip
      if (dd.kept.rest) dd.kept.rest.style.display = 'none';
    }
    return true;
  }

  // The pointer released: the new end is sent. True if it ended a drag
  up(): boolean {
    const dd = this.drag;
    if (!dd) return false;
    this.drag = null;
    this.endedAt = Date.now(); // prevents the following "click" from opening the popover
    this.restore(dd);
    if (dd.moved) this.card._setOverrideEnd(dd.climate, atMinutes(dd.piece.d0, dd.end, new Date()));
    return true;
  }

  restore(dd) {
    const { style, handleClass, tip, time, rest } = dd.kept;
    dd.el.setAttribute('style', style);
    dd.handle.setAttribute('class', handleClass);
    if (tip) tip.data = time;
    if (rest) rest.style.display = '';
  }
}
