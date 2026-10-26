export type ID = string; // crypto.randomUUID()
export type ISODate = string; // 'YYYY-MM-DD'

export type Category =
  | 'Oil'
  | 'Tires'
  | 'Brakes'
  | 'Filters'
  | 'Fluids'
  | 'Ignition'
  | 'Inspection'
  | 'Repairs'
  | 'Other';

/** Fields every synced entity carries: updatedAt for merging, deletedAt as a tombstone. */
interface Syncable {
  updatedAt: string;
  deletedAt?: string;
}

export interface Vehicle extends Syncable {
  id: ID;
  nickname: string;
  make: 'Mazda';
  model: 'CX-5';
  year: number;
  trim: 'Signature';
  engine: 'SKYACTIV-G 2.5T';
  vin?: string;
  plate?: string;
  purchaseDate?: ISODate;
  purchaseOdometer?: number;
  units: 'mi' | 'km';
  drivingStyle: 'normal' | 'severe';
  oilSpec?: string;
  tireSize?: string;
  createdAt: string;
}

export interface OdometerReading extends Syncable {
  id: ID;
  vehicleId: ID;
  date: ISODate;
  value: number;
  source: 'manual' | 'service';
  isCorrection?: boolean;
}

/** Where an item's clock starts when no service record exists for it. */
export interface Baseline {
  date: ISODate;
  odometer: number;
  /** 'purchase' = "never serviced, car is new"; lets firstDueMiles apply. */
  source: 'purchase' | 'entered';
}

export interface ServiceItem extends Syncable {
  id: ID;
  vehicleId: ID;
  key: string;
  name: string;
  category: Category;
  kind: 'replace' | 'inspect';
  intervalMiles?: number;
  intervalMonths?: number;
  severeMiles?: number;
  severeMonths?: number;
  firstDueMiles?: number;
  /** Absent = "Not sure": treated as due now. */
  baseline?: Baseline;
  enabled: boolean;
  isCustom: boolean;
  notes?: string;
  sortOrder: number;
}

export interface ServiceRecord extends Syncable {
  id: ID;
  vehicleId: ID;
  date: ISODate;
  odometer: number;
  itemKeys: string[];
  totalCost?: number;
  itemCosts?: Record<string, number>;
  shop?: string;
  diy: boolean;
  parts?: string;
  notes?: string;
  attachmentIds: ID[];
  createdAt: string;
}

export interface Attachment extends Syncable {
  id: ID;
  recordId: ID;
  /** Absent until a photo synced from another device is first viewed. */
  blob?: Blob;
  mime: string;
  createdAt: string;
}

export interface Settings {
  id: 'settings';
  dueSoonMiles: number;
  dueSoonDays: number;
  calendarAlertTime: string;
  calendarDaysBefore: number;
  lastBackupAt?: string;
  recordsSinceBackup: number;
  schemaVersion: number;
  /** The one-time "Review your schedule" prompt has been dismissed. */
  scheduleReviewed?: boolean;
  updatedAt: string;
}
