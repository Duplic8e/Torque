import { describe, expect, it } from 'vitest';
import { backupNeeded, countsOf, mergeRows, parseExport, recordsToCsv } from '../../src/engine/backup';
import { items, record } from '../helpers';

const minimal = { app: 'torque', schemaVersion: 1, exportedAt: '2026-10-26T00:00:00Z', vehicles: [], items: [], records: [], odometer: [], settings: null, attachments: [] };

describe('parseExport', () => {
  it('accepts a valid file', () => {
    const r = parseExport(minimal);
    expect(r.ok).toBe(true);
  });
  it('refuses other apps, newer versions and damaged files', () => {
    expect(parseExport({ ...minimal, app: 'other' })).toMatchObject({ ok: false });
    expect(parseExport('nope')).toMatchObject({ ok: false });
    expect(parseExport({ ...minimal, schemaVersion: 99 })).toMatchObject({ ok: false, error: expect.stringContaining('newer') });
    expect(parseExport({ ...minimal, records: [{ id: 1 }] })).toMatchObject({ ok: false, error: expect.stringContaining('damaged') });
  });
  it('counts only live rows', () => {
    const r = record('2026-01-01', 1, ['oil']);
    expect(countsOf({ vehicles: [], odometer: [], attachments: [], records: [r, { ...r, id: 'x', deletedAt: 'd' }] }).records).toBe(1);
  });
});

describe('mergeRows', () => {
  const row = (id: string, updatedAt: string, v = '') => ({ id, updatedAt, v });
  it('newest wins, ties keep local, new rows are added', () => {
    const out = mergeRows([row('a', '2', 'local'), row('b', '5', 'local')], [row('a', '3', 'remote'), row('b', '5', 'remote'), row('c', '1', 'remote')]);
    expect(Object.fromEntries(out.map((r) => [r.id, r.v]))).toEqual({ a: 'remote', b: 'local', c: 'remote' });
  });
  it('a newer tombstone beats an older live row, so deletes stay deleted', () => {
    const out = mergeRows([{ id: 'a', updatedAt: '1' }], [{ id: 'a', updatedAt: '2', deletedAt: '2' } as { id: string; updatedAt: string }]);
    expect(out[0]).toMatchObject({ deletedAt: '2' });
  });
});

describe('recordsToCsv', () => {
  it('escapes cells and lists services by name', () => {
    const csv = recordsToCsv([record('2026-01-01', 100, ['oil'], { shop: 'A, "B"', totalCost: 50, notes: 'line1\nline2' })], items(), 'mi');
    expect(csv.split('\r\n')[0]).toBe('Date,Odometer (mi),Services,Cost,Shop,DIY,Parts,Notes');
    expect(csv).toContain('2026-01-01,100,Engine oil and filter,50,"A, ""B""",no,,"line1\nline2"');
  });
});

describe('backupNeeded', () => {
  const s = (over = {}) => ({ lastBackupAt: '2026-10-01T00:00:00Z', recordsSinceBackup: 0, ...over });
  it('triggers after 30 days or 5 records', () => {
    expect(backupNeeded(s(), '2026-01-01', '2026-10-20')).toBe(false);
    expect(backupNeeded(s(), '2026-01-01', '2026-10-31')).toBe(true);
    expect(backupNeeded(s({ recordsSinceBackup: 5 }), '2026-01-01', '2026-10-02')).toBe(true);
  });
  it('counts from vehicle creation when never backed up', () => {
    expect(backupNeeded(s({ lastBackupAt: undefined }), '2026-09-01T00:00:00Z', '2026-10-26')).toBe(true);
  });
});
