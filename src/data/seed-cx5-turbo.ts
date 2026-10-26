import { newId } from '../core/ids';
import type { Category, ID, ServiceItem } from './types';

interface SeedRule {
  key: string;
  name: string;
  category: Category;
  kind: 'replace' | 'inspect';
  intervalMiles?: number;
  intervalMonths?: number;
  severeMiles?: number;
  severeMonths?: number;
  firstDueMiles?: number;
  notes?: string;
}

/**
 * Default schedule for the CX-5 2.5 Turbo. Spark plugs are Mazda's figure; the rest are
 * typical Mazda US intervals and must be checked against the maintenance booklet.
 * Where only one of miles/months is given, the item is tracked on that axis alone.
 */
export const CX5_TURBO_SEED: readonly SeedRule[] = [
  { key: 'oil', name: 'Engine oil and filter', category: 'Oil', kind: 'replace', intervalMiles: 7500, intervalMonths: 12, severeMiles: 5000, severeMonths: 6, notes: "Many turbo owners choose 5,000 mi; the car's oil monitor may prompt sooner" },
  { key: 'rotation', name: 'Tire rotation', category: 'Tires', kind: 'replace', intervalMiles: 7500, intervalMonths: 12, severeMiles: 5000, severeMonths: 6, notes: 'Log tread depth in notes' },
  { key: 'cabin_filter', name: 'Cabin air filter', category: 'Filters', kind: 'replace', intervalMiles: 30000, intervalMonths: 24, severeMiles: 15000, severeMonths: 12, notes: 'Easy DIY behind glovebox' },
  { key: 'engine_air_filter', name: 'Engine air filter', category: 'Filters', kind: 'replace', intervalMiles: 30000, severeMiles: 15000, notes: 'Inspect at each oil change' },
  { key: 'spark_plugs', name: 'Spark plugs (2.5T)', category: 'Ignition', kind: 'replace', intervalMiles: 40000, severeMiles: 40000, notes: 'Turbo-specific; non-turbo is 75,000 mi' },
  { key: 'brake_fluid', name: 'Brake fluid', category: 'Fluids', kind: 'replace', intervalMonths: 36, severeMonths: 24, notes: 'Verify' },
  { key: 'coolant', name: 'Engine coolant', category: 'Fluids', kind: 'replace', intervalMiles: 120000, intervalMonths: 120, severeMiles: 120000, severeMonths: 120, firstDueMiles: 120000, notes: 'Verify for model year' },
  { key: 'brakes', name: 'Brakes (pads, rotors, lines)', category: 'Brakes', kind: 'inspect', intervalMiles: 15000, intervalMonths: 12, severeMiles: 7500, severeMonths: 6, notes: 'Log pad thickness' },
  { key: 'drive_belts', name: 'Drive belts', category: 'Inspection', kind: 'inspect', intervalMiles: 30000, severeMiles: 15000 },
  { key: 'battery', name: 'Battery and terminals', category: 'Inspection', kind: 'inspect', intervalMonths: 12, severeMonths: 6, notes: 'Track battery install date' },
  { key: 'wipers', name: 'Wiper blades', category: 'Other', kind: 'replace', intervalMonths: 12, severeMonths: 6 },
  { key: 'tire_check', name: 'Tire replacement', category: 'Tires', kind: 'inspect', intervalMiles: 7500, severeMiles: 7500, notes: 'Tread check every 7,500 mi; replace at 4/32 in' },
];

/** The core items asked about during onboarding. */
export const CORE_ITEM_KEYS = ['oil', 'rotation', 'cabin_filter', 'engine_air_filter', 'spark_plugs', 'brake_fluid', 'coolant'] as const;

export function seedItems(vehicleId: ID, now: string): ServiceItem[] {
  return CX5_TURBO_SEED.map((rule, i) => ({
    ...rule,
    id: newId(),
    vehicleId,
    enabled: true,
    isCustom: false,
    sortOrder: i,
    updatedAt: now,
  }));
}
