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
 *   reorder. Still open after the window: ONE single-flight tail read, and while rows are still
 *   held after a failed read, another one a second later rather than at the 30 s poll.
 * - A tail answer is AUTHORITATIVE: the cursor advances to its last row over any gap inside or
 *   before it, because a gap there is a deletion (the 7-day prune, a cascade), not a row to come.
 *   An answer read under an epoch this follower has left since is thrown away and read again.
 * - A frame or answer in another EPOCH means the production was unpublished and published again:
 *   its sequence restarted, so the cursor goes back to 0 and the log is read again. The first
 *   epoch of a log this follower started before it had a head is LEARNED, not a restart.
 * - The head summary a frame or answer carries is DATA (the sender's revisions, chips), handed on
 *   only once every row up to it has been applied: a page must not learn a revision before its
 *   operator can see the change, or a press made on the old picture would pass as current. Nothing
 *   here plays, stops or refills because of it.
 * - While rows are held or a read is out the follower is BUSY, and says so: a page's own presses
 *   then take the durable road instead of its monitor, as on the id road, so they cannot land on
 *   the monitor ahead of older rows still on their way.
 */

// The reorder window and the rejoin spread are the id follower's, measured and argued there
// (logFollow.ts): the same Realtime delivers both roads, and the same herd rejoins.
import { REJOIN_REFILL_SPREAD_MS, REORDER_WINDOW_MS } from './logFollow.ts';

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

/** A `control_*tail_seq` answer: a frame's shape (its head is the head when the answer was read,
 *  every graphic's summary), plus `reset` when the follower asked in another epoch. */
export interface SeqTail<R> extends SeqFrame<R> {
  reset?: boolean;
}

/** The tail RPCs' page size (0070: at most 500 rows) - a full page means "there is more". */
export const SEQ_TAIL_PAGE = 500;
/** Runaway guard on one refill walk, as the id follower has. */
const MAX_TAIL_PAGES = 40;
/** How soon a read is tried again while rows are still held after one failed. */
export const HELD_RETRY_MS = 1_000;
/** Heads kept waiting for their rows; beyond this the oldest go (a newer head supersedes them). */
const MAX_WAITING_HEADS = 64;

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
  stop(): void;
}

