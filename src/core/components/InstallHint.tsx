import { isIosSafari, isStandalone } from '../platform';

/** Shown only in iOS Safari, hidden once installed (standalone). */
export function InstallHint() {
  if (isStandalone() || !isIosSafari()) return null;
  return (
    <div class="card muted" role="note">
      Install Torque: tap Share, then “Add to Home Screen”.
    </div>
  );
}
