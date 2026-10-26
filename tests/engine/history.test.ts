import { describe, expect, it } from 'vitest';
import { filterRecords, groupByMonth, NO_FILTER, recordYears } from '../../src/engine/history';
import { items, record } from '../helpers';

const recs = [
  record('2026-10-05', 30_000, ['oil'], { shop: 'Fast Lube', notes: 'used 0W-20' }),
  record('2026-10-20', 30_500, ['rotation'], { diy: true, parts: 'torque wrench' }),
  record('2025-06-01', 20_000, ['cabin_filter'], { shop: 'Mazda Dealer' }),
];
const f = (over: Partial<typeof NO_FILTER>) => filterRecords(recs, items(), { ...NO_FILTER, ...over }).map((r) => r.odometer);

describe('history', () => {
  it('searches services, shop, notes and parts', () => {
    expect(f({ query: 'oil' })).toEqual([30_000]);
    expect(f({ query: 'fast lube' })).toEqual([30_000]);
    expect(f({ query: '0w-20' })).toEqual([30_000]);
    expect(f({ query: 'wrench' })).toEqual([30_500]);
    expect(f({ query: 'oil dealer' })).toEqual([]);
  });
  it('filters by category, year and DIY vs shop', () => {
    expect(f({ category: 'Filters' })).toEqual([20_000]);
    expect(f({ year: 2025 })).toEqual([20_000]);
    expect(f({ who: 'diy' })).toEqual([30_500]);
    expect(f({ who: 'shop' })).toEqual([30_000, 20_000]);
  });
  it('hides deleted records', () => {
    const deleted = [{ ...recs[0]!, deletedAt: 'x' }];
    expect(filterRecords(deleted, items(), NO_FILTER)).toEqual([]);
  });
  it('groups newest month first and lists years', () => {
    const groups = groupByMonth(recs);
    expect(groups.map((g) => g.month)).toEqual(['2026-10', '2025-06']);
    expect(groups[0]!.records.map((r) => r.odometer)).toEqual([30_500, 30_000]);
    expect(recordYears(recs)).toEqual([2026, 2025]);
  });
});
