// The card loader, saved by the integration as a dashboard resource (issue #59): it loads the card
// on a page that Home Assistant served before Chauffage was set up.
// Own file: it runs the loader with a fake fetch and fake timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LOADER = readFileSync(
  new URL('../../custom_components/chauffage/frontend/card-loader.js', import.meta.url), 'utf8');

// Runs the loader until it imports the card or stops; `served(attempt)` says whether Chauffage
// serves the card at that attempt (false: 404, null: Home Assistant is down)
async function run(served, { defined = false } = {}) {
  const requests = [];
  const delays = [];
  globalThis.location = { origin: 'http://ha.local:8123' };
  globalThis.customElements = { get: () => defined };
  globalThis.fetch = async (url) => {
    const answer = served(requests.length);
    requests.push(url);
    if (answer === null) throw new TypeError('Failed to fetch');
    return { ok: answer };
  };
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (resolve, delay) => { delays.push(delay); resolve(); };
  globalThis.cardImported = 0;
  // The card: a module that counts its imports
  const card = `data:text/javascript,globalThis.cardImported++;//${Math.random()}`;
  const code = LOADER.replaceAll('CARD_URL', card);
  try {
    await import(`data:text/javascript,${encodeURIComponent(code)}`);
    for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  return { requests, delays, imported: globalThis.cardImported };
}

test('the loader loads the card once Chauffage serves it, however long Home Assistant takes to start', async () => {
  // Down, then up without Chauffage for longer than 300 attempts
  const { requests, delays, imported } = await run((attempt) => (attempt < 5 ? null : attempt >= 400));
  assert.equal(imported, 1);
  assert.equal(requests.length, 401);
  assert.ok(delays.every((delay) => delay <= 30000), 'never waits more than 30 s');
  assert.ok(delays.at(-1) > delays[0], 'waits longer and longer');
});

test('the loader does nothing when the page already loaded the card', async () => {
  const { requests, imported } = await run(() => true, { defined: true });
  assert.equal(requests.length, 0);
  assert.equal(imported, 0);
});
