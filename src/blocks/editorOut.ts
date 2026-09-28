import { getTemplateParts } from '../model/structure';
import type { SpxTemplate } from '../model/types';
import type { AnimData, AnimKeyframe } from './animData';
import { animationSource, sequenceAuthoringReason } from './editorAnimation';
import { writeOutData } from '../templates/shared/animRuntime';
import { mirrorEase } from '../templates/shared/easeRuntime';

export type OutOperation = { kind: 'out.set'; time: number } | { kind: 'out.reverse' };
export const hasExitKeys = (data: AnimData) => data.steps.length > 1 && Object.values(data.steps[data.steps.length - 1].layers).some(tracks => Object.values(tracks).some(keys => keys.length));
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
  const data = animationSource(template);
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  if (data.steps.length === 1) data.steps.push({ name: 'Out', duration: 0, ease: 'none', layers: {} });
  const exit = data.steps[data.steps.length - 1], previous = data.steps[data.steps.length - 2];
  if (operation.kind === 'out.set') {
    if (!Number.isFinite(operation.time) || operation.time < 0) throw new Error('Out needs a finite nonnegative playhead time.');
    const prefix = data.steps.slice(0, -2).reduce((sum, step) => sum + step.duration, 0);
    const boundary = Math.round(operation.time * template.fps) / template.fps * data.speed - prefix;
    if (boundary < lastTime(previous) - .000001) throw new Error('Set Out cannot move before the last In key until exact curve splitting is supported.');
    if (boundary < 0 || getTemplateParts(template.html, template.fields).some(part => part.kind !== 'root') && boundary < data.speed / template.fps) throw new Error('Keep at least one frame in a nonempty cue.');
    const delta = previous.duration - boundary;
    if (delta !== 0) {
      if (Object.values(previous.spans ?? {}).some(spans => spans.some(span => span.end > boundary)) ||
          Object.values(exit.spans ?? {}).some(spans => spans.some(span => span.start + delta < 0))) {
        throw new Error('This boundary crosses a visibility span. Move its timing first; source is preserved.');
      }
      for (const tracks of Object.values(exit.layers)) for (const keys of Object.values(tracks)) {
        if (keys.some(key => key.time + delta < 0)) throw new Error('This boundary would cross an Out key. Exact repartition is not available yet.');
        keys.forEach(key => { key.time += delta; });
      }
      for (const spans of Object.values(exit.spans ?? {})) spans.forEach(span => { span.start += delta; span.end += delta; });
      exit.duration = hasExitKeys(data) || Object.keys(exit.spans ?? {}).length ? Math.max(0, exit.duration + delta) : 0;
      previous.duration = boundary;
    }
    if (!hasExitKeys(data) && !Object.keys(exit.spans ?? {}).length) exit.duration = 0;
  } else {
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
