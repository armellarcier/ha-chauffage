// Review library for ha-chauffage: drives the development HA with Playwright.
// Run a script with dev/review/run.sh (see README.md). Every helper takes the page first.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

export const HA = process.env.HA_URL || 'http://host.docker.internal:8124';
export const OUT = process.env.OUT_DIR || '/out';
export const CARD = 'chauffage-programme-card';
const AUTH = `/review/.auth/${new URL(HA).port || 'default'}.json`;
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, phone: { width: 360, height: 780 } };

let browser = null;
const OPTIONS = new WeakMap(); // page → { viewport, theme, deviceScaleFactor, lang }

// ---------- pages ----------

/**
 * Opens a page on the development HA, logged in.
 * { viewport: 'desktop' | 'phone' | { width, height }, theme: 'light' | 'dark',
 *   deviceScaleFactor: 1, lang: 'fr' | 'en' }
 * 'phone' is 360 px wide, with touch emulation: use tap() for a real touch.
 */
export async function launch(options = {}) {
  const o = { viewport: 'desktop', theme: 'light', deviceScaleFactor: 1, lang: 'fr', ...options };
  if (!browser) browser = await chromium.launch({ channel: 'chromium', args: [`--lang=${o.lang === 'fr' ? 'fr-FR' : 'en-US'}`] });
  const size = typeof o.viewport === 'string' ? VIEWPORTS[o.viewport] : o.viewport;
  const phone = size.width < 500;
  const context = await browser.newContext({
    viewport: size, deviceScaleFactor: o.deviceScaleFactor, isMobile: phone, hasTouch: phone,
    colorScheme: o.theme, locale: o.lang === 'fr' ? 'fr-FR' : 'en-US', timezoneId: await timeZone(),
    ...(existsSync(AUTH) ? { storageState: AUTH } : {}),
  });
  const page = await context.newPage();
  // Errors of the page are printed: an exception, and a promise rejected that nothing caught
  // (Home Assistant rejects a websocket command with an object: its content is printed)
  page.on('pageerror', (e) => { if (e.message !== 'Object') console.log('PAGE ERROR', e.message); });
  await page.exposeFunction('reviewReport', (text) => console.log('PAGE ERROR (promise)', text));
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) => {
      let text;
      try { text = JSON.stringify(e.reason); } catch (err) { text = String(e.reason); }
      window.reviewReport(`${text}${e.reason && e.reason.stack ? ` ${e.reason.stack}` : ''}`);
    });
  });
  // The theme is this browser's: Home Assistant reads it from the browser's storage when a page
  // loads, so one reviewer's theme never changes another's on the shared development HA.
  // setTheme() keeps its choice in the tab's session: the next page loads keep it, not the
  // launch theme
  await page.addInitScript((launchDark) => {
    try {
      const kept = sessionStorage.getItem('reviewDark');
      const dark = kept === null ? launchDark : kept === '1';
      localStorage.setItem('selectedTheme', JSON.stringify({ theme: 'default', dark }));
    } catch (e) { /* no storage */ }
  }, o.theme === 'dark');
  OPTIONS.set(page, { ...o, phone });
  await login(page);
  await setTheme(page, o.theme);
  return page;
}

// The development HA's long-lived token, written by the setup (run.sh mounts it)
const token = () => readFileSync(process.env.HA_TOKEN_FILE || '/token', 'utf8').trim();

// The development HA's time zone: the browser shows the card at the HA's time, and 'today' and
// 'now' are the HA's (a second development HA may run in another zone, for the demo)
let zone = null;
async function timeZone() {
  if (!zone) {
    try {
      const response = await fetch(`${HA}/api/config`, { headers: { Authorization: `Bearer ${token()}` } });
      zone = (await response.json()).time_zone;
    } catch (e) {
      console.warn(`launch: the development HA's time zone is unknown (${e.message}): Europe/Paris`);
    }
    zone = zone || 'Europe/Paris';
  }
  return zone;
}

