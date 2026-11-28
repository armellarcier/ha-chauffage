// The Chauffage panel (#57): where an admin configures Chauffage, lists then sheets, one address
// per page (docs/decisions.md, "Chauffage panel and devices"). Dashboard cards link to it.
import { fakeHass, createCard, cleanup, integrationData, fakeDialogManager, WEEKDAY, WEEKEND } from './helpers.mjs';
import { ChauffagePanel, leaveMoreInfo, ICONS, reloadPage, VERSION } from '../../frontend/src/index.ts';
import { copyDay, cutSlot, day, drawn, openMenu, redraw, settle } from './driver.mjs';
import { historyAsked, scheduleShown, unsavedWeeks, watchReloads, wholeWeek } from './driver.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
const HOLIDAY = Array(7).fill(['00:00 frost']);
const WEEKS = { 'climate.salon': { Normal: WEEK, Vacances: HOLIDAY, Absent: HOLIDAY }, 'climate.bureau': { Normal: WEEK, Vacances: HOLIDAY, Absent: HOLIDAY } };
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (root, selector) => root.shadowRoot.querySelector(selector);
const $$ = (root, selector) => [...root.shadowRoot.querySelectorAll(selector)];

function setup(more = {}) {
  const hass = fakeHass({ weeks: WEEKS, ...more });
  hass.panels = { chauffage: { url_path: 'chauffage', title: 'Chauffage' } };
  hass.entities['switch.salon_control'] = { entity_id: 'switch.salon_control', device_id: 'salon-scheduled' };
  hass.devices = {
    'salon-device': { id: 'salon-device', name: 'Vanne salon', model: 'TRV' },
    'salon-scheduled': { id: 'salon-scheduled', name: 'Salon', model: 'Thermostat programmé' },
  };
  return hass;
}

// The panel as Home Assistant shows it: its element, then hass, the panel and the route
async function panel(hass, path) {
  window.history.replaceState(null, '', `/chauffage${path}`);
  const el = document.createElement('chauffage-panel');
  document.body.appendChild(el);
  el.hass = hass;
  el.panel = hass.panels.chauffage;
  el.route = { prefix: '/chauffage', path };
  await drawn(el);
  return el;
}
// The cards and the views of the page, in their order: a view is in its frame
const cards = (el) => $$(el, 'chauffage-programme-card, chauffage-view-frame');

