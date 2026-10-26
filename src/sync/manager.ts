import type { Repo } from '../data/repo';
import type { TorqueDB } from '../data/schema';
import { dumpToPayload, canonicalize, payloadToDump } from './payload';
import { SyncError, type SyncConfig, type SyncProvider, type SyncState } from './types';

const KEY_CONFIG = 'sync.config';
const KEY_STATE = 'sync.state';
const KEY_UPLOADED = 'sync.uploaded';

const MAX_CONFLICT_RETRIES = 3;
const RETRY_AFTER_FAILURE_MS = 60_000;

export interface SyncSnapshot {
  configured: boolean;
  syncing: boolean;
  state: SyncState;
}

export interface SyncDeps {
  db: TorqueDB;
  repo: Repo;
  makeProvider: (config: SyncConfig) => SyncProvider;
  debounceMs?: number;
  now?: () => Date;
  isOnline?: () => boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Keeps this device and the private data repo in step: merge by id (newest `updatedAt` wins),
 * then write the merged file back. Local data lives in IndexedDB, so "queued offline changes" are simply the
 * pending count; the next successful sync pushes everything that differs.
 */
export class SyncManager {
  private config: SyncConfig | null = null;
  private state: SyncState = { pending: 0 };
  private syncing = false;
  private running: Promise<void> | null = null;
  private rerun = false;
  private applyingRemote = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private hooked = false;
  private readonly listeners = new Set<() => void>();
  private readonly counted = new WeakSet<object>();
  private snapshot: SyncSnapshot = { configured: false, syncing: false, state: { pending: 0 } };

  constructor(private readonly deps: SyncDeps) {}

  private get debounceMs() { return this.deps.debounceMs ?? 5000; }
  private now() { return this.deps.now?.() ?? new Date(); }
  private online() { return this.deps.isOnline?.() ?? (typeof navigator === 'undefined' || navigator.onLine !== false); }

  // ---- observable status ----

  getSnapshot = (): SyncSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish() {
    this.snapshot = { configured: this.config !== null, syncing: this.syncing, state: this.state };
    this.listeners.forEach((l) => l());
  }

  private async persistState() {
    if (!this.config) return; // disconnected or reset: never write state back
    await this.deps.db.kv.put({ key: KEY_STATE, value: this.state });
  }

  // ---- lifecycle ----

  /** Loads saved config, starts watching for changes, and syncs once on launch. */
  async start(): Promise<void> {
    const { db } = this.deps;
    this.config = ((await db.kv.get(KEY_CONFIG))?.value as SyncConfig | undefined) ?? null;
    this.state = ((await db.kv.get(KEY_STATE))?.value as SyncState | undefined) ?? { pending: 0 };
    this.installHooks();
    this.publish();
    if (this.config) void this.syncNow();
  }

  /** Browser triggers: coming back to the app, and the network returning. */
  attachBrowserListeners(): () => void {
    const onVisible = () => document.visibilityState === 'visible' && void this.syncNow();
    const onOnline = () => void this.syncNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }

  private installHooks() {
    if (this.hooked) return;
    this.hooked = true;
    const { db } = this.deps;
    const touch = (_a: unknown, _b: unknown, _c: unknown, trans?: object) => {
      // One user action writes several rows in one transaction: count it once.
      if (this.applyingRemote || !this.config) return;
      if (trans) {
        if (this.counted.has(trans)) return;
        this.counted.add(trans);
      }
      this.markChanged();
    };
    for (const table of [db.vehicles, db.items, db.records, db.odometer, db.attachments, db.settings]) {
      table.hook('creating', (pk, obj, trans) => void touch(pk, obj, null, trans));
      table.hook('updating', (mods, pk, obj, trans) => void touch(mods, pk, obj, trans));
      table.hook('deleting', (pk, obj, trans) => void touch(pk, obj, null, trans));
    }
  }

  private markChanged() {
    this.state = { ...this.state, pending: this.state.pending + 1 };
    this.publish();
    // Hooks run inside the writer's transaction, so persist and schedule outside of it.
    setTimeout(() => void this.persistState(), 0);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.syncNow(), this.debounceMs);
  }

  // ---- connecting ----

  private async checkRepo(config: SyncConfig): Promise<SyncProvider> {
    const provider = this.deps.makeProvider(config);
    const { isPrivate } = await provider.test();
    if (!isPrivate) {
      throw new SyncError('public_repo', 'That repository is public. Use a private repository so your data stays private.');
    }
    return provider;
  }

  /** Checks the token and repo without saving anything, and says whether the repo already holds Torque data. */
  async inspect(config: SyncConfig): Promise<{ hasData: boolean }> {
    const provider = await this.checkRepo(config);
    return { hasData: (await provider.pull()).payload !== null };
  }

  /** Saves the config and starts syncing. Refuses a repo that already has data unless `allowExistingData`. */
  async connect(config: SyncConfig, opts: { allowExistingData?: boolean } = {}): Promise<void> {
    const provider = await this.checkRepo(config);
    if (!opts.allowExistingData && (await provider.pull()).payload) {
      throw new SyncError('has_data', 'That repository already has Torque data. Restore from it instead.');
    }
    await this.save(config);
    await this.syncNow(); // never throws: failures land in the status
  }

