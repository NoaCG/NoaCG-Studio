import { useRef, useState, type MouseEvent } from 'react';
import type { SpxTemplate } from '../../model/types';
import { baseValues, type BaseValues, type Creation, type CreationKind } from '../../blocks/baseEdits';
import type { EditorSession, Revision } from './session';
import { applyOperations, type EditorOperation } from './operations';
import type { PreviewController } from './PreviewController';
import type { PreviewReply, RenderedPart } from './protocol';
import { anchorOperations, authoredTransform, displayedBase, editingPose, keysControl, requireCurrentPose, shownAnchor } from './animationAuthoring';
import { requireScaleWritable } from '../../blocks/editorAnimation';
import { resizableTextBox } from '../../blocks/designLayout';
import { ownerOf, readTimeline } from './timelineView';
import { apply, centreOf, edgePoints, handleRatios, invert, localFrame, multiply, ownLinear, pivotShift, resizeBox, snapRotation, sweep, type Linear, type Point } from './transformGestures';

/** A screen vector in a parent's coordinates (the 2x2 part of `matrix`, which may carry a translation). */
export const inverseDelta = (matrix: number[], point: Point): Point =>
  apply(invert(matrix.slice(0, 4) as Linear, 'This parent transform is singular. Restore a nonzero parent scale first.'), point);
/** What a press on the selected layer grabbed (R1.2b.1): a corner or side scale handle (corners and
 *  sides numbered from the top-left, clockwise), the rotation handle, or the anchor (the Anchor tool). */
