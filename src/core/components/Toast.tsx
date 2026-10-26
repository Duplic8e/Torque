import { useEffect } from 'preact/hooks';
import type { Toast as ToastData } from '../context';

export function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, toast.actionLabel ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);
  return (
    <div class="toast toast-top" role="status">
      <span>{toast.message}</span>
      {toast.actionLabel && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.();
            onDismiss();
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}
