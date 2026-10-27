import { describe, expect, it } from 'vitest';
import { MAZDA_CANADA_WARRANTY, timeLeftLabel, warrantyStatus } from '../../src/engine/warranty';

describe('warrantyStatus', () => {
  it('counts each coverage from the delivery date', () => {
    const s = warrantyStatus(MAZDA_CANADA_WARRANTY, '2023-03-15', '2026-01-10');
    const by = Object.fromEntries(s.map((c) => [c.key, c]));
    expect(by.comprehensive).toMatchObject({ ends: '2026-03-15', state: 'ending', daysLeft: 64 });
    expect(by.roadside?.ends).toBe('2026-03-15');
    expect(by.powertrain).toMatchObject({ ends: '2028-03-15', state: 'active' });
    expect(by.perforation?.ends).toBe('2030-03-15');
    expect(by.powertrain!.progress).toBeCloseTo(0.565, 2);
  });

  it('marks coverages ended on and after their end date', () => {
    const s = warrantyStatus(MAZDA_CANADA_WARRANTY, '2023-03-15', '2026-03-15');
    expect(s.find((c) => c.key === 'comprehensive')).toMatchObject({ state: 'ended', daysLeft: 0, progress: 1 });
  });
});

describe('timeLeftLabel', () => {
  it('reads in years and months, then days near the end', () => {
    expect(timeLeftLabel('2026-01-10', '2028-03-15')).toBe('2 years 2 months left');
    expect(timeLeftLabel('2026-01-10', '2027-01-10')).toBe('1 year left');
    expect(timeLeftLabel('2026-01-10', '2026-04-15')).toBe('3 months left');
    expect(timeLeftLabel('2026-01-10', '2026-02-11')).toBe('32 days left');
    expect(timeLeftLabel('2026-01-10', '2026-01-10')).toBe('Ended');
  });
});
