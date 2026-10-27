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
  /** 'purchase' = "never serviced, car is new"; lets firstDueMiles and firstDueMonths apply. */
  source: 'purchase' | 'entered';
}

export type TireSet = 'winter' | 'summer';

/** A seasonal swap between winter and summer tires, due by a fixed date each year rather than an interval. */
export interface SeasonalTires {
  /** 'MM-DD': winter tires should be on by this date. */
  winterOn: string;
  /** 'MM-DD': summer tires should be on by this date. */
  summerOn: string;
  /** The set on the car when this was set up; a logged swap takes over from it. */
  mounted: TireSet;
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
  /** Months to the first replacement on a new car, when it differs from the repeat interval. */
  firstDueMonths?: number;
  /** Absent = "Not sure": treated as due now. */
  baseline?: Baseline;
  /** Present on the seasonal tire swap item, which ignores the interval fields. */
  seasonal?: SeasonalTires;
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
  /** Which built-in schedule the items were last upgraded to (1 = original US defaults, 2 = Mazda Canada). */
  seedVersion?: number;
  /** The one-time "Review your schedule" prompt has been dismissed. */
  scheduleReviewed?: boolean;
  /** Show the count of items needing attention on the home-screen icon. */
  badgeEnabled?: boolean;
  updatedAt: string;
}
