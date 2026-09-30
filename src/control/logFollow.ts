/**
 * THE COMMAND-LOG FOLLOWER'S CURSOR: which durable rows a following surface applies, and when it
 * re-reads the log to find the ones the live channel did not bring. `followControlLog`
 * (hostedControl.ts) wires it to Realtime and the 30 s poll; this module holds no Supabase, so the
 * whole discipline runs in Node with the clock faked (scripts/log-follow.test.mjs).
 *
 * THE RULE IT KEEPS: every durable row is applied exactly once, and a row that commits late is
 * still applied. The second half is the one the old cursor broke.
 *
 * `control_events.id` is allocated when a row is INSERTED, not when it commits. While a
 * production's `control_shows` row is held (a publish writing its payload, a renderer report, an
 * overloaded database) a Take's rows wait for it with their ids already taken, and a batch that
 * does not touch that row (an Update, a second operator's press) commits a HIGHER id first. The
 * follower sees the higher row, finds the gap in front of it still open after the reorder window,
 * reads the tail (which cannot return uncommitted rows) and moves its cursor past the gap. Trusting
 * that nothing below the cursor can still commit, it then dropped the Take's rows as already seen
 * when they arrived: measured in the app, a watching hosted page's action log never recorded the
 * delayed Take in 5 of 5 trials (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.3), and the renderer's next
 * report banked a recovery baseline past them.
 *
 * So a row at or below the cursor is no longer a duplicate by definition. The follower remembers
 * the ids it applied in a bounded window behind the cursor and applies any row in that window it
 * has not seen, whichever road brought it: the live channel when the late row commits, or a refill
 * that re-reads the window. The real fix is a per-show sequence that commits in order (Phase 6
 * step 2); this protects the global-id path, which stays in service as that step's fallback.
 *
 * THE WINDOW IS MEASURED IN TIME, not in ids: ids are global across productions, so "the last 50
 * ids" is a few milliseconds on a busy instance and hours on a quiet one. The window is the cursor
 * as it stood LATE_COMMIT_WINDOW_MS ago, capped so it never holds more than SEEN_MAX applied rows.
 */

/** The tail RPCs' page size (0008/0029: `limit 500`) - a full page means "there is more". */
export const CONTROL_TAIL_PAGE = 500;
/** Runaway guard on the catch-up walk: 20k rows is far past any real outage after pruning. */
const MAX_TAIL_PAGES = 40;
/** How long a log row that arrived ahead of the cursor waits for the rows in front of it before
 *  the gap is treated as a hole (`offer` says why, and where the number comes from). */
export const REORDER_WINDOW_MS = 25;

/**
 * HOW FAR BEHIND ITS CURSOR A REFILL RE-READS: the cursor as it stood this long ago.
 *
 * A row can commit this late after the cursor passed it and still be applied by the poll alone,
 * even if the live channel never delivers it. The arithmetic: a held row commits within its role's
 * statement timeout of taking its id (3 s `anon`, 8 s `authenticated`; the whole call is one
 * statement, so the timeout bounds it, and a call that runs out rolls back and never commits).
 * The cursor passes it at most that long before it commits, and the next poll (CONTROL_POLL_MS,
 * 30 s) comes at most one interval after that. So 30 + 8 = 38 s is the least that covers it; 60 s
 * is two poll intervals, which also covers the 18 s the overload run measured with room to spare.
 *
 * What it costs: a poll re-reads the production's own rows of the last minute, which on a quiet
 * production is none and on a busy one is capped by SEEN_MAX. Hole recovery does NOT re-read the
 * window (see `refill`), because on a busy instance nearly every row arrives with a gap in front
 * of it.
 */
export const LATE_COMMIT_WINDOW_MS = 60_000;
/** The most applied ids remembered behind the cursor. Half a tail page, so a re-read of the
 *  window plus the rows after it normally fits in one page. A production writing faster than this
 *  per minute (a busy data feed) gets a shorter window: the oldest id forgotten raises the floor. */
