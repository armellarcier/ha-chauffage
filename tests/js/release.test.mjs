// The release version is the same everywhere (see CONTRIBUTING.md, "Releasing").
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../../www/chauffage-programme-card.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('card, package.json, HA package and CHANGELOG have the same version', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read('package.json')).version, VERSION);
  assert.ok(read('packages/chauffage/chauffage.yaml').includes(`ha-chauffage ${VERSION} `), 'packages/chauffage/chauffage.yaml header');
  // Latest released entry of the changelog (the "Unreleased" section has no number)
  const [, latest] = read('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+)\]/m) || [];
  assert.equal(latest, VERSION);
});
