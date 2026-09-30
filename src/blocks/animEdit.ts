// Timeline v2 Phase 4 — pure keyframe mutators over the animation data model. Every
// editing surface (Inspector diamonds, timeline diamond drags, Delete) routes through
// these: mutate a copy of the parsed data, then spliceAnimData + one applyTemplate makes
// the edit real, undoable code. Times are on the step's SPEED-RELATIVE clock (the stored
// numbers), rounded to the same 3 decimals the serializer writes.

import type { AnimData, AnimKeyframe, AnimLayerTracks, AnimStep } from './animData';
import { BOUNDED_RANGES, resolveValue } from './animEval';
import {
  arrivingPoint,
  departingPoint,
  departsOnItsOwn,
  EASY_ARRIVAL,
  EASY_DEPARTURE,
  easeCurve,
  joinPoints,
  LINEAR_ARRIVAL,
  LINEAR_DEPARTURE,
  parseEase,
  SAME_VALUE,
  sliceEase,
  type SidePoint,
} from '../templates/shared/easeRuntime';
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
export const EPS = 0.0005;
/** The shortest segment, in seconds of played time, whose Hold or jump every player lands on its
 *  key: GSAP rounds timeline times to 1e-7 s and a hold jumps in the last 1e-5 of its segment. */
export const HOLD_SHORTEST = 0.01;
export const round = (n: number) => Math.round(n * 1000) / 1000;

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
  if (data.steps.some(cue => cue.spans?.[selector] === undefined && cue.hides?.includes(selector))) {
    throw new Error('This legacy layer hides at a cue endpoint. Moving it cannot preserve that held pose yet; no keys or spans changed.');
  }
  explicitBars(next, selector);
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
  explicitBars(next, selector);
  next.steps[index].spans![selector][interval] = changed;
  return next;
}

/** Give a layer explicit bars in every cue (of the first `cues`) that has none, showing it exactly
 *  where its legacy reveal and hide did: an edited layer spanning cues writes its intervals in each (D04). */
function explicitBars(data: AnimData, selector: string, cues = data.steps.length) {
  const reveal = data.steps.findIndex((s, i) => i > 0 && s.reveals?.includes(selector));
  const hide = data.steps.findIndex(s => s.hides?.includes(selector));
  data.steps.forEach((cue, i) => {
    if (i >= cues || cue.spans?.[selector] !== undefined) return;
    cue.spans = { ...cue.spans, [selector]: (cue.duration === 0 || reveal >= 0 && i < reveal || hide >= 0 && i > hide) ? [] : [{ start: 0, end: cue.duration }] };
  });
}

