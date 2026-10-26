import { addDays, addMonths, daysBetween } from '../core/dates';
import type { Category, ISODate, OdometerReading, ServiceItem, ServiceRecord, Settings, Vehicle } from '../data/types';
import { healthScore } from './health';
import { estimateMileage, type MileageEstimate, type MileagePoint } from './mileage';

export type Status = 'ok' | 'soon' | 'overdue' | 'inspect';

export interface LastDone {
  date: ISODate;
  odometer: number;
  source: 'record' | 'entered' | 'purchase';
  recordId?: string;
}

export interface ItemDue {
  key: string;
  name: string;
  category: Category;
  kind: ServiceItem['kind'];
  status: Status;
  dueMiles?: number;
  dueDate?: ISODate;
  milesLeft?: number;
  daysLeft?: number;
  projectedDate?: ISODate;
  /** 0 to 1.2: how much of the interval is used, by whichever of miles or time is further along. */
  progress: number;
  drivenBy: 'miles' | 'time';
  lastDone: LastDone | null;
  /** "Not sure" at onboarding: treated as due now. */
  unknownBaseline: boolean;
}

export interface DueInput {
  today: ISODate;
  vehicle: Pick<Vehicle, 'drivingStyle'>;
  items: readonly ServiceItem[];
  records: readonly ServiceRecord[];
  readings: readonly OdometerReading[];
  settings: Pick<Settings, 'dueSoonMiles' | 'dueSoonDays'>;
}

export interface DueResult {
  mileage: MileageEstimate;
  items: ItemDue[];
  health: number;
}

const MAX_PROGRESS = 1.2;
const STATUS_ORDER: Record<Status, number> = { overdue: 0, soon: 1, ok: 2, inspect: 3 };

/** The most recent record (by date, then odometer) that covers `key`. */
export function findLastRecord(key: string, records: readonly ServiceRecord[]): ServiceRecord | null {
  let best: ServiceRecord | null = null;
  for (const r of records) {
    if (r.deletedAt || !r.itemKeys.includes(key)) continue;
    if (!best || r.date > best.date || (r.date === best.date && r.odometer > best.odometer)) best = r;
  }
  return best;
}

function lastDoneFor(item: ServiceItem, records: readonly ServiceRecord[]): LastDone | null {
  const record = findLastRecord(item.key, records);
  if (record) return { date: record.date, odometer: record.odometer, source: 'record', recordId: record.id };
  if (item.baseline) return { date: item.baseline.date, odometer: item.baseline.odometer, source: item.baseline.source };
  return null;
}

