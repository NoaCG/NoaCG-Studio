import { useMemo, useState } from 'react';
import { baseValues } from '../../blocks/baseEdits';
import { anchorChannels, anchorKeyReason } from '../../blocks/editorAnimation';
import type { SpxTemplate } from '../../model/types';
import type { EditorSession, Revision } from './session';
import type { EditorOperation } from './operations';
import type { RenderedPart } from './protocol';
import { anchorAtPlayhead, editAnchorAtPlayhead, requireCurrentPose } from './animationAuthoring';
import { AnimationButtons, AnimationNumber } from './AnimationProperties';

/**
 * The anchor point (R1.2b.1, docs/research/editor-r1-2b-1): where Rotation and Scale pivot, in layer
 * pixels from the top-left of the layer's box. All three edits move only the pivot, never Position.
 */
export default function AnchorPoint({ template, selector, session, appearance, seek }: {
  template: SpxTemplate; selector: string; session: EditorSession; appearance?: RenderedPart['appearance'];
  seek: (time: number, cue?: number) => void;
}) {
  const [error, setError] = useState('');
  const keyReason = useMemo(() => anchorKeyReason(template, selector), [template, selector]);
  let base;
  try { base = baseValues(template, selector); } catch { return null; }
  const { time, cue } = session.port.view();
  const anchor = base.anchorReason ? null : anchorAtPlayhead(template, base, appearance, time, cue);
  if (!anchor) return <div className="ef-anchor" data-reveal="a" tabIndex={-1}><span className="ef-section-label">Anchor point</span><p className="ef-muted">{base.anchorReason ?? 'Reading the layer’s pivot from the preview…'}</p></div>;
  const channels = anchorChannels(base);
  const run = (operations: () => EditorOperation[], expected: Revision) => {
    try {
      const batch = operations();
      if (batch.length) session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: batch });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const commit = (axis: 'x' | 'y') => (value: number, expected: Revision, at: number, atCue?: number) => run(() => {
    const current = session.port.view();
    if (at !== current.time || atCue !== current.cue || current.selectedParts.length !== 1 || current.selectedParts[0] !== selector) throw new Error('The selection or playhead changed. Inspect the value again before editing.');
    requireCurrentPose(appearance, at, expected, atCue);
    return editAnchorAtPlayhead(template, base, anchor, { [axis]: value }, at, atCue);
  }, expected);
  const centre = () => run(() => {
    // The box's centre is read from the rendered pose, so it must be this revision's.
    const current = session.port.view();
    if (current.selectedParts.length !== 1 || current.selectedParts[0] !== selector) throw new Error('The selection changed. Inspect the pivot again before editing.');
    requireCurrentPose(appearance, current.time, session.version(), current.cue);
    const box = appearance?.box, unit = appearance?.unit ?? 1;
    if (!box) throw new Error('Wait for the rendered box before centring its anchor.');
    return editAnchorAtPlayhead(template, base, anchor, { x: box[0] / 2 / unit, y: box[1] / 2 / unit }, current.time, current.cue);
  }, session.version());
  return <div className="ef-anchor" data-reveal="a" tabIndex={-1}>
    <span className="ef-section-label">Anchor point</span>
    {(['x', 'y'] as const).map(axis => {
      const label = 'Anchor ' + axis.toUpperCase();
      return <div className="ef-transform-property" key={axis}>
        <AnimationNumber label={label} value={anchor[axis]} commit={commit(axis)} session={session} />
        {!keyReason && <AnimationButtons label={label} property={channels[axis]} template={template}
          selector={selector} session={session} appearance={appearance} seek={seek} />}
      </div>;
    })}
    <div className="ef-key-controls">
      <button onClick={centre}>Center anchor</button>
      {keyReason && <span className="ef-muted">{keyReason}</span>}
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