export function clone(data: AnimData): AnimData {
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
 * serializer's 3 decimals, so a split is exact to one stored unit and refused where that rounding
 * would move the curve further. Anything without an exact form throws with the reason; `data` is never
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
  // An Out that interrupts the entrance tweens straight to the last exit key with THAT key's ease
  // (noacgBuildExit), so rewriting it would change the interrupted exit.
  if (stepIndex > 0 && stepIndex === data.steps.length - 1 && at === keys.length - 1) {
    throw new Error('The last exit segment also shapes an interrupted Out, so it is not split. Its source is preserved.');
  }
  const next = clone(data), edited = next.steps[stepIndex].layers[selector][prop];
  const destination = edited[track.indexOf(to)], kind = parseEase(ease)?.kind;
  // A flat segment is constant under any ease, so its split is exact whatever the curve. A hold keeps
  // the departing value until its key and a jump takes the arriving one at once: each half is flat
  // but for that one instant, so both halves keep the form. The instant sits 1e-5 of its own half
  // from the key, so it moves by at most 1e-5 of the other half, under the stored 1 ms for any
  // segment shorter than 100 s.
  if (from.value !== to.value && (kind === 'hold' ? to.time - t : kind === 'jump' ? t - from.time : Infinity) / data.speed < HOLD_SHORTEST) {
    throw new Error(`The part of this ${kind} that jumps would last under ${HOLD_SHORTEST * 1000} ms, too short for every player to land on its key. Its source is preserved.`);
  }
  if (from.value === to.value || kind === 'hold' || kind === 'jump') {
    edited.push({ time: t, value: kind === 'jump' ? to.value : from.value, ease });
  } else {
    const curve = easeCurve(ease);
    if (!curve || parseEase(ease)?.kind === 'steps') throw new Error(`The ease "${ease}" has no exact split form yet. Its source is preserved.`);
    const s = (t - from.time) / (to.time - from.time), progress = curve(s);
    if (!(Math.abs(progress) >= 1e-9 && Math.abs(1 - progress) >= 1e-9)) throw new Error(SAME_VALUE);
    const exact = from.value + (to.value - from.value) * progress, value = round(exact), range = BOUNDED_RANGES[prop];
    if (range && (value < range[0] || value > range[1])) {
      throw new Error('At that moment the curve is outside the range this property can show, so no key can hold the split value. Its source is preserved.');
    }
    // Storing `value` instead of `exact` moves the left half by (value - exact) * E(x) / E(s) and
    // the right half by (value - exact) * (1 - E(x)) / (1 - E(s)). Where the curve rescales by a
    // tiny span that amplifies the rounding past one stored unit, so the split is refused.
    let reach = 0;
    for (let i = 1; i <= 4000; i++) {
      reach = Math.max(reach, Math.abs(curve(s * i / 4000) / progress), Math.abs((1 - curve(s + (1 - s) * i / 4000)) / (1 - progress)));
    }
    if (!(Math.abs(value - exact) * reach <= 0.001)) throw new Error('This split cannot be stored exactly at the saved precision. Its source is preserved.');
    edited.push({ time: t, value, ease: sliceEase(ease, 0, s) });
    destination.ease = sliceEase(ease, s, 1);
  }
  edited.sort((a, b) => a.time - b.time);
  return next;
}

// ── R1.2a.4: flags between cues (docs/research/editor-r1-2a-4) ──────────────
// A flag is the boundary between two cues on the concatenated ruler. Adding, removing or moving
// one repartitions keys and visibility bars between the cues at their absolute times; it never
// retimes them. Set Out (editorOut.ts) cuts its cue with the same pieces.

type Bar = { start: number; end: number };
/** Bars that touch become one. */
export const joinBars = (bars: Bar[]) => bars.reduce<Bar[]>((joined, bar) => {
  const previous = joined[joined.length - 1];
  if (previous && previous.end === bar.start) previous.end = bar.end; else joined.push(bar);
  return joined;
}, []);
/** The first track of a cue with keys stored past its end, which the runtime plays beyond it, so
 *  no flag splits or joins that cue exactly. */
export function pastEnd(step: AnimStep): string | null {
  for (const [selector, tracks] of Object.entries(step.layers)) for (const [prop, keys] of Object.entries(tracks)) {
    if (keys.some(key => key.time > step.duration + EPS)) return `${selector} ${prop}`;
  }
  return null;
}

/** Whether a layer shows anywhere in cue `at`: by its bars there, else by what it carried in. */
function showsIn(data: AnimData, selector: string, at: number) {
  const bars = data.steps[at].spans?.[selector];
  if (bars) return bars.some(bar => bar.end > bar.start);
  let visible = !data.steps.slice(1, -1).some(step => step.reveals?.includes(selector));
  for (const step of data.steps.slice(0, at)) {
    if (step.reveals?.includes(selector)) visible = true;
    if (step.spans?.[selector]) visible = step.spans[selector].some(span => span.end === step.duration);
    else if (step.hides?.includes(selector)) visible = false;
  }
  return visible || !!data.steps[at].reveals?.includes(selector);
}
/** What an unkeyed transform shows: GSAP's own identity, under the design's base values. Other
 *  properties show the design's value, which the data does not know. */
