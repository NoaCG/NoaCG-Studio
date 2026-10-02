import { useState } from 'react';
import { baseValues } from '../../blocks/baseEdits';
import type { SpxTemplate } from '../../model/types';
import type { EditorSession, Revision } from './session';
import type { EditorOperation } from './operations';
import type { RenderedPart } from './protocol';
import { anchorOperations, requireCurrentPose, shownAnchor } from './animationAuthoring';
import { AnimationNumber } from './AnimationProperties';

/**
 * The anchor point (R1.2b.1, docs/research/editor-r1-2b-1): where Rotation and Scale pivot, in layer
 * pixels from the top-left of the layer's box. A static base value (owner decision 2026-10-01): typing
 * and Center anchor, like the canvas Anchor tool, move only the pivot, never Position.
 */
export default function AnchorPoint({ template, selector, session, appearance }: {
  template: SpxTemplate; selector: string; session: EditorSession; appearance?: RenderedPart['appearance'];
}) {
  const [error, setError] = useState('');
  let base;
  try { base = baseValues(template, selector); } catch { return null; }
  // The pivot's place in the box is the same on every cue, so the rendered pose gives it.
  const anchor = base.anchorReason ? null : shownAnchor(base, appearance);
  if (!anchor) return <div className="ef-anchor"><span className="ef-section-label">Anchor point</span><p className="ef-muted">{base.anchorReason ?? 'Reading the layer’s pivot from the preview…'}</p></div>;
  const run = (operations: () => EditorOperation[], expected: Revision) => {
    try {
      const batch = operations();
      if (batch.length) session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: batch });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const commit = (axis: 'x' | 'y') => (value: number, expected: Revision, at: number, atCue?: number) => run(() => {
    if (at !== session.port.view().time || atCue !== session.port.view().cue) throw new Error('The playhead moved. Inspect the value again before editing.');
    requireCurrentPose(appearance, at, expected, atCue);
    return anchorOperations(selector, { ...anchor, [axis]: value });
  }, expected);
  const centre = () => run(() => {
    // The box's centre is read from the rendered pose, so it must be this revision's.
    requireCurrentPose(appearance, session.port.view().time, session.version(), session.port.view().cue);
    const box = appearance?.box, unit = appearance?.unit ?? 1;
    if (!box) throw new Error('Wait for the rendered box before centring its anchor.');
    return anchorOperations(selector, { x: box[0] / 2 / unit, y: box[1] / 2 / unit });
  }, session.version());
  return <div className="ef-anchor">
    <span className="ef-section-label">Anchor point</span>
    <div className="ef-number-row">
      <AnimationNumber label="Anchor X" value={anchor.x} commit={commit('x')} session={session} />
      <AnimationNumber label="Anchor Y" value={anchor.y} commit={commit('y')} session={session} />
    </div>
    <div className="ef-key-controls">
      <button onClick={centre}>Center anchor</button>
      <span className="ef-muted">Base · Rotation and Scale turn about it</span>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
