import { useState } from 'preact/hooks';
import { BottomSheet } from '../../core/components/BottomSheet';
import { DateInput, Field, Segmented, TextInput } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { useAppData, useUi } from '../../core/context';
import type { Vehicle } from '../../data/types';

const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019];

export function VehicleSheet() {
  const { vehicle, repo } = useAppData();
  const ui = useUi();
  const [nickname, setNickname] = useState(vehicle.nickname);
  const [year, setYear] = useState(vehicle.year);
  const [vin, setVin] = useState(vehicle.vin ?? '');
  const [plate, setPlate] = useState(vehicle.plate ?? '');
  const [units, setUnits] = useState<Vehicle['units']>(vehicle.units);
  const [oilSpec, setOilSpec] = useState(vehicle.oilSpec ?? '');
  const [tireSize, setTireSize] = useState(vehicle.tireSize ?? '');
  const [purchaseDate, setPurchaseDate] = useState(vehicle.purchaseDate ?? '');
  const [purchaseOdometer, setPurchaseOdometer] = useState(vehicle.purchaseOdometer);
  const [touched, setTouched] = useState(false);

  const t = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setTouched(true);
  };

  const save = async () => {
    await repo.updateVehicle(vehicle.id, {
      nickname: nickname.trim() || 'CX-5',
      year,
      units,
      vin: vin.trim() || undefined,
      plate: plate.trim() || undefined,
      oilSpec: oilSpec.trim() || undefined,
      tireSize: tireSize.trim() || undefined,
      purchaseDate: purchaseDate || undefined,
      purchaseOdometer,
    });
    ui.closeSheet();
    ui.showToast({ message: 'Vehicle saved' });
  };

  return (
    <BottomSheet title="Vehicle details" onClose={ui.closeSheet} dirty={touched}>
      <TextInput label="Nickname" value={nickname} onChange={t(setNickname)} />
      <Field label="Model year">
        <select class="input" value={year} onChange={(e) => t(setYear)(Number((e.currentTarget as HTMLSelectElement).value))}>
          {(YEARS.includes(year) ? YEARS : [year, ...YEARS]).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </Field>
      <TextInput label="VIN" value={vin} onChange={t(setVin)} />
      <TextInput label="Plate" value={plate} onChange={t(setPlate)} />
      <TextInput label="Oil spec" value={oilSpec} placeholder="e.g. 0W-20, 5.9 qt" onChange={t(setOilSpec)} />
      <TextInput label="Tire size" value={tireSize} placeholder="e.g. 225/55R19" onChange={t(setTireSize)} />
      <DateInput label="Purchase date" value={purchaseDate} onChange={t(setPurchaseDate)} />
      <NumberInput label="Odometer at purchase" value={purchaseOdometer} onChange={t(setPurchaseOdometer)} />
      <Segmented label="Units" value={units} options={[{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometres' }]} onChange={t(setUnits)} />
      {units !== vehicle.units && <p class="muted">Changing units only changes the labels. Existing numbers are not converted.</p>}
      <button type="button" class="btn btn-primary btn-block" onClick={() => void save()}>Save</button>
    </BottomSheet>
  );
}
