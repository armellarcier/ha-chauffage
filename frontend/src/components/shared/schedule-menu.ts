import type { Snapshot } from '../../client/snapshot.ts';
import { commands } from '../../client/commands.ts';
import { html, nothing } from 'lit';
import { ref } from 'lit/directives/ref.js';
import { errorText } from '../../common.ts';
import { attributes } from './attributes.ts';
import { openMoreInfo, panelPath, panelTitle } from '../../links.ts';

// The menu of a schedule open: "+" (a new schedule: empty or a copy, then its name) or "⋮" (the
// schedule `id`: rename, move, delete…), at `step`, under the button that opened it
export type ScheduleMenu = {
  kind: 'new' | 'menu';
  id: string;
  step: string;
  copy?: string | null;
  top: number;
  left?: number;
  right?: number;
};

// What the menus of the schedules need from the element that shows them: the programme card,
// under its tabs, or the panel's list of schedules
export interface ScheduleMenuHost {
  hass: any;
  loc: any;
  src: Snapshot;
  // Shown in the Chauffage panel: no link to it, and the changes are logged as the panel's
  panel: boolean;
  // The panel's list of schedules: the schedule moves up or down, and is activated from its menu
  list: boolean;
  // A schedule's sheet: its tab alone, so no tab to move it next to
  oneTab: boolean;
  menu: ScheduleMenu | null;
  error: string;
  // The schedules' revision, which a change is checked against
  revision: number | null;
  // What the menu is placed in
  frame(): Element;
  // Draws the menu again
  draw(): void;
  // The weeks not saved yet are saved before the schedules change: false if they could not be
  save(): Promise<boolean>;
  created(id: string): void;
  message(text: string): void;
}

// A name field of a menu takes the focus once, when it appears: once ha-card (a Lit component
// drawn asynchronously) shows its content too, before which it cannot take the focus
const focusedOnce = new WeakSet<Element>();
function focusOnce(host: ScheduleMenuHost) {
  return (el?: Element) => {
    if (!el || focusedOnce.has(el)) return;
    focusedOnce.add(el);
    const focus = () => { if (el.isConnected) (el as HTMLElement).focus(); };
    Promise.resolve().then(focus);
    const frame: any = host.frame();
    if (frame && frame.updateComplete instanceof Promise) frame.updateComplete.then(focus);
  };
}

