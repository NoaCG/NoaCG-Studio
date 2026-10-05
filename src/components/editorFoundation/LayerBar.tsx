import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import type { EditorSession, Revision } from './session';
import type { LayerBar as Bar } from './timelineView';

export default function LayerBar({ bar, label, extent, speed, fps, session, select, pause, group = false }: {
  bar: Bar; label: string; extent: number; speed: number; fps: number; session: EditorSession;
  select: () => void; pause: () => void; group?: boolean;
}) {
  type Edge = 'start' | 'end' | null;
  const active = useRef<{ x: number; width: number; expected: Revision; delta: number; edge: Edge } | null>(null);
  const [delta, setDelta] = useState(0), [error, setError] = useState('');
  const [edge, setEdge] = useState<Edge>(null);
  useEffect(() => { setError(''); }, [bar.start, bar.end]);
  const cancel = () => { if (active.current) session.cancel(); active.current = null; setDelta(0); };
  const commit = (delta: number, edge: Edge, expected = session.version()) => {
    try {
      if (delta) session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [
        edge ? { kind: group ? 'group.trim' : 'layer.trim', selector: bar.selector, step: bar.step, interval: bar.interval, edge, time: (bar[edge] - bar.cueStart + delta) * speed }
          : { kind: group ? 'group.move' : 'layer.move', selector: bar.selector, step: bar.step, delta: delta * speed },
      ] });
      else session.cancel();
      setError('');
    } catch (cause) { session.cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const down = (event: PointerEvent<HTMLButtonElement>, edge: Edge) => {
      if (event.button !== 0) return;
      pause(); select(); event.preventDefault(); event.currentTarget.focus(); setError(''); setEdge(edge);
      try {
        const expected = session.version(); session.begin(expected);
        active.current = { expected, edge, x: event.clientX, width: event.currentTarget.closest('.ef-track-lane')!.getBoundingClientRect().width, delta: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (cause) { setError(String(cause)); }
    };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
      const drag = active.current;
      if (!drag) return;
      const raw = (event.clientX - drag.x) / drag.width * extent;
      drag.delta = event.altKey ? raw : Math.round(raw * fps) / fps;
      setDelta(drag.delta);
    };
  const up = () => { const drag = active.current; active.current = null; setDelta(0); if (drag) commit(drag.delta, drag.edge, drag.expected); };
  const key = (event: KeyboardEvent<HTMLButtonElement>, edge: Edge) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); pause(); commit((event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1) / fps, edge);
      }
    };
  const start = bar.start + (edge === 'end' ? 0 : delta), end = bar.end + (edge === 'start' ? 0 : delta);
  const handlers = { onPointerMove: move, onPointerUp: up, onPointerCancel: cancel, onLostPointerCapture: cancel };
  return <><button className="ef-bar" aria-label={'Move ' + label + ' span'}
    style={{ left: start / extent * 100 + '%', width: Math.max(.2, (end - start) / extent * 100) + '%' }}
    onClick={select} onPointerDown={event => down(event, null)} onKeyDown={event => key(event, null)} {...handlers}>{label}</button>
    {bar.end > bar.start && (['start', 'end'] as const).map(side => <button key={side} className={'ef-trim ef-trim-' + side}
      aria-label={'Trim ' + side + ' ' + label + ' span'} title={'Trim ' + side + ': visibility only; keys stay in place'}
      style={{ left: (side === 'start' ? start : end) / extent * 100 + '%' }}
      onPointerDown={event => down(event, side)} onKeyDown={event => key(event, side)} {...handlers} />)}
    {error && <p className="ef-bar-error" role="alert">{error}</p>}</>;
}
