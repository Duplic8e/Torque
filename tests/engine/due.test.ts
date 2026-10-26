import { describe, expect, it } from 'vitest';
import { computeDue, type DueResult } from '../../src/engine/due';
import { input, items, reading, record, withBaselines } from '../helpers';

const find = (r: DueResult, key: string) => r.items.find((i) => i.key === key)!;

describe('acceptance: due engine', () => {
  it('oil at 45,000 mi on 2026-01-10 (7,500 mi / 12 mo) is due at 52,500 mi or 2027-01-10', () => {
    const r = computeDue(input({ today: '2026-02-01', records: [record('2026-01-10', 45_000, ['oil'])] }));
    expect(find(r, 'oil').dueMiles).toBe(52_500);
    expect(find(r, 'oil').dueDate).toBe('2027-01-10');
  });

  it('50 mi/day with 600 mi left projects ~12 days out and is Due soon', () => {
    const r = computeDue(
      input({
        today: '2026-10-26',
        records: [record('2026-04-01', 44_400, ['oil'])], // due at 51,900 mi
        readings: [reading('2026-10-22', 51_100), reading('2026-10-24', 51_200), reading('2026-10-26', 51_300)],
      }),
    );
    const oil = find(r, 'oil');
    expect(r.mileage.ratePerDay).toBeCloseTo(50);
    expect(oil.milesLeft).toBe(600);
    expect(oil.projectedDate).toBe('2026-11-07');
    expect(oil.status).toBe('soon'); // 600 mi is outside the 500 mi threshold; the 12-day projection triggers it
    expect(oil.drivenBy).toBe('miles');
  });

  it('switching to Severe shortens oil to 5,000 mi / 6 mo', () => {
    const base = input({ today: '2026-02-01', records: [record('2026-01-10', 45_000, ['oil'])] });
    const normal = find(computeDue(base), 'oil');
    const severe = find(computeDue({ ...base, vehicle: { drivingStyle: 'severe' } }), 'oil');
    expect(normal.dueMiles).toBe(52_500);
    expect(severe.dueMiles).toBe(50_000);
    expect(severe.dueDate).toBe('2026-07-10');
  });

  it('one visit with Oil + Rotation + Cabin filter resets all three', () => {
    const list = withBaselines(items(), '2024-01-01', 0);
    const before = computeDue(input({ today: '2026-06-01', items: list, readings: [reading('2026-06-01', 40_000)] }));
    for (const k of ['oil', 'rotation', 'cabin_filter']) expect(find(before, k).status).toBe('overdue');

    const after = computeDue(
      input({
        today: '2026-06-01',
        items: list,
        readings: [reading('2026-06-01', 40_000)],
        records: [record('2026-06-01', 40_000, ['oil', 'rotation', 'cabin_filter'])],
      }),
    );
    for (const k of ['oil', 'rotation', 'cabin_filter']) {
      expect(find(after, k).status).toBe('ok');
      expect(find(after, k).lastDone?.source).toBe('record');
    }
    expect(find(after, 'spark_plugs').status).toBe('overdue'); // untouched items stay put
  });

  it('deleting the latest oil record falls back to the previous one', () => {
    const older = record('2025-06-01', 38_000, ['oil']);
    const latest = record('2026-01-10', 45_000, ['oil']);
    const run = (records: typeof older[]) => find(computeDue(input({ today: '2026-02-01', records })), 'oil');
    expect(run([older, latest]).dueMiles).toBe(52_500);
    expect(run([older, { ...latest, deletedAt: '2026-02-01T00:00:00Z' }]).dueMiles).toBe(45_500);
  });

  it('a record logged out of order does not override a newer one', () => {
    const r = computeDue(
      input({ today: '2026-02-01', records: [record('2026-01-10', 45_000, ['oil']), record('2024-01-10', 20_000, ['oil'])] }),
    );
    expect(find(r, 'oil').dueMiles).toBe(52_500);
  });

  it('estimate never drops below the last real reading', () => {
    const r = computeDue(input({ today: '2026-10-26', readings: [reading('2026-10-01', 5000), reading('2026-10-10', 4900)] }));
    expect(r.mileage.miles).toBeGreaterThanOrEqual(4900);
  });
});

