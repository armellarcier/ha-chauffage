// The card's visual editor (dashboard → edit card), laid out like Home Assistant's own card
// editors: one row per thermostat (drag handle, picker, remove, edit), the edit button opening
// that thermostat's page (its optional name). HA's elements (<ha-entity-picker>, <ha-form>…)
// are not loaded in the tests: the tests send the events they send.
import { fakeHass, ChauffageProgrammeCard } from './helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ENGLISH = { language: 'en', time_format: 'language', number_format: 'language', first_weekday: 'language' };
const TYPE = 'custom:chauffage-programme-card';

// The minimum supported Home Assistant, unless a test says otherwise
function editorFor(config, { locale, version = '2025.1.0', formatEntityName } = {}) {
  const editor = ChauffageProgrammeCard.getConfigElement();
  const hass = fakeHass(locale ? { locale } : {});
  hass.config.version = version;
  if (formatEntityName) hass.formatEntityName = formatEntityName;
  editor.hass = hass;
  editor.setConfig(config);
  const changes = [];
  // What HA does with config-changed: it keeps the config and gives it back to the editor
  editor.addEventListener('config-changed', (e) => {
    changes.push(e.detail.config);
    editor.setConfig(e.detail.config);
  });
  const $ = (sel) => editor.shadowRoot.querySelector(sel);
  const $$ = (sel) => [...editor.shadowRoot.querySelectorAll(sel)];
  const rows = () => $$('.thermostat');
  const value = (el, v) => el.dispatchEvent(new CustomEvent('value-changed', { detail: { value: v } }));
  // What <ha-form> sends when a field changes: the whole data, with that field changed
  const formChange = (form, patch) => value(form, { ...form.data, ...patch });
  const edit = (i) => rows()[i].querySelector('.edit').click();
  return { editor, changes, $, $$, rows, value, formChange, edit, last: () => changes.at(-1) };
}

describe('visual editor: the thermostats', () => {
  test('the card offers a visual editor instead of YAML only', () => {
    const editor = ChauffageProgrammeCard.getConfigElement();
    assert.equal(editor.tagName.toLowerCase(), 'chauffage-programme-card-editor');
    assert.ok(customElements.get('chauffage-programme-card-editor'));
  });

  test('in a sections view, the card starts as wide as its section and can be resized down to half of it (#10)', () => {
    const card = new ChauffageProgrammeCard();
    card.setConfig({ type: TYPE, thermostats: ['climate.salon'] });
    assert.deepEqual(card.getGridOptions(), { columns: 'full', min_columns: 6 });
  });

  test('one row per thermostat, in the order of the card, with a picker of thermostats only', () => {
    const { rows } = editorFor({ type: TYPE, thermostats: [{ entity: 'climate.bureau', name: 'Office' }, 'climate.salon'] });
    assert.equal(rows().length, 2);
    const pickers = rows().map((r) => r.querySelector('ha-entity-picker'));
    assert.deepEqual(pickers.map((p) => p.value), ['climate.bureau', 'climate.salon']);
    assert.deepEqual(pickers[0].includeDomains, ['climate']);
    for (const r of rows()) {
      assert.ok(r.querySelector('.handle'), 'drag handle');
      assert.ok(r.querySelector('.remove'), 'remove button');
      assert.ok(r.querySelector('.edit'), 'edit button');
    }
  });

  test('a custom name is shown under its thermostat, the others show nothing more', () => {
    const { rows } = editorFor({ type: TYPE, thermostats: [{ entity: 'climate.bureau', name: 'Office' }, 'climate.salon'] });
    assert.match(rows()[0].textContent, /Office/);
    assert.equal(rows()[1].querySelector('.custom-name'), null);
  });

  test('a name that is the thermostat\'s own name is not repeated under it', () => {
    const { rows } = editorFor({ type: TYPE, thermostats: [{ entity: 'climate.salon', name: 'Salon' }] });
    assert.equal(rows()[0].querySelector('.custom-name'), null);
  });

  test('a new card without thermostats shows no row, only the picker to add one', () => {
    const { rows, $ } = editorFor({ type: TYPE });
    assert.equal(rows().length, 0);
    assert.ok($('.add'));
  });

  test('adding a thermostat puts it last and keeps the names of the others', () => {
    const { $, value, last } = editorFor({ type: TYPE, thermostats: [{ entity: 'climate.salon', name: 'Séjour' }] });
    value($('.add'), 'climate.bureau');
    assert.deepEqual(last(), { type: TYPE, thermostats: [{ entity: 'climate.salon', name: 'Séjour' }, 'climate.bureau'] });
    assert.ok(!$('.add').value, 'the add picker is emptied');
  });

  test('another thermostat chosen in a row replaces it there', () => {
    const { rows, value, last } = editorFor({ type: TYPE, thermostats: ['climate.salon', 'climate.bureau'] });
    value(rows()[0].querySelector('ha-entity-picker'), 'climate.cuisine');
    assert.deepEqual(last().thermostats, ['climate.cuisine', 'climate.bureau']);
  });

  test('the remove button, or emptying the picker, removes the thermostat', () => {
    const { rows, value, last } = editorFor({ type: TYPE, thermostats: ['climate.salon', 'climate.bureau', 'climate.cuisine'] });
    rows()[0].querySelector('.remove').click();
    assert.deepEqual(last().thermostats, ['climate.bureau', 'climate.cuisine']);
    value(rows()[1].querySelector('ha-entity-picker'), '');
    assert.deepEqual(last().thermostats, ['climate.bureau']);
  });

  test('dragging a row by its handle changes the order of the thermostats', () => {
    const { $, last } = editorFor({ type: TYPE, thermostats: ['climate.salon', { entity: 'climate.bureau', name: 'Office' }, 'climate.cuisine'] });
    $('ha-sortable').dispatchEvent(new CustomEvent('item-moved', { detail: { oldIndex: 2, newIndex: 0 } }));
    assert.deepEqual(last().thermostats, ['climate.cuisine', 'climate.salon', { entity: 'climate.bureau', name: 'Office' }]);
  });
});

