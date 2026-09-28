// Timeline v2 Phase 4 — pure keyframe mutators over the animation data model. Every
// editing surface (Inspector diamonds, timeline diamond drags, Delete) routes through
// these: mutate a copy of the parsed data, then spliceAnimData + one applyTemplate makes
// the edit real, undoable code. Times are on the step's SPEED-RELATIVE clock (the stored
// numbers), rounded to the same 3 decimals the serializer writes.

import type { AnimData, AnimKeyframe, AnimLayerTracks, AnimStep } from './animData';
import { BOUNDED_RANGES, resolveValue } from './animEval';
import { easeCurve, parseEase, SAME_VALUE, sliceEase } from '../templates/shared/easeRuntime';
import {
  freshStateId,
  isWalkEdge,
  mainGroup,
  reconnectPath,
  rehomeLifecycleEdges,
  stateById,
  syncWaypointNames,
} from './animMachine';
import { filterKeysUsed, normalizeFilterTrack, withFilterComponent } from './filterTrack';

/** Two stored times match within half a serializer step. */
const EPS = 0.0005;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Move a cue-local visibility set and every key by the same stored delta.
 * Refuse crossing instead of clipping, stretching or overwriting keys. */
export function moveLayerSpan(data: AnimData, index: number, selector: string, delta: number): AnimData {
  const step = data.steps[index];
  if (!step || !Number.isFinite(delta)) throw new Error('Choose a finite move inside one cue.');
  delta = round(delta);
  if (delta === 0) return data;
  const spans = step.spans?.[selector] ?? [{ start: 0, end: step.duration }];
  const keys = Object.values(step.layers[selector] ?? {}).flat();
  const times = [...spans.flatMap(s => [s.start, s.end]), ...keys.map(k => k.time)];
  if (!times.length) throw new Error('This layer has no visible span in this cue.');
  if (times.some(t => round(t + delta) < 0 || round(t + delta) > step.duration)) {
    throw new Error('This move crosses a cue boundary. Cross-cue movement is not available yet; no keys or spans changed.');
  }
  const next = clone(data), target = next.steps[index];
  const reveal = data.steps.findIndex((s, i) => i > 0 && s.reveals?.includes(selector));
  const hide = data.steps.findIndex(s => s.hides?.includes(selector));
  if (data.steps.some(cue => cue.spans?.[selector] === undefined && cue.hides?.includes(selector))) {
    throw new Error('This legacy layer hides at a cue endpoint. Moving it cannot preserve that held pose yet; no keys or spans changed.');
  }
  next.steps.forEach((cue, i) => {
    if (cue.spans?.[selector] !== undefined) return;
    cue.spans = { ...cue.spans, [selector]: (cue.duration === 0 || reveal >= 0 && i < reveal || hide >= 0 && i > hide) ? [] : [{ start: 0, end: cue.duration }] };
  });
  target.spans = { ...target.spans, [selector]: spans.map(s => ({ start: round(s.start + delta), end: round(s.end + delta) })) };
  for (const track of Object.values(target.layers[selector] ?? {})) for (const key of track) key.time = round(key.time + delta);
  return next;
}

