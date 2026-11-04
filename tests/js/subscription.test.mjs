// The card's subscription to the integration across Home Assistant restarts. The companion app
// keeps its page open: the page reconnects as soon as Home Assistant answers, often before
// Chauffage is set up. Home Assistant's websocket library then replays the subscription once,
// gets "not_loaded", and never tries again.
import { fakeHass, createCard, cleanup, integrationData } from './helpers.mjs';
import { INTEGRATION } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { test, describe, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const NOT_LOADED = { code: 'not_loaded', message: 'The Chauffage integration is not set up' };
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
const active = (card) => {
  const dot = card.shadowRoot.querySelector('.tab .dot');
  return dot && dot.closest('.tab').dataset.schedule;
};

// A connection as home-assistant-js-websocket gives it: `ready` after a reconnection, and a
// server that answers each subscription with `answer()`: data, NOT_LOADED, or nothing
function connection(hass, answer) {
  const ready = new Set();
  const conn = {
    subscriptions: [],
    addEventListener: (type, cb) => { if (type === 'ready') ready.add(cb); },
    removeEventListener: (type, cb) => ready.delete(cb),
    subscribeMessage(cb, msg, options) {
      if (msg.type !== 'chauffage/subscribe') return Promise.resolve(() => {});
      const sub = { cb, options, closed: false };
      conn.subscriptions.push(sub);
      const reply = answer();
      if (reply === NOT_LOADED) return Promise.reject(NOT_LOADED);
      if (reply) Promise.resolve().then(() => cb(reply));
      return Promise.resolve(() => { sub.closed = true; });
    },
    reconnect: () => { for (const cb of ready) cb(conn); },
  };
  hass.connection = conn;
  return conn;
}

describe('the subscription to the integration', () => {
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('after Home Assistant restarts, the card gets the data again', async () => {
    const hass = fakeHass({ data: null });
    let data = integrationData({ schedule: 'Normal' });
    const conn = connection(hass, () => data);
    const card = createCard(hass);
    await flush();
    assert.equal(active(card), 'normal');
    // Not replayed by Home Assistant's library: the card subscribes again itself
    assert.equal(conn.subscriptions[0].options.resubscribe, false);

    data = integrationData({ schedule: 'Vacances' });
    conn.reconnect();
    await flush();
    assert.equal(conn.subscriptions.length, 2);
    assert.equal(active(card), 'holiday');
  });

  test('after a restart, the card waits for Chauffage to be set up, then gets its data', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const hass = fakeHass({ data: null });
    let answer = integrationData();
    const conn = connection(hass, () => answer);
    const card = createCard(hass);
    await flush();

    answer = NOT_LOADED; // Home Assistant answers, Chauffage is not set up yet
    conn.reconnect();
    await flush();
    answer = integrationData({ schedule: 'Absent' });
    mock.timers.tick(5000);
    await flush();
    assert.equal(active(card), 'away');
    assert.equal(card.shadowRoot.querySelector('.missing'), null);
  });

  test('a subscription that brings no data is made again', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const hass = fakeHass({ data: null });
    let answer = null; // subscribed, but nothing comes
    const conn = connection(hass, () => answer);
    const card = createCard(hass);
    await flush();
    assert.ok(card.shadowRoot.querySelector('.loading'));

    answer = integrationData();
    mock.timers.tick(10000);
    await flush();
    assert.ok(conn.subscriptions[0].closed, 'the silent subscription is closed');
    assert.equal(card.shadowRoot.querySelector('.loading'), null);
    assert.equal(active(card), 'normal');
  });

  test('no new try once every card has left the page', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const hass = fakeHass({ data: null });
    const conn = connection(hass, () => NOT_LOADED);
    createCard(hass);
    await flush();
    cleanup();
    mock.timers.tick(120000);
    await flush();
    assert.equal(conn.subscriptions.length, 1);
    assert.equal(INTEGRATION.listeners.size, 0);
  });
});
