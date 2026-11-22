// A change by hand, on a phone: the living room raised by one degree in its dialog, which says
// until when the override lasts; then, on the room's card, the end of the override dragged later
// and 30 more minutes. The override lasts the override duration (2 hours), the default end.
import { record, CARD, callWS, chauffageData, setOverride } from '../lib.mjs';

const SALON = 'climate.salon';

await record('override', {
  viewport: { width: 390, height: 780 },
  async prepare(page) {
    await setOverride(page, SALON, null);
    const before = (await chauffageData(page)).manual_override_end || 'duration';
    await callWS(page, { type: 'chauffage/settings/set', manual_override_end: 'duration' });
    // Only the living room on the card
    await page.evaluate(() => localStorage.setItem('chauffage-programme-card:shown', JSON.stringify(['climate.salon'])));
    return before;
  },
  async scene({ page, pause, moveTo, click, drag, scroll }) {
    await page.mouse.move(195, 650);
    await pause(600);

    // The living room's dialog, from its chip on the card
    await click(page.locator(`${CARD} .chip[data-climate="${SALON}"] .chip-open`));
    await pause(700);
    // A change by hand: one degree more, with the dialog's +
    const step = await page.evaluate((c) =>
      document.querySelector('home-assistant').hass.states[c].attributes.target_temp_step || 0.5, SALON);
    const plus = page.locator('ha-state-control-climate-temperature ha-outlined-icon-button').last();
    for (let i = 0; i < Math.round(1 / step); i++) {
      await click(plus, { steps: i ? 2 : 15 });
      await pause(120);
    }
    // The setpoint becomes an override: the block under the controls says until when, and why
    const block = page.locator('chauffage-moreinfo');
    await block.locator('.status.derogation').waitFor({ timeout: 20000 });
    await page.mouse.move(195, 500, { steps: 8 });
    await scroll(110, 6);
    await moveTo(block.locator('.status.derogation .muted').first(), { dx: 0.3 });
    await pause(1600);
    await page.keyboard.press('Escape');
    await pause(400);

    // The room's card, in the Pièces view: the end of the override, dragged 1 h 30 later…
    await click(page.getByRole('tab', { name: 'Pièces' }));
    const salon = page.locator('chauffage-thermostat-card').filter({ hasText: 'Salon' }).first();
    const today = salon.locator('chauffage-moreinfo .bar.big').first();
    await today.waitFor();
    await pause(500);
    await drag(today.locator('.override-handle'), 1.5 / 24, today);
    await pause(900);
    // …and 30 more minutes, with a button
    await click(salon.locator('details.change summary'));
    await pause(400);
    await click(salon.locator('button[data-act="override-add"][data-min="30"]'));
    await pause(500);
    await moveTo(salon.locator('.end-block .muted').first(), { dx: 0.3 });
    await pause(1200);
  },
  async restore(page, before) {
    await setOverride(page, SALON, null);
    await callWS(page, { type: 'chauffage/settings/set', manual_override_end: before });
    await page.evaluate(() => localStorage.removeItem('chauffage-programme-card:shown'));
  },
});
