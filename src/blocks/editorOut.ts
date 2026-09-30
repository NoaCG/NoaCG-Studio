import { getTemplateParts } from '../model/structure';
import type { SpxTemplate } from '../model/types';
import type { AnimData, AnimKeyframe, AnimStep } from './animData';
import { clone, crossesCarried, cutBars, cutTracks, EPS, holdAt, joinBars, joinCues, round, withOut, type Bar } from './animEdit';
import { resolveValue } from './animEval';
import { animationSource, documentContains, sequenceAuthoringReason } from './editorAnimation';
import { writeOutData } from '../templates/shared/animRuntime';
import { mirrorEase } from '../templates/shared/easeRuntime';

export type OutOperation = { kind: 'out.set'; time: number } | { kind: 'out.reverse' };
export const hasExitKeys = (data: AnimData) => data.steps.length > 1 && Object.values(data.steps[data.steps.length - 1].layers).some(tracks => Object.values(tracks).some(keys => keys.length));
/**
 * Move Out to `boundary`, a stored time on the last pre-Out cue's clock (docs/research/editor-r1-2a-5).
 * The exit belongs to the Out flag (owner decision 2026-09-30): it keeps its own timing from where
 * it starts, so pressing Out plays it at once, whichever way the flag moves. Later, the cue before
 * simply holds longer. Earlier into still air, that cue ends sooner. Earlier into motion the cue has
 * not finished, the cue is cut there exactly as Add Step cuts (animEdit.ts holdAt, cutTracks and
 * cutBars), the rest of its motion moves into Out at its absolute times and plays first, and the
 * exit starts the moment it ends: Out records that `carried` time, and a later move joins it back
 * into the cue first. Throws with the reason wherever the runtime could not play the result
 * exactly; `source` is not mutated. `contains(ancestor, selector)` answers from the document
 * whether a layer sits inside another.
 */
