// The access level (#99): an admin chooses what users who are not admins may change. Use: the
// overrides, the pause and the active schedule. Plan: also the weeks and the schedules, from the
// cards. Set up: also the Chauffage panel. An admin can always do everything
// (docs/decisions.md, "Who may do what").
import { fakeHass, createCard, cleanup, integrationData, fakeDialogManager, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
// The salon is scheduled, the bureau is not
const WEEKS = { 'climate.salon': { Normal: WEEK } };
const BOTH = { 'climate.salon': { Normal: WEEK }, 'climate.bureau': { Normal: WEEK } };
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (root, selector) => root.shadowRoot.querySelector(selector);
const $$ = (root, selector) => [...root.shadowRoot.querySelectorAll(selector)];
const pointer = (el, type, clientX = 0) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }));
const geometry = (el) => { el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, right: 1440, bottom: 40, height: 40 }); return el; };
const override = { kind: 'temperature', value: 21.5, start: '2026-10-12T09:30:00+02:00', end: '2026-10-12T11:30:00+02:00', ends_at: 'next_slot' };

// The integration's data at an access level ('admin': an admin, whatever the access level)
function dataAt(level, { weeks = WEEKS, ...more } = {}) {
  return { ...integrationData({ weeks, ...more }), access_level: level === 'admin' ? 'use' : level };
}

// Home Assistant for a user at an access level
function as(level, { weeks, overrides, reply, locale } = {}) {
  const hass = fakeHass({ data: dataAt(level, { weeks, overrides }), reply, ...(locale ? { locale } : {}) });
  if (level !== 'admin') hass.user = { is_admin: false };
  hass.panels = { chauffage: { url_path: 'chauffage', title: 'Chauffage' } };
  hass.entities['switch.salon_control'] = { entity_id: 'switch.salon_control', device_id: 'salon-scheduled' };
  hass.devices = {
    'salon-device': { id: 'salon-device', name: 'Vanne salon', model: 'TRV' },
    'salon-scheduled': { id: 'salon-scheduled', name: 'Salon', model: 'Thermostat programmé' },
  };
  return hass;
}

// The access level changed by an admin: the integration pushes its data again
const changeTo = (hass, level, more = {}) => hass.push(dataAt(level, more));

const card = (hass, config = {}) => createCard(hass, { show: ['climate.salon'], group_days: false, ...config });
const bar = (c, climate = 'climate.salon', d = 0) => geometry($(c, `.bar[data-climate="${climate}"][data-day="${d}"]`));
const dayMenu = (c, d = 0, climate = 'climate.salon') => {
  $(c, `[data-act="menu"][data-climate="${climate}"][data-day="${d}"]`).click();
  return $$(c, '.menu .mi').map((b) => b.dataset.act);
};

