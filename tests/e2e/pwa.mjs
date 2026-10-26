// PWA checks against the built app: installability, offline use, and the "Update available" toast.
//   npm run build && node tests/e2e/pwa.mjs
// It serves ./dist itself (twice: the build, and a copy whose service worker differs by a byte).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, appendFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const work = await mkdtemp(join(tmpdir(), 'torque-pwa-'));
await cp('dist', join(work, 'a'), { recursive: true });
await cp('dist', join(work, 'b'), { recursive: true });
await appendFile(join(work, 'b', 'sw.js'), '\n// redeployed build\n');

let root = join(work, 'a');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    const file = join(root, path === '/' ? 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(4180, r));
const url = 'http://localhost:4180/';

const browser = await chromium.launch();
try {
  // ---- installability ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const cdp = await ctx.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(installabilityErrors, [], `installability errors: ${JSON.stringify(installabilityErrors)}`);

    const manifest = await (await page.request.get(`${url}manifest.webmanifest`)).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert(manifest.theme_color && manifest.background_color);
    const sizes = manifest.icons.map((i) => `${i.sizes}${i.purpose === 'maskable' ? ' maskable' : ''}`);
    for (const need of ['192x192', '512x512', '512x512 maskable']) assert(sizes.includes(need), `manifest icon ${need}`);
    for (const icon of manifest.icons) assert.equal((await page.request.get(url + icon.src)).status(), 200, `${icon.src} loads`);

    const head = await page.evaluate(() => ({
      touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
      capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
      bar: document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')?.content,
      viewport: document.querySelector('meta[name=viewport]')?.content,
    }));
    assert.equal(head.capable, 'yes');
    assert.equal(head.bar, 'black-translucent');
    assert.match(head.viewport, /viewport-fit=cover/);
    assert.doesNotMatch(head.viewport, /user-scalable=no|maximum-scale=1/, 'pinch zoom must stay available');
    const touch = await page.request.get(new URL(head.touch, url).href);
    assert.equal(touch.status(), 200);
    assert.equal(touch.headers()['content-type'], 'image/png');
    await ctx.close();
  }

  // ---- offline: open the installed app in airplane mode and add a record ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // now controlled by the service worker
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await ctx.setOffline(true); // airplane mode
    await page.reload();
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('input[inputmode=numeric]').fill('52000');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Skip and finish' }).click();
    await page.getByText('Up next').waitFor();

    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('menuitem', { name: 'Log service' }).click();
    await page.getByRole('button', { name: 'Engine oil and filter' }).click();
    await page.getByLabel('Total cost').fill('75');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Service logged').waitFor();

    await page.reload(); // still offline: the record survives a cold start
    await page.getByText('Up next').waitFor();
    await page.getByRole('link', { name: 'History', exact: true }).click();
    await page.locator('.list-row', { hasText: 'Engine oil and filter' }).waitFor();
    await page.getByRole('link', { name: 'Costs', exact: true }).click();
    await page.getByText('Spend per month').waitFor();
    assert.deepEqual(errors, []);
    await ctx.close();
  }

  // ---- update toast: a redeploy shows "Update available", and tapping it switches to the new build ----
  {
    root = join(work, 'a');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    assert.equal(await page.getByText('Update available').count(), 0, 'no toast before a redeploy');

    root = join(work, 'b'); // "deploy" the new build
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
    await page.getByText('Update available').waitFor({ timeout: 10_000 });
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Tap to refresh' }).click()]);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const sw = await page.evaluate(async () => (await (await fetch('/sw.js')).text()).includes('redeployed build'));
    assert(sw, 'new service worker is being served');
    assert.equal(await page.getByText('Update available').count(), 0, 'toast gone after refresh');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log('pwa ok');
