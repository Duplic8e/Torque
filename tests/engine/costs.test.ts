import { describe, expect, it } from 'vitest';
import { computeCosts } from '../../src/engine/costs';
import { items, record } from '../helpers';

const range = { first: 10_000, last: 30_000 };
const run = (records: ReturnType<typeof record>[], today = '2026-10-26') =>
  computeCosts({ records, items: items(), today, odometerRange: range });

describe('computeCosts', () => {
  it('totals this year, last 12 months and lifetime', () => {
    const r = run([
      record('2026-03-01', 20_000, ['oil'], { totalCost: 100 }),
      record('2025-12-01', 18_000, ['oil'], { totalCost: 50 }),
      record('2025-09-01', 15_000, ['oil'], { totalCost: 25 }), // outside 12 months
    ]);
    expect(r.thisYear).toBe(100);
    expect(r.last12Months).toBe(150);
    expect(r.lifetime).toBe(175);
  });

  it('cost per mile is lifetime spend over miles driven', () => {
    expect(run([record('2026-03-01', 20_000, ['oil'], { totalCost: 200 })]).costPerMile).toBeCloseTo(0.01);
    expect(run([]).costPerMile).toBeNull();
    expect(computeCosts({ records: [record('2026-03-01', 1, ['oil'], { totalCost: 5 })], items: items(), today: '2026-10-26', odometerRange: null }).costPerMile).toBeNull();
  });

  it('buckets twelve months ending with the current one', () => {
    const r = run([record('2026-10-05', 29_000, ['oil'], { totalCost: 80 }), record('2025-11-20', 12_000, ['oil'], { totalCost: 40 })]);
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly[0]).toEqual({ month: '2025-11', total: 40 });
    expect(r.monthly[11]).toEqual({ month: '2026-10', total: 80 });
  });

  it('splits a visit evenly across its services when there are no per-item costs', () => {
    const r = run([record('2026-03-01', 20_000, ['oil', 'rotation'], { totalCost: 100 })]);
    const get = (c: string) => r.byCategory.find((x) => x.category === c)!.total;
    expect(get('Oil')).toBe(50);
    expect(get('Tires')).toBe(50);
  });

  it('uses per-item costs and puts any remainder in Other', () => {
    const r = run([record('2026-03-01', 20_000, ['oil', 'cabin_filter'], { totalCost: 120, itemCosts: { oil: 70, cabin_filter: 30 } })]);
    const get = (c: string) => r.byCategory.find((x) => x.category === c)!.total;
    expect(get('Oil')).toBe(70);
    expect(get('Filters')).toBe(30);
    expect(get('Other')).toBe(20);
  });

  it('files unknown services and note-only costs under Other, and skips deleted records', () => {
    const r = run([
      record('2026-03-01', 20_000, [], { totalCost: 10 }),
      record('2026-04-01', 21_000, ['oil'], { totalCost: 999, deletedAt: '2026-04-02T00:00:00Z' }),
    ]);
    expect(r.lifetime).toBe(10);
    expect(r.byCategory.find((x) => x.category === 'Other')!.total).toBe(10);
  });
});
