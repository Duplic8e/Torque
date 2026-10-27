import { describe, expect, it } from 'vitest';
import type { SeasonalTires, ServiceItem } from '../../src/data/types';
import { computeDue, intervalUsage } from '../../src/engine/due';
import { nextOccurrence, nextSwap, setMountedBy, TIRE_SWAP_KEY } from '../../src/engine/seasonal';
import { input, record, V } from '../helpers';

const config = (mounted: SeasonalTires['mounted'], over: Partial<SeasonalTires> = {}): SeasonalTires => ({
  winterOn: '11-01',
  summerOn: '05-01',
  mounted,
  ...over,
});

const swapItem = (seasonal: SeasonalTires): ServiceItem => ({
  id: `${V}:${TIRE_SWAP_KEY}`,
  vehicleId: V,
  key: TIRE_SWAP_KEY,
  name: 'Seasonal tire swap',
  category: 'Tires',
  kind: 'replace',
  seasonal,
  enabled: true,
  isCustom: false,
  sortOrder: 99,
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('nextOccurrence', () => {
  it('finds the next date strictly after, rolling into next year', () => {
    expect(nextOccurrence('11-01', '2026-10-27')).toBe('2026-11-01');
    expect(nextOccurrence('11-01', '2026-11-01')).toBe('2027-11-01');
    expect(nextOccurrence('05-01', '2026-11-03')).toBe('2027-05-01');
  });
});

describe('setMountedBy', () => {
  it('reads a swap as the set whose date is nearer', () => {
    expect(setMountedBy('2026-10-15', config('summer'))).toBe('winter');
    expect(setMountedBy('2026-12-10', config('summer'))).toBe('winter');
    expect(setMountedBy('2026-04-20', config('summer'))).toBe('summer');
    expect(setMountedBy('2026-05-25', config('summer'))).toBe('summer');
    // Quebec-style dates: a mid-October swap is still the winter set.
    expect(setMountedBy('2026-10-15', config('summer', { winterOn: '12-01', summerOn: '04-15' }))).toBe('winter');
  });
});

describe('nextSwap without a logged swap', () => {
  it('summers on in late October: winters are due Nov 1', () => {
    const s = nextSwap(config('summer'), null, '2026-10-27');
    expect(s).toMatchObject({ mounted: 'summer', next: 'winter', dueDate: '2026-11-01', since: '2026-05-01', fromRecord: false });
  });

  it('summers still on in late November: the winter swap is overdue, not a year away', () => {
    expect(nextSwap(config('summer'), null, '2026-11-20').dueDate).toBe('2026-11-01');
  });

  it('winters already on in late October count as early, so summers are due next May', () => {
    expect(nextSwap(config('winter'), null, '2026-10-27')).toMatchObject({ next: 'summer', dueDate: '2027-05-01', since: '2026-11-01' });
  });

  it('winters still on in July: the summer swap is overdue', () => {
    expect(nextSwap(config('winter'), null, '2026-07-10').dueDate).toBe('2026-05-01');
  });
});

describe('nextSwap with a logged swap', () => {
  it('the logged date decides the set and the clock', () => {
    expect(nextSwap(config('summer'), { date: '2026-10-20' }, '2026-10-27')).toMatchObject({
      mounted: 'winter',
      next: 'summer',
      dueDate: '2027-05-01',
      since: '2026-10-20',
      fromRecord: true,
    });
    expect(nextSwap(config('winter'), { date: '2027-04-25' }, '2027-05-02').dueDate).toBe('2027-11-01');
  });
});

describe('computeDue with the seasonal item', () => {
  it('names the item for the set going on and uses day thresholds', () => {
    const due = computeDue(input({ today: '2026-10-27', items: [swapItem(config('summer'))] }));
    const d = due.items[0]!;
    expect(d).toMatchObject({ name: 'Winter tires on', status: 'soon', daysLeft: 5, dueDate: '2026-11-01', unknownBaseline: false });
    expect(d.seasonal).toEqual({ mounted: 'summer', next: 'winter', since: '2026-05-01' });
    expect(intervalUsage(d, 0, '2026-10-27').time).toEqual({ used: 179, total: 184 });
  });

  it('is overdue after the date and moves on once a swap is logged', () => {
    const late = computeDue(input({ today: '2026-11-10', items: [swapItem(config('summer'))] }));
    expect(late.items[0]!.status).toBe('overdue');
    const done = computeDue(
      input({ today: '2026-11-10', items: [swapItem(config('summer'))], records: [record('2026-11-08', 20_000, [TIRE_SWAP_KEY])] }),
    );
    expect(done.items[0]).toMatchObject({ name: 'Summer tires on', status: 'ok', dueDate: '2027-05-01' });
    expect(done.items[0]!.lastDone?.source).toBe('record');
  });
});
