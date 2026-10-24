// Records the README demo against the development HA (run through scripts/demo.sh).
// Playwright drives a real browser; the video is converted to docs/demo.gif afterwards.
// The development HA has three schedules: Normal (active), Vacances, Absent. The browser clock
// is set to a Tuesday morning, with a demo override on the living room.
// Scenario: create a "Télétravail" schedule as a copy of Normal and edit its Tuesday, look at
// the presets, activate Vacances, then a thermostat's more-info dialog, and its history: the
// temperature measured over the last days (a new development HA starts with a simulated week),
// a day shown larger. The history is real: for it, the browser clock goes back to the real time.
// Nothing is kept: the edits are not saved, the created schedule and the override are removed
// and Normal is active again at the end.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const HA = process.env.HA_URL || 'http://homeassistant:8123';
const DASHBOARD = `${HA}/chauffage-dev/planning`;
const VIEWPORT = { width: 880, height: 640 };
const OUT = '/demo/out';
const CREATED = 'Télétravail';

// Demo time: next Tuesday 10:05; demo override on the living room from 08:45 to 11:30
function nextTuesday(hh, mm) {
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
  d.setHours(hh, mm, 0, 0);
  return d;
}
const NOW = nextTuesday(10, 5);
const REAL_NOW = Date.now();
const OVERRIDE = {
  kind: 'temperature', value: 21.5,
  start: nextTuesday(8, 45).toISOString(), end: nextTuesday(11, 30).toISOString(),
};

const card = 'chauffage-programme-card';
const bar = (climate, day) => `${card} .bar[data-climate="climate.${climate}"][data-day="${day}"]`;

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

// Calls the integration's websocket API, like the card does
const callWS = (page, message) => page.evaluate((msg) => document.querySelector('home-assistant').hass.callWS(msg), message);
const setOverride = (page, climate, override) => callWS(page, { type: 'chauffage/override/set', entity_id: climate, override });
const subscribeOnce = (page) => page.evaluate(() => new Promise((resolve) => {
  const conn = document.querySelector('home-assistant').hass.connection;
  conn.subscribeMessage((data) => resolve(data), { type: 'chauffage/subscribe' }).then((unsub) => setTimeout(unsub, 100));
}));

// Full Chromium (the default headless shell only ships English resources: 12 h time inputs)
const browser = await chromium.launch({ channel: 'chromium', args: ['--lang=fr-FR'] });
const LOCALE = { locale: 'fr-FR', timezoneId: 'Europe/Paris' };

// 1. Log in once (not recorded), keep the session and create the demo override
const login = await browser.newContext({ viewport: VIEWPORT, ...LOCALE });
const lp = await login.newPage();
await lp.goto(DASHBOARD);
await lp.locator('input[name="username"]').fill('dev');
await lp.locator('input[name="password"]').fill('dev');
await lp.keyboard.press('Enter');
await lp.locator(card).waitFor();
await lp.evaluate(() => {
  localStorage.setItem('dockedSidebar', '"always_hidden"');
  localStorage.removeItem('chauffage-programme-card:shown'); // start with every thermostat shown
  localStorage.removeItem('chauffage-programme-card:history'); // and without the history
});
// The override shows the thermostat's actual setpoint, so the card and the dialog agree
OVERRIDE.value = await lp.evaluate(() =>
  document.querySelector('home-assistant').hass.states['climate.salon'].attributes.temperature);
await setOverride(lp, 'climate.salon', OVERRIDE);
const session = await login.storageState();
await login.close();

// 2. Recorded session, on Tuesday morning
const context = await browser.newContext({
  viewport: VIEWPORT, ...LOCALE, colorScheme: 'light', storageState: session,
  recordVideo: { dir: OUT, size: VIEWPORT },
});
await context.clock.setFixedTime(NOW);
await context.addInitScript(CURSOR);
const page = await context.newPage();
const t0 = Date.now();
await page.goto(DASHBOARD);
await page.locator(`${card} .bar`).first().waitFor();
await page.waitForTimeout(800); // let the card and fonts settle
const start = (Date.now() - t0) / 1000;

const pause = (ms) => page.waitForTimeout(ms);
async function moveTo(locator, { dx = 0.5, dy = 0.5, steps = 25 } = {}) {
  const b = await locator.boundingBox();
  const x = b.x + b.width * dx;
  const y = b.y + b.height * dy;
  await page.mouse.move(x, y, { steps });
  return { x, y };
}
async function click(locator, options) {
  await moveTo(locator, options);
  await pause(250);
  await page.mouse.down();
  await page.mouse.up();
}
async function drag(locator, dxRatioOfDay, barSelector) {
  const from = await moveTo(locator);
  await pause(300);
  await page.mouse.down();
  const width = (await page.locator(barSelector).boundingBox()).width;
  await page.mouse.move(from.x + width * dxRatioOfDay, from.y, { steps: 30 });
  await pause(400);
  await page.mouse.up();
}

