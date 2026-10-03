// TIMED CUES ON A PUBLISHED PRODUCTION: the wire (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0, §2.4 to
// §2.6; migration 0075).
//
// Unpublished, the production page is the only surface and runs the countdowns itself
// (cueAuto.ts, phase 1). Published, any number of operator pages are open at once, and a reload
// must pick the countdown up where it was, so the arm lives in the database and every page runs
// the SAME engine over it, from this file:
//
// - A Take marker that carries `auto` arms its lane WAITING (cueAuto.ts `armRowEffect`), on every
//   page that follows the log, the pressing one included.
// - The on-air anchor is the server's: when a page sees a renderer's report (`{t:'live'}`) for a
//   waiting lane, or 3 s pass with none, it asks `aired`, and the server stamps the anchor once,
//   from the report's own time when its baseline covers the Take, else from the Take.
// - At the deadline every page asks `fire`. The server answers `ok` to exactly one, which then
//   sends the end action like a press (the `fire` option); more than 5 s late it answers `late`
//   and marks the arm missed, and nothing runs it. A winner whose answer was lost asks again with
//   the same page id and is told `ok` again, as long as its end action has not gone out.
// - Hold, Resume and Manual are server operations too, so a hold pressed on a phone freezes the
//   count on the desk.
// - Every change is a numbered cue row, so every page follows it in order. An answer is applied
//   only when no newer row has already moved its lane.
//
// THE CLOCK. The server's times are on the server's clock and the page counts on its own. Every
// row gives `receivedAt - created_at`, which is the page's clock offset plus that row's latency;
// the smallest seen is the offset this page uses (`skew`), so a page whose clock is ten seconds
// slow still fires on time, and the server's `early` answer covers what is left.

import {
  AIR_WAIT_MS,
  armRowEffect,
  deadline,
  dropArm,
  hold as holdLane,
  laneFromWire,
  resume as resumeLane,
  type CueArms,
  type LaneArm,
} from './cueAuto.ts';
import type { ControlEventRow } from './hostedControl';
import { uuid } from '../model/id.ts';
import type { ArmAnswer, ArmRequest, ArmsRead } from './cueArmRpc';

/** How long a page waits after a renderer's report before asking `aired`, at most: every page sees
 *  the same report, and the first to ask stamps it for all, so the others rarely need to. */
const AIRED_JITTER_MS = 250;
/** How soon an unanswered request is asked again. */
const RETRY_MS = 1_000;
/** How often an operator's hold, resume or Manual is asked before the page says it did not land. */
const PRESS_TRIES = 3;
/** How often, and how far apart, the first read is asked before the page gives up on it. */
const BOOT_TRIES = 5;
const BOOT_BACKOFF_MS = 2_000;

export interface CueArmWireOptions {
  slug: string;
  /** The page's arms, and their setter: the page renders them, and while published this engine is
   *  their only writer. */
  get: () => CueArms;
  set: (arms: CueArms) => void;
  /** The server said `ok` to THIS page's fire: send the end action once, like a press. */
  fire: (lane: string, arm: LaneArm) => void | Promise<void>;
  /** A refusal worth a sentence on this page. */
  note?: (text: string) => void;
  now?: () => number;
  /** The two RPCs (cueArmRpc.ts `CUE_ARM_RPC` on a page, stand-ins in a test). */
  rpc: {
    arm: (slug: string, lane: string, cue: string, op: ArmRequest, by: string) => Promise<ArmAnswer | null>;
    armsFor: (slug: string) => Promise<ArmsRead>;
  };
  /** This page's id for a fire it may have to ask again; minted per engine when absent. */
  by?: string;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  random?: () => number;
}

export interface CueArmWire {
  /** Read the arms the server keeps, asking again on a failure, and follow the window coming back
   *  from hiding. `onState` hears `on`, or `missing` on a server without 0075. */
  start(onState: (state: 'on' | 'missing') => void): void;
  /** One read of the arms the server keeps. */
  boot(): Promise<'on' | 'missing' | 'failed'>;
  /** Every durable log row, in order, as the follower delivers it. */
  row(row: ControlEventRow): void;
  /** H, or a chip: hold a counting lane, or resume a held one. */
  toggleHold(lane: string): void;
  /** Manual: drop the lane's timed end for this airing (a missed one is cleared the same way). */
  manual(lane: string): void;
  /** The log was published again: every seq held is from a log that is gone. */
  reset(): void;
  stop(): void;
}

