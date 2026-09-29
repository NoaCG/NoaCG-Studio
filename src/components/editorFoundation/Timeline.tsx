import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { KeyRef } from '../../blocks/animEdit';
import type { TimelineView } from './timelineView';
import type { EditorSession } from './session';
import LayerBar from './LayerBar';
import OutControls from './OutControls';
import KeyEase, { type KeyMenu } from './KeyEase';
import { keyId, layerKeys, liveKeys, toggleKeys } from './keySelection';

const PROPERTY_LABELS: Record<string, string> = { x: 'X', y: 'Y', scaleX: 'Scale X', scaleY: 'Scale Y', rotation: 'Rotation', opacity: 'Opacity' };
type Marquee = { x0: number; y0: number; x1: number; y1: number; base: KeyRef[] | null };

interface Props {
  view: TimelineView; fps: number; time: number; selection: string[];
  seek: (time: number) => void; select: (selector: string | null, toggle: boolean) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  playing: boolean; togglePlayback: () => void;
  session: EditorSession; pause: () => void;
  inspectOut: () => void; playOut: () => void; parkOut: () => void;
}
export default function Timeline({ view, fps, time, selection, seek, select, undo, redo, canUndo, canRedo, playing, togglePlayback, session, pause, inspectOut, playOut, parkOut }: Props) {
  const [units, setUnits] = useState<'seconds' | 'frames'>('seconds');
  // Key selection and the properties shown under each layer are editor UI state only.
  const [expanded, setExpanded] = useState<string[]>([]);
  const [picked, setPicked] = useState<KeyRef[]>([]);
  const keys = useMemo(() => liveKeys(view.data, picked), [view.data, picked]);
  const selected = useMemo(() => new Set(keys.map(keyId)), [keys]);
  // A key is named by its stored time, so an edit that moves or adds keys (a bar move, a new key)
  // would re-point the selection at whatever sits there now: such an edit clears it.
  const keyTimes = useMemo(() => JSON.stringify(view.data?.steps.map(step => Object.entries(step.layers)
    .map(([selector, tracks]) => [selector, Object.entries(tracks).map(([property, list]) => [property, list.map(key => key.time)])]))), [view.data]);
  const knownTimes = useRef(keyTimes);
  useEffect(() => { if (knownTimes.current !== keyTimes) { knownTimes.current = keyTimes; setPicked([]); } }, [keyTimes]);
  const [menu, setMenu] = useState<KeyMenu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const dragging = useRef<Marquee | null>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const tracks = useRef<HTMLDivElement>(null);
  const startTime = useRef<number | null>(null);
  const extent = Math.max(2, view.duration * 1.15, session.port.view().cue === view.segments.length - 1 ? view.duration + 2 : 0);
  const limit = session.port.view().cue === view.segments.length - 1 ? extent : view.duration;
  const interval = extent <= 5 ? 0.5 : extent <= 12 ? 1 : Math.ceil(extent / 10);
  const ticks = Array.from({ length: Math.floor(extent / interval) + 1 }, (_, i) => i * interval);
  const display = (value: number) => units === 'seconds' ? value.toFixed(2) + ' s' : Math.round(value * fps) + ' f';
  const fromPointer = (clientX: number) => {
    const box = ruler.current?.getBoundingClientRect();
    if (box) seek(Math.max(0, Math.min(limit, Math.round((clientX - box.left) / box.width * extent * 1e6) / 1e6)));
  };
  const scrolledFor = useRef('');
  useLayoutEffect(() => {
    const scroller = tracks.current;
    const row = scroller?.querySelector('.ef-track.is-selected');
    // Only a new selection or a new layer scrolls: clicking a key in a property row reselects its
    // layer, and scrolling to that layer's row would carry the clicked row out of view.
    const reason = selection.join('\n') + '\n' + view.parts.length;
    if (scrolledFor.current === reason) return;
    scrolledFor.current = reason;
    if (!scroller || !row || selection.length !== 1) return;
    // Keep canvas selections and newly created layers visible without scrolling the
    // page or moving the horizontal time range. Account for the sticky ruler above.
    const bounds = scroller.getBoundingClientRect(), item = row.getBoundingClientRect();
    const top = bounds.top + (ruler.current?.parentElement?.getBoundingClientRect().height ?? 0);
    if (item.top < top) scroller.scrollTop += item.top - top;
    else if (item.bottom > bounds.bottom) scroller.scrollTop += item.bottom - bounds.bottom;
  }, [selection, view.parts]);
  const at = (key: KeyRef) => view.segments[key.step].start + key.time / (view.data?.speed ?? 1);
  // A key: click selects it (and its layer, and seeks there); Ctrl, Cmd or Shift toggles it; the
  // context menu keeps a selection that already holds it.
  const openMenu = (group: KeyRef[], x: number, y: number, anchor: HTMLElement) => {
    if (!group.every(key => selected.has(keyId(key)))) setPicked(group);
    setMenu({ x, y, anchor });
  };
  // One key per moment on a row: the last key of one cue and the first of the next share a moment,
  // and as one they are the boundary key, arriving in one cue and leaving in the other.
  const moments = (list: KeyRef[]) => [...list.reduce((groups, key) => {
    const moment = Math.round(at(key) * 1e6);
    return groups.set(moment, [...groups.get(moment) ?? [], key]);
  }, new Map<number, KeyRef[]>()).values()];
  const keyButton = (group: KeyRef[], selector: string, layer: string) => {
    const ids = group.map(keyId), on = ids.filter(id => selected.has(id)).length, time = at(group[0]);
    const names = [...new Set(group.map(key => PROPERTY_LABELS[key.property] ?? key.property))];
    return <button key={ids.join('|')} className={'ef-timeline-key' + (on === ids.length ? ' is-key-selected' : on ? ' is-key-partial' : '')}
      aria-label={`${layer}: ${names.join(', ')} ${group.length > 1 ? 'keys' : 'key'} at ${display(time)}`} aria-haspopup="menu"
      aria-pressed={on === ids.length} data-keys={ids.join('|')} style={{ left: time / extent * 100 + '%' }}
      onClick={event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey) { setPicked(toggleKeys(keys, group)); return; }
        setPicked(group); select(selector, false); seek(time);
      }}
      onContextMenu={event => {
        event.preventDefault();
        if (menu?.anchor === event.currentTarget) return; // The keyboard's own menu event after the keydown below.
        const box = event.currentTarget.getBoundingClientRect();
        openMenu(group, event.clientX || box.left, event.clientY || box.bottom, event.currentTarget);
      }}
      onKeyDown={event => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        openMenu(group, box.left, box.bottom + 4, event.currentTarget);
      }}>◆</button>;
  };
  // A marquee drawn from empty lane space selects the keys whose centre it covers, across rows;
  // a modifier adds them to the selection, and a click without a drag clears it.
  const contentPoint = (event: ReactPointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left + event.currentTarget.scrollLeft, y: event.clientY - box.top + event.currentTarget.scrollTop };
  };
  const startMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || view.reason || !(target === event.currentTarget || target.classList.contains('ef-track-lane'))) return;
    // Cancelling the pointer skips the browser's own focus change, so let go of the last control
    // here: keys pressed next belong to the editor, not to a key button clicked earlier.
    event.preventDefault(); (document.activeElement as HTMLElement | null)?.blur();
    const { x, y } = contentPoint(event);
    dragging.current = { x0: x, y0: y, x1: x, y1: y, base: event.ctrlKey || event.metaKey || event.shiftKey ? keys : null };
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee(dragging.current);
  };
  const moveMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const { x, y } = contentPoint(event);
    setMarquee(dragging.current = { ...dragging.current, x1: x, y1: y });
  };
  const cancelMarquee = useCallback(() => { dragging.current = null; setMarquee(null); }, []);
  const endMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragging.current, scroller = event.currentTarget;
    cancelMarquee();
    if (!drag) return;
    const [left, right, top, bottom] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.max(drag.y0, drag.y1)];
    if (right - left < 3 && bottom - top < 3) { if (!drag.base) setPicked([]); return; }
    const box = scroller.getBoundingClientRect(), found = new Set<string>();
    for (const element of scroller.querySelectorAll<HTMLElement>('.ef-timeline-key')) {
      const key = element.getBoundingClientRect(), x = key.left + key.width / 2 - box.left + scroller.scrollLeft, y = key.top + key.height / 2 - box.top + scroller.scrollTop;
      if (x >= left && x <= right && y >= top && y <= bottom) element.dataset.keys!.split('|').forEach(id => found.add(id));
    }
    const all = view.parts.flatMap(part => layerKeys(view.data, part.selector).flatMap(row => row.keys));
    const hits = all.filter(key => found.has(keyId(key)));
    setPicked(drag.base ? [...drag.base, ...hits.filter(key => !drag.base!.some(k => keyId(k) === keyId(key)))] : hits);
  };
  useEffect(() => {
    if (!marquee) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancelMarquee(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [marquee, cancelMarquee]);
  return <section className="ef-timeline" aria-label="Timeline" data-testid="foundation-timeline">
    <div className="ef-toolbar"><strong>Layers &amp; Timeline</strong><span className="ef-muted">{view.parts.length} layers · Select a row to edit artwork</span>
      <span className="ef-spacer" /><KeyEase session={session} data={view.data} keys={keys} menu={menu} close={closeMenu} pause={pause} /><button disabled={!canUndo} onClick={undo}>Undo</button><button disabled={!canRedo} onClick={redo}>Redo</button>
      <span className="ef-muted">{fps} fps</span></div>
    <div className="ef-transport">
      <button disabled={!!view.reason} onClick={() => seek(0)} aria-label="Go to beginning">|◀</button>
      <button disabled={!!view.reason} onClick={() => seek(Math.max(0, (Math.round(time * fps) - 1) / fps))} aria-label="Previous frame" title="Previous frame">‹|</button>
      <button disabled={!!view.reason || !view.duration} onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'} title="Space: play/pause. At a cue, replay the current segment.">{playing ? 'Ⅱ Pause' : '▶ Play'}</button>
      <button disabled={!!view.reason} onClick={() => seek(Math.min(limit, (Math.round(time * fps) + 1) / fps))} aria-label="Next frame" title="Next frame">|›</button>
      <output data-testid="foundation-clock">{display(time)}</output>
      <span className="ef-muted">{Math.round(time * fps)} frames</span>
      <span className="ef-spacer" />
      <OutControls session={session} view={view} time={time} pause={pause} inspect={inspectOut} playOut={playOut} park={parkOut} />
      <label>Ruler <select aria-label="Ruler units" value={units} onChange={event => setUnits(event.target.value as typeof units)}>
        <option value="seconds">Seconds</option><option value="frames">Frames</option>
      </select></label>
    </div>
    {view.reason ? <p className="ef-notice">{view.reason}</p> : null}
    <div className="ef-track-scroll" ref={tracks} onPointerDown={startMarquee} onPointerMove={moveMarquee} onPointerUp={endMarquee}
      onPointerCancel={cancelMarquee} onLostPointerCapture={cancelMarquee}>
      <div className="ef-ruler-row"><span className="ef-layer-heading">Layers</span>
        <div ref={ruler} className="ef-ruler" role="slider" aria-label="Playhead" tabIndex={0}
          aria-valuemin={0} aria-valuemax={limit} aria-valuenow={time} aria-valuetext={display(time)}
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
              event.key === 'ArrowLeft' ? (Math.round(time * fps) - (event.shiftKey ? 10 : 1)) / fps :
              event.key === 'ArrowRight' ? (Math.round(time * fps) + (event.shiftKey ? 10 : 1)) / fps : null;
            if (next !== null) { event.preventDefault(); seek(Math.max(0, Math.min(limit, next))); }
          }}>
          {ticks.map(tick => <span className="ef-tick" key={tick} style={{ left: tick / extent * 100 + '%' }}>{display(tick)}</span>)}
          {view.segments.filter(s => !s.out).map(s => <span className="ef-flag" key={s.index}
            style={{ left: s.start / extent * 100 + '%' }}>{s.name}</span>)}
          <span className="ef-flag ef-out" style={{ left: view.out / extent * 100 + '%' }}>Out · hold</span>
          <span className="ef-playhead-head" style={{ left: time / extent * 100 + '%' }} />
        </div>
      </div>
      {view.parts.map((part, index) => {
        const bars = view.bars.filter(b => b.selector === part.selector);
        const properties = layerKeys(view.data, part.selector), open = expanded.includes(part.selector);
        return <div key={part.selector} className="ef-layer-group">
          <div className={'ef-track' + (selection.includes(part.selector) ? ' is-selected' : '')} data-selector={part.selector}>
            <div className="ef-layer-cell">
              {properties.length ? <button className="ef-twirl" aria-label={'Animated properties of ' + part.label} aria-expanded={open}
                onClick={() => setExpanded(open ? expanded.filter(s => s !== part.selector) : [...expanded, part.selector])}>{open ? '▾' : '▸'}</button> : <span className="ef-twirl" />}
              <button className="ef-layer" aria-pressed={selection.includes(part.selector)}
                onClick={event => select(part.selector, event.shiftKey || event.ctrlKey || event.metaKey)}>
                <span className="ef-layer-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="ef-layer-icon">{part.kind === 'line' ? 'T' : part.kind === 'image' ? '▧' : '◇'}</span>
                <span style={{ paddingInlineStart: (part.depth ?? 0) * 8 }}>{part.label}</span>
              </button>
            </div>
            <div className="ef-track-lane">
              {bars.map((bar, i) => <LayerBar key={bar.step + ':' + i} bar={bar} label={part.label} extent={extent} speed={view.data?.speed ?? 1} fps={fps} session={session} pause={pause} select={() => select(part.selector, false)} />)}
              {moments(properties.flatMap(row => row.keys)).map(group => keyButton(group, part.selector, part.label))}
              <span className="ef-playhead-line" style={{ left: time / extent * 100 + '%' }} />
            </div>
          </div>
          {open && properties.map(row => <div key={row.property} className="ef-track ef-property-track" data-selector={part.selector} data-property={row.property}>
            <span className="ef-property-name">{PROPERTY_LABELS[row.property] ?? row.property}</span>
            <div className="ef-track-lane">
              {moments(row.keys).map(group => keyButton(group, part.selector, part.label))}
              <span className="ef-playhead-line" style={{ left: time / extent * 100 + '%' }} />
            </div>
          </div>)}
        </div>;
      })}
      {marquee && <span className="ef-marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
        width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />}
      {!view.parts.length && <p className="ef-notice">No addressable layers in this source.</p>}
    </div>
    <div className="ef-caption"><span>Space: play/pause · Arrows: frame · Escape: cancel</span><span>Body: move keys · Edges: trim visibility · Alt: bypass snap · Drag empty lane: select keys · Right-click key: ease</span></div>
  </section>;
}
