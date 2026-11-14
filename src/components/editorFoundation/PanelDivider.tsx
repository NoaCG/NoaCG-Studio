import { useEffect, useRef } from 'react';

export default function PanelDivider({ name, axis, sign, value, min, max, resize, cancel }: {
  name: string; axis: 'x' | 'y'; sign: 1 | -1; value: number; min: number; max: number;
  resize(value: number, commit: boolean): void; cancel(): void;
}) {
  const drag = useRef<{ id: number; start: number; from: number; latest: number } | null>(null);
  const bound = (n: number) => Math.max(min, Math.min(max, n));
  useEffect(() => () => { if (drag.current) { drag.current = null; cancel(); } }, [cancel]);
  const abort = (element?: HTMLElement) => {
    const active = drag.current; if (!active) return;
    drag.current = null; cancel();
    if (element?.hasPointerCapture(active.id)) element.releasePointerCapture(active.id);
  };
  return <div className={'ef-divider ef-divider-' + axis} role="separator" tabIndex={0} aria-label={name}
    aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-valuemin={min} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)} aria-valuetext={Math.round(value) + ' pixels'}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, start: axis === 'x' ? event.clientX : event.clientY, from: value, latest: value };
    }}
    onPointerMove={event => {
      const active = drag.current; if (!active || active.id !== event.pointerId) return;
      active.latest = bound(active.from + ((axis === 'x' ? event.clientX : event.clientY) - active.start) * sign);
      resize(active.latest, false);
    }}
    onPointerUp={event => {
      const active = drag.current; if (!active || active.id !== event.pointerId) return;
      drag.current = null; resize(active.latest, true);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={event => abort(event.currentTarget)} onLostPointerCapture={() => abort()}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); abort(event.currentTarget); return; }
      const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      const direction = keys.indexOf(event.key);
      if (direction < 0 && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault(); event.stopPropagation();
      resize(event.key === 'Home' ? min : event.key === 'End' ? max : bound(value + (direction === 0 ? -1 : 1) * sign * (event.shiftKey ? 20 : 10)), true);
    }} />;
}