/** Trim one interval only. Keys, inheritance and all other cue poses remain intact. */
export function trimLayerSpan(data: AnimData, index: number, selector: string, interval: number, edge: 'start' | 'end', time: number, minimum: number): AnimData {
  const step = data.steps[index];
  const spans = step?.spans?.[selector] ?? (step ? [{ start: 0, end: step.duration }] : []);
  const span = spans[interval];
  if (!step || !Number.isInteger(interval) || !span || !['start', 'end'].includes(edge) || !Number.isFinite(time) || !Number.isFinite(minimum) || minimum <= 0) throw new Error('Choose a valid visibility interval and edge.');
  time = round(time);
  const changed = { ...span, [edge]: time };
  if (spans.some((s, i) => i > 0 && s.start < spans[i - 1].end)) throw new Error('These visibility intervals overlap or are out of order. Resolve them in source before trimming.');
  if (changed.start < 0 || changed.end > step.duration || changed.end - changed.start < minimum - EPS ||
      interval > 0 && changed.start < spans[interval - 1].end || interval + 1 < spans.length && changed.end > spans[interval + 1].start) {
    throw new Error('Keep the span inside its cue, clear of adjacent spans and at least one frame long. No keys or spans changed.');
  }
  if (time === span[edge]) return data;
  if (data.steps.some(cue => cue.spans?.[selector] === undefined && cue.hides?.includes(selector))) throw new Error('This legacy layer hides at a cue endpoint. Its held pose cannot be preserved by this trim.');
  const next = clone(data);
  const reveal = data.steps.findIndex((s, i) => i > 0 && s.reveals?.includes(selector));
  const hide = data.steps.findIndex(s => s.hides?.includes(selector));
  next.steps.forEach((cue, i) => {
    if (cue.spans?.[selector] !== undefined) return;
    cue.spans = { ...cue.spans, [selector]: (cue.duration === 0 || reveal >= 0 && i < reveal || hide >= 0 && i > hide) ? [] : [{ start: 0, end: cue.duration }] };
  });
  next.steps[index].spans![selector][interval] = changed;
  return next;
}

function clone(data: AnimData): AnimData {
  return JSON.parse(JSON.stringify(data)) as AnimData;
}

/** Drop empty tracks and layer entries so the emitted block never carries dead weight, and
 *  any loop entry whose track no longer exists (a loop is meaningless without its keyframes). */
function prune(data: AnimData): AnimData {
  for (const step of data.steps) {
    for (const [selector, tracks] of Object.entries(step.layers)) {
      for (const [prop, kfs] of Object.entries(tracks)) {
        if (kfs.length === 0) delete tracks[prop];
      }
      if (Object.keys(tracks).length === 0) delete step.layers[selector];
    }
    if (step.loops) {
      for (const [selector, perProp] of Object.entries(step.loops)) {
        for (const prop of Object.keys(perProp)) {
          if (!step.layers[selector]?.[prop]) delete perProp[prop];
        }
        if (Object.keys(perProp).length === 0) delete step.loops[selector];
      }
      if (Object.keys(step.loops).length === 0) delete step.loops;
    }
  }
  return data;
}

/** Add or update one keyframe (matching by time). The value may be a number or a string
 *  (filter/clipPath). Returns new data. */
export function setKeyframe(
  data: AnimData,
  stepIndex: number,
  selector: string,
  prop: string,
  time: number,
  value: number | string,
  ease?: string,
): AnimData {
  const next = clone(data);
  const step = next.steps[stepIndex];
  if (!step) return data;
  const t = round(Math.max(0, Math.min(time, step.duration)));
  const layer = (step.layers[selector] ??= {});
  const track = (layer[prop] ??= []);
  const existing = track.find((k) => Math.abs(k.time - t) < EPS);
  if (existing) {
    existing.value = typeof value === 'number' ? round(value) : value;
    if (ease !== undefined) existing.ease = ease;
  } else {
    const kf: AnimKeyframe = { time: t, value: typeof value === 'number' ? round(value) : value };
    if (ease) kf.ease = ease;
    track.push(kf);
    track.sort((a, b) => a.time - b.time);
  }
  return next;
}

/**
 * Split one segment of a numeric track at `time` WITHOUT changing its motion: the new key holds
 * the sampled value and eases in with the first part of the curve, and the segment's destination
 * key eases in with the rest (`slice(E, 0, s)` and `slice(E, s, 1)`, templates/shared/easeRuntime.ts).
 * Neither half relies on the step default, and no other key changes. Stored values keep the
 * serializer's 3 decimals, so the result is exact to one stored unit, and checked against the
 * editor's own sampling. Anything without an exact form throws with the reason; `data` is never
 * mutated, so a caller's source and history stay as they were.
 */
