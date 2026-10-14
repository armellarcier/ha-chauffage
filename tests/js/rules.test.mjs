// The "Rules" view: activation rules "template → schedule", the first true one wins, a default
// schedule otherwise (#1, docs/decisions.md "Activation rules").
import { fakeHass, integrationData, createCard, cleanup } from './helpers.mjs';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const $ = (card, selector) => card.shadowRoot.querySelector(selector);
const $$ = (card, selector) => [...card.shadowRoot.querySelectorAll(selector)];
const RED = { template: "{{ is_state('sensor.edf_tempo_color', 'red') }}", schedule: 'away' };
const WHITE = { template: "{{ is_state('sensor.edf_tempo_color', 'white') }}", schedule: 'holiday' };

function withRules({ rules = [RED, WHITE], results = [false, true], def = 'normal', schedule = 'Vacances', language = 'fr' } = {}) {
  return { ...integrationData({ schedule, language }), rules, default_schedule: def, rule_results: results };
}

function openRules(hass) {
  const card = createCard(hass);
  card._previewDelay = 0; // rules being typed are tried at once
  $(card, '[data-act="view"][data-view="rules"]').click();
  return card;
}

const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const pick = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
const sent = (hass) => hass.events.filter((m) => m.type === 'chauffage/rules/set');

afterEach(() => cleanup());

describe('the Rules view', () => {
  test('lists the rules in order, the schedule each one activates and whether it is true now', () => {
    const card = openRules(fakeHass({ data: withRules() }));
    const rules = $$(card, '.rule');
    assert.equal(rules.length, 2);
    assert.equal(rules[0].querySelector('textarea').value, RED.template);
    assert.equal(rules[0].querySelector('select[data-rule-schedule]').value, 'away');
    assert.match(rules[0].querySelector('.rule-state').textContent, /faux/i);
    assert.match(rules[1].querySelector('.rule-state').textContent, /vrai/i);
    assert.equal($(card, 'select[data-rules-default]').value, 'normal');
  });

  test('says which schedule the rules give now', () => {
    const card = openRules(fakeHass({ data: withRules() }));
    assert.match($(card, '.rules-outcome').textContent, /Vacances/);
  });

  test('a schedule chosen by hand is shown as such, until the rules change', () => {
    const card = openRules(fakeHass({ data: withRules({ results: [false, false], schedule: 'Absent' }) }));
    const text = $(card, '.rules-outcome').textContent;
    assert.match(text, /Normal/);
    assert.match(text, /Absent/);
    assert.match(text, /main/i);
  });

  test('a template that fails says so', () => {
    const card = openRules(fakeHass({ data: withRules({ results: [null, true] }) }));
    assert.match($$(card, '.rule-state')[0].textContent, /erreur/i);
  });

  test('without rules, says that the schedule is only chosen by hand and offers to add one', () => {
    const card = openRules(fakeHass({ data: withRules({ rules: [], results: [], def: null }) }));
    assert.equal($$(card, '.rule').length, 0);
    assert.ok($(card, '[data-act="rule-add"]'));
    assert.ok($(card, '.rules-empty'));
  });

  test('links to the template editor of the developer tools, to try a template', () => {
    const card = openRules(fakeHass({ data: withRules() }));
    assert.equal($(card, 'a.rules-try').getAttribute('href'), '/developer-tools/template');
  });

  test('speaks English', () => {
    const hass = fakeHass({ data: withRules({ language: 'en' }), locale: { language: 'en' } });
    const card = openRules(hass);
    assert.match($$(card, '.rule-state')[1].textContent, /true/i);
    assert.match($(card, '[data-act="view"][data-view="rules"]').textContent, /Rules/);
  });
});

