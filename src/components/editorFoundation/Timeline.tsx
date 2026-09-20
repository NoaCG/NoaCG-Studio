import { useRef, useState } from 'react';
import type { TimelineView } from './timelineView';

interface Props {
  view: TimelineView; fps: number; time: number; selection: string[];
  seek: (time: number) => void; select: (selector: string | null, toggle: boolean) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
}
export default function Timeline({ view, fps, time, selection, seek, select, undo, redo, canUndo, canRedo }: Props) {
  const [units, setUnits] = useState<'seconds' | 'frames'>('seconds');
  const ruler = useRef<HTMLDivElement>(null);
  const startTime = useRef<number | null>(null);
  const extent = Math.max(2, view.duration * 1.15);
  const interval = extent <= 5 ? 0.5 : extent <= 12 ? 1 : Math.ceil(extent / 10);
  const ticks = Array.from({ length: Math.floor(extent / interval) + 1 }, (_, i) => i * interval);
  const display = (value: number) => units === 'seconds' ? value.toFixed(2) + ' s' : Math.round(value * fps) + ' f';
  const fromPointer = (clientX: number) => {
    const box = ruler.current?.getBoundingClientRect();
    if (box) seek(Math.max(0, Math.min(view.duration, (clientX - box.left) / box.width * extent)));
  };
  return <section className="ef-timeline" aria-label="Timeline" data-testid="foundation-timeline">
    <div className="ef-toolbar"><strong>Timeline</strong><span className="ef-muted">Layer spans · read only</span>
      <span className="ef-spacer" /><button disabled={!canUndo} onClick={undo}>Undo</button><button disabled={!canRedo} onClick={redo}>Redo</button>
      <span className="ef-muted">{fps} fps</span></div>
    <div className="ef-transport">
      <button disabled={!!view.reason} onClick={() => seek(0)} aria-label="Go to beginning">|◀</button>
      <button disabled={!!view.reason} onClick={() => seek(Math.max(0, time - 1 / fps))} aria-label="Previous frame">◀</button>
      <button disabled={!!view.reason} onClick={() => seek(Math.min(view.duration, time + 1 / fps))} aria-label="Next frame">▶</button>
      <output data-testid="foundation-clock">{display(time)}</output>
      <span className="ef-muted">{Math.round(time * fps)} frames</span>
      <span className="ef-spacer" />
      <label>Ruler <select aria-label="Ruler units" value={units} onChange={event => setUnits(event.target.value as typeof units)}>
        <option value="seconds">Seconds</option><option value="frames">Frames</option>
      </select></label>
    </div>
    {view.reason ? <p className="ef-notice">{view.reason}</p> : null}
    <div className="ef-track-scroll">
      <div className="ef-ruler-row"><span className="ef-layer-heading">Layers</span>
        <div ref={ruler} className="ef-ruler" role="slider" aria-label="Playhead" tabIndex={0}
          aria-valuemin={0} aria-valuemax={view.duration} aria-valuenow={time} aria-valuetext={display(time)}
          aria-disabled={!!view.reason} data-testid="foundation-ruler"
          onPointerDown={event => {
            if (view.reason || event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus(); startTime.current = time;
            event.currentTarget.setPointerCapture(event.pointerId); fromPointer(event.clientX);
          }}
          onPointerMove={event => { if (startTime.current !== null) fromPointer(event.clientX); }}
          onPointerUp={() => { startTime.current = null; }}
          onPointerCancel={() => { if (startTime.current !== null) seek(startTime.current); startTime.current = null; }}
          onKeyDown={event => {
            if (event.key === 'Escape' && startTime.current !== null) { seek(startTime.current); startTime.current = null; return; }
            if (view.reason) return;
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? view.duration :
              event.key === 'ArrowLeft' ? time - (event.shiftKey ? 10 : 1) / fps :
              event.key === 'ArrowRight' ? time + (event.shiftKey ? 10 : 1) / fps : null;
            if (next !== null) { event.preventDefault(); seek(Math.max(0, Math.min(view.duration, next))); }
          }}>
          {ticks.map(tick => <span className="ef-tick" key={tick} style={{ left: tick / extent * 100 + '%' }}>{display(tick)}</span>)}
          {view.segments.filter(s => !s.out).map(s => <span className="ef-flag" key={s.index}
            style={{ left: s.start / extent * 100 + '%' }}>{s.name}</span>)}
          <span className="ef-flag ef-out" style={{ left: view.out / extent * 100 + '%' }}>Out · hold</span>
          <span className="ef-playhead-head" style={{ left: time / extent * 100 + '%' }} />
        </div>
      </div>
      {view.parts.map((part, index) => {
        const bar = view.bars.find(b => b.selector === part.selector)!;
        return <div className={'ef-track' + (selection.includes(part.selector) ? ' is-selected' : '')}
          key={part.selector} data-selector={part.selector}>
          <button className="ef-layer" aria-pressed={selection.includes(part.selector)}
            onClick={event => select(part.selector, event.shiftKey || event.ctrlKey || event.metaKey)}>
            <span className="ef-layer-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="ef-layer-icon">{part.kind === 'line' ? 'T' : part.kind === 'image' ? '▧' : '◇'}</span>
            <span>{part.label}</span>
          </button>
          <div className="ef-track-lane">
            <button className="ef-bar" tabIndex={-1} aria-label={'Select ' + part.label + ' span'}
              style={{ left: bar.start / extent * 100 + '%', width: Math.max(0.2, (bar.end - bar.start) / extent * 100) + '%' }}
              onClick={event => select(part.selector, event.shiftKey || event.ctrlKey || event.metaKey)}>{part.label}</button>
            <span className="ef-playhead-line" style={{ left: time / extent * 100 + '%' }} />
          </div>
        </div>;
      })}
      {!view.parts.length && <p className="ef-notice">No addressable layers in this source.</p>}
    </div>
    <div className="ef-caption"><span>Arrow keys: one frame · Shift: ten frames · Escape: cancel scrub</span><span>Holds wait for an operator cue</span></div>
  </section>;
}
