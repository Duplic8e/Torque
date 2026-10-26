// Browser smoke test for the Phase 3 loop. Needs the preinstalled Playwright and a running server.
//   npm run build && npx vite preview --port 4173 &   then   node tests/e2e/smoke.mjs [url]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.env.SHOTS_DIR;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (name) => shots && (await page.screenshot({ path: `${shots}/${name}.png` }));

await page.goto(url);
await page.getByRole('button', { name: 'Get started' }).click();
await page.getByRole('button', { name: 'Next' }).click(); // vehicle
// odometer step: required
await page.getByRole('button', { name: 'Next' }).click();
assert(await page.getByText('Enter your current odometer reading.').isVisible(), 'odometer is required');
await page.locator('input[inputmode=numeric]').fill('30000');
await page.getByRole('button', { name: 'Next' }).click(); // style
await shot('1-style');
await page.getByRole('button', { name: 'Next' }).click(); // services
await shot('2-services');
await page.getByRole('button', { name: 'Finish' }).click();

await page.getByText('Up next').waitFor();
await page.getByText('Review your schedule').waitFor();
await shot('3-dashboard-fresh');

// Log an oil change through the FAB.
await page.getByRole('button', { name: 'Add' }).click();
await page.getByRole('menuitem', { name: 'Log service' }).click();
await page.getByRole('button', { name: 'Engine oil and filter' }).click();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Service logged').waitFor();

await page.getByRole('link', { name: 'Schedule', exact: true }).click();
const upcoming = page.locator('section', { has: page.getByRole('heading', { name: 'Upcoming' }) });
await upcoming.getByText('Engine oil and filter').waitFor({ timeout: 3000 }); // oil moves to Upcoming after logging
await shot('4-schedule');

// Lower odometer must warn, not save silently.
await page.getByRole('link', { name: 'Home', exact: true }).click();
await page.getByRole('button', { name: 'Update odometer' }).first().click();
await page.locator('.sheet input[inputmode=numeric]').fill('100');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('alert').getByText(/lower than/).waitFor({ timeout: 3000 });
await shot('5-warning');
await page.getByRole('button', { name: 'Fix' }).click();
await page.locator('.sheet input[inputmode=numeric]').fill('30100');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText(/Odometer saved/).waitFor();

// Data survives a reload.
await page.reload();
await page.getByText('Up next').waitFor();
assert(!(await page.getByText('Get started').count()), 'no onboarding after reload');
await shot('6-dashboard');

// Phase 4a: log a costed service with a receipt photo.
const png = (w, h) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 200)]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
};
const PNG = png(40, 30);
await page.getByRole('button', { name: 'Add' }).click();
await page.getByRole('menuitem', { name: 'Log service' }).click();
await page.getByRole('button', { name: 'Tire rotation' }).click();
await page.getByLabel('Total cost').fill('120');
await page.getByLabel('Shop').fill('Fast Lube');
await page.locator('.sheet input[type=file]').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: PNG });
await page.locator('.photo-thumb img').waitFor();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Service logged').waitFor();

// History: search, filters, detail, edit, delete + undo.
await page.getByRole('link', { name: 'History', exact: true }).click();
await page.getByPlaceholder(/Search/).fill('fast');
await page.locator('.list-row').first().waitFor();
assert.equal(await page.locator('.list-row').count(), 1, 'search narrows to one visit');
await page.getByPlaceholder(/Search/).fill('zzz');
await page.getByText('Nothing matches those filters.').waitFor();
await page.getByRole('button', { name: 'Clear filters' }).click();
await page.locator('.list-row', { hasText: 'Tire rotation' }).click();
await page.locator('.sheet .photo-small img').waitFor();
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await page.getByLabel('Total cost').fill('150');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Changes saved').waitFor();
await page.locator('.list-row', { hasText: 'Tire rotation' }).getByText(/\$150/).waitFor();
await page.locator('.list-row', { hasText: 'Tire rotation' }).click();
await page.getByRole('button', { name: 'Delete' }).click();
await page.getByRole('button', { name: 'Undo' }).click();
await page.locator('.list-row', { hasText: 'Tire rotation' }).waitFor();

// Costs charts.
await page.getByRole('link', { name: 'Costs', exact: true }).click();
await page.getByText('Spend per month').waitFor();
assert(await page.locator('.chart-bar').count() >= 1, 'monthly bar drawn');
assert(await page.locator('.legend li', { hasText: 'Tires' }).count() === 1, 'category legend');
await shot('7-costs');

// Export, reset, restore from the file on the welcome screen.
await page.getByRole('link', { name: 'Settings', exact: true }).click();
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
const backupPath = `${process.env.TMPDIR ?? '/tmp'}/torque-smoke-backup.json`;
await download.saveAs(backupPath);
assert.match(download.suggestedFilename(), /^torque-backup-\d{4}-\d{2}-\d{2}\.json$/);
await page.getByText('Last backup: today').waitFor();
await page.getByLabel('Type RESET to confirm').fill('RESET');
await page.getByRole('button', { name: 'Reset all data' }).click();
await page.getByRole('button', { name: 'Get started' }).waitFor();
await page.locator('input[type=file]').setInputFiles(backupPath);
await page.getByText('Up next').waitFor();
await page.getByRole('link', { name: 'History', exact: true }).click();
await page.locator('.list-row', { hasText: 'Tire rotation' }).click();
await page.locator('.sheet .photo-small img').waitFor(); // the photo came back too
await page.getByRole('button', { name: 'Close' }).click();
await page.locator('.list-row').first().waitFor();
assert.equal(await page.locator('.list-row').count(), 2, 'both visits restored');

// Importing the same file again merges without duplicating.
await page.getByRole('link', { name: 'Settings', exact: true }).click();
await page.locator('input[type=file]').setInputFiles(backupPath);
await page.getByRole('button', { name: 'Merge with current data' }).click();
await page.getByText('Backup merged').waitFor();
await page.getByRole('link', { name: 'History', exact: true }).click();
await page.locator('.list-row').first().waitFor();
assert.equal(await page.locator('.list-row').count(), 2, 'merge does not duplicate');

// Font size >= 16px on every input (no iOS zoom).
await page.getByRole('link', { name: 'Settings', exact: true }).click();
const small = await page.$$eval('input, select, textarea', (els) => els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length);
assert.equal(small, 0, 'inputs must be >= 16px');

assert.deepEqual(errors, [], `console errors: ${errors.join('; ')}`);
await browser.close();
console.log('smoke ok');
