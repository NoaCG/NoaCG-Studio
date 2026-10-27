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

import type { ControlEventRow, ControlSendItem, LiveReportMap } from './hostedControl';
import { typedValuesOf, type TypedValues } from '../model/ografTyped.ts';

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

/**
 * THE SAME REPORTS, READ IN THE PER-PRODUCTION SEQUENCE (protocol 2, migration 0071). Every report
 * a proto-2 resolve answers carries `seq`: the renderer's own, or the server's mapping of `event`
 * to the last seq below the first numbered row after it (a lower bound, so nothing the report did
 * not contain is skipped). The rule above is unchanged; only the position it compares is the seq.
 * A report with no `seq` is replayed rather than trusted, exactly as one with no `event` is.
 */
export function seqBaselines(live: LiveReportMap): LiveReportMap {
  const out: LiveReportMap = {};
  for (const [graphic, report] of Object.entries(live)) {
    if (!report) continue;
    const { event: _byId, ...rest } = report;
    out[graphic] = typeof report.seq === 'number' ? { ...rest, event: report.seq } : rest;
  }
  return out;
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

// ── THE SAME RULE FOR AN OPERATOR'S PROGRAM MONITOR ─────────────────────────────────────────────
//
// The hosted control page and the in-app production page each rebuild a PROGRAM monitor from the
// renderer's reports when they open. A report is written 800 ms after its graphic's last change, so
// a page reloaded straight after a press reads one from BEFORE that press, and a monitor rebuilt
// from the report alone came back on the previous picture: configured run 36281126714 caught the
// hosted page on the previous question's reveal, and the in-app page did the same until issue #762.
// Both replay what the renderer replays: the commands after each on-air graphic's own baseline.

/** A replayed command, with the row's server time: a clock started minutes ago is replayed from
 *  then, not from the moment of the replay (matchClockWire.ts `clockRowEffect`). */
export type ReplayItem = ControlSendItem & { created_at?: string };

/** The renderer commands a monitor replays over the reports when it opens. `onAir` are the layers
 *  with a live cue, `snapshotAt` their plan's baselines and `rows` the log read from the plan's
 *  `followFrom` to the resolve's head. Which cue is live comes off the resolve, already current,
 *  and typing, reports and pings are not commands. */
export function monitorReplay(
  onAir: readonly string[],
  snapshotAt: ReadonlyMap<string, number>,
  rows: readonly ControlEventRow[],
): ReplayItem[] {
  return rows.flatMap((row) => {
    const msg = row.msg;
    if (msg.t === 'cue' || msg.t === 'staged' || msg.t === 'live' || msg.t === 'ping') return [];
    if (!onAir.includes(row.graphic) || alreadyInSnapshot(snapshotAt, row.graphic, row.id)) return [];
    return [{ graphic: row.graphic, msg, created_at: row.created_at }];
  });
}

/** What each graphic shows on air, by field. */
export type AiredMap = Record<string, Record<string, string>>;

/** What each graphic shows once a renderer command has run: the baseline both pages judge "not on
 *  air yet" against, and what a monitor's replay leaves on air. */
export function airedAfter(prev: AiredMap, graphic: string, msg: ControlEventRow['msg']): AiredMap {
  if (msg.t === 'update') return { ...prev, [graphic]: { ...prev[graphic], ...msg.data } };
  // AN ACCEPTED EVENT'S PAYLOAD IS ALSO WHAT AIR SHOWS: a goal's +1 moves through the same field
  // path an update takes, so the next press counts from it and no chip calls it unsent.
  if (msg.t === 'event' && msg.payload) return { ...prev, [graphic]: { ...prev[graphic], ...msg.payload } };
  // Off air: forget it, or the next rebuild would restore a graphic nobody is running any more.
  if (msg.t === 'stop' && prev[graphic]) {
    const next = { ...prev };
    delete next[graphic];
    return next;
  }
  return prev;
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

// ── TYPED DATA'S OWN BASELINE (E1.2b, docs/work-specs/playout-ograf-contract/spec.md AC-2) ───────
//
// A graphic airing typed OGraf data reports like any other, and its report's `state` (stored as
// sent, so no migration) also carries the envelope it last applied, exactly as it came (`typed`),
// and the steps it took since its entrance (`steps`). Its `data` is empty: its data is the
// envelope's, never strings. A boot rebuilds it from those through the output's own typed gate,
// so an envelope that does not read there is refused and held, never aired as something else.
// The pose (`groups`) still carries the step of a graphic with a state machine; `steps` is what a
// graphic with no pose is stepped back to after its entrance.

/** Steps since an entrance a report carries. More are kept as this many: a reboot then lands on
 *  step 64 of a longer sequence, which no OGraf graphic declares. */
export const TYPED_STEPS_MAX = 64;

/** What a report says of a graphic's typed data, or null when it says nothing (a native report).
 *  `typed` is the envelope as it came, read by the output's gate; `steps` anything but a whole
 *  number from 0 to TYPED_STEPS_MAX reads as 0. */
export function reportedTyped(report: { state?: unknown } | null | undefined): { typed: unknown; steps: number } | null {
  const state = report?.state;
  if (typeof state !== 'object' || state === null || !Object.prototype.hasOwnProperty.call(state, 'typed')) return null;
  const { typed, steps } = state as { typed: unknown; steps?: unknown };
  return { typed, steps: typeof steps === 'number' && Number.isInteger(steps) && steps >= 0 && steps <= TYPED_STEPS_MAX ? steps : 0 };
}

/** A report's typed baseline as a PROGRAM monitor rebuilds it: the envelope read (null when this
 *  build cannot read it, so the output holds that graphic) and its steps as the `next`s that replay
 *  them. Null for a native report. */
export function reportedTypedAir(report: { state?: unknown } | null | undefined): { envelope: TypedValues | null; steps: { t: 'next' }[] } | null {
  const base = reportedTyped(report);
  return base ? { envelope: typedValuesOf(base.typed), steps: Array.from({ length: base.steps }, () => ({ t: 'next' as const })) } : null;
}

/** The steps a graphic has taken since its entrance, after one command: an entrance (or a pose)
 *  starts again at 0, an exit forgets them, a `next` adds one up to TYPED_STEPS_MAX. */
export function stepsAfter(prev: number | undefined, msg: { t: string }): number | undefined {
  if (msg.t === 'play' || msg.t === 'snap') return 0;
  if (msg.t === 'stop') return undefined;
  if (msg.t === 'next' && prev !== undefined) return Math.min(prev + 1, TYPED_STEPS_MAX);
  return prev;
}

const COMMAND_VERBS = new Set(['update', 'play', 'stop', 'next', 'event', 'snap']);

/**
 * A GRAPHIC ON AIR THAT NO REPORT BANKS, AIRING TYPED DATA (issue #1762). A boot follows the log
 * from the oldest report, so a graphic with none, whose typed Take is older than that, would come
 * back with its entrance (the log's head says it is on) but not its values. Such a graphic was
 * aired by an output that never reported typed data (E1.2a), or its report had not been written
 * yet. `rows` are the log up to the boot's `followFrom`; `graphics` the ones on air with no
 * report. Each whose last operator update there carries an envelope gets every command it took
 * there, oldest first, as the log start would have replayed it; any other graphic gets none, so
 * native recovery is unchanged.
 */
export function unreportedTypedRows<R extends { graphic: string; msg: { t: string } }>(graphics: readonly string[], rows: readonly R[]): R[] {
  const wanted = new Set(graphics);
  const typedNow = new Set<string>();
  for (const row of rows) {
    if (!wanted.has(row.graphic) || row.msg.t !== 'update' || Object.prototype.hasOwnProperty.call(row.msg, 'src')) continue;
    if (Object.prototype.hasOwnProperty.call(row.msg, 'typed')) typedNow.add(row.graphic);
    else typedNow.delete(row.graphic);
  }
  return typedNow.size ? rows.filter((row) => typedNow.has(row.graphic) && COMMAND_VERBS.has(row.msg.t)) : [];
}

/** Whether a graphic on air with no report may be airing typed data, by the cue the log's head says
 *  it last took: not when that is a cue the output's payload publishes, since a cue with typed data
 *  never is (model/productionData.ts `preparedCue`); a direct trigger or a cue not published may. */
export function mayAirTyped(headCue: unknown, published: ReadonlySet<string>): boolean {
  return !(typeof headCue === 'string' && published.has(headCue));
}

/** How many tail pages that read takes: on the numbered log, the pages up to `followFrom` (seqs
 *  count from 1, so no more rows lie below it); none by row id (protocol 1, which has no head to say
 *  what is on air), and none when that is more than `ceiling`, the catch-up's own page ceiling, so a
 *  boot never waits longer for this read than for its catch-up, and never reads half of it. That
 *  bridge is only for graphics no report banks: since E1.2b every output reports typed data and
 *  re-banks it every 500 rows. */
export function unreportedPages(followFrom: number, seqMode: boolean, pageSize: number, ceiling: number): number {
  const pages = seqMode && followFrom > 0 ? Math.floor(followFrom / pageSize) + 1 : 0;
  return pages <= ceiling ? pages : 0;
}
