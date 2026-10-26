import { describe, expect, it } from 'vitest';
import { GitHubProvider } from '../../src/sync/github';
import { dumpToPayload } from '../../src/sync/payload';
import { SyncError } from '../../src/sync/types';
import { FakeGitHub } from './fake-github';

const cfg = (gh: FakeGitHub, over = {}) => ({ owner: 'me', repo: 'torque-data', token: gh.token, ...over });
const emptyPayload = () => dumpToPayload({ vehicles: [], items: [], records: [], odometer: [], attachments: [], settings: undefined }, '2026-10-26T00:00:00Z');
const kind = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof SyncError ? e.kind : 'not-a-sync-error'; }
  return 'no-error';
};

describe('GitHubProvider', () => {
  it('sends the token only as a Bearer header and reports repo privacy', async () => {
    const gh = new FakeGitHub();
    expect(await new GitHubProvider(cfg(gh), gh.fetch).test()).toEqual({ isPrivate: true });
    gh.isPrivate = false;
    expect(await new GitHubProvider(cfg(gh), gh.fetch).test()).toEqual({ isPrivate: false });
    for (const r of gh.requests) {
      expect(r.headers.Authorization).toBe(`Bearer ${gh.token}`);
      expect(r.url).not.toContain(gh.token);
    }
  });

  it('maps failures to error kinds', async () => {
    const gh = new FakeGitHub();
    expect(await kind(new GitHubProvider(cfg(gh, { token: 'wrong' }), gh.fetch).test())).toBe('auth');
    expect(await kind(new GitHubProvider(cfg(gh, { repo: 'nope' }), gh.fetch).test())).toBe('not_found');
    gh.forceStatus = 403;
    expect(await kind(new GitHubProvider(cfg(gh), gh.fetch).test())).toBe('auth');
    gh.forceStatus = 500;
    expect(await kind(new GitHubProvider(cfg(gh), gh.fetch).test())).toBe('other');
    gh.forceStatus = null;
    gh.online = false;
    expect(await kind(new GitHubProvider(cfg(gh), gh.fetch).test())).toBe('network');
  });

  it('pull reports an empty repo, then reads the file raw after reading its sha', async () => {
    const gh = new FakeGitHub();
    const p = new GitHubProvider(cfg(gh), gh.fetch);
    expect(await p.pull()).toEqual({ sha: null, payload: null });

    await p.push(emptyPayload(), null, 'first');
    gh.requests.length = 0;
    const snap = await p.pull();
    expect(snap.sha).toBe('sha-1');
    expect(snap.payload?.app).toBe('torque');
    expect(gh.requests.map((r) => r.url.split('/contents/')[1])).toEqual(['torque', 'torque/data.json']); // sha first, then content
    expect(gh.requests[1]!.headers.Accept).toBe('application/vnd.github.raw+json'); // raw, so >1 MB files load
  });

  it('push needs the current sha: a stale or missing sha is a conflict', async () => {
    const gh = new FakeGitHub();
    const p = new GitHubProvider(cfg(gh), gh.fetch);
    await p.push(emptyPayload(), null, 'create');
    expect(await kind(p.push(emptyPayload(), 'stale-sha', 'x'))).toBe('conflict'); // 409
    expect(await kind(p.push(emptyPayload(), null, 'x'))).toBe('conflict'); // 422
    await p.push(emptyPayload(), 'sha-1', 'ok');
    expect(gh.commits.map((c) => c.message)).toEqual(['create', 'ok']);
  });

  it('writes non-ASCII text intact', async () => {
    const gh = new FakeGitHub();
    const p = new GitHubProvider(cfg(gh), gh.fetch);
    const payload = emptyPayload();
    payload.settings = { id: 'settings', dueSoonMiles: 1, dueSoonDays: 1, calendarAlertTime: '09:00', calendarDaysBefore: 1, recordsSinceBackup: 0, schemaVersion: 1, updatedAt: 'café ✓ 日本' };
    await p.push(payload, null, 'unicode');
    expect((await p.pull()).payload?.settings?.updatedAt).toBe('café ✓ 日本');
  });

  it('rejects damaged or newer-schema data', async () => {
    const gh = new FakeGitHub();
    const p = new GitHubProvider(cfg(gh), gh.fetch);
    gh.write('torque/data.json', new TextEncoder().encode('{"app":"other"}'));
    expect(await kind(p.pull())).toBe('other');
    gh.write('torque/data.json', new TextEncoder().encode(JSON.stringify({ ...emptyPayload(), schemaVersion: 99 })));
    expect(await kind(p.pull())).toBe('newer_schema');
  });
});
