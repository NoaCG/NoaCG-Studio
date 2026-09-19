import { useEffect, useRef, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import type { EditorSession } from './session';
import { PreviewController } from './PreviewController';
import type { PreviewReply, RenderedPart } from './protocol';
import { useArtworkGesture, pointerPoint } from './useArtworkGesture';

let inspectedController: PreviewController | null = null;
/** Read-only instrumentation entry point used by the acceptance harness. */
export function foundationDiagnostics() { return inspectedController; }
export function recordFoundationInput(kind: string) { inspectedController?.noteInput(kind); }

interface Props {
  template: SpxTemplate; sampleData: Record<string, string>; session: EditorSession;
  time: number; selection: string[]; select: (selector: string | null, toggle: boolean) => void;
  linked: boolean;
}
export default function Canvas({ template, sampleData, session, time, selection, select, linked }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const controller = useRef<PreviewController | null>(null);
  const [status, setStatus] = useState({ pending: true, error: '', request: 0, generation: 0, source: 0 });
  const [parts, setParts] = useState<RenderedPart[]>([]);
  const [drawingSpace, setDrawingSpace] = useState<PreviewReply['drawingSpace']>(null);
  const [size, setSize] = useState({ width: 800, height: 450 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const space = useRef(false);
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const { width, height } = template.resolution;
  const fit = Math.max(0.01, Math.min((size.width - 80) / width, (size.height - 64) / height));
  const scale = fit * zoom;
  const selected = parts.filter(part => selection.includes(part.selector));
  const gesture = useArtworkGesture(template, session, () => controller.current, linked, drawingSpace);
  const pending = status.pending || status.source !== session.version().source;
  const parkedTime = useRef(time);
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
    const preview = new PreviewController(session.documentId, iframe.current, (reply, pending) => {
      if (reply?.parts) setParts(reply.parts);
      if (reply?.drawingSpace) setDrawingSpace(reply.drawingSpace);
      setStatus({ pending, error: reply?.kind === 'error' ? reply.message ?? 'Preview failed.' : '',
        request: reply?.requestId ?? 0, generation: reply?.generation ?? 0, source: reply?.revision.source ?? 0 });
    });
    controller.current = preview;
    inspectedController = preview;
    return () => { preview.dispose(); if (inspectedController === preview) inspectedController = null; };
  }, [session]);
  useEffect(() => {
    void controller.current?.load(template, session.version(), sampleData, parkedTime.current).catch(error => {
      setStatus({ pending: false, error: String(error), request: 0, generation: 0, source: session.version().source });
    });
  }, [template, sampleData, session]);
  useEffect(() => { controller.current?.seek(time); }, [time]);
  useEffect(() => { controller.current?.seek(parkedTime.current, 'selection'); }, [selection]);

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
      onKeyDown={event => {
        if (event.code === 'Space') { event.preventDefault(); space.current = true; }
        if (event.key === 'Escape') { if (gesture.active() || gesture.tool !== 'select') gesture.cancel(); else select(null, false); }
      }}
      onKeyUp={event => { if (event.code === 'Space') space.current = false; }}
      onBlur={() => { space.current = false; }}
      onPointerDown={event => {
        event.currentTarget.focus();
        if (event.button === 1 || space.current) {
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
          const handle = selected[0].corners?.findIndex(p => Math.hypot(p.x - x, p.y - y) * scale <= 8) ?? -1;
          if (handle >= 0) { gesture.begin({ x, y }, selected[0], handle); return; }
        }
        const hits = parts.filter(p => x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height)
          .sort((a, b) => a.width * a.height - b.width * b.height);
        const index = event.altKey ? (hits.findIndex(p => p.selector === selection[0]) + 1) % Math.max(1, hits.length) : 0;
        select(hits[index]?.selector ?? null, event.shiftKey || event.ctrlKey || event.metaKey);
        if (hits[index] && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) gesture.begin({ x, y }, hits[index]);
      }}
      onPointerMove={event => {
        if (drag.current) setPan({ x: drag.current.pan.x + event.clientX - drag.current.x,
          y: drag.current.pan.y + event.clientY - drag.current.y });
        else gesture.move(pointerPoint(event, size, pan, scale, width, height), event);
      }}
      onPointerUp={() => { drag.current = null; gesture.end(); }}
      onLostPointerCapture={() => { if (gesture.active()) gesture.cancel(); }}
      onPointerCancel={() => { if (drag.current) setPan(drag.current.pan); drag.current = null; gesture.cancel(); }}>
      <div className="ef-artboard" style={{ width, height,
        transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) translate(-50%,-50%) scale(' + scale + ')' }}>
        <iframe ref={iframe} title="Foundation graphic preview" sandbox="allow-scripts"
          width={width} height={height} tabIndex={-1} />
        <svg className="ef-selection" width={width} height={height} aria-hidden="true">
          {selected.map(part => <rect key={part.selector} x={part.x} y={part.y} width={part.width}
            height={part.height} fill="none" stroke="#8bd5f6" strokeWidth={1.5 / scale} />)}
          {selected.length === 1 && selected[0].corners?.map((p, i) => <circle key={i} data-handle={i} cx={p.x} cy={p.y} r={4 / scale} fill="#8bd5f6" stroke="#162732" strokeWidth={1 / scale} />)}
          {gesture.draft && drawingSpace && <rect x={gesture.draft.x} y={gesture.draft.y} width={gesture.draft.width} height={gesture.draft.height}
            transform={'matrix(' + drawingSpace.join(' ') + ')'} fill="#8bd5f633" stroke="#8bd5f6" strokeWidth={1 / scale} />}
        </svg>
      </div>
      {pending && <span className="ef-stage-status" role="status">Preparing preview…</span>}
      {status.error && <div className="ef-stage-error" role="alert">{status.error}
        <button onClick={() => void controller.current?.load(template, session.version(), sampleData, time)}>Reload preview</button>
      </div>}
      {gesture.error && <div className="ef-stage-error" role="alert">{gesture.error}</div>}
    </div>
    <div className="ef-caption"><span>{selection.length ? selection.length + ' selected' : 'Select artwork or a timeline layer'}</span>
      <span>{gesture.tool === 'select' ? 'Shift: constrain · Alt: scale from anchor · Space: pan' : 'Click or drag to draw · Shift: square/circle · Escape: cancel'}</span></div>
  </section>;
}
