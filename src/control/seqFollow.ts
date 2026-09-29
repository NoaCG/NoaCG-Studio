/**
 * THE SEQUENCE FOLLOWER (protocol 2, migration 0070): which numbered log rows a following surface
 * applies, in which order, and when it reads the log to find the ones the live channel did not
 * bring. `followLiveSeq` (hostedControl.ts) wires it to Realtime and the poll; this module holds no
 * Supabase, so the whole discipline runs in Node with the clock faked (scripts/seq-follow.test.mjs).
 *
 * WHY A SEQUENCE AND NOT THE ROW ID. `control_events.id` is global and taken at INSERT, so a row
 * can commit after a higher id (a Take waiting on a lock while another operator's Update commits
 * past it), and every other production's rows leave gaps in every production's ids. The first cost
 * a watcher the delayed Take in 5 of 5 trials; the second cost 92 ms per Take while the follower
 * read a tail to fill gaps that were never there (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.1, §5.3).
 * 0070 numbers each production's rows under that production's head lock, so seq n+1 cannot commit
 * before seq n: a gap in front of a frame is a row still in flight to this socket, never a row
 * still to commit, and never another production.
 *
 * THE RULES, each from a measurement or a review finding (step-2-design.md):
 * - The cursor is the last applied seq; rows at or below it are dropped (the oid claim at the
 *   consumer is the second guard, for an old page's resent Take, which has new rows and old oids).
 * - A frame ahead of cursor + 1 is HELD for REORDER_WINDOW_MS and drains the moment the gap closes.
 *   Realtime delivers the frames of one transaction out of order (measured 2026-09-24), and a
 *   production-data patch writes one frame per graphic, so an immediate refill would be an RPC per
 *   reorder. Still open after the window: ONE single-flight tail read.
 * - A tail answer is AUTHORITATIVE: the cursor advances to its last row over any gap inside or
 *   before it, because a gap there is a deletion (the 7-day prune, a cascade), not a row to come.
 * - A frame or answer in another EPOCH means the production was unpublished and published again:
 *   its sequence restarted, so the cursor goes back to 0 and the log is read again.
 * - The head summary a frame carries is DATA (the sender's revisions, chips). Nothing here plays,
 *   stops or refills because of it.
 */

/** A numbered log row as frames and tail answers carry it. */
export interface SeqRowLike {
  id: number;
  seq: number;
  graphic: string;
  msg: { t: string };
}

/** What 0070 keeps per graphic: the revision, whether it is on air, its cue and step, and whose
 *  press last moved it. Every field optional: a graphic that has only had a cue has no rev. */
export interface HeadSummary {
  rev?: number;
  on?: boolean;
  cue?: string | null;
  step?: number;
  by?: string;
  press?: number;
}

export interface SeqHead {
  seq: number;
  graphics: Record<string, HeadSummary>;
}

/** One `batch` frame on `live-<show id>`: one inserting statement's rows. */
export interface SeqFrame<R> {
  epoch: string | null;
  rows: R[];
  head?: SeqHead;
}

/** A `control_*tail_seq` answer. */
export interface SeqTail<R> {
  epoch: string | null;
  rows: R[];
  reset?: boolean;
}

// The reorder window and the rejoin spread are the id follower's, measured and argued there
// (logFollow.ts): the same Realtime delivers both roads, and the same herd rejoins.
import { REJOIN_REFILL_SPREAD_MS, REORDER_WINDOW_MS } from './logFollow.ts';

export { REJOIN_REFILL_SPREAD_MS, REORDER_WINDOW_MS };

/** The tail RPCs' page size (0070: at most 500 rows) - a full page means "there is more". */
export const SEQ_TAIL_PAGE = 500;
/** Runaway guard on one refill walk, as the id follower has. */
const MAX_TAIL_PAGES = 40;

export interface SeqFollower<R extends SeqRowLike> {
  /** A frame off the live channel, in whatever order it arrived. */
  offer(frame: SeqFrame<R>): void;
  /** The channel reported SUBSCRIBED: refill at once on the first join, after a spread on a rejoin. */
  joined(): void;
  /** Read the log from the cursor (the poll, a hole). Single-flight: a call during a walk runs
   *  once more after it. */
  refill(): Promise<void>;
  readonly cursor: number;
  readonly epoch: string | null;
  readonly walking: boolean;
  stop(): void;
}

