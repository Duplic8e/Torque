import { CURRENT_SCHEMA_VERSION } from './migrations';
import type { Dump } from './repo';
import type { Attachment } from './types';
import type { ExportFile } from '../engine/backup';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function dumpToExport(dump: Dump, exportedAt: string): Promise<ExportFile> {
  const attachments = await Promise.all(
    dump.attachments.map(async ({ blob, ...meta }) => ({ ...meta, base64: await blobToBase64(blob) })),
  );
  return {
    app: 'torque',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    vehicles: dump.vehicles,
    items: dump.items,
    records: dump.records,
    odometer: dump.odometer,
    settings: dump.settings ?? null,
    attachments,
  };
}

export function exportToDump(file: ExportFile): Dump {
  const attachments: Attachment[] = file.attachments.map(({ base64, ...meta }) => ({ ...meta, blob: base64ToBlob(base64, meta.mime) }));
  return {
    vehicles: file.vehicles,
    items: file.items,
    records: file.records,
    odometer: file.odometer,
    attachments,
    settings: file.settings ?? undefined,
  };
}
