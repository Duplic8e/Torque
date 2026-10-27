import { CX5_TURBO_SEED, ruleFields } from './seed-cx5-turbo';
import type { ServiceItem, Vehicle } from './types';

/** 1 = the original US-style defaults, 2 = Mazda Canada Schedule 2. */
export const CURRENT_SEED_VERSION = 2;

type IntervalFields = Pick<ServiceItem, 'intervalMiles' | 'intervalMonths' | 'severeMiles' | 'severeMonths' | 'firstDueMiles'>;

/** The version 1 defaults exactly as they were stored, so untouched items can be recognised. */
const LEGACY_V1: Record<string, IntervalFields> = {
  oil: { intervalMiles: 7500, intervalMonths: 12, severeMiles: 5000, severeMonths: 6 },
  rotation: { intervalMiles: 7500, intervalMonths: 12, severeMiles: 5000, severeMonths: 6 },
  cabin_filter: { intervalMiles: 30000, intervalMonths: 24, severeMiles: 15000, severeMonths: 12 },
  engine_air_filter: { intervalMiles: 30000, severeMiles: 15000 },
  spark_plugs: { intervalMiles: 40000, severeMiles: 40000 },
  brake_fluid: { intervalMonths: 36, severeMonths: 24 },
  coolant: { intervalMiles: 120000, intervalMonths: 120, severeMiles: 120000, severeMonths: 120, firstDueMiles: 120000 },
  brakes: { intervalMiles: 15000, intervalMonths: 12, severeMiles: 7500, severeMonths: 6 },
  drive_belts: { intervalMiles: 30000, severeMiles: 15000 },
  battery: { intervalMonths: 12, severeMonths: 6 },
  wipers: { intervalMonths: 12, severeMonths: 6 },
  tire_check: { intervalMiles: 7500, severeMiles: 7500 },
};

const FIELDS: (keyof IntervalFields)[] = ['intervalMiles', 'intervalMonths', 'severeMiles', 'severeMonths', 'firstDueMiles'];

function untouched(item: ServiceItem): boolean {
  const legacy = LEGACY_V1[item.key];
  return !!legacy && FIELDS.every((f) => item[f] === legacy[f]);
}

/** A stable id for a built-in item added by an upgrade, so two devices upgrading separately agree. */
export const upgradeItemId = (vehicleId: string, key: string) => `${vehicleId}:${key}`;

export interface SchedulePlan {
  updates: { id: string; patch: Partial<ServiceItem> }[];
  additions: Omit<ServiceItem, 'updatedAt'>[];
  /** Names of built-in items the owner had edited, left as they are. */
  kept: string[];
}

/**
 * Moves a vehicle's built-in items from the version 1 defaults to Mazda Canada's schedule, in the
 * vehicle's units. Items the owner edited are left alone and reported; custom items are never touched.
 */
export function planScheduleUpgrade(items: readonly ServiceItem[], vehicle: Pick<Vehicle, 'id' | 'units'>): SchedulePlan {
  const plan: SchedulePlan = { updates: [], additions: [], kept: [] };
  const live = items.filter((i) => !i.deletedAt && i.vehicleId === vehicle.id);
  CX5_TURBO_SEED.forEach((rule, index) => {
    const existing = live.find((i) => i.key === rule.key && !i.isCustom);
    const fields = ruleFields(rule, vehicle.units);
    if (!existing) {
      plan.additions.push({
        id: upgradeItemId(vehicle.id, rule.key),
        vehicleId: vehicle.id,
        key: rule.key,
        name: rule.name,
        category: rule.category,
        kind: rule.kind,
        ...fields,
        enabled: true,
        isCustom: false,
        sortOrder: index,
      });
    } else if (untouched(existing)) {
      plan.updates.push({ id: existing.id, patch: { ...fields, name: rule.name, sortOrder: index } });
    } else if (LEGACY_V1[rule.key]) {
      plan.kept.push(existing.name);
    }
  });
  return plan;
}
