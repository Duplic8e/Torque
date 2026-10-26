import { describe, expect, it } from 'vitest';
import { agoLabel, fmtDateShort, fmtNum, remainingLabel } from '../../src/core/format';
import type { ItemDue } from '../../src/engine/due';

const base: ItemDue = { key: 'oil', name: 'Oil', category: 'Oil', kind: 'replace', status: 'ok', progress: 0.2, drivenBy: 'miles', lastDone: null, unknownBaseline: false };

describe('format', () => {
  it('formats numbers and dates', () => {
    expect(fmtNum(52500)).toBe('52,500');
    expect(fmtDateShort('2026-12-12')).toBe('Dec 12');
  });
  it('labels recency', () => {
    expect(agoLabel('2026-10-26', '2026-10-26')).toBe('today');
    expect(agoLabel('2026-10-25', '2026-10-26')).toBe('yesterday');
    expect(agoLabel('2026-10-23', '2026-10-26')).toBe('3 days ago');
  });
  it('describes what is left', () => {
    expect(remainingLabel({ ...base, milesLeft: 1240, daysLeft: 47 }, 'mi')).toBe('in 1,240 mi or 47 days');
    expect(remainingLabel({ ...base, milesLeft: 500 }, 'km')).toBe('in 500 km');
    expect(remainingLabel({ ...base, daysLeft: 1 }, 'mi')).toBe('in 1 day');
  });
  it('describes overdue and unknown items', () => {
    expect(remainingLabel({ ...base, status: 'overdue', milesLeft: -120, daysLeft: 40 }, 'mi')).toBe('Overdue by 120 mi');
    expect(remainingLabel({ ...base, unknownBaseline: true }, 'mi')).toBe('Due now (no history)');
  });
});