export function computeItemDue(
  item: ServiceItem,
  lastDone: LastDone | null,
  severe: boolean,
  mileage: MileageEstimate,
  today: ISODate,
  settings: DueInput['settings'],
): ItemDue {
  const intervalMiles = severe && item.severeMiles !== undefined ? item.severeMiles : item.intervalMiles;
  const intervalMonths = severe && item.severeMonths !== undefined ? item.severeMonths : item.intervalMonths;
  const base = { key: item.key, name: item.name, category: item.category, kind: item.kind, lastDone };
  const inspect = item.kind === 'inspect';

  if (intervalMiles === undefined && intervalMonths === undefined) {
    return { ...base, status: inspect ? 'inspect' : 'ok', progress: 0, drivenBy: 'time', unknownBaseline: false };
  }

  if (!lastDone) {
    return {
      ...base,
      status: inspect ? 'inspect' : 'soon',
      milesLeft: intervalMiles !== undefined ? 0 : undefined,
      daysLeft: intervalMonths !== undefined ? 0 : undefined,
      projectedDate: today,
      progress: 1,
      drivenBy: intervalMiles !== undefined ? 'miles' : 'time',
      unknownBaseline: true,
    };
  }

  const rate = mileage.ratePerDay;
  const dueMiles =
    intervalMiles === undefined
      ? undefined
      : lastDone.source === 'purchase' && item.firstDueMiles !== undefined
        ? item.firstDueMiles
        : lastDone.odometer + intervalMiles;
  const dueDate =
    intervalMonths === undefined
      ? undefined
      : addMonths(lastDone.date, lastDone.source === 'purchase' && item.firstDueMonths !== undefined ? item.firstDueMonths : intervalMonths);

  const milesLeft = dueMiles === undefined ? undefined : dueMiles - mileage.miles;
  const daysLeft = dueDate === undefined ? undefined : daysBetween(today, dueDate);
  const daysByMiles = milesLeft === undefined ? undefined : milesLeft / rate;

  const milesDate = daysByMiles === undefined ? undefined : addDays(today, Math.round(daysByMiles));
  const projectedDate = [dueDate, milesDate].filter((d): d is ISODate => d !== undefined).sort()[0];

  // Miles convert to days at the current pace, so "600 mi at 50 mi/day" counts as 12 days.
  const effectiveDays = Math.min(daysLeft ?? Infinity, daysByMiles ?? Infinity);
  const overdue = (milesLeft !== undefined && milesLeft <= 0) || (daysLeft !== undefined && daysLeft <= 0);
  const soon = (milesLeft !== undefined && milesLeft <= settings.dueSoonMiles) || effectiveDays <= settings.dueSoonDays;
  const status: Status = inspect ? 'inspect' : overdue ? 'overdue' : soon ? 'soon' : 'ok';

  const milesProgress =
    dueMiles !== undefined && dueMiles > lastDone.odometer ? (mileage.miles - lastDone.odometer) / (dueMiles - lastDone.odometer) : 0;
  const totalDays = dueDate === undefined ? 0 : daysBetween(lastDone.date, dueDate);
  const timeProgress = totalDays > 0 ? daysBetween(lastDone.date, today) / totalDays : 0;
  const progress = Math.min(MAX_PROGRESS, Math.max(0, milesProgress, timeProgress));

  const drivenBy: ItemDue['drivenBy'] =
    daysByMiles !== undefined && (daysLeft === undefined || daysByMiles < daysLeft) ? 'miles' : 'time';

  return { ...base, status, dueMiles, dueDate, milesLeft, daysLeft, projectedDate, progress, drivenBy, unknownBaseline: false };
}

/** Overdue first, then due soon, then ok, then inspect-only; soonest projected date first within each. */
export function sortByUrgency(items: readonly ItemDue[]): ItemDue[] {
  return [...items].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.projectedDate ?? '9999').localeCompare(b.projectedDate ?? '9999') ||
      a.name.localeCompare(b.name),
  );
}

export function computeDue(input: DueInput): DueResult {
  const { today, vehicle, settings } = input;
  const records = input.records.filter((r) => !r.deletedAt);
  const points: MileagePoint[] = [
    ...input.readings.filter((r) => !r.deletedAt).map((r) => ({ date: r.date, value: r.value, isCorrection: r.isCorrection })),
    ...records.map((r) => ({ date: r.date, value: r.odometer })),
  ];
  const mileage = estimateMileage(points, today);
  const severe = vehicle.drivingStyle === 'severe';

  const items = sortByUrgency(
    input.items
      .filter((i) => i.enabled && !i.deletedAt)
      .map((item) => computeItemDue(item, lastDoneFor(item, records), severe, mileage, today, settings)),
  );
  return { mileage, items, health: healthScore(items) };
}

export interface AxisUsage {
  used: number;
  total: number;
}

/**
 * How much of each limit is used since the item was last done: distance in the vehicle's units and time in
 * days. An item is due when either runs out, so showing both says which one is driving it.
 */
export function intervalUsage(item: ItemDue, estMiles: number, today: ISODate): { distance?: AxisUsage; time?: AxisUsage } {
  const last = item.lastDone;
  if (!last) return {};
  const out: { distance?: AxisUsage; time?: AxisUsage } = {};
  if (item.dueMiles !== undefined && item.dueMiles > last.odometer) {
    out.distance = { used: Math.max(0, estMiles - last.odometer), total: item.dueMiles - last.odometer };
  }
  if (item.dueDate !== undefined) {
    const total = daysBetween(last.date, item.dueDate);
    if (total > 0) out.time = { used: Math.max(0, daysBetween(last.date, today)), total };
  }
  return out;
}
