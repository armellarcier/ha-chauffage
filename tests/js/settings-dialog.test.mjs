// The settings dialog (#83): Chauffage's settings, opened on top of the view the user is on (the
// card, the more-info dialog, the panel), without leaving it. Closing it, or the browser's Back,
// returns to that view as it was.
import { fakeHass, createCard, cleanup, integrationData, fakeDialogManager, WEEKDAY, WEEKEND } from './helpers.mjs';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const WEEK = [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND, WEEKEND];
const WEEKS = { 'climate.salon': { Normal: WEEK }, 'climate.bureau': { Normal: WEEK } };
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (root, selector) => root.shadowRoot.querySelector(selector);
const $$ = (root, selector) => [...root.shadowRoot.querySelectorAll(selector)];

function setup(more = {}) {
  const hass = fakeHass({ weeks: WEEKS, ...more });
  hass.panels = { chauffage: { url_path: 'chauffage', title: 'Chauffage' } };
  return hass;
}

// The dialog, opened as Home Assistant's dialog manager opens it
function settings(hass) {
  const el = document.createElement('chauffage-settings-dialog');
  document.body.appendChild(el);
  el.hass = hass;
  el.showDialog({});
  return el;
}
// The dialog is open: its frame (Home Assistant's dialog, or the browser's) is shown
const isOpen = (el) => !!el && !!el.shadowRoot.querySelector('.frame[open]');

