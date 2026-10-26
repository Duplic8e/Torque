import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dumpToExport } from '../../src/data/backup-io';
import { createRepo } from '../../src/data/repo';
import { TorqueDB } from '../../src/data/schema';
import { GitHubProvider } from '../../src/sync/github';
import { SyncManager } from '../../src/sync/manager';
import { describeSync } from '../../src/sync/status';
import { SyncError, type SyncPayload } from '../../src/sync/types';
import { FakeGitHub } from './fake-github';

let n = 0;
const devices: SyncManager[] = [];
afterEach(() => {
  devices.splice(0).forEach((m) => m.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function device(gh: FakeGitHub, debounceMs = 5000) {
  const db = new TorqueDB(`torque-sync-${++n}`);
  const repo = createRepo(db);
  const mgr = new SyncManager({ db, repo, makeProvider: (c) => new GitHubProvider(c, gh.fetch), debounceMs, isOnline: () => gh.online });
  devices.push(mgr);
  return { db, repo, mgr };
}
const config = (gh: FakeGitHub) => ({ owner: 'me', repo: 'torque-data', token: gh.token });
const DATA = 'torque/data.json';
const vehicleInput = { nickname: 'CX-5', year: 2023, units: 'mi' as const, drivingStyle: 'normal' as const };

async function seededDevice(gh: FakeGitHub) {
  const d = device(gh);
  await d.mgr.start();
  const v = await d.repo.createVehicle(vehicleInput);
  await d.mgr.connect(config(gh));
  return { ...d, vehicleId: v.id };
}

describe('connecting', () => {
  it('refuses a public repository', async () => {
    const gh = new FakeGitHub();
    gh.isPrivate = false;
    const d = device(gh);
    await d.mgr.start();
    await expect(d.mgr.connect(config(gh))).rejects.toMatchObject({ kind: 'public_repo' });
    expect(d.mgr.getConfig()).toBeNull();
  });

  it('refuses a repo that already has data unless told to merge', async () => {
    const gh = new FakeGitHub();
    await seededDevice(gh);
    const other = device(gh);
    await other.mgr.start();
    await expect(other.mgr.connect(config(gh))).rejects.toMatchObject({ kind: 'has_data' });
    await other.mgr.connect(config(gh), { allowExistingData: true });
    expect(other.mgr.getConfig()).not.toBeNull();
  });

  it('reports a bad token and a missing repo', async () => {
    const gh = new FakeGitHub();
    const d = device(gh);
    await d.mgr.start();
    await expect(d.mgr.connect({ ...config(gh), token: 'bad' })).rejects.toMatchObject({ kind: 'auth' });
    await expect(d.mgr.connect({ ...config(gh), repo: 'missing' })).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('syncing', () => {
  it('pushes local data as one commit named after the sync time', async () => {
    const gh = new FakeGitHub();
    await seededDevice(gh);
    const payload = gh.json<SyncPayload>(DATA);
    expect(payload.vehicles).toHaveLength(1);
    expect(payload.items.length).toBeGreaterThan(5);
    expect(gh.commits).toHaveLength(1);
    expect(gh.commits[0]!.message).toMatch(/^Sync from iPhone · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('a second device restores everything, and later edits flow both ways', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    const rec = await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'], totalCost: 80 });
    await a.mgr.syncNow();

    const b = device(gh);
    await b.mgr.start();
    await b.mgr.restore(config(gh));
    expect((await b.repo.listRecords(a.vehicleId)).map((r) => r.id)).toEqual([rec.id]);
    expect(await b.repo.getVehicle()).toBeDefined();

    await b.repo.updateRecord(rec.id, { totalCost: 95 });
    await b.mgr.syncNow();
    await a.mgr.syncNow();
    expect((await a.repo.listRecords(a.vehicleId))[0]!.totalCost).toBe(95);
  });

  it('the newest edit wins when both devices changed the same record', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    const rec = await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    await a.mgr.syncNow();
    const b = device(gh);
    await b.mgr.start();
    await b.mgr.restore(config(gh));

    await a.repo.updateRecord(rec.id, { notes: 'from A' });
    await new Promise((r) => setTimeout(r, 5));
    await b.repo.updateRecord(rec.id, { notes: 'from B' });
    await b.mgr.syncNow();
    await a.mgr.syncNow();
    expect((await a.repo.listRecords(a.vehicleId))[0]!.notes).toBe('from B');
    await b.mgr.syncNow();
    expect((await b.repo.listRecords(a.vehicleId))[0]!.notes).toBe('from B');
  });

  it('a deleted record stays deleted after a pull', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    const rec = await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    await a.mgr.syncNow();
    const b = device(gh);
    await b.mgr.start();
    await b.mgr.restore(config(gh));

    await a.repo.deleteRecord(rec.id);
    await a.mgr.syncNow();
    await b.mgr.syncNow(); // b still held the live copy
    expect(await b.repo.listRecords(a.vehicleId)).toHaveLength(0);
    await a.mgr.syncNow();
    expect(await a.repo.listRecords(a.vehicleId)).toHaveLength(0);
    expect(gh.json<SyncPayload>(DATA).records.find((r) => r.id === rec.id)?.deletedAt).toBeTruthy();
  });

  it('does not write when nothing changed', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    const before = gh.commits.length;
    await a.mgr.syncNow();
    await a.mgr.syncNow();
    expect(gh.commits.length).toBe(before);
  });

  it('retries on a 409 by refetching and merging, keeping both devices changes', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    const b = device(gh);
    await b.mgr.start();
    await b.mgr.restore(config(gh));
    const bRec = await b.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-03', odometer: 51_000, itemKeys: ['rotation'] });

    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    // Device B's change lands in the cloud between A's read and A's write.
    let interfered = false;
    gh.beforePut = (path) => {
      if (path !== DATA || interfered) return;
      interfered = true;
      const payload = gh.json<SyncPayload>(DATA);
      payload.records.push(JSON.parse(JSON.stringify(bRec)));
      gh.write(DATA, new TextEncoder().encode(JSON.stringify(payload)), 'B wrote first');
    };
    await a.mgr.syncNow();

    expect(interfered).toBe(true);
    expect(a.mgr.getSnapshot().state.lastError).toBeUndefined();
    const ids = gh.json<SyncPayload>(DATA).records.map((r) => r.itemKeys[0]).sort();
    expect(ids).toEqual(['oil', 'rotation']);
    expect(a.mgr.getSnapshot().state.pending).toBe(0);
  });

  it('gives up after 3 conflict retries and keeps the changes pending', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    let puts = 0;
    gh.beforePut = (path) => {
      if (path !== DATA) return;
      puts++;
      gh.write(DATA, gh.files.get(DATA)!.bytes, 'someone else'); // changes the sha every time
    };
    await a.mgr.syncNow();
    expect(puts).toBe(4); // first try plus 3 retries
    expect(a.mgr.getSnapshot().state.lastError?.kind).toBe('conflict');
    expect(a.mgr.getSnapshot().state.pending).toBeGreaterThan(0);
  });
});

describe('failures and offline', () => {
  it('a 401 is reported as an expired token and offers a fix', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    gh.forceStatus = 401;
    await a.mgr.syncNow();
    const { state } = a.mgr.getSnapshot();
    expect(state.lastError?.kind).toBe('auth');
    expect(state.pending).toBeGreaterThan(0);
    const d = describeSync(state, false, new Date());
    expect(d.label).toBe('Sync failed: token expired or not allowed');
    expect(d.tone).toBe('error');
    expect(d.needsFix).toBe(true);
  });

  it('queues changes while offline and pushes them when the network returns', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    gh.online = false;
    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-03', odometer: 50_200, itemKeys: ['rotation'] });
    await a.mgr.syncNow();
    let { state } = a.mgr.getSnapshot();
    expect(state.lastError?.kind).toBe('network');
    expect(state.pending).toBeGreaterThanOrEqual(2);
    expect(describeSync(state, false, new Date()).label).toMatch(/^Offline: \d+ changes pending$/);
    expect(gh.json<SyncPayload>(DATA).records).toHaveLength(0);

    gh.online = true; // the browser's `online` event calls syncNow
    await a.mgr.syncNow();
    ({ state } = a.mgr.getSnapshot());
    expect(state.lastError).toBeUndefined();
    expect(state.pending).toBe(0);
    expect(gh.json<SyncPayload>(DATA).records).toHaveLength(2);
  });

  it('pending changes survive a restart', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    gh.online = false;
    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    await a.mgr.syncNow();
    await new Promise((r) => setTimeout(r, 10));

    const restarted = new SyncManager({ db: a.db, repo: a.repo, makeProvider: (c) => new GitHubProvider(c, gh.fetch), isOnline: () => gh.online });
    devices.push(restarted);
    await restarted.start();
    expect(restarted.getSnapshot().state.pending).toBeGreaterThan(0);
    gh.online = true;
    await restarted.syncNow();
    expect(gh.json<SyncPayload>(DATA).records).toHaveLength(1);
  });

  it('shows the banner only after 24 hours of failing', () => {
    const t0 = new Date('2026-10-26T00:00:00Z');
    const state = { pending: 1, firstFailureAt: t0.toISOString(), lastError: { kind: 'network' as const, message: 'x', at: t0.toISOString() } };
    expect(describeSync(state, false, new Date(t0.getTime() + 23 * 3_600_000)).banner).toBe(false);
    expect(describeSync(state, false, new Date(t0.getTime() + 24 * 3_600_000)).banner).toBe(true);
    expect(describeSync({ pending: 0, lastSyncedAt: new Date(t0.getTime() - 120_000).toISOString() }, false, t0).label).toBe('Synced 2 min ago');
  });
});

describe('debounce', () => {
  it('waits 5 seconds after a change, and folds several changes into one sync', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    const base = gh.commits.length;

    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    await vi.advanceTimersByTimeAsync(3000);
    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-03', odometer: 50_200, itemKeys: ['rotation'] });
    await vi.advanceTimersByTimeAsync(4999);
    expect(gh.commits.length).toBe(base); // 3s + 4.999s: the second change restarted the timer
    await vi.advanceTimersByTimeAsync(2);
    await vi.waitFor(() => expect(gh.commits.length).toBe(base + 1));
    expect(gh.json<SyncPayload>(DATA).records).toHaveLength(2);
  });
});

