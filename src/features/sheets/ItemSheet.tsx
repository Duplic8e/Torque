import { useState } from 'preact/hooks';
import { BottomSheet } from '../../core/components/BottomSheet';
import { Toggle } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { StatusChip } from '../../core/components/StatusChip';
import { useAppData, useUi } from '../../core/context';
import { fmtDateLong, fmtDateShort, fmtMonthDay, fmtNum, remainingLabel } from '../../core/format';
import type { ServiceItem } from '../../data/types';
import { intervalUsage, type AxisUsage, type ItemDue } from '../../engine/due';
import { ProgressBar } from '../../core/components/ProgressBar';

/** "Every 7,500 mi or 12 months", naming only the limits the item has. */
function intervalLabel(miles: number | undefined, months: number | undefined, units: string): string {
  const parts = [miles !== undefined && `${fmtNum(miles)} ${units}`, months !== undefined && `${months} month${months === 1 ? '' : 's'}`].filter(Boolean);
  return parts.length ? `Every ${parts.join(' or ')}` : 'No interval set';
}

const months = (days: number) => Math.round(days / 30.44);

/** One limit as a segmented bar: "6,200 of 8,000 km" or "2 of 6 months". */
function AxisRow({ label, usage, unit, status }: { label: string; usage: AxisUsage; unit: 'distance' | 'time'; status: ItemDue['status'] }) {
  const { used, total } = usage;
  const text =
    unit === 'time'
      ? total < 60
        ? `${used} of ${total} days`
        : `${months(used)} of ${months(total)} months`
      : `${fmtNum(used)} of ${fmtNum(total)}`;
  return (
    <div class="axis">
      <span class="axis-label">{label}</span>
      <ProgressBar progress={Math.min(1.2, used / total)} status={status} label={`${label}: ${text}`} />
      <span class="axis-value num">{text}</span>
    </div>
  );
}

export function ItemSheet({ itemKey }: { itemKey: string }) {
  const { items, due, records, vehicle, repo, today } = useAppData();
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
                <strong class="item-remaining">{remainingLabel(d, vehicle.units)}</strong>
                <StatusChip status={d.status} unknown={d.unknownBaseline} />
              </div>
              {(() => {
                const usage = intervalUsage(d, due.mileage.miles, today);
                return (
                  <>
                    {usage.distance && <AxisRow label={`Distance (${vehicle.units})`} usage={usage.distance} unit="distance" status={d.status} />}
                    {usage.time && <AxisRow label="Time" usage={usage.time} unit="time" status={d.status} />}
                  </>
                );
              })()}
              {d.seasonal ? (
                <dl class="facts">
                  <dt>On the car now</dt>
                  <dd>{d.seasonal.mounted === 'winter' ? 'Winter' : 'Summer'} tires, since {fmtDateLong(d.seasonal.since)}{d.lastDone ? '' : ' (assumed)'}</dd>
                  <dt>Next swap</dt>
                  <dd>{d.seasonal.next === 'winter' ? 'Winter' : 'Summer'} tires on by {d.dueDate && fmtDateLong(d.dueDate)}</dd>
                </dl>
              ) : (
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
              )}
            </div>
          )}
          <dl class="facts">
            <dt>{item.seasonal ? 'Schedule' : `Interval${severe ? ' (severe)' : ''}`}</dt>
            <dd>
              {item.seasonal
                ? `Winter tires by ${fmtMonthDay(item.seasonal.winterOn)}, summer tires by ${fmtMonthDay(item.seasonal.summerOn)}. Change in Settings.`
                : intervalLabel(
                    severe && item.severeMiles !== undefined ? item.severeMiles : item.intervalMiles,
                    severe && item.severeMonths !== undefined ? item.severeMonths : item.intervalMonths,
                    vehicle.units,
                  )}
            </dd>
            {item.notes && (<><dt>Notes</dt><dd>{item.notes}</dd></>)}
          </dl>

          <div class="row action-pair">
            <button
              type="button"
              class="btn btn-primary"
              disabled={!item.enabled}
              onClick={() => {
                ui.closeSheet();
                ui.openSheet({ type: 'log', presetKeys: [item.key] });
              }}
            >
              {item.seasonal ? 'Log swap' : 'Mark done'}
            </button>
            {!item.seasonal && <button type="button" class="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
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
