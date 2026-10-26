import { useState } from 'preact/hooks';
import { fmtMoney, fmtMonth } from '../format';
import { COST_CATEGORIES, type CostCategory } from '../../engine/costs';

const W = 340;
const H = 170;
const M = { left: 40, right: 4, top: 8, bottom: 22 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const BAR_W = 14;
const R = 4;

/** Rounds up to 1, 2 or 5 times a power of ten so gridlines land on tidy values. */
export function niceMax(v: number): number {
  if (v <= 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const compactMoney = (n: number) => (n >= 1000 ? `$${n / 1000}k` : `$${n}`);
const monthShort = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

/** Single-series monthly spend: thin bars with rounded data-ends, anchored to the baseline. */
export function MonthlyBars({ data }: { data: { month: string; total: number }[] }) {
  const [sel, setSel] = useState(data.length - 1);
  const max = niceMax(Math.max(...data.map((d) => d.total)));
  const slot = PLOT_W / data.length;
  const base = M.top + PLOT_H;
  const ticks = [0, max / 2, max];
  const picked = data[sel];

  return (
    <figure class="chart">
      <figcaption class="chart-readout num" aria-live="polite">
        {picked ? `${fmtMonth(`${picked.month}-01`)}: ${fmtMoney(picked.total)}` : ''}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Spend per month, last 12 months">
        {ticks.map((t) => {
          const y = base - (t / max) * PLOT_H;
          return (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y} y2={y} class="chart-grid" />
              <text x={M.left - 6} y={y + 4} text-anchor="end" class="chart-axis">{compactMoney(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = M.left + i * slot + (slot - BAR_W) / 2;
          const h = (d.total / max) * PLOT_H;
          const r = Math.min(R, h / 2);
          return (
            <g key={d.month}>
              {h > 0 && (
                <path
                  class="chart-bar"
                  opacity={i === sel ? 1 : 0.55}
                  d={`M${x},${base}V${base - h + r}a${r},${r} 0 0 1 ${r},${-r}H${x + BAR_W - r}a${r},${r} 0 0 1 ${r},${r}V${base}Z`}
                />
              )}
              {i % 2 === 0 && <text x={x + BAR_W / 2} y={H - 6} text-anchor="middle" class="chart-axis">{monthShort(d.month)}</text>}
              <rect
                class="chart-hit"
                x={M.left + i * slot}
                y={M.top}
                width={slot}
                height={PLOT_H + M.bottom}
                tabIndex={0}
                role="button"
                aria-label={`${fmtMonth(`${d.month}-01`)}, ${fmtMoney(d.total)}`}
                onClick={() => setSel(i)}
                onFocus={() => setSel(i)}
              />
            </g>
          );
        })}
      </svg>
      <details class="chart-table">
        <summary>View as table</summary>
        <table>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}><th scope="row">{fmtMonth(`${d.month}-01`)}</th><td class="num">{fmtMoney(d.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

const BAR_H = 16;

/** One horizontal stacked bar; the legend below carries every value, so identity never rests on colour alone. */
export function CategoryBar({ data }: { data: { category: CostCategory; total: number }[] }) {
  const total = data.reduce((a, d) => a + d.total, 0);
  const shown = data.filter((d) => d.total > 0);
  let x = 0;
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${BAR_H}`} role="img" aria-label="Spend by category" class="stack">
        <clipPath id="stack-clip"><rect width={W} height={BAR_H} rx={R} /></clipPath>
        <g clip-path="url(#stack-clip)">
          {shown.map((d) => {
            const w = (d.total / total) * W;
            const rect = <rect key={d.category} x={x} width={w} height={BAR_H} class={`series-${COST_CATEGORIES.indexOf(d.category) + 1}`} stroke="var(--color-surface)" stroke-width="2" />;
            x += w;
            return rect;
          })}
        </g>
      </svg>
      <ul class="legend">
        {shown.map((d) => (
          <li key={d.category}>
            <span class={`swatch sw-${COST_CATEGORIES.indexOf(d.category) + 1}`} aria-hidden="true" />
            <span class="legend-name">{d.category}</span>
            <span class="num">{fmtMoney(d.total)}</span>
            <span class="num muted legend-pct">{Math.round((d.total / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
