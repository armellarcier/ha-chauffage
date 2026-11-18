// A slot popover on a phone, in the dark theme: dev/review/run.sh dev/review/examples/slot.mjs
import { launch, close, openSlot, tap, measureRow, describeRow, contrast, shot, card } from '/review/lib.mjs';

const page = await launch({ viewport: 'phone', theme: 'dark', deviceScaleFactor: 2 });
const editor = await openSlot(page, 'climate.suite_parentale', 'today', '12:00');
await tap(page, editor.locator('.mode-row [data-mode="cool"]'));

// Every button of the row has one height, and its icon is on the line of its text
console.log(await describeRow(editor.locator('.mode-row')));
const heights = new Set((await measureRow(editor.locator('.mode-row'))).map((child) => child.h));
console.log('one height:', heights.size === 1);

// The chosen HVAC mode is legible
console.log(await contrast(editor.locator('.mode-row .mode.on span')));

await shot(page, 'example-slot-cool', { crop: editor });
// Nothing was saved: the edit is dropped
await card(page).evaluate((el) => el._discard());
await close();
