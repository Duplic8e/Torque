import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { AppDataContext, UiContext, type AppData, type SheetState, type Toast as ToastData, type UiApi } from './core/context';
import { Fab } from './core/components/Fab';
import { TabBar } from './core/components/TabBar';
import { Toast } from './core/components/Toast';
import { applyBadge } from './core/badge';
import { todayLocal } from './core/dates';
import { useLive } from './core/useLive';
import { getRepo } from './data/repo';
import { getSync } from './sync';
import { computeDue } from './engine/due';
import { attentionCount } from './engine/health';
import { Costs } from './features/costs/Costs';
import { Dashboard } from './features/dashboard/Dashboard';
import { History } from './features/history/History';
import { Onboarding } from './features/onboarding/Onboarding';
import { Schedule } from './features/schedule/Schedule';
import { Settings } from './features/settings/Settings';
import { VehicleSheet } from './features/sheets/VehicleSheet';
import { AddItemSheet } from './features/sheets/AddItemSheet';
import { ItemSheet } from './features/sheets/ItemSheet';
import { ImportSheet } from './features/sheets/ImportSheet';
import { LogServiceSheet } from './features/sheets/LogServiceSheet';
import { OdometerSheet } from './features/sheets/OdometerSheet';
import { RecordSheet } from './features/sheets/RecordSheet';
import { useRoute, type Route } from './router';

const TITLES: Record<Route, string> = {
  dashboard: 'Torque',
  schedule: 'Schedule',
  history: 'History',
  costs: 'Costs',
  settings: 'Settings',
};

const repo = getRepo();

/** Everything the UI needs, read once and kept live; the due engine runs on render so `today` is never stale. */
async function loadAll() {
  const vehicle = await repo.getVehicle();
  if (!vehicle) return { vehicle: null } as const;
  const [items, records, readings, settings] = await Promise.all([
    repo.listItems(vehicle.id),
    repo.listRecords(vehicle.id),
    repo.listReadings(vehicle.id),
    repo.getSettings(),
  ]);
  return { vehicle, items, records, readings, settings } as const;
}

export function App() {
  const route = useRoute();
  const raw = useLive(loadAll);

  // Each tab opens at its top, not at the previous tab's scroll position.
  useEffect(() => {
    document.querySelector('.app-main')?.scrollTo(0, 0);
  }, [route]);

  // Ask iOS to keep our data under storage pressure; the result is shown in Settings > About.
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  // Cloud sync: pull on launch, then again whenever the app returns to the foreground or the network comes back.
  useEffect(() => {
    const sync = getSync();
    void sync.start();
    const detach = sync.attachBrowserListeners();
    return () => {
      detach();
      sync.dispose();
    };
  }, []);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Statuses depend on today's date, so recompute when the day changes while the app sits open or suspended.
  const [day, setDay] = useState(todayLocal());
  useEffect(() => {
    const refresh = () => setDay(todayLocal());
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(timer);
    };
  }, []);

  const ui: UiApi = useMemo(
    () => ({ openSheet: setSheet, closeSheet: () => setSheet(null), showToast: setToast }),
    [],
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const data: AppData | null = useMemo(() => {
    if (!raw || !raw.vehicle) return null;
    const today = day;
    const { vehicle, items, records, readings, settings } = raw;
    return { repo, vehicle, items, records, readings, settings, today, due: computeDue({ today, vehicle, items, records, readings, settings }) };
  }, [raw, day]);

  const badgeEnabled = data?.settings.badgeEnabled ?? false;
  const attention = data ? attentionCount(data.due.items) : 0;
  useEffect(() => {
    if (data) void applyBadge(badgeEnabled, attention);
  }, [data !== null, badgeEnabled, attention]);

  if (!raw) return <div class="splash" aria-busy="true">Torque</div>;
  if (!data) return <Onboarding repo={repo} />;

  return (
    <AppDataContext.Provider value={data}>
      <UiContext.Provider value={ui}>
        <header class="app-header"><h1>{route === 'dashboard' ? data.vehicle.nickname : TITLES[route]}</h1></header>
        <main class="app-main">
          {route === 'dashboard' && <Dashboard />}
          {route === 'schedule' && <Schedule />}
          {route === 'history' && <History />}
          {route === 'costs' && <Costs />}
          {route === 'settings' && <Settings />}
        </main>
        <Fab />
        <TabBar current={route} />
        {sheet?.type === 'odometer' && <OdometerSheet />}
        {sheet?.type === 'log' && <LogServiceSheet key={sheet.editId ?? sheet.duplicateId ?? 'new'} mode={sheet.mode ?? 'service'} presetKeys={sheet.presetKeys ?? []} editId={sheet.editId} duplicateId={sheet.duplicateId} />}
        {sheet?.type === 'record' && <RecordSheet id={sheet.id} />}
        {sheet?.type === 'import' && <ImportSheet file={sheet.file} />}
        {sheet?.type === 'item' && <ItemSheet itemKey={sheet.key} />}
        {sheet?.type === 'addItem' && <AddItemSheet />}
        {sheet?.type === 'vehicle' && <VehicleSheet />}
        {toast && <Toast toast={toast} onDismiss={dismissToast} />}
      </UiContext.Provider>
    </AppDataContext.Provider>
  );
}
