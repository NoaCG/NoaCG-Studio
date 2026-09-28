import { getTemplateParts } from '../model/structure';
import type { SpxTemplate } from '../model/types';
import type { AnimData, AnimKeyframe } from './animData';
import { splitKeyframeSegment } from './animEdit';
import { resolveValue } from './animEval';
import { animationSource, sequenceAuthoringReason } from './editorAnimation';
import { writeOutData } from '../templates/shared/animRuntime';
import { mirrorEase } from '../templates/shared/easeRuntime';

export type OutOperation = { kind: 'out.set'; time: number } | { kind: 'out.reverse' };
export const hasExitKeys = (data: AnimData) => data.steps.length > 1 && Object.values(data.steps[data.steps.length - 1].layers).some(tracks => Object.values(tracks).some(keys => keys.length));
/** Stored times keep the serializer's 3 decimals; two within half a step are the same moment. */
const round = (n: number) => Math.round(n * 1000) / 1000, EPS = .0005;
type Bar = { start: number; end: number };
/** Bars that touch become one. */
const joinBars = (bars: Bar[]) => bars.reduce<Bar[]>((joined, bar) => {
  const previous = joined[joined.length - 1];
  if (previous && previous.end === bar.start) previous.end = bar.end; else joined.push(bar);
  return joined;
}, []);

/**
 * Move Out to `boundary`, a stored time on the last pre-Out cue's clock, keeping every key and
 * visibility bar at its absolute time on the concatenated ruler (docs/research/editor-r1-2a-1).
 * A track with keys after the boundary splits there exactly (splitKeyframeSegment) and carries
 * the rest of its motion into Out, which starts from the split value, so In then Out plays what
 * it played before. Throws with the reason wherever that cannot be kept; `source` is not mutated.
 * `contains(ancestor, selector)` answers from the document whether a layer sits inside another.
 */
