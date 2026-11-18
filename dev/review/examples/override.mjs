// A new override in the three places it can be set: dev/review/run.sh dev/review/examples/override.mjs [desktop|phone] [light|dark]
import { launch, close, openOverride, measureRow, shot } from '/review/lib.mjs';

const [viewport = 'desktop', theme = 'light'] = process.argv.slice(2);
const page = await launch({ viewport, theme, deviceScaleFactor: 2 });
const climate = 'climate.suite_parentale';

for (const where of ['card', 'pieces', 'more-info']) {
  const block = await openOverride(page, climate, where);
  const modes = await measureRow(block.locator('.mode-row'));
  const chips = await measureRow(block.locator('.presets'));
  console.log(`${where}: HVAC modes ${[...new Set(modes.map((m) => m.h))]} px, presets ${[...new Set(chips.map((c) => c.h))]} px`);
  console.log(`  default: ${await block.locator('.mode-row .default').innerText()} | ${await block.locator('.end-new').innerText()}`);
  await shot(page, `example-override-${where}`, { crop: block });
}
await close();
