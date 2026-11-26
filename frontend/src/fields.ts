import { html } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { live } from 'lit/directives/live.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { DAY_MIN, ICON_DOWN, ICON_UP, minutesOf, parseDate } from './common.ts';
import { attributes } from './components/shared/attributes.ts';
import { DEFAULT_LOCALE } from './i18n/locale.ts';

// ---------- stepped fields: a time, a duration ----------
// One field for a value in minutes, typed or moved by small arrows (#63, #83). A text field, read
// when it is left or on Enter. Its small arrows, like those of <input type="time">, and the arrow
// keys move the value by the field's step. A kind (STEPPED_KINDS) says how to show, read and move
// its value:
// - a time, in the format of the user's profile: a browser shows <input type="time"> in the format
//   of its own language. "1225" gives 12:25. The arrow keys on its hours move it by an hour, on
//   AM / PM by 12 hours;
// - a duration, from `min` to `max`, moved by `step` by its arrows: "2 h 45", read as a time is:
//   "245", "2:45", "2h45" and "2 h 45" give 2 h 45.

const STEPPED_KINDS = {
  time: {
    format: (m, loc) => loc.time(m),
    read: (el, loc) => typedTime(el, loc),
    // A time moved past midnight goes round the clock
    fit: (m) => ((m % DAY_MIN) + DAY_MIN) % DAY_MIN,
    valid: () => true,
    // As wide as the longest time of the profile's format ("10:45 PM", "10:45 p. m.")
    widest: (loc) => loc.time(22 * 60 + 45),
    titles: (step, loc) => [loc.t('later', { duration: durationText(step, loc) }), loc.t('earlier', { duration: durationText(step, loc) })],
    arrowKey: arrowInTime,
  },
  duration: {
    format: (m, loc) => roundDurationText(m, loc),
    read: (el) => typedDuration(el.value),
    fit: (m, el) => Math.min(Number(el.dataset.max), Math.max(Number(el.dataset.min), m)),
    // Any whole number of minutes in the range: the step is the arrows' only
    valid: (m, el) => m >= Number(el.dataset.min) && m <= Number(el.dataset.max),
    widest: (loc) => roundDurationText(23 * 60 + 45, loc),
    titles: (step, loc) => [loc.t('longer', { duration: durationText(step, loc) }), loc.t('shorter', { duration: durationText(step, loc) })],
    arrowKey: null, // the field's step, wherever the caret is
  },
};
const kindOf = (el) => STEPPED_KINDS[el.dataset.kind] || STEPPED_KINDS.time;

// A stepped field of a `kind`, on `minutes`. `attrs`: the attributes that say what it is for. A
// new value is a new field: a field keeps what is typed in it while its value stays the same.
// A time field left shows the time it ends up with at the next redraw, even when that time does
// not change, for example a time rounded back onto it: its hosts don't redraw while a time is
// typed. A duration field keeps what is typed: the settings dialog redraws as the integration
// pushes.
function steppedField(kind, attrs, minutes, loc, step, disabled = false) {
  const k = STEPPED_KINDS[kind];
  // Out of the Tab order: the arrow keys do the same from the field
  const button = (dir, icon, title) => html`<button type="button" class="time-step" data-time-step=${dir} tabindex="-1" title=${title} aria-label=${title} ?disabled=${disabled}>${unsafeHTML(icon)}</button>`;
  // Counting a character of Chinese or Japanese as two
  const width = [...k.widest(loc)].reduce((n, c) => n + (c >= '⺀' ? 2 : 1), 0);
  const [up, down] = k.titles(step, loc);
  const shown = (value) => (kind === 'time' ? live(value) : value);
  // The number keypad on a phone, on a 12 h clock too: a time typed without AM / PM keeps the period
  return keyed(`${minutes} ${loc.signature}`, html`<span class="time-field"><input type="text" class="time" style=${`width:calc(${width}ch + 2px)`} inputmode="numeric"
    autocomplete="off" ${attributes(attrs)} data-kind=${kind} data-step=${step} data-minutes=${shown(String(minutes))} ?disabled=${disabled} .value=${shown(k.format(minutes, loc))}><span
    class="time-spin">${button(1, ICON_UP, up)}${button(-1, ICON_DOWN, down)}</span></span>`);
}

