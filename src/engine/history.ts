import type { Category, ServiceItem, ServiceRecord } from '../data/types';

export interface HistoryFilter {
  query: string;
  category?: Category;
  year?: number;
  who: 'all' | 'diy' | 'shop';
}

export const NO_FILTER: HistoryFilter = { query: '', who: 'all' };

/** Matches services, shop, notes and parts; every search word must appear somewhere. */
export function filterRecords(records: readonly ServiceRecord[], items: readonly ServiceItem[], f: HistoryFilter): ServiceRecord[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const itemOf = (key: string) => items.find((i) => i.key === key);
  return records.filter((r) => {
    if (r.deletedAt) return false;
    if (f.year !== undefined && !r.date.startsWith(String(f.year))) return false;
    if (f.who === 'diy' && !r.diy) return false;
    if (f.who === 'shop' && r.diy) return false;
    if (f.category && !r.itemKeys.some((k) => itemOf(k)?.category === f.category)) return false;
    if (words.length === 0) return true;
    const haystack = [...r.itemKeys.map((k) => itemOf(k)?.name ?? k), r.shop, r.notes, r.parts].join(' ').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Reverse-chronological groups keyed by 'YYYY-MM'. */
export function groupByMonth(records: readonly ServiceRecord[]): { month: string; records: ServiceRecord[] }[] {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer);
  const groups: { month: string; records: ServiceRecord[] }[] = [];
  for (const r of sorted) {
    const month = r.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.records.push(r);
    else groups.push({ month, records: [r] });
  }
  return groups;
}

export function recordYears(records: readonly ServiceRecord[]): number[] {
  return [...new Set(records.filter((r) => !r.deletedAt).map((r) => Number(r.date.slice(0, 4))))].sort((a, b) => b - a);
}
