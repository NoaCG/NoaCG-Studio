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
//     row of one in the catch-up is not sent, and a package whose instance an action reached is put
//     back as far as its Take and step and said to be NOT KNOWN (`unknown`). OGraf promises no Take
//     undoes an action, so a Take REPLAYED from the log after it does not make it known; the
//     operator's own next Take or Out, live, does (output/stage.ts `markUnknown`): that is them
//     deciding what goes to air;
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
export const UNKNOWN_OUT = 'its Out was not confirmed before the restart';
/** A re-cue's new instance until it answers its `load()` (output/stage.ts `remount`). */
export const UNKNOWN_REMOUNTED = 'mounted again, not answered yet';

/** The most steps a restore walks. A step is a stranger's own answer, so it is bounded before it
 *  becomes calls: each is one `playAction` sent without waiting, and a frame holds at most 64 calls
 *  unanswered (output/foreignOgraf.ts PENDING_KEPT). Past this, the Take comes back at its first
 *  step and the step is said not to be known. */
export const RESTORE_STEPS_MAX = 32;

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
  const o = readOgrafOutcome(report?.state);
  const acted = (o !== null && o.i !== null && o.acted === true) || rows.some((r) => r.msg.t === 'event');
  // A Take or Out after the bank replays as the log has it, and decides whether it is up.
  if (lastTake >= 0 || lastOut >= 0) {
    if (lastOut > lastTake) return NOTHING;
    return { play: false, steps: 0, unknown: acted ? UNKNOWN_ACTED : null };
  }
  // A Take or Out the bank counts but the Graphic had not answered (`sent`): its `on` is the state
  // before it. An Out keeps the package off, as the operator meant; a Take puts back only what was
  // proven up before it, at its first step. Either way it is not known.
  if (o !== null && o.i !== null && o.sent === 'stop') return { play: false, steps: 0, unknown: acted ? UNKNOWN_ACTED : UNKNOWN_OUT };
  if (o !== null && o.i !== null && o.sent === 'play') return { play: o.on && headOn !== false, steps: 0, unknown: acted ? UNKNOWN_ACTED : UNKNOWN_UNCONFIRMED };
  // The log says an Out went, but the Graphic's last word left it up (it refused the Out, or its
  // answer was not banked yet): the operator's Out is not undone by a restart, so it stays off, and
  // the Out is said not to be confirmed.
  if (headOn === false && o !== null && o.i !== null && o.on) return { play: false, steps: 0, unknown: UNKNOWN_OUT };
  const up = headOn ?? o?.on === true;
  // Off, as it was: what an earlier restart could not prove is still not proven.
  if (!up) return o !== null && o.i !== null && o.unknown ? { play: false, steps: 0, unknown: o.unknown } : NOTHING;
  if (!o || o.i === null || !o.on) return { play: false, steps: 0, unknown: UNKNOWN_UNCONFIRMED };
  // A state an earlier restart could not prove stays unproven through the next one.
  const carried = o.unknown ?? null;
  if (typeof o.step !== 'number' || o.step > RESTORE_STEPS_MAX) return { play: true, steps: 0, unknown: acted ? UNKNOWN_ACTED : (carried ?? UNKNOWN_STEP) };
  return { play: true, steps: o.step, unknown: acted ? UNKNOWN_ACTED : carried };
}

/**
 * HISTORY THE CATCH-UP LEFT UNREAD (a read that failed, the page ceiling): the follow's refills
 * bring it later, and this decides, row by row and batch by batch, what the output does with it.
 *
 *   - A package's custom action in it is READ PAST (counted applied, never sent), as `heldActions`
 *     reads the catch-up's, and its package is said not known (`mark`) after every batch of that
 *     history, so a Take later in it cannot clear the mark. An Out after the action ends it, as in
 *     `ografRestore`: off is known. The packages the boot already left not known for an action are
 *     held the same way (`actedAtBoot`).
 *   - The gap closes at the END of that history, never between two full pages: on the numbered log
 *     (protocol 2) a live batch, which the follow applies only contiguous with the cursor, or a read
 *     shorter than a page, an empty one included; on the row-id road (protocol 1) a tail read
 *     shorter than a page, once its last row (by id) is applied, since a live row's id says nothing
 *     about history committed late below it. A live batch's own Take or Out is the operator's and
 *     stands: it marks nothing.
 *   - A row the package's own report already holds (`covered`: the refill starts at the oldest
 *     bank, so another graphic's can bring it back) is history that package was rebuilt from: it
 *     neither marks nor ends a mark. It still counts towards a page.
 *   - A step of a package the boot did not take (`untaken`, as `heldSteps` leaves it) is read past
 *     until its next Take or Out in that history.
 *
 * Pure: scripts/ograf-recovery.test.mjs drives it as the follows do (output/main.ts wires it).
 */
