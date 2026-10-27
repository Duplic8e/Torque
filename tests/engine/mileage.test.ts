import { describe, expect, it } from 'vitest';
import { checkOdometer, DEFAULT_KM_PER_DAY, DEFAULT_MILES_PER_DAY, defaultRatePerDay, estimateMileage } from '../../src/engine/mileage';

describe('estimateMileage', () => {
  it('fits the pace by regression and extrapolates', () => {
    const e = estimateMileage(
      [{ date: '2026-10-01', value: 1000 }, { date: '2026-10-11', value: 1500 }, { date: '2026-10-21', value: 2000 }],
      '2026-10-26',
    );
    expect(e.rateSource).toBe('regression');
    expect(e.ratePerDay).toBeCloseTo(50);
    expect(e.miles).toBe(2250);
    expect(e.isEstimated).toBe(true);
    expect(e.confidence).toBe('normal');
  });

  it('falls back to 33 mi/day with fewer than 2 readings', () => {
    const e = estimateMileage([{ date: '2026-10-16', value: 10_000 }], '2026-10-26');
    expect(e.rateSource).toBe('default');
    expect(e.ratePerDay).toBe(DEFAULT_MILES_PER_DAY);
    expect(e.miles).toBe(10_330);
  });

  it('uses a kilometre default for cars tracked in km', () => {
    expect(defaultRatePerDay('km')).toBe(DEFAULT_KM_PER_DAY);
    expect(defaultRatePerDay('mi')).toBe(DEFAULT_MILES_PER_DAY);
    const e = estimateMileage([{ date: '2026-10-16', value: 10_000 }], '2026-10-26', defaultRatePerDay('km'));
    expect(e.ratePerDay).toBe(44);
    expect(e.miles).toBe(10_440);
  });

  it('uses the overall average when the 180-day window has fewer than 2 readings', () => {
    const e = estimateMileage([{ date: '2025-10-26', value: 0 }, { date: '2026-10-16', value: 12_000 }], '2026-10-26');
    expect(e.rateSource).toBe('average');
    expect(e.ratePerDay).toBeCloseTo(12_000 / 355);
  });

  it('exact reading today is not marked estimated', () => {
    const e = estimateMileage([{ date: '2026-10-26', value: 5000 }], '2026-10-26');
    expect(e.isEstimated).toBe(false);
    expect(e.miles).toBe(5000);
  });

  it('flags low confidence when the last reading is over 30 days old', () => {
    expect(estimateMileage([{ date: '2026-09-01', value: 5000 }], '2026-10-26').confidence).toBe('low');
  });

  it('never estimates below the last reading, even if the pace goes negative', () => {
    const e = estimateMileage([{ date: '2026-10-01', value: 5000 }, { date: '2026-10-10', value: 4900 }], '2026-10-26');
    expect(e.miles).toBeGreaterThanOrEqual(4900);
  });

  it('ignores corrections when computing pace but honours them as the latest reading', () => {
    const e = estimateMileage(
      [{ date: '2026-10-01', value: 1000 }, { date: '2026-10-11', value: 1500 }, { date: '2026-10-20', value: 1400, isCorrection: true }],
      '2026-10-20',
    );
    expect(e.ratePerDay).toBeCloseTo(50);
    expect(e.miles).toBe(1400);
  });

  it('handles no readings', () => {
    expect(estimateMileage([], '2026-10-26').confidence).toBe('none');
  });
});

describe('checkOdometer', () => {
  const pts = [{ date: '2026-10-01', value: 5000 }];
  it('flags a value lower than an earlier reading', () => {
    const r = checkOdometer(4900, '2026-10-10', pts);
    expect(r.ok).toBe(false);
  });
  it('accepts equal or higher values', () => {
    expect(checkOdometer(5000, '2026-10-10', pts).ok).toBe(true);
    expect(checkOdometer(5100, '2026-10-10', pts).ok).toBe(true);
  });
  it('allows an older-dated entry that is consistent with its neighbours', () => {
    expect(checkOdometer(4000, '2026-09-01', pts).ok).toBe(true);
  });
});
