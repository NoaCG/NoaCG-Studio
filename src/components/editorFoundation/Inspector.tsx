import { memo, useMemo, useState } from 'react';
import type { TimelineView } from './timelineView';
import type { SpxTemplate } from '../../model/types';
interface Props {
  view: TimelineView; template: SpxTemplate; selection: string[];
  select: (selector: string | null, toggle: boolean) => void;
}
function Inspector({ view, template, selection, select }: Props) {
  const [tab, setTab] = useState('properties');
  const part = view.parts.find(p => p.selector === selection[0]);
  const node = useMemo(() => part ? new DOMParser().parseFromString(template.html, 'text/html').querySelector(part.selector) : null, [template.html, part]);
  const tracks = part ? [...new Set(view.data?.steps.flatMap(s => Object.keys(s.layers[part.selector] ?? {})) ?? [])] : [];
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
        <span className="ef-section-label">Source layer</span>
        <dl><dt>Element</dt><dd>{node?.tagName.toLowerCase()}</dd><dt>Selector</dt><dd><code>{part.selector}</code></dd>
          <dt>Kind</dt><dd>{part.kind}</dd></dl>
        {node?.textContent?.trim() && <><span className="ef-section-label">Text</span><p className="ef-text-preview">{node.textContent.trim().slice(0, 400)}</p></>}
        <span className="ef-section-label">Animation</span><p>{tracks.length ? tracks.join(', ') : 'Static layer'}</p>
        <p className="ef-muted">Inspect and scrub this graphic. Base transforms and drawing tools arrive in the next slice.</p>
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