/** Closes the browser: call it at the end of a script. */
export async function close() {
  if (browser) await browser.close();
  browser = null;
}

/** Logs in as dev / dev if the page asks for it, and keeps the session for the next runs. */
export async function login(page) {
  await page.goto(`${HA}/chauffage-dev`);
  const form = page.locator('input[name="username"]');
  const card = page.locator(CARD).first();
  await Promise.race([form.waitFor({ timeout: 60000 }), card.waitFor({ timeout: 60000 })]).catch(() => {});
  if (await form.count()) {
    await form.fill('dev');
    await page.locator('input[name="password"]').fill('dev');
    await page.keyboard.press('Enter');
    await card.waitFor({ timeout: 90000 });
    await page.evaluate(() => localStorage.setItem('dockedSidebar', '"always_hidden"'));
    mkdirSync('/review/.auth', { recursive: true });
    await page.context().storageState({ path: AUTH });
  }
  return page;
}

/** Opens a view of the Chauffage dashboard: 0 (the schedule card) or 'pieces' (thermostat cards). */
export async function openDashboard(page, view = 0) {
  await page.goto(`${HA}/chauffage-dev/${view}`);
  const first = view === 'pieces' ? 'chauffage-thermostat-card' : `${CARD} .bar`;
  await page.locator(first).first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(800);
  await ensureTheme(page);
  return page;
}

/** Opens a page of the Chauffage panel: '', 'presets', 'thermostats/climate.salon'… */
export async function openPanel(page, path = '') {
  await page.goto(`${HA}/chauffage${path ? `/${path}` : ''}`);
  await page.locator('chauffage-panel').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1200);
  await ensureTheme(page);
  return page;
}

/**
 * The same page at another size: 'phone' (360 px, touch) or 'desktop' (1280 px).
 * Touch emulation belongs to the browser context, so this opens a new page at the same address
 * and closes the old one. Use the page it returns.
 */
export async function setViewport(page, viewport, options = {}) {
  const url = page.url();
  const next = await launch({ ...OPTIONS.get(page), viewport, ...options });
  await page.context().close();
  if (url && url !== 'about:blank' && url !== next.url()) {
    await next.goto(url);
    await next.waitForTimeout(1500);
  }
  return next;
}

/** Home Assistant in its dark or its light theme, in this browser only. */
export async function setTheme(page, theme) {
  const dark = theme === 'dark';
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  await page.evaluate((d) => {
    try {
      sessionStorage.setItem('reviewDark', d ? '1' : '0');
      localStorage.setItem('selectedTheme', JSON.stringify({ theme: 'default', dark: d }));
    } catch (e) { /* no storage */ }
    const ha = document.querySelector('home-assistant');
    if (ha) ha.dispatchEvent(new CustomEvent('settheme', { detail: { theme: 'default', dark: d }, bubbles: true, composed: true }));
  }, dark);
  const o = OPTIONS.get(page);
  if (o) o.theme = theme;
  await page.waitForTimeout(400);
  return page;
}

/**
 * The theme the page was launched in, set again if the page shows the other one (Home
 * Assistant applies its theme again when it reconnects). shot() and the helpers that open
 * something call it: a script does not need to.
 */
export async function ensureTheme(page) {
  const o = OPTIONS.get(page);
  if (!o) return page;
  const dark = await page.evaluate(() => {
    const ha = document.querySelector('home-assistant');
    return ha && ha.hass && ha.hass.themes ? !!ha.hass.themes.darkMode : null;
  }).catch(() => null);
  if (dark !== null && dark !== (o.theme === 'dark')) await setTheme(page, o.theme);
  return page;
}

/** A tap: a real touch on a phone page, a click otherwise. */
export async function tap(page, locator) {
  const phone = (OPTIONS.get(page) || {}).phone;
  // The card redraws when the integration publishes: an element may be replaced meanwhile
  for (let attempt = 0; ; attempt += 1) {
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
      if (phone) {
        const box = await locator.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await locator.click({ timeout: 5000 });
      }
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      await page.waitForTimeout(500);
    }
  }
  await page.waitForTimeout(350);
}