// A time field: the start or the end of a slot, the end of an override
export function timeField(attrs, minutes, loc, step) {
  return steppedField('time', attrs, minutes, loc, step);
}

// A duration field, from `min` to `max` minutes by `step`: the duration of a change by hand, in
// the settings dialog
export function durationField(attrs, minutes, loc, { step, min, max, disabled = false }) {
  return steppedField('duration', { ...attrs, 'data-min': min, 'data-max': max }, minutes, loc, step, disabled);
}

// A duration typed by hand, read as a time is (parseTime), as hours and minutes: "4" is 4 h 00,
// "0040" 40 min, "245" and "2:45" 2 h 45, up to "24" (24 h), with no AM / PM. A duration under an
// hour reads as the field shows it too: "45 min". Null if it is not a duration.
function typedDuration(text) {
  const shown = /^\s*(\d{1,2})\s*min\s*$/i.exec(text);
  if (shown) return Number(shown[1]);
  const t = parseTime(text, [], { hours: 24, ampm: false });
  return t && t.h * 60 + t.m;
}

// A time typed by hand, read the way people write it: "1225", "12:25", "12.25", "12h25", "7" (7:00),
// "730" (7:30), with or without AM / PM, before or after: "7p", "7:30 pm", or the words of the
// user's language (`periods`, from Intl). Returns { h, m, pm }, pm being null when neither AM nor PM
// is typed; null if it is not a time. `hours`: the most hours without AM / PM; `ampm`: false for a
// duration, which has none.
export function parseTime(text, periods = [], { hours = 23, ampm = true } = {}) {
  const compact = (s) => String(s).toLowerCase().replace(/[\s.]/g, '');
  let rest = compact(text);
  let pm = null;
  const words: any[] = (ampm ? [...periods.map((w, i) => [compact(w), i === 1]), ['am', false], ['pm', true], ['a', false], ['p', true]] : [])
    .filter(([w]) => w)
    .sort((a: any, b: any) => b[0].length - a[0].length);
  for (const [w, isPm] of words) {
    if (rest.endsWith(w)) rest = rest.slice(0, -w.length);
    else if (rest.startsWith(w)) rest = rest.slice(w.length);
    else continue;
    pm = isPm;
    break;
  }
  const r = /^(\d{1,2})(?:[:h]?(\d{2}))?h?$/.exec(rest);
  if (!r) return null;
  const h = Number(r[1]);
  const m = r[2] ? Number(r[2]) : 0;
  if (m > 59 || h > (pm === null ? hours : 12) || (pm !== null && h < 1)) return null;
  return { h, m, pm };
}

// The time typed in a time field, in minutes since midnight; null if it is not a time. On a 12 h
// clock, a time from 1 to 11 typed without AM / PM keeps the period the field had, and 12 is noon.
function typedTime(el, loc) {
  // The end of a slot may be 24:00, the end of the day (`data-day-end`); 24:15 is not a time
  const t = parseTime(el.value, loc.periods, { hours: 'dayEnd' in el.dataset ? 24 : 23 });
  if (!t || (t.h === 24 && t.m)) return null;
  const keep = loc.hour12 && t.h >= 1 && t.h <= 12 ? t.h === 12 || Number(el.dataset.minutes) >= 12 * 60 : null;
  const pm = t.pm ?? keep;
  return (pm === null ? t.h : (t.h % 12) + (pm ? 12 : 0)) * 60 + t.m;
}

// How far a time moves for a move of `delta` minutes onto the multiples of `grid`
// (11:47 + 15 min: + 13 min, to 12:00)
const moveBy = (m, delta, grid = 1) => (delta > 0 ? Math.floor(m / grid) : Math.ceil(m / grid)) * grid + delta - m;

