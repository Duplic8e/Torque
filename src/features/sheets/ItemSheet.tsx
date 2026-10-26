import { useState } from 'preact/hooks';
import { BottomSheet } from '../../core/components/BottomSheet';
import { Toggle } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { StatusChip } from '../../core/components/StatusChip';
import { useAppData, useUi } from '../../core/context';
import { fmtDateLong, fmtDateShort, fmtNum, remainingLabel } from '../../core/format';
import type { ServiceItem } from '../../data/types';

const orNone = (n: number | undefined, unit: string) => (n === undefined ? 'None' : `${fmtNum(n)} ${unit}`);

export function ItemSheet({ itemKey }: { itemKey: string }) {
  const { items, due, records, vehicle, repo } = useAppData();
  const ui = useUi();
  const item = items.find((i) => i.key === itemKey);
  const d = due.items.find((i) => i.key === itemKey);
  const [editing, setEditing] = useState(false);
  if (!item) return null;

  const history = records.filter((r) => r.itemKeys.includes(item.key));
  const severe = vehicle.drivingStyle === 'severe';

  return (
    <BottomSheet title={item.name} onClose={ui.closeSheet}>
      {editing ? (
        <ItemEditor item={item} onDone={() => setEditing(false)} />
      ) : (
        <>
          {d && (
            <div class="card-flat">
              <div class="item-card-top">
                <strong>{remainingLabel(d, vehicle.units)}</strong>
                <StatusChip status={d.status} unknown={d.unknownBaseline} />
              </div>
              <dl class="facts">
                <dt>Next due</dt>
                <dd>
                  {d.dueMiles !== undefined && `${fmtNum(d.dueMiles)} ${vehicle.units}`}
                  {d.dueMiles !== undefined && d.dueDate && ' or '}
                  {d.dueDate && fmtDateLong(d.dueDate)}
                  {d.unknownBaseline && 'Now'}
                </dd>
                <dt>Last done</dt>
                <dd>{d.lastDone ? `${fmtDateLong(d.lastDone.date)} at ${fmtNum(d.lastDone.odometer)} ${vehicle.units}` : 'Not sure'}</dd>
              </dl>
            </div>
          )}
          <dl class="facts">
            <dt>Interval{severe ? ' (severe)' : ''}</dt>
            <dd>
              {orNone(severe && item.severeMiles !== undefined ? item.severeMiles : item.intervalMiles, vehicle.units)} /{' '}
              {orNone(severe && item.severeMonths !== undefined ? item.severeMonths : item.intervalMonths, 'mo')}
            </dd>
            {item.notes && (<><dt>Notes</dt><dd>{item.notes}</dd></>)}
          </dl>

          <div class="row">
            <button
              type="button"
              class="btn btn-primary"
              disabled={!item.enabled}
              onClick={() => {
                ui.closeSheet();
                ui.openSheet({ type: 'log', presetKeys: [item.key] });
              }}
            >
              Mark done
            </button>
            <button type="button" class="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
          </div>

          <h3 class="section-title">History</h3>
          {history.length === 0 && <p class="muted">No visits logged for this item.</p>}
          {history.map((r) => (
            <div key={r.id} class="history-line">
              <span>{fmtDateShort(r.date)}</span>
              <span class="num muted">{fmtNum(r.odometer)} {vehicle.units}</span>
            </div>
          ))}
        </>
      )}
      {!editing && !item.enabled && (
        <button type="button" class="btn btn-secondary btn-block" onClick={() => void repo.updateItem(item.id, { enabled: true })}>
          Enable tracking
        </button>
      )}
    </BottomSheet>
  );
}

function ItemEditor({ item, onDone }: { item: ServiceItem; onDone: () => void }) {
  const { repo, vehicle } = useAppData();
  const [miles, setMiles] = useState(item.intervalMiles);
  const [months, setMonths] = useState(item.intervalMonths);
  const [sMiles, setSMiles] = useState(item.severeMiles);
  const [sMonths, setSMonths] = useState(item.severeMonths);
  const [enabled, setEnabled] = useState(item.enabled);

  const save = async () => {
    // `|| undefined` turns an emptied or zero field into "no limit on this axis".
    await repo.updateItem(item.id, {
      intervalMiles: miles || undefined,
      intervalMonths: months || undefined,
      severeMiles: sMiles || undefined,
      severeMonths: sMonths || undefined,
      enabled,
    });
    onDone();
  };

  return (
    <>
      <p class="muted">Leave a field empty to ignore that limit. Severe values apply when driving style is Severe.</p>
      <NumberInput label={`Every (${vehicle.units})`} value={miles} onChange={setMiles} />
      <NumberInput label="Every (months)" value={months} onChange={setMonths} />
      <NumberInput label={`Severe: every (${vehicle.units})`} value={sMiles} onChange={setSMiles} />
      <NumberInput label="Severe: every (months)" value={sMonths} onChange={setSMonths} />
      <Toggle label="Track this item" checked={enabled} onChange={setEnabled} />
      <div class="row">
        <button type="button" class="btn btn-primary" onClick={() => void save()}>Save</button>
        <button type="button" class="btn btn-secondary" onClick={onDone}>Cancel</button>
      </div>
    </>
  );
}
