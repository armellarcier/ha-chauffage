import type { ReactiveController } from 'lit';
import { DAY_MIN, pct } from '../common.ts';
import { dayOn } from '../hvac.ts';
import { slotTexts } from '../components/week/slot-bar.ts';
import type { ChauffageProgrammeCard } from '../cards/programme-card.ts';

// How far a finger moves sideways before it moves a time or a slot (#67), in pixels
const TOUCH_SLOP = 8;

// What a drag changes in place in a bar, to put back as Lit drew it: the attributes of its slots
// and handles, and the texts of their times
type Kept = { el: Element; attrs: [string, string | null][]; texts: [Text, string][] };

// Dragging a slot's handle (its start), or a whole slot (not the first nor the last of the day),
// its neighbors giving or taking the time. The gesture moves the slots of the bar in place, as Lit
// drew them; the release puts them back as they were drawn, then commits the new times, which Lit
// draws.
// The touch rules (#67): by mouse any slot moves, by touch only the selected one, so that a finger
// sliding over the week moves nothing; a finger moves a time once it has moved a few pixels
// sideways, and a mostly vertical swipe is a scroll, which puts the slots back.
export class SlotDrag implements ReactiveController {
  card: ChauffageProgrammeCard;
  drag: any = null;
  // When a whole slot or a handle was moved last: the click that follows opens no popover
  slotMovedAt = 0;
  handleMovedAt = 0;
  kept: Kept[] = [];

  constructor(card: ChauffageProgrammeCard) {
    this.card = card;
    card.addController(this);
  }

  hostDisconnected() {
    this.cancel();
  }

  get active() {
    return !!this.drag;
  }

  // A press on a slot or a handle of a bar the user may edit starts a drag: true
  down(e): boolean {
    const card = this.card;
    const seg = e.target.closest('.bar > .seg');
    if (seg) {
      const bar = seg.parentElement;
      const climate = bar.dataset.climate;
      const day = Number(bar.dataset.day);
      if (!card._mayEdit(climate)) return false; // read-only weeks: nothing moves
      const idx = Number(seg.dataset.idx);
      const segs = card._week(climate)[day];
      if (idx < 1 || idx >= segs.length - 1) return false;
      const sel = card._draft.selection;
      const selected = !!sel && sel.climate === climate && sel.day === day && sel.idx === idx;
      if (e.pointerType === 'touch' && !selected) return false;
      e.preventDefault();
      seg.setPointerCapture(e.pointerId);
      this.start(bar);
      this.drag = {
        move: true, climate, day, idx, bar, el: seg, x0: e.clientX, y0: e.clientY, selected,
        touch: e.pointerType === 'touch', orig: segs.map((s) => s.start),
        start: segs[idx].start, length: segs[idx + 1].start - segs[idx].start, moved: false,
      };
      return true;
    }
    const h = e.target.closest('.handle');
    if (!h || !card._mayEdit(h.parentElement.dataset.climate)) return false;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    const bar = h.parentElement;
    this.start(bar);
    h.classList.add('drag');
    const climate = bar.dataset.climate;
    const day = Number(bar.dataset.day);
    this.drag = {
      climate, day, idx: Number(h.dataset.idx), bar, el: h, moved: false, x0: e.clientX, y0: e.clientY,
      touch: e.pointerType === 'touch', orig: card._week(climate)[day].map((s) => s.start),
    };
    return true;
  }

