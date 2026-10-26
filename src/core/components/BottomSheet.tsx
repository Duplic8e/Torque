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

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
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
