import { CategoryBar, MonthlyBars } from '../../core/components/charts';
import { useAppData, useUi } from '../../core/context';
import { fmtMoney, fmtNum } from '../../core/format';
import { computeCosts } from '../../engine/costs';

export function Costs() {
  const { records, items, readings, vehicle, due, today } = useAppData();
  const ui = useUi();

  const values = [
    ...readings.filter((r) => !r.isCorrection).map((r) => r.value),
    ...records.filter((r) => !r.deletedAt).map((r) => r.odometer),
    ...(vehicle.purchaseOdometer !== undefined ? [vehicle.purchaseOdometer] : []),
  ];
  const c = computeCosts({
    records,
    items,
    today,
    odometerRange: values.length ? { first: Math.min(...values), last: Math.max(...values) } : null,
  });
  const avgPerMonth = Math.round((due.mileage.ratePerDay * 365) / 12);

  if (c.lifetime === 0) {
    return (
      <section class="card empty">
        <h2>No costs yet</h2>
        <p class="muted">Add a cost when you log a service and your spending charts appear here.</p>
        <button type="button" class="btn btn-primary" onClick={() => ui.openSheet({ type: 'log' })}>Log service</button>
        <p class="muted">Average driving: about {fmtNum(avgPerMonth)} {vehicle.units} a month.</p>
      </section>
    );
  }

  return (
    <>
      <div class="stat-grid">
        <div class="card stat"><span class="muted">This year</span><strong class="num">{fmtMoney(c.thisYear)}</strong></div>
        <div class="card stat"><span class="muted">Last 12 months</span><strong class="num">{fmtMoney(c.last12Months)}</strong></div>
        <div class="card stat"><span class="muted">Lifetime</span><strong class="num">{fmtMoney(c.lifetime)}</strong></div>
      </div>
      <div class="stat-grid two">
        <div class="card stat">
          <span class="muted">Cost per {vehicle.units === 'mi' ? 'mile' : 'km'}</span>
          <strong class="num">{c.costPerMile === null ? 'Not enough data' : `$${c.costPerMile.toFixed(3)}`}</strong>
        </div>
        <div class="card stat">
          <span class="muted">Driving per month</span>
          <strong class="num">{fmtNum(avgPerMonth)} {vehicle.units}</strong>
        </div>
      </div>

      <h2 class="section-title">Spend per month</h2>
      <section class="card"><MonthlyBars data={c.monthly} /></section>

      <h2 class="section-title">By category</h2>
      <section class="card"><CategoryBar data={c.byCategory} /></section>
    </>
  );
}
