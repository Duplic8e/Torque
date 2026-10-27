import type { ISODate, OdometerReading, ServiceItem, ServiceRecord } from '../src/data/types';
import type { DueInput } from '../src/engine/due';

export const V = 'vehicle-1';
let n = 0;

type Rule = Pick<ServiceItem, 'key' | 'name' | 'category' | 'kind'> & Partial<ServiceItem>;

/**
 * The rule set from the spec's acceptance tests (oil 7,500 mi / 12 mo, severe 5,000 / 6, and so on).
 * Engine tests use this fixed fixture so they test the engine, not whichever defaults ship in the seed.
 */
const SPEC_RULES: Rule[] = [
  { key: 'oil', name: 'Engine oil and filter', category: 'Oil', kind: 'replace', intervalMiles: 7500, intervalMonths: 12, severeMiles: 5000, severeMonths: 6 },
  { key: 'rotation', name: 'Tire rotation', category: 'Tires', kind: 'replace', intervalMiles: 7500, intervalMonths: 12, severeMiles: 5000, severeMonths: 6 },
  { key: 'cabin_filter', name: 'Cabin air filter', category: 'Filters', kind: 'replace', intervalMiles: 30000, intervalMonths: 24, severeMiles: 15000, severeMonths: 12 },
  { key: 'engine_air_filter', name: 'Engine air filter', category: 'Filters', kind: 'replace', intervalMiles: 30000, severeMiles: 15000 },
  { key: 'spark_plugs', name: 'Spark plugs (2.5T)', category: 'Ignition', kind: 'replace', intervalMiles: 40000, severeMiles: 40000 },
  { key: 'brake_fluid', name: 'Brake fluid', category: 'Fluids', kind: 'replace', intervalMonths: 36, severeMonths: 24 },
  { key: 'coolant', name: 'Engine coolant', category: 'Fluids', kind: 'replace', intervalMiles: 120000, intervalMonths: 120, firstDueMiles: 120000 },
  { key: 'brakes', name: 'Brakes (pads, rotors, lines)', category: 'Brakes', kind: 'inspect', intervalMiles: 15000, intervalMonths: 12, severeMiles: 7500, severeMonths: 6 },
  { key: 'drive_belts', name: 'Drive belts', category: 'Inspection', kind: 'inspect', intervalMiles: 30000, severeMiles: 15000 },
  { key: 'battery', name: 'Battery and terminals', category: 'Inspection', kind: 'inspect', intervalMonths: 12, severeMonths: 6 },
  { key: 'wipers', name: 'Wiper blades', category: 'Other', kind: 'replace', intervalMonths: 12, severeMonths: 6 },
  { key: 'tire_check', name: 'Tire replacement', category: 'Tires', kind: 'inspect', intervalMiles: 7500, severeMiles: 7500 },
];

export const items = (): ServiceItem[] =>
  SPEC_RULES.map((r, i) => ({ ...r, id: `item-${r.key}`, vehicleId: V, enabled: true, isCustom: false, sortOrder: i, updatedAt: '2026-01-01T00:00:00Z' }));

export function record(date: ISODate, odometer: number, itemKeys: string[], extra: Partial<ServiceRecord> = {}): ServiceRecord {
  return { id: `r${++n}`, vehicleId: V, date, odometer, itemKeys, diy: false, attachmentIds: [], createdAt: date, updatedAt: date, ...extra };
}

export function reading(date: ISODate, value: number, extra: Partial<OdometerReading> = {}): OdometerReading {
  return { id: `o${++n}`, vehicleId: V, date, value, source: 'manual', updatedAt: date, ...extra };
}

export function input(over: Partial<DueInput> & { today: ISODate }): DueInput {
  return {
    vehicle: { drivingStyle: 'normal', units: 'mi' },
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