export function bootGap<R extends { graphic: string; msg: { t: string } }>(
  open: boolean,
  packages: ReadonlySet<string>,
  actedAtBoot: readonly string[] = [],
  pageSize = 500,
  covered: (row: R) => boolean = () => false,
  untaken: Iterable<string> = [],
) {
  const off = new Set(open ? untaken : []);
  let gap = open;
  const held = new Set<string>(open ? actedAtBoot : []);
  /** Protocol 1: the id that ends the history, once a short read has named it. */
  let endsAt = Infinity;
  const readsPast = (row: R): boolean => {
    if (!gap || !packages.has(row.graphic) || covered(row)) return false;
    if (row.msg.t === 'stop') held.delete(row.graphic);
    if (row.msg.t === 'play' || row.msg.t === 'stop') off.delete(row.graphic);
    if (row.msg.t === 'next') return off.has(row.graphic);
    if (row.msg.t !== 'event') return false;
    held.add(row.graphic);
    return true;
  };
  const done = (end: boolean, live = false): string[] => {
    const mark = live ? [] : [...held];
    if (end) {
      gap = false;
      held.clear();
    }
    return mark;
  };
  return {
    get open() {
      return gap;
    },
    /** Protocol 2: a batch the follow hands over, `replayed` when a read brought it. */
    batch(rows: readonly R[], replayed: boolean): { readPast: Set<R>; mark: string[] } {
      const readPast = new Set(replayed ? rows.filter(readsPast) : []);
      return { readPast, mark: done(!replayed || rows.length < pageSize, !replayed) };
    },
    /** Protocol 2: a read that answered no rows, which the follow hands to no one. */
    emptyRead(): string[] {
      return done(true);
    },
    /** Protocol 1: a tail read that answered, and the applied cursor at that moment. */
    tailRead(rows: readonly { id: number }[], cursor: number): string[] {
      if (!gap || rows.length >= pageSize) return [];
      const last = rows.length ? rows[rows.length - 1].id : 0;
      if (last <= cursor) return done(true);
      endsAt = Math.min(endsAt, last);
      return [];
    },
    /** Protocol 1: one row the follow hands over, `fromTail` when a read brought it. */
    row(row: R & { id: number }, fromTail: boolean): { readPast: boolean; mark: string[] } {
      if (!fromTail || !gap) return { readPast: false, mark: [] };
      const readPast = readsPast(row);
      return { readPast, mark: done(row.id >= endsAt) };
    },
  };
}

/**
 * A STEP OF A PACKAGE THE BOOT DID NOT TAKE (its restore played nothing: off, or a Take not proven)
 * is not sent either: a Graphic stepped without a Take can show itself, unproven. The catch-up's
 * step rows for such a package, up to its next Take or Out among them, are read past like an
 * action's; `untaken` is the packages still not taken after these rows, for `bootGap`.
 */
export function heldSteps<R extends { graphic: string; msg: { t: string } }>(rows: readonly R[], untaken: ReadonlySet<string>): { held: Set<R>; untaken: Set<string> } {
  const still = new Set(untaken);
  const held = new Set<R>();
  for (const row of rows) {
    if (!still.has(row.graphic)) continue;
    if (row.msg.t === 'play' || row.msg.t === 'stop') still.delete(row.graphic);
    else if (row.msg.t === 'next') held.add(row);
  }
  return { held, untaken: still };
}

/** The catch-up's rows that are a custom action on a package: read past, never sent, since a
 *  restart repeats none (the boot still counts them applied, so the follow never sends them either). */
export function heldActions<R extends { graphic: string; msg: { t: string } }>(rows: readonly R[], packages: ReadonlySet<string>): Set<R> {
  return new Set(rows.filter((r) => r.msg.t === 'event' && packages.has(r.graphic)));
}
