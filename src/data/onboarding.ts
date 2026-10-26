import type { NewVehicle, Repo } from './repo';
import type { ISODate, Vehicle } from './types';

export type ServiceAnswer =
  | { mode: 'entered'; date: ISODate; odometer: number }
  | { mode: 'never' }
  | { mode: 'unsure' };

export interface OnboardingInput {
  vehicle: NewVehicle;
  odometer: number;
  /** Keyed by item key (oil, rotation, ...). Missing = "Not sure". */
  services: Record<string, ServiceAnswer>;
  /** Used by "Never, car is new". Default to today and the current odometer. */
  purchaseDate?: ISODate;
  purchaseOdometer?: number;
}

/** Creates the vehicle, the first odometer reading and each core item's starting point. */
export async function runOnboarding(repo: Repo, input: OnboardingInput, today: ISODate): Promise<Vehicle> {
  const anyNever = Object.values(input.services).some((s) => s.mode === 'never');
  const purchaseDate = anyNever ? (input.purchaseDate ?? today) : input.purchaseDate;
  const purchaseOdometer = anyNever ? (input.purchaseOdometer ?? input.odometer) : input.purchaseOdometer;

  const vehicle = await repo.createVehicle({ ...input.vehicle, purchaseDate, purchaseOdometer });

  // A purchase reading gives the pace estimate a second data point.
  if (purchaseDate && purchaseOdometer !== undefined && purchaseDate < today && purchaseOdometer <= input.odometer) {
    await repo.addReading(vehicle.id, purchaseDate, purchaseOdometer);
  }
  await repo.addReading(vehicle.id, today, input.odometer);

  const items = await repo.listItems(vehicle.id);
  for (const [key, answer] of Object.entries(input.services)) {
    const item = items.find((i) => i.key === key);
    if (!item) continue;
    if (answer.mode === 'entered') {
      await repo.setBaseline(item.id, { date: answer.date, odometer: answer.odometer, source: 'entered' });
    } else if (answer.mode === 'never') {
      await repo.setBaseline(item.id, { date: purchaseDate ?? today, odometer: purchaseOdometer ?? input.odometer, source: 'purchase' });
    }
  }
  return vehicle;
}

