import { html, nothing } from 'lit';

// A row of the panel's lists (the thermostats, the schedules): a link to its sheet, with an icon,
// a title and a line under it, then its actions (its ⋮). A click on the actions does not follow
// the link (inRowActions)
export function listRow({ cls = 'th-row', climate = null, schedule = null, to, icon, title, sub = nothing, actions = null }: {
  cls?: string; climate?: string | null; schedule?: string | null; to: string; icon: string; title: unknown; sub?: unknown; actions?: unknown;
}) {
  return html`<div class=${cls} data-climate=${climate ?? nothing} data-schedule=${schedule ?? nothing} role="link" tabindex="0" data-navigate=${to}>
    <div class="th-main">
      <ha-icon class="th-icon" icon=${icon}></ha-icon>
      <div class="th-text"><div class="th-title">${title}</div>${sub}</div>
      <ha-icon class="th-chevron" icon="mdi:chevron-right" aria-hidden="true"></ha-icon>
    </div>
    ${actions ? html`<span class="th-divider"></span><div class="th-actions">${actions}</div>` : nothing}
  </div>`;
}