const IDENTITY: Record<string, number> = { x: 0, y: 0, xPercent: 0, yPercent: 0, rotation: 0, scale: 1, scaleX: 1, scaleY: 1 };
/** Whether a track already shows `value` as cue `at` starts, before any key of its own there: what
 *  earlier cues left it at, else its identity. A layer hidden through the cue shows nothing. */
function startsAt(data: AnimData, selector: string, prop: string, at: number, value: number | string) {
  if (!showsIn(data, selector, at)) return true;
  const carried = at > 0 ? resolveValue(data, selector, prop, at - 1, data.steps[at - 1].duration) : null;
  return carried === null ? IDENTITY[prop] === value : carried === value;
}

/** How a crossed track meets a cut: a key already there, a split of the segment through it, a
 *  flat segment that needs no key, or (before its first key) a key holding that first value. */
export type CutKind = 'existing' | 'split' | 'flat' | 'before';
/**
 * Every track of cue `at` with a key after stored time `b` holds a key at b: the one there, an
 * exact split (splitKeyframeSegment), or, before its first key, one holding that first value,
 * which the runtime applies from the cue start. With `flat: false` a flat segment gets no key: the
 * cue holds its value anyway. Returns a copy, the crossed tracks and how each met b; throws naming
 * the track where the split is not exact.
 */
export function holdAt(source: AnimData, at: number, b: number, verb: string, { flat = true } = {}) {
  let data = clone(source);
  const crossed: [string, string][] = [], kinds = new Map<string, CutKind>();
  for (const [selector, tracks] of Object.entries(data.steps[at].layers)) for (const [prop, keys] of Object.entries(tracks)) {
    if (keys.some(key => key.time > b + EPS)) crossed.push([selector, prop]);
  }
  for (const [selector, prop] of crossed) {
    const keys = data.steps[at].layers[selector][prop], id = selector + '\n' + prop, next = keys.findIndex(key => key.time > b);
    if (keys.some(key => Math.abs(key.time - b) < EPS)) { kinds.set(id, 'existing'); continue; }
    if (next === 0) { keys.unshift({ time: b, value: keys[0].value }); kinds.set(id, 'before'); continue; }
    if (!flat && keys[next - 1].value === keys[next].value) { kinds.set(id, 'flat'); continue; }
    try { data = splitKeyframeSegment(data, at, selector, prop, b); }
    catch (error) {
      if (error instanceof Error) error.message = `${verb} here would split ${selector} ${prop}. ${error.message}`;
      throw error;
    }
    kinds.set(id, 'split');
  }
  return { data, crossed, kinds };
}

/**
 * Cut the crossed tracks of cue `at` (after holdAt) at `b`: the cue keeps its keys up to b and the
 * rest is returned on the next cue's clock, after a copy of the value at b at time 0. Moved keys
 * keep their own eases unless `explicit`, when each says what it relied on.
 *
 * With `kinds` (a Step's cut) the next cue starts only where it must, so joining the two cues gives
 * back exactly what was there: a flat segment or a key holding a first value needs no copy (the
 * next key holds its value back to the start), and a key already at b that only holds the value
 * before it moves out of the cut cue, which holds that value anyway, taking its ease along.
 */
export function cutTracks(data: AnimData, at: number, b: number, crossed: [string, string][], { explicit = false, kinds }: { explicit?: boolean; kinds?: Map<string, CutKind> } = {}) {
  const cue = data.steps[at], tail: Record<string, AnimLayerTracks> = {};
  for (const [selector, prop] of crossed) {
    const keys = cue.layers[selector][prop], kind = kinds?.get(selector + '\n' + prop);
    const kept = keys.filter(key => key.time < b + EPS), held = kept[kept.length - 1];
    const copy: AnimKeyframe[] = kind === 'flat' || kind === 'before' ? [] : [{ time: 0, value: held.value }];
    const needless = kept.length > 1 ? kept[kept.length - 2].value === held.value : startsAt(data, selector, prop, at, held.value);
    if ((kind === 'existing' || kind === 'before') && needless) {
      kept.pop();
      if (held.ease) copy[0].ease = held.ease;
    }
    if (kept.length) cue.layers[selector][prop] = kept;
    else if (delete cue.layers[selector][prop] && !Object.keys(cue.layers[selector]).length) delete cue.layers[selector];
    (tail[selector] ??= {})[prop] = [...copy, ...keys.filter(key => key.time >= b + EPS).map(key => {
      const ease = explicit ? key.ease || cue.ease : key.ease;
      return { time: round(key.time - b), value: key.value, ...(ease ? { ease } : {}) };
    })];
  }
  return tail;
}

