// How a client slows down while the backend is failing. On 2026-11-03 the database hung for an hour
// and every page kept its normal rate, each request holding a connection for minutes
// (docs/work-specs/team-save-load/spec.md).

/** The wait after `failures` failures in a row: doubling from `baseMs` up to `maxMs`, spread by a
 *  quarter either way so pages that failed together do not come back together. */
export function backoffDelay(failures: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  if (failures <= 0) return 0;
  const doubled = Math.min(maxMs, baseMs * 2 ** (failures - 1));
  return Math.round(doubled * (0.75 + random() * 0.5));
}

/** One request at a time, for a beat that must not stack up behind a hung one. A request out for
 *  longer than `staleMs` no longer holds the next back, so one lost answer cannot stop the beat. */
export function oneAtATime(staleMs: number, now: () => number = Date.now): { begin(): (() => void) | null } {
  let current: { since: number } | null = null;
  return {
    /** The function that ends this request, or null to skip this beat. A stale request that answers
     *  late ends only itself, never the newer one out now. */
    begin() {
      if (current && now() - current.since < staleMs) return null;
      const mine = { since: now() };
      current = mine;
      return () => {
        if (current === mine) current = null;
      };
    },
  };
}

/** True when a window focus may run another sync pass. */
export function focusPassDue(lastPassAt: number, minGapMs: number, now: number): boolean {
  return now - lastPassAt >= minGapMs;
}
