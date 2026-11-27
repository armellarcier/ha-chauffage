import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { fromSettings } from '../settings-dialog.ts';

type Host = ReactiveControllerHost & HTMLElement;

// Closes an element's menus and popovers on a press outside it, or on Escape. Not the ⋮ of the
// panel's page, which opens and closes a menu of the page itself. The settings dialog opens on top
// of a popover: a press or Escape in the dialog leaves the popover open under it.
// `close` closes what is open, and says whether something was.
export class DismissController implements ReactiveController {
  host: Host;
  close: () => boolean;

  constructor(host: Host, close: () => boolean) {
    this.host = host;
    this.close = close;
    host.addController(this);
  }

  hostConnected() {
    document.addEventListener('pointerdown', this.down, true);
    document.addEventListener('keydown', this.key);
  }

  hostDisconnected() {
    document.removeEventListener('pointerdown', this.down, true);
    document.removeEventListener('keydown', this.key);
  }

  down = (e) => {
    const path = e.composedPath();
    if (fromSettings(e)) return;
    if (!path.includes(this.host) && !path.some((n) => n.matches && n.matches('[data-page-menu]'))) this.dismiss();
  };

  key = (e) => {
    if (e.key === 'Escape' && !fromSettings(e)) this.dismiss();
  };

  dismiss() {
    if (this.close()) this.host.requestUpdate();
  }
}
