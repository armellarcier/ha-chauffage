import { LitElement, html, unsafeCSS } from 'lit';
import { linksByKeyboard } from '../../fields.ts';
import { STYLE } from '../../styles.ts';

// The frame of a view on a page of the panel: a card around the view, with the cards'
// stylesheet. The view draws in the frame's shadow root. The panel's own stylesheet would clash
// with the views' (.head, .menu, .btn…).
export class ChauffageViewFrame extends LitElement {
  static styles = unsafeCSS(STYLE);

  static properties = {
    view: { attribute: false },
    flat: { attribute: false },
  };

  // The view's element, created and set by the panel
  declare view: HTMLElement;
  // Without the card's padding, background and border: the view is part of a surface of the page
  declare flat: boolean;

  createRenderRoot() {
    const root = super.createRenderRoot();
    linksByKeyboard(root);
    return root;
  }

  render() {
    return html`<ha-card class=${this.flat ? 'flat' : ''}>${this.view}</ha-card>`;
  }
}
