// TIMED GRAPHIC CUES, every rule once (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0, §2.1, §2.5, §2.9).
//
// A graphic cue may end by itself: after a number of seconds ON AIR, its layer goes out, the next
// graphic cue in the rundown is taken, or both. This module is the state of those countdowns, one
// per graphic layer ("lane"), and nothing else: no timer, no React, no wire. A page feeds it the
// facts (a cue marker went out on a layer, an output said it holds the cue, the operator held,
// resumed or went manual) and asks it what is due. Plain functions over plain values, so the
// unpublished engine on the production page and, from phase 2, the published one read the same
// rules, and `cueAuto.test.ts` drives them offline.
//
// THE ANCHOR (§2.0, the owner's point 1): a countdown starts when an OUTPUT has applied the Take,
// never at the press. A Take arms its lane WAITING; `aired` starts it RUNNING from that moment; and
// if no output says so within AIR_WAIT_MS, `settleWaiting` starts it from the Take itself.
//
// Times are epoch milliseconds on whatever clock the caller keeps. The unpublished page uses its
// own; nothing here reads one.

import type { CueAuto, CueEnd, ShowCue } from '../model/shows';
import { clockText, FINAL_S } from './serverState.ts';

/** An end action more than this late is MISSED and never runs (§2.5, the owner's point 2). */
export const LATE_LIMIT_MS = 5_000;
/** How long a Take waits for an output to say it holds the cue before the Take is the anchor. */
export const AIR_WAIT_MS = 3_000;
/** The shortest and longest length a cue may be timed for, in seconds. */
export const AFTER_MIN_S = 0.5;
export const AFTER_MAX_S = 86_400;

/** A typed length as the record keeps it: seconds to one decimal, in range, or null when it is not
 *  a length at all. */
export function cleanAfter(seconds: number): number | null {
  if (!Number.isFinite(seconds)) return null;
  const tenth = Math.round(seconds * 10) / 10;
  if (tenth < AFTER_MIN_S || tenth > AFTER_MAX_S) return null;
  return tenth;
}

/** A cue's timed end as the engine counts it, or null for a manual cue (or a record an older or
 *  newer build wrote that this build cannot read as one). */
export function readAuto(cue: Pick<ShowCue, 'auto' | 'source'>): CueAuto | null {
  const a = cue.auto;
  if (!a || cue.source === 'playout') return null;
  const after = typeof a.after === 'number' ? cleanAfter(a.after) : null;
  if (after === null || (a.then !== 'out' && a.then !== 'next' && a.then !== 'out-next')) return null;
  return { after, then: a.then };
}

/** Whether an end action takes the next cue. */
export function takesNext(then: CueEnd): boolean {
  return then !== 'out';
}

/** Whether an end action plays the timed cue's own layer off. */
export function playsOut(then: CueEnd): boolean {
  return then !== 'next';
}

/**
 * THE CUE `Next cue` WILL TAKE (§2.0): the first GRAPHIC cue after this one in the rundown's order,
 * looking past server cues the way a clip's Play next looks past graphics. Null when there is none,
 * which is also the last cue's case. Resolved when the cue is armed, so reordering after the Take
 * does not change it.
 */
export function nextGraphicCue(cues: readonly Pick<ShowCue, 'id' | 'source'>[], cueId: string): string | null {
  const at = cues.findIndex((c) => c.id === cueId);
  if (at < 0) return null;
  return cues.slice(at + 1).find((c) => c.source !== 'playout')?.id ?? null;
}

/** One lane's countdown. */
export type LaneArm = {
  /** The timed cue on this lane. */
  cue: string;
  then: CueEnd;
  /** The cue `Next cue` takes, resolved at arm time; absent when there is none. */
  next?: string;
  /** When the Take that armed it was applied: the fallback anchor. */
  takenAt: number;
} & (
  | { phase: 'waiting'; /** The full length. */ ms: number }
  | { phase: 'running'; /** The length still to count from `from`. */ ms: number; from: number }
  | { phase: 'held'; /** The frozen remainder. */ ms: number; heldAt: number }
  | { phase: 'missed'; /** When it was due. */ dueAt: number }
);