await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 40);
await pause(1500); // Normal is active; Tuesday: the override is shown on the living room row

// A new schedule: a copy of Normal, named "Télétravail"; the card opens it
await click(page.locator(`${card} [data-act="schedule-new"]`));
await pause(900);
await click(page.locator(`${card} .sched-menu [data-act="schedule-pick"][data-copy="normal"]`));
await pause(500);
await page.keyboard.type(CREATED, { delay: 90 });
await pause(400);
await click(page.locator(`${card} .sched-menu [data-act="schedule-create"]`));
await page.locator(`${card} .tab.on`, { hasText: CREATED }).waitFor();
await pause(1200);

// Someone works from home on Tuesdays: the living room stays in Comfort during the day…
await click(page.locator(`${bar('salon', 1)} .seg[data-idx="2"]`));
await pause(900);
await click(page.locator(`${card} .editor [data-preset="comfort"]`));
await pause(1000);
await page.keyboard.press('Escape');
await pause(400);
// …and the evening Eco starts an hour earlier
await drag(page.locator(`${bar('salon', 1)} .handle`).last(), -1 / 24, bar('salon', 1));
await pause(1200);

// The presets: what Comfort, Eco… mean for each thermostat
await click(page.locator(`${card} [data-act="view"][data-view="presets"]`));
await pause(1500);
await click(page.locator(`${card} [data-act="cell"][data-kind="thermostat"][data-preset="eco"][data-climate="climate.cuisine"]`));
await pause(2000);
await click(page.locator(`${card} [data-act="cell-close"]`));
await pause(500);
await click(page.locator(`${card} [data-act="view"][data-view="schedule"]`));
await pause(900);

// Holidays: activate Vacances from the card
await click(page.locator(`${card} .tab`, { hasText: 'Vacances' }));
await pause(900);
await click(page.locator(`${card} [data-act="activate-schedule"]`));
await pause(1400);

// Show only the living room, then its more-info dialog: schedule and override
await click(page.locator(`${card} .chip[data-climate="climate.salon"]`), { dx: 0.25 });
await pause(1200);
await click(page.locator(`${card} .chip[data-climate="climate.salon"] .chip-open`));
await pause(1200);
// The "Planning" block sits under the thermostat controls: scroll the dialog down to it
await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height * 0.6, { steps: 15 });
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 80);
  await pause(60);
}
await pause(600);
const block = page.locator('chauffage-moreinfo');
if (await block.count()) await moveTo(block, { dx: 0.4, dy: 0.45 });
await pause(2800);
await page.keyboard.press('Escape');
await pause(700);

// The history of the living room: its last days as they were measured (back to the real time,
// the history being real), on Normal, the schedule followed during those days
await context.clock.setFixedTime(new Date(REAL_NOW));
await click(page.locator(`${card} .tab`, { hasText: 'Normal' }));
await pause(800);
await click(page.locator(`${card} [data-act="history"]`));
await page.locator(`${card} svg.history`).first().waitFor();
await pause(2200);
// Yesterday, larger: the scale in degrees, and the values along the day under the mouse
const yesterday = (new Date(REAL_NOW).getDay() + 5) % 7;
await click(page.locator(`${card} .day[data-day="${yesterday}"]`));
await pause(1000);
const zoomed = page.locator(`${card} .bar.zoom`);
const box = await zoomed.boundingBox();
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6, { steps: 20 });
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.6, { steps: 90 });
// The video lags behind this script's clock by a few seconds: a longer last pause keeps the end
await pause(5000);
const end = (Date.now() - t0) / 1000;

const video = page.video();
await context.close();
writeFileSync(`${OUT}/timing.json`, JSON.stringify({ video: await video.path(), start, end }));

// 3. Clean up (not recorded): remove the demo override and the created schedule, activate Normal
const restore = await browser.newContext({ viewport: VIEWPORT, ...LOCALE, storageState: session });
const rp = await restore.newPage();
await rp.goto(DASHBOARD);
await rp.locator(`${card} .bar`).first().waitFor();
await setOverride(rp, 'climate.salon', null);
await callWS(rp, { type: 'chauffage/schedule/activate', schedule: 'normal' });
const data = await subscribeOnce(rp);
await callWS(rp, {
  type: 'chauffage/schedules/set',
  schedules: data.schedules.filter((s) => s.name !== CREATED).map((s) => ({ id: s.id })),
});
await rp.evaluate(() => localStorage.removeItem('chauffage-programme-card:shown'));
await browser.close();
console.log(`demo recorded: ${(end - start).toFixed(1)} s`);
