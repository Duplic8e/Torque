import { BottomSheet } from '../../core/components/BottomSheet';
import { useAppData, useUi } from '../../core/context';
import { exportToDump } from '../../data/backup-io';
import { countsOf, type ExportFile } from '../../engine/backup';

export function ImportSheet({ file }: { file: ExportFile }) {
  const { repo } = useAppData();
  const ui = useUi();
  const c = countsOf(file);

  const run = async (mode: 'replace' | 'merge') => {
    if (mode === 'replace' && !window.confirm('Replace all data on this device with the backup?')) return;
    const dump = exportToDump(file);
    if (mode === 'replace') await repo.replaceAll(dump);
    else await repo.mergeAll(dump);
    ui.closeSheet();
    ui.showToast({ message: mode === 'replace' ? 'Backup restored' : 'Backup merged' });
  };

  return (
    <BottomSheet title="Import backup" onClose={ui.closeSheet}>
      <p class="muted">Backup made {new Date(file.exportedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}. It contains:</p>
      <dl class="facts">
        <dt>Vehicles</dt><dd class="num">{c.vehicles}</dd>
        <dt>Service records</dt><dd class="num">{c.records}</dd>
        <dt>Odometer readings</dt><dd class="num">{c.readings}</dd>
        <dt>Receipt photos</dt><dd class="num">{c.photos}</dd>
      </dl>
      <button type="button" class="btn btn-primary btn-block" onClick={() => void run('merge')}>Merge with current data</button>
      <button type="button" class="btn btn-secondary btn-block btn-danger" onClick={() => void run('replace')}>Replace all data</button>
      <p class="muted">Merge keeps the newest version of each record. Replace erases what is on this device first.</p>
    </BottomSheet>
  );
}
