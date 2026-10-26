import { Segmented } from '../../core/components/Fields';
import { NumberInput } from '../../core/components/NumberInput';
import { useAppData } from '../../core/context';

export function Settings() {
  const { vehicle, settings, repo } = useAppData();
  return (
    <>
      <section class="card">
        <h2 class="section-title">Vehicle</h2>
        <p>{vehicle.nickname} · {vehicle.year} {vehicle.trim} 2.5 Turbo</p>
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
      <p class="muted">Cloud sync, backup and calendar settings arrive in the next phases.</p>
    </>
  );
}