export function splitKeyframeSegment(data: AnimData, stepIndex: number, selector: string, prop: string, time: number): AnimData {
  const step = data.steps[stepIndex];
  const track = step?.layers[selector]?.[prop] ?? [];
  const t = round(time), keys = [...track].sort((a, b) => a.time - b.time);
  const at = keys.findIndex((key, i) => i > 0 && keys[i - 1].time < t - EPS && t < key.time - EPS);
  if (!step || at < 0) throw new Error('A split needs a time strictly inside one segment of an existing track.');
  if (step.loops?.[selector]?.[prop]) throw new Error('A looping track keeps its cycle and is not split. Its source is preserved.');
  const from = keys[at - 1], to = keys[at], ease = to.ease || step.ease;
  if (typeof from.value !== 'number' || typeof to.value !== 'number') throw new Error('Only numeric tracks split exactly. Its source is preserved.');
  const next = clone(data), edited = next.steps[stepIndex].layers[selector][prop];
  const destination = edited[track.indexOf(to)];
  // A flat segment is constant under any ease, so its split is exact whatever the curve.
  if (from.value === to.value) {
    edited.push({ time: t, value: from.value, ease });
  } else {
    const curve = easeCurve(ease);
    if (!curve || parseEase(ease)?.kind === 'steps') throw new Error(`The ease "${ease}" has no exact split form yet. Its source is preserved.`);
    const s = (t - from.time) / (to.time - from.time), progress = curve(s);
    if (!(Math.abs(progress) >= 1e-9 && Math.abs(1 - progress) >= 1e-9)) throw new Error(SAME_VALUE);
    const value = round(from.value + (to.value - from.value) * progress), range = BOUNDED_RANGES[prop];
    if (range && (value < range[0] || value > range[1])) {
      throw new Error('At that moment the curve is outside the range this property can show, so no key can hold the split value. Its source is preserved.');
    }
    edited.push({ time: t, value, ease: sliceEase(ease, 0, s) });
    destination.ease = sliceEase(ease, s, 1);
  }
  edited.sort((a, b) => a.time - b.time);
  for (let i = 0; i <= 200; i++) {
    const sample = from.time + (to.time - from.time) * i / 200;
    const before = resolveValue(data, selector, prop, stepIndex, sample), after = resolveValue(next, selector, prop, stepIndex, sample);
    if (!(Math.abs(Number(after) - Number(before)) <= 0.001)) throw new Error('This split cannot be stored exactly at the saved precision. Its source is preserved.');
  }
  return next;
}

/**
 * Set ONE filter function (blur, brightness, glow, …) at a moment, leaving the others alone
 * (docs/PRESET_MODEL_REVIEW.md gap 8).
 *
 * `filter` is one CSS property holding a list of functions, so the data keeps ONE `filter` track
 * of composed strings — you cannot keyframe `blur` apart from `brightness` any more than CSS can.
 * Two things follow, and both are handled here:
 *
 * 1. The new keyframe must carry the OTHER functions' values as they are AT THIS MOMENT, or
 *    writing brightness would silently reset the blur that was mid-tween. So we resolve the
 *    track at `time` first and edit one number of it.
 * 2. Every keyframe in the track must then list the same functions in the same order, because
 *    that is what lets the runtime tween `filter` as a plain string (GSAP matches the numbers
 *    positionally; a track whose keyframes disagree on their shape jumps instead of
 *    interpolating). `normalizeFilterTrack` fills each keyframe's missing functions with their
 *    identity — which is what they were contributing anyway, so nothing about the motion changes.
 */
export function setFilterComponent(
  data: AnimData,
  stepIndex: number,
  selector: string,
  key: string,
  value: number,
  time: number,
  ease?: string,
): AnimData {
  const step = data.steps[stepIndex];
  if (!step) return data;
  const t = round(Math.max(0, Math.min(time, step.duration)));

  // The composed value in force at this moment — the other functions ride along untouched.
  const at = resolveValue(data, selector, 'filter', stepIndex, t);
  const composed = withFilterComponent(at, key, value);

  const next = setKeyframe(data, stepIndex, selector, 'filter', t, composed, ease);
  const track = next.steps[stepIndex]?.layers[selector]?.filter;
  if (track) {
    next.steps[stepIndex].layers[selector].filter = normalizeFilterTrack(track, filterKeysUsed(track));
  }
  return next;
}

