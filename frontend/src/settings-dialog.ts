import { INTEGRATION, dataSource } from './client.ts';
import { OVERRIDE_DURATION_MAX, OVERRIDE_DURATION_MIN, OVERRIDE_DURATION_STEP, errorText, esc, isAdmin, setHtml } from './common.ts';
import { MDI } from './editors.ts';
import { durationField, linksByKeyboard, listenTimeFields, roundDurationText, timeFieldDone } from './fields.ts';
import { FIELD_BOX } from './hvac.ts';
import { makeLocale } from './i18n/locale.ts';
import { afterHistoryBack, leaveMoreInfo, navigate } from './links.ts';
import { TIME_FIELD_STYLE } from './styles.ts';

// =====================================================================
//  The settings dialog (#83): Chauffage's settings, on top of the view the user is on. The reason
//  of an override's end opens it (the card's popover, the more-info dialog, the thermostat card),
//  as do the panel's ⚙, its notice and its next steps. Closing it, or the browser's Back, returns
//  to that view as it was: nothing navigates. One section per subject, *Changes by hand* first.
// =====================================================================
export const SETTINGS_DIALOG = 'chauffage-settings-dialog';
// The integration's page in Home Assistant: its *Configure* opens the options flow
export const INTEGRATION_PAGE = '/config/integrations/integration/chauffage';
// The one-time notice for existing users (#91): a thermostat turned off by hand turns back on at
// the end of its override. 'seen' once closed, or for a new user, who gets the next steps (this
// browser). It links to the overrides page of the docs, in the user's language
export const LS_NEW_OFF = 'chauffage-panel:new-off';
export const seenNewOff = () => { try { localStorage.setItem(LS_NEW_OFF, 'seen'); } catch (e) { /* ignore */ } };
export const DOC_OFF_BY_HAND = {
  en: 'https://github.com/armellarcier/ha-chauffage/blob/main/docs/overrides.md#turn-a-thermostat-off-by-hand',
  fr: 'https://github.com/armellarcier/ha-chauffage/blob/main/docs/overrides.fr.md#%C3%A9teindre-un-thermostat-%C3%A0-la-main',
};
// The notice of the setting *End of a change by hand* for existing users (#83): 'seen' once closed,
// once the settings were opened, or for a new user, who gets the next steps (this browser)
export const LS_NEW_SETTING = 'chauffage-panel:override-settings';
// The access level (#99), told once to admins
export const LS_NEW_ACCESS = 'chauffage-panel:access-level';
export const seenNewSetting = (hass) => {
  try {
    localStorage.setItem(LS_NEW_SETTING, 'seen');
    if (isAdmin(hass)) localStorage.setItem(LS_NEW_ACCESS, 'seen');
  } catch (e) { /* ignore */ }
};

// Opens the settings dialog on top of the current view. In Home Assistant, its dialog manager
// (`show-dialog`) puts the dialog on top of the dialogs already open, the more-info dialog for
// example, and gives it a history entry: Back closes it, and only it. Without Home Assistant's
// frontend, the dialog opens by itself and takes its own history entry.
// `section`: 'access' scrolls the dialog to the access level
export function openSettings(from, hass, section = null) {
  seenNewSetting(hass);
  // From the more-info block: leaving for a page closes the more-info dialog too
  const moreInfo = from.localName === 'chauffage-moreinfo';
  if (document.querySelector('home-assistant')) {
    from.dispatchEvent(new CustomEvent('show-dialog', {
      bubbles: true,
      composed: true,
      detail: { dialogTag: SETTINGS_DIALOG, dialogImport: () => Promise.resolve(), dialogParams: { moreInfo, section } },
    }));
    return;
  }
  const dialog = document.querySelector(SETTINGS_DIALOG) || document.body.appendChild(document.createElement(SETTINGS_DIALOG));
  dialog.hass = hass;
  dialog.showDialog({ history: true, moreInfo, section });
}

// An event from inside the settings dialog: not a press outside a popover, nor its Escape
export const fromSettings = (e) => e.composedPath().some((n) => n.localName === SETTINGS_DIALOG);

