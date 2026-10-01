// WOULD A PUBLISH CHANGE WHAT THE OUTPUTS RENDER? (docs/work-specs/studio-day-playout AC-5)
//
// A publish resolves every graphic's CURRENT template out of the library (model/library.ts
// `templateForSavedGraphic`), so a graphic edited in the editor changes the next publish without
// ever touching the production record - and "unpublished changes", read off the record's own
// timestamps, stayed clean. On the studio day of 2026-10-01 that is how graphics stayed off air
// until somebody published again, and how Prepare for Live could say "Nothing changed".
//
// So the page also compares what a publish WOULD write with what IS published: the render identity
// (`renderIdentity`, the stamp's `h`) against the published stamp. Only that: a cue-only change
// moves no `h` by design, and the record's timestamp already covers it.

import { useEffect, useState } from 'react';
import { renderIdentity } from '../../control/hostedControl';
import type { HeldVersion } from '../../control/readiness';
import { loadGraphics } from '../../model/library';
import type { Show } from '../../model/shows';

/** How long the production must sit still before the payload is built again to compare. */
const SETTLE_MS = 600;

/**
 * True when publishing `show` now would change what its outputs render. False while it is not
 * published, while the published stamp is unknown (published before stamps existed, or still
 * being read), and when the payload cannot be built: this never claims a change it has not seen.
 * `show` is re-read by the page on every landed write, a library edit in another tab included,
 * and the library is read fresh each time, so either kind of change reaches it.
 */
export function usePublishDrift(show: Show | null, published: HeldVersion | null): boolean {
  const [drift, setDrift] = useState(false);
  useEffect(() => {
    if (!show?.publishedAt || !published) {
      setDrift(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      renderIdentity(show, loadGraphics()).then(
        (h) => alive && setDrift(h !== published.h),
        () => alive && setDrift(false),
      );
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [show, published]);
  return drift;
}
