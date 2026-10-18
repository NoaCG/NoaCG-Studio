import { useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import { hasLiveData } from '../../control/liveData';
import { FieldControl } from '../fields/FieldControl';
import type { EditorOperation } from './operations';

export default function LiveDataControls({ template, execute }: { template: SpxTemplate; execute: (operation: EditorOperation) => void }) {
  const [url, setUrl] = useState(''), [pollSeconds, setPollSeconds] = useState(5), [error, setError] = useState('');
  const installed = hasLiveData(template.js);
  const apply = (operation: EditorOperation) => {
    try { execute(operation); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section aria-label="Live data">
    <h3>Live data</h3>
    <label className="ef-appearance-field"><span>Published CSV URL</span><FieldControl descriptor={{ key: 'sheet-url', label: 'Published CSV URL', kind: 'text', defaultValue: '' }} value={url} onChange={value => setUrl(String(value))} /></label>
    <label className="ef-appearance-field"><span>Poll every (seconds)</span><FieldControl descriptor={{ key: 'sheet-poll', label: 'Poll every (seconds)', kind: 'number', defaultValue: 5, min: 1, step: 1 }} value={pollSeconds} onChange={value => setPollSeconds(Number(value))} /></label>
    <button disabled={!url.trim()} onClick={() => apply({ kind: 'liveData.set', csvUrl: url.trim(), pollSeconds })}>{installed ? 'Replace live data' : 'Add live data'}</button>
    {installed && <><p role="status">Live data added.</p><button onClick={() => apply({ kind: 'liveData.remove' })}>Remove live data</button></>}
    <p className="ef-muted">Use a Google Sheet published as CSV. Column headers match the operator field names.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
