import { StatusChip } from '../../core/components/StatusChip';
import { useAppData, useUi } from '../../core/context';
import { remainingLabel } from '../../core/format';
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
    <button key={i.key} type="button" class="card list-row" onClick={() => ui.openSheet({ type: 'item', key: i.key })}>
      <div class="item-card-top">
        <strong>{i.name}</strong>
        <StatusChip status={i.status} unknown={i.unknownBaseline} />
      </div>
      <span class="muted">{remainingLabel(i, vehicle.units)}</span>
    </button>
  );

  return (
    <>
      {GROUPS.map((g) => {
        const rows = due.items.filter((i) => g.match(i.status));
        return rows.length === 0 ? null : (
          <section key={g.title}>
            <h2 class="section-title">{g.title}</h2>
            {rows.map(row)}
          </section>
        );
      })}
      {disabled.length > 0 && (
        <section>
          <h2 class="section-title">Disabled</h2>
          {disabled.map((i) => (
            <button key={i.key} type="button" class="card list-row" onClick={() => ui.openSheet({ type: 'item', key: i.key })}>
              <strong>{i.name}</strong>
              <span class="muted">Not tracked</span>
            </button>
          ))}
        </section>
      )}
      <button type="button" class="btn btn-secondary btn-block" onClick={() => ui.openSheet({ type: 'addItem' })}>
        Add custom item
      </button>
    </>
  );
}
