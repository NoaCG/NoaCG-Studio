// THE UNPUBLISHED TIMED-CUE ENGINE: the countdowns of an unpublished production, run by the page
// that is its one surface (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0, phase 1), and the page's half of
// a published production's, whose countdowns control/cueArmWire.ts runs with every other page.
//
// The rules are control/cueAuto.ts; this is their lifecycle. A cue marker this page sends arms or
// replaces its layer's countdown (`onMarker`); PROGRAM's state reply starts it (`onProgramState`);
// one timer, to whatever is next due, fires it through the page's sender exactly as a press would
// (`runDue`, `fire`); Hold and Manual move it (`hold`, `manual`). A fire NEVER moves the selection
// or PREVIEW: somebody may be editing the next cue, and moving the cursor under their hands would
// edit the wrong one. Published, Hold and Manual go to the arm wire and the timer does not run.
//
// Moved out of ProductionPage with its timer, thresholds and sentences unchanged (production-page
// refactor, phase 9), where it was two effects and five handlers. The countdowns live in the
// session's `arms` part. The page's effects, mapped:
//
//   the timer and the tab   [cueArms, hostedSlug]  re-armed at every write to the part while
//                                                  unpublished; off while published (`published`)
//   clearing the countdowns [timedCues]            on a change of `timedCues` to false
//
// The timer is set to the next wake, at least 15 ms, and set again when it comes due with nothing
// moved (a timer can come due a moment before the clock says so). When the window comes back from
// hiding everything due runs at once: a hidden window's timers are throttled, and past 5 s late
// that becomes Missed rather than a late action.
//
// The clock, the timers and the tab come in through `io`; what the page sends, holds and says
// through `page`, read at every call so each one sees the page's latest render. Runtime imports
// carry `.ts` so Node resolves them (scripts/cue-arm-engine.test.mjs); everything else is a type.

import type { ShowCue } from '../model/shows';
import type { CueArmWire } from './cueArmWire';
import type { ControlSendItem } from './hostedControl';
import type { LiveCueMap, VerbSent } from './liveCue';
import type { PlayoutSession } from './playoutSession';
import {
  END_WORDS,
  aired,
  countText,
  dropArm,
  dueLanes,
  hold,
  markMissed,
  markerEffect,
  nextGraphicCue,
  nextWake,
  playsOut,
  readAuto,
  readMarkerAuto,
  remaining,
  resume,
  settleWaiting,
  type ArmSpec,
  type CueArms,
  type LaneArm,
} from './cueAuto.ts';
import { clearCueItems, takeCueItems } from './cueItems.ts';
import { leftAlone, withLiveCue } from './liveCue.ts';

/** The shortest timer the engine sets, in ms. */
const MIN_TIMER_MS = 15;

export interface CueArmEngineIo {
  /** The time the engine counts in: this machine's own. */
  wallClock: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  /** Run `run` whenever the tab comes back into view; answers the stop. */
  onVisible: (run: () => void) => () => void;
}

/** What the engine reads from the page (the cues, the sender, the draft through `cueDraft.view`,
 *  the session's live map as the page draws it), as its latest render has it. */
export interface CueArmPage {
  /** The production is published: the wire runs the countdowns. */
  published: boolean;
  /** Published on a server that keeps no arms: no cue is timed. */
  timedOff: boolean;
  cues: readonly ShowCue[];
  /** The page's sender (`sendVerb`): every road a press takes. */
  send: (batches: ControlSendItem[][], label: string) => Promise<({ ok: true } & VerbSent) | { ok: false; note: string }>;
  /** The cue as the operator currently sees it, draft over record. */
  cueView: (cue: ShowCue) => { values: Record<string, string> };
  withBoundValues: (graphic: string, values: Record<string, string>) => Record<string, string>;
  graphicOf: (cue: ShowCue) => string | null;
  liveCueOf: () => LiveCueMap;
  setLiveCue: (fold: (map: LiveCueMap) => LiveCueMap) => void;
  /** A timed cue's end took `cue`: its folder misses and step follow it. */
  took: (cue: ShowCue) => void;
  /** Save the draft and close the history group, not waited for. */
  flush: () => void;
  /** A line on the action log for this lane. */
  log: (graphic: string, text: string) => void;
  note: (text: string) => void;
  /** Published: the arm wire, while there is one. */
  wire: () => CueArmWire | null;
}

