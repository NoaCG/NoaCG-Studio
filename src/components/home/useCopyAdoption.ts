// ADOPTION ON THE PRODUCTION PAGE (live-publishing O5, docs/work-specs/live-publishing/designs/G1.md
// section 5). Once a production is open, the account may write and the production-copies switch
// reads on, its unstamped copies are settled once (control/copyAdoption.ts) and stamped. Until the
// switch is on, or while it cannot be read, nothing is written: no page built before copy truth may
// still save beside an adopted record. The write is outside the undo history.

import { useEffect, useRef } from 'react';
import { readCopiesState } from '../../backend/productionCopies';
import { copyDigest, readPublishedStamp } from '../../control/hostedControl';
import { adoptionPlan, owesAdoption } from '../../control/copyAdoption';
import { commitDurableWrites } from '../../model/durableStore';
import { loadGraphics } from '../../model/library';
import { adoptShowCopies, loadShows, type Show } from '../../model/shows';

export function useCopyAdoption(show: Show | null, canWrite: boolean, setShows: (shows: Show[]) => void): void {
  const tried = useRef<string | null>(null);
  const id = show?.id ?? null;
  const owes = !!show && owesAdoption(show.graphics);
  useEffect(() => {
    if (!id || !canWrite || !owes || tried.current === id) return;
    tried.current = id;
    let alive = true;
    void (async () => {
      const state = await readCopiesState();
      if (!alive || !state?.on) return;
      const current = loadShows().find((s) => s.id === id);
      if (!current || !owesAdoption(current.graphics)) return;
      const stamp = current.hostedSlug ? await readPublishedStamp(id) : null;
      if (!alive) return;
      const read = Object.fromEntries(current.graphics.map((g) => [g.id, g.savedAt]));
      const plan = await adoptionPlan(current, loadGraphics(), stamp, copyDigest);
      if (!alive || Object.keys(plan).length === 0) return;
      const result = adoptShowCopies(id, plan, read);
      setShows(result.shows);
      // A background write that reports nothing: the app-level dialog announces an unclaimed failure.
      if (!result.error) void commitDurableWrites();
    })();
    return () => { alive = false; };
  }, [id, canWrite, owes, setShows]);
}
