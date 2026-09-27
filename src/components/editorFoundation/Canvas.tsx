import { useEffect, useMemo, useRef, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import type { EditorSession } from './session';
import { PreviewController } from './PreviewController';
import type { PreviewReply, RenderedPart } from './protocol';
import { useArtworkGesture, pointerPoint } from './useArtworkGesture';
import { artworkText } from '../../blocks/artworkEdits';
import ArtworkTextEditor from './ArtworkTextEditor';
import { sameRevision, type Revision } from './session';
import { editorShortcutsLive } from '../spaceKey';
import { getTemplateParts } from '../../model/structure';

let inspectedController: PreviewController | null = null;
/** Read-only instrumentation entry point used by the acceptance harness. */
export function foundationDiagnostics() { return inspectedController; }
export function recordFoundationInput(kind: string) { inspectedController?.noteInput(kind); }

interface Props {
  template: SpxTemplate; sampleData: Record<string, string>; session: EditorSession;
  time: number; selection: string[]; select: (selector: string | null, toggle: boolean) => void;
  linked: boolean;
  setSelection: (selection: string[]) => void;
  onAppearance: (appearance: Record<string, RenderedPart['appearance']>) => void;
  rootSelector?: string;
  connectPreview: (preview: PreviewController | null) => void;
  togglePlayback: () => void; pause: () => void;
}
export default function Canvas({ template, sampleData, session, time, selection, select, linked, setSelection, onAppearance, rootSelector, connectPreview, togglePlayback, pause }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const controller = useRef<PreviewController | null>(null);
  const [status, setStatus] = useState({ pending: true, error: '', request: 0, generation: 0, source: 0 });
  const [parts, setParts] = useState<RenderedPart[]>([]);
  const [drawingSpace, setDrawingSpace] = useState<PreviewReply['drawingSpace']>(null);
  const [size, setSize] = useState({ width: 800, height: 450 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState<{ selector: string; text: string; revision: Revision } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; selection: string[]; additive: boolean; revision: Revision; hit?: string; moved: boolean } | null>(null);
  const clickSelection = useRef<string | null>(null);
  const space = useRef(false);
  const spaceTap = useRef(false);
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const { width, height } = template.resolution;
  const fit = Math.max(0.01, Math.min((size.width - 80) / width, (size.height - 64) / height));
  const scale = fit * zoom;
  const selected = parts.filter(part => selection.includes(part.selector));
  const containers = useMemo(() => {
    const doc = new DOMParser().parseFromString(template.html, 'text/html');
    const parts = getTemplateParts(template.html, template.fields, true);
    return new Set(parts.filter(part => parts.some(other => other !== part && doc.querySelector(part.selector)?.contains(doc.querySelector(other.selector) ?? null))).map(part => part.selector));
  }, [template.html, template.fields]);
  const gesture = useArtworkGesture(template, session, () => controller.current, linked, drawingSpace);
  const pending = !status.error && (status.pending || status.source !== session.version().source);
  const parkedTime = useRef(time);
  const cue = session.port.view().cue;
  const parkedCue = useRef(cue);
  parkedCue.current = cue;
  parkedTime.current = time;

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!iframe.current) return;
    let lastAppearance = '';
    const preview = new PreviewController(session.documentId, iframe.current, (reply, pending) => {
      if (reply?.parts) setParts(reply.parts);
      if (reply?.parts) {
        const appearance = Object.fromEntries(reply.parts.map(p => [p.selector, p.appearance]));
        const key = JSON.stringify(appearance);
        if (key !== lastAppearance) { lastAppearance = key; onAppearance(appearance); }
      }
      if (reply?.drawingSpace) setDrawingSpace(reply.drawingSpace);
      setStatus({ pending, error: reply?.kind === 'error' ? reply.message ?? 'Preview failed.' : '',
        request: reply?.requestId ?? 0, generation: reply?.generation ?? 0, source: reply?.revision.source ?? 0 });
    });
    controller.current = preview;
    connectPreview(preview);
    inspectedController = preview;
    return () => { connectPreview(null); preview.dispose(); if (inspectedController === preview) inspectedController = null; };
  }, [session, onAppearance, connectPreview]);
  useEffect(() => {
    void controller.current?.load(template, session.version(), sampleData, parkedTime.current, parkedCue.current).catch(error => {
      setStatus({ pending: false, error: String(error), request: 0, generation: 0, source: session.version().source });
    });
  }, [template, sampleData, session]);
  useEffect(() => { controller.current?.seek(time, 'scrub', cue); }, [time, cue]);
  useEffect(() => { controller.current?.seek(parkedTime.current, 'selection', parkedCue.current); }, [selection]);

  return <section className="ef-canvas" aria-label="Graphic canvas">
    <div className="ef-toolbar">
      {(['select', 'text', 'rectangle', 'ellipse'] as const).map(tool => <button key={tool} aria-pressed={gesture.tool === tool}
        onClick={() => { gesture.cancel(); gesture.setTool(tool); }} aria-label={tool + ' tool'}>{tool[0].toUpperCase() + tool.slice(1)}</button>)}
      <span className="ef-spacer" />
      <span className="ef-muted">{width} × {height}</span>
      <select aria-label="Canvas zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
        {[0.5, 1, 1.5, 2, 4].map(value => <option key={value} value={value}>{value === 1 ? 'Fit' : Math.round(value * 100) + '% of Fit'}</option>)}
      </select>
      <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</button>
    </div>
    <div className="ef-viewport" ref={viewport} tabIndex={0} aria-label="Canvas selection and pan"
      data-testid="foundation-canvas" data-pending={pending} data-request={status.request} data-generation={status.generation}
      data-pose-time={parts[0]?.appearance?.time} data-pose-cue={parts[0]?.appearance?.cue ?? 'arriving'}
      onKeyDown={event => {
        if (!editorShortcutsLive(event.target)) return;
        if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault(); event.stopPropagation(); space.current = true;
          spaceTap.current = !event.repeat;
        }
        if (event.key === 'Escape') {
          spaceTap.current = false;
          if (drag.current) { setPan(drag.current.pan); drag.current = null; }
          clickSelection.current = null;
          if (marqueeStart.current) { setSelection(marqueeStart.current.selection); marqueeStart.current = null; setMarquee(null); }
          else if (gesture.active() || gesture.tool !== 'select') gesture.cancel(); else select(null, false);
        }
      }}
      onKeyUp={event => {
        if (event.code !== 'Space') return;
        const tapped = spaceTap.current;
        space.current = false; spaceTap.current = false;
        if (tapped && editorShortcutsLive(event.target)) { event.preventDefault(); event.stopPropagation(); togglePlayback(); }
      }}
      onBlur={() => { space.current = false; spaceTap.current = false; }}
      onPointerDown={event => {
        if ((event.target as HTMLElement).closest('.ef-inline-text, .ef-stage-error')) return;
        event.preventDefault(); pause();
        setEditing(null);
        clickSelection.current = null;
        event.currentTarget.focus();
        if (event.button === 1 || space.current) {
          spaceTap.current = false;
          event.preventDefault();
          drag.current = { x: event.clientX, y: event.clientY, pan };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        if (event.button !== 0 || pending || status.error) return;
        const { x, y } = pointerPoint(event, size, pan, scale, width, height);
        event.currentTarget.setPointerCapture(event.pointerId);
        if (gesture.tool !== 'select') { gesture.begin({ x, y }); return; }
        if (selected.length === 1) {
          // Keep a draggable centre even when Fit makes a small layer narrower
          // than the normal handle hit area.
          const radius = Math.min(8, selected[0].width * scale / 4, selected[0].height * scale / 4);
          const handle = selected[0].corners?.findIndex(p => Math.hypot(p.x - x, p.y - y) * scale <= radius) ?? -1;
          if (handle >= 0) { gesture.begin({ x, y }, selected[0], handle); return; }
        }
        const hits = parts.filter(p => p.selector !== rootSelector && x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height)
          .sort((a, b) => Number(selection.includes(b.selector)) - Number(selection.includes(a.selector)) || a.width * a.height - b.width * b.height || parts.indexOf(b) - parts.indexOf(a));
        const index = event.altKey ? (hits.findIndex(p => p.selector === selection[0]) + 1) % Math.max(1, hits.length) : 0;
        const hit = hits[index], additive = event.shiftKey || event.ctrlKey || event.metaKey;
        if (!hit || (containers.has(hit.selector) && !selection.includes(hit.selector) && !event.altKey)) {
          marqueeStart.current = { x, y, selection: [...selection], additive, revision: session.version(), hit: hit?.selector, moved: false };
          if (!additive) setSelection([]);
          return;
        }
        if (additive || !selection.includes(hit.selector)) select(hit.selector, additive);
        if (!additive && selection.length > 1 && selection.includes(hit.selector)) clickSelection.current = hit.selector;
        if (!additive && !event.altKey) gesture.begin({ x, y }, hit, undefined, selection.includes(hit.selector) ? selected : [hit]);
      }}
      onDoubleClick={event => {
        if ((event.target as HTMLElement).closest('.ef-inline-text')) return;
        if (pending || gesture.tool !== 'select') return;
        const point = pointerPoint(event, size, pan, scale, width, height);
        const hits = parts.filter(p => point.x >= p.x && point.x <= p.x + p.width && point.y >= p.y && point.y <= p.y + p.height).sort((a, b) => a.width * a.height - b.width * b.height);
        for (const hit of hits) {
          const text = artworkText(template, hit.selector);
          if (text) { gesture.cancel(); select(hit.selector, false); setEditing({ selector: hit.selector, text: text.text, revision: session.version() }); break; }
        }
      }}
      onPointerMove={event => {
        const start = marqueeStart.current;
        if (start) {
          if (!sameRevision(start.revision, session.version())) { marqueeStart.current = null; setMarquee(null); return; }
          const p = pointerPoint(event, size, pan, scale, width, height);
          if (!start.moved && Math.hypot(p.x - start.x, p.y - start.y) * scale < 3) return;
          start.moved = true;
          const rect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) };
          setMarquee(rect);
          const hits = parts.filter(part => part.selector !== rootSelector && part.x >= rect.x && part.y >= rect.y && part.x + part.width <= rect.x + rect.width && part.y + part.height <= rect.y + rect.height).map(p => p.selector);
          setSelection([...new Set([...(start.additive ? start.selection : []), ...hits])]);
          return;
        }
        if (drag.current) setPan({ x: drag.current.pan.x + event.clientX - drag.current.x,
          y: drag.current.pan.y + event.clientY - drag.current.y });
        else gesture.move(pointerPoint(event, size, pan, scale, width, height), event);
      }}
      onPointerUp={() => {
        const start = marqueeStart.current;
        if (start?.hit && !start.moved && sameRevision(start.revision, session.version())) select(start.hit, start.additive);
        marqueeStart.current = null; setMarquee(null); drag.current = null;
        const moved = gesture.end();
        if (!moved && clickSelection.current) select(clickSelection.current, false);
        clickSelection.current = null;
      }}
      onLostPointerCapture={() => { clickSelection.current = null; if (drag.current) setPan(drag.current.pan); drag.current = null; if (gesture.active()) gesture.cancel(); if (marqueeStart.current) { setSelection(marqueeStart.current.selection); marqueeStart.current = null; setMarquee(null); } }}
      onPointerCancel={() => { clickSelection.current = null; if (drag.current) setPan(drag.current.pan); drag.current = null; gesture.cancel(); if (marqueeStart.current) setSelection(marqueeStart.current.selection); marqueeStart.current = null; setMarquee(null); }}>
      <div className="ef-artboard" style={{ width, height,
        transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) translate(-50%,-50%) scale(' + scale + ')' }}>
        <iframe ref={iframe} title="Foundation graphic preview" sandbox="allow-scripts"
          width={width} height={height} tabIndex={-1} />
        <svg className="ef-selection" width={width} height={height} aria-hidden="true">
          {marquee && <rect {...marquee} fill="var(--accent)" fillOpacity=".12" stroke="var(--accent)" strokeWidth={1 / scale} />}
          {selected.map(part => <rect key={part.selector} x={part.x} y={part.y} width={part.width}
            height={part.height} fill="none" stroke="var(--accent)" strokeWidth={1.5 / scale} />)}
          {selected.length === 1 && selected[0].corners?.map((p, i) => <circle key={i} data-handle={i} cx={p.x} cy={p.y} r={4 / scale} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1 / scale} />)}
          {gesture.draft && drawingSpace && <rect x={gesture.draft.x} y={gesture.draft.y} width={gesture.draft.width} height={gesture.draft.height}
            transform={'matrix(' + drawingSpace.join(' ') + ')'} fill="color-mix(in srgb, var(--accent) 20%, transparent)" stroke="var(--accent)" strokeWidth={1 / scale} />}
        </svg>
      </div>
      {editing && selection[0] === editing.selector && sameRevision(editing.revision, session.version()) && <div className="ef-inline-text">
        <ArtworkTextEditor selector={editing.selector} text={editing.text} session={session} close={() => setEditing(null)} autoFocus />
      </div>}
      {(status.pending || status.source !== session.version().source) && <span className="ef-stage-status" role="status">Preparing preview…</span>}
      {status.error && <div className="ef-stage-error" role="alert">{status.error}
        <button onClick={() => void controller.current?.load(template, session.version(), sampleData, time)}>Reload preview</button>
      </div>}
      {gesture.error && <div className="ef-stage-error" role="alert">{gesture.error}</div>}
    </div>
    <div className="ef-caption"><span>{selection.length ? selection.length + ' selected' : 'Select artwork or a timeline layer'}</span>
      <span>{gesture.tool === 'select' ? 'Space: play/pause · Space-drag: pan · Shift: constrain' : 'Click or drag to draw · Shift: square/circle · Escape: cancel'}</span></div>
  </section>;
}