/** What the page's effects hand the engine. */
export interface CueArmInputs {
  published: boolean;
  /** Timed cues run here or on the wire (`!published || armsServer === 'on'`). */
  timedCues: boolean;
}

export interface CueArmEngine {
  /** What a cue marker for this cue arms: its timed end and the cue `Next cue` takes, or null for
   *  a manual cue, or anywhere timed cues do not run. */
  specFor: (cueId: string) => ArmSpec | null;
  /** Unpublished: a batch went to PROGRAM, and each cue marker in it moves its layer's countdown. */
  onMarker: (batch: readonly ControlSendItem[]) => void;
  /** Everything due now: a countdown still waiting for air starts from its Take, one at zero
   *  fires, and one more than 5 s late is marked missed and never runs. */
  runDue: () => void;
  /** A timed cue's end action, sent once: its Out, the armed next cue's Take, or both in order. */
  fire: (graphic: string, arm: LaneArm) => Promise<void>;
  /** H, or a chip: hold a counting lane, or resume a held one. */
  hold: (graphic: string | null) => void;
  /** Manual: the timed end is dropped for this airing; a missed lane is cleared the same way. */
  manual: (graphic: string) => void;
  /** PROGRAM said what a graphic holds: a countdown waiting for air starts now. */
  onProgramState: (graphic: string) => void;
  /** The page rendered with these inputs; the engine acts on a change. */
  update: (inputs: CueArmInputs) => void;
  stop: () => void;
}

/** Move the `arms` part. */
export function writeArms(session: PlayoutSession, arms: CueArms) {
  session.apply((parts) => ({ ...parts, arms }));
}

