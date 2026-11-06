// A wizard draft lives only in the walk's reducer, so a page left open across a deploy must not
// reload under it (app/deploySkew.ts, issue #758): once the walk holds anything the reader made
// (`walkHasWork`, the same test the discard guard asks), the reload waits.

import { useEffect, useRef } from 'react';
import { holdReload } from '../../../app/deploySkew';
import { walkHasWork, type WalkState } from './walkState';

export function useDraftHoldsReload(walk: WalkState): void {
  const walkRef = useRef(walk);
  walkRef.current = walk;
  useEffect(() => holdReload(() => walkHasWork(walkRef.current)), []);
}
