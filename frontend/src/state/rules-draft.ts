import { plainRule } from '../common.ts';
import type { Snapshot } from '../client/snapshot.ts';

export type Rules = { rules: { template: string; schedule: string | null }[]; def: string | null };

const state = (rules, def) => JSON.stringify([rules.map(plainRule), def || null]);

// The activation rules being edited, until they are saved. No DOM: the card draws it.
export class RulesDraft {
  private draft: Rules | null = null;

  // true: edited, with something to save
  get edited() {
    return !!this.draft;
  }

  // The rules being edited, or the integration's when nothing is edited
  shown(src: Snapshot): Rules {
    return this.draft || { rules: src.rules().map((r) => ({ ...r })), def: src.defaultSchedule() };
  }

  // Edits the rules: the draft is created from the integration's on the first change, and
  // dropped when the edits are undone, so that nothing is left to save
  edit(src: Snapshot, change: (draft: Rules) => void) {
    const draft = this.shown(src);
    change(draft);
    this.draft = state(draft.rules, draft.def) !== state(src.rules(), src.defaultSchedule()) ? draft : null;
  }

  // What a save sends: the rules with a template, trimmed, and the schedule when none is true
  toSave(src: Snapshot) {
    const { rules, def } = this.shown(src);
    return {
      rules: rules.filter((r) => r.template.trim()).map((r) => plainRule({ ...r, template: r.template.trim() })),
      def: def || null,
    };
  }

  // Saved or cancelled: the integration's rules are shown again
  drop() {
    this.draft = null;
  }
}