describe('the access level in the schedule card', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') })); // a Monday
  afterEach(() => { mock.timers.reset(); cleanup(); });

  test('with Use, the weeks are read-only: no handle, no hint, no tab ⋮ or +, no copy of a week', () => {
    const c = card(as('use'));
    assert.equal($(c, '.handle'), null);
    assert.equal($(c, '.hint'), null);
    assert.equal($(c, '[data-act="schedule-menu"]'), null);
    assert.equal($(c, '[data-act="schedule-new"]'), null);
    assert.equal($(c, '[data-act="copyweek-menu"]'), null);
  });

  test('with Use, tapping or dragging a slot changes nothing and opens nothing', () => {
    const c = card(as('use'));
    const seg = bar(c).querySelector('.seg[data-idx="1"]');
    pointer(seg, 'pointerdown', 400);
    pointer(seg, 'pointermove', 500);
    pointer(seg, 'pointerup', 500);
    bar(c).querySelector('.seg[data-idx="2"]').click();
    assert.equal($(c, '.editor'), null);
    bar(c).querySelector('.seg[data-idx="2"]').click(); // a double tap would cut the slot
    assert.equal(c._dirty, false);
    assert.equal(c._week('climate.salon')[0].length, 5);
  });

  test("with Use, a day's ⋮ only offers a new override, on today", () => {
    const c = card(as('use'));
    assert.deepEqual(dayMenu(c, 0), ['override-new']);
    c._menu = null;
    c._render();
    assert.ok($(c, '[data-act="menu"][data-day="1"]').disabled, 'nothing to offer on another day');
  });

  test('with Use, a right click on a day opens no copy or paste', () => {
    const c = card(as('use'));
    bar(c, 'climate.salon', 1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 50 }));
    assert.equal($(c, '.menu [data-act="copy-day"], .menu [data-act="paste-day"]'), null);
  });

  test('with Use, the overrides, the pause and the active schedule still work', () => {
    const hass = as('use');
    const c = card(hass);
    assert.ok(dayMenu(c, 0).includes('override-new'));
    c._action('override-new', { climate: 'climate.salon' });
    assert.ok($(c, '.editor'), 'the override popover opens');
    c._schedule = 'away';
    c._render();
    $(c, '[data-act="activate-schedule"]').click();
    assert.equal(hass.events.at(-1).type, 'chauffage/schedule/activate');
  });

  test('with Plan, the weeks and the schedules are edited from the card', () => {
    const c = card(as('plan'));
    assert.ok($(c, '.handle'));
    assert.ok($(c, '.hint'));
    assert.ok($(c, '[data-act="schedule-menu"]'));
    assert.ok($(c, '[data-act="schedule-new"]'));
    assert.ok($(c, '[data-act="copyweek-menu"]'));
    assert.deepEqual(dayMenu(c, 0).slice(0, 2), ['copy-day', 'paste-day']);
    c._menu = null;
    bar(c).querySelector('.seg[data-idx="2"]').click();
    assert.ok($(c, '.editor'));
  });

  test('with Plan, no way to the panel: no panel button, no "Set the presets"', () => {
    const c = card(as('plan'));
    assert.equal($(c, '.panel-open'), null);
    assert.equal($(c, '.settings-link'), null);
    assert.equal($(c, '[data-navigate^="/chauffage"]'), null);
  });

  test('with Plan, the week of a thermostat Chauffage does not schedule stays read-only: editing it would schedule it', () => {
    const c = card(as('plan'), { show: ['climate.salon', 'climate.bureau'] });
    assert.ok(bar(c, 'climate.bureau').classList.contains('ro'));
    assert.ok(!bar(c, 'climate.salon').classList.contains('ro'));
    assert.equal(text($(c, '.unscheduled-note')), 'Chauffage ne programme pas Bureau.');
    bar(c, 'climate.bureau').querySelector('.seg').click();
    assert.equal($(c, '.editor'), null);
    $(c, '[data-act="copyweek-menu"]').click();
    assert.equal($(c, '.copyweek-menu [data-climate="climate.bureau"]'), null, 'no copy to the bureau');
    assert.ok($(c, '.copyweek-menu [data-climate="climate.salon"]'));
  });

  test('with Set up, the card leads to the panel, and schedules a thermostat by editing its week', () => {
    const c = card(as('set_up'), { show: ['climate.salon', 'climate.bureau'] });
    assert.ok($(c, '.panel-open[data-navigate="/chauffage"]'));
    assert.ok($(c, '.settings-link[data-navigate="/chauffage/presets"]'));
    assert.ok(!bar(c, 'climate.bureau').classList.contains('ro'));
    assert.match(text($(c, '.unscheduled-note')), /modifiez sa semaine pour le programmer/);
  });

  test('an admin sees everything, whatever the access level', () => {
    const c = card(as('admin'), { show: ['climate.salon', 'climate.bureau'] });
    assert.ok($(c, '.panel-open'));
    assert.ok($(c, '.handle'));
    assert.ok(!bar(c, 'climate.bureau').classList.contains('ro'));
    assert.ok($(c, '[data-act="schedule-new"]'));
  });

  test('a save refused by the integration says the access level does not allow it', async () => {
    const hass = as('plan', { reply: (msg) => { if (msg.type === 'chauffage/weeks/save') throw { code: 'unauthorized', message: 'Unauthorized' }; return null; } });
    const c = card(hass);
    c._split('climate.salon', 0, 12 * 60);
    await c._save();
    assert.equal(text($(c, '.msg')), 'Votre niveau d’accès ne le permet pas.');
  });

  test('in English', async () => {
    const hass = as('plan', { locale: { language: 'en' }, reply: () => { throw { code: 'unauthorized', message: 'Unauthorized' }; } });
    const c = card(hass);
    c._split('climate.salon', 0, 12 * 60);
    await c._save();
    assert.equal(text($(c, '.msg')), 'Your access level doesn’t allow this.');
  });

  test('the access level rises: the tools appear without a reload', () => {
    const hass = as('use');
    const c = card(hass);
    assert.equal($(c, '.handle'), null);
    changeTo(hass, 'plan');
    assert.ok($(c, '.handle'));
    assert.ok($(c, '[data-act="schedule-new"]'));
    changeTo(hass, 'set_up');
    assert.ok($(c, '.panel-open'));
  });

  test('the access level drops with weeks not saved: the edits stay until Cancel, but cannot be saved', async () => {
    const hass = as('plan');
    const c = card(hass);
    c._split('climate.salon', 0, 12 * 60);
    const edited = c._week('climate.salon')[0].length;
    assert.ok($(c, '[data-act="save"]'));
    changeTo(hass, 'use');
    assert.equal(c._dirty, true);
    assert.equal(c._week('climate.salon')[0].length, edited, 'the edit is kept');
    assert.equal($(c, '.handle'), null);
    assert.equal($(c, '[data-act="save"]'), null);
    assert.ok($(c, '[data-act="cancel"]'));
    assert.equal(text($(c, '.msg')), 'Votre niveau d’accès ne le permet pas.');
    assert.equal(await c._save(), false, 'nothing is sent');
    assert.ok(!hass.events.some((m) => m.type === 'chauffage/weeks/save'));
    $(c, '[data-act="cancel"]').click();
    assert.equal(c._dirty, false);
    assert.equal(c._week('climate.salon')[0].length, 5);
    assert.equal(text($(c, '.msg')), '');
  });

  test('the access level drops after a copy: the message says the access level, not the copy', () => {
    const hass = as('plan');
    const c = card(hass);
    c._copyDay('climate.salon', 0, 'weekend');
    assert.match(text($(c, '.msg')), /copié/);
    changeTo(hass, 'use');
    assert.equal(text($(c, '.msg')), 'Votre niveau d’accès ne le permet pas.');
  });
});