  /** Replaces local data with what is in the repo (new or reset phone). */
  async restore(config: SyncConfig): Promise<void> {
    const provider = await this.checkRepo(config);
    const { payload } = await provider.pull();
    if (!payload) throw new SyncError('no_data', 'No Torque data was found in that repository.');
    this.applyingRemote = true;
    try {
      await this.deps.repo.replaceAll(payloadToDump(payload));
    } finally {
      this.applyingRemote = false;
    }
    await this.save(config, { pending: 0, lastSyncedAt: this.now().toISOString() });
  }

  private async save(config: SyncConfig, state: SyncState = { pending: 1 }) {
    this.config = config;
    this.state = state;
    await this.deps.db.kv.bulkPut([
      { key: KEY_CONFIG, value: config },
      { key: KEY_STATE, value: state },
    ]);
    this.publish();
  }

  async disconnect(): Promise<void> {
    clearTimeout(this.debounceTimer);
    clearTimeout(this.retryTimer);
    this.config = null;
    this.state = { pending: 0 };
    await this.deps.db.kv.bulkDelete([KEY_CONFIG, KEY_STATE, KEY_UPLOADED]);
    this.publish();
  }

  /** Stops timers; for tests and teardown. */
  dispose(): void {
    clearTimeout(this.debounceTimer);
    clearTimeout(this.retryTimer);
  }

  getConfig(): SyncConfig | null {
    return this.config;
  }

  // ---- the sync cycle ----

  /**
   * Runs a sync. A call made while one is running is folded into one follow-up run, and the returned
   * promise resolves only after that follow-up, so awaiting it always means "up to date as of this call".
   */
  syncNow(): Promise<void> {
    if (!this.config) return Promise.resolve();
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rerun = false;
          await this.run();
        } while (this.rerun && this.config);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async run(): Promise<void> {
    const config = this.config;
    if (!config) return;
    clearTimeout(this.debounceTimer);
    clearTimeout(this.retryTimer);
    const pendingAtStart = this.state.pending;
    this.syncing = true;
    this.publish();
    try {
      if (!this.online()) throw new SyncError('network', 'Offline.');
      await this.cycle(this.deps.makeProvider(config));
      this.state = {
        pending: Math.max(0, this.state.pending - pendingAtStart),
        lastSyncedAt: this.now().toISOString(),
      };
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError('other', 'Sync failed unexpectedly.');
      const at = this.now().toISOString();
      this.state = { ...this.state, lastError: { kind: err.kind, message: err.message, at }, firstFailureAt: this.state.firstFailureAt ?? at };
      // Network blips and server errors are worth retrying; a bad token or repo needs the user.
      if (err.kind === 'network' || err.kind === 'other' || err.kind === 'conflict') {
        this.retryTimer = setTimeout(() => void this.syncNow(), RETRY_AFTER_FAILURE_MS);
      }
    } finally {
      this.syncing = false;
      await this.persistState();
      this.publish();
    }
  }

  private async cycle(provider: SyncProvider): Promise<void> {
    const { repo } = this.deps;
    for (let attempt = 0; ; attempt++) {
      const remote = await provider.pull();
      if (remote.payload) {
        this.applyingRemote = true;
        try {
          await repo.mergeAll(payloadToDump(remote.payload));
        } finally {
          this.applyingRemote = false;
        }
      }
      const merged = await repo.dumpAll();
      await this.uploadPhotos(provider, merged.attachments);

      const payload = dumpToPayload(merged, this.now().toISOString());
      if (remote.payload && canonicalize(payload) === canonicalize(remote.payload)) return; // nothing to push

      try {
        await provider.push(payload, remote.sha, `Sync from iPhone · ${stamp(this.now())}`);
        return;
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'conflict' && attempt < MAX_CONFLICT_RETRIES) continue;
        throw e;
      }
    }
  }

  /** Photos upload once each, before the data file points at them. */
  private async uploadPhotos(provider: SyncProvider, attachments: { id: string; blob?: Blob; deletedAt?: string }[]): Promise<void> {
    const { db } = this.deps;
    const uploaded = new Set((await db.kv.get(KEY_UPLOADED))?.value as string[] | undefined);
    let changed = false;
    for (const a of attachments) {
      if (a.deletedAt || !a.blob || uploaded.has(a.id)) continue;
      await provider.putAttachment(a.id, a.blob);
      uploaded.add(a.id);
      changed = true;
    }
    if (changed) await db.kv.put({ key: KEY_UPLOADED, value: [...uploaded] });
  }

  // ---- photos ----

  /** Photo bytes for these attachments; downloads and stores any that came from another device. */
  async loadPhotoBlobs(ids: readonly string[]): Promise<{ id: string; blob: Blob }[]> {
    const { repo } = this.deps;
    const out: { id: string; blob: Blob }[] = [];
    const provider = this.config ? this.deps.makeProvider(this.config) : null;
    for (const a of await repo.getAttachments(ids)) {
      let blob = a.blob;
      if (!blob && provider) {
        try {
          blob = (await provider.getAttachment(a.id)) ?? undefined;
          if (blob) await repo.setAttachmentBlob(a.id, blob);
        } catch {
          blob = undefined; // offline or denied: the photo just stays unavailable for now
        }
      }
      if (blob) out.push({ id: a.id, blob });
    }
    return out;
  }

  /** Download every photo this device is missing, so an export contains them all. */
  async hydrateAllPhotos(): Promise<void> {
    const dump = await this.deps.repo.dumpAll();
    await this.loadPhotoBlobs(dump.attachments.filter((a) => !a.blob && !a.deletedAt).map((a) => a.id));
  }
}
