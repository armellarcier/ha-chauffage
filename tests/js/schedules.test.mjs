// Managing schedules from the card, with the drop-down menus of the schedule tabs: "+" creates
// a schedule (empty or a copy, then its name), "⋮" on the open tab renames it (showing its stable
// id), moves it, deletes it (docs/decisions.md, "Schedules").
import { fakeHass, integrationData, createCard, cleanup } from './helpers.mjs';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const $ = (card, selector) => card.shadowRoot.querySelector(selector);
const click = (card, selector) => $(card, selector).click();
const menu = (card) => $(card, '.sched-menu');
const schedulesSet = (hass) => hass.events.filter((m) => m.type === 'chauffage/schedules/set');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const ALL = [{ id: 'normal' }, { id: 'away' }, { id: 'holiday' }];

// The data the integration pushes once a schedule was created
function withSchedule(id, name) {
  const data = integrationData();
  data.schedules = [...data.schedules, { id, name }];
  data.revision = 5;
  return data;
}

// "+", then "Empty" or "Copy of …", then the name and Create
async function create(card, name, { copy = '' } = {}) {
  click(card, '[data-act="schedule-new"]');
  click(card, `[data-act="schedule-pick"][data-copy="${copy}"]`);
  $(card, 'input[data-sched-name]').value = name;
  click(card, '[data-act="schedule-create"]');
  await flush();
}

function openMenu(card, id) {
  click(card, `.tab[data-schedule="${id}"]`);
  click(card, '[data-act="schedule-menu"]');
}

afterEach(() => cleanup());

describe('the "+" menu: a new schedule', () => {
  test('offers an empty schedule or a copy of each schedule', () => {
    const card = createCard(fakeHass());
    click(card, '[data-act="schedule-new"]');
    const items = [...card.shadowRoot.querySelectorAll('.sched-menu [data-act="schedule-pick"]')].map((b) => b.textContent.trim());
    assert.deepEqual(items, ['Vide (Éco toute la semaine)', 'Copie de « Normal »', 'Copie de « Absent »', 'Copie de « Vacances »']);
    assert.equal($(card, '.sched-ed'), null); // a menu, not a form under the tabs
  });

  test('an empty schedule, which the card then opens', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    await create(card, 'Télétravail');
    assert.deepEqual(schedulesSet(hass), [{ type: 'chauffage/schedules/set', revision: 4, schedules: [...ALL, { name: 'Télétravail' }] }]);
    assert.equal(menu(card), null);
    hass.push(withSchedule('teletravail', 'Télétravail'));
    assert.equal(card._schedule, 'teletravail');
    assert.ok($(card, '.tab.on[data-schedule="teletravail"]'));
  });

  test('a copy of a schedule', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    click(card, '[data-act="schedule-new"]');
    click(card, '[data-act="schedule-pick"][data-copy="holiday"]');
    assert.match(menu(card).textContent, /Copie de « Vacances »/);
    $(card, 'input[data-sched-name]').value = 'Guests';
    click(card, '[data-act="schedule-create"]');
    await flush();
    assert.deepEqual(schedulesSet(hass)[0].schedules.at(-1), { name: 'Guests', copy_of: 'holiday' });
  });

  test('a name being typed survives a redraw of the card (every 30 s during an override)', () => {
    const card = createCard(fakeHass());
    click(card, '[data-act="schedule-new"]');
    click(card, '[data-act="schedule-pick"][data-copy=""]');
    $(card, 'input[data-sched-name]').value = 'Télé';
    $(card, 'input[data-sched-name]').focus();
    card._render();
    assert.equal($(card, 'input[data-sched-name]').value, 'Télé');
    assert.equal(card.shadowRoot.activeElement, $(card, 'input[data-sched-name]'));
  });

  test('Enter in the name field creates it', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    click(card, '[data-act="schedule-new"]');
    click(card, '[data-act="schedule-pick"][data-copy=""]');
    const input = $(card, 'input[data-sched-name]');
    input.value = 'Guests';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await flush();
    assert.deepEqual(schedulesSet(hass)[0].schedules.at(-1), { name: 'Guests' });
  });

  test('unsaved edits of the weeks are saved first, then the schedule is created', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await create(card, 'Guests');
    assert.deepEqual(hass.events.map((m) => m.type), ['chauffage/weeks/save', 'chauffage/schedules/set']);
    assert.equal(schedulesSet(hass)[0].revision, 5); // the revision the save produced
    assert.equal(card._dirty, false);
  });

  test('when saving the edits fails, nothing is created', async () => {
    const hass = fakeHass({ reply: (msg) => { if (msg.type === 'chauffage/weeks/save') throw { code: 'stale', message: 'stale' }; } });
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await create(card, 'Guests');
    assert.deepEqual(schedulesSet(hass), []);
    assert.match($(card, '.msg').textContent, /modifiés ailleurs/);
  });

  test('a name is needed and must not be taken; the menu stays open', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    await create(card, '  ');
    assert.match(menu(card).textContent, /Donnez un nom/);
    $(card, 'input[data-sched-name]').value = 'absent ';
    click(card, '[data-act="schedule-create"]');
    await flush();
    assert.deepEqual(schedulesSet(hass), []);
    assert.match(menu(card).textContent, /déjà utilisé/);
  });

  test('an error of the integration is shown', async () => {
    const hass = fakeHass({ reply: (msg) => { if (msg.type === 'chauffage/schedules/set') throw { code: 'invalid_format', message: 'boom' }; } });
    const card = createCard(hass);
    await create(card, 'Guests');
    assert.match($(card, '.msg').textContent, /boom/);
  });
});