const SETTINGS_CSS = `
  :host { color:var(--primary-text-color); }
  /* The browser's dialog, when Home Assistant's is not there: as Home Assistant draws its own */
  dialog.frame { box-sizing:border-box; width:min(560px, calc(100vw - 32px)); max-height:calc(100vh - 64px);
    padding:0; border:0; border-radius:var(--ha-dialog-border-radius, 24px); overflow:auto;
    background:var(--ha-dialog-surface-background, var(--card-background-color, #fff)); color:var(--primary-text-color);
    box-shadow:var(--dialog-box-shadow, 0 8px 32px rgba(0,0,0,.3)); font-family:var(--ha-font-family-body, inherit); }
  dialog.frame::backdrop { background:var(--mdc-dialog-scrim-color, rgba(0,0,0,.32)); }
  /* A phone: the whole screen, as Home Assistant's dialogs */
  @media (max-width:450px) { dialog.frame { width:100vw; max-width:100vw; height:100%; max-height:100%; border-radius:0; } }
  .head { display:flex; align-items:center; gap:8px; padding:12px 8px 4px 24px; }
  dialog .head { position:sticky; top:0; z-index:1; background:inherit; }
  .head .title { flex:1; margin:0; font-size:22px; font-weight:400; line-height:1.3; }
  .close { flex:none; display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px;
    border:0; border-radius:50%; background:transparent; color:inherit; cursor:pointer; }
  .close svg { width:24px; height:24px; fill:currentColor; }
  .close:hover { background:var(--secondary-background-color); }
  dialog .body { padding:0 24px 24px; }
  /* Big targets for a finger, nothing wider than a phone */
  .override-settings h3 { margin:12px 0 4px; font-size:16px; font-weight:500; }
  .override-settings p { margin:4px 0 8px; line-height:1.5; }
  .override-settings .note { font-size:13px; color:var(--secondary-text-color); }
  .override-settings .saved { color:var(--success-color, #43a047); font-size:14px; }
  .duration-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin:8px 0 4px; }
  .duration-row label { font-weight:500; }
  .error { padding:6px 0; color:var(--error-color, #db4437); }
  /* The other options: a link a finger can reach, under a divider */
  .foot { margin-top:16px; padding-top:8px; border-top:1px solid var(--divider-color); }
  .foot a { display:inline-flex; align-items:center; min-height:44px; color:var(--primary-color); font-weight:500; text-decoration:none; }
  .foot a:hover { text-decoration:underline; }
  .choices { display:flex; flex-direction:column; gap:8px; margin:8px 0; }
  .choice { display:flex; align-items:center; gap:12px; padding:10px 12px; min-height:44px; box-sizing:border-box;
    border:1px solid var(--ha-card-border-color, var(--divider-color)); border-radius:var(--ha-card-border-radius, 12px);
    cursor:pointer; }
  /* The choice made: a 2 px border, as Home Assistant's own boxes to choose from */
  .choice:has(input:checked) { border-color:var(--primary-color); box-shadow:inset 0 0 0 1px var(--primary-color); }
  .choice input { flex:0 0 auto; width:20px; height:20px; margin:0; accent-color:var(--primary-color); }
  .choice-label { min-width:0; }
  /* The access level: a name, what it adds, and the warning of Set up, always shown */
  .choice-name, .choice-text, .choice .warning { display:block; }
  .choice-text { font-size:13px; line-height:1.4; color:var(--secondary-text-color); }
  .choice .warning { font-size:13px; line-height:1.4; color:var(--warning-color, #ffa600); }
  .access-settings { margin-top:16px; }
  .access-settings h3 { margin:12px 0 4px; font-size:16px; font-weight:500; }
  .access-settings p { margin:4px 0 8px; line-height:1.5; }
  .access-settings .note { font-size:13px; color:var(--secondary-text-color); }
  .section-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 12px; }
  .access-settings .saved { color:var(--success-color, #43a047); font-size:14px; }
  .off-end-title { margin:14px 0 4px; font-size:14px; font-weight:500; }
  /* The duration: a stepped field, the same as the end of an override */
  .duration-field { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; }
  input.time { ${FIELD_BOX} }
  ${TIME_FIELD_STYLE}
`;

