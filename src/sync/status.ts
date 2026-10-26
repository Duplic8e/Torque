import type { SyncState } from './types';

const DAY_MS = 86_400_000;

export interface SyncDescription {
  label: string;
  tone: 'ok' | 'pending' | 'error' | 'syncing';
  /** Offer a "Fix" button that opens the sync settings. */
  needsFix: boolean;
  /** Failing for more than 24 hours: show the dashboard banner. */
  banner: boolean;
}

const minutesAgo = (iso: string, now: Date): string => {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

export function describeSync(state: SyncState, syncing: boolean, now: Date): SyncDescription {
  const err = state.lastError;
  const banner = !!state.firstFailureAt && now.getTime() - Date.parse(state.firstFailureAt) >= DAY_MS;
  if (syncing) return { label: 'Syncing…', tone: 'syncing', needsFix: false, banner };
  if (err) {
    const fixable = err.kind === 'auth' || err.kind === 'not_found' || err.kind === 'public_repo';
    if (err.kind === 'network') {
      const n = state.pending;
      return { label: n > 0 ? `Offline: ${n} change${n === 1 ? '' : 's'} pending` : 'Offline', tone: 'pending', needsFix: false, banner };
    }
    const reason = err.kind === 'auth' ? 'token expired or not allowed' : err.message.replace(/\.$/, '').toLowerCase();
    return { label: `Sync failed: ${reason}`, tone: 'error', needsFix: fixable, banner };
  }
  if (state.pending > 0) return { label: `${state.pending} change${state.pending === 1 ? '' : 's'} pending`, tone: 'pending', needsFix: false, banner };
  if (state.lastSyncedAt) return { label: `Synced ${minutesAgo(state.lastSyncedAt, now)}`, tone: 'ok', needsFix: false, banner };
  return { label: 'Not synced yet', tone: 'pending', needsFix: false, banner };
}
