import { useSyncExternalStore } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { getDb, getRepo } from '../data/repo';
import { GitHubProvider } from './github';
import { SyncManager } from './manager';
import { describeSync, type SyncDescription } from './status';

let manager: SyncManager | undefined;

/** The app-wide sync manager. */
export function getSync(): SyncManager {
  return (manager ??= new SyncManager({ db: getDb(), repo: getRepo(), makeProvider: (c) => new GitHubProvider(c) }));
}

export function useSyncStatus(): { configured: boolean; description: SyncDescription | null; lastSyncedAt?: string } {
  const sync = getSync();
  const snap = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const [, tick] = useState(0);
  // "Synced 2 min ago" must keep counting while nothing else changes.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return {
    configured: snap.configured,
    description: snap.configured ? describeSync(snap.state, snap.syncing, new Date()) : null,
    lastSyncedAt: snap.state.lastSyncedAt,
  };
}