describe('due engine rules', () => {
  it('"Not sure" items are due now and flagged amber', () => {
    const r = computeDue(input({ today: '2026-06-01', readings: [reading('2026-06-01', 40_000)] }));
    const oil = find(r, 'oil');
    expect(oil.status).toBe('soon');
    expect(oil.unknownBaseline).toBe(true);
    expect(oil.projectedDate).toBe('2026-06-01');
  });

  it('a new car uses firstDueMiles for coolant instead of baseline + interval', () => {
    const list = items().map((i) => ({ ...i, baseline: { date: '2026-01-01', odometer: 500, source: 'purchase' as const } }));
    const r = computeDue(input({ today: '2026-06-01', items: list, readings: [reading('2026-06-01', 3000)] }));
    expect(find(r, 'coolant').dueMiles).toBe(120_000);
    expect(find(r, 'oil').dueMiles).toBe(8000);
  });

  it('is overdue when either miles or months run out', () => {
    const byTime = computeDue(input({ today: '2027-01-11', records: [record('2026-01-10', 45_000, ['oil'])], readings: [reading('2027-01-11', 46_000)] }));
    const byMiles = computeDue(input({ today: '2026-03-01', records: [record('2026-01-10', 45_000, ['oil'])], readings: [reading('2026-03-01', 52_600)] }));
    expect(find(byTime, 'oil').status).toBe('overdue');
    expect(find(byMiles, 'oil').status).toBe('overdue');
  });

  it('inspect items never go red', () => {
    const list = withBaselines(items(), '2020-01-01', 1000);
    const r = computeDue(input({ today: '2026-06-01', items: list, readings: [reading('2026-06-01', 90_000)] }));
    expect(find(r, 'brakes').status).toBe('inspect');
    expect(find(r, 'brakes').milesLeft).toBeLessThan(0);
  });

  it('skips disabled items', () => {
    const list = items().map((i) => (i.key === 'wipers' ? { ...i, enabled: false } : i));
    expect(computeDue(input({ today: '2026-06-01', items: list })).items.some((i) => i.key === 'wipers')).toBe(false);
  });

  it('sorts overdue before due soon before ok before inspect', () => {
    const list = withBaselines(items(), '2026-05-01', 39_000);
    const r = computeDue(input({ today: '2026-06-01', items: list, readings: [reading('2026-06-01', 40_000)], records: [record('2024-01-01', 20_000, ['oil'])] }));
    const order = ['overdue', 'soon', 'ok', 'inspect'];
    const ranks = r.items.map((i) => order.indexOf(i.status));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(r.items[0]!.key).toBe('oil');
  });

  it('clamps progress to 1.2', () => {
    const r = computeDue(input({ today: '2030-01-01', records: [record('2026-01-10', 45_000, ['oil'])], readings: [reading('2030-01-01', 90_000)] }));
    expect(find(r, 'oil').progress).toBe(1.2);
  });
});

describe('health score', () => {
  it('is 100 with nothing due, -10 per due soon, -25 per overdue, floor 0', () => {
    const fine = withBaselines(items(), '2026-06-01', 40_000);
    const ok = computeDue(input({ today: '2026-06-01', items: fine, readings: [reading('2026-06-01', 40_000)] }));
    expect(ok.health).toBe(100);

    const unknown = computeDue(input({ today: '2026-06-01', readings: [reading('2026-06-01', 40_000)] }));
    const soon = unknown.items.filter((i) => i.status === 'soon').length;
    expect(unknown.health).toBe(Math.max(0, 100 - 10 * soon));

    const late = withBaselines(items(), '2015-01-01', 0);
    const bad = computeDue(input({ today: '2026-06-01', items: late, readings: [reading('2026-06-01', 200_000)] }));
    expect(bad.items.filter((i) => i.status === 'overdue').length).toBeGreaterThan(3);
    expect(bad.health).toBe(0);
  });
});
