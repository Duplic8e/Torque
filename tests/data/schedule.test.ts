import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createRepo } from '../../src/data/repo';
import { CURRENT_SEED_VERSION, planScheduleUpgrade, upgradeItemId } from '../../src/data/schedule-upgrade';
import { TorqueDB } from '../../src/data/schema';
import { seedItems, toVehicleUnits } from '../../src/data/seed-cx5-turbo';
import type { ServiceItem } from '../../src/data/types';
import { computeDue } from '../../src/engine/due';
import { input, reading } from '../helpers';

const byKey = (list: ServiceItem[], key: string) => list.find((i) => i.key === key)!;

describe('Mazda Canada Schedule 2 seed', () => {
  const km = seedItems('v', 'now', 'km');

  it('uses the Canadian intervals in km', () => {
    expect(byKey(km, 'oil')).toMatchObject({ intervalMiles: 8000, intervalMonths: 6 });
    expect(byKey(km, 'rotation')).toMatchObject({ intervalMiles: 8000, intervalMonths: 6 });
    expect(byKey(km, 'fluid_levels')).toMatchObject({ kind: 'inspect', intervalMiles: 8000, intervalMonths: 6 });
    expect(byKey(km, 'brakes')).toMatchObject({ kind: 'inspect', intervalMiles: 24000, intervalMonths: 12 });
    expect(byKey(km, 'cabin_filter')).toMatchObject({ intervalMiles: 32000, intervalMonths: 24 });
    expect(byKey(km, 'drive_belts')).toMatchObject({ intervalMiles: 48000, intervalMonths: 36 });
    expect(byKey(km, 'engine_air_filter').intervalMiles).toBe(56000);
    expect(byKey(km, 'spark_plugs').intervalMiles).toBe(64000);
    expect(byKey(km, 'coolant')).toMatchObject({ intervalMiles: 100000, intervalMonths: 60, firstDueMiles: 200000, firstDueMonths: 120 });
  });

  it('has no separate severe values, because Schedule 2 already assumes harsh conditions', () => {
    for (const item of km) {
      expect(item.severeMiles, item.key).toBeUndefined();
      expect(item.severeMonths, item.key).toBeUndefined();
    }
  });

  it('converts to tidy miles for a vehicle set to miles', () => {
    const mi = seedItems('v', 'now', 'mi');
    expect(byKey(mi, 'oil').intervalMiles).toBe(5000);
    expect(byKey(mi, 'spark_plugs').intervalMiles).toBe(40000);
    expect(byKey(mi, 'engine_air_filter').intervalMiles).toBe(35000);
    expect(byKey(mi, 'oil').intervalMonths).toBe(6); // months never change
    expect(toVehicleUnits(undefined, 'mi')).toBeUndefined();
  });
});

describe('coolant on a new car', () => {
  it('first change is due at 200,000 km or 10 years, then every 100,000 km or 5 years', () => {
    const items = seedItems('vehicle-1', 'now', 'km').map((i) => ({ ...i, vehicleId: 'vehicle-1', baseline: { date: '2023-10-01', odometer: 20, source: 'purchase' as const } }));
    const fresh = computeDue(input({ today: '2026-10-26', items, readings: [reading('2026-10-26', 45_000)] })).items.find((i) => i.key === 'coolant')!;
    expect(fresh.dueMiles).toBe(200_000);
    expect(fresh.dueDate).toBe('2033-10-01');

    const afterService = items.map((i) => (i.key === 'coolant' ? { ...i, baseline: { date: '2033-09-01', odometer: 150_000, source: 'entered' as const } } : i));
    const later = computeDue(input({ today: '2033-09-02', items: afterService, readings: [reading('2033-09-02', 150_010)] })).items.find((i) => i.key === 'coolant')!;
    expect(later.dueMiles).toBe(250_000);
    expect(later.dueDate).toBe('2038-09-01');
  });
});