export function moveOutBoundary(source: AnimData, boundary: number, contains?: (ancestor: string, selector: string) => boolean): AnimData {
  if (!Number.isFinite(boundary) || boundary < 0) throw new Error('Out needs a finite nonnegative playhead time.');
  let data = withOut(clone(source));
  const at = data.steps.length - 2, b = round(boundary);
  // An exit with neither keys nor bars is an instant cut.
  const settle = () => {
    const exit = data.steps[at + 1];
    if (!hasExitKeys(data) && !Object.keys(exit.spans ?? {}).length) { exit.duration = 0; delete exit.carried; }
    return data;
  };
  if (Math.abs(data.steps[at].duration - b) < EPS) return settle();
  const rejoined = rejoinCarried(data, contains), ended = rejoined.ended;
  data = rejoined.data;
  const before = data.steps[at], end = before.duration;
  for (const [selector, tracks] of Object.entries(before.layers)) for (const [prop, keys] of Object.entries(tracks)) {
    // The runtime plays keys past a cue's end beyond it, so no boundary splits or ends that cue exactly.
    if (keys.some(key => key.time > end + EPS)) throw new Error(`${selector} ${prop} has keys after the end of its cue, so Out cannot cross them exactly. Its source is preserved.`);
  }
  // A bar reaching the cue's end goes on into the exit, unless it ended within rejoined carried
  // motion, where the flag never was: there its end stays where the ruler showed it.
  const reaches = (selector: string, spans: Bar[]) => !ended.has(selector) && spans.some(span => Math.abs(span.end - end) < EPS);
  if (b >= end - EPS) {
    // Later: the graphic holds longer. What was on screen at the old hold stays on until the new one.
    // A bar that ended with rejoined carried motion ends on this very hold when Out lands where it
    // ended: the hold shows it (its arriving side), so Out hides it from the press, as in still air.
    for (const [selector, spans] of Object.entries(before.spans ?? {})) {
      if (reaches(selector, spans)) {
        for (const span of spans) if (Math.abs(span.end - end) < EPS) span.end = b;
      } else if (b < end + EPS && spans.some(span => Math.abs(span.end - end) < EPS)) data.steps[at + 1].spans = { ...data.steps[at + 1].spans, [selector]: [] };
    }
    before.duration = b;
    return settle();
  }
  const exitBars = data.steps[at + 1].spans, length = data.steps[at + 1].duration;
  // How long the rest of the cue's unfinished motion lasts: nothing, into still air.
  const carry = round(Math.max(0, motionEnd(before) - b));
  const hidden = carry > 0 && (before.hides ?? []).find(selector => before.spans?.[selector] === undefined);
  if (hidden) throw new Error(`${hidden} leaves at the end of this cue (a legacy hide). Moving Out earlier would move that exit. Its source is preserved.`);
  const barsBefore = structuredClone(before.spans ?? {});
  const { data: cut, crossed } = holdAt(data, at, b, 'Set Out', { owned: true, flat: false });
  data = cut;
  const cue = data.steps[at], exit = data.steps[at + 1];
  const tails = cutTracks(data, at, b, crossed, { explicit: exit.ease !== cue.ease }), tailBars = cutBars(data, at, b);
  // The exit starts where the carried motion ends, keeping its own timing from there.
  const shift = (span: Bar) => ({ start: round(span.start + carry), end: round(span.end + carry) });
  for (const tracks of Object.values(exit.layers)) for (const keys of Object.values(tracks)) keys.forEach(key => { key.time = round(key.time + carry); });
  const leaving = new Set<string>();
  for (const [selector, prop] of crossed) {
    // Keys after the motion's end only repeat its last value, and a track without motion carries nothing.
    const moved = tails[selector][prop].filter(key => key.time <= carry + EPS), kept = cue.layers[selector][prop], holding = kept[kept.length - 1].value;
    if (!moved.some(key => key.value !== holding)) continue;
    leaving.add(selector);
    const layer = exit.layers[selector] ??= {}, later = layer[prop] ?? [], first = later[0], last = moved[moved.length - 1];
    if (first) {
      // Out starts its own track with a set: a different value there is a jump the move cannot keep.
      if (first.value !== last.value) throw new Error(`${selector} ${prop} jumps where Out starts. Moving Out across the entrance would turn that jump into motion. Its source is preserved.`);
      if (first.time < last.time + EPS) later.shift();
    }
    layer[prop] = [...moved, ...later];
  }
  // Bars keep their absolute times over the carried motion, and the exit's keep theirs from its
  // start. The part of a bar that only covered the stillness removed goes.
  const bars: Record<string, Bar[]> = {};
  for (const [selector, spans] of Object.entries(barsBefore)) {
    const tail = tailBars[selector] ?? [];
    if (!spans.some(span => span.start < b && span.end >= b)) {
      if (tail.length) throw new Error(`${selector} is hidden at this Out and visible after it, and Out never reveals a hidden layer. Its source is preserved.`);
      continue;
    }
    const carried = joinBars(tail.filter(span => span.start < carry - EPS).map(span => ({ start: span.start, end: round(Math.min(span.end, carry)) })));
    if (carried.length) leaving.add(selector);
    const own = exitBars?.[selector];
    if (!reaches(selector, spans)) bars[selector] = carried;
    else if (own) bars[selector] = joinBars([...carried, ...own.map(shift)]);
    // Visible at the press and on through the carried motion, the layer needs no Out bars of its own.
    else if (carried.length && !(carried.length === 1 && carried[0].start === 0 && carried[0].end === carry)) bars[selector] = joinBars([...carried, ...length > 0 ? [{ start: carry, end: round(carry + length) }] : []]);
  }
  for (const [selector, spans] of Object.entries(exitBars ?? {})) {
    if (bars[selector]) continue;
    // Without bars on this cue the layer kept its visibility over what is now carried into Out.
    bars[selector] = joinBars([...(carry > 0 && barsBefore[selector] === undefined && held(data, selector) ? [{ start: 0, end: carry }] : []), ...spans.map(shift)]);
  }
  if (exitBars || Object.keys(bars).length) exit.spans = bars;
  exit.duration = round(length + carry);
  if (carry > 0) exit.carried = carry; else delete exit.carried;
  cue.duration = b;
  // Out animates only layers visible as it starts (noacgExitVisible walks every parent), so what
  // moved into it must not sit in a layer hidden there, by its bars or by autoAlpha.
  const shut = (selector: string) => resolveValue(data, selector, 'autoAlpha', at, b) === 0;
  const selectors = [...new Set(data.steps.flatMap(step => [...Object.keys(step.layers), ...Object.keys(step.spans ?? {})]))];
  for (const selector of leaving) {
    if (!held(data, selector)) continue; // Hidden by its own bars: its motion was never seen.
    if (shut(selector)) throw new Error(`${selector} is hidden by autoAlpha at this Out, and Out skips hidden layers, so the rest of its motion would not play. Its source is preserved.`);
    const parent = contains && selectors.find(other => other !== selector && (shut(other) || !held(data, other)) && contains(other, selector));
    if (parent) throw new Error(`${selector} sits inside ${parent}, which is hidden at this Out, and Out skips layers inside a hidden one, so the rest of its motion would not play. Its source is preserved.`);
  }
  return settle();
}