export const SEEN_MAX = 250;
/** The cursor is sampled at most this often; the window is exact to within one sample. */
const MARK_EVERY_MS = 1_000;

/**
 * HOW WIDE A REJOIN'S REFILL IS SPREAD. Every output of every production retries Realtime at the
 * same instants, so after a Realtime restart they all rejoin within about 120 ms of each other
 * (§5.7) and, refilling at once, read the tail in the same second, at the moment the database is
 * least able to take it. A rejoin therefore refills after a random delay in [0, this). 5 s puts
 * ten outputs dropped together about two to a second, and at most adds 5 s to a command that was
 * pressed while the socket was down and already waited out the reconnect; a new row arriving in
 * that time with a gap in front of it still recovers at once, and the poll floor is unchanged.
 * The FIRST join refills at once: that is the boot, and a boot is not a herd.
 */
export const REJOIN_REFILL_SPREAD_MS = 5_000;

export interface LogFollower<R extends { id: number }> {
  /** A row off the live channel, in whatever order it arrived. */
  offer(row: R): void;
  /** The channel reported SUBSCRIBED: refill at once on the first join, after a spread on a rejoin. */
  joined(): void;
  /**
   * Read the log. `behind` re-reads the late-commit window (the poll and a rejoin); `ahead`
   * reads from the cursor (a hole), which is all a hole needs and all a busy instance can afford.
   */
  refill(from: 'behind' | 'ahead'): Promise<void>;
  /** Is a refill walk in flight? The fast road stands down while one is. */
  readonly walking: boolean;
  /** The highest id applied. */
  readonly last: number;
  stop(): void;
}