/** Items exactly as the version 1 seed stored them (US-style values, whatever the vehicle's units). */
function legacyItems(vehicleId: string): ServiceItem[] {
  const rows: [string, string, ServiceItem['category'], ServiceItem['kind'], Partial<ServiceItem>][] = [
    ['oil', 'Engine oil and filter', 'Oil', 'replace', { intervalMiles: 7500, intervalMonths: 12, severeMiles: 5000, severeMonths: 6 }],
    ['rotation', 'Tire rotation', 'Tires', 'replace', { intervalMiles: 7500, intervalMonths: 12, severeMiles: 5000, severeMonths: 6 }],
    ['spark_plugs', 'Spark plugs (2.5T)', 'Ignition', 'replace', { intervalMiles: 40000, severeMiles: 40000 }],
    ['brakes', 'Brakes (pads, rotors, lines)', 'Brakes', 'inspect', { intervalMiles: 15000, intervalMonths: 12, severeMiles: 7500, severeMonths: 6 }],
    ['coolant', 'Engine coolant', 'Fluids', 'replace', { intervalMiles: 120000, intervalMonths: 120, severeMiles: 120000, severeMonths: 120, firstDueMiles: 120000 }],
  ];
  return rows.map(([key, name, category, kind, fields], i) => ({ id: `old-${key}`, vehicleId, key, name, category, kind, ...fields, enabled: true, isCustom: false, sortOrder: i, updatedAt: '2026-01-01T00:00:00Z' }));
}

describe('planScheduleUpgrade', () => {
  it('moves untouched defaults to Mazda Canada values, keeps edited items, adds missing ones', () => {
    const items = legacyItems('v1');
    items[1] = { ...items[1]!, intervalMiles: 6000 }; // owner edited tire rotation
    const custom: ServiceItem = { id: 'c', vehicleId: 'v1', key: 'custom_x', name: 'Ceramic coating', category: 'Other', kind: 'replace', intervalMonths: 6, enabled: true, isCustom: true, sortOrder: 99, updatedAt: 'x' };
    const plan = planScheduleUpgrade([...items, custom], { id: 'v1', units: 'km' });

    const oil = plan.updates.find((u) => u.id === 'old-oil')!.patch;
    expect(oil).toMatchObject({ intervalMiles: 8000, intervalMonths: 6, severeMiles: undefined, severeMonths: undefined });
    expect(plan.updates.some((u) => u.id === 'old-rotation')).toBe(false);
    expect(plan.kept).toEqual(['Tire rotation']);
    expect(plan.updates.some((u) => u.id === 'c')).toBe(false);
    const added = plan.additions.find((a) => a.key === 'fluid_levels')!;
    expect(added.id).toBe(upgradeItemId('v1', 'fluid_levels')); // same id on every device
  });

  it('converts to miles for a vehicle set to miles', () => {
    const plan = planScheduleUpgrade(legacyItems('v1'), { id: 'v1', units: 'mi' });
    expect(plan.updates.find((u) => u.id === 'old-oil')!.patch.intervalMiles).toBe(5000);
  });
});

describe('repo.upgradeSchedule', () => {
  let n = 0;
  it('upgrades once, clears the old severe values, and asks for a schedule review', async () => {
    const db = new TorqueDB(`torque-sched-${++n}`);
    const repo = createRepo(db);
    const v = await repo.createVehicle({ nickname: 'CX-5', year: 2023, units: 'km', drivingStyle: 'normal' });
    // Simulate an install made before this change: version 1 items and settings.
    await db.items.clear();
    await db.items.bulkPut(legacyItems(v.id));
    await repo.updateSettings({ seedVersion: undefined, scheduleReviewed: true });

    expect(await repo.upgradeSchedule(v.id)).toEqual([]);
    const oil = (await repo.listItems(v.id)).find((i) => i.key === 'oil')!;
    expect(oil.intervalMiles).toBe(8000);
    expect(oil.intervalMonths).toBe(6);
    expect('severeMiles' in oil && oil.severeMiles !== undefined).toBe(false);
    const settings = await repo.getSettings();
    expect(settings.seedVersion).toBe(CURRENT_SEED_VERSION);
    expect(settings.scheduleReviewed).toBe(false);
    expect((await repo.listItems(v.id)).map((i) => i.key)).toContain('fluid_levels');

    expect(await repo.upgradeSchedule(v.id)).toBeNull(); // already done
  });

  it('does nothing for a vehicle created on the new schedule', async () => {
    const repo = createRepo(new TorqueDB(`torque-sched-${++n}`));
    const v = await repo.createVehicle({ nickname: 'CX-5', year: 2023, units: 'km', drivingStyle: 'normal' });
    expect(await repo.upgradeSchedule(v.id)).toBeNull();
  });
});
