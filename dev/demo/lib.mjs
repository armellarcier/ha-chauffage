// What every demo shares: log in, prepare the development HA, record one scenario, clean up.
// A scenario (scenarios/<name>.mjs) calls record() once, against the demo HA that scripts/demo.sh
// starts; scripts/demo.sh then turns its frames into docs/media/<name>.gif.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

export const HA = process.env.HA_URL || 'http://homeassistant:8123';
export const DASHBOARD = `${HA}/chauffage-dev/planning`;
export const CARD = 'chauffage-programme-card';
export const PANEL = 'chauffage-panel chauffage-presets-view';
const OUT = '/demo/out';

// The bar of a thermostat's day on the schedule card
export const bar = (climate, day) => `${CARD} .bar[data-climate="climate.${climate}"][data-day="${day}"]`;

// Headless videos have no mouse pointer: draw one that follows the mouse
const CURSOR = () => {
  const dot = document.createElement('div');
  Object.assign(dot.style, {
    position: 'fixed', zIndex: 2147483647, width: '18px', height: '18px', marginLeft: '-9px', marginTop: '-9px',
    borderRadius: '50%', background: 'rgba(255,255,255,.85)', border: '2px solid rgba(0,0,0,.55)',
    pointerEvents: 'none', transition: 'transform .08s', left: '-50px', top: '-50px',
  });
  const show = () => document.body && !dot.isConnected && document.body.appendChild(dot);
  document.addEventListener('mousemove', (e) => { show(); dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
  document.addEventListener('mousedown', () => { dot.style.transform = 'scale(.7)'; }, true);
  document.addEventListener('mouseup', () => { dot.style.transform = ''; }, true);
};

// The integration's websocket API, called as the card calls it
export const callWS = (page, message) => page.evaluate((msg) => document.querySelector('home-assistant').hass.callWS(msg), message);
export const setOverride = (page, climate, override) => callWS(page, { type: 'chauffage/override/set', entity_id: climate, override });
export const chauffageData = (page) => page.evaluate(() => new Promise((resolve) => {
  const conn = document.querySelector('home-assistant').hass.connection;
  conn.subscribeMessage((data) => resolve(data), { type: 'chauffage/subscribe' }).then((unsub) => setTimeout(unsub, 100));
}));
// Removes the schedules with these names (a run that failed half-way may have left one)
export async function removeSchedules(page, names) {
  const data = await chauffageData(page);
  if (!data.schedules.some((s) => names.includes(s.name))) return;
  await callWS(page, { type: 'chauffage/schedules/set',
    schedules: data.schedules.filter((s) => !names.includes(s.name)).map((s) => ({ id: s.id })) });
}

// The browser state a demo starts from: no sidebar, every thermostat shown, no history, days
// grouped, and the panel's notices already read
const FRESH_BROWSER = () => {
  localStorage.setItem('dockedSidebar', '"always_hidden"');
  for (const key of ['shown', 'history', 'clip', 'group-days']) localStorage.removeItem(`chauffage-programme-card:${key}`);
  for (const key of ['new-off', 'override-settings', 'access-level']) localStorage.setItem(`chauffage-panel:${key}`, 'seen');
  localStorage.setItem('chauffage-panel:next-steps', 'closed');
};

// Records one demo. `prepare` and `restore` run outside the video, with the integration's API;
// `prepare` returns what `restore` needs. `scene` plays the demo, with the helpers it gets.
export async function record(name, { viewport = { width: 880, height: 640 }, start = DASHBOARD, prepare, scene, restore }) {
  // Full Chromium (the default headless shell only ships English resources: 12 h time inputs)
  const browser = await chromium.launch({ channel: 'chromium', args: ['--lang=fr-FR'] });
  const locale = { locale: 'fr-FR' };
  // The demo HA's clock runs at the demo's time (libfaketime): the browser's clock follows it,
  // so the card and the integration agree on "now"
  const offset = await haClockOffset();
  const syncClock = (context) => context.clock.install({ time: Date.now() + offset });

  // 1. Log in (not recorded), and prepare the development HA
  const login = await browser.newContext({ viewport, ...locale });
  await syncClock(login);
  const lp = await login.newPage();
  await lp.goto(DASHBOARD);
  await lp.locator('input[name="username"]').fill('dev');
  await lp.locator('input[name="password"]').fill('dev');
  await lp.keyboard.press('Enter');
  await lp.locator(CARD).waitFor();
  await lp.evaluate(FRESH_BROWSER);
  const state = prepare ? await prepare(lp) : undefined;
  // The browser follows the development HA's time zone, so the card and the integration agree
  const timezoneId = await lp.evaluate(() => document.querySelector('home-assistant').hass.config.time_zone);
  const session = await login.storageState();
  await login.close();

  // 2. The recorded session: every frame the browser paints, as a lossless PNG
  const context = await browser.newContext({ viewport, ...locale, timezoneId, colorScheme: 'light', storageState: session });
  await syncClock(context);
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const frames = await screencast(context, page, viewport);
  let failed;
  let begin = 0;
  let end = 0;
  try {
    await page.goto(start);
    await page.locator(`${CARD} .bar`).first().waitFor();
    await page.waitForTimeout(800); // let the card and fonts settle
    begin = Date.now() / 1000;
    await scene(helpers(page, viewport));
    await page.waitForTimeout(1500); // the last image stays a moment
    end = Date.now() / 1000;
  } catch (e) {
    failed = e;
    await page.screenshot({ path: `${OUT}/${name}-failed.png` }).catch(() => {});
  }
  await frames.stop();
  await context.close();
  if (!failed) frames.write(name, begin, end);

  // 3. Clean up (not recorded), even after a failure
  const cleanup = await browser.newContext({ viewport, ...locale, storageState: session });
  await syncClock(cleanup);
  const cp = await cleanup.newPage();
  await cp.goto(DASHBOARD);
  await cp.locator(CARD).waitFor();
  if (restore) await restore(cp, state);
  await browser.close();
  if (failed) throw failed;
  console.log(`${name}: ${(end - begin).toFixed(1)} s`);
}

// The offset of the demo HA's clock from the real one, in milliseconds, from the Date header of
// its answer (Home Assistant dates it with its own clock)
async function haClockOffset() {
  const before = Date.now();
  const answer = await fetch(`${HA}/manifest.json`);
  const after = Date.now();
  return Date.parse(answer.headers.get('date')) + 500 - (before + after) / 2;
}

// Records the frames the browser paints (Chrome's screencast), with their time. `write` keeps the
// frames between `begin` and `end`, as PNG files and an ffmpeg concat list that gives each frame
// its duration: scripts/demo.sh makes the GIF from it.
async function screencast(context, page, viewport) {
  const cdp = await context.newCDPSession(page);
  const shots = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    shots.push({ data, time: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: viewport.width, maxHeight: viewport.height });
  return {
    stop: () => cdp.send('Page.stopScreencast').catch(() => {}),
    write(name, begin, end) {
      const dir = `${OUT}/${name}`;
      mkdirSync(dir, { recursive: true });
      // The frame on screen at `begin`, then every frame until `end`
      const first = Math.max(0, shots.findLastIndex((s) => s.time <= begin));
      const kept = shots.slice(first).filter((s) => s.time < end);
      const list = [];
      kept.forEach((s, i) => {
        const file = `${name}/${String(i).padStart(5, '0')}.png`;
        writeFileSync(`${OUT}/${file}`, Buffer.from(s.data, 'base64'));
        const from = Math.max(s.time, begin);
        const to = i + 1 < kept.length ? kept[i + 1].time : end;
        list.push(`file '${file}'`, `duration ${Math.max(0.001, to - from).toFixed(3)}`);
      });
      // ffmpeg's concat ignores the last duration unless the last file comes again
      list.push(`file '${name}/${String(kept.length - 1).padStart(5, '0')}.png'`);
      writeFileSync(`${OUT}/${name}.txt`, `${list.join('\n')}\n`);
    },
  };
}

// The gestures of a scene, with a visible mouse
function helpers(page, viewport) {
  const pause = (ms) => page.waitForTimeout(ms);
  // Scrolls with the wheel, as a person would, until the element is on screen (below the top bar
  // of Home Assistant)
  async function reveal(locator, { top = 110, bottom = 40 } = {}) {
    await locator.waitFor();
    let last = null;
    for (let i = 0; i < 60; i++) {
      const b = await locator.boundingBox();
      // Stop once the page no longer scrolls: an element of the top bar never moves
      if (last !== null && Math.abs(b.y - last) < 1) return;
      last = b.y;
      const below = b.y + b.height - (viewport.height - bottom);
      const above = top - b.y;
      if (below <= 0 && above <= 0) return;
      await page.mouse.wheel(0, below > 0 ? Math.min(120, below + 20) : -Math.min(120, above + 20));
      await pause(35);
    }
  }
  async function moveTo(locator, { dx = 0.5, dy = 0.5, steps = 18 } = {}) {
    await reveal(locator);
    const b = await locator.boundingBox();
    const x = b.x + b.width * dx;
    const y = b.y + b.height * dy;
    await page.mouse.move(x, y, { steps });
    return { x, y };
  }
  async function click(locator, options) {
    await moveTo(locator, options);
    await pause(150);
    await page.mouse.down();
    await page.mouse.up();
  }
  // Drags a handle by a share of the width of its bar
  async function drag(locator, share, barLocator) {
    const from = await moveTo(locator);
    await pause(200);
    await page.mouse.down();
    const bar = typeof barLocator === 'string' ? page.locator(barLocator) : barLocator;
    const width = (await bar.boundingBox()).width;
    await page.mouse.move(from.x + width * share, from.y, { steps: 30 });
    await pause(300);
    await page.mouse.up();
  }
  async function scroll(dy, times = 8) {
    for (let i = 0; i < times; i++) {
      await page.mouse.wheel(0, dy);
      await pause(60);
    }
  }
  return { page, viewport, pause, reveal, moveTo, click, drag, scroll };
}
