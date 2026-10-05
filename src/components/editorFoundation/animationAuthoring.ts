import type { SpxTemplate } from '../../model/types';
import { baseValues, type BasePatch, type BaseValues, type TransformPatch } from '../../blocks/baseEdits';
import { channelValue, isArmed, poseKey, sequenceAuthoringReason, writeChannel, type Channel } from '../../blocks/editorAnimation';
import type { AnimData } from '../../blocks/animData';
import type { RenderedPart } from './protocol';
import type { EditorOperation } from './operations';
import { FLOAT_STEP, ownerOf, readTimeline, segmentAt } from './timelineView';
import { sameRevision, type Revision } from './session';
import { apply, invert, type Point } from './transformGestures';
import type { ArtworkDelta } from '../../blocks/arrangementGeometry';
import { resizableTextBox } from '../../blocks/designLayout';

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
  const motion = { ...appearance.motion }, owner = ownerOf(view, selector);
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
export function displayedBase(base: BaseValues, appearance: RenderedPart['appearance'], property: keyof TransformPatch) {
  const motion = appearance?.motion?.[property], initial = appearance?.initialMotion?.[property];
  if (motion === undefined || initial === undefined) return base[property];
  if (property === 'x' || property === 'y') return base[property] + (motion - initial + percentOffset(appearance, property)) / (appearance?.unit ?? 1);
  if (property === 'rotation') return base.rotation + motion - initial;
  return initial === 0 ? base[property] : base[property] * motion / initial;
}
/** The runtime value a control's channel takes when the control goes from `before` to `value` (the
 *  inverse of `displayedBase`): pixels scale by the document, a percent by the layer's own box, and
 *  a scale multiplies. */
export function nativeValue(pose: RenderedPart['appearance'], owner: string, key: keyof TransformPatch, channel: Channel, value: number, before: number) {
  const current = pose?.motion?.[poseKey(channel, key)];
  if (current === undefined) throw new Error('Wait for the rendered property pose before editing animation.');
  const unit = pose?.unit ?? 1;
  if (channel === 'xPercent' || channel === 'yPercent') {
    const size = pose?.size?.[channel === 'xPercent' ? 0 : 1] ?? 0;
    if (!(size > 0)) throw new Error(`${owner} has no ${channel === 'xPercent' ? 'width' : 'height'} to measure its ${channel} offset against. Its source is preserved.`);
    return current + (value - before) * unit * 100 / size;
  }
  return key === 'x' || key === 'y' ? current + (value - before) * unit : key === 'rotation' ? current + value - before : before === 0 ? value : current * value / before;
}
/** Whether an edit of this control is a key (on a sequence the editor authors, where the control is
 *  animated) rather than a base write. */
export const keysControl = (data: AnimData | null, owner: string, property: keyof TransformPatch) => !sequenceAuthoringReason(data) && isArmed(data, owner, property);
/** A combined gesture keeps separated axes and mixed selections independent: each layer resolves
 *  its own segment and pose, and the caller commits every operation as one transaction. */
export function authoredTransform(template: SpxTemplate, selector: string, base: BaseValues, appearance: RenderedPart['appearance'], values: TransformPatch, time: number): EditorOperation[] {
  requireCurrentPose(appearance, time, undefined, appearance?.cue);
  const edit = editSegment(template, selector, time, appearance?.cue), { view } = edit, pose = poseOf(edit, selector, appearance);
  return transformOperations(view.data, selector, ownerOf(view, selector), base, pose, values, positionOf(edit));
}
/**
 * The operations that take a layer's controls to `values` from the pose shown (R1.2a.6): each armed
 * control keys the channel it writes (`writeChannel`) in that channel's own units at `position`;
 * the rest move the base by the change, so motion the editor does not key (another selector's, a
 * raw transform's) stays motion. One scale track keys both axes, so only a change keeping their
 * ratio can write it.
 */
