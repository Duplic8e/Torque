import { useEffect, useState } from 'preact/hooks';
import { BottomSheet } from '../../core/components/BottomSheet';
import { useAppData, useUi } from '../../core/context';
import { fmtDateLong, fmtMoney, fmtNum } from '../../core/format';
import { recordCost } from '../../engine/costs';
import { getSync } from '../../sync';

export function RecordSheet({ id }: { id: string }) {
  const { repo, records, items, vehicle } = useAppData();
  const ui = useUi();
  const record = records.find((r) => r.id === id);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [zoomed, setZoomed] = useState<string | null>(null);

  useEffect(() => {
    if (!record) return;
    let urls: string[] = [];
    void getSync().loadPhotoBlobs(record.attachmentIds).then((list) => {
      const loaded = list.map((a) => ({ id: a.id, url: URL.createObjectURL(a.blob) }));
      urls = loaded.map((p) => p.url);
      setPhotos(loaded);
    });
    return () => urls.forEach(URL.revokeObjectURL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!record) return null;
  const name = (key: string) => items.find((i) => i.key === key)?.name ?? key;
  const cost = recordCost(record);
  const isNote = record.itemKeys.length === 0;

  const remove = async () => {
    await repo.deleteRecord(record.id);
    ui.closeSheet();
    ui.showToast({ message: 'Deleted', actionLabel: 'Undo', onAction: () => void repo.restoreRecord(record.id) });
  };

  return (
    <BottomSheet title={isNote ? 'Note' : 'Service visit'} onClose={ui.closeSheet}>
      <dl class="facts">
        <dt>Date</dt><dd>{fmtDateLong(record.date)}</dd>
        <dt>Odometer</dt><dd class="num">{fmtNum(record.odometer)} {vehicle.units}</dd>
        {cost > 0 && (<><dt>Cost</dt><dd>{fmtMoney(cost)}</dd></>)}
        {record.shop && (<><dt>Shop</dt><dd>{record.shop}</dd></>)}
        {!isNote && (<><dt>Done by</dt><dd>{record.diy ? 'Me (DIY)' : 'Shop'}</dd></>)}
        {record.parts && (<><dt>Parts</dt><dd>{record.parts}</dd></>)}
        {record.notes && (<><dt>Notes</dt><dd class="pre">{record.notes}</dd></>)}
      </dl>
      {record.itemKeys.length > 0 && (
        <div class="chips">{record.itemKeys.map((k) => <span key={k} class="tag">{name(k)}</span>)}</div>
      )}
      {photos.length > 0 && (
        <div class="photo-grid">
          {photos.map((p) => (
            <button key={p.id} type="button" class={zoomed === p.id ? 'photo-full' : 'photo-small'} onClick={() => setZoomed(zoomed === p.id ? null : p.id)}>
              <img src={p.url} alt="Receipt" />
            </button>
          ))}
        </div>
      )}
      <div class="row action-row">
        <button type="button" class="btn btn-primary" onClick={() => { ui.closeSheet(); ui.openSheet({ type: 'log', editId: record.id }); }}>Edit</button>
        <button type="button" class="btn btn-secondary" onClick={() => { ui.closeSheet(); ui.openSheet({ type: 'log', duplicateId: record.id }); }}>Duplicate</button>
        <button type="button" class="btn btn-secondary btn-danger" onClick={() => void remove()}>Delete</button>
      </div>
    </BottomSheet>
  );
}
