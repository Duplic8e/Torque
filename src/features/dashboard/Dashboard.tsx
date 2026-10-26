import { HealthRing } from '../../core/components/HealthRing';
import { InstallHint } from '../../core/components/InstallHint';
import { OdometerDisplay } from '../../core/components/OdometerDisplay';
import { ProgressBar } from '../../core/components/ProgressBar';
import { StatusChip } from '../../core/components/StatusChip';
import { useAppData, useUi } from '../../core/context';
import { agoLabel, fmtDateShort, remainingLabel } from '../../core/format';
import { backupNeeded } from '../../engine/backup';
import { worstStatus } from '../../engine/health';
import { hrefFor } from '../../router';

const NUDGE_AFTER_DAYS = 14;

export function Dashboard() {
  const { vehicle, due, today, settings, repo } = useAppData();
  const needsBackup = backupNeeded(settings, vehicle.createdAt, today);
  const ui = useUi();
  const { mileage } = due;
  const upNext = due.items.filter((i) => i.status !== 'inspect').slice(0, 3);
  const stale = mileage.lastReading !== null && mileage.daysSinceReading > NUDGE_AFTER_DAYS;
  const unsure = due.items.filter((i) => i.unknownBaseline).length;

  return (
    <>
      <InstallHint />

      {!settings.scheduleReviewed && (
        <section class="card callout">
          <strong>Review your schedule</strong>
          <p class="muted">The default intervals are typical Mazda figures. Check them against your maintenance booklet.</p>
          <div class="row">
            <a class="btn btn-secondary" href={hrefFor('schedule')}>Open schedule</a>
            <button type="button" class="btn-text" onClick={() => void repo.updateSettings({ scheduleReviewed: true })}>Dismiss</button>
          </div>
        </section>
      )}

      {needsBackup && (
        <section class="card callout">
          <strong>Back up your data</strong>
          <p class="muted">
            {settings.lastBackupAt ? `Last backup ${agoLabel(settings.lastBackupAt.slice(0, 10), today)}.` : 'You have not made a backup yet.'} Export one to
            Files or iCloud Drive so nothing is lost with the phone.
          </p>
          <a class="btn btn-secondary" href={hrefFor('settings')}>Open backup settings</a>
        </section>
      )}

      <section class="card hero">
        <div class="hero-top">
          <div>
            <div class="hero-name">{vehicle.nickname}</div>
            <div class="muted">{vehicle.year} {vehicle.trim} 2.5 Turbo</div>
          </div>
          <HealthRing score={due.health} worst={worstStatus(due.items)} />
        </div>
        <button type="button" class="odo-button" onClick={() => ui.openSheet({ type: 'odometer' })} aria-label="Update odometer">
          <OdometerDisplay value={mileage.miles} />
          <span class="odo-unit muted">{vehicle.units}{mileage.isEstimated ? ' · est.' : ''}</span>
        </button>
        <div class="muted">
          {mileage.lastReading ? `Updated ${agoLabel(mileage.lastReading.date, today)}` : 'No odometer reading yet'}
          {mileage.confidence === 'low' ? ' · low confidence' : ''}
        </div>
        {stale && (
          <button type="button" class="btn btn-secondary" onClick={() => ui.openSheet({ type: 'odometer' })}>
            It has been a while. Update the odometer
          </button>
        )}
      </section>

      <h2 class="section-title">Up next</h2>
      {upNext.length === 0 && <p class="muted">Nothing to show. Add services in the schedule.</p>}
      {upNext.map((i) => (
        <button key={i.key} type="button" class="card item-card" onClick={() => ui.openSheet({ type: 'item', key: i.key })}>
          <div class="item-card-top">
            <strong>{i.name}</strong>
            <StatusChip status={i.status} unknown={i.unknownBaseline} />
          </div>
          <ProgressBar progress={i.progress} status={i.status} />
          <div class="item-card-bottom muted">
            <span>{remainingLabel(i, vehicle.units)}</span>
            {i.projectedDate && !i.unknownBaseline && <span>around {fmtDateShort(i.projectedDate)}</span>}
          </div>
        </button>
      ))}
      {unsure > 0 && <p class="muted">{unsure} item{unsure === 1 ? '' : 's'} have no history yet. Log a service to start tracking them.</p>}

      <div class="quick-actions">
        <button type="button" class="btn btn-secondary" onClick={() => ui.openSheet({ type: 'odometer' })}>Update odometer</button>
        <button type="button" class="btn btn-secondary" onClick={() => ui.openSheet({ type: 'log' })}>Log service</button>
      </div>
    </>
  );
}
