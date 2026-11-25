import { todayIdx } from '../common.ts';
import { HISTORY_DAYS, HISTORY_MAX_AGE, RECORDER_DELAY, historyDays, mergeRows } from '../history.ts';

// Fetches the rows of the recorder between two dates
type HistoryFetch = (since: Date, now: Date) => Promise<any>;

// The measured temperature of the last 7 days, drawn over the weeks while shown. No DOM: the card
// draws it.
export class HistoryStore {
  // Shown over the weeks
  shown = false;
  // A load is on its way
  loading = false;
  // { climate: the 7 days drawn }, null before the first load
  days: Record<string, any[]> | null = null;
  // The rows loaded, until a time
  private rows: any = null;
  private until = 0;
  private loadedAt = 0;
  private day: number | null = null;

  // A load is due while shown: at once when asked (`force`), on a new day, otherwise once the
  // rows are older than 5 minutes
  due(force = false) {
    if (!this.shown || this.loading) return false;
    return force || this.day !== todayIdx() || Date.now() - this.loadedAt >= HISTORY_MAX_AGE;
  }

  // Loads the last 7 days. Once loaded, only what is new (from a minute before the last load).
  refresh(fetch: HistoryFetch) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (HISTORY_DAYS - 1));
    const since = this.rows ? new Date(Math.max(start.getTime(), this.until - RECORDER_DELAY)) : start;
    this.loading = true;
    this.loadedAt = Date.now();
    this.day = todayIdx();
    return fetch(since, now)
      .then((rows) => {
        this.rows = mergeRows(this.rows, rows, since.getTime() / 1000, start.getTime() / 1000);
        this.until = now.getTime();
        this.days = historyDays(this.rows, now);
      })
      .finally(() => { this.loading = false; });
  }

  // A thermostat's day, when shown and loaded
  of(climate: string, day: number) {
    return this.shown && this.days && this.days[climate] ? this.days[climate][day] : null;
  }
}
