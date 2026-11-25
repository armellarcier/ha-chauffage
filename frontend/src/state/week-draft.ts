import { NEW_DAY } from '../common.ts';
import { parseDay, serializeDay } from '../slots.ts';
import type { Snapshot } from '../client/snapshot.ts';
import { storeClip, storedClip } from './preferences.ts';

// The weeks a card edits, until they are saved: the slots of each day, by thermostat and
// schedule, and the revisions they were loaded at. No DOM: the card draws it.
export class WeekDraft {
  // { climate: { schedule: 7 days of slots } }
  weeks: Record<string, Record<string, any[][]>> = {};
  // The revision of each thermostat's weeks when loaded: a save is checked against it
  revisions: Record<string, number | null> = {};
  // The revision of the list of schedules
  revision: number | null = null;
  // true: edited since loaded or saved
  dirty = false;
  // The weeks as loaded or saved last, serialized (see serialized)
  private loaded: Record<string, string> | null = null;
  // The weeks drawn but not edited, see week
  private drawn = new Set<string>();
  // The day copied by this card, when the browser's storage keeps nothing
  private ownClip: any = null;

  // The weeks the integration has now: the edits not saved are dropped
  load(src: Snapshot) {
    this.weeks = {};
    this.drawn = new Set();
    this.revision = src.revision;
    this.revisions = {};
    for (const [climate, bySchedule] of Object.entries(src.weeks())) {
      if (!bySchedule || typeof bySchedule !== 'object') continue;
      this.weeks[climate] = {};
      for (const [schedule, week] of Object.entries(bySchedule)) {
        if (!Array.isArray(week)) continue;
        this.weeks[climate][schedule] = [0, 1, 2, 3, 4, 5, 6].map((i) => parseDay(week[i]));
      }
      this.revisions[climate] = src.revisionOf(climate);
    }
    this.loaded = this.serialized();
  }

  // A thermostat's week in a schedule; a week it does not have yet is drawn as a new schedule's
  // week (eco all week)
  week(climate: string, schedule: string) {
    if (!this.weeks[climate]) this.weeks[climate] = {};
    if (!this.weeks[climate][schedule]) {
      this.weeks[climate][schedule] = [0, 1, 2, 3, 4, 5, 6].map(() => NEW_DAY.map((s) => ({ ...s })));
      this.drawn.add(`${climate}|${schedule}`);
    }
    return this.weeks[climate][schedule];
  }

  // A thermostat's whole week in a schedule replaced, as an edit
  setWeek(climate: string, schedule: string, week: any[][]) {
    if (!this.weeks[climate]) this.weeks[climate] = {};
    this.weeks[climate][schedule] = week;
    this.dirty = true;
  }

  // {climate: JSON of its weeks by schedule}, to send only the thermostats changed. A week the
  // card only drew (see week) and nobody edited is left out: saving another thermostat must not
  // schedule this one
  serialized() {
    const out: Record<string, string> = {};
    for (const [climate, bySchedule] of Object.entries(this.weeks)) {
      const weeks = Object.keys(bySchedule).sort()
        .map((schedule) => [schedule, bySchedule[schedule].map(serializeDay)] as [string, any])
        .filter(([schedule, week]) => !(this.drawn.has(`${climate}|${schedule}`)
          && JSON.stringify(week) === JSON.stringify(Array(7).fill(serializeDay(NEW_DAY)))));
      if (weeks.length) out[climate] = JSON.stringify(Object.fromEntries(weeks));
    }
    return out;
  }

  // The thermostats whose weeks differ from the ones loaded or saved last
  changed(now = this.serialized()) {
    const loaded = this.loaded || {};
    return Object.keys(now).filter((c) => now[c] !== loaded[c]);
  }

  // Edits undone: nothing is left to save
  forgetUndoneEdits() {
    if (this.dirty && this.loaded && JSON.stringify(this.serialized()) === JSON.stringify(this.loaded)) this.dirty = false;
  }

  // What a save sends: only the thermostats changed, each against its revision (another card may
  // edit the others). `serialized` goes back to `saved` once the integration has answered.
  saveRequest() {
    const now = this.serialized();
    const changed = this.changed(now);
    return {
      weeks: Object.fromEntries(changed.map((c) => [c, JSON.parse(now[c])])),
      revisions: Object.fromEntries(changed.map((c) => [c, this.revisions[c] ?? null])),
      serialized: now,
    };
  }

  // The revisions the integration gave back after a save, by this card or another one
  recordRevisions(result) {
    if (result && result.revision != null) this.revision = result.revision;
    if (result && result.revisions) Object.assign(this.revisions, result.revisions);
  }

  // The weeks saved: nothing left to save
  saved(serialized = this.serialized()) {
    this.loaded = serialized;
    this.dirty = false;
  }

  // The day copied, shared by every card of the page and kept across reloads (this browser): read
  // when used, so that a card drawn before the copy, such as another week of a thermostat's sheet
  // in the panel, can paste it. Without the browser's storage, this card's own copy.
  get clip() {
    return storedClip() || this.ownClip || null;
  }

  copy(clip) {
    this.ownClip = clip;
    storeClip(clip);
  }
}
