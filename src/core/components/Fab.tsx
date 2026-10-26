import { useState } from 'preact/hooks';
import { useUi } from '../context';

export function Fab() {
  const [open, setOpen] = useState(false);
  const ui = useUi();
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <>
      {open && <div class="fab-scrim" onClick={() => setOpen(false)} />}
      <aside class="fab-wrap" aria-label="Quick add">
        {open && (
          <div class="fab-menu" role="menu">
            <button type="button" role="menuitem" onClick={pick(() => ui.openSheet({ type: 'log' }))}>Log service</button>
            <button type="button" role="menuitem" onClick={pick(() => ui.openSheet({ type: 'odometer' }))}>Update odometer</button>
            <button type="button" role="menuitem" onClick={pick(() => ui.openSheet({ type: 'log', mode: 'note' }))}>Add note</button>
          </div>
        )}
        <button type="button" class="fab" aria-label="Add" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </aside>
    </>
  );
}