/** Remove one property's keyframe at a time. Returns new data (pruned). */
export function deleteKeyframe(
  data: AnimData,
  stepIndex: number,
  selector: string,
  prop: string,
  time: number,
): AnimData {
  const next = clone(data);
  const track = next.steps[stepIndex]?.layers[selector]?.[prop];
  if (!track) return data;
  const at = track.findIndex((k) => Math.abs(k.time - time) < EPS);
  if (at === -1) return data;
  track.splice(at, 1);
  return prune(next);
}

/** Move EVERY property keyframe of a layer that sits at one time — the collapsed row's
 *  aggregate diamond drag. Clamped to the step; keyframes landing on another keyframe of
 *  the same track replace it (the drag wins). */
export function moveLayerKeyframes(
  data: AnimData,
  stepIndex: number,
  selector: string,
  fromTime: number,
  toTime: number,
): AnimData {
  const next = clone(data);
  const step = next.steps[stepIndex];
  const tracks = step?.layers[selector];
  if (!tracks) return data;
  const to = round(Math.max(0, Math.min(toTime, step.duration)));
  let moved = false;
  for (const kfs of Object.values(tracks)) {
    const at = kfs.findIndex((k) => Math.abs(k.time - fromTime) < EPS);
    if (at === -1) continue;
    const landed = kfs.findIndex((k, i) => i !== at && Math.abs(k.time - to) < EPS);
    const kf = kfs[at];
    kf.time = to;
    if (landed !== -1) kfs.splice(landed, 1);
    kfs.sort((a, b) => a.time - b.time);
    moved = true;
  }
  return moved ? next : data;
}

/** Move ONE property's keyframe — a property sub-row's diamond drag. Clamped to the
 *  step; landing on another keyframe of the same track replaces it (the drag wins). */
export function moveKeyframe(
  data: AnimData,
  stepIndex: number,
  selector: string,
  prop: string,
  fromTime: number,
  toTime: number,
): AnimData {
  const next = clone(data);
  const step = next.steps[stepIndex];
  const kfs = step?.layers[selector]?.[prop];
  if (!kfs) return data;
  const at = kfs.findIndex((k) => Math.abs(k.time - fromTime) < EPS);
  if (at === -1) return data;
  const to = round(Math.max(0, Math.min(toTime, step.duration)));
  const landed = kfs.findIndex((k, i) => i !== at && Math.abs(k.time - to) < EPS);
  kfs[at].time = to;
  if (landed !== -1) kfs.splice(landed, 1);
  kfs.sort((a, b) => a.time - b.time);
  return next;
}

/** The reveal channel's default motion — the same keyframes the importer writes for a
 *  legacy press (mask lines slide up within their mask; everything else fades and rises). */
function channelTracks(channel: 'mask' | 'rise', duration: number): AnimLayerTracks {
  return channel === 'mask'
    ? { yPercent: [{ time: 0, value: 110 }, { time: duration, value: 0 }] }
    : {
        opacity: [{ time: 0, value: 0 }, { time: duration, value: 1 }],
        y: [{ time: 0, value: 14 }, { time: duration, value: 0 }],
      };
}

/** Which press a layer is revealed by (-1 = it appears with ▶ Play). */
export function layerPress(data: AnimData, selector: string): number {
  for (let i = 1; i < data.steps.length - 1; i++) {
    if (data.steps[i].reveals?.includes(selector)) return i - 1;
  }
  return -1;
}

/**
 * Phase 5 — move WHEN a layer appears (the data twin of the legacy step chain's
 * changePartPress): -1 = with ▶ Play, k = an existing » press, presses-count = a brand-new
 * press before Out. Moving between presses carries the layer's tuned reveal keyframes;
 * entering or leaving the press world writes the channel's default motion (the entrance
 * choreography belongs to the step it plays in). Emptied presses disappear; default step
 * names renumber. Returns null when the move is a no-op.
 */
