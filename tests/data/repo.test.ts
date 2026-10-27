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

    // Seeded oil interval is Mazda Canada's 8,000 km, which is 5,000 mi for this vehicle set to miles.
    const dueMiles = async () => (await repo.computeForVehicle(vehicleId, '2026-02-01'))!.items.find((i) => i.key === 'oil')!.dueMiles;
    expect(await dueMiles()).toBe(50_000);

    await repo.deleteRecord(rec.id);
    expect(await repo.listRecords(vehicleId)).toHaveLength(0);
    expect(await dueMiles()).toBe(43_000);

    await repo.restoreRecord(rec.id);
    expect(await dueMiles()).toBe(50_000);
  });

  it('counts records since backup', async () => {
    await repo.addRecord({ vehicleId, date: '2026-01-10', odometer: 45_000, itemKeys: ['oil'] });
    await repo.addRecord({ vehicleId, date: '2026-02-10', odometer: 46_000, itemKeys: ['rotation'] });
    expect((await repo.getSettings()).recordsSinceBackup).toBe(2);
  });

  it('switching to Severe recalculates immediately', async () => {
    await repo.addRecord({ vehicleId, date: '2026-01-10', odometer: 45_000, itemKeys: ['oil'] });
    const oil = async () => (await repo.computeForVehicle(vehicleId, '2026-02-01'))!.items.find((i) => i.key === 'oil')!;
    // Schedule 2 has no separate severe values, so give oil one to switch to.
    const oilItem = (await repo.listItems(vehicleId)).find((i) => i.key === 'oil')!;
    await repo.updateItem(oilItem.id, { severeMiles: 3000 });
    expect((await oil()).dueMiles).toBe(50_000);
    await repo.updateVehicle(vehicleId, { drivingStyle: 'severe' });
    expect((await oil()).dueMiles).toBe(48_000);
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

describe('convertUnits', () => {
  it('converts every stored distance from miles to km and keeps due dates consistent', async () => {
    // vehicle from beforeEach is in miles
    await repo.updateVehicle(vehicleId, { purchaseOdometer: 10 });
    await repo.addReading(vehicleId, '2026-10-01', 30_000);
    await repo.addRecord({ vehicleId, date: '2026-09-01', odometer: 29_000, itemKeys: ['oil'] });
    const oilItem = (await repo.listItems(vehicleId)).find((i) => i.key === 'oil')!;
    expect(oilItem.intervalMiles).toBe(5000);

    await repo.convertUnits(vehicleId, 'km');

    expect((await repo.getVehicle())!.units).toBe('km');
    expect((await repo.getVehicle())!.purchaseOdometer).toBe(16);
    expect((await repo.listReadings(vehicleId))[0]!.value).toBe(48_280);
    expect((await repo.listRecords(vehicleId))[0]!.odometer).toBe(46_671);
    const oil = (await repo.listItems(vehicleId)).find((i) => i.key === 'oil')!;
    expect(oil.intervalMiles).toBe(8000); // 5,000 mi -> 8,047 km -> tidy 8,000
    expect((await repo.getSettings()).dueSoonMiles).toBe(800);
    const due = (await repo.computeForVehicle(vehicleId, '2026-10-01'))!.items.find((i) => i.key === 'oil')!;
    expect(due.dueMiles).toBe(46_671 + 8000);
  });

  it('is a no-op when the units already match', async () => {
    await repo.addReading(vehicleId, '2026-10-01', 30_000);
    await repo.convertUnits(vehicleId, 'mi');
    expect((await repo.listReadings(vehicleId))[0]!.value).toBe(30_000);
  });
});

describe('seasonal tires', () => {
  it('creates one swap item with a stable id, turns it off and on, and the row passes validation', async () => {
    await repo.setSeasonalTires(vehicleId, { winterOn: '11-01', summerOn: '05-01', mounted: 'summer' });
    let swap = (await repo.listItems(vehicleId)).filter((i) => i.key === 'tire_swap');
    expect(swap).toHaveLength(1);
    expect(swap[0]!.id).toBe(`${vehicleId}:tire_swap`);
    expect(serviceItemSchema.safeParse(swap[0]).success).toBe(true);

    await repo.setSeasonalTires(vehicleId, null);
    expect((await repo.listItems(vehicleId)).find((i) => i.key === 'tire_swap')?.enabled).toBe(false);

    await repo.setSeasonalTires(vehicleId, { winterOn: '12-01', summerOn: '04-15', mounted: 'winter' });
    swap = (await repo.listItems(vehicleId)).filter((i) => i.key === 'tire_swap');
    expect(swap).toHaveLength(1);
    expect(swap[0]).toMatchObject({ enabled: true, seasonal: { winterOn: '12-01', mounted: 'winter' } });
  });

  it('rejects malformed month-day values', () => {
    const bad = { id: 'x', vehicleId, key: 'tire_swap', name: 'x', category: 'Tires', kind: 'replace', enabled: true, isCustom: false, sortOrder: 0, updatedAt: 'now', seasonal: { winterOn: '13-01', summerOn: '05-01', mounted: 'winter' } };
    expect(serviceItemSchema.safeParse(bad).success).toBe(false);
  });
});