export function createSeqFollower<R extends SeqRowLike>(opts: {
  /** The last seq already reflected on this surface (the resolve's head, or the renderer's catch-up). */
  from: number;
  epoch: string | null;
  /** One page of rows after `after`, or null when the read failed (nothing is known then). */
  tail: (after: number, epoch: string | null) => Promise<SeqTail<R> | null>;
  /** Rows to apply, in seq order. `replayed` is true for rows a tail read brought, which is the
   *  only place a superseded animation may be elided (`supersededAnimations`). */
  onRows: (rows: R[], replayed: boolean) => void;
  onHead?: (head: SeqHead, epoch: string | null) => void;
  /** The epoch changed: every seq this surface holds belongs to a log that no longer exists. */
  onEpoch?: (epoch: string | null) => void;
  onWalk?: (walking: boolean) => void;
  random?: () => number;
}): SeqFollower<R> {
  const random = opts.random ?? Math.random;
  let cursor = opts.from;
  let epoch = opts.epoch;
  let stopped = false;
  const held = new Map<number, R>();
  let holeTimer: ReturnType<typeof setTimeout> | null = null;
  let rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  let joinedBefore = false;
  let walk: Promise<void> | null = null;
  let again = false;

  const clearHole = () => {
    if (holeTimer) clearTimeout(holeTimer);
    holeTimer = null;
  };
  const adopt = (next: string | null, reset: boolean) => {
    if (next === epoch && !reset) return;
    const changed = next !== epoch;
    epoch = next;
    if (reset || changed) {
      cursor = 0;
      held.clear();
      clearHole();
    }
    if (changed || reset) opts.onEpoch?.(epoch);
  };
  /** Apply every held row that is now contiguous with the cursor, and forget what is behind it. */
  const drain = () => {
    const ready: R[] = [];
    for (let next = held.get(cursor + 1); next; next = held.get(cursor + 1)) {
      held.delete(next.seq);
      cursor = next.seq;
      ready.push(next);
    }
    for (const seq of [...held.keys()]) if (seq <= cursor) held.delete(seq);
    if (ready.length > 0) opts.onRows(ready, false);
    if (held.size === 0) clearHole();
  };

  const refill = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (walk) {
      again = true;
      return walk;
    }
    opts.onWalk?.(true);
    walk = (async () => {
      try {
        for (let page = 0; page < MAX_TAIL_PAGES && !stopped; page += 1) {
          const answer = await opts.tail(cursor, epoch);
          if (stopped || !answer) return;
          if (answer.reset) {
            adopt(answer.epoch, true);
            continue;
          }
          // A follower that knew no epoch (the resolve found no head yet) learns it here.
          if (answer.epoch !== epoch) adopt(answer.epoch, false);
          const fresh = answer.rows.filter((row) => row.seq > cursor).sort((a, b) => a.seq - b.seq);
          if (fresh.length > 0) {
            cursor = fresh[fresh.length - 1].seq;
            opts.onRows(fresh, true);
          }
          drain();
          if (answer.rows.length < SEQ_TAIL_PAGE) return;
        }
      } finally {
        walk = null;
        opts.onWalk?.(false);
        if (again && !stopped) {
          again = false;
          void refill();
        }
      }
    })();
    return walk;
  };

  return {
    offer(frame) {
      if (stopped) return;
      if (frame.epoch !== epoch) adopt(frame.epoch, false);
      if (frame.head) opts.onHead?.(frame.head, epoch);
      for (const row of frame.rows) if (row.seq > cursor) held.set(row.seq, row);
      drain();
      if (held.size === 0) return;
      holeTimer ??= setTimeout(() => {
        holeTimer = null;
        drain();
        if (held.size > 0) void refill();
      }, REORDER_WINDOW_MS);
    },
    joined() {
      if (stopped) return;
      if (!joinedBefore) {
        joinedBefore = true;
        void refill();
        return;
      }
      rejoinTimer ??= setTimeout(() => {
        rejoinTimer = null;
        void refill();
      }, Math.floor(random() * REJOIN_REFILL_SPREAD_MS));
    },
    refill,
    get cursor() {
      return cursor;
    },
    get epoch() {
      return epoch;
    },
    get walking() {
      return walk !== null;
    },
    stop() {
      stopped = true;
      clearHole();
      if (rejoinTimer) clearTimeout(rejoinTimer);
      rejoinTimer = null;
      held.clear();
    },
  };
}

/**
 * WHICH ENTRANCES AND EXITS A REFILL MAY SKIP (AC-16 as design v2 words it).
 *
 * A follower that missed frames reads them back in one batch and applies every row, in seq order,
 * through the same path as a live one: data, event payloads, clocks and the report bookkeeping all
 * need every row, and reordering or dropping any of them changes what the operator meant (a
 * clockStart before a stop, a snap used as recovery). The one thing that is safe to leave out is
 * an ANIMATION nobody would see finish: a `play` or `stop` of a graphic that a later `play` or
 * `stop` of the same graphic in the same batch replaces, with no `event`, `next` or `snap` of that
 * graphic between them (those depend on the machine being where the earlier one left it). So a
 * graphic that went on and off air three times while this surface was away ends in its final state
 * with one animation instead of six.
 *
 * Returns the seqs whose stage animation is superseded; everything else about those rows applies.
 */
export function supersededAnimations(rows: readonly SeqRowLike[]): Set<number> {
  const skip = new Set<number>();
  const pending = new Map<string, number>();
  for (const row of rows) {
    const t = row.msg.t;
    if (t === 'play' || t === 'stop') {
      const before = pending.get(row.graphic);
      if (before !== undefined) skip.add(before);
      pending.set(row.graphic, row.seq);
    } else if (t === 'event' || t === 'next' || t === 'snap') {
      pending.delete(row.graphic);
    }
  }
  return skip;
}
