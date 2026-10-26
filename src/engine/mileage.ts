import { daysBetween } from '../core/dates';
import type { ISODate } from '../data/types';

/** About 12,000 miles a year. */
export const DEFAULT_MILES_PER_DAY = 33;
export const REGRESSION_WINDOW_DAYS = 180;
export const LOW_CONFIDENCE_AFTER_DAYS = 30;

export interface MileagePoint {
  date: ISODate;
  value: number;
  isCorrection?: boolean;
}

export interface MileageEstimate {
  /** Estimated odometer today; never below the last reading. */
  miles: number;
  ratePerDay: number;
  rateSource: 'regression' | 'average' | 'default';
  lastReading: MileagePoint | null;
  daysSinceReading: number;
  /** True when `miles` is extrapolated rather than a real reading. */
  isEstimated: boolean;
  confidence: 'none' | 'low' | 'normal';
}

/** Latest point by date; among equal dates the one listed last wins. */
export function latestPoint(points: readonly MileagePoint[]): MileagePoint | null {
  let best: MileagePoint | null = null;
  for (const p of points) if (!best || p.date >= best.date) best = p;
  return best;
}

/** Least-squares slope in miles per day, or null when there are fewer than 2 distinct days. */
function regressionSlope(points: readonly MileagePoint[]): number | null {
  if (points.length < 2) return null;
  const origin = points.reduce((min, p) => (p.date < min ? p.date : min), points[0]!.date);
  const xs = points.map((p) => daysBetween(origin, p.date));
  const n = points.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.reduce((a, p) => a + p.value, 0) / n;
  let cov = 0;
  let varX = 0;
  points.forEach((p, i) => {
    const dx = xs[i]! - meanX;
    cov += dx * (p.value - meanY);
    varX += dx * dx;
  });
  return varX === 0 ? null : cov / varX;
}

export function estimateMileage(points: readonly MileagePoint[], today: ISODate): MileageEstimate {
  const usable = points.filter((p) => p.date <= today);
  const last = latestPoint(usable);
  if (!last) {
    return { miles: 0, ratePerDay: DEFAULT_MILES_PER_DAY, rateSource: 'default', lastReading: null, daysSinceReading: 0, isEstimated: false, confidence: 'none' };
  }

  // Corrections fix earlier typos, so they must not skew the pace.
  const real = usable.filter((p) => !p.isCorrection);
  const windowed = real.filter((p) => daysBetween(p.date, today) <= REGRESSION_WINDOW_DAYS);

  let ratePerDay = DEFAULT_MILES_PER_DAY;
  let rateSource: MileageEstimate['rateSource'] = 'default';
  const slope = regressionSlope(windowed);
  if (slope !== null && slope > 0) {
    ratePerDay = slope;
    rateSource = 'regression';
  } else {
    const first = real.reduce<MileagePoint | null>((min, p) => (!min || p.date < min.date ? p : min), null);
    const lastReal = latestPoint(real);
    if (first && lastReal) {
      const days = daysBetween(first.date, lastReal.date);
      const avg = days > 0 ? (lastReal.value - first.value) / days : 0;
      if (avg > 0) {
        ratePerDay = avg;
        rateSource = 'average';
      }
    }
  }

  const daysSinceReading = daysBetween(last.date, today);
  return {
    miles: Math.max(last.value, Math.round(last.value + ratePerDay * daysSinceReading)),
    ratePerDay,
    rateSource,
    lastReading: last,
    daysSinceReading,
    isEstimated: daysSinceReading > 0,
    confidence: daysSinceReading > LOW_CONFIDENCE_AFTER_DAYS ? 'low' : 'normal',
  };
}

export type OdometerCheck = { ok: true } | { ok: false; previous: MileagePoint };

/** A new reading lower than the latest one on or before its date needs an explicit "save anyway". */
export function checkOdometer(value: number, date: ISODate, points: readonly MileagePoint[]): OdometerCheck {
  const previous = latestPoint(points.filter((p) => p.date <= date));
  return previous && value < previous.value ? { ok: false, previous } : { ok: true };
}
