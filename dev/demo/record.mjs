// Records the README demo against the development HA (run through scripts/demo.sh).
// Playwright drives a real browser; the video is converted to docs/demo.gif afterwards.
// The browser clock is set to a Tuesday morning, with a demo override on the living room.
// Nothing is kept: schedule edits are discarded, the override is removed and the heating
// mode is restored at the end.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const HA = process.env.HA_URL || 'http://homeassistant:8123';
const DASHBOARD = `${HA}/chauffage-dev/planning`;
const VIEWPORT = { width: 880, height: 640 };
const OUT = '/demo/out';

// Demo time: next Tuesday 10:05; demo override on the living room from 08:45 to 11:30
function nextTuesday(hh, mm) {
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
  d.setHours(hh, mm, 0, 0);
  return d;
}
const NOW = nextTuesday(10, 5);
const OVERRIDE = {
  type: 'temp', valeur: 21.5,
  debut: nextTuesday(8, 45).toISOString(), fin: nextTuesday(11, 30).toISOString(),
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

// Sends an event to HA through the frontend's own connection (same path as the card)
const fireEvent = (page, eventType, eventData) => page.evaluate(([type, data]) => {
  const ha = document.querySelector('home-assistant');
  return ha.hass.callWS({ type: 'fire_event', event_type: type, event_data: data });
}, [eventType, eventData]);

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
});
// The override shows the thermostat's actual setpoint, so the card and the dialog agree
OVERRIDE.valeur = await lp.evaluate(() =>
  document.querySelector('home-assistant').hass.states['climate.salon'].attributes.temperature);
await fireEvent(lp, 'chauffage_derogation_set', { climate: 'climate.salon', derogation: OVERRIDE });
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

await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 40);
await pause(1500); // Tuesday: the override is shown on the living room row

// Drag a time: living room, Monday, 06:30 → 07:30
const handle = page.locator(`${bar('salon', 0)} .handle[data-idx="1"]`);
const from = await moveTo(handle);
await pause(300);
await page.mouse.down();
const width = (await page.locator(bar('salon', 0)).boundingBox()).width;
await page.mouse.move(from.x + width / 24, from.y, { steps: 30 });
await pause(400);
await page.mouse.up();
await pause(700);

// Edit a slot: office, Wednesday, comfort slot → Boost
await click(page.locator(`${bar('bureau', 2)} .seg[data-idx="1"]`));
await pause(900);
await click(page.locator(`${card} .editor [data-preset="boost"]`));
await pause(1000);
await page.keyboard.press('Escape');
await pause(500);

// Copy the living room's Monday and paste it on the bedroom's Monday
await click(page.locator(`${card} [data-act="menu"][data-climate="climate.salon"][data-day="0"]`));
await pause(700);
await click(page.locator(`${card} .menu [data-act="copy-day"]`));
await pause(500);
await click(page.locator(`${card} [data-act="menu"][data-climate="climate.chambre"][data-day="0"]`));
await pause(700);
await click(page.locator(`${card} .menu [data-act="paste-day"]`));
await pause(1000);

// Switch the heating mode from the card
await click(page.locator(`${card} .tab[data-mode="Absent"]`));
await pause(900);
await click(page.locator(`${card} [data-act="activate-mode"]`));
await pause(1400);

// Show only the living room: its week and today's override
await click(page.locator(`${card} .chip[data-climate="climate.salon"]`), { dx: 0.25 });
await pause(1800);

// Open its more-info dialog: schedule and override shown under the controls
await click(page.locator(`${card} .chip[data-climate="climate.salon"] .chip-open`));
await pause(1200);
// The "Programme" block sits under the thermostat controls: scroll the dialog down to it
await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height * 0.6, { steps: 15 });
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 80);
  await pause(60);
}
await pause(600);
const block = page.locator('chauffage-moreinfo');
if (await block.count()) await moveTo(block, { dx: 0.4, dy: 0.45 });
await pause(2800);
const end = (Date.now() - t0) / 1000;
await page.keyboard.press('Escape');

const video = page.video();
await context.close();
writeFileSync(`${OUT}/timing.json`, JSON.stringify({ video: await video.path(), start, end }));

// 3. Clean up (not recorded): remove the demo override, restore the mode and the display
const restore = await browser.newContext({ viewport: VIEWPORT, ...LOCALE, storageState: session });
const rp = await restore.newPage();
await rp.goto(DASHBOARD);
await rp.locator(`${card} .bar`).first().waitFor();
await fireEvent(rp, 'chauffage_derogation_set', { climate: 'climate.salon', derogation: null });
await rp.locator(`${card} .tab[data-mode="Normal"]`).click();
await rp.locator(`${card} [data-act="activate-mode"]`).click();
await rp.waitForTimeout(1000);
await browser.close();
console.log(`demo recorded: ${(end - start).toFixed(1)} s`);
