// Managing schedules from the card: the "+" tab creates one (empty or a copy), the ⋮ menu of the
// open tab renames (showing its stable id), moves and deletes it (docs/schedules-plan.md).
// In the websocket API, schedules are still "modes".
import { fakeHass, integrationData, createCard, cleanup } from './helpers.mjs';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const $ = (card, selector) => card.shadowRoot.querySelector(selector);
const click = (card, selector) => $(card, selector).click();
const modesSet = (hass) => hass.events.filter((m) => m.type === 'chauffage/modes/set');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const ALL = [{ id: 'normal' }, { id: 'away' }, { id: 'holiday' }];

// The integration's answer: the new list, then the data pushed to every card
function withSchedule(id, name) {
  const data = integrationData();
  data.modes = [...data.modes, { id, name }];
  data.revision = 5;
  return data;
}

async function create(card, name, { copy } = {}) {
  click(card, '[data-act="schedule-new"]');
  $(card, 'input[data-sched-name]').value = name;
  if (copy) {
    $(card, 'input[name="sched-kind"][value="copy"]').checked = true;
    $(card, 'select[data-sched-copy]').value = copy;
  }
  click(card, '[data-act="schedule-create"]');
  await flush();
}

async function openMenu(card, id) {
  click(card, `.tab[data-mode="${id}"]`);
  click(card, '[data-act="schedule-menu"]');
}

afterEach(() => cleanup());

describe('creating a schedule', () => {
  test('the "+" tab creates an empty schedule, which the card then opens', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    await create(card, 'Télétravail');
    assert.deepEqual(modesSet(hass), [{ type: 'chauffage/modes/set', revision: 4, modes: [...ALL, { name: 'Télétravail' }] }]);
    hass.push(withSchedule('teletravail', 'Télétravail'));
    assert.equal(card._mode, 'teletravail');
    assert.ok($(card, '.tab.on[data-mode="teletravail"]'));
  });

  test('or a copy of a chosen schedule (the open one by default)', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    click(card, '.tab[data-mode="away"]');
    click(card, '[data-act="schedule-new"]');
    assert.equal($(card, 'select[data-sched-copy]').value, 'away');
    $(card, 'select[data-sched-copy]').value = 'holiday';
    $(card, 'input[name="sched-kind"][value="copy"]').checked = true;
    $(card, 'input[data-sched-name]').value = 'Guests';
    click(card, '[data-act="schedule-create"]');
    await flush();
    assert.deepEqual(modesSet(hass)[0].modes.at(-1), { name: 'Guests', copy_of: 'holiday' });
  });

  test('unsaved edits of the weeks are saved first, then the schedule is created', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await create(card, 'Guests');
    assert.deepEqual(hass.events.map((m) => m.type), ['chauffage/schedules/save', 'chauffage/modes/set']);
    assert.equal(modesSet(hass)[0].revision, 5); // the revision the save produced
    assert.equal(card._dirty, false);
  });

  test('when saving the edits fails, nothing is created', async () => {
    const hass = fakeHass({ reply: (msg) => { if (msg.type === 'chauffage/schedules/save') throw { code: 'stale', message: 'stale' }; } });
    const card = createCard(hass);
    card._split('climate.bureau', 0, 12 * 60);
    await create(card, 'Guests');
    assert.deepEqual(modesSet(hass), []);
    assert.match($(card, '.msg').textContent, /modifiés ailleurs/);
  });

  test('a name is needed and must not be taken', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    await create(card, '  ');
    assert.match($(card, '.sched-ed').textContent, /Donnez un nom/);
    $(card, 'input[data-sched-name]').value = 'absent '; // the panel stays open
    click(card, '[data-act="schedule-create"]');
    await flush();
    assert.deepEqual(modesSet(hass), []);
    assert.match($(card, '.sched-ed').textContent, /déjà utilisé/);
  });

  test('an error of the integration is shown', async () => {
    const hass = fakeHass({ reply: (msg) => { if (msg.type === 'chauffage/modes/set') throw { code: 'invalid_format', message: 'boom' }; } });
    const card = createCard(hass);
    await create(card, 'Guests');
    assert.match($(card, '.msg').textContent, /boom/);
  });
});

describe('the menu of a schedule', () => {
  test('renames it and shows its id, used by automations', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    await openMenu(card, 'away');
    assert.match($(card, '.sched-ed').textContent, /away/);
    assert.equal($(card, 'input[data-sched-name]').value, 'Absent');
    $(card, 'input[data-sched-name]').value = 'Sortis';
    click(card, '[data-act="schedule-rename"]');
    await flush();
    assert.deepEqual(modesSet(hass)[0].modes, [{ id: 'normal' }, { id: 'away', name: 'Sortis' }, { id: 'holiday' }]);
  });

  test('the renamed schedule stays open', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    click(card, '.tab[data-mode="away"]');
    const data = integrationData();
    data.modes[1].name = 'Sortis';
    data.revision = 5;
    hass.push(data);
    assert.equal(card._mode, 'away');
    assert.equal($(card, '.tab.on').textContent.trim(), 'Sortis');
  });

  test('moves it left or right', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    await openMenu(card, 'away');
    click(card, '[data-act="schedule-move"][data-dir="-1"]');
    await flush();
    await openMenu(card, 'holiday');
    assert.equal($(card, '[data-act="schedule-move"][data-dir="1"]').disabled, true); // already last
    assert.deepEqual(modesSet(hass)[0].modes, [{ id: 'away' }, { id: 'normal' }, { id: 'holiday' }]);
  });

  test('deletes it after a confirmation', async () => {
    const hass = fakeHass();
    const card = createCard(hass);
    await openMenu(card, 'holiday');
    click(card, '[data-act="schedule-delete"]');
    assert.deepEqual(modesSet(hass), []);
    assert.match($(card, '.sched-ed').textContent, /Supprimer « Vacances »/);
    click(card, '[data-act="schedule-delete-confirm"]');
    await flush();
    assert.deepEqual(modesSet(hass)[0].modes, [{ id: 'normal' }, { id: 'away' }]);
  });

  test('the active schedule cannot be deleted', async () => {
    const card = createCard(fakeHass());
    await openMenu(card, 'normal');
    assert.equal($(card, '[data-act="schedule-delete"]').disabled, true);
    assert.match($(card, '.sched-ed').textContent, /planning actif ne peut pas être supprimé/);
  });

  test('Close closes it', async () => {
    const card = createCard(fakeHass());
    await openMenu(card, 'away');
    click(card, '[data-act="schedule-close"]');
    assert.equal($(card, '.sched-ed'), null);
  });
});

test('only admins see "+" and the menu', () => {
  const hass = fakeHass();
  hass.user = { is_admin: false };
  const card = createCard(hass);
  assert.equal($(card, '[data-act="schedule-new"]'), null);
  assert.equal($(card, '[data-act="schedule-menu"]'), null);
});

test('in English', async () => {
  const card = createCard(fakeHass({ locale: { language: 'en' } }));
  await openMenu(card, 'normal');
  assert.match($(card, '.sched-ed').textContent, /The active schedule cannot be deleted/);
  assert.match($(card, '.sched-ed').textContent, /Id: normal/);
});
