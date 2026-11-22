// The Chauffage panel: the Presets tab (a preset with its temperatures when heating and when
// cooling, then what the living room's Versatile Thermostat does with it), then the settings of
// Chauffage.
import { record, CARD, PANEL } from '../lib.mjs';

const tab = (page, name) => page.locator(`chauffage-panel .tabs [data-navigate="/chauffage/${name}"]`);

await record('panel', {
  async scene({ page, pause, click, scroll }) {
    await page.mouse.move(440, 500);
    await pause(500);

    // The panel, from the card's top right, on its Presets tab
    await click(page.locator(`${CARD} .panel-open`));
    await tab(page, 'presets').waitFor();
    await pause(500);
    await click(tab(page, 'presets'));
    await page.locator(`${PANEL} [data-act="cell"]`).first().waitFor();
    await pause(900);
    // A preset: its name, its color, its temperatures when heating and when cooling
    await click(page.locator(`${PANEL} [data-act="cell"][data-kind="preset"][data-preset="comfort"]`));
    await pause(1800);
    await click(page.locator(`${PANEL} [data-act="cell-close"]`));
    await pause(300);
    // What the living room's Versatile Thermostat does with it: its own preset
    await click(page.locator(`${PANEL} [data-act="cell"][data-kind="thermostat"][data-preset="comfort"][data-climate="climate.salon"]`));
    await pause(1800);
    await click(page.locator(`${PANEL} [data-act="cell-close"]`));
    await pause(300);

    // The settings of Chauffage: how long an override lasts, how it ends, who may change what
    await click(page.locator('chauffage-panel [data-open-settings]').first());
    await pause(1300);
    await page.mouse.move(440, 380, { steps: 15 });
    await scroll(70, 8);
    await pause(1600);
    await page.keyboard.press('Escape');
    await pause(500);
  },
});
