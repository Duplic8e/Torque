import { useState } from 'preact/hooks';
import { BottomSheet } from '../../core/components/BottomSheet';
import { DateInput } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { useAppData, useUi } from '../../core/context';
import { fmtDateShort, fmtNum } from '../../core/format';
import { OdometerRegressionError } from '../../data/repo';
import type { MileagePoint } from '../../engine/mileage';

export function OdometerSheet() {
  const { repo, vehicle, due, today } = useAppData();
  const ui = useUi();
  const [value, setValue] = useState<number | undefined>(Math.round(due.mileage.miles) || undefined);
  const [date, setDate] = useState(today);
  const [touched, setTouched] = useState(false);
  const [warning, setWarning] = useState<MileagePoint | null>(null);

  const save = async (allowCorrection: boolean) => {
    if (value === undefined) return;
    try {
      await repo.addReading(vehicle.id, date, value, { allowCorrection });
      ui.closeSheet();
      ui.showToast({ message: `Odometer saved: ${fmtNum(value)} ${vehicle.units}` });
    } catch (e) {
      if (e instanceof OdometerRegressionError) setWarning(e.previous);
      else throw e;
    }
  };

  return (
    <BottomSheet title="Update odometer" onClose={ui.closeSheet} dirty={touched}>
      <NumberInput
        label={`Odometer (${vehicle.units})`}
        value={value}
        large
        autoFocus
        onChange={(v) => {
          setValue(v);
          setTouched(true);
          setWarning(null);
        }}
      />
      <DateInput label="Date" value={date} onChange={(v) => { setDate(v); setTouched(true); setWarning(null); }} />
      {warning && (
        <div class="warning" role="alert">
          <p>
            That is lower than the {fmtNum(warning.value)} {vehicle.units} reading on {fmtDateShort(warning.date)}.
          </p>
          <div class="row">
            <button type="button" class="btn" onClick={() => setWarning(null)}>Fix</button>
            <button type="button" class="btn btn-secondary" onClick={() => void save(true)}>Save anyway (correction)</button>
          </div>
        </div>
      )}
      {!warning && (
        <button type="button" class="btn btn-primary btn-block" disabled={value === undefined} onClick={() => void save(false)}>
          Save
        </button>
      )}
    </BottomSheet>
  );
}