export function createCueArmWire(o: CueArmWireOptions): CueArmWire {
  const now = o.now ?? Date.now;
  const { rpc } = o;
  const by = o.by ?? uuid();
  const setTimer = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const random = o.random ?? Math.random;
  /** This page's clock minus the server's, plus the smallest latency seen. */
  let skew: number | null = null;
  /** Rows at or below this seq are covered by the boot read. */
  let bootRev = -1;
  /** Per lane, the seq its arm last moved at, from a row or an answer. */
  const laneRev = new Map<string, number>();
  /** Requests in flight, by `lane` for the automatic ones (aired, fire) and `lane:press` for the
   *  operator's, so a hold is never lost behind a fire being asked, nor a fire behind a hold. */
  const asking = new Set<string>();
  /** Lanes the server told to wait (`early`, `waiting`), or whose ask did not answer, until when. */
  const notBefore = new Map<string, number>();
  let timer: unknown;
  let stopped = false;
  let onShow: (() => void) | null = null;

  const k = () => skew ?? 0;
  const sample = (serverMs: number) => {
    const s = now() - serverMs;
    if (Number.isFinite(s) && (skew === null || s < skew)) skew = s;
  };

  /** An answer moves the lane unless a newer row already did. An answer with no arm (it ended,
   *  or the lane holds another Take now) drops only the arm it was asked about, and leaves the
   *  lane's order alone: the row of whatever replaced it is still on its way here. */
  const apply = (lane: string, asked: LaneArm, ans: ArmAnswer) => {
    if (ans.rev < (laneRev.get(lane) ?? -1)) return;
    const arms = o.get();
    if (ans.arm) {
      laneRev.set(lane, ans.rev);
      o.set({ ...arms, [lane]: laneFromWire(ans.arm, k(), now()) });
    } else if (arms[lane]?.cue === asked.cue && arms[lane]?.take === asked.take) {
      o.set(dropArm(arms, lane));
    }
  };

  /** One request. Null when it did not answer. */
  const request = async (lane: string, key: string, op: ArmRequest): Promise<{ asked: LaneArm; ans: ArmAnswer | null } | null> => {
    const asked = o.get()[lane];
    if (!asked || asking.has(key) || stopped) return null;
    asking.add(key);
    let ans: ArmAnswer | null;
    try {
      ans = await rpc.arm(o.slug, lane, asked.cue, op, by);
    } catch {
      ans = null;
    } finally {
      asking.delete(key);
    }
    if (stopped) return null;
    if (ans) {
      sample(ans.at);
      apply(lane, asked, ans);
    }
    return { asked, ans };
  };

  /**
   * A FIRE WHOSE ANSWER WAS LOST may have won: the server could have committed it, and its row may
   * already be dropping this lane here. So it is asked again for the arm it was, whatever the lane
   * now shows; the server says `ok` again only to this page and only while the end action has not
   * gone out. The lane counts as asking meanwhile, so nothing else on it asks `fire` beside it.
   */
  const refire = async (lane: string, asked: LaneArm, left: number) => {
    let ans: ArmAnswer | null;
    try {
      ans = await rpc.arm(o.slug, lane, asked.cue, 'fire', by);
    } catch {
      ans = null;
    }
    if (stopped) return;
    if (!ans && left > 1) {
      setTimer(() => void refire(lane, asked, left - 1), RETRY_MS);
      return;
    }
    asking.delete(lane);
    if (ans) {
      sample(ans.at);
      apply(lane, asked, ans);
      if (ans.ok && ans.op === 'fire') void o.fire(lane, asked);
    }
    schedule();
  };

  /** The automatic asks: the anchor and the fire. */
  const ask = async (lane: string, op: 'aired' | 'fire') => {
    const done = await request(lane, lane, op);
    if (!done) return;
    const { asked, ans } = done;
    if (!ans && op === 'fire') {
      asking.add(lane);
      setTimer(() => void refire(lane, asked, PRESS_TRIES), RETRY_MS);
      return;
    }
    if (!ans || ans.reason === 'early' || ans.reason === 'waiting') notBefore.set(lane, now() + (ans ? Math.max(ans.ms ?? 0, 15) : RETRY_MS));
    else notBefore.delete(lane);
    // THE ONE FIRE: only the page the server said `ok` to sends the end action.
    if (op === 'fire' && ans?.ok && ans.op === 'fire') void o.fire(lane, asked);
    schedule();
  };

  /** The operator's presses, asked again when they do not answer; after that the page says so
   *  and reads the server again, so what it shows is never a hold the server did not take. */
  const press = async (lane: string, op: 'hold' | 'resume' | 'cancel') => {
    for (let i = 0; i < PRESS_TRIES; i++) {
      const done = await request(lane, `${lane}:press`, op);
      if (!done) return;
      if (done.ans) {
        if (op === 'hold' && done.ans.reason === 'due') o.note?.('Too late to hold: the timed end is already on its way.');
        schedule();
        return;
      }
      await new Promise((r) => setTimer(() => r(null), RETRY_MS));
    }
    o.note?.(`The ${op === 'cancel' ? 'Manual' : op} did not reach the server. What the countdown shows is read again.`);
    void boot();
  };

  /** When something on a lane next needs asking: a waiting lane's fallback, a running lane's
   *  deadline, never sooner than the server said. */
  const dueAt = (lane: string, arm: LaneArm): number | null => {
    const at = arm.phase === 'waiting' ? arm.takenAt + AIR_WAIT_MS : arm.phase === 'running' ? deadline(arm) : null;
    return at === null ? null : Math.max(at, notBefore.get(lane) ?? 0);
  };

  const tick = () => {
    timer = undefined;
    if (stopped) return;
    const t = now();
    for (const [lane, arm] of Object.entries(o.get())) {
      if (asking.has(lane)) continue;
      const at = dueAt(lane, arm);
      if (at === null || t < at) continue;
      void ask(lane, arm.phase === 'waiting' ? 'aired' : 'fire');
    }
    schedule();
  };

  function schedule() {
    if (stopped) return;
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    let soonest: number | null = null;
    for (const [lane, arm] of Object.entries(o.get())) {
      if (asking.has(lane)) continue;
      const at = dueAt(lane, arm);
      if (at !== null && (soonest === null || at < soonest)) soonest = at;
    }
    if (soonest !== null) timer = setTimer(tick, Math.max(15, soonest - now()));
  }

  async function boot(): Promise<'on' | 'missing' | 'failed'> {
    let read: ArmsRead;
    try {
      read = await rpc.armsFor(o.slug);
    } catch {
      return 'failed';
    }
    if (stopped) return 'failed';
    if (!read.ok) return read.missing ? 'missing' : 'failed';
    sample(read.at);
    bootRev = Math.max(bootRev, read.rev);
    const arms: Record<string, LaneArm> = { ...o.get() };
    for (const lane of new Set([...Object.keys(arms), ...Object.keys(read.arms)])) {
      // A row newer than the read already moved this lane on this page.
      if ((laneRev.get(lane) ?? -1) > read.rev) continue;
      laneRev.set(lane, read.rev);
      const wire = read.arms[lane];
      if (wire) arms[lane] = laneFromWire(wire, k(), now());
      else delete arms[lane];
    }
    o.set(arms);
    schedule();
    return 'on';
  }

  return {
    start(onState) {
      void (async () => {
        for (let i = 0; i < BOOT_TRIES && !stopped; i++) {
          const state = await boot();
          if (stopped) return;
          if (state !== 'failed') {
            onState(state);
            return;
          }
          await new Promise((r) => setTimer(() => r(null), BOOT_BACKOFF_MS * (i + 1)));
        }
      })();
      if (typeof document !== 'undefined') {
        // A hidden window's timers are throttled: whatever came due while it slept, now. Past
        // 5 s late that is Missed rather than a late action.
        onShow = () => {
          if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onShow);
      }
    },

    boot,

    row(r) {
      if (stopped || typeof r.seq !== 'number') return;
      const rowAt = r.created_at ? Date.parse(r.created_at) : NaN;
      if (Number.isFinite(rowAt)) sample(rowAt);
      const msg = r.msg;
      if (msg.t === 'cue') {
        if (r.seq <= Math.max(bootRev, laneRev.get(r.graphic) ?? -1)) return;
        laneRev.set(r.graphic, r.seq);
        notBefore.delete(r.graphic);
        o.set(armRowEffect(o.get(), r.graphic, msg, { seq: r.seq, rowAt: Number.isFinite(rowAt) ? rowAt : now() - k() }, k()));
        schedule();
        return;
      }
      if (msg.t !== 'live') return;
      // A RENDERER REPORTED a lane that is waiting for air. The server decides whether the report
      // covers the Take; a moment's jitter lets the first page's ask serve every page.
      const arm = o.get()[r.graphic];
      if (arm?.phase !== 'waiting' || arm.take === undefined || r.seq <= arm.take) return;
      const take = arm.take;
      setTimer(() => {
        const still = o.get()[r.graphic];
        if (still?.phase === 'waiting' && still.take === take) void ask(r.graphic, 'aired');
      }, random() * AIRED_JITTER_MS);
    },

    toggleHold(lane) {
      const arm = o.get()[lane];
      if (!arm || arm.phase === 'missed') return;
      const t = now();
      // Shown at once, then the server's answer (or a newer row) settles it.
      if (arm.phase === 'held') {
        const next = resumeLane(o.get(), lane, t);
        if (next) o.set(next);
        void press(lane, 'resume');
        return;
      }
      const next = holdLane(o.get(), lane, t);
      if (next === 'due' || !next) return;
      o.set(next);
      void press(lane, 'hold');
    },

    manual(lane) {
      if (o.get()[lane]) void press(lane, 'cancel');
    },

    reset() {
      bootRev = -1;
      laneRev.clear();
      notBefore.clear();
      o.set({});
      void boot();
    },

    stop() {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
      if (onShow) document.removeEventListener('visibilitychange', onShow);
      onShow = null;
    },
  };
}