describe('visual editor: the name, from Home Assistant 2025.11', () => {
  test('the name is chosen with Home Assistant\'s own name field, as in the Tile card', () => {
    const { edit, $ } = editorFor({ type: TYPE, thermostats: ['climate.salon'] }, { version: '2025.11.0' });
    edit(0);
    const form = $('ha-form');
    assert.deepEqual(form.schema[1], { name: 'name', selector: { entity_name: {} }, context: { entity: 'entity' } });
    assert.deepEqual(form.data, { entity: 'climate.salon' }, 'no name: the field shows the default one itself');
    assert.equal(form.computeHelper({ name: 'name' }), undefined);
  });

  test('a name made of pieces is written as Home Assistant gives it, and removed when emptied', () => {
    const { edit, $, formChange, last } = editorFor({ type: TYPE, thermostats: ['climate.salon'] }, { version: '2026.10.1' });
    edit(0);
    formChange($('ha-form'), { name: [{ type: 'area' }, { type: 'entity' }] });
    assert.deepEqual(last().thermostats, [{ entity: 'climate.salon', name: [{ type: 'area' }, { type: 'entity' }] }]);
    assert.deepEqual($('ha-form').data.name, [{ type: 'area' }, { type: 'entity' }]);
    formChange($('ha-form'), { name: undefined });
    assert.deepEqual(last().thermostats, ['climate.salon']);
  });

  test('betas and development versions count as their release; an unknown version gets the plain field', () => {
    for (const [version, selector] of [['2025.11.0b3', 'entity_name'], ['2025.12.0.dev20251101', 'entity_name'], ['2025.10.4', 'text'], [undefined, 'text']]) {
      const { edit, $ } = editorFor({ type: TYPE, thermostats: ['climate.salon'] }, { version });
      edit(0);
      assert.deepEqual(Object.keys($('ha-form').schema[1].selector), [selector], String(version));
    }
  });

  test('under its row, a name made of pieces is shown as Home Assistant makes it', () => {
    const formatEntityName = (st, name) => (name ? 'Rez-de-chaussée Salon' : 'Salon');
    const e = editorFor({ type: TYPE, thermostats: [{ entity: 'climate.salon', name: [{ type: 'area' }, { type: 'entity' }] }] }, { version: '2025.11.0', formatEntityName });
    assert.match(e.rows()[0].querySelector('.custom-name').textContent, /Rez-de-chaussée Salon/);
  });
});

