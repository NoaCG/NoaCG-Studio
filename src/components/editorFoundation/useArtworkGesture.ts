import { useRef, useState, type PointerEvent } from 'react';
import type { SpxTemplate } from '../../model/types';
import { baseValues, type BaseValues, type Creation, type CreationKind } from '../../blocks/baseEdits';
import type { EditorSession, Revision } from './session';
import type { EditorOperation } from './operations';
import type { PreviewController } from './PreviewController';
import type { PreviewReply, RenderedPart } from './protocol';

type Point = { x: number; y: number };
export function inverseDelta(matrix: number[], point: Point): Point {
  const [a, b, c, d] = matrix, det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) throw new Error('This parent transform is singular. Restore a nonzero parent scale first.');
  return { x: (d * point.x - c * point.y) / det, y: (-b * point.x + a * point.y) / det };
}
interface Gesture {
  expected: Revision; start: Point; operations: EditorOperation[]; moved: boolean;
  base?: BaseValues; part?: RenderedPart; handle?: number; creation?: Creation;
}
export function useArtworkGesture(template: SpxTemplate, session: EditorSession, preview: () => PreviewController | null,
  linked: boolean, drawingSpace: PreviewReply['drawingSpace']) {
  const [tool, setTool] = useState<'select' | CreationKind>('select');
  const [draft, setDraft] = useState<Creation | null>(null);
  const [error, setError] = useState('');
  const current = useRef<Gesture | null>(null);
  const cancel = () => {
    if (current.current) { session.cancel(); preview()?.previewCss(template.css, 'cancel'); }
    current.current = null; setDraft(null); setTool('select');
  };
  const begin = (point: Point, part?: RenderedPart, handle?: number) => {
    setError('');
    try {
      const expected = session.version();
      const base = part ? baseValues(template, part.selector) : undefined;
      if (handle !== undefined && base?.scaleReason) throw new Error(base.scaleReason);
      if (handle !== undefined && base && (base.scaleX === 0 || base.scaleY === 0)) {
        throw new Error('This layer has a zero scale axis. Restore it with the numeric Scale controls first.');
      }
      if (base && part?.parent) inverseDelta(part.parent, { x: 0, y: 0 });
      if (!base && tool === 'select') return;
      if (!base && !drawingSpace) throw new Error('The drawing surface is not ready.');
      const local = drawingSpace ? inverseDelta(drawingSpace, { x: point.x - drawingSpace[4], y: point.y - drawingSpace[5] }) : point;
      const creation = !base && tool !== 'select' ? { shape: tool, x: local.x, y: local.y, width: 160, height: 90 } : undefined;
      session.begin(expected);
      current.current = { expected, start: point, operations: [], moved: false, base, part, handle, creation };
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
  };
  const move = (point: Point, modifiers: { shiftKey: boolean; altKey: boolean }) => {
    const gesture = current.current;
    if (!gesture) return;
    try {
      const delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
      if (Math.hypot(delta.x, delta.y) < 2 && !gesture.moved) return;
      gesture.moved = true;
      if (gesture.creation && drawingSpace) {
        const change = inverseDelta(drawingSpace, delta);
        let w = change.x, h = change.y;
        if (modifiers.shiftKey && gesture.creation.shape !== 'text') {
          const side = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * side; h = Math.sign(h || 1) * side;
        }
        const geometry = { ...gesture.creation, x: gesture.creation.x + Math.min(0, w), y: gesture.creation.y + Math.min(0, h),
          width: Math.max(1, Math.abs(w)), height: Math.max(1, Math.abs(h)), box: gesture.creation.shape === 'text' };
        gesture.operations = [{ kind: 'layer.create', geometry }]; setDraft(geometry);
        return;
      }
      const base = gesture.base!, part = gesture.part!;
      let change = inverseDelta(part.parent ?? [1, 0, 0, 1], delta);
      let values = { x: base.x + change.x, y: base.y + change.y, scaleX: base.scaleX, scaleY: base.scaleY };
      if (gesture.handle !== undefined && part.corners) {
        const handle = part.corners[gesture.handle], opposite = part.corners[(gesture.handle + 2) % 4];
        const pivot = modifiers.altKey ? part.anchor ?? { x: (handle.x + opposite.x) / 2, y: (handle.y + opposite.y) / 2 } : opposite;
        const start = inverseDelta(part.parent!, { x: handle.x - pivot.x, y: handle.y - pivot.y });
        let sx = Math.abs(start.x) < .001 ? 1 : (start.x + change.x) / start.x;
        let sy = Math.abs(start.y) < .001 ? 1 : (start.y + change.y) / start.y;
        if (linked !== modifiers.shiftKey) sx = sy = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
        const anchor = part.anchor ?? { x: (handle.x + opposite.x) / 2, y: (handle.y + opposite.y) / 2 };
        const offset = inverseDelta(part.parent!, { x: anchor.x - pivot.x, y: anchor.y - pivot.y });
        values = { x: base.x + (sx - 1) * offset.x, y: base.y + (sy - 1) * offset.y,
          scaleX: base.scaleX === 0 ? sx - 1 : base.scaleX * sx, scaleY: base.scaleY === 0 ? sy - 1 : base.scaleY * sy };
      } else if (modifiers.shiftKey) {
        change = Math.abs(change.x) >= Math.abs(change.y) ? { x: change.x, y: 0 } : { x: 0, y: change.y };
        values = { ...values, x: base.x + change.x, y: base.y + change.y };
      }
      gesture.operations = [{ kind: 'base.set', selector: base.selector, values }];
      preview()?.noteInput('drag');
      preview()?.previewCss(session.preview(gesture.operations).template.css);
    } catch (cause) { cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const end = () => {
    const gesture = current.current;
    if (!gesture) return;
    try {
      if (gesture.creation && !gesture.moved) gesture.operations = [{ kind: 'layer.create', geometry: { ...gesture.creation,
        width: gesture.creation.shape === 'text' ? 320 : 120, height: gesture.creation.shape === 'text' ? 64 : 120, box: false } }];
      if (gesture.operations.length) {
        preview()?.noteInput('commit');
        session.execute({ documentId: session.documentId, expected: gesture.expected, transactionId: crypto.randomUUID(), operations: gesture.operations });
      } else session.cancel();
    } catch (cause) { preview()?.previewCss(template.css, 'cancel'); session.cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
    current.current = null; setDraft(null); if (gesture.creation) setTool('select');
  };
  return { tool, setTool, draft, error, begin, move, end, cancel, active: () => !!current.current };
}

export function pointerPoint(event: PointerEvent, size: { width: number; height: number }, pan: Point, scale: number, width: number, height: number): Point {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - box.left - size.width / 2 - pan.x) / scale + width / 2,
    y: (event.clientY - box.top - size.height / 2 - pan.y) / scale + height / 2 };
}