describe('editing the rules', () => {
  test('adding a rule and saving sends the rules and the default schedule', async () => {
    const hass = fakeHass({ data: withRules({ rules: [], results: [], def: null }) });
    const card = openRules(hass);
    $(card, '[data-act="rule-add"]').click();
    type($(card, '.rule textarea'), RED.template);
    pick($(card, '.rule select[data-rule-schedule]'), 'away');
    pick($(card, 'select[data-rules-default]'), 'normal');
    await card._action('rules-save', {});
    assert.deepEqual(sent(hass), [{ type: 'chauffage/rules/set', rules: [RED], default_schedule: 'normal' }]);
  });

  test('no default schedule keeps the active one: sent as null', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    pick($(card, 'select[data-rules-default]'), '');
    await card._action('rules-save', {});
    assert.equal(sent(hass)[0].default_schedule, null);
  });

  test('rules are moved and removed before saving', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    $$(card, '[data-act="rule-up"]')[1].click();
    assert.equal($$(card, '.rule textarea')[0].value, WHITE.template);
    $$(card, '[data-act="rule-delete"]')[1].click();
    await card._action('rules-save', {});
    assert.deepEqual(sent(hass)[0].rules, [WHITE]);
  });

  test('an empty rule is not sent', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    $(card, '[data-act="rule-add"]').click();
    await card._action('rules-save', {});
    assert.deepEqual(sent(hass)[0].rules, [RED, WHITE]);
  });

  test('a template being typed survives an update from Home Assistant', () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    type($$(card, '.rule textarea')[0], '{{ true }}');
    hass.push(withRules({ results: [true, false] }));
    assert.equal($$(card, '.rule textarea')[0].value, '{{ true }}');
    assert.match($(card, '.msg').textContent, /enregistr/i);
  });

  test('cancel goes back to the saved rules', () => {
    const card = openRules(fakeHass({ data: withRules() }));
    type($$(card, '.rule textarea')[0], '{{ true }}');
    $(card, '[data-act="rules-cancel"]').click();
    assert.equal($$(card, '.rule textarea')[0].value, RED.template);
  });

  test('a rule refused by the integration shows why and keeps the edits', async () => {
    const hass = fakeHass({ data: withRules(), reply: () => { throw { message: 'invalid template: oops' }; } });
    const card = openRules(hass);
    type($$(card, '.rule textarea')[0], '{{ oops');
    await card._action('rules-save', {});
    assert.match($(card, '.msg').textContent, /oops/);
    assert.equal($$(card, '.rule textarea')[0].value, '{{ oops');
  });

  test('once saved, the view follows the rules of the integration again', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    type($$(card, '.rule textarea')[0], '{{ true }}');
    await card._action('rules-save', {});
    hass.push(withRules({ rules: [{ template: '{{ true }}', schedule: 'away' }, WHITE], results: [true, true] }));
    assert.match($$(card, '.rule-state')[0].textContent, /vrai/i);
    assert.ok(!$(card, '[data-act="rules-cancel"]'), 'nothing left to cancel');
  });

  test('users who are not admins see the rules without editing them', () => {
    const hass = fakeHass({ data: withRules() });
    hass.user = { is_admin: false };
    const card = openRules(hass);
    assert.ok($(card, '.rule textarea').readOnly);
    assert.ok(!$(card, '[data-act="rule-add"]'));
    assert.ok(!$(card, '[data-act="rules-save"]'));
  });
});

describe('trying the rules while typing them', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const open = (hass) => hass.previews.filter((p) => !p.closed);

  test('the rules shown are tried by the integration, then again as they are typed', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    await tick();
    assert.deepEqual(open(hass).map((p) => p.msg.rules), [[RED, WHITE]]);
    type($$(card, '.rule textarea')[0], '{{ true }}');
    await tick();
    assert.deepEqual(open(hass).map((p) => p.msg.rules), [[{ template: '{{ true }}', schedule: 'away' }, WHITE]]);
    assert.equal(hass.previews.length, 2, 'the previous try is closed');
  });

  test('each rule says what its template gives now, before saving', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    await tick();
    type($$(card, '.rule textarea')[0], '{{ true }}');
    await tick();
    open(hass)[0].send({ results: [true, false], texts: ['True', 'False'], errors: [null, null] });
    assert.match($$(card, '.rule-state')[0].textContent, /vrai/i);
    assert.match($$(card, '.rule-result')[0].textContent, /True/);
    assert.equal($$(card, '.rule textarea')[0].value, '{{ true }}');
  });

  test('a template that gives neither true nor false says that it counts as false', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    await tick();
    open(hass)[0].send({ results: [false, false], texts: ['red', 'False'], errors: [null, null] });
    assert.match($$(card, '.rule-result')[0].textContent, /« red ».*ni vrai ni faux/);
    assert.doesNotMatch($$(card, '.rule-result')[1].textContent, /ni vrai ni faux/);
  });

  test('a template error is shown with its message', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    await tick();
    open(hass)[0].send({ results: [null, false], texts: [null, 'False'], errors: ["unexpected '}'", null] });
    assert.match($$(card, '.rule-state')[0].textContent, /erreur/i);
    assert.match($$(card, '.rule-result')[0].textContent, /unexpected '}'/);
  });

  test('the try stops when leaving the view', async () => {
    const hass = fakeHass({ data: withRules() });
    const card = openRules(hass);
    await tick();
    $(card, '[data-act="view"][data-view="schedule"]').click();
    await tick();
    assert.deepEqual(open(hass), []);
  });

  test('users who are not admins do not try rules', async () => {
    const hass = fakeHass({ data: withRules() });
    hass.user = { is_admin: false };
    openRules(hass);
    await tick();
    assert.deepEqual(hass.previews, []);
  });
});