/** Every lane's countdown, by graphic name (the layer identity of the cue status rows). */
export type CueArms = Readonly<Record<string, LaneArm>>;

/** What a cue marker means for its lane's arm: the timed end of the cue it puts up, if it has one. */
export interface ArmSpec {
  auto: CueAuto;
  next: string | null;
}

/**
 * A CUE MARKER WENT OUT on a layer (`{t:'cue', cue}`, the row every Take and Out writes): the one
 * row whose effect matters here, in the `clockRowEffect` shape. A Take of a timed cue arms the lane
 * WAITING with its full length, and so does a re-take; a Take of a manual cue, an Out (`cue` null)
 * or All out replaces whatever countdown the lane had. An Update writes no marker, so it never
 * touches a countdown.
 */
export function markerEffect(arms: CueArms, graphic: string, cue: string | null, spec: ArmSpec | null, at: number): CueArms {
  if (!cue || !spec) return dropArm(arms, graphic);
  const arm: LaneArm = {
    cue,
    then: spec.auto.then,
    takenAt: at,
    phase: 'waiting',
    ms: Math.round(spec.auto.after * 1000),
    ...(takesNext(spec.auto.then) && spec.next ? { next: spec.next } : {}),
  };
  return { ...arms, [graphic]: arm };
}

/** An OUTPUT SAID IT HOLDS what is on this layer (§2.0): a waiting countdown starts from `at`. */
export function aired(arms: CueArms, graphic: string, at: number): CueArms {
  const arm = arms[graphic];
  if (!arm || arm.phase !== 'waiting') return arms;
  return { ...arms, [graphic]: { ...arm, phase: 'running', from: at } };
}

/** No output said so in time: every countdown still waiting AIR_WAIT_MS after its Take starts from
 *  the Take. */
export function settleWaiting(arms: CueArms, now: number): CueArms {
  let out: Record<string, LaneArm> | null = null;
  for (const [graphic, arm] of Object.entries(arms)) {
    if (arm.phase !== 'waiting' || now < arm.takenAt + AIR_WAIT_MS) continue;
    out ??= { ...arms };
    out[graphic] = { ...arm, phase: 'running', from: arm.takenAt };
  }
  return out ?? arms;
}

/** When a running countdown reaches zero. */
export function deadline(arm: LaneArm): number | null {
  return arm.phase === 'running' ? arm.from + arm.ms : null;
}

/** What is left to count, in ms: the full length while waiting, the frozen remainder while held,
 *  0 once due or missed. */
export function remaining(arm: LaneArm, now: number): number {
  const due = deadline(arm);
  if (due !== null) return Math.max(0, due - now);
  return arm.phase === 'missed' ? 0 : arm.ms;
}

/** HOLD (H, or the chip): freeze a running or waiting countdown. A running one already due
 *  answers `due` and changes nothing - its end action is on its way, and the page follows it. */
export function hold(arms: CueArms, graphic: string, now: number): CueArms | 'due' | null {
  const arm = arms[graphic];
  if (!arm) return null;
  if (arm.phase === 'waiting') return { ...arms, [graphic]: { ...arm, phase: 'held', heldAt: now } };
  if (arm.phase !== 'running') return null;
  const left = arm.from + arm.ms - now;
  if (left <= 0) return 'due';
  return { ...arms, [graphic]: { ...arm, phase: 'held', ms: left, heldAt: now } };
}

/** RESUME: a held countdown continues from its frozen remainder, counting from now. */
export function resume(arms: CueArms, graphic: string, now: number): CueArms | null {
  const arm = arms[graphic];
  if (!arm || arm.phase !== 'held') return null;
  return { ...arms, [graphic]: { ...arm, phase: 'running', from: now } };
}

/** MANUAL, or a fire that went out: the lane's countdown is gone, and its cue stays on air as an
 *  ordinary manual cue. */
export function dropArm(arms: CueArms, graphic: string): CueArms {
  if (!(graphic in arms)) return arms;
  const { [graphic]: _gone, ...rest } = arms;
  return rest;
}

