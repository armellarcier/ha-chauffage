import { chipStyle } from './colors.ts';
import { DAY_MIN, NO_PRESET_MODES, SETPOINT_MODES, SETTING_ATTRS, esc, hasNoPreset, minutesOf, parseDate, rangeText, slotMode } from './common.ts';
import { durationText, endReasonText, roundDurationText, timeField } from './fields.ts';
import { temperatureOf } from './history.ts';
import { defaultSetpointMode, hasModeRow, hvacModesOf, isReversible, modeName, ownPresetName, parseDecimal, presetModes, rowModesOf, setpointModesOf, slotModeOn, stateOf } from './hvac.ts';
import { isOffOverride, overrideHvac, overrideLabel, setpointHvac, targetKind } from './override.ts';
import { fitTemperature, modeChipHtml, modeRowHtml, offChipHtml, presetOf, presetsOf, sortedPresets, stepOf, stepperHtml } from './presets.ts';
import { parseDay } from './slots.ts';

// The value of an override, in the card's popover and the more-info block (#91). On a thermostat
// with more than one "on" HVAC mode, two rows: the HVAC mode, then the presets that have a value
// for it (what each means on this thermostat, as the integration says: `targets`). Off, fan
// only, dry and auto have no preset. A heater has one row: Off, then the presets. Then a
// temperature (the thermostat's setpoint while the override is a preset); in heat/cool, the
// range instead. The preset picked is highlighted (one at the same temperature is not); without
// one, the preset whose climate preset the thermostat is on. Returns { presets, temperature }
// HTML.
function overrideValueHtml(d, src, climate, attrs, loc, hass) {
  const targets = src.targets(climate);
  const target = (d && d.target) || {};
  const off = isOffOverride(d);
  // On an air conditioner, the override heats or cools: its own HVAC mode, else the planned one
  const mode = overrideHvacOn(d, hass, src, climate);
  // Fan only, dry or auto: an override that sets it and no setpoint
  const idle = !off && NO_PRESET_MODES.includes(target.hvac_mode) && !('temperature' in target) && !('preset_mode' in target) ? target.hvac_mode : null;
  const picked = d && d.preset && targets[d.preset] ? d.preset : null; // not a preset deleted since
  // The presets in their cool color while the override cools (a heater's: while it does)
  const state = stateOf(hass, climate);
  const cools = mode ? mode === 'cool' : overrideHvac(d) === 'cool' || (!overrideHvac(d) && !!state && state.state === 'cool');
  const rows = hasModeRow(hass, climate);
  const inMode = mode || defaultSetpointMode(hass, climate);
  const none = off || !!idle;
  // Without an HVAC mode of its own (a valve that lists heat and auto): the one it runs in
  const running = state && rowModesOf(hass, climate).includes(state.state) ? state.state : defaultSetpointMode(hass, climate);
  const presets = rows && none ? '' : sortedPresets(src, loc)
    .filter((l) => targets[l.id] && (picked === l.id || presetModes(targets[l.id]).includes(inMode))).map((l) => {
      const value = targets[l.id];
      const on = !!d && !none && (picked ? picked === l.id
        : targetKind(target) === 'preset' && targetKind(value) === 'preset' && target.preset_mode != null && target.preset_mode === value.preset_mode);
      return `<button data-act="override-preset" data-preset="${esc(l.id)}" class="${on ? 'on' : ''}" style="${chipStyle(l, cools ? 'cool' : mode)}">${esc(l.name)}</button>`;
    }).join('');
  // The override's own temperature: the preset's, heating or cooling, when it is known (not an open
  // window's frost setpoint, #112), or the temperature typed. A preset that cools without a value
  // when cooling leaves the setpoint alone: a note says so
  const own = picked ? (cools ? coolPresetTemperatureOf(src, climate, target) : presetTemperatureOf(src, climate, target))
    : d && targetKind(target) === 'temperature' ? target.temperature : null;
  // Without one, the field shows the setpoint of the thermostat, and follows it (_updateLive)
  const live = own == null;
  const value = live ? attrs.temperature : own;
  const note = picked && cools && !none && !('cool_temperature' in target) && !('cool_preset_mode' in target)
    ? loc.t(isReversible(hass, climate) ? 'slotSetpointUnchanged' : 'slotSetpointKept') : '';
  // A text field with its − and its +, in the user's number format, read with either decimal
  // separator: the same field as in the presets tab
  let temperature = `<span class="temp-label">${esc(loc.t('presetTemperature'))}</span>${stepperHtml(loc, `data-override-temperature${live ? ' data-live' : ''}`, value, 'override-step', stepOf(hass, climate), loc.t('presetTemperature'))}${note ? ` <span class="muted override-note">${esc(note)}</span>` : ''}`;
  // Heat/cool takes a range: the one of the preset, or the one set by hand
  if (mode === 'heat_cool' && !none) {
    temperature = 'target_temp_low' in target
      ? setpointLineHtml(loc.t('slotSetpoint', { value: rangeText(target.target_temp_low, target.target_temp_high, loc) }), loc) : '';
  }
  const disabled = SETPOINT_MODES.filter((m) => !Object.values(targets).some((v) => presetModes(v).includes(m)));
  const chosen = off ? 'off' : idle || mode || running;
  const first = rows ? modeRowHtml(hass, climate, loc, chosen, 'override-mode', disabled, !d)
    : '';
  const chips = rows ? '' : `${offChipHtml(hass, climate, loc, 'override-off', off)}${idle ? modeChipHtml(hass, climate, loc, idle, 'override-mode', true) : ''}`;
  // Off, fan only, dry and auto take no temperature
  return { modes: first, presets: rows && !presets ? '' : `<div class="presets">${chips}${presets}</div>`, temperature: none ? '' : temperature };
}