describe('a template that gives the schedule', () => {
  const TEMPO = "{{ {'red': 'away', 'white': 'Vacances'}.get(states('sensor.edf_tempo_color'), 'none') }}";

  test('a rule can let its template give the schedule, by its id or its name', async () => {
    const hass = fakeHass({ data: withRules({ rules: [], results: [], def: null }) });
    const card = openRules(hass);
    $(card, '[data-act="rule-add"]').click();
    type($(card, '.rule textarea'), TEMPO);
    const select = $(card, '.rule select[data-rule-schedule]');
    assert.match(select.options[0].textContent, /donné par le template/);
    pick(select, '');
    await card._action('rules-save', {});
    assert.deepEqual(sent(hass)[0].rules, [{ template: TEMPO, schedule: null }]);
  });

  test('the schedule given now is shown, or that none matches', async () => {
    const rules = [{ template: TEMPO, schedule: null }, RED];
    const card = openRules(fakeHass({ data: withRules({ rules, results: ['away', false], schedule: 'Absent' }) }));
    assert.match($$(card, '.rule-state')[0].textContent, /Absent/);
    assert.match($(card, '.rules-outcome').textContent, /Les règles donnent Absent/);
    assert.equal($(card, '.rule select[data-rule-schedule]').value, '');
    const none = openRules(fakeHass({ data: withRules({ rules, results: [false, false] }) }));
    assert.match($$(none, '.rule-state')[0].textContent, /aucun planning/i);
  });

  test('a true or false template set to give the schedule says to choose the schedule it activates', async () => {
    const hass = fakeHass({ data: withRules({ rules: [{ template: RED.template, schedule: null }], results: [false] }) });
    const card = openRules(hass);
    await new Promise((resolve) => setTimeout(resolve, 5));
    hass.previews[0].send({ results: [false], texts: ['False'], errors: [null] });
    assert.match($(card, '.rule-result').textContent, /« False ».*choisissez le planning qu.il active/);
  });

  test('a text that names no schedule is explained while typing', async () => {
    const hass = fakeHass({ data: withRules({ rules: [{ template: TEMPO, schedule: null }], results: [false] }) });
    const card = openRules(hass);
    await new Promise((resolve) => setTimeout(resolve, 5));
    hass.previews[0].send({ results: [false], texts: ['none'], errors: [null] });
    assert.match($(card, '.rule-result').textContent, /« none ».*aucun planning/);
  });
});

describe('in Home Assistant, where ha-card shows its content asynchronously', () => {
  test('a template being typed keeps the focus and the caret when the view is redrawn', async () => {
    // Like HA's ha-card (Lit): its content can only take the focus once it has rendered
    customElements.define('ha-card', class extends HTMLElement {
      connectedCallback() {
        this.rendered = false;
        this.updateComplete = Promise.resolve().then(() => { this.rendered = true; return true; });
      }
    });
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focusOnceRendered(...args) {
      const card = this.closest && this.closest('ha-card');
      if (!card || card.rendered) focus.apply(this, args);
    };
    try {
      const hass = fakeHass({ data: withRules() });
      const card = openRules(hass);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const area = $$(card, '.rule textarea')[1];
      area.focus();
      area.setSelectionRange(4, 4);
      card._render();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const now = card.shadowRoot.activeElement;
      assert.equal(now && now.dataset.ruleTemplate, '1');
      assert.equal(now.selectionStart, 4);
    } finally {
      HTMLElement.prototype.focus = focus;
    }
  });
});
