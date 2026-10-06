import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { groupHierarchy } from '../../blocks/editorGroups';
import type { KeyRef } from '../../blocks/animEdit';
import { ownerOf, readTimeline, type TimelineView } from './timelineView';
import type { EditorSession, Revision } from './session';
import { applyOperations } from './operations';
import LayerBar from './LayerBar';
import OutControls, { type OutHandle } from './OutControls';
import StepFlag, { AddStep, message, useReason } from './StepFlag';
import KeyEase, { type KeyMenu } from './KeyEase';
import { addKeys, keyId, layerKeys, liveKeys, movedKeys, toggleKeys } from './keySelection';

const PROPERTY_LABELS: Record<string, string> = { x: 'X', y: 'Y', scaleX: 'Scale X', scaleY: 'Scale Y', rotation: 'Rotation', opacity: 'Opacity',
  xPercent: 'X %', yPercent: 'Y %', scale: 'Scale', autoAlpha: 'Opacity (autoAlpha)' };
type Marquee = { x0: number; y0: number; x1: number; y1: number; base: KeyRef[] | null };
/** A key drag: the keys it moves, the pressed key's row and ruler time, and the move so far in ruler
 *  seconds with the registry's verdict on it. */
type KeyDrag = { keys: KeyRef[]; ids: Set<string>; select: boolean; row: string; time: number; x: number; width: number; expected: Revision; moved: boolean; delta: number; refused: string; checked: Map<number, string> };

