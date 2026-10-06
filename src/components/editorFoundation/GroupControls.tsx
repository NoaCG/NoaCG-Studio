import { useState } from 'react';
import type { EditorSession } from './session';
import type { SpxTemplate } from '../../model/types';
import type { RenderedPart } from './protocol';
import { applyOperations } from './operations';
import { requireCurrentPose } from './animationAuthoring';
import type { GroupBox } from '../../blocks/editorGroups';

/** The group's fixed source frame is measured in its parent's local coordinates. */
export function selectionGroupBox(parts: RenderedPart[]): GroupBox {
  const space = parts[0]?.parentSpace;
  if (!space || !space.every(Number.isFinite) || parts.some(part => !part.parentSpace || part.parentSpace.some((value, index) => Math.abs(value - space[index]) > 1e-6))) throw new Error('Group artwork in the same measured parent coordinate space.');
  const [a, b, c, d, e, f] = space, determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) throw new Error('This parent transform is singular. Restore a nonzero parent scale before grouping.');
  const points = parts.flatMap(part => {
    if (!part.corners?.length) throw new Error('Wait for the selected artwork to be measured before grouping.');
    return part.corners.map(point => ({ x: (d * (point.x - e) - c * (point.y - f)) / determinant, y: (-b * (point.x - e) + a * (point.y - f)) / determinant }));
  });
  const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
  return { x, y, width: Math.max(...points.map(point => point.x)) - x, height: Math.max(...points.map(point => point.y)) - y };
}
export default function GroupControls({ template, groups, parts, selection, time, session, disabled, cancel, enter }: {
  template: SpxTemplate; groups: Set<string>; parts: RenderedPart[]; selection: string[]; time: number; session: EditorSession;
  disabled: boolean; cancel: () => void; enter: (selector: string) => void;
}) {
  const [error, setError] = useState('');
  const selectedGroup = selection.length === 1 && groups.has(selection[0]);
  const run = (ungroup: boolean) => {
    cancel(); setError('');
    try {
      const expected = session.version(), cue = session.port.view().cue;
      const targets = selection.map(selector => {
        const part = parts.find(part => part.selector === selector);
        if (!part) throw new Error('Wait for the selected artwork to be measured before grouping.');
        requireCurrentPose(part.appearance, time, expected, cue); return part;
      });
      const operation = ungroup ? { kind: 'group.ungroup' as const, selector: selection[0] }
        : { kind: 'group.create' as const, selectors: selection, box: selectionGroupBox(targets) };
      // The same exact refusal is available to tools and to the visible controls.
      applyOperations(template, [operation], false);
      session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [operation] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <div className="ef-group-controls">
    <button aria-label="Group selection" disabled={disabled || selection.length < 2} onClick={() => run(false)}>Group</button>
    <button aria-label="Ungroup selection" disabled={disabled || !selectedGroup} onClick={() => run(true)}>Ungroup</button>
    <button aria-label="Enter group" disabled={disabled || !selectedGroup} onClick={() => { cancel(); setError(''); enter(selection[0]); }}>Edit group</button>
    {error && <p className="ef-group-error" role="alert">{error}</p>}
  </div>;
}
