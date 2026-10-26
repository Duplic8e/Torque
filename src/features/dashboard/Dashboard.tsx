import { ClusterGauge } from '../../core/components/ClusterGauge';
import { InstallHint } from '../../core/components/InstallHint';
import { OdometerDisplay } from '../../core/components/OdometerDisplay';
import { ProgressBar } from '../../core/components/ProgressBar';
import { StatusChip } from '../../core/components/StatusChip';
import { useAppData, useUi } from '../../core/context';
import { agoLabel, fmtDateShort, remainingLabel } from '../../core/format';
import { backupNeeded } from '../../engine/backup';
import { worstStatus } from '../../engine/health';
import { hrefFor } from '../../router';
import { useSyncStatus } from '../../sync';

const NUDGE_AFTER_DAYS = 14;

export function Dashboard() {
  const { vehicle, due, today, settings, repo } = useAppData();
  const sync = useSyncStatus();
  // With cloud sync on, the manual backup nudge gives way to the sync-failure banner.
  const needsBackup = !sync.configured && backupNeeded(settings, vehicle.createdAt, today);
  const ui = useUi();
  const { mileage } = due;
  const tracked = due.items.filter((i) => i.status !== 'inspect');
  const upNext = tracked.slice(0, 3);
  const stale = mileage.lastReading !== null && mileage.daysSinceReading > NUDGE_AFTER_DAYS;
  const unsure = due.items.filter((i) => i.unknownBaseline).length;
  const counts = {
    overdue: tracked.filter((i) => i.status === 'overdue').length,
    soon: tracked.filter((i) => i.status === 'soon').length,
    ok: tracked.filter((i) => i.status === 'ok').length,
  };

  return (
    <>
      <div class="hero-meta">
        <span class="muted">{vehicle.year} {vehicle.trim} 2.5 Turbo</span>
        {sync.description && (
          <a class={`sync-line sync-${sync.description.tone}`} href={hrefFor('settings')} aria-label={`Cloud sync: ${sync.description.label}`}>
            <span class="sync-dot" aria-hidden="true" /> {sync.description.label}
          </a>
        )}
      </div>

      <ClusterGauge score={due.health} worst={worstStatus(due.items)}>
        <button type="button" class="odo-button" onClick={() => ui.openSheet({ type: 'odometer' })}>
          <OdometerDisplay value={mileage.miles} />
          <span class="odo-unit">{vehicle.units}{mileage.isEstimated ? ' est.' : ''}</span>
          <span class="visually-hidden">, tap to update odometer</span>
        </button>
        <span class="hub-caption">
          {mileage.lastReading ? `Updated ${agoLabel(mileage.lastReading.date, today)}` : 'No reading yet'}
          {mileage.confidence === 'low' ? ', low confidence' : ''}
        </span>
        <span class="hub-health" aria-label={`Health score ${due.health} out of 100`}>
          Health <strong class="num">{due.health}</strong>
        </span>
      </ClusterGauge>

      <nav class="lamps" aria-label="Status summary">
        <a class="lamp lamp-overdue" href={hrefFor('schedule')}><span class="lamp-dot" aria-hidden="true" /><span class="num">{counts.overdue}</span> overdue</a>
        <a class="lamp lamp-soon" href={hrefFor('schedule')}><span class="lamp-dot" aria-hidden="true" /><span class="num">{counts.soon}</span> due soon</a>
        <a class="lamp lamp-ok" href={hrefFor('schedule')}><span class="lamp-dot" aria-hidden="true" /><span class="num">{counts.ok}</span> fine</a>
      </nav>

      {stale && (
        <button type="button" class="nudge" onClick={() => ui.openSheet({ type: 'odometer' })}>
          Last reading was {agoLabel(mileage.lastReading!.date, today)}. Update the odometer to keep dates accurate.
        </button>
      )}

      <InstallHint />

      {!settings.scheduleReviewed && (
        <section class="callout">
          <strong>Review your schedule</strong>
          <p class="muted">The default intervals are typical Mazda figures. Check them against your maintenance booklet.</p>
          <div class="row">
            <a class="btn btn-secondary" href={hrefFor('schedule')}>Open schedule</a>
            <button type="button" class="btn-text" onClick={() => void repo.updateSettings({ scheduleReviewed: true })}>Dismiss</button>
          </div>
        </section>
      )}

      {sync.description?.banner && (
        <section class="callout callout-alert">
          <strong>Cloud sync has not worked for over a day</strong>
          <p class="muted">{sync.description.label}. Your data is safe on this phone, but it is not backed up.</p>
          <a class="btn btn-secondary" href={hrefFor('settings')}>Fix in settings</a>
        </section>
      )}

      {needsBackup && (
        <section class="callout">
          <strong>Back up your data</strong>
          <p class="muted">
            {settings.lastBackupAt ? `Last backup ${agoLabel(settings.lastBackupAt.slice(0, 10), today)}.` : 'You have not made a backup yet.'} Export one to
            Files or iCloud Drive so nothing is lost with the phone.
          </p>
          <a class="btn btn-secondary" href={hrefFor('settings')}>Open backup settings</a>
        </section>
      )}

      <h2 class="section-title">Up next</h2>
      {upNext.length === 0 ? (
        <p class="muted">Nothing to show. Add services in the schedule.</p>
      ) : (
        <div class="group">
          {upNext.map((i) => (
            <button key={i.key} type="button" class="list-row" onClick={() => ui.openSheet({ type: 'item', key: i.key })}>
              <span class="row-top">
                <span class="row-title">{i.name}</span>
                <StatusChip status={i.status} unknown={i.unknownBaseline} />
              </span>
              <ProgressBar progress={i.progress} status={i.status} label={`${i.name}: ${Math.round(Math.min(1, i.progress) * 100)}% of interval used`} />
              <span class="row-bottom">
                <span>{remainingLabel(i, vehicle.units)}</span>
                {i.projectedDate && !i.unknownBaseline && <span class="num">around {fmtDateShort(i.projectedDate)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {unsure > 0 && <p class="footnote">{unsure} item{unsure === 1 ? ' has' : 's have'} no history yet. Log a service to start tracking {unsure === 1 ? 'it' : 'them'}.</p>}

      <div class="quick-actions">
        <button type="button" class="btn btn-secondary" onClick={() => ui.openSheet({ type: 'odometer' })}>Update odometer</button>
        <button type="button" class="btn btn-secondary" onClick={() => ui.openSheet({ type: 'log' })}>Log service</button>
      </div>
    </>
  );
}
