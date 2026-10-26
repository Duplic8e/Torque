import type { Status } from '../../engine/due';

const TEXT: Record<Status, string> = { ok: 'OK', soon: 'Due soon', overdue: 'Overdue', inspect: 'Check' };

/** Always carries text so colour is never the only signal. */
export function StatusChip({ status, unknown = false }: { status: Status; unknown?: boolean }) {
  return <span class={`chip chip-${status}`}>{unknown ? 'Not sure' : TEXT[status]}</span>;
}