export function createSeqFollower<R extends SeqRowLike>(opts: {
  /** The last seq already reflected on this surface (the resolve's head, or the renderer's catch-up). */
  from: number;
  epoch: string | null;
  /** One page of rows after `after`, or null when the read failed (nothing is known then). */
  tail: (after: number, epoch: string | null) => Promise<SeqTail<R> | null>;
  /** Rows to apply, in seq order. `replayed` is true for rows a tail read brought, which is the
   *  only place a superseded entrance may be elided (`supersededAnimations`). */
  onRows: (rows: R[], replayed: boolean) => void;
  /** A head, once every row up to its seq has been applied. */
  onHead?: (head: SeqHead, epoch: string | null) => void;
  /** The epoch was learned (`reset` false: the first head of the log this follower was already
   *  following) or changed (`reset` true: a republish, so every seq this surface holds is void). */
  onEpoch?: (epoch: string | null, reset: boolean) => void;
  /** Holding rows or reading the tail (true), or level with everything it has been told (false). */
  onBusy?: (busy: boolean) => void;
  /** A gap outlived the reorder window and sent the follow to the tail (livePath.ts counts it). */
  onHole?: () => void;
  random?: () => number;
}): SeqFollower<R> {
  const random = opts.random ?? Math.random;
  let cursor = opts.from;
  let epoch = opts.epoch;
  let stopped = false;
  let busy = false;
  const held = new Map<number, R>();
  let heads: SeqHead[] = [];
  let holeTimer: ReturnType<typeof setTimeout> | null = null;
  let rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  let joinedBefore = false;
  let walk: Promise<void> | null = null;
  let again = false;

  const noteBusy = () => {
    const now = !stopped && (walk !== null || held.size > 0);
    if (now === busy) return;
    busy = now;
    opts.onBusy?.(busy);
  };
  const clearHole = () => {
    if (holeTimer) clearTimeout(holeTimer);
    holeTimer = null;
  };
  /** Start again in another epoch: a republish, so every seq held is from a log that is gone. */
  const restart = (next: string | null) => {
    epoch = next;
    cursor = 0;
    held.clear();
    heads = [];
    clearHole();
    opts.onEpoch?.(epoch, true);
  };
  /** A frame or an answer names its epoch: learn the log's first one, or restart in a new one. */
  const meet = (next: string | null) => {
    if (next === epoch) return;
    if (epoch !== null) return restart(next);
    epoch = next;
    opts.onEpoch?.(epoch, false);
  };
  const waitHead = (head: SeqHead) => {
    if (!opts.onHead) return;
    heads.push(head);
    if (heads.length > MAX_WAITING_HEADS) heads.shift();
  };
  const flushHeads = () => {
    if (heads.length === 0) return;
    const waiting: SeqHead[] = [];
    for (const head of heads) {
      if (head.seq <= cursor) opts.onHead?.(head, epoch);
      else waiting.push(head);
    }
    heads = waiting;
  };
  /** Apply every held row that is now contiguous with the cursor, and forget what is behind it. */
  const drain = () => {
    const ready: R[] = [];
    for (let next = held.get(cursor + 1); next; next = held.get(cursor + 1)) {
      held.delete(next.seq);
      cursor = next.seq;
      ready.push(next);
    }
    for (const seq of held.keys()) if (seq <= cursor) held.delete(seq);
    if (ready.length > 0) opts.onRows(ready, false);
    flushHeads();
    if (held.size === 0) clearHole();
  };
  /** Once `ms` has passed, apply what has arrived since, and read the tail for what still has not.
   *  `hole`: a gap is being given its reorder window (a retry after a failed read is not a new one). */
  const armHole = (ms: number, hole: boolean) => {
    holeTimer ??= setTimeout(() => {
      holeTimer = null;
      drain();
      if (held.size > 0) {
        if (hole) opts.onHole?.();
        void refill();
      }
      noteBusy();
    }, ms);
  };

  const refill = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (walk) {
      again = true;
      return walk;
    }
    walk = (async () => {
      try {
        for (let page = 0; page < MAX_TAIL_PAGES && !stopped; page += 1) {
          const asked = epoch;
          const answer = await opts.tail(cursor, asked);
          if (stopped || !answer) return;
          // A frame moved this follower to another epoch while the read was out: the answer
          // describes a log it has left.
          if (epoch !== asked) continue;
          if (answer.reset) {
            restart(answer.epoch);
            continue;
          }
          meet(answer.epoch);
          if (answer.head) waitHead(answer.head);
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
        if (again && !stopped) {
          again = false;
          void refill();
        } else if (!stopped && held.size > 0) {
          // The read failed or fell short while rows wait behind a gap: try again soon.
          armHole(HELD_RETRY_MS, false);
        }
        noteBusy();
      }
    })();
    noteBusy();
    return walk;
  };

  return {
    offer(frame) {
      if (stopped) return;
      meet(frame.epoch);
      if (frame.head) waitHead(frame.head);
      for (const row of frame.rows) if (row.seq > cursor) held.set(row.seq, row);
      drain();
      if (held.size > 0) armHole(REORDER_WINDOW_MS, true);
      noteBusy();
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
    stop() {
      stopped = true;
      clearHole();
      if (rejoinTimer) clearTimeout(rejoinTimer);
      rejoinTimer = null;
      held.clear();
      heads = [];
      noteBusy();
    },
  };
}

/**
 * WHICH ENTRANCES A REFILL MAY SKIP (AC-16 as design v2 words it, narrowed by review).
 *
 * A follower that missed frames reads them back in one batch and applies every row, in seq order,
 * through the same path as a live one: data, event payloads, clocks and the report bookkeeping all
 * need every row, and reordering or dropping any of them changes what the operator meant (a
 * clockStart before a stop, a snap used as recovery). The one thing safe to leave out is an
 * ENTRANCE nobody would see finish: a `play` of a graphic that a later `play` or `stop` of the same
 * graphic in the same batch replaces, with no `event`, `next` or `snap` of that graphic between
 * them (those depend on the machine being where the play left it). An exit is never skipped: a
 * graphic's stop does more than animate (a debate board's stop halts its speaking clocks, and a
 * play does not undo that). So a graphic taken and taken out twice while this surface was away
 * ends in its final state with its final exit or entrance only.
 *
 * Returns the seqs whose stage animation is superseded; everything else about those rows applies.
 */
export function supersededAnimations(rows: readonly SeqRowLike[]): Set<number> {
  const skip = new Set<number>();
  const entrance = new Map<string, number>();
  for (const row of rows) {
    const t = row.msg.t;
    if (t === 'play' || t === 'stop') {
      const before = entrance.get(row.graphic);
      if (before !== undefined) skip.add(before);
      if (t === 'play') entrance.set(row.graphic, row.seq);
      else entrance.delete(row.graphic);
    } else if (t === 'event' || t === 'next' || t === 'snap') {
      entrance.delete(row.graphic);
    }
  }
  return skip;
}
