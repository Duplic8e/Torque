import { seedItems } from '../src/data/seed-cx5-turbo';
import type { ISODate, OdometerReading, ServiceItem, ServiceRecord } from '../src/data/types';
import type { DueInput } from '../src/engine/due';

export const V = 'vehicle-1';
let n = 0;

export const items = (): ServiceItem[] => seedItems(V, '2026-01-01T00:00:00Z');

export function record(date: ISODate, odometer: number, itemKeys: string[], extra: Partial<ServiceRecord> = {}): ServiceRecord {
  return { id: `r${++n}`, vehicleId: V, date, odometer, itemKeys, diy: false, attachmentIds: [], createdAt: date, updatedAt: date, ...extra };
}

export function reading(date: ISODate, value: number, extra: Partial<OdometerReading> = {}): OdometerReading {
  return { id: `o${++n}`, vehicleId: V, date, value, source: 'manual', updatedAt: date, ...extra };
}

export function input(over: Partial<DueInput> & { today: ISODate }): DueInput {
  return {
    vehicle: { drivingStyle: 'normal' },
    items: items(),
    records: [],
    readings: [],
    settings: { dueSoonMiles: 500, dueSoonDays: 30 },
    ...over,
  };
}

/** Gives every item a purchase baseline so tests can focus on one item at a time. */
export function withBaselines(list: ServiceItem[], date: ISODate, odometer: number): ServiceItem[] {
  return list.map((i) => ({ ...i, baseline: { date, odometer, source: 'entered' as const } }));
}