// The value of a stepped field moved by its arrows: `move(minutes, step)` gives how far. The field
// keeps how far its arrows moved it (`moved`, in minutes), for the end of an override. False if
// the field holds no value.
function moveField(el, loc, move) {
  const k = kindOf(el);
  const m = k.read(el, loc);
  if (m === null) return false;
  const to = k.fit(m + move(m, Number(el.dataset.step)), el);
  el.dataset.moved = Number(el.dataset.moved || 0) + to - m;
  el.value = k.format(to, loc);
  return true;
}

// ↑ / ↓ in a time field: on the hours, an hour; on the minutes, the field's step; elsewhere on a
// 12 h clock (AM / PM), 12 hours. The hours and minutes are the first two groups of digits, as the
// separator depends on the language ("08:30", "08.30", "08 h 30").
function arrowInTime(el, dir, loc) {
  const pos = el.selectionStart || 0;
  const [hours, minutes] = [...el.value.matchAll(/\d+/g)].map((r) => [r.index, r.index + r[0].length]);
  const on = (part) => part && pos >= part[0] && pos <= part[1];
  return (m, step) => {
    if (on(hours)) return 60 * dir;
    if (loc.hour12 && !on(minutes)) return 12 * 60 * dir;
    return moveBy(m, step * dir, step);
  };
}

// ↑ / ↓ in a stepped field: by the kind's own rule, else by the field's step
function arrowInField(e, loc) {
  const el = e.target;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const dir = e.key === 'ArrowUp' ? 1 : -1;
  const k = kindOf(el);
  const pos = el.selectionStart || 0;
  const move = k.arrowKey ? k.arrowKey(el, dir, loc) : (m, step) => moveBy(m, step * dir, step);
  if (!moveField(el, loc, move)) return;
  e.preventDefault();
  if (k.arrowKey) el.setSelectionRange(pos, pos);
}

// A stepped field left (or Enter, or its small arrows): `apply(minutes)` once per new value, and
// the value shown again in its format. Then the redraws held back while it was typed in are done.
// A value that is not one is shown again as it was; with `refuse`, a value the kind does not
// accept (a duration out of range) too, and `refuse()` says why.
export function timeFieldDone(host, el, apply, refuse = null) {
  const k = kindOf(el);
  const minutes = k.read(el, host._loc);
  if (refuse && (minutes === null || !k.valid(minutes, el))) {
    el.value = k.format(Number(el.dataset.minutes), host._loc);
    delete el.dataset.moved;
    refuse();
  } else if (minutes === null) {
    el.value = k.format(Number(el.dataset.minutes), host._loc);
    host._redrawLater = true;
  } else {
    el.value = k.format(minutes, host._loc);
    if (minutes !== Number(el.dataset.minutes) || Number(el.dataset.moved)) {
      el.dataset.minutes = minutes; // applied once
      apply(minutes);
      delete el.dataset.moved;
    }
  }
  if (!host._redrawLater) return;
  host._redrawLater = false;
  host.requestUpdate();
}

// The end of an override typed in its field: moved by the arrows, the end moves by as much (it
// does not jump to tomorrow, nor lose the days of an end in three days); typed, the next time it
// is that time. An end before now + a step is then raised to it.
export const endOfField = (el, minutes) => (Number(el.dataset.moved)
  ? endMovedBy(el.dataset.endsAt, Number(el.dataset.moved))
  : nextAtMinutes(minutes));

// The end of an override moved by `min` minutes (its arrows, its +30 min button)
export const endMovedBy = (end, min) => new Date(parseDate(end).getTime() + min * 60000);


// Why a thermostat protects itself (a Versatile Thermostat's window or auto start/stop), as the
// integration says it (#91): { short, long } texts, or null. `requested`: the name of the preset
// it restarts on, after the cause. Also while the window keeps it heating at its frost setpoint
export function causeText(src, climate, loc, requested?) {
  const cause = src.cause(climate);
  if (!cause) return null;
  const key = cause === 'window' ? 'offWindow' : 'offAutoStop';
  return { short: loc.t(`${key}Short`), long: requested ? `${loc.t(key)} · ${requested}` : loc.t(key) };
}

