import { useState } from 'react';
import { FieldControl } from '../fields/FieldControl';
import type { EditorSession } from './session';

export default function ArtworkTextEditor({ selector, text, session, close, autoFocus = false }: {
  selector: string; text: string; session: EditorSession; close?: () => void; autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(text);
  const [expected] = useState(() => session.version());
  const [error, setError] = useState('');
  const apply = () => {
    try {
      session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [{ kind: 'text.set', selector, text: draft }] });
      close?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <div className="ef-text-editor" ref={node => { if (autoFocus && node) node.querySelector('textarea')?.focus(); }}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { setDraft(text); close?.(); }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); apply(); }
    }}>
    <label>Artwork text<FieldControl descriptor={{ key: selector, label: 'Artwork text', kind: 'lines', defaultValue: text }} value={draft} onChange={value => setDraft(String(value))} /></label>
    <div className="ef-edit-actions"><button onClick={apply} disabled={draft === text}>Apply text</button><button onClick={() => { setDraft(text); close?.(); }}>Cancel</button></div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
