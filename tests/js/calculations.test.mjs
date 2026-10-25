// The card's calculation helpers: time slots, dates, overrides.
import './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  toMin, toHM, parseDate, parseDay, serializeDay, overridePieces, overrideLabel,
} from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

describe('times', () => {
  test('HH:MM ↔ minutes conversion', () => {
    assert.equal(toMin('06:30'), 390);
    assert.equal(toHM(390), '06:30');
    assert.equal(toHM(0), '00:00');
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