/** What is due at `now`: the lanes to FIRE (at or after their deadline, within the late limit) and
 *  the lanes that MISSED (later than that). A held, waiting or missed lane is never due. */
export function dueLanes(arms: CueArms, now: number): { fire: string[]; missed: string[] } {
  const fire: string[] = [];
  const missed: string[] = [];
  for (const [graphic, arm] of Object.entries(arms)) {
    const due = deadline(arm);
    if (due === null || now < due) continue;
    if (now - due <= LATE_LIMIT_MS) fire.push(graphic);
    else missed.push(graphic);
  }
  return { fire, missed };
}

/** Mark a lane MISSED: it stays so, on its row, until a new marker on the layer or Manual. */
export function markMissed(arms: CueArms, graphic: string): CueArms {
  const arm = arms[graphic];
  const due = arm ? deadline(arm) : null;
  if (!arm || due === null) return arms;
  return { ...arms, [graphic]: { cue: arm.cue, then: arm.then, takenAt: arm.takenAt, ...(arm.next ? { next: arm.next } : {}), phase: 'missed', dueAt: due } };
}

/** How long until something here needs looking at again: the next deadline or the next waiting
 *  arm's fallback. Null when nothing is counting. */
export function nextWake(arms: CueArms, now: number): number | null {
  let soonest: number | null = null;
  for (const arm of Object.values(arms)) {
    const at = deadline(arm) ?? (arm.phase === 'waiting' ? arm.takenAt + AIR_WAIT_MS : null);
    if (at !== null && (soonest === null || at < soonest)) soonest = at;
  }
  return soonest === null ? null : Math.max(0, soonest - now);
}

/**
 * THE CHIP'S COUNTDOWN (§2.1, §2.8): the running one that fires soonest; else one still waiting for
 * air; else the one held most recently. H acts on this one, never on the selected cue's layer: by
 * the time the operator wants to stop the current cue, the selection has usually moved on.
 */
export function chipLane(arms: CueArms): string | null {
  let best: { graphic: string; rank: number; at: number } | null = null;
  for (const [graphic, arm] of Object.entries(arms)) {
    const pick =
      arm.phase === 'running'
        ? { rank: 0, at: deadline(arm)! }
        : arm.phase === 'waiting'
          ? { rank: 1, at: arm.takenAt }
          : arm.phase === 'held'
            ? { rank: 2, at: -arm.heldAt }
            : null;
    if (!pick) continue;
    if (!best || pick.rank < best.rank || (pick.rank === best.rank && pick.at < best.at)) best = { graphic, ...pick };
  }
  return best?.graphic ?? null;
}

/** The cues an arm will take with `Next cue`, by the cue id, each with the arm that will. An arm
 *  carries `next` only when its end takes one (`markerEffect`). */
export function armedNext(arms: CueArms): Map<string, LaneArm> {
  const out = new Map<string, LaneArm>();
  for (const arm of Object.values(arms)) {
    if (arm.next && arm.phase !== 'missed') out.set(arm.next, arm);
  }
  return out;
}

// ── Words ────────────────────────────────────────────────────────────────────────────────────

/** An end action in the editor's words. `» Next` is a graphic's own step in this product, so the
 *  cue that follows is always "next cue". */
export const END_WORDS: Record<CueEnd, string> = { out: 'Out', next: 'Next cue', 'out-next': 'Out and next cue' };
/** The same, short enough for a rundown row. */
export const END_SHORT: Record<CueEnd, string> = { out: 'Out', next: 'Next cue', 'out-next': 'Out + next' };

/** A countdown as a row reads it: whole seconds, rounded UP, so `0:01` is the last second and zero
 *  is never shown while anything is left. */
export function countText(ms: number): string {
  return clockText(ms / 1000, 'up');
}

/** A configured length as the rundown wears it: `0:08`, or `0:02.5` for a half second. */
export function lengthWords(seconds: number): string {
  const whole = Math.floor(seconds);
  const tenth = Math.round((seconds - whole) * 10);
  return tenth ? `${countText(whole * 1000)}.${tenth}` : countText(whole * 1000);
}

/** The last seconds a count takes the warning colour in. */
export const WARN_MS = FINAL_S * 1000;
