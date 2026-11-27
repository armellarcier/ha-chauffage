import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { live } from 'lit/directives/live.js';
import { dataSource } from './client/snapshot.ts';
import { commands } from './client/commands.ts';
import { client } from './client/chauffage-client.ts';
import { OVERRIDE_DURATION_MAX, OVERRIDE_DURATION_MIN, OVERRIDE_DURATION_STEP, errorText, isAdmin } from './common.ts';
import { MDI } from './editors.ts';
import { durationField, linksByKeyboard, listenTimeFields, roundDurationText, timeFieldDone } from './fields.ts';
import { FIELD_BOX } from './hvac.ts';
import { HVAC_ASK_STYLE, chooseHvacControl, hvacAskTemplate, hvacChoiceOf } from './hvac-control.ts';
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
  const dialog: any = document.querySelector(SETTINGS_DIALOG) || document.body.appendChild(document.createElement(SETTINGS_DIALOG));
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
  .hvac-settings { margin-top:16px; }
  .hvac-settings h3 { margin:12px 0 4px; font-size:16px; font-weight:500; }
  .hvac-settings .note { margin:4px 0 8px; font-size:13px; line-height:1.4; color:var(--secondary-text-color); }
  ${HVAC_ASK_STYLE}
  /* The duration: a stepped field, the same as the end of an override */
  .duration-field { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; }
  input.time { ${FIELD_BOX} }
  ${TIME_FIELD_STYLE}
