import { html, nothing } from 'lit';

// A link to an entity's more-info dialog, for example a thermostat's name
export const entityLink = (entity: string, label: string, title = '') => html`<span class="mi-link" role="link" tabindex="0" data-more-info=${entity} title=${title || nothing}>${label}</span>`;