/** The schedule card of the dashboard. */
export const card = (page) => page.locator(CARD).first();

// ---------- what a reviewer opens ----------

const today = (page) => page.evaluate(() => (new Date().getDay() + 6) % 7);
const minutes = (time) => (time === 'now' ? null : Number(time.split(':')[0]) * 60 + Number(time.split(':')[1]));

/**
 * Opens the popover of a slot in the schedule card: the thermostat alone, then a tap on the slot
 * running at `time` ('HH:MM' or 'now') on `day` (0 = Monday, 'today'). The days stay grouped as
 * the user has them: the slot is opened on the row of its day. One tap only: a second one would
 * be a double tap, which cuts the slot. Returns the popover's locator.
 */
export async function openSlot(page, climate, day = 'today', time = 'now') {
  if (!page.url().includes('/chauffage-dev') || page.url().includes('/pieces')) await openDashboard(page, 0);
  const d = day === 'today' ? await today(page) : day;
  const c = card(page);
  await c.waitFor({ timeout: 30000 });
  const where = await c.evaluate((el, [climate, d, at]) => {
    el._shown = [climate]; el._overrideSel = null; el._draft.selection = null; el._lastClick = null;
    el._render();
    const row = el._rowOf(d)[0]; // the day that draws the row
    const minute = at == null ? new Date().getHours() * 60 + new Date().getMinutes() : at;
    let idx = 0;
    el._week(climate)[row].forEach((s, i) => { if (s.start <= minute) idx = i; });
    return { row, idx };
  }, [climate, d, minutes(time)]);
  await page.waitForTimeout(300);
  const editor = c.locator('.editor:not(.override-ed):not(.cell-ed)');
  const seg = c.locator(`.bar[data-climate="${climate}"][data-day="${where.row}"] .seg[data-idx="${where.idx}"]`);
  await tap(page, seg).catch(() => {});
  // A slot narrower than its handles may open its neighbor, and a redraw may swallow the tap:
  // the card then opens the slot itself, without a second tap
  const opened = await c.evaluate((el) => (el._draft.selection ? `${el._draft.selection.day}/${el._draft.selection.idx}` : null));
  if (opened !== `${where.row}/${where.idx}`) {
    await c.evaluate((el, sel) => { el._draft.selection = sel; el._overrideSel = null; el._render(); }, { climate, day: where.row, idx: where.idx });
  }
  await c.evaluate((el) => { el._lastClick = null; });
  await editor.waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  return editor;
}

/**
 * Opens the override block of a thermostat, and returns its locator.
 * where: 'card' (the popover of the schedule card), 'pieces' (its thermostat card in the
 * Pièces view) or 'more-info' (Home Assistant's more-info dialog).
 * Without an override, the block is opened to set one.
 */
export async function openOverride(page, climate, where = 'card') {
  if (where === 'card') {
    if (!page.url().includes('/chauffage-dev') || page.url().includes('/pieces')) await openDashboard(page, 0);
    const c = card(page);
    // As the "New override…" entry of the row's menu does: the days stay grouped as the user has them
    await c.evaluate((el, climate) => {
      el._shown = [climate]; el._draft.selection = null;
      el._schedule = el._activeSchedule();
      el._overrideSel = { climate, create: true };
      el._render();
    }, climate);
    const editor = c.locator('.override-ed');
    await editor.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    return editor;
  }
  let block;
  if (where === 'pieces') {
    if (!page.url().includes('/pieces')) await openDashboard(page, 'pieces');
    const index = await page.evaluate((climate) => {
      const all = [];
      const walk = (root) => { for (const el of root.querySelectorAll('*')) { if (el.localName === 'chauffage-thermostat-card') all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
      walk(document);
      return all.findIndex((el) => el._config && el._config.entity === climate);
    }, climate);
    if (index < 0) throw new Error(`no thermostat card for ${climate}`);
    block = page.locator('chauffage-thermostat-card').nth(index).locator('chauffage-moreinfo');
    await block.scrollIntoViewIfNeeded();
    const change = block.locator('details.change > summary');
    if (await change.count() && !(await block.locator('details.change').evaluate((e) => e.open))) await tap(page, change);
  } else {
    await page.evaluate((entityId) => document.querySelector('home-assistant')
      .dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true })), climate);
    block = page.locator('ha-more-info-dialog chauffage-moreinfo, ha-dialog chauffage-moreinfo').first();
    await block.waitFor({ timeout: 15000 });
    await block.scrollIntoViewIfNeeded();
  }
  const create = block.locator('[data-new-override]');
  if (await create.count() && !(await block.locator('.end-new').count())) await tap(page, create);
  await page.waitForTimeout(400);
  return block.locator('.status');
}

