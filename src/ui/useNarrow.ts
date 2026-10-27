import { useEffect, useState } from 'react';

/** true on a narrow screen, where the interface folds itself away to leave the village in view */
export function useNarrow(query = '(max-width: 560px)'): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(query);
    const on = (): void => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return narrow;
}
