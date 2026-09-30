import type { SpxTemplate } from '../../model/types';
import type { BasePatch, BaseValues } from '../../blocks/baseEdits';
import { isArmed, sequenceAuthoringReason, type NumericProperty } from '../../blocks/editorAnimation';
import { resolveValue } from '../../blocks/animEval';
import type { RenderedPart } from './protocol';
import type { EditorOperation } from './operations';
import { FLOAT_STEP, readTimeline, segmentAt } from './timelineView';
import { sameRevision, type Revision } from './session';

export function requireCurrentPose(appearance: RenderedPart['appearance'], time: number, revision?: Revision, cue?: number) {
  // An Out played from the parked playhead can leave from a pose the Out cue's keys never hold.
  if (appearance?.exiting) throw new Error('This is the Out preview, not the Out cue’s own pose. Click the timeline to edit Out here.');
  if (appearance?.time === undefined || appearance.cue !== cue || Math.abs(appearance.time - time) > .00001 || revision && (!appearance.revision || !sameRevision(appearance.revision, revision))) {
    throw new Error('Wait for the preview to reach this playhead and revision before editing.');
  }
}

/**
 * The segment an edit at the playhead writes (G02, docs/research/editor-r1-2a-4). On a flag it is
 * the arriving one, at its end, except for a layer whose bar starts on that flag without running on
 * from the cue before: that layer edits the departing cue at its start. An explicit inspection
 * (`cue`) edits that cue.
 */
function editSegment(template: SpxTemplate, selector: string, time: number, cue?: number) {
  const view = readTimeline(template), position = segmentAt(view.segments, time, cue), near = (a: number, b: number) => Math.abs(a - b) <= FLOAT_STEP;
  const departing = cue === undefined ? view.segments.find(s => s.index > 0 && near(s.start, time) &&
    view.bars.some(bar => bar.selector === selector && bar.step === s.index && near(bar.start, s.start)) &&
    !view.bars.some(bar => bar.selector === selector && bar.step === s.index - 1 && near(bar.end, s.start))) : undefined;
  return { view, segment: departing ?? view.segments[position.step], time: departing ? 0 : position.time, departing: !!departing };
}
type Edit = ReturnType<typeof editSegment>;
/** The pose an edit starts from: the preview's, except where a layer edits the departing cue on a
 *  flag, whose own values at its start (the shared sampler) the arriving preview keeps hidden. */
function poseOf({ view, segment, departing }: Edit, selector: string, appearance: RenderedPart['appearance']): RenderedPart['appearance'] {
  if (!departing || !appearance?.motion || !view.data) return appearance;
  const motion = { ...appearance.motion };
  for (const property of Object.keys(motion) as (keyof typeof motion)[]) {
    const value = resolveValue(view.data, selector, property, segment.index, 0);
    if (typeof value === 'number') motion[property] = value;
  }
  return { ...appearance, motion, opacity: motion.opacity ?? appearance.opacity };
}
const positionOf = ({ view, segment, time }: Edit) => ({ step: segment?.index ?? 0, time: time * (view.data?.speed ?? 1) });
export function authoringPosition(template: SpxTemplate, selector: string, time: number, cue?: number) {
  return positionOf(editSegment(template, selector, time, cue));
}
/** Where an edit lands, as the inspector names it: the segment, and its start or end on a flag. */
export function editTarget(template: SpxTemplate, selector: string, time: number, cue?: number) {
  const { segment, time: local } = editSegment(template, selector, time, cue);
  if (!segment) return '';
  return segment.name + (local <= FLOAT_STEP ? ' start' : Math.abs(local - segment.duration) <= FLOAT_STEP ? ' end' : '');
}
export function editingPose(template: SpxTemplate, selector: string, appearance: RenderedPart['appearance'], time: number, cue?: number) {
  return poseOf(editSegment(template, selector, time, cue), selector, appearance);
}
export function displayedBase(base: BaseValues, appearance: RenderedPart['appearance'], property: keyof BasePatch) {
  const motion = appearance?.motion?.[property], initial = appearance?.initialMotion?.[property];
  if (motion === undefined || initial === undefined) return base[property];
  if (property === 'x' || property === 'y') return base[property] + (motion - initial) / (appearance?.unit ?? 1);
  if (property === 'rotation') return base.rotation + motion - initial;
  return initial === 0 ? base[property] : base[property] * motion / initial;
}
/** A combined gesture keeps separated axes and mixed selections independent: each layer resolves
 *  its own segment and pose, and the caller commits every operation as one transaction. */
export function authoredTransform(template: SpxTemplate, selector: string, base: BaseValues, appearance: RenderedPart['appearance'], values: BasePatch, time: number): EditorOperation[] {
  requireCurrentPose(appearance, time, undefined, appearance?.cue);
  const edit = editSegment(template, selector, time, appearance?.cue), { view } = edit, position = positionOf(edit), pose = poseOf(edit, selector, appearance);
  const operations: EditorOperation[] = [], unarmed: BasePatch = {};
  for (const [key, value] of Object.entries(values) as [keyof BasePatch, number][]) {
    const before = displayedBase(base, pose, key);
    if (Math.abs(value - before) < .00001) continue;
    if (sequenceAuthoringReason(view.data)) unarmed[key] = base[key] + value - before;
    else if (isArmed(view.data, selector, key)) {
      const current = pose?.motion?.[key];
      if (current === undefined) throw new Error('Wait for the rendered property pose before editing animation.');
      const runtime = key === 'x' || key === 'y' ? current + (value - before) * (pose?.unit ?? 1)
        : key === 'rotation' ? current + value - before : before === 0 ? value : current * value / before;
      operations.push({ kind: 'animation.key', selector, property: key as NumericProperty, ...position, value: runtime, action: 'set' });
    } else unarmed[key] = value;
  }
  if (Object.keys(unarmed).length) operations.push({ kind: 'base.set', selector, values: unarmed });
  return operations;
}
