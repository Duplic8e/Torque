import { ProgressBar } from '../../core/components/ProgressBar';
import { useAppData, useUi } from '../../core/context';
import { fmtMonth, fmtMonthShort } from '../../core/format';
import { MAZDA_CANADA_WARRANTY, timeLeftLabel, warrantyStatus } from '../../engine/warranty';

/** Factory warranty time left, counted from the delivery date. Hidden once every coverage has ended. */
export function WarrantyCard() {
  const { vehicle, today } = useAppData();
  const ui = useUi();

  if (!vehicle.purchaseDate) {
    return (
      <>
        <h2 class="section-title">Warranty</h2>
        <button type="button" class="nudge" onClick={() => ui.openSheet({ type: 'vehicle' })}>
          Enter your delivery date to see how much factory warranty is left.
        </button>
      </>
    );
  }

  // Running coverages first; ended ones stay listed, dimmed, until the last one ends.
  const coverages = warrantyStatus(MAZDA_CANADA_WARRANTY, vehicle.purchaseDate, today).sort(
    (a, b) => Number(a.state === 'ended') - Number(b.state === 'ended'),
  );
  if (coverages.every((c) => c.state === 'ended')) return null;
  const ending = coverages.find((c) => c.state === 'ending');

  return (
    <>
      <h2 class="section-title">Warranty</h2>
      {ending && (
        <section class="callout">
          <strong>{ending.name} coverage ends {fmtMonth(ending.ends)}</strong>
          <p class="muted">Have any noises, leaks or faults looked at by a Mazda dealer while it is still covered.</p>
        </section>
      )}
      <div class="group">
        {coverages.map((c) => (
          <div key={c.key} class={`list-row warranty-row${c.state === 'ended' ? ' is-ended' : ''}`}>
            <span class="row-top">
              <span class="row-title">{c.name}</span>
              <span class="num muted warranty-left">{c.state === 'ended' ? `Ended ${fmtMonthShort(c.ends)}` : timeLeftLabel(today, c.ends)}</span>
            </span>
            {c.state !== 'ended' && (
              <ProgressBar progress={c.progress} status={c.state === 'ending' ? 'soon' : 'ok'} label={`${c.name}: ${Math.round(c.progress * 100)}% of coverage used`} />
            )}
            <span class="row-bottom">
              <span>{c.covers}</span>
              {c.state !== 'ended' && <span class="num warranty-left">to {fmtMonthShort(c.ends)}</span>}
            </span>
          </div>
        ))}
      </div>
      <p class="footnote">Mazda Canada, unlimited km, from your delivery date. Your warranty booklet has the exact terms.</p>
    </>
  );
}