// Whether a slot will run in cool on a thermostat (#91): the slot says cool and the thermostat
// lists it; or the slot does not say, and the thermostat cools now
function slotCools(hass, climate, seg) {
  const mode = slotModeOn(hass, climate, seg);
  if (mode) return mode === 'cool';
  const st = stateOf(hass, climate);
  return !!st && st.state === 'cool';
}

// The setpoint a slot will apply, with its number: "Setpoint: 20 °C (its Comfort preset)". With
// the integration's rule: the preset's value for the slot's HVAC mode. When cooling without one,
// "Setpoint unchanged": a heating temperature is never sent in cool, on a thermostat that only
// cools either. In heat/cool, the range: "20–25 °C".
// `temperatureOf`: the temperature a device preset gives when heating; `coolTemperatureOf`:
// when cooling
export function slotSetpointText(hass, climate, seg, target, loc, { temperatureOf = () => null, coolTemperatureOf = () => null } = {}) {
  const t = loc.t;
  if (hasNoPreset(seg) || !target) return '';
  const degrees = (value) => `${loc.number(value)} ${loc.unit}`;
  const own = (preset, temperature) => {
    const name = ownPresetName(hass, climate, preset, loc);
    // Without a number, nothing to say: the chip already names the preset
    return temperature != null ? t('slotSetpoint', { value: t('slotSetpointOwn', { temperature: degrees(temperature), preset: name }) }) : '';
  };
  if (slotModeOn(hass, climate, seg) === 'heat_cool') {
    if (!('target_temp_low' in target)) return t('slotSetpointKept');
    return t('slotSetpoint', { value: rangeText(target.target_temp_low, target.target_temp_high, loc) });
  }
  if (slotCools(hass, climate, seg)) {
    if ('cool_temperature' in target) return t('slotSetpoint', { value: degrees(target.cool_temperature) });
    if ('cool_preset_mode' in target) return own(target.cool_preset_mode, coolTemperatureOf(target));
    return t(isReversible(hass, climate) ? 'slotSetpointUnchanged' : 'slotSetpointKept');
  }
  if ('temperature' in target) return t('slotSetpoint', { value: degrees(target.temperature) });
  if (!('preset_mode' in target)) return '';
  return own(target.preset_mode, temperatureOf(target));
}

// The line that says a setpoint, the same in every block: "Setpoint: 20 °C". `path`: the
// presets tab, for who may set the presets: a button after the words
export function setpointLineHtml(text, loc, path = null) {
  if (!text && !path) return '';
  const edit = path ? `<span class="setpoint-edit" role="link" tabindex="0" data-navigate="${esc(path)}" title="${esc(loc.t('setPresets'))}"><ha-icon icon="mdi:tune-variant"></ha-icon><span>${esc(loc.t('setpointEdit'))}</span></span>` : '';
  return `<div class="setpoint-line">${text ? `<span class="slot-setpoint">${esc(text)}</span>` : ''}${edit}</div>`;
}

