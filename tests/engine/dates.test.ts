import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween } from '../../src/core/dates';

describe('dates', () => {
  it('adds calendar months', () => {
    expect(addMonths('2026-01-10', 12)).toBe('2027-01-10');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
  it('clamps to the end of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2027-12-31', 2)).toBe('2028-02-29');
  });
  it('counts days across DST boundaries', () => {
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetween('2026-04-01', '2026-03-01')).toBe(-31);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
