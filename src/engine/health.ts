import type { ItemDue, Status } from './due';

/** 100 minus 10 per due-soon item and 25 per overdue item, floored at 0. Inspect items do not count. */
export function healthScore(items: readonly ItemDue[]): number {
  let score = 100;
  for (const item of items) {
    if (item.status === 'soon') score -= 10;
    else if (item.status === 'overdue') score -= 25;
  }
  return Math.max(0, score);
}

/** The worst status present, used to colour the health ring. */
export function worstStatus(items: readonly ItemDue[]): Exclude<Status, 'inspect'> {
  if (items.some((i) => i.status === 'overdue')) return 'overdue';
  if (items.some((i) => i.status === 'soon')) return 'soon';
  return 'ok';
}

/** Items that need attention now: overdue plus due soon. This is the app icon badge count. */
export function attentionCount(items: readonly ItemDue[]): number {
  return items.filter((i) => i.status === 'overdue' || i.status === 'soon').length;
}
