// Registration of the card's custom elements while Home Assistant's frontend boots.
// Own file: it loads the card itself, in its own process, to control the order of events.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// HA's frontend replaces `customElements` with a scoped custom element registry polyfill,
// which only knows the elements defined in it (issue #2).
class ScopedRegistry {
  constructor() { this.elements = new Map(); }
  get(tag) { return this.elements.get(tag); }
  define(tag, cls) {
    if (this.elements.has(tag)) throw new Error(`${tag} already defined`);
    this.elements.set(tag, cls);
  }
  whenDefined() { return new Promise(() => {}); }
}

test('the card loaded before the frontend replaces the registry is registered again in the new one', async () => {
  const native = customElements;
  await import('../../custom_components/chauffage/frontend/chauffage-programme-card.js');
  assert.ok(native.get('chauffage-programme-card'));

  // The frontend boots: the polyfill replaces the registry, then HA defines its own elements
  const scoped = new ScopedRegistry();
  globalThis.customElements = scoped;
  native.define('home-assistant', class extends HTMLElement {});
  await new Promise((resolve) => setTimeout(resolve));

  assert.equal(scoped.get('chauffage-programme-card'), native.get('chauffage-programme-card'));
  assert.equal(scoped.get('chauffage-moreinfo'), native.get('chauffage-moreinfo'));
  assert.equal(scoped.get('chauffage-programme-card-editor'), native.get('chauffage-programme-card-editor'));
  globalThis.customElements = native;
});