export type Handle = { kind: 'corner' | 'edge'; index: number } | { kind: 'rotate' } | { kind: 'anchor' };
type Tool = 'select' | 'anchor' | 'pen' | CreationKind;
interface Gesture {
  expected: Revision; start: Point; operations: EditorOperation[]; moved: boolean;
  base?: BaseValues; part?: RenderedPart; handle?: Handle; creation?: Creation;
  members?: { base: BaseValues; part: RenderedPart }[];
  time: number;
  /** The rotation handle's last pointer and the angle swept so far, unwrapped. */
  turn?: { last: Point; swept: number };
  /** Whether the preview shows this drag's draft rather than the source. */
  drafted?: boolean;
}
const centre = (part: RenderedPart) => part.corners ? centreOf(part.corners) : { x: part.x + part.width / 2, y: part.y + part.height / 2 };
/** The layer's own frame on screen, from its rendered corners. */
const frameOf = (part: RenderedPart) => localFrame(part.corners ?? [], part.appearance?.box ?? [0, 0]);
export function useArtworkGesture(template: SpxTemplate, session: EditorSession, preview: () => PreviewController | null,
  linked: boolean, drawingSpace: PreviewReply['drawingSpace']) {
  const [tool, setTool] = useState<Tool>('select');
  const [draft, setDraft] = useState<Creation | null>(null);
  const [error, setError] = useState('');
  const current = useRef<Gesture | null>(null);
  /** Preview a move's operations; a move back to where the drag began (a Shift turn snapping to its
   *  start) shows the source again, once. */
  const show = (gesture: Gesture) => {
    preview()?.noteInput('drag');
    if (gesture.operations.length) { preview()?.previewTemplate(session.preview(gesture.operations).template); gesture.drafted = true; }
    else if (gesture.drafted) { preview()?.previewTemplate(template); gesture.drafted = false; }
  };
  const cancel = () => {
    const active = !!current.current;
    if (active) { session.cancel(); preview()?.previewTemplate(template, 'cancel'); }
    current.current = null; setDraft(null);
    // Escape during an anchor drag ends the drag; the Anchor tool stays for the next one.
    if (!active && tool === 'anchor') setTool('select');
  };
  const begin = (point: Point, part?: RenderedPart, handle?: Handle, selected?: RenderedPart[]) => {
    setError('');
    try {
      const expected = session.version();
      const base = part ? baseValues(template, part.selector) : undefined;
      const { time, cue } = session.port.view();
      if (part) requireCurrentPose(part.appearance, time, expected, cue);
      const scaling = handle?.kind === 'corner' || handle?.kind === 'edge';
      // Animated Scale keys its own channels: refuse at the press where none can take the key.
      if (scaling && base?.scaleReason) requireScaleWritable(template, base.selector);
      if (scaling && base && (base.scaleX === 0 || base.scaleY === 0)) {
        throw new Error('This layer has a zero scale axis. Restore it with the numeric Scale controls first.');
      }
      if (handle?.kind === 'anchor' && base?.anchorReason) throw new Error(base.anchorReason);
      if (part && scaling) invert(frameOf(part));
      // A turn writes what typing a Rotation writes: try one degree now, so a refusal shows at the press.
      if (handle?.kind === 'rotate' && base && part) {
        const shown = displayedBase(base, editingPose(template, base.selector, part.appearance, time, part.appearance?.cue), 'rotation');
        const trial = authoredTransform(template, base.selector, base, part.appearance, { rotation: shown + 1 }, time);
        if (trial.length) applyOperations(template, trial, false);
      }
      if (base && part?.parent) inverseDelta(part.parent, { x: 0, y: 0 });
      const doc = new DOMParser().parseFromString(template.html, 'text/html');
      const members = selected?.filter(item => !selected.some(other => other !== item && doc.querySelector(other.selector)?.contains(doc.querySelector(item.selector) ?? null)))
        .map(part => { const base = baseValues(template, part.selector); inverseDelta(part.parent ?? [1, 0, 0, 1], { x: 0, y: 0 }); return { base, part }; });
      if (!base && (tool === 'select' || tool === 'anchor' || tool === 'pen')) return;
      if (!base && !drawingSpace) throw new Error('The drawing surface is not ready.');
      const local = drawingSpace ? inverseDelta(drawingSpace, { x: point.x - drawingSpace[4], y: point.y - drawingSpace[5] }) : point;
      const creation = !base && tool !== 'select' && tool !== 'anchor' && tool !== 'pen' ? { shape: tool, x: local.x, y: local.y, width: 160, height: 90 } : undefined;
      session.begin(expected);
      current.current = { expected, start: point, operations: [], moved: false, base, part, handle, creation, members, time,
        turn: handle?.kind === 'rotate' ? { last: point, swept: 0 } : undefined };
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
  };
  const move = (point: Point, modifiers: { shiftKey: boolean; altKey: boolean }) => {
    const gesture = current.current;
    if (!gesture) return;
    try {
      const delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
      if (Math.hypot(delta.x, delta.y) < 2 && !gesture.moved) return;
      gesture.moved = true;
      if (gesture.members?.length && gesture.handle === undefined) {
        const constrained = modifiers.shiftKey ? Math.abs(delta.x) >= Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y } : delta;
        gesture.operations = gesture.members.flatMap(({ base, part }) => {
          const change = inverseDelta(part.parent ?? [1, 0, 0, 1], constrained);
          // Each layer moves from the pose it edits: on a flag, a layer starting there from its departing cue's.
          const pose = editingPose(template, base.selector, part.appearance, gesture.time, part.appearance?.cue);
          return authoredTransform(template, base.selector, base, part.appearance, { x: displayedBase(base, pose, 'x') + change.x, y: displayedBase(base, pose, 'y') + change.y }, gesture.time);
        });
        show(gesture);
        return;
      }
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
      const originalBase = gesture.base!, part = gesture.part!, handle = gesture.handle;
      const pose = editingPose(template, originalBase.selector, part.appearance, gesture.time, part.appearance?.cue);
      const base = { ...originalBase, ...Object.fromEntries((['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const).map(p => [p, displayedBase(originalBase, pose, p)])) };
      const anchor = part.anchor ?? centre(part);
      const box = handle?.kind === 'edge' ? resizableTextBox(template, originalBase.selector) : null;
      if (handle?.kind === 'rotate') {
        // Unwrapped: each move adds the angle swept since the last one, so two turns are 720.
        const turn = gesture.turn!;
        turn.swept += sweep(part.parent!, anchor, turn.last, point); turn.last = point;
        const turned = base.rotation + turn.swept;
        gesture.operations = authoredTransform(template, base.selector, originalBase, part.appearance, { rotation: modifiers.shiftKey ? snapRotation(turned) : turned }, gesture.time);
      } else if (handle?.kind === 'anchor') {
        // Only the pivot moves (owner, 2026-10-01). With Position unchanged it moves in the parent's
        // axes, so the pointer maps through the parent, as a Position drag does, and stays on it.
        const moved = inverseDelta(part.parent ?? [1, 0, 0, 1], delta), from = shownAnchor(originalBase, pose);
        if (!from) throw new Error('Wait for the rendered anchor before editing it.');
        gesture.operations = anchorOperations(base.selector, { x: from.x + moved.x, y: from.y + moved.y });
      } else if (handle?.kind === 'edge' && box) {
        // A text box's side resizes it (owner, 2026-10-02): its letters keep their size and the
        // opposite side stays, measured in the box's own axes and design pixels.
        const unit = part.appearance?.unit ?? 1, origin = part.appearance?.origin ?? [box.width * unit / 2, box.height * unit / 2];
        const { size, shift } = resizeBox(frameOf(part).map(v => v * unit) as Linear, part.parent!, { x: box.width, y: box.height },
          { x: origin[0] / unit, y: origin[1] / unit }, !!originalBase.anchor, handle.index, delta);
        const round = (v: number) => Math.round(v * 1000) / 1000;
        gesture.operations = [{ kind: 'style.set', selector: originalBase.selector, values: { width: round(size.x), height: round(size.y) } }];
        if (Math.abs(shift.x) > 1e-6 || Math.abs(shift.y) > 1e-6) gesture.operations.push({ kind: 'base.set', selector: originalBase.selector, values: { x: round(originalBase.x + shift.x), y: round(originalBase.y + shift.y) } });
      } else if (handle && part.corners) {
        // Scale in the layer's own axes about the opposite corner or side, or the anchor with Alt. A keyed
        // scale is GSAP's, the innermost part of what renders, so its axes are the rendered sides. A base
        // scale is CSS scale, which turns with the layer's rotation but sits outside its own CSS transform
        // (a skew, or an SVG element's transform attribute): its axes are its parent's turned by the
        // layer's rotation (a placed text's box, by its base rotation only).
        const corner = handle.kind === 'corner', points = corner ? part.corners : edgePoints(part.corners);
        const pivot = modifiers.altKey ? anchor : points[(handle.index + 2) % 4];
        const view = readTimeline(template), owner = ownerOf(view, originalBase.selector);
        const keyed = keysControl(view.data, owner, 'scaleX') || keysControl(view.data, owner, 'scaleY');
        const frame = keyed ? frameOf(part) : multiply(part.parent!, ownLinear(originalBase.mode === 'placed' ? originalBase.rotation : base.rotation, 1, 1));
        const ratios = handleRatios(frame, points[handle.index], pivot, delta, corner ? 'xy' : handle.index % 2 ? 'x' : 'y', corner ? linked !== modifiers.shiftKey : modifiers.shiftKey);
        const shift = pivotShift(part.parent!, frame, ratios, pivot, anchor);
        gesture.operations = authoredTransform(template, base.selector, originalBase, part.appearance, { x: base.x + shift.x, y: base.y + shift.y,
          scaleX: base.scaleX * ratios.x, scaleY: base.scaleY * ratios.y }, gesture.time);
      } else {
        let change = inverseDelta(part.parent ?? [1, 0, 0, 1], delta);
        if (modifiers.shiftKey) change = Math.abs(change.x) >= Math.abs(change.y) ? { x: change.x, y: 0 } : { x: 0, y: change.y };
        gesture.operations = authoredTransform(template, base.selector, originalBase, part.appearance, { x: base.x + change.x, y: base.y + change.y }, gesture.time);
      }
      show(gesture);
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
    } catch (cause) { preview()?.previewTemplate(template, 'cancel'); session.cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
    current.current = null; setDraft(null);
    return gesture.moved;
  };
  return { tool, setTool, draft, error, begin, move, end, cancel, active: () => !!current.current };
}

export function pointerPoint(event: MouseEvent, size: { width: number; height: number }, pan: Point, scale: number, width: number, height: number): Point {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - box.left - size.width / 2 - pan.x) / scale + width / 2,
    y: (event.clientY - box.top - size.height / 2 - pan.y) / scale + height / 2 };
}
