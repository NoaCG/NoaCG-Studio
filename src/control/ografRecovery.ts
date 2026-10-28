// WHAT AN OUTPUT PUTS BACK OF A PUBLISHED FOREIGN OGRAF PACKAGE WHEN IT STARTS AGAIN
// (docs/work-specs/playout-ograf-rundown/spec.md, E3.2b, AC-3).
//
// A reloaded output mounts every package as a new instance and rebuilds it from the ordered log and
// the last report (control/outputRecovery.ts): the values the report banks, then the log after it.
// What the Graphic itself did is known only from its answers, so only that is put back:
//
//   - a Take the Graphic ACCEPTED (the report's `ograf.on`), at the step its answers reached, through
//     its own lifecycle calls (`playAction` to the first step, then one step at a time);
//   - never a custom action: its effect lives in the Graphic alone and may not be repeatable, so a
//     row of one in the catch-up is not sent, and a package an action reached since its Take is put
//     back as far as its Take and step and said to be NOT KNOWN (`unknown`), until the operator
//     takes or outs it again;
//   - a Take that was never confirmed (refused, unanswered, or no report) is not repeated by itself
//     either: it is said to be not known, and the re-cue is the operator's.
//
// Pure and DOM-free: scripts/ograf-recovery.test.mjs runs it in Node.

import { readOgrafOutcome } from './ografOutcome.ts';

export interface OgrafRestore {
  /** Take it again on its new instance (its report says the Graphic accepted its Take). */
  play: boolean;
  /** Then step it this many times, to where its answers had it. */
  steps: number;
  /** Why its state is not proven, or null when it is. */
  unknown: string | null;
}

export const UNKNOWN_ACTED = 'an action was not repeated after the restart';
export const UNKNOWN_UNCONFIRMED = 'its Take was not confirmed before the restart';
export const UNKNOWN_STEP = 'its step was not confirmed before the restart';

const NOTHING: OgrafRestore = { play: false, steps: 0, unknown: null };

/**
 * One package's restore. `report` is its last report (the bank), `headOn` whether the log's head
 * says it is on air (protocol 2; undefined where there is no head), and `rows` this package's rows
 * the catch-up reads after its bank, in order, actions included (they are counted, never sent:
 * `heldActions`).
 */
export function ografRestore(report: { state?: unknown } | null | undefined, headOn: boolean | undefined, rows: readonly { msg: { t: string } }[]): OgrafRestore {
  const last = (...ts: string[]) => {
    for (let i = rows.length - 1; i >= 0; i -= 1) if (ts.includes(rows[i].msg.t)) return i;
    return -1;
  };
  // A snap has no OGraf meaning (control/ografContract.ts `ografCallFor`): only a Take puts it up.
  const lastTake = last('play');
  const lastOut = last('stop');
  const actedAfter = (from: number) => rows.slice(from + 1).some((r) => r.msg.t === 'event');
  // A Take or Out after the bank replays as the log has it, and decides whether it is up.
  if (lastTake >= 0 || lastOut >= 0) {
    if (lastOut > lastTake) return NOTHING;
    return { play: false, steps: 0, unknown: actedAfter(lastTake) ? UNKNOWN_ACTED : null };
  }
  const o = readOgrafOutcome(report?.state);
  const up = headOn ?? o?.on === true;
  if (!up) return NOTHING;
  if (!o || o.i === null || !o.on) return { play: false, steps: 0, unknown: UNKNOWN_UNCONFIRMED };
  const acted = o.acted === true || actedAfter(-1);
  // A state an earlier restart could not prove stays unproven through the next one.
  const carried = o.unknown ?? null;
  if (typeof o.step !== 'number') return { play: true, steps: 0, unknown: acted ? UNKNOWN_ACTED : (carried ?? UNKNOWN_STEP) };
  return { play: true, steps: o.step, unknown: acted ? UNKNOWN_ACTED : carried };
}

/** The catch-up's rows that are a custom action on a package: read past, never sent, since a
 *  restart repeats none (the boot still counts them applied, so the follow never sends them either). */
export function heldActions<R extends { graphic: string; msg: { t: string } }>(rows: readonly R[], packages: ReadonlySet<string>): Set<R> {
  return new Set(rows.filter((r) => r.msg.t === 'event' && packages.has(r.graphic)));
}