describe('the access level in the more-info block', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); window.history.replaceState(null, '', '/'); });

  const block = (hass, entity = 'climate.salon') => {
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = entity;
    el.hass = hass;
    return el;
  };
  // Dashboards: a view with the salon's thermostat card, then a view with a schedule card
  const withDashboards = (hass, views) => {
    const base = hass.callWS;
    hass.callWS = async (msg) => {
      if (msg.type === 'lovelace/dashboards/list') return [];
      if (msg.type === 'lovelace/config') return { views };
      return base(msg);
    };
    return hass;
  };
  const VIEWS = [
    { title: 'Salon', path: 'salon', cards: [{ type: 'custom:chauffage-thermostat-card', entity: 'climate.salon' }] },
    { title: 'Semaine', path: 'semaine', cards: [{ type: 'custom:chauffage-programme-card', thermostats: ['climate.salon'] }] },
  ];

  test('with Use: the schedule\'s name is text, no "Edit its week", the reason of the end is text', () => {
    const el = block(as('use', { overrides: { 'climate.salon': override } }));
    assert.equal($(el, '[data-navigate]'), null);
    assert.equal($(el, '[data-open-settings]'), null);
    assert.equal($(el, '.week[role="link"]'), null);
  });

  test('with Plan, "Edit its week" opens the dashboard view with a schedule card of this thermostat', async () => {
    const hass = withDashboards(as('plan', { overrides: { 'climate.salon': override } }), VIEWS);
    const el = block(hass);
    await tick();
    assert.equal($(el, '.title [data-navigate]'), null, 'the schedule\'s page is in the panel');
    assert.equal($(el, '[data-open-settings]'), null);
    const link = $(el, '.foot [data-navigate]');
    assert.equal(text(link), 'Modifier sa semaine');
    assert.equal(link.dataset.navigate, '/lovelace/semaine');
    assert.equal($(el, '.week[role="link"]').dataset.navigate, '/lovelace/semaine');
    link.click();
    await tick();
    assert.equal(window.location.pathname, '/lovelace/semaine');
  });

  test('with Plan, no "Edit its week" without a schedule card of this thermostat', async () => {
    const hass = withDashboards(as('plan'), VIEWS.slice(0, 1));
    const el = block(hass);
    await tick();
    assert.equal($(el, '.foot [data-navigate]'), null);
    assert.equal($(el, '.week[role="link"]'), null);
  });

  test('with Plan, on the view itself, "Edit its week" only closes the dialog', async () => {
    window.history.replaceState(null, '', '/lovelace/semaine');
    const hass = withDashboards(as('plan'), VIEWS);
    const el = block(hass);
    await tick();
    const closed = [];
    el.addEventListener('hass-more-info', (e) => closed.push(e.detail.entityId));
    const length = window.history.length;
    $(el, '.foot [data-navigate]').click();
    await tick();
    assert.deepEqual(closed, [null]);
    assert.equal(window.history.length, length, 'no new page');
  });

  test('with Set up: the panel, the settings, but no device', () => {
    const el = block(as('set_up', { overrides: { 'climate.salon': override } }));
    assert.equal($(el, '.foot [data-navigate]').dataset.navigate, '/chauffage/thermostats/climate.salon?week=normal');
    assert.ok($(el, '.title [data-navigate="/chauffage/schedules/normal"]'));
    assert.ok($(el, '[data-open-settings]'));
    assert.equal($(el, '[data-device]'), null);
  });
});

