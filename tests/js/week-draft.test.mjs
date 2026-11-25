// The weeks a card edits until they are saved (WeekDraft), without the card.
import { integrationData, WEEKDAY } from './helpers.mjs';
import { WeekDraft, makeSnapshot } from '../../frontend/src/index.ts';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const TWO = { 'climate.salon': { Normal: Array(7).fill(WEEKDAY) }, 'climate.bureau': { Normal: Array(7).fill(WEEKDAY) } };
const snapshot = (data = integrationData({ weeks: TWO })) => makeSnapshot({ states: {} }, data, true);
const loaded = (data) => {
  const draft = new WeekDraft();
  draft.load(snapshot(data));
  return draft;
};

describe('a week draft', () => {
  beforeEach(() => localStorage.clear());

  test('loads the weeks and the revisions of the integration, with nothing to save', () => {
    const draft = loaded();
    assert.equal(draft.week('climate.salon', 'normal')[1][1].preset, 'comfort');
    assert.deepEqual(draft.revisions, { 'climate.salon': 7, 'climate.bureau': 7 });
    assert.equal(draft.revision, 4);
    assert.equal(draft.dirty, false);
    assert.deepEqual(draft.changed(), []);
  });

  test('sends only the thermostats edited, each against its revision', () => {
    const draft = loaded();
    draft.week('climate.salon', 'normal')[0] = [{ start: 0, preset: 'frost' }];
    const request = draft.saveRequest();
    assert.deepEqual(Object.keys(request.weeks), ['climate.salon']);
    assert.deepEqual(request.revisions, { 'climate.salon': 7 });
    assert.deepEqual(request.weeks['climate.salon'].normal[0], ['00:00 frost']);
  });

  test('leaves out a week only drawn: saving another thermostat does not schedule this one', () => {
    const draft = loaded();
    draft.week('climate.cuisine', 'normal');
    draft.week('climate.salon', 'away');
    assert.deepEqual(draft.changed(), []);
  });

  test('sends a drawn week once edited, against no revision', () => {
    const draft = loaded();
    draft.week('climate.cuisine', 'normal')[0] = [{ start: 0, preset: 'comfort' }];
    assert.deepEqual(draft.saveRequest().revisions, { 'climate.cuisine': null });
  });

  test('has nothing left to save once saved, and takes the new revisions', () => {
    const draft = loaded();
    draft.setWeek('climate.salon', 'normal', Array(7).fill([{ start: 0, preset: 'eco' }]));
    assert.equal(draft.dirty, true);
    const request = draft.saveRequest();
    draft.recordRevisions({ revision: 5, revisions: { 'climate.salon': 8 } });
    draft.saved(request.serialized);
    assert.equal(draft.dirty, false);
    assert.deepEqual(draft.changed(), []);
    assert.deepEqual(draft.revisions, { 'climate.salon': 8, 'climate.bureau': 7 });
    assert.equal(draft.revision, 5);
  });

  test('has nothing left to save once the edits are undone', () => {
    const draft = loaded();
    const day = draft.week('climate.salon', 'normal')[0];
    draft.week('climate.salon', 'normal')[0] = [{ start: 0, preset: 'frost' }];
    draft.dirty = true;
    draft.forgetUndoneEdits();
    assert.equal(draft.dirty, true);
    draft.week('climate.salon', 'normal')[0] = day;
    draft.forgetUndoneEdits();
    assert.equal(draft.dirty, false);
  });

  test('drops the edits when loaded again', () => {
    const draft = loaded();
    draft.setWeek('climate.salon', 'normal', Array(7).fill([{ start: 0, preset: 'eco' }]));
    draft.load(snapshot());
    assert.equal(draft.week('climate.salon', 'normal')[1][1].preset, 'comfort');
    assert.deepEqual(draft.changed(), []);
  });

  test('shares the day copied with every card of the page', () => {
    const clip = { segs: [{ start: 0, preset: 'eco' }], label: 'Salon · lundi (Normal)' };
    loaded().copy(clip);
    assert.deepEqual(loaded().clip, clip);
  });

  test('keeps its own copy when the browser keeps nothing', (t) => {
    const clip = { segs: [{ start: 0, preset: 'eco' }], label: 'Salon · lundi (Normal)' };
    t.mock.method(localStorage.__proto__, 'setItem', () => { throw new Error('quota'); });
    const draft = loaded();
    draft.copy(clip);
    assert.deepEqual(draft.clip, clip);
    assert.equal(loaded().clip, null);
  });
});
