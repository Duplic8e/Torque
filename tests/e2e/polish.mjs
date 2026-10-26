// Browser test for per-service costs, vehicle editing, the app badge, day rollover and reduced motion.
//   npm run build && npx vite preview --port 4173 &   then   node tests/e2e/polish.mjs [url]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  window.__badge = [];
  navigator.setAppBadge = async (n) => { window.__badge.push(n); };
  navigator.clearAppBadge = async () => { window.__badge.push(0); };
  // Headless Chromium always reports notifications as denied, so pretend the user allowed them.
  Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const lastBadge = () => page.evaluate(() => window.__badge.at(-1));

await page.clock.install({ time: new Date('2026-10-26T12:00:00') });
await page.goto(url);
await page.getByRole('button', { name: 'Get started' }).click();
await page.getByRole('button', { name: 'Next' }).click();
await page.locator('input[inputmode=numeric]').fill('30000');
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Skip and finish' }).click();
await page.getByText('Up next').waitFor();

// Per-service costs add up and show in the visit detail.
await page.getByRole('button', { name: 'Add' }).click();
await page.getByRole('menuitem', { name: 'Log service' }).click();
await page.getByRole('button', { name: 'Engine oil and filter' }).click();
assert.equal(await page.getByText('Enter a cost for each service').count(), 0, 'toggle only with 2+ services');
await page.getByRole('button', { name: 'Tire rotation' }).click();
await page.getByLabel('Total cost').fill('999'); // must be ignored once per-service is on
await page.getByText('Enter a cost for each service').click();
assert.equal(await page.getByLabel('Total cost').count(), 0, 'total field hidden in per-service mode');
await page.getByLabel('Cost: Engine oil and filter').fill('80');
await page.getByLabel('Cost: Tire rotation').fill('40.50');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Service logged').waitFor();
await page.getByRole('link', { name: 'History', exact: true }).click();
const row = page.locator('.list-row').first();
await row.getByText(/\$120\.50/).waitFor();
await row.click();
await page.locator('.sheet').getByText('$80').waitFor();
await page.locator('.sheet').getByText('$40.50').waitFor();
await page.getByRole('button', { name: 'Close' }).click();
await page.getByRole('link', { name: 'Costs', exact: true }).click();
await page.locator('.legend li', { hasText: 'Oil' }).getByText('$80').waitFor();
await page.locator('.legend li', { hasText: 'Tires' }).getByText('$40.50').waitFor();

// Vehicle details.
await page.getByRole('link', { name: 'Settings', exact: true }).click();
await page.getByRole('button', { name: 'Edit vehicle details' }).click();
await page.getByLabel('Nickname').fill('Zoomy');
await page.getByLabel('Tire size').fill('225/55R19');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Vehicle saved').waitFor();
await page.getByRole('link', { name: 'Home', exact: true }).click();
await page.getByText('Zoomy').first().waitFor();

// Badge: off until enabled, then shows the count of overdue + due soon items.
assert.notEqual(await lastBadge(), undefined);
assert((await lastBadge()) === 0, 'no badge before enabling');
await page.getByRole('link', { name: 'Settings', exact: true }).click();
await page.getByLabel('Badge on the app icon').check();
await page.waitForFunction(() => window.__badge.at(-1) > 0);
const count = await lastBadge();
assert(count >= 1, 'badge shows a count');
await page.getByLabel('Badge on the app icon').uncheck();
await page.waitForFunction(() => window.__badge.at(-1) === 0);

// Statuses recompute when the day changes while the app stays open.
await page.getByLabel('Badge on the app icon').check();
await page.waitForFunction(() => window.__badge.at(-1) > 0);
await page.getByRole('link', { name: 'Schedule', exact: true }).click();
await page.getByRole('heading', { name: 'Upcoming' }).waitFor();
const overdueBefore = await page.locator('section', { has: page.getByRole('heading', { name: 'Overdue' }) }).count();
await page.clock.setSystemTime(new Date('2028-10-26T12:00:00')); // two years later, no reload
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.getByRole('heading', { name: 'Overdue' }).waitFor({ timeout: 5000 });
assert(overdueBefore === 0, 'nothing overdue on day one');
await page.getByRole('link', { name: 'Schedule', exact: true }).click();
await page.getByText(/Overdue by/).first().waitFor();

assert.deepEqual(errors, [], `console errors: ${errors.join('; ')}`);
await browser.close();

// Reduced motion removes the animations and transitions.
const rb = await chromium.launch();
const rctx = await rb.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const rp = await rctx.newPage();
await rp.goto(url);
await rp.getByRole('button', { name: 'Get started' }).click();
await rp.getByRole('button', { name: 'Next' }).click();
await rp.locator('input[inputmode=numeric]').fill('30000');
for (let i = 0; i < 3; i++) await rp.getByRole('button', { name: 'Next' }).click();
await rp.getByRole('button', { name: 'Skip and finish' }).click();
await rp.getByText('Up next').waitFor();
const durations = await rp.evaluate(() => {
  const t = (sel) => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).animationDuration) + parseFloat(getComputedStyle(e).transitionDuration) : null; };
  return { odo: t('.odo-digit'), gauge: t('.gauge-fill'), tab: t('.tabbar a') };
});
for (const [k, v] of Object.entries(durations)) assert(v !== null && v <= 0.001, `${k} motion removed (got ${v}s)`);

// Denied notification permission: the badge switch turns itself back off and says why.
await rctx.addInitScript(() => { navigator.setAppBadge = async () => {}; navigator.clearAppBadge = async () => {}; });
const dp = await rctx.newPage();
await dp.goto(url);
await dp.getByRole('link', { name: 'Settings', exact: true }).click();
await dp.getByLabel('Badge on the app icon').click();
await dp.getByText(/Permission was denied/).waitFor();
assert.equal(await dp.getByLabel('Badge on the app icon').isChecked(), false, 'switch reverts when denied');
await rb.close();
console.log('polish ok');