describe('the access level in the thermostat card', () => {
  afterEach(() => cleanup());
  const cardFor = (hass, entity) => {
    hass.states['climate.cuisine'] = { state: 'heat', attributes: { friendly_name: 'Cuisine', current_temperature: 18 }, last_updated: '1' };
    const el = document.createElement('chauffage-thermostat-card');
    el.setConfig({ type: 'custom:chauffage-thermostat-card', entity });
    document.body.appendChild(el);
    el.hass = hass;
    return el;
  };

  test('a thermostat Chauffage does not schedule: says so, and Set up schedules it from the panel', () => {
    const plan = cardFor(as('plan'), 'climate.cuisine');
    assert.equal(text($(plan, '.msg')), 'Chauffage ne programme pas ce thermostat.');
    assert.equal($(plan, '[data-navigate]'), null);
    cleanup();
    const setUp = cardFor(as('set_up'), 'climate.cuisine');
    const link = $(setUp, '.msg [data-navigate="/chauffage/thermostats"]');
    assert.equal(text(link), 'Le programmer');
    link.click();
    assert.equal(window.location.pathname, '/chauffage/thermostats');
  });
});

describe('the access level in the panel', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T10:00:00+02:00') });
    window.loadCardHelpers = async () => ({ createCardElement: (config) => Object.assign(document.createElement('div'), { config }) });
  });
  afterEach(() => { mock.timers.reset(); delete window.loadCardHelpers; cleanup(); window.history.replaceState(null, '', '/'); });

  const panel = (hass, path) => {
    window.history.replaceState(null, '', `/chauffage${path}`);
    const el = document.createElement('chauffage-panel');
    document.body.appendChild(el);
    el.hass = hass;
    el.panel = hass.panels.chauffage;
    el.route = { prefix: '/chauffage', path };
    return el;
  };
  const list = (el) => $(el, 'chauffage-programme-card');

  test('with Set up: the tabs and the ⚙, but no device and no integration page', () => {
    const el = panel(as('set_up', { weeks: BOTH }), '/thermostats');
    assert.equal($$(el, 'nav.tabs .tab').length, 3);
    assert.ok($(el, '.toolbar [data-open-settings]'));
    const view = list(el);
    assert.equal($(view, '.th-foot'), null, 'no integration page');
    $(view, '[data-act="thermostat-more"][data-climate="climate.salon"]').click();
    assert.ok($(view, '.th-menu [data-act="thermostat-forget"]'));
    assert.equal($(view, '.th-menu [data-device]'), null);
  });

  test('an admin gets the devices and the integration page', () => {
    const view = list(panel(as('admin', { weeks: BOTH }), '/thermostats'));
    assert.ok($(view, '.th-foot [data-navigate="/config/integrations/integration/chauffage"]'));
    $(view, '[data-act="thermostat-more"][data-climate="climate.salon"]').click();
    assert.ok($(view, '.th-menu [data-device]'));
  });

  test('admins are told once of the access level, and its Settings open the dialog', async () => {
    const hass = as('admin', { weeks: BOTH });
    const manager = fakeDialogManager(hass);
    const el = panel(hass, '/thermostats');
    const notice = $(el, '.notice.new-setting');
    assert.match(text(notice), /Nouveau : laissez les utilisateurs non administrateurs programmer les semaines\./);
    notice.querySelector('[data-open-settings]').click();
    await tick();
    assert.deepEqual(manager.open, ['chauffage-settings-dialog']);
    assert.equal($(el, '.notice.new-setting'), null, 'told once');
  });
});

