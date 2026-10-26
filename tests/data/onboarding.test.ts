import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { runOnboarding } from '../../src/data/onboarding';
import { createRepo } from '../../src/data/repo';
import { TorqueDB } from '../../src/data/schema';

let n = 0;
const fresh = () => createRepo(new TorqueDB(`torque-onb-${++n}`));
const vehicle = { nickname: 'CX-5', year: 2023, units: 'mi' as const, drivingStyle: 'normal' as const };

describe('runOnboarding', () => {
  it('maps the three answers to baselines', async () => {
    const repo = fresh();
    const v = await runOnboarding(
      repo,
      {
        vehicle,
        odometer: 30_000,
        services: {
          oil: { mode: 'entered', date: '2026-08-01', odometer: 28_000 },
          rotation: { mode: 'never' },
          cabin_filter: { mode: 'unsure' },
        },
        purchaseDate: '2024-01-01',
        purchaseOdometer: 100,
      },
      '2026-10-26',
    );
    const items = await repo.listItems(v.id);
    const by = (k: string) => items.find((i) => i.key === k)!;
    expect(by('oil').baseline).toEqual({ date: '2026-08-01', odometer: 28_000, source: 'entered' });
    expect(by('rotation').baseline).toEqual({ date: '2024-01-01', odometer: 100, source: 'purchase' });
    expect(by('cabin_filter').baseline).toBeUndefined();

    const due = (await repo.computeForVehicle(v.id, '2026-10-26'))!;
    const get = (k: string) => due.items.find((i) => i.key === k)!;
    expect(get('oil').dueMiles).toBe(33_000); // 28,000 + 5,000 mi (Mazda Canada's 8,000 km)
    expect(get('cabin_filter').unknownBaseline).toBe(true);
    expect(get('cabin_filter').status).toBe('soon');
  });

  it('records the current odometer and a purchase reading for the pace estimate', async () => {
    const repo = fresh();
    const v = await runOnboarding(repo, { vehicle, odometer: 12_000, services: { oil: { mode: 'never' } }, purchaseDate: '2025-10-26', purchaseOdometer: 0 }, '2026-10-26');
    expect(await repo.listReadings(v.id)).toHaveLength(2);
    const due = (await repo.computeForVehicle(v.id, '2026-10-26'))!;
    expect(due.mileage.miles).toBe(12_000);
    expect(due.mileage.ratePerDay).toBeCloseTo(12_000 / 365, 1);
  });

  it('with no "never" answers, ignores purchase details', async () => {
    const repo = fresh();
    const v = await runOnboarding(repo, { vehicle, odometer: 5000, services: {} }, '2026-10-26');
    expect(v.purchaseDate).toBeUndefined();
    expect(await repo.listReadings(v.id)).toHaveLength(1);
  });
});