/**
 * Opens a popover of the presets tab of the panel, and returns its locator: the value of a
 * preset on a thermostat, or the preset itself when `climate` is null.
 */
export async function openPresetCell(page, climate, preset) {
  if (!page.url().endsWith('/chauffage/presets')) await openPanel(page, 'presets');
  const c = page.locator('chauffage-panel chauffage-presets-view').first();
  await c.waitFor({ timeout: 30000 });
  const cell = climate
    ? c.locator(`[data-act="cell"][data-kind="thermostat"][data-climate="${climate}"][data-preset="${preset}"]`)
    : c.locator(`[data-act="cell"][data-kind="preset"][data-preset="${preset}"]`);
  await cell.first().waitFor({ state: 'attached', timeout: 30000 });
  const editor = c.locator('.cell-ed');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // A popover already open may cover the cell: closed first
    if (await editor.count()) await c.evaluate((el) => { el._cell = null; el.requestUpdate(); });
    await tap(page, cell.first()).catch(() => {});
    try {
      await editor.waitFor({ timeout: 5000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await page.waitForTimeout(300);
  return editor;
}

/**
 * Opens the settings dialog (the end of a change by hand, of a thermostat turned off, the
 * override duration, the access level), from the panel's cog. Returns the dialog's locator.
 */
export async function openSettings(page) {
  if (!page.url().includes('/chauffage') || page.url().includes('/chauffage-dev')) await openPanel(page, '');
  // The dialog's content: its host element has no box of its own
  const dialog = page.locator('chauffage-settings-dialog .body').first();
  if (!(await dialog.isVisible().catch(() => false))) {
    await tap(page, page.locator('chauffage-panel [data-open-settings]').first());
  }
  await dialog.waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  return dialog;
}

/**
 * Opens the block of the override a thermostat has now, and returns its locator; throws when
 * the thermostat has none. where: 'card', 'pieces' or 'more-info', as openOverride.
 */
export async function openExistingOverride(page, climate, where = 'card') {
  const { overrides } = await data(page);
  if (!overrides[climate]) throw new Error(`${climate} has no override: set one first (chauffage.set_override)`);
  if (where !== 'card') return openOverride(page, climate, where);
  if (!page.url().includes('/chauffage-dev') || page.url().includes('/pieces')) await openDashboard(page, 0);
  const d = await today(page);
  const c = card(page);
  await c.evaluate((el, [climate, d]) => {
    el._shown = [climate]; el._draft.selection = null; el._overrideSel = null;
    el._schedule = el._activeSchedule();
    el._render();
    // The override is drawn on the row of today: opened there, as a tap on it does
    const drawn = el.shadowRoot.querySelector(`.override[data-climate="${climate}"]`);
    el._overrideSel = { climate, day: drawn ? Number(drawn.dataset.day) : el._rowOf(d)[0] };
    el._render();
  }, [climate, d]);
  const editor = c.locator('.override-ed');
  await editor.waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  return editor;
}

/**
 * Opens the ⋮ menu of a thermostat's row today in the schedule card, where "Nouvelle
 * dérogation…" is. Returns { menu, entry }: the menu, and its entry that sets an override.
 */
export async function openOverrideMenu(page, climate) {
  if (!page.url().includes('/chauffage-dev') || page.url().includes('/pieces')) await openDashboard(page, 0);
  const d = await today(page);
  const c = card(page);
  const row = await c.evaluate((el, [climate, d]) => {
    el._draft.selection = null; el._overrideSel = null; el._menu = null;
    if (!el._shown.includes(climate)) el._shown = [climate];
    el._schedule = el._activeSchedule();
    el._render();
    return el._rowOf(d)[0];
  }, [climate, d]);
  await tap(page, c.locator(`[data-act="menu"][data-climate="${climate}"][data-day="${row}"]`).first());
  const menu = c.locator('.menu');
  await menu.waitFor({ timeout: 10000 });
  return { menu, entry: menu.locator('[data-act="override-new"]') };
}

// ---------- measures ----------

/**
 * The children of a row, each with its box, and the centre and the height of its icon and of its
 * text: [{ cls, label, x, y, w, h, midY, radius, icon: { midY, h } | null, text: { midY, h } | null }].
 * midY is counted from the top of the child: an icon and a text on one line have the same midY.
 */
export function measureRow(locator) {
  return locator.first().evaluate((row) => [...row.children].map((el) => {
    const r = el.getBoundingClientRect();
    const round = (v) => Math.round(v * 10) / 10;
    // The child's own icon: not the icon of a control inside it (the arrows of a time field in a
    // label). Measured on its drawing: an <ha-icon> may be taller than the <svg> it shows
    const own = (i) => { const control = i.closest('button, a, [role="button"], [role="link"], select'); return !control || control === el || !el.contains(control); };
    const host = el.matches('ha-icon, svg') ? el : [...el.querySelectorAll('ha-icon, svg')].find(own) || null;
    const drawn = (i) => {
      for (let node = i; node; node = node.shadowRoot && node.shadowRoot.querySelector('ha-svg-icon, svg')) {
        if (node.localName === 'svg') return node;
      }
      return i;
    };
    const icon = host ? drawn(host) : null;
    const ir = icon ? icon.getBoundingClientRect() : null;
    // The text: the boxes of its text nodes
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let top = Infinity;
    let bottom = -Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const box of range.getClientRects()) { top = Math.min(top, box.top); bottom = Math.max(bottom, box.bottom); }
    }
    const style = getComputedStyle(el);
    return {
      cls: el.className || el.localName, label: (el.innerText || el.value || '').trim().slice(0, 30),
      x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height), midY: round(r.height / 2),
      radius: style.borderTopLeftRadius, fontSize: style.fontSize,
      icon: ir && ir.height ? { midY: round(ir.top + ir.height / 2 - r.top), h: round(ir.height) } : null,
      text: Number.isFinite(top) ? { midY: round((top + bottom) / 2 - r.top), h: round(bottom - top) } : null,
    };
  }));
}

