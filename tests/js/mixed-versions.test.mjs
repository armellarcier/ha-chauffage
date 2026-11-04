// A page that runs a former card next to the new panel, after an update. Home Assistant's
// service worker serves the page from its cache, then updates it: the first load after an update
// loads the former card, while the panel, declared by the integration, loads the new one.
// Own file: the former card must be defined before this card is loaded.
import './setup.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// The former card, defined first: it has none of the methods the new panel calls
class FormerCard extends HTMLElement {}
customElements.define('chauffage-programme-card', FormerCard);

const { fakeHass, cleanup } = await import('./helpers.mjs');
await import('../../custom_components/chauffage/frontend/chauffage-programme-card.js');
after(cleanup);

test('the panel asks to reload the page when a former card was loaded first', () => {
  const hass = fakeHass();
  hass.panels = { chauffage: { url_path: 'chauffage', title: 'Chauffage' } };
  window.history.replaceState(null, '', '/chauffage/thermostats');
  const el = document.createElement('chauffage-panel');
  document.body.appendChild(el);
  el.hass = hass;
  el.panel = hass.panels.chauffage;
  el.route = { prefix: '/chauffage', path: '/thermostats' };
  assert.match(el.shadowRoot.querySelector('.missing').textContent, /rechargez la page/);
  assert.ok(el.shadowRoot.querySelector('[data-act="reload-page"]'));
  assert.ok(el.shadowRoot.querySelector('ha-menu-button'), 'the sidebar stays reachable on a phone');
});