/** Where a cue's motion ends: its latest key that changes a value while its layer's bars show it,
 *  bar edge inside it, or legacy hide (at its end). Anything after is still air. */
function motionEnd(cue: AnimStep) {
  let end = 0;
  for (const [selector, tracks] of Object.entries(cue.layers)) for (const keys of Object.values(tracks)) {
    const bars = cue.spans?.[selector], seen = (from: number, to: number) => !bars || bars.some(bar => bar.start < to && bar.end > from);
    keys.forEach((key, i) => { if (i > 0 && key.value !== keys[i - 1].value && seen(keys[i - 1].time, key.time)) end = Math.max(end, key.time); });
  }
  for (const spans of Object.values(cue.spans ?? {})) for (const span of spans) for (const edge of [span.start, span.end]) {
    if (edge > EPS && edge < cue.duration - EPS) end = Math.max(end, edge);
  }
  if (cue.hides?.some(selector => cue.spans?.[selector] === undefined)) end = cue.duration;
  return end;
}

/**
 * Join Out's carried motion back into the cue before it, the exit back to Out's start: Out's first
 * `carried` seconds become a cue of their own, joined as a Step's would be (animEdit.ts joinCues),
 * which also rejoins the curves the cut split. Returns the layers whose visibility ended within the
 * carried motion, whose Out bars came from it alone. Throws where a track moves across the carried
 * time's end, which no longer tells the carried motion from the exit.
 */
function rejoinCarried(data: AnimData, contains?: (ancestor: string, selector: string) => boolean) {
  const out = data.steps.length - 1, exit = data.steps[out], carried = Math.min(exit.carried ?? 0, exit.duration), ended = new Set<string>();
  if (!carried) { delete exit.carried; return { data, ended }; }
  const head: AnimStep = { name: exit.name, duration: carried, ease: exit.ease, layers: {} };
  const rest: AnimStep = { ...exit, duration: round(exit.duration - carried), layers: {} };
  delete rest.carried;
  for (const [selector, tracks] of Object.entries(exit.layers)) for (const [prop, keys] of Object.entries(tracks)) {
    const below = keys.filter(key => key.time < carried - EPS), above = keys.filter(key => key.time > carried + EPS);
    const at = keys.filter(key => Math.abs(key.time - carried) < EPS), on = at[0], last = below[below.length - 1];
    if (at.length > 1 || crossesCarried(keys, carried)) {
      throw new Error(`${selector} ${prop} moves across the end of the motion Out carries, so Set Out cannot tell that motion from the exit. Its source is preserved.`);
    }
    // A key on the carried time's end ends the carried motion when it changes a value there. The exit
    // starts from it too when it moves on from there at once; when the exit holds that value first,
    // it starts after its beat, at its own first key (as the interpreter reads it).
    const ends = !!on && !!last && on.value !== last.value;
    const headKeys = ends ? [...below, on!] : below;
    const starts = on && (!ends || above.length && above[0].value !== on.value);
    const restKeys = [...starts ? [ends ? { time: 0, value: on.value } : { ...on, time: 0 }] : [], ...above.map(key => ({ ...key, time: round(key.time - carried) }))];
    if (headKeys.length) (head.layers[selector] ??= {})[prop] = headKeys;
    if (restKeys.length) (rest.layers[selector] ??= {})[prop] = restKeys;
  }
  if (exit.spans) {
    head.spans = {}; rest.spans = {};
    for (const [selector, spans] of Object.entries(exit.spans)) {
      const shown = spans.filter(span => span.start < carried - EPS).map(span => ({ start: span.start, end: round(Math.min(span.end, carried)) }));
      // A layer the cue before leaves hidden without bars of its own needs none over the carried time.
      if (shown.length || data.steps[out - 1].spans?.[selector] !== undefined || held(data, selector)) head.spans[selector] = shown;
      const after = spans.filter(span => span.end > carried + EPS).map(span => ({ start: round(Math.max(span.start, carried) - carried), end: round(span.end - carried) }));
      if (after.length || !head.spans[selector]?.length) rest.spans[selector] = after; else ended.add(selector);
    }
    if (!Object.keys(rest.spans).length) delete rest.spans;
  }
  const joined = joinCues({ ...data, steps: [...data.steps.slice(0, out), head, rest] }, out - 1, contains);
  // The cues are where they were, so each keeps its name (a join renumbers default Step names).
  joined.steps.forEach((step, i) => { step.name = data.steps[i].name; });
  return { data: joined, ended };
}
const lastTime = (data: AnimData['steps'][number]) => Math.max(0, ...Object.values(data.layers).flatMap(tracks => Object.values(tracks).flatMap(keys => keys.map(key => key.time))));
function held(data: AnimData, selector: string) {
  let visible = !data.steps.slice(1, -1).some(step => step.reveals?.includes(selector));
  for (const step of data.steps.slice(0, -1)) {
    if (step.reveals?.includes(selector)) visible = true;
    if (step.spans?.[selector]) visible = step.spans[selector].some(span => span.start <= step.duration && span.end === step.duration);
    else if (step.hides?.includes(selector)) visible = false;
  }
  return visible;
}

