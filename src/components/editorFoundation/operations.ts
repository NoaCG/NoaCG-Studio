import type { SpxTemplate } from '../../model/types';
import { getTemplateParts } from '../../model/structure';
import { locateAnimData, parseAnimData, serializeAnimData, spliceAnimData } from '../../blocks/animData';
import { setKeyframe } from '../../blocks/animEdit';
import { createArtwork, editBase, type BasePatch, type Creation } from '../../blocks/baseEdits';
import { editArtworkText, editArtworkStyle, type ArtworkStyle } from '../../blocks/artworkEdits';
import { changeArtworkLayer, reorderArtwork } from '../../blocks/artworkLayers';
import { applyAnimation, applyKeyEase, applyKeyMove, type AnimationOperation, type KeyEaseOperation, type KeyMoveOperation } from '../../blocks/editorAnimation';
import { applyOut, type OutOperation } from '../../blocks/editorOut';
import { applyStep, type StepOperation } from '../../blocks/editorSteps';
import { commitSvgIdentity } from '../../blocks/svgIdentity';
import { importAssets, placeGraphicImage, removeUnusedAsset, renameGraphicAsset, replaceGraphicImage } from '../../blocks/editorImages';
import type { AssetFile } from '../../model/types';
import { createPath, editPath, editPathPaint, type PathPaint } from '../../blocks/editorPaths';
import type { PathGeometry } from '../../blocks/pathGeometry';

/** Bounded source operations. New tools extend this registry, never mutate their own scene. */
export type EditorOperation =
  | AnimationOperation
  | KeyEaseOperation
  | KeyMoveOperation
  | OutOperation
  | StepOperation
  | { kind: 'path.create'; geometry: PathGeometry; time: number }
  | { kind: 'path.edit'; selector: string; geometry: PathGeometry }
  | { kind: 'path.paint'; selector: string; values: PathPaint }
  | { kind: 'asset.import'; assets: AssetFile[] }
  | { kind: 'asset.move'; from: string; to: string }
  | { kind: 'asset.delete'; path: string }
  | { kind: 'image.place'; assetPath: string; geometry: { x: number; y: number; width: number; height: number }; time: number }
  | { kind: 'image.replace'; selector: string; assetPath: string; box?: { width: number; height: number } }
  | { kind: 'key.set'; selector: string; step: number; property: string; time: number; value: number }
  | { kind: 'base.set'; selector: string; values: BasePatch }
  | { kind: 'text.set'; selector: string; text: string }
  | { kind: 'style.set'; selector: string; values: ArtworkStyle }
  | { kind: 'layer.duplicate' | 'layer.delete'; selector: string }
  | { kind: 'layer.reorder'; selector: string; direction: 'forward' | 'backward' }
  | { kind: 'layer.create'; geometry: Creation };
export interface OperationPatch {
  template: SpxTemplate;
  changedTargets: string[];
  identities?: Record<string, string>;
  diff: { file: 'html' | 'css' | 'js' | 'assets'; before: string; after: string }[];
}

// Compare JSON content irrespective of property order. Refuse fields the current writer
// cannot retain; a future/foreign data extension must never disappear in a visual edit.
function ordered(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(ordered).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + ordered(v)).join(',') + '}';
  return JSON.stringify(value);
}

