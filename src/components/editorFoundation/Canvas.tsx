import { useEffect, useRef, useState } from 'react';
import type { SpxTemplate } from '../../model/types';
import type { EditorSession } from './session';
import { PreviewController } from './PreviewController';
import type { RenderedPart } from './protocol';

let inspectedController: PreviewController | null = null;
/** Read-only instrumentation entry point used by the acceptance harness. */
export function foundationDiagnostics() { return inspectedController; }
export function recordFoundationInput(kind: string) { inspectedController?.noteInput(kind); }

interface Props {
  template: SpxTemplate; sampleData: Record<string, string>; session: EditorSession;
  time: number; selection: string[]; select: (selector: string | null, toggle: boolean) => void;
}
export default function Canvas({ template, sampleData, session, time, selection, select }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const controller = useRef<PreviewController | null>(null);
  const [status, setStatus] = useState({ pending: true, error: '', request: 0, generation: 0 });
  const [parts, setParts] = useState<RenderedPart[]>([]);
  const [size, setSize] = useState({ width: 800, height: 450 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const space = useRef(false);
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const { width, height } = template.resolution;
  const fit = Math.max(0.01, Math.min((size.width - 80) / width, (size.height - 64) / height));
  const scale = fit * zoom;
  const selected = parts.filter(part => selection.includes(part.selector));
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
      setStatus({ pending, error: reply?.kind === 'error' ? reply.message ?? 'Preview failed.' : '',
        request: reply?.requestId ?? 0, generation: reply?.generation ?? 0 });
    });
    controller.current = preview;
    inspectedController = preview;
    return () => { preview.dispose(); if (inspectedController === preview) inspectedController = null; };
  }, [session]);
  useEffect(() => {
    void controller.current?.load(template, session.version(), sampleData, parkedTime.current).catch(error => {
      setStatus({ pending: false, error: String(error), request: 0, generation: 0 });
    });
  }, [template, sampleData, session]);
  useEffect(() => { controller.current?.seek(time); }, [time]);
  useEffect(() => { controller.current?.seek(parkedTime.current, 'selection'); }, [selection]);

  return <section className="ef-canvas" aria-label="Graphic canvas">
    <div className="ef-toolbar">
      <span className="ef-tool" aria-label="Select tool">↖ Select</span>
      <span className="ef-muted">Canvas</span><span className="ef-spacer" />
      <span className="ef-muted">{width} × {height}</span>
      <select aria-label="Canvas zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
        {[0.5, 1, 1.5, 2, 4].map(value => <option key={value} value={value}>{value === 1 ? 'Fit' : Math.round(value * 100) + '% of Fit'}</option>)}
      </select>
      <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</button>
    </div>
    <div className="ef-viewport" ref={viewport} tabIndex={0} aria-label="Canvas selection and pan"
      data-testid="foundation-canvas" data-pending={status.pending} data-request={status.request} data-generation={status.generation}
      onKeyDown={event => {
        if (event.code === 'Space') { event.preventDefault(); space.current = true; }
        if (event.key === 'Escape') { select(null, false); session.cancel(); }
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
        if (event.button !== 0 || status.pending || status.error) return;
        const box = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - box.left - size.width / 2 - pan.x) / scale + width / 2;
        const y = (event.clientY - box.top - size.height / 2 - pan.y) / scale + height / 2;
        const hits = parts.filter(p => x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height)
          .sort((a, b) => a.width * a.height - b.width * b.height);
        const index = event.altKey ? (hits.findIndex(p => p.selector === selection[0]) + 1) % Math.max(1, hits.length) : 0;
        select(hits[index]?.selector ?? null, event.shiftKey || event.ctrlKey || event.metaKey);
      }}
      onPointerMove={event => {
        if (drag.current) setPan({ x: drag.current.pan.x + event.clientX - drag.current.x,
          y: drag.current.pan.y + event.clientY - drag.current.y });
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { if (drag.current) setPan(drag.current.pan); drag.current = null; }}>
      <div className="ef-artboard" style={{ width, height,
        transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) translate(-50%,-50%) scale(' + scale + ')' }}>
        <iframe ref={iframe} title="Foundation graphic preview" sandbox="allow-scripts"
          width={width} height={height} tabIndex={-1} />
        <svg className="ef-selection" width={width} height={height} aria-hidden="true">
          {selected.map(part => <rect key={part.selector} x={part.x} y={part.y} width={part.width}
            height={part.height} fill="none" stroke="#8bd5f6" strokeWidth={1.5 / scale} />)}
        </svg>
      </div>
      {status.pending && <span className="ef-stage-status" role="status">Preparing preview…</span>}
      {status.error && <div className="ef-stage-error" role="alert">{status.error}
        <button onClick={() => void controller.current?.load(template, session.version(), sampleData, time)}>Reload preview</button>
      </div>}
    </div>
    <div className="ef-caption"><span>{selection.length ? selection.length + ' selected' : 'Select artwork or a timeline layer'}</span>
      <span>Space + drag to pan · Alt + click to cycle overlaps</span></div>
  </section>;
}
