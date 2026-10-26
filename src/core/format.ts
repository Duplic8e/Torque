import type { ItemDue } from '../engine/due';
import { daysBetween } from './dates';
import type { ISODate, Vehicle } from '../data/types';

export const fmtNum = (n: number): string => Math.round(n).toLocaleString('en-US');

export const fmtMoney = (n: number): string =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 === 0 ? 0 : 2 });

const dateFmt = (opts: Intl.DateTimeFormatOptions) => (d: ISODate) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

export const fmtDateShort = dateFmt({ month: 'short', day: 'numeric' });
export const fmtDateLong = dateFmt({ month: 'short', day: 'numeric', year: 'numeric' });
export const fmtMonth = dateFmt({ month: 'long', year: 'numeric' });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function agoLabel(date: ISODate, today: ISODate): string {
  const d = daysBetween(date, today);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 60) return `${d} days ago`;
  return `${Math.round(d / 30)} months ago`;
}

/** "in 1,240 mi or 47 days", or "Overdue by 120 mi" when any limit has passed. */
export function remainingLabel(item: ItemDue, units: Vehicle['units']): string {
  if (item.unknownBaseline) return 'Due now (no history)';
  const parts: { v: number; text: (abs: number) => string }[] = [];
  if (item.milesLeft !== undefined) parts.push({ v: item.milesLeft, text: (a) => `${fmtNum(a)} ${units}` });
  if (item.daysLeft !== undefined) parts.push({ v: item.daysLeft, text: (a) => plural(a, 'day') });
  const late = parts.filter((p) => p.v <= 0);
  if (late.length) return `Overdue by ${late.map((p) => p.text(Math.abs(p.v))).join(' / ')}`;
  return `in ${parts.map((p) => p.text(p.v)).join(' or ')}`;
}
