import { addMonths, daysBetween } from '../core/dates';
import type { ISODate } from '../data/types';

export interface Coverage {
  key: string;
  name: string;
  months: number;
  covers: string;
}

/**
 * Mazda Canada's new-vehicle warranty ("Mazda Unlimited", 2015 model year on): every coverage has
 * unlimited kilometres, so only time runs out. Counted from the delivery date. Sources: mazda.ca warranty
 * overview and Mazda Canada's 2014 announcement. The warranty booklet in the glovebox is the final word.
 */
export const MAZDA_CANADA_WARRANTY: readonly Coverage[] = [
  { key: 'comprehensive', name: 'Comprehensive', months: 36, covers: 'Bumper to bumper: defects in parts and workmanship' },
  { key: 'roadside', name: 'Roadside assistance', months: 36, covers: 'Towing, boosts, lockouts and flat tires, 24 hours a day' },
  { key: 'powertrain', name: 'Powertrain', months: 60, covers: 'Engine, turbo, transmission and drivetrain' },
  { key: 'perforation', name: 'Anti-perforation', months: 84, covers: 'Rust holes through body panels' },
];

/** A coverage within this many days of ending gets flagged, so problems are seen to while still covered. */
export const WARRANTY_SOON_DAYS = 90;

export interface CoverageStatus extends Coverage {
  ends: ISODate;
  daysLeft: number;
  /** 0 to 1: how much of the coverage period has passed. */
  progress: number;
  state: 'active' | 'ending' | 'ended';
}

export function warrantyStatus(coverages: readonly Coverage[], start: ISODate, today: ISODate): CoverageStatus[] {
  return coverages.map((c) => {
    const ends = addMonths(start, c.months);
    const daysLeft = daysBetween(today, ends);
    const total = daysBetween(start, ends);
    const progress = Math.min(1, Math.max(0, daysBetween(start, today) / total));
    const state = daysLeft <= 0 ? 'ended' : daysLeft <= WARRANTY_SOON_DAYS ? 'ending' : 'active';
    return { ...c, ends, daysLeft, progress, state };
  });
}

/** "2 years 3 months", "4 months", "12 days": time left, coarse enough to read at a glance. */
export function timeLeftLabel(today: ISODate, ends: ISODate): string {
  const days = daysBetween(today, ends);
  if (days <= 0) return 'Ended';
  if (days < 60) return `${days} day${days === 1 ? '' : 's'} left`;
  let months = 0;
  while (addMonths(today, months + 1) <= ends) months++;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y && `${y} year${y === 1 ? '' : 's'}`, m && `${m} month${m === 1 ? '' : 's'}`].filter(Boolean);
  return `${parts.join(' ')} left`;
}
