import { ProgressBar } from '../../core/components/ProgressBar';
import { StatusChip } from '../../core/components/StatusChip';
import { useAppData, useUi } from '../../core/context';
import { fmtDateShort, remainingLabel } from '../../core/format';
import type { ItemDue, Status } from '../../engine/due';

const GROUPS: { title: string; match: (s: Status) => boolean }[] = [
  { title: 'Overdue', match: (s) => s === 'overdue' },
  { title: 'Due soon', match: (s) => s === 'soon' },
  { title: 'Upcoming', match: (s) => s === 'ok' },
  { title: 'Inspect-only', match: (s) => s === 'inspect' },
];

export function Schedule() {
  const { due, items, vehicle } = useAppData();
  const ui = useUi();
  const disabled = items.filter((i) => !i.enabled);

  const row = (i: ItemDue) => (
    <button key={i.key} type="button" class="list-row" onClick={() => ui.openSheet({ type: 'item', key: i.key })}>
      <span class="row-top">
        <span class="row-title">{i.name}</span>
        <StatusChip status={i.status} unknown={i.unknownBaseline} />
      </span>
      {!i.unknownBaseline && (
        <ProgressBar progress={i.progress} status={i.status} label={`${i.name}: ${Math.round(Math.min(1, i.progress) * 100)}% of interval used`} />
      )}
      <span class="row-bottom">
        <span>{remainingLabel(i, vehicle.units)}</span>
        {i.projectedDate && !i.unknownBaseline && i.status !== 'overdue' && <span class="num">around {fmtDateShort(i.projectedDate)}</span>}
      </span>
    </button>
  );

  return (
    <>
      {GROUPS.map((g) => {
        const rows = due.items.filter((i) => g.match(i.status));
        return rows.length === 0 ? null : (
          <section key={g.title}>
            <h2 class="section-title">{g.title}</h2>
            <div class="group">{rows.map(row)}</div>
          </section>
        );
      })}
      {disabled.length > 0 && (
        <section>
          <h2 class="section-title">Disabled</h2>
          <div class="group">
            {disabled.map((i) => (
              <button key={i.key} type="button" class="list-row" onClick={() => ui.openSheet({ type: 'item', key: i.key })}>
                <span class="row-title">{i.name}</span>
                <span class="row-bottom">Not tracked</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <button type="button" class="btn btn-secondary btn-block" onClick={() => ui.openSheet({ type: 'addItem' })}>
        Add custom item
      </button>
    </>
  );
}
