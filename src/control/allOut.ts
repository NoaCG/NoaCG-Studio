// ALL OUT'S TARGETS AND PACE, plain functions so they run in Node (scripts/all-out.test.mjs). The
// send is hostedControl.ts `sendControlVerbs`; the presses are ProductionPage's and
// HostedControlPage's `outAll`; what the heads say is hostedControl.ts `headsSay`.

/** What All out clears (playout-workflow-simplification D11): every graphic this page has up and
 *  every one the server's heads say is on, since the page's list misses a graphic whose cue marker
 *  went missing. When neither knows of any in a published production, every graphic the heads have
 *  no word on: a renderer can keep graphics across a republish that no head remembers, and the
 *  panic control must never skip them. One a head says is off was stopped in this log already, so
 *  clearing it again would only spend the burst allowance the operator's next Takes need. */
export function allOutTargets(input: {
  local: readonly string[];
  /** Per graphic, whether the heads say it is on; null where the page follows no head. */
  heads: ReadonlyMap<string, boolean> | null;
  all: readonly string[];
  published: boolean;
}): string[] {
  const onServer = [...(input.heads ?? [])].filter(([, on]) => on).map(([graphic]) => graphic);
  const named = [...new Set([...input.local, ...onServer])];
  if (named.length || !input.published) return named;
  return [...new Set(input.all)].filter((graphic) => !input.heads?.has(graphic));
}

/** How long All out reads Clearing… waiting for the heads to say each graphic is off, before it
 *  names the ones that are not (AC-13). */
export const ALL_OUT_CONFIRM_MS = 5_000;

/** The server's burst cap (`control_send_seq`, migration 0071): a press is refused when it takes the
 *  production past 50 command rows in 5 s. */
export const BURST_WINDOW_MS = 5_000;
/** The rows one All out may put in one window: the cap less room for the operator's next Takes. */
export const ALL_OUT_ROWS_PER_WINDOW = 40;

/** Which wave each of All out's batches leaves in, given their row counts: a wave holds at most
 *  `budget` rows, and the next one leaves a window after the last landed. */
export function allOutWaves(rows: readonly number[], budget = ALL_OUT_ROWS_PER_WINDOW): number[] {
  let wave = 0;
  let used = 0;
  return rows.map((n) => {
    if (used > 0 && used + n > budget) {
      wave += 1;
      used = 0;
    }
    used += n;
    return wave;
  });
}
