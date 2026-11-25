import { filterActive, type Snapshot } from '../client/snapshot.ts';

// The overrides a card sent, shown at once while the integration's update is on its way. No DOM:
// the card draws it.
export class OverrideDraft {
  // { climate: override, or null for an override removed }
  private pending: Record<string, any> = {};

  // The overrides that have not ended, with the ones sent
  overrides(src: Snapshot | null) {
    const out = src ? src.overrides() : {};
    for (const [c, d] of Object.entries(this.pending)) {
      if (d) out[c] = d;
      else delete out[c];
    }
    return filterActive(out);
  }

  // An override sent: shown until the integration's update, or until it fails
  sent(climate: string, override) {
    this.pending[climate] = override;
  }

  failed(climate: string) {
    delete this.pending[climate];
  }

  // The integration's update came: it holds the overrides sent
  updated() {
    this.pending = {};
  }
}