/** measureRow in one line per child, for a log. */
export async function describeRow(locator) {
  const rows = await measureRow(locator);
  return rows.map((c) => `${c.label || c.cls}: h=${c.h} r=${c.radius} font=${c.fontSize}${c.icon ? ` icon@${c.icon.midY}` : ''}${c.text ? ` text@${c.text.midY}` : ''}`).join('\n');
}

/**
 * The contrast of an element's text against what is behind it (WCAG 2):
 * { fg, bg, ratio, aa (4.5:1), aaLarge (3:1), gradient }. Backgrounds with an alpha are laid
 * over the ancestors', through shadow roots. `gradient`: a background image is behind the text,
 * and the ratio only counts the background colors.
 */
export function contrast(locator) {
  return locator.first().evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255]; // getImageData gives colors that are not premultiplied
    };
    const over = (top, under) => top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3]));
    const layers = [];
    let gradient = false;
    for (let node = el; node; node = node.parentElement || (node.getRootNode() && node.getRootNode().host)) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none' && layers.every((l) => l[3] < 1)) gradient = true;
      const color = rgba(style.backgroundColor);
      if (color[3] > 0) layers.push(color);
      if (color[3] >= 1) break;
    }
    let bg = [255, 255, 255];
    for (const layer of layers.reverse()) bg = over(layer, bg);
    const text = rgba(getComputedStyle(el).color);
    const fg = over(text, bg);
    const lum = (c) => c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    return { fg: hex(fg), bg: hex(bg), ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, gradient };
  });
}

