// The integration serves the card as one file, which esbuild bundles from frontend/src
// (scripts/build.mjs). The other tests run on the sources; this one loads the bundle.
// Own file: the bundle defines the elements, so no other card may be loaded before it.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { options } from '../../scripts/build.mjs';

const manifest = JSON.parse(readFileSync(new URL('../../custom_components/chauffage/manifest.json', import.meta.url), 'utf8'));

test('the bundle defines the cards, with the version of the integration', async () => {
  const { outputFiles } = await esbuild.build({ ...options, write: false, logLevel: 'silent' });
  assert.equal(outputFiles.length, 1, 'one file, with no chunk to load beside it');
  assert.match(outputFiles[0].path.replace(/\\/g, '/'), /custom_components\/chauffage\/frontend\/chauffage-programme-card\.js$/);
  const file = join(mkdtempSync(join(tmpdir(), 'chauffage-bundle-')), 'chauffage-programme-card.js');
  writeFileSync(file, outputFiles[0].text);
  await import(pathToFileURL(file).href);
  for (const name of ['chauffage-programme-card', 'chauffage-thermostat-card', 'chauffage-rooms-card', 'chauffage-summary-card', 'chauffage-panel', 'chauffage-moreinfo']) {
    assert.ok(customElements.get(name), name);
  }
  assert.equal(customElements.get('chauffage-programme-card').version, manifest.version);
});
