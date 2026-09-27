import { parseAnimData, type AnimData } from '../../blocks/animData';
import { getTemplateParts, type TemplatePart } from '../../model/structure';
import type { SpxTemplate } from '../../model/types';

export interface Segment { index: number; name: string; start: number; duration: number; out: boolean }
export interface LayerBar { selector: string; start: number; end: number; step: number }
export interface TimelineView {
  data: AnimData | null; parts: TemplatePart[]; segments: Segment[];
  bars: LayerBar[]; duration: number; out: number; reason: string | null;
}
const views = new WeakMap<SpxTemplate, TimelineView>();
export function readTimeline(template: SpxTemplate): TimelineView {
  const cached = views.get(template);
  if (cached) return cached;
  const data = parseAnimData(template.js);
  const parts = getTemplateParts(template.html, template.fields);
  let cursor = 0;
  const segments = (data?.steps ?? []).map((step, index) => {
    const segment = { index, name: index === 0 ? 'In' : index === data!.steps.length - 1 ? 'Out' : step.name,
      start: cursor, duration: step.duration / data!.speed, out: index > 0 && index === data!.steps.length - 1 };
    cursor += segment.duration;
    return segment;
  });
  const out = segments.find(s => s.out)?.start ?? cursor;
  if (data?.steps.length === 1) segments.push({ index: 1, name: 'Out', start: cursor, duration: 0, out: true });
  const bars = parts.flatMap(part => {
    const reveal = data?.steps.findIndex((s, i) => i > 0 && !!s.reveals?.includes(part.selector)) ?? -1;
    const hide = data?.steps.findIndex(s => !!s.hides?.includes(part.selector)) ?? -1;
    return segments.flatMap(segment => {
      const spans = data!.steps[segment.index]?.spans?.[part.selector];
      if (spans) return spans.map(span => ({ selector: part.selector, step: segment.index,
        start: segment.start + span.start / data!.speed, end: segment.start + span.end / data!.speed }));
      if (reveal >= 0 && segment.index < reveal || hide >= 0 && segment.index > hide) return [];
      return [{ selector: part.selector, step: segment.index, start: segment.start, end: segment.start + segment.duration }];
    });
  });
  const reason = !data ? 'This source has no supported timeline. Its artwork and code are preserved.'
    : data.steps.some(s => s.dynamics?.length || Object.keys(s.loops ?? {}).length)
      ? 'Measured motion and local loops remain in the existing editor. Scrubbing is unavailable here.'
      : null;
  const view = { data, parts, segments, bars, duration: cursor, out, reason };
  views.set(template, view);
  return view;
}
/** A cue boundary belongs to its arriving segment; the finite clock contains no fake hold. */
export function segmentAt(segments: Segment[], time: number, cue?: number): { step: number; time: number } {
  if (cue !== undefined && segments[cue]) return { step: cue, time: Math.max(0, time - segments[cue].start) };
  const segment = segments.find(s => time <= s.start + s.duration) ?? segments[segments.length - 1];
  return segment ? { step: segment.index, time: Math.max(0, Math.min(segment.duration, time - segment.start)) }
    : { step: 0, time: 0 };
}
