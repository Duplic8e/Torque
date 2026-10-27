import { Field, Segmented, Toggle } from '../../core/components/Fields';
import { useAppData } from '../../core/context';
import { fmtDateLong, fmtMonthDay } from '../../core/format';
import type { SeasonalTires, TireSet } from '../../data/types';
import { DEFAULT_SEASONAL, SUMMER_ON_OPTIONS, TIRE_SWAP_KEY, WINTER_ON_OPTIONS } from '../../engine/seasonal';

function DateChoice({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const list = options.includes(value) ? options : [value, ...options];
  return (
    <Field label={label}>
      <select class="input" value={value} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value)}>
        {list.map((o) => <option key={o} value={o}>{fmtMonthDay(o)}</option>)}
      </select>
    </Field>
  );
}

/** Settings card for the seasonal winter/summer tire swap reminder. */
export function TiresSection() {
  const { items, due, repo, vehicle } = useAppData();
  const item = items.find((i) => i.key === TIRE_SWAP_KEY);
  const on = !!item?.enabled && !!item.seasonal;
  const config: SeasonalTires = item?.seasonal ?? { ...DEFAULT_SEASONAL, mounted: 'summer' };
  const swap = due.items.find((d) => d.key === TIRE_SWAP_KEY);
  const logged = swap?.lastDone?.source === 'record';
  const save = (patch: Partial<SeasonalTires>) => void repo.setSeasonalTires(vehicle.id, { ...config, ...patch });

  return (
    <section class="card">
      <h2 class="section-title">Winter tires</h2>
      <Toggle label="I swap to winter tires" checked={on} onChange={(v) => void repo.setSeasonalTires(vehicle.id, v ? config : null)} />
      {on && (
        <>
          {logged ? (
            <p class="muted">
              {swap?.seasonal?.mounted === 'winter' ? 'Winter' : 'Summer'} tires went on {fmtDateLong(swap!.lastDone!.date)} (last swap logged).
            </p>
          ) : (
            <Segmented<TireSet>
              label="On the car now"
              value={config.mounted}
              options={[{ value: 'summer', label: 'Summer' }, { value: 'winter', label: 'Winter' }]}
              onChange={(mounted) => save({ mounted })}
            />
          )}
          <div class="row">
            <DateChoice label="Winter tires on by" value={config.winterOn} options={WINTER_ON_OPTIONS} onChange={(winterOn) => save({ winterOn })} />
            <DateChoice label="Summer tires on by" value={config.summerOn} options={SUMMER_ON_OPTIONS} onChange={(summerOn) => save({ summerOn })} />
          </div>
        </>
      )}
      <p class="muted">
        Reminds you {on ? 'ahead of each date' : 'twice a year'}, using your due-soon days. Log each swap as a service to move it to the
        next season. Quebec requires winter tires from December 1 to March 15.
      </p>
    </section>
  );
}
