// Measured temperature of the last 7 days, drawn over each day of the week.
import { fakeHass, createCard, cleanup } from './helpers.mjs';
import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { historyDays, rowsOfStates } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

// Monday 12 October 2026, 10:00 (Paris): Monday is "today", Sunday is yesterday, Tuesday was 6 days ago
const NOW = new Date('2026-10-12T10:00:00+02:00');
const at = (iso) => new Date(iso).getTime() / 1000;
// A row of `chauffage/history`: [time (s), measured, target]
const row = (iso, current, target) => [at(iso), current, target];

const HISTORY = {
  'climate.salon': [
    row('2026-10-11T23:00:00+02:00', 18, 17), // Sunday evening, carried over to Monday 00:00
    row('2026-10-12T06:30:00+02:00', 18.2, 20),
    row('2026-10-12T08:00:00+02:00', 19.6, 20),
  ],
  'climate.bureau': [],
};

/**
 * Answers `chauffage/history` with `history` (or rejects with it, an Error), and records the
 * commands. `old`: an integration without the command (updated, HA not restarted): HA's own
 * history answers, in its compressed format.
 */
function historyHass(history = HISTORY, { old = false } = {}) {
  return fakeHass({
    reply: (msg) => {
      if (msg.type === 'chauffage/history') {
        if (old) return Promise.reject({ code: 'unknown_command', message: 'Unknown command.' });
        return history instanceof Error ? Promise.reject(history) : history;
      }
      if (msg.type === 'history/history_during_period') return history;
      return null;
    },
  });
}
const flush = () => new Promise((r) => setImmediate(r));
const historyCalls = (hass) => hass.events.filter((e) => e.type === 'chauffage/history');
const toggle = (card) => card.shadowRoot.querySelector('[data-act="history"]');
// The bar of a day, when it shows a history (null otherwise)
const curve = (card, climate, day) => {
  const bar = card.shadowRoot.querySelector(`.bar[data-climate="${climate}"][data-day="${day}"]`);
  return bar && bar.querySelector('.history') ? bar : null;
};

afterEach(() => { mock.timers.reset(); cleanup(); });
beforeEach(() => mock.timers.enable({ apis: ['Date'], now: NOW }));

