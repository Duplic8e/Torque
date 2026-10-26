import type { JSX } from 'preact';
import { hrefFor, ROUTES, type Route } from '../../router';

const LABELS: Record<Route, string> = {
  dashboard: 'Home',
  schedule: 'Schedule',
  history: 'History',
  costs: 'Costs',
  settings: 'Settings',
};

// Lucide-style icon paths, inlined so nothing loads from the network.
const ICONS: Record<Route, JSX.Element> = {
  dashboard: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  schedule: <path d="M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />,
  history: <path d="M3 12a9 9 0 109-9 9 9 0 00-6.7 3M3 4v4h4M12 7v5l3 2" />,
  costs: <path d="M3 3v18h18M7 15v3M12 9v9M17 12v6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
};

export function TabBar({ current }: { current: Route }) {
  return (
    <nav class="tabbar" aria-label="Main">
      {ROUTES.map((route) => (
        <a key={route} href={hrefFor(route)} aria-current={route === current ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {ICONS[route]}
          </svg>
          {LABELS[route]}
        </a>
      ))}
    </nav>
  );
}