/** Clip the bars of cue `at` at `b`, returning what lies after it on the next clock: every layer
 *  with bars in the cue gets a list there, empty where nothing crosses. */
export function cutBars(data: AnimData, at: number, b: number) {
  const cue = data.steps[at], tail: Record<string, Bar[]> = {};
  for (const [selector, spans] of Object.entries(cue.spans ?? {})) {
    tail[selector] = spans.filter(span => span.end > b).map(span => ({ start: round(Math.max(span.start, b) - b), end: round(span.end - b) }));
    cue.spans![selector] = spans.filter(span => span.start < b).map(span => ({ start: span.start, end: Math.min(span.end, b) }));
  }
  return tail;
}

const FLOWING = 'Steps cannot yet cut or join a cue with calls, measured motion or loops. Its source is preserved.';
/**
 * Add a flag at stored time `b` of pre-Out cue `at`: the cue ends there and a new cue plays the
 * rest, every key and bar at its absolute time. The new cue is named by its position (or `name`)
 * with the cut cue's default ease (or `ease`). `minimum` is one frame in stored seconds. Throws
 * with the reason where the cut is not exact; `source` is never mutated.
 */
export function splitCue(source: AnimData, at: number, b: number, minimum: number, { name, ease }: { name?: string; ease?: string } = {}): AnimData {
  const cue = source.steps[at];
  b = round(b);
  if (!cue || at >= source.steps.length - 1 || !Number.isFinite(b)) throw new Error('Put the playhead inside a cue before Out to add a Step.');
  if (b < EPS || b > cue.duration - EPS) throw new Error('A flag is already at this frame. Put the playhead between flags to add a Step there.');
  if (b < minimum - EPS || cue.duration - b < minimum - EPS) throw new Error('A Step needs at least one frame on each side of its flag. Its source is preserved.');
  if (cue.calls?.length || cue.dynamics?.length || Object.keys(cue.loops ?? {}).length) throw new Error(FLOWING);
  const late = pastEnd(cue);
  if (late) throw new Error(`${late} has keys after the end of its cue, so no flag splits it exactly. Its source is preserved.`);
  const { data, crossed, kinds } = holdAt(source, at, b, 'A Step', { flat: false });
  const into = ease ?? cue.ease, cut = data.steps[at];
  // Bars first: whether a layer shows before the flag decides which keys the cut cue still needs.
  const bars = cut.spans ? cutBars(data, at, b) : undefined;
  const step: AnimStep = { name: name ?? `Step ${at + 2}`, duration: round(cue.duration - b), ease: into,
    layers: cutTracks(data, at, b, crossed, { explicit: into !== cue.ease, kinds }) };
  if (bars) step.spans = bars;
  // A legacy hide takes its layer off at the cue's end, which is now the new cue's end.
  if (cut.hides?.length) { step.hides = cut.hides; delete cut.hides; }
  cut.duration = b;
  insertStepAt(data, at + 1, step);
  renumberSteps(data);
  syncWaypointNames(data);
  return data;
}

/**
 * The inverse of a Step's cut at `b`: drop the key a split wrote there, which carries the ease the
 * split gave it (a slice of the curve, or the Hold or jump it halved), where the curve through it
 * is one curve again. A key without its own ease was already there and stays.
 */
