import { addMonths } from '../core/dates';
import type { Category, ISODate, ServiceItem, ServiceRecord } from '../data/types';

export type CostCategory = 'Oil' | 'Tires' | 'Brakes' | 'Filters' | 'Fluids' | 'Repairs' | 'Other';

/** Fixed order: chart colours are assigned by position, never cycled. */
export const COST_CATEGORIES: readonly CostCategory[] = ['Oil', 'Tires', 'Brakes', 'Filters', 'Fluids', 'Repairs', 'Other'];

export function costCategoryOf(category: Category): CostCategory {
  return (COST_CATEGORIES as readonly string[]).includes(category) ? (category as CostCategory) : 'Other';
}

export interface CostSummary {
  thisYear: number;
  last12Months: number;
  lifetime: number;
  milesDriven: number;
  /** Lifetime spend divided by miles driven; null until there is spend and distance. */
  costPerMile: number | null;
  /** Twelve months, oldest first, ending with the current month. */
  monthly: { month: string; total: number }[];
  byCategory: { category: CostCategory; total: number }[];
}

export function recordCost(r: Pick<ServiceRecord, 'totalCost' | 'itemCosts'>): number {
  if (r.totalCost !== undefined) return r.totalCost;
  return Object.values(r.itemCosts ?? {}).reduce((a, b) => a + b, 0);
}

/** Splits one visit's cost across categories: per-item costs first, the rest equally over its services. */
export function categorySplit(r: ServiceRecord, items: readonly ServiceItem[]): Partial<Record<CostCategory, number>> {
  const out: Partial<Record<CostCategory, number>> = {};
  const add = (c: CostCategory, v: number) => (out[c] = (out[c] ?? 0) + v);
  const catOf = (key: string) => costCategoryOf(items.find((i) => i.key === key)?.category ?? 'Other');

  const total = recordCost(r);
  const itemized = Object.entries(r.itemCosts ?? {});
  let assigned = 0;
  for (const [key, v] of itemized) {
    add(catOf(key), v);
    assigned += v;
  }
  const rest = Math.max(0, total - assigned);
  if (rest > 0) {
    const keys = itemized.length ? [] : r.itemKeys;
    if (keys.length) for (const k of keys) add(catOf(k), rest / keys.length);
    else add('Other', rest);
  }
  return out;
}

const monthOf = (d: ISODate) => d.slice(0, 7);

export function computeCosts(input: {
  records: readonly ServiceRecord[];
  items: readonly ServiceItem[];
  today: ISODate;
  /** Lowest and highest odometer values seen (readings, records, purchase). */
  odometerRange: { first: number; last: number } | null;
}): CostSummary {
  const { items, today } = input;
  const records = input.records.filter((r) => !r.deletedAt);
  const year = today.slice(0, 4);
  const cutoff = addMonths(today, -12);

  let thisYear = 0;
  let last12Months = 0;
  let lifetime = 0;
  const byCat = new Map<CostCategory, number>();
  const months: { month: string; total: number }[] = [];
  for (let i = 11; i >= 0; i--) months.push({ month: monthOf(addMonths(`${monthOf(today)}-01`, -i)), total: 0 });

  for (const r of records) {
    const cost = recordCost(r);
    if (cost <= 0) continue;
    lifetime += cost;
    if (r.date.startsWith(year)) thisYear += cost;
    if (r.date > cutoff && r.date <= today) last12Months += cost;
    const bucket = months.find((m) => m.month === monthOf(r.date));
    if (bucket) bucket.total += cost;
    for (const [c, v] of Object.entries(categorySplit(r, items)) as [CostCategory, number][]) byCat.set(c, (byCat.get(c) ?? 0) + v);
  }

  const milesDriven = input.odometerRange ? Math.max(0, input.odometerRange.last - input.odometerRange.first) : 0;
  return {
    thisYear,
    last12Months,
    lifetime,
    milesDriven,
    costPerMile: lifetime > 0 && milesDriven > 0 ? lifetime / milesDriven : null,
    monthly: months,
    byCategory: COST_CATEGORIES.map((category) => ({ category, total: byCat.get(category) ?? 0 })),
  };
}