export function setLayerActivation(
  data: AnimData,
  selector: string,
  toPress: number,
  channel: 'mask' | 'rise',
): AnimData | null {
  const next = clone(data);
  const fromPress = layerPress(next, selector);
  const presses = next.steps.length - 2;
  const target = Math.min(toPress, presses); // presses = "a new press"
  if (target === fromPress) return null;
  if (target < -1 || target > presses) return null;

  // Remove the layer from where it currently animates in.
  const fromIdx = fromPress === -1 ? 0 : fromPress + 1;
  const carried = fromPress > -1 ? next.steps[fromIdx].layers[selector] : undefined;
  delete next.steps[fromIdx].layers[selector];
  if (fromPress > -1) {
    next.steps[fromIdx].reveals = (next.steps[fromIdx].reveals ?? []).filter((s) => s !== selector);
  }

  if (target === -1) {
    // Back to "appears with ▶ Play": the entrance gets the channel's default motion.
    next.steps[0].layers[selector] = channelTracks(channel, 0.45);
  } else {
    let destIdx = target + 1;
    if (target === presses) {
      // A brand-new press, just before Out.
      const step: AnimStep = {
        name: `Step ${next.steps.length}`,
        duration: 0.45,
        ease: next.steps[0].ease,
        reveals: [],
        layers: {},
      };
      insertStepAt(next, next.steps.length - 1, step);
      destIdx = next.steps.length - 2;
    }
    const dest = next.steps[destIdx];
    (dest.reveals ??= []).push(selector);
    dest.layers[selector] = carried ?? channelTracks(channel, Math.min(0.45, dest.duration));
    const maxT = Math.max(...Object.values(dest.layers[selector]).flat().map((k) => k.time));
    if (dest.duration < maxT) dest.duration = round(maxT);
  }

  // The press the layer LEFT may now be a dead Continue (nothing revealed or animated) —
  // drop it. Only the source step: a deliberately added empty step (the + button) stays.
  if (fromPress > -1) {
    const s = next.steps[fromIdx];
    if (s && (s.reveals ?? []).length === 0 && (s.hides ?? []).length === 0 && Object.keys(s.layers).length === 0) {
      removeStepAt(next, fromIdx);
    }
  }
  // Default names follow their position (a user's rename is left alone).
  for (let i = 1; i < next.steps.length - 1; i++) {
    if (/^Step \d+$/.test(next.steps[i].name)) next.steps[i].name = `Step ${i + 1}`;
  }
  syncWaypointNames(next);
  return next;
}

/**
 * Set where a layer LEAVES (the early-exit twin of setLayerActivation). `toStep` is the step
 * whose play hides the layer; passing the final Out step (or beyond) clears the early exit so
 * the layer lives to the end. The target is clamped after the layer's activation — a layer
 * can't leave before it appears. Empties the old `hides` list and prunes it away.
 */
export function setLayerHide(data: AnimData, selector: string, toStep: number): AnimData {
  const next = clone(data);
  const lastIdx = next.steps.length - 1;
  // Remove the layer from every step's hides (start clean).
  for (const step of next.steps) {
    if (step.hides) {
      step.hides = step.hides.filter((s) => s !== selector);
      if (step.hides.length === 0) delete step.hides;
    }
  }
  // A middle step earlier than its activation isn't a valid exit; only a real middle step
  // records an early exit. Out (lastIdx) or beyond = no early exit (lives to the end).
  let act = 0;
  for (let s = 1; s < lastIdx; s++) {
    if (next.steps[s].reveals?.includes(selector)) { act = s; break; }
  }
  if (toStep > act && toStep < lastIdx) {
    (next.steps[toStep].hides ??= []).push(selector);
  }
  return next;
}

/** Set (or clear — back to the step's default) the ease INTO every property keyframe of a
 *  layer at one time. The aggregate diamond's ease menu: one moment, one curve. A
 *  property sub-row passes `prop` to curve only ITS keyframe at that moment. */
