import type { Status } from '../../engine/due';

/** Thin gauge-style bar. `progress` runs 0 to 1.2; the bar fills at 1. */
export function ProgressBar({ progress, status }: { progress: number; status: Status }) {
  const pct = Math.min(1, progress) * 100;
  return (
    <div class="gauge" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div class={`gauge-fill gauge-${status}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
