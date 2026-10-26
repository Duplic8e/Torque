// Browser smoke test for the Phase 3 loop. Needs the preinstalled Playwright and a running server.
//   npm run build && npx vite preview --port 4173 &   then   node tests/e2e/smoke.mjs [url]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
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

// Font size >= 16px on every input (no iOS zoom).
await page.getByRole('link', { name: 'Settings', exact: true }).click();
const small = await page.$$eval('input, select, textarea', (els) => els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length);
assert.equal(small, 0, 'inputs must be >= 16px');

assert.deepEqual(errors, [], `console errors: ${errors.join('; ')}`);
await browser.close();
console.log('smoke ok');
