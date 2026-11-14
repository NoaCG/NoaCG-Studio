import { useMemo, useRef, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import { compositionValues, type CompositionValues } from '../../blocks/compositionEdits';
import type { EditorSession, Revision } from './session';

function NumberField({ label, value, session, commit }: { label: string; value: number; session: EditorSession; commit: (value: number, expected: Revision) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const expected = useRef<Revision | null>(null);
  const finish = () => {
    if (draft !== null && draft.trim() && Number.isFinite(Number(draft)) && Number(draft) !== value) commit(Number(draft), expected.current ?? session.version());
    setDraft(null); expected.current = null;
  };
  return <label className="ef-number"><span>{label}</span><input aria-label={label} type="text" inputMode="decimal" value={draft ?? String(value)}
    onFocus={() => { expected.current = session.version(); }} onChange={event => setDraft(event.target.value)} onBlur={finish} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); finish(); }
      if (event.key === 'Escape') { event.stopPropagation(); setDraft(null); expected.current = null; }
    }} /></label>;
}
export default function WholeGraphicControls({ template, session }: { template: SpxTemplate; session: EditorSession }) {
  const [error, setError] = useState('');
  const capability = useMemo(() => {
    try { return { values: compositionValues(template), reason: '' }; }
    catch (cause) { return { values: null, reason: cause instanceof Error ? cause.message : String(cause) }; }
  }, [template]);
  const commit = (values: Partial<CompositionValues>, expected = session.version()) => {
    try { session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [{ kind: 'composition.set', values }] }); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const values = capability.values;
  return <section aria-label="Whole graphic placement"><span className="ef-section-label">Whole graphic placement</span>
    {values ? <><div className="ef-number-row">
      <NumberField label="Graphic position X" value={values.x} session={session} commit={(x, expected) => commit({ x }, expected)} />
      <NumberField label="Graphic position Y" value={values.y} session={session} commit={(y, expected) => commit({ y }, expected)} />
    </div><NumberField label="Graphic scale %" value={values.scale * 100} session={session} commit={(scale, expected) => commit({ scale: scale / 100 }, expected)} />
      <button onClick={() => commit({ x: 0, y: 0, scale: 1 })}>Reset graphic placement</button></> : <p className="ef-muted">{capability.reason}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
