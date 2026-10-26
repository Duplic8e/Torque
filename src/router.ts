import { useEffect, useState } from 'preact/hooks';

export type Route = 'dashboard' | 'schedule' | 'history' | 'costs' | 'settings';

export const ROUTES: readonly Route[] = ['dashboard', 'schedule', 'history', 'costs', 'settings'];

/** Parse a location hash like `#/history` into a route; unknown hashes go home. */
export function parseHash(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'dashboard';
}

export function hrefFor(route: Route): string {
  return `#/${route}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
