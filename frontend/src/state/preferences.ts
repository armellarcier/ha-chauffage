import { LS_CLIP, LS_GROUP, LS_HISTORY, LS_KEY } from '../common.ts';

// What the user chose on this device, kept in the browser's storage and shared by every card of
// the page. Without the browser's storage, nothing is kept: each read gives the default.

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch (e) { /* not kept */ }
}

function readJson(key: string): any {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}

// The thermostats shown last, or null
export const shownPreference = (): any => readJson(LS_KEY);
export const saveShownPreference = (shown: string[]) => write(LS_KEY, JSON.stringify(shown));

// The history of the measured temperature shown over the weeks
export const historyPreference = (): boolean => read(LS_HISTORY) === '1';
export const saveHistoryPreference = (shown: boolean) => write(LS_HISTORY, shown ? '1' : '0');

// Identical days on one row: true, false, or null when the user never chose
export function groupPreference(): boolean | null {
  const g = read(LS_GROUP);
  return g === '1' || g === '0' ? g === '1' : null;
}
export const saveGroupPreference = (grouped: boolean) => write(LS_GROUP, grouped ? '1' : '0');

// The day copied last: { segs, label, src }, or null
export function storedClip(): any {
  const c = readJson(LS_CLIP);
  return c && Array.isArray(c.segs) && c.segs.length ? c : null;
}
export const storeClip = (clip) => write(LS_CLIP, JSON.stringify(clip));
