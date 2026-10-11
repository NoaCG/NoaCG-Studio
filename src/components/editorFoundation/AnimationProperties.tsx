import { useState } from 'react';
import { baseValues } from '../../blocks/baseEdits';
import { isArmed, keyedAt, poseKey, sequenceAuthoringReason, writeChannel, type NumericProperty } from '../../blocks/editorAnimation';
import type { SpxTemplate } from '../../model/types';
import type { EditorSession, Revision } from './session';
import type { RenderedPart } from './protocol';
import { ownerOf, readTimeline } from './timelineView';
import { authoredTransform, authoringPosition, displayedBase, editingPose, editTarget, requireCurrentPose } from './animationAuthoring';
import type { EditorOperation } from './operations';
import AnimationNumber from './AnimationNumber';
export { default as AnimationNumber } from './AnimationNumber';

export function AnimationButtons({ template, selector, property, label, session, appearance }: {
  template: SpxTemplate; selector: string; property: NumericProperty; label: string; session: EditorSession; appearance?: RenderedPart['appearance'];
}) {
  const [error, setError] = useState('');
  const { time, cue } = session.port.view();
  const view = readTimeline(template), position = authoringPosition(template, selector, time, cue), owner = ownerOf(view, selector);
  // The control is animated and keyed through any of its channels (R1.2a.6).
  const armed = isArmed(view.data, owner, property), keyed = keyedAt(view.data, owner, property, position.step, position.time);
  const act = (action: 'set' | 'remove' | 'disable') => {
    try {
      requireCurrentPose(appearance, session.port.view().time, session.version(), session.port.view().cue);
      const pose = editingPose(template, selector, appearance, session.port.view().time, session.port.view().cue);
      // A new key captures the channel it writes at its current value; a removal names the control.
      const channel = action === 'set' ? writeChannel(view.data, owner, property) : property;
      const value = pose?.motion?.[poseKey(channel, property)];
      if (value === undefined) throw new Error('Wait for the rendered pose before editing animation.');
      const base = property === 'opacity' ? null : baseValues(template, selector);
      const shown = base ? Object.fromEntries((['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const).map(p => [p, displayedBase(base, pose, p)])) : undefined;
      session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(),
        operations: [{ kind: 'animation.key', selector, property: channel, ...position, value, baseValues: shown, action }] });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <div className="ef-key-controls">
    <button aria-label={(armed ? 'Disable ' : 'Enable ') + label + ' animation'} aria-pressed={armed} title={armed ? 'Remove this property’s keys and retain the current pose' : 'Create one key at the playhead'} onClick={() => act(armed ? 'disable' : 'set')}>◷</button>
    <button aria-label={(keyed ? 'Remove ' : 'Add ') + label + ' key'} aria-pressed={keyed} title={(keyed ? 'Remove' : 'Add') + ' only the ' + label + ' key at the playhead'} onClick={() => act(keyed ? 'remove' : 'set')}>{keyed ? '◆' : '◇'}</button>
    <span className="ef-muted">{editTarget(template, selector, time, cue)} · {armed ? keyed ? 'key' : 'animated' : 'base'}</span>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export default function AnimationProperties({ template, selector, session, appearance, linked, previewTemplate }: {
  template: SpxTemplate; selector: string; session: EditorSession; appearance?: RenderedPart['appearance']; linked: boolean; previewTemplate: (template: SpxTemplate) => void;
}) {
  const [error, setError] = useState('');
  let base;
  try { base = baseValues(template, selector); } catch { return null; }
  const reason = sequenceAuthoringReason(readTimeline(template).data);
  if (reason) return <p className="ef-muted">{reason} Use Edit base values below.</p>;
  // On a flag a layer can edit the departing cue, whose pose the arriving preview keeps hidden.
  const pose = editingPose(template, selector, appearance, session.port.view().time, session.port.view().cue);
  const fields = [['x', base.mode === 'flow' ? 'Layout offset X' : 'Position X'], ['y', base.mode === 'flow' ? 'Layout offset Y' : 'Position Y'], ['scaleX', 'Scale X'], ['scaleY', 'Scale Y'], ['rotation', 'Rotation']] as const;
  return <div className="ef-animation-properties">
    <span className="ef-section-label">Transform at playhead</span>
    {fields.map(([property, label]) => {
      const percent = property.startsWith('scale') ? 100 : 1;
      const value = displayedBase(base, pose, property) * percent;
      const build = (value: number, expected: Revision, time: number, cue?: number): EditorOperation[] => {
        if (time !== session.port.view().time || cue !== session.port.view().cue) throw new Error('The playhead moved. Inspect the value again before editing.');
        requireCurrentPose(appearance, time, expected, cue);
        const other = property === 'scaleX' ? 'scaleY' : 'scaleX';
        const current = displayedBase(base, pose, property);
        const values = { [property]: value / percent, ...(linked && percent === 100 ? { [other]: current === 0 ? value / percent : displayedBase(base, pose, other) * value / percent / current } : {}) };
        return authoredTransform(template, selector, base, appearance, values, time);
      };
      const commit = (value: number, expected: Revision, time: number, cue?: number) => {
        try {
          const operations = build(value, expected, time, cue);
          if (operations.length) session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations });
          setError('');
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      };
      return <div className="ef-transform-property" key={property}><AnimationNumber label={label + (percent === 100 ? ' %' : '')} value={value} commit={commit} session={session} build={build} previewTemplate={previewTemplate} />
        <AnimationButtons {...{ template, selector, session, appearance, property, label }} /></div>;
    })}
    {error && <p role="alert">{error}</p>}
  </div>;
}
