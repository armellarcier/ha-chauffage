import type { Snapshot } from '../../client/snapshot.ts';
import { commands } from '../../client/commands.ts';
import { errorText, esc } from '../../common.ts';
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
  // Draws the menu; `focus`: with its name field focused, holding `typed`
  draw(focus?: boolean, typed?: string): void;
  // The weeks not saved yet are saved before the schedules change: false if they could not be
  save(): Promise<boolean>;
  created(id: string): void;
  message(text: string): void;
}

export function scheduleMenuHtml(host: ScheduleMenuHost) {
  const ed = host.menu;
  if (!ed) return '';
  const t = host.loc.t;
  const src = host.src;
  const schedules = src.schedules();
  const item = (act, label, extra = '', disabled = false, cls = 'mi') =>
    `<button class="${cls}" data-act="${act}" ${extra} ${disabled ? 'disabled' : ''}><span>${label}</span></button>`;
  const err = host.error ? `<div class="sched-err">${esc(host.error)}</div>` : '';
  const cancel = `<button class="btn small" data-act="schedule-close">${esc(t('cancel'))}</button>`;
  const nameForm = (value, act, label) => `<div class="sched-form">
      <input data-sched-name value="${esc(value)}" placeholder="${esc(t('scheduleName'))}">
      ${err}
      <div class="sched-btns"><button class="btn small primary" data-act="${act}">${esc(label)}</button>${cancel}</div>
    </div>`;
  let body;
  if (ed.kind === 'new') {
    if (ed.step === 'name') {
      const from = ed.copy ? t('copyOfName', { name: src.scheduleName(ed.copy) }) : t('emptySchedule');
      body = `<div class="mh">${esc(t('newSchedule'))} · ${esc(from)}</div>${nameForm('', 'schedule-create', t('create'))}`;
    } else {
      body = `<div class="mh">${esc(t('newSchedule'))}</div>
        ${item('schedule-pick', esc(t('emptySchedule')), 'data-copy=""')}
        <div class="sep"></div>
        ${schedules.map((m) => item('schedule-pick', esc(t('copyOfName', { name: src.scheduleName(m) })), `data-copy="${esc(m)}"`)).join('')}`;
    }
  } else {
    const id = ed.id;
    const name = src.scheduleName(id);
    if (ed.step === 'rename') {
      // The id does not change: automations use it
      body = `<div class="mh">${esc(t('scheduleId', { id }))}</div>${nameForm(name, 'schedule-rename', t('rename'))}`;
    } else if (ed.step === 'delete') {
      body = `<div class="sched-form">${esc(t('confirmDelete', { name }))}
        <div class="sched-btns"><button class="btn small danger" data-act="schedule-delete-confirm">${esc(t('deleteSchedule'))}</button>${cancel}</div></div>`;
    } else {
      const i = schedules.indexOf(id);
      const inRules = src.rules().some((r) => r.schedule === id) || src.defaultSchedule() === id;
      const reason = id === src.activeSchedule() ? t('cannotDeleteActive') : schedules.length < 2 ? t('cannotDeleteLast')
        : inRules ? t('cannotDeleteInRules') : '';
      // On a dashboard, the schedule's page in the panel, for whoever may open the panel (Set
      // up); in the panel, the page is a row or the page itself
      const open = host.panel || !src.editable ? ''
        : `<button class="mi" data-navigate="${panelPath(`schedules/${esc(id)}`)}"><span>${esc(t('openInPanel', { panel: panelTitle(host.hass) }))}</span></button><div class="sep"></div>`;
      // A schedule's sheet shows one tab: no tab to move it next to; the list moves it up or down
      const moves = host.oneTab ? ''
        : `${item('schedule-move', esc(t(host.list ? 'moveUp' : 'moveLeft')), 'data-dir="-1"', i <= 0)}
        ${item('schedule-move', esc(t(host.list ? 'moveDown' : 'moveRight')), 'data-dir="1"', i >= schedules.length - 1)}`;
      // The list's rows have no Activate button: it broke their layout
      const activate = host.list && id !== src.activeSchedule()
        ? `${item('activate-schedule', esc(t('panelActivate')), `data-schedule="${esc(id)}"`)}<div class="sep"></div>` : '';
      // The icon is the schedule switch's: set where Home Assistant sets every entity's icon, which
      // Home Assistant keeps for admins
      const icon = src.scheduleEntity(id) && src.admin ? item('schedule-icon', esc(t('changeIcon'))) : '';
      body = `${activate}${open}${item('schedule-rename-open', esc(t('renameMenu')))}
        ${icon}
        ${moves}
        <div class="sep"></div>
        ${item('schedule-delete', `${esc(t('deleteMenu'))}${reason ? `<small>${esc(reason)}</small>` : ''}`, '', !!reason, 'mi danger')}`;
    }
  }
  const side = ed.right != null ? `right:${ed.right}px` : `left:${ed.left || 0}px`;
  return `<div class="menu sched-menu" style="top:${ed.top || 0}px;${side}">${body}</div>`;
}

// What a control of the schedule menus does (canPlan): opens or closes a menu, goes to its next
// step, or changes the schedules. The weeks not saved yet are saved first. `current`: the schedule
// shown, whose ⋮ opens without a button of its own
export async function scheduleMenuAction(host: ScheduleMenuHost, act: string, ds: DOMStringMap, el: HTMLElement | null, current: string | null) {
  const t = host.loc.t;
  const src = host.src;
  const ed = host.menu;
  host.error = '';
  if (act === 'schedule-new' || act === 'schedule-menu') {
    const kind = act === 'schedule-new' ? 'new' : 'menu';
    const id = (el && el.dataset.schedule) || current;
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
  if (act === 'schedule-close' || !ed) { host.menu = null; return host.draw(); }
  if (act === 'schedule-pick') { ed.copy = ds.copy || null; ed.step = 'name'; return host.draw(true); }
  if (act === 'schedule-rename-open') { ed.step = 'rename'; return host.draw(true); }
  if (act === 'schedule-icon') {
    host.menu = null;
    host.draw();
    return openMoreInfo(host.frame(), src.scheduleEntity(ed.id), 'settings');
  }
  if (act === 'schedule-delete') { ed.step = 'delete'; return host.draw(); }
  const schedules = src.schedules();
  const keep: any[] = schedules.map((id) => ({ id }));
  const nameInput: any = host.frame().querySelector('input[data-sched-name]');
  const checkName = (except) => {
    const name = nameInput ? nameInput.value.trim() : '';
    const taken = schedules.some((m) => m !== except && src.scheduleName(m).trim().toLowerCase() === name.toLowerCase());
    host.error = !name ? t('nameRequired') : taken ? t('nameTaken') : '';
    if (host.error) host.draw(true, name);
    return host.error ? null : name;
  };
  let list;
  let created = false;
  if (act === 'schedule-create') {
    const name = checkName(null);
    if (!name) return undefined;
    list = [...keep, ed.copy ? { name, copy_of: ed.copy } : { name }];
    created = true;
  } else if (act === 'schedule-rename') {
    const name = checkName(ed.id);
    if (!name) return undefined;
    list = keep.map((m) => (m.id === ed.id ? { id: m.id, name } : m));
  } else if (act === 'schedule-move') {
    const i = keep.findIndex((m) => m.id === ed.id);
    const j = i + Number(ds.dir);
    if (i < 0 || j < 0 || j >= keep.length) return undefined;
    [keep[i], keep[j]] = [keep[j], keep[i]];
    list = keep;
  } else if (act === 'schedule-delete-confirm') {
    list = keep.filter((m) => m.id !== ed.id);
  } else return undefined;
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