// A slot's name on a thermostat that lists more than one "on" HVAC mode: "Heat · Eco"
function slotNameOn(hass, climate, seg, presets, loc) {
  const name = slotName(seg, presets, loc);
  const mode = hasNoPreset(seg) || !hasModeRow(hass, climate) ? null : slotModeOn(hass, climate, seg);
  return mode ? `${modeName(loc, mode)} · ${name}` : name;
}

// Temperature a preset gives a thermostat: its own for a temperature; for a preset, the one the
// integration computes (published by Versatile Thermostat, else learned), the same it compares
// a manual setpoint with
export function presetTemperatureOf(src, climate, target) {
  if ('temperature' in target) return target.temperature;
  const temperature = 'preset_mode' in target ? src.presetTemperature(climate, target.preset_mode) : null;
  return typeof temperature === 'number' ? temperature : null;
}
// Temperature a preset gives a thermostat when it cools: its cooling temperature, else what its
// own preset gives when cooling, when the integration knows it; null otherwise
export function coolPresetTemperatureOf(src, climate, target) {
  if ('cool_temperature' in target) return target.cool_temperature;
  const temperature = 'cool_preset_mode' in target ? src.coolPresetTemperature(climate, target.cool_preset_mode) : null;
  return typeof temperature === 'number' ? temperature : null;
}

// The temperature a target gives in an HVAC mode, as text: "25°", "20–25°", '' when not known
function targetDegrees(src, climate, target, mode, loc) {
  const degrees = (value) => (typeof value === 'number' ? `${loc.number(value)}°` : '');
  if (mode === 'heat_cool') return 'target_temp_low' in target ? rangeText(target.target_temp_low, target.target_temp_high, loc, '°') : '';
  if (mode === 'cool') return degrees(coolPresetTemperatureOf(src, climate, target));
  return degrees(presetTemperatureOf(src, climate, target));
}

// The HVAC mode an override is named with, on a thermostat that lists more than one "on" HVAC
// mode: the one its setpoint is for. Null on a heater, and for off, fan only, dry and auto,
// which say themselves
export function overrideNamedMode(d, src, climate, hass) {
  const target = (d && d.target) || {};
  const sets = !!d.preset || ['temperature', 'preset_mode', 'target_temp_low'].some((key) => key in target);
  if (!sets || isOffOverride(d) || !hasModeRow(hass, climate)) return null;
  return overrideHvacOn(d, hass, src, climate);
}

// An override in a few words (#91): "Cool · Comfort 25°", "22 °C", "Off", "Dry". On a
// thermostat that lists more than one "on" HVAC mode, the HVAC mode comes first. `short`:
// without the temperature of a preset
export function overrideSummary(d, src, climate, loc, hass, short = false) {
  const presets = presetsOf(src, loc);
  const label = overrideLabel(d, loc, presets);
  const target = d.target || {};
  const mode = overrideNamedMode(d, src, climate, hass);
  const picked = d.preset && presets.some((p) => p.id === d.preset);
  const cools = mode ? mode : (hass.states[climate] || {}).state === 'cool' && !('temperature' in target) ? 'cool' : 'heat';
  const degrees = picked && !short && target.hvac_mode !== 'off' ? targetDegrees(src, climate, target, cools, loc) : '';
  return `${mode ? `${modeName(loc, mode)} · ` : ''}${label}${degrees ? ` ${degrees}` : ''}`;
}

// Until when an override lasts, and what the schedule plans then: "until 23:00, then Heat · Eco"
export function overrideUntilText(d, src, climate, loc, hass) {
  const end = parseDate(d.end);
  const time = loc.time(minutesOf(end));
  const when = end.toDateString() === new Date().toDateString() ? time : `${time} (${dayText(end, loc)})`;
  const slot = slotAt(activeWeek(src, climate), end);
  const next = slot ? slotNameOn(hass, climate, slot, presetsOf(src, loc), loc) : '';
  return `${loc.t('until')} ${when}${next ? `, ${loc.t('thenNext', { next })}` : ''}`;
}

// A slot's name: its HVAC mode for a slot without a preset ("Off", "Fan only", "Dry"), else its
// preset's
export const slotName = (seg, presets, loc) => (hasNoPreset(seg) ? modeName(loc, slotMode(seg)) : presetOf(presets, seg.preset, loc).name);

// "then Eco (schedule)": what the thermostat goes back to at the override's end
function thenText(src, climate, d, loc, hass) {
  const slot = slotAt(activeWeek(src, climate), parseDate(d.end));
  if (!slot) return '';
  return loc.t('thenSchedule', { preset: slotNameOn(hass, climate, slot, presetsOf(src, loc), loc) });
}

