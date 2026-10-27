import type { Table } from 'dexie';
import { newId } from '../core/ids';
import { checkOdometer, type MileagePoint } from '../engine/mileage';
import { TIRE_SWAP_KEY } from '../engine/seasonal';
import { computeDue, type DueResult } from '../engine/due';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import { TorqueDB } from './schema';
import { CURRENT_SEED_VERSION, planScheduleUpgrade, upgradeItemId } from './schedule-upgrade';
import { seedItems } from './seed-cx5-turbo';
import type { Attachment, Baseline, ID, ISODate, OdometerReading, SeasonalTires, ServiceItem, ServiceRecord, Settings, Vehicle } from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  dueSoonMiles: 500,
  dueSoonDays: 30,
  calendarAlertTime: '09:00',
  calendarDaysBefore: 7,
  recordsSinceBackup: 0,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  updatedAt: '',
};

/** Thrown when an odometer value is lower than an earlier reading and the caller has not confirmed it. */
export class OdometerRegressionError extends Error {
  constructor(readonly previous: MileagePoint) {
    super(`Odometer is lower than the ${previous.date} reading of ${previous.value}`);
    this.name = 'OdometerRegressionError';
  }
}

/** Every row of every table, tombstones included. */
export interface Dump {
  vehicles: Vehicle[];
  items: ServiceItem[];
  records: ServiceRecord[];
  odometer: OdometerReading[];
  attachments: Attachment[];
  settings: Settings | undefined;
}

export type NewVehicle = Pick<Vehicle, 'nickname' | 'year' | 'units' | 'drivingStyle'> &
  Partial<Pick<Vehicle, 'vin' | 'plate' | 'purchaseDate' | 'purchaseOdometer' | 'oilSpec' | 'tireSize'>>;

export type NewRecord = Pick<ServiceRecord, 'vehicleId' | 'date' | 'odometer' | 'itemKeys'> &
  Partial<Pick<ServiceRecord, 'totalCost' | 'itemCosts' | 'shop' | 'diy' | 'parts' | 'notes' | 'attachmentIds'>>;

const nowIso = () => new Date().toISOString();

/**
 * Every write goes through here; components never touch Dexie directly.
 * Deletes set `deletedAt` (a tombstone) so they can sync and be undone.
 */
