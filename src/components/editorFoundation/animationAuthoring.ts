import type { SpxTemplate } from '../../model/types';
import type { BasePatch, BaseValues } from '../../blocks/baseEdits';
import { channelValue, isArmed, sequenceAuthoringReason, writeChannel, type Channel, type NumericPose } from '../../blocks/editorAnimation';
import type { AnimData } from '../../blocks/animData';
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
  const motion = { ...appearance.motion }, owner = view.owners[selector] ?? selector;
  for (const property of Object.keys(motion) as (keyof typeof motion)[]) {
    const value = channelValue(view.data, owner, property, segment.index, 0);
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
/** A Position axis's percent channel as a distance in the layer's own units: the runtime resolves
 *  xPercent and yPercent against the layer's border box, which the preview reports as `size`. */
function percentOffset(appearance: RenderedPart['appearance'], axis: 'x' | 'y') {
  const channel = axis === 'x' ? 'xPercent' : 'yPercent', size = appearance?.size?.[axis === 'x' ? 0 : 1];
  const motion = appearance?.motion?.[channel], initial = appearance?.initialMotion?.[channel];
  return motion === undefined || initial === undefined || size === undefined ? 0 : (motion - initial) * size / 100;
}
/** A control's value as the inspector shows it: the base plus the motion at the playhead in every
 *  channel of the control (D03, docs/research/editor-r1-2a-6). */
export function displayedBase(base: BaseValues, appearance: RenderedPart['appearance'], property: keyof BasePatch) {
  const motion = appearance?.motion?.[property], initial = appearance?.initialMotion?.[property];
  if (motion === undefined || initial === undefined) return base[property];
  if (property === 'x' || property === 'y') return base[property] + (motion - initial + percentOffset(appearance, property)) / (appearance?.unit ?? 1);
  if (property === 'rotation') return base.rotation + motion - initial;
  return initial === 0 ? base[property] : base[property] * motion / initial;
}
/** The runtime value a control's channel takes when the control goes from `before` to `value` (the
 *  inverse of `displayedBase`): pixels scale by the document, a percent by the layer's own box, and
 *  a scale multiplies. */
export function nativeValue(pose: RenderedPart['appearance'], owner: string, key: keyof BasePatch, channel: Channel, value: number, before: number) {
  const current = pose?.motion?.[channel === 'scale' ? key : channel as keyof NumericPose];
  if (current === undefined) throw new Error('Wait for the rendered property pose before editing animation.');
  const unit = pose?.unit ?? 1;
  if (channel === 'xPercent' || channel === 'yPercent') {
    const size = pose?.size?.[channel === 'xPercent' ? 0 : 1] ?? 0;
    if (!(size > 0)) throw new Error(`${owner} has no ${channel === 'xPercent' ? 'width' : 'height'} to measure its ${channel} offset against. Its source is preserved.`);
    return current + (value - before) * unit * 100 / size;
  }
  return key === 'x' || key === 'y' ? current + (value - before) * unit : key === 'rotation' ? current + value - before : before === 0 ? value : current * value / before;
}
/** A combined gesture keeps separated axes and mixed selections independent: each layer resolves
 *  its own segment and pose, and the caller commits every operation as one transaction. */
export function authoredTransform(template: SpxTemplate, selector: string, base: BaseValues, appearance: RenderedPart['appearance'], values: BasePatch, time: number): EditorOperation[] {
  requireCurrentPose(appearance, time, undefined, appearance?.cue);
  const edit = editSegment(template, selector, time, appearance?.cue), { view } = edit, pose = poseOf(edit, selector, appearance);
  return transformOperations(view.data, selector, view.owners[selector] ?? selector, base, pose, values, positionOf(edit));
}
/**
 * The operations that take a layer's controls to `values` from the pose shown (R1.2a.6): each armed
 * control keys the channel it writes (`writeChannel`) in that channel's own units at `position`;
 * the rest move the base by the change, so motion the editor does not key (another selector's, a
 * raw transform's) stays motion. One scale track keys both axes, so only a change keeping their
 * ratio can write it.
 */
export function transformOperations(data: AnimData | null, selector: string, owner: string, base: BaseValues, pose: RenderedPart['appearance'], values: BasePatch, position: { step: number; time: number }): EditorOperation[] {
  const operations: Extract<EditorOperation, { kind: 'animation.key' }>[] = [], unarmed: BasePatch = {};
  for (const [key, value] of Object.entries(values) as [keyof BasePatch, number][]) {
    const before = displayedBase(base, pose, key);
    if (Math.abs(value - before) < .00001) continue;
    if (!sequenceAuthoringReason(data) && isArmed(data, owner, key)) {
      const channel = writeChannel(data, owner, key);
      operations.push({ kind: 'animation.key', selector, property: channel, ...position, value: nativeValue(pose, owner, key, channel, value, before), action: 'set' });
    } else unarmed[key] = base[key] + value - before;
  }
  const shared = operations.filter(operation => operation.property === 'scale');
  if (shared.length && (shared.length < 2 || Math.abs(shared[0].value - shared[1].value) > 1e-6 * Math.max(1, Math.abs(shared[0].value)))) {
    throw new Error(`Scale X and Y share one scale track on ${owner}. Keep them linked to key it. Its source is preserved.`);
  }
  const keyed: EditorOperation[] = operations.filter(operation => operation !== shared[1]);
  return Object.keys(unarmed).length ? [...keyed, { kind: 'base.set', selector, values: unarmed }] : keyed;
}