describe('the Chauffage panel', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T10:00:00+02:00') }); // a Wednesday
    // Home Assistant's card helpers, as a dashboard loads them (the tile of a thermostat's sheet)
    window.loadCardHelpers = async () => ({
      createCardElement: (config) => Object.assign(document.createElement('div'), { className: 'tile-card', config }),
    });
  });
  afterEach(() => { mock.timers.reset(); delete window.loadCardHelpers; cleanup(); });

  describe('its addresses', () => {
    test('/chauffage opens the first tab, Thermostats', async () => {
      await panel(setup(), '');
      assert.equal(window.location.pathname, '/chauffage/thermostats');
    });

    test('/chauffage/rules opens the Schedules page: the rules live with the schedules', async () => {
      await panel(setup(), '/rules');
      assert.equal(window.location.pathname, '/chauffage/schedules');
    });

    test('the first prototype\'s address of a thermostat redirects to its sheet', async () => {
      await panel(setup(), '/climate.salon');
      assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    });

    test('the address of a renamed thermostat redirects to its new id', async () => {
      const data = integrationData({ weeks: WEEKS });
      data.renamed = { 'climate.vieux_salon': 'climate.salon' };
      await panel(setup({ data }), '/thermostats/climate.vieux_salon');
      assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    });

    test('a deleted schedule\'s sheet goes back to the list of schedules', async () => {
      await panel(setup(), '/schedules/disparu');
      assert.equal(window.location.pathname, '/chauffage/schedules');
    });

    test('no redirect before Home Assistant gives the address (it sets the route after hass)', async () => {
      window.history.replaceState(null, '', '/chauffage/thermostats/climate.salon');
      const el = document.createElement('chauffage-panel');
      document.body.appendChild(el);
      el.hass = setup(); await settle();
      assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    });
  });

  describe('lists and sheets', () => {
    test('a list shows the panel\'s three tabs, the current one marked, and Home Assistant\'s menu button', async () => {
      const el = await panel(setup(), '/thermostats');
      assert.deepEqual($$(el, '.tab').map(text), ['Thermostats', 'Plannings', 'Préréglages']);
      assert.equal(text($(el, '.tab.on')), 'Thermostats');
      assert.ok($(el, 'ha-menu-button'));
      $$(el, '.tab')[2].click(); await settle();
      assert.equal(window.location.pathname, '/chauffage/presets');
    });

    test('a sheet has no tabs: its title is a breadcrumb whose list is a link', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      assert.equal($(el, '.tab'), null);
      assert.match(text($(el, '.crumbs')), /^Thermostats\s*›\s*Salon$/);
      $(el, '.crumbs a').click(); await settle();
      assert.equal(window.location.pathname, '/chauffage/thermostats');
    });

    test('the panel\'s icon is the integration\'s own, drawn by the card', async () => {
      assert.ok(window.customIcons.chauffage);
      assert.deepEqual(await window.customIcons.chauffage.getIcon('logo'), { path: ICONS.logo });
    });
  });

  describe('the Schedules page', () => {
    const list = (el) => cards(el).find((c) => $(c, '.schedules-view'));
    const row = (el, id) => $(list(el), `.th-row[data-schedule="${id}"]`);

    test('lists the schedules as the Thermostats tab lists the thermostats: the active one marked, the others activated from their ⋮', async () => {
      const hass = setup();
      const el = await panel(hass, '/schedules');
      assert.deepEqual($$(list(el), '.th-row').map((r) => r.dataset.schedule), ['normal', 'away', 'holiday']);
      assert.equal(text(row(el, 'normal').querySelector('.th-main')), 'Normal Actif');
      assert.equal(row(el, 'holiday').querySelector('button[data-navigate], .name'), null, 'no Edit button: the row opens the sheet');
      assert.equal(row(el, 'holiday').querySelector('[data-act="activate-schedule"]'), null, 'no button on the row: it broke the layout');
      row(el, 'holiday').querySelector('[data-act="schedule-menu"]').click(); await settle();
      $(list(el), '.sched-menu [data-act="activate-schedule"]').click(); await settle();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/schedule/activate', schedule: 'holiday', source: 'panel' }, 'the logbook names the panel');
      assert.equal(window.location.pathname, '/chauffage/schedules', 'activating does not open the sheet');
      assert.equal($(list(el), '.sched-menu'), null, 'the menu closes after Activate');
    });

    test('the active schedule\'s ⋮ offers no Activate', async () => {
      const el = await panel(setup(), '/schedules');
      row(el, 'normal').querySelector('[data-act="schedule-menu"]').click(); await settle();
      assert.equal($(list(el), '.sched-menu [data-act="activate-schedule"]'), null);
    });

    test('its rows fill a card of their own; + New schedule sits under it, as the form to add a thermostat', async () => {
      const el = await panel(setup(), '/schedules');
      const card = list(el);
      assert.ok($(card, 'ha-card').classList.contains('flat'), 'the list is the card: no card around it');
      assert.deepEqual([...$(card, '.th-list').children].map((r) => r.dataset.schedule), ['normal', 'away', 'holiday']);
      assert.equal($(card, '.th-list [data-act="schedule-new"]'), null);
      assert.ok($(card, '.th-add [data-act="schedule-new"]'));
    });

    test('the whole row opens the schedule\'s sheet, its chevron and its end too', async () => {
      const el = await panel(setup(), '/schedules');
      row(el, 'away').querySelector('.th-main').click(); await settle();
      assert.equal(window.location.pathname, '/chauffage/schedules/away');
      window.history.pushState(null, '', '/chauffage/schedules');
      row(el, 'away').querySelector('.th-chevron').click(); await settle();
      assert.equal(window.location.pathname, '/chauffage/schedules/away');
      window.history.pushState(null, '', '/chauffage/schedules');
      row(el, 'away').querySelector('.th-divider').click(); await settle();
      assert.equal(window.location.pathname, '/chauffage/schedules/away');
    });

    test('a schedule\'s page names it in its breadcrumb, renamed too', async () => {
      const hass = setup();
      const el = await panel(hass, '/schedules/away');
      const crumb = () => text($(el, '.crumbs [data-fill="crumb"]'));
      assert.equal(crumb(), 'Absent');
      const data = integrationData({ weeks: WEEKS });
      data.schedules = data.schedules.map((s) => (s.id === 'away' ? { ...s, name: 'Sortis' } : s));
      hass.push(data); await settle();
      assert.equal(crumb(), 'Sortis');
    });

    test('its ⋮ menu renames, moves up or down, deletes the schedule', async () => {
      const el = await panel(setup(), '/schedules');
      row(el, 'away').querySelector('[data-act="schedule-menu"]').click(); await settle();
      const menu = $(list(el), '.sched-menu');
      assert.match(text(menu), /Renommer.*Monter.*Descendre.*Supprimer/);
      assert.doesNotMatch(text(menu), /Détails et historique/);
    });

    test('+ New schedule creates an empty one or a copy, checks its name, then opens its sheet', async () => {
      const hass = setup();
      const el = await panel(hass, '/schedules');
      $(list(el), '[data-act="schedule-new"]').click(); await settle();
      $(list(el), '[data-act="schedule-pick"][data-copy="normal"]').click(); await settle();
      $(list(el), 'input[data-sched-name]').value = 'normal';
      $(list(el), '[data-act="schedule-create"]').click(); await settle();
      assert.match(text($(list(el), '.sched-menu')), /Ce nom est déjà utilisé/);
      $(list(el), 'input[data-sched-name]').value = 'Télétravail';
      $(list(el), '[data-act="schedule-create"]').click(); await settle();
      await tick();
      const sent = hass.events.at(-1);
      assert.equal(sent.type, 'chauffage/schedules/set');
      assert.deepEqual(sent.schedules.at(-1), { name: 'Télétravail', copy_of: 'normal' });
      assert.equal(window.location.pathname, '/chauffage/schedules/teletravail');
    });

    test('shows the activation rules below the schedules', async () => {
      const el = await panel(setup(), '/schedules');
      const rules = cards(el).find((c) => $(c, '.rules-view'));
      assert.ok($(rules, '.rule, [data-act="rule-add"]'));
      assert.equal(cards(el).indexOf(rules), 1, 'below the list');
    });
  });

  test('the panel\'s tabs load no history: they never show one', async () => {
    localStorage.setItem('chauffage-programme-card:history', '1'); // shown on the dashboard cards
    const hass = setup();
    for (const path of ['/thermostats', '/schedules', '/presets']) panel(hass, path);
    assert.deepEqual(hass.events.filter((m) => m.type === 'chauffage/history'), []);
  });

  describe('welcoming a new user', () => {
    // A new installation: no thermostat scheduled yet; Home Assistant has the salon and the bureau
    const fresh = (more = {}) => setup({ weeks: {}, ...more });
    const pick = async (el, climate) => {
      const box = $(el, `.welcome input[data-pick="${climate}"]`);
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    };

    test('an update of Home Assistant keeps the keyboard focus: the parts that did not change stay the same', async () => {
      const hass = fresh();
      const el = await panel(hass, '/thermostats');
      await pick(el, 'climate.salon');
      const box = $(el, '.welcome input[data-pick="climate.salon"]');
      box.focus();
      el.hass = { ...hass, states: { ...hass.states } }; await settle(); // a state changed elsewhere
      assert.equal($(el, '.welcome input[data-pick="climate.salon"]'), box, 'the same box');
      assert.equal(el.shadowRoot.activeElement, box);
    });

    test('the Thermostats page welcomes them: what Chauffage does in a sentence, every thermostat to tick', async () => {
      const el = await panel(fresh(), '/thermostats');
      assert.equal(cards(el).length, 0, 'no empty list');
      assert.equal(text($(el, '.welcome h2')), 'Bienvenue dans Chauffage');
      assert.equal(text($(el, '.welcome h2 + p')), 'Chauffage donne à vos thermostats un planning pour la semaine. Commencez par les choisir.');
      assert.equal($(el, '.welcome .steps'), null, 'the next steps come once, after the first thermostat');
      const boxes = $$(el, '.welcome input[data-pick]');
      assert.deepEqual(boxes.map((b) => b.dataset.pick), ['climate.bureau', 'climate.salon']);
      assert.ok(boxes.every((b) => !b.checked), 'none ticked: scheduling a thermostat controls it at once');
      assert.match(text($(el, '.welcome')), /Bureau.*Salon/);
    });

    test('schedules the thermostats ticked, all at once; the button waits for one', async () => {
      const hass = fresh();
      const el = await panel(hass, '/thermostats');
      assert.ok($(el, '[data-start]').disabled);
      await pick(el, 'climate.salon');
      assert.equal(text($(el, '[data-start]')), 'Programmer 1 thermostat');
      await pick(el, 'climate.bureau');
      assert.equal(text($(el, '[data-start]')), 'Programmer 2 thermostats');
      assert.ok(!$(el, '[data-start]').disabled);
      assert.match(text($(el, '.welcome .note')), /^Chauffage les pilote tout de suite\. Tant que vous n'avez pas réglé leurs semaines, ils restent en Éco\.$/);
      $(el, '[data-start]').click(); await settle();
      assert.deepEqual(hass.events.at(-1), {
        type: 'chauffage/weeks/save',
        weeks: { 'climate.bureau': {}, 'climate.salon': {} },
        revisions: { 'climate.bureau': null, 'climate.salon': null },
      });
    });

    test('with no thermostat in Home Assistant, says so and leads to adding one', async () => {
      const hass = fresh();
      hass.states = {};
      const el = await panel(hass, '/thermostats');
      assert.match(text($(el, '.welcome')), /Home Assistant n'a encore aucun thermostat/);
      $(el, '.welcome [data-navigate]').click(); await settle();
      assert.equal(window.location.pathname, '/config/integrations/dashboard');
    });

    test('once the first thermostats are scheduled, says what to do next, until closed', async () => {
      const hass = fresh();
      const el = await panel(hass, '/thermostats');
      await pick(el, 'climate.salon');
      $(el, '[data-start]').click(); await settle();
      hass.push(integrationData({ weeks: { 'climate.salon': { Normal: WEEK } } })); await settle(); // the integration schedules it
      assert.equal($(el, '.welcome'), null);
      assert.ok(cards(el).length, 'the list of thermostats');
      assert.match(text($(el, '.next-steps')), /Ouvrez un thermostat.*Plannings de chauffe/);
      $(el, '[data-close-next]').click(); await settle();
      assert.equal($(el, '.next-steps'), null);
      cleanup();
      assert.equal($(await panel(setup(), '/thermostats'), '.next-steps'), null, 'a user who did not start here sees none');
    });

    test('the next steps say how long a setpoint changed by hand lasts, with a button that opens the settings', async () => {
      const hass = fresh();
      const manager = fakeDialogManager(hass);
      const el = await panel(hass, '/thermostats');
      await pick(el, 'climate.salon');
      $(el, '[data-start]').click(); await settle();
      const data = integrationData({ weeks: { 'climate.salon': { Normal: WEEK } } });
      hass.push(data); await settle();
      assert.match(text($(el, '.next-steps')),
        /Une consigne changée à la main dure 2 h\. Ensuite, le thermostat reprend son planning\./);
      hass.push({ ...data, manual_override_end: 'next_slot_within_duration', override_duration: 90 }); await settle();
      assert.match(text($(el, '.next-steps')), /Une consigne changée à la main dure 1 h 30, ou moins si un créneau commence avant\. Ensuite/);
      hass.push({ ...data, manual_override_end: 'next_slot' }); await settle();
      assert.match(text($(el, '.next-steps')), /Une consigne changée à la main dure jusqu'au prochain créneau\. Ensuite/);
      assert.equal(text($(el, '.next-steps .btn[data-open-settings]')), 'Choisir la durée des dérogations');
      $(el, '.next-steps [data-open-settings]').click(); await settle();
      await tick();
      assert.deepEqual(manager.shown.map((d) => d.dialogTag), ['chauffage-settings-dialog']);
      assert.equal(window.location.pathname, '/chauffage/thermostats');
    });

    test('the next steps stay closed once closed, on this browser', async () => {
      const hass = fresh();
      const el = await panel(hass, '/thermostats');
      await pick(el, 'climate.salon');
      $(el, '[data-start]').click(); await settle();
      $(el, '[data-close-next]')?.click(); await settle();
      hass.push(integrationData({ weeks: { 'climate.salon': { Normal: WEEK } } })); await settle();
      $(el, '[data-close-next]').click(); await settle();
      el.remove();
      const again = await panel(hass, '/thermostats'); // the panel opened again, in the same browser
      assert.equal($(again, '.welcome'), null);
      assert.equal($(again, '.next-steps'), null);
    });

    test('before the first thermostat, the Schedules and Presets pages say so, with a link to the Thermostats tab', async () => {
      for (const path of ['/schedules', '/presets']) {
        const el = await panel(fresh(), path);
        assert.match(text($(el, '.notice')), /Aucun thermostat n'est encore programmé/, path);
        $(el, '.notice [data-navigate="/chauffage/thermostats"]').click(); await settle();
        assert.equal(window.location.pathname, '/chauffage/thermostats', path);
        cleanup();
      }
      assert.equal($(await panel(setup(), '/schedules'), '.notice'), null, 'no notice once a thermostat is scheduled');
    });

    test('speaks English', async () => {
      const el = await panel(fresh({ locale: { language: 'en' } }), '/thermostats');
      assert.equal(text($(el, '.welcome h2')), 'Welcome to Chauffage');
      assert.equal(text($(el, '[data-start]')), 'Schedule');
    });
  });

  describe('telling existing users about the new off behavior (#91)', () => {
    test('the Thermostats tab says once: a thermostat turned off by hand turns back on; its link opens the overrides page, in the user\'s language', async () => {
      const el = await panel(setup(), '/thermostats');
      assert.match(text($(el, '.notice.new-off')), /Nouveau : un thermostat éteint à la main se rallume à la fin de sa dérogation\. Pour le laisser éteint, désactivez Contrôler le mode HVAC./);
      const link = $(el, '.new-off a');
      assert.equal(text(link), 'En savoir plus');
      assert.match(link.href, /\/docs\/overrides\.fr\.md#%C3%A9teindre-un-thermostat-%C3%A0-la-main$/);
      assert.equal(link.target, '_blank');
      el.remove();
      const en = await panel(setup({ locale: { language: 'en' } }), '/thermostats');
      assert.match(text($(en, '.notice.new-off')), /^New: a thermostat turned off by hand turns back on/);
      assert.match($(en, '.new-off a').href, /\/docs\/overrides\.md#turn-a-thermostat-off-by-hand$/);
    });

    test('its Réglages button, next to Fermer, opens the settings at Contrôler le mode HVAC (#159)', async () => {
      const hass = setup();
      const manager = fakeDialogManager(hass);
      const el = await panel(hass, '/thermostats');
      assert.deepEqual($$(el, '.new-off .btn').map(text), ['Réglages', 'Fermer']);
      $(el, '.new-off [data-open-settings]').click(); await settle();
      await tick();
      assert.deepEqual(manager.shown.map((d) => [d.dialogTag, d.dialogParams.section]), [['chauffage-settings-dialog', 'hvac']]);
      assert.ok($(el, '.new-off'), 'the notice stays until it is closed');
    });

    test('closed, it stays closed on this browser', async () => {
      const el = await panel(setup(), '/thermostats');
      $(el, '.new-off [data-close-notice]').click(); await settle();
      assert.equal($(el, '.new-off'), null);
      el.remove(); // the panel opened again, in the same browser
      assert.equal($(await panel(setup(), '/thermostats'), '.new-off'), null);
    });

    test('a new user gets the next steps instead', async () => {
      const hass = setup({ weeks: {} });
      const el = await panel(hass, '/thermostats');
      const box = $(el, '.welcome input[data-pick="climate.salon"]');
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true })); await settle();
      $(el, '[data-start]').click(); await settle();
      hass.push(integrationData({ weeks: { 'climate.salon': { Normal: WEEK } } })); await settle();
      assert.ok($(el, '.next-steps'));
      assert.equal($(el, '.new-off'), null);
    });
  });

  describe('telling existing users about the new setting (#83)', () => {
    test('the Thermostats tab says once: new, choose how long a setpoint changed by hand lasts; its link opens the settings', async () => {
      // A user with Set up, who is not an admin: an admin is told of the access level instead (#99)
      const hass = setup({ data: { ...integrationData({ weeks: WEEKS }), access_level: 'set_up' } });
      hass.user = { is_admin: false };
      const manager = fakeDialogManager(hass);
      const el = await panel(hass, '/thermostats');
      assert.match(text($(el, '.notice.new-setting')), /Nouveau : choisissez combien de temps dure une dérogation\./);
      $(el, '.new-setting [data-open-settings]').click(); await settle();
      await tick();
      assert.deepEqual(manager.shown.map((d) => d.dialogTag), ['chauffage-settings-dialog']);
      assert.equal(window.location.pathname, '/chauffage/thermostats');
      assert.equal($(el, '.new-setting'), null, 'gone once the settings are open');
    });

    test('closed, it stays closed on this browser', async () => {
      const el = await panel(setup(), '/thermostats');
      $(el, '.new-setting [data-close-new-setting]').click(); await settle();
      assert.equal($(el, '.new-setting'), null);
      el.remove(); // the panel opened again, in the same browser
      assert.equal($(await panel(setup(), '/thermostats'), '.new-setting'), null);
    });

    test('once the settings are open, from anywhere, the notice is gone', async () => {
      const hass = setup();
      fakeDialogManager(hass);
      const el = await panel(hass, '/schedules');
      el.shadowRoot.querySelector('[data-open-settings]').click(); await settle();
      await tick();
      el.remove(); // the panel opened again, in the same browser
      assert.equal($(await panel(setup(), '/thermostats'), '.new-setting'), null);
    });

    test('a new user gets the next steps instead', async () => {
      const hass = setup({ weeks: {} });
      const el = await panel(hass, '/thermostats');
      const box = $(el, '.welcome input[data-pick="climate.salon"]');
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true })); await settle();
      $(el, '[data-start]').click(); await settle();
      hass.push(integrationData({ weeks: { 'climate.salon': { Normal: WEEK } } })); await settle();
      assert.ok($(el, '.next-steps'));
      assert.equal($(el, '.new-setting'), null);
    });
  });

  describe('a schedule\'s sheet', () => {
    test('shows every thermostat\'s week in this schedule, without tabs: the breadcrumb names it', async () => {
      const el = await panel(setup(), '/schedules/holiday');
      const [card] = cards(el);
      assert.equal(scheduleShown(card), 'holiday');
      assert.deepEqual($$(card, '.chip[data-climate]').map((c) => c.dataset.climate), ['climate.salon', 'climate.bureau']);
      assert.equal($(card, '.tabs'), null);
      assert.equal($(card, '[data-act="schedule-new"]'), null);
      assert.equal($(card, '[data-navigate="/chauffage/presets"]'), null); // in the panel, no link to set the presets
    });

    test('its ⋮, next to the breadcrumb, renames or deletes the schedule; it does not move it', async () => {
      const el = await panel(setup(), '/schedules/holiday');
      $(el, '.toolbar [data-page-menu]').click(); await settle();
      const menu = $(cards(el)[0], '.sched-menu');
      assert.match(text(menu), /Renommer.*Supprimer/);
      assert.equal(menu.querySelector('[data-act="schedule-move"]'), null);
    });

    test('its ⋮ pressed again closes the menu, as every ⋮', async () => {
      const el = await panel(setup(), '/schedules/holiday');
      const press = async () => {
        const button = $(el, '.toolbar [data-page-menu]');
        button.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, composed: true }));
        button.click();
        await settle();
      };
      await press();
      assert.ok($(cards(el)[0], '.sched-menu'));
      await press();
      assert.equal($(cards(el)[0], '.sched-menu'), null);
    });

    test('keeps the card\'s list to copy a week, and marks today even when the schedule is not active', async () => {
      const [card] = cards(await panel(setup(), '/schedules/holiday'));
      assert.ok($(card, '[data-act="copyweek-menu"]'));
      assert.notEqual($(card, '.foot').style.display, 'none');
      assert.equal($$(card, '.dgroup.today').length, 1);
    });
  });

  describe('a thermostat\'s sheet', () => {
    const weeks = (el) => cards(el).slice(1); // the presets first, then a week per schedule

    test('the line of the cards that show it holds its place while they load: the page does not move under a finger', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      assert.equal(text($(el, '.about .shown')), 'Affiché dans …');
      await tick();
      assert.match(text($(el, '.about .shown')), /^Affiché dans /);
      assert.doesNotMatch(text($(el, '.about .shown')), /…/);
    });

    test('its ⋮, next to the breadcrumb, opens the thermostat or forgets it, after a confirmation', async () => {
      const hass = setup();
      const el = await panel(hass, '/thermostats/climate.salon');
      $(el, '.toolbar [data-page-menu]').click(); await settle();
      assert.match(text($(el, '.page-menu')), /Ouvrir le thermostat.*Oublier/);
      $(el, '.page-menu [data-forget]').click(); await settle();
      assert.equal(hass.events.filter((m) => m.type === 'chauffage/thermostat/forget').length, 0);
      assert.match(text($(el, '.page-menu')), /Ses semaines et ses réglages seront supprimés/);
      $(el, '.page-menu [data-forget-confirm]').click(); await settle();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/thermostat/forget', entity_id: 'climate.salon' });
    });

    test('a pause refused by the integration says why, on the thermostat\'s page', async () => {
      const hass = setup({ reply: (msg) => { if (msg.type === 'chauffage/thermostat/set') throw { code: 'thermostat_failed', message: 'boom' }; } });
      const el = await panel(hass, '/thermostats/climate.salon');
      $(el, '[data-fill="thermostat"] [data-pause]').click(); await settle();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.match(text($(el, '[data-fill="thermostat"] .error')), /boom/);
    });

    test('its menus do not follow to another page (going back, the sidebar)', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      $(el, '.toolbar [data-page-menu]').click(); await settle();
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      for (const path of ['/thermostats', '/thermostats/climate.salon']) { // the list, then back
        window.history.replaceState(null, '', `/chauffage${path}`);
        el.route = { prefix: '/chauffage', path };
      }
      await settle();
      assert.equal($(el, '.page-menu'), null);
      assert.equal($(el, '.copy-menu'), null);
    });

    test('its ⋮ menu closes with a click elsewhere or Escape', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      $(el, '.toolbar [data-page-menu]').click(); await settle();
      $(el, '.hint').click(); await settle();
      assert.equal($(el, '.page-menu'), null);
      $(el, '.toolbar [data-page-menu]').click(); await settle();
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); await settle();
      assert.equal($(el, '.page-menu'), null);
    });

    test('its header: Home Assistant\'s tile, Pause and whether Chauffage controls it, its devices by their names', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      await tick();
      assert.deepEqual($(el, '.tile .tile-card').config, { type: 'tile', entity: 'climate.salon', state_content: ['current_temperature', 'hvac_action'] });
      assert.equal(text($(el, '.control')), 'Suspendre le pilotage'); // a badge only for the exception, Paused
      assert.match(text($(el, '.about')), /Appareils : Vanne salon \(TRV\), Salon \(Thermostat programmé\)/);
    });

    test('a paused thermostat: Resume, a Paused badge that stands out, said once and not under each week', async () => {
      const el = await panel(setup({ paused: ['climate.salon'] }), '/thermostats/climate.salon');
      assert.equal(text($(el, '.control')), 'Reprendre le pilotage Pilotage suspendu');
      assert.ok($(el, '.control .badge.paused'));
      for (const card of weeks(el)) assert.equal($(card, '.paused-note'), null);
    });

    test('Pause sends the pause, and the button keeps its place: the badge comes after it', async () => {
      const hass = setup();
      const el = await panel(hass, '/thermostats/climate.salon');
      const control = $(el, '.control');
      assert.equal(control.firstElementChild.dataset.pause, '1');
      control.firstElementChild.click(); await settle();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: true });
    });

    test('its presets first, as the legend of its weeks: a list, one item per preset, not a table of one row', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      await settle(); // what each preset is worth here, as the integration answers
      const presets = cards(el)[0];
      assert.ok($(presets, '.presets-view'));
      assert.equal($(presets, 'table'), null, 'not a table of one row');
      assert.equal($(presets, '.pv-add'), null); // the presets themselves are set on the Presets tab
      const items = $$(presets, '.pv-list .pv-item');
      // From the coldest to the warmest, as the table: its name, its value here, and what it is
      assert.deepEqual(items.map((i) => text(i.querySelector('.pv-pname'))), ['Hors-gel', 'Éco', 'Confort', 'Boost']);
      assert.match(text(items[1]), /^Éco 17° par défaut$/);
    });

    test('a preset of the list opens the editor of what it does on this thermostat', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      const presets = cards(el)[0];
      $$(presets, '.pv-list .pv-item')[2].click(); await settle();
      assert.match(text($(presets, '[data-panel="cell"]')), /Confort · Salon/);
    });

    test('its week in every schedule, each headed by the schedule (a link to its sheet), the active one marked', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      assert.deepEqual(weeks(el).map(scheduleShown), ['normal', 'away', 'holiday']);
      const heads = $$(el, 'h3[data-fill-schedule]');
      assert.match(text(heads[0]), /^Normal Actif/);
      assert.doesNotMatch(text(heads[1]), /Actif/);
      heads[2].querySelector('[data-navigate]').click(); await settle();
      assert.equal(window.location.pathname, '/chauffage/schedules/holiday');
    });

    test('no foot under a stacked week: no legend, no copy list, no hint; the hint once above them', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      for (const card of weeks(el)) {
        assert.equal($(card, '.foot'), null);
        assert.equal($(card, '.hint'), null);
        assert.equal($(card, '.tabs'), null);
        assert.equal($(card, '.chips'), null);
      }
      assert.equal($$(el, '.sheet > .hint').length, 1);
    });

    test('today stands out only in the active schedule\'s week', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      assert.deepEqual(weeks(el).map((c) => $$(c, '.dgroup.today').length), [1, 0, 0]);
    });

    test('ungrouping the days applies to every week, is remembered, and wins over the choice of the cards', async () => {
      localStorage.setItem('chauffage-programme-card:group-days', '1');
      const el = await panel(setup(), '/thermostats/climate.salon');
      assert.deepEqual(weeks(el).map((c) => $$(c, '.dgroup').length), [2, 1, 1]); // Mon–Fri, Sat–Sun
      $(el, '[data-group-days]').click(); await settle();
      assert.deepEqual(weeks(el).map((c) => $$(c, '.dgroup').length), [7, 7, 7]);
      assert.equal(localStorage.getItem('chauffage-programme-card:group-days'), '0');
    });

    test('the history has its own switch, as on the card; grouping the days hides it (#57, alpha.1)', async () => {
      // Regression: the history turned on in a card was kept in the browser; the sheet showed it
      // with no switch, and the days could not be grouped any more
      localStorage.setItem('chauffage-programme-card:history', '1');
      const el = await panel(setup(), '/thermostats/climate.salon');
      assert.ok($(el, '[data-history]').classList.contains('on'));
      assert.ok(!$(el, '[data-group-days]').classList.contains('on'));
      assert.deepEqual(weeks(el).map(historyAsked), [true, true, true]);
      $(el, '[data-group-days]').click(); await settle();
      assert.deepEqual(weeks(el).map(historyAsked), [false, false, false]);
      assert.deepEqual(weeks(el).map((c) => $$(c, '.dgroup').length), [2, 1, 1]);
      assert.equal(localStorage.getItem('chauffage-programme-card:history'), '0');
      $(el, '[data-history]').click(); await settle();
      assert.deepEqual(weeks(el).map(historyAsked), [true, true, true]);
      assert.equal(localStorage.getItem('chauffage-programme-card:history'), '1');
    });

    test('a day copied in one schedule\'s week can be pasted in another schedule\'s week', async () => {
      // Regression (alpha.2): each week of the sheet is a card of its own; a card read the copied
      // day once, when created, so the other weeks offered nothing to paste
      const el = await panel(setup(), '/thermostats/climate.salon');
      const [normal, away] = weeks(el);
      await copyDay(normal, 'climate.salon', 0); // the row "Mon–Fri"
      openMenu(away, 'climate.salon', 0); await settle();
      const paste = $(away, '.menu [data-act="paste-day"]');
      assert.ok(!paste.disabled, 'the other week offers to paste');
      assert.match(text(paste), /Salon · .* \(Normal\)/);
      paste.click(); await settle();
      assert.ok(unsavedWeeks(el).includes('Absent'));
      assert.deepEqual(day(away, 'climate.salon', 0), day(normal, 'climate.salon', 0));
    });

    test('a second copy replaces the first one: the day pasted is the last one copied', async () => {
      // Regression (after alpha.2): a copy wrote back the day already copied, kept in the browser
      const el = await panel(setup(), '/thermostats/climate.salon');
      const [normal, away, holiday] = weeks(el);
      await copyDay(normal, 'climate.salon', 0);
      await copyDay(holiday, 'climate.salon', 0);
      openMenu(away, 'climate.salon', 0); await settle();
      assert.match(text($(away, '.menu [data-act="paste-day"]')), /\(Vacances\)/);
      $(away, '.menu [data-act="paste-day"]').click(); await settle();
      assert.deepEqual(day(away, 'climate.salon', 0), day(holiday, 'climate.salon', 0));
    });

    test('only the day copied last stands out as copied, whatever week it was copied in', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      const [normal, away, holiday] = weeks(el);
      await copyDay(normal, 'climate.salon', 0);
      await copyDay(holiday, 'climate.salon', 0);
      for (const card of [normal, away, holiday]) await redraw(card);
      assert.deepEqual([normal, away, holiday].map((c) => $$(c, '.bar.clipsrc').length), [0, 0, 1]);
    });

    test('copying a week to another schedule asks to save the target, never the source', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      assert.equal($(el, 'select.copy'), null); // a menu, not a list that acts as soon as an option is picked
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      const items = $$(el, '.copy-menu.menu [data-copy-to]');
      assert.deepEqual(items.map((i) => i.dataset.copyTo), ['away', 'holiday']);
      items[0].click(); await settle();
      assert.equal($(el, '.copy-menu'), null);
      const [normal, away, holiday] = weeks(el);
      assert.ok(!unsavedWeeks(el).includes('Normal') && !unsavedWeeks(el).includes('Vacances'));
      assert.ok(unsavedWeeks(el).includes('Absent'));
      assert.equal($(away, '.savebar'), null); // the sheet's own bar, below
      assert.equal(text($(el, '.sheet-savebar .dirty')), 'Non enregistré : Absent');
      assert.equal(text($(away, '.msg')), 'Semaine Normal copiée ici');
      assert.deepEqual(wholeWeek(away, 'climate.salon'), wholeWeek(normal, 'climate.salon'));
    });

    test('the popover of a slot goes over the sheet\'s save bar', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      const [, away] = weeks(el);
      away.shadowRoot.querySelector('.bar[data-climate="climate.salon"] .seg[data-idx="0"]').click(); await settle();
      away.shadowRoot.querySelector('.editor [data-act="preset"][data-preset="eco"]').click(); await settle();
      assert.ok($(el, '.sheet-savebar'));
      const z = (root, selector) => Number(new RegExp(`\\n  ${selector} \\{[^}]*z-index:(\\d+)`)
        .exec($$(root, 'style').map((s) => s.textContent).join('\n'))[1]);
      assert.ok(z(away, '\\.editor') > z(el, '\\[data-fill="savebar"\\]'));
    });

    test('the ⋮ of a week sets every slot of an air conditioner\'s week to heat or to cool, unsaved', async () => {
      const hass = setup();
      hass.states['climate.salon'].attributes.hvac_modes = ['off', 'heat', 'cool'];
      const el = await panel(hass, '/thermostats/climate.salon');
      $(el, '[data-copy-menu="away"]').click(); await settle();
      assert.deepEqual($$(el, '.copy-menu [data-week-hvac]').map(text), ['Tout en chauffe', 'Tout en clim']);
      $(el, '.copy-menu [data-week-hvac="cool"]').click(); await settle();
      assert.equal($(el, '.copy-menu'), null);
      const [normal, away] = weeks(el);
      assert.ok(unsavedWeeks(el).includes('Absent') && !unsavedWeeks(el).includes('Normal'));
      assert.deepEqual(day(away, 'climate.salon', 0), ['00:00 frost {"hvac_mode":"cool"}']);
      assert.equal(text($(el, '.sheet-savebar .dirty')), 'Non enregistré : Absent');
      // A heater's weeks have no such item
      cleanup();
      const heater = await panel(setup(), '/thermostats/climate.bureau');
      $(heater, '[data-copy-menu="away"]').click(); await settle();
      assert.equal($$(heater, '.copy-menu [data-week-hvac]').length, 0);
    });

    test('switching Group days or History keeps the weeks not saved yet', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      $(el, '.copy-menu [data-copy-to="away"]').click(); await settle();
      const before = weeks(el);
      for (const chip of ['[data-group-days]', '[data-history]']) {
        $(el, chip).click(); await settle();
        assert.deepEqual(weeks(el), before, `${chip}: the same weeks, not new ones`);
        assert.ok(unsavedWeeks(el).includes('Absent'));
        assert.equal(text($(el, '.sheet-savebar .dirty')), 'Non enregistré : Absent');
      }
      assert.equal($$(before[1], '.dgroup').length, 7, 'its days not grouped');
      assert.equal(historyAsked(before[1]), true);
      assert.equal($(el, '[data-history]').getAttribute('aria-pressed'), 'true');
    });

    test('a schedule created elsewhere meanwhile does not drop the weeks not saved yet', async () => {
      const hass = setup();
      const el = await panel(hass, '/thermostats/climate.salon');
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      $(el, '.copy-menu [data-copy-to="away"]').click(); await settle();
      const data = integrationData({ weeks: WEEKS });
      data.schedules = [...data.schedules, { id: 'guests', name: 'Invités' }];
      hass.push(data); await settle();
      assert.ok(unsavedWeeks(el).includes('Absent'), 'still not saved, still there');
      assert.equal(text($(el, '.sheet-savebar .dirty')), 'Non enregistré : Absent');
    });

    test('one save bar for the whole sheet: it names the weeks not saved yet, none under a week', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      assert.equal($(el, '.sheet-savebar'), null);
      for (const target of ['holiday', 'away']) {
        $(el, '[data-copy-menu="normal"]').click(); await settle();
        $(el, `.copy-menu [data-copy-to="${target}"]`).click(); await settle();
      }
      assert.equal(text($(el, '.sheet-savebar .dirty')), 'Non enregistré : Absent, Vacances'); // in the order of the schedules
      for (const card of weeks(el)) assert.equal($(card, '.savebar'), null);
    });

    test('its Save sends the weeks not saved yet in one call, each schedule\'s own, against the thermostat\'s revision', async () => {
      const hass = setup();
      const el = await panel(hass, '/thermostats/climate.salon');
      for (const target of ['holiday', 'away']) {
        $(el, '[data-copy-menu="normal"]').click(); await settle();
        $(el, `.copy-menu [data-copy-to="${target}"]`).click(); await settle();
      }
      const [normal] = weeks(el);
      const week = wholeWeek(normal, 'climate.salon').map((day) => day.map((s) => s.split(' ')));
      $(el, '.sheet-savebar [data-sheet-save]').click(); await settle();
      await tick();
      const saves = hass.events.filter((m) => m.type === 'chauffage/weeks/save');
      assert.equal(saves.length, 1);
      assert.deepEqual(saves[0], { type: 'chauffage/weeks/save', weeks: { 'climate.salon': { away: week, holiday: week } }, revisions: { 'climate.salon': 7 } });
      assert.deepEqual(unsavedWeeks(el), []);
      assert.equal($(el, '.sheet-savebar'), null);
    });

    test('its Save refused because the weeks changed elsewhere: the bar says so and keeps the edits', async () => {
      const reply = (msg) => {
        if (msg.type === 'chauffage/weeks/save') throw Object.assign(new Error('stale'), { code: 'stale' });
        return null;
      };
      const el = await panel(setup({ reply }), '/thermostats/climate.salon');
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      $(el, '.copy-menu [data-copy-to="away"]').click(); await settle();
      $(el, '.sheet-savebar [data-sheet-save]').click(); await settle();
      await tick();
      assert.match(text($(el, '.sheet-savebar .error')), /modifiés ailleurs/);
      assert.ok(unsavedWeeks(el).includes('Absent'));
    });

    describe('leaving the sheet with weeks not saved yet', () => {
      const edited = async (hass) => {
        const el = await panel(hass, '/thermostats/climate.salon');
        $(el, '[data-copy-menu="normal"]').click(); await settle();
        $(el, '.copy-menu [data-copy-to="away"]').click(); await settle();
        return el;
      };
      const saves = (hass) => hass.events.filter((m) => m.type === 'chauffage/weeks/save').length;

      test('a link does not leave at once: the save bar asks first', async () => {
        const hass = setup();
        const el = await edited(hass);
        const before = window.location.pathname;
        $(el, '.crumbs [data-navigate="/chauffage/thermostats"]').click(); await settle();
        assert.equal(window.location.pathname, before);
        assert.match(text($(el, '.sheet-savebar')), /pas enregistrées/);
      });

      test('Stay keeps the edits and the page', async () => {
        const el = await edited(setup());
        const before = window.location.pathname;
        $(el, '.crumbs [data-navigate="/chauffage/thermostats"]').click(); await settle();
        $(el, '.sheet-savebar [data-leave-stay]').click(); await settle();
        assert.equal(window.location.pathname, before);
        assert.ok(unsavedWeeks(el).includes('Absent'));
        assert.doesNotMatch(text($(el, '.sheet-savebar')), /pas enregistrées/);
      });

      test('Leave drops the edits, then follows the link', async () => {
        const hass = setup();
        const el = await edited(hass);
        $(el, '.crumbs [data-navigate="/chauffage/thermostats"]').click(); await settle();
        $(el, '.sheet-savebar [data-leave-discard]').click(); await settle();
        assert.equal(window.location.pathname, '/chauffage/thermostats');
        assert.equal(saves(hass), 0);
      });

      test('Save and leave saves, then follows the link', async () => {
        const hass = setup();
        const el = await edited(hass);
        $(el, '.crumbs [data-navigate="/chauffage/thermostats"]').click(); await settle();
        $(el, '.sheet-savebar [data-leave-save]').click(); await settle();
        await tick();
        assert.equal(saves(hass), 1);
        assert.equal(window.location.pathname, '/chauffage/thermostats');
      });

      test('closing or reloading the browser\'s page asks too', async () => {
        const el = await edited(setup());
        const event = new window.Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event); await settle();
        assert.ok(event.defaultPrevented);
        $(el, '.sheet-savebar [data-sheet-cancel]').click(); await settle();
        const again = new window.Event('beforeunload', { cancelable: true });
        window.dispatchEvent(again); await settle();
        assert.ok(!again.defaultPrevented);
      });
    });

    test('its Cancel puts every week back as it was saved', async () => {
      const hass = setup();
      const el = await panel(hass, '/thermostats/climate.salon');
      const [, away] = weeks(el);
      const before = wholeWeek(away, 'climate.salon');
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      $(el, '.copy-menu [data-copy-to="away"]').click(); await settle();
      $(el, '.sheet-savebar [data-sheet-cancel]').click(); await settle();
      assert.deepEqual(wholeWeek(away, 'climate.salon'), before);
      assert.equal($(el, '.sheet-savebar'), null);
      assert.equal(hass.events.filter((m) => m.type === 'chauffage/weeks/save').length, 0);
    });

    test('the menu to copy a week closes with a click elsewhere or Escape, copying nothing', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      $(el, '.hint').click(); await settle();
      assert.equal($(el, '.copy-menu'), null);
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); await settle();
      assert.equal($(el, '.copy-menu'), null);
      assert.deepEqual(unsavedWeeks(el), []);
    });

    test('a week with edits not saved yet is copied as shown, and keeps its own edits', async () => {
      const el = await panel(setup(), '/thermostats/climate.salon');
      const [normal, away] = weeks(el);
      await cutSlot(normal, 'climate.salon', 0, 12 * 60); await settle(); // an edit not saved yet
      assert.ok(unsavedWeeks(el).includes('Normal'));
      const shown = wholeWeek(normal, 'climate.salon');
      $(el, '[data-copy-menu="normal"]').click(); await settle();
      $(el, '.copy-menu [data-copy-to="away"]').click(); await settle();
      assert.deepEqual(wholeWeek(away, 'climate.salon'), shown);
      assert.ok(unsavedWeeks(el).includes('Normal'), 'the source keeps its edits, still to save');
    });
  });
});

