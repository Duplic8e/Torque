// Browser test for cloud sync against a simulated GitHub (page.route), so no real token is needed.
//   npm run build && npx vite preview --port 4173 &   then   node tests/e2e/sync.mjs [url]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:4173/';
const TOKEN = 'github_pat_E2E_secret_token';

// ---- a tiny in-memory GitHub ----
const files = new Map(); // path -> { bytes: Buffer, sha }
const puts = [];
let counter = 0;
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

async function fakeGitHub(route) {
  const req = route.request();
  const headers = req.headers();
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (headers.authorization !== `Bearer ${TOKEN}`) return json(401, { message: 'Bad credentials' });
  const m = new URL(req.url()).pathname.match(/^\/repos\/me\/torque-data(?:\/contents\/(.*))?$/);
  if (!m) return json(404, { message: 'Not Found' });
  const path = m[1];
  if (path === undefined) return json(200, { private: true });
  if (req.method() === 'GET') {
    const f = files.get(path);
    if (f) return route.fulfill({ status: 200, headers: cors, body: f.bytes });
    const kids = [...files].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'));
    return kids.length ? json(200, kids.map(([p, f]) => ({ name: p.split('/').pop(), sha: f.sha, type: 'file' }))) : json(404, { message: 'Not Found' });
  }
  if (req.method() === 'PUT') {
    const body = JSON.parse(req.postData());
    const existing = files.get(path);
    if (existing && !body.sha) return json(422, {});
    if (existing && body.sha !== existing.sha) return json(409, {});
    files.set(path, { bytes: Buffer.from(body.content, 'base64'), sha: `sha-${++counter}` });
    puts.push({ path, message: body.message });
    return json(200, { content: { sha: `sha-${counter}` } });
  }
  return json(405, {});
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('https://api.github.com/**', fakeGitHub);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const allLogs = [];
page.on('console', (m) => allLogs.push(m.text()));

// Onboard without sync.
await page.goto(url);
await page.getByRole('button', { name: 'Get started' }).click();
await page.getByRole('button', { name: 'Next' }).click();
await page.locator('input[inputmode=numeric]').fill('30000');
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Skip and finish' }).click();
await page.getByText('Up next').waitFor();

// Log a service with a photo before connecting, so the first sync uploads everything.
await page.getByRole('button', { name: 'Add' }).click();
await page.getByRole('menuitem', { name: 'Log service' }).click();
await page.getByRole('button', { name: 'Engine oil and filter' }).click();
await page.getByLabel('Total cost').fill('90');
await page.locator('.sheet input[type=file]').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: png(40, 30) });
await page.locator('.photo-thumb img').waitFor();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Service logged').waitFor();

// Connect from Settings: a wrong token is reported, the right one syncs.
await page.getByRole('link', { name: 'Settings', exact: true }).click();
await page.getByLabel('GitHub username').fill('me');
await page.getByLabel('Access token').fill('wrong-token');
await page.getByRole('button', { name: 'Connect', exact: true }).click();
await page.getByText(/token was rejected/).waitFor();
await page.getByLabel('Access token').fill(TOKEN);
await page.getByRole('button', { name: 'Connect', exact: true }).click();
await page.getByText(/Synced (just now|\d+ min ago)/).first().waitFor({ timeout: 10_000 });
assert(files.has('torque/data.json'), 'data.json pushed');
assert([...files.keys()].some((p) => p.startsWith('torque/attachments/')), 'photo uploaded');
const remote = JSON.parse(files.get('torque/data.json').bytes.toString());
assert.equal(remote.records.length, 1);
assert(!files.get('torque/data.json').bytes.toString().includes(TOKEN), 'token not in cloud data');
assert.match(puts.find((p) => p.path === 'torque/data.json').message, /^Sync from iPhone · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

// A change reaches GitHub on its own after the 5 second debounce.
const before = puts.filter((p) => p.path === 'torque/data.json').length;
await page.getByRole('button', { name: 'Add' }).click();
await page.getByRole('menuitem', { name: 'Add note' }).click();
await page.getByLabel('Notes').fill('Auto sync note');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Note saved').waitFor();
await page.getByText(/1 change pending/).first().waitFor();
const deadline = Date.now() + 15_000;
while (puts.filter((p) => p.path === 'torque/data.json').length === before && Date.now() < deadline) await page.waitForTimeout(250);
assert.equal(puts.filter((p) => p.path === 'torque/data.json').length, before + 1, 'debounced push happened');

// Offline: changes queue, then flush when the network returns.
await ctx.setOffline(true);
await page.getByRole('button', { name: 'Add' }).click();
await page.getByRole('menuitem', { name: 'Add note' }).click();
await page.getByLabel('Notes').fill('Offline note');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Note saved').waitFor();
await page.getByText(/Offline: 1 change pending/).first().waitFor({ timeout: 15_000 });
await ctx.setOffline(false);
await page.getByText(/Synced (just now|\d+ min ago)/).first().waitFor({ timeout: 15_000 });
assert.equal(JSON.parse(files.get('torque/data.json').bytes.toString()).records.length, 3, 'offline note reached the cloud');

// Reset the phone, then restore from GitHub.
await page.getByLabel('Type RESET to confirm').fill('RESET');
await page.getByRole('button', { name: 'Reset all data' }).click();
await page.getByRole('button', { name: 'Get started' }).waitFor();
await page.getByRole('button', { name: 'Restore from GitHub' }).click();
await page.getByLabel('GitHub username').fill('me');
await page.getByLabel('Access token').fill(TOKEN);
await page.getByRole('button', { name: 'Restore from GitHub' }).last().click();
await page.getByText('Up next').waitFor({ timeout: 10_000 });
await page.getByRole('link', { name: 'History', exact: true }).click();
await page.locator('.list-row').first().waitFor();
assert.equal(await page.locator('.list-row').count(), 3, 'all records restored');
await page.locator('.list-row', { hasText: 'Engine oil and filter' }).click();
await page.locator('.sheet .photo-small img').waitFor({ timeout: 10_000 }); // photo downloaded on demand
await page.getByRole('button', { name: 'Close' }).click();

// A deletion made now stays deleted for good.
await page.locator('.list-row', { hasText: 'Note' }).first().click();
await page.getByRole('button', { name: 'Delete' }).click();
const del = Date.now() + 15_000;
let deleted = false;
while (!deleted && Date.now() < del) {
  deleted = JSON.parse(files.get('torque/data.json').bytes.toString()).records.some((r) => r.deletedAt);
  if (!deleted) await page.waitForTimeout(250);
}
assert(deleted, 'tombstone pushed');

// The token appears nowhere a user could export it, and never in the console.
assert(!allLogs.some((l) => l.includes(TOKEN)), 'token not logged');
await page.getByRole('link', { name: 'Settings', exact: true }).click();
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
const text = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
assert(!text.includes(TOKEN), 'token not in backup export');

assert.deepEqual(errors, [], `console errors: ${errors.join('; ')}`);
await browser.close();
console.log('sync ok');
