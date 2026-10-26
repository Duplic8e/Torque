import { useCallback, useMemo, useState } from 'preact/hooks';
import { AppDataContext, UiContext, type AppData, type SheetState, type Toast as ToastData, type UiApi } from './core/context';
import { Fab } from './core/components/Fab';
import { TabBar } from './core/components/TabBar';
import { Toast } from './core/components/Toast';
import { UpdateToast } from './core/components/UpdateToast';
import { todayLocal } from './core/dates';
import { useLive } from './core/useLive';
import { getRepo } from './data/repo';
import { computeDue } from './engine/due';
import { Dashboard } from './features/dashboard/Dashboard';
import { Onboarding } from './features/onboarding/Onboarding';
import { Placeholder } from './features/placeholder';
import { Schedule } from './features/schedule/Schedule';
import { Settings } from './features/settings/Settings';
import { AddItemSheet } from './features/sheets/AddItemSheet';
import { ItemSheet } from './features/sheets/ItemSheet';
import { LogServiceSheet } from './features/sheets/LogServiceSheet';
import { OdometerSheet } from './features/sheets/OdometerSheet';
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
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const ui: UiApi = useMemo(
    () => ({ openSheet: setSheet, closeSheet: () => setSheet(null), showToast: setToast }),
    [],
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const data: AppData | null = useMemo(() => {
    if (!raw || !raw.vehicle) return null;
    const today = todayLocal();
    const { vehicle, items, records, readings, settings } = raw;
    return { repo, vehicle, items, records, readings, settings, today, due: computeDue({ today, vehicle, items, records, readings, settings }) };
  }, [raw]);

  if (!raw) return <div class="splash" aria-busy="true">Torque</div>;
  if (!data) return <Onboarding repo={repo} />;

  return (
    <AppDataContext.Provider value={data}>
      <UiContext.Provider value={ui}>
        <header class="app-header">{TITLES[route]}</header>
        <main class="app-main">
          {route === 'dashboard' && <Dashboard />}
          {route === 'schedule' && <Schedule />}
          {route === 'history' && <Placeholder title="History" />}
          {route === 'costs' && <Placeholder title="Costs" />}
          {route === 'settings' && <Settings />}
        </main>
        <Fab />
        <TabBar current={route} />
        {sheet?.type === 'odometer' && <OdometerSheet />}
        {sheet?.type === 'log' && <LogServiceSheet mode={sheet.mode ?? 'service'} presetKeys={sheet.presetKeys ?? []} />}
        {sheet?.type === 'item' && <ItemSheet itemKey={sheet.key} />}
        {sheet?.type === 'addItem' && <AddItemSheet />}
        {toast && <Toast toast={toast} onDismiss={dismissToast} />}
        <UpdateToast />
      </UiContext.Provider>
    </AppDataContext.Provider>
  );
}
