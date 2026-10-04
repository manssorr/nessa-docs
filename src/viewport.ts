// The one width breakpoint the layout changes at (styles.css uses the same
// 900px): below it the sidebar is a drawer and the details inspector a dialog.

import { useEffect, useState } from 'react';

export const NARROW = '(max-width: 899px)';

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}
