import { addDays, daysBetween } from '../core/dates';
import type { ISODate, SeasonalTires, ServiceRecord, TireSet } from '../data/types';

/** The item key for the seasonal swap; one per vehicle, created from Settings. */
export const TIRE_SWAP_KEY = 'tire_swap';

/** Without a logged swap, a set mounted up to this many days before its date counts as put on early, not late. */
export const EARLY_SWAP_DAYS = 60;

export const otherSet = (set: TireSet): TireSet => (set === 'winter' ? 'summer' : 'winter');

const onBy = (config: SeasonalTires, set: TireSet) => (set === 'winter' ? config.winterOn : config.summerOn);

/** The 'MM-DD' date in a given year (Feb 29 falls back to Feb 28). */
function inYear(mmdd: string, year: number): ISODate {
  const date = `${year}-${mmdd}`;
  return mmdd === '02-29' && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1 ? `${year}-02-28` : date;
}

/** The first occurrence of `mmdd` strictly after `date`. */
export function nextOccurrence(mmdd: string, date: ISODate): ISODate {
  const year = Number(date.slice(0, 4));
  const same = inYear(mmdd, year);
  return same > date ? same : inYear(mmdd, year + 1);
}

/** The last occurrence of `mmdd` on or before `date`. */
function lastOccurrence(mmdd: string, date: ISODate): ISODate {
  const year = Number(date.slice(0, 4));
  const same = inYear(mmdd, year);
  return same <= date ? same : inYear(mmdd, year - 1);
}

/** Days between two dates ignoring the year, the short way round. */
function circularDays(a: ISODate, mmdd: string): number {
  const forward = daysBetween(a, nextOccurrence(mmdd, addDays(a, -1)));
  return Math.min(forward, 365 - forward);
}

/** Which set a logged swap put on: the one whose "on by" date is nearer the swap date. */
export function setMountedBy(swapDate: ISODate, config: SeasonalTires): TireSet {
  return circularDays(swapDate, config.winterOn) <= circularDays(swapDate, config.summerOn) ? 'winter' : 'summer';
}

export interface SwapDue {
  /** The set on the car now. */
  mounted: TireSet;
  /** The set to put on next, by `dueDate`. */
  next: TireSet;
  dueDate: ISODate;
  /** When the current set went on: the logged swap, or the assumed start of its season. */
  since: ISODate;
  fromRecord: boolean;
}

/**
 * The next seasonal swap. A logged swap decides which set is on and when it went on. With none logged,
 * the set chosen in Settings is assumed to have gone on at its own "on by" date: the most recent one, or
 * the upcoming one if it is close (put on early). The next swap is due by the other set's next date.
 */
export function nextSwap(config: SeasonalTires, lastSwap: Pick<ServiceRecord, 'date'> | null, today: ISODate): SwapDue {
  let mounted: TireSet;
  let since: ISODate;
  if (lastSwap) {
    mounted = setMountedBy(lastSwap.date, config);
    since = lastSwap.date;
  } else {
    mounted = config.mounted;
    const upcoming = nextOccurrence(onBy(config, mounted), today);
    since = daysBetween(today, upcoming) <= EARLY_SWAP_DAYS ? upcoming : lastOccurrence(onBy(config, mounted), today);
  }
  const next = otherSet(mounted);
  return { mounted, next, dueDate: nextOccurrence(onBy(config, next), since), since, fromRecord: !!lastSwap };
}

export const swapName = (set: TireSet) => (set === 'winter' ? 'Winter tires on' : 'Summer tires on');

/** Common "on by" dates. Quebec requires winter tires from December 1 to March 15. */
export const WINTER_ON_OPTIONS = ['10-01', '10-15', '11-01', '11-15', '12-01'] as const;
export const SUMMER_ON_OPTIONS = ['03-16', '04-01', '04-15', '05-01', '05-15'] as const;
export const DEFAULT_SEASONAL: Omit<SeasonalTires, 'mounted'> = { winterOn: '11-01', summerOn: '05-01' };
