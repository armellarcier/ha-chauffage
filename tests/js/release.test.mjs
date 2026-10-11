// The release version is the same everywhere (see CONTRIBUTING.md, "Releasing").
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('card, package.json, integration and CHANGELOG have the same version', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+(-[\w.]+)?$/); // pre-releases: 0.2.0-beta.1
  assert.equal(JSON.parse(read('package.json')).version, VERSION);
  assert.equal(JSON.parse(read('custom_components/chauffage/manifest.json')).version, VERSION);
  // Latest released entry of the changelog (the "Unreleased" section has no number)
  const [, latest] = read('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+(?:-[\w.]+)?)\]/m) || [];
  assert.equal(latest, VERSION);
});
