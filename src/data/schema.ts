import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import type {
  Attachment,
  OdometerReading,
  ServiceItem,
  ServiceRecord,
  Settings,
  Vehicle,
} from './types';

export class TorqueDB extends Dexie {
  vehicles!: Table<Vehicle, string>;
  items!: Table<ServiceItem, string>;
  records!: Table<ServiceRecord, string>;
  odometer!: Table<OdometerReading, string>;
  attachments!: Table<Attachment, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'torque') {
    super(name);
    this.version(1).stores({
      vehicles: 'id',
      items: 'id, vehicleId, key',
      records: 'id, vehicleId, date, odometer, *itemKeys',
      odometer: 'id, vehicleId, date',
      attachments: 'id, recordId',
      settings: 'id',
    });
  }
}

// Zod schemas, used to validate imports and pulled sync data. Each is typed against
// the hand-written interface so the two cannot drift apart.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sync = { updatedAt: z.string(), deletedAt: z.string().optional() };

const category = z.enum([
  'Oil', 'Tires', 'Brakes', 'Filters', 'Fluids', 'Ignition', 'Inspection', 'Repairs', 'Other',
]);

export const vehicleSchema: z.ZodType<Vehicle> = z.object({
  id: z.string(),
  nickname: z.string(),
  make: z.literal('Mazda'),
  model: z.literal('CX-5'),
  year: z.number().int(),
  trim: z.literal('Signature'),
  engine: z.literal('SKYACTIV-G 2.5T'),
  vin: z.string().optional(),
  plate: z.string().optional(),
  purchaseDate: isoDate.optional(),
  purchaseOdometer: z.number().optional(),
  units: z.enum(['mi', 'km']),
  drivingStyle: z.enum(['normal', 'severe']),
  oilSpec: z.string().optional(),
  tireSize: z.string().optional(),
  createdAt: z.string(),
  ...sync,
});

export const odometerReadingSchema: z.ZodType<OdometerReading> = z.object({
  id: z.string(),
  vehicleId: z.string(),
  date: isoDate,
  value: z.number().nonnegative(),
  source: z.enum(['manual', 'service']),
  isCorrection: z.boolean().optional(),
  ...sync,
});

export const serviceItemSchema: z.ZodType<ServiceItem> = z.object({
  id: z.string(),
  vehicleId: z.string(),
  key: z.string(),
  name: z.string(),
  category,
  kind: z.enum(['replace', 'inspect']),
  intervalMiles: z.number().positive().optional(),
  intervalMonths: z.number().positive().optional(),
  severeMiles: z.number().positive().optional(),
  severeMonths: z.number().positive().optional(),
  firstDueMiles: z.number().positive().optional(),
  baseline: z
    .object({ date: isoDate, odometer: z.number(), source: z.enum(['purchase', 'entered']) })
    .optional(),
  enabled: z.boolean(),
  isCustom: z.boolean(),
  notes: z.string().optional(),
  sortOrder: z.number(),
  ...sync,
});

export const serviceRecordSchema: z.ZodType<ServiceRecord> = z.object({
  id: z.string(),
  vehicleId: z.string(),
  date: isoDate,
  odometer: z.number().nonnegative(),
  itemKeys: z.array(z.string()),
  totalCost: z.number().nonnegative().optional(),
  itemCosts: z.record(z.string(), z.number()).optional(),
  shop: z.string().optional(),
  diy: z.boolean(),
  parts: z.string().optional(),
  notes: z.string().optional(),
  attachmentIds: z.array(z.string()),
  createdAt: z.string(),
  ...sync,
});

export const settingsSchema: z.ZodType<Settings> = z.object({
  id: z.literal('settings'),
  dueSoonMiles: z.number().nonnegative(),
  dueSoonDays: z.number().nonnegative(),
  calendarAlertTime: z.string(),
  calendarDaysBefore: z.number().nonnegative(),
  lastBackupAt: z.string().optional(),
  recordsSinceBackup: z.number().int().nonnegative(),
  schemaVersion: z.number().int(),
  scheduleReviewed: z.boolean().optional(),
  updatedAt: z.string(),
});
