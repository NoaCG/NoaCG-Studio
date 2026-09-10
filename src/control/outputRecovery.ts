// WHERE A BOOTING RENDERER STARTS READING THE COMMAND LOG (docs/CLOUD_PLAYOUT.md §3).
//
// Pure, and deliberately outside `output/main.ts`: that page only ever runs against a live
// backend, so a rule decided inside its boot closure can be verified by no offline spec — and
// "which rows count as already applied" is exactly where a bug here hides, on air. The match
// clock's wire half (matchClockWire.ts) lives out here for the same reason.
//
// ── The rule ──
//
// Every report a renderer writes carries the log row it had applied when it captured that truth
// (`live[graphic].event`, migration 0033). A graphic rebuilt from its own report therefore
// accounts for everything up to its OWN baseline and nothing after it, so boot follows from the
// OLDEST of those baselines and drops, per graphic, only what that graphic's snapshot already
// contains — reports are per graphic and debounced, so one can be seconds fresher than another
// and a single show-wide cursor would lose the difference.
//
// ── Why the fallback is the log START and not the log head ──
//
// A production with no baseline anywhere used to start at the log HEAD, on the reasoning that
// there was no snapshot for the history to fill in. But the head is a claim about the RENDERER —
// "everything up to here is already on air" — and in that state nothing had rendered anything:
// every row in that log was a command sent to a production no renderer had ever followed.
// Starting at the head threw exactly those commands away, permanently, because there was also no
// snapshot to recover from; the graphic stayed dark until an operator happened to send another
// command. An operator who takes a cue and THEN opens the output URL is the everyday shape of
// it, and the boot itself is a race: the take only has to beat the resolve, which on a cold page
// is a second or more away. That race is what made `quiz-output` and `scorebug-output` flaky on
// CI on 2026-08-24 (both dark for the poll's full 30 s, both green on retry) while never failing
// on a warm laptop.
//
// It is the same shape as the 0029 bug that 0033 fixed for REPORTED graphics, left open for
// unreported ones. So: no baseline anywhere means the start of the log. Nothing renderable has
// been rendered, so replaying it is the FIRST airing rather than a re-airing — and the boot pass
// runs with the stage hidden either way, so it settles off air rather than playing the history
// out on screen. The replay stays bounded: the walk keeps the same page ceiling every catch-up
// uses, and a log that reaches this branch is by definition one no renderer has ever followed,
// on a production that prunes rows older than 7 days at every publish.
//
// A graphic whose report carries no baseline at all (a pre-0033 server or renderer) is replayed
// rather than trusted, which is the same doctrine seen from the other side: a needless
// re-animation is recoverable, a lost take is not.

import type { LiveReportMap } from './hostedControl';

export interface OutputRecoveryPlan {
  /** The row to follow the log FROM — rows after it are fetched and replayed at boot. */
  followFrom: number;
  /** Per graphic, the last row its own rebuilt snapshot already contains. A graphic with no
   *  baseline is absent, and everything from `followFrom` is replayed onto it. */
  snapshotAt: Map<string, number>;
}

/** Decide a booting renderer's log baseline from the resolve's per-graphic reports. */
export function planOutputRecovery(graphics: readonly string[], live: LiveReportMap): OutputRecoveryPlan {
  const snapshotAt = new Map<string, number>();
  for (const key of graphics) {
    const at = live[key]?.event;
    if (typeof at === 'number') snapshotAt.set(key, at);
  }
  const baselines = [...snapshotAt.values()];
  return { followFrom: baselines.length > 0 ? Math.min(...baselines) : 0, snapshotAt };
}

/** Is this row already inside the state its graphic was rebuilt from? Replaying it would
 *  re-air it. One helper rather than the same comparison written at each use: the boot asks it
 *  twice — once to decide whether the catch-up animates, once per row as it replays. */
export function alreadyInSnapshot(
  snapshotAt: ReadonlyMap<string, number>,
  graphic: string,
  rowId: number,
): boolean {
  const at = snapshotAt.get(graphic);
  return at !== undefined && rowId <= at;
}

// ── THE SAME RULE ON THE RELAY PLANE (control/hostedReceiver.ts) ──────────────────────────────
//
// An exported graphic carrying the hosted-control receiver follows the same log, for ONE graphic,
// through a block of generated ES5 that can import nothing. So the decision lives here — beside
// the renderer's — rather than being hand-written into the emitted text, and the two forms below
// are pinned equal by `e2e/hosted-control.spec.ts` rather than trusted to stay that way.
//
// IT DIVERGES IN ONE CASE, deliberately, and the divergence is the whole reason this is a second
// function rather than a call to `planOutputRecovery`:
//
//   - A DATED report (`event`, migration 0033) → that row. Identical to the renderer.
//   - NO report at all → the log START. Identical to the renderer, and the hole this closes:
//     seeded with the log HEAD, a graphic loaded after the cue was taken dropped that cue for
//     good — no snapshot to rebuild from, no row left to replay.
//   - A report with NO baseline → the log HEAD, where the renderer would replay from the start.
//     Two facts force it. `control_report` (migration 0008) has no `p_event` parameter, so a
//     report written on THIS plane can never carry a baseline — the renderer's "pre-0033 reader"
//     edge case is this plane's every single report. And this block has no hidden catch-up pass:
//     the renderer replays behind `setVisible(false)` and settles off air, while a graphic is its
//     own stage and would play the outage's whole history out on screen. Replaying a 7-day log
//     visibly onto a live layer is worse than the gap it would close.
//
// So the outage window a report cannot date is still lost HERE, and closing it is a migration
// (`p_event` on `control_report`) plus a catch-up that hides the graphic — named in
// docs/CLOUD_PLAYOUT.md §3 rather than left to be rediscovered on air.

/** Where a booting SINGLE-graphic receiver starts reading the log. `logHead` is the resolve's
 *  `last_event_id`. See the block above for why the middle case differs from the renderer's. */
export function receiverFollowFrom(graphic: string, live: LiveReportMap, logHead: number): number {
  const plan = planOutputRecovery([graphic], live);
  const dated = plan.snapshotAt.get(graphic);
  if (dated !== undefined) return dated;
  if (!live[graphic]) return plan.followFrom; // never reported → the log START
  return typeof logHead === 'number' ? logHead : 0;
}

/** `receiverFollowFrom` as the ES5 the receiver block emits (no `?.`, no `??` — a CasparCG 2.3
 *  CEF is Chromium 71). Emitted into a template literal, so: no backticks and no `${`. */
export const RECEIVER_FOLLOW_FROM_JS = `// Where this boot starts reading the log (control/outputRecovery.ts owns the rule).
  function followFrom(graphic, live, logHead) {
    var mine = (live || {})[graphic];
    if (mine && typeof mine.event === 'number') return mine.event;  // a dated report: replay after it
    if (!mine) return 0;                                            // never reported: the log START
    return typeof logHead === 'number' ? logHead : 0;               // reported, undatable: the head
  }`;
