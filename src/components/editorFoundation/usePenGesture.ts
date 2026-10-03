import { useMemo, useRef, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import { inspectPath } from '../../blocks/editorPaths';
import { mapPoint, movePathPoint, validatePath, type PathGeometry, type PathPosition } from '../../blocks/pathGeometry';
import { sameRevision, type EditorSession, type Revision } from './session';
import type { PreviewReply, RenderedPart } from './protocol';
import { requireCurrentPose } from './animationAuthoring';

interface Draft {
  geometry: PathGeometry; matrix: number[]; expected: Revision; time: number; cue?: number;
  selector?: string; original?: PathGeometry;
  pressed?: { index: number; kind: 'point' | 'in' | 'out'; start: PathPosition };
}
export function usePenGesture(template: SpxTemplate, session: EditorSession, drawingSpace: PreviewReply['drawingSpace'],
  target: RenderedPart | null, scale: number, completed: () => void) {
  const current = useRef<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null), [error, setError] = useState('');
  const selector = target?.selector;
  const info = useMemo(() => selector ? inspectPath(template, selector) : null, [template, selector]);
  const fresh = (value: Draft) => {
    if (!sameRevision(value.expected, session.version())) throw new Error('The document changed. Draw or inspect this path again.');
    const view = session.port.view();
    if (view.time !== value.time || view.cue !== value.cue) throw new Error('The playhead moved. Draw or inspect this path again.');
  };
  const publish = (value: Draft) => { current.current = value; setDraft({ ...value }); };
  const cancel = () => { if (current.current) session.cancel(); current.current = null; setDraft(null); setError(''); };
  const fail = (cause: unknown) => { cancel(); setError(cause instanceof Error ? cause.message : String(cause)); };
  const finish = (closed: boolean) => {
    const value = current.current; if (!value || value.selector) return;
    try {
      fresh(value);
      const geometry = { ...value.geometry, closed }; validatePath(geometry);
      session.execute({ documentId: session.documentId, expected: value.expected, transactionId: crypto.randomUUID(), operations: [{ kind: 'path.create', geometry, time: value.time }] });
      current.current = null; setDraft(null); setError(''); completed();
    } catch (cause) { if (value.geometry.points.length < (closed ? 3 : 2)) setError(cause instanceof Error ? cause.message : String(cause)); else fail(cause); }
  };
  const begin = (screen: PathPosition) => {
    setError('');
    try {
      let value = current.current;
      if (value) fresh(value);
      if (target) {
        if (!info?.geometry) throw new Error(info?.reason || 'Select a supported path.');
        requireCurrentPose(target.appearance, session.port.view().time, session.version(), session.port.view().cue);
        if (!target.pathMatrix) throw new Error('Wait for the rendered path coordinates.');
        mapPoint(target.pathMatrix, screen, true);
        const geometry = info.geometry, hits = geometry.points.flatMap((point, index) => ([
          ...point.in ? [{ index, kind: 'in' as const, at: point.in }] : [],
          ...point.out ? [{ index, kind: 'out' as const, at: point.out }] : [],
          { index, kind: 'point' as const, at: point },
        ]));
        const hit = hits.find(hit => { const p = mapPoint(target.pathMatrix!, hit.at); return Math.hypot(screen.x - p.x, screen.y - p.y) * scale <= 8; });
        if (!hit) return;
        session.begin();
        publish({ geometry, original: geometry, selector: target.selector, matrix: [...target.pathMatrix], expected: session.version(), ...session.port.view(), pressed: { index: hit.index, kind: hit.kind, start: screen } });
        return;
      }
      if (!value) {
        if (!drawingSpace) throw new Error('The drawing surface is not ready.');
        mapPoint(drawingSpace, screen, true);
        session.begin();
        value = { geometry: { points: [], closed: false }, matrix: [...drawingSpace], expected: session.version(), ...session.port.view() };
      }
      if (value.geometry.points.length >= 3) {
        const first = mapPoint(value.matrix, value.geometry.points[0]);
        if (Math.hypot(first.x - screen.x, first.y - screen.y) * scale <= 8) { finish(true); return; }
      }
      if (value.geometry.points.length >= 512) throw new Error('A path supports at most 512 points.');
      const point = mapPoint(value.matrix, screen, true);
      const geometry = { ...value.geometry, points: [...value.geometry.points, point] };
      validatePath(geometry, true);
      publish({ ...value, geometry, pressed: { index: geometry.points.length - 1, kind: 'point', start: screen } });
    } catch (cause) { fail(cause); }
  };
  const move = (screen: PathPosition) => {
    const value = current.current, pressed = value?.pressed; if (!value || !pressed) return;
    try {
      fresh(value);
      if (Math.hypot(screen.x - pressed.start.x, screen.y - pressed.start.y) * scale < 2) return;
      const to = mapPoint(value.matrix, screen, true);
      if (value.selector) publish({ ...value, geometry: movePathPoint(value.original!, pressed.index, pressed.kind, to) });
      else {
        const point = value.geometry.points[pressed.index];
        const points = value.geometry.points.map((p, i) => i === pressed.index ? { ...point, out: to, in: { x: 2 * point.x - to.x, y: 2 * point.y - to.y } } : p);
        const geometry = { ...value.geometry, points }; validatePath(geometry, true); publish({ ...value, geometry });
      }
    } catch (cause) { fail(cause); }
  };
  const end = () => {
    const value = current.current; if (!value?.pressed) return;
    try {
      fresh(value);
      if (value.selector) {
        session.execute({ documentId: session.documentId, expected: value.expected, transactionId: crypto.randomUUID(), operations: [{ kind: 'path.edit', selector: value.selector, geometry: value.geometry }] });
        current.current = null; setDraft(null);
      } else publish({ ...value, pressed: undefined });
    } catch (cause) { fail(cause); }
  };
  const key = (key: string) => {
    if (key === 'Escape') { cancel(); completed(); return true; }
    if (!current.current || current.current.selector) return false;
    if (key === 'Enter') { finish(false); return true; }
    if (key === 'Backspace') {
      try {
        fresh(current.current);
        const points = current.current.geometry.points.slice(0, -1);
        if (!points.length) cancel(); else publish({ ...current.current, geometry: { ...current.current.geometry, points }, pressed: undefined });
      } catch (cause) { fail(cause); }
      return true;
    }
    return false;
  };
  const valid = draft && sameRevision(draft.expected, session.version()) && draft.time === session.port.view().time && draft.cue === session.port.view().cue;
  const overlay = valid ? { geometry: draft.geometry, matrix: draft.matrix } : info?.geometry && target?.pathMatrix ? { geometry: info.geometry, matrix: target.pathMatrix } : null;
  return { begin, move, end, key, cancel, overlay, error, active: () => !!current.current, pressed: () => !!current.current?.pressed };
}
