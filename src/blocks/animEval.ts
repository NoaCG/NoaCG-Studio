// Timeline v2 — the editor-side playhead value resolver (docs/TIMELINE_V2_PLAN.md,
// decision 11). Deliberately the ONLY timeline logic duplicated from the runtime interpreter,
// and deliberately tiny: the preview iframe runs the real interpreter for everything
// that plays; this resolver answers "what is this property at (step, t)" for the
// Inspector, the timeline's static rendering and exact splits. The CURVE is not duplicated:
// it comes from the shared ease source the interpreter emits (templates/shared/easeRuntime.ts).
// Parity with the interpreter is pinned by e2e/anim-engine.spec.ts and e2e/editor-ease.spec.ts.

import type { AnimData, AnimKeyframe, AnimLoop } from './animData';
import { easeCurve } from '../templates/shared/easeRuntime';

/** Properties the renderer cannot take outside a range, whatever the curve does on the way. */
export const BOUNDED_RANGES: Readonly<Record<string, readonly [number, number]>> = { opacity: [0, 1], autoAlpha: [0, 1] };
/** The value as the renderer shows it: a bounded number is held inside its range. */
function settled(prop: string, value: number | string): number | string {
  const range = BOUNDED_RANGES[prop];
  return range && typeof value === 'number' ? Math.min(range[1], Math.max(range[0], value)) : value;
}

/** Fold a query time into one pass of a looping track, mirroring GSAP's repeat/yoyo/
 *  repeatDelay math, so the resolver reports exactly what the repeating sub-timeline shows.
 *  Returns a time within the track's span; before the first keyframe it returns localT
 *  unchanged (the loop has not started yet). */
function loopedTime(kfs: AnimKeyframe[], loop: AnimLoop, localT: number): number {
  const first = kfs[0].time;
  const last = kfs[kfs.length - 1].time;
  const period = last - first;
  if (period <= 0 || localT <= first) return localT;
  const rd = loop.repeatDelay && loop.repeatDelay > 0 ? loop.repeatDelay : 0;
  const cycle = period + rd;
  const elapsed = localT - first;
  const pass = Math.floor(elapsed / cycle);
  const totalPasses = loop.repeat < 0 ? Infinity : loop.repeat + 1;
  // Past the final pass: rest where the loop stopped (a yoyo that ran an even number of
  // passes lands back at the start).
  if (pass >= totalPasses) return loop.yoyo && totalPasses % 2 === 0 ? first : last;
  const within = elapsed - pass * cycle;
  // In the pause between passes: hold at the pass's end (yoyo flips odd passes' end).
  if (within >= period) return loop.yoyo && pass % 2 === 1 ? first : last;
  // A yoyo runs odd passes backward.
  return first + (loop.yoyo && pass % 2 === 1 ? period - within : within);
}

/** Effective (real-second) duration of one step — stored values are speed-relative. */
export function stepSeconds(data: AnimData, index: number): number {
  return data.steps[index].duration / (data.speed || 1);
}

/** Each step's start offset on the concatenated editing ruler, in real seconds. */
export function stepOffsets(data: AnimData): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (let i = 0; i < data.steps.length; i++) {
    offsets.push(at);
    at += stepSeconds(data, i);
  }
  return offsets;
}

/** The keyframes of one property in one step, time-sorted (empty when absent). */
function trackAt(data: AnimData, stepIndex: number, selector: string, prop: string): AnimKeyframe[] {
  const kfs = data.steps[stepIndex]?.layers[selector]?.[prop];
  return kfs && kfs.length ? [...kfs].sort((a, b) => a.time - b.time) : [];
}

const NUM_RE = /-?\d*\.?\d+/g;

/**
 * Interpolate the numbers inside two structurally identical strings — `blur(0px)` →
 * `blur(8px)`, `inset(0% 100% 0% 0%)` → `inset(0% 0% 0% 0%)`. This is what GSAP does to a
 * complex string at runtime, so mirroring it here keeps the Inspector's number in step with the
 * preview instead of stepping to the next keyframe.
 *
 * "Structurally identical" = the same text with the same COUNT of numbers in it. If the two
 * differ in any other way (a different filter function list, a different clip-path shape) there
 * is no meaningful in-between, and we hold `a` — the honest answer, and the one GSAP's own
 * discrete swap gives.
 */
