import { useEffect, useState } from 'react';

// Phone / narrow-viewport breakpoint. Drives the single-column mobile layouts and matches
// the `@media (max-width: 768px)` block in styles.css — keep the two in sync. Keyed off viewport
// WIDTH (not user-agent sniffing), so a small desktop window gets the mobile layout too.
export const MOBILE_MAX_WIDTH = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX_WIDTH,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}
