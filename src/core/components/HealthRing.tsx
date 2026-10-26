const R = 42;
const C = 2 * Math.PI * R;

export function HealthRing({ score, worst }: { score: number; worst: 'ok' | 'soon' | 'overdue' }) {
  return (
    <div class="ring" role="img" aria-label={`Health score ${score} out of 100`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} class="ring-track" />
        <circle
          cx="50"
          cy="50"
          r={R}
          class={`ring-value ring-${worst}`}
          stroke-dasharray={`${(score / 100) * C} ${C}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div class="ring-label num">
        <strong>{score}</strong>
        <span class="muted">health</span>
      </div>
    </div>
  );
}