// The day of an instant to come, in a sentence: its day name ("monday") within the 6 days to come,
// else its date ("19 octobre"). 7 days away, the day name would read as today.
function dayText(at, loc) {
  const now = new Date();
  const days = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate())
    - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  return days >= 7 ? loc.date(at) : loc.days[(at.getDay() + 6) % 7].toLowerCase();
}
// An instant to come: its time today ("17:30"), else its day too ("monday 06:30")
export function whenText(at, loc) {
  const time = loc.time(minutesOf(at));
  return at.toDateString() === new Date().toDateString() ? time : `${dayText(at, loc)} ${time}`;
}

// The end of an override, in words, under its time field: "today, at the next slot · 45 min left
// · then Eco". The reason of a change by hand (#83) is part of its end; with Set up it opens the
// settings dialog on top of the view (openSettings), where the user chooses it.
function overrideEndHtml(src, climate, d, loc, hass) {
  const t = loc.t;
  const endsAt = parseDate(d.end);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const day = endsAt.toDateString() === now.toDateString() ? t('today')
    : endsAt.toDateString() === tomorrow.toDateString() ? t('tomorrow') : dayText(endsAt, loc);
  const remaining = Math.max(0, Math.round((endsAt - now) / 60000));
  const reason = endReasonText(d, loc);
  const why = reason && src.editable
    ? `<span class="mi-link" role="link" tabindex="0" data-open-settings title="${esc(t('endsChoose'))}">${esc(reason)} <span aria-hidden="true">⚙</span></span>`
    : esc(reason);
  const then = thenText(src, climate, d, loc, hass);
  return `${esc(day)}${reason ? `, ${why}` : ''} · ${esc(t('remaining', { duration: remainingText(remaining, loc) }))}${then ? ` · ${esc(then)}` : ''}`;
}

// A time left: "1 h 30", "45 min"; past a day, the whole days then the whole hours left ("1 d 11 h",
// "7 d"), for a change kept a week (#83). Never rounded up: 1 d 12 h is not 2 d.
function remainingText(min, loc) {
  if (min < DAY_MIN) return durationText(min, loc);
  const d = Math.floor(min / DAY_MIN);
  const h = Math.floor((min % DAY_MIN) / 60);
  return h ? loc.t('durationDaysHours', { d, h }) : loc.t('durationDays', { d });
}

// The button that sets an override's end to the next slot (#83): "Until 17:30 (next slot)", with the
// day when it is not today. The integration computes the next slot, in Home Assistant's time zone,
// as for a change by hand made now; the button keeps the instant (data-at) and sends exactly it.
// None without a next slot (or from an older integration), or when the override already ends then
// (compared to the minute: the integration writes its end in its own offset)
function nextSlotButton(src, climate, d, loc) {
  const iso = (src.planned(climate) || {}).next_slot_end;
  const at = iso ? parseDate(iso) : null;
  if (!at || d.ends_at === 'next_slot' || Math.floor(at / 60000) === Math.floor(parseDate(d.end) / 60000)) return '';
  return `<button class="btn" data-act="override-next-slot" data-at="${esc(iso)}">${esc(loc.t('untilNextSlot', { time: whenText(at, loc) }))}</button>`;
}

// The button that sets an off override's end to tomorrow's first slot that changes the
// thermostat's state (#91): "Until tomorrow 06:30". The integration computes the instant
// (`next_day_slot_end`). None on an "on" override, without such a slot, or when the override
// already ends then
function tomorrowButton(src, climate, d, loc) {
  if (!isOffOverride(d)) return '';
  const planned = src.planned(climate) || {};
  const iso = planned.next_day_slot_end;
  const at = iso ? parseDate(iso) : null;
  const minute = (date) => Math.floor(date / 60000);
  // The next morning: hidden when it is the next slot's instant (one button then), or when the
  // override already ends then; named by its day when it is not tomorrow (a flat Sunday)
  if (!at || minute(at) === minute(parseDate(d.end))) return '';
  if (planned.next_slot_end && minute(at) === minute(parseDate(planned.next_slot_end))) return '';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = loc.time(minutesOf(at));
  const label = at.toDateString() === tomorrow.toDateString() ? loc.t('untilTomorrow', { time }) : loc.t('untilDay', { day: dayText(at, loc), time });
  return `<button class="btn" data-act="override-tomorrow" data-at="${esc(iso)}">${esc(label)}</button>`;
}
// The override `d` ended at the instant on the button, no longer "at the next slot"
const endedAt = (d, at) => { const { ends_at: _, ...rest } = d; return { ...rest, end: at }; };