describe('visual editor: a thermostat\'s page', () => {
  test('the edit button opens the thermostat\'s page: its entity and an optional name, the default name written under it', () => {
    const { edit, $, rows } = editorFor({ type: TYPE, thermostats: ['climate.salon', 'climate.bureau'] });
    edit(1);
    assert.equal(rows().length, 0, 'the list is replaced by the page');
    assert.ok($('ha-icon-button-prev'), 'back button');
    const form = $('ha-form');
    assert.deepEqual(form.schema.map((s) => [s.name, !!s.required]), [['entity', true], ['name', false]]);
    assert.deepEqual(form.schema[0].selector, { entity: { domain: 'climate' } });
    assert.deepEqual(form.data, { entity: 'climate.bureau', name: '' });
    assert.equal(form.computeLabel({ name: 'name' }), 'Nom (facultatif)');
    assert.equal(form.computeHelper({ name: 'name' }), 'Laisser vide pour « Bureau »');
  });

  test('naming a thermostat, then emptying its name, goes back to the thermostat\'s own name', () => {
    const { edit, $, formChange, last } = editorFor({ type: TYPE, thermostats: ['climate.salon', 'climate.bureau'] });
    edit(0);
    formChange($('ha-form'), { name: 'Séjour' });
    assert.deepEqual(last().thermostats, [{ entity: 'climate.salon', name: 'Séjour' }, 'climate.bureau']);
    formChange($('ha-form'), { name: '' });
    assert.deepEqual(last().thermostats, ['climate.salon', 'climate.bureau']);
  });

  test('typing a name keeps the same field (the focus is not lost at each key)', () => {
    const { edit, $, formChange } = editorFor({ type: TYPE, thermostats: ['climate.salon'] });
    edit(0);
    const form = $('ha-form');
    formChange(form, { name: 'S' });
    formChange($('ha-form'), { name: 'Sé' });
    assert.equal($('ha-form'), form);
    assert.equal(form.data.name, 'Sé');
  });

  test('the default name follows the thermostat chosen on the page', () => {
    const { edit, $, formChange, last } = editorFor({ type: TYPE, thermostats: ['climate.salon'] });
    edit(0);
    formChange($('ha-form'), { entity: 'climate.bureau' });
    assert.deepEqual(last().thermostats, ['climate.bureau']);
    assert.equal($('ha-form').computeHelper({ name: 'name' }), 'Laisser vide pour « Bureau »');
  });

  test('the back button goes back to the list', () => {
    const { edit, $, rows } = editorFor({ type: TYPE, thermostats: ['climate.salon'] });
    edit(0);
    $('ha-icon-button-prev').click();
    assert.equal(rows().length, 1);
  });
});

describe('visual editor: the other options', () => {
  const optionsForm = (e) => e.$('ha-form.options');

  test('the form shows whether every thermostat is shown at first and the time step; not the language', () => {
    const e = editorFor({ type: TYPE, thermostats: ['climate.salon'], step: 30, show: 'all', language: 'en' });
    const form = optionsForm(e);
    assert.deepEqual(form.schema.map((s) => s.name), ['show_all', 'step']);
    assert.deepEqual(form.data, { show_all: true, step: '30' });
  });

  test('options left at their default are left out of the YAML', () => {
    const e = editorFor({ type: TYPE, thermostats: ['climate.salon'], step: 30, show: 'all' });
    e.formChange(optionsForm(e), { step: '15', show_all: false });
    assert.deepEqual(e.last(), { type: TYPE, thermostats: ['climate.salon'] });
  });

  test('the step and showing every thermostat are written as the card reads them', () => {
    const e = editorFor({ type: TYPE, thermostats: ['climate.salon'] });
    e.formChange(optionsForm(e), { step: '30', show_all: true });
    assert.deepEqual(e.last(), { type: TYPE, thermostats: ['climate.salon'], step: 30, show: 'all' });
  });

  test('options written in YAML that the editor does not show are kept', () => {
    const e = editorFor({
      type: TYPE,
      thermostats: [{ entity: 'climate.salon', name: 'Séjour', icon: 'mdi:sofa' }, 'climate.bureau'],
      show: ['climate.bureau'],
      language: 'en',
      view_layout: { position: 'main' },
    });
    e.formChange(optionsForm(e), { step: '10' });
    e.edit(0);
    e.formChange(e.$('ha-form'), { name: '' });
    assert.deepEqual(e.last(), {
      type: TYPE,
      thermostats: [{ entity: 'climate.salon', icon: 'mdi:sofa' }, 'climate.bureau'],
      show: ['climate.bureau'],
      language: 'en',
      view_layout: { position: 'main' },
      step: 10,
    });
  });

  test('the editor speaks the user\'s language', () => {
    const fr = editorFor({ type: TYPE, thermostats: ['climate.salon'] });
    assert.match(fr.$('h3').textContent, /Thermostats \(obligatoire\)/);
    assert.equal(optionsForm(fr).computeLabel({ name: 'step' }), 'Pas des horaires (minutes)');
    const en = editorFor({ type: TYPE, thermostats: ['climate.salon'] }, { locale: ENGLISH });
    assert.equal(optionsForm(en).computeLabel({ name: 'show_all' }), 'Show every thermostat at first');
    en.edit(0);
    assert.equal(en.$('ha-form').computeLabel({ name: 'name' }), 'Name (optional)');
    assert.equal(en.$('ha-form').computeHelper({ name: 'name' }), 'Leave empty to use “Salon”');
  });
});
