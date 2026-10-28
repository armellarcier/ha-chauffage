// The Chauffage panel (#57): where an admin configures Chauffage, lists then sheets, one address
// per page (docs/decisions.md, "Chauffage panel and devices"). Dashboard cards link to it.
import { fakeHass, createCard, cleanup, integrationData, WEEKDAY, WEEKEND } from './helpers.mjs';
import { ChauffagePanel, leaveMoreInfo, ICONS } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
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
function panel(hass, path) {
  window.history.replaceState(null, '', `/chauffage${path}`);
  const el = document.createElement('chauffage-panel');
  document.body.appendChild(el);
  el.hass = hass;
  el.panel = hass.panels.chauffage;
  el.route = { prefix: '/chauffage', path };
  return el;
}
const cards = (el) => $$(el, 'chauffage-programme-card');

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
    test('/chauffage and /chauffage/rules open the Schedules page: the rules live with the schedules', () => {
      for (const path of ['', '/rules']) {
        panel(setup(), path);
        assert.equal(window.location.pathname, '/chauffage/schedules', path);
      }
    });

    test('the first prototype\'s address of a thermostat redirects to its sheet', () => {
      panel(setup(), '/climate.salon');
      assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    });

    test('the address of a renamed thermostat redirects to its new id', () => {
      const data = integrationData({ weeks: WEEKS });
      data.renamed = { 'climate.vieux_salon': 'climate.salon' };
      panel(setup({ data }), '/thermostats/climate.vieux_salon');
      assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    });

    test('a deleted schedule\'s sheet goes back to the list of schedules', () => {
      panel(setup(), '/schedules/disparu');
      assert.equal(window.location.pathname, '/chauffage/schedules');
    });

    test('no redirect before Home Assistant gives the address (it sets the route after hass)', () => {
      window.history.replaceState(null, '', '/chauffage/thermostats/climate.salon');
      const el = document.createElement('chauffage-panel');
      document.body.appendChild(el);
      el.hass = setup();
      assert.equal(window.location.pathname, '/chauffage/thermostats/climate.salon');
    });
  });

  describe('lists and sheets', () => {
    test('a list shows the panel\'s three tabs, the current one marked, and Home Assistant\'s menu button', () => {
      const el = panel(setup(), '/thermostats');
      assert.deepEqual($$(el, '.tab').map(text), ['Plannings', 'Thermostats', 'Préréglages']);
      assert.equal(text($(el, '.tab.on')), 'Thermostats');
      assert.ok($(el, 'ha-menu-button'));
      $$(el, '.tab')[2].click();
      assert.equal(window.location.pathname, '/chauffage/presets');
    });

    test('a sheet has no tabs: its title is a breadcrumb whose list is a link', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      assert.equal($(el, '.tab'), null);
      assert.match(text($(el, '.crumbs')), /^Thermostats\s*›\s*Salon$/);
      $(el, '.crumbs a').click();
      assert.equal(window.location.pathname, '/chauffage/thermostats');
    });

    test('the panel\'s icon is the integration\'s own, drawn by the card', async () => {
      assert.ok(window.customIcons.chauffage);
      assert.deepEqual(await window.customIcons.chauffage.getIcon('logo'), { path: ICONS.logo });
    });
  });

  describe('the Schedules page', () => {
    test('lists the schedules, the active one marked; the others can be activated', () => {
      const hass = setup();
      const el = panel(hass, '/schedules');
      const rows = $$(el, '[data-fill="schedules"] .row');
      assert.match(text(rows[0]), /^Normal Actif Modifier$/);
      assert.match(text(rows[2]), /^Vacances Activer Modifier$/);
      rows[2].querySelector('[data-activate]').click();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/schedule/activate', schedule: 'holiday' });
    });

    test('a schedule\'s name or Edit opens its sheet', () => {
      const el = panel(setup(), '/schedules');
      $$(el, '[data-fill="schedules"] .row')[1].querySelector('.name').click();
      assert.equal(window.location.pathname, '/chauffage/schedules/away');
      panel(setup(), '/schedules');
      $$(document.querySelector('chauffage-panel:last-of-type'), '[data-fill="schedules"] .row')[2]
        .querySelector('button[data-page]').click();
      assert.equal(window.location.pathname, '/chauffage/schedules/holiday');
    });

    test('creates a schedule with a name typed in the list', async () => {
      const hass = setup();
      const el = panel(hass, '/schedules');
      $(el, '[data-create-open]').click();
      $(el, '[data-new-name]').value = 'Télétravail';
      $(el, '[data-create]').click();
      await tick();
      const sent = hass.events.at(-1);
      assert.equal(sent.type, 'chauffage/schedules/set');
      assert.deepEqual(sent.schedules.at(-1), { name: 'Télétravail' });
      assert.deepEqual(sent.schedules.slice(0, 3), [{ id: 'normal' }, { id: 'away' }, { id: 'holiday' }]);
    });

    test('shows the activation rules below the schedules', () => {
      const el = panel(setup(), '/schedules');
      assert.equal(cards(el).length, 1);
      assert.equal(cards(el)[0]._config.view, 'rules');
      assert.ok($(cards(el)[0], '.rule, [data-act="rule-add"]'));
    });
  });

  describe('a schedule\'s sheet', () => {
    test('shows every thermostat\'s week in this schedule, with its tab and menu alone, no new schedule', () => {
      const el = panel(setup(), '/schedules/holiday');
      const [card] = cards(el);
      assert.equal(card._schedule, 'holiday');
      assert.deepEqual(card._thermostats.map((t) => t.entity), ['climate.salon', 'climate.bureau']);
      assert.deepEqual($$(card, '.tab').map(text), ['Vacances']);
      assert.ok($(card, '[data-act="schedule-menu"]'));
      assert.equal($(card, '[data-act="schedule-new"]'), null);
      assert.equal($(card, '.config-links'), null); // in the panel, no links to the panel
    });

    test('keeps the card\'s list to copy a week, and marks today even when the schedule is not active', () => {
      const [card] = cards(panel(setup(), '/schedules/holiday'));
      assert.ok($(card, 'select.copyweek'));
      assert.notEqual($(card, '.foot').style.display, 'none');
      assert.equal($$(card, '.dgroup.today').length, 1);
    });
  });

  describe('a thermostat\'s sheet', () => {
    const weeks = (el) => cards(el).slice(1); // the presets first, then a week per schedule

    test('its header: Home Assistant\'s tile, Pause and whether Chauffage controls it, its devices by their names', async () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      await tick();
      assert.deepEqual($(el, '.tile .tile-card').config, { type: 'tile', entity: 'climate.salon', state_content: ['current_temperature', 'hvac_action'] });
      assert.equal(text($(el, '.control')), 'Mettre en pause Piloté');
      assert.match(text($(el, '.about')), /Appareils : Vanne salon \(TRV\), Salon \(Thermostat programmé\)/);
    });

    test('a paused thermostat: Resume, a Paused badge that stands out, said once and not under each week', () => {
      const el = panel(setup({ paused: ['climate.salon'] }), '/thermostats/climate.salon');
      assert.equal(text($(el, '.control')), 'Reprendre En pause');
      assert.ok($(el, '.control .badge.paused'));
      for (const card of weeks(el)) assert.equal($(card, '.paused-note'), null);
    });

    test('Pause sends the pause, and the button keeps its place: the badge comes after it', () => {
      const hass = setup();
      const el = panel(hass, '/thermostats/climate.salon');
      const control = $(el, '.control');
      assert.equal(control.firstElementChild.dataset.pause, '1');
      control.firstElementChild.click();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/thermostat/set', entity_id: 'climate.salon', paused: true });
    });

    test('its presets first, as the legend of its weeks: its row only, without the presets\' definitions', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      const presets = cards(el)[0];
      assert.equal(presets._config.view, 'presets');
      assert.ok($(presets, '.presets-view.compact'));
      assert.equal($(presets, '.pv-add'), null);
      assert.equal($(presets, 'button.cell.head'), null);
      assert.equal($(presets, 'th.name'), null);
      assert.equal($$(presets, 'tbody tr').length, 1);
    });

    test('its week in every schedule, each headed by the schedule (a link to its sheet), the active one marked', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      assert.deepEqual(weeks(el).map((c) => c._schedule), ['normal', 'away', 'holiday']);
      const heads = $$(el, 'h3[data-fill-schedule]');
      assert.match(text(heads[0]), /^Normal Actif/);
      assert.doesNotMatch(text(heads[1]), /Actif/);
      heads[2].querySelector('[data-page]').click();
      assert.equal(window.location.pathname, '/chauffage/schedules/holiday');
    });

    test('no foot under a stacked week: no legend, no copy list, no hint; the hint once above them', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      for (const card of weeks(el)) {
        assert.equal($(card, '.foot').style.display, 'none');
        assert.equal($(card, '.hint'), null);
        assert.equal($(card, '.tabs'), null);
        assert.equal($(card, '.chips'), null);
      }
      assert.equal($$(el, '.sheet > .hint').length, 1);
    });

    test('today stands out only in the active schedule\'s week', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      assert.deepEqual(weeks(el).map((c) => $$(c, '.dgroup.today').length), [1, 0, 0]);
    });

    test('ungrouping the days applies to every week, is remembered, and wins over the choice of the cards', () => {
      localStorage.setItem('chauffage-programme-card:group-days', '1');
      const el = panel(setup(), '/thermostats/climate.salon');
      assert.deepEqual(weeks(el).map((c) => c._rows.length), [2, 1, 1]); // Mon–Fri, Sat–Sun
      $(el, '[data-group-days]').click();
      assert.deepEqual(weeks(el).map((c) => c._rows.length), [7, 7, 7]);
      assert.equal(localStorage.getItem('chauffage-programme-card:group-days'), '0');
    });

    test('copying a week to another schedule asks to save the target, never the source', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      const select = $(el, 'select.copy[data-copy-from="normal"]');
      assert.deepEqual([...select.options].slice(1).map((o) => o.value), ['away', 'holiday']);
      select.value = 'away';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const [normal, away, holiday] = weeks(el);
      assert.ok(!normal._dirty && !holiday._dirty);
      assert.ok(away._dirty);
      assert.ok($(away, '.savebar'));
      assert.equal(text($(away, '.msg')), 'Semaine Normal copiée ici');
      assert.deepEqual(away._week('climate.salon'), normal._week('climate.salon'));
    });

    test('a week with edits not saved yet is copied as shown, and keeps its own edits', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      const [normal, away] = weeks(el);
      normal._data['climate.salon'] = { ...(normal._data['climate.salon'] || {}), normal: Array(7).fill([{ start: 0, preset: 'boost' }]) };
      normal._dirty = true;
      const shown = normal._week('climate.salon');
      const select = $(el, 'select.copy[data-copy-from="normal"]');
      select.value = 'away';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      assert.deepEqual(away._week('climate.salon'), shown);
      assert.ok(normal._dirty, 'the source keeps its edits, still to save');
    });
  });
});

