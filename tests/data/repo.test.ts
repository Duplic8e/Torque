import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRepo, OdometerRegressionError, type Repo } from '../../src/data/repo';
import { TorqueDB, serviceItemSchema, vehicleSchema } from '../../src/data/schema';
import { CX5_TURBO_SEED } from '../../src/data/seed-cx5-turbo';

let repo: Repo;
let vehicleId: string;
let n = 0;

beforeEach(async () => {
  repo = createRepo(new TorqueDB(`torque-test-${++n}`));
  vehicleId = (await repo.createVehicle({ nickname: 'CX-5', year: 2023, units: 'mi', drivingStyle: 'normal' })).id;
});

describe('repo', () => {
  it('seeds the schedule and default settings, and the rows pass schema validation', async () => {
    const items = await repo.listItems(vehicleId);
    expect(items).toHaveLength(CX5_TURBO_SEED.length);
    for (const i of items) expect(serviceItemSchema.safeParse(i).success).toBe(true);
    const v = await repo.getVehicle();
    expect(vehicleSchema.safeParse(v).success).toBe(true);
    expect((await repo.getSettings()).dueSoonDays).toBe(30);
  });

  it('refuses an odometer lower than the last reading unless confirmed as a correction', async () => {
    await repo.addReading(vehicleId, '2026-10-01', 50_000);
    await expect(repo.addReading(vehicleId, '2026-10-10', 49_000)).rejects.toBeInstanceOf(OdometerRegressionError);
    expect(await repo.listReadings(vehicleId)).toHaveLength(1);

    const fixed = await repo.addReading(vehicleId, '2026-10-10', 49_000, { allowCorrection: true });
    expect(fixed.isCorrection).toBe(true);
    expect(await repo.listReadings(vehicleId)).toHaveLength(2);
  });

  it('applies the same odometer check to service records', async () => {
    await repo.addReading(vehicleId, '2026-10-01', 50_000);
    await expect(
      repo.addRecord({ vehicleId, date: '2026-10-10', odometer: 40_000, itemKeys: ['oil'] }),
    ).rejects.toBeInstanceOf(OdometerRegressionError);
  });

  it('delete is a tombstone, hides the record, recalculates, and can be undone', async () => {
    const [oil] = (await repo.listItems(vehicleId)).filter((i) => i.key === 'oil');
    await repo.setBaseline(oil!.id, { date: '2025-06-01', odometer: 38_000, source: 'entered' });
    const rec = await repo.addRecord({ vehicleId, date: '2026-01-10', odometer: 45_000, itemKeys: ['oil'] });

    const dueMiles = async () => (await repo.computeForVehicle(vehicleId, '2026-02-01'))!.items.find((i) => i.key === 'oil')!.dueMiles;
    expect(await dueMiles()).toBe(52_500);

    await repo.deleteRecord(rec.id);
    expect(await repo.listRecords(vehicleId)).toHaveLength(0);
    expect(await dueMiles()).toBe(45_500);

    await repo.restoreRecord(rec.id);
    expect(await dueMiles()).toBe(52_500);
  });

  it('counts records since backup', async () => {
    await repo.addRecord({ vehicleId, date: '2026-01-10', odometer: 45_000, itemKeys: ['oil'] });
    await repo.addRecord({ vehicleId, date: '2026-02-10', odometer: 46_000, itemKeys: ['rotation'] });
    expect((await repo.getSettings()).recordsSinceBackup).toBe(2);
  });

  it('switching to Severe recalculates immediately', async () => {
    await repo.addRecord({ vehicleId, date: '2026-01-10', odometer: 45_000, itemKeys: ['oil'] });
    const oil = async () => (await repo.computeForVehicle(vehicleId, '2026-02-01'))!.items.find((i) => i.key === 'oil')!;
    expect((await oil()).dueMiles).toBe(52_500);
    await repo.updateVehicle(vehicleId, { drivingStyle: 'severe' });
    expect((await oil()).dueMiles).toBe(50_000);
  });

  it('adds custom items with a unique key', async () => {
    const item = await repo.addCustomItem(vehicleId, { name: 'Ceramic coating top-up', category: 'Other', intervalMonths: 6 });
    expect(item.isCustom).toBe(true);
    expect(item.key).toMatch(/^custom_/);
    expect(await repo.listItems(vehicleId)).toHaveLength(CX5_TURBO_SEED.length + 1);
  });
});

describe('backup round trip', () => {
  it('export, reset, import restores identical live counts', async () => {
    const { dumpToExport, exportToDump } = await import('../../src/data/backup-io');
    const { parseExport, countsOf } = await import('../../src/engine/backup');
    await repo.addReading(vehicleId, '2026-10-01', 50_000);
    const a = await repo.addRecord({ vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'], totalCost: 80 });
    const b = await repo.addRecord({ vehicleId, date: '2026-10-03', odometer: 50_200, itemKeys: ['rotation'] });
    await repo.deleteRecord(b.id);

    const file = await dumpToExport(await repo.dumpAll(), '2026-10-26T00:00:00Z');
    const reparsed = parseExport(JSON.parse(JSON.stringify(file)));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(countsOf(reparsed.file)).toEqual({ vehicles: 1, records: 1, readings: 1, photos: 0 });

    await repo.resetAll();
    expect(await repo.getVehicle()).toBeUndefined();
    await repo.replaceAll(exportToDump(reparsed.file));
    expect((await repo.listRecords(vehicleId)).map((r) => r.id)).toEqual([a.id]);
    expect(await repo.listReadings(vehicleId)).toHaveLength(1);
    expect(await repo.listItems(vehicleId)).toHaveLength(CX5_TURBO_SEED.length);
  });

  it('merge keeps a deletion made on this device', async () => {
    const rec = await repo.addRecord({ vehicleId, date: '2026-10-02', odometer: 50_100, itemKeys: ['oil'] });
    const before = await repo.dumpAll(); // record still live
    await repo.deleteRecord(rec.id);
    await repo.mergeAll(before);
    expect(await repo.listRecords(vehicleId)).toHaveLength(0);
  });
});