  // The pointer moves: the slots follow it, snapped to the step
  move(e) {
    const d = this.drag;
    if (!d) return;
    const card = this.card;
    // A finger (#67): a mostly vertical swipe is a scroll, and moves nothing; a move needs a few
    // pixels sideways first, as a finger is not steady
    if (d.touch && !d.started) {
      const dx = Math.abs(e.clientX - d.x0);
      const dy = Math.abs((e.clientY || 0) - (d.y0 || 0));
      if (dy > dx && dy >= TOUCH_SLOP) { this.cancel(); return; }
      if (dx < TOUCH_SLOP) return;
      d.started = true;
    }
    const step = card._config.step;
    const segs = card._week(d.climate)[d.day];
    if (d.move) {
      // A few pixels are still a click (opens the popover)
      if (!d.moved && Math.abs(e.clientX - d.x0) < 5) return;
      if (!d.moved) {
        d.moved = true;
        d.bar.querySelectorAll(`.handle[data-idx="${d.idx}"], .handle[data-idx="${d.idx + 1}"]`)
          .forEach((el) => el.classList.add('drag'));
      }
      const min = segs[d.idx - 1].start + step;
      const max = (d.idx + 2 < segs.length ? segs[d.idx + 2].start : DAY_MIN) - step - d.length;
      const delta = card._snap(card._minuteAt(d.bar, e.clientX) - card._minuteAt(d.bar, d.x0));
      const m = Math.max(min, Math.min(max, d.start + delta));
      if (m !== segs[d.idx].start) {
        segs[d.idx].start = m;
        segs[d.idx + 1].start = m + d.length;
        this.layout(d.bar, segs);
      }
      return;
    }
    const min = segs[d.idx - 1].start + step;
    const max = (d.idx + 1 < segs.length ? segs[d.idx + 1].start : DAY_MIN) - step;
    const m = Math.max(min, Math.min(max, card._snap(card._minuteAt(d.bar, e.clientX))));
    if (m !== segs[d.idx].start) {
      segs[d.idx].start = m;
      d.moved = true;
      this.layout(d.bar, segs);
    }
  }

  // The pointer released: the new times are committed. True if it ended a drag
  up(): boolean {
    const d = this.drag;
    if (!d) return false;
    const card = this.card;
    this.drag = null;
    this.restore();
    if (d.move) {
      if (!d.moved) return true;
      card._lastClick = null; // the click that follows is neither a selection nor half a double click
      this.slotMovedAt = Date.now();
      // A selected slot stays selected (by touch, it can slide again); otherwise no popover
      if (!d.selected) card._draft.selection = null;
      card._commit(d.climate, d.day, d.selected ? card._week(d.climate)[d.day][d.idx].start : null);
      return true;
    }
    if (d.moved) {
      this.handleMovedAt = Date.now(); // the click that follows opens no slot
      card._commit(d.climate, d.day, null);
    }
    return true;
  }

  // A drag abandoned (a scroll, #67, or the access level dropped): its slots go back to where
  // they were, nothing to save
  cancel() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const segs = this.card._week(d.climate)[d.day];
    d.orig.forEach((start, i) => { if (segs[i]) segs[i].start = start; });
    this.restore();
  }

  // The bar as Lit drew it, kept before the gesture changes it
  start(bar: Element) {
    const textsOf = (el: Element) => [...el.querySelectorAll('.t, .l, .tip')]
      .map((span) => [...span.childNodes].find((n) => n.nodeType === 3) as Text)
      .filter(Boolean).map((n) => [n, n.data] as [Text, string]);
    this.kept = [...bar.querySelectorAll('.seg, .handle, .seg .t')].map((el) => ({
      el,
      attrs: ['style', 'class'].map((name) => [name, el.getAttribute(name)] as [string, string | null]),
      texts: el.matches('.seg, .handle') ? textsOf(el) : [],
    }));
  }

  restore() {
    for (const { el, attrs, texts } of this.kept) {
      for (const [name, value] of attrs) {
        if (value == null) el.removeAttribute(name);
        else el.setAttribute(name, value);
      }
      for (const [node, data] of texts) node.data = data;
    }
    this.kept = [];
  }

  // The bar while dragging: its slots and handles at their new times, in place
  layout(bar: HTMLElement, stored) {
    const card = this.card;
    const segs = dayOn(card._hass, bar.dataset.climate, stored); // as they run on the thermostat
    bar.querySelectorAll('.seg').forEach((el: HTMLElement, i) => {
      const s = segs[i];
      const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
      el.style.left = `${pct(s.start)}%`;
      el.style.width = `${pct(end - s.start)}%`;
      const { t, l, alone } = slotTexts(card, s.start, end, s);
      const time = el.querySelector('.t');
      setText(time, t);
      setText(el.querySelector('.l'), l);
      if (time) time.classList.toggle('alone', alone);
    });
    bar.querySelectorAll('.handle').forEach((el: HTMLElement) => {
      const s = segs[Number(el.dataset.idx)];
      el.style.left = `${pct(s.start)}%`;
      setText(el.querySelector('.tip'), card._loc.time(s.start));
    });
  }
}

// Changes the text Lit drew in an element (its text node), without replacing what Lit drew
function setText(el: Element | null, text: string) {
  const node = el && ([...el.childNodes].find((n) => n.nodeType === 3) as Text);
  if (node && node.data !== text) node.data = text;
}