export function moveOutBoundary(source: AnimData, boundary: number, contains?: (ancestor: string, selector: string) => boolean): AnimData {
  if (!Number.isFinite(boundary) || boundary < 0) throw new Error('Out needs a finite nonnegative playhead time.');
  let data = JSON.parse(JSON.stringify(source)) as AnimData;
  if (data.steps.length === 1) data.steps.push({ name: 'Out', duration: 0, ease: 'none', layers: {} });
  const at = data.steps.length - 2, b = round(boundary), end = data.steps[at].duration, delta = round(end - b);
  // An exit with neither keys nor bars is an instant cut.
  const settle = () => {
    if (!hasExitKeys(data) && !Object.keys(data.steps[at + 1].spans ?? {}).length) data.steps[at + 1].duration = 0;
    return data;
  };
  if (delta === 0) return settle();
  const crossed: [string, string][] = [];
  for (const [selector, tracks] of Object.entries(data.steps[at].layers)) for (const [prop, keys] of Object.entries(tracks)) {
    if (!keys.some(key => key.time > b + EPS)) continue;
    if (keys.some(key => typeof key.value !== 'number')) throw new Error(`Set Out here would move ${selector} ${prop}, and only numeric tracks cross Out exactly. Its source is preserved.`);
    // The runtime plays keys past a cue's end beyond it, so no boundary splits that cue exactly.
    if (keys.some(key => key.time > end + EPS)) throw new Error(`${selector} ${prop} has keys after the end of its cue, so Out cannot cross them exactly. Its source is preserved.`);
    crossed.push([selector, prop]);
  }
  if (crossed.length) {
    const cue = data.steps[at], exitLayers = data.steps[at + 1].layers;
    const hidden = (cue.hides ?? []).find(selector => cue.spans?.[selector] === undefined);
    if (hidden) throw new Error(`${hidden} leaves at the end of this cue (a legacy hide). Moving Out across the entrance would move that exit. Its source is preserved.`);
    // noacgExitTimeline fades a revealed layer outside the root when Out starts, unless Out animates it.
    const faded = data.steps.slice(1, -1).flatMap(step => step.reveals ?? []).find(selector => !exitLayers[selector]);
    if (faded) throw new Error(`${faded} is revealed by a Next cue and fades separately when Out starts. Moving Out across the entrance would change that fade. Its source is preserved.`);
  }
  // Every crossed track holds a key at b: the one there, an exact split, or (b before its first key)
  // that first value, which the runtime already applies from the cue start.
  for (const [selector, prop] of crossed) {
    const keys = data.steps[at].layers[selector][prop];
    if (keys.some(key => Math.abs(key.time - b) < EPS)) continue;
    if (keys.every(key => key.time > b)) { keys.unshift({ time: b, value: keys[0].value }); continue; }
    try { data = splitKeyframeSegment(data, at, selector, prop, b); }
    catch (error) {
      if (error instanceof Error) error.message = `Set Out here would split ${selector} ${prop}. ${error.message}`;
      throw error;
    }
  }
  const cue = data.steps[at], exit = data.steps[at + 1], exitDuration = exit.duration;
  for (const tracks of Object.values(exit.layers)) for (const keys of Object.values(tracks)) {
    if (keys.some(key => key.time + delta < 0)) throw new Error('This boundary would cross an Out key. Exact repartition is not available yet.');
    keys.forEach(key => { key.time = round(key.time + delta); });
  }
  // The rest of each crossed track moves into Out after a copy of its value at b. Its eases say
  // what they are, because the Out cue's default is not the entrance's.
  const leaving = new Set(crossed.map(([selector]) => selector));
  for (const [selector, prop] of crossed) {
    const keys = cue.layers[selector][prop], kept = keys.filter(key => key.time < b + EPS);
    const moved: AnimKeyframe[] = [{ time: 0, value: kept[kept.length - 1].value }, ...keys.filter(key => key.time >= b + EPS)
      .map(key => ({ time: round(key.time - b), value: key.value, ease: key.ease || cue.ease }))];
    const layer = exit.layers[selector] ??= {}, later = layer[prop] ?? [], last = moved[moved.length - 1];
    // Out starts its own track with a set: a different value there is a jump the move cannot keep.
    if (later.length && later[0].value !== last.value) throw new Error(`${selector} ${prop} jumps where Out starts. Moving Out across the entrance would turn that jump into motion. Its source is preserved.`);
    if (later.length && later[0].time < last.time - EPS) throw new Error('This boundary would cross an Out key. Exact repartition is not available yet.');
    if (later.length && later[0].time < last.time + EPS) later.shift();
    cue.layers[selector][prop] = kept;
    layer[prop] = [...moved, ...later];
  }
  // Visibility bars keep their absolute times: clipped at b, the rest carried into Out, and after
  // the old boundary whatever the original Out showed (the exit gates bars on a visible layer).
  const own = exit.spans ?? {}, carried: Record<string, Bar[]> = {}, shift = (span: Bar) => ({ start: round(span.start + delta), end: round(span.end + delta) });
  for (const [selector, spans] of Object.entries(cue.spans ?? {})) {
    const tail = spans.filter(span => span.end > b).map(span => ({ start: round(Math.max(span.start, b) - b), end: round(span.end - b) }));
    cue.spans![selector] = spans.filter(span => span.start < b).map(span => ({ start: span.start, end: Math.min(span.end, b) }));
    if (!spans.some(span => span.start < b && span.end >= b)) {
      if (tail.length) throw new Error(`${selector} is hidden at this Out and visible after it, and Out never reveals a hidden layer. Its source is preserved.`);
      continue;
    }
    if (tail.length) leaving.add(selector);
    const after = !spans.some(span => span.end === end) ? [] : own[selector] ?? (exitDuration > 0 ? [{ start: 0, end: exitDuration }] : []);
    carried[selector] = joinBars([...tail, ...after.map(shift)]);
  }
  for (const [selector, spans] of Object.entries(own)) {
    if (carried[selector]) continue;
    if (spans.some(span => span.start + delta < 0)) throw new Error('This boundary crosses a visibility span. Move its timing first; source is preserved.');
    // Without bars on this cue the layer kept its visibility from b to the old Out, which Out now plays.
    carried[selector] = joinBars([...(delta > 0 && cue.spans?.[selector] === undefined ? [{ start: 0, end: delta }] : []), ...spans.map(shift)]);
  }
  if (exit.spans || Object.keys(carried).length) exit.spans = carried;
  exit.duration = hasExitKeys(data) || Object.keys(exit.spans ?? {}).length ? Math.max(0, round(exitDuration + delta)) : 0;
  cue.duration = b;
  // Out animates only layers visible as it starts (noacgExitVisible walks every parent), so what
  // moved into it must not sit in a layer hidden there, by its bars or by autoAlpha.
  const shut = (selector: string) => resolveValue(data, selector, 'autoAlpha', at, b) === 0;
  const selectors = [...new Set(data.steps.flatMap(step => [...Object.keys(step.layers), ...Object.keys(step.spans ?? {})]))];
  const hidden = selectors.filter(selector => shut(selector) || !held(data, selector));
  for (const selector of leaving) {
    if (!held(data, selector)) continue; // Hidden by its own bars: its motion was never seen.
    if (shut(selector)) throw new Error(`${selector} is hidden by autoAlpha at this Out, and Out skips hidden layers, so the rest of its motion would not play. Its source is preserved.`);
    const parent = contains && hidden.find(other => other !== selector && contains(other, selector));
    if (parent) throw new Error(`${selector} sits inside ${parent}, which is hidden at this Out, and Out skips layers inside a hidden one, so the rest of its motion would not play. Its source is preserved.`);
  }
  return settle();
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
  if (data.steps.length === 1) data.steps.push({ name: 'Out', duration: 0, ease: 'none', layers: {} });
  if (operation.kind === 'out.set') {
    if (!Number.isFinite(operation.time) || operation.time < 0) throw new Error('Out needs a finite nonnegative playhead time.');
    const prefix = data.steps.slice(0, -2).reduce((sum, step) => sum + step.duration, 0);
    const boundary = Math.round(operation.time * template.fps) / template.fps * data.speed - prefix;
    if (boundary < 0 || boundary < data.speed / template.fps && getTemplateParts(template.html, template.fields).some(part => part.kind !== 'root')) throw new Error('Keep at least one frame in a nonempty cue.');
    let doc: Document | undefined;
    data = moveOutBoundary(data, boundary, (ancestor, selector) => {
      doc ??= new DOMParser().parseFromString(template.html, 'text/html');
      try { return Array.from(doc.querySelectorAll(selector)).some(element => !!element.parentElement?.closest(ancestor)); } catch { return false; }
    });
  } else {
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