export class ChauffageSettingsDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    linksByKeyboard(this.shadowRoot);
    this._open = false;
    // The duration of a change by hand: a stepped field, as the cards' time fields
    listenTimeFields(this, (el) => this._durationDone(el));
    // The settings: sent at once, as Home Assistant's own settings
    this.shadowRoot.addEventListener('change', (e) => {
      if (e.target.matches('[data-override-end]')) this._setSettings({ manual_override_end: e.target.value });
      if (e.target.matches('[data-off-override-end]')) this._setSettings({ off_override_end: e.target.value });
      if (e.target.matches('[data-access-level]')) this._setSettings({ access_level: e.target.value });
    });
    // Its ✕, and a tap outside the browser's dialog (on its backdrop: the dialog element itself)
    this.shadowRoot.addEventListener('click', (e) => {
      const other = e.target.closest('[data-other-options]');
      if (other) {
        e.preventDefault();
        this._leaveTo(other.getAttribute('href'));
        return;
      }
      if (e.target.closest('[data-close]') || (e.target === this._frame && e.target.localName === 'dialog')) this.closeDialog();
    });
    // Its own history entry (without Home Assistant's dialog manager): Back closes it
    this._onPop = () => {
      this._popped = true;
      this.closeDialog();
    };
    // Escape, in Material's ha-dialog (Home Assistant 2025.1): this dialog only (_build)
    this._onEscape = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.closeDialog();
    };
  }

  // Given by Home Assistant's dialog manager, and kept up to date
  set hass(hass) {
    this._hass = hass;
    if (this._open) this._update();
  }

  get hass() {
    return this._hass;
  }

  get _loc() {
    return makeLocale(this._hass);
  }

  get _t() {
    return makeLocale(this._hass).t;
  }

  // Home Assistant's dialog manager calls it; { history: true } when the dialog opens by itself
  showDialog(params = {}) {
    if (this._open) return;
    this._cancelLeave(); // opened again before a page left for: that page stays closed
    this._open = true;
    this._ownHistory = !!(params && params.history);
    this._moreInfo = !!(params && params.moreInfo); // opened from the more-info block
    this._popped = false;
    // Opened from the notice of the access level: scrolled to its section, once filled (_update)
    this._scrollTo = params && params.section === 'access' ? '.access-settings' : null;
    seenNewSetting(this._hass);
    this._unlisten = INTEGRATION.listen(() => this._update());
    this._build();
    this._update(); // Home Assistant may put the dialog on the page later: then connectedCallback
    if (this._ownHistory) {
      window.history.pushState({ [SETTINGS_DIALOG]: true }, '');
      window.addEventListener('popstate', this._onPop);
    }
  }

  // Home Assistant's dialog manager calls it on Back; the ✕, Escape and a tap outside too
  closeDialog() {
    const frame = this._frame;
    if (frame && frame.localName === 'ha-dialog') frame.open = false; // hidden, then `closed`
    else if (frame && typeof frame.close === 'function') frame.close();
    else if (frame) frame.removeAttribute('open');
    this._closed();
    return true;
  }

  // Closed, once: Home Assistant is told (dialog-closed), and takes back its history entry. The
  // dialog's own entry is taken back here, unless Back closed it.
  _closed() {
    if (!this._open) return;
    this._open = false;
    window.removeEventListener('keydown', this._onEscape, true);
    if (this._unlisten) this._unlisten();
    this._unlisten = null;
    if (this._ownHistory) {
      window.removeEventListener('popstate', this._onPop);
      if (!this._popped && window.history.state && window.history.state[SETTINGS_DIALOG]) window.history.back();
    }
    this.dispatchEvent(new CustomEvent('dialog-closed', { bubbles: true, composed: true, detail: { dialog: SETTINGS_DIALOG } }));
  }

  // Home Assistant's own dialog when the page has it, else the browser's. Home Assistant's dialog
  // changed: Material's until 2025 (a `heading`, our ✕), then Web Awesome's (a `headerTitle`, its
  // own ✕). Both are `open`, and say `closed` once hidden.
  _build() {
    const t = this._t;
    const title = t('settingsTitle');
    const close = `<button class="close" data-close title="${esc(t('close'))}" aria-label="${esc(t('close'))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${MDI.close}"></path></svg></button>`;
    // The duration's field stays across updates: only the parts under it are filled again
    const body = `<div class="body"><section class="override-settings"><h3>${esc(t('overridesTitle'))}</h3>
        <p class="intro">${esc(t('overrideEndIntro'))}</p>
        <div class="duration-row"><div class="duration-field"></div><span data-fill="settings-saved"></span></div>
        <div data-fill="settings"></div></section>${this._accessHtml()}${this._footHtml()}</div>`;
    this.shadowRoot.innerHTML = `<style>${SETTINGS_CSS}</style>`;
    const HaDialog = customElements.get('ha-dialog');
    let frame;
    if (HaDialog) {
      frame = document.createElement('ha-dialog');
      if ('headerTitle' in HaDialog.prototype) {
        frame.headerTitle = title;
      } else {
        frame.heading = title; // Material's dialog shows its heading slot only with a heading
        frame.hideActions = true; // no buttons at its foot: no empty band there
        frame.insertAdjacentHTML('beforeend', `<div slot="heading" class="head"><h2 class="title">${esc(title)}</h2>${close}</div>`);
        // Every Material dialog open closes on an Escape pressed anywhere: the more-info dialog
        // under this one too. Escape is caught first, and closes this dialog only
        window.addEventListener('keydown', this._onEscape, true);
      }
      frame.insertAdjacentHTML('beforeend', body);
      // Closed by its own ✕, Escape or a tap outside: the newer dialog stays `open` until told. A
      // late `closed` of a former frame (closed, then opened again during its animation) is not ours
      frame.addEventListener('closed', (e) => {
        if (e.target !== frame || frame !== this._frame) return;
        this._closed();
        if (frame.open) frame.open = false;
      });
    } else {
      frame = document.createElement('dialog');
      frame.setAttribute('aria-labelledby', 'settings-title');
      frame.innerHTML = `<div class="head"><h2 class="title" id="settings-title">${esc(title)}</h2>${close}</div>${body}`;
      // Escape: closed as by its ✕
      frame.addEventListener('cancel', (e) => {
        e.preventDefault();
        this.closeDialog();
      });
      frame.addEventListener('close', () => this._closed());
    }
    frame.classList.add('frame');
    this.shadowRoot.appendChild(frame);
    this._frame = frame;
    if (HaDialog) frame.open = true;
    else if (typeof frame.showModal === 'function') frame.showModal();
    else frame.setAttribute('open', '');
  }

  // The section *Access level* (#99): what users who are not admins may change. Admins only: a
  // user with Set up who chose it would give every user everything
  _accessHtml() {
    if (!isAdmin(this._hass)) return '';
    const t = this._t;
    return `<section class="access-settings"><div class="section-head"><h3>${esc(t('accessTitle'))}</h3><span data-fill="access-saved"></span></div>
        <p class="intro">${esc(t('accessIntro'))}</p>
        <div data-fill="access"></div><div data-fill="access-note"></div><div data-fill="access-error"></div></section>`;
  }

  // The three access levels, each with what it adds; Set up warns that its changes reach every
  // room. Drawn once, then updated in place, as the ends of an override
  _fillAccess(src, busy) {
    const host = this.shadowRoot.querySelector('[data-fill="access"]');
    if (!host) return;
    const t = this._t;
    const current = (this._settingsPending && this._settingsPending.access_level) || src.accessLevel();
    const levels = [['use', 'accessUse', 'accessUseText'], ['plan', 'accessPlan', 'accessPlanText'], ['set_up', 'accessSetUp', 'accessSetUpText']];
    setHtml(host, `<div class="choices" role="radiogroup" aria-label="${esc(t('accessTitle'))}">${levels.map(([value, label, text]) => `<label class="choice">
        <input type="radio" name="access-level" value="${value}" data-access-level>
        <span class="choice-label"><span class="choice-name">${esc(t(label))}</span>
          <span class="choice-text">${esc(t(text))}</span>
          ${value === 'set_up' ? `<span class="warning">${esc(t('accessSetUpWarning'))}</span>` : ''}</span>
      </label>`).join('')}</div>`);
    for (const input of host.querySelectorAll('input')) {
      input.checked = input.value === current;
      input.disabled = !!busy.access_level;
    }
    // Set up opens the panel to every user: each one can hide it from the sidebar
    setHtml(this.shadowRoot.querySelector('[data-fill="access-note"]'), current === 'set_up'
      ? `<p class="note sidebar-note">${esc(t('accessSidebarNote'))}</p>` : '');
    setHtml(this.shadowRoot.querySelector('[data-fill="access-saved"]'), this._settingsSaved && this._savedKey === 'access_level' && !this._settingsError
      ? `<span class="saved" role="status">${esc(t('saved'))}</span>` : '');
    setHtml(this.shadowRoot.querySelector('[data-fill="access-error"]'), this._settingsError && this._settingsErrorAt === 'access'
      ? `<div class="error">${esc(this._settingsError)}</div>` : '');
  }

  // The foot: the other options of the integration (the options flow), on its page in Home
  // Assistant, where *Configure* opens them. Admins only, as that page.
  _footHtml() {
    if (!isAdmin(this._hass)) return '';
    const t = this._t;
    return `<div class="foot"><a href="${INTEGRATION_PAGE}" data-other-options>${esc(t('otherOptions'))}</a></div>`;
  }

  // Leaving for a page: the dialog closes first, and the history entry it had is taken back (Home
  // Assistant goes back for it). The page opens once that is done, else going back would undo it.
  // The more-info dialog under it closes too (leaveMoreInfo). Back then returns to the view.
  // Opened again or removed before then: the page is not opened (_cancelLeave).
  _leaveTo(path) {
    this._cancelLeave();
    this.closeDialog();
    const gone = () => {
      const state = window.history.state;
      return !(state && (state.dialog === SETTINGS_DIALOG || state[SETTINGS_DIALOG]));
    };
    let stopMoreInfo = null;
    const stopBack = afterHistoryBack(gone, () => {
      if (this._moreInfo) stopMoreInfo = leaveMoreInfo(this, () => navigate(path));
      else navigate(path);
    });
    this._stopLeave = () => {
      stopBack();
      if (stopMoreInfo) stopMoreInfo();
    };
  }

  // A page left for and not opened yet stays closed
  _cancelLeave() {
    if (this._stopLeave) this._stopLeave();
    this._stopLeave = null;
  }

  // Home Assistant opens the dialog, then puts it on the page the first time: filled then
  connectedCallback() {
    this._update();
  }

  disconnectedCallback() {
    this._cancelLeave();
    clearTimeout(this._savedTimer);
  }

  // Not once off the page: its former Home Assistant would subscribe again (dataSource)
  _update() {
    if (!this._open || !this._hass || !this.isConnected) return;
    const src = dataSource(this._hass);
    const settings = this.shadowRoot.querySelector('[data-fill="settings"]');
    if (settings) this._fillSettings(settings, src);
    this._fillAccess(src, this._settingsBusy || {});
    // Scrolled once its content is drawn: earlier, the sections above it are not their height yet
    const section = this._scrollTo && this.shadowRoot.querySelector(this._scrollTo);
    this._scrollTo = null;
    if (section && typeof section.scrollIntoView === 'function') requestAnimationFrame(() => section.scrollIntoView({ block: 'start' }));
  }

  // A field typed in is drawn again once left (timeFieldDone)
  _render() {
    this._update();
  }

  // The section *Overrides* (#83). The duration first, then the three ends of an override, each
  // labelled with the user's own duration. Labels only: docs/overrides.md explains them (decisions.md)
  _fillSettings(settings, src) {
    const loc = this._loc;
    const t = loc.t;
    // A setting just sent shows at once, until the integration gives it back
    const pending = this._settingsPending || {};
    const given = { override_duration: src.overrideDuration(), manual_override_end: src.manualOverrideEnd(),
      off_override_end: src.offOverrideEnd(), access_level: src.accessLevel() };
    if (Object.entries(pending).every(([key, value]) => given[key] === value)) {
      this._settingsPending = null;
    }
    const minutes = (this._settingsPending && pending.override_duration) || src.overrideDuration();
    const duration = roundDurationText(minutes, loc);
    const current = (this._settingsPending && pending.manual_override_end) || src.manualOverrideEnd();
    // A control waits for the answer to its own setting only
    const busy = this._settingsBusy || {};
    const field = this.shadowRoot.querySelector('.override-settings .duration-field');
    if (field) this._fillDuration(field, minutes, !src.editable || !!busy.override_duration, loc);
    const saved = this.shadowRoot.querySelector('[data-fill="settings-saved"]');
    if (saved) {
      setHtml(saved, this._settingsError && this._settingsErrorAt === 'duration'
        ? `<span class="error" role="alert">${esc(this._settingsError)}</span>`
        : this._settingsSaved && this._savedKey !== 'access_level' ? `<span class="saved" role="status">${esc(t('saved'))}</span>` : '');
    }
    // The choices are drawn once, then updated in place: a click on a choice lands, even when the
    // press on it has just left the duration field and sent the duration
    const choices = [
      ['duration', 'overrideEndDuration'],
      ['next_slot_within_duration', 'overrideEndWithin'],
      ['next_slot', 'overrideEndNextSlot'],
    ];
    // The same choices for a thermostat turned off by hand (#91): until the next slot by default
    // In the same order as the choices above
    const offChoices = [
      ['duration', 'offEndDuration'],
      ['next_slot_within_duration', 'overrideEndWithin'],
      ['next_slot', 'offEndNextSlot'],
    ];
    const offCurrent = (this._settingsPending && pending.off_override_end) || src.offOverrideEnd();
    const group = (list, name, attr, label, cls) => `<div class="choices ${cls}" role="radiogroup" aria-label="${esc(label)}">${list.map(([value]) => `<label class="choice">
        <input type="radio" name="${name}" value="${value}" ${attr}>
        <span class="choice-label"></span>
      </label>`).join('')}</div>`;
    setHtml(settings, `${group(choices, 'override-end', 'data-override-end', t('overrideEndTitle'), 'end-choices')}
        <h4 class="off-end-title">${esc(t('offEndTitle'))}</h4>
        <p class="note off-end-help">${esc(t('offEndHelp'))}</p>
        ${group(offChoices, 'off-override-end', 'data-off-override-end', t('offEndTitle'), 'off-end-choices')}
        <p class="note slot-note">${esc(t('overrideNextSlotMeans'))}</p>
        <div data-fill="settings-end-error"></div>`);
    const fill = (list, cls, chosen, disabled) => list.forEach(([value, label], i) => {
      const choice = settings.querySelectorAll(`.${cls} .choice`)[i];
      const input = choice.querySelector('input');
      input.checked = value === chosen;
      input.disabled = disabled;
      choice.querySelector('.choice-label').textContent = t(label, { duration });
    });
    fill(choices, 'end-choices', current, !src.editable || !!busy.manual_override_end);
    fill(offChoices, 'off-end-choices', offCurrent, !src.editable || !!busy.off_override_end);
    setHtml(settings.querySelector('[data-fill="settings-end-error"]'), this._settingsError && this._settingsErrorAt === 'end'
      ? `<div class="error">${esc(this._settingsError)}</div>` : '');
  }

  // The duration of a change by hand: a stepped field, the same as the end of an override, in hours
  // and minutes ("2 h 45"), from 15 minutes to 24 hours, moved by 15 minutes by its arrows. Sent once
  // left, on Enter, or at once by its small arrows; a duration out of range is refused here.
  _fillDuration(field, minutes, disabled, loc) {
    setHtml(field, `<label for="override-duration">${esc(loc.t('overrideDurationTitle'))}</label>
      ${durationField('id="override-duration" data-override-duration', minutes, loc,
        { step: OVERRIDE_DURATION_STEP, min: OVERRIDE_DURATION_MIN, max: OVERRIDE_DURATION_MAX, disabled })}`);
  }

  // The duration field left, on Enter or moved by its arrows
  _durationDone(el) {
    timeFieldDone(this, el, (minutes) => this._setSettings({ override_duration: minutes }), () => {
      const loc = this._loc;
      this._settingsError = loc.t('overrideDurationInvalid', { min: roundDurationText(OVERRIDE_DURATION_MIN, loc), max: roundDurationText(OVERRIDE_DURATION_MAX, loc) });
      this._settingsErrorAt = 'duration';
      this._settingsSaved = false;
      this._update();
    });
  }

  // A setting sent at once: its control waits for the answer, then says it is saved. The settings
  // are sent one after the other: a choice clicked while the duration is sent waits for it.
  _setSettings(settings) {
    const [key] = Object.keys(settings);
    this._settingsError = null;
    this._settingsSaved = false;
    this._settingsBusy = { ...this._settingsBusy, [key]: ((this._settingsBusy || {})[key] || 0) + 1 };
    this._settingsPending = { ...this._settingsPending, ...settings };
    this._update();
    this._settingsSent = (this._settingsSent || Promise.resolve()).then(() => this._sendSettings(settings, key));
    return this._settingsSent;
  }

  async _sendSettings(settings, key) {
    try {
      await dataSource(this._hass).setSettings(settings);
      this._settingsSaved = true;
      this._savedKey = key;
      clearTimeout(this._savedTimer);
      this._savedTimer = setTimeout(() => { this._settingsSaved = false; this._update(); }, 3000);
    } catch (err) {
      this._settingsError = errorText(this._t, err);
      this._settingsErrorAt = { override_duration: 'duration', access_level: 'access' }[key] || 'end';
      if (this._settingsPending) delete this._settingsPending[key];
    }
    this._settingsBusy = { ...this._settingsBusy, [key]: this._settingsBusy[key] - 1 };
    this._update();
  }
}
