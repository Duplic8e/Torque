import { useState } from 'preact/hooks';
import { BottomSheet } from '../../core/components/BottomSheet';
import { Field, TextInput } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { useAppData, useUi } from '../../core/context';
import type { Category } from '../../data/types';

const CATEGORIES: Category[] = ['Oil', 'Tires', 'Brakes', 'Filters', 'Fluids', 'Ignition', 'Inspection', 'Repairs', 'Other'];

export function AddItemSheet() {
  const { repo, vehicle, due, today } = useAppData();
  const ui = useUi();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('Other');
  const [miles, setMiles] = useState<number>();
  const [months, setMonths] = useState<number>();
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) return setError('Give the item a name.');
    if (!miles && !months) return setError('Set a mileage or a months interval.');
    // A new item's clock starts today.
    await repo.addCustomItem(vehicle.id, {
      name: name.trim(),
      category,
      intervalMiles: miles,
      intervalMonths: months,
      baseline: { date: today, odometer: Math.round(due.mileage.miles), source: 'entered' },
    });
    ui.closeSheet();
    ui.showToast({ message: 'Item added' });
  };

  return (
    <BottomSheet title="Add custom item" onClose={ui.closeSheet} dirty={!!name || !!miles || !!months}>
      <TextInput label="Name" value={name} placeholder="e.g. Ceramic coating top-up" onChange={setName} />
      <Field label="Category">
        <select class="input" value={category} onChange={(e) => setCategory((e.currentTarget as HTMLSelectElement).value as Category)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <NumberInput label={`Every (${vehicle.units})`} value={miles} onChange={setMiles} />
      <NumberInput label="Every (months)" value={months} onChange={setMonths} />
      <p class="muted">The clock starts today. Log a service any time to reset it.</p>
      {error && <p class="error" role="alert">{error}</p>}
      <button type="button" class="btn btn-primary btn-block" onClick={() => void save()}>Add</button>
    </BottomSheet>
  );
}
