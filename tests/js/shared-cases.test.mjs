// The rules the card shares with the integration, on the cases of tests/shared/cases.json.
// tests/integration/test_shared_cases.py runs the same cases on the integration.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './helpers.mjs';
import { fitTemperature, parseDay, slotToArray } from '../../frontend/src/index.ts';

const CASES = JSON.parse(readFileSync(new URL('../shared/cases.json', import.meta.url), 'utf8'));

describe('a temperature is fitted to the thermostat', () => {
  for (const { name, attributes, value, expected } of CASES.fit_temperature.cases) {
    test(name, () => {
      const hass = { states: { 'climate.salon': { state: 'heat', attributes } } };
      assert.equal(fitTemperature(hass, 'climate.salon', value), expected);
    });
  }
});

describe('a day is stored in order', () => {
  for (const { name, slots, expected } of CASES.normalize_day.cases) {
    test(name, () => assert.deepEqual(parseDay(slots).map(slotToArray), expected));
  }
});
