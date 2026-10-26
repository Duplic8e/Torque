import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/** Subscribes to a Dexie live query; `undefined` until the first result. */
export function useLive<T>(query: () => Promise<T>): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error('liveQuery failed', e) });
    return () => sub.unsubscribe();
    // The query closes over the stable repo singleton only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}
