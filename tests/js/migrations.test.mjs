// Stored data versions and migrations (see CONTRIBUTING.md, "Data versions and migrations").
import { fakeHass, createCard, cleanup } from './helpers.mjs';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  DATA_VERSION, MIGRATIONS, DataVersionError, migrateSchedules, readSchedules, saveMigratedSchedules,
} from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const fixture = (v) => new URL(`../fixtures/schedules-v${v}.json`, import.meta.url);
const load = (v) => JSON.parse(readFileSync(fixture(v), 'utf8'));
const sensor = (programmes, version) => ({ state: 'x', last_updated: '1', attributes: { programmes, ...(version ? { version } : {}) } });
const CFG = { sensor: 'sensor.programmes_chauffage', event: 'chauffage_programmes_set' };

// Fake format changes for the framework tests: v1 → v2 nests the modes, v2 → v3 adds a mode
const FAKE = {
  1: (data) => Object.fromEntries(Object.entries(data).map(([c, modes]) => [c, { modes }])),
  2: (data) => Object.fromEntries(Object.entries(data).map(([c, v]) => [c, { modes: { ...v.modes, Away: v.modes.Absent } }])),
};

describe('migrations shipped with the card', () => {
  test('every data version has a fixture and a migration to the next one', () => {
    for (let v = 1; v <= DATA_VERSION; v++) assert.ok(existsSync(fixture(v)), `tests/fixtures/schedules-v${v}.json`);
    for (let v = 1; v < DATA_VERSION; v++) assert.equal(typeof MIGRATIONS[v], 'function', `MIGRATIONS[${v}]`);
  });

  test('every fixture migrates to the current one (same schedules, current format)', () => {
    const current = load(DATA_VERSION).programmes;
    for (let v = 1; v <= DATA_VERSION; v++) {
      const { version, programmes } = load(v);
      assert.equal(version, v);
      assert.deepEqual(migrateSchedules(programmes, v), current, `from version ${v}`);
    }
  });

  test('migrating twice changes nothing', () => {
    for (let v = 1; v <= DATA_VERSION; v++) {
      const once = migrateSchedules(load(v).programmes, v);
      assert.deepEqual(migrateSchedules(once, DATA_VERSION), once);
    }
  });

  test('data saved without a version (before v0.1.0) is version 1', () => {
    const { programmes } = load(1);
    assert.deepEqual(readSchedules(sensor(programmes)), migrateSchedules(programmes, 1));
  });
});

describe('migration framework', () => {
  const data = { 'climate.salon': { Absent: [['00:00 eco']] } };

  test('steps run in order, from the stored version to the target', () => {
    assert.deepEqual(migrateSchedules(data, 1, { target: 3, migrations: FAKE }),
      { 'climate.salon': { modes: { Absent: [['00:00 eco']], Away: [['00:00 eco']] } } });
    const v2 = { 'climate.salon': { modes: {} } };
    assert.deepEqual(migrateSchedules(v2, 2, { target: 2, migrations: FAKE }), v2);
  });

  test('the stored data is not modified', () => {
    const before = JSON.stringify(data);
    migrateSchedules(data, 1, { target: 3, migrations: FAKE });
    assert.equal(JSON.stringify(data), before);
  });

  test('a missing step is an error', () => {
    assert.throws(() => migrateSchedules(data, 1, { target: 4, migrations: FAKE }), /No migration from data version 3/);
  });

  test('data from a newer version is refused (no downgrade)', () => {
    assert.throws(() => migrateSchedules(data, 3, { target: 2, migrations: FAKE }), DataVersionError);
  });
});

describe('saving migrated data', () => {
  const programmes = { 'climate.salon': { Absent: [['00:00 eco']] } };
  const hassWith = (st, user) => ({ ...fakeHass(), ...(user ? { user } : {}), states: { [CFG.sensor]: st } });

  test('old data is saved in the new format, with the previous data kept', async () => {
    const hass = hassWith(sensor(programmes, 1));
    assert.equal(await saveMigratedSchedules(hass, CFG, { target: 3, migrations: FAKE }), true);
    const [msg] = hass.events;
    assert.equal(msg.event_type, 'chauffage_programmes_set');
    assert.equal(msg.event_data.version, 3);
    assert.deepEqual(msg.event_data.programmes, migrateSchedules(programmes, 1, { target: 3, migrations: FAKE }));
    assert.deepEqual(msg.event_data.previous, { version: 1, programmes });
  });

  test('nothing is sent when the data is up to date', async () => {
    const hass = hassWith(sensor(programmes, 3));
    assert.equal(await saveMigratedSchedules(hass, CFG, { target: 3, migrations: FAKE }), false);
    assert.equal(hass.events.length, 0);
  });

  test('non-admin users do not migrate (they cannot fire events)', async () => {
    const hass = hassWith(sensor(programmes, 1), { is_admin: false });
    assert.equal(await saveMigratedSchedules(hass, CFG, { target: 3, migrations: FAKE }), false);
    assert.equal(hass.events.length, 0);
  });
});

describe('the card and data versions', () => {
  afterEach(() => cleanup());

  test('saving sends the current data version', async () => {
    const card = createCard(fakeHass());
    card._dirty = true;
    await card._save();
    assert.equal(card._hass.events.at(-1).event_data.version, DATA_VERSION);
  });

  test('data from a newer version is shown as an error, not editable', async () => {
    const hass = fakeHass();
    hass.states['sensor.programmes_chauffage'].attributes.version = DATA_VERSION + 1;
    const card = createCard(hass);
    assert.match(card.shadowRoot.textContent, /plus récente de ha-chauffage/);
    assert.equal(card.shadowRoot.querySelector('[data-act="save"]'), null);
    card._dirty = true;
    await card._save();
    assert.equal(hass.events.length, 0);
  });

  test('the more-info block is hidden for data from a newer version', () => {
    const hass = fakeHass();
    hass.states['sensor.programmes_chauffage'].attributes.version = DATA_VERSION + 1;
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    assert.equal(el.style.display, 'none');
  });
});