// An element with role="link" (a row of the panel's lists, a link in a text) opens with Enter, and
// a row with Space too, as a link of Home Assistant
export function linksByKeyboard(root) {
  root.addEventListener('keydown', (e) => {
    const link = e.target;
    if (!link.matches || !link.matches('[role="link"]')) return;
    if (e.key !== 'Enter' && !(e.key === ' ' && link.matches('.th-row'))) return;
    e.preventDefault();
    link.click();
  });
}

// The listeners of the time fields of a card's shadow root. `done(field, next)` applies a field's
// time (`next`: the field Tab goes to, if any).
export function listenTimeFields(host, done) {
  const root = host.shadowRoot;
  const isTime = (el) => el && el.matches && el.matches('input.time');
  root.addEventListener('focusout', (e) => { if (isTime(e.target)) done(e.target, e.relatedTarget); });
  // Typed: the time is the one typed, not moved (the end of an override)
  root.addEventListener('input', (e) => { if (isTime(e.target)) delete e.target.dataset.moved; });
  root.addEventListener('keydown', (e) => {
    if (!isTime(e.target)) return;
    if (e.key === 'Enter') e.target.blur(); // applied on leaving the field
    else arrowInField(e, host._loc);
  });
  // The small arrows: the field keeps the focus (a redraw would take the button away before its click)
  root.addEventListener('mousedown', (e) => { if (e.target.closest('.time-step')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    const button = e.target.closest('.time-step');
    if (!button) return;
    const el = button.closest('.time-field').querySelector('input.time');
    const dir = Number(button.dataset.timeStep);
    if (!moveField(el, host._loc, (m, step) => moveBy(m, step * dir, step))) return;
    if (root.activeElement === el) el.blur(); // applied by its focusout
    else done(el);
  });
}

// The moment at `minutes` (time of day) of the day starting at `day0`; DAY_MIN is the next midnight.
// On the days the clocks change: a time played twice is its first occurrence, or the second one if
// the first is before `notBefore`; a time skipped is the moment the clocks went forward.
export function atMinutes(day0, minutes, notBefore = null) {
  const at = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate(), 0, minutes);
  if (minutes >= DAY_MIN) return at;
  if (minutesOf(at) !== minutes) {
    let t = at.getTime();
    while (minutesOf(new Date(t - 60000)) > minutes) t -= 60000;
    return new Date(t);
  }
  const nextDay = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + 1);
  const again = new Date(at.getTime() + (nextDay.getTimezoneOffset() - at.getTimezoneOffset()) * 60000);
  return notBefore && at < notBefore && again > at && minutesOf(again) === minutes ? again : at;
}

// The next occurrence of `minutes` (time of day) after now: today, otherwise tomorrow
function nextAtMinutes(minutes) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = atMinutes(today, minutes, now);
  return at > now ? at : atMinutes(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), minutes, now);
}

export function durationText(min, locale = DEFAULT_LOCALE) {
  return min >= 60
    ? locale.t('duration', { h: Math.floor(min / 60), mm: String(min % 60).padStart(2, '0') })
    : `${min} min`;
}

// A duration in a sentence: "2 h" for whole hours, else as durationText ("1 h 30", "45 min")
export function roundDurationText(min, locale = DEFAULT_LOCALE) {
  return min >= 60 && min % 60 === 0 ? locale.t('hours', { h: min / 60 }) : durationText(min, locale);
}

// Why an override from a change by hand ends then (#83): "at the next slot", "2 h after the change",
// or "no slot ahead" (kept a week until the next slot). '' for an end chosen on the card, the panel
// or by the service
export function endReasonText(d, loc) {
  if (d.ends_at === 'next_slot') return loc.t('endsNextSlot');
  if (d.ends_at === 'no_next_slot') return loc.t('endsNoNextSlot');
  if (d.ends_at !== 'duration') return '';
  const minutes = Math.round((+parseDate(d.end) - +parseDate(d.start)) / 60000);
  return loc.t('endsAfter', { duration: roundDurationText(minutes, loc) });
}