export function transformOperations(data: AnimData | null, selector: string, owner: string, base: BaseValues, pose: RenderedPart['appearance'], values: TransformPatch, position: { step: number; time: number }): EditorOperation[] {
  const operations: Extract<EditorOperation, { kind: 'animation.key' }>[] = [], unarmed: BasePatch = {};
  for (const [key, value] of Object.entries(values) as [keyof TransformPatch, number][]) {
    const before = displayedBase(base, pose, key);
    if (Math.abs(value - before) < .00001) continue;
    if (keysControl(data, owner, key)) {
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

/** The anchor a layer shows, in layer pixels (R1.2b.1): its declared one, else the rendered pivot. */
export function shownAnchor(base: BaseValues, pose: RenderedPart['appearance']): Point | null {
  if (base.anchor) return base.anchor;
  const origin = pose?.origin, unit = pose?.unit ?? 1;
  return origin && origin.every(Number.isFinite) ? { x: origin[0] / unit, y: origin[1] / unit } : null;
}
/**
 * The operation that puts a layer's anchor at `anchor` (layer pixels, R1.2b.1): the pivot alone, in
 * the base. Typing, Center anchor and the Anchor tool all move only the point Rotation, Scale and the
 * rest of the transform turn about, never Position (owner, 2026-10-01), so a turned or scaled layer
 * then turns and scales about the new point. The anchor is the same on every cue, so it needs no
 * playhead.
 */
export const anchorOperations = (selector: string, anchor: Point): EditorOperation[] =>
  [{ kind: 'base.set', selector, values: { anchorX: anchor.x, anchorY: anchor.y } }];

/** Independent artwork targets measured at the exact revision and playhead being edited. */
export function arrangementTargets(template: SpxTemplate, parts: RenderedPart[], selection: string[], time: number, revision: Revision, cue?: number): RenderedPart[] {
  if (!selection.length) throw new Error('Select artwork to arrange or move.');
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const targets = selection.map(selector => {
    const matches = doc.querySelectorAll(selector), part = parts.find(p => p.selector === selector);
    if (matches.length !== 1 || !part) throw new Error(selector + ' has no uniquely measured artwork. Inspect it again.');
    requireCurrentPose(part.appearance, time, revision, cue);
    // Validate every target, including a distribution endpoint which will stay still.
    try { baseValues(template, selector); invert(part.parent ?? [1, 0, 0, 1], 'This parent transform is singular. Restore a nonzero parent scale first.'); }
    catch (cause) { throw Object.assign(new Error(selector + ': ' + (cause instanceof Error ? cause.message : String(cause))), { cause }); }
    return part;
  });
  if (targets.some(a => targets.some(b => a !== b && doc.querySelector(a.selector)!.contains(doc.querySelector(b.selector))))) throw new Error('A selected parent contains another selected layer. Select independent artwork to arrange it exactly.');
  return targets;
}

/** A composition-space translation resolves separately through each parent's inverse and source channel. */
export function translateArtwork(template: SpxTemplate, parts: RenderedPart[], deltas: ArtworkDelta[], time: number): EditorOperation[] {
  return parts.flatMap(part => {
    const delta = deltas.find(d => d.selector === part.selector);
    if (!delta || ![delta.x, delta.y].every(Number.isFinite)) throw new Error('The artwork translation is invalid.');
    const change = apply(invert(part.parent ?? [1, 0, 0, 1]), delta);
    const base = baseValues(template, part.selector), pose = editingPose(template, part.selector, part.appearance, time, part.appearance?.cue);
    return authoredTransform(template, part.selector, base, part.appearance,
      { x: displayedBase(base, pose, 'x') + change.x, y: displayedBase(base, pose, 'y') + change.y }, time);
  });
}

/** Keyboard width/height edits: text boxes reflow, other artwork scales in its own axes about the pivot. */
export function resizeArtwork(template: SpxTemplate, parts: RenderedPart[], delta: Point, time: number): EditorOperation[] {
  if (![delta.x, delta.y].every(Number.isFinite)) throw new Error('Enter finite resize distances.');
  return parts.flatMap(part => {
    const base = baseValues(template, part.selector), box = resizableTextBox(template, part.selector);
    if (box) {
      const width = box.width + delta.x, height = box.height + delta.y;
      if (width < 1 || height < 1) throw new Error(part.selector + ': resizing would collapse the text box. Keep width and height at least one pixel.');
      if (!delta.x && !delta.y) return [];
      const operations: EditorOperation[] = [];
      // Freeze the existing percentage pivot at the same local point before changing the box.
      if (!base.anchor) {
        if (base.anchorReason) throw new Error(base.anchorReason);
        const anchor = shownAnchor(base, part.appearance);
        if (!anchor) throw new Error('Wait for the rendered text box pivot before resizing.');
        operations.push(...anchorOperations(part.selector, anchor));
      }
      operations.push({ kind: 'style.set', selector: part.selector, values: { width, height } });
      return operations;
    }
    // Base scale precedes the source's own transform; animated scale uses its existing writer.
    const view = readTimeline(template), owner = ownerOf(view, part.selector);
    const unarmed = delta.x && !keysControl(view.data, owner, 'scaleX') || delta.y && !keysControl(view.data, owner, 'scaleY');
    if (base.axisResizeReason && unarmed) throw new Error(base.axisResizeReason);
    const pose = editingPose(template, part.selector, part.appearance, time, part.appearance?.cue);
    const corners = part.corners;
    if (!corners || corners.length !== 4) throw new Error(part.selector + ' has no exact local resize frame.');
    const inverse = invert(part.parent ?? [1, 0, 0, 1]);
    const side = (to: number) => {
      const v = apply(inverse, { x: corners[to].x - corners[0].x, y: corners[to].y - corners[0].y });
      return Math.hypot(v.x, v.y);
    };
    const values: TransformPatch = {};
    for (const [axis, distance, size] of [['scaleX', delta.x, side(1)], ['scaleY', delta.y, side(3)]] as const) {
      if (!distance) continue;
      const scale = displayedBase(base, pose, axis);
      if (Math.abs(scale) < 1e-8 || size < 1e-8 || size + distance < 1) throw new Error(part.selector + ': resizing would collapse this artwork axis. Restore a nonzero size or scale first.');
      values[axis] = scale * (size + distance) / size;
    }
    return authoredTransform(template, part.selector, base, part.appearance, values, time);
  });
}
