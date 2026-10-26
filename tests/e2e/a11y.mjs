// Accessibility audit: axe-core on every screen and sheet in light and dark, plus tap-target size,
// input font size (no iOS zoom) and keyboard focus checks.
//   npm run build && npx vite preview --port 4173 &   then   node tests/e2e/a11y.mjs [url]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axePath = require.resolve('axe-core/axe.min.js');

const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch();
const problems = [];

async function setup(page) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('input[inputmode=numeric]').fill('45000');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip and finish' }).click();
  await page.getByText('Up next').waitFor();
  // A visit with costs so charts, history and sheets have content.
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('menuitem', { name: 'Log service' }).click();
  await page.getByRole('button', { name: 'Engine oil and filter' }).click();
  await page.getByRole('button', { name: 'Tire rotation' }).click();
  await page.getByLabel('Total cost').fill('140');
  await page.getByLabel('Shop').fill('Fast Lube');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Service logged').waitFor();
  await page.getByText('Service logged').waitFor({ state: 'hidden', timeout: 10_000 });
}

async function audit(page, label) {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n').slice(1, 3).join(' ') })) }));
  });
  for (const v of result) problems.push({ where: label, rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes });

  const metrics = await page.evaluate(() => {
    const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('.visually-hidden') && !e.closest('[hidden]'); };
    const small = [...document.querySelectorAll('button, a[href], select, input:not([type=file]):not([type=checkbox]), textarea, summary, [role=button]:not(rect)')]
      .filter(visible)
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
      .map(({ e, r }) => `${e.tagName.toLowerCase()}.${e.className || ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    const zoom = [...document.querySelectorAll('input, select, textarea')].filter(visible).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.outerHTML.slice(0, 60));
    return { small, zoom };
  });
  for (const s of metrics.small) problems.push({ where: label, rule: 'tap-target-44', impact: 'moderate', help: 'Interactive element under 44px', nodes: [{ target: s }] });
  for (const z of metrics.zoom) problems.push({ where: label, rule: 'input-font-16', impact: 'serious', help: 'Input under 16px zooms on iOS', nodes: [{ target: z }] });
}

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, acceptDownloads: true });
  const page = await ctx.newPage();
  await setup(page);
  const at = (name) => `${scheme}/${name}`;

  await audit(page, at('dashboard'));
  await page.getByRole('button', { name: 'Add' }).click();
  await audit(page, at('fab-menu'));
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);

  await page.getByRole('button', { name: 'Update odometer' }).first().click();
  await audit(page, at('odometer-sheet'));
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: 'Schedule', exact: true }).click();
  await page.getByRole('heading', { name: 'Upcoming' }).waitFor();
  await audit(page, at('schedule'));
  await page.locator('.list-row').first().click();
  await audit(page, at('item-sheet'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await audit(page, at('item-edit'));
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Add custom item' }).click();
  await audit(page, at('add-item-sheet'));
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.locator('.list-row').first().waitFor();
  await audit(page, at('history'));
  await page.locator('.list-row').first().click();
  await audit(page, at('record-sheet'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await audit(page, at('log-sheet-edit'));
  await page.getByRole('button', { name: 'Close' }).click();
  if (await page.getByRole('button', { name: 'Close' }).count()) await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: 'Costs', exact: true }).click();
  await page.getByText('Spend per month').waitFor();
  await audit(page, at('costs'));

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await audit(page, at('settings'));
  await page.getByRole('button', { name: 'Edit vehicle details' }).click();
  await audit(page, at('vehicle-sheet'));
  await page.getByRole('button', { name: 'Close' }).click();

  // Keyboard: Escape closes a sheet, Tab stays inside it, and focus returns to the opener.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Update odometer' }).first();
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.locator('.sheet').waitFor();
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => !!document.activeElement?.closest('.sheet'));
  if (!inside) problems.push({ where: at('focus-trap'), rule: 'focus-trap', impact: 'serious', help: 'Tab must stay inside an open sheet', nodes: [{ target: 'sheet' }] });
  page.once('dialog', (d) => { console.log('DIALOG:', d.message()); void d.dismiss(); });
  await page.evaluate(() => { window.__keys = []; window.addEventListener('keydown', (e) => window.__keys.push(`${e.key}@${document.activeElement?.tagName}.${document.activeElement?.className}`), true); });
  const focusBeforeEscape = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className} ${document.activeElement?.getAttribute('type')}`);
  await page.keyboard.press('Escape');
  try {
    await page.locator('.sheet').waitFor({ state: 'detached', timeout: 5000 });
  } catch (e) {
    console.log('ESCAPE FAILED', scheme, 'focus before:', focusBeforeEscape, 'keys:', JSON.stringify(await page.evaluate(() => window.__keys)), 'sheets:', await page.locator('.sheet').count());
    throw e;
  }
  const restored = await opener.evaluate((el) => el === document.activeElement);
  if (!restored) problems.push({ where: at('focus-return'), rule: 'focus-return', impact: 'moderate', help: 'Focus should return to the control that opened the sheet', nodes: [{ target: 'activeElement' }] });

  await ctx.close();
}
await browser.close();

if (problems.length) {
  const grouped = new Map();
  for (const p of problems) {
    const key = `${p.rule} [${p.impact}] ${p.help}`;
    const g = grouped.get(key) ?? { where: new Set(), nodes: new Set() };
    g.where.add(p.where);
    p.nodes.forEach((n) => g.nodes.add(`${n.target}${n.summary ? ` => ${n.summary}` : ''}`));
    grouped.set(key, g);
  }
  for (const [key, g] of grouped) console.log(`\n${key}\n  where: ${[...g.where].join(', ')}\n  e.g.: ${[...g.nodes].slice(0, 4).join('\n        ')}`);
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log('a11y ok');
