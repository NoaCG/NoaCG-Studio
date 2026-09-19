import { parseAnimData, type AnimData } from '../../blocks/animData';
import { getTemplateParts, type TemplatePart } from '../../model/structure';
import type { SpxTemplate } from '../../model/types';

export interface Segment { index: number; name: string; start: number; duration: number; out: boolean }
export interface LayerBar { selector: string; start: number; end: number }
export interface TimelineView {
  data: AnimData | null; parts: TemplatePart[]; segments: Segment[];
  bars: LayerBar[]; duration: number; out: number; reason: string | null;
}
export function readTimeline(template: SpxTemplate): TimelineView {
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
  const bars = parts.map(part => {
    const reveal = data?.steps.findIndex((s, i) => i > 0 && !!s.reveals?.includes(part.selector)) ?? -1;
    const hide = data?.steps.findIndex(s => !!s.hides?.includes(part.selector)) ?? -1;
    return { selector: part.selector, start: reveal >= 0 ? segments[reveal].start : 0,
      end: hide >= 0 ? segments[hide].start + segments[hide].duration : cursor };
  });
  const reason = !data ? 'This source has no supported timeline. Its artwork and code are preserved.'
    : data.steps.some(s => s.dynamics?.length || Object.keys(s.loops ?? {}).length)
      ? 'Measured motion and local loops remain in the existing editor. Scrubbing is unavailable here.'
      : null;
  return { data, parts, segments, bars, duration: cursor, out, reason };
}
/** A cue boundary belongs to its arriving segment; the finite clock contains no fake hold. */
export function segmentAt(segments: Segment[], time: number): { step: number; time: number } {
  const segment = segments.find(s => time <= s.start + s.duration) ?? segments[segments.length - 1];
  return segment ? { step: segment.index, time: Math.max(0, Math.min(segment.duration, time - segment.start)) }
    : { step: 0, time: 0 };
}
