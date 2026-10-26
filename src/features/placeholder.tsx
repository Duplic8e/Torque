import type { ComponentChildren } from 'preact';

/** Phase 1 stand-in for screens that are built in later phases. */
export function Placeholder({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <section class="card">
      <h2 style="margin:0 0 var(--space-2)">{title}</h2>
      <p class="muted" style="margin:0">Coming in a later phase.</p>
      {children}
    </section>
  );
}
