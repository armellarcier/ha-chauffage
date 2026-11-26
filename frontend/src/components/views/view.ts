import { LitElement, html } from 'lit';
import { dataSource } from '../../client/snapshot.ts';
import type { Snapshot } from '../../client/snapshot.ts';
import { commands } from '../../client/commands.ts';
import { SnapshotController } from '../../controllers/snapshot-controller.ts';
import { errorText, thermostatName } from '../../common.ts';
import { makeLocale } from '../../i18n/locale.ts';
import { inRowActions, navigate, openDevice, openMoreInfo } from '../../links.ts';
import { entityLink } from '../shared/entity-link.ts';

export type Thermostat = { entity: string; name?: string };

// A view of the Chauffage panel: the presets, the schedules, the thermostats or the rules. It
// draws in the light DOM of the element that shows it, with that element's stylesheet: today the
// programme card, set with one `view`. It closes its own menus, follows its own links and does its
// own actions: its clicks don't reach the element that shows it.
export class ChauffageView extends LitElement {
  static properties = {
    hass: { attribute: false },
    loc: { attribute: false },
    thermostats: { attribute: false },
    panel: { attribute: false },
  };

  declare hass: any;
  // The user's language, time and number formats (makeLocale); Home Assistant's by default
  declare loc: any;
  // The thermostats of the card, with the names its configuration gives them
  declare thermostats: Thermostat[];
  // Shown in the Chauffage panel: its changes are logged as the panel's
  declare panel: boolean;
  // Drawn again when the integration pushes new data
  _snapshot = new SnapshotController(this);
  // What the last action did, or its error, under the view
  _msg = '';

  constructor() {
    super();
    this.addEventListener('click', (e) => this._onClick(e));
  }

  createRenderRoot() {
    return this;
  }

  get _loc() {
    return this.loc || makeLocale(this.hass);
  }

  _source(): Snapshot {
    return dataSource(this.hass);
  }

  _commands() {
    return commands(this.hass);
  }

  _name(entity: string) {
    const t = (this.thermostats || []).find((x) => x.entity === entity);
    return thermostatName(this.hass, entity, t && t.name);
  }

  _moreInfoLink(climate: string) {
    return entityLink(climate, this._name(climate), this._loc.t('openThermostat'));
  }

  // The element the view's menus and popovers are placed in: its card
  _frame(): Element {
    return this.closest('ha-card') || this;
  }

  _msgTemplate(msg = this._msg) {
    return html`<div class="msg">${msg}</div>`;
  }

  // Draws, then runs a change of the integration; its error, if any, is shown
  async _call(change) {
    this.requestUpdate();
    try {
      await change(this._commands());
    } catch (e) {
      this._msg = errorText(this._loc.t, e);
      this.requestUpdate();
    }
  }

  // What a click does in the view: a menu open closes first (_clickCloses), then a link (an
  // entity's more-info dialog, a device's page, a page of the panel or a dashboard's view), then
  // a control (`data-act`, _action)
  _onClick(e) {
    if (this._clickCloses(e)) {
      e.stopPropagation();
      this.requestUpdate();
      return;
    }
    const mi = e.target.closest('[data-more-info]');
    const device = !mi && e.target.closest('[data-device]');
    const to = !mi && !device && !inRowActions(e) && e.target.closest('[data-navigate]');
    if (mi || device || to) {
      e.stopPropagation();
      this._leaving(mi ? 'more-info' : device ? 'device' : 'navigate');
      this.requestUpdate();
      if (mi) openMoreInfo(this, mi.dataset.moreInfo);
      else if (device) openDevice(device.dataset.device);
      else navigate(to.dataset.navigate);
      return;
    }
    if (this._clickElsewhere(e)) return;
    const act = e.target.closest('[data-act]');
    if (!act) return;
    e.stopPropagation();
    if (!act.disabled) this._action(act.dataset.act, act.dataset, act);
  }

  // A click outside the menu open: it only closes the menu (true)
  _clickCloses(e): boolean {
    return false;
  }

  // A link followed: the menus it leaves close
  _leaving(kind: 'more-info' | 'device' | 'navigate') {}

  // A click that is not a link: a popover open may close (true: nothing more to do)
  _clickElsewhere(e): boolean {
    return false;
  }

  _action(act: string, ds: DOMStringMap, el: HTMLElement): unknown {
    return undefined;
  }
}