describe('photos', () => {
  it('uploads each photo once and a second device downloads it on demand', async () => {
    vi.stubGlobal('Blob', NodeBlob); // jsdom's Blob cannot be structured-cloned into fake-indexeddb
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    const rec = await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    const att = await a.repo.addAttachment(rec.id, new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }));
    await a.mgr.syncNow();
    await a.mgr.syncNow();
    const photoPath = `torque/attachments/${att.id}.jpg`;
    expect(gh.files.has(photoPath)).toBe(true);
    expect(gh.commits.filter((c) => c.path === photoPath)).toHaveLength(1);
    expect(gh.json<SyncPayload>(DATA).attachments).toHaveLength(1);
    expect(gh.text(DATA)).not.toContain('base64'); // photo bytes are not inside data.json

    const b = device(gh);
    await b.mgr.start();
    await b.mgr.restore(config(gh));
    expect((await b.repo.getAttachments([att.id]))[0]!.blob).toBeUndefined();
    const [loaded] = await b.mgr.loadPhotoBlobs([att.id]);
    expect(new Uint8Array(await loaded!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect((await b.repo.getAttachments([att.id]))[0]!.blob).toBeDefined(); // cached for next time
  });
});

describe('token safety', () => {
  it('never appears in the cloud data, a backup export, or the console', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    await a.repo.addRecord({ vehicleId: a.vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    await a.mgr.syncNow();
    gh.forceStatus = 401;
    await a.mgr.syncNow();
    gh.forceStatus = 500;
    await a.mgr.syncNow();
    gh.online = false;
    await a.mgr.syncNow();

    for (const [path, file] of gh.files) expect(new TextDecoder().decode(file.bytes), path).not.toContain(gh.token);
    expect(JSON.stringify(await dumpToExport(await a.repo.dumpAll(), 'now'))).not.toContain(gh.token);
    expect(JSON.stringify(a.mgr.getSnapshot())).not.toContain(gh.token);
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(gh.token);
    for (const r of gh.requests) expect(r.url).not.toContain(gh.token);
    expect(new SyncError('auth', 'x').message).not.toContain(gh.token);
  });

  it('is kept in the device-local store, wiped by disconnect and by reset', async () => {
    const gh = new FakeGitHub();
    const a = await seededDevice(gh);
    expect(JSON.stringify(await a.db.kv.toArray())).toContain(gh.token);
    await a.mgr.disconnect();
    expect(await a.db.kv.count()).toBe(0);

    // The reset flow disconnects first so the running manager cannot write its state back.
    await a.mgr.connect(config(gh), { allowExistingData: true });
    expect(await a.db.kv.count()).toBeGreaterThan(0);
    await a.mgr.disconnect();
    await a.repo.resetAll();
    await new Promise((r) => setTimeout(r, 20));
    expect(await a.db.kv.count()).toBe(0);

    // And resetAll itself erases anything left in the device-local store.
    await a.db.kv.put({ key: 'sync.config', value: config(gh) });
    await a.repo.resetAll();
    expect(await a.db.kv.count()).toBe(0);
  });
});
