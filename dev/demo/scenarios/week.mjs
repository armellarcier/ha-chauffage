// The first demo of the README: a schedule copied and edited, another one activated, then the
// history. Needs the sample data of a new development HA: Normal (active), Vacances, and a
// simulated week of history.
// Nothing is kept: the edits are not saved, the new schedule is removed, Normal is active again.
import { record, bar, CARD, callWS, removeSchedules } from '../lib.mjs';

const CREATED = 'Télétravail';

await record('week', {
  prepare: (page) => removeSchedules(page, [CREATED]),
  async scene({ page, pause, click, drag, reveal }) {
    await page.mouse.move(440, 600);
    await pause(700); // Normal is active

    // A new schedule: a copy of Normal, named "Télétravail"; the card opens it
    await click(page.locator(`${CARD} [data-act="schedule-new"]`));
    await pause(600);
    await click(page.locator(`${CARD} .sched-menu [data-act="schedule-pick"][data-copy="normal"]`));
    await pause(500);
    await page.keyboard.type(CREATED, { delay: 60 });
    await pause(400);
    await click(page.locator(`${CARD} .sched-menu [data-act="schedule-create"]`));
    await page.locator(`${CARD} .tab.on`, { hasText: CREATED }).waitFor();
    await pause(800);

    // Each day on its own row, to edit Tuesday alone
    const grouping = page.locator(`${CARD} [data-act="group-days"]`);
    if (await grouping.evaluate((b) => b.classList.contains('on'))) {
      await click(grouping);
      await pause(600);
    }
    // Someone works from home on Tuesdays: the living room stays in Comfort during the day…
    await reveal(page.locator(bar('salon', 1)), { bottom: 220 });
    await click(page.locator(`${bar('salon', 1)} .seg[data-idx="2"]`));
    await pause(600);
    await click(page.locator(`${CARD} .editor [data-preset="comfort"]`));
    await pause(700);
    await page.keyboard.press('Escape');
    await pause(400);
    // …and the evening Eco starts an hour earlier
    await drag(page.locator(`${bar('salon', 1)} .handle`).last(), -1 / 24, bar('salon', 1));
    await pause(800);

    // Holidays: the whole house switches schedule
    await click(page.locator(`${CARD} .tab`, { hasText: 'Vacances' }));
    await pause(600);
    await click(page.locator(`${CARD} [data-act="activate-schedule"]`));
    await pause(1000);

    // The history of Normal, for the living room alone: the last days as they were measured
    await click(page.locator(`${CARD} .tab`, { hasText: 'Normal' }));
    await pause(800);
    await click(page.locator(`${CARD} .chip[data-climate="climate.salon"]`), { dx: 0.25 });
    await pause(600);
    await click(page.locator(`${CARD} [data-act="history"]`));
    await page.locator(`${CARD} svg.history`).first().waitFor();
    await pause(1500);
    // Yesterday, larger: the scale in degrees, and the values along the day under the mouse
    const yesterday = await page.evaluate(() => (new Date().getDay() + 5) % 7);
    await click(page.locator(`${CARD} .day[data-day="${yesterday}"]`));
    await pause(700);
    const box = await page.locator(`${CARD} .bar.zoom`).boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6, { steps: 20 });
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.6, { steps: 50 });
  },
  async restore(page) {
    await callWS(page, { type: 'chauffage/schedule/activate', schedule: 'normal' });
    await removeSchedules(page, [CREATED]);
  },
});