// What the schedule does now, until when, and what comes next: "Eco until 17:30, then Comfort"
// (`plan` computed by the integration, like the schedule sensor: the next different preset, maybe
// on another day); '' without one. On an air conditioner: "Cool · Comfort until 23:00, then
// Heat · Eco"
export function planText(plan, presetName, loc, named = false) {
  // A slot without a preset reads as its HVAC mode: "Off", "Fan only", "Dry" (#91). `named`: on
  // a thermostat that lists more than one "on" HVAC mode, a slot on a preset says it too
  const name = (mode, preset) => (NO_PRESET_MODES.includes(mode) ? modeName(loc, mode)
    : preset ? `${named && SETPOINT_MODES.includes(mode) ? `${modeName(loc, mode)} · ` : ''}${presetName(preset)}` : '');
  const current = plan ? name(plan.hvac_mode, plan.preset) : '';
  if (!current) return '';
  const start = plan.next_start ? parseDate(plan.next_start) : null;
  if (!start) return loc.t('allWeek', { current });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = start.toDateString() === tomorrow.toDateString() ? loc.t('tomorrow') : dayText(start, loc);
  const next = name(plan.next_hvac_mode, plan.next_preset);
  const values = { current, time: loc.time(minutesOf(start)), next };
  return start.toDateString() === new Date().toDateString() ? loc.t('untilThen', values) : loc.t('untilDayThen', { ...values, day });
}

export const OVERRIDE_TEMPERATURE = 'input[data-override-temperature]';

// Draws a card's content into its <ha-card>, kept from one redraw to the next: a new one (a Lit
// component, rendered asynchronously) has no height until it renders, so the page got shorter for
// a moment and scrolled back to the top
export function fillCard(root, style, html, cls = '') {
  let card = root.querySelector('ha-card');
  if (!card) {
    root.innerHTML = `<style>${style}</style><ha-card></ha-card>`;
    card = root.querySelector('ha-card');
  }
  card.className = cls;
  card.innerHTML = html;
  return card;
}

// The field focused in a shadow root if it matches `selector`, else null
export function focusedField(root, selector) {
  const el = root.activeElement;
  return el && el.matches && el.matches(selector) ? el : null;
}

// A field being typed in, again after a redraw: its text (if any) and the focus, again once
// ha-card (a Lit component rendered asynchronously) shows its content; before that, the field
// cannot take the focus
export function restoreTyped(root, selector, value) {
  const input = root.querySelector(selector);
  if (!input) return;
  if (value != null) input.value = value;
  input.focus();
  const card = root.querySelector('ha-card');
  if (card && card.updateComplete instanceof Promise) {
    card.updateComplete.then(() => { if (input.isConnected) input.focus(); });
  }
}

// A new override from now, for the override duration (an option of the integration)
function newOverride(src, target) {
  const start = new Date();
  return { target, start: start.toISOString(), end: new Date(start.getTime() + src.overrideDuration() * 60000).toISOString() };
}

// The end a new override will have, said before the first tap: "until 12:00 (2 h)"
function newOverrideEndText(src, climate, hass, loc) {
  // The end of the HVAC mode the override would take, and the end of Off when it differs: the
  // setting *Turned off* ends it at the next slot by default
  const d = newOverride(src, {});
  const minutes = Math.round((parseDate(d.end) - parseDate(d.start)) / 60000);
  const end = `${minutes < DAY_MIN ? roundDurationText(minutes, loc) : remainingText(minutes, loc)} (${loc.t('until')} ${whenText(parseDate(d.end), loc)})`;
  const off = offEndText(null, src, climate, hass, loc, d.end);
  return off ? `${end} · ${off}` : end;
}
// What Off tapped would end at, "Off: until 17:30", when Off would end at another time than
// `end`; '' when the thermostat cannot be turned off, when it is off already, or when Off
// would resume the schedule (an off slot)
function offEndText(d, src, climate, hass, loc, end) {
  const { modes } = hvacModesOf(hass, climate);
  if ((modes && !modes.includes('off')) || isOffOverride(d)) return '';
  const off = overrideOff(d, src, climate, hass);
  // Compared to the minute: the two ends are computed a few milliseconds apart
  if (!off || off === RESUME || Math.round(parseDate(off.end) / 60000) === Math.round(parseDate(end) / 60000)) return '';
  // On an override, the button of the next slot says its time just below: said in words
  if (d && off.ends_at === 'next_slot') return loc.t('offUntilNextSlot', { off: modeName(loc, 'off') });
  return loc.t('offUntil', { off: modeName(loc, 'off'), when: whenText(parseDate(off.end), loc) });
}