describe('the dashboard card and the panel', () => {
  afterEach(() => cleanup());

  test('a dashboard card ignores the options the panel sets for its own pages', async () => {
    const card = document.createElement('chauffage-programme-card');
    card.setConfig({ thermostats: ['climate.salon', 'climate.bureau'], week_only: true, schedule_tabs: false, view: 'presets', panel: true }); await settle();
    document.body.appendChild(card);
    card.hass = setup(); await settle();
    assert.ok(card.shadowRoot.querySelector('.chips'), 'its chips');
    assert.ok(card.shadowRoot.querySelector('.tabs'), 'its schedule tabs');
    assert.ok(card.shadowRoot.querySelector('.bar'), 'its weeks');
    assert.ok(card.shadowRoot.querySelector('[data-navigate^="/chauffage"]'), 'its link to the panel: it is not the panel');
  });

  test('admins set the presets from the legend of the presets: one link, where the card shows them', async () => {
    const card = createCard(setup()); await settle();
    assert.equal(card.shadowRoot.querySelector('[data-act="view"], .config-links'), null); // no links at the top
    const links = [...card.shadowRoot.querySelectorAll('.legend [data-navigate^="/chauffage"]')];
    assert.deepEqual(links.map((l) => l.closest('.legend') && l.textContent), ['Régler les préréglages']);
    links[0].click(); await settle();
    assert.equal(window.location.pathname, '/chauffage/presets');
  });

  test('admins open the panel from the card\'s top right, as the panels of other cards', async () => {
    const card = createCard(setup()); await settle();
    const open = card.shadowRoot.querySelector('.chips .panel-open[data-navigate="/chauffage"]');
    assert.equal(open.getAttribute('aria-label'), 'Ouvrir dans Chauffage');
    open.click(); await settle();
    assert.equal(window.location.pathname, '/chauffage');
  });

  test('the panel renamed and taken out of the sidebar keeps its name in the card\'s link (#104)', async () => {
    const hass = setup();
    hass.panels.chauffage = { url_path: 'chauffage', title: null, config: { title: 'Planning' } };
    const card = createCard(hass); await settle();
    const open = card.shadowRoot.querySelector('.chips .panel-open');
    assert.equal(open.getAttribute('aria-label'), 'Ouvrir dans Planning');
  });

  test('the panel renamed and taken out of the sidebar keeps its name in its header (#104)', async () => {
    const hass = setup();
    hass.panels.chauffage = { url_path: 'chauffage', title: null, config: { title: 'Planning' } };
    const el = await panel(hass, '/thermostats');
    assert.equal(text(el.shadowRoot.querySelector('.toolbar .title')), 'Planning');
  });

  test('a user with the access level Use sees no link to the panel (it needs Set up, #99)', async () => {
    const hass = setup();
    hass.user = { is_admin: false };
    const card = createCard(hass); await settle();
    assert.equal(card.shadowRoot.querySelector('[data-navigate^="/chauffage"]'), null);
  });

  test('outside the panel, the choice of grouping kept in the browser wins over the card\'s option', async () => {
    localStorage.setItem('chauffage-programme-card:group-days', '1');
    const card = createCard(setup(), { group_days: false }); await settle();
    assert.ok(card.shadowRoot.querySelector('[data-act="group-days"]').classList.contains('on'));
  });
});