describe('history of the measured temperature', () => {
  test('each weekday gets its last occurrence, carried over from the day before', () => {
    const days = historyDays(HISTORY, NOW)['climate.salon'];
    // Monday = today, until now (10:00)
    assert.deepEqual(days[0].current, [[[0, 18], [390, 18.2], [480, 19.6], [600, 19.6]]]);
    assert.deepEqual(days[0].target, [[[0, 17], [390, 20], [600, 20]]]);
    // Sunday = yesterday: from 23:00 to midnight
    assert.deepEqual(days[6].current, [[[1380, 18], [1440, 18]]]);
    // Tuesday (6 days ago): nothing recorded
    assert.deepEqual(days[1].current, []);
  });

  test('an unavailable thermostat breaks the curve', () => {
    const days = historyDays({
      'climate.salon': [
        row('2026-10-12T01:00:00+02:00', 18, 17),
        row('2026-10-12T02:00:00+02:00', null, null),
        row('2026-10-12T03:00:00+02:00', 17.5, 17),
      ],
    }, NOW)['climate.salon'];
    assert.deepEqual(days[0].current, [[[60, 18], [120, 18]], [[180, 17.5], [600, 17.5]]]);
  });

  test("HA's own history is read the same way", () => {
    const state = (iso, current, target) => ({ s: 'heat', a: { current_temperature: current, temperature: target }, lu: at(iso) });
    assert.deepEqual(rowsOfStates({
      'climate.salon': [
        state('2026-10-12T01:00:00+02:00', 18, 17),
        // Only an attribute changed: `lu` is the time, `lc` (sent when different) the last change of the state
        { ...state('2026-10-12T01:30:00+02:00', 18.5, 17), lc: at('2026-10-12T01:00:00+02:00') },
        { s: 'unavailable', a: {}, lu: at('2026-10-12T02:00:00+02:00') },
      ],
    }), {
      'climate.salon': [row('2026-10-12T01:00:00+02:00', 18, 17), row('2026-10-12T01:30:00+02:00', 18.5, 17), row('2026-10-12T02:00:00+02:00', null, null)],
    });
  });

  test('hidden by default: no history is loaded', async () => {
    const hass = historyHass();
    const card = createCard(hass);
    await flush();
    assert.equal(historyCalls(hass).length, 0);
    assert.equal(curve(card, 'climate.salon', 0), null);
    assert.equal(toggle(card).classList.contains('on'), false);
  });

  test('the History button loads the last 7 days of every thermostat from the integration and draws them', async () => {
    const hass = historyHass();
    const card = createCard(hass);
    toggle(card).click();
    // Loading: the button says so
    assert.ok(toggle(card).classList.contains('loading'));
    await flush();
    const [call] = historyCalls(hass);
    assert.deepEqual(call.entity_ids, ['climate.salon', 'climate.bureau']);
    assert.equal(new Date(call.start_time).getTime(), new Date('2026-10-06T00:00:00+02:00').getTime());
    assert.equal(toggle(card).classList.contains('loading'), false);
    assert.ok(toggle(card).classList.contains('on'));
    const bar = curve(card, 'climate.salon', 0);
    assert.ok(bar.querySelector('path.measured').getAttribute('d').startsWith('M0 '));
    // A shadow under the measured temperature, no outline (no grey inside the curve)
    assert.equal(bar.querySelector('.halo'), null);
    // The setpoint applied is drawn over the measured temperature, and over the slots' handles
    const [measured, setpoint] = bar.querySelectorAll('svg.history');
    assert.ok(measured.querySelector('path.measured') && setpoint.querySelector('path.target'));
    assert.equal(measured.nextElementSibling, setpoint);
    assert.equal(measured.previousElementSibling.classList.contains('handle'), true);
    // A thin line without outline (the measured temperature stays visible under it)
    assert.equal(bar.querySelectorAll('path[d="' + bar.querySelector('path.target').getAttribute('d') + '"]').length, 1);
    // The slots keep their look (no veil over them)
    assert.equal(bar.className, 'bar');
    // A day without data has no curve
    assert.equal(curve(card, 'climate.salon', 1), null);
  });

  test('the measured range of a slot is in its tooltip', async () => {
    const card = createCard(historyHass());
    toggle(card).click();
    await flush();
    // Monday 06:30 → 08:30, Comfort: 18.2 then 19.6, setpoint 20
    const seg = card.shadowRoot.querySelector('.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]');
    assert.match(seg.title, /mesuré 18,2–19,6° · consigne 20°/);
  });

  test('the measured range of a slot is in its popover too: a phone shows no tooltip', async () => {
    const card = createCard(historyHass());
    toggle(card).click();
    await flush();
    card.shadowRoot.querySelector('.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click();
    assert.equal(card.shadowRoot.querySelector('.editor .ed-measured').textContent, 'mesuré 18,2–19,6° · consigne 20°');
    // Without the history, the popover says nothing about it
    toggle(card).click();
    await flush();
    card.shadowRoot.querySelector('.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="1"]').click();
    assert.equal(card.shadowRoot.querySelector('.editor .ed-measured'), null);
  });

  test('the measured temperature is a smooth line, flat until 15 minutes before a change after a long steady time', async () => {
    const card = createCard(historyHass());
    toggle(card).click();
    await flush();
    // Monday: 18 since Sunday, 18.2 at 06:30, 19.6 at 08:00 (scale 17 → 20 with the setpoints)
    const d = curve(card, 'climate.salon', 0).querySelector('path.measured').getAttribute('d');
    assert.equal(d, 'M0 63.3 L375 63.3 L390 58.0 L465 58.0 L480 20.7 L600 20.7');
  });

  test('a setpoint a few degrees above the measured temperature stays in the scale', async () => {
    // Measured 18 → 19, setpoint 21: the scale goes up to 21 (no clamping on the edge)
    const card = createCard(historyHass({ 'climate.salon': [row('2026-10-12T00:00:00+02:00', 18, 21), row('2026-10-12T06:00:00+02:00', 19, 21)] }));
    toggle(card).click();
    await flush();
    const d = curve(card, 'climate.salon', 0).querySelector('path.target').getAttribute('d');
    assert.equal(d, 'M0 10.0 H600');
  });

  test('a setpoint far below the measured temperature stays on the bottom edge', async () => {
    const card = createCard(historyHass({ 'climate.salon': [row('2026-10-12T00:00:00+02:00', 18, 7), row('2026-10-12T06:00:00+02:00', 19, 7)] }));
    toggle(card).click();
    await flush();
    const d = curve(card, 'climate.salon', 0).querySelector('path.target').getAttribute('d');
    assert.equal(d, 'M0 97.0 H600');
  });

  test('the choice is kept for the next visit', async () => {
    const card = createCard(historyHass());
    toggle(card).click();
    await flush();
    card.remove();
    const hass = historyHass();
    const again = createCard(hass);
    await flush();
    assert.equal(historyCalls(hass).length, 1);
    assert.ok(curve(again, 'climate.salon', 0));
  });

  test('clicking again hides the curves', async () => {
    const card = createCard(historyHass());
    toggle(card).click();
    await flush();
    toggle(card).click();
    assert.equal(curve(card, 'climate.salon', 0), null);
  });

  test('history unavailable (recorder off): says so', async () => {
    const card = createCard(historyHass(new Error('The recorder is not set up: no history')));
    toggle(card).click();
    await flush();
    assert.match(card.shadowRoot.querySelector('.msg').textContent, /Historique indisponible : The recorder is not set up/);
  });

  test("integration updated but HA not restarted yet: HA's own history is used", async () => {
    const compressed = { 'climate.salon': [{ s: 'heat', a: { current_temperature: 18, temperature: 17 }, lu: at('2026-10-11T23:00:00+02:00') }] };
    const hass = historyHass(compressed, { old: true });
    const card = createCard(hass);
    toggle(card).click();
    await flush();
    await flush();
    const call = hass.events.find((e) => e.type === 'history/history_during_period');
    assert.equal(call.no_attributes, false);
    assert.ok(curve(card, 'climate.salon', 0));
  });

  test('after 5 minutes, only what is new is loaded, and added to the curves', async () => {
    const hass = historyHass();
    const card = createCard(hass);
    toggle(card).click();
    await flush();
    card._refreshHistory();
    assert.equal(historyCalls(hass).length, 1);
    mock.timers.setTime(NOW.getTime() + 6 * 60000);
    // The integration answers from the start asked, the state at that time first
    hass.events.length = 0;
    const later = { 'climate.salon': [row('2026-10-12T09:59:00+02:00', 19.6, 20), row('2026-10-12T10:05:00+02:00', 20.1, 20)], 'climate.bureau': [] };
    const reply = (msg) => (msg.type === 'chauffage/history' ? later : null);
    card._hass = { ...hass, callWS: async (msg) => { hass.events.push(msg); return reply(msg); } };
    card._refreshHistory();
    await flush();
    const [call] = historyCalls(hass);
    assert.equal(new Date(call.start_time).getTime(), new Date('2026-10-12T09:59:00+02:00').getTime());
    assert.deepEqual(card._history.days['climate.salon'][0].current, [[[0, 18], [390, 18.2], [480, 19.6], [605, 20.1], [606, 20.1]]]);
  });
});

describe('a day shown larger', () => {
  const zoomed = (card) => card.shadowRoot.querySelector('.bar.zoom');
  const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 180, height: 180 }); return el; };
  const pointer = (el, type, clientX, pointerType = 'mouse') => {
    const e = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX });
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    el.dispatchEvent(e);
  };
  async function open(config) {
    const card = createCard(historyHass(), config);
    toggle(card).click();
    await flush();
    card._openMenu('climate.salon', 0, 0, 0);
    card.shadowRoot.querySelector('.menu [data-act="zoom"]').click();
    return card;
  }

  test("a row's menu shows its day larger, with a scale in degrees set by that day", async () => {
    const card = await open();
    const bar = zoomed(card);
    assert.equal(bar.dataset.climate, 'climate.salon');
    assert.equal(bar.dataset.day, '0');
    // Only that row: the other thermostat of the day stays small
    assert.equal(card.shadowRoot.querySelectorAll('.bar.zoom').length, 1);
    // Monday: measured 18 → 19.6, setpoints 17 and 20
    assert.deepEqual([...bar.querySelectorAll('.yaxis span')].map((s) => s.textContent), ['17°', '18°', '19°', '20°']);
  });

  test('the menu shows it smaller again', async () => {
    const card = await open();
    card._openMenu('climate.salon', 0, 0, 0);
    const item = card.shadowRoot.querySelector('.menu [data-act="zoom"]');
    assert.match(item.textContent, /Réduire/);
    item.click();
    assert.equal(zoomed(card), null);
  });

  test('the mouse over it reads the time, the measured temperature and the setpoint', async () => {
    const card = await open();
    const bar = geometry(zoomed(card));
    pointer(bar, 'pointermove', 7 * 60); // 07:00
    assert.equal(bar.querySelector('.readout').textContent, '07:00 · 18,2° · consigne 20°');
    pointer(bar, 'pointerleave', 0);
    assert.equal(bar.querySelector('.readout').hidden, true);
  });

  test('on a phone, sliding a finger along it reads the values; a tap still selects the slot', async () => {
    const card = await open();
    const bar = geometry(zoomed(card));
    pointer(bar, 'pointermove', 7 * 60, 'touch'); // no finger down: nothing
    assert.equal(bar.querySelector('.readout').hidden, true);
    pointer(bar, 'pointerdown', 7 * 60, 'touch');
    pointer(bar, 'pointermove', 9 * 60, 'touch');
    assert.equal(bar.querySelector('.readout').textContent, '09:00 · 19,6° · consigne 20°');
    pointer(bar, 'pointerup', 9 * 60, 'touch');
    // A tap (no slide) still selects the slot
    bar.querySelector('.seg[data-idx="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: 7 * 60 }));
    assert.deepEqual(card._sel, { climate: 'climate.salon', day: 0, idx: 1 });
    // The bar slides with the finger instead of scrolling the page sideways
    assert.match(card.shadowRoot.querySelector('style').textContent, /\.bar\.zoom \{[^}]*touch-action:pan-y/);
  });

  test('with one thermostat shown, clicking the name of the day shows it larger', async () => {
    const card = createCard(historyHass(), { show: ['climate.salon'] });
    toggle(card).click();
    await flush();
    card.shadowRoot.querySelector('.dgroup .day[data-day="0"]').click();
    assert.equal(zoomed(card).dataset.day, '0');
    card.shadowRoot.querySelector('.dgroup .day[data-day="0"]').click();
    assert.equal(zoomed(card), null);
  });

  test('hiding the history shows the day small again', async () => {
    const card = await open();
    toggle(card).click();
    assert.equal(zoomed(card), null);
  });
});