// What changes an override, in the card's popover and in the more-info block (#91), in this
// order: the HVAC mode, a preset or a temperature, then one block for its end. For a
// new override (no `d`): the end it will have, said before the first tap. `line` and
// `actions`: the classes of a line and of a row of buttons there; `endLoc`: the names the end
// is said with
export function overrideBodyHtml(d, src, climate, hass, loc, { step, line, actions, endLoc = loc }) {
  const value = overrideValueHtml(d, src, climate, (stateOf(hass, climate) || {}).attributes || {}, loc, hass);
  const temperature = value.temperature ? `<div class="${line}">${value.temperature}</div>` : '';
  if (!d) return `${value.modes}${value.presets}${temperature}<div class="end-new muted">${esc(newOverrideEndText(src, climate, hass, loc))}</div>`;
  // The end Off would give it, under the button Off: the row of HVAC modes, else the row of
  // presets that starts with Off
  const offText = offEndText(d, src, climate, hass, loc, d.end);
  const offEnd = offText ? `<div class="off-end muted">${esc(offText)}</div>` : '';
  const values = value.modes ? `${value.modes}${offEnd}${value.presets}${temperature}` : `${value.presets}${offEnd}${temperature}`;
  const add = (m, label) => `<button class="btn" data-act="override-add" data-min="${m}">${label}</button>`;
  return `${values}
    <div class="end-block">
      <div class="${line}">
        <label>${esc(loc.t('until'))} ${timeField(`data-override-end="${esc(climate)}" data-ends-at="${esc(d.end)}"`, minutesOf(parseDate(d.end)), loc, step)}</label>
        <span class="muted">${overrideEndHtml(src, climate, d, endLoc, hass)}</span>
      </div>
      <div class="${actions}">
        ${add(-30, '−30 min')}${add(30, '+30 min')}${add(60, '+1 h')}${add(120, '+2 h')}
        ${nextSlotButton(src, climate, d, loc)}
        ${tomorrowButton(src, climate, d, loc)}
      </div>
    </div>`;
}

// What a tap in that block makes of the override `d` (none yet without one): an override to
// send, RESUME, or undefined when there is nothing to change. A preset or an HVAC mode sets an
// override; what the schedule plans resumes it
export function nextOverride(act, ds, d, src, climate, hass) {
  if (act === 'override-preset') return overrideWithPreset(d, src, climate, ds.preset, hass) || undefined;
  if (act === 'override-off' || act === 'override-mode') {
    const changed = overrideWithMode(d, src, climate, act === 'override-off' ? 'off' : ds.mode, hass);
    return changed && changed !== d ? changed : undefined;
  }
  if (!d) return undefined;
  if (act === 'override-del') return RESUME;
  // The instant on the button: the one its label shows
  if (act === 'override-next-slot') return { ...d, end: ds.at, ends_at: 'next_slot' };
  return act === 'override-tomorrow' ? endedAt(d, ds.at) : undefined;
}