describe('the dashboard card and the panel', () => {
  afterEach(() => cleanup());

  test('admins see links to the panel\'s Presets, Rules and Thermostats pages, in place of the card\'s views', () => {
    const card = createCard(setup());
    assert.equal(card.shadowRoot.querySelector('[data-act="view"]'), null);
    const links = [...card.shadowRoot.querySelectorAll('.config-links [data-panel-page]')];
    assert.deepEqual(links.map((l) => l.dataset.panelPage), ['presets', 'rules', 'thermostats']);
    links[1].click();
    assert.equal(window.location.pathname, '/chauffage/rules');
  });

  test('a user who is not an admin sees no link to the panel (it is for admins only)', () => {
    const hass = setup();
    hass.user = { is_admin: false };
    assert.equal(createCard(hass).shadowRoot.querySelector('.config-links'), null);
  });

  test('outside the panel, the choice of grouping kept in the browser wins over the card\'s option', () => {
    localStorage.setItem('chauffage-programme-card:group-days', '1');
    const card = createCard(setup(), { group_days: false });
    assert.equal(card._grouped(), true);
  });
});

describe('the more-info block and the panel', () => {
  afterEach(() => cleanup());

  test('its link says "Open in" the panel, named as the sidebar names it', () => {
    const hass = setup();
    hass.panels.chauffage.title = 'Chauffe';
    const el = document.createElement('chauffage-moreinfo');
    document.body.appendChild(el);
    el.entity = 'climate.salon';
    el.hass = hass;
    assert.equal(text(el.shadowRoot.querySelector('[data-weeks]')), 'Ouvrir dans Chauffe');
  });

  test('its Device link opens the scheduled thermostat\'s device, else the thermostat\'s own', () => {
    const block = (hass) => {
      const el = document.createElement('chauffage-moreinfo');
      document.body.appendChild(el);
      el.entity = 'climate.salon';
      el.hass = hass;
      return el.shadowRoot.querySelector('.foot [data-device]').dataset.device;
    };
    assert.equal(block(setup()), 'salon-scheduled');
    const hass = setup();
    delete hass.entities['switch.salon_control'];
    assert.equal(block(hass), 'salon-device');
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