describe('the more-info block and the panel', () => {
  afterEach(() => cleanup());

  test('its link says what it does, "Edit its week", whatever the panel is named', async () => {
    const hass = setup();
    hass.panels.chauffage.title = 'Chauffe';
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon'; await settle();
    el.hass = hass; await settle();
    assert.equal(text(el.shadowRoot.querySelector('.foot [data-navigate^="/chauffage/thermostats/"]')), 'Modifier sa semaine');
  });

  test('a thermostat\'s sheet reached for one week scrolls to it, and marks it a moment', async () => {
    const scrolled = [];
    const original = window.Element.prototype.scrollIntoView;
    window.Element.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this); };
    try {
      window.history.replaceState(null, '', '/chauffage/thermostats/climate.salon?week=away');
      const el = document.createElement('chauffage-panel');
      document.body.appendChild(el);
      const hass = setup();
      el.hass = hass; await settle();
      el.panel = hass.panels.chauffage;
      el.route = { prefix: '/chauffage', path: '/thermostats/climate.salon' };
      await settle();
      const heading = $(el, 'h3[data-fill-schedule="away"]');
      assert.deepEqual(scrolled, [heading]);
      assert.equal(window.location.search, '', 'once: a reload or going back does not scroll again');
    } finally {
      window.Element.prototype.scrollIntoView = original;
    }
  });

  test('from the more-info dialog, a page opens once the dialog is closed (it closes by going back)', async () => {
    window.history.replaceState(null, '', '/lovelace/0?more-info-entity-id=climate.salon');
    // Home Assistant's dialog, closed by going back in the history
    const ha = document.createElement('home-assistant');
    document.body.appendChild(ha);
    const root = ha.attachShadow({ mode: 'open' });
    const dialog = document.createElement('ha-more-info-dialog');
    let closed = 0;
    dialog.closeDialog = () => { closed += 1; setTimeout(() => window.history.replaceState(null, '', '/lovelace/0'), 20); };
    root.appendChild(dialog);
    const opened = [];
    leaveMoreInfo(document.body, () => opened.push(window.location.pathname));
    assert.equal(closed, 1);
    assert.deepEqual(opened, [], 'not before the dialog has left the address');
    await tick(80);
    assert.deepEqual(opened, ['/lovelace/0']);
  });
});

