import { html, nothing, svg } from 'lit';
import { slotColor } from '../../colors.ts';
import { DAY_MIN, airSettings, hasNoPreset, isFan, isOff, minutesOf, nowMin, parseDate, pct, sameSlot, slotMode } from '../../common.ts';
import { OFF_COLOR, dayOn, hvacIconTemplate, hvacSlotStyle, modeName, settingsText } from '../../hvac.ts';
import { overrideNamedMode, overrideSummary, overrideUntilText } from '../../override-edit.ts';
import { rowPiece } from '../../override.ts';
import { MEASURE_RAMP } from '../../history.ts';
import type { WeekCard } from './week-card.ts';

// What a slot shows inside its block: its start and its name, each when the block is wide enough
// for it, and the marks of its HVAC mode and of the fan and the vanes it sets
export function slotInner(card: WeekCard, start: number, end: number, s) {
  const { t, l, alone } = slotTexts(card, start, end, s);
  const tuned = Object.keys(airSettings(s)).length ? html`<ha-icon class="air" icon="mdi:tune-variant"></ha-icon>` : nothing;
  return html`<span class=${`t${alone ? ' alone' : ''}`}>${t}${hvacIconTemplate(slotMode(s))}${tuned}</span><span class="l">${l}</span>`;
}

// The texts of a slot's block: its start `t` and its name `l`, each when the block is wide enough
// for it; `alone` when its marks show without them
export function slotTexts(card: WeekCard, start: number, end: number, s) {
  const loc = card._loc;
  const dur = end - start;
  const compact = card._shown.length > 1;
  const wide = loc.hour12 ? 25 : 0; // "6:30 AM" needs more room than "06:30"
  const forTime = (compact ? 60 : 75) + wide;
  const forLabel = (compact ? 180 : 150) + wide;
  // On an off slot and a fan-only slot, the word wins over the time: a phone has no tooltip
  // to say what the color means. Too narrow for the word, the icon alone, larger
  // A heat/cool slot too: its two colors are no preset's color, so its name says which one
  const off = hasNoPreset(s) || slotMode(s) === 'heat_cool';
  const t = dur >= (off ? forLabel : forTime) ? loc.time(start) : '';
  const l = dur >= (off ? forTime : forLabel) ? card._slotLabel(s) : '';
  // Markers on the time's line, kept even in a narrow segment, so a slot's settings are never
  // invisible: the icon of the slot's HVAC mode ("00:00 ⏻", a fan, a snowflake, a flame), then
  // a mark when the slot sets the fan or the vanes; the name goes on the next line in a tall bar
  const marked = !!slotMode(s) || Object.keys(airSettings(s)).length > 0;
  return { t, l, alone: marked && !t && !l };
}

// The history of a day drawn over its bar: the measured temperature and the setpoint applied
// (over it); a setpoint far from the measured temperatures (frost protection at night…) stays on
// the edge of the bar
function history(card: WeekCard, climate: string, day: number) {
  const hd = card._historyOf(climate, day);
  if (!hd || !hd.current.length) return nothing;
  const scale = card._historyScale(climate, day);
  const y = (v) => scale.y(v).toFixed(1);
  const steps = (lines) => lines.map((l) => l.map(([m, v], i) => {
    if (!i) return `M${m} ${y(v)}`;
    return y(v) === y(l[i - 1][1]) ? `H${m}` : `H${m} V${y(v)}`;
  }).join(' ')).join(' ');
  // Measured: straight lines between the values, held flat until MEASURE_RAMP minutes before a
  // change (the rows only come when the value changes: no slope over hours)
  const measured = hd.current.map((l) => l.flatMap(([m, v], i) => {
    if (!i) return [`M${m} ${y(v)}`];
    const [m0, v0] = l[i - 1];
    const hold = v !== v0 && m - m0 > MEASURE_RAMP ? [`L${m - MEASURE_RAMP} ${y(v0)}`] : [];
    return [...hold, `L${m} ${y(v)}`];
  }).join(' ')).join(' ');
  const target = steps(hd.target);
  // Two layers: only the setpoint has a shadow
  const layer = (cls, path) => html`<svg class=${`history${cls}`} viewBox=${`0 0 ${DAY_MIN} 100`} preserveAspectRatio="none" aria-hidden="true">${path}</svg>`;
  return html`${layer('', svg`<path class="measured" d=${measured}/>`)}${
    target ? layer(' setpoint', svg`<path class="target" d=${target}/>`) : nothing}${
    card._isZoomed(climate, day) ? zoom(card, scale) : nothing}`;
}

// A day shown larger: a scale in degrees (a line every 1, 2 or 5°), and the readout of the values
// under the mouse or the finger
function zoom(card: WeekCard, { lo, hi, y }) {
  const step = hi - lo <= 6 ? 1 : hi - lo <= 12 ? 2 : 5;
  const marks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) marks.push(v);
  const axis = marks.map((v) => html`<i style=${`top:${y(v).toFixed(1)}%`}></i><span style=${`top:${y(v).toFixed(1)}%`}>${card._loc.number(v)}°</span>`);
  return html`<div class="yaxis">${axis}</div><div class="cross" hidden></div><div class="readout" hidden></div>`;
}

