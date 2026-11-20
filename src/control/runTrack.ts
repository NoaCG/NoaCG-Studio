// WHICH REPORT COUNTS, AND WHEN ITS WAIT BEGAN (live-publishing G2 section 4a, #2608, M1, M4, M7).
//
// An output from #2608 on carries its boot mark `b` in every report and in its Presence entry, a
// counter `n`, and one settled fact (`w`, `k`, `wa`). The page keeps, per output, the report with
// the highest `n` whose `b` equals the mark of that output's one Presence entry, in the page's
// epoch; no entry, or entries with different marks, keep no report. A cursor never orders reports.
// It also notes, per boot, when its current wait began on this page's clock (receipt minus `wa`),
// and when the first settled report after a wait arrived, from which positions not received age
// again. Per boot, so a late row of the boot before never moves the current boot's clock.
//
// Pure and Node-tested (scripts/run-settled.test.mjs); the production page feeds it.

import type { RunReport } from './runReport.ts';

export interface OutputTrack {
  /** Per boot mark, the report with the highest `n` heard, from rows or Presence. */
  best: Record<string, RunReport>;
  /** This page's first sight of each boot mark. */
  seen: Record<string, number>;
  /** Per boot mark, its current wait's tag and when it began on this page's clock. */
  waits: Record<string, { w: string; since: number }>;
  /** Per boot mark, when the first settled report after a wait arrived. */
  settled: Record<string, number>;
}

export const emptyTrack = (): OutputTrack => ({ best: {}, seen: {}, waits: {}, settled: {} });

/** The boots whose reports an output's track remembers: the current one and those it replaced. */
const BOOTS_KEPT = 3;
/** The boots whose first sight it remembers, longer: a stale Presence entry of a boot whose
 *  reports were dropped must keep ageing from when it was first seen, never look new again. */
const SIGHTS_KEPT = 16;

/** Note one report with a boot mark (a row's or a Presence entry's); returns the same track when
 *  nothing changed. A report without `b` (an output built before #2608) is not tracked here. */
export function noteRun(track: OutputTrack | undefined, run: RunReport, now: number): OutputTrack {
  const t = track ?? emptyTrack();
  const b = run.b;
  if (!b) return t;
  const held = t.best[b];
  const newer = !held || (run.n ?? 0) > (held.n ?? 0);
  if (!newer && t.seen[b] !== undefined) return t;
  const seen = t.seen[b] === undefined ? { ...t.seen, [b]: now } : t.seen;
  let best = newer ? { ...t.best, [b]: run } : t.best;
  let waits = t.waits;
  let settled = t.settled;
  if (newer) {
    const wait = waits[b];
    if (run.w !== undefined && run.w !== 0) {
      if (!wait || wait.w !== run.w) waits = { ...waits, [b]: { w: run.w, since: now - (run.wa ?? 0) } };
    } else if (run.w === 0 && wait) {
      settled = { ...settled, [b]: now };
      waits = { ...waits };
      delete waits[b];
    }
  }
  const marks = Object.keys(best);
  if (marks.length > BOOTS_KEPT) {
    const oldest = marks.sort((x, y) => (seen[x] ?? 0) - (seen[y] ?? 0))[0];
    best = { ...best };
    delete best[oldest];
    waits = { ...waits };
    delete waits[oldest];
    settled = { ...settled };
    delete settled[oldest];
  }
  return { best, seen: trimSights(seen), waits, settled };
}

/** What an output's Presence entries say: its mark and the run it carries. */
export interface PresenceMark {
  b?: string;
  run?: RunReport | null;
}

export type Kept =
  /** Built before #2608: today's per-graphic judgement. */
  | { kind: 'legacy' }
  | { kind: 'kept'; b: string; run: RunReport }
  /** A boot mark and no report the page keeps: no run yet, two entries, or another epoch. */
  | { kind: 'none'; b: string; why: 'none' | 'two' | 'epoch' };

/** The report the page keeps for one present output (M1). `entries` are its Presence entries;
 *  `epoch` the page's (null between a republish and the new log's first word), and `retired` the
 *  epochs it has left, whose reports never count, whatever `epoch` is. */
export function keptReport(
  track: OutputTrack | undefined,
  entries: readonly PresenceMark[],
  epoch: string | null,
  retired: ReadonlySet<string> = NO_EPOCHS,
): Kept {
  const marks: string[] = [];
  for (const e of entries) if (e.b && marks.indexOf(e.b) < 0) marks.push(e.b);
  if (marks.length === 0) return { kind: 'legacy' };
  if (marks.length > 1 || entries.some((e) => !e.b)) {
    // A reload whose old connection lingers: the newest boot's clock decides, so the overlap reads
    // "Confirming…" rather than the old boot's age, and a ghost that stays still goes red (M6).
    const sight = (m: string) => track?.seen[m] ?? Infinity;
    const newest = marks.reduce((x, y) => (sight(y) > sight(x) ? y : x));
    return { kind: 'none', b: newest, why: 'two' };
  }
  const b = marks[0];
  const counts = (r: RunReport | null | undefined): r is RunReport => !!r && r.b === b && !retired.has(r.e);
  let run: RunReport | null = null;
  for (const e of entries) if (counts(e.run) && (!run || (e.run.n ?? 0) > (run.n ?? 0))) run = e.run;
  const heard = track?.best[b];
  if (counts(heard) && (!run || (heard.n ?? 0) > (run.n ?? 0))) run = heard;
  if (!run) {
    const stale = entries.some((e) => e.run && e.run.b === b) || (heard && heard.b === b);
    return { kind: 'none', b, why: stale ? 'epoch' : 'none' };
  }
  if (epoch !== null && run.e !== epoch) return { kind: 'none', b, why: 'epoch' };
  return { kind: 'kept', b, run };
}

const NO_EPOCHS: ReadonlySet<string> = new Set();

/** Note this page's first sight of a boot mark from a Presence entry with no run yet (M6). */
export function noteMark(track: OutputTrack | undefined, b: string, now: number): OutputTrack {
  const t = track ?? emptyTrack();
  if (t.seen[b] !== undefined) return t;
  return { ...t, seen: trimSights({ ...t.seen, [b]: now }) };
}

function trimSights(seen: Record<string, number>): Record<string, number> {
  const marks = Object.keys(seen);
  if (marks.length <= SIGHTS_KEPT) return seen;
  const out = { ...seen };
  for (const m of marks.sort((x, y) => seen[x] - seen[y]).slice(0, marks.length - SIGHTS_KEPT)) delete out[m];
  return out;
}