function unsplitAt(keys: AnimKeyframe[], b: number, fallback: string) {
  const at = keys.findIndex(key => Math.abs(key.time - b) < EPS), key = keys[at], before = keys[at - 1], after = keys[at + 1];
  if (!key?.ease || !before || !after) return;
  const own = parseEase(key.ease)?.kind, next = parseEase(after.ease || fallback)?.kind;
  if (own === 'hold' && next === 'hold' && before.value === key.value || own === 'jump' && next === 'jump' && key.value === after.value) { keys.splice(at, 1); return; }
  if (typeof before.value !== 'number' || typeof key.value !== 'number' || typeof after.value !== 'number') return;
  const part = (text: string) => {
    const e = parseEase(text);
    if (!e || e.kind === 'hold' || e.kind === 'jump' || e.kind === 'steps') return null;
    const base = e.kind === 'slice' ? e.base : e;
    return { base: base.text, from: e.kind === 'slice' ? e.from : 0, to: e.kind === 'slice' ? e.to : 1, sliced: e.kind === 'slice',
      straight: base.kind === 'none' || base.kind === 'family' && (base.name === 'linear' || base.name === 'power0') };
  };
  const left = part(key.ease), right = part(after.ease || fallback), s = (key.time - before.time) / (after.time - before.time);
  if (!left || !right || left.base !== right.base || left.straight !== right.straight || !left.straight && !(left.sliced && right.sliced)) return;
  let whole = after.ease || fallback, progress = s;
  if (!left.straight) {
    const curve = easeCurve(left.base)!, span = curve(right.to) - curve(left.from);
    if (Math.abs(left.to - right.from) > 1e-9 || Math.abs((left.to - left.from) / (right.to - left.from) - s) > 1e-6 || !(Math.abs(span) >= 1e-9)) return;
    progress = (curve(left.to) - curve(left.from)) / span;
    try { whole = sliceEase(left.base, left.from, right.to); } catch { return; }
  }
  if (!(Math.abs(key.value - (before.value + (after.value - before.value) * progress)) <= 0.001 + 1e-9)) return;
  keys.splice(at, 1);
  if (whole === fallback) delete after.ease; else after.ease = whole;
}

/**
 * Remove the flag between cue `at` and the next, a Step: its keys and bars join `at` at their
 * absolute times, and what the join makes redundant at the old flag goes, so a split and a join
 * give back the source. A layer the later cue reveals through older source first gets explicit
 * bars. Throws with the reason where one cue could not play what the two did; `source` is never
 * mutated. `contains(ancestor, selector)` answers from the document whether a layer sits inside another.
 */
