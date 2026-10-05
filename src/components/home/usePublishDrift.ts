// HAS THE PRODUCTION CHANGED SINCE IT WAS PUBLISHED? (docs/work-specs/studio-day-playout AC-5)
//
// Two ways. The production record itself (cues, items, folders) moved past its publish: its own
// timestamps say so. Or a publish would render something different although the record did not
// move: a publish resolves every graphic's CURRENT template out of the library (model/library.ts
// `templateForSavedGraphic`), so a graphic edited in the editor changes the next publish without
// touching the record. On the studio day of 2026-10-01 that second kind stayed invisible: graphics
// stayed off air until somebody published again, and Prepare for Live said "Nothing changed".
//
// The second is read graphic by graphic: what a publish would write for the graphics this browser
// reads from its own library (`libraryGraphicDigests`) against the published stamp's digests. It is
// computed independently of record changes, so a cue reorder cannot hide changed output assets.

import { useCallback, useEffect, useRef, useState } from 'react';
import { libraryGraphicDigests } from '../../control/hostedControl';
import { rendersDiffer } from '../../control/payloadVersion';
import { loadGraphics } from '../../model/library';
import type { Show } from '../../model/shows';

/** How long the production must sit still before the digests are read again. */
const SETTLE_MS = 400;

/** The record moved past its publish. */
function recordChanged(show: Show | null): boolean {
  return !!show?.publishedAt && show.updatedAt > show.publishedAt;
}

/**
 * `unpublished`: publishing `show` now would change something - the record, or what its outputs
 * render. Never claimed for a production that is not published, or while the published digests are
 * unknown (published before stamps existed, or still being read), or when they cannot be computed.
 * `show` is re-read by the page on every landed write, a library edit in another tab included, and
 * the library is read fresh each time, so either kind of change reaches it.
 *
 * `check()` answers the same question NOW, without the settle delay, for a press that must not act
 * on a reading a moment old (Prepare for Live deciding whether to publish).
 */
export function usePublishDrift(show: Show | null, published: Record<string, string> | null): { unpublished: boolean; requiresPreparation: boolean; check: () => Promise<boolean> } {
  const [drift, setDrift] = useState(false);
  const latest = useRef({ show, published });
  latest.current = { show, published };
  const check = useCallback(async () => {
    const { show: s, published: p } = latest.current;
    if (recordChanged(s)) return true;
    if (!s?.publishedAt || !p) return false;
    try {
      return rendersDiffer(await libraryGraphicDigests(s, loadGraphics()), p);
    } catch {
      return false;
    }
  }, []);
  const changed = recordChanged(show);
  const poolChanged = !!published && !!show && (show.graphics.length !== Object.keys(published).length || show.graphics.some(g => !(g.name in published)));
  useEffect(() => {
    if (!show?.publishedAt || !published) {
      setDrift(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void libraryGraphicDigests(show, loadGraphics()).then(
        digests => { if (alive) setDrift(rendersDiffer(digests, published)); },
        () => { if (alive) setDrift(true); },
      );
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [show, published, changed, check]);
  return { unpublished: changed || drift || poolChanged, requiresPreparation: drift || poolChanged || (changed && !published), check };
}
