import { fmtNum } from '../format';

/** Large odometer; each digit re-mounts on change so it rolls up. */
export function OdometerDisplay({ value }: { value: number }) {
  const chars = fmtNum(value).split('');
  return (
    <div class="odo num" aria-label={`${fmtNum(value)}`}>
      {chars.map((c, i) => (
        <span key={`${chars.length - i}-${c}`} class={c === ',' ? 'odo-sep' : 'odo-digit'} aria-hidden="true">
          {c}
        </span>
      ))}
    </div>
  );
}
