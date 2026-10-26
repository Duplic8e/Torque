import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from '../data/migrations';
import type { Dump } from '../data/repo';
import { attachmentFileSchema, odometerReadingSchema, serviceItemSchema, serviceRecordSchema, settingsSchema, vehicleSchema } from '../data/schema';
import { SyncError, type SyncPayload } from './types';

const payloadSchema = z.object({
  app: z.literal('torque'),
  schemaVersion: z.number().int(),
  syncedAt: z.string(),
  vehicles: z.array(vehicleSchema),
  items: z.array(serviceItemSchema),
  records: z.array(serviceRecordSchema),
  odometer: z.array(odometerReadingSchema),
  settings: settingsSchema.nullable(),
  attachments: z.array(attachmentFileSchema.omit({ base64: true })),
});

export function parsePayload(raw: unknown): SyncPayload {
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > CURRENT_SCHEMA_VERSION) {
    throw new SyncError('newer_schema', 'The cloud data was written by a newer version of Torque. Update the app.');
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw new SyncError('other', 'The cloud data is damaged or not Torque data.');
  return parsed.data;
}

export function dumpToPayload(dump: Dump, syncedAt: string): SyncPayload {
  return {
    app: 'torque',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    syncedAt,
    vehicles: dump.vehicles,
    items: dump.items,
    records: dump.records,
    odometer: dump.odometer,
    settings: dump.settings ?? null,
    attachments: dump.attachments.map(({ blob: _blob, ...meta }) => meta),
  };
}

/** Remote photos arrive without bytes; they download when first viewed. */
export function payloadToDump(payload: SyncPayload): Dump {
  return {
    vehicles: payload.vehicles,
    items: payload.items,
    records: payload.records,
    odometer: payload.odometer,
    attachments: payload.attachments,
    settings: payload.settings ?? undefined,
  };
}

/** Stable text for comparing two payloads: rows sorted by id, the sync timestamp ignored. */
export function canonicalize(p: SyncPayload): string {
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const sortKeys = (_k: string, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v;
  return JSON.stringify(
    { ...p, syncedAt: '', vehicles: byId(p.vehicles), items: byId(p.items), records: byId(p.records), odometer: byId(p.odometer), attachments: byId(p.attachments) },
    sortKeys,
  );
}
