// THE ONE WAY A SURFACE READS A STORE PART (production-page refactor D1).
//
// A part is plain data with its own subscription (control/storePart.ts), so a component reading
// one re-renders only when that part moves, the idiom `ClipClock` already uses for the server's
// timing. `get` and `subscribe` keep their identity for the part's life, which this needs.

import { useSyncExternalStore } from 'react';
import type { StorePart } from '../../control/storePart';

export function useStorePart<T>(part: StorePart<T>): T {
  return useSyncExternalStore(part.subscribe, part.get);
}
