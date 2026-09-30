import type { SpxTemplate } from '../model/types';
import { losslessAnimData, type AnimData } from './animData';
import { deleteKeyframe, easeKeys, setKeyframe, moveKeys, moveLayerSpan, trimLayerSpan, type KeyEasePreset, type KeyRef } from './animEdit';
import { artworkNode, editArtworkStyle } from './artworkEdits';
import { baseValues, editBase } from './baseEdits';
import { writeAnimData, writeOutData } from '../templates/shared/animRuntime';

export type NumericProperty = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
/** One preset over a key selection, as one transaction (R1.2a.2, docs/research/editor-r1-2a-2). */
export type KeyEaseOperation = { kind: 'key.ease'; keys: KeyRef[]; preset: KeyEasePreset };
/** Keys moved by one stored delta on the ruler, across flags too (R1.2a.5, docs/research/editor-r1-2a-5). */
export type KeyMoveOperation = { kind: 'key.move'; keys: KeyRef[]; delta: number };
export interface NumericPose { x: number; y: number; scaleX: number; scaleY: number; rotation: number; opacity: number }
export type AnimationOperation =
  | { kind: 'animation.key'; selector: string; step: number; property: NumericProperty; time: number; value: number; action: 'set' | 'remove' | 'disable'; baseValue?: number }
  | { kind: 'layer.move'; selector: string; step: number; delta: number }
  | { kind: 'layer.trim'; selector: string; step: number; interval: number; edge: 'start' | 'end'; time: number };

export function animationSource(template: SpxTemplate): AnimData {
  const data = losslessAnimData(template.js);
  if (!data) throw new Error('This animation contains data the writer cannot preserve exactly.');
  return data;
}
export function isArmed(data: AnimData | null, selector: string, property: string) {
  return !!data?.steps.some(step => step.layers[selector]?.[property]?.length);
}
export function sequenceAuthoringReason(data: AnimData | null): string | null {
  if (!data) return 'This source has no supported animation data.';
  return data.machine || data.steps.some(step => step.calls?.length || step.dynamics?.length || Object.keys(step.loops ?? {}).length)
    ? 'This sequence has calls, measured motion, loops or state-machine ownership. Canvas edits base placement; its animation is preserved.' : null;
}
const documents = new Map<string, Document>();
/** Whether a layer sits inside another in the template's document, parsed once per html. */
export function documentContains(html: string) {
  return (ancestor: string, selector: string) => {
    try {
      let doc = documents.get(html);
      if (!doc) { doc = new DOMParser().parseFromString(html, 'text/html'); documents.clear(); documents.set(html, doc); }
      return Array.from(doc.querySelectorAll(selector)).some(element => !!element.parentElement?.closest(ancestor));
    } catch { return false; }
  };
}
export function animationTarget(template: SpxTemplate, data: AnimData, selector: string) {
  const node = artworkNode(template, selector);
  if (node.matches(data.root)) throw new Error('The graphic root is owned by playback. Animate an artwork layer.');
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  for (const step of data.steps) for (const [target, tracks] of Object.entries(step.layers)) {
    if (!node.matches(target)) continue;
    if (target !== selector || ['transform', 'xPercent', 'yPercent', 'autoAlpha', 'scale'].some(p => p in tracks)) {
      throw new Error('Another source channel owns this transform or visibility. Edit that source to preserve it.');
    }
  }
}
export function applyAnimation(template: SpxTemplate, operation: AnimationOperation): SpxTemplate {
  let data = animationSource(template);
  const { selector, step } = operation;
  animationTarget(template, data, selector);
  if (step === 1 && data.steps.length === 1) data.steps.push({ name: 'Out', duration: 0, ease: 'none', layers: {} });
  if (!Number.isInteger(step) || !data.steps[step]) throw new Error('The target cue no longer exists.');
  if (operation.kind === 'layer.trim') {
    data = trimLayerSpan(data, step, selector, operation.interval, operation.edge, operation.time, data.speed / template.fps);
  } else if (operation.kind === 'layer.move') {
    data = moveLayerSpan(data, step, selector, operation.delta, documentContains(template.html));
  }
  else {
    const { property, time, value, action } = operation;
    if (step > 0 && step === data.steps.length - 1 && action === 'set' && Number.isFinite(time) && time > data.steps[step].duration) data.steps[step].duration = time;
    if (!['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'].includes(property) || !Number.isFinite(value) || !Number.isFinite(time) || time < 0 || time > data.steps[step].duration || property === 'opacity' && (value < 0 || value > 1)) {
      throw new Error('Enter a finite numeric value and a time inside this cue.');
    }
    if (data.steps.some(s => s.layers[selector]?.[property]?.some(k => typeof k.value !== 'number'))) throw new Error('This property contains nonnumeric source.');
    if (action === 'set') data = setKeyframe(data, step, selector, property, time, value);
    else {
      if (action === 'remove' && !data.steps[step].layers[selector]?.[property]?.some(k => Math.abs(k.time - time) < .0005)) throw new Error('There is no key at this time.');
      if (action === 'disable' && !isArmed(data, selector, property)) throw new Error('This property has no animation to disable.');
      if (action === 'remove') data = deleteKeyframe(data, step, selector, property, time);
      else if (action === 'disable') {
        for (let index = 0; index < data.steps.length; index++) {
          for (const key of [...(data.steps[index].layers[selector]?.[property] ?? [])]) data = deleteKeyframe(data, index, selector, property, key.time);
        }
      } else throw new Error('Unknown animation operation.');
      if (!isArmed(data, selector, property)) {
        const js = writeAnimData(template.js, data);
        if (js === null) throw new Error('The animation region cannot be written.');
        template = { ...template, js };
        if (property === 'opacity') template = editArtworkStyle(template, selector, { opacity: value });
        else {
          if (!Number.isFinite(operation.baseValue)) throw new Error('A current rendered base pose is required to remove the last key.');
          baseValues(template, selector);
          template = editBase(template, selector, { [property]: operation.baseValue });
        }
      }
    }
  }
  const js = step > 0 && step === data.steps.length - 1 ? writeOutData(template.js, data) : writeAnimData(template.js, data);
  if (js === null) throw new Error('The animation region cannot be written without replacing source.');
  return { ...template, js };
}