export function startCueArmEngine(session: PlayoutSession, io: CueArmEngineIo, page: () => CueArmPage): CueArmEngine {
  let stopped = false;
  let inputs: CueArmInputs | null = null;
  /** The timer and the tab, while unpublished. */
  let stopClock: (() => void) | null = null;
  const get = () => session.arms.get();
  const set = (arms: CueArms) => writeArms(session, arms);

  const specFor = (cueId: string): ArmSpec | null => {
    const p = page();
    if (p.timedOff) return null;
    const cue = p.cues.find((c) => c.id === cueId);
    const auto = cue ? readAuto(cue) : null;
    return auto ? { auto, next: nextGraphicCue(p.cues, cueId) } : null;
  };

  const fire = async (graphic: string, arm: LaneArm) => {
    const p = page();
    const items: ControlSendItem[][] = [];
    // Published, the server checked the lane still holds the cue before it said ok, which this page's
    // own view may trail; unpublished, this page's view is the only one.
    const out = playsOut(arm.then) && (p.published || p.liveCueOf()[graphic] === arm.cue);
    if (out) items.push(clearCueItems(graphic));
    const next = arm.next ? p.cues.find((c) => c.id === arm.next && c.source !== 'playout') : undefined;
    const nextGraphic = next ? p.graphicOf(next) : null;
    if (next && nextGraphic) {
      // The draft already owns preparation. Its cloud acknowledgement must not delay the timer.
      p.flush();
      items.push(takeCueItems({ id: next.id, graphic: nextGraphic, values: p.withBoundValues(nextGraphic, p.cueView(next).values) }));
    }
    const words = `Auto ${END_WORDS[arm.then]}`;
    const gone = !!arm.next && !(next && nextGraphic);
    // Published, the server's fire row says "Auto Out sent" on every page; this one only adds what
    // went wrong here.
    if (!items.length) {
      if (!p.published) p.log(graphic, `${words}: nothing to send`);
      if (gone) p.note('The cue armed to be taken next is gone, so nothing was taken.');
      return;
    }
    const sent = await p.send(items, words);
    if (!sent.ok) {
      p.note(sent.note);
      return;
    }
    const stands = leftAlone(sent);
    p.setLiveCue((m) => {
      let lc = out && !stands.includes(graphic) ? withLiveCue(m, graphic, null) : m;
      if (next && nextGraphic && !stands.includes(nextGraphic)) lc = withLiveCue(lc, nextGraphic, next.id);
      return lc;
    });
    if (next) p.took(next);
    if (!p.published) p.log(graphic, `${words} sent`);
    if (gone) p.note('The cue armed to be taken next is gone, so only Out ran.');
  };

  const runDue = () => {
    if (stopped) return;
    const now = io.wallClock();
    let arms = settleWaiting(get(), now);
    const { fire: due, missed } = dueLanes(arms, now);
    const firing: [string, LaneArm][] = due.map((g) => [g, arms[g]]);
    for (const g of due) arms = dropArm(arms, g);
    for (const g of missed) {
      page().log(g, `Auto ${END_WORDS[arms[g].then]} missed`);
      arms = markMissed(arms, g);
    }
    set(arms);
    for (const [g, arm] of firing) void fire(g, arm);
  };

  // THE TIMER: one, to whatever is next due, set again at every write to the part.
  const startClock = () => {
    let timer: unknown;
    const arm = () => {
      const wake = nextWake(get(), io.wallClock());
      timer = wake === null ? undefined : io.setTimer(tick, Math.max(wake, MIN_TIMER_MS));
    };
    const tick = () => {
      timer = undefined;
      const before = get();
      runDue();
      if (!stopped && get() === before) arm();
    };
    const rearm = () => {
      if (timer !== undefined) io.clearTimer(timer);
      arm();
    };
    const unsubscribe = session.arms.subscribe(rearm);
    const offVisible = io.onVisible(runDue);
    arm();
    return () => {
      unsubscribe();
      offVisible();
      if (timer !== undefined) io.clearTimer(timer);
    };
  };

  let offDispose = () => {};
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stopClock?.();
    stopClock = null;
    offDispose();
  };
  // The session's end stops it too (at once, when the session has already ended).
  offDispose = session.onDispose(stop);

  return {
    specFor,
    onMarker: (batch) => {
      if (stopped) return;
      // A timed cue's Take arms its layer; anything else on the layer replaces it (cueAuto.ts
      // `markerEffect`).
      let arms = get();
      for (const item of batch) {
        if (item.msg.t !== 'cue') continue;
        const cue = item.msg.cue;
        const directAuto = readMarkerAuto(item.msg.auto);
        const spec = item.msg.direct ? (directAuto ? { auto: { after: directAuto.ms / 1000, then: directAuto.then }, next: null } : null) : cue ? specFor(cue) : null;
        arms = markerEffect(arms, item.graphic, cue, spec, io.wallClock());
      }
      set(arms);
    },
    runDue,
    fire,
    hold: (graphic) => {
      if (stopped || !graphic) return;
      const p = page();
      if (p.published) {
        p.wire()?.toggleHold(graphic);
        return;
      }
      const arm = get()[graphic];
      if (!arm) return;
      const now = io.wallClock();
      if (arm.phase === 'held') {
        const next = resume(get(), graphic, now);
        if (next) {
          set(next);
          p.log(graphic, `Resumed at ${countText(arm.ms)}`);
        }
        return;
      }
      const next = hold(get(), graphic, now);
      if (next === 'due' || !next) return;
      set(next);
      p.log(graphic, `Held at ${countText(remaining(next[graphic], now))}`);
    },
    manual: (graphic) => {
      if (stopped) return;
      const p = page();
      if (p.published) {
        p.wire()?.manual(graphic);
        return;
      }
      const arm = get()[graphic];
      if (!arm) return;
      set(dropArm(get(), graphic));
      if (arm.phase !== 'missed') p.log(graphic, 'Manual: the timed end is off for this airing');
    },
    onProgramState: (graphic) => {
      if (stopped) return;
      // Published, the anchor is a renderer's report, stamped by the server (cueArmWire.ts).
      if (!page().published) set(aired(get(), graphic, io.wallClock()));
    },
    update: (next) => {
      if (stopped) return;
      const prev = inputs;
      inputs = next;
      if (prev?.published !== next.published) {
        stopClock?.();
        stopClock = next.published ? null : startClock();
      }
      // Where timed cues do not run (a published production whose server keeps no arms), whatever
      // this page held goes.
      if (prev?.timedCues !== next.timedCues && !next.timedCues && Object.keys(get()).length) set({});
    },
    stop,
  };
}
