import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useModalGate } from '../spaceKey';
import { FieldControl } from '../fields/FieldControl';
import { applyOperations, type EditorOperation } from './operations';
import type { EditorSession, Revision } from './session';
import type { Segment, TimelineView } from './timelineView';

const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

/** A reason shown beside its control until the next press or key anywhere. */
function useReason() {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!reason) return;
    const dismiss = () => setReason('');
    window.addEventListener('pointerdown', dismiss, true); window.addEventListener('keydown', dismiss, true);
    return () => { window.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('keydown', dismiss, true); };
  }, [reason]);
  return [reason, setReason] as const;
}

/** Add Step at the playhead (R1.2a.4, docs/research/editor-r1-2a-4): one undo, or the reason. */
export function AddStep({ session, view, time, pause, seek }: { session: EditorSession; view: TimelineView; time: number; pause: () => void; seek: (time: number) => void }) {
  const [reason, setReason] = useReason();
  const add = () => {
    pause();
    try {
      session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'step.add', time }] });
      // The flag sits on the frame the playhead snapped to: park the playhead there with it.
      seek(session.port.view().time);
    } catch (cause) { setReason(message(cause)); }
  };
  return <span className="ef-step-controls">
    <button onClick={add} disabled={!view.data || !!view.reason} title="Put a Step flag here: the graphic parks at it and Next plays on">Add Step at playhead</button>
    {reason && <span className="ef-step-error" role="alert">{reason}</span>}
  </span>;
}

interface Props {
  segment: Segment; view: TimelineView; extent: number; fps: number;
  /** Ruler seconds a dragged flag is drawn to within a few pixels: keys, bar edges and the playhead. */
  snaps: number[]; playhead: number; selected: boolean; session: EditorSession;
  pause: () => void; inspect: () => void; setOut: (time: number) => void; display: (value: number) => string;
}
/**
 * One Step or Out flag on the ruler. A drag moves it to a frame (Alt skips the magnets, never the
 * frame), shown as refused with its reason where it could not land, and commits one undo on
 * release; Escape cancels. Arrow keys nudge it a frame (Shift ten). A click inspects the segment it
 * starts; a Step also renames inline (double-click, Enter or F2) and deletes (Delete, or the menu).
 */
