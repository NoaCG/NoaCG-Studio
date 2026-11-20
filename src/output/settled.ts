// ONE SETTLED FACT PER OUTPUT (live-publishing G2 section 4a, #2608, M2).
//
// The output says whether it is settled, so a page never rebuilds that from per-graphic entries,
// cursors or folds. `w` is 0 exactly when nothing is unsettled (no held, loading, late, failed or
// placing graphic, no restored graphic waiting to be drawn, and the boot has read what to put
// back); otherwise it is a tag drawn when the output went from settled to unsettled, or left
// `failed`, so a fresh wait starts young. `k` is the worst kind, `y` its reason when failed, and
// `wa` how long the wait has lasted. `n` rises whenever what the report says changes (`wa`
// excepted), so the page orders reports of one boot by it and an unchanged entry costs no call.
//
// Plain and dependency-free, ES2017: the output runs it in Chromium 71, and
// scripts/run-settled.test.mjs runs it in Node.

import type { HeldEntry, HeldKind, RunReport } from '../control/runReport';

const RANK: Record<HeldKind, number> = { placing: 1, loading: 2, late: 2, failed: 3 };

/** A boot mark: a random tag drawn once per output page (Math.random: Chromium 71 has it). */
export const drawTag = (): string => Math.random().toString(36).slice(2, 10) || 'x';

export interface SettledState {
  /** The current wait's tag, or 0 when settled. */
  w: string | 0;
  /** When the current wait began, on this output's clock. */
  since: number;
  k?: HeldKind;
  /** The counter, and the content it last counted. */
  n: number;
  said: string;
}

export const settledStart = (): SettledState => ({ w: 0, since: 0, n: 0, said: '' });

/** The boot's own part of the fact: has it read what to put back, and did it give up at 60 s. */
export interface BootFact {
  read: boolean;
  /** 60 s passed with nothing read (M5): the wait is `failed` `boot`. */
  overdue: boolean;
}

/** The worst kind in `h`, with its reason; the boot counts as `placing` (or `failed` `boot`). */
export function worstOf(h: Record<string, HeldEntry>, boot: BootFact): { k?: HeldKind; y?: string } {
  let k: HeldKind | undefined;
  let y: string | undefined;
  if (!boot.read) {
    k = boot.overdue ? 'failed' : 'placing';
    if (boot.overdue) y = 'boot';
  }
  for (const key of Object.keys(h)) {
    const [, kind, why] = h[key];
    if (!k || RANK[kind] > RANK[k]) {
      k = kind;
      y = kind === 'failed' ? why : undefined;
    }
  }
  return k ? (y ? { k, y } : { k }) : {};
}

/**
 * The report with its settled fact: `run` plus `b`, `n`, `w`, `k`, `y` and `wa`. Returns the next
 * state; a caller keeps it for the next build.
 */
export function withSettled(
  state: SettledState,
  run: RunReport,
  boot: BootFact,
  b: string,
  now: number,
  draw: () => string = drawTag,
): { run: RunReport; state: SettledState } {
  const { k, y } = worstOf(run.h, boot);
  let w = state.w;
  let since = state.since;
  if (!k) w = 0;
  else if (w === 0 || (state.k === 'failed' && k !== 'failed')) {
    w = draw();
    since = now;
  }
  const said = JSON.stringify([run.p, run.h, run.e, w, k, y]);
  const n = said === state.said ? state.n : state.n + 1;
  const out: RunReport = { ...run, b, n, w };
  if (k) {
    out.k = k;
    if (y) out.y = y;
    out.wa = Math.max(0, now - since);
  }
  return { run: out, state: { w, since, k, n, said } };
}
