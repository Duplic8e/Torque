import { z } from 'zod';
import { daysBetween } from '../core/dates';
import { CURRENT_SCHEMA_VERSION, migrateExport } from '../data/migrations';
import {
  attachmentFileSchema,
  odometerReadingSchema,
  serviceItemSchema,
  serviceRecordSchema,
  settingsSchema,
  vehicleSchema,
} from '../data/schema';
import type { ISODate, ServiceItem, ServiceRecord, Settings, Vehicle } from '../data/types';

const exportSchema = z.object({
  app: z.literal('torque'),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  vehicles: z.array(vehicleSchema),
  items: z.array(serviceItemSchema),
  records: z.array(serviceRecordSchema),
  odometer: z.array(odometerReadingSchema),
  settings: settingsSchema.nullable(),
  attachments: z.array(attachmentFileSchema),
});

export type ExportFile = z.infer<typeof exportSchema>;

export type ParseResult = { ok: true; file: ExportFile } | { ok: false; error: string };

/**
 * Validates a backup. Refuses other apps and newer schema versions, migrates older ones.
 * The token and any sync settings are never part of the file, so nothing secret can arrive here.
 */
export function parseExport(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== 'torque') {
    return { ok: false, error: 'This is not a Torque backup file.' };
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number') return { ok: false, error: 'The backup has no schema version.' };
  if (version > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Torque. Update the app first.' };
  }
  const parsed = exportSchema.safeParse(migrateExport(raw as { schemaVersion: number }));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The backup is damaged (${issue?.path.join('.') ?? 'unknown'}: ${issue?.message ?? 'invalid'}).` };
  }
  return { ok: true, file: parsed.data };
}

export interface BackupCounts {
  vehicles: number;
  records: number;
  readings: number;
  photos: number;
}

/** Counts rows that are not deleted. */
export function countsOf(file: Pick<ExportFile, 'vehicles' | 'records' | 'odometer' | 'attachments'>): BackupCounts {
  const live = (rows: { deletedAt?: string }[]) => rows.filter((r) => !r.deletedAt).length;
  return { vehicles: live(file.vehicles), records: live(file.records), readings: live(file.odometer), photos: live(file.attachments) };
}

/** Merge by id; the newest `updatedAt` wins and ties keep the local row. Tombstones win like any other row. */
export function mergeRows<T extends { id: string; updatedAt: string }>(local: readonly T[], remote: readonly T[]): T[] {
  const byId = new Map(local.map((r) => [r.id, r]));
  for (const r of remote) {
    const mine = byId.get(r.id);
    if (!mine || r.updatedAt > mine.updatedAt) byId.set(r.id, r);
  }
  return [...byId.values()];
}

export function mergeSettings(local: Settings | undefined, remote: Settings | null | undefined): Settings | undefined {
  if (!local) return remote ?? undefined;
  if (!remote) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}

export const backupFileName = (date: ISODate) => `torque-backup-${date}.json`;
export const csvFileName = (date: ISODate) => `torque-history-${date}.csv`;

const csvCell = (v: string | number | undefined): string => {
  const s = v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function recordsToCsv(records: readonly ServiceRecord[], items: readonly ServiceItem[], units: Vehicle['units']): string {
  const header = ['Date', `Odometer (${units})`, 'Services', 'Cost', 'Shop', 'DIY', 'Parts', 'Notes'];
  const nameOf = (k: string) => items.find((i) => i.key === k)?.name ?? k;
  const rows = records
    .filter((r) => !r.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer)
    .map((r) => [
      r.date,
      r.odometer,
      r.itemKeys.map(nameOf).join('; '),
      r.totalCost ?? (r.itemCosts ? Object.values(r.itemCosts).reduce((a, b) => a + b, 0) : undefined),
      r.shop,
      r.diy ? 'yes' : 'no',
      r.parts,
      r.notes,
    ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const BACKUP_AFTER_DAYS = 30;
export const BACKUP_AFTER_RECORDS = 5;

/** Without cloud sync, nudge after 30 days or 5 new records since the last export. */
export function backupNeeded(settings: Pick<Settings, 'lastBackupAt' | 'recordsSinceBackup'>, vehicleCreatedAt: string, today: ISODate): boolean {
  const since = (settings.lastBackupAt ?? vehicleCreatedAt).slice(0, 10);
  return daysBetween(since, today) >= BACKUP_AFTER_DAYS || settings.recordsSinceBackup >= BACKUP_AFTER_RECORDS;
}
