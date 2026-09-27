import type { SpxTemplate } from '../../model/types';
import type { BasePatch, BaseValues } from '../../blocks/baseEdits';
import { isArmed, sequenceAuthoringReason, type NumericProperty } from '../../blocks/editorAnimation';
import type { RenderedPart } from './protocol';
import type { EditorOperation } from './operations';
import { readTimeline, segmentAt } from './timelineView';
import { sameRevision, type Revision } from './session';

export function requireCurrentPose(appearance: RenderedPart['appearance'], time: number, revision?: Revision, cue?: number) {
  if (appearance?.time === undefined || appearance.cue !== cue || Math.abs(appearance.time - time) > .00001 || revision && (!appearance.revision || !sameRevision(appearance.revision, revision))) {
    throw new Error('Wait for the preview to reach this playhead and revision before editing.');
  }
}

export function authoringPosition(template: SpxTemplate, selector: string, time: number, cue?: number) {
  const view = readTimeline(template), position = segmentAt(view.segments, time, cue);
  // At a flag, a layer explicitly starting there belongs to the departing cue.
  const upcoming = cue === undefined ? view.segments.find(s => s.start === time && s.index > 0 &&
    view.data?.steps[s.index]?.spans?.[selector]?.some(span => span.start === 0) &&
    !view.bars.some(bar => bar.selector === selector && bar.step === s.index - 1 && bar.end === time)) : undefined;
  return { step: upcoming?.index ?? position.step, time: upcoming ? 0 : position.time * (view.data?.speed ?? 1) };
}
export function displayedBase(base: BaseValues, appearance: RenderedPart['appearance'], property: keyof BasePatch) {
  const motion = appearance?.motion?.[property], initial = appearance?.initialMotion?.[property];
  if (motion === undefined || initial === undefined) return base[property];
  if (property === 'x' || property === 'y') return base[property] + (motion - initial) / (appearance?.unit ?? 1);
  return initial === 0 ? base[property] : base[property] * motion / initial;
}
/** A combined gesture keeps separated axes and mixed selections independent. */
export function authoredTransform(template: SpxTemplate, selector: string, base: BaseValues, appearance: RenderedPart['appearance'], values: BasePatch, time: number): EditorOperation[] {
  requireCurrentPose(appearance, time, undefined, appearance?.cue);
  const view = readTimeline(template), position = authoringPosition(template, selector, time, appearance?.cue);
  const operations: EditorOperation[] = [], unarmed: BasePatch = {};
  for (const [key, value] of Object.entries(values) as [keyof BasePatch, number][]) {
    const before = displayedBase(base, appearance, key);
    if (Math.abs(value - before) < .00001) continue;
    if (sequenceAuthoringReason(view.data)) unarmed[key] = base[key] + value - before;
    else if (isArmed(view.data, selector, key)) {
      const current = appearance?.motion?.[key];
      if (current === undefined) throw new Error('Wait for the rendered property pose before editing animation.');
      const runtime = key === 'x' || key === 'y' ? current + (value - before) * (appearance?.unit ?? 1)
        : before === 0 ? value : current * value / before;
      operations.push({ kind: 'animation.key', selector, property: key as NumericProperty, ...position, value: runtime, action: 'set' });
    } else unarmed[key] = value;
  }
  if (Object.keys(unarmed).length) operations.push({ kind: 'base.set', selector, values: unarmed });
  return operations;
}
