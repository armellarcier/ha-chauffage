import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { errorText, plainRule } from '../../common.ts';
import { RulesDraft } from '../../state/rules-draft.ts';
import { ChauffageView } from './view.ts';

// What Home Assistant reads as true or false in a template's text (any other text is false)
const BOOLEAN_WORDS = ['true', 'false', 'on', 'off', 'yes', 'no', '1', '0', 'enable', 'disable'];

// A try of the rules by the integration: the rules tried, and what each one gives now
type Preview = { rules: { template: string; schedule: string | null }[]; data: any; unsub?: Promise<() => void> };

// The "Rules" view: one row per rule (template, the schedule it activates or "given by the
// template", what it gives now), then the schedule when no rule applies. The rules shown are tried
// by the integration as they are typed (_syncPreview); otherwise its results for the saved ones.
export class ChauffageRulesView extends ChauffageView {
  // The activation rules being edited
  _draft = new RulesDraft();
  // How long a pause in the typing lasts before the rules are tried, in ms
  _previewDelay = 400;
  // The last try shown, kept while the next one starts: rules unchanged still show it
  _preview: Preview | null = null;
  _previewSub: Preview | null = null;
  _previewKey: string | null = null;
  _previewTimer: any;

  constructor() {
    super();
    this.addEventListener('input', (e: any) => {
      if (!e.target.hasAttribute('data-rule-template')) return;
      this._edit((d) => { d.rules[Number(e.target.dataset.ruleTemplate)].template = e.target.value; });
      this._syncPreview();
    });
    this.addEventListener('change', (e: any) => {
      const el = e.target;
      if (el.hasAttribute('data-rule-schedule')) this._edit((d) => { d.rules[Number(el.dataset.ruleSchedule)].schedule = el.value || null; });
      else if (el.hasAttribute('data-rules-default')) this._edit((d) => { d.def = el.value || null; });
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._previewTimer);
    this._closePreview();
    this._previewKey = null;
  }

  updated() {
    this._syncPreview();
  }

  render() {
    const t = this._loc.t;
    const src = this._source();
    const editable = src.editable;
    const { rules, def } = this._draft.shown(src);
    const saved = src.rules();
    const results = src.ruleResults();
    const schedules = src.schedules();
    const options = (selected) => schedules.map((id) => html`<option value=${id} ?selected=${id === selected}>${src.scheduleName(id)}</option>`);
    const live_ = this._preview && this._preview.data;
    // What a rule gives now: tried while typed, or the integration's result for the same saved rule
    const stateOf = (rule, i) => {
      const tried = live_ && this._preview.rules[i];
      if (tried && tried.template === rule.template && tried.schedule === (rule.schedule || null)) {
        return { result: live_.results[i], text: live_.texts[i], error: live_.errors[i], live: true };
      }
      const s = saved[i];
      const same = s && s.template === rule.template.trim() && (s.schedule || null) === (rule.schedule || null);
      return same ? { result: results[i], text: null, error: null, live: false } : null;
    };
    const rows = rules.map((rule, i) => {
      const st = rule.template.trim() ? stateOf(rule, i) : null;
      let cls = 'unsaved';
      let label = t('ruleUnsaved');
      if (st && st.result == null) [cls, label] = ['error', t('ruleError')];
      else if (st && !rule.schedule) [cls, label] = st.result ? ['true', `→ ${src.scheduleName(st.result)}`] : ['false', t('ruleNoSchedule')];
      else if (st) [cls, label] = st.result ? ['true', t('ruleTrue')] : ['false', t('ruleFalse')];
      let detail = '';
      if (st && st.live && st.error) detail = st.error;
      else if (st && st.live && st.text != null) {
        detail = t('ruleText', { text: st.text });
        const boolean = BOOLEAN_WORDS.includes(st.text.trim().toLowerCase());
        if (rule.schedule && !boolean) detail += ` · ${t('ruleNotBoolean')}`;
        if (!rule.schedule && !st.result) detail += ` · ${t(boolean ? 'ruleChooseSchedule' : 'ruleNamesNone')}`;
      }
      const tools = editable ? html`<span class="rule-tools">
          <button class="btn icon" data-act="rule-up" data-idx=${i} @click=${() => this._moveRule(i, -1)} title=${t('ruleUp')} ?disabled=${!i}>↑</button>
          <button class="btn icon" data-act="rule-down" data-idx=${i} @click=${() => this._moveRule(i, 1)} title=${t('ruleDown')} ?disabled=${i >= rules.length - 1}>↓</button>
          <button class="btn icon" data-act="rule-delete" data-idx=${i} @click=${() => this._edit((d) => d.rules.splice(i, 1))} title=${t('delete')}>✕</button></span>` : nothing;
      return html`<div class="rule">
        <div class="rule-head"><span class="rule-num">${i + 1}</span><span class="rule-state ${cls}">${label}</span>${tools}</div>
        <textarea data-rule-template=${i} rows="2" spellcheck="false" placeholder="{{ is_state('sensor.edf_tempo_color', 'red') }}" ?readonly=${!editable} .value=${live(rule.template)}></textarea>
        ${detail ? html`<div class="rule-result${st.error ? ' error' : ''}">${detail}</div>` : nothing}
        <label class="rule-then">${t('ruleActivates')} <select data-rule-schedule=${i} ?disabled=${!editable} .value=${live(rule.schedule || '')}>
          <option value="" ?selected=${!rule.schedule}>${t('ruleTemplateGives')}</option>${options(rule.schedule)}</select></label>
      </div>`;
    });
    // What the integration's rules give now, and a schedule chosen by hand meanwhile
    let outcome = '';
    if (saved.length) {
      const first = saved.findIndex((_, i) => results[i]);
      const given = first >= 0 ? saved[first].schedule || results[first] : src.defaultSchedule();
      const active = src.activeSchedule();
      outcome = !given ? t('rulesNoOutcome') : t('rulesOutcome', { schedule: src.scheduleName(given) });
      if (given && active && given !== active) outcome += ` ${t('rulesByHand', { schedule: src.scheduleName(active) })}`;
    }
    const actions = editable ? html`<div class="ed-actions start">
        <button class="btn" data-act="rule-add" @click=${() => this._edit((d) => d.rules.push({ template: '', schedule: this._source().schedules()[0] }))}>${t('ruleAdd')}</button>
        ${this._draft.edited ? html`<button class="btn" data-act="rules-cancel" @click=${() => this._cancel()}>${t('cancel')}</button>` : nothing}
        <button class="btn primary" data-act="rules-save" @click=${() => this._save()} ?disabled=${!this._draft.edited}>${t('save')}</button></div>` : nothing;
    return html`<div class="rules-view">
      <div class="muted">${t('rulesIntro')} <a class="rules-try" href="/developer-tools/template" target="_top">${t('rulesTry')}</a></div>
      ${rules.length ? rows : html`<div class="rules-empty muted">${t('rulesEmpty')}</div>`}
      ${rules.length ? html`<label class="rule-then rules-default">${t('rulesOtherwise')} <select data-rules-default ?disabled=${!editable} .value=${live(def || '')}>
        <option value="" ?selected=${!def}>${t('rulesKeep')}</option>${options(def)}</select></label>` : nothing}
      ${outcome ? html`<div class="rules-outcome">${outcome}</div>` : nothing}
      ${actions}
    </div>${this._msgTemplate(this._msg || (this._draft.edited ? t('unsaved') : ''))}`;
  }

  // The rules shown are tried by the integration (chauffage/rules/preview, canSetUp: a template
  // can read any entity), again whenever their entities change; a new try once they are edited,
  // after a short pause in the typing
  _syncPreview() {
    if (!this.hass) return;
    const src = this._source();
    const rules = src.ready && src.editable && this.hass.connection ? this._draft.shown(src).rules.map(plainRule) : [];
    const key = JSON.stringify(rules);
    if (key === this._previewKey) return;
    this._previewKey = key;
    clearTimeout(this._previewTimer);
    this._closePreview();
    if (!rules.length) return;
    this._previewTimer = setTimeout(() => {
      const sub: Preview = { rules, data: null };
      this._previewSub = sub;
      sub.unsub = this.hass.connection.subscribeMessage((data) => {
        if (this._previewSub !== sub) return;
        sub.data = data;
        this._preview = sub;
        this.requestUpdate();
      }, { type: 'chauffage/rules/preview', rules });
      sub.unsub.catch(() => {});
    }, this._previewDelay);
  }

  _closePreview() {
    if (!this._previewSub) return;
    this._previewSub.unsub.then((unsub) => unsub()).catch(() => {});
    this._previewSub = null;
  }

  // Edits the draft of the rules (see RulesDraft.edit)
  _edit(change) {
    this._draft.edit(this._source(), change);
    this._msg = '';
    this.requestUpdate();
  }

  // A rule moves up (-1) or down (1) the list
  _moveRule(i, dir) {
    const j = i + dir;
    this._edit((d) => { [d.rules[i], d.rules[j]] = [d.rules[j], d.rules[i]]; });
  }

  _cancel() {
    this._draft.drop();
    this._msg = '';
    this.requestUpdate();
  }

  async _save() {
    try {
      const { rules, def } = this._draft.toSave(this._source());
      await this._commands().setRules(rules, def);
      this._draft.drop();
      this._msg = this._loc.t('saved');
    } catch (err) {
      this._msg = errorText(this._loc.t, err);
    }
    this.requestUpdate();
  }
}
