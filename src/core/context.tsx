import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Repo } from '../data/repo';
import type { OdometerReading, ServiceItem, ServiceRecord, Settings, Vehicle } from '../data/types';
import type { DueResult } from '../engine/due';
import type { ExportFile } from '../engine/backup';

export interface AppData {
  repo: Repo;
  vehicle: Vehicle;
  items: ServiceItem[];
  records: ServiceRecord[];
  readings: OdometerReading[];
  settings: Settings;
  due: DueResult;
  today: string;
}

export type SheetState =
  | { type: 'odometer' }
  | { type: 'log'; mode?: 'service' | 'note'; presetKeys?: string[]; editId?: string; duplicateId?: string }
  | { type: 'record'; id: string }
  | { type: 'import'; file: ExportFile }
  | { type: 'item'; key: string }
  | { type: 'addItem' };

export interface Toast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface UiApi {
  openSheet: (sheet: SheetState) => void;
  closeSheet: () => void;
  showToast: (toast: Toast) => void;
}

export const AppDataContext = createContext<AppData | null>(null);
export const UiContext = createContext<UiApi | null>(null);

export function useAppData(): AppData {
  const v = useContext(AppDataContext);
  if (!v) throw new Error('useAppData outside provider');
  return v;
}

export function useUi(): UiApi {
  const v = useContext(UiContext);
  if (!v) throw new Error('useUi outside provider');
  return v;
}
