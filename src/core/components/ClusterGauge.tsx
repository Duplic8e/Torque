import type { ComponentChildren } from 'preact';

const CX = 150;
const CY = 150;
const R = 122; // the arc
const SWEEP = 240; // degrees, from -120 (lower left) to +120 (lower right)

/** Point on a circle, with 0 degrees pointing up and angles growing clockwise. */
function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)];
}

function arcPath(r: number, from: number, to: number): string {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)}A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

const TICKS = Array.from({ length: 21 }, (_, i) => i); // every 5 points, major every 10

interface Props {
  /** 0 to 100 */
  score: number;
  /** Colours the lit arc; 'neutral' is for screens with no status, such as the welcome screen. */
  worst: 'ok' | 'soon' | 'overdue' | 'neutral';
  /** The hub: odometer and readings, laid over the dial. */
  children: ComponentChildren;
}

/**
 * The instrument cluster: a 240-degree dial with tick marks, the health score as a lit arc, and
 * a Soul Red needle that sweeps to the score once on launch.
 */
export function ClusterGauge({ score, worst, children }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const needleAngle = -SWEEP / 2 + (SWEEP * clamped) / 100;
  const [x1, y1] = polar(R - 20, 0);
  const [x2, y2] = polar(R + 10, 0);

  return (
    <div class="cluster">
      <svg class="cluster-dial" viewBox="0 0 300 236" aria-hidden="true">
        <path class="cluster-track" d={arcPath(R, -SWEEP / 2, SWEEP / 2)} />
        {clamped > 0 && (
          <path class={`cluster-value cluster-${worst}`} d={arcPath(R, -SWEEP / 2, -SWEEP / 2 + (SWEEP * clamped) / 100)} />
        )}
        {TICKS.map((i) => {
          const major = i % 2 === 0;
          const a = -SWEEP / 2 + (SWEEP * i) / 20;
          const [ax, ay] = polar(R - 12, a);
          const [bx, by] = polar(R - (major ? 24 : 18), a);
          return <line key={i} class={major ? 'cluster-tick major' : 'cluster-tick'} x1={ax} y1={ay} x2={bx} y2={by} />;
        })}
        {[0, 50, 100].map((v) => {
          const [tx, ty] = polar(R - 38, -SWEEP / 2 + (SWEEP * v) / 100);
          return <text key={v} class="cluster-scale" x={tx} y={ty + 4} text-anchor="middle">{v}</text>;
        })}
        <g class="cluster-needle" style={{ transform: `rotate(${needleAngle}deg)` }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} />
        </g>
      </svg>
      <div class="cluster-hub">{children}</div>
    </div>
  );
}