/**
 * The buttons inside a block, one entry each: { label, h, w, fontSize, radius, iconMidY, textMidY,
 * baselineOff }. baselineOff is how far the icon's centre is from the label's centre, in pixels:
 * under 1 they sit on one line. Use it to compare the buttons of two blocks.
 */
export async function buttonMetrics(locator) {
  const out = [];
  // Not the small arrows of a time field: they are part of the field
  const buttons = locator.locator('button:not(.time-step):visible, [role="link"].setpoint-edit:visible');
  const n = await buttons.count();
  for (let i = 0; i < n; i += 1) {
    const b = await buttons.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { label: (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 30), h: Math.round(r.height * 10) / 10,
        w: Math.round(r.width * 10) / 10, fontSize: style.fontSize, radius: style.borderTopLeftRadius, index: [...el.parentElement.children].indexOf(el) };
    });
    const rows = await measureRow(buttons.nth(i).locator('xpath=..'));
    const row = rows[b.index] || {};
    const iconMidY = row.icon ? row.icon.midY : null;
    const textMidY = row.text ? row.text.midY : null;
    out.push({ label: b.label, h: b.h, w: b.w, fontSize: b.fontSize, radius: b.radius, iconMidY, textMidY,
      baselineOff: iconMidY != null && textMidY != null ? Math.round(Math.abs(iconMidY - textMidY) * 10) / 10 : null });
  }
  return out;
}

/**
 * The contrast of an element's text on each color of its background gradient (a heat/cool
 * chip has two): [{ color, ratio, aa }]. Without a gradient: one entry, as contrast().
 */
export async function contrastPerGradient(locator) {
  const stops = await locator.first().evaluate((el) => {
    const style = getComputedStyle(el);
    const image = style.backgroundImage && style.backgroundImage !== 'none' ? style.backgroundImage : '';
    const colors = [...new Set(image.match(/rgba?\([^)]*\)/g) || [])];
    const parse = (c) => c.match(/[\d.]+/g).map(Number);
    const lum = (c) => c.slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const text = parse(style.color);
    return colors.map((color) => {
      const [hi, lo] = [lum(text), lum(parse(color))].sort((a, b) => b - a);
      const ratio = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      return { color: color.replace(/\s/g, ''), ratio, aa: ratio >= 4.5 };
    });
  });
  if (stops.length) return stops;
  const c = await contrast(locator);
  return [{ color: c.bg, ratio: c.ratio, aa: c.aa }];
}

// ---------- the data ----------

/** A websocket command, as the logged-in user. */
// Home Assistant rejects a command with an object: turned into an Error that keeps its code and message
export const ws = (page, message) => page.evaluate((m) => document.querySelector('home-assistant').hass.callWS(m)
  .catch((e) => { throw new Error(`${m.type}: ${(e && e.code) || 'error'}: ${(e && e.message) || JSON.stringify(e)}`); }), message);

/** What the integration publishes now (chauffage/subscribe). */
export function data(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const { connection } = document.querySelector('home-assistant').hass;
    let stop = null;
    let got = false;
    // The subscription is ended once, after its first message
    const end = () => { if (got && stop) { const unsubscribe = stop; stop = null; unsubscribe(); } };
    const timer = setTimeout(() => reject(new Error('chauffage/subscribe: no answer')), 10000);
    connection.subscribeMessage((d) => {
      clearTimeout(timer);
      resolve(d);
      got = true;
      end();
    }, { type: 'chauffage/subscribe' }).then((unsubscribe) => { stop = unsubscribe; end(); });
  }));
}