export function createRepo(db: TorqueDB) {
  const live = <T extends { deletedAt?: string }>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt);

  async function getSettings(): Promise<Settings> {
    return (await db.settings.get('settings')) ?? { ...DEFAULT_SETTINGS, updatedAt: nowIso() };
  }

  async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
    const next = { ...(await getSettings()), ...patch, updatedAt: nowIso() };
    await db.settings.put(next);
    return next;
  }

  async function getVehicle(): Promise<Vehicle | undefined> {
    return live(await db.vehicles.toArray())[0];
  }

  /** Creates the vehicle with the seeded CX-5 Turbo schedule and default settings. */
  async function createVehicle(input: NewVehicle): Promise<Vehicle> {
    const now = nowIso();
    const vehicle: Vehicle = {
      ...input,
      id: newId(),
      make: 'Mazda',
      model: 'CX-5',
      trim: 'Signature',
      engine: 'SKYACTIV-G 2.5T',
      createdAt: now,
      updatedAt: now,
    };
    await db.transaction('rw', db.vehicles, db.items, db.settings, async () => {
      await db.vehicles.add(vehicle);
      await db.items.bulkAdd(seedItems(vehicle.id, now, vehicle.units));
      if (!(await db.settings.get('settings'))) await db.settings.put({ ...DEFAULT_SETTINGS, seedVersion: CURRENT_SEED_VERSION, updatedAt: now });
    });
    return vehicle;
  }

  async function updateVehicle(id: ID, patch: Partial<Omit<Vehicle, 'id'>>): Promise<void> {
    await db.vehicles.update(id, { ...patch, updatedAt: nowIso() });
  }

  async function listItems(vehicleId: ID): Promise<ServiceItem[]> {
    const rows = live(await db.items.where('vehicleId').equals(vehicleId).toArray());
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function updateItem(id: ID, patch: Partial<Omit<ServiceItem, 'id' | 'vehicleId' | 'key'>>): Promise<void> {
    await db.items.update(id, { ...patch, updatedAt: nowIso() });
  }

  async function addCustomItem(
    vehicleId: ID,
    input: Pick<ServiceItem, 'name' | 'category'> & Partial<ServiceItem>,
  ): Promise<ServiceItem> {
    const existing = await db.items.where('vehicleId').equals(vehicleId).toArray();
    const id = newId();
    const item: ServiceItem = {
      kind: 'replace',
      ...input,
      id,
      vehicleId,
      key: `custom_${id}`,
      enabled: true,
      isCustom: true,
      sortOrder: existing.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1,
      updatedAt: nowIso(),
    };
    await db.items.add(item);
    return item;
  }

  /**
   * Turns the seasonal tire swap on (creating its item the first time) or off. The item has a fixed id per
   * vehicle so two devices setting it up separately end up with one item after sync.
   */
  async function setSeasonalTires(vehicleId: ID, seasonal: SeasonalTires | null): Promise<void> {
    const id = upgradeItemId(vehicleId, TIRE_SWAP_KEY);
    const existing = await db.items.get(id);
    if (!seasonal) {
      if (existing) await db.items.update(id, { enabled: false, updatedAt: nowIso() });
      return;
    }
    if (existing) {
      await db.items.update(id, { seasonal, enabled: true, deletedAt: undefined, updatedAt: nowIso() });
      return;
    }
    const all = await db.items.where('vehicleId').equals(vehicleId).toArray();
    await db.items.add({
      id,
      vehicleId,
      key: TIRE_SWAP_KEY,
      name: 'Seasonal tire swap',
      category: 'Tires',
      kind: 'replace',
      seasonal,
      enabled: true,
      isCustom: false,
      notes: 'Swap between winter and summer tires. Log the swap to move the reminder to the next season; the date decides which set went on.',
      sortOrder: all.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1,
      updatedAt: nowIso(),
    });
  }

  /** Onboarding: where an item's clock starts when it has no record. `null` = "Not sure" (due now). */
  async function setBaseline(itemId: ID, baseline: Baseline | null): Promise<void> {
    const patch = { baseline: baseline ?? undefined, updatedAt: nowIso() };
    await db.items.update(itemId, patch);
  }

  async function listReadings(vehicleId: ID): Promise<OdometerReading[]> {
    return live(await db.odometer.where('vehicleId').equals(vehicleId).toArray());
  }

  async function listRecords(vehicleId: ID): Promise<ServiceRecord[]> {
    const rows = live(await db.records.where('vehicleId').equals(vehicleId).toArray());
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer);
  }

  async function points(vehicleId: ID): Promise<MileagePoint[]> {
    const [readings, records] = await Promise.all([listReadings(vehicleId), listRecords(vehicleId)]);
    return [
      ...readings.map((r) => ({ date: r.date, value: r.value, isCorrection: r.isCorrection })),
      ...records.map((r) => ({ date: r.date, value: r.odometer })),
    ];
  }

  /** Refuses a lower-than-before value unless `allowCorrection` is set, so it is never saved silently. */
  async function assertOdometer(vehicleId: ID, value: number, date: ISODate, allowCorrection: boolean): Promise<boolean> {
    const check = checkOdometer(value, date, await points(vehicleId));
    if (check.ok) return false;
    if (!allowCorrection) throw new OdometerRegressionError(check.previous);
    return true;
  }

  async function addReading(
    vehicleId: ID,
    date: ISODate,
    value: number,
    opts: { allowCorrection?: boolean } = {},
  ): Promise<OdometerReading> {
    const isCorrection = await assertOdometer(vehicleId, value, date, opts.allowCorrection ?? false);
    const reading: OdometerReading = {
      id: newId(),
      vehicleId,
      date,
      value,
      source: 'manual',
      ...(isCorrection ? { isCorrection } : {}),
      updatedAt: nowIso(),
    };
    await db.odometer.add(reading);
    return reading;
  }

  async function addRecord(input: NewRecord, opts: { allowCorrection?: boolean } = {}): Promise<ServiceRecord> {
    await assertOdometer(input.vehicleId, input.odometer, input.date, opts.allowCorrection ?? false);
    const now = nowIso();
    const record: ServiceRecord = { diy: false, attachmentIds: [], ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.transaction('rw', db.records, db.settings, async () => {
      await db.records.add(record);
      const settings = await getSettings();
      await db.settings.put({ ...settings, recordsSinceBackup: settings.recordsSinceBackup + 1, updatedAt: now });
    });
    return record;
  }

  async function updateRecord(id: ID, patch: Partial<Omit<ServiceRecord, 'id' | 'vehicleId'>>): Promise<void> {
    await db.records.update(id, { ...patch, updatedAt: nowIso() });
  }

  async function deleteRecord(id: ID): Promise<void> {
    const now = nowIso();
    await db.records.update(id, { deletedAt: now, updatedAt: now });
  }

  /** Undo for a delete. */
  async function restoreRecord(id: ID): Promise<void> {
    const record = await db.records.get(id);
    if (!record) return;
    const { deletedAt: _removed, ...rest } = record;
    await db.records.put({ ...rest, updatedAt: nowIso() });
  }

  /** Loads everything for the vehicle and runs the due engine. `today` is passed in for testability. */
  async function computeForVehicle(vehicleId: ID, today: ISODate): Promise<DueResult | null> {
    const vehicle = await db.vehicles.get(vehicleId);
    if (!vehicle || vehicle.deletedAt) return null;
    const [items, records, readings, settings] = await Promise.all([
      listItems(vehicleId),
      listRecords(vehicleId),
      listReadings(vehicleId),
      getSettings(),
    ]);
    return computeDue({ today, vehicle, items, records, readings, settings });
  }

  async function addAttachment(recordId: ID, blob: Blob): Promise<Attachment> {
    const now = nowIso();
    const attachment: Attachment = { id: newId(), recordId, blob, mime: blob.type || 'image/jpeg', createdAt: now, updatedAt: now };
    await db.transaction('rw', db.attachments, db.records, async () => {
      await db.attachments.add(attachment);
      const record = await db.records.get(recordId);
      if (record) await db.records.update(recordId, { attachmentIds: [...record.attachmentIds, attachment.id], updatedAt: now });
    });
    return attachment;
  }

  async function setAttachmentBlob(id: ID, blob: Blob): Promise<void> {
    await db.attachments.update(id, { blob }); // bytes only: no updatedAt change, nothing to sync
  }

  async function getAttachments(ids: readonly ID[]): Promise<Attachment[]> {
    return live((await db.attachments.bulkGet([...ids])).filter((a): a is Attachment => !!a));
  }

  async function removeAttachment(id: ID): Promise<void> {
    const now = nowIso();
    await db.attachments.update(id, { deletedAt: now, updatedAt: now });
  }

  async function dumpAll(): Promise<Dump> {
    const [vehicles, items, records, odometer, attachments, settings] = await Promise.all([
      db.vehicles.toArray(), db.items.toArray(), db.records.toArray(), db.odometer.toArray(), db.attachments.toArray(), db.settings.get('settings'),
    ]);
    return { vehicles, items, records, odometer, attachments, settings };
  }

  /** Replaces everything with `dump` in one transaction. */
  async function replaceAll(dump: Dump): Promise<void> {
    await db.transaction('rw', [db.vehicles, db.items, db.records, db.odometer, db.attachments, db.settings], async () => {
      await Promise.all([db.vehicles.clear(), db.items.clear(), db.records.clear(), db.odometer.clear(), db.attachments.clear(), db.settings.clear()]);
      await db.vehicles.bulkPut(dump.vehicles);
      await db.items.bulkPut(dump.items);
      await db.records.bulkPut(dump.records);
      await db.odometer.bulkPut(dump.odometer);
      await db.attachments.bulkPut(dump.attachments);
      if (dump.settings) await db.settings.put(dump.settings);
    });
  }

  /**
   * Merges `dump` into what is stored: by id, newest `updatedAt` wins, ties keep the local row.
   * Only winning remote rows are written, so an unchanged merge touches nothing.
   */
  async function mergeAll(dump: Dump): Promise<void> {
    await db.transaction('rw', [db.vehicles, db.items, db.records, db.odometer, db.attachments, db.settings], async () => {
      const newer = async <T extends { id: string; updatedAt: string }>(table: Table<T, string>, rows: readonly T[]) => {
        const mine = await table.bulkGet(rows.map((r) => r.id));
        return rows.flatMap((row, i) => (!mine[i] || row.updatedAt > mine[i]!.updatedAt ? [{ row, local: mine[i] }] : []));
      };
      await db.vehicles.bulkPut((await newer(db.vehicles, dump.vehicles)).map((w) => w.row));
      await db.items.bulkPut((await newer(db.items, dump.items)).map((w) => w.row));
      await db.records.bulkPut((await newer(db.records, dump.records)).map((w) => w.row));
      await db.odometer.bulkPut((await newer(db.odometer, dump.odometer)).map((w) => w.row));
      // A photo's bytes never change for a given id, so keep a local blob when remote metadata wins.
      const photos = await newer(db.attachments, dump.attachments);
      await db.attachments.bulkPut(photos.map(({ row, local }) => (row.blob || !local?.blob ? row : { ...row, blob: local.blob })));
      const mine = await db.settings.get('settings');
      if (dump.settings && (!mine || dump.settings.updatedAt > mine.updatedAt)) await db.settings.put(dump.settings);
    });
  }

  /**
   * Upgrades the built-in schedule once per seed version (to Mazda Canada's Schedule 2). Returns the names
   * of items left alone because the owner had edited them, or null when nothing was due.
   */
  async function upgradeSchedule(vehicleId: ID): Promise<string[] | null> {
    const settings = await getSettings();
    if ((settings.seedVersion ?? 1) >= CURRENT_SEED_VERSION) return null;
    const vehicle = await db.vehicles.get(vehicleId);
    if (!vehicle) return null;
    const now = nowIso();
    const plan = planScheduleUpgrade(await db.items.where('vehicleId').equals(vehicleId).toArray(), vehicle);
    await db.transaction('rw', db.items, db.settings, async () => {
      for (const u of plan.updates) {
        // Dexie's update drops keys set to undefined, which clears the old severe values.
        await db.items.update(u.id, { ...u.patch, updatedAt: now });
      }
      for (const a of plan.additions) {
        if (!(await db.items.get(a.id))) await db.items.add({ ...a, updatedAt: now });
      }
      const current = await getSettings();
      await db.settings.put({ ...current, seedVersion: CURRENT_SEED_VERSION, scheduleReviewed: false, updatedAt: now });
    });
    return plan.kept;
  }

  /**
   * Switches a vehicle between miles and km, converting every stored distance: readings, service odometers,
   * starting points, purchase odometer, intervals and the due-soon threshold. Intervals round to a tidy 500 and
   * the threshold to 100; actual odometer values round to the nearest whole unit.
   */
  async function convertUnits(vehicleId: ID, to: Vehicle['units']): Promise<void> {
    const vehicle = await db.vehicles.get(vehicleId);
    if (!vehicle || vehicle.units === to) return;
    const factor = to === 'km' ? 1.609344 : 1 / 1.609344;
    const exact = (n: number) => Math.round(n * factor);
    const tidy = (n: number | undefined, step: number) => (n === undefined ? undefined : Math.max(step, Math.round((n * factor) / step) * step));
    const now = nowIso();
    await db.transaction('rw', [db.vehicles, db.items, db.records, db.odometer, db.settings], async () => {
      await db.vehicles.update(vehicleId, {
        units: to,
        purchaseOdometer: vehicle.purchaseOdometer === undefined ? undefined : exact(vehicle.purchaseOdometer),
        updatedAt: now,
      });
      for (const r of await db.odometer.where('vehicleId').equals(vehicleId).toArray()) {
        await db.odometer.update(r.id, { value: exact(r.value), updatedAt: now });
      }
      for (const r of await db.records.where('vehicleId').equals(vehicleId).toArray()) {
        await db.records.update(r.id, { odometer: exact(r.odometer), updatedAt: now });
      }
      for (const i of await db.items.where('vehicleId').equals(vehicleId).toArray()) {
        await db.items.update(i.id, {
          intervalMiles: tidy(i.intervalMiles, 500),
          severeMiles: tidy(i.severeMiles, 500),
          firstDueMiles: tidy(i.firstDueMiles, 500),
          baseline: i.baseline ? { ...i.baseline, odometer: exact(i.baseline.odometer) } : undefined,
          updatedAt: now,
        });
      }
      const settings = await getSettings();
      await db.settings.put({ ...settings, dueSoonMiles: tidy(settings.dueSoonMiles, 100) ?? settings.dueSoonMiles, updatedAt: now });
    });
  }

  async function markBackedUp(): Promise<void> {
    await updateSettings({ lastBackupAt: nowIso(), recordsSinceBackup: 0 });
  }

  /** Erases all data on this device. */
  async function resetAll(): Promise<void> {
    await db.transaction('rw', [db.vehicles, db.items, db.records, db.odometer, db.attachments, db.settings, db.kv], async () => {
      await Promise.all([db.vehicles.clear(), db.items.clear(), db.records.clear(), db.odometer.clear(), db.attachments.clear(), db.settings.clear(), db.kv.clear()]);
    });
  }

  return {
    addAttachment, getAttachments, setAttachmentBlob, removeAttachment,
    dumpAll, replaceAll, mergeAll, markBackedUp, resetAll, upgradeSchedule, convertUnits,
    getSettings, updateSettings,
    getVehicle, createVehicle, updateVehicle,
    listItems, updateItem, addCustomItem, setBaseline, setSeasonalTires,
    listReadings, addReading,
    listRecords, addRecord, updateRecord, deleteRecord, restoreRecord,
    computeForVehicle,
  };
}

export type Repo = ReturnType<typeof createRepo>;

let sharedDb: TorqueDB | undefined;
/** The app-wide `torque` database, opened on first use. */
export function getDb(): TorqueDB {
  return (sharedDb ??= new TorqueDB());
}

let shared: Repo | undefined;
export function getRepo(): Repo {
  return (shared ??= createRepo(getDb()));
}
