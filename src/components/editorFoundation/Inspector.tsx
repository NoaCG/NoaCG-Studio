import { memo, useMemo, useState } from 'react';
import type { TimelineView } from './timelineView';
import type { SpxTemplate } from '../../model/types';
import { baseValues, type BasePatch } from '../../blocks/baseEdits';
import { slotSize } from '../../blocks/designLayout';
import type { EditorSession } from './session';
import type { EditorOperation } from './operations';
interface Props {
  view: TimelineView; template: SpxTemplate; selection: string[];
  select: (selector: string | null, toggle: boolean) => void;
  session: EditorSession; linked: boolean; setLinked: (value: boolean) => void;
}
function Numeric({ label, value, commit }: { label: string; value: number; commit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = () => {
    if (draft !== null && draft.trim() && Number.isFinite(Number(draft)) && Number(draft) !== value) commit(Number(draft));
    setDraft(null);
  };
  return <label className="ef-number"><span>{label}</span><input aria-label={label} type="text" inputMode="decimal"
    value={draft ?? String(Math.round(value * 1000) / 1000)} onChange={event => setDraft(event.target.value)} onBlur={finish}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); finish(); }
      if (event.key === 'Escape') { event.stopPropagation(); setDraft(null); }
    }} /></label>;
}
function Inspector({ view, template, selection, select, session, linked, setLinked }: Props) {
  const [tab, setTab] = useState('properties');
  const [error, setError] = useState('');
  const part = view.parts.find(p => p.selector === selection[0]);
  const node = useMemo(() => part ? new DOMParser().parseFromString(template.html, 'text/html').querySelector(part.selector) : null, [template.html, part]);
  const tracks = part ? [...new Set(view.data?.steps.flatMap(s => Object.keys(s.layers[part.selector] ?? {})) ?? [])] : [];
  const capability = useMemo(() => {
    if (!part) return { base: null, reason: '' };
    try { return { base: baseValues(template, part.selector), reason: '' }; }
    catch (cause) { return { base: null, reason: cause instanceof Error ? cause.message : String(cause) }; }
  }, [template, part]);
  const base = capability.base;
  const box = base?.mode === 'placed' ? slotSize(template.css, base.target.slice(1)) : null;
  const execute = (operation: EditorOperation) => {
    try { session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [operation] }); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const change = (values: BasePatch) => { if (part) execute({ kind: 'base.set', selector: part.selector, values }); };
  const scale = (axis: 'scaleX' | 'scaleY', value: number) => {
    if (!base) return;
    const other = axis === 'scaleX' ? 'scaleY' : 'scaleX';
    change({ [axis]: value / 100, ...(linked ? { [other]: base[axis] === 0 ? value / 100 : base[other] * value / 100 / base[axis] } : {}) });
  };
  return <aside className="ef-inspector" aria-label="Inspector">
    <div className="ef-toolbar" role="tablist" aria-label="Inspector view">
      <button role="tab" aria-selected={tab === 'properties'} onClick={() => setTab('properties')}>Properties</button>
      <button role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>Outline</button>
    </div>
    {tab === 'outline' ? <div className="ef-inspector-body">
      <h2>Source outline</h2><p className="ef-muted">The same layers and selection as the timeline.</p>
      {view.parts.map(item => <button className="ef-outline-item" key={item.selector}
        aria-pressed={selection.includes(item.selector)}
        onClick={event => select(item.selector, event.shiftKey || event.ctrlKey || event.metaKey)}>{item.label}<code>{item.selector}</code></button>)}
    </div> : <div className="ef-inspector-body">
      <h2>{part?.label ?? 'Graphic'}</h2>
      {selection.length > 1 && <p>{selection.length} layers selected</p>}
      {part ? <>
        {base && selection.length === 1 && <>
          <span className="ef-section-label">{base.mode === 'flow' ? 'Layout offset' : 'Position'} · base</span>
          <div className="ef-number-row">
            <Numeric key={part.selector + 'x'} label={base.mode === 'flow' ? 'Layout offset X' : 'Position X'} value={base.x} commit={x => change({ x })} />
            <Numeric key={part.selector + 'y'} label={base.mode === 'flow' ? 'Layout offset Y' : 'Position Y'} value={base.y} commit={y => change({ y })} />
          </div>
          <span className="ef-section-label">Scale · base</span>
          {base.scaleReason ? <p className="ef-muted">{base.scaleReason}</p> : <><div className="ef-number-row"><Numeric label="Scale X %" value={base.scaleX * 100} commit={x => scale('scaleX', x)} />
            <Numeric label="Scale Y %" value={base.scaleY * 100} commit={y => scale('scaleY', y)} /></div>
          <label className="ef-link"><input type="checkbox" checked={linked} onChange={event => setLinked(event.target.checked)} /> Link proportions</label></>}
          {box && <><span className="ef-section-label">Text box · reflow</span><div className="ef-number-row">
            <Numeric label="Box width" value={box.width} commit={width => execute({ kind: 'box.resize', selector: part.selector, width, height: box.height })} />
            <Numeric label="Box height" value={box.height} commit={height => execute({ kind: 'box.resize', selector: part.selector, width: box.width, height })} />
          </div></>}
          <p className="ef-muted">Base edits preserve existing motion. Position uses the parent’s coordinates.</p>
        </>}
        {capability.reason && <p className="ef-muted">{capability.reason}</p>}
        {error && <p role="alert">{error}</p>}
        <span className="ef-section-label">Source layer</span>
        <dl><dt>Element</dt><dd>{node?.tagName.toLowerCase()}</dd><dt>Selector</dt><dd><code>{part.selector}</code></dd>
          <dt>Kind</dt><dd>{part.kind}</dd></dl>
        {node?.textContent?.trim() && <><span className="ef-section-label">Text</span><p className="ef-text-preview">{node.textContent.trim().slice(0, 400)}</p></>}
        <span className="ef-section-label">Animation</span><p>{tracks.length ? tracks.join(', ') : 'Static layer'}</p>
      </> : <>
        <dl><dt>Size</dt><dd>{template.resolution.width} × {template.resolution.height}</dd>
          <dt>Frame rate</dt><dd>{template.fps} fps</dd><dt>Layers</dt><dd>{view.parts.length}</dd>
          <dt>Motion</dt><dd>{view.data ? 'Source timeline' : 'Source controlled'}</dd></dl>
        <p className="ef-muted">Select artwork on the canvas or a layer below to inspect it.</p>
      </>}
    </div>}
  </aside>;
}



export default memo(Inspector);
