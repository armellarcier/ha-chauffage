// A slot changed and saved, then the thermostat's state against what the popover said:
// dev/review/run.sh dev/review/examples/compare-states.mjs
import { launch, close, openDashboard, openSlot, tap, card, backup, restore, stateLine } from '/review/lib.mjs';

const page = await launch({ viewport: 'desktop' });
await openDashboard(page, 0);
const saved = await backup(page, { thermostats: ['climate.mezzanine'] });
try {
  const climate = 'climate.mezzanine';
  const editor = await openSlot(page, climate, 'today', 'now');
  await tap(page, editor.locator('.mode-row [data-mode="cool"]'));
  await tap(page, editor.locator('.presets [data-preset="comfort"]'));
  const promised = await editor.locator('.slot-setpoint').innerText();
  await card(page).evaluate((el) => el._save());
  await page.waitForTimeout(4000); // Chauffage spaces its commands out
  console.log('the popover said:', promised);
  console.log('the thermostat:  ', await stateLine(climate));
} finally {
  const { changed, left } = await restore(page, saved);
  console.log('put back:', changed.join(', ') || 'nothing', '| still different:', left.join(', ') || 'nothing');
  await close();
}