describe('the access level in the settings dialog', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T10:00:00+02:00') }));
  afterEach(() => { mock.timers.reset(); cleanup(); });

  const settings = (hass) => {
    const el = document.createElement('chauffage-settings-dialog');
    document.body.appendChild(el);
    el.hass = hass;
    el.showDialog({});
    return el;
  };
  const choices = (el) => $$(el, '.access-settings [data-access-level]');
  const pick = (el, value) => {
    const radio = choices(el).find((c) => c.value === value);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  };

  test('an admin chooses the access level among Use, Plan and Set up, the current one checked', () => {
    const el = settings(as('admin'));
    assert.equal(text($(el, '.access-settings h3')), 'Niveau d’accès');
    assert.equal(text($(el, '.access-settings .intro')), 'Pour les utilisateurs non administrateurs.');
    assert.deepEqual(choices(el).map((c) => c.value), ['use', 'plan', 'set_up']);
    assert.deepEqual(choices(el).map((c) => c.checked), [true, false, false]);
    assert.deepEqual(choices(el).map((c) => text(c.closest('label').querySelector('.choice-label'))), [
      'Utiliser (par défaut) Dérogations, pause, planning actif',
      'Programmer Aussi les semaines et les plannings, depuis les cartes',
      'Configurer Aussi le panneau Chauffage : préréglages, règles, thermostats Leurs changements touchent toutes les pièces.',
    ]);
  });

  test('the warning of Set up is inside its choice, and always shown', () => {
    const el = settings(as('admin'));
    const warning = $(el, '.access-settings .warning');
    assert.equal(text(warning), 'Leurs changements touchent toutes les pièces.');
    assert.equal(warning.closest('label').querySelector('input').value, 'set_up');
  });

  test('a choice is sent at once, and says it is saved', async () => {
    const hass = as('admin');
    const el = settings(hass);
    pick(el, 'plan');
    await tick();
    assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', access_level: 'plan' });
    assert.match(text($(el, '.access-settings .saved')), /Enregistré/);
  });

  test('the note on the sidebar shows only while Set up is chosen', () => {
    const hass = as('admin');
    const el = settings(hass);
    assert.equal($(el, '.access-settings .sidebar-note'), null);
    hass.push({ ...dataAt('admin'), access_level: 'set_up' });
    assert.equal(text($(el, '.access-settings .sidebar-note')), 'Chacun peut masquer Chauffage de sa barre latérale, dans son profil.');
  });

  // Home Assistant may open the dialog before it puts it on the page (the first open after a load)
  const openedBeforeConnected = (hass, params = {}) => {
    const el = document.createElement('chauffage-settings-dialog');
    el.hass = hass;
    el.showDialog(params);
    document.body.appendChild(el);
    return el;
  };

  test('opened before Home Assistant puts it on the page, the dialog is filled once there', () => {
    const el = openedBeforeConnected(as('admin'));
    assert.deepEqual(choices(el).map((c) => c.checked), [true, false, false]);
    assert.equal($$(el, '.override-settings [data-override-end]').length, 3);
  });

  test('opened from the notice, the dialog scrolls to the access level once it is filled', async () => {
    const scrolled = [];
    const scrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = function record() { scrolled.push([this.className, this.querySelectorAll('[data-access-level]').length]); };
    try {
      openedBeforeConnected(as('admin'), { section: 'access' });
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
      assert.deepEqual(scrolled, [['access-settings', 3]]);
    } finally {
      window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    }
  });

  test('a user with Set up sets the overrides, not the access level', () => {
    const el = settings(as('set_up'));
    assert.ok($(el, '.override-settings'));
    assert.equal($(el, '.access-settings'), null);
    assert.equal($(el, '.foot'), null);
  });

  test('in English', () => {
    const el = settings(as('admin', { locale: { language: 'en' } }));
    assert.equal(text($(el, '.access-settings h3')), 'Access level');
    assert.deepEqual(choices(el).map((c) => text(c.closest('label').querySelector('.choice-label'))), [
      'Use (default) Overrides, pause, active schedule',
      'Plan Also the weeks and the schedules, from the cards',
      'Set up Also the Chauffage panel: presets, rules, thermostats Their changes reach every room.',
    ]);
  });
});