export function scheduleMenu(host: ScheduleMenuHost) {
  const ed = host.menu;
  if (!ed) return nothing;
  const t = host.loc.t;
  const src = host.src;
  const schedules = src.schedules();
  const item = (act, label, run: () => unknown, data: Record<string, string> = {}, disabled = false, cls = 'mi') =>
    html`<button class=${cls} data-act=${act} ${attributes(data)} ?disabled=${disabled} @click=${run}><span>${label}</span></button>`;
  const err = host.error ? html`<div class="sched-err">${host.error}</div>` : nothing;
  const cancel = html`<button class="btn small" data-act="schedule-close" @click=${() => closeMenu(host)}>${t('cancel')}</button>`;
  const nameForm = (value, act, label, run: () => unknown) => html`<div class="sched-form">
      <input data-sched-name value=${value} placeholder=${t('scheduleName')} ${ref(focusOnce(host))}>
      ${err}
      <div class="sched-btns"><button class="btn small primary" data-act=${act} @click=${run}>${label}</button>${cancel}</div>
    </div>`;
  let body;
  if (ed.kind === 'new') {
    if (ed.step === 'name') {
      const from = ed.copy ? t('copyOfName', { name: src.scheduleName(ed.copy) }) : t('emptySchedule');
      body = html`<div class="mh">${t('newSchedule')} · ${from}</div>${nameForm('', 'schedule-create', t('create'), () => createSchedule(host))}`;
    } else {
      body = html`<div class="mh">${t('newSchedule')}</div>
        ${item('schedule-pick', t('emptySchedule'), () => goTo(host, 'name', null), { 'data-copy': '' })}
        <div class="sep"></div>
        ${schedules.map((m) => item('schedule-pick', t('copyOfName', { name: src.scheduleName(m) }), () => goTo(host, 'name', m), { 'data-copy': m }))}`;
    }
  } else {
    const id = ed.id;
    const name = src.scheduleName(id);
    if (ed.step === 'rename') {
      // The id does not change: automations use it
      body = html`<div class="mh">${t('scheduleId', { id })}</div>${nameForm(name, 'schedule-rename', t('rename'), () => renameSchedule(host))}`;
    } else if (ed.step === 'delete') {
      body = html`<div class="sched-form">${t('confirmDelete', { name })}
        <div class="sched-btns"><button class="btn small danger" data-act="schedule-delete-confirm" @click=${() => deleteSchedule(host)}>${t('deleteSchedule')}</button>${cancel}</div></div>`;
    } else {
      const i = schedules.indexOf(id);
      const inRules = src.rules().some((r) => r.schedule === id) || src.defaultSchedule() === id;
      const reason = id === src.activeSchedule() ? t('cannotDeleteActive') : schedules.length < 2 ? t('cannotDeleteLast')
        : inRules ? t('cannotDeleteInRules') : '';
      // On a dashboard, the schedule's page in the panel, for whoever may open the panel (Set
      // up); in the panel, the page is a row or the page itself
      const open = host.panel || !src.editable ? nothing
        : html`<button class="mi" data-navigate=${panelPath(`schedules/${id}`)}><span>${t('openInPanel', { panel: panelTitle(host.hass) })}</span></button><div class="sep"></div>`;
      // A schedule's sheet shows one tab: no tab to move it next to; the list moves it up or down
      const moves = host.oneTab ? nothing
        : html`${item('schedule-move', t(host.list ? 'moveUp' : 'moveLeft'), () => moveSchedule(host, -1), { 'data-dir': '-1' }, i <= 0)}
        ${item('schedule-move', t(host.list ? 'moveDown' : 'moveRight'), () => moveSchedule(host, 1), { 'data-dir': '1' }, i >= schedules.length - 1)}`;
      // The list's rows have no Activate button: it broke their layout. The menu closes at once,
      // as after every action
      const activate = host.list && id !== src.activeSchedule()
        ? html`${item('activate-schedule', t('panelActivate'), () => { host.menu = null; host.draw(); return activateSchedule(host, id); }, { 'data-schedule': id })}<div class="sep"></div>` : nothing;
      // The icon is the schedule switch's: set where Home Assistant sets every entity's icon, which
      // Home Assistant keeps for admins
      const icon = src.scheduleEntity(id) && src.admin ? item('schedule-icon', t('changeIcon'), () => openIcon(host)) : nothing;
      body = html`${activate}${open}${item('schedule-rename-open', t('renameMenu'), () => goTo(host, 'rename'))}
        ${icon}
        ${moves}
        <div class="sep"></div>
        ${item('schedule-delete', html`${t('deleteMenu')}${reason ? html`<small>${reason}</small>` : nothing}`, () => goTo(host, 'delete'), {}, !!reason, 'mi danger')}`;
    }
  }
  const side = ed.right != null ? `right:${ed.right}px` : `left:${ed.left || 0}px`;
  return html`<div class="menu sched-menu" style=${`top:${ed.top || 0}px;${side}`}>${body}</div>`;
}

// Opens the menu of the schedule `id` (`kind` 'menu') or the menu of a new schedule ('new'),
// under the button `el` that opens it (canPlan). The same button again closes it.
export function toggleScheduleMenu(host: ScheduleMenuHost, kind: 'new' | 'menu', id: string | null, el: HTMLElement | null) {
  host.error = '';
  const ed = host.menu;
  if (ed && ed.kind === kind && (kind === 'new' || ed.id === id)) { host.menu = null; return host.draw(); }
  // Under the button: from its left edge, or from its right edge for a button on the right
  // (the page's ⋮, above the card), so the menu stays in the window
  const card = host.frame().getBoundingClientRect();
  const b = el ? el.getBoundingClientRect() : { bottom: 0, left: 0, right: 0 };
  const onRight = b.left - card.left > card.width / 2;
  const left = Math.max(8, Math.min(b.left - card.left, card.width - 280));
  host.menu = { kind, id, step: kind === 'new' ? 'pick' : 'list', top: b.bottom - card.top + 4,
    ...(onRight ? { right: Math.max(0, card.right - b.right) } : { left }) };
  return host.draw();
}

