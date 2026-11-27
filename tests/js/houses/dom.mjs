// Reading and driving a card in the simulated browser
export const $ = (el, selector) => el.shadowRoot.querySelector(selector);
export const $$ = (el, selector) => [...el.shadowRoot.querySelectorAll(selector)];
export const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
export const click = (el, selector) => $(el, selector).click();
export const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
export const icons = (el) => [...el.querySelectorAll('ha-icon')].map((i) => i.getAttribute('icon'));
export const rgb = (hex) => { const el = document.createElement('i'); el.style.background = hex; return el.style.background; };
// The same day on every day of the week
export const week = (d) => Array(7).fill(d);
