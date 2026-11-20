// WHAT AN OUTPUT HAS RUN (live-publishing G2 section 1; W3, E1).
//
// Each output says, per graphic, the last command it actually ran: `p` is its cursor in the
// numbered log, and `h` lists every graphic with commands it has received and not settled (held
// while the graphic loads, waiting in the stage, or failed). For graphic g:
//
//   ran(o, g) = h[g] ? h[g].from - 1 : p
//
// and every command of g at or below it is settled on that output. It rides each report row as
// `state.run` and the Presence entry as `ready.run`. Plain and dependency-free: the output loads it
// in Chromium 71, the production page reads it, and scripts/run-report.test.mjs runs it in Node.

export type HeldKind = 'loading' | 'late' | 'placing' | 'failed';

/** One graphic's unsettled work: where it starts, what it is, and for `failed` why. */
export type HeldEntry = [from: number, kind: HeldKind, why?: string];

export interface RunReport {
  /** The output's instance id. */
  o: string;
  /** Its cursor: every command at or below it is settled, except the graphics in `h`. */
  p: number;
  h: Record<string, HeldEntry>;
  /** The first 8 characters of the epoch it follows. */
  e: string;
  // ONE SETTLED FACT (G2 section 4a, #2608), from outputs built since: absent on older ones.
  /** The boot mark: a random tag per output page. */
  b?: string;
  /** Rises whenever what this boot reports changes (`wa` excepted): orders reports of one boot. */
  n?: number;
  /** 0 when nothing is unsettled; otherwise the current wait's tag. */
  w?: string | 0;
  /** The worst kind unsettled, and its reason when failed. */
  k?: HeldKind;
  y?: string;
  /** How long the wait had lasted when this report was built, in ms. */
  wa?: number;
}

/** The Presence entry lists at most this many held graphics. */
export const MAX_HELD_LISTED = 12;
const KINDS: HeldKind[] = ['loading', 'late', 'placing', 'failed'];

export const epochTag = (epoch: string | null | undefined) => (epoch || '').slice(0, 8);

/** The last position of `graphic` that has run on the output this report is from. */
export function ranFor(run: RunReport, graphic: string): number {
  const held = run.h[graphic];
  return held ? held[0] - 1 : run.p;
}

/** A run report whose `h` lists at most `max` graphics, the oldest work first; `p` is lowered to
 *  the smallest unlisted `from` minus 1, so it never claims more than is true. */
export function listed(run: RunReport, max = MAX_HELD_LISTED): RunReport {
  const keys = Object.keys(run.h);
  if (keys.length <= max) return run;
  keys.sort((a, b) => run.h[a][0] - run.h[b][0]);
  const h: Record<string, HeldEntry> = {};
  for (const key of keys.slice(0, max)) h[key] = run.h[key];
  let p = run.p;
  for (const key of keys.slice(max)) p = Math.min(p, run.h[key][0] - 1);
  return { ...run, p, h };
}

/** A run report off the wire (a report row's state, a Presence entry), or null. */
export function readRun(value: unknown): RunReport | null {
  const r = value as Partial<RunReport> | null;
  if (!r || typeof r !== 'object' || typeof r.o !== 'string' || typeof r.p !== 'number' || !isFinite(r.p)) return null;
  const h: Record<string, HeldEntry> = {};
  const raw = r.h && typeof r.h === 'object' ? (r.h as Record<string, unknown>) : {};
  for (const key of Object.keys(raw).slice(0, 200)) {
    const entry = raw[key];
    if (!Array.isArray(entry) || typeof entry[0] !== 'number' || KINDS.indexOf(entry[1]) < 0) continue;
    h[key.slice(0, 80)] = typeof entry[2] === 'string' ? [entry[0], entry[1], entry[2].slice(0, 40)] : [entry[0], entry[1]];
  }
  const run: RunReport = { o: r.o.slice(0, 80), p: r.p, h, e: typeof r.e === 'string' ? r.e.slice(0, 8) : '' };
  if (typeof r.b === 'string' && r.b) run.b = r.b.slice(0, 16);
  if (typeof r.n === 'number' && isFinite(r.n)) run.n = r.n;
  if (r.w === 0 || (typeof r.w === 'string' && r.w)) run.w = typeof r.w === 'string' ? r.w.slice(0, 16) : 0;
  if (typeof r.k === 'string' && KINDS.indexOf(r.k) >= 0) run.k = r.k;
  if (typeof r.y === 'string') run.y = r.y.slice(0, 40);
  if (typeof r.wa === 'number' && isFinite(r.wa) && r.wa >= 0) run.wa = r.wa;
  return run;
}

/** A report row's machine state without its run report: what the page's event buttons read. */
export function withoutRun<S>(state: S): S {
  if (!state || typeof state !== 'object' || !('run' in (state as object))) return state;
  const copy = { ...(state as Record<string, unknown>) };
  delete copy.run;
  return (Object.keys(copy).length ? copy : null) as S;
}
