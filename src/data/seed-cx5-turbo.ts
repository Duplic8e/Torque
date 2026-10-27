import { newId } from '../core/ids';
import type { Category, ID, ServiceItem, Vehicle } from './types';

/** A schedule rule in kilometres, as Mazda Canada prints it. */
interface SeedRule {
  key: string;
  name: string;
  category: Category;
  kind: 'replace' | 'inspect';
  km?: number;
  months?: number;
  /** First replacement on a new car when it differs from the repeat interval (coolant). */
  firstKm?: number;
  firstMonths?: number;
  notes?: string;
}

const SOURCE = 'Mazda Canada Schedule 2';

/**
 * Default schedule for the 2023 CX-5 Signature 2.5 Turbo in Canada. Canada follows Mazda's Schedule 2,
 * which already assumes harsh conditions, so there are no separate "severe" values.
 *
 * From Mazda Canada's CX-5 maintenance sheet and the 2023 Canadian owner's manual: oil, rotation and
 * fluid checks every 8,000 km or 6 months; brake inspection every 24,000 km or 12 months; cabin filter
 * 32,000 km or 24 months; drive belts 48,000 km or 36 months; engine air filter 56,000 km; 2.5T spark
 * plugs 64,000 km; coolant first at 200,000 km or 10 years, then every 100,000 km or 5 years.
 * Brake fluid could not be confirmed for Canada. Battery, wipers and tread checks are not on Mazda's
 * schedule; they are sensible extras.
 */
export const CX5_TURBO_SEED: readonly SeedRule[] = [
  { key: 'oil', name: 'Engine oil and filter', category: 'Oil', kind: 'replace', km: 8000, months: 6, notes: `${SOURCE}: every 8,000 km or 6 months.` },
  { key: 'rotation', name: 'Tire rotation', category: 'Tires', kind: 'replace', km: 8000, months: 6, notes: `${SOURCE}: rotate and check pressure and wear every 8,000 km or 6 months. Log tread depth in notes.` },
  { key: 'fluid_levels', name: 'Fluid level check', category: 'Fluids', kind: 'inspect', km: 8000, months: 6, notes: `${SOURCE}: brake and clutch fluid, washer fluid and coolant levels every 8,000 km or 6 months.` },
  { key: 'cabin_filter', name: 'Cabin air filter', category: 'Filters', kind: 'replace', km: 32000, months: 24, notes: `${SOURCE}: every 32,000 km or 24 months. Easy DIY behind the glovebox.` },
  { key: 'engine_air_filter', name: 'Engine air filter', category: 'Filters', kind: 'replace', km: 56000, notes: `${SOURCE}: replace every 56,000 km; inspected at each 8,000 km service.` },
  { key: 'spark_plugs', name: 'Spark plugs (2.5T)', category: 'Ignition', kind: 'replace', km: 64000, notes: `${SOURCE}: every 64,000 km for the 2.5 T with Dynamic Pressure Turbo.` },
  { key: 'brake_fluid', name: 'Brake fluid', category: 'Fluids', kind: 'replace', months: 24, notes: 'Not confirmed for Canada. Check the brake fluid row in your owner’s manual; replace yearly if you brake hard often or live somewhere very humid.' },
  { key: 'coolant', name: 'Engine coolant', category: 'Fluids', kind: 'replace', km: 100000, months: 60, firstKm: 200000, firstMonths: 120, notes: `${SOURCE}: first at 200,000 km or 10 years, then every 100,000 km or 5 years. Use Mazda FL-22.` },
  { key: 'brakes', name: 'Brakes (pads, rotors, lines)', category: 'Brakes', kind: 'inspect', km: 24000, months: 12, notes: `${SOURCE}: inspect and clean discs and pads every 24,000 km or 12 months. Log pad thickness.` },
  { key: 'drive_belts', name: 'Drive belts', category: 'Inspection', kind: 'inspect', km: 48000, months: 36, notes: `${SOURCE}: every 48,000 km or 36 months.` },
  { key: 'battery', name: 'Battery and terminals', category: 'Inspection', kind: 'inspect', months: 12, notes: 'Not on Mazda’s schedule. A yearly check before winter is worth it in Canada.' },
  { key: 'wipers', name: 'Wiper blades', category: 'Other', kind: 'replace', months: 12, notes: 'Not on Mazda’s schedule. Yearly, or when they streak.' },
  { key: 'tire_check', name: 'Tire replacement', category: 'Tires', kind: 'inspect', km: 8000, notes: 'Tread check with each rotation. Replace at 3 mm (4/32 in); winter tires lose grip in snow below 5 mm.' },
];

/** The core items asked about during onboarding. */
export const CORE_ITEM_KEYS = ['oil', 'rotation', 'cabin_filter', 'engine_air_filter', 'spark_plugs', 'brake_fluid', 'coolant'] as const;

const KM_PER_MILE = 1.609344;

/** Converts a km interval for a vehicle set to miles, rounded to a tidy 500. */
export function toVehicleUnits(km: number | undefined, units: Vehicle['units']): number | undefined {
  if (km === undefined || units === 'km') return km;
  return Math.max(500, Math.round(km / KM_PER_MILE / 500) * 500);
}

/** The interval fields of a seed rule, in the vehicle's units. */
export function ruleFields(rule: SeedRule, units: Vehicle['units']): Pick<ServiceItem, 'intervalMiles' | 'intervalMonths' | 'severeMiles' | 'severeMonths' | 'firstDueMiles' | 'firstDueMonths' | 'notes'> {
  return {
    intervalMiles: toVehicleUnits(rule.km, units),
    intervalMonths: rule.months,
    severeMiles: undefined,
    severeMonths: undefined,
    firstDueMiles: toVehicleUnits(rule.firstKm, units),
    firstDueMonths: rule.firstMonths,
    notes: rule.notes,
  };
}

export function seedItems(vehicleId: ID, now: string, units: Vehicle['units'] = 'km'): ServiceItem[] {
  return CX5_TURBO_SEED.map((rule, i) => {
    const fields = Object.fromEntries(Object.entries(ruleFields(rule, units)).filter(([, v]) => v !== undefined));
    return {
      key: rule.key,
      name: rule.name,
      category: rule.category,
      kind: rule.kind,
      ...fields,
      id: newId(),
      vehicleId,
      enabled: true,
      isCustom: false,
      sortOrder: i,
      updatedAt: now,
    };
  });
}
