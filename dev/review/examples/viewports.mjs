// One block at both sizes and in both themes, at twice the pixel density:
// dev/review/run.sh dev/review/examples/viewports.mjs
import { launch, close, openPresetCell, setViewport, setTheme, shot } from '/review/lib.mjs';

let page = await launch({ viewport: 'desktop', theme: 'light', deviceScaleFactor: 2 });
for (const viewport of ['desktop', 'phone']) {
  page = await setViewport(page, viewport); // a new page: keep the one it returns
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    const cell = await openPresetCell(page, 'climate.suite_parentale', 'comfort');
    const touch = await page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer:coarse)').matches);
    console.log(`${viewport} ${theme}: ${page.viewportSize().width} px, touch ${touch}, popover ${Math.round((await cell.boundingBox()).width)} px wide`);
    await shot(page, 'example-cell', { crop: cell });
  }
}
await close();
