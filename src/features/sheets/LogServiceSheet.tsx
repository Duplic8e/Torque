import { useEffect, useState } from 'preact/hooks';
import { BottomSheet } from '../../core/components/BottomSheet';
import { DateInput, TextInput, Toggle } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { useAppData, useUi } from '../../core/context';
import { fmtDateShort, fmtNum } from '../../core/format';
import { compressImage } from '../../core/image';
import { OdometerRegressionError } from '../../data/repo';
import type { MileagePoint } from '../../engine/mileage';
import { getSync } from '../../sync';

interface Props {
  mode: 'service' | 'note';
  presetKeys: string[];
  editId?: string;
  duplicateId?: string;
}

interface Photo {
  id: string;
  url: string;
  /** Present for photos picked in this sheet; stored attachments have none. */
  blob?: Blob;
}

export function LogServiceSheet({ mode, presetKeys, editId, duplicateId }: Props) {
  const { repo, vehicle, items, records, due, today } = useAppData();
  const ui = useUi();
  const editing = records.find((r) => r.id === editId);
  const source = editing ?? records.find((r) => r.id === duplicateId);
  const note = editing ? editing.itemKeys.length === 0 : mode === 'note';

  const [date, setDate] = useState(editing ? editing.date : today);
  const [odometer, setOdometer] = useState<number | undefined>(editing ? editing.odometer : Math.round(due.mileage.miles) || undefined);
  const [keys, setKeys] = useState<string[]>(source ? source.itemKeys : presetKeys);
  const [cost, setCost] = useState(source?.totalCost !== undefined ? String(source.totalCost) : '');
  const [perItem, setPerItem] = useState(Object.keys(source?.itemCosts ?? {}).length > 0);
  const [itemCosts, setItemCosts] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(source?.itemCosts ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [shop, setShop] = useState(source?.shop ?? '');
  const [diy, setDiy] = useState(source?.diy ?? false);
  const [parts, setParts] = useState(source?.parts ?? '');
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [touched, setTouched] = useState(presetKeys.length > 0 || !!duplicateId);
  const [warning, setWarning] = useState<MileagePoint | null>(null);
  const [error, setError] = useState('');

  // Existing photos of the record being edited.
  useEffect(() => {
    if (!editing) return;
    let urls: string[] = [];
    void getSync().loadPhotoBlobs(editing.attachmentIds).then((list) => {
      const loaded = list.map((a) => ({ id: a.id, url: URL.createObjectURL(a.blob) }));
      urls = loaded.map((p) => p.url);
      setPhotos((cur) => [...loaded, ...cur]);
    });
    return () => urls.forEach(URL.revokeObjectURL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setTouched(true);
    setWarning(null);
    setError('');
  };
  const shops = [...new Set(records.map((r) => r.shop).filter((s): s is string => !!s))];
  const toggleKey = (key: string) => touch(setKeys)(keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]);

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await compressImage(file);
      touch(setPhotos)([...photos, { id: crypto.randomUUID(), url: URL.createObjectURL(blob), blob }]);
    } catch {
      setError('That photo could not be read.');
    }
  };
  const removePhoto = (p: Photo) => {
    if (!p.blob) setRemoved([...removed, p.id]);
    setPhotos(photos.filter((x) => x.id !== p.id));
    setTouched(true);
  };

  const save = async (allowCorrection: boolean) => {
    if (odometer === undefined) return setError('Enter the odometer reading.');
    if (!note && keys.length === 0) return setError('Pick at least one service.');
    if (note && !notes.trim()) return setError('Write a note.');
    const money = (text: string | undefined): number | undefined => {
      if (!text || text.trim() === '') return undefined;
      const n = Number(text.replace(/[^0-9.]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    };
    // Per-service costs add up to the visit total, so every total in the app stays consistent.
    const perItemCosts = Object.fromEntries(keys.flatMap((k) => (money(itemCosts[k]) === undefined ? [] : [[k, money(itemCosts[k])!]])));
    const usePerItem = !note && perItem && keys.length > 1 && Object.keys(perItemCosts).length > 0;
    const fields = {
      date,
      odometer,
      itemKeys: note ? [] : keys,
      totalCost: usePerItem ? Object.values(perItemCosts).reduce((a, b) => a + b, 0) : money(cost),
      itemCosts: usePerItem ? perItemCosts : undefined,
      shop: shop.trim() || undefined,
      diy: note ? false : diy,
      parts: parts.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      let id: string;
      if (editing) {
        id = editing.id;
        await repo.updateRecord(id, { ...fields, attachmentIds: editing.attachmentIds.filter((a) => !removed.includes(a)) });
        for (const a of removed) await repo.removeAttachment(a);
      } else {
        id = (await repo.addRecord({ vehicleId: vehicle.id, ...fields }, { allowCorrection })).id;
      }
      for (const p of photos) if (p.blob) await repo.addAttachment(id, p.blob);
      ui.closeSheet();
      ui.showToast(
        editing
          ? { message: 'Changes saved' }
          : { message: note ? 'Note saved' : 'Service logged', actionLabel: 'Undo', onAction: () => void repo.deleteRecord(id) },
      );
    } catch (e) {
      if (e instanceof OdometerRegressionError) setWarning(e.previous);
      else throw e;
    }
  };

  const title = editing ? (note ? 'Edit note' : 'Edit service') : note ? 'Add note' : 'Log service';
  return (
    <BottomSheet title={title} onClose={ui.closeSheet} dirty={touched}>
      <DateInput label="Date" value={date} onChange={touch(setDate)} />
      <NumberInput label={`Odometer (${vehicle.units})`} value={odometer} large onChange={touch(setOdometer)} />

      {!note && (
        <fieldset class="field">
          <legend class="field-label">Services done</legend>
          <div class="chips">
            {items.filter((i) => i.enabled || keys.includes(i.key)).map((i) => (
              <button key={i.key} type="button" class="select-chip" aria-pressed={keys.includes(i.key)} onClick={() => toggleKey(i.key)}>
                {i.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {!note && keys.length > 1 && <Toggle label="Enter a cost for each service" checked={perItem} onChange={touch(setPerItem)} />}
      {!note && !(perItem && keys.length > 1) && <TextInput label="Total cost" value={cost} inputMode="decimal" placeholder="Optional" onChange={touch(setCost)} />}
      {!note && perItem && keys.length > 1 && keys.map((k) => (
        <TextInput key={k} label={`Cost: ${items.find((i) => i.key === k)?.name ?? k}`} value={itemCosts[k] ?? ''} inputMode="decimal" placeholder="Optional"
          onChange={touch((v: string) => setItemCosts({ ...itemCosts, [k]: v }))} />
      ))}
      {!note && <TextInput label="Shop" value={shop} list="shops" placeholder="Optional" onChange={touch(setShop)} />}
      <datalist id="shops">{shops.map((s) => <option key={s} value={s} />)}</datalist>
      {!note && <Toggle label="Did it myself (DIY)" checked={diy} onChange={touch(setDiy)} />}
      {!note && <TextInput label="Parts used" value={parts} placeholder="e.g. 0W-20 oil, filter part number" onChange={touch(setParts)} />}
      <label class="field">
        <span class="field-label">Notes</span>
        <textarea class="input" rows={3} value={notes} onInput={(e) => touch(setNotes)((e.currentTarget as HTMLTextAreaElement).value)} />
      </label>

      <div class="field">
        <span class="field-label">Receipt photos</span>
        <div class="photo-row">
          {photos.map((p) => (
            <div key={p.id} class="photo-thumb">
              <img src={p.url} alt="Receipt" />
              <button type="button" class="photo-remove" aria-label="Remove photo" onClick={() => removePhoto(p)}>×</button>
            </div>
          ))}
          <label class="photo-add">
            Add photo
            <input type="file" accept="image/*" class="visually-hidden" onChange={(e) => {
              const input = e.currentTarget as HTMLInputElement;
              void addPhoto(input.files?.[0]);
              input.value = '';
            }} />
          </label>
        </div>
      </div>

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
