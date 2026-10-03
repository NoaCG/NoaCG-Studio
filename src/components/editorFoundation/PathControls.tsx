import { useRef, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import type { FieldDescriptor } from '../../model/fieldModel';
import { inspectPath, pathNode, type PathPaint } from '../../blocks/editorPaths';
import { FieldControl } from '../fields/FieldControl';
import type { EditorSession, Revision } from './session';

function PaintField({ descriptor, value, property, selector, session, testId }: {
  descriptor: FieldDescriptor; value: string | number; property: keyof PathPaint; selector: string; session: EditorSession; testId: string;
}) {
  const [draft, setDraft] = useState<string | number>(value), [error, setError] = useState('');
  const edit = useRef<{ expected: Revision; value: string | number } | null>(null);
  const finish = () => {
    const pending = edit.current; edit.current = null; if (!pending) return;
    try {
      session.execute({ documentId: session.documentId, expected: pending.expected, transactionId: crypto.randomUUID(), operations: [{ kind: 'path.paint', selector, values: { [property]: pending.value } }] });
      setError('');
    } catch (cause) { setDraft(value); setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <div data-testid={testId} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) finish(); }} onKeyDown={event => {
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); edit.current = null; setDraft(value); }
  }}>
    <label className="ef-section-label">{descriptor.label}</label>
    <FieldControl descriptor={descriptor} value={draft} onChange={next => { edit.current = { expected: edit.current?.expected ?? session.version(), value: next }; setDraft(next); }} />
    {property !== 'width' && <button aria-label={'No ' + property} aria-pressed={draft === 'none'} onClick={() => {
      edit.current = { expected: edit.current?.expected ?? session.version(), value: 'none' }; setDraft('none'); finish();
    }}>None</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
export default function PathControls({ template, selector, session, editPoints }: { template: SpxTemplate; selector: string; session: EditorSession; editPoints: (selector: string) => void }) {
  const info = inspectPath(template, selector), node = pathNode(template, selector);
  if (!info || !node) return null;
  const width = (node.getAttribute('stroke-width') ?? '1').trim();
  const supportedWidth = /^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i.test(width) && Number.isFinite(parseFloat(width));
  return <div className="ef-path-controls">
    <span className="ef-section-label">Path</span>
    <button disabled={!info.geometry} onClick={() => editPoints(selector)}>Edit points</button>
    {info.reason && <p className="ef-muted" data-testid="path-reason">{info.reason}</p>}
    <p className="ef-muted">Drag points or tangents on the canvas. Select edits the whole layer.</p>
    {(['fill', 'stroke'] as const).map(property => <PaintField key={property + session.version().source} descriptor={{ key: property, label: property === 'fill' ? 'Fill' : 'Stroke', kind: 'color', defaultValue: '#8bd5f6' }} value={node.getAttribute(property) ?? (property === 'fill' ? '#000000' : 'none')} property={property} selector={selector} session={session} testId={'path-' + property} />)}
    {supportedWidth ? <PaintField key={'width' + session.version().source} descriptor={{ key: 'stroke-width', label: 'Stroke width', kind: 'number', defaultValue: 3, min: 0, max: 1000, step: 1 }} value={parseFloat(width)} property="width" selector={selector} session={session} testId="path-stroke-width" />
      : <p className="ef-muted" data-testid="path-width-reason">Stroke width uses units this control cannot preserve. Its source is preserved.</p>}
  </div>;
}
