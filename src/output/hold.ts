// HELD TAKES (live-publishing G2 section 3; W3, S4, O7).
//
// A Take of a graphic this output cannot run yet (not hosted, or its frame still loading) is not
// dropped: it starts a hold, and every command of that graphic waits behind it, in log order, until
// the graphic can run them. Cancellation is decided first, from the queue's last lifecycle command:
// a queue that ends in an Out needs nothing loaded and nothing shown. When the graphic releases, the
// queue runs as live commands (its Take reached the output at most 5 s ago), or hidden and settled
// without its entrance (later than that, or a boot frame's history in its frame).
//
// Pure and DOM-free: scripts/output-hold.test.mjs runs it in Node against a reference model, and
// the output renderer loads it in CasparCG 2.3's Chromium 71 (ES2017: no `?.`, no `??`).

/** S4: a Take held longer than this appears without its entrance. */
export const ENTRANCE_MS = 5_000;
/** At most this many commands wait per graphic, and per output. */
export const HELD_PER_GRAPHIC = 200;
export const HELD_PER_OUTPUT = 1_000;

/** One held command: the log row's position, its message, its server time, and when it reached
 *  this output on the output's own clock. */
export interface HeldRow<M extends { t: string } = { t: string }> {
  at: number;
  msg: M;
  createdAt?: string;
  receivedAt: number;
}

export const isTake = (t: string) => t === 'play' || t === 'snap';
export const isOut = (t: string) => t === 'stop';

/** The queue's last lifecycle command: 'take', 'out', or null when it holds none. */
export function lastLifecycle(rows: readonly HeldRow[]): 'take' | 'out' | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const t = rows[i].msg.t;
    if (isTake(t)) return 'take';
    if (isOut(t)) return 'out';
  }
  return null;
}

/** A queue that ends in an Out, or holds no Take, is cancelled: nothing of it is ever shown. */
export function isCancelled(rows: readonly HeldRow[]): boolean {
  return lastLifecycle(rows) !== 'take';
}

/** When the Take that will be seen reached this output: the newest Take, or null. */
export function surviving(rows: readonly HeldRow[]): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const t = rows[i].msg.t;
    if (isOut(t)) return null;
    if (isTake(t)) return rows[i].receivedAt;
  }
  return null;
}

export type ReleaseMode = 'cancelled' | 'onTime' | 'late';

/** How a held queue runs when its graphic releases at `now`. `history`: the frame already holds a
 *  boot's history in its own queue, which never plays on air. */
export function releaseMode(rows: readonly HeldRow[], now: number, history: boolean): ReleaseMode {
  // A boot frame's history never plays on air: hidden, whatever the queue ends in (G2 case 1).
  if (history) return 'late';
  if (isCancelled(rows)) return 'cancelled';
  const take = surviving(rows);
  return take !== null && now - take <= ENTRANCE_MS ? 'onTime' : 'late';
}

/** Whether a held Take has waited past S4's 5 s (its `h` kind reads `late`). */
export function heldLate(rows: readonly HeldRow[], now: number): boolean {
  const take = surviving(rows);
  return take !== null && now - take > ENTRANCE_MS;
}

type Plain = { t: string; data?: Record<string, string>; typed?: unknown; appearance?: unknown; place?: unknown; src?: unknown };

/** Two updates that run the same as one: no typed data, look or place hint, the same data road. */
const mergeable = (a: Plain, b: Plain) =>
  a.t === 'update' &&
  b.t === 'update' &&
  a.typed === undefined &&
  b.typed === undefined &&
  a.appearance === undefined &&
  b.appearance === undefined &&
  a.place === undefined &&
  b.place === undefined &&
  a.src === b.src;

/**
 * Make room in a held queue: consecutive plain updates become one (the later values win, which is
 * what applying them in order does for a graphic that runs no clock; `clocks` true keeps them), and
 * an entrance a later Take or Out replaces is dropped. Returns the shorter queue, or null when it is
 * still over `limit`: the hold then fails with `limit`.
 */
export function compact<M extends Plain>(rows: readonly HeldRow<M>[], limit: number, clocks: boolean): HeldRow<M>[] | null {
  if (rows.length <= limit) return rows.slice();
  const out: HeldRow<M>[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (!clocks && last && mergeable(last.msg, row.msg)) {
      out[out.length - 1] = { ...row, msg: { ...row.msg, data: { ...(last.msg.data || {}), ...(row.msg.data || {}) } } };
      continue;
    }
    out.push(row);
  }
  // Superseded entrances: a Take with a later Take or Out of the same queue and no Next, event or
  // snap between them (seqFollow.ts `supersededAnimations`, the same rule).
  const kept: HeldRow<M>[] = [];
  let entrance = -1;
  for (const row of out) {
    const t = row.msg.t;
    if (t === 'play' || t === 'stop') {
      if (entrance >= 0) kept.splice(entrance, 1, null as unknown as HeldRow<M>);
      entrance = t === 'play' ? kept.length : -1;
    } else if (t === 'event' || t === 'next' || t === 'snap') {
      entrance = -1;
    }
    kept.push(row);
  }
  const result = kept.filter((row) => row !== null);
  return result.length <= limit ? result : null;
}

/** Why a hold failed, as its `h` entry and the page's words carry it. */
export type HoldFailure = 'unpublished' | 'load' | 'script' | 'limit' | 'typed';
