import type { Status } from '../../engine/due';

/** Ten-segment bar, read like the fuel gauge. `progress` runs 0 to 1.2; the bar is full at 1. */
export function ProgressBar({ progress, status, label }: { progress: number; status: Status; label: string }) {
  const pct = Math.min(1, progress) * 100;
  return (
    <div class="gauge" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div class={`gauge-fill gauge-${status}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
