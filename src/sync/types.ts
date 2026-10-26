import type { Attachment, OdometerReading, ServiceItem, ServiceRecord, Settings, Vehicle } from '../data/types';

export interface SyncConfig {
  owner: string;
  repo: string;
  token: string;
}

export type AttachmentMeta = Omit<Attachment, 'blob'>;

/** The shape of `torque/data.json` in the data repo. Photos live in separate files. */
export interface SyncPayload {
  app: 'torque';
  schemaVersion: number;
  syncedAt: string;
  vehicles: Vehicle[];
  items: ServiceItem[];
  records: ServiceRecord[];
  odometer: OdometerReading[];
  settings: Settings | null;
  attachments: AttachmentMeta[];
}

export type SyncErrorKind =
  | 'auth' // 401/403: token expired, revoked or lacking permission
  | 'not_found' // repo missing or token cannot see it
  | 'conflict' // the file changed under us (409/422)
  | 'network'
  | 'public_repo' // refusing to sync personal data to a public repo
  | 'has_data' // connecting to a repo that already holds Torque data
  | 'no_data' // restoring from a repo with no Torque data
  | 'newer_schema'
  | 'other';

export class SyncError extends Error {
  constructor(readonly kind: SyncErrorKind, message: string, readonly status?: number) {
    super(message);
    this.name = 'SyncError';
  }
}

export interface RemoteSnapshot {
  /** Blob sha of data.json, needed to update it. Null when the file does not exist yet. */
  sha: string | null;
  payload: SyncPayload | null;
}

/** Everything the app needs from a sync backend; GitHub is the only implementation. */
export interface SyncProvider {
  test(): Promise<{ isPrivate: boolean }>;
  pull(): Promise<RemoteSnapshot>;
  push(payload: SyncPayload, sha: string | null, message: string): Promise<void>;
  putAttachment(id: string, blob: Blob): Promise<void>;
  getAttachment(id: string): Promise<Blob | null>;
}

export interface SyncState {
  /** Changes made on this device that have not reached the remote yet. */
  pending: number;
  lastSyncedAt?: string;
  lastError?: { kind: SyncErrorKind; message: string; at: string };
  /** When the current run of failures began; cleared by the next success. */
  firstFailureAt?: string;
}
