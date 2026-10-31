// Simulated browser (jsdom) so the card can be loaded in Node.
// Must be imported BEFORE the card (custom_components/chauffage/frontend/).
import { JSDOM } from 'jsdom';

process.env.TZ = 'Europe/Paris';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true, // requestAnimationFrame
});
const w = dom.window;

for (const name of [
  'window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'Event', 'MouseEvent',
  'Node', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'navigator',
]) {
  Object.defineProperty(globalThis, name, { value: name === 'window' ? w : w[name], configurable: true, writable: true });
}

// jsdom has no layout and no pointer capture: the drag tests give the bars a geometry
w.HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