interface Props {
  groupScope: string | null; enterGroup: (selector: string) => void; hierarchy: ReturnType<typeof groupHierarchy>;
  view: TimelineView; fps: number; time: number; selection: string[];
  seek: (time: number) => void; select: (selector: string | null, toggle: boolean) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  playing: boolean; togglePlayback: () => void;
  session: EditorSession; pause: () => void;
  inspectOut: () => void; playOut: () => void; parkOut: () => void; inspectStep: (index: number) => void;
}
export default function Timeline({ groupScope, enterGroup, hierarchy, view, fps, time, selection, seek, select, undo, redo, canUndo, canRedo, playing, togglePlayback, session, pause, inspectOut, playOut, parkOut, inspectStep }: Props) {
  const visibleParts = view.parts.filter(part => part.selector === groupScope || (hierarchy.parent[part.selector] ?? null) === groupScope);
  const localStart = groupScope ? Math.min(...view.bars.filter(bar => bar.selector === groupScope).map(bar => bar.start), view.duration) : 0;
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
  // Keys this timeline moved stay selected where they landed, and a nudged key keeps the keyboard.
  const moving = useRef<{ keys: KeyRef[]; focus: string | null } | null>(null);
  useEffect(() => {
    if (knownTimes.current === keyTimes) return;
    knownTimes.current = keyTimes;
    const moved = moving.current;
    moving.current = null;
    setPicked(moved?.keys ?? []);
    if (moved?.focus == null || !moved.keys.length) return;
    // The nudged key keeps the keyboard, in the row it was nudged in.
    const [selector, property] = moved.focus.split('\n'), id = keyId(moved.keys[0]);
    const row = Array.from(document.querySelectorAll<HTMLElement>('.ef-timeline .ef-track')).find(track => track.dataset.selector === selector && (track.dataset.property ?? '') === property);
    Array.from(row?.querySelectorAll<HTMLElement>('.ef-timeline-key') ?? []).find(button => button.dataset.keys!.split('|').includes(id))?.focus();
  }, [keyTimes]);
  const [menu, setMenu] = useState<KeyMenu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const keyDrag = useRef<KeyDrag | null>(null), dragged = useRef(false);
  const [keyMove, setKeyMove] = useState<{ ids: Set<string>; time: number; delta: number; refused: string; row: string } | null>(null);
  const [keyReason, setKeyReason] = useReason(), reasonAt = useRef({ row: '', at: 0 });
  const out = useRef<OutHandle>(null);
  // A dragged flag is drawn to the keys, bar edges and playhead near it.
  const snaps = useMemo(() => [...view.bars.flatMap(bar => [bar.start, bar.end]), ...(view.data?.steps ?? []).flatMap((step, i) =>
    Object.values(step.layers).flatMap(tracks => Object.values(tracks).flatMap(list => list.map(key => (view.segments[i]?.start ?? 0) + key.time / view.data!.speed))))], [view]);
  const cue = session.port.view().cue;
  const dragging = useRef<Marquee | null>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const tracks = useRef<HTMLDivElement>(null);
  const startTime = useRef<number | null>(null);
  const extent = Math.max(2, view.duration * 1.15, session.port.view().cue === view.segments.length - 1 ? view.duration + 2 : 0);
  const limit = session.port.view().cue === view.segments.length - 1 ? extent : view.duration;
  const interval = extent <= 5 ? 0.5 : extent <= 12 ? 1 : Math.ceil(extent / 10);
  const ticks = Array.from({ length: Math.floor(extent / interval) + 1 }, (_, i) => i * interval);
  const displayRoot = (value: number) => units === 'seconds' ? value.toFixed(2) + ' s' : Math.round(value * fps) + ' f';
  const display = (value: number) => displayRoot(value - localStart);
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
  const speed = view.data?.speed ?? 1;
  const at = (key: KeyRef) => view.segments[key.step].start + key.time / speed;
  // Moving keys (R1.2a.5, docs/research/editor-r1-2a-5): a drag of a key moves the selection it
  // belongs to, or its own group, by whole frames (Alt: freely), across flags too. The registry says
  // while it is held whether it could land there; release commits one undo, or keeps the source and
  // shows why. Arrow keys nudge a frame (Shift ten).
  const movingKeys = (group: KeyRef[]) => group.every(key => selected.has(keyId(key))) ? keys : group;
  const moveOperation = (moved: KeyRef[], delta: number) => ({ kind: 'key.move' as const, keys: moved, delta: delta * speed });
  const verdict = (moved: KeyRef[], delta: number) => {
    try { applyOperations(session.port.read(), [moveOperation(moved, delta)], false); return ''; } catch (cause) { return message(cause); }
  };
  const explain = (text: string, row: string, time: number) => { reasonAt.current = { row, at: time }; setKeyReason(text); };
  const moveKeys = (moved: KeyRef[], delta: number, row: string, time: number, expected: Revision, focus: boolean) => {
    try {
      const result = session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [moveOperation(moved, delta)] });
      moving.current = { keys: movedKeys(readTimeline(result.template).data, moved, delta * speed), focus: focus ? row : null };
    } catch (cause) { explain(message(cause), row, time + delta); }
  };
  const endKeyDrag = useCallback(() => { keyDrag.current = null; setKeyMove(null); }, []);
  // A cancelled drag's release is no click on the key.
  const cancelKeyDrag = useCallback(() => { if (keyDrag.current?.moved) dragged.current = true; endKeyDrag(); }, [endKeyDrag]);
  const movingKey = keyMove !== null;
  useEffect(() => {
    if (!movingKey) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancelKeyDrag(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [movingKey, cancelKeyDrag]);
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
  const keyButton = (group: KeyRef[], selector: string, layer: string, row: string) => {
    const ids = group.map(keyId), on = ids.filter(id => selected.has(id)).length, time = at(group[0]);
    const names = [...new Set(group.map(key => PROPERTY_LABELS[key.property] ?? key.property))];
    const drag = keyMove && ids.some(id => keyMove.ids.has(id)) ? keyMove : null, shown = time + (drag?.delta ?? 0);
    return <button key={ids.join('|')} className={'ef-timeline-key' + (on === ids.length ? ' is-key-selected' : on ? ' is-key-partial' : '') + (drag ? ' is-dragging' : '') + (drag?.refused ? ' is-refused' : '')}
      aria-label={`${layer}: ${names.join(', ')} ${group.length > 1 ? 'keys' : 'key'} at ${display(time)}`} aria-haspopup="menu"
      aria-pressed={on === ids.length} data-keys={ids.join('|')} style={{ left: shown / extent * 100 + '%' }}
      onClick={event => {
        if (dragged.current) { dragged.current = false; return; }
        if (event.ctrlKey || event.metaKey || event.shiftKey) { setPicked(toggleKeys(keys, group)); return; }
        setPicked(group); select(selector, false); seek(time);
      }}
      onPointerDown={event => {
        dragged.current = false;
        if (event.button !== 0 || view.reason || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const width = event.currentTarget.closest('.ef-track-lane')!.getBoundingClientRect().width, keys = movingKeys(group);
        keyDrag.current = { keys, ids: new Set(keys.map(keyId)), select: keys === group, row, time, x: event.clientX, width, expected: session.version(), moved: false, delta: 0, refused: '', checked: new Map() };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const d = keyDrag.current;
        if (!d || !d.moved && Math.abs(event.clientX - d.x) < 3) return;
        const first = !d.moved;
        if (first) { d.moved = true; pause(); if (d.select) setPicked(d.keys); }
        const raw = d.time + (event.clientX - d.x) / d.width * extent, to = event.altKey ? raw : Math.round(raw * fps) / fps;
        const delta = Math.round((to - d.time) * 1e6) / 1e6;
        if (!first && delta === d.delta) return;
        if (!d.checked.has(delta)) d.checked.set(delta, delta ? verdict(d.keys, delta) : '');
        d.delta = delta; d.refused = d.checked.get(delta)!;
        setKeyMove({ ids: d.ids, time: d.time, delta, refused: d.refused, row });
      }}
      onPointerUp={() => {
        const d = keyDrag.current;
        endKeyDrag();
        if (!d?.moved) return;
        dragged.current = true;
        if (!d.delta) return;
        if (d.refused) explain(d.refused, d.row, d.time + d.delta);
        else moveKeys(d.keys, d.delta, d.row, d.time, d.expected, false);
      }}
      onPointerCancel={cancelKeyDrag} onLostPointerCapture={() => { if (keyDrag.current) cancelKeyDrag(); }}
      onContextMenu={event => {
        event.preventDefault();
        if (menu?.anchor === event.currentTarget) return; // The keyboard's own menu event after the keydown below.
        const box = event.currentTarget.getBoundingClientRect();
        openMenu(group, event.clientX || box.left, event.clientY || box.bottom, event.currentTarget);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && keyDrag.current) { event.preventDefault(); event.stopPropagation(); cancelKeyDrag(); return; }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault(); event.stopPropagation(); pause();
          // To the neighbouring frame, as a flag nudges: a key between frames lands on one.
          const frames = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1), moved = movingKeys(group);
          // A refusal comes back from the operation itself, before anything changes.
          moveKeys(moved, Math.round(((Math.round(time * fps) + frames) / fps - time) * 1e6) / 1e6, row, time, session.version(), true);
          return;
        }
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
    const all = view.parts.flatMap(part => layerKeys(view.data, ownerOf(view, part.selector)).flatMap(row => row.keys));
    const hits = all.filter(key => found.has(keyId(key)));
    setPicked(drag.base ? addKeys(drag.base, hits) : hits);
  };
  useEffect(() => {
    if (!marquee) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancelMarquee(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [marquee, cancelMarquee]);
  // Beside the pressed key: its new time while a drag could land, else why not, live while it is
  // held and then until the next action.
  const reasonText = keyMove?.refused || keyReason, reasonRow = keyMove ? keyMove.row : keyReason ? reasonAt.current.row : '';
  const keyMoveReason = (row: string) => {
    if (reasonRow !== row) return null;
    const at = keyMove ? keyMove.time + keyMove.delta : reasonAt.current.at, left = at / extent * 100, landing = keyMove && !keyMove.refused;
    return <span className={'ef-flag-error ' + (landing ? 'ef-key-move-time' : 'ef-key-move-error') + (left > 60 ? ' is-left' : '')} style={{ left: left + '%' }}
      role={landing ? undefined : 'alert'}>{landing ? display(at) : reasonText}</span>;
  };
  return <section className="ef-timeline" aria-label="Timeline" data-testid="foundation-timeline">
    <div className="ef-toolbar"><strong>Layers &amp; Timeline</strong><span className="ef-muted">{view.parts.length} layers · Select a row to edit artwork</span>
      <span className="ef-spacer" /><KeyEase session={session} data={view.data} keys={keys} menu={menu} close={closeMenu} pause={pause} /><button disabled={!canUndo} onClick={undo}>Undo</button><button disabled={!canRedo} onClick={redo}>Redo</button>
      <span className="ef-muted">{fps} fps</span></div>
    <div className="ef-transport">
      <button disabled={!!view.reason} onClick={() => seek(localStart)} aria-label="Go to beginning">|◀</button>
      <button disabled={!!view.reason} onClick={() => seek(Math.max(0, (Math.round(time * fps) - 1) / fps))} aria-label="Previous frame" title="Previous frame">‹|</button>
      <button disabled={!!view.reason || !view.duration} onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'} title="Space: play/pause. At a cue, replay the current segment.">{playing ? 'Ⅱ Pause' : '▶ Play'}</button>
      <button disabled={!!view.reason} onClick={() => seek(Math.min(limit, (Math.round(time * fps) + 1) / fps))} aria-label="Next frame" title="Next frame">|›</button>
      <output data-testid="foundation-clock">{displayRoot(time)}</output>
      <span className="ef-muted">{Math.round(time * fps)} frames</span>
      <span className="ef-spacer" />
      {!groupScope && <AddStep session={session} view={view} time={time} pause={pause} seek={seek} />}
      {!groupScope && <OutControls ref={out} session={session} view={view} time={time} pause={pause} inspect={inspectOut} playOut={playOut} park={parkOut} />}
      {groupScope && <span className="ef-muted">Step and Out are edited in Composition</span>}
      <label>Ruler <select aria-label="Ruler units" value={units} onChange={event => setUnits(event.target.value as typeof units)}>
        <option value="seconds">Seconds</option><option value="frames">Frames</option>
      </select></label>
    </div>
    {view.reason ? <p className="ef-notice">{view.reason}</p> : null}
    <div className="ef-track-scroll" ref={tracks} onPointerDown={startMarquee} onPointerMove={moveMarquee} onPointerUp={endMarquee}
      onPointerCancel={cancelMarquee} onLostPointerCapture={cancelMarquee}>
      <div className="ef-ruler-row" data-testid={groupScope ? "foundation-local-ruler" : undefined}><span className="ef-layer-heading">{groupScope ? "Group local time · " + display(time) : "Layers"}</span>
        <div ref={ruler} className="ef-ruler" role="slider" aria-label={groupScope ? "Group local playhead" : "Playhead"} tabIndex={0} data-extent={extent}
          aria-valuemin={-localStart} aria-valuemax={limit - localStart} aria-valuenow={time - localStart} aria-valuetext={display(time)}
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
            const next = event.key === 'Home' ? localStart : event.key === 'End' ? view.duration :
              event.key === 'ArrowLeft' ? (Math.round(time * fps) - (event.shiftKey ? 10 : 1)) / fps :
              event.key === 'ArrowRight' ? (Math.round(time * fps) + (event.shiftKey ? 10 : 1)) / fps : null;
            if (next !== null) { event.preventDefault(); seek(Math.max(0, Math.min(limit, next))); }
          }}>
          {ticks.map(tick => <span className="ef-tick" key={tick} style={{ left: tick / extent * 100 + '%' }}>{display(tick)}</span>)}
          <span className="ef-flag" style={{ left: 0 }}>In</span>
          {groupScope && view.segments.filter(segment => segment.index > 0).map(segment => <span className="ef-flag" key={segment.index} style={{left:segment.start / extent * 100 + '%'}}>{segment.name}</span>)}
          {!groupScope && !view.reason && view.segments.filter(s => s.index > 0).map(s => <StepFlag key={s.index} segment={s} view={view} extent={extent} fps={fps}
            snaps={snaps} playhead={time} selected={cue === s.index} session={session} pause={pause} display={display}
            inspect={() => inspectStep(s.index)} setOut={to => out.current?.setOutAt(to)} />)}
          <span className="ef-playhead-head" style={{ left: time / extent * 100 + '%' }} />
        </div>
      </div>
      {visibleParts.map((part, index) => {
        const bars = view.bars.filter(b => b.selector === part.selector);
        // A layer's keys live under its owner (R1.2a.6): its own selector or another naming only it.
        const properties = layerKeys(view.data, ownerOf(view, part.selector)).filter(row => !hierarchy.groups.has(part.selector) || row.property !== 'transformOrigin'), open = expanded.includes(part.selector);
        return <div key={part.selector} className="ef-layer-group">
          <div className={'ef-track' + (selection.includes(part.selector) ? ' is-selected' : '')} data-selector={part.selector} data-testid={part.selector === groupScope ? "foundation-parent-bar" : undefined}>
            <div className="ef-layer-cell">
              {properties.length ? <button className="ef-twirl" aria-label={'Animated properties of ' + part.label} aria-expanded={open}
                onClick={() => setExpanded(open ? expanded.filter(s => s !== part.selector) : [...expanded, part.selector])}>{open ? '▾' : '▸'}</button> : <span className="ef-twirl" />}
              <button className="ef-layer" aria-pressed={selection.includes(part.selector)}
                onClick={event => select(part.selector, event.shiftKey || event.ctrlKey || event.metaKey)}>
                <span className="ef-layer-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="ef-layer-icon">{hierarchy.groups.has(part.selector) ? '▣' : part.kind === 'line' ? 'T' : part.kind === 'image' ? '▧' : '◇'}</span>
                <span style={{ paddingInlineStart: (part.depth ?? 0) * 8 }}>{part.label}</span>
              </button>
              {hierarchy.groups.has(part.selector) && part.selector !== groupScope && <button className="ef-enter-group" aria-label={'Edit ' + part.label} onClick={() => enterGroup(part.selector)}>↳</button>}
            </div>
            <div className={'ef-track-lane' + (reasonRow === part.selector + '\n' ? ' has-key-reason' : '')}>
              {bars.map((bar, i) => <LayerBar key={bar.step + ':' + i} group={hierarchy.groups.has(part.selector)} bar={bar} label={part.label} extent={extent} speed={speed} fps={fps} session={session} pause={pause} select={() => select(part.selector, false)} />)}
              {moments(properties.flatMap(row => row.keys)).map(group => keyButton(group, part.selector, part.label, part.selector + '\n'))}
              {keyMoveReason(part.selector + '\n')}
              <span className="ef-playhead-line" style={{ left: time / extent * 100 + '%' }} />
            </div>
          </div>
          {open && properties.map(row => <div key={row.property} className="ef-track ef-property-track" data-selector={part.selector} data-property={row.property}>
            <span className="ef-property-name" title={row.property}>{PROPERTY_LABELS[row.property] ?? row.property}</span>
            <div className={'ef-track-lane' + (reasonRow === part.selector + '\n' + row.property ? ' has-key-reason' : '')}>
              {moments(row.keys).map(group => keyButton(group, part.selector, part.label, part.selector + '\n' + row.property))}
              {keyMoveReason(part.selector + '\n' + row.property)}
              <span className="ef-playhead-line" style={{ left: time / extent * 100 + '%' }} />
            </div>
          </div>)}
        </div>;
      })}
      {marquee && <span className="ef-marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
        width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />}
      {!view.parts.length && <p className="ef-notice">No addressable layers in this source.</p>}
    </div>
    <div className="ef-caption"><span>Space: play/pause · Arrows: frame · Escape: cancel</span><span>Body: move keys · Edges: trim visibility · Key: drag or arrows to move · Alt: bypass snap · Drag empty lane: select keys · Right-click key: ease · Flag: drag, double-click to rename</span></div>
  </section>;
}