// Override drawn over the schedule (only in the active schedule's tab), on a row of days
function override(card: WeekCard, climate: string, days: number[]) {
  if (card._schedule !== card._activeSchedule()) return nothing;
  const d = card._overrides()[climate];
  const piece = rowPiece(card._overridePieces(climate), days);
  if (!d || !piece) return nothing;
  const loc = card._loc;
  const end = parseDate(d.end);
  const endHM = loc.time(minutesOf(end));
  const src = card._source();
  // One format, inside the block or next to it: the icon of its HVAC mode, an arrow, its end
  // ("⏱ ⏻ → 17:00"), with the day when the end is not today ("→ sat. 08:00"). The tooltip is
  // a sentence: "Cool · Comfort 25° until 23:00, then Heat · Eco"
  const now = new Date();
  const away = Math.round((+new Date(end.getFullYear(), end.getMonth(), end.getDate()) - +new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const dated = away !== 0;
  const day = !dated ? '' : `${away >= 7 || away < 0 ? loc.dateShort(end) : loc.dayShort(end)} `;
  const mode = (d.target || {}).hvac_mode || overrideNamedMode(d, src, climate, card._hass);
  const what = html`${hvacIconTemplate(mode)} → ${day}${endHM}`;
  const sentence = `${overrideSummary(d, src, climate, loc, card._hass)} ${overrideUntilText(d, src, climate, loc, card._hass)}`;
  const sel = card._overrideSel && card._overrideSel.climate === climate && card._overrideSel.day === piece.day;
  // The label inside the block. A block narrower than its label (the stylesheet measures it)
  // keeps "⏱" alone; where the override ends, the label goes next to the block instead, as a
  // tag, on the side with room (placeTags). A phone has no tooltip
  return html`<div class="override${sel ? ' sel' : ''}${piece.isLast ? ' last' : ''}${dated ? ' dated' : ''}" data-climate=${climate} data-day=${piece.day}
      style=${`left:${pct(piece.start)}%;width:${pct(piece.end - piece.start)}%`} title=${loc.t('temporarySetpointTitle', { label: sentence })}>
    <span class="override-label">⏱<span class="rest">${what}</span></span>
    ${piece.isLast ? html`<span class=${`override-tag${piece.end > DAY_MIN * 0.6 ? ' before' : ''}`}>⏱${what}</span>` : nothing}
    ${piece.isLast ? html`<div class="override-handle" title=${loc.t('dragToChangeEnd')}><span class="tip">${endHM}</span></div>` : nothing}
  </div>`;
}

// The bar of a thermostat's row of days: its slots, the handles between them, the history, the
// override and the current time. `stored`: the slots of the row's first day, as stored
export function slotBar(card: WeekCard, climate: string, stored, days: number[], showNow: boolean) {
  const loc = card._loc;
  const d = days[0];
  const segs = dayOn(card._hass, climate, stored); // an air conditioner's slots heat or cool
  const editable = card._mayEdit(climate); // read-only: no handle, no slot to move
  const sel = card._draft.selection;
  const seg = (s, i) => {
    const end = i < segs.length - 1 ? segs[i + 1].start : DAY_MIN;
    const off = isOff(s);
    const fan = isFan(s);
    const none = hasNoPreset(s);
    const selected = sel && sel.climate === climate && sel.day === d && sel.idx === i;
    const cls = ['seg', selected ? 'sel' : '', i === 0 ? 'first' : '', i === segs.length - 1 ? 'last' : '',
      editable && i > 0 && i < segs.length - 1 ? 'movable' : '', off ? 'off' : '', fan ? 'fan' : '',
      s.settings ? 'marked' : '', none || slotMode(s) === 'heat_cool' ? 'word' : ''].join(' ');
    // An off slot is grey; a fan-only, a dry and an auto slot have Home Assistant's color of
    // their HVAC mode; a cooling slot its preset's cool color, a heat/cool slot both colors.
    // The title names the slot, its HVAC mode, and the fan and the vanes it sets
    const background = off ? `background:${OFF_COLOR}` : fan ? '' : none ? hvacSlotStyle(slotMode(s)) : `background:${slotColor(card._preset(s.preset), s)}`;
    const mode = none || !slotMode(s) ? '' : modeName(loc, slotMode(s));
    const air = settingsText(card._hass, climate, loc, s.settings);
    const what = [card._slotLabel(s), mode, air].filter(Boolean).join(' · ');
    const label = `${card._name(climate)} · ${loc.time(s.start)} → ${loc.time(end)} · ${what}`;
    return html`<div class=${cls} data-idx=${i} style=${`left:${pct(s.start)}%;width:${pct(end - s.start)}%;${background}`} title=${`${label}${card._measuredText(climate, d, s.start, end)}`} aria-label=${label}>${slotInner(card, s.start, end, s)}</div>`;
  };
  const handles = !editable ? nothing : segs.slice(1)
    .map((s, j) => html`<div class=${`handle${sameSlot(segs[j], s) ? ' same' : ''}`} data-idx=${j + 1} style=${`left:${pct(s.start)}%`}><span class="tip">${loc.time(s.start)}</span></div>`);
  const unscheduled = card._unscheduled(climate) ? ' unscheduled' : '';
  const paused = card._source().paused(climate);
  const now = showNow && !paused ? html`<div class="now" style=${`left:${pct(nowMin())}%`}></div>` : nothing;
  // The day copied last stands out, in whatever card it was copied (the copy is shared)
  const clip = card._draft.clip;
  const cs = clip && clip.src;
  const isSrc = cs && cs.climate === climate && cs.schedule === card._schedule && days.includes(cs.day);
  const zoomed = card._isZoomed(climate, d) ? ' zoom' : '';
  return html`<div class=${`bar${isSrc ? ' clipsrc' : ''}${editable ? '' : ' ro'}${zoomed}${paused ? ' paused' : ''}${unscheduled}`} data-climate=${climate} data-day=${d}>${segs.map(seg)}${handles}${history(card, climate, d)}${override(card, climate, days)}${now}</div>`;
}