describe('the settings dialog', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T10:00:00+02:00') })); // a Wednesday
  afterEach(() => { mock.timers.reset(); cleanup(); window.history.replaceState(null, '', '/'); });

  describe('changes by hand (#83)', () => {
    // The duration is a stepped field, the same as the end of an override
    const withSettings = (settings, more = {}) => {
      const data = { ...integrationData({ weeks: WEEKS, language: (more.locale || {}).language || 'fr' }), ...settings };
      return setup({ data, ...more });
    };
    const section = (el) => $(el, '.override-settings');
    const choices = (el) => $$(el, '.override-settings [data-override-end]');
    const label = (el, value) => text(choices(el).find((c) => c.value === value).closest('label').querySelector('.choice-label'));
    const example = (el, value) => text(choices(el).find((c) => c.value === value).closest('label').querySelector('.example'));
    const change = (input, value) => {
      if (input.type === 'radio') input.checked = true;
      else input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    test('one name for the section and the setting: changes by hand; the intro names the override', () => {
      const el = settings(withSettings({}));
      assert.equal(text($(el, '.override-settings h3')), 'Changements à la main');
      assert.match(text(section(el)),
        /Quand vous changez une consigne à la main, Chauffage la garde, puis le thermostat reprend son planning\. Choisissez quand\. Chauffage appelle ce changement temporaire une dérogation\./);
      assert.equal(text($(el, '.override-settings .duration-row label')), "Durée d'un changement à la main");
      assert.match(text(section(el)), /Une dérogation créée depuis la carte dure aussi ce temps\./);
      assert.doesNotMatch(text(section(el)), /Dérogations|Fin d'un changement/);
      assert.equal($(el, '.override-settings [role="radiogroup"]').getAttribute('aria-label'), "Fin d'un changement à la main");
    });

    test('the choices carry the user\'s duration and mark the default; the current one is checked', () => {
      const el = settings(withSettings({}));
      assert.deepEqual(choices(el).map((c) => c.value), ['duration', 'next_slot_within_duration', 'next_slot']);
      assert.deepEqual(choices(el).map((c) => c.checked), [true, false, false]);
      assert.equal(label(el, 'duration'), 'Pendant 2 h (par défaut)');
      assert.equal(label(el, 'next_slot_within_duration'), "Jusqu'au prochain créneau, 2 h au plus");
      assert.equal(label(el, 'next_slot'), "Jusqu'au prochain créneau");
      const sentence = (value) => text(choices(el).find((c) => c.value === value).closest('label').querySelector('.choice-text'));
      assert.equal(sentence('next_slot_within_duration'), 'Plus tôt si un créneau commence avant.');
      cleanup();
      const short = settings(withSettings({ override_duration: 90 }));
      assert.equal(label(short, 'duration'), 'Pendant 1 h 30 (par défaut)');
    });

    test('the duration comes first, above the choices that use it', () => {
      const el = settings(withSettings({}));
      const duration = $(el, '.override-settings input[data-override-duration]');
      assert.ok(duration.compareDocumentPosition(choices(el)[0]) & Node.DOCUMENT_POSITION_FOLLOWING);
      assert.doesNotMatch(text(section(el)), /deux premiers choix/);
    });

    test('gives the example of the living room and the office, computed with the user\'s duration', () => {
      const el = settings(withSettings({}));
      assert.match(text(section(el)),
        /Par exemple, vous montez le salon à 21:30, son prochain créneau est à 22:30, et le bureau à 18:30, son prochain créneau est à 06:00\./);
      assert.equal(example(el, 'duration'), "Salon jusqu'à 23:30 · bureau jusqu'à 20:30");
      assert.equal(example(el, 'next_slot_within_duration'), "Salon jusqu'à 22:30 · bureau jusqu'à 20:30");
      assert.equal(example(el, 'next_slot'), "Salon jusqu'à 22:30 · bureau jusqu'à demain 06:00");
      cleanup();
      const short = settings(withSettings({ override_duration: 45 }));
      assert.equal(example(short, 'duration'), "Salon jusqu'à 22:15 · bureau jusqu'à 19:15");
      assert.equal(example(short, 'next_slot_within_duration'), "Salon jusqu'à 22:15 · bureau jusqu'à 19:15");
      cleanup();
      const long = settings(withSettings({ override_duration: 1440 }));
      assert.equal(example(long, 'duration'), "Salon jusqu'à demain 21:30 · bureau jusqu'à demain 18:30");
    });

    test('one note under the choices, always: the 15 minutes, and an end chosen on the card', () => {
      for (const end of ['duration', 'next_slot_within_duration', 'next_slot']) {
        const el = settings(withSettings({ manual_override_end: end }));
        assert.equal(text($(el, '.override-settings .slot-note')),
          'Un créneau qui commence moins de 15 min après le changement ne compte pas. Une fin choisie sur la carte reste.', end);
        cleanup();
      }
    });

    test('a choice is sent at once, the controls wait for the answer, then say it is saved', async () => {
      const hass = withSettings({});
      const el = settings(hass);
      change(choices(el)[2]);
      assert.ok(choices(el).every((c) => c.disabled), 'disabled while it is sent');
      await tick();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', manual_override_end: 'next_slot' });
      assert.ok(choices(el).every((c) => !c.disabled));
      assert.equal(text($(el, '.override-settings .saved')), 'Enregistré ✓');
    });

    // The duration: a stepped field, the same as the end of an override ("jusqu'à 01:30 ▲▼")
    const durationInput = (el) => $(el, '.override-settings input[data-override-duration]');
    const leave = (input, value) => {
      if (value !== undefined) input.value = value;
      input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, composed: true }));
    };
    const key = (input, k) => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));
    const arrow = (el, dir) => el.shadowRoot.querySelector(`.override-settings .duration-field [data-time-step="${dir}"]`).click();

    test('the duration is a field like the end of an override: a text in hours and minutes, with two small arrows', () => {
      const el = settings(withSettings({ override_duration: 90 }));
      const input = durationInput(el);
      assert.ok(input.matches('.time-field input.time[type="text"][inputmode="numeric"]'));
      assert.equal(input.value, '1 h 30');
      assert.equal(input.id, 'override-duration');
      assert.equal(text($(el, '.override-settings .duration-row label[for="override-duration"]')), "Durée d'un changement à la main");
      const buttons = [...el.shadowRoot.querySelectorAll('.override-settings .duration-field .time-step')];
      assert.deepEqual(buttons.map((b) => b.getAttribute('aria-label')), ['15 min de plus', '15 min de moins']);
      assert.equal(durationInput(settings(withSettings({ override_duration: 120 }))).value, '2 h');
    });

    test('its small arrows move the duration by 15 minutes and send it', async () => {
      const hass = withSettings({});
      const el = settings(hass);
      arrow(el, 1);
      assert.equal(durationInput(el).disabled, true, 'disabled while it is sent');
      await tick();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', override_duration: 135 });
      assert.equal(durationInput(el).disabled, false);
      assert.equal(text($(el, '.override-settings .duration-row .saved')), 'Enregistré ✓');
    });

    test('its small arrows stop at 15 minutes and at 24 hours', async () => {
      for (const [minutes, dir] of [[15, -1], [1440, 1]]) {
        const hass = withSettings({ override_duration: minutes });
        const el = settings(hass);
        const sent = hass.events.length;
        arrow(el, dir);
        await tick();
        assert.equal(hass.events.length, sent, `${minutes}`);
        assert.equal(durationInput(el).value, minutes === 15 ? '15 min' : '24 h');
        cleanup();
      }
    });

    test('the arrow keys move the duration by 15 minutes; it is sent once the field is left', async () => {
      const hass = withSettings({});
      const el = settings(hass);
      const sent = hass.events.length;
      const input = durationInput(el);
      key(input, 'ArrowUp');
      key(input, 'ArrowUp');
      key(input, 'ArrowUp');
      key(input, 'ArrowDown');
      assert.equal(input.value, '2 h 30');
      assert.equal(hass.events.length, sent, 'nothing sent before the field is left');
      leave(input);
      await tick();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', override_duration: 150 });
    });

    test('from a duration off the steps, its arrows go to the next step, as those of a time field', async () => {
      for (const [dir, sent] of [[1, 165], [-1, 150]]) {
        const hass = withSettings({ override_duration: 160 }); // 2 h 40
        const el = settings(hass);
        assert.equal(durationInput(el).value, '2 h 40');
        arrow(el, dir);
        await tick();
        assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', override_duration: sent }, `${dir}`);
        cleanup();
      }
    });

    test('a duration is typed as a time is, in hours and minutes: 245, 2:45, 2h45, 2 h 45; the choices then say 2 h 45', async () => {
      for (const typed of ['245', '2:45', '2h45', '2 h 45']) {
        const hass = withSettings({});
        const el = settings(hass);
        leave(durationInput(el), typed);
        await tick();
        assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', override_duration: 165 }, typed);
        hass.push({ ...integrationData({ weeks: WEEKS }), override_duration: 165 });
        assert.equal(durationInput(el).value, '2 h 45', typed);
        assert.equal(label(el, 'duration'), 'Pendant 2 h 45 (par défaut)', typed);
        cleanup();
      }
      // "4" is 4 h, "12" 12 h, "0040" 40 minutes, "24" a day, "2h40" off the arrows' steps
      for (const [typed, minutes] of [['4', 240], ['12', 720], ['0040', 40], ['24', 1440], ['2h40', 160], ['45 min', 45]]) {
        const hass = withSettings({});
        leave(durationInput(settings(hass)), typed);
        await tick();
        assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', override_duration: minutes }, typed);
        cleanup();
      }
    });

    test('Enter sends the duration typed', async () => {
      const hass = withSettings({});
      const el = settings(hass);
      const input = durationInput(el);
      input.focus();
      input.value = '3h';
      key(input, 'Enter');
      await tick();
      assert.deepEqual(hass.events.at(-1), { type: 'chauffage/settings/set', override_duration: 180 });
    });

    test('a duration out of range or not hours and minutes is refused: the field says why and shows the duration kept', async () => {
      // "165" is no h:mm, as in a time field; "0010" is 10 minutes, "2430" more than a day
      for (const typed of ['165', '0010', '2430', '25', '2pm', 'abc']) {
        const hass = withSettings({});
        const el = settings(hass);
        const sent = hass.events.length;
        leave(durationInput(el), typed);
        await tick();
        assert.equal(hass.events.length, sent, typed);
        assert.equal(text($(el, '.override-settings .duration-row .error')), 'Choisissez une durée de 15 min à 24 h, en heures et minutes : 2:45.', typed);
        assert.equal(durationInput(el).value, '2 h', typed);
        cleanup();
      }
    });

    test('a duration refused by the integration says why, next to the field, which shows the duration kept', async () => {
      const hass = withSettings({}, { reply: () => { throw { code: 'unauthorized', message: 'Unauthorized' }; } });
      const el = settings(hass);
      leave(durationInput(el), '4h');
      await tick();
      assert.match(text($(el, '.override-settings .duration-row .error')), /Unauthorized/);
      assert.equal(durationInput(el).value, '2 h');
    });

    test('leaving the field unchanged sends nothing', async () => {
      const hass = withSettings({});
      const el = settings(hass);
      const sent = hass.events.length;
      leave(durationInput(el));
      await tick();
      assert.equal(hass.events.length, sent);
    });

    test('the duration is read-only for a user who is not an admin', () => {
      const hass = withSettings({});
      hass.user = { is_admin: false };
      const el = settings(hass);
      assert.equal(durationInput(el).disabled, true);
      assert.ok([...el.shadowRoot.querySelectorAll('.override-settings .duration-field .time-step')].every((b) => b.disabled));
    });

    test('follows the settings changed elsewhere (the options, the entities)', () => {
      const hass = withSettings({});
      const el = settings(hass);
      hass.push({ ...integrationData({ weeks: WEEKS }), manual_override_end: 'next_slot_within_duration', override_duration: 60 });
      assert.deepEqual(choices(el).map((c) => c.checked), [false, true, false]);
      assert.equal($(el, '.override-settings input[data-override-duration]').value, '1 h');
    });

    test('a change refused by the integration says why', async () => {
      const hass = withSettings({}, { reply: () => { throw { code: 'unauthorized', message: 'Unauthorized' }; } });
      const el = settings(hass);
      change(choices(el)[2]);
      await tick();
      assert.match(text($(el, '.override-settings .error')), /Unauthorized/);
      assert.equal($(el, '.override-settings .saved'), null);
    });

    test('speaks English', () => {
      const el = settings(withSettings({}, { locale: { language: 'en' } }));
      assert.equal(text($(el, '.override-settings h3')), 'Changes by hand');
      assert.equal(label(el, 'duration'), 'For 2 h (default)');
      assert.equal(label(el, 'next_slot_within_duration'), 'Until the next slot, 2 h at most');
      assert.equal(text($$(el, '.override-settings .example')[2]), 'Living room until 10:30 PM · office until tomorrow 6:00 AM');
    });
  });

  test('its title names Chauffage; it says the same in English', () => {
    assert.equal(text($(settings(setup()), '.title')), 'Réglages de Chauffage');
    cleanup();
    assert.equal(text($(settings(setup({ locale: { language: 'en' } })), '.title')), 'Chauffage settings');
  });

  describe('its foot: the other options of Chauffage', () => {
    test('says what the other options hold, and links to the integration, for an admin', () => {
      const foot = $(settings(setup()), '.foot');
      assert.equal(text(foot.querySelector('[data-other-options]')), 'Autres options de Chauffage');
      assert.equal(foot.querySelector('[data-other-options]').getAttribute('href'), '/config/integrations/integration/chauffage');
      assert.equal(text(foot.querySelector('.note')),
        'Utiliser ou non les préréglages des thermostats, afficher ou non Chauffage dans la barre latérale.');
      cleanup();
      const en = $(settings(setup({ locale: { language: 'en' } })), '.foot');
      assert.equal(text(en.querySelector('[data-other-options]')), 'Other Chauffage options');
      assert.equal(text(en.querySelector('.note')), "Whether to use the thermostats' own presets, and whether to show Chauffage in the sidebar.");
    });

    test('is not there for a user who is not an admin', () => {
      const hass = setup();
      hass.user = { is_admin: false };
      assert.equal($(settings(hass), '.foot'), null);
    });

    test('the link closes the dialog, gives back its history entry, then opens the integration\'s page', async () => {
      window.history.replaceState(null, '', '/lovelace/0');
      const el = document.createElement('chauffage-settings-dialog');
      document.body.appendChild(el);
      el.hass = setup();
      el.showDialog({ history: true });
      const length = window.history.length;
      $(el, '[data-other-options]').click();
      assert.equal(isOpen(el), false);
      await tick(80);
      assert.equal(window.location.pathname, '/config/integrations/integration/chauffage');
      assert.equal(window.history.length, length, 'the dialog\'s entry was taken back, then the page pushed');
      window.history.back();
      await tick(20);
      assert.equal(window.location.pathname, '/lovelace/0', 'Back returns to the view under the dialog');
    });
  });

  describe('opened on top of the view, without leaving it', () => {
    // A change by hand that ends at the next slot: its end gives the reason, a link for an admin
    const OVERRIDE = { kind: 'temperature', value: 21.5, start: '2026-10-14T09:30:00+02:00', end: '2026-10-14T11:30:00+02:00', ends_at: 'next_slot' };
    const withOverride = (more = {}) => setup({ overrides: { 'climate.salon': OVERRIDE }, ...more });
    const moreInfo = (hass) => {
      const el = document.createElement('chauffage-moreinfo');
      document.body.appendChild(el);
      el.entity = 'climate.salon';
      el.hass = hass;
      return el;
    };
    const DIALOG = 'chauffage-settings-dialog';
    const panel = (hass, path) => {
      window.history.replaceState(null, '', `/chauffage${path}`);
      const el = document.createElement('chauffage-panel');
      document.body.appendChild(el);
      el.hass = hass;
      el.panel = hass.panels.chauffage;
      el.route = { prefix: '/chauffage', path };
      return el;
    };

    test('from the more-info dialog: the reason of the end opens it on top; the address and the more-info stay; Back closes it only', async () => {
      window.history.replaceState(null, '', '/lovelace/0?more-info-entity-id=climate.salon');
      const hass = withOverride();
      const manager = fakeDialogManager(hass);
      const block = moreInfo(hass);
      const before = window.location.href;
      block.shadowRoot.querySelector('.derogation [data-open-settings]').click();
      await tick();
      assert.deepEqual(manager.shown.map((d) => d.dialogTag), [DIALOG]);
      const dialog = manager.dialog(DIALOG);
      assert.ok(isOpen(dialog));
      assert.equal(text($(dialog, '.override-settings h3')), 'Changements à la main');
      assert.equal(window.location.href, before, 'no page opened: the address is the same');
      assert.ok(block.isConnected);
      manager.back(); // the browser's Back
      await tick();
      assert.equal(isOpen(dialog), false);
      assert.deepEqual(manager.open, []);
      assert.ok(block.isConnected, 'the more-info block is still there');
      assert.equal(window.location.href, before);
    });

    test("from the card's override popover: it opens on top, and the popover is still open once it is closed", async () => {
      const hass = withOverride();
      const manager = fakeDialogManager(hass);
      const card = createCard(hass, { show: ['climate.salon'] });
      card.shadowRoot.querySelector('.override[data-climate="climate.salon"]').click();
      card.shadowRoot.querySelector('.override-ed [data-open-settings]').click();
      await tick();
      const dialog = manager.dialog(DIALOG);
      assert.ok(isOpen(dialog));
      // A tap and Escape in the dialog are not a tap outside the popover
      const radio = $(dialog, '[data-override-end]');
      radio.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, composed: true }));
      radio.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      assert.ok(card.shadowRoot.querySelector('.override-ed'), 'the popover stays open under the dialog');
      manager.back();
      await tick();
      assert.equal(isOpen(dialog), false);
      assert.ok(card.shadowRoot.querySelector('.override-ed'), 'the popover is still open');
    });

    test('closed by its ✕, it tells Home Assistant (dialog-closed), which takes back its history entry', async () => {
      const hass = withOverride();
      const manager = fakeDialogManager(hass);
      moreInfo(hass).shadowRoot.querySelector('[data-open-settings]').click();
      await tick();
      const dialog = manager.dialog(DIALOG);
      const closed = [];
      dialog.addEventListener('dialog-closed', (e) => closed.push(e.detail));
      $(dialog, '[data-close]').click();
      assert.equal(isOpen(dialog), false);
      assert.deepEqual(closed, [{ dialog: DIALOG }]);
      assert.deepEqual(manager.open, []);
    });

    test('a user who is not an admin has no link to it: the reason is plain text', () => {
      const hass = withOverride();
      hass.user = { is_admin: false };
      const block = moreInfo(hass);
      assert.equal(block.shadowRoot.querySelector('[data-open-settings]'), null);
      assert.match(text(block.shadowRoot), /aujourd'hui, au prochain créneau · encore/);
    });

    test("the panel's ⚙ opens it on top of the current tab, for an admin", async () => {
      const hass = setup();
      const manager = fakeDialogManager(hass);
      const el = panel(hass, '/schedules');
      const cog = $(el, '.toolbar [data-open-settings]');
      assert.equal(cog.getAttribute('aria-label'), 'Réglages de Chauffage');
      cog.click();
      await tick();
      assert.ok(isOpen(manager.dialog(DIALOG)));
      assert.equal(window.location.pathname, '/chauffage/schedules');
      cleanup();
      const viewer = setup();
      viewer.user = { is_admin: false };
      assert.equal($(panel(viewer, '/schedules'), '[data-open-settings]'), null);
    });

    test('/chauffage/settings, the former tab, opens the Thermostats tab and the dialog on top', async () => {
      const hass = setup();
      const manager = fakeDialogManager(hass);
      panel(hass, '/settings');
      assert.equal(window.location.pathname, '/chauffage/thermostats');
      await tick();
      assert.deepEqual(manager.shown.map((d) => d.dialogTag), [DIALOG]);
      assert.ok(isOpen(manager.dialog(DIALOG)));
    });

    describe("without Home Assistant's dialog manager", () => {
      const open = () => {
        window.history.replaceState(null, '', '/lovelace/0');
        moreInfo(withOverride()).shadowRoot.querySelector('[data-open-settings]').click();
        return document.querySelector(DIALOG);
      };

      test("it opens by itself, the browser's dialog, with its own history entry: Back closes it", async () => {
        const dialog = open();
        assert.ok(isOpen(dialog));
        assert.equal(dialog.shadowRoot.querySelector('.frame').localName, 'dialog');
        assert.ok(window.history.state && window.history.state[DIALOG], 'its own history entry');
        assert.equal(window.location.pathname, '/lovelace/0');
        window.history.back();
        await tick(20);
        assert.equal(isOpen(dialog), false);
        assert.equal(window.location.pathname, '/lovelace/0');
      });

      test('its ✕ closes it and takes back its history entry', async () => {
        const dialog = open();
        assert.ok(window.history.state && window.history.state[DIALOG]);
        $(dialog, '[data-close]').click();
        assert.equal(isOpen(dialog), false);
        await tick(20);
        assert.ok(!(window.history.state && window.history.state[DIALOG]));
      });

      test('a tap outside it closes it, and Escape too', () => {
        let dialog = open();
        const frame = $(dialog, '.frame');
        $(dialog, '.override-settings').click();
        assert.ok(isOpen(dialog), 'a tap inside keeps it open');
        frame.click(); // the backdrop: the dialog element itself
        assert.equal(isOpen(dialog), false);
        cleanup();
        dialog = open();
        $(dialog, '.frame').dispatchEvent(new window.Event('cancel', { cancelable: true })); // Escape
        assert.equal(isOpen(dialog), false);
      });
    });
  });

  describe("in Home Assistant's own dialog (ha-dialog), when Home Assistant has it", () => {
    // Home Assistant's dialog: `open`, reflected; `closed` once hidden. 2025.1 has Material's
    // (a `heading`), the later versions Web Awesome's (a `headerTitle`, its own ✕). Material's, once
    // open, listens to Escape on the whole document (mwc-dialog-base): every Material dialog open
    // closes on Escape, the more-info dialog under ours too
    class FakeHaDialog extends HTMLElement {
      get open() { return this.hasAttribute('open'); }
      set open(value) {
        const was = this.open;
        this.toggleAttribute('open', !!value);
        if (!('headerTitle' in FakeHaDialog.prototype)) {
          if (value && !was) {
            this._onDocKey = (e) => { if (e.key === 'Escape') this.open = false; };
            document.addEventListener('keydown', this._onDocKey);
          } else if (was && !value) document.removeEventListener('keydown', this._onDocKey);
        }
        if (was && !value) this.dispatchEvent(new CustomEvent('closed', { bubbles: true, composed: true }));
      }
    }
    const headerTitle = { configurable: true, get() { return this._title; }, set(v) { this._title = v; } };

    test('the newer ha-dialog: its header title, its own ✕; closed by it, or by Back', () => {
      if (!customElements.get('ha-dialog')) customElements.define('ha-dialog', FakeHaDialog);
      Object.defineProperty(FakeHaDialog.prototype, 'headerTitle', headerTitle);
      const dialog = settings(setup());
      const frame = $(dialog, '.frame');
      assert.equal(frame.localName, 'ha-dialog');
      assert.equal(frame.headerTitle, 'Réglages de Chauffage');
      assert.equal($(dialog, '[data-close]'), null, 'its own ✕');
      assert.ok(frame.querySelector('.override-settings'));
      const closed = [];
      dialog.addEventListener('dialog-closed', (e) => closed.push(e.detail));
      // A `closed` from inside it (a menu) is not its own
      frame.querySelector('.override-settings').dispatchEvent(new CustomEvent('closed', { bubbles: true }));
      assert.deepEqual(closed, []);
      // Its ✕, Escape or a tap outside: hidden and `closed`, but still `open` until told
      frame.dispatchEvent(new CustomEvent('closed', { bubbles: true, composed: true }));
      assert.deepEqual(closed, [{ dialog: 'chauffage-settings-dialog' }]);
      assert.equal(frame.open, false);
      dialog.showDialog({});
      assert.ok(isOpen(dialog), 'opens again');
      dialog.closeDialog(); // Back
      assert.equal(isOpen(dialog), false);
      assert.equal(closed.length, 2);
    });

    test('the Material ha-dialog (Home Assistant 2025.1): a heading with the title and a ✕', () => {
      delete FakeHaDialog.prototype.headerTitle;
      const dialog = settings(setup());
      const frame = $(dialog, '.frame');
      assert.equal(frame.localName, 'ha-dialog');
      assert.ok(frame.heading);
      assert.equal(frame.hideActions, true, 'no empty band of actions at its foot');
      assert.equal(text(frame.querySelector('[slot="heading"] .title')), 'Réglages de Chauffage');
      frame.querySelector('[slot="heading"] [data-close]').click();
      assert.equal(isOpen(dialog), false);
    });

    test('the Material ha-dialog (Home Assistant 2025.1): Escape closes the settings dialog only, not the more-info dialog nor the popover under it', async () => {
      delete FakeHaDialog.prototype.headerTitle;
      const OVERRIDE = { kind: 'temperature', value: 21.5, start: '2026-10-14T09:30:00+02:00', end: '2026-10-14T11:30:00+02:00', ends_at: 'next_slot' };
      const hass = setup({ overrides: { 'climate.salon': OVERRIDE } });
      const manager = fakeDialogManager(hass);
      // The more-info dialog, a Material dialog open under ours
      const moreInfo = document.body.appendChild(document.createElement('ha-dialog'));
      moreInfo.open = true;
      const card = createCard(hass, { show: ['climate.salon'] });
      card.shadowRoot.querySelector('.override[data-climate="climate.salon"]').click();
      card.shadowRoot.querySelector('.override-ed [data-open-settings]').click();
      await tick();
      const dialog = manager.dialog('chauffage-settings-dialog');
      assert.ok(isOpen(dialog));
      const closed = [];
      dialog.addEventListener('dialog-closed', (e) => closed.push(e.detail));
      // Escape, the focus on the page
      document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      assert.equal(isOpen(dialog), false);
      assert.deepEqual(closed, [{ dialog: 'chauffage-settings-dialog' }]);
      assert.ok(moreInfo.open, 'the more-info dialog stays open');
      assert.ok(card.shadowRoot.querySelector('.override-ed'), 'the popover stays open');
      // Escape, the focus in the dialog opened again
      card.shadowRoot.querySelector('.override-ed [data-open-settings]').click();
      await tick();
      assert.ok(isOpen(dialog));
      $(dialog, '[data-override-end]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      assert.equal(isOpen(dialog), false);
      assert.ok(moreInfo.open, 'the more-info dialog stays open');
      assert.ok(card.shadowRoot.querySelector('.override-ed'), 'the popover stays open');
      // Closed, the settings dialog leaves Escape to the dialogs under it
      document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      assert.equal(moreInfo.open, false);
    });
  });
});
