import { html, nothing } from 'lit';
import { commands } from './client/commands.ts';
import { dataSource } from './client/snapshot.ts';
import { errorText, thermostatName, toMin } from './common.ts';
import { modeName } from './hvac.ts';
import { makeLocale } from './i18n/locale.ts';
import { presetOf } from './presets.ts';

// =====================================================================
//  The setting Control the HVAC mode (#159), for the house or for one thermostat, in the settings
//  dialog. Before a thermostat loses the control, the slots that change are listed, and the user
//  turns it off or cancels. The dialog keeps `_hvacAsk`, `_hvacBusy` and `_hvacError`, and draws
//  again on requestUpdate().
// =====================================================================

// The slots that change, by thermostat and schedule, a slot's days together:
// "Lun, Mar · 23:00 · Éteint → supprimé", "Lun · 14:00 · Confort, Clim → Confort"
function changesTemplate(hass, src, changes) {
  const loc = makeLocale(hass);
  const groups = [];
  for (const c of changes) {
    const key = `${c.entity_id}|${c.schedule}`;
    let group = groups.find((g) => g.key === key);
    if (!group) groups.push(group = { key, climate: c.entity_id, schedule: c.schedule, rows: [] });
    const slot = `${c.start}|${c.preset}|${c.hvac_mode}|${c.change}`;
    let row = group.rows.find((r) => r.slot === slot);
    if (!row) group.rows.push(row = { slot, ...c, days: [] });
    row.days.push(c.day);
  }
  const preset = (id) => presetOf(src.presets(), id, loc).name;
  const line = (r) => {
    const before = [r.preset ? preset(r.preset) : null, r.hvac_mode ? modeName(loc, r.hvac_mode) : null].filter(Boolean).join(', ');
    const after = r.change === 'removed' ? loc.t('hvacSlotRemoved') : preset(r.preset);
    return `${loc.daysLabel(r.days)} · ${loc.time(toMin(r.start))} · ${before} → ${after}`;
  };
  return html`<ul class="hvac-changes">${groups.map((g) => html`<li><strong>${thermostatName(hass, g.climate)}</strong> · ${src.scheduleName(g.schedule)}
    <ul>${g.rows.sort((a, b) => toMin(a.start) - toMin(b.start)).map((r) => html`<li>${line(r)}</li>`)}</ul></li>`)}</ul>`;
}

// The question, in the settings dialog and in the panel: the slots, then two buttons a finger can
// reach
export const HVAC_ASK_STYLE = `
  .hvac-ask { margin:8px 0; padding:12px; border:1px solid var(--warning-color, #ffa600); border-radius:12px; }
  .hvac-ask-title { margin:0 0 4px; font-weight:500; }
  .hvac-changes { margin:0; padding-left:18px; font-size:14px; line-height:1.5; max-height:40vh; overflow:auto; }
  .hvac-changes ul { margin:0 0 6px; padding-left:16px; }
  .hvac-ask-btns { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:8px; }
  .hvac-ask .btn { min-height:40px; padding:0 16px; border:1px solid var(--divider-color); border-radius:20px;
    background:transparent; color:var(--primary-color); font:inherit; font-weight:500; cursor:pointer; }
  .hvac-ask .btn.primary { border-color:var(--primary-color); background:var(--primary-color); color:var(--text-primary-color, #fff); }
  .hvac-ask .btn:disabled { opacity:.5; cursor:default; }
`;

// The question before the control is lost, or the error of the last change
export function hvacAskTemplate(host) {
  const t = makeLocale(host.hass).t;
  const error = host._hvacError ? html`<div class="error" role="alert">${host._hvacError}</div>` : nothing;
  if (!host._hvacAsk) return error;
  const src = dataSource(host.hass);
  return html`<div class="hvac-ask" role="group" aria-label=${t('hvacControlTitle')}>
      <p class="hvac-ask-title">${t('hvacControlAsk')}</p>${changesTemplate(host.hass, src, host._hvacAsk.changes)}
      <div class="hvac-ask-btns"><button class="btn" data-hvac-cancel ?disabled=${host._hvacBusy} @click=${() => answerHvacControl(host, false)}>${t('cancel')}</button>
      <button class="btn primary" data-hvac-confirm ?disabled=${host._hvacBusy} @click=${() => answerHvacControl(host, true)}>${t('hvacControlConfirm')}</button></div></div>${error}`;
}

// A choice made (`climate` null: the house). The integration says first which slots would
// change: none, the choice is saved at once; some, the user is asked (hvacAskTemplate)
export async function chooseHvacControl(host, value, climate) {
  const send = commands(host.hass).setHvacModeControl;
  host._hvacError = null;
  host._hvacAsk = null;
  host._hvacBusy = true;
  host.requestUpdate();
  try {
    const preview = await send(value, climate, true);
    const changes = (preview && preview.changes) || [];
    if (changes.length) host._hvacAsk = { value, climate, changes };
    else await send(value, climate);
  } catch (err) {
    host._hvacError = errorText(makeLocale(host.hass).t, err);
  }
  host._hvacBusy = false;
  host.requestUpdate();
}

// The question answered: the weeks are converted (confirmed), or nothing changes (cancelled)
export async function answerHvacControl(host, confirmed) {
  const ask = host._hvacAsk;
  if (!ask || host._hvacBusy) return;
  if (!confirmed) {
    host._hvacAsk = null;
    host.requestUpdate();
    return;
  }
  host._hvacBusy = true;
  host.requestUpdate();
  try {
    await commands(host.hass).setHvacModeControl(ask.value, ask.climate);
    host._hvacAsk = null;
  } catch (err) {
    host._hvacError = errorText(makeLocale(host.hass).t, err);
  }
  host._hvacBusy = false;
  host.requestUpdate();
}

// The choice shown: the one asked about, else the setting
export const hvacChoiceOf = (host, setting) => (host._hvacAsk ? host._hvacAsk.value : setting);
