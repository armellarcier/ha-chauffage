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
    test('/chauffage opens the first tab, Thermostats', () => {
      panel(setup(), '');
      assert.equal(window.location.pathname, '/chauffage/thermostats');
    });

    test('/chauffage/rules opens the Schedules page: the rules live with the schedules', () => {
      panel(setup(), '/rules');
      assert.equal(window.location.pathname, '/chauffage/schedules');
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
      assert.deepEqual($$(el, '.tab').map(text), ['Thermostats', 'Plannings', 'Préréglages']);
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

  describe('welcoming a new user', () => {
    // A new installation: no thermostat scheduled yet; Home Assistant has the salon and the bureau
    const fresh = (more = {}) => setup({ weeks: {}, ...more });
    const pick = (el, climate) => {
      const box = $(el, `.welcome input[data-pick="${climate}"]`);
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    };

    test('the Thermostats page welcomes them: what Chauffage does in three steps, every thermostat to tick', () => {
      const el = panel(fresh(), '/thermostats');
      assert.equal(cards(el).length, 0, 'no empty list');
      assert.equal(text($(el, '.welcome h2')), 'Bienvenue dans Chauffage');
      assert.equal($$(el, '.welcome .steps li').length, 3);
      const boxes = $$(el, '.welcome input[data-pick]');
      assert.deepEqual(boxes.map((b) => b.dataset.pick), ['climate.bureau', 'climate.salon']);
      assert.ok(boxes.every((b) => !b.checked), 'none ticked: scheduling a thermostat controls it at once');
      assert.match(text($(el, '.welcome')), /Bureau.*Salon/);
    });

    test('schedules the thermostats ticked, all at once; the button waits for one', () => {
      const hass = fresh();
      const el = panel(hass, '/thermostats');
      assert.ok($(el, '[data-start]').disabled);
      pick(el, 'climate.salon');
      assert.equal(text($(el, '[data-start]')), 'Programmer 1 thermostat');
      pick(el, 'climate.bureau');
      assert.equal(text($(el, '[data-start]')), 'Programmer 2 thermostats');
      assert.ok(!$(el, '[data-start]').disabled);
      assert.match(text($(el, '.welcome .note')), /pilote.*tout de suite.*Éco toute la semaine/);
      $(el, '[data-start]').click();
      assert.deepEqual(hass.events.at(-1), {
        type: 'chauffage/weeks/save',
        weeks: { 'climate.bureau': {}, 'climate.salon': {} },
        revisions: { 'climate.bureau': null, 'climate.salon': null },
      });
    });

    test('with no thermostat in Home Assistant, says so and leads to adding one', () => {
      const hass = fresh();
      hass.states = {};
      const el = panel(hass, '/thermostats');
      assert.match(text($(el, '.welcome')), /Home Assistant n'a encore aucun thermostat/);
      $(el, '.welcome [data-navigate]').click();
      assert.equal(window.location.pathname, '/config/integrations/dashboard');
    });

    test('once the first thermostats are scheduled, says what to do next, until closed', () => {
      const hass = fresh();
      const el = panel(hass, '/thermostats');
      pick(el, 'climate.salon');
      $(el, '[data-start]').click();
      hass.push(integrationData({ weeks: { 'climate.salon': { Normal: WEEK } } })); // the integration schedules it
      assert.equal($(el, '.welcome'), null);
      assert.ok(cards(el).length, 'the list of thermostats');
      assert.match(text($(el, '.next-steps')), /Ouvrez un thermostat.*Plannings de chauffe/);
      $(el, '[data-close-next]').click();
      assert.equal($(el, '.next-steps'), null);
      cleanup();
      assert.equal($(panel(setup(), '/thermostats'), '.next-steps'), null, 'a user who did not start here sees none');
    });

    test('the next steps stay closed once closed, on this browser', () => {
      const hass = fresh();
      const el = panel(hass, '/thermostats');
      pick(el, 'climate.salon');
      $(el, '[data-start]').click();
      $(el, '[data-close-next]')?.click();
      hass.push(integrationData({ weeks: { 'climate.salon': { Normal: WEEK } } }));
      $(el, '[data-close-next]').click();
      el.remove();
      const again = panel(hass, '/thermostats'); // the panel opened again, in the same browser
      assert.equal($(again, '.welcome'), null);
      assert.equal($(again, '.next-steps'), null);
    });

    test('before the first thermostat, the Schedules and Presets pages say so, with a link to the Thermostats tab', () => {
      for (const path of ['/schedules', '/presets']) {
        const el = panel(fresh(), path);
        assert.match(text($(el, '.notice')), /Aucun thermostat n'est encore programmé/, path);
        $(el, '.notice [data-page="thermostats"]').click();
        assert.equal(window.location.pathname, '/chauffage/thermostats', path);
        cleanup();
      }
      assert.equal($(panel(setup(), '/schedules'), '.notice'), null, 'no notice once a thermostat is scheduled');
    });

    test('speaks English', () => {
      const el = panel(fresh({ locale: { language: 'en' } }), '/thermostats');
      assert.equal(text($(el, '.welcome h2')), 'Welcome to Chauffage');
      assert.equal(text($(el, '[data-start]')), 'Schedule');
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

    test('its presets first, as the legend of its weeks: a list, one item per preset, not a table of one row', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      const presets = cards(el)[0];
      assert.equal(presets._config.view, 'presets');
      assert.equal($(presets, 'table'), null, 'not a table of one row');
      assert.equal($(presets, '.pv-add'), null); // the presets themselves are set on the Presets tab
      const items = $$(presets, '.pv-list .pv-item');
      // From the coldest to the warmest, as the table: its name, its value here, and what it is
      assert.deepEqual(items.map((i) => text(i.querySelector('.pv-pname'))), ['Hors-gel', 'Éco', 'Confort', 'Boost']);
      assert.match(text(items[1]), /^Éco 17° par défaut$/);
    });

    test('a preset of the list opens the editor of what it does on this thermostat', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      const presets = cards(el)[0];
      $$(presets, '.pv-list .pv-item')[2].click();
      assert.match(text($(presets, '[data-panel="cell"]')), /Confort · Salon/);
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

    test('the history has its own switch, as on the card; grouping the days hides it (#57, alpha.1)', () => {
      // Regression: the history turned on in a card was kept in the browser; the sheet showed it
      // with no switch, and the days could not be grouped any more
      localStorage.setItem('chauffage-programme-card:history', '1');
      const el = panel(setup(), '/thermostats/climate.salon');
      assert.ok($(el, '[data-history]').classList.contains('on'));
      assert.ok(!$(el, '[data-group-days]').classList.contains('on'));
      assert.deepEqual(weeks(el).map((c) => c._history.shown), [true, true, true]);
      $(el, '[data-group-days]').click();
      assert.deepEqual(weeks(el).map((c) => c._history.shown), [false, false, false]);
      assert.deepEqual(weeks(el).map((c) => c._rows.length), [2, 1, 1]);
      assert.equal(localStorage.getItem('chauffage-programme-card:history'), '0');
      $(el, '[data-history]').click();
      assert.deepEqual(weeks(el).map((c) => c._history.shown), [true, true, true]);
      assert.equal(localStorage.getItem('chauffage-programme-card:history'), '1');
    });

    test('a day copied in one schedule\'s week can be pasted in another schedule\'s week', () => {
      // Regression (alpha.2): each week of the sheet is a card of its own; a card read the copied
      // day once, when created, so the other weeks offered nothing to paste
      const el = panel(setup(), '/thermostats/climate.salon');
      const [normal, away] = weeks(el);
      normal._action('copy-day', { climate: 'climate.salon', day: '0' }); // the row "Mon–Fri"
      away._openMenu('climate.salon', 0, 0, 0, 0);
      const paste = $(away, '.menu [data-act="paste-day"]');
      assert.ok(!paste.disabled, 'the other week offers to paste');
      assert.match(text(paste), /Salon · .* \(Normal\)/);
      paste.click();
      assert.ok(away._dirty);
      assert.deepEqual(away._week('climate.salon')[0], normal._week('climate.salon')[0]);
    });

    test('a second copy replaces the first one: the day pasted is the last one copied', () => {
      // Regression (after alpha.2): a copy wrote back the day already copied, kept in the browser
      const el = panel(setup(), '/thermostats/climate.salon');
      const [normal, away, holiday] = weeks(el);
      normal._action('copy-day', { climate: 'climate.salon', day: '0' });
      holiday._action('copy-day', { climate: 'climate.salon', day: '0' });
      away._openMenu('climate.salon', 0, 0, 0, 0);
      assert.match(text($(away, '.menu [data-act="paste-day"]')), /\(Vacances\)/);
      $(away, '.menu [data-act="paste-day"]').click();
      assert.deepEqual(away._week('climate.salon')[0], holiday._week('climate.salon')[0]);
    });

    test('only the day copied last stands out as copied, whatever week it was copied in', () => {
      const el = panel(setup(), '/thermostats/climate.salon');
      const [normal, away, holiday] = weeks(el);
      normal._action('copy-day', { climate: 'climate.salon', day: '0' });
      holiday._action('copy-day', { climate: 'climate.salon', day: '0' });
      for (const card of [normal, away, holiday]) card._render();
      assert.deepEqual([normal, away, holiday].map((c) => $$(c, '.bar.clipsrc').length), [0, 0, 1]);
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
