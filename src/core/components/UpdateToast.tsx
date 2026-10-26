import { useRegisterSW } from 'virtual:pwa-register/preact';

/** Shows "Update available, tap to refresh" when a new service worker is waiting. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div class="toast" role="status">
      <span>Update available</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Tap to refresh
      </button>
    </div>
  );
}