export function setKeyframeEase(
  data: AnimData,
  stepIndex: number,
  selector: string,
  time: number,
  ease: string | null,
  prop?: string,
): AnimData | null {
  const next = clone(data);
  const tracks = next.steps[stepIndex]?.layers[selector];
  if (!tracks) return null;
  let touched = false;
  for (const [trackProp, kfs] of Object.entries(tracks)) {
    if (prop !== undefined && trackProp !== prop) continue;
    const kf = kfs.find((k) => Math.abs(k.time - time) < EPS);
    if (!kf) continue;
    if (ease === null) delete kf.ease;
    else kf.ease = ease;
    touched = true;
  }
  return touched ? next : null;
}

/** Set a step's DEFAULT ease (what keyframes without their own ease inherit). */
export function setStepEase(data: AnimData, stepIndex: number, ease: string): AnimData | null {
  if (!data.steps[stepIndex] || data.steps[stepIndex].ease === ease) return null;
  const next = clone(data);
  next.steps[stepIndex].ease = ease;
  return next;
}

// ── Phase 6: steps as clips ──────────────────────────────────────────────────

/** The latest keyframe OR call time in a step (0 when it does nothing). Both are events on
 *  the step's clock: shrinking past a call would silently drop it, so the preserve floor
 *  must honour calls too. */
function lastEventTime(step: AnimStep): number {
  let last = 0;
  for (const tracks of Object.values(step.layers)) {
    for (const kfs of Object.values(tracks)) {
      for (const kf of kfs) last = Math.max(last, kf.time);
    }
  }
  for (const c of step.calls ?? []) last = Math.max(last, c.time);
  return last;
}

/**
 * Resize a step (the clip's right-edge drag). Default 'preserve' keeps every keyframe's
 * timing — extending leaves settled air, shrinking clamps at the last keyframe or call
 * (motion and lifecycle hooks never silently truncate). 'stretch' (Alt-drag) scales all
 * keyframe AND call times proportionally — "make this step faster/slower". Returns null on
 * a no-op.
 */
export function resizeStep(
  data: AnimData,
  stepIndex: number,
  duration: number,
  mode: 'preserve' | 'stretch' = 'preserve',
): AnimData | null {
  const next = clone(data);
  const step = next.steps[stepIndex];
  if (!step) return null;
  const to =
    mode === 'preserve'
      ? round(Math.max(0.05, Math.max(duration, lastEventTime(step))))
      : round(Math.max(0.05, duration));
  if (Math.abs(to - step.duration) < EPS) return null;
  if (mode === 'stretch' && step.duration > 0) {
    const f = to / step.duration;
    for (const tracks of Object.values(step.layers)) {
      for (const kfs of Object.values(tracks)) {
        for (const kf of kfs) kf.time = round(kf.time * f);
      }
    }
    for (const c of step.calls ?? []) c.time = round(c.time * f);
    // A loop's pause is a time quantity too — stretch scales it with the keyframes it gates.
    for (const perProp of Object.values(step.loops ?? {})) {
      for (const loop of Object.values(perProp)) {
        if (loop.repeatDelay) loop.repeatDelay = round(loop.repeatDelay * f);
      }
    }
  }
  step.duration = to;
  return next;
}

/** Renumber default "Step N" names after a structural change (renames are left alone). */
function renumberSteps(data: AnimData): void {
  for (let i = 1; i < data.steps.length - 1; i++) {
    if (/^Step \d+( copy)?$/.test(data.steps[i].name)) data.steps[i].name = `Step ${i + 1}`;
  }
}

/**
 * Insert a step AND its bound default-path waypoint. `steps[i]` and `defaultPath[i]` are the
 * same thing seen from two sides (docs/STATE_MACHINE_SCHEMA.md — the positional binding), so
 * this is the ONE place a step is ever added: the binding cannot be forgotten at a call site
 * that doesn't exist. Machine-less data just gets the splice.
 */
