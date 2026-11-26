// Places a popover (`.editor`) in `frame`, under what it edits, or above it when there is no room
// below. `target` is what it edits, clipped to `clip`: a slot to its row, a cell to the table of
// presets, which may scroll sideways. The popover goes under `clip`, or under `target` itself
// when `underTarget` (a cell, the button adding a preset). `host` gives the height of Home
// Assistant's top bar. Returns false while the layout is not ready yet.
export function placePopover(host: Element, frame: Element, ed: HTMLElement, target: Element, clip: Element, underTarget: boolean) {
  const card = frame.getBoundingClientRect();
  const bar = clip.getBoundingClientRect();
  if (!card.width || !bar.width) return false;
  const sr = target.getBoundingClientRect();
  const row = underTarget ? sr : bar;
  // On a narrow card (a phone), the popover takes the card's width: centred, whatever it holds
  ed.style.width = card.width <= 516 ? `${card.width - 16}px` : '';
  ed.classList.toggle('narrow', card.width <= 516); // its HVAC modes in three columns
  ed.style.maxHeight = ''; // its whole height first
  const w = ed.offsetWidth;
  const h = ed.offsetHeight;
  // The popover is placed from inside the card's border: centred between its two borders
  const border = frame.clientLeft || 0;
  const cx = (Math.max(sr.left, bar.left) + Math.min(sr.right, bar.right)) / 2 - card.left;
  const left = Math.max(8, Math.min(card.width - w - 8, cx - w / 2)) - border;
  let top = row.bottom - card.top + 9;
  let above = false;
  // The popover goes over the save bar, but stays in the window, under Home Assistant's top bar
  const topBar = parseFloat(getComputedStyle(host).getPropertyValue('--header-height')) || 0;
  let max = 0;
  if (row.bottom + 9 + h > window.innerHeight) {
    const roomBelow = window.innerHeight - row.bottom - 9 - 8;
    const roomAbove = row.top - 9 - 8 - topBar;
    // No room on either side: it takes the larger one, and its body scrolls
    if (row.top - 9 - h <= topBar) max = Math.max(roomBelow, roomAbove);
    if (max !== roomBelow) {
      top = row.top - card.top - (max || h) - 9;
      above = true;
    }
  }
  ed.style.maxHeight = max ? `${max}px` : '';
  ed.style.left = `${left}px`;
  ed.style.top = `${top}px`;
  ed.style.setProperty('--caret', `${Math.max(14, Math.min(w - 14, cx - left))}px`);
  ed.classList.toggle('above', above);
  ed.classList.add('placed');
  return true;
}

// Places a popover once `frame` shows its content: ha-card, a Lit component, draws asynchronously,
// and before that its content has no position. Tries again on the next frames, until `place`
// says the popover is placed. A newer call takes over from an older one (`token`).
export function placeWhenDrawn(frame: any, token: () => boolean, place: () => boolean) {
  const ready = frame && frame.updateComplete instanceof Promise ? frame.updateComplete : Promise.resolve();
  ready.then(() => {
    let tries = 0;
    const attempt = () => {
      if (!token()) return;
      if (place() || ++tries > 10) return;
      requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  });
}