export function joinCues(source: AnimData, at: number, contains?: (ancestor: string, selector: string) => boolean): AnimData {
  const first = source.steps[at], second = source.steps[at + 1];
  if (!first || !second || at + 1 >= source.steps.length - 1) throw new Error('Only a Step flag can be removed. Its source is preserved.');
  for (const cue of [first, second]) {
    if (cue.calls?.length || cue.dynamics?.length || Object.keys(cue.loops ?? {}).length) throw new Error(FLOWING);
    const late = pastEnd(cue);
    if (late) throw new Error(`${late} has keys after the end of its cue, so joining it cannot keep their timing. Its source is preserved.`);
  }
  const data = clone(source), a = data.steps[at], b = a.duration;
  // A legacy hide takes its layer off at its cue's end: the earlier one's would move later.
  for (const selector of first.hides ?? []) if (first.spans?.[selector] === undefined) {
    throw new Error(`${selector} leaves at the end of ${at ? first.name : 'In'} through older source, and joining the cues would make it leave later. Its source is preserved.`);
  }
  for (const selector of second.hides ?? []) if (second.spans?.[selector] === undefined && first.spans?.[selector] !== undefined) {
    throw new Error(`${selector} leaves at the end of ${second.name} through older source but has bars before it, so the joined cue could not keep both. Its source is preserved.`);
  }
  // A layer the later cue reveals through older source appears at its flag: explicit bars keep it there.
  const pre = data.steps.length - 1;
  for (const selector of second.reveals ?? []) {
    if (data.steps.slice(0, pre).every(step => step.spans?.[selector] !== undefined)) continue;
    if (data.steps.some(step => step.hides?.includes(selector))) throw new Error(`${selector} appears and leaves through older source, so its timing cannot be made explicit. Its source is preserved.`);
    if (!Object.entries(second.layers[selector] ?? {}).some(([prop, keys]) => prop !== 'transformOrigin' && keys.length)) {
      throw new Error(`${selector} appears with ${second.name} through older source without its own keys there, which keeps it hidden on air, so it cannot be given bars. Its source is preserved.`);
    }
    explicitBars(data, selector, pre);
  }
  const c = data.steps[at + 1], shift = (time: number) => round(time + b);
  for (const [selector, tracks] of Object.entries(c.layers)) for (const [prop, keys] of Object.entries(tracks)) {
    if (!keys.length) continue;
    const own = a.layers[selector]?.[prop] ?? [], start = keys[0].value;
    // One cue has no instant jump at the old flag.
    if (own.length && resolveValue(data, selector, prop, at, b) !== start) {
      throw new Error(`${selector} ${prop} jumps at the flag of ${c.name}, from ${resolveValue(data, selector, prop, at, b)} to ${start}, so one cue cannot play it. Its source is preserved.`);
    }
    const moved = keys.map((key, i) => {
      const ease = i && c.ease !== a.ease ? key.ease || c.ease : key.ease;
      return { time: shift(key.time), value: key.value, ...(ease ? { ease } : {}) };
    });
    // The next cue's copy of the value at the flag, or a key only holding a first value from the start.
    let kept = own;
    if (own.length && Math.abs(own[own.length - 1].time - b) < EPS && moved[0].time === b) moved.shift();
    else if (own.length === 1 && Math.abs(own[0].time - b) < EPS && !own[0].ease && moved[0].value === own[0].value) kept = [];
    // A track that begins with the later cue joins where the earlier cue already showed its value.
    if (!own.length && !startsAt(data, selector, prop, at, start)) {
      throw new Error(`${selector} ${prop} jumps at the flag of ${c.name}, from ${resolveValue(data, selector, prop, at, b) ?? 'its design value'} to ${start}, so one cue cannot play it. Its source is preserved.`);
    }
    const joined = [...kept, ...moved];
    unsplitAt(joined, b, a.ease);
    (a.layers[selector] ??= {})[prop] = joined;
  }
  for (const selector of new Set([...Object.keys(a.spans ?? {}), ...Object.keys(c.spans ?? {})])) {
    const before = a.spans?.[selector] ?? (showsIn(data, selector, at) ? [{ start: 0, end: b }] : []);
    const after = c.spans?.[selector] ?? (before.some(bar => bar.end === b) ? [{ start: 0, end: c.duration }] : []);
    a.spans = { ...a.spans, [selector]: joinBars([...before.map(bar => ({ ...bar })), ...after.map(bar => ({ start: shift(bar.start), end: shift(bar.end) }))]) };
  }
  if (c.hides?.length) a.hides = [...new Set([...a.hides ?? [], ...c.hides])];
  // A reveal marker sits on the cue its layer first shows in; In has none. Only the root's hide at
  // the end of Out then clears the layer, so it must sit inside the root.
  for (const selector of c.reveals ?? []) {
    if (at > 0) { a.reveals = [...new Set([...a.reveals ?? [], selector])]; continue; }
    if (!contains?.(data.root, selector)) throw new Error(`${selector} appears with ${c.name} outside the graphic's root, and only that step's reveal clears it at Out. Its source is preserved.`);
  }
  a.duration = round(b + c.duration);
  removeStepAt(data, at + 1);
  renumberSteps(data);
  syncWaypointNames(data);
  return data;
}

