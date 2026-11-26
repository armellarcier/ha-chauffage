import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { DismissController } from '../../controllers/dismiss-controller.ts';
import { openPanel, panelPath } from '../../links.ts';
import { restoreTyped } from '../../override-edit.ts';
import { activateSchedule, scheduleMenuAction, scheduleMenuHtml } from '../shared/schedule-menu.ts';
import type { ScheduleMenu, ScheduleMenuHost } from '../shared/schedule-menu.ts';
import { listRow } from '../shared/list-row.ts';
import { ChauffageView } from './view.ts';

const NAME_FIELD = '.sched-menu input[data-sched-name]';

// The panel's Schedules page: one row per schedule, as the Thermostats page, the active one
// marked; a row opens the schedule's sheet. Its ⋮ activates, renames, moves and deletes it
// (canSetUp, as the panel); + New schedule creates an empty one or a copy, as the card's +
export class ChauffageSchedulesView extends ChauffageView {
  _menu: ScheduleMenu | null = null;
  _error = '';
  // The schedules' revision a change answered, until the integration pushes it
  _revision: { from: number | null; value: number | null } | null = null;
  // The access level drawn: a lower one closes the menu
  _access: string | undefined;
  // The name field to focus once drawn, with the name typed
  _focusName: { value?: string } | null = null;
  _typing: { input: HTMLInputElement; value: string; focused: boolean } | null = null;
  _dismiss = new DismissController(this, () => {
    if (!this._menu) return false;
    this._menu = null;
    return true;
  });

  constructor() {
    super();
    // Enter in a schedule's name field confirms (Create / Rename)
    this.addEventListener('keydown', (e: any) => {
      if (e.key !== 'Enter' || !e.target.hasAttribute('data-sched-name')) return;
      e.stopPropagation();
      const ok: HTMLElement = this.querySelector('.sched-menu .btn.primary');
      if (ok) ok.click();
    });
  }

  willUpdate() {
    const src = this._source();
    if (src.stamps.access !== this._access) {
      this._access = src.stamps.access;
      if (!src.plannable) this._menu = null;
    }
    // A name being typed, kept if the menu is drawn again with a new field
    const input: HTMLInputElement = this.querySelector(NAME_FIELD);
    const root: any = this.getRootNode();
    this._typing = input && { input, value: input.value, focused: root.activeElement === input };
  }

  updated() {
    const typing = this._typing;
    this._typing = null;
    if (this._focusName) {
      restoreTyped(this, NAME_FIELD, this._focusName.value);
      this._focusName = null;
    } else if (typing && this.querySelector(NAME_FIELD) !== typing.input) {
      if (typing.focused) restoreTyped(this, NAME_FIELD, typing.value);
      else if (this.querySelector(NAME_FIELD)) (this.querySelector(NAME_FIELD) as HTMLInputElement).value = typing.value;
    }
  }

  render() {
    const t = this._loc.t;
    const src = this._source();
    const active = src.activeSchedule();
    const rows = src.schedules().map((id) => {
      const open = this._menu && this._menu.kind === 'menu' && this._menu.id === id;
      const more = !src.editable ? null
        : html`<button class="icon-btn${open ? ' on' : ''}" data-act="schedule-menu" data-schedule=${id} title=${t('scheduleMenu')} aria-label=${t('scheduleMenu')}><ha-icon icon="mdi:dots-vertical"></ha-icon></button>`;
      return listRow({ schedule: id, to: panelPath(`schedules/${id}`), icon: src.scheduleIcon(id) || 'mdi:calendar-clock',
        title: html`${src.scheduleName(id)}${id === active ? html` <span class="badge on">${t('panelActive')}</span>` : nothing}`,
        actions: more });
    });
    const add = src.editable ? html`<div class="th-add"><button class="btn" data-act="schedule-new">+ ${t('newSchedule')}</button></div>` : nothing;
    return html`<div class="thermostats-view schedules-view"><div class="th-list">${rows}</div>${add}</div>${
      unsafeHTML(scheduleMenuHtml(this._menuHost()))}${this._msgTemplate()}`;
  }

  // The schedule menus, drawn in this view
  _menuHost(): ScheduleMenuHost {
    const view = this;
    const src = this._source();
    return {
      hass: this.hass,
      loc: this._loc,
      src,
      panel: !!this.panel,
      list: true,
      oneTab: false,
      get menu() { return view._menu; },
      set menu(menu) { view._menu = menu; },
      get error() { return view._error; },
      set error(error) { view._error = error; },
      get revision() { return view._revision && view._revision.from === src.revision ? view._revision.value : src.revision; },
      set revision(value) { view._revision = { from: src.revision, value }; },
      frame: () => this._frame(),
      draw: (focus = false, typed = undefined) => {
        if (focus) this._focusName = { value: typed };
        this.requestUpdate();
      },
      save: async () => true,
      // The new schedule's sheet, to set its weeks
      created: (id) => openPanel(`schedules/${id}`),
      message: (text) => { this._msg = text; },
    };
  }

  // A schedule menu open: a click elsewhere only closes it
  _clickCloses(e) {
    if (!this._menu || e.target.closest('.sched-menu, [data-act="schedule-new"], [data-act="schedule-menu"]')) return false;
    this._menu = null;
    return true;
  }

  _leaving(kind) {
    if (kind === 'more-info') this._menu = null;
  }

  _action(act, ds, el) {
    const host = this._menuHost();
    if (act === 'activate-schedule') {
      // From a schedule's ⋮ menu: closed at once, as after every action
      this._menu = null;
      this.requestUpdate();
      return activateSchedule(host, ds.schedule);
    }
    return scheduleMenuAction(host, act, ds, el, null);
  }
}
