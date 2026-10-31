// The card's calculation helpers: time slots, dates, overrides.
import './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  toMin, toHM, parseDate, parseDay, serializeDay, overridePieces, overrideLabel, parseTime,
} from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

describe('times', () => {
  test('HH:MM ↔ minutes conversion', () => {
    assert.equal(toMin('06:30'), 390);
    assert.equal(toHM(390), '06:30');
    assert.equal(toHM(0), '00:00');
  });
});

// A time typed in a time field (#63): { h, m, pm }, pm null when neither AM nor PM is typed
describe('parseTime: a time typed by hand', () => {
  const read = (text, periods) => {
    const t = parseTime(text, periods);
    return t && [t.h, t.m, t.pm];
  };

  test('digits, with or without a separator', () => {
    for (const [text, expected] of [
      ['1225', [12, 25, null]], ['12:25', [12, 25, null]], ['12.25', [12, 25, null]], ['12h25', [12, 25, null]],
      ['12 h 25', [12, 25, null]], ['730', [7, 30, null]], ['0730', [7, 30, null]], ['7', [7, 0, null]],
      ['19', [19, 0, null]], ['19h', [19, 0, null]], ['0', [0, 0, null]], [' 07:05 ', [7, 5, null]],
    ]) assert.deepEqual(read(text), expected, text);
  });

  test('AM or PM, in any case, before or after, with or without dots', () => {
    for (const [text, expected] of [
      ['7p', [7, 0, true]], ['7 pm', [7, 0, true]], ['7:30 PM', [7, 30, true]], ['730p.m.', [7, 30, true]],
      ['7:30 AM', [7, 30, false]], ['12am', [12, 0, false]], ['1225a', [12, 25, false]],
    ]) assert.deepEqual(read(text), expected, text);
  });

  test('the words of the user\'s language for AM and PM', () => {
    assert.deepEqual(read('7:30 p. m.', ['a. m.', 'p. m.']), [7, 30, true]); // Spanish
    assert.deepEqual(read('午後7:30', ['午前', '午後']), [7, 30, true]); // Japanese, before the time
  });

  test('not a time', () => {
    for (const text of ['', 'abc', '25', '2400', '12:60', '7:5', '12345', '13pm', '0am', '7x', ':30', '12::30']) {
      assert.equal(parseTime(text), null, text);
    }
  });
});

describe('parseDay: reading a day of "HH:MM preset" slots', () => {
  test('round-trips with serializeDay', () => {
    const day = ['00:00 eco', '06:30 comfort', '08:30 eco'];
    assert.deepEqual(serializeDay(parseDay(day)), day);
  });

  test('slots are sorted', () => {
    assert.deepEqual(serializeDay(parseDay(['08:30 eco', '00:00 eco', '06:30 comfort'])), ['00:00 eco', '06:30 comfort', '08:30 eco']);
  });

  test('two consecutive identical slots are merged', () => {
    assert.deepEqual(serializeDay(parseDay(['00:00 eco', '06:00 eco', '07:00 comfort'])), ['00:00 eco', '07:00 comfort']);
  });

  test('the first slot always starts at 00:00', () => {
    assert.deepEqual(serializeDay(parseDay(['06:00 comfort', '22:00 eco'])), ['00:00 comfort', '22:00 eco']);
  });

  test('duplicate start time: the last one wins', () => {
    assert.deepEqual(serializeDay(parseDay(['00:00 eco', '07:00 comfort', '07:00 boost'])), ['00:00 eco', '07:00 boost']);
  });

  test('missing or unreadable day: eco all day', () => {
    assert.deepEqual(serializeDay(parseDay(undefined)), ['00:00 eco']);
    assert.deepEqual(serializeDay(parseDay(['garbage'])), ['00:00 eco']);
  });
});

describe('parseDate', () => {
  test('accepts HA microseconds (natively rejected by Safari)', () => {
    const d = parseDate('2026-10-12T14:03:12.123456+02:00');
    assert.equal(d.toISOString(), '2026-10-12T12:03:12.123Z');
  });
});

describe('overrides', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T21:00:00+02:00') }));
  afterEach(() => mock.timers.reset());

  const override = (start, end, extra = {}) => ({ kind: 'temperature', value: 21, start, end, ...extra });

  test('an override past midnight is split over two days', () => {
    const pieces = overridePieces(override('2026-10-12T20:00:00+02:00', '2026-10-13T02:00:00+02:00'));
    assert.deepEqual(pieces.map(({ day, start, end, isLast }) => ({ day, start, end, isLast })), [
      { day: 0, start: 20 * 60, end: 24 * 60, isLast: false }, // Monday
      { day: 1, start: 0, end: 2 * 60, isLast: true }, // Tuesday
    ]);
  });

  const pieceTimes = (pieces) => pieces.map(({ day, start, end }) => ({ day, start, end }));

  test('on the day the clocks go back, an override is placed at its time of day (#43)', () => {
    mock.timers.setTime(new Date('2026-10-25T10:43:00+01:00').getTime()); // Sunday, 25 hours long
    const pieces = overridePieces(override('2026-10-25T10:43:00+01:00', '2026-10-25T13:00:00+01:00'));
    assert.deepEqual(pieceTimes(pieces), [{ day: 6, start: 10 * 60 + 43, end: 13 * 60 }]);
  });

  test('an override ending in the hour played twice is drawn from its start for its length', () => {
    mock.timers.setTime(new Date('2026-10-25T02:45:00+02:00').getTime());
    const pieces = overridePieces(override('2026-10-25T02:45:00+02:00', '2026-10-25T02:15:00+01:00'));
    assert.deepEqual(pieceTimes(pieces), [{ day: 6, start: 2 * 60 + 45, end: 3 * 60 + 15 }]);
  });

  test('on the day the clocks go forward, an override is placed at its time of day', () => {
    mock.timers.setTime(new Date('2026-03-29T10:00:00+02:00').getTime()); // Sunday, 23 hours long
    const pieces = overridePieces(override('2026-03-29T10:00:00+02:00', '2026-03-30T01:00:00+02:00'));
    assert.deepEqual(pieceTimes(pieces), [
      { day: 6, start: 10 * 60, end: 24 * 60 },
      { day: 0, start: 0, end: 60 },
    ]);
  });

  test('label: temperature or preset name', () => {
    assert.equal(overrideLabel(override('', '', { value: 21.5 })), '21.5 °C');
    assert.equal(overrideLabel({ kind: 'preset', value: 'boost' }), 'Boost');
    assert.equal(overrideLabel({ kind: 'preset', value: 'unknown' }), 'unknown');
  });
});
