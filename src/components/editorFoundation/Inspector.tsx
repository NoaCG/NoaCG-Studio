import { memo, useMemo, useState } from 'react';
import type { TimelineView } from './timelineView';
import type { SpxTemplate } from '../../model/types';
import { baseValues, type BasePatch } from '../../blocks/baseEdits';
import { slotSize } from '../../blocks/designLayout';
import type { EditorSession } from './session';
import type { EditorOperation } from './operations';
import ArtworkAppearance from './ArtworkAppearance';
import AnimationProperties from './AnimationProperties';
import type { RenderedPart } from './protocol';
import { editTarget } from './animationAuthoring';
interface Props {
  time: number;
  pause: () => void;
  view: TimelineView; template: SpxTemplate; selection: string[];
  select: (selector: string | null, toggle: boolean) => void;
  session: EditorSession; linked: boolean; setLinked: (value: boolean) => void;
  appearance?: RenderedPart['appearance'];
  previewCss: (css: string) => void;
  previewTemplate: (template: SpxTemplate) => void;
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
function Inspector({ view, template, selection, select, session, linked, setLinked, appearance, previewCss, previewTemplate, pause, time }: Props) {
  const [tab, setTab] = useState('properties');
  const [error, setError] = useState('');
  const part = view.parts.find(p => p.selector === selection[0]), cue = session.port.view().cue;
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
  return <aside className="ef-inspector" aria-label="Inspector" onFocusCapture={pause} onPointerDownCapture={pause}>
    <div className="ef-toolbar" role="tablist" aria-label="Inspector view">
      <button role="tab" aria-selected={tab === 'properties'} onClick={() => setTab('properties')}>Properties</button>
      <button role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>Outline</button>
    </div>
    {tab === 'outline' ? <div className="ef-inspector-body">
      <h2>Source outline</h2><p className="ef-muted">The same layers and selection as the timeline.</p>
      {view.parts.map(item => <button className="ef-outline-item" key={item.selector}
        style={{ paddingInlineStart: 8 + (item.depth ?? 0) * 8 }}
        aria-pressed={selection.includes(item.selector)}
        onClick={event => select(item.selector, event.shiftKey || event.ctrlKey || event.metaKey)}>{item.label}<code>{item.selector}</code></button>)}
    </div> : <div className="ef-inspector-body">
      <h2>{part?.label ?? 'Graphic'}</h2>
      {selection.length > 1 && <><p>{selection.length} layers selected</p>
        {/* On a flag each layer can edit a different cue (G02): name where each edit lands. */}
        {view.data && <ul className="ef-segment-targets" data-testid="segment-targets" aria-label="Where edits land">
          {selection.map(selector => <li key={selector}>{view.parts.find(p => p.selector === selector)?.label ?? selector} · {editTarget(template, selector, time, cue)}</li>)}
        </ul>}</>}
      {part ? <>
        {selection.length === 1 && <><ArtworkAppearance key={session.documentId + part.selector} template={template} selector={part.selector} session={session} appearance={appearance} previewCss={previewCss} previewTemplate={previewTemplate} />
          <AnimationProperties key={'animation:' + session.documentId + part.selector} template={template} selector={part.selector} session={session} appearance={appearance} linked={linked} />
          <label className="ef-link"><input type="checkbox" checked={linked} onChange={event => setLinked(event.target.checked)} /> Link proportions</label></>}
        <div className="ef-edit-actions">
          <button onClick={() => execute({ kind: 'layer.duplicate', selector: part.selector })} disabled={selection.length !== 1}>Duplicate</button>
          <button onClick={() => execute({ kind: 'layer.delete', selector: part.selector })} disabled={selection.length !== 1}>Delete</button>
          <button onClick={() => execute({ kind: 'layer.reorder', selector: part.selector, direction: 'backward' })} disabled={selection.length !== 1}>Send backward</button>
          <button onClick={() => execute({ kind: 'layer.reorder', selector: part.selector, direction: 'forward' })} disabled={selection.length !== 1}>Bring forward</button>
        </div>
        {base && selection.length === 1 && <details><summary>Edit base values (preserve motion)</summary>
          <span className="ef-section-label">{base.mode === 'flow' ? 'Layout offset' : 'Position'} · base</span>
          <div className="ef-number-row">
            <Numeric key={part.selector + 'x'} label={base.mode === 'flow' ? 'Base Layout offset X' : 'Base Position X'} value={base.x} commit={x => change({ x })} />
            <Numeric key={part.selector + 'y'} label={base.mode === 'flow' ? 'Base Layout offset Y' : 'Base Position Y'} value={base.y} commit={y => change({ y })} />
          </div>
          <span className="ef-section-label">Scale · base</span>
          {base.scaleReason ? <p className="ef-muted">{base.scaleReason}</p> : <><div className="ef-number-row"><Numeric label="Base Scale X %" value={base.scaleX * 100} commit={x => scale('scaleX', x)} />
            <Numeric label="Base Scale Y %" value={base.scaleY * 100} commit={y => scale('scaleY', y)} /></div>
          </>}
          {box && <><span className="ef-section-label">Text box · reflow</span><div className="ef-number-row">
            <Numeric label="Box width" value={box.width} commit={width => execute({ kind: 'box.resize', selector: part.selector, width, height: box.height })} />
            <Numeric label="Box height" value={box.height} commit={height => execute({ kind: 'box.resize', selector: part.selector, width: box.width, height })} />
          </div></>}
          <p className="ef-muted">Base edits preserve existing motion. Position uses the parent’s coordinates.</p>
        </details>}
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
