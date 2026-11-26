import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { placePopover, placeWhenDrawn } from '../components/shared/popover.ts';

type Host = ReactiveControllerHost & HTMLElement;

// Places the popover (`.editor`) an element draws, under what it edits, or above it when there is
// no room below, once drawn. `card`: the element under Home Assistant's top bar; `frame`: the
// ha-card the popover is placed in; `target`: what it edits, clipped to its row; `key`: which
// popover is open. A redraw of the same popover (a preset tapped, Home Assistant's new data)
// keeps where its body was scrolled: placing it may scroll it back to its top.
export class PopoverPlacement implements ReactiveController {
  host: Host;
  card: () => Element;
  frame: () => Element | null;
  target: () => Element | null;
  key: () => string;
  // Where the body was scrolled before the redraw, for the popover `key`
  kept: { key: string; top: number } | null = null;
  // The popover placed last
  placedKey: string | null = null;
  private token = 0;

  constructor(host: Host, { card, frame, target, key }: { card: () => Element; frame: () => Element | null; target: () => Element | null; key: () => string }) {
    this.host = host;
    this.card = card;
    this.frame = frame;
    this.target = target;
    this.key = key;
    host.addController(this);
  }

  hostUpdate() {
    const body = this.host.querySelector('.editor .ed-body');
    this.kept = body && body.scrollTop ? { key: this.placedKey, top: body.scrollTop } : null;
  }

  hostUpdated() {
    if (!this.host.querySelector('.editor')) return;
    // ha-card (a Lit component) draws asynchronously: until its <slot> is drawn, its content has
    // no position
    const token = ++this.token;
    placeWhenDrawn(this.frame(), () => token === this.token, () => this.place());
  }

  // Places the popover now. False while the layout is not ready yet.
  place(): boolean {
    const ed: HTMLElement = this.host.querySelector('.editor');
    const target = this.target();
    const frame = this.frame();
    if (!ed || !target || !frame) return true;
    // A slot is clipped to its row: the popover goes under the row
    if (!placePopover(this.card(), frame, ed, target, target.parentElement, false)) return false;
    const kept = this.kept;
    this.placedKey = this.key();
    const body = ed.querySelector('.ed-body');
    if (kept && body && kept.key === this.placedKey) body.scrollTop = kept.top;
    this.kept = null; // once put back
    return true;
  }
}
