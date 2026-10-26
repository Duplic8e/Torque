import { useState } from 'preact/hooks';
import { BottomSheet } from '../../core/components/BottomSheet';
import { DateInput, TextInput, Toggle } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { useAppData, useUi } from '../../core/context';
import { fmtDateShort, fmtNum } from '../../core/format';
import { OdometerRegressionError } from '../../data/repo';
import type { MileagePoint } from '../../engine/mileage';

interface Props {
  mode: 'service' | 'note';
  presetKeys: string[];
}

export function LogServiceSheet({ mode, presetKeys }: Props) {
  const { repo, vehicle, items, records, due, today } = useAppData();
  const ui = useUi();
  const note = mode === 'note';

  const [date, setDate] = useState(today);
  const [odometer, setOdometer] = useState<number | undefined>(Math.round(due.mileage.miles) || undefined);
  const [keys, setKeys] = useState<string[]>(presetKeys);
  const [cost, setCost] = useState('');
  const [shop, setShop] = useState('');
  const [diy, setDiy] = useState(false);
  const [parts, setParts] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(presetKeys.length > 0);
  const [warning, setWarning] = useState<MileagePoint | null>(null);
  const [error, setError] = useState('');

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setTouched(true);
    setWarning(null);
    setError('');
  };
  const shops = [...new Set(records.map((r) => r.shop).filter((s): s is string => !!s))];
  const toggleKey = (key: string) => touch(setKeys)(keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]);

  const save = async (allowCorrection: boolean) => {
    if (odometer === undefined) return setError('Enter the odometer reading.');
    if (!note && keys.length === 0) return setError('Pick at least one service.');
    if (note && !notes.trim()) return setError('Write a note.');
    const totalCost = cost.trim() === '' ? undefined : Number(cost.replace(/[^0-9.]/g, ''));
    try {
      const rec = await repo.addRecord(
        {
          vehicleId: vehicle.id,
          date,
          odometer,
          itemKeys: note ? [] : keys,
          totalCost: Number.isFinite(totalCost) ? totalCost : undefined,
          shop: shop.trim() || undefined,
          diy: note ? false : diy,
          parts: parts.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        { allowCorrection },
      );
      ui.closeSheet();
      ui.showToast({ message: note ? 'Note saved' : 'Service logged', actionLabel: 'Undo', onAction: () => void repo.deleteRecord(rec.id) });
    } catch (e) {
      if (e instanceof OdometerRegressionError) setWarning(e.previous);
      else throw e;
    }
  };

  return (
    <BottomSheet title={note ? 'Add note' : 'Log service'} onClose={ui.closeSheet} dirty={touched}>
      <DateInput label="Date" value={date} onChange={touch(setDate)} />
      <NumberInput label={`Odometer (${vehicle.units})`} value={odometer} large onChange={touch(setOdometer)} />

      {!note && (
        <fieldset class="field">
          <legend class="field-label">Services done</legend>
          <div class="chips">
            {items.filter((i) => i.enabled).map((i) => (
              <button key={i.key} type="button" class="select-chip" aria-pressed={keys.includes(i.key)} onClick={() => toggleKey(i.key)}>
                {i.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {!note && <TextInput label="Total cost" value={cost} inputMode="decimal" placeholder="Optional" onChange={touch(setCost)} />}
      {!note && <TextInput label="Shop" value={shop} list="shops" placeholder="Optional" onChange={touch(setShop)} />}
      <datalist id="shops">{shops.map((s) => <option key={s} value={s} />)}</datalist>
      {!note && <Toggle label="Did it myself (DIY)" checked={diy} onChange={touch(setDiy)} />}
      {!note && <TextInput label="Parts used" value={parts} placeholder="e.g. 0W-20 oil, filter part number" onChange={touch(setParts)} />}
      <label class="field">
        <span class="field-label">Notes</span>
        <textarea class="input" rows={3} value={notes} onInput={(e) => touch(setNotes)((e.currentTarget as HTMLTextAreaElement).value)} />
      </label>

      {error && <p class="error" role="alert">{error}</p>}
      {warning ? (
        <div class="warning" role="alert">
          <p>
            That is lower than the {fmtNum(warning.value)} {vehicle.units} reading on {fmtDateShort(warning.date)}.
          </p>
          <div class="row">
            <button type="button" class="btn" onClick={() => setWarning(null)}>Fix</button>
            <button type="button" class="btn btn-secondary" onClick={() => void save(true)}>Save anyway (correction)</button>
          </div>
        </div>
      ) : (
        <button type="button" class="btn btn-primary btn-block" onClick={() => void save(false)}>Save</button>
      )}
    </BottomSheet>
  );
}