/**
 * Move the flag where Step `step` begins to stored time `b` on the previous cue's clock: the two
 * cues join and split again there, the moved Step keeping its name and default ease, every key and
 * bar at its absolute time. Flags stay ordered, at least `minimum` (one frame) apart.
 */
export function moveStepFlag(source: AnimData, step: number, b: number, minimum: number, contains?: (ancestor: string, selector: string) => boolean): AnimData {
  const last = source.steps.length - 1;
  if (step <= 0) throw new Error('In always starts at zero. Its source is preserved.');
  if (step >= last) throw new Error('Out moves with Set Out at playhead. Its source is preserved.');
  const before = source.steps[step - 1], cue = source.steps[step];
  b = round(b);
  if (Math.abs(b - before.duration) < EPS) return source;
  if (!Number.isFinite(b) || b < minimum - EPS || before.duration + cue.duration - b < minimum - EPS) {
    throw new Error(`Keep ${cue.name} at least one frame after ${step > 1 ? before.name : 'In'} and one frame before ${step + 1 < last ? source.steps[step + 1].name : 'Out'}. Its source is preserved.`);
  }
  return splitCue(joinCues(source, step - 1, contains), step - 1, b, minimum, { name: cue.name, ease: cue.ease });
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

// ── R1.2a.2: key-side easing (docs/research/editor-r1-2a-2) ────────────────
// A key's In side arrives through the segment whose ease is stored on it; its Out side departs
// through the segment stored on the next key. Linear and the Easy Ease presets set bezier points
// and keep the other side's point exactly, or refuse; Bounce and Overshoot set the whole arriving
// segment, Hold the whole departing one.

type KeySide = SidePoint | { whole: string };
const PRESET_SIDES = {
  linear: { label: 'Linear', in: LINEAR_ARRIVAL, out: LINEAR_DEPARTURE },
  easeIn: { label: 'Easy Ease In', in: EASY_ARRIVAL },
  easeOut: { label: 'Easy Ease Out', out: EASY_DEPARTURE },
  easyEase: { label: 'Easy Ease', in: EASY_ARRIVAL, out: EASY_DEPARTURE },
  bounce: { label: 'Bounce', in: { whole: 'bounce.out' } },
  overshoot: { label: 'Overshoot', in: { whole: 'back.out(1.6)' } },
  hold: { label: 'Hold', out: { whole: 'hold' } },
} satisfies Record<string, { label: string; in?: KeySide; out?: KeySide }>;
export type KeyEasePreset = keyof typeof PRESET_SIDES;
export const KEY_EASE_PRESETS = (Object.keys(PRESET_SIDES) as KeyEasePreset[]).map(id => ({ id, label: PRESET_SIDES[id].label }));
/** One key by its cue, layer, property and stored time: editor selection, never document data. */
export interface KeyRef { step: number; selector: string; property: string; time: number }
export interface KeyEaseWrite { step: number; selector: string; property: string; index: number; ease: string }

/**
 * The eases `preset` writes on the selected keys' sides: one entry per segment whose ease changes,
 * none when every side already has it. A side with no segment (a first key's In, a last key's Out)
 * is skipped. Throws with a reason naming the key when nothing applies or any side cannot be
 * written exactly, so a batch is all or nothing; `data` is never mutated.
 */
export function planKeyEase(data: AnimData, keys: KeyRef[], preset: KeyEasePreset): KeyEaseWrite[] {
  if (!Object.prototype.hasOwnProperty.call(PRESET_SIDES, preset)) throw new Error('Choose one of the key eases. No ease changed.');
  const sides: { label: string; in?: KeySide; out?: KeySide } = PRESET_SIDES[preset];
  // Each segment by the index of the key it arrives at, with what the selection asks of each side.
  const segments = new Map<string, KeyEaseWrite & { where: string; depart?: KeySide; arrive?: KeySide }>();
  const ask = (key: KeyRef, index: number, side: 'depart' | 'arrive', value: KeySide, where: string) => {
    const id = [key.step, key.selector, key.property, index].join('\n');
    const segment = segments.get(id) ?? { step: key.step, selector: key.selector, property: key.property, index, ease: '', where };
    segment[side] = value;
    segments.set(id, segment);
  };
  for (const key of keys) {
    const step = data.steps[key.step], track = step?.layers[key.selector]?.[key.property];
    // Named as the timeline shows it: seconds on the cue's clock after speed.
    const where = `${key.selector} ${key.property} at ${round(key.time / data.speed)} s${step ? ' in ' + step.name : ''}`;
    // Two keys at one moment are an instant jump: the In side arrives at the first, the Out side
    // leaves from the last, so the empty segment between them is never written.
    const here = (k: AnimKeyframe) => Math.abs(k.time - key.time) < EPS;
    const first = track?.findIndex(here) ?? -1, last = track ? track.length - 1 - [...track].reverse().findIndex(here) : -1;
    if (!track || first < 0) throw new Error(`${where} is no longer there. Select the keys again; no ease changed.`);
    if (track.some(k => typeof k.value !== 'number')) throw new Error(`${where}: key-side easing covers numeric properties, and this track keeps its eases. No ease changed.`);
    if (step.loops?.[key.selector]?.[key.property]) throw new Error(`${where}: a looping track keeps its cycle. No ease changed.`);
    if (sides.in && first > 0) ask(key, first, 'arrive', sides.in, where);
    if (sides.out && last < track.length - 1) ask(key, last + 1, 'depart', sides.out, where);
  }
  if (!segments.size) throw new Error('Nothing to ease: a first key has no In side and a last key has no Out side. No ease changed.');
  const both = 'Select both keys of that segment and apply Linear or Easy Ease';
  const writes: KeyEaseWrite[] = [];
  for (const { where, depart, arrive, ...segment } of segments.values()) {
    const step = data.steps[segment.step], track = step.layers[segment.selector][segment.property], current = track[segment.index].ease || step.ease;
    let ease: string;
    if (arrive && !Array.isArray(arrive)) {
      if (departsOnItsOwn(current)) {
        throw new Error(`${where}: the key before it ${parseEase(current)?.kind === 'hold' ? 'holds its value until this key' : `sets its own departure (${current})`}, which ${sides.label} would replace. Set that key to Linear first. No ease changed.`);
      }
      ease = arrive.whole;
    } else if (depart && !Array.isArray(depart)) {
      // A held segment has no approach into the next key left to keep.
      const lasts = (track[segment.index].time - track[segment.index - 1].time) / data.speed;
      if (lasts < HOLD_SHORTEST) throw new Error(`${where}: the segment it would hold lasts ${round(lasts * 1000)} ms, and a Hold needs at least ${HOLD_SHORTEST * 1000} ms to land on its next key in every player. No ease changed.`);
      ease = depart.whole;
    } else {
      const from = depart ?? departingPoint(current), into = arrive ?? arrivingPoint(current);
      if (!from) throw new Error(`${where}: the key before it ${parseEase(current)?.kind === 'hold' ? 'holds its value until this key' : `sets its own departure inside a split curve (${current})`}, so there is no departure point to keep. ${both}, or change that key's Out side first. No ease changed.`);
      if (!into) throw new Error(`${where}: the segment to its next key uses ${current}, which has no exact bezier arrival to keep. ${both}, or change the next key's In side first. No ease changed.`);
      ease = joinPoints(from, into);
    }
    if (ease !== current) writes.push({ ...segment, ease });
  }
  return writes;
}

/** Apply `planKeyEase`: a copy of `data` with the selected key sides eased, or `data` itself
 *  when every side already has the preset. */
export function easeKeys(data: AnimData, keys: KeyRef[], preset: KeyEasePreset): AnimData {
  const writes = planKeyEase(data, keys, preset);
  if (!writes.length) return data;
  const next = clone(data);
  for (const write of writes) next.steps[write.step].layers[write.selector][write.property][write.index].ease = write.ease;
  return next;
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