const SETTINGS = ['override_duration', 'manual_override_end', 'off_override_end'];
const PER_THERMOSTAT = ['mappings', 'weeks', 'overrides'];

/**
 * The Chauffage data to give back to restore(): take it before a review changes anything.
 * Say what the review touches, so that restore() leaves the rest to the other reviewers:
 * { thermostats: ['climate.salon'], presets: false, settings: false, schedule: false }.
 * `thermostats`: their weeks, their values of the presets and their overrides (none by
 * default); `presets`, `settings` (the ends of the overrides, the override duration) and
 * `schedule` (the active schedule): false by default. Without a scope, the backup holds
 * nothing: several reviewers share the development HA, and a backup of everything would put
 * back what the others changed.
 */
export async function backup(page, { thermostats = [], presets = false, settings = false, schedule = false } = {}) {
  if (!Array.isArray(thermostats)) throw new Error('backup: name the thermostats the review touches, for example { thermostats: [\'climate.salon\'] }');
  const scope = { thermostats, presets, settings, schedule };
  return { scope, ...covered({ scope }, await data(page)) };
}

// The part of the data a backup's scope covers: what backup() keeps and restore() compares
function covered(saved, d) {
  const { thermostats, presets, settings, schedule } = saved.scope;
  const kept = (byThermostat) => Object.fromEntries(Object.entries(byThermostat || {}).filter(([climate]) => thermostats.includes(climate)));
  const out = {};
  for (const key of PER_THERMOSTAT) out[key] = kept(d[key]);
  if (presets) out.presets = d.presets;
  if (settings) for (const key of SETTINGS) out[key] = d[key];
  if (schedule) out.active_schedule = d.active_schedule;
  return out;
}

// The paths where two values differ: ['weeks|climate.salon|normal', 'overrides|climate.atelier']
function differences(a, b, path = '', out = [], depth = 0) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const both = a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b);
  if (!both || depth >= 3) { out.push(path || '(root)'); return out; }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], path ? `${path}|${key}` : key, out, depth + 1);
  return out;
}

/**
 * Puts back what backup() took, and nothing else, through the websocket API, as the card does:
 * the thermostats, the presets and the settings of the backup's scope. Returns
 * { changed: the paths that differed before, left: the paths that still differ }.
 * Not restored: the schedules created or deleted meanwhile, the activation rules.
 */
