import { useEffect, useRef, useState } from 'preact/hooks';
import { Segmented, TextInput, Toggle } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { useAppData, useUi } from '../../core/context';
import { dumpToExport } from '../../data/backup-io';
import { badgeSupported, enableBadge } from '../../core/badge';
import { agoLabel, fmtNum } from '../../core/format';
import { shareOrDownload } from '../../core/files';
import { getSync } from '../../sync';
import { SyncSection } from './SyncSection';
import { backupFileName, csvFileName, parseExport, recordsToCsv } from '../../engine/backup';

interface StorageInfo {
  usedMb: string;
  persisted: boolean | null;
}

export function Settings() {
  const { vehicle, settings, repo, records, items, today } = useAppData();
  const ui = useUi();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [resetText, setResetText] = useState('');
  const [badgeNote, setBadgeNote] = useState('');
  const [badgeOn, setBadgeOn] = useState(settings.badgeEnabled === true);
  const [storage, setStorage] = useState<StorageInfo>({ usedMb: '…', persisted: null });

  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      setStorage({ usedMb: est?.usage !== undefined ? (est.usage / 1_048_576).toFixed(1) : 'unknown', persisted });
    })();
  }, []);

  const exportJson = async () => {
    setBusy(true);
    try {
      // Photos that live only in the cloud must be on this device before they can go into a backup.
      if (getSync().getConfig()) await getSync().hydrateAllPhotos().catch(() => undefined);
      const file = await dumpToExport(await repo.dumpAll(), new Date().toISOString());
      const out = new File([JSON.stringify(file)], backupFileName(today), { type: 'application/json' });
      const result = await shareOrDownload(out);
      if (result !== 'cancelled') {
        await repo.markBackedUp();
        ui.showToast({ message: result === 'shared' ? 'Backup saved' : 'Backup downloaded' });
      }
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    const out = new File([recordsToCsv(records, items, vehicle.units)], csvFileName(today), { type: 'text/csv' });
    await shareOrDownload(out);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError('');
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return setImportError('That file is not valid JSON.');
    }
    const parsed = parseExport(raw);
    if (!parsed.ok) return setImportError(parsed.error);
    ui.openSheet({ type: 'import', file: parsed.file });
  };

  const reset = async () => {
    await getSync().disconnect(); // stop syncing and forget the token before erasing
    await repo.resetAll();
    window.location.hash = '#/dashboard';
  };

  return (
    <>
      <section class="card">
        <h2 class="section-title">Vehicle</h2>
        <p class="vehicle-line"><strong>{vehicle.nickname}</strong><span class="muted">{vehicle.year} {vehicle.trim} 2.5 Turbo</span></p>
        <button type="button" class="btn btn-secondary" onClick={() => ui.openSheet({ type: 'vehicle' })}>Edit vehicle details</button>
        <Segmented
          label="Driving style"
          value={vehicle.drivingStyle}
          options={[{ value: 'normal', label: 'Normal' }, { value: 'severe', label: 'Severe' }]}
          onChange={(v) => void repo.updateVehicle(vehicle.id, { drivingStyle: v })}
        />
        <p class="muted">Severe means towing, short trips, extreme heat or cold, or dusty roads. It shortens the severe-sensitive intervals.</p>
      </section>

      <section class="card">
        <h2 class="section-title">Due-soon thresholds</h2>
        <NumberInput label={`Miles (${vehicle.units})`} value={settings.dueSoonMiles} onChange={(v) => void repo.updateSettings({ dueSoonMiles: v ?? 0 })} />
        <NumberInput label="Days" value={settings.dueSoonDays} onChange={(v) => void repo.updateSettings({ dueSoonDays: v ?? 0 })} />
      </section>

      <section class="card">
        <h2 class="section-title">Notifications</h2>
        <Toggle
          label="Badge on the app icon"
          checked={badgeOn}
          onChange={async (on) => {
            setBadgeOn(on); // respond at once; the database write follows
            setBadgeNote('');
            if (!on) return void repo.updateSettings({ badgeEnabled: false });
            const result = await enableBadge();
            if (result === 'enabled') return void repo.updateSettings({ badgeEnabled: true });
            setBadgeOn(false);
            setBadgeNote(result === 'denied' ? 'Permission was denied. Allow notifications for Torque in Settings, then try again.' : 'Badges are not supported here.');
          }}
        />
        <p class="muted">
          {badgeSupported()
            ? 'Shows how many items are overdue or due soon. It updates whenever you open Torque; the app cannot update it in the background.'
            : 'Not available in this browser. On iPhone (iOS 16.4 or later), install Torque to the Home Screen first.'}
        </p>
        {badgeNote && <p class="error" role="alert">{badgeNote}</p>}
      </section>

      <SyncSection />

      <section class="card">
        <h2 class="section-title">Backup</h2>
        <p>Last backup: {settings.lastBackupAt ? agoLabel(settings.lastBackupAt.slice(0, 10), today) : 'never'}</p>
        {settings.recordsSinceBackup > 0 && <p class="muted">{settings.recordsSinceBackup} new record{settings.recordsSinceBackup === 1 ? '' : 's'} since then.</p>}
        <div class="row">
          <button type="button" class="btn btn-primary" disabled={busy} onClick={() => void exportJson()}>Export backup</button>
          <button type="button" class="btn btn-secondary" onClick={() => void exportCsv()}>Export CSV</button>
          <button type="button" class="btn btn-secondary" onClick={() => fileInput.current?.click()}>Import backup</button>
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" class="visually-hidden" aria-label="Choose backup file"
          onChange={(e) => { const i = e.currentTarget as HTMLInputElement; void pickFile(i.files?.[0]); i.value = ''; }} />
        {importError && <p class="error" role="alert">{importError}</p>}
        <p class="muted">Backups include receipt photos. Save them to Files or iCloud Drive.</p>
      </section>

      <section class="card">
        <h2 class="section-title">About</h2>
        <dl class="facts">
          <dt>Version</dt><dd>{__APP_VERSION__}</dd>
          <dt>Storage used</dt><dd class="num">{storage.usedMb} MB</dd>
          <dt>Persistent storage</dt>
          <dd>{storage.persisted === null ? 'Not supported' : storage.persisted ? 'Granted' : 'Not granted (the browser may clear data under pressure; keep backups)'}</dd>
          <dt>Records</dt><dd class="num">{fmtNum(records.filter((r) => !r.deletedAt).length)}</dd>
        </dl>
      </section>

      <section class="card danger-zone">
        <h2 class="section-title">Danger zone</h2>
        <p class="muted">Erases every record, reading and photo on this device. Export a backup first.</p>
        <TextInput label="Type RESET to confirm" value={resetText} onChange={setResetText} />
        <button type="button" class="btn btn-secondary btn-danger" disabled={resetText !== 'RESET'} onClick={() => void reset()}>Reset all data</button>
      </section>
    </>
  );
}