// The − and the + of an override's temperature: its field moves by a step, from the thermostat's
// setpoint when it is empty, and says it changed, as when a temperature is typed
export function stepOverrideTemperature(button, hass, climate, loc) {
  const field = button.closest('.pv-temp').querySelector('input');
  const typed = parseDecimal(field.value);
  const from = Number.isFinite(typed) ? typed : Number(((stateOf(hass, climate) || {}).attributes || {}).temperature ?? 20);
  field.value = loc.number(fitTemperature(hass, climate, from + Number(button.dataset.delta)));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

// The saved week of a thermostat in the active schedule, as parsed days (null without one)
export function activeWeek(src, climate) {
  const week = (src.weeks()[climate] || {})[src.activeSchedule()];
  return Array.isArray(week) ? [0, 1, 2, 3, 4, 5, 6].map((i) => parseDay(week[i])) : null;
}

// The slot running at `date`, in a week of parsed days
function slotAt(week, date) {
  const segs = (week && week[(date.getDay() + 6) % 7]) || [];
  const minute = date.getHours() * 60 + date.getMinutes();
  let slot = segs.length ? segs[0] : null;
  for (const s of segs) if (s.start <= minute) slot = s;
  return slot;
}

// The HVAC mode a new override takes (#91): the one of the slot planned now when it takes a
// setpoint; else the one the thermostat runs in; else the first one it lists. Null on a
// thermostat that only heats, as its slots say none (engine.slot_hvac_mode, slotModeOn): a
// heater, and a valve that lists heat and auto. A valve in auto takes its setpoint and keeps
// auto, during the override and after it. Heat tapped in the first row says heat
function defaultOverrideHvac(hass, src, climate) {
  const choices = setpointModesOf(hass, climate);
  if (!choices.some((mode) => mode !== 'heat')) return null;
  const planned = (src.planned(climate) || {}).hvac_mode;
  if (choices.includes(planned)) return planned;
  const st = hass.states[climate];
  return st && choices.includes(st.state) ? st.state : choices[0];
}
// The HVAC mode of the override `d` (or of a new one) on a thermostat, among those that take a
// setpoint: its own, else the default. On a heater, the one set by hand on it, if any
function overrideHvacOn(d, hass, src, climate) {
  const own = setpointHvac(d);
  const fallback = defaultOverrideHvac(hass, src, climate);
  if (!fallback) return own;
  return setpointModesOf(hass, climate).includes(own) ? own : fallback;
}
const withHvac = (target, mode) => { const { hvac_mode: _, ...value } = target; return mode ? { ...value, hvac_mode: mode } : value; };

// The override `d` set to a preset (what it means on this thermostat, and which preset it is),
// until the same end; a new override without `d`. On an air conditioner it carries its HVAC
// mode. An off or a fan-only override becomes "on": a person who taps a preset on an off
// thermostat expects it to heat (#91)
function overrideWithPreset(d, src, climate, preset, hass) {
  const meaning = src.targets(climate)[preset];
  if (!meaning) return null;
  const target = withHvac(meaning, overrideHvacOn(d, hass, src, climate));
  return { ...(turnedOn(d, src) || newOverride(src, target)), target, preset };
}
// The override `d` as the base of an "on" override. An off override ends as the setting
// *Turned off* says, often much later: turned on, it starts now and lasts the override
// duration, as a new override does
function turnedOn(d, src) {
  if (!isOffOverride(d)) return d;
  const { ends_at: _, start: _s, end: _e, ...rest } = d;
  return { ...rest, ...newOverride(src, {}) };
}

// The override `d` set to heat, cool or heat/cool (the first row), until the same end. It keeps
// its preset when the preset has a value for that HVAC mode, or the temperature typed by the
// user. Otherwise (no override yet, off, fan only, a preset without a value there): the preset
// planned now if it has one for that HVAC mode, else the first preset that has
function overrideWithHvac(d, src, climate, mode, hass) {
  const targets = src.targets(climate);
  const offers = (id) => !!id && !!targets[id] && presetModes(targets[id]).includes(mode);
  d = turnedOn(d, src);
  const target = (d && d.target) || {};
  if (d && offers(d.preset)) return { ...d, target: withHvac(targets[d.preset], mode) };
  if (d && !d.preset && mode !== 'heat_cool' && ('temperature' in target || 'preset_mode' in target)) return { ...d, target: withHvac(target, mode) };
  // Back from fan only, dry or auto (an override, or the slot running now): the setpoint the
  // thermostat shows, within its limits, as a thermostat turned back on keeps it (#112). These
  // HVAC modes send none, so it is the one it had before
  const setpoint = ((hass && stateOf(hass, climate)) || { attributes: {} }).attributes.temperature;
  const idle = (m) => m !== 'off' && NO_PRESET_MODES.includes(m);
  // Without an override, the slot planned now says it, not the state: a valve runs in auto on its
  // schedule
  if (typeof setpoint === 'number' && mode !== 'heat_cool' && idle(d ? target.hvac_mode : (src.planned(climate) || {}).hvac_mode)) {
    const next = withHvac({ temperature: fitTemperature(hass, climate, setpoint) }, mode);
    if (!d) return newOverride(src, next);
    const { preset: _p, ...rest } = d;
    return { ...rest, target: next };
  }
  const planned = (src.planned(climate) || {}).preset;
  const preset = offers(planned) ? planned : src.presets().map((l) => l.id).find(offers);
  const next = withHvac(preset ? targets[preset] : {}, mode);
  const { ends_at: _, preset: _p, ...base } = d || newOverride(src, next);
  return { ...base, target: next, ...(preset ? { preset } : {}) };
}

// Resuming the schedule, as the value of an override: Off tapped on an "on" override during an
// off slot ends the override, as setting a thermostat back to what its slot plans by hand does
export const RESUME = Symbol('resume');

// A new off override (#91): it ends as the setting *Turned off* says. Until the next
// slot, as the integration computes it (`next_slot_end`), a week later without one; for the
// override duration; or the sooner of both
function newOffOverride(src, climate) {
  const d = newOverride(src, { hvac_mode: 'off' });
  const setting = src.offOverrideEnd();
  const iso = (src.planned(climate) || {}).next_slot_end;
  if (setting === 'duration') return d;
  if (iso && (setting === 'next_slot' || parseDate(iso) <= parseDate(d.end))) return { ...d, end: iso, ends_at: 'next_slot' };
  return setting === 'next_slot' ? { ...d, end: new Date(parseDate(d.start).getTime() + 7 * DAY_MIN * 60000).toISOString() } : d;
}

// The override `d` turned off: off, and nothing else, until the end the setting *Turned off*
// gives from now, as a new off override (#91). An off override stays as it is. RESUME when the
// schedule plans off now
function overrideOff(d, src, climate, hass) {
  const planned = (src.planned(climate) || {}).hvac_mode === 'off';
  if (d && !isOffOverride(d) && planned) return RESUME;
  // No override, an off slot and a thermostat that is off: an override would change nothing
  if (!d && planned && hass && (hass.states[climate] || {}).state === 'off') return null;
  return isOffOverride(d) ? d : newOffOverride(src, climate);
}

// The override `d` set to an HVAC mode without a preset, until the same end: off (see
// overrideOff), or fan only, dry or auto and no setpoint; a new override without `d`. RESUME
// when the schedule plans that HVAC mode now. The HVAC mode the override already has changes
// nothing. Null: nothing to set
function overrideNoPreset(d, src, climate, mode, hass) {
  if (mode === 'off') return overrideOff(d, src, climate, hass);
  if (d && (src.planned(climate) || {}).hvac_mode === mode) return RESUME;
  if (d && d.target && d.target.hvac_mode === mode && !d.preset && !SETPOINT_KEYS.some((key) => key in d.target)) return d;
  const target = { hvac_mode: mode };
  d = turnedOn(d, src);
  if (!d) return newOverride(src, target);
  const { preset: _, ...rest } = d;
  return { ...rest, target };
}
// The override `d` set to an HVAC mode of the first row
const overrideWithMode = (d, src, climate, mode, hass) => (NO_PRESET_MODES.includes(mode)
  ? overrideNoPreset(d, src, climate, mode, hass) : overrideWithHvac(d, src, climate, mode, hass));
// The keys of a target that hold a setpoint
const SETPOINT_KEYS = ['temperature', 'preset_mode', 'cool_temperature', 'cool_preset_mode', 'target_temp_low', 'target_temp_high'];

// The override `d` set to a temperature (no longer a preset), until the same end; a new override
// without `d`. On an air conditioner it carries its HVAC mode: a
// cooling override cools. An off override becomes "on", as with a preset
export function overrideWithTemperature(d, src, climate, value, hass) {
  // Heat/cool takes a range: a single temperature heats, or cools on a thermostat that does not heat
  const on = overrideHvacOn(d, hass, src, climate);
  const mode = on === 'heat_cool' ? setpointModesOf(hass, climate)[0] : on;
  if (!d) return newOverride(src, withHvac({ temperature: value }, mode));
  const { preset, ...rest } = turnedOn(d, src);
  const kept = Object.fromEntries(Object.entries(d.target || {}).filter(([key]) => !SETPOINT_KEYS.includes(key)));
  return { ...rest, target: withHvac({ ...kept, temperature: value }, mode) };
}
// An override as it is sent: without the fan and the vanes (#91). They stay as the thermostat
// has them; a preset's value that sets them only does so in a slot
export function withoutAir(override) {
  if (!override || !override.target) return override;
  return { ...override, target: Object.fromEntries(Object.entries(override.target).filter(([key]) => !SETTING_ATTRS.includes(key))) };
}