// HACS updates the integration and Home Assistant restarts: the page keeps running the former
// panel, or loads the former card first (tests/js/mixed-versions.test.mjs)
describe('the Chauffage panel after an update', () => {
  afterEach(cleanup);

  test('the panel asks to reload the page when the integration is newer', async () => {
    const data = { ...integrationData({ weeks: WEEKS }), version: '99.0.0' };
    const el = await panel(setup({ data }), '/thermostats');
    assert.match(text($(el, '.missing')), /rechargez la page/);
    assert.equal(cards(el).length, 0);
    assert.ok($(el, 'ha-menu-button'), 'the sidebar stays reachable on a phone');
  });

  // The panel says what the cards say, instead of an empty page under its tabs
  test('the panel asks to restart Home Assistant when the integration is older', async () => {
    const data = { ...integrationData({ weeks: WEEKS }), version: '0.0.1' };
    const el = await panel(setup({ data }), '/thermostats');
    assert.match(text($(el, '.missing')), /redémarrez Home Assistant/);
    assert.equal($(el, '.missing').getAttribute('role'), 'status');
    assert.ok($(el, '.tabs'), 'the tabs stay');
    assert.equal(cards(el).length, 0);
  });

  test('the panel says when the integration is not set up', async () => {
    const hass = setup({ data: null });
    hass.connection.subscribeMessage = () => Promise.reject({ code: 'not_loaded', message: 'The Chauffage integration is not set up' });
    const el = await panel(hass, '/thermostats');
    await tick();
    assert.match(text($(el, '.missing')), /n’est pas configurée/);
  });

  test('the panel shows "…" while it waits for the integration', async () => {
    const el = await panel(setup({ data: null }), '/schedules');
    assert.equal(text($(el, '.content .loading')), '…');
    assert.ok($(el, '.tabs'), 'the tabs stay');
  });

  test('the panel shows its page once the data comes', async () => {
    const hass = setup({ data: null });
    const el = await panel(hass, '/schedules');
    hass.push(integrationData({ weeks: WEEKS })); await settle();
    assert.equal($(el, '.content .loading'), null);
    assert.match(text($(el, '.content')), /Règles d'activation/);
  });

  test('a second copy of the same version of the card does not stop the panel', async () => {
    const get = customElements.get.bind(customElements);
    class SameVersionCopy extends HTMLElement { static get version() { return VERSION; } }
    mock.method(customElements, 'get', (tag) => (tag === 'chauffage-programme-card' ? SameVersionCopy : get(tag)));
    const el = await panel(setup(), '/thermostats');
    mock.restoreAll();
    assert.equal($(el, '.missing'), null);
  });

  test('the panel\'s button reloads the page', async () => {
    const data = { ...integrationData({ weeks: WEEKS }), version: '99.0.0' };
    const el = await panel(setup({ data }), '/thermostats');
    const reloads = watchReloads(el);
    $(el, '[data-act="reload-page"]').click(); await settle();
    assert.equal(reloads(), 1);
  });

  // Home Assistant's service worker serves the page from its cache, then updates it: without
  // emptying its caches, the first reload gets the former page again (the companion app has no
  // hard reload)
  test('reloading the page empties the service worker\'s caches first', async () => {
    const deleted = [];
    let reloaded = false;
    const win = {
      caches: { keys: async () => ['file-cache', 'workbox-runtime'], delete: async (key) => { deleted.push(key); return true; } },
      location: { reload: () => { reloaded = deleted.length === 2; } },
    };
    await reloadPage(win);
    assert.deepEqual(deleted, ['file-cache', 'workbox-runtime']);
    assert.ok(reloaded, 'reloaded after the caches are empty');
  });

  test('the page is reloaded even without caches to empty', async () => {
    let reloaded = false;
    await reloadPage({ location: { reload: () => { reloaded = true; } } });
    assert.ok(reloaded);
    reloaded = false;
    await reloadPage({ caches: { keys: async () => { throw new Error('denied'); } }, location: { reload: () => { reloaded = true; } } });
    assert.ok(reloaded);
  });
});

describe('the panel off the page and under a notice', () => {
  beforeEach(() => {
    window.loadCardHelpers = async () => ({ createCardElement: (config) => Object.assign(document.createElement('div'), { className: 'tile-card', config }) });
  });
  afterEach(() => {
    delete window.loadCardHelpers;
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  test('a thermostat sheet under the loading notice names no thermostat in its breadcrumb', async () => {
    const el = await panel(setup({ data: null }), '/thermostats/climate.salon');
    await settle();
    assert.equal(text($(el, '[data-fill="crumb"]')), '');
  });

  test('put back on the page, the panel shows what the integration pushed while it was off', async () => {
    const hass = setup();
    const el = await panel(hass, '/thermostats/climate.salon');
    await settle();
    el.remove();
    const data = integrationData({ weeks: WEEKS });
    data.schedules = data.schedules.map((s) => ({ ...s, name: 'Renommé' }));
    hass.push(data);
    await settle();
    document.body.appendChild(el);
    await settle();
    assert.match($$(el, 'h3').map(text).join('|'), /Renommé/);
  });
});