export function applyOut(template: SpxTemplate, operation: OutOperation): SpxTemplate {
  let data = animationSource(template);
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  if (operation.kind === 'out.set') {
    if (!Number.isFinite(operation.time) || operation.time < 0) throw new Error('Out needs a finite nonnegative playhead time.');
    const prefix = data.steps.slice(0, -2).reduce((sum, step) => sum + step.duration, 0);
    const boundary = Math.round(operation.time * template.fps) / template.fps * data.speed - prefix;
    // Out stays at least a frame after the last Step's flag, stored at 3 decimals: flags never stack.
    const step = data.steps.length > 2 ? data.steps[data.steps.length - 2].name : null;
    if (boundary < 0 || boundary < data.speed / template.fps - 2 * EPS && (step || getTemplateParts(template.html, template.fields).some(part => part.kind !== 'root'))) {
      throw new Error(step ? `Keep Out at least one frame after ${step}. Its source is preserved.` : 'Keep at least one frame in a nonempty cue.');
    }
    data = moveOutBoundary(data, boundary, documentContains(template.html));
  } else {
    withOut(data);
    const exit = data.steps[data.steps.length - 1];
    if (hasExitKeys(data)) throw new Error('Out already has keys. Preserve them; regeneration requires an explicit replacement.');
    if (Object.keys(exit.spans ?? {}).length || exit.reveals?.length || exit.hides?.length) throw new Error('Out has authored visibility. Use manual Out to preserve it.');
    const entrances = data.steps.slice(0, -1);
    const selectors = new Set(entrances.flatMap(step => Object.keys(step.layers)));
    exit.layers = {};
    exit.duration = 0;
    for (const selector of selectors) {
      if (!held(data, selector)) continue;
      const entry = entrances.find(step => Object.values(step.layers[selector] ?? {}).some(keys => keys.length > 1));
      if (!entry) continue; // Static layers clear with the root at the exit endpoint.
      const end = entrances.length === 1 ? entry.duration : lastTime(entry);
      const tracks: Record<string, AnimKeyframe[]> = {};
      for (const [property, keys] of Object.entries(entry.layers[selector])) {
        if (!keys.length) continue;
        if (!['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'].includes(property) || keys.some(key => typeof key.value !== 'number')) throw new Error('This entrance has unsupported property motion. Use manual Out; source is preserved.');
        const latest = entrances.flatMap(step => step.layers[selector]?.[property] ?? []).slice(-1)[0];
        if (latest?.value !== keys.slice(-1)[0]!.value) throw new Error('A later cue changed this entrance pose. Its reverse path needs explicit rebasing. Use manual Out.');
        tracks[property] = [...keys].reverse().map((key, i) => ({ time: end - key.time, value: key.value,
          ...(i ? { ease: mirrorEase(keys[keys.length - i].ease || entry.ease) } : {}) }));
      }
      exit.layers[selector] = tracks;
      exit.duration = Math.max(exit.duration, end);
    }
    // The held visibility remains in force through exit. Do not replay In's gates.
    delete exit.spans;
  }
  const js = writeOutData(template.js, data);
  if (js === null) throw new Error('This interpreter has custom source. Out cannot upgrade it safely; source is preserved.');
  return { ...template, js };
}