export function applyOperations(template: SpxTemplate, operations: EditorOperation[], committed = true): OperationPatch {
  if (!operations.length || operations.length > 1000) throw new Error('Provide a bounded, nonempty operation batch.');
  // Inspection/drafts never mint identities, and neither does an unchanged edit.
  if (committed && operations.some(op => 'selector' in op && op.selector.startsWith('body:nth-of-type('))) {
    const draft = applyOperations(template, operations, false);
    if (!draft.diff.length) return draft;
  }
  let next = template;
  const targets = new Set<string>();
  const identities: Record<string, string> = {};
  for (let operation of operations) {
    if (committed && 'selector' in operation) {
      const original = operation.selector;
      const identity = identities[original] ? { template: next, selector: identities[original] } : commitSvgIdentity(next, original);
      next = identity.template;
      if (identity.selector !== original) identities[original] = identity.selector;
      operation = { ...operation, selector: identity.selector };
    }
    if (operation.kind === 'path.create') {
      const result = createPath(next, operation.geometry, operation.time); next = result.template; targets.add(result.selector);
    } else if (operation.kind === 'path.edit') {
      next = editPath(next, operation.selector, operation.geometry); targets.add(operation.selector);
    } else if (operation.kind === 'path.paint') {
      next = editPathPaint(next, operation.selector, operation.values); targets.add(operation.selector);
    } else if (operation.kind === 'asset.import') {
      next = importAssets(next, operation.assets).template;
    } else if (operation.kind === 'asset.move') {
      next = renameGraphicAsset(next, operation.from, operation.to);
    } else if (operation.kind === 'asset.delete') {
      next = removeUnusedAsset(next, operation.path);
    } else if (operation.kind === 'image.place') {
      const result = placeGraphicImage(next, operation.assetPath, operation.geometry, operation.time);
      next = result.template; targets.add(result.selector);
    } else if (operation.kind === 'image.replace') {
      next = replaceGraphicImage(next, operation.selector, operation.assetPath, operation.box); targets.add(operation.selector);
    } else if (operation.kind === 'out.set' || operation.kind === 'out.reverse') {
      next = applyOut(next, operation);
    } else if (operation.kind === 'step.add' || operation.kind === 'step.rename' || operation.kind === 'step.delete' || operation.kind === 'step.move') {
      next = applyStep(next, operation);
    } else if (operation.kind === 'animation.key' || operation.kind === 'layer.move' || operation.kind === 'layer.trim') {
      next = applyAnimation(next, operation); targets.add(operation.selector);
    } else if (operation.kind === 'key.ease') {
      next = applyKeyEase(next, operation); operation.keys.forEach(key => targets.add(key.selector));
    } else if (operation.kind === 'key.move') {
      next = applyKeyMove(next, operation); operation.keys.forEach(key => targets.add(key.selector));
    } else if (operation.kind === 'base.set') {
      next = editBase(next, operation.selector, operation.values); targets.add(operation.selector);
    } else if (operation.kind === 'layer.create') {
      const result = createArtwork(next, operation.geometry); next = result.template; targets.add(result.selector);
    } else if (operation.kind === 'text.set') {
      next = editArtworkText(next, operation.selector, operation.text); targets.add(operation.selector);
    } else if (operation.kind === 'style.set') {
      next = editArtworkStyle(next, operation.selector, operation.values); targets.add(operation.selector);
    } else if (operation.kind === 'layer.duplicate' || operation.kind === 'layer.delete') {
      const result = changeArtworkLayer(next, operation.selector, operation.kind === 'layer.duplicate' ? 'duplicate' : 'delete');
      next = result.template; targets.add(result.selector);
    } else if (operation.kind === 'layer.reorder') {
      next = reorderArtwork(next, operation.selector, operation.direction); targets.add(operation.selector);
    } else if (operation.kind === 'key.set') {
      next = applyKeyOperations(next, [operation]).template; targets.add(operation.selector);
    } else throw new Error('Unknown editor operation.');
  }
  const diff: OperationPatch['diff'] = (['html', 'css', 'js'] as const)
    .filter(file => template[file] !== next[file]).map(file => ({ file, before: template[file], after: next[file] }));
  if (template.assets.length !== next.assets.length || template.assets.some((asset, i) => asset.path !== next.assets[i]?.path || asset.data !== next.assets[i]?.data)) {
    diff.push({ file: 'assets', before: template.assets.map(a => a.path).join('\n'), after: next.assets.map(a => a.path).join('\n') });
  }
  return { template: next, changedTargets: [...targets], identities, diff };
}

function applyKeyOperations(template: SpxTemplate, operations: Extract<EditorOperation, { kind: 'key.set' }>[]): OperationPatch {
  const location = locateAnimData(template.js);
  let data = parseAnimData(template.js);
  if (!data || !location) throw new Error('This source has no supported animation data. Its code is preserved.');
  const original = template.js.slice(location.start, location.end);
  if (ordered(JSON.parse(original)) !== ordered(JSON.parse(serializeAnimData(data)))) {
    throw new Error('This animation contains data the current writer cannot preserve exactly.');
  }
  const parts = new Set(getTemplateParts(template.html, template.fields, true).map(p => p.selector));
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