`;

export class ChauffageSettingsDialog extends LitElement {
  static properties = {
    hass: { attribute: false },
  };

  static styles = unsafeCSS(SETTINGS_CSS);

  // Given by Home Assistant's dialog manager, and kept up to date
  declare hass: any;
  _open = false;
  // Each opening draws a new frame: a late `closed` of a former one is not ours
  _opening = 0;
  // The frame drawn for the current opening: Home Assistant's dialog, or the browser's
  _frame: any = null;
  // 'wa' (Home Assistant's dialog from 2025.2), 'material' (2025.1), 'native' (the browser's)
  _kind: 'wa' | 'material' | 'native' = 'native';
  _moreInfo = false;
  _ownHistory = false;
  _popped = false;
  _scrollTo: string | null = null;
  _savedKey: string | null = null;
  _savedTimer: any;
  _settingsBusy: any;
  _settingsError: string | null = null;
  _settingsErrorAt: string | null = null;
  _settingsPending: any;
  _settingsSaved = false;
  _settingsSent: Promise<unknown> | null = null;
  // The setting Control the HVAC mode (#159): the question asked before it turns off (hvac-control.ts)
  _hvacAsk: any = null;
  _hvacBusy = false;
  _hvacError: string | null = null;
  _stopLeave: (() => void) | null = null;
  _unlisten: (() => void) | null = null;
  // Its own history entry (without Home Assistant's dialog manager): Back closes it
  _onPop = () => {
    this._popped = true;
    this.closeDialog();
  };

  // Escape, in Material's ha-dialog (Home Assistant 2025.1): this dialog only
  _onEscape = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    this.closeDialog();
  };

  createRenderRoot() {
    const root = super.createRenderRoot();
    linksByKeyboard(root);
    // The duration of a change by hand: a stepped field, as the cards' time fields
    listenTimeFields(this, (el) => this._durationDone(el));
    // The settings: sent at once, as Home Assistant's own settings
    root.addEventListener('change', (e: any) => {
      if (e.target.matches('[data-override-end]')) this._setSettings({ manual_override_end: e.target.value });
      if (e.target.matches('[data-off-override-end]')) this._setSettings({ off_override_end: e.target.value });
      if (e.target.matches('[data-access-level]')) this._setSettings({ access_level: e.target.value });
    });
    // Its ✕, and a tap outside the browser's dialog (on its backdrop: the dialog element itself)
    root.addEventListener('click', (e: any) => {
      const other = e.target.closest('[data-other-options]');
      if (other) {
        e.preventDefault();
        this._leaveTo(other.getAttribute('href'));
        return;
      }
      if (e.target.closest('[data-close]') || (e.target === this._frame && e.target.localName === 'dialog')) this.closeDialog();
    });
    return root;
  }

  get _loc() {
    return makeLocale(this.hass);
  }

  get _t() {
    return makeLocale(this.hass).t;
  }

  // Home Assistant's dialog manager calls it; { history: true } when the dialog opens by itself
  showDialog(params = {}) {
    if (this._open) return;
    this._cancelLeave(); // opened again before a page left for: that page stays closed
    this._open = true;
    this._opening += 1;
    this._frame = null; // drawn next
    this._ownHistory = !!(params && (params as any).history);
    this._moreInfo = !!(params && (params as any).moreInfo); // opened from the more-info block
    this._popped = false;
    // Opened from the notice of the access level: scrolled to its section, once filled (updated)
    this._scrollTo = params && (params as any).section === 'access' ? '.access-settings' : null;
    seenNewSetting(this.hass);
    this._unlisten = client.listen(() => this.requestUpdate());
    // Home Assistant's own dialog when the page has it, else the browser's. Home Assistant's
    // dialog changed: Material's until 2025 (a `heading`, our ✕), then Web Awesome's (a
    // `headerTitle`, its own ✕).
    const HaDialog = customElements.get('ha-dialog');
    this._kind = !HaDialog ? 'native' : 'headerTitle' in HaDialog.prototype ? 'wa' : 'material';
    // Every Material dialog open closes on an Escape pressed anywhere: the more-info dialog
    // under this one too. Escape is caught first, and closes this dialog only
    if (this._kind === 'material') window.addEventListener('keydown', this._onEscape, true);
    this.requestUpdate(); // Home Assistant may put the dialog on the page later: drawn then
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

  // Closed by its own ✕, Escape or a tap outside: Home Assistant's newer dialog stays `open` until
  // told. A late `closed` of a former frame (closed, then opened again during its animation), or
  // of a menu inside it, is not ours
  _frameClosed(e) {
    const frame = e.currentTarget;
    if (e.target !== frame || frame !== this._frame) return;
    this._closed();
    if (frame.open) frame.open = false;
  }

  // Escape, in the browser's dialog: closed as by its ✕
  _cancelled(e) {
    e.preventDefault();
    this.closeDialog();
  }

  // Drawn while open and on the page. Not once off the page: its former Home Assistant would
  // subscribe again (dataSource)
  shouldUpdate() {
    return this._open && !!this.hass && this.isConnected;
  }

  // A setting just sent shows at once, until the integration gives it back
  willUpdate() {
    const src = dataSource(this.hass);
    const given = { override_duration: src.overrideDuration(), manual_override_end: src.manualOverrideEnd(),
      off_override_end: src.offOverrideEnd(), access_level: src.accessLevel() };
    if (Object.entries(this._settingsPending || {}).every(([key, value]) => given[key] === value)) {
      this._settingsPending = null;
    }
  }

  render() {
    return keyed(this._opening, this._frameTemplate());
  }

  updated() {
    const frame: any = this.renderRoot.querySelector('.frame');
    if (frame !== this._frame) {
      this._frame = frame;
      if (this._kind !== 'native') frame.open = true;
      else if (typeof frame.showModal === 'function') frame.showModal();
      else frame.setAttribute('open', '');
    }
    // Scrolled once its content is drawn: earlier, the sections above it are not their height yet
    const section: any = this._scrollTo && this.renderRoot.querySelector(this._scrollTo);
    this._scrollTo = null;
    if (section && typeof section.scrollIntoView === 'function') requestAnimationFrame(() => section.scrollIntoView({ block: 'start' }));
  }

  _frameTemplate() {
    const t = this._t;
    const title = t('settingsTitle');
    const close = html`<button class="close" data-close title=${t('close')} aria-label=${t('close')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d=${MDI.close}></path></svg></button>`;
    if (this._kind === 'wa') {
      return html`<ha-dialog class="frame" .headerTitle=${title} @closed=${this._frameClosed}>${this._body()}</ha-dialog>`;
    }
    if (this._kind === 'material') {
      // Material's dialog shows its heading slot only with a heading; no buttons at its foot: no
      // empty band there
      return html`<ha-dialog class="frame" .heading=${title} .hideActions=${true} @closed=${this._frameClosed}>
        <div slot="heading" class="head"><h2 class="title">${title}</h2>${close}</div>${this._body()}</ha-dialog>`;
    }
    return html`<dialog class="frame" aria-labelledby="settings-title" @cancel=${this._cancelled} @close=${() => this._closed()}>
      <div class="head"><h2 class="title" id="settings-title">${title}</h2>${close}</div>${this._body()}</dialog>`;
  }

  _body() {
    const src = dataSource(this.hass);
    return html`<div class="body">${this._overrideSettings(src)}${this._hvacSettings(src)}${this._accessSettings(src)}${this._foot()}</div>`;
  }

  // The section *Overrides* (#83). The duration first, then the three ends of an override, each
  // labelled with the user's own duration. Labels only: docs/overrides.md explains them (decisions.md)
  _overrideSettings(src) {
    const loc = this._loc;
    const t = loc.t;
    const pending = this._settingsPending || {};
    const minutes = (this._settingsPending && pending.override_duration) || src.overrideDuration();
    const duration = roundDurationText(minutes, loc);
    const current = (this._settingsPending && pending.manual_override_end) || src.manualOverrideEnd();
    const offCurrent = (this._settingsPending && pending.off_override_end) || src.offOverrideEnd();
    // A control waits for the answer to its own setting only
    const busy = this._settingsBusy || {};
    const error = (at) => (this._settingsError && this._settingsErrorAt === at ? this._settingsError : null);
    // The same choices for a thermostat turned off by hand (#91): until the next slot by default.
    // In the same order as the choices above
    const choices = [
      ['duration', 'overrideEndDuration'],
      ['next_slot_within_duration', 'overrideEndWithin'],
      ['next_slot', 'overrideEndNextSlot'],
    ];
    const offChoices = [
      ['duration', 'offEndDuration'],
      ['next_slot_within_duration', 'overrideEndWithin'],
      ['next_slot', 'offEndNextSlot'],
    ];
    const group = (list, name, attr, label, cls, chosen, disabled) => html`<div class="choices ${cls}" role="radiogroup" aria-label=${label}>${list.map(([value, text]) => html`<label class="choice">
        <input type="radio" name=${name} value=${value} ?data-override-end=${attr === 'data-override-end'} ?data-off-override-end=${attr === 'data-off-override-end'}
          .checked=${live(value === chosen)} .disabled=${disabled}>
        <span class="choice-label">${t(text, { duration })}</span>
      </label>`)}</div>`;
    const durationError = error('duration');
    const endError = error('end');
    return html`<section class="override-settings"><h3>${t('overridesTitle')}</h3>
        <p class="intro">${t('overrideEndIntro')}</p>
        <div class="duration-row"><div class="duration-field">${this._durationField(minutes, !src.editable || !!busy.override_duration, loc)}</div><span data-fill="settings-saved">${
          durationError ? html`<span class="error" role="alert">${durationError}</span>`
          : this._settingsSaved && this._savedKey !== 'access_level' ? html`<span class="saved" role="status">${t('saved')}</span>` : nothing}</span></div>
        <div data-fill="settings">${group(choices, 'override-end', 'data-override-end', t('overrideEndTitle'), 'end-choices', current, !src.editable || !!busy.manual_override_end)}
        <h4 class="off-end-title">${t('offEndTitle')}</h4>
        <p class="note off-end-help">${t('offEndHelp')}</p>
        ${group(offChoices, 'off-override-end', 'data-off-override-end', t('offEndTitle'), 'off-end-choices', offCurrent, !src.editable || !!busy.off_override_end)}
        <p class="note slot-note">${t('overrideNextSlotMeans')}</p>
        <div data-fill="settings-end-error">${endError ? html`<div class="error">${endError}</div>` : nothing}</div></div></section>`;
  }

  // The duration of a change by hand: a stepped field, the same as the end of an override, in hours
  // and minutes ("2 h 45"), from 15 minutes to 24 hours, moved by 15 minutes by its arrows. Sent once
  // left, on Enter, or at once by its small arrows; a duration out of range is refused here. The
  // same field stays while its duration is the same: a duration typed is not reset by a redraw.
  _durationField(minutes, disabled, loc) {
    return html`<label for="override-duration">${loc.t('overrideDurationTitle')}</label>
      ${durationField({ id: 'override-duration', 'data-override-duration': true }, minutes, loc,
        { step: OVERRIDE_DURATION_STEP, min: OVERRIDE_DURATION_MIN, max: OVERRIDE_DURATION_MAX, disabled })}`;
  }

  // The section *Control the HVAC mode* of the house (#159): on or off, and the question asked
  // before it turns off
  _hvacSettings(src) {
    const t = this._t;
    const current = hvacChoiceOf(this, src.hvacModeControl()) ? 'on' : 'off';
    const disabled = !src.editable || this._hvacBusy || !!this._hvacAsk;
    const choices = [['on', 'hvacControlOn'], ['off', 'hvacControlOff']];
    return html`<section class="hvac-settings"><h3>${t('hvacControlTitle')}</h3>
        <div class="choices" role="radiogroup" aria-label=${t('hvacControlTitle')}>${choices.map(([value, label]) => html`<label class="choice">
          <input type="radio" name="hvac-control" value=${value} data-hvac-control .checked=${live(value === current)} .disabled=${disabled}
            @change=${() => chooseHvacControl(this, value === 'on', null)}>
          <span class="choice-label">${t(label)}</span></label>`)}</div>
        <p class="note">${t('hvacControlHelp')}</p>${hvacAskTemplate(this)}</section>`;
  }

  // The section *Access level* (#99): what users who are not admins may change. Admins only: a
  // user with Set up who chose it would give every user everything. The three access levels, each
  // with what it adds; Set up warns that its changes reach every room.
  _accessSettings(src) {
    if (!isAdmin(this.hass)) return nothing;
    const t = this._t;
    const busy = this._settingsBusy || {};
    const current = (this._settingsPending && this._settingsPending.access_level) || src.accessLevel();
    const levels = [['use', 'accessUse', 'accessUseText'], ['plan', 'accessPlan', 'accessPlanText'], ['set_up', 'accessSetUp', 'accessSetUpText']];
    const error = this._settingsError && this._settingsErrorAt === 'access' ? this._settingsError : null;
    return html`<section class="access-settings"><div class="section-head"><h3>${t('accessTitle')}</h3><span data-fill="access-saved">${
        this._settingsSaved && this._savedKey === 'access_level' && !this._settingsError ? html`<span class="saved" role="status">${t('saved')}</span>` : nothing}</span></div>
        <p class="intro">${t('accessIntro')}</p>
        <div data-fill="access"><div class="choices" role="radiogroup" aria-label=${t('accessTitle')}>${levels.map(([value, label, text]) => html`<label class="choice">
          <input type="radio" name="access-level" value=${value} data-access-level .checked=${live(value === current)} .disabled=${!!busy.access_level}>
          <span class="choice-label"><span class="choice-name">${t(label)}</span>
            <span class="choice-text">${t(text)}</span>
            ${value === 'set_up' ? html`<span class="warning">${t('accessSetUpWarning')}</span>` : nothing}</span>
        </label>`)}</div></div>
        <div data-fill="access-note">${current === 'set_up' ? html`<p class="note sidebar-note">${t('accessSidebarNote')}</p>` : nothing}</div>
        <div data-fill="access-error">${error ? html`<div class="error">${error}</div>` : nothing}</div></section>`;
  }

  // The foot: the other options of the integration (the options flow), on its page in Home
  // Assistant, where *Configure* opens them. Admins only, as that page.
  _foot() {
    if (!isAdmin(this.hass)) return nothing;
    return html`<div class="foot"><a href=${INTEGRATION_PAGE} data-other-options>${this._t('otherOptions')}</a></div>`;
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

  // Opened while off the page: drawn once Home Assistant puts it back
  connectedCallback() {
    super.connectedCallback();
    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cancelLeave();
    clearTimeout(this._savedTimer);
  }

  // The duration field left, on Enter or moved by its arrows
  _durationDone(el) {
    timeFieldDone(this, el, (minutes) => this._setSettings({ override_duration: minutes }), () => {
      const loc = this._loc;
      this._settingsError = loc.t('overrideDurationInvalid', { min: roundDurationText(OVERRIDE_DURATION_MIN, loc), max: roundDurationText(OVERRIDE_DURATION_MAX, loc) });
      this._settingsErrorAt = 'duration';
      this._settingsSaved = false;
      this.requestUpdate();
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
    this.requestUpdate();
    this._settingsSent = (this._settingsSent || Promise.resolve()).then(() => this._sendSettings(settings, key));
    return this._settingsSent;
  }

  async _sendSettings(settings, key) {
    try {
      await commands(this.hass).setSettings(settings);
      this._settingsSaved = true;
      this._savedKey = key;
      clearTimeout(this._savedTimer);
      this._savedTimer = setTimeout(() => { this._settingsSaved = false; this.requestUpdate(); }, 3000);
    } catch (err) {
      this._settingsError = errorText(this._t, err);
      this._settingsErrorAt = { override_duration: 'duration', access_level: 'access' }[key] || 'end';
      if (this._settingsPending) delete this._settingsPending[key];
    }
    this._settingsBusy = { ...this._settingsBusy, [key]: this._settingsBusy[key] - 1 };
    this.requestUpdate();
  }
}