function lerpNumbersInString(a: string, b: string, f: number): string {
  const an = a.match(NUM_RE);
  const bn = b.match(NUM_RE);
  if (!an || !bn || an.length !== bn.length) return a;
  if (a.replace(NUM_RE, '#') !== b.replace(NUM_RE, '#')) return a; // different shape
  let i = 0;
  return a.replace(NUM_RE, () => {
    const from = Number(an[i]);
    const to = Number(bn[i]);
    i++;
    const v = from + (to - from) * f;
    return String(Math.round(v * 1000) / 1000);
  });
}

/**
 * Resolve a property's value at (stepIndex, localT) — localT in SPEED-RELATIVE seconds
 * (the stored clock). Semantics mirror the interpreter:
 * - within a step, the first keyframe holds backward to the step start;
 * - between keyframes, numbers follow the segment's ease through the SHARED curve the
 *   interpreter plays, and opacity stays in 0..1 as the renderer keeps it. An ease outside the
 *   shared grammar keeps the old linear reading, for display only: exact edits refuse it;
 * - STRINGS interpolate too, when both sides have the same shape — `blur(0px) brightness(1)`
 *   → `blur(8px) brightness(1.4)` lerps each number in place, exactly as GSAP does at runtime,
 *   so the Inspector's number tracks the preview instead of stepping. Strings whose shapes
 *   differ have no meaningful in-between, so they hold the previous keyframe;
 * - a step without the track inherits the last keyframe value from an earlier step;
 * - null = no keyframe anywhere before this point: the layer's design (CSS) state.
 */
export function resolveValue(
  data: AnimData,
  selector: string,
  prop: string,
  stepIndex: number,
  localT: number,
): number | string | null {
  const kfs = trackAt(data, stepIndex, selector, prop);
  if (kfs.length > 0) {
    // A looping track folds the query time back into one pass (the interpreter runs a
    // repeating sub-timeline; this keeps the Inspector's number in step with it). A loop
    // should start at the step's beginning, so before its first keyframe the plain
    // hold-backward default below still applies.
    const loop = data.steps[stepIndex]?.loops?.[selector]?.[prop];
    const t = loop && kfs.length > 1 ? loopedTime(kfs, loop, localT) : localT;
    if (t <= kfs[0].time) return settled(prop, kfs[0].value);
    for (let i = 1; i < kfs.length; i++) {
      if (t < kfs[i].time) {
        const a = kfs[i - 1];
        const b = kfs[i];
        const f = (t - a.time) / (b.time - a.time);
        const eased = easeCurve(b.ease || data.steps[stepIndex].ease)?.(f) ?? f;
        if (typeof a.value === 'number' && typeof b.value === 'number') {
          return settled(prop, a.value + (b.value - a.value) * eased);
        }
        if (typeof a.value === 'string' && typeof b.value === 'string') {
          return lerpNumbersInString(a.value, b.value, eased);
        }
        return a.value;
      }
    }
    return settled(prop, kfs[kfs.length - 1].value);
  }
  // Inherit from earlier steps: the last keyframe value before this step.
  for (let s = stepIndex - 1; s >= 0; s--) {
    const prev = trackAt(data, s, selector, prop);
    if (prev.length > 0) return settled(prop, prev[prev.length - 1].value);
  }
  return null; // design state — the stylesheet's value
}

/** Every property a layer ever animates (drives the Inspector's armed diamonds). */
export function animatedProps(data: AnimData, selector: string): string[] {
  const props = new Set<string>();
  for (const step of data.steps) {
    for (const prop of Object.keys(step.layers[selector] ?? {})) props.add(prop);
  }
  return [...props];
}

/** The step where a layer first becomes active: its reveals step, else 0 (with ▶ Play).
 *  This is what "In" targets for presets — In is relative to the layer (decision 7). */
export function activationStep(data: AnimData, selector: string): number {
  for (let s = 1; s < data.steps.length - 1; s++) {
    if (data.steps[s].reveals?.includes(selector)) return s;
  }
  return 0;
}

/** The step where a layer LEAVES: its `hides` step, else the final Out step (a layer with
 *  no early exit lives to the end). The existence span is [activationStep, hideStep]. */
export function hideStep(data: AnimData, selector: string): number {
  for (let s = 1; s < data.steps.length - 1; s++) {
    if (data.steps[s].hides?.includes(selector)) return s;
  }
  return data.steps.length - 1;
}
