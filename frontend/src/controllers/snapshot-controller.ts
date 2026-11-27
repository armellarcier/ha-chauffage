import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { client } from '../client/chauffage-client.ts';
import { dataSource } from '../client/snapshot.ts';

type Host = ReactiveControllerHost & HTMLElement & { hass: any };

// Draws an element again when the integration pushes new data, while the element is on the page.
// `pushed` says what the element does then: by default, it draws again.
export class SnapshotController implements ReactiveController {
  host: Host;
  pushed: () => void;
  unlisten: (() => void) | null = null;

  constructor(host: Host, pushed = () => host.requestUpdate()) {
    this.host = host;
    this.pushed = pushed;
    host.addController(this);
  }

  hostConnected() {
    this.listen();
  }

  hostUpdate() {
    this.listen();
  }

  hostDisconnected() {
    if (this.unlisten) this.unlisten();
    this.unlisten = null;
  }

  // Listens once the element has a hass with the integration
  listen() {
    const hass = this.host.hass;
    if (hass && this.host.isConnected && !this.unlisten && dataSource(hass).available) {
      this.unlisten = client.listen(this.pushed);
    }
  }
}