function insertStepAt(data: AnimData, at: number, step: AnimStep): void {
  data.steps.splice(at, 0, step);
  const main = mainGroup(data);
  if (!main?.defaultPath) return;
  const id = freshStateId(main, step.name);
  const splitFrom = at > 0 ? main.defaultPath[at - 1] : null;
  const splitTo = main.defaultPath[at] ?? null;
  // Keep `states` reading in walk order — the serializer emits them as authored.
  const before = main.states.findIndex((s) => s.id === main.defaultPath![at]);
  main.states.splice(before < 0 ? main.states.length : before, 0, { id, name: step.name });
  main.defaultPath.splice(at, 0, id);
  // The SPLIT arrow follows its from-state: an arrow prev → next described how the walk
  // leaves prev, and inserting a waypoint between them must not retime or rename that (a
  // fresh `next` used to be minted while the original lingered as a stray skip-arrow). It
  // is re-pointed at the inserted waypoint — trigger, event, delay and style intact — and
  // reconnectPath draws the new second half as a plain `next`. The lifecycle stop edge is
  // rehomeLifecycleEdges' business; data-condition is reserved and left untouched.
  if (splitFrom && splitTo) {
    for (const t of main.transitions) {
      if (t.from === splitFrom && t.to === splitTo && t.trigger !== 'lifecycle' && t.trigger !== 'data-condition') {
        t.to = id;
      }
    }
  }
  // Inserting before Out moves the exit pair — the stop edge (and its style) moves with it.
  rehomeLifecycleEdges(main);
  reconnectPath(main);
}

/**
 * Remove the step at `at` AND its bound waypoint. A waypoint an authored BRANCH still points
 * at is not deleted but DEMOTED — off the path, carrying its timeline inline — because
 * dropping it would silently orphan the author's graph. (`reveals`/`hides` are stripped: they
 * are the ordered walk's mechanics and are invalid on an inline timeline.)
 */
function removeStepAt(data: AnimData, at: number): AnimStep | null {
  const [removed] = data.steps.splice(at, 1);
  const main = mainGroup(data);
  if (!main?.defaultPath) return removed ?? null;
  const gone = main.defaultPath[at];
  const prev = main.defaultPath[at - 1];
  const succ = main.defaultPath[at + 1];
  // Judge "is this an authored branch arrow?" against the path as it stands NOW. Splicing
  // first would make the walk's own arrows into and out of this waypoint look like branches,
  // and every deletion would demote instead of delete.
  const branchRef = main.transitions.some((t) => (t.from === gone || t.to === gone) && !isWalkEdge(main, t));
  main.defaultPath.splice(at, 1);
  // Re-seat the lifecycle edges BEFORE transitions touching the removed waypoint are
  // dropped: deleting the penultimate step moves the exit pair, and the stop edge — with
  // whatever style the author gave it — must move there, not vanish with the state.
  rehomeLifecycleEdges(main);
  if (branchRef && removed) {
    const state = stateById(main, gone);
    if (state) {
      const { reveals: _r, hides: _h, ...inline } = removed;
      state.timeline = inline;
    }
  } else {
    // Carry the walk's ARRIVAL: the arrow into the deleted waypoint says how the walk
    // leaves its predecessor, and deleting the waypoint must not silently retime that — a
    // timer auto-advance used to come back as a plain minted Next press here. It is
    // re-pointed at the successor (trigger, event, delay and style intact) — EXCEPT into
    // the final waypoint: carrying there would grant next-drives-out, or an auto-stop the
    // author never drew, so an arrival at a deleted penultimate step is dropped and next()
    // keeps its no-op.
    const succIsFinal = succ === main.defaultPath[main.defaultPath.length - 1];
    if (prev && succ && !succIsFinal) {
      for (const t of main.transitions) {
        if (t.from === prev && t.to === gone && t.trigger !== 'lifecycle' && t.trigger !== 'data-condition') {
          t.to = succ;
        }
      }
    }
    main.states = main.states.filter((s) => s.id !== gone);
    main.transitions = main.transitions.filter((t) => t.from !== gone && t.to !== gone);
  }
  reconnectPath(main);
  return removed ?? null;
}

