// WOULD A PUBLISH CHANGE WHAT THE OUTPUTS RENDER? (docs/work-specs/studio-day-playout AC-5)
//
// A publish resolves every graphic's CURRENT template out of the library (model/library.ts
// `templateForSavedGraphic`), so a graphic edited in the editor changes the next publish without
// ever touching the production record - and "unpublished changes", read off the record's own
// timestamps, stayed clean. On the studio day of 2026-10-01 that is how graphics stayed off air
// until somebody published again, and how Prepare for Live could say "Nothing changed".
//
// So the page also compares, graphic by graphic, what a publish WOULD write for the graphics this
// browser reads from its own library (`libraryGraphicDigests`) with the published stamp's digests.
// Only that: a cue-only change moves no digest by design, a graphic added or removed changes the
// record, and the record's timestamp already covers both.

import { useCallback, useEffect, useRef, useState } from 'react';
import { libraryGraphicDigests } from '../../control/hostedControl';
import { loadGraphics } from '../../model/library';
import type { Show } from '../../model/shows';

/** How long the production must sit still before the digests are read again. */
const SETTLE_MS = 400;

/** A graphic whose published digest differs from what a publish would write now. A graphic the
 *  published stamp does not name (added since, or published before stamps existed) is the record's
 *  to report, not this. */
function drifted(local: Record<string, string>, published: Record<string, string>): boolean {
  return Object.keys(local).some((key) => published[key] !== undefined && published[key] !== local[key]);
}

/**
 * `drift`: publishing `show` now would change what its outputs render. False while it is not
 * published, while the published digests are unknown (published before stamps existed, or still
 * being read), and when they cannot be computed: this never claims a change it has not seen.
 * `show` is re-read by the page on every landed write, a library edit in another tab included,
 * and the library is read fresh each time, so either kind of change reaches it.
 *
 * `check()` answers the same question NOW, without the settle delay, for a press that must not act
 * on a reading a moment old (Prepare for Live deciding whether to publish).
 */
export function usePublishDrift(show: Show | null, published: Record<string, string> | null): { drift: boolean; check: () => Promise<boolean> } {
  const [drift, setDrift] = useState(false);
  const latest = useRef({ show, published });
  latest.current = { show, published };
  const check = useCallback(async () => {
    const { show: s, published: p } = latest.current;
    if (!s?.publishedAt || !p) return false;
    try {
      return drifted(await libraryGraphicDigests(s, loadGraphics()), p);
    } catch {
      return false;
    }
  }, []);
  useEffect(() => {
    if (!show?.publishedAt || !published) {
      setDrift(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void check().then((d) => alive && setDrift(d));
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [show, published, check]);
  return { drift, check };
}
