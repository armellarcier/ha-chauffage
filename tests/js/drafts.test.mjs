// The rules, the overrides and the history a card holds, without the card.
import { integrationData } from './helpers.mjs';
import { HistoryStore, OverrideDraft, RulesDraft, makeSnapshot } from '../../frontend/src/index.ts';
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

const RULES = [{ template: '{{ is_state("person.me", "away") }}', schedule: 'away' }];
const snapshot = (extra = {}) => makeSnapshot({ states: {} }, { ...integrationData(), rules: RULES, default_schedule: 'normal', ...extra }, true);

describe('a rules draft', () => {
  test('shows the integration\'s rules while nothing is edited', () => {
    const draft = new RulesDraft();
    assert.equal(draft.edited, false);
    assert.deepEqual(draft.shown(snapshot()), { rules: RULES, def: 'normal' });
  });

  test('is edited once a rule changes, and no longer once the change is undone', () => {
    const draft = new RulesDraft();
    const src = snapshot();
    draft.edit(src, (d) => { d.rules[0].schedule = 'holiday'; });
    assert.equal(draft.edited, true);
    assert.equal(draft.shown(src).rules[0].schedule, 'holiday');
    draft.edit(src, (d) => { d.rules[0].schedule = 'away'; });
    assert.equal(draft.edited, false);
  });

  test('saves the rules with a template, trimmed', () => {
    const draft = new RulesDraft();
    const src = snapshot();
    draft.edit(src, (d) => {
      d.rules[0].template = '  {{ true }} ';
      d.rules.push({ template: ' ', schedule: 'normal' });
      d.def = null;
    });
    assert.deepEqual(draft.toSave(src), { rules: [{ template: '{{ true }}', schedule: 'away' }], def: null });
  });

  test('shows the integration\'s rules again once dropped', () => {
    const draft = new RulesDraft();
    const src = snapshot();
    draft.edit(src, (d) => { d.def = 'away'; });
    draft.drop();
    assert.equal(draft.edited, false);
    assert.equal(draft.shown(src).def, 'normal');
  });
});

describe('an override draft', () => {
  const end = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

  test('shows an override sent at once, and drops it when the call fails', () => {
    const draft = new OverrideDraft();
    const override = { preset: 'comfort', end: end(60) };
    draft.sent('climate.salon', override);
    assert.deepEqual(draft.overrides(snapshot()), { 'climate.salon': override });
    draft.failed('climate.salon');
    assert.deepEqual(draft.overrides(snapshot()), {});
  });

  test('hides an override removed, until the integration\'s update', () => {
    const draft = new OverrideDraft();
    const src = snapshot({ overrides: { 'climate.salon': { preset: 'eco', end: end(30) } } });
    draft.sent('climate.salon', null);
    assert.deepEqual(draft.overrides(src), {});
    draft.updated();
    assert.deepEqual(Object.keys(draft.overrides(src)), ['climate.salon']);
  });

  test('leaves out the overrides that have ended', () => {
    const src = snapshot({ overrides: { 'climate.salon': { preset: 'eco', end: end(-1) } } });
    assert.deepEqual(new OverrideDraft().overrides(src), {});
  });
});

describe('the history store', () => {
  const ROWS = { 'climate.salon': [] };

  test('loads only while shown, and not twice at once', async () => {
    const store = new HistoryStore();
    assert.equal(store.due(true), false);
    store.shown = true;
    assert.equal(store.due(), true);
    const fetch = mock.fn(async () => ROWS);
    const loading = store.refresh(fetch);
    assert.equal(store.loading, true);
    assert.equal(store.due(true), false);
    await loading;
    assert.equal(store.loading, false);
    assert.equal(fetch.mock.callCount(), 1);
  });

  test('loads again when asked, otherwise after 5 minutes', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 25, 12, 0) });
    const store = new HistoryStore();
    store.shown = true;
    await store.refresh(async () => ROWS);
    assert.equal(store.due(), false);
    assert.equal(store.due(true), true);
    t.mock.timers.tick(5 * 60000);
    assert.equal(store.due(), true);
  });

  test('then loads only what is new, from a minute before the last load', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 25, 12, 0) });
    const store = new HistoryStore();
    store.shown = true;
    const since = [];
    const fetch = async (from) => { since.push(from.getTime()); return ROWS; };
    await store.refresh(fetch);
    assert.equal(since[0], new Date(2026, 10, 19, 0, 0).getTime());
    t.mock.timers.tick(10 * 60000);
    await store.refresh(fetch);
    assert.equal(since[1], new Date(2026, 10, 25, 11, 59).getTime());
  });

  test('is no longer loading after a failed load', async () => {
    const store = new HistoryStore();
    store.shown = true;
    await assert.rejects(store.refresh(async () => { throw new Error('recorder'); }));
    assert.equal(store.loading, false);
    assert.equal(store.days, null);
  });
});
