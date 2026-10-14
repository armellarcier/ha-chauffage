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

// Minimum supported Home Assistant: hacs.json is the reference (see CONTRIBUTING.md, "Supported
// Home Assistant versions"); the tests, the CI and the READMEs say the same.
test('the minimum Home Assistant is the same in hacs.json, the tests, the CI and the READMEs', () => {
  const minimum = JSON.parse(read('hacs.json')).homeassistant; // 2026.9.0
  assert.match(minimum, /^\d{4}\.\d+\.\d+$/);
  const short = minimum.replace(/\.0$/, ''); // 2026.9
  assert.match(read('tests/integration/requirements-min.txt'), new RegExp(`# Home Assistant ${minimum}$`, 'm'));
  assert.match(read('.github/workflows/tests.yml'), new RegExp(`name: Integration, HA ${short}$`, 'm'));
  assert.match(read('README.md'), new RegExp(`Requires Home Assistant ${short} or later`));
  assert.match(read('README.fr.md'), new RegExp(`Nécessite Home Assistant ${short} ou plus récent`));
});