export default function StepFlag({ segment, view, extent, fps, snaps, playhead, selected, session, pause, inspect, setOut, display }: Props) {
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), naming = useRef(false);
  const drag = useRef<{ x: number; width: number; expected: Revision; moved: boolean; at: number; refused: string; targets: number[]; checked: Map<number, string> } | null>(null);
  const [shown, setShown] = useState<{ at: number; refused: string } | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [reason, setReason] = useReason();
  useModalGate(menuAt !== null);
  const { index, out } = segment, label = out ? 'Out · hold' : segment.name, still = (to: number) => Math.abs(to - segment.start) <= view.near;
  const operation = (to: number): EditorOperation => out ? { kind: 'out.set', time: to } : { kind: 'step.move', step: index, time: to };
  // The registry decides, without a transaction, whether the flag could land there: order, frames
  // and exactness all refuse there with their reasons.
  const check = (to: number) => {
    try { applyOperations(session.port.read(), [operation(to)], false); return ''; } catch (cause) { return message(cause); }
  };
  const commit = (to: number, expected: Revision) => {
    if (out) { setOut(to); return; }
    try { session.execute({ documentId: session.documentId, expected, transactionId: crypto.randomUUID(), operations: [operation(to)] }); }
    catch (cause) { setReason(message(cause)); }
  };
  const snap = (raw: number, free: boolean, targets: number[], width: number) => {
    const reach = 6 / width * extent;
    const near = free ? null : targets.reduce<number | null>((best, t) => Math.abs(t - raw) <= reach && (best === null || Math.abs(t - raw) < Math.abs(best - raw)) ? t : best, null);
    return Math.max(0, Math.round((near ?? raw) * fps) / fps);
  };
  const cancel = () => { drag.current = null; setShown(null); };
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || name !== null) return;
    event.stopPropagation(); event.preventDefault(); button.current?.focus(); pause();
    const width = event.currentTarget.parentElement!.getBoundingClientRect().width;
    // Magnets on a frame only, where a flag can sit: within the view's reach of one, stored at 3 decimals.
    const targets = [playhead, ...snaps].filter(t => Math.abs(t * fps - Math.round(t * fps)) <= view.near * fps);
    drag.current = { x: event.clientX, width, expected: session.version(), moved: false, at: segment.start, refused: '', targets, checked: new Map() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || !d.moved && Math.abs(event.clientX - d.x) < 3) return;
    d.moved = true;
    const to = snap(segment.start + (event.clientX - d.x) / d.width * extent, event.altKey, d.targets, d.width);
    if (to === d.at && shown) return;
    if (!d.checked.has(to)) d.checked.set(to, still(to) ? '' : check(to));
    d.at = to; d.refused = d.checked.get(to)!;
    setShown({ at: to, refused: d.refused });
  };
  const up = () => {
    const d = drag.current;
    cancel();
    if (!d) return;
    if (!d.moved) { inspect(); return; }
    if (still(d.at)) return;
    if (d.refused) { setReason(d.refused); return; }
    commit(d.at, d.expected);
  };
  const remove = () => {
    setMenuAt(null); pause();
    // The flag goes with its Step, so the keyboard stays on the ruler it sat on.
    const ruler = button.current?.parentElement;
    try { session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'step.delete', step: index }] }); ruler?.focus(); }
    catch (cause) { setReason(message(cause)); button.current?.focus(); }
  };
  const startNaming = () => { setMenuAt(null); naming.current = true; setName(segment.name); };
  // Enter returns the keyboard to the flag; leaving the field for another control leaves it there.
  const rename = (value: string, refocus: boolean) => {
    if (!naming.current) return;
    naming.current = false; setName(null);
    try { session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'step.rename', step: index, name: value }] }); }
    catch (cause) { setReason(message(cause)); }
    if (refocus) button.current?.focus();
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    const handled = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key === 'Escape' && drag.current) { handled(); cancel(); return; }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      handled(); pause();
      const to = (Math.round(segment.start * fps) + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1)) / fps, refused = check(to);
      if (refused) setReason(refused); else commit(to, session.version());
      return;
    }
    if (out) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { handled(); remove(); }
    else if (event.key === 'Enter' || event.key === 'F2') { handled(); startNaming(); }
    else if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
      handled(); const box = event.currentTarget.getBoundingClientRect(); setMenuAt({ x: box.left, y: box.bottom + 4 });
    }
  };
  useLayoutEffect(() => {
    const node = menu.current;
    if (!menuAt || !node) return;
    node.showPopover();
    node.style.left = Math.max(8, Math.min(menuAt.x, window.innerWidth - node.offsetWidth - 8)) + 'px';
    node.style.top = Math.max(8, Math.min(menuAt.y, window.innerHeight - node.offsetHeight - 8)) + 'px';
    node.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: globalThis.PointerEvent) => { if (!node.contains(event.target as Node)) setMenuAt(null); };
    window.addEventListener('pointerdown', outside, true);
    return () => { node.hidePopover(); window.removeEventListener('pointerdown', outside, true); };
  }, [menuAt]);
  const at = shown?.at ?? segment.start, left = at / extent * 100;
  return <>
    <button ref={button} className={'ef-flag' + (out ? ' ef-out' : '') + (shown ? ' is-dragging' : '') + (shown?.refused ? ' is-refused' : '')}
      style={{ left: left + '%' }} aria-label={segment.name + ' flag'} aria-pressed={selected}
      title={out ? 'Drag to set Out · Click to edit Out' : 'Drag to move · Click to edit its start · Double-click to rename · Delete to remove'}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel(); }}
      onDoubleClick={event => { event.stopPropagation(); if (!out) startNaming(); }}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); if (!out) setMenuAt({ x: event.clientX, y: event.clientY }); }}
      onKeyDown={key}>{label}{shown && ' · ' + display(at)}</button>
    {name !== null && <label className="ef-flag-name" style={{ left: left + '%' }} ref={node => { const input = node?.querySelector('input'); if (input && document.activeElement !== input) { input.focus(); input.select(); } }}
      onPointerDown={event => event.stopPropagation()} onBlur={() => rename(name, false)} onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Enter') { event.preventDefault(); rename(name, true); }
        if (event.key === 'Escape') { event.preventDefault(); naming.current = false; setName(null); button.current?.focus(); }
      }}>Step name<FieldControl descriptor={{ key: 'step-name', label: 'Step name', kind: 'text', defaultValue: '' }} value={name} onChange={value => setName(String(value))} /></label>}
    {(shown?.refused || reason) && <span className={'ef-flag-error' + (left > 60 ? ' is-left' : '')} style={{ left: left + '%' }} role="alert">{shown?.refused || reason}</span>}
    {/* The menu and the name field sit inside the ruler, whose own press seeks and captures the pointer. */}
    {!out && <div ref={menu} popover="manual" role="menu" aria-label="Step" className="ef-key-menu" tabIndex={-1}
      onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
        event.stopPropagation(); // the ruler it sits in moves the playhead on arrows, Home and End
        const items = Array.from(event.currentTarget.querySelectorAll('button')), i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(i + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
        if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); setMenuAt(null); button.current?.focus(); }
      }}>
      <button role="menuitem" tabIndex={-1} onClick={startNaming}>Rename step</button>
      <button role="menuitem" tabIndex={-1} onClick={remove}>Delete step</button>
    </div>}
  </>;
}