/**
 * Duplicate a step: keyframes and calls copy verbatim in local time (the duplicate's
 * resolved starting state comes from its new predecessor — correct by construction; a
 * copied call is data, not magic, and the clock's start/stop are idempotent). Its
 * `reveals` are NOT copied: a layer activates once, and a second reveal of an
 * already-visible layer would replay its hidden state on air. The copy lands right
 * after the original — duplicating Out lands the copy before it, as a content step.
 */
export function duplicateStep(data: AnimData, stepIndex: number): AnimData | null {
  const src = data.steps[stepIndex];
  if (!src) return null;
  const next = clone(data);
  const copy = JSON.parse(JSON.stringify(src)) as AnimStep;
  delete copy.reveals;
  delete copy.hides; // a layer leaves once — a duplicated hide would re-hide an absent layer
  copy.name = /^Step \d+$/.test(src.name) ? src.name : `${src.name} copy`;
  const at = Math.min(stepIndex + 1, next.steps.length - 1); // never after Out
  // Outgoing BRANCH arrows are not copied, for the same reason `reveals` isn't: a copy is
  // content, not wiring.
  insertStepAt(next, at, copy);
  renumberSteps(next);
  syncWaypointNames(next);
  return next;
}

/** Rename a step (any step — Enter and Out included). */
export function renameStep(data: AnimData, stepIndex: number, name: string): AnimData | null {
  const trimmed = name.trim();
  if (!data.steps[stepIndex] || !trimmed || data.steps[stepIndex].name === trimmed) return null;
  const next = clone(data);
  next.steps[stepIndex].name = trimmed;
  syncWaypointNames(next); // the bound state's LABEL follows; its id never does
  return next;
}

/**
 * Delete a content step (never the entrance or Out). Layers it revealed return to
 * "appears with ▶ Play" with the channel's default motion, so nothing ends up visible
 * on air without an entrance.
 */
export function deleteStep(
  data: AnimData,
  stepIndex: number,
  channelOf: (selector: string) => 'mask' | 'rise',
): AnimData | null {
  if (stepIndex <= 0 || stepIndex >= data.steps.length - 1) return null;
  const next = clone(data);
  const removed = removeStepAt(next, stepIndex);
  for (const selector of removed?.reveals ?? []) {
    next.steps[0].layers[selector] = channelTracks(channelOf(selector), 0.45);
  }
  renumberSteps(next);
  syncWaypointNames(next);
  return next;
}

/**
 * Add an empty content step — an authoring target for the next reveal or keyframes (a press
 * that still does nothing when the show airs is the user's call). It lands just before Out
 * unless `at` names another slot, clamped between the entrance and Out: the entrance and the
 * exit are the walk's ends, never insertion points. A run of steps arriving together (a
 * template insertion carrying the donor's middle steps) inserts at consecutive indices, which
 * is what keeps a motion that spans two donor steps adjacent in the host's path.
 */
export function addStep(data: AnimData, at?: number): AnimData | null {
  const next = clone(data);
  const index = Math.min(Math.max(at ?? next.steps.length - 1, 1), next.steps.length - 1);
  const step: AnimStep = {
    name: `Step ${index + 1}`,
    duration: 0.45,
    ease: next.steps[0].ease,
    layers: {},
  };
  insertStepAt(next, index, step);
  renumberSteps(next);
  syncWaypointNames(next);
  return next;
}

/** Delete EVERY property keyframe of a layer at one time — the aggregate diamond's Delete. */
export function deleteLayerKeyframes(
  data: AnimData,
  stepIndex: number,
  selector: string,
  time: number,
): AnimData {
  const next = clone(data);
  const tracks = next.steps[stepIndex]?.layers[selector];
  if (!tracks) return data;
  let removed = false;
  for (const kfs of Object.values(tracks)) {
    const at = kfs.findIndex((k) => Math.abs(k.time - time) < EPS);
    if (at !== -1) {
      kfs.splice(at, 1);
      removed = true;
    }
  }
  return removed ? prune(next) : data;
}