/** Move the selected keys, across flags too. An older known interpreter is re-emitted where Out
 *  changes, as Set Out does, and a custom one refuses there. */
export function applyKeyMove(template: SpxTemplate, operation: KeyMoveOperation): SpxTemplate {
  const data = animationSource(template);
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  const next = moveKeys(data, operation.keys, operation.delta);
  if (next === data) return template;
  const out = next.steps.length - 1;
  return writeKeys(template, next, out > 0 && JSON.stringify(next.steps[out]) !== JSON.stringify(data.steps[out]), 'the moved keys');
}

/** Ease the selected key sides. Changing nothing leaves the source as it is, an older known
 *  interpreter is re-emitted to play the new forms, and a custom one refuses. */
export function applyKeyEase(template: SpxTemplate, operation: KeyEaseOperation): SpxTemplate {
  const data = animationSource(template);
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  if (!Array.isArray(operation.keys) || !operation.keys.length) throw new Error('Select keys to ease. No ease changed.');
  const next = easeKeys(data, operation.keys, operation.preset);
  if (next === data) return template;
  return writeKeys(template, next, data.steps.length > 1 && operation.keys.some(key => key.step === data.steps.length - 1), 'the new eases');
}

/** Write keys an edit changed: where Out changed, an older known interpreter is re-emitted as Set
 *  Out does; a custom one refuses. */
function writeKeys(template: SpxTemplate, next: AnimData, exit: boolean, what: string): SpxTemplate {
  const js = exit ? writeOutData(template.js, next) : writeAnimData(template.js, next);
  if (js === null) throw new Error(`This interpreter has custom source, so ${what} cannot be written safely. Its source is preserved.`);
  return { ...template, js };
}
