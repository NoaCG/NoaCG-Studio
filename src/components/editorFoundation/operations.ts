import type { SpxTemplate } from '../../model/types';
import { getTemplateParts } from '../../model/structure';
import { locateAnimData, parseAnimData, serializeAnimData, spliceAnimData } from '../../blocks/animData';
import { setKeyframe } from '../../blocks/animEdit';
import { createArtwork, editBase, baseValues, type BasePatch, type Creation } from '../../blocks/baseEdits';
import { setSlotSize, setLineFit } from '../../blocks/designLayout';

/** Bounded source operations. New tools extend this registry, never mutate their own scene. */
export type EditorOperation =
  | { kind: 'key.set'; selector: string; step: number; property: string; time: number; value: number }
  | { kind: 'base.set'; selector: string; values: BasePatch }
  | { kind: 'box.resize'; selector: string; width: number; height: number }
  | { kind: 'layer.create'; geometry: Creation };
export interface OperationPatch {
  template: SpxTemplate;
  changedTargets: string[];
  diff: { file: 'html' | 'css' | 'js'; before: string; after: string }[];
}

// Compare JSON content irrespective of property order. Refuse fields the current writer
// cannot retain; a future/foreign data extension must never disappear in a visual edit.
function ordered(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(ordered).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + ordered(v)).join(',') + '}';
  return JSON.stringify(value);
}

export function applyOperations(template: SpxTemplate, operations: EditorOperation[]): OperationPatch {
  if (!operations.length || operations.length > 1000) throw new Error('Provide a bounded, nonempty operation batch.');
  let next = template;
  const targets = new Set<string>();
  for (const operation of operations) {
    if (operation.kind === 'base.set') {
      next = editBase(next, operation.selector, operation.values); targets.add(operation.selector);
    } else if (operation.kind === 'layer.create') {
      const result = createArtwork(next, operation.geometry); next = result.template; targets.add(result.selector);
    } else if (operation.kind === 'box.resize') {
      const base = baseValues(next, operation.selector);
      if (base.mode !== 'placed' || ![operation.width, operation.height].every(n => Number.isFinite(n) && n > 0)) {
        throw new Error('Box size requires a placed text box with positive dimensions.');
      }
      next = setSlotSize(next, base.target.slice(1), operation.width, operation.height, base.scaled);
      next = setLineFit(next, operation.selector.slice(1), { maxWidth: operation.width }) ?? next;
      targets.add(operation.selector);
    } else {
      next = applyKeyOperations(next, [operation]).template; targets.add(operation.selector);
    }
  }
  return { template: next, changedTargets: [...targets], diff: (['html', 'css', 'js'] as const)
    .filter(file => template[file] !== next[file]).map(file => ({ file, before: template[file], after: next[file] })) };
}

function applyKeyOperations(template: SpxTemplate, operations: Extract<EditorOperation, { kind: 'key.set' }>[]): OperationPatch {
  const location = locateAnimData(template.js);
  let data = parseAnimData(template.js);
  if (!data || !location) throw new Error('This source has no supported animation data. Its code is preserved.');
  const original = template.js.slice(location.start, location.end);
  if (ordered(JSON.parse(original)) !== ordered(JSON.parse(serializeAnimData(data)))) {
    throw new Error('This animation contains data the current writer cannot preserve exactly.');
  }
  const parts = new Set(getTemplateParts(template.html, template.fields).map(p => p.selector));
  const changedTargets = new Set<string>();
  for (const operation of operations) {
    if (operation.kind !== 'key.set') throw new Error('Unknown editor operation.');
    const { selector, step, property, time, value } = operation;
    const track = data.steps[step]?.layers[selector]?.[property];
    // R1.0 proves an existing numeric track. Creation/base/arming belong to R1.1.
    if (!Number.isInteger(step) || !parts.has(selector) || !track?.length ||
        !['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'].includes(property) ||
        track.some(k => typeof k.value !== 'number') ||
        !Number.isFinite(value) || !Number.isFinite(time) || time < 0 ||
        time > data.steps[step].duration || (property === 'opacity' && (value < 0 || value > 1))) {
      throw new Error('The target, numeric property, value or stored time is unsupported.');
    }
    data = setKeyframe(data, step, selector, property, time, value);
    changedTargets.add(selector);
  }
  const js = spliceAnimData(template.js, data);
  if (js === null) throw new Error('The animation region changed. Inspect the source again.');
  return { template: { ...template, js }, changedTargets: [...changedTargets],
    diff: js === template.js ? [] : [{ file: 'js', before: template.js, after: js }] };
}
