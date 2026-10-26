import type { Status } from '../../engine/due';

const TEXT: Record<Status, string> = { ok: 'Fine', soon: 'Due soon', overdue: 'Overdue', inspect: 'Check' };

/** A status lamp: a coloured dot plus text, so colour is never the only signal. */
export function StatusChip({ status, unknown = false }: { status: Status; unknown?: boolean }) {
  return (
    <span class={`chip chip-${status}`}>
      <span class="chip-dot" aria-hidden="true" />
      {unknown ? 'Not sure' : TEXT[status]}
    </span>
  );
}
