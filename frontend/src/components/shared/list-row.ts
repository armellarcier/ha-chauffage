import { html, nothing } from 'lit';

// A row of the panel's lists, as the rows of the integration's page: an icon, a name and a line
// under it, a chevron, then its actions after a divider. The whole row is one link, except its
// actions (inRowActions)
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
