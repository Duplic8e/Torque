import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  title: string;
  onClose: () => void;
  /** Asks before discarding when true. */
  dirty?: boolean;
  children: ComponentChildren;
}

const DISMISS_DISTANCE = 90;

export function BottomSheet({ title, onClose, dirty = false, children }: Props) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const requestClose = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };

  // Remember what had focus before the sheet appeared (read during the first render, before any
  // autofocus inside the sheet can steal it) so focus can go back there when the sheet closes.
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    panel.current?.focus();
    return () => {
      const el = opener.current;
      if (el && el !== document.body && document.contains(el)) el.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return requestClose();
      if (e.key !== 'Tab' || !panel.current) return;
      // Keep Tab inside the sheet: wrap from the last control to the first and back.
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusable.length === 0) return e.preventDefault();
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const onPointerDown = (e: PointerEvent) => {
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (startY.current !== null) setDragY(Math.max(0, e.clientY - startY.current));
  };
  const onPointerUp = () => {
    if (dragY > DISMISS_DISTANCE) requestClose();
    startY.current = null;
    setDragY(0);
  };

  return (
    <div class="sheet-backdrop" onClick={requestClose}>
      <div
        ref={panel}
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          class="sheet-handle-area"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div class="sheet-handle" />
        </div>
        <div class="sheet-header">
          <h2>{title}</h2>
          <button type="button" class="btn-text" onClick={requestClose} aria-label="Close">
            Close
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