function closeMenu(host: ScheduleMenuHost) {
  host.error = '';
  host.menu = null;
  host.draw();
}

// The menu shows its next step: a name to type, or a confirmation. A new schedule may copy one
function goTo(host: ScheduleMenuHost, step: string, copy?: string | null) {
  host.error = '';
  host.menu.step = step;
  if (copy !== undefined) host.menu.copy = copy;
  host.draw();
}

// The schedule switch's own settings, where Home Assistant sets its icon
function openIcon(host: ScheduleMenuHost) {
  host.error = '';
  const entity = host.src.scheduleEntity(host.menu.id);
  host.menu = null;
  host.draw();
  return openMoreInfo(host.frame(), entity, 'settings');
}

// The name typed in the menu, or null when it is empty or another schedule has it: the menu says
// why, and the name stays in its field, which takes the focus back
function typedName(host: ScheduleMenuHost, except: string | null) {
  const t = host.loc.t;
  const src = host.src;
  const nameInput: any = host.frame().querySelector('input[data-sched-name]');
  const name = nameInput ? nameInput.value.trim() : '';
  const taken = src.schedules().some((m) => m !== except && src.scheduleName(m).trim().toLowerCase() === name.toLowerCase());
  host.error = !name ? t('nameRequired') : taken ? t('nameTaken') : '';
  if (host.error) {
    if (nameInput) nameInput.focus();
    host.draw();
  }
  return host.error ? null : name;
}

// The schedules as they are, each by its id: the list a change starts from
const kept = (host: ScheduleMenuHost): any[] => host.src.schedules().map((id) => ({ id }));

function createSchedule(host: ScheduleMenuHost) {
  const name = typedName(host, null);
  if (!name) return undefined;
  const copy = host.menu.copy;
  return setSchedules(host, [...kept(host), copy ? { name, copy_of: copy } : { name }], true);
}

function renameSchedule(host: ScheduleMenuHost) {
  const id = host.menu.id;
  const name = typedName(host, id);
  if (!name) return undefined;
  return setSchedules(host, kept(host).map((m) => (m.id === id ? { id, name } : m)));
}

// Moves the schedule of the menu up or down the list (`dir` -1 or 1)
function moveSchedule(host: ScheduleMenuHost, dir: number) {
  host.error = '';
  const keep = kept(host);
  const i = keep.findIndex((m) => m.id === host.menu.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= keep.length) return undefined;
  [keep[i], keep[j]] = [keep[j], keep[i]];
  return setSchedules(host, keep);
}

function deleteSchedule(host: ScheduleMenuHost) {
  host.error = '';
  return setSchedules(host, kept(host).filter((m) => m.id !== host.menu.id));
}

// Sends the new list of schedules (canPlan), once the weeks not saved yet are saved. `created`:
// the last schedule of the list is new, and the host shows it
async function setSchedules(host: ScheduleMenuHost, list: any[], created = false) {
  const t = host.loc.t;
  host.menu = null;
  host.draw(); // the menu closes at once, not when the integration answers
  if (!(await host.save())) return undefined;
  try {
    const result = await commands(host.hass).setSchedules(list, host.revision);
    if (result && result.revision != null) host.revision = result.revision;
    if (created && result && result.schedules) host.created(result.schedules[result.schedules.length - 1].id);
  } catch (e) {
    host.message(e && e.code === 'stale' ? t('stale') : errorText(t, e));
  }
  return host.draw();
}

// Activates a schedule, and says so
export async function activateSchedule(host: ScheduleMenuHost, schedule: string) {
  try {
    await commands(host.hass).activateSchedule(schedule, host.panel ? 'panel' : undefined);
    host.message(host.loc.t('scheduleActivated', { schedule: host.src.scheduleName(schedule) }));
  } catch (e) {
    host.message(errorText(host.loc.t, e));
  }
  host.draw();
}