describe('the "⋮" menu of the open schedule', () => {
  test('lists its actions only, without a header', () => {
    const card = createCard(fakeHass());
    openMenu(card, 'away');
    assert.equal(menu(card).querySelector('.mh'), null);
    assert.doesNotMatch(menu(card).textContent, /Identifiant/);
  });

  test('opens its details and history in Home Assistant (its switch, #39)', () => {
    let received = null;
    const intercept = (e) => { received = e.detail.entityId; e.stopPropagation(); };
    document.addEventListener('hass-more-info', intercept);
    try {
      const card = createCard(fakeHass());
      openMenu(card, 'away');
      // In the user's words: what it shows, not how Home Assistant models it
      assert.equal(menu(card).querySelector('[data-more-info]').textContent.trim(), 'Détails et historique…');
      menu(card).querySelector('[data-more-info="switch.chauffage_schedule_away"]').click();
      assert.equal(received, 'switch.chauffage_schedule_away');
      assert.equal(menu(card), null);
    } finally {
      document.removeEventListener('hass-more-info', intercept);
    }
  });

  test('renames it, showing its id (used by automations)', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    openMenu(card, 'away');
    click(card, '[data-act="schedule-rename-open"]');
    assert.match(menu(card).textContent, /Identifiant : away/);
    assert.equal($(card, 'input[data-sched-name]').value, 'Absent');
    $(card, 'input[data-sched-name]').value = 'Sortis';
    click(card, '[data-act="schedule-rename"]');
    await flush();
    assert.deepEqual(schedulesSet(hass)[0].schedules, [{ id: 'normal' }, { id: 'away', name: 'Sortis' }, { id: 'holiday' }]);
  });

  test('the renamed schedule stays open', () => {
    const hass = fakeHass();
    const card = createCard(hass);
    click(card, '.tab[data-schedule="away"]');
    const data = integrationData();
    data.schedules[1].name = 'Sortis';
    data.revision = 5;
    hass.push(data);
    assert.equal(card._schedule, 'away');
    assert.equal($(card, '.tab.on').textContent.trim(), 'Sortis');
  });

  test('moves it left or right', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    openMenu(card, 'away');
    click(card, '[data-act="schedule-move"][data-dir="-1"]');
    await flush();
    assert.deepEqual(schedulesSet(hass)[0].schedules, [{ id: 'away' }, { id: 'normal' }, { id: 'holiday' }]);
    openMenu(card, 'holiday');
    assert.equal($(card, '[data-act="schedule-move"][data-dir="1"]').disabled, true); // already last
  });

  test('deletes it after a confirmation', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    openMenu(card, 'holiday');
    click(card, '[data-act="schedule-delete"]');
    assert.deepEqual(schedulesSet(hass), []);
    assert.match(menu(card).textContent, /Supprimer « Vacances » et ses semaines/);
    click(card, '[data-act="schedule-delete-confirm"]');
    await flush();
    assert.deepEqual(schedulesSet(hass)[0].schedules, [{ id: 'normal' }, { id: 'away' }]);
  });

  test('a schedule used by the activation rules cannot be deleted', () => {
    const data = { ...integrationData(), rules: [{ template: '{{ true }}', schedule: 'holiday' }], default_schedule: 'away', rule_results: [true] };
    const card = createCard(fakeHass({ data }));
    for (const id of ['holiday', 'away']) {
      openMenu(card, id);
      assert.equal($(card, '[data-act="schedule-delete"]').disabled, true);
      assert.match(menu(card).textContent, /Une règle d’activation utilise ce planning/);
    }
  });

  test('the active schedule cannot be deleted', () => {
    const card = createCard(fakeHass());
    openMenu(card, 'normal');
    assert.equal($(card, '[data-act="schedule-delete"]').disabled, true);
    assert.match(menu(card).textContent, /planning actif ne peut pas être supprimé/);
  });
});

describe('closing the menus', () => {
  test('a click elsewhere, Cancel, or the same button again', () => {
    const card = createCard(fakeHass());
    openMenu(card, 'away');
    click(card, '.legend');
    assert.equal(menu(card), null);
    click(card, '[data-act="schedule-new"]');
    click(card, '[data-act="schedule-pick"][data-copy=""]');
    click(card, '[data-act="schedule-close"]');
    assert.equal(menu(card), null);
    click(card, '[data-act="schedule-menu"]');
    click(card, '[data-act="schedule-menu"]');
    assert.equal(menu(card), null);
  });

  test('Escape', () => {
    const card = createCard(fakeHass());
    click(card, '[data-act="schedule-new"]');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(menu(card), null);
  });
});

test('only admins see "+" and "⋮"', () => {
  const hass = fakeHass();
  hass.user = { is_admin: false };
  const card = createCard(hass);
  assert.equal($(card, '[data-act="schedule-new"]'), null);
  assert.equal($(card, '[data-act="schedule-menu"]'), null);
});

test('in English', () => {
  const card = createCard(fakeHass({ locale: { language: 'en' } }));
  openMenu(card, 'normal');
  assert.match(menu(card).textContent, /The active schedule cannot be deleted/);
  click(card, '[data-act="schedule-rename-open"]');
  assert.match(menu(card).textContent, /Id: normal/);
});
