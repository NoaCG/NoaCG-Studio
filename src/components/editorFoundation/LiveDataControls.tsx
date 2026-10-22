import { useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import { hasLiveData, liveDataUrl } from '../../control/liveData';
import type { EditorOperation } from './operations';

/**
 * A graphic that already reads a Sheet in its own code (the retired graphic-level panel): it keeps
 * running, says what it reads, and can be removed. A graphic without one is offered nothing here:
 * a Sheet connects at the production, with Connect data… on a cue (sheet-data-flow AC-10).
 */
export default function LiveDataControls({ template, execute }: { template: SpxTemplate; execute: (operation: EditorOperation) => void }) {
  const [error, setError] = useState('');
  if (!hasLiveData(template.js)) return null;
  const url = liveDataUrl(template.js);
  const remove = () => {
    try { execute({ kind: 'liveData.remove' }); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section aria-label="Live data">
    <h3>Live data</h3>
    <p role="status">Reads a Sheet in its own code{url ? `: ${url}` : ''}.</p>
    <button onClick={remove}>Remove live data</button>
    <p className="ef-muted">To connect a Sheet now, use Connect data… on a cue in the production.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
