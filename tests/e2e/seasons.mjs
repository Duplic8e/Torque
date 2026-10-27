// Browser test for the seasonal tire swap reminder and the warranty card.
//   npm run build && npx vite preview --port 4173 &   then   node tests/e2e/seasons.mjs [url] [screenshot dir]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const snap = (name) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
const sheet = page.locator('.sheet');

await page.clock.install({ time: new Date('2026-10-27T12:00:00') });
await page.goto(url);
await page.getByRole('button', { name: 'Get started' }).click();
await page.getByRole('button', { name: 'Next' }).click();
await page.locator('input[inputmode=numeric]').fill('30000');
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Skip and finish' }).click();
await page.getByText('Up next').waitFor();

// No delivery date yet: the warranty card asks for one and opens Vehicle details.
await page.getByRole('button', { name: /Enter your delivery date/ }).click();
await sheet.getByLabel('Delivery date (warranty start)').fill('2023-03-15');
await sheet.getByRole('button', { name: 'Save' }).click();
await page.getByText('Vehicle saved').waitFor();
await page.getByText('Vehicle saved').waitFor({ state: 'hidden' });
const rows = page.locator('.warranty-row');
await rows.filter({ hasText: 'Powertrain' }).getByText('1 year 4 months left').waitFor();
await rows.filter({ hasText: 'Anti-perforation' }).getByText('to Mar 2030').waitFor();
await rows.filter({ hasText: 'Comprehensive' }).getByText('Ended Mar 2026').waitFor();
assert.equal(await page.locator('.callout', { hasText: 'coverage ends' }).count(), 0, 'nothing is within 90 days of ending');
await page.locator('.warranty-row').first().scrollIntoViewIfNeeded();
await snap('10-warranty');

// Turn on winter tires with summers mounted: winters are due Nov 1, five days out.
await page.getByRole('link', { name: 'Settings', exact: true }).click();
await page.getByText('I swap to winter tires').click();
await page.getByRole('radio', { name: 'Summer' }).waitFor();
assert.equal(await page.getByLabel('Winter tires on by').inputValue(), '11-01');
await page.getByText('Winter tires on by').scrollIntoViewIfNeeded();
await snap('11-winter-settings');
// Onboarding was skipped, so every other item is "due now" and fills Up next; check the schedule instead.
await page.getByRole('link', { name: 'Schedule', exact: true }).click();
const upNext = page.locator('.list-row', { hasText: 'Winter tires on' });
await upNext.getByText('in 5 days').waitFor();
await upNext.getByText('Due soon').waitFor();

// The item sheet explains the season and logs the swap.
await upNext.click();
await sheet.getByText('Summer tires, since May 1, 2026 (assumed)').waitFor();
await sheet.getByText('Winter tires on by Nov 1, 2026').waitFor();
assert.equal(await sheet.getByRole('button', { name: 'Edit' }).count(), 0, 'no interval editor for the swap');
await snap('12-tire-swap-sheet');
await sheet.getByRole('button', { name: 'Log swap' }).click();
await sheet.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Service logged').waitFor();

// After the swap, summers are next, due May 1.
await page.getByRole('link', { name: 'Schedule', exact: true }).click();
const next = page.locator('.list-row', { hasText: 'Summer tires on' });
await next.getByText('around May 1').waitFor();
await page.getByRole('link', { name: 'Settings', exact: true }).click();
await page.getByText('Winter tires went on Oct 27, 2026 (last swap logged).').waitFor();

// Turning it off removes it from the schedule.
await page.getByText('I swap to winter tires').click();
await page.getByRole('link', { name: 'Schedule', exact: true }).click();
await page.locator('.list-row').first().waitFor();
assert.equal(await page.locator('.list-row', { hasText: /(Winter|Summer) tires on/ }).count(), 0);

assert.deepEqual(errors, []);
await browser.close();
console.log('seasons ok');