export async function restore(page, saved) {
  // A backup of every thermostat (from a former version of this library) would undo what the
  // other reviewers changed meanwhile
  if (!saved || !saved.scope || !Array.isArray(saved.scope.thermostats)) {
    throw new Error('restore: this backup has no scope. Take it with backup(page, { thermostats: [...] })');
  }
  const now = await data(page);
  const { scope: _scope, ...wanted } = saved;
  const changed = differences(wanted, covered(saved, now));
  const has = (key) => key in wanted;
  const same = (key) => JSON.stringify(wanted[key]) === JSON.stringify(now[key]);
  // A command refused does not stop the others: what it could not put back is in `left`
  const send = (what, message) => ws(page, message).catch((e) => console.log('restore', what, e.message || e.code || e));
  const settings = Object.fromEntries(SETTINGS.filter((k) => has(k) && !same(k)).map((k) => [k, wanted[k]]));
  if (Object.keys(settings).length) await send('settings', { type: 'chauffage/settings/set', ...settings });
  if (has('presets') && !same('presets')) await send('presets', { type: 'chauffage/presets/set', presets: wanted.presets, replacements: {} });
  const mine = covered(saved, now);
  for (const climate of new Set([...Object.keys(wanted.mappings), ...Object.keys(mine.mappings)])) {
    const mapping = wanted.mappings[climate] || {};
    if (JSON.stringify(mapping) !== JSON.stringify(mine.mappings[climate] || {})) await send(`mapping ${climate}`, { type: 'chauffage/mapping/set', entity_id: climate, mapping });
  }
  const weeks = Object.fromEntries(Object.entries(wanted.weeks).filter(([climate, w]) => JSON.stringify(w) !== JSON.stringify(now.weeks[climate])));
  if (Object.keys(weeks).length) {
    const revisions = Object.fromEntries(Object.keys(weeks).map((climate) => [climate, (now.thermostats[climate] || {}).revision ?? null]));
    await send('weeks', { type: 'chauffage/weeks/save', weeks, revisions });
  }
  if (has('active_schedule') && !same('active_schedule')) await send('schedule', { type: 'chauffage/schedule/activate', schedule: wanted.active_schedule });
  for (const climate of new Set([...Object.keys(wanted.overrides), ...Object.keys(mine.overrides)])) {
    const override = wanted.overrides[climate] || null;
    // An override of the backup that has ended since is not set again
    const over = override && new Date(override.end) <= new Date();
    if (JSON.stringify(override) !== JSON.stringify(mine.overrides[climate] || null)) {
      await send(`override ${climate}`, { type: 'chauffage/override/set', entity_id: climate, override: over ? null : override });
    }
  }
  await page.waitForTimeout(500);
  return { changed, left: differences(wanted, covered(saved, await data(page))) };
}

/**
 * The states of entities, read from Home Assistant's REST API with the development HA's token:
 * { entity_id: { state, temperature, target_temp_low, target_temp_high, preset_mode, fan_mode,
 *   swing_mode, hvac_action } }. Compare them with what the card promised.
 */
export async function states(entityIds) {
  const keys = ['temperature', 'target_temp_low', 'target_temp_high', 'preset_mode', 'fan_mode', 'swing_mode', 'hvac_action'];
  const out = {};
  for (const id of [].concat(entityIds)) {
    const response = await fetch(`${HA}/api/states/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
    const s = await response.json();
    out[id] = { state: s.state, ...Object.fromEntries(keys.filter((k) => s.attributes && s.attributes[k] != null).map((k) => [k, s.attributes[k]])) };
  }
  return out;
}

/** One state as a line of text: "cool temperature=25 fan_mode=auto". */
export async function stateLine(entityId) {
  const { state, ...attributes } = (await states(entityId))[entityId];
  return `${state} ${Object.entries(attributes).map(([k, v]) => `${k}=${v}`).join(' ')}`.trim();
}

// ---------- screenshots ----------

/**
 * A screenshot in the output folder, named `name`.png (prefixed by the page's width and theme).
 * { crop: a locator to shoot alone, fullPage: true }
 * Returns the file's path in the container; on the host it is in the OUT folder of run.sh.
 */
let zoomWarned = false;
export async function shot(page, name, { crop = null, zoom = 1, fullPage = false, pad = 6 } = {}) {
  const o = OPTIONS.get(page) || {};
  const size = page.viewportSize() || { width: 0 };
  const file = `${OUT}/${size.width}-${o.theme || 'light'}-${name}.png`;
  await ensureTheme(page);
  await page.waitForTimeout(300);
  if (!crop) {
    await page.screenshot({ path: file, fullPage });
  } else {
    await crop.first().scrollIntoViewIfNeeded();
    const box = await crop.first().boundingBox();
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad };
    // The pixel density of a picture is the page's: Playwright takes it from the browser
    // context, and an override through CDP does not change it. `zoom` did nothing
    if (zoom > 1 && (o.deviceScaleFactor || 1) < zoom && !zoomWarned) {
      zoomWarned = true;
      console.warn(`shot: zoom is ignored. For sharper pictures, open the page with launch({ deviceScaleFactor: ${zoom} })`);
    }
    await page.screenshot({ path: file, clip });
  }
  console.log('shot', file);
  return file;
}
