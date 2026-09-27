import { useRef, useState } from 'react';
import type { EditorSession, Revision } from './session';
import type { LayerBar as Bar } from './timelineView';

export default function LayerBar({ bar, label, extent, speed, fps, session, select, pause }: {
  bar: Bar; label: string; extent: number; speed: number; fps: number; session: EditorSession;
  select: () => void; pause: () => void;
}) {
  const active = useRef<{ x: number; width: number; expected: Revision; delta: number } | null>(null);
  const [delta, setDelta] = useState(0), [error, setError] = useState('');
  const cancel = () => { if (active.current) session.cancel(); active.current = null; setDelta(0); };
  const commit = (delta: number, expected = session.version()) => {
    try {
      if (delta) session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [
        { kind: 'layer.move', selector: bar.selector, step: bar.step, delta: delta * speed },
      ] });
      else session.cancel();
      setError('');
    } catch (cause) { session.cancel(); setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <><button className="ef-bar" aria-label={'Move ' + label + ' span'}
    style={{ left: (bar.start + delta) / extent * 100 + '%', width: Math.max(.2, (bar.end - bar.start) / extent * 100) + '%' }}
    onClick={select} onPointerDown={event => {
      if (event.button !== 0) return;
      pause(); select(); event.preventDefault(); event.currentTarget.focus(); setError('');
      try {
        const expected = session.version(); session.begin(expected);
        active.current = { expected, x: event.clientX, width: event.currentTarget.parentElement!.getBoundingClientRect().width, delta: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (cause) { setError(String(cause)); }
    }} onPointerMove={event => {
      const drag = active.current;
      if (!drag) return;
      const raw = (event.clientX - drag.x) / drag.width * extent;
      drag.delta = event.altKey ? raw : Math.round(raw * fps) / fps;
      setDelta(drag.delta);
    }} onPointerUp={() => { const drag = active.current; active.current = null; setDelta(0); if (drag) commit(drag.delta, drag.expected); }}
    onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); pause(); commit((event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1) / fps);
      }
    }}>{label}</button>{error && <p className="ef-bar-error" role="alert">{error}</p>}</>;
}