export function createLogFollower<R extends { id: number }>(opts: {
  /** The log baseline: rows at or below it are already reflected on this surface. */
  from: number;
  tail: (afterId: number) => Promise<R[]>;
  onRow: (row: R) => void;
  /** A walk started (true) or the last one in flight ended (false). */
  onWalk?: (walking: boolean) => void;
  /** A gap outlived the reorder window and sent the follow to the tail (counted by the output). */
  onHole?: () => void;
  now?: () => number;
  random?: () => number;
}): LogFollower<R> {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  let last = opts.from;
  // `marks[i]` says the cursor had reached `id` by `at`, to within MARK_EVERY_MS. Only the newest
  // mark at least LATE_COMMIT_WINDOW_MS old is kept behind the window, so this stays about 60 long.
  // The first mark is the baseline, as of forever: a follower younger than the window re-reads
  // everything since it started.
  const marks: { at: number; id: number }[] = [{ at: -Infinity, id: last }];
  // Every id applied above `floor()` is in here, which is what makes a re-read safe to apply: the
  // floor never sits below an id this set has forgotten (`forgotten`).
  const seen = new Set<number>();
  let forgotten = opts.from;
  const floor = () => {
    const edge = now() - LATE_COMMIT_WINDOW_MS;
    while (marks.length > 1 && marks[1].at <= edge) marks.shift();
    return Math.max(marks[0].id, forgotten);
  };
  const remember = (id: number) => {
    seen.add(id);
    if (seen.size <= SEEN_MAX) return;
    const oldest = seen.values().next().value as number;
    seen.delete(oldest);
    forgotten = Math.max(forgotten, oldest);
  };
  const advance = (id: number) => {
    last = id;
    const tip = marks[marks.length - 1];
    if (now() - tip.at < MARK_EVERY_MS) tip.id = id;
    else marks.push({ at: now(), id });
  };
  const apply = (row: R) => {
    if (row.id <= last) {
      // At or below the cursor: a duplicate, a row older than the window, or a row that committed
      // late and has never been applied. Only the last is applied.
      if (row.id <= floor() || seen.has(row.id)) return;
    } else {
      advance(row.id);
    }
    remember(row.id);
    opts.onRow(row);
  };

  // The tail RPC answers at most CONTROL_TAIL_PAGE rows, so ONE call only ever recovers that much of
  // the gap. A renderer booting after an outage can be much further behind than a reconnecting
  // socket ever is, so keep pulling while pages come back full, each page from the last row of the
  // one before (the RPC answers in id order), so the walk always terminates; the page ceiling is a
  // runaway guard, not a design limit.
  // Counted rather than a boolean, because the 30 s poll and a hole recovery can overlap.
  let walks = 0;
  const refill = async (from: 'behind' | 'ahead') => {
    walks += 1;
    if (walks === 1) opts.onWalk?.(true);
    try {
      let after = from === 'behind' ? floor() : last;
      for (let page = 0; page < MAX_TAIL_PAGES; page += 1) {
        const rows = await opts.tail(after);
        rows.forEach(apply);
        if (rows.length < CONTROL_TAIL_PAGE) return;
        after = rows[rows.length - 1].id;
      }
    } finally {
      if (walks > 0) {
        walks -= 1;
        if (walks === 0) opts.onWalk?.(false);
      }
    }
  };

  // ── A ROW AHEAD OF THE CURSOR WAITS A MOMENT BEFORE IT COUNTS AS A HOLE. ──────────────────────
  //
  // The log topic delivers ONE TRANSACTION's rows out of id order: measured 2026-09-24 on the live
  // backend, 6 of 16 three-row batches arrived as 1,0,2 or 0,2,1, every one of them complete
  // within 2.1 ms. `postgres_changes` had delivered them in order. Treating each of those as a
  // hole would send every follower on a tail walk for four Takes in ten - an RPC apiece, the row
  // late by its round trip, and the fast road standing down for the whole walk.
  //
  // So a row that arrives ahead of the cursor is HELD, and the rows in front of it get
  // REORDER_WINDOW_MS to arrive. Each one that does is applied and drains whatever it unblocks, in
  // id order. A gap still open when the window closes is recovered from the tail, and the held
  // rows are never applied past it. A held row the walk also returns is dropped as a duplicate.
  //
  // 25 ms is ten times the widest spread measured. A genuine hole costs those 25 ms on top of the
  // walk it needed anyway, and this includes the ordinary case of ANOTHER production writing in
  // between: the ids are global across productions, so a gap never proves a row was lost - and a
  // gap still open after the walk may be a row that has not COMMITTED yet, which is why a row
  // below the cursor is applied when it does arrive rather than dropped.
  const held = new Map<number, R>();
  let holeTimer: ReturnType<typeof setTimeout> | null = null;
  const drainHeld = () => {
    for (let next = held.get(last + 1); next; next = held.get(last + 1)) apply(next);
    for (const id of held.keys()) if (id <= last) held.delete(id);
    if (held.size === 0 && holeTimer) {
      clearTimeout(holeTimer);
      holeTimer = null;
    }
  };
  let joinedBefore = false;
  let rejoinTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    offer(row) {
      if (row.id <= last) {
        apply(row);
        return;
      }
      if (row.id > last + 1) {
        held.set(row.id, row);
        holeTimer ??= setTimeout(() => {
          holeTimer = null;
          drainHeld();
          if (held.size > 0) {
            held.clear();
            opts.onHole?.();
            void refill('ahead');
          }
        }, REORDER_WINDOW_MS);
        return;
      }
      apply(row);
      drainHeld();
    },
    joined() {
      // A reconnect produces no replay of what was inserted while the socket was down, so every
      // join refills - and re-reads the window, because rows that committed late during the drop
      // sit below the cursor.
      if (!joinedBefore) {
        joinedBefore = true;
        void refill('behind');
        return;
      }
      rejoinTimer ??= setTimeout(() => {
        rejoinTimer = null;
        void refill('behind');
      }, Math.floor(random() * REJOIN_REFILL_SPREAD_MS));
    },
    refill,
    get walking() {
      return walks > 0;
    },
    get last() {
      return last;
    },
    stop() {
      if (holeTimer) clearTimeout(holeTimer);
      if (rejoinTimer) clearTimeout(rejoinTimer);
      holeTimer = rejoinTimer = null;
      held.clear();
      walks = 0;
    },
  };
}
